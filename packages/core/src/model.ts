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
}

export interface SegmentModel extends ObjectModelBase {
  readonly type: "segment";
  readonly from: string;
  readonly to: string;
}

export interface CurveModel extends ObjectModelBase {
  readonly type: "curve";
  readonly variable: string;
  readonly domain: readonly [ScalarModel, ScalarModel];
  readonly position: Vec3Model;
}

export type ObjectModel = PointModel | SegmentModel | CurveModel;

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
  readonly camera?: CameraSpec;
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
