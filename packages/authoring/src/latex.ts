/**
 * LaTeX from a math editor (e.g. MathLive) → the formula text that `parseQuickFormula` reads.
 *
 *   \frac{3}{x}+\sqrt[3]{x}  →  ((3)/(x)) + cbrt(x)
 *   \sin^2x+\left|y\right|=1 →  sin^(2) x + |y| = 1
 *
 * Only the LaTeX that school formulas need is understood; anything else is reported rather
 * than guessed. Pure and dependency-free: the editor itself lives in the app.
 */

export type LatexResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

/** Commands that are written as a function name. */
const FUNCTION_COMMANDS: Readonly<Record<string, string>> = {
  sin: "sin",
  cos: "cos",
  tan: "tan",
  tg: "tan",
  cot: "cot",
  cotg: "cot",
  arcsin: "asin",
  arccos: "acos",
  arctan: "atan",
  arctg: "atan",
  arccot: "arccot",
  ln: "ln",
  lg: "lg",
  exp: "exp",
  min: "min",
  max: "max",
};

/** Commands that are a name or a symbol. */
const SYMBOL_COMMANDS: Readonly<Record<string, string>> = {
  pi: "pi",
  cdot: "*",
  times: "*",
  div: "/",
  exponentialE: "e",
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  theta: "theta",
  vartheta: "theta",
  phi: "phi",
  varphi: "phi",
  omega: "omega",
  lambda: "lambda",
  mu: "mu",
  sigma: "sigma",
  tau: "tau",
  rho: "rho",
  kappa: "kappa",
  lvert: "|",
  rvert: "|",
  vert: "|",
  mid: "|",
};

/** Spacing commands, read as a space. */
const SPACES = new Set([",", ";", ":", "!", " ", "quad", "qquad", "enspace", "thinspace"]);

/** Wrappers whose content is read as is (`\mathrm{e}`, `\operatorname{tg}`). */
const TEXT_COMMANDS = new Set(["mathrm", "operatorname", "text", "mathit", "textrm"]);

/** A number or name, optionally raised to a number or letter (`^` binds tighter than `/`). */
const OPERAND = /^(\d+(\.\d+)?|[A-Za-z]\w*)(\s*\^\s*(\d+(\.\d+)?|[A-Za-z]))?$/;

/** `s` as one operand of a fraction: parenthesized unless it is a simple operand. */
function wrap(s: string): string {
  const trimmed = s.trim();
  return OPERAND.test(trimmed) ? trimmed : `(${unwrap(trimmed)})`;
}

/** Drops parentheses around the whole of `s`: "(x + 1)" → "x + 1". */
function unwrap(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return trimmed;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "(") depth++;
    else if (trimmed[i] === ")") depth--;
    // Closed before the end: "(a)+(b)" is not one group.
    if (depth === 0 && i < trimmed.length - 1) return trimmed;
  }
  return unwrap(trimmed.slice(1, -1));
}

class LatexError {
  constructor(readonly message: string) {}
}

export function latexToFormula(latex: string): LatexResult {
  try {
    const text = new Reader(latex).sequence(undefined).replace(/\s+/g, " ").trim();
    if (!text) return { ok: false, message: "The formula is empty" };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof LatexError) return { ok: false, message: error.message };
    throw error;
  }
}

class Reader {
  #i = 0;

  constructor(private readonly source: string) {}

  /** Reads until `end` (a closing character) or the end of input. */
  sequence(end: "}" | "]" | undefined): string {
    let out = "";
    while (this.#i < this.source.length) {
      const ch = this.source[this.#i] as string;
      if (ch === end) {
        this.#i++;
        return out;
      }
      if (ch === "}" || ch === "]") {
        // A stray closer (e.g. "]" outside an optional argument) is plain text only for "]".
        if (ch === "]") {
          this.#i++;
          out += "]";
          continue;
        }
        throw new LatexError("Unbalanced braces in the formula");
      }
      out += this.atom();
    }
    if (end === "}") throw new LatexError("Unbalanced braces in the formula");
    return out;
  }

  /** One unit of input, as formula text. */
  atom(): string {
    const ch = this.source[this.#i] as string;
    if (ch === "\\") return this.command();
    if (ch === "{") {
      this.#i++;
      const inner = this.sequence("}");
      // `{,}` is how editors write a decimal comma.
      return inner === "," ? "," : `(${inner})`;
    }
    if (ch === "^") {
      this.#i++;
      // A single number or letter needs no parentheses: x^{2} → x^2.
      const exponent = this.argument().trim();
      return /^(\d+(\.\d+)?|[A-Za-z])$/.test(exponent) ? `^${exponent} ` : `^(${exponent})`;
    }
    if (ch === "_") {
      this.#i++;
      // Subscripts join the name: v_0 → v0, x_{1} → x1.
      return this.argument().replace(/[^A-Za-z0-9]/g, "");
    }
    if (ch === "~") {
      this.#i++;
      return " ";
    }
    this.#i++;
    return ch;
  }

  /** A command argument: a group `{…}` or a single token. */
  argument(): string {
    this.skipSpaces();
    const ch = this.source[this.#i];
    if (ch === undefined) throw new LatexError("The formula is incomplete");
    if (ch === "{") {
      this.#i++;
      return this.sequence("}");
    }
    return this.atom();
  }

  optionalArgument(): string | undefined {
    this.skipSpaces();
    if (this.source[this.#i] !== "[") return undefined;
    this.#i++;
    return this.sequence("]");
  }

  skipSpaces(): void {
    while (this.source[this.#i] === " ") this.#i++;
  }

  command(): string {
    this.#i++; // backslash
    const rest = this.source.slice(this.#i);
    const name = /^[A-Za-z]+/.exec(rest)?.[0] ?? rest[0] ?? "";
    this.#i += name.length;

    if (SPACES.has(name)) return " ";
    if (name === "{" || name === "}") return name === "{" ? "(" : ")";
    if (name === "left" || name === "right" || name === "middle") return this.delimiter();
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const numerator = this.argument();
      const denominator = this.argument();
      return ` (${wrap(numerator)}/${wrap(denominator)}) `;
    }
    if (name === "sqrt") {
      const index = this.optionalArgument()?.trim();
      const radicand = this.argument();
      if (index === undefined || index === "" || index === "2") return ` sqrt(${radicand}) `;
      if (index === "3") return ` cbrt(${radicand}) `;
      return ` root(${radicand}, ${index}) `;
    }
    if (name === "log") {
      // \log_{a} x → log base a; plain \log is the natural logarithm, as in EyeViz.
      this.skipSpaces();
      if (this.source[this.#i] !== "_") return " log ";
      this.#i++;
      const base = this.argument().trim();
      if (base === "10") return " lg ";
      if (base === "e") return " ln ";
      const argument = this.functionArgument();
      return ` (log(${unwrap(argument)})/log(${base})) `;
    }
    if (TEXT_COMMANDS.has(name)) {
      const text = this.argument().trim();
      return ` ${FUNCTION_COMMANDS[text] ?? text} `;
    }
    if (name === "placeholder") {
      throw new LatexError("The formula is incomplete: fill in every box");
    }
    const fn = FUNCTION_COMMANDS[name];
    if (fn) return ` ${fn} `;
    const symbol = SYMBOL_COMMANDS[name];
    if (symbol) return ` ${symbol} `;
    throw new LatexError(`'\\${name}' is not supported in formulas`);
  }

  /** The argument of `\log_a`: a group, or the next term up to an operator. */
  functionArgument(): string {
    this.skipSpaces();
    if (this.source.startsWith("\\left", this.#i) || this.source[this.#i] === "(") {
      let out = "";
      let depth = 0;
      do {
        const piece = this.atom();
        out += piece;
        depth += (piece.match(/\(/g) ?? []).length - (piece.match(/\)/g) ?? []).length;
      } while (depth > 0 && this.#i < this.source.length);
      return out;
    }
    let out = "";
    while (this.#i < this.source.length && !/[+\-=}\]]/.test(this.source[this.#i] as string)) {
      out += this.atom();
    }
    if (!out.trim()) throw new LatexError("The formula is incomplete");
    return out;
  }

  /** The delimiter after `\left`/`\right`: `(`, `|`, `\lvert`, `.` (none)… */
  delimiter(): string {
    this.skipSpaces();
    const ch = this.source[this.#i];
    if (ch === undefined) throw new LatexError("The formula is incomplete");
    if (ch === "\\") {
      const piece = this.command();
      if (piece.trim() === "|") return "|";
      if (piece === "(" || piece === ")") return piece;
      throw new LatexError("This kind of bracket is not supported in formulas");
    }
    this.#i++;
    if (ch === ".") return "";
    if (ch === "[" || ch === "(") return "(";
    if (ch === "]" || ch === ")") return ")";
    if (ch === "|") return "|";
    throw new LatexError("This kind of bracket is not supported in formulas");
  }
}
