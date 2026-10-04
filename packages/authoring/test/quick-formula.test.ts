import { describe, expect, it } from "vitest";
import { parseQuickFormula } from "../src/index";

const parse = (input: string, known: string[] = []) => {
  const result = parseQuickFormula(input, known);
  if (!result.ok) throw new Error(`${input}: ${result.message} (${result.expression})`);
  return result;
};

describe("parseQuickFormula", () => {
  it.each([
    ["y = x^3 - 3x", "x^3 - 3*x"],
    ["f(x) = 2x + 1", "2*x + 1"],
    ["2sin(x)", "2*sin(x)"],
    ["sin x", "sin(x)"],
    ["sinx", "sin(x)"],
    ["sin 2x", "sin(2*x)"],
    ["2 sin x cos x", "2*sin(x)*cos(x)"],
    ["x(x+1)", "x*(x + 1)"],
    ["(x+1)(x-1)", "(x + 1)*(x - 1)"],
    ["x²", "x^2"],
    ["x³ − 2x", "x^3 - 2*x"],
    ["3·x × 2", "3*x*2"],
    ["πx", "pi*x"],
    ["2pix", "2*pi*x"],
    ["√x", "sqrt(x)"],
    ["√(x+1)", "sqrt(x + 1)"],
    ["ln x", "log(x)"],
    ["e^-x^2", "e^-x^2"],
    ["|x - 1|", "abs(x - 1)"],
    ["-x^2 + 4", "-x^2 + 4"],
    ["1/(1+x^2)", "1/(1 + x^2)"],
    ["x**2", "x^2"],
    ["max(x, 0)", "max(x, 0)"],
    ["xsin(x)", "x*sin(x)"],
  ])("%s → %s", (input, expected) => {
    expect(parse(input).expression).toBe(expected);
  });

  it("reads run-together letters as products and reports new names", () => {
    const result = parse("y = ax^2 + bx + c");
    expect(result.expression).toBe("a*x^2 + b*x + c");
    expect(result.unknown).toEqual(["a", "b", "c"]);
  });

  it("keeps known multi-letter names and Greek words whole", () => {
    expect(parse("amp*sin(k x)", ["amp", "k"]).expression).toBe("amp*sin(k*x)");
    expect(parse("A cos(omega x + phi)").expression).toBe("A*cos(omega*x + phi)");
    expect(parse("θ x").expression).toBe("theta*x");
  });

  it("keeps names with digits whole", () => {
    expect(parse("v0 x", ["v0"]).expression).toBe("v0*x");
  });

  it("does not report the variable, time or constants as unknown", () => {
    expect(parse("sin(x + t) + pi + e").unknown).toEqual([]);
  });

  it("explains what cannot be understood", () => {
    const result = parseQuickFormula("x +", []);
    expect(result.ok).toBe(false);
  });

  it("produces expressions that the strict engine accepts", () => {
    for (const input of ["3x^2-2x+1", "2sin x cos x", "|x|", "√(4 - x²)", "ax+b"]) {
      expect(parseQuickFormula(input, []).ok).toBe(true);
    }
  });
});
