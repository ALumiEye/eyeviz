/**
 * Turns a formula typed the way people write it ("y = 3x² − 2sin x") into a strict EyeViz
 * expression ("3*x^2 - 2*sin(x)"), and an equation ("x² + y² = 4") into a strict equation for an
 * implicit curve ("x^2 + y^2 = 4"). This is an editor convenience: specs always store the strict
 * form (implicit multiplication stays invalid in specs — docs/adr/0002, 0013).
 */
import { compileExpression, SUPPORTED_CONSTANTS, SUPPORTED_FUNCTIONS } from "@alumieye/eyeviz-math";
import { ID_PATTERN } from "@alumieye/eyeviz-spec";

export type QuickFormulaResult =
  | {
      readonly ok: true;
      /**
       * `"function"`: a graph y = f(x), `expression` is f(x). `"equation"`: an implicit curve in
       * x and y, `expression` is the strict equation `left = right`.
       */
      readonly kind: "function" | "equation";
      /** Strict EyeViz expression, or strict equation. */
      readonly expression: string;
      /** Names used but not known yet (candidates for new sliders), in order of appearance. */
      readonly unknown: readonly string[];
    }
  | { readonly ok: false; readonly expression: string; readonly message: string };

const FUNCTIONS = new Set<string>(SUPPORTED_FUNCTIONS);
const CONSTANTS = new Set<string>(SUPPORTED_CONSTANTS);
/** Words read as one name even when not defined yet (they become sliders). */
const GREEK = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "theta",
  "phi",
  "omega",
  "lambda",
  "mu",
  "sigma",
  "tau",
  "rho",
  "kappa",
];
/** Textbook spellings (including Vietnamese ones) of supported functions. */
const ALIASES: Readonly<Record<string, string>> = {
  ln: "log",
  tg: "tan",
  cotg: "cot",
  arcsin: "asin",
  arccos: "acos",
  arctan: "atan",
  arctg: "atan",
  arccotg: "arccot",
  log10: "lg",
};
/**
 * Functions the strict language does not have, written out with ones it does. `ARG` is replaced
 * by the argument. Specs stay in the strict language.
 */
const EXPANSIONS: Readonly<Record<string, string>> = {
  cot: "(1/tan(ARG))",
  lg: "(log(ARG)/log(10))",
  arccot: "(pi/2 - atan(ARG))",
};
/** Function-like words that are not supported, so they are reported instead of becoming sliders. */
const UNSUPPORTED = [
  "sign",
  "sgn",
  "round",
  "mod",
  "sec",
  "csc",
  "cosec",
  "sinh",
  "cosh",
  "tanh",
  "log2",
];
/** Everything written like a function in a quick formula. */
const CALLABLE = new Set([...FUNCTIONS, ...Object.keys(EXPANSIONS)]);

const SYMBOLS: readonly [RegExp, string][] = [
  [/[−–]/g, "-"],
  [/[×·⋅∙]/g, "*"],
  [/÷/g, "/"],
  [/\*\*/g, "^"],
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/π/g, "pi"],
  [/∛/g, " cbrt "],
  [/√/g, " sqrt "],
  [/θ/g, " theta "],
  [/φ|ϕ/g, " phi "],
  [/ω/g, " omega "],
  [/α/g, " alpha "],
  [/β/g, " beta "],
  [/λ/g, " lambda "],
];

type Token =
  { kind: "number"; text: string } | { kind: "name"; text: string } | { kind: "op"; text: string };

/**
 * @param input    What the user typed, e.g. `y = ax^2 + bx + c` or `x^2 + y^2 = r^2`.
 * @param known    Names already defined (parameters), so `ab` with a slider `ab` stays `ab`.
 * @param variable The graph's variable, `x` by default.
 */
export function parseQuickFormula(
  input: string,
  known: Iterable<string>,
  variable = "x",
): QuickFormulaResult {
  const knownNames = [...known];
  let text = input.trim();
  for (const [pattern, replacement] of SYMBOLS) text = text.replace(pattern, replacement);
  text = absoluteBars(decimalCommas(text));

  const sides = text.split("=");
  if (sides.length > 2) {
    return { ok: false, expression: text, message: "An equation has exactly one '='" };
  }
  if (sides.length === 2) {
    const [left, right] = sides as [string, string];
    // "y = …" or "f(x) = …" without y on the right is a graph of a function.
    if (/^\s*(y|f\s*\(\s*[a-z]\s*\))\s*$/i.test(left)) {
      const graph = toStrict(right, new Set([...knownNames, variable, "t"]));
      if (!graph.ok || !graph.symbols.has("y") || knownNames.includes("y")) {
        return finish("function", graph, new Set([...knownNames, variable, "t"]));
      }
    }
    const names = new Set([...knownNames, "x", "y", "t"]);
    const strictLeft = toStrict(left, names);
    if (!strictLeft.ok) return strictLeft;
    const strictRight = toStrict(right, names);
    if (!strictRight.ok) return strictRight;
    return finish(
      "equation",
      {
        ok: true,
        expression: `${strictLeft.expression} = ${strictRight.expression}`,
        symbols: new Set([...strictLeft.symbols, ...strictRight.symbols]),
      },
      names,
    );
  }
  const names = new Set([...knownNames, variable, "t"]);
  return finish("function", toStrict(text, names), names);
}

type Strict =
  | { readonly ok: true; readonly expression: string; readonly symbols: ReadonlySet<string> }
  | { readonly ok: false; readonly expression: string; readonly message: string };

/** The result, with the names that are not known yet as slider candidates. */
function finish(
  kind: "function" | "equation",
  strict: Strict,
  knownNames: ReadonlySet<string>,
): QuickFormulaResult {
  if (!strict.ok) return strict;
  const unknown = [...strict.symbols].filter(
    (name) => !knownNames.has(name) && ID_PATTERN.test(name) && !FUNCTIONS.has(name),
  );
  return { ok: true, kind, expression: strict.expression, unknown };
}

/** One side of a formula (already normalized) → strict expression and its free names. */
function toStrict(text: string, knownNames: ReadonlySet<string>): Strict {
  const tokens = expandNames(tokenize(text), knownNames);
  const unsupported = tokens.find(
    (token) =>
      token.kind === "name" && UNSUPPORTED.includes(token.text) && !knownNames.has(token.text),
  );
  if (unsupported) {
    return {
      ok: false,
      expression: text.trim(),
      message: `Function '${unsupported.text}' is not supported. Available: ${[...CALLABLE].join(", ")}`,
    };
  }
  const withCalls = wrapBareCalls(tokens);
  const expression = render(insertMultiplication(withCalls));

  const compiled = compileExpression(expression);
  if (!compiled.ok) return { ok: false, expression, message: compiled.issue.message };
  // A function name left without an argument ("sin + 1") would compile as a free symbol.
  const bare = [...compiled.expression.symbols].find((name) => FUNCTIONS.has(name));
  if (bare) {
    return {
      ok: false,
      expression,
      message: `Function '${bare}' needs an argument, e.g. ${bare}(x)`,
    };
  }
  return { ok: true, expression, symbols: compiled.expression.symbols };
}

/**
 * Vietnamese decimal commas: `1,5x` → `1.5x`. A comma between digits inside `min`/`max`/`atan2`
 * separates arguments, unless the formula uses `;` for that (`max(1,5; x)`).
 */
function decimalCommas(text: string): string {
  const semicolons = text.includes(";");
  const calls: boolean[] = [];
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === "(") calls.push(/(?:min|max|atan2)\s*$/.test(out));
    else if (ch === ")") calls.pop();
    else if (ch === ";") {
      out += ",";
      continue;
    } else if (
      ch === "," &&
      isDigit(text[i - 1]) &&
      isDigit(text[i + 1]) &&
      (semicolons || !calls.includes(true))
    ) {
      out += ".";
      continue;
    }
    out += ch;
  }
  return out;
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/** `|x - 1|` → `abs(x - 1)` (bars alternate open/close; nesting needs explicit abs()). */
function absoluteBars(text: string): string {
  let open = false;
  return text.replace(/\|/g, () => {
    open = !open;
    return open ? " abs(" : ")";
  });
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\S))/gy;
  for (let match = pattern.exec(text); match && match[0] !== ""; match = pattern.exec(text)) {
    if (match[1] !== undefined) tokens.push({ kind: "number", text: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: "name", text: match[2] });
    else if (match[3] !== undefined) tokens.push({ kind: "op", text: match[3] });
  }
  return tokens;
}

/**
 * Splits run-together names the way textbooks read them: `ax` → `a x`, `xsin` → `x sin`,
 * `2pix` → `2 pi x`. Known names, functions, constants and Greek words are kept whole; any
 * other letters are single-letter names. Names with digits or `_` (e.g. `v0`) are kept whole.
 */
function expandNames(tokens: Token[], known: ReadonlySet<string>): Token[] {
  const atoms = [
    ...new Set([
      ...known,
      ...CALLABLE,
      ...CONSTANTS,
      ...GREEK,
      ...Object.keys(ALIASES),
      ...UNSUPPORTED,
    ]),
  ]
    .filter((a) => /^[A-Za-z]+$/.test(a))
    .sort((a, b) => b.length - a.length);
  const out: Token[] = [];
  for (const token of tokens) {
    if (token.kind !== "name") {
      out.push(token);
      continue;
    }
    const whole = ALIASES[token.text] ?? token.text;
    if (
      known.has(whole) ||
      CALLABLE.has(whole) ||
      CONSTANTS.has(whole) ||
      GREEK.includes(whole) ||
      UNSUPPORTED.includes(whole) ||
      /[\d_]/.test(whole)
    ) {
      out.push({ kind: "name", text: whole });
      continue;
    }
    for (const piece of splitName(token.text, atoms))
      out.push({ kind: "name", text: ALIASES[piece] ?? piece });
  }
  return out;
}

/** Fewest pieces covering `name`, using `atoms` or single letters. */
function splitName(name: string, atoms: readonly string[]): string[] {
  const best: (string[] | undefined)[] = Array.from({ length: name.length + 1 }, () => undefined);
  best[0] = [];
  for (let i = 0; i < name.length; i++) {
    const prefix = best[i];
    if (!prefix) continue;
    for (const piece of [...atoms.filter((a) => name.startsWith(a, i)), name[i] as string]) {
      const next = best[i + piece.length];
      if (!next || next.length > prefix.length + 1) best[i + piece.length] = [...prefix, piece];
    }
  }
  return best[name.length] ?? [name];
}

/**
 * Applies functions the way textbooks write them:
 *
 *   sin x → sin(x)      sin 2x → sin(2*x)       sin ax → sin(a*x)     sin x^2 → sin(x^2)
 *   sin²x → sin(x)^2    cos^2(x) → cos(x)^2     sin -x → sin(-x)      cot x → (1/tan(x))
 *
 * A bare argument is an optional minus sign, an optional number and names (stopping at the next
 * function or at `e^…`), with an optional power.
 */
function wrapBareCalls(tokens: readonly Token[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] as Token;
    i++;
    if (token.kind !== "name" || !CALLABLE.has(token.text)) {
      out.push(token);
      continue;
    }
    // A power written on the function itself: sin^2 x = (sin x)^2.
    let power: Token[] = [];
    if (isOp(tokens[i], "^")) {
      const end = operandEnd(tokens, i + 1);
      power = tokens.slice(i, end);
      i = end;
    }
    let argument: Token[] | undefined;
    if (isOp(tokens[i], "(")) {
      const end = groupEnd(tokens, i);
      argument = tokens.slice(i + 1, end - 1);
      i = end;
    } else {
      const end = bareArgumentEnd(tokens, i);
      if (end > i) argument = tokens.slice(i, end);
      i = end;
    }
    if (!argument) {
      // No argument: left as is, so the caller can report it.
      out.push(token, ...power);
      continue;
    }
    out.push(...applyFunction(token.text, insertMultiplication(wrapBareCalls(argument))), ...power);
  }
  return out;
}

function applyFunction(name: string, argument: Token[]): Token[] {
  const template = EXPANSIONS[name];
  if (!template) return [{ kind: "name", text: name }, op("("), ...argument, op(")")];
  const [before, after] = template.split("ARG") as [string, string];
  return [...tokenize(before), ...argument, ...tokenize(after)];
}

function bareArgumentEnd(tokens: readonly Token[], start: number): number {
  let i = start;
  if (isOp(tokens[i], "-")) i++;
  const valueStart = i;
  if (tokens[i]?.kind === "number") i++;
  for (let token = tokens[i]; token?.kind === "name"; token = tokens[i]) {
    if (CALLABLE.has(token.text)) break;
    // `sin x e^x` is sin(x)·e^x.
    if (token.text === "e" && i > valueStart && isOp(tokens[i + 1], "^")) break;
    i++;
  }
  if (i === valueStart) return start;
  return isOp(tokens[i], "^") ? operandEnd(tokens, i + 1) : i;
}

/** End (exclusive) of a power's exponent starting at `start`: `2`, `-x`, `(x+1)`. */
function operandEnd(tokens: readonly Token[], start: number): number {
  let i = start;
  while (isOp(tokens[i], "-") || isOp(tokens[i], "+")) i++;
  const token = tokens[i];
  if (isOp(token, "(")) return groupEnd(tokens, i);
  if (token?.kind === "number" || (token?.kind === "name" && !CALLABLE.has(token.text))) {
    return i + 1;
  }
  return start;
}

/** End (exclusive) of the parenthesized group opening at `start`. */
function groupEnd(tokens: readonly Token[], start: number): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (isOp(tokens[i], "(")) depth++;
    else if (isOp(tokens[i], ")") && --depth === 0) return i + 1;
  }
  return tokens.length;
}

function isOp(token: Token | undefined, text: string): boolean {
  return token?.kind === "op" && token.text === text;
}

function op(text: string): Token {
  return { kind: "op", text };
}

/** Inserts `*` between adjacent values: `3x`, `2(x+1)`, `(a)(b)`, `x y`, `2 sin(x)`. */
function insertMultiplication(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    const previous = out.at(-1);
    const previousIsValue =
      previous !== undefined &&
      (previous.kind === "number" ||
        (previous.kind === "name" && !FUNCTIONS.has(previous.text)) ||
        previous.text === ")");
    const startsValue = token.kind === "number" || token.kind === "name" || token.text === "(";
    if (previousIsValue && startsValue) out.push({ kind: "op", text: "*" });
    out.push(token);
  }
  return out;
}

/** Readable strict form: spaces around binary `+`/`-`, none elsewhere. */
function render(tokens: Token[]): string {
  let out = "";
  tokens.forEach((token, i) => {
    const previous = tokens[i - 1];
    const binary =
      (token.text === "+" || token.text === "-") &&
      previous !== undefined &&
      (previous.kind !== "op" || previous.text === ")");
    out += binary ? ` ${token.text} ` : token.text;
    if (token.kind === "op" && token.text === ",") out += " ";
  });
  return out.trim();
}
