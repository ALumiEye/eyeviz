/** Pure evaluation of object models into object states. */
import type { ExpressionScope } from "@alumieye/eyeviz-math";
import type { EyeVizIssue, NumberVec3 } from "@alumieye/eyeviz-spec";
import type {
  AnchorModel,
  CurveModel,
  ImplicitModel,
  LabelModel,
  ObjectModel,
  PlaneModel,
  PointModel,
  ScalarModel,
  SurfaceModel,
  Vec3Model,
  VectorModel,
} from "./model";
import { sampleCurve, sampleImplicit, sampleSurface } from "./sampling";
import type {
  CurveState,
  ImplicitState,
  LabelState,
  ObjectState,
  PlaneState,
  PointState,
  SegmentState,
  SurfaceState,
  VectorState,
} from "./state";

/** Largest absolute value accepted for a domain bound. See docs/security.md. */
export const MAX_DOMAIN_MAGNITUDE = 1e6;

export interface EvaluationContext {
  readonly scope: ExpressionScope;
  readonly booleans: Readonly<Record<string, boolean>>;
  readonly curveSamples: number;
  /** Samples per side of a surface grid. */
  readonly surfaceSamples: number;
  /** Samples per side of an implicit curve's grid. */
  readonly implicitSamples: number;
  /** Objects hidden by the current step. */
  readonly stepHidden: ReadonlySet<string>;
  /** States evaluated so far in this pass (dependencies come first in evaluation order). */
  readonly objects: Readonly<Record<string, ObjectState>>;
}

const EMPTY: readonly EyeVizIssue[] = Object.freeze([]);
const NAN3: NumberVec3 = Object.freeze([NaN, NaN, NaN]) as NumberVec3;

interface Base {
  readonly id: string;
  readonly visible: boolean;
}

/** Evaluates a scalar outside of object evaluation (e.g. the timeline duration). */
export function evaluateStandalone(scalar: ScalarModel, scope: ExpressionScope): number {
  return evaluateScalar(scalar, scope);
}

export function evaluateObject(model: ObjectModel, context: EvaluationContext): ObjectState {
  const visible =
    !context.stepHidden.has(model.id) &&
    (model.visible.kind === "constant"
      ? model.visible.value
      : context.booleans[model.visible.id] === true);
  const base: Base = { id: model.id, visible };
  switch (model.type) {
    case "point":
      return evaluatePoint(model, base, context);
    case "segment": {
      const from = context.objects[model.from] as PointState;
      const to = context.objects[model.to] as PointState;
      const state: SegmentState = {
        ...base,
        type: "segment",
        valid: from.valid && to.valid,
        issues: EMPTY,
        from: from.position,
        to: to.position,
      };
      return Object.freeze(state);
    }
    case "vector":
      return evaluateVector(model, base, context);
    case "plane":
      return evaluatePlane(model, base, context);
    case "curve":
      return evaluateCurve(model, base, context);
    case "surface":
      return evaluateSurface(model, base, context);
    case "implicit":
      return evaluateImplicit(model, base, context);
    case "label":
      return evaluateLabel(model, base, context);
  }
}

function evaluateScalar(scalar: ScalarModel, scope: ExpressionScope): number {
  return scalar.kind === "constant" ? scalar.value : scalar.expression.evaluate(scope);
}

export function evaluateVec3(vec: Vec3Model, scope: ExpressionScope): NumberVec3 {
  return Object.freeze([
    evaluateScalar(vec[0], scope),
    evaluateScalar(vec[1], scope),
    evaluateScalar(vec[2], scope),
  ]) as NumberVec3;
}

/** Issues for the non-finite components of `vec`, reported at `path[axis]`. */
function nonFinite(vec: NumberVec3, path: string, what: string): EyeVizIssue[] {
  const issues: EyeVizIssue[] = [];
  vec.forEach((value, axis) => {
    if (!Number.isFinite(value)) {
      issues.push({
        code: "EXPRESSION_EVALUATION",
        message: `${what} is not a finite number (${String(value)}) for the current parameters`,
        path: `${path}[${axis}]`,
        details: { value: String(value) },
      });
    }
  });
  return issues;
}

/** Resolves an anchor to a position; `valid` is false if a referenced point is invalid. */
function evaluateAnchor(
  anchor: AnchorModel,
  path: string,
  what: string,
  context: EvaluationContext,
): { position: NumberVec3; valid: boolean; issues: EyeVizIssue[] } {
  if (anchor.kind === "point") {
    const point = context.objects[anchor.id] as PointState;
    return { position: point.position, valid: point.valid, issues: [] };
  }
  const position = evaluateVec3(anchor.position, context.scope);
  const issues = nonFinite(position, path, what);
  return { position, valid: issues.length === 0, issues };
}

function frozenIssues(issues: EyeVizIssue[]): readonly EyeVizIssue[] {
  return issues.length ? Object.freeze(issues) : EMPTY;
}

function evaluatePoint(model: PointModel, base: Base, context: EvaluationContext): PointState {
  const position = evaluateVec3(model.position, context.scope);
  const issues = nonFinite(
    position,
    `objects[${model.index}].position`,
    `Position of '${model.id}'`,
  );
  return Object.freeze({
    ...base,
    type: "point",
    valid: issues.length === 0,
    issues: frozenIssues(issues),
    position,
  });
}

function evaluateVector(model: VectorModel, base: Base, context: EvaluationContext): VectorState {
  const at = `objects[${model.index}]`;
  const origin = evaluateAnchor(model.origin, `${at}.origin`, `Origin of '${model.id}'`, context);
  const components = evaluateVec3(model.components, context.scope);
  const issues = [
    ...origin.issues,
    ...nonFinite(components, `${at}.components`, `Components of '${model.id}'`),
  ];
  return Object.freeze({
    ...base,
    type: "vector",
    valid: origin.valid && issues.length === 0,
    issues: frozenIssues(issues),
    origin: origin.position,
    components,
  });
}

function evaluatePlane(model: PlaneModel, base: Base, context: EvaluationContext): PlaneState {
  const at = `objects[${model.index}]`;
  const invalid = (issues: EyeVizIssue[]): PlaneState =>
    Object.freeze({
      ...base,
      type: "plane",
      valid: false,
      issues: frozenIssues(issues),
      center: NAN3,
      normal: NAN3,
    });

  let center: NumberVec3;
  let normal: number[];
  let defaultExtent: number | undefined;
  const issues: EyeVizIssue[] = [];

  if (model.form.kind === "through") {
    const points = model.form.points.map((id) => context.objects[id] as PointState);
    if (points.some((p) => !p.valid)) return invalid([]);
    const [a, b, c] = points.map((p) => p.position) as [NumberVec3, NumberVec3, NumberVec3];
    const ab = sub(b, a);
    const ac = sub(c, a);
    normal = cross(ab, ac);
    const scale = Math.max(length(ab), length(ac));
    if (length(normal) <= 1e-12 * scale * scale) {
      return invalid([
        {
          code: "EXPRESSION_EVALUATION",
          message: `Plane '${model.id}': points ${model.form.points.join(", ")} are collinear, so they do not define a plane`,
          path: `${at}.through`,
        },
      ]);
    }
    center = Object.freeze([
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ]) as NumberVec3;
    defaultExtent = 1.5 * Math.max(...[a, b, c].map((p) => length(sub(p, center))));
  } else {
    const point = evaluateAnchor(
      model.form.point,
      `${at}.point`,
      `Point of '${model.id}'`,
      context,
    );
    const n = evaluateVec3(model.form.normal, context.scope);
    issues.push(...point.issues, ...nonFinite(n, `${at}.normal`, `Normal of '${model.id}'`));
    if (!point.valid || issues.length > 0) return invalid(issues);
    if (length(n) === 0) {
      return invalid([
        {
          code: "EXPRESSION_EVALUATION",
          message: `Plane '${model.id}': the normal vector must not be zero`,
          path: `${at}.normal`,
        },
      ]);
    }
    center = point.position;
    normal = [...n];
  }

  let extent = defaultExtent;
  if (model.extent) {
    const value = evaluateScalar(model.extent, context.scope);
    if (!Number.isFinite(value) || value <= 0) {
      return invalid([
        {
          code: "EXPRESSION_EVALUATION",
          message: `Plane '${model.id}': extent must be a positive number, got ${String(value)}`,
          path: `${at}.extent`,
        },
      ]);
    }
    extent = value;
  }

  const n = length(normal);
  return Object.freeze({
    ...base,
    type: "plane",
    valid: true,
    issues: EMPTY,
    center,
    normal: Object.freeze([normal[0]! / n, normal[1]! / n, normal[2]! / n]) as NumberVec3,
    ...(extent !== undefined ? { extent } : {}),
  });
}

/** Checks a `[start, end]` domain; returns an issue if it cannot be sampled. */
function domainIssue(
  start: number,
  end: number,
  objectId: string,
  path: string,
): EyeVizIssue | undefined {
  const problem =
    !Number.isFinite(start) || !Number.isFinite(end)
      ? "is not finite"
      : start >= end
        ? "must have start < end"
        : Math.max(Math.abs(start), Math.abs(end)) > MAX_DOMAIN_MAGNITUDE
          ? `exceeds ±${MAX_DOMAIN_MAGNITUDE}`
          : undefined;
  if (!problem) return undefined;
  return {
    code: problem.startsWith("exceeds") ? "LIMIT_EXCEEDED" : "EXPRESSION_EVALUATION",
    message: `Domain [${start}, ${end}] of '${objectId}' ${problem}`,
    path,
    details: { start, end },
  };
}

function evaluateCurve(model: CurveModel, base: Base, context: EvaluationContext): CurveState {
  const state = { ...base, type: "curve" } as const;
  if (!base.visible) {
    return Object.freeze({ ...state, valid: true, issues: EMPTY, polylines: [] });
  }

  const start = evaluateScalar(model.domain[0], context.scope);
  const end = evaluateScalar(model.domain[1], context.scope);
  // An empty domain (e.g. [0, t] at t = 0) is valid: nothing to draw yet.
  if (start === end && Number.isFinite(start)) {
    return Object.freeze({ ...state, valid: true, issues: EMPTY, polylines: [] });
  }
  const issue = domainIssue(start, end, model.id, `objects[${model.index}].domain`);
  if (issue) {
    return Object.freeze({ ...state, valid: false, issues: Object.freeze([issue]), polylines: [] });
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
  return Object.freeze({ ...state, valid: polylines.length > 0, issues, polylines });
}

function evaluateSurface(
  model: SurfaceModel,
  base: Base,
  context: EvaluationContext,
): SurfaceState {
  const state = { ...base, type: "surface" } as const;
  const empty = { rows: 0, columns: 0, positions: new Float64Array(0) };
  if (!base.visible) {
    return Object.freeze({ ...state, valid: true, issues: EMPTY, ...empty });
  }

  const at = `objects[${model.index}]`;
  const [u, v] = model.variables;
  const [uStart, uEnd] = model.domain[0].map((s) => evaluateScalar(s, context.scope)) as [
    number,
    number,
  ];
  const [vStart, vEnd] = model.domain[1].map((s) => evaluateScalar(s, context.scope)) as [
    number,
    number,
  ];
  const issues = [
    domainIssue(uStart, uEnd, model.id, `${at}.domain.${u}`),
    domainIssue(vStart, vEnd, model.id, `${at}.domain.${v}`),
  ].filter((i): i is EyeVizIssue => i !== undefined);
  if (issues.length > 0) {
    return Object.freeze({ ...state, valid: false, issues: Object.freeze(issues), ...empty });
  }

  const scope: Record<string, number> = Object.assign(Object.create(null), context.scope);
  const [px, py, pz] = model.position;
  const grid = sampleSurface(
    (a, b, out) => {
      scope[u] = a;
      scope[v] = b;
      out[0] = evaluateScalar(px, scope);
      out[1] = evaluateScalar(py, scope);
      out[2] = evaluateScalar(pz, scope);
    },
    [uStart, uEnd],
    [vStart, vEnd],
    context.surfaceSamples,
  );

  if (grid.finiteCount === 0) {
    const issue: EyeVizIssue = {
      code: "EXPRESSION_EVALUATION",
      message: `Surface '${model.id}' is undefined on its whole domain`,
      path: `${at}.position`,
    };
    return Object.freeze({ ...state, valid: false, issues: Object.freeze([issue]), ...empty });
  }
  return Object.freeze({
    ...state,
    valid: true,
    issues: EMPTY,
    rows: grid.rows,
    columns: grid.columns,
    positions: grid.positions,
  });
}

function evaluateImplicit(
  model: ImplicitModel,
  base: Base,
  context: EvaluationContext,
): ImplicitState {
  const state = { ...base, type: "implicit" } as const;
  if (!base.visible) {
    return Object.freeze({ ...state, valid: true, issues: EMPTY, polylines: [] });
  }

  const at = `objects[${model.index}]`;
  const [u, v] = model.variables;
  const [uStart, uEnd] = model.domain[0].map((s) => evaluateScalar(s, context.scope)) as [
    number,
    number,
  ];
  const [vStart, vEnd] = model.domain[1].map((s) => evaluateScalar(s, context.scope)) as [
    number,
    number,
  ];
  const issues = [
    domainIssue(uStart, uEnd, model.id, `${at}.domain.${u}`),
    domainIssue(vStart, vEnd, model.id, `${at}.domain.${v}`),
  ].filter((i): i is EyeVizIssue => i !== undefined);
  if (issues.length > 0) {
    return Object.freeze({ ...state, valid: false, issues: Object.freeze(issues), polylines: [] });
  }

  const scope: Record<string, number> = Object.assign(Object.create(null), context.scope);
  const { left, right } = model;
  const { polylines, finiteCount } = sampleImplicit(
    (a, b) => {
      scope[u] = a;
      scope[v] = b;
      return evaluateScalar(left, scope) - evaluateScalar(right, scope);
    },
    [uStart, uEnd],
    [vStart, vEnd],
    context.implicitSamples,
  );

  if (finiteCount === 0) {
    const issue: EyeVizIssue = {
      code: "EXPRESSION_EVALUATION",
      message: `The equation of '${model.id}' is undefined on its whole domain`,
      path: `${at}.equation`,
    };
    return Object.freeze({ ...state, valid: false, issues: Object.freeze([issue]), polylines: [] });
  }
  // No solution in the domain (e.g. x^2 + y^2 = -1) is valid: there is nothing to draw.
  return Object.freeze({ ...state, valid: true, issues: EMPTY, polylines });
}

function evaluateLabel(model: LabelModel, base: Base, context: EvaluationContext): LabelState {
  const anchor = evaluateAnchor(
    model.at,
    `objects[${model.index}].at`,
    `Position of label '${model.id}'`,
    context,
  );
  return Object.freeze({
    ...base,
    type: "label",
    valid: anchor.valid,
    issues: frozenIssues(anchor.issues),
    text: model.text,
    position: anchor.position,
  });
}

function sub(a: NumberVec3, b: NumberVec3): NumberVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: NumberVec3, b: NumberVec3): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(v: readonly number[]): number {
  return Math.hypot(v[0] as number, v[1] as number, v[2] as number);
}
