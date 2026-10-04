/**
 * @alumieye/eyeviz-spec
 *
 * The EyeViz Scene Specification: types, validation, versioning and JSON Schema.
 * This package must stay free of rendering, DOM, React, Three.js and math-engine code.
 */
export { SPEC_VERSION, type SpecVersion } from "./version";
export { SPEC_LIMITS, ID_PATTERN } from "./limits";
export { EyeVizError, formatPath, type EyeVizIssue, type EyeVizIssueCode } from "./issues";
export { validateSpec, type ValidationResult } from "./validate";
export { getSceneSpecJsonSchema } from "./json-schema";
export type {
  Anchor,
  AngleUnit,
  BooleanParameterSpec,
  CameraSpec,
  CurveSpec,
  NumberParameterSpec,
  NumberVec3,
  ParameterSpec,
  PointSpec,
  Scalar,
  SceneMetadata,
  SceneObjectSpec,
  SceneObjectType,
  SceneSpec,
  SegmentSpec,
  LabelSpec,
  PlaneSpec,
  SceneSettings,
  SurfaceSpec,
  TimelineSpec,
  VectorSpec,
  Vec3,
} from "./types";
