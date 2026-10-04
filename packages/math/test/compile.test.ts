import { describe, expect, it } from "vitest";
import {
  compileExpression,
  EXPRESSION_LIMITS,
  SUPPORTED_CONSTANTS,
  SUPPORTED_FUNCTIONS,
  type CompiledExpression,
  type ExpressionIssue,
  type ExpressionScope,
} from "../src/index";

function compile(source: string): CompiledExpression {
  const result = compileExpression(source);
  if (!result.ok) throw new Error(`unexpected failure: ${result.issue.message}`);
  return result.expression;
}

function evaluate(source: string, scope: ExpressionScope = {}): number {
  return compile(source).evaluate(scope);
}

function rejection(source: string): ExpressionIssue {
  const result = compileExpression(source);
  if (result.ok) throw new Error(`expected ${JSON.stringify(source)} to be rejected`);
  return result.issue;
}

describe("arithmetic", () => {
  it.each([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["10 / 4", 2.5],
    ["2 ^ 3", 8],
    ["2 ^ 3 ^ 2", 512], // right-associative
    ["-2 ^ 2", -4], // unary minus binds looser than power
    ["+3", 3],
    ["1e-3 * 1000", 1],
    ["7 - 2 - 1", 4],
  ])("%s = %d", (source, expected) => {
    expect(evaluate(source)).toBeCloseTo(expected, 12);
  });
});

describe("functions and constants", () => {
  it.each([
    ["sin(pi / 2)", 1],
    ["cos(0)", 1],
    ["tan(pi / 4)", 1],
    ["asin(1)", Math.PI / 2],
    ["acos(1)", 0],
    ["atan(1)", Math.PI / 4],
    ["atan2(1, 1)", Math.PI / 4],
    ["sqrt(16)", 4],
    ["exp(1)", Math.E],
    ["log(e)", 1],
    ["abs(-3)", 3],
    ["min(3, 1, 2)", 1],
    ["max(3, 1, 2)", 3],
    ["floor(2.7)", 2],
    ["ceil(2.1)", 3],
  ])("%s", (source, expected) => {
    expect(evaluate(source)).toBeCloseTo(expected, 12);
  });

  it("exposes the whitelist", () => {
    expect(SUPPORTED_FUNCTIONS).toContain("sin");
    expect(SUPPORTED_CONSTANTS).toEqual(["pi", "e"]);
  });

  it("checks arity", () => {
    expect(rejection("log(x, 2)")).toMatchObject({
      code: "EXPRESSION_SYNTAX",
      details: { function: "log" },
    });
    expect(rejection("atan2(1)").code).toBe("EXPRESSION_SYNTAX");
    expect(rejection("min(1)").code).toBe("EXPRESSION_SYNTAX");
  });
});

describe("variables", () => {
  it("evaluates parameters and time", () => {
    expect(evaluate("v0 * cos(theta) * t", { v0: 10, theta: 0, t: 2 })).toBe(20);
  });

  it("extracts free symbols, excluding constants and functions", () => {
    expect([...compile("v0*sin(theta)*t - 0.5*g*t^2 + pi").symbols].sort()).toEqual([
      "g",
      "t",
      "theta",
      "v0",
    ]);
  });

  it("returns NaN for symbols missing from the scope", () => {
    expect(evaluate("x + 1", {})).toBeNaN();
  });

  it("never reads inherited properties of the scope", () => {
    const scope = Object.create({ x: 5 }) as ExpressionScope;
    expect(evaluate("x", scope)).toBeNaN();
    expect(evaluate("constructor", {})).toBeNaN();
    expect(evaluate("toString", {})).toBeNaN();
  });

  it("is deterministic", () => {
    const expr = compile("sin(a) * exp(b) / (1 + c^2)");
    const scope = { a: 0.3, b: 1.7, c: -2.5 };
    expect(expr.evaluate(scope)).toBe(expr.evaluate({ ...scope }));
  });
});

describe("numerical edge cases do not throw", () => {
  it.each([
    ["1 / 0", Infinity],
    ["-1 / 0", -Infinity],
    ["sqrt(-1)", NaN],
    ["log(0)", -Infinity],
    ["0 / 0", NaN],
  ])("%s", (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });
});

describe("rejected constructs", () => {
  it.each([
    ["2x", "EXPRESSION_SYNTAX"],
    ["2 pi", "EXPRESSION_SYNTAX"],
    ["(a)(b)", "EXPRESSION_SYNTAX"],
    ["a = 1", "EXPRESSION_SYNTAX"],
    ["f(x) = x^2", "EXPRESSION_SYNTAX"],
    ["a.b", "EXPRESSION_SYNTAX"],
    ["a[0]", "EXPRESSION_SYNTAX"],
    ['"text"', "EXPRESSION_SYNTAX"],
    ["[1, 2]", "EXPRESSION_SYNTAX"],
    ["{a: 1}", "EXPRESSION_SYNTAX"],
    ["1:3", "EXPRESSION_SYNTAX"],
    ["5 cm", "EXPRESSION_SYNTAX"],
    ["a > 0 ? 1 : 2", "EXPRESSION_SYNTAX"],
    ["a > 0", "EXPRESSION_SYNTAX"],
    ["a and b", "EXPRESSION_SYNTAX"],
    ["n!", "EXPRESSION_SYNTAX"],
    ["x'", "EXPRESSION_SYNTAX"],
    ["a mod b", "EXPRESSION_SYNTAX"],
    ["a & b", "EXPRESSION_SYNTAX"],
    ["true", "EXPRESSION_SYNTAX"],
    ["Infinity", "EXPRESSION_SYNTAX"],
    ["NaN", "EXPRESSION_SYNTAX"],
    ["a; b", "EXPRESSION_SYNTAX"],
    ["a\nb", "EXPRESSION_SYNTAX"],
    ["", "EXPRESSION_SYNTAX"],
    ["   ", "EXPRESSION_SYNTAX"],
    ["x +", "EXPRESSION_SYNTAX"],
    ["sin(", "EXPRESSION_SYNTAX"],
  ])("%j → %s", (source, code) => {
    expect(rejection(source).code).toBe(code);
  });

  it("reports syntax error positions without leaking library messages", () => {
    const issue = rejection("x +");
    expect(issue.details).toEqual({ position: 4 });
    expect(issue.message).toBe('Invalid expression "x +" near character 4');
  });
});

describe("security: hostile input", () => {
  it.each([
    'import("data:text/javascript,alert(1)")',
    'evaluate("1+1")',
    'parse("1")',
    'createUnit("x")',
    "constructor(1)",
    "__proto__(1)",
    "eval(1)",
    "Function(1)",
    "alert(1)",
    "fetch(1)",
  ])("rejects call %s", (source) => {
    expect(["UNKNOWN_FUNCTION", "EXPRESSION_SYNTAX"]).toContain(rejection(source).code);
  });

  it("rejects property access chains", () => {
    expect(rejection("x.constructor.constructor").code).toBe("EXPRESSION_SYNTAX");
    expect(rejection('x["constructor"]').code).toBe("EXPRESSION_SYNTAX");
  });
});

describe("limits", () => {
  it("rejects overly long expressions", () => {
    const issue = rejection("1+".repeat(EXPRESSION_LIMITS.maxLength) + "1");
    expect(issue).toMatchObject({ code: "LIMIT_EXCEEDED", details: { limit: "maxLength" } });
  });

  it("rejects too many terms", () => {
    // ~290 characters and depth ~25: within the length and depth limits, but ~270 nodes.
    const group = `(${Array(8).fill("a").join("*")})`;
    const issue = rejection(Array(16).fill(group).join("+"));
    expect(issue).toMatchObject({ code: "LIMIT_EXCEEDED", details: { limit: "maxNodes" } });
  });

  it("rejects excessive nesting", () => {
    const issue = rejection("(".repeat(40) + "1" + ")".repeat(40));
    expect(issue).toMatchObject({ code: "LIMIT_EXCEEDED", details: { limit: "maxDepth" } });
  });
});
