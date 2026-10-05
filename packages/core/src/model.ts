/**
 * The Scene Model: validated, compiled semantics of a Scene Spec.
 * See docs/architecture.md §4 and docs/adr/0001-spec-model-state.md.
 */
import type { CompiledExpression } from "@alumieye/eyeviz-math";
import type { AngleUnit, CameraSpec, SceneMetadata } from "@alumieye/eyeviz-spec";

/** A compiled scalar: a constant or an expression ready to evaluate. */
export type ScalarModel =
  | { readonly kind: "constant"; readonly value: number }
  | { readonly kind: "expression"; readonly expression: CompiledExpression };

export type Vec3Model = readonly [ScalarModel, ScalarModel, ScalarModel];

/** A position given by a point ID, or inline. */
export type AnchorModel =
  | { readonly kind: "point"; readonly id: string }
  | { readonly kind: "position"; readonly position: Vec3Model };

export type VisibilityModel =
  | { readonly kind: "constant"; readonly value: boolean }
  | { readonly kind: "parameter"; readonly id: string };

interface ObjectModelBase {
  readonly id: string;
  /** Index of the object in the spec's `objects` array (used for issue paths). */
  readonly index: number;
  readonly name?: string;
  readonly color?: string;
  readonly visible: VisibilityModel;
  /** Parameter IDs, `t` and object IDs this object's state depends on. */
  readonly dependencies: ReadonlySet<string>;
}

export interface PointModel extends ObjectModelBase {
  readonly type: "point";
  readonly position: Vec3Model;
  /** Number parameters that dragging may change. Absent = not draggable. */
  readonly drag?: readonly string[];
}

export interface SegmentModel extends ObjectModelBase {
  readonly type: "segment";
  readonly from: string;
  readonly to: string;
}

export interface VectorModel extends ObjectModelBase {
  readonly type: "vector";
  readonly origin: AnchorModel;
  readonly components: Vec3Model;
}

export interface PlaneModel extends ObjectModelBase {
  readonly type: "plane";
  readonly form:
    | { readonly kind: "through"; readonly points: readonly [string, string, string] }
    | { readonly kind: "point-normal"; readonly point: AnchorModel; readonly normal: Vec3Model };
  readonly extent?: ScalarModel;
}

export interface CurveModel extends ObjectModelBase {
  readonly type: "curve";
  readonly variable: string;
  readonly domain: readonly [ScalarModel, ScalarModel];
  readonly position: Vec3Model;
}

export interface SurfaceModel extends ObjectModelBase {
  readonly type: "surface";
  readonly variables: readonly [string, string];
  /** Domains in the order of `variables`. */
  readonly domain: readonly [
    readonly [ScalarModel, ScalarModel],
    readonly [ScalarModel, ScalarModel],
  ];
  readonly position: Vec3Model;
}

export interface ImplicitModel extends ObjectModelBase {
  readonly type: "implicit";
  /** Horizontal and vertical variables. */
  readonly variables: readonly [string, string];
  /** Domains in the order of `variables`. */
  readonly domain: readonly [
    readonly [ScalarModel, ScalarModel],
    readonly [ScalarModel, ScalarModel],
  ];
  /** The two sides of the equation. */
  readonly left: ScalarModel;
  readonly right: ScalarModel;
}

export interface LabelModel extends ObjectModelBase {
  readonly type: "label";
  readonly text: string;
  readonly at: AnchorModel;
}

export type ObjectModel =
  | PointModel
  | SegmentModel
  | VectorModel
  | PlaneModel
  | CurveModel
  | SurfaceModel
  | ImplicitModel
  | LabelModel;

export interface TimelineModel {
  /** Seconds; may depend on parameters (never on `t`). Absent = time runs on. */
  readonly duration?: ScalarModel;
  readonly loop: boolean;
  readonly autoplay: boolean;
  /** Parameters the duration depends on. */
  readonly dependencies: ReadonlySet<string>;
}

/** A step with its cumulative visibility precomputed. See docs/adr/0017-steps.md. */
export interface StepModel {
  readonly id: string;
  readonly index: number;
  readonly title?: string;
  readonly description?: string;
  /** Objects hidden at this step (introduced by a later step, or hidden by `hide`). */
  readonly hidden: ReadonlySet<string>;
  readonly highlight: readonly string[];
  readonly focus: readonly string[];
}

/** Scene settings with defaults applied. */
export interface SceneSettingsModel {
  readonly dimension: "2d" | "3d";
  readonly axes: boolean;
  readonly grid: boolean;
}

export interface NumberParameterModel {
  readonly kind: "number";
  readonly id: string;
  readonly index: number;
  readonly defaultValue: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: AngleUnit;
  readonly label?: string;
  readonly interactive: boolean;
  readonly control?: "slider" | "input";
}

export interface BooleanParameterModel {
  readonly kind: "boolean";
  readonly id: string;
  readonly index: number;
  readonly defaultValue: boolean;
  readonly label?: string;
  readonly interactive: boolean;
  readonly control?: "toggle";
}

export type ParameterModel = NumberParameterModel | BooleanParameterModel;

export interface SceneModel {
  readonly version: "0.1";
  readonly metadata: SceneMetadata;
  readonly scene: SceneSettingsModel;
  readonly camera?: CameraSpec;
  readonly timeline?: TimelineModel;
  /** Steps in order; empty when the spec has none. */
  readonly steps: readonly StepModel[];
  /** Every object mentioned by any step (re-evaluated when the step changes). */
  readonly stepTargets: ReadonlySet<string>;
  /** True if anything depends on time `t` or a timeline is declared: offer playback. */
  readonly animated: boolean;
  /** In spec order. */
  readonly parameters: ReadonlyMap<string, ParameterModel>;
  /** In spec order. */
  readonly objects: ReadonlyMap<string, ObjectModel>;
  /** Object IDs in a valid evaluation order (dependencies first). */
  readonly order: readonly string[];
  /** Symbol or object ID → IDs of objects that depend on it directly. */
  readonly dependents: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The name of the scene-time symbol in expressions. */
export const TIME_SYMBOL = "t";
