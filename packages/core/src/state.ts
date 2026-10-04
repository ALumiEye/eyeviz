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

export interface CurveState extends ObjectStateBase {
  readonly type: "curve";
  /**
   * Interleaved `x, y, z` coordinates, one array per continuous piece. Empty while the curve
   * is hidden (it is sampled when it becomes visible).
   */
  readonly polylines: readonly Float64Array[];
}

export type ObjectState = PointState | SegmentState | CurveState;

export interface SceneState {
  /** Scene time in seconds. */
  readonly time: number;
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
