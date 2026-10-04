/**
 * @alumieye/eyeviz-core
 *
 * The deterministic EyeViz runtime: Scene Spec → Scene Model → Scene State.
 * Renderer-agnostic — this package must never reference the DOM, WebGL, Three.js or React.
 */
import { SPEC_VERSION, type SpecVersion } from "@alumieye/eyeviz-spec";

/** Scene Specification versions this runtime can load. */
export const SUPPORTED_SPEC_VERSIONS: readonly SpecVersion[] = [SPEC_VERSION];

export { compileScene, isSceneModel, type CompileResult } from "./compile";
export {
  EyeVizEngine,
  ENGINE_LIMITS,
  type EngineOptions,
  type ParameterValues,
  type StateListener,
} from "./engine";
export { MAX_DOMAIN_MAGNITUDE } from "./evaluate";
export { sampleCurve, type CurveFunction } from "./sampling";
export type { SceneRenderer } from "./renderer";
export {
  TIME_SYMBOL,
  type BooleanParameterModel,
  type CurveModel,
  type NumberParameterModel,
  type ObjectModel,
  type ParameterModel,
  type PointModel,
  type ScalarModel,
  type SceneModel,
  type SegmentModel,
  type Vec3Model,
  type VisibilityModel,
} from "./model";
export type { CurveState, ObjectState, PointState, SceneState, SegmentState } from "./state";
export type { CompiledExpression } from "@alumieye/eyeviz-math";
