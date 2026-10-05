import { describe, expect, it } from "vitest";
import { latexToFormula, parseQuickFormula } from "../src/index";

/** LaTeX → strict EyeViz expression, through the quick formula reader. */
function strict(latex: string): string {
  const text = latexToFormula(latex);
  if (!text.ok) throw new Error(`${latex}: ${text.message}`);
  const result = parseQuickFormula(text.text, []);
  if (!result.ok) throw new Error(`${latex} → ${text.text}: ${result.message}`);
  return result.expression;
}

describe("latexToFormula", () => {
  it.each([
    // Powers and products
    ["3x^2-2x+1", "3*x^2 - 2*x + 1"],
    ["x^{2}+x^{10}", "x^2 + x^10"],
    ["e^{-x^2}", "e^(-x^2)"],
    ["2^{x+1}", "2^(x + 1)"],
    ["a\\cdot x", "a*x"],
    ["2\\times3x", "2*3*x"],
    // Fractions
    ["\\frac{1}{x}", "(1/x)"],
    ["\\frac{x+1}{x-1}", "((x + 1)/(x - 1))"],
    ["\\dfrac{3}{4}x", "(3/4)*x"],
    // Roots
    ["\\sqrt{x+1}", "sqrt(x + 1)"],
    ["\\sqrt[3]{x}", "cbrt(x)"],
    ["\\sqrt[4]{x}", "root(x, 4)"],
    ["2\\sqrt{x}", "2*sqrt(x)"],
    // Functions as textbooks write them
    ["\\sin x", "sin(x)"],
    ["\\sin\\left(2x\\right)", "sin(2*x)"],
    ["\\sin^2x+\\cos^{2}x", "sin(x)^2 + cos(x)^2"],
    ["\\tan x", "tan(x)"],
    ["\\operatorname{tg}x", "tan(x)"],
    ["\\cot x", "(1/tan(x))"],
    ["\\arcsin x", "asin(x)"],
    ["\\ln x", "log(x)"],
    ["\\log x", "log(x)"],
    ["\\log_{10}x", "(log(x)/log(10))"],
    ["\\log_{2}\\left(x+1\\right)", "(log(x + 1)/log(2))"],
    ["\\log_2x", "(log(x)/log(2))"],
    ["e^{x}", "e^x"],
    ["\\exponentialE^{x}", "e^x"],
    ["\\mathrm{e}^x", "e^x"],
    // Greek letters and constants
    ["2\\pi x", "2*pi*x"],
    ["A\\sin\\left(\\omega x+\\varphi\\right)", "A*sin(omega*x + phi)"],
    // Absolute values
    ["\\left|x-1\\right|", "abs(x - 1)"],
    ["\\lvert x\\rvert", "abs(x)"],
    // Decimal comma from a Vietnamese keyboard
    ["1{,}5x", "1.5*x"],
    // Spacing commands
    ["x\\,y", "x*y"],
  ])("%s → %s", (latex, expected) => {
    expect(strict(latex)).toBe(expected);
  });

  it("reads equations as implicit curves", () => {
    const text = latexToFormula("\\frac{x^2}{9}+\\frac{y^2}{4}=1");
    if (!text.ok) throw new Error(text.message);
    expect(parseQuickFormula(text.text, [])).toMatchObject({
      ok: true,
      kind: "equation",
      expression: "(x^2/9) + (y^2/4) = 1",
    });
  });

  it("reports an incomplete formula", () => {
    expect(latexToFormula("\\frac{1}{\\placeholder{}}")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/incomplete/),
    });
    expect(latexToFormula("x^")).toMatchObject({ ok: false });
    expect(latexToFormula("")).toMatchObject({ ok: false, message: "The formula is empty" });
  });

  it("reports what it does not understand instead of guessing", () => {
    expect(latexToFormula("\\int_0^1 x\\,dx")).toMatchObject({
      ok: false,
      message: "'\\int' is not supported in formulas",
    });
    expect(latexToFormula("x\\le 2")).toMatchObject({ ok: false });
    expect(latexToFormula("\\frac{1}{x")).toMatchObject({ ok: false });
  });
});
