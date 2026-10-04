/** Pure evaluation of object models into object states. */
import type { ExpressionScope } from "@alumieye/eyeviz-math";
import type { EyeVizIssue, NumberVec3 } from "@alumieye/eyeviz-spec";
import type { CurveModel, ObjectModel, PointModel, ScalarModel, Vec3Model } from "./model";
import { sampleCurve } from "./sampling";
import type { CurveState, ObjectState, PointState, SegmentState } from "./state";

/** Largest absolute value accepted for a curve domain bound. See docs/security.md. */
export const MAX_DOMAIN_MAGNITUDE = 1e6;

export interface EvaluationContext {
  readonly scope: ExpressionScope;
  readonly booleans: Readonly<Record<string, boolean>>;
  readonly curveSamples: number;
  /** States evaluated so far in this pass (dependencies come first in evaluation order). */
  readonly objects: Readonly<Record<string, ObjectState>>;
}

const EMPTY: readonly EyeVizIssue[] = Object.freeze([]);

export function evaluateObject(model: ObjectModel, context: EvaluationContext): ObjectState {
  const visible =
    model.visible.kind === "constant"
      ? model.visible.value
      : context.booleans[model.visible.id] === true;
  switch (model.type) {
    case "point":
      return evaluatePoint(model, visible, context);
    case "segment": {
      const from = context.objects[model.from] as PointState;
      const to = context.objects[model.to] as PointState;
      const state: SegmentState = {
        type: "segment",
        id: model.id,
        visible,
        valid: from.valid && to.valid,
        issues: EMPTY,
        from: from.position,
        to: to.position,
      };
      return Object.freeze(state);
    }
    case "curve":
      return evaluateCurve(model, visible, context);
  }
}

function evaluateScalar(scalar: ScalarModel, scope: ExpressionScope): number {
  return scalar.kind === "constant" ? scalar.value : scalar.expression.evaluate(scope);
}

function evaluatePoint(
  model: PointModel,
  visible: boolean,
  context: EvaluationContext,
): PointState {
  const issues: EyeVizIssue[] = [];
  const position = evaluateVec3(model.position, context.scope);
  position.forEach((value, axis) => {
    if (!Number.isFinite(value)) {
      issues.push({
        code: "EXPRESSION_EVALUATION",
        message: `Position of '${model.id}' is not a finite number (${String(value)}) for the current parameters`,
        path: `objects[${model.index}].position[${axis}]`,
        details: { value: String(value) },
      });
    }
  });
  return Object.freeze({
    type: "point",
    id: model.id,
    visible,
    valid: issues.length === 0,
    issues: issues.length ? Object.freeze(issues) : EMPTY,
    position,
  });
}

function evaluateVec3(vec: Vec3Model, scope: ExpressionScope): NumberVec3 {
  return Object.freeze([
    evaluateScalar(vec[0], scope),
    evaluateScalar(vec[1], scope),
    evaluateScalar(vec[2], scope),
  ]) as NumberVec3;
}

function evaluateCurve(
  model: CurveModel,
  visible: boolean,
  context: EvaluationContext,
): CurveState {
  const base = { type: "curve", id: model.id, visible } as const;
  if (!visible) {
    return Object.freeze({ ...base, valid: true, issues: EMPTY, polylines: [] });
  }

  const start = evaluateScalar(model.domain[0], context.scope);
  const end = evaluateScalar(model.domain[1], context.scope);
  const domainProblem =
    !Number.isFinite(start) || !Number.isFinite(end)
      ? "is not finite"
      : start >= end
        ? "must have start < end"
        : Math.max(Math.abs(start), Math.abs(end)) > MAX_DOMAIN_MAGNITUDE
          ? `exceeds ±${MAX_DOMAIN_MAGNITUDE}`
          : undefined;
  if (domainProblem) {
    const issue: EyeVizIssue = {
      code: domainProblem.startsWith("exceeds") ? "LIMIT_EXCEEDED" : "EXPRESSION_EVALUATION",
      message: `Domain [${start}, ${end}] of '${model.id}' ${domainProblem}`,
      path: `objects[${model.index}].domain`,
      details: { start, end },
    };
    return Object.freeze({ ...base, valid: false, issues: Object.freeze([issue]), polylines: [] });
  }

  // One scope per curve, with the local variable layered over the shared values.
  const scope: Record<string, number> = Object.assign(Object.create(null), context.scope);
  const [px, py, pz] = model.position;
  const polylines = sampleCurve(
    (u, out) => {
      scope[model.variable] = u;
      out[0] = evaluateScalar(px, scope);
      out[1] = evaluateScalar(py, scope);
      out[2] = evaluateScalar(pz, scope);
    },
    start,
    end,
    context.curveSamples,
  );

  const issues: readonly EyeVizIssue[] =
    polylines.length === 0
      ? Object.freeze([
          {
            code: "EXPRESSION_EVALUATION",
            message: `Curve '${model.id}' is undefined on its whole domain [${start}, ${end}]`,
            path: `objects[${model.index}].position`,
          },
        ])
      : EMPTY;
  return Object.freeze({ ...base, valid: polylines.length > 0, issues, polylines });
}
