/** Whitelisted functions. Trigonometric functions take radians. */
interface FunctionDef {
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly fn: (...args: number[]) => number;
}

const unary = (fn: (x: number) => number): FunctionDef => ({ minArgs: 1, maxArgs: 1, fn });

export const FUNCTIONS: Readonly<Record<string, FunctionDef>> = Object.freeze({
  sin: unary(Math.sin),
  cos: unary(Math.cos),
  tan: unary(Math.tan),
  asin: unary(Math.asin),
  acos: unary(Math.acos),
  atan: unary(Math.atan),
  atan2: { minArgs: 2, maxArgs: 2, fn: (y: number, x: number) => Math.atan2(y, x) },
  sqrt: unary(Math.sqrt),
  exp: unary(Math.exp),
  log: unary(Math.log),
  abs: unary(Math.abs),
  min: { minArgs: 2, maxArgs: 8, fn: Math.min },
  max: { minArgs: 2, maxArgs: 8, fn: Math.max },
  floor: unary(Math.floor),
  ceil: unary(Math.ceil),
});

export const CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  pi: Math.PI,
  e: Math.E,
});

/** Functions an expression may call. Trigonometric functions take radians. */
export const SUPPORTED_FUNCTIONS = Object.freeze(Object.keys(FUNCTIONS)) as readonly string[];

/** Named constants available in every expression. */
export const SUPPORTED_CONSTANTS = Object.freeze(Object.keys(CONSTANTS)) as readonly string[];

export function isFunctionName(name: string): boolean {
  return Object.hasOwn(FUNCTIONS, name);
}

export function isConstantName(name: string): boolean {
  return Object.hasOwn(CONSTANTS, name);
}
