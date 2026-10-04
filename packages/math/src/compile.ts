/**
 * Safe expression compiler.
 *
 *   string → math.js parse (AST only) → whitelist walk → EyeViz closures
 *
 * math.js is used exclusively as a parser. Its evaluate/compile functions are never called,
 * and nothing outside this file touches math.js types. See docs/expressions.md.
 */
import { create, parseDependencies, type FactoryFunctionMap, type MathNode } from "mathjs";
import { CONSTANTS, FUNCTIONS } from "./functions";

// A minimal math.js instance containing only the parser (no evaluate, units, matrices…).
const { parse } = create({ parseDependencies: parseDependencies as FactoryFunctionMap });

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

const BINARY: Readonly<Record<string, (a: number, b: number) => number>> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  pow: (a, b) => Math.pow(a, b),
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

  let root: MathNode;
  try {
    root = parse(source);
  } catch (error) {
    const position = (error as { char?: unknown }).char;
    return fail(
      reject(
        "EXPRESSION_SYNTAX",
        `Invalid expression ${JSON.stringify(source)}${
          typeof position === "number" ? ` near character ${position}` : ""
        }`,
        typeof position === "number" ? { position } : undefined,
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
  node: MathNode,
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

  // `node.type` is a plain string discriminator; the casts below narrow to the node shapes
  // documented by math.js without importing its node classes.
  switch (node.type) {
    case "ConstantNode": {
      const value = (node as unknown as { value: unknown }).value;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw reject(
          "EXPRESSION_SYNTAX",
          `Only finite numbers are allowed as literals; found ${String(JSON.stringify(value) ?? value)}`,
          {
            fragment: String(value),
          },
        );
      }
      return () => value;
    }

    case "SymbolNode": {
      const name = (node as unknown as { name: string }).name;
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

    case "ParenthesisNode": {
      const content = (node as unknown as { content: MathNode }).content;
      return build(content, symbols, counter, depth + 1);
    }

    case "OperatorNode": {
      const op = node as unknown as {
        fn: string;
        op: string;
        args: MathNode[];
        implicit?: boolean;
      };
      if (op.implicit) {
        throw reject(
          "EXPRESSION_SYNTAX",
          "Implicit multiplication is not allowed; write '*' explicitly (e.g. '2*x')",
          {
            fragment: "implicit multiplication",
          },
        );
      }
      const args = op.args.map((arg) => build(arg, symbols, counter, depth + 1));
      if (args.length === 1) {
        const [a] = args as [Evaluator];
        if (op.fn === "unaryMinus") return (scope) => -a(scope);
        if (op.fn === "unaryPlus") return a;
      }
      const binary = Object.hasOwn(BINARY, op.fn) ? BINARY[op.fn] : undefined;
      if (binary && args.length === 2) {
        const [a, b] = args as [Evaluator, Evaluator];
        return (scope) => binary(a(scope), b(scope));
      }
      throw reject("EXPRESSION_SYNTAX", `Operator '${op.op}' is not supported`, {
        fragment: op.op,
      });
    }

    case "FunctionNode": {
      const call = node as unknown as { fn: MathNode; args: MathNode[] };
      if (call.fn.type !== "SymbolNode") {
        throw reject("EXPRESSION_SYNTAX", "Only calls to named functions are allowed");
      }
      const name = (call.fn as unknown as { name: string }).name;
      const def = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;
      if (!def) {
        throw reject("UNKNOWN_FUNCTION", `Unknown function '${name}'`, { function: name });
      }
      if (call.args.length < def.minArgs || call.args.length > def.maxArgs) {
        const expected =
          def.minArgs === def.maxArgs ? `${def.minArgs}` : `${def.minArgs} to ${def.maxArgs}`;
        throw reject(
          "EXPRESSION_SYNTAX",
          `Function '${name}' takes ${expected} argument(s), got ${call.args.length}`,
          {
            function: name,
          },
        );
      }
      const args = call.args.map((arg) => build(arg, symbols, counter, depth + 1));
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

    default:
      throw reject(
        "EXPRESSION_SYNTAX",
        `${describeNode(node.type)} is not allowed in expressions`,
        {
          fragment: node.type,
        },
      );
  }
}

function describeNode(type: string): string {
  switch (type) {
    case "AssignmentNode":
      return "Assignment";
    case "FunctionAssignmentNode":
      return "Function definition";
    case "AccessorNode":
    case "IndexNode":
      return "Property or index access";
    case "ArrayNode":
      return "A matrix or array";
    case "ObjectNode":
      return "An object literal";
    case "RangeNode":
      return "A range";
    case "ConditionalNode":
      return "A conditional";
    case "BlockNode":
      return "A block of statements";
    default:
      return `'${type}'`;
  }
}
