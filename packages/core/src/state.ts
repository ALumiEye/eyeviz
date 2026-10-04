/**
 * The Scene State: an immutable, evaluated snapshot for one set of parameter values and time.
 * Renderers consume only this (plus the model for static information such as colors).
 */
import type { EyeVizIssue, NumberVec3 } from "@alumieye/eyeviz-spec";

interface ObjectStateBase {
  readonly id: string;
  readonly visible: boolean;
  /** `false` when the object could not be evaluated (e.g. `sqrt(-1)`); renderers skip it. */
  readonly valid: boolean;
  readonly issues: readonly EyeVizIssue[];
}

export interface PointState extends ObjectStateBase {
  readonly type: "point";
  readonly position: NumberVec3;
}

export interface SegmentState extends ObjectStateBase {
  readonly type: "segment";
  readonly from: NumberVec3;
  readonly to: NumberVec3;
}

export interface VectorState extends ObjectStateBase {
  readonly type: "vector";
  readonly origin: NumberVec3;
  readonly components: NumberVec3;
}

export interface PlaneState extends ObjectStateBase {
  readonly type: "plane";
  readonly center: NumberVec3;
  /** Unit normal. */
  readonly normal: NumberVec3;
  /** Half-size of the drawn square patch; absent = renderer chooses from the scene size. */
  readonly extent?: number;
}

export interface CurveState extends ObjectStateBase {
  readonly type: "curve";
  /**
   * Interleaved `x, y, z` coordinates, one array per continuous piece. Empty while the curve
   * is hidden (it is sampled when it becomes visible).
   */
  readonly polylines: readonly Float64Array[];
}

export interface SurfaceState extends ObjectStateBase {
  readonly type: "surface";
  /** Grid samples along the second variable (0 while hidden). */
  readonly rows: number;
  /** Grid samples along the first variable (0 while hidden). */
  readonly columns: number;
  /** Row-major `x, y, z` per grid vertex; `NaN` where the surface is undefined. */
  readonly positions: Float64Array;
}

export interface LabelState extends ObjectStateBase {
  readonly type: "label";
  readonly text: string;
  readonly position: NumberVec3;
}

export type ObjectState =
  PointState | SegmentState | VectorState | PlaneState | CurveState | SurfaceState | LabelState;

export interface SceneState {
  /** Scene time in seconds. */
  readonly time: number;
  /** Index of the current step, or `null` for the whole scene (also when there are no steps). */
  readonly step: number | null;
  /** Objects to emphasize in the current step (renderers dim the others). */
  readonly highlights: readonly string[];
  /** Objects the camera should frame in the current step. */
  readonly focus: readonly string[];
  /** Timeline duration in seconds for the current parameters, if the scene declares one. */
  readonly duration?: number;
  /**
   * Parameter values in their declared units (a `"deg"` parameter reports degrees).
   * Keeps its identity while parameters are unchanged, so UIs can subscribe cheaply.
   */
  readonly parameters: Readonly<Record<string, number | boolean>>;
  /** Unchanged objects keep their identity between snapshots (structural sharing). */
  readonly objects: Readonly<Record<string, ObjectState>>;
  /** Runtime (numerical) issues of all objects. Never thrown. */
  readonly issues: readonly EyeVizIssue[];
}
