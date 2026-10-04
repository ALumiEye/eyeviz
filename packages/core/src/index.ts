/**
 * @alumieye/eyeviz-core
 *
 * The deterministic EyeViz runtime: Scene Spec → Scene Model → Scene State.
 * Renderer-agnostic — this package must never reference the DOM, WebGL, Three.js or React.
 *
 * Status: Phase 0 skeleton. The engine is implemented in Phase 1.
 */
import { SPEC_VERSION, type SpecVersion } from "@alumieye/eyeviz-spec";

/** Scene Specification versions this runtime can load. */
export const SUPPORTED_SPEC_VERSIONS: readonly SpecVersion[] = [SPEC_VERSION];
