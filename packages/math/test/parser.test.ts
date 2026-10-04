import { describe, expect, it } from "vitest";
import { compileExpression, EXPRESSION_LIMITS } from "../src/index";

const value = (source: string, scope: Record<string, number> = {}) => {
  const result = compileExpression(source);
  if (!result.ok) throw new Error(result.issue.message);
  return result.expression.evaluate(scope);
};
const issue = (source: string) => {
  const result = compileExpression(source);
  if (result.ok) throw new Error(`expected ${JSON.stringify(source)} to be rejected`);
  return result.issue;
};

describe("parser", () => {
  it.each([
    [".5 + 0.25", 0.75],
    ["2.", 2],
    ["1E3", 1000],
    ["2e+2", 200],
    ["\t1 +\t2", 3],
    ["--3", 3],
    ["-+-3", 3],
    ["2^-1", 0.5],
    ["-(2)^2", -4],
    ["(((1)))", 1],
    ["max(1, 2, 3, 4, 5, 6, 7, 8)", 8],
    ["a_1 * _b", 6],
  ])("%s", (source, expected) => {
    expect(value(source, { a_1: 2, _b: 3 })).toBe(expected);
  });

  it.each([
    ["a.b", 2],
    ["a = 1", 3],
    ["sin(x", 6],
    ["1 2", 3],
    ["x +", 4],
    ["θ + 1", 1],
    [")", 1],
    ["sin(,1)", 5],
  ])("reports %j at character %d", (source, position) => {
    expect(issue(source)).toMatchObject({ code: "EXPRESSION_SYNTAX", details: { position } });
  });

  it("rejects number literals that overflow", () => {
    expect(issue("1e400").code).toBe("EXPRESSION_SYNTAX");
  });

  it("limits nesting through unary chains and exponents, not only parentheses", () => {
    expect(issue("-".repeat(40) + "1")).toMatchObject({ details: { limit: "maxDepth" } });
    expect(issue(Array(40).fill("2").join("^"))).toMatchObject({ details: { limit: "maxDepth" } });
  });

  it("allows nesting up to the limit", () => {
    const depth = EXPRESSION_LIMITS.maxDepth - 1;
    expect(value("(".repeat(depth) + "1" + ")".repeat(depth))).toBe(1);
  });
});

describe("fuzzing", () => {
  // Deterministic pseudo-random generator (no Math.random): failures are reproducible.
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const alphabet = [
    "x",
    "1",
    "2.5",
    "e",
    "pi",
    "sin",
    "(",
    ")",
    "+",
    "-",
    "*",
    "/",
    "^",
    ",",
    " ",
    ".",
    "=",
    "[",
    "'",
    "a",
  ];

  it("never throws, always returns a result object", () => {
    for (let n = 0; n < 5000; n++) {
      const length = 1 + Math.floor(random() * 30);
      const source = Array.from(
        { length },
        () => alphabet[Math.floor(random() * alphabet.length)],
      ).join("");
      const result = compileExpression(source);
      if (result.ok) {
        expect(typeof result.expression.evaluate({ x: 0.5, a: 2 })).toBe("number");
      } else {
        expect(["EXPRESSION_SYNTAX", "UNKNOWN_FUNCTION", "LIMIT_EXCEEDED"]).toContain(
          result.issue.code,
        );
      }
    }
  });
});
