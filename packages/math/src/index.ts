/**
 * @alumieye/eyeviz-math
 *
 * Safe mathematical expression engine for EyeViz. This is the only package allowed to
 * import math.js; everything else depends on the interfaces exported here.
 * Expressions are parsed and evaluated by a whitelisted evaluator — never by eval()
 * or new Function(). See docs/expressions.md.
 */
export {
  compileExpression,
  EXPRESSION_LIMITS,
  type CompiledExpression,
  type ExpressionIssue,
  type ExpressionIssueCode,
  type ExpressionResult,
  type ExpressionScope,
} from "./compile";
export {
  SUPPORTED_CONSTANTS,
  SUPPORTED_FUNCTIONS,
  isConstantName,
  isFunctionName,
} from "./functions";
export { renameSymbol } from "./rename";
