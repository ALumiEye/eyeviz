/**
 * Safe expression compiler.
 *
 *   string → EyeViz parser (AST) → whitelist walk → EyeViz closures
 *
 * Nothing is ever evaluated as code: the AST is turned into plain closures over numbers.
 * See docs/expressions.md.
 */
import { CONSTANTS, FUNCTIONS } from "./functions";
import { parseExpression, ParseError, type AstNode, type BinaryOperator } from "./parser";

/** Limits that keep a hostile expression from exhausting the viewer's device. */
export const EXPRESSION_LIMITS = Object.freeze({
  maxLength: 500,
  maxNodes: 200,
  maxDepth: 32,
});

/** Values of the free symbols of an expression. Missing symbols evaluate to `NaN`. */
export type ExpressionScope = Readonly<Record<string, number>>;

export interface CompiledExpression {
  readonly source: string;
  /** Free variables, e.g. `{"v0", "theta", "t"}`. Constants and function names are excluded. */
  readonly symbols: ReadonlySet<string>;
  /** Pure and deterministic. May return `NaN` or `±Infinity`; never throws for numeric reasons. */
  evaluate(scope: ExpressionScope): number;
}

export type ExpressionIssueCode = "EXPRESSION_SYNTAX" | "UNKNOWN_FUNCTION" | "LIMIT_EXCEEDED";

export interface ExpressionIssue {
  readonly code: ExpressionIssueCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ExpressionResult =
  | { readonly ok: true; readonly expression: CompiledExpression }
  | { readonly ok: false; readonly issue: ExpressionIssue };

type Evaluator = (scope: ExpressionScope) => number;

const BINARY: Readonly<Record<BinaryOperator, (a: number, b: number) => number>> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
  "^": (a, b) => Math.pow(a, b),
};

/** Raised internally while walking the AST; converted into an `ExpressionIssue`. */
class Rejection {
  constructor(readonly issue: ExpressionIssue) {}
}

function reject(code: ExpressionIssueCode, message: string, details?: Record<string, unknown>) {
  return new Rejection(details ? { code, message, details } : { code, message });
}

/** Compiles an expression string into a safe evaluator, or explains why it cannot. */
export function compileExpression(source: string): ExpressionResult {
  if (source.length > EXPRESSION_LIMITS.maxLength) {
    return fail(
      reject(
        "LIMIT_EXCEEDED",
        `Expression is longer than ${EXPRESSION_LIMITS.maxLength} characters`,
        {
          limit: "maxLength",
          value: source.length,
        },
      ),
    );
  }
  if (source.trim() === "") {
    return fail(reject("EXPRESSION_SYNTAX", "Expression is empty"));
  }
  // Statement separators and newlines would produce multi-statement blocks.
  const separator = /[;\n\r]/.exec(source);
  if (separator) {
    return fail(
      reject(
        "EXPRESSION_SYNTAX",
        `An expression must be a single formula; found ${JSON.stringify(separator[0])}`,
        {
          position: separator.index,
        },
      ),
    );
  }

  let root: AstNode;
  try {
    root = parseExpression(source, EXPRESSION_LIMITS.maxDepth);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    if (error.kind === "depth") {
      return fail(
        reject(
          "LIMIT_EXCEEDED",
          `Expression is nested deeper than ${EXPRESSION_LIMITS.maxDepth} levels`,
          {
            limit: "maxDepth",
          },
        ),
      );
    }
    if (error.message === "implicit multiplication") {
      return fail(
        reject(
          "EXPRESSION_SYNTAX",
          "Implicit multiplication is not allowed; write '*' explicitly (e.g. '2*x')",
          {
            position: error.position,
          },
        ),
      );
    }
    return fail(
      reject(
        "EXPRESSION_SYNTAX",
        `Invalid expression ${JSON.stringify(source)} near character ${error.position}`,
        {
          position: error.position,
        },
      ),
    );
  }

  try {
    const symbols = new Set<string>();
    const counter = { nodes: 0 };
    const evaluator = build(root, symbols, counter, 0);
    return {
      ok: true,
      expression: Object.freeze({ source, symbols, evaluate: evaluator }),
    };
  } catch (error) {
    if (error instanceof Rejection) return fail(error);
    throw error;
  }
}

function fail(rejection: Rejection): ExpressionResult {
  return { ok: false, issue: rejection.issue };
}

function build(
  node: AstNode,
  symbols: Set<string>,
  counter: { nodes: number },
  depth: number,
): Evaluator {
  if (++counter.nodes > EXPRESSION_LIMITS.maxNodes) {
    throw reject("LIMIT_EXCEEDED", `Expression has more than ${EXPRESSION_LIMITS.maxNodes} terms`, {
      limit: "maxNodes",
    });
  }
  if (depth > EXPRESSION_LIMITS.maxDepth) {
    throw reject(
      "LIMIT_EXCEEDED",
      `Expression is nested deeper than ${EXPRESSION_LIMITS.maxDepth} levels`,
      {
        limit: "maxDepth",
      },
    );
  }

  switch (node.kind) {
    case "number": {
      const value = node.value;
      if (!Number.isFinite(value)) {
        throw reject("EXPRESSION_SYNTAX", `Number literal is too large: ${String(value)}`, {
          fragment: String(value),
        });
      }
      return () => value;
    }

    case "symbol": {
      const name = node.name;
      if (Object.hasOwn(CONSTANTS, name)) {
        const value = CONSTANTS[name] as number;
        return () => value;
      }
      symbols.add(name);
      return (scope) => {
        const value = Object.hasOwn(scope, name) ? scope[name] : undefined;
        return typeof value === "number" ? value : NaN;
      };
    }

    case "unary": {
      const operand = build(node.operand, symbols, counter, depth + 1);
      return node.op === "-" ? (scope) => -operand(scope) : operand;
    }

    case "binary": {
      const left = build(node.left, symbols, counter, depth + 1);
      const right = build(node.right, symbols, counter, depth + 1);
      const op = BINARY[node.op];
      return (scope) => op(left(scope), right(scope));
    }

    case "call": {
      const name = node.name;
      const def = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;
      if (!def) {
        throw reject("UNKNOWN_FUNCTION", `Unknown function '${name}'`, { function: name });
      }
      if (node.args.length < def.minArgs || node.args.length > def.maxArgs) {
        const expected =
          def.minArgs === def.maxArgs ? `${def.minArgs}` : `${def.minArgs} to ${def.maxArgs}`;
        throw reject(
          "EXPRESSION_SYNTAX",
          `Function '${name}' takes ${expected} argument(s), got ${node.args.length}`,
          {
            function: name,
          },
        );
      }
      const args = node.args.map((arg) => build(arg, symbols, counter, depth + 1));
      const fn = def.fn;
      if (args.length === 1) {
        const [a] = args as [Evaluator];
        return (scope) => fn(a(scope));
      }
      if (args.length === 2) {
        const [a, b] = args as [Evaluator, Evaluator];
        return (scope) => fn(a(scope), b(scope));
      }
      return (scope) => fn(...args.map((arg) => arg(scope)));
    }
  }
}
