/**
 * Hand-written parser for the EyeViz expression grammar (docs/expressions.md):
 *
 *   expression := additive
 *   additive   := multiplicative (("+" | "-") multiplicative)*
 *   multiplicative := unary (("*" | "/") unary)*
 *   unary      := ("+" | "-") unary | power
 *   power      := primary ("^" unary)?          right-associative; -2^2 = -(2^2)
 *   primary    := number | identifier | identifier "(" arguments ")" | "(" expression ")"
 *
 * Anything else — assignment, property access, strings, implicit multiplication — is a
 * syntax error. The parser never evaluates anything and never touches host objects.
 * See docs/adr/0013-hand-written-expression-parser.md.
 */

export type AstNode =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "symbol"; readonly name: string }
  | { readonly kind: "unary"; readonly op: "-" | "+"; readonly operand: AstNode }
  | {
      readonly kind: "binary";
      readonly op: BinaryOperator;
      readonly left: AstNode;
      readonly right: AstNode;
    }
  | { readonly kind: "call"; readonly name: string; readonly args: readonly AstNode[] };

export type BinaryOperator = "+" | "-" | "*" | "/" | "^";

/** A syntax error at a 1-based character position (length + 1 means "at the end"). */
export class ParseError {
  constructor(
    readonly message: string,
    readonly position: number,
    readonly kind: "syntax" | "depth" = "syntax",
  ) {}
}

type Token =
  | { readonly type: "number"; readonly value: number; readonly start: number }
  | { readonly type: "identifier"; readonly name: string; readonly start: number }
  | { readonly type: "punct"; readonly value: string; readonly start: number }
  | { readonly type: "end"; readonly start: number };

const PUNCTUATION = new Set(["+", "-", "*", "/", "^", "(", ")", ","]);

/** Literal-looking names that other languages treat specially; rejected to avoid surprises. */
const FORBIDDEN_NAMES = new Set(["true", "false", "null", "undefined", "Infinity", "NaN"]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    const start = i + 1;
    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1]))) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      const text = (match as RegExpExecArray)[0];
      tokens.push({ type: "number", value: Number(text), start });
      i += text.length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const text = (/^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i)) as RegExpExecArray)[0];
      tokens.push({ type: "identifier", name: text, start });
      i += text.length;
      continue;
    }
    if (PUNCTUATION.has(ch)) {
      tokens.push({ type: "punct", value: ch, start });
      i++;
      continue;
    }
    throw new ParseError(`unexpected ${JSON.stringify(ch)}`, start);
  }
  tokens.push({ type: "end", start: source.length + 1 });
  return tokens;
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/** Parses `source` into an AST. Nesting deeper than `maxDepth` is rejected before recursing further. */
export function parseExpression(source: string, maxDepth: number): AstNode {
  const tokens = tokenize(source);
  let index = 0;
  let depth = 0;

  const peek = (): Token => tokens[index] as Token;
  const next = (): Token => tokens[index++] as Token;
  const isPunct = (token: Token, value: string) => token.type === "punct" && token.value === value;

  const enter = (token: Token) => {
    if (++depth > maxDepth) throw new ParseError("nested too deeply", token.start, "depth");
  };

  const expect = (value: string) => {
    const token = next();
    if (!isPunct(token, value)) throw new ParseError(`expected '${value}'`, token.start);
  };

  function additive(): AstNode {
    let left = multiplicative();
    for (let token = peek(); isPunct(token, "+") || isPunct(token, "-"); token = peek()) {
      next();
      left = {
        kind: "binary",
        op: (token as { value: "+" | "-" }).value,
        left,
        right: multiplicative(),
      };
    }
    return left;
  }

  function multiplicative(): AstNode {
    let left = unary();
    for (let token = peek(); isPunct(token, "*") || isPunct(token, "/"); token = peek()) {
      next();
      left = { kind: "binary", op: (token as { value: "*" | "/" }).value, left, right: unary() };
    }
    return left;
  }

  function unary(): AstNode {
    const token = peek();
    if (isPunct(token, "-") || isPunct(token, "+")) {
      next();
      enter(token);
      const operand = unary();
      depth--;
      return { kind: "unary", op: (token as { value: "-" | "+" }).value, operand };
    }
    return power();
  }

  function power(): AstNode {
    const base = primary();
    const token = peek();
    if (!isPunct(token, "^")) return base;
    next();
    enter(token);
    const exponent = unary();
    depth--;
    return { kind: "binary", op: "^", left: base, right: exponent };
  }

  function primary(): AstNode {
    const token = next();
    let node: AstNode;
    if (token.type === "number") {
      node = { kind: "number", value: token.value };
    } else if (token.type === "identifier") {
      if (FORBIDDEN_NAMES.has(token.name)) {
        throw new ParseError(`'${token.name}' is not allowed in expressions`, token.start);
      }
      if (isPunct(peek(), "(")) {
        enter(next());
        const args: AstNode[] = [];
        if (!isPunct(peek(), ")")) {
          args.push(additive());
          while (isPunct(peek(), ",")) {
            next();
            args.push(additive());
          }
        }
        expect(")");
        depth--;
        node = { kind: "call", name: token.name, args };
      } else {
        node = { kind: "symbol", name: token.name };
      }
    } else if (isPunct(token, "(")) {
      enter(token);
      node = additive();
      expect(")");
      depth--;
    } else {
      throw new ParseError(token.type === "end" ? "unexpected end" : "value expected", token.start);
    }

    // A value directly followed by another value is implicit multiplication (2x, 2 pi, (a)(b)).
    const following = peek();
    if (following.type === "number" || following.type === "identifier" || isPunct(following, "(")) {
      throw new ParseError("implicit multiplication", following.start);
    }
    return node;
  }

  const root = additive();
  const end = peek();
  if (end.type !== "end") throw new ParseError("unexpected input", end.start);
  return root;
}
