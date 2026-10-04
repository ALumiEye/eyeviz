/**
 * @alumieye/eyeviz-math
 *
 * Safe mathematical expression engine for EyeViz. This is the only package allowed to
 * import math.js; everything else depends on the interfaces exported here.
 * Expressions are parsed and evaluated by a whitelisted evaluator — never by eval()
 * or new Function(). See docs/expressions.md.
 *
 * Status: Phase 0 skeleton. Parsing and evaluation are implemented in Phase 1.
 */

/** Functions an expression may call. Trigonometric functions take radians. */
export const SUPPORTED_FUNCTIONS = [
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sqrt",
  "exp",
  "log",
  "abs",
  "min",
  "max",
  "floor",
  "ceil",
] as const;

export type SupportedFunction = (typeof SUPPORTED_FUNCTIONS)[number];

/** Named constants available in every expression. */
export const SUPPORTED_CONSTANTS = ["pi", "e"] as const;

export type SupportedConstant = (typeof SUPPORTED_CONSTANTS)[number];
