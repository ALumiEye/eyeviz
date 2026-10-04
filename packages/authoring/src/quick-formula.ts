/**
 * Turns a formula typed the way people write it ("y = 3x² − 2sin x") into a strict EyeViz
 * expression ("3*x^2 - 2*sin(x)"). This is an editor convenience: specs always store the strict
 * form (implicit multiplication stays invalid in specs — docs/adr/0002, 0013).
 */
import { compileExpression, SUPPORTED_CONSTANTS, SUPPORTED_FUNCTIONS } from "@alumieye/eyeviz-math";
import { ID_PATTERN } from "@alumieye/eyeviz-spec";

export type QuickFormulaResult =
  | {
      readonly ok: true;
      /** Strict EyeViz expression. */
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
const ALIASES: Readonly<Record<string, string>> = { ln: "log", tg: "tan" };

const SYMBOLS: readonly [RegExp, string][] = [
  [/[−–]/g, "-"],
  [/[×·⋅∙]/g, "*"],
  [/÷/g, "/"],
  [/\*\*/g, "^"],
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/π/g, "pi"],
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
 * @param input    What the user typed, e.g. `y = ax^2 + bx + c`.
 * @param known    Names already defined (parameters), so `ab` with a slider `ab` stays `ab`.
 * @param variable The graph's variable, `x` by default.
 */
export function parseQuickFormula(
  input: string,
  known: Iterable<string>,
  variable = "x",
): QuickFormulaResult {
  const knownNames = new Set([...known, variable, "t"]);
  let text = input.trim().replace(/^(y|f\s*\(\s*[a-z]\s*\))\s*=/i, "");
  for (const [pattern, replacement] of SYMBOLS) text = text.replace(pattern, replacement);
  text = absoluteBars(text);

  const tokens = expandNames(tokenize(text), knownNames);
  const withCalls = wrapBareCalls(tokens);
  const expression = render(insertMultiplication(withCalls));

  const compiled = compileExpression(expression);
  if (!compiled.ok) return { ok: false, expression, message: compiled.issue.message };
  const unknown = [...compiled.expression.symbols].filter(
    (name) => !knownNames.has(name) && ID_PATTERN.test(name) && !FUNCTIONS.has(name),
  );
  return { ok: true, expression, unknown };
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
    ...new Set([...known, ...FUNCTIONS, ...CONSTANTS, ...GREEK, ...Object.keys(ALIASES)]),
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
      FUNCTIONS.has(whole) ||
      CONSTANTS.has(whole) ||
      GREEK.includes(whole) ||
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

/** `sin x` → `sin(x)`, `sin 2x` → `sin(2*x)`, `sqrt x` → `sqrt(x)`: a function applied to the next term. */
function wrapBareCalls(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    out.push(token);
    const next = tokens[i + 1];
    if (
      token.kind !== "name" ||
      !FUNCTIONS.has(token.text) ||
      !next ||
      (next.kind === "op" && next.text === "(")
    )
      continue;
    if (next.kind === "op") continue;
    // The argument: a number, optionally followed by names (2x), or a single name (x).
    const argument: Token[] = [next];
    let j = i + 2;
    if (next.kind === "number") {
      while (tokens[j]?.kind === "name" && !FUNCTIONS.has((tokens[j] as Token).text))
        argument.push(tokens[j++] as Token);
    }
    out.push({ kind: "op", text: "(" }, ...insertMultiplication(argument), {
      kind: "op",
      text: ")",
    });
    i = j - 1;
  }
  return out;
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
