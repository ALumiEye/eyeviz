/**
 * @alumieye/eyeviz-spec
 *
 * The EyeViz Scene Specification: types, schema, validation and versioning.
 * This package must stay free of rendering, DOM, React, Three.js and math-engine code.
 *
 * Status: Phase 0 skeleton. The V0.1 schema is specified in docs/scene-spec.md and
 * is implemented in Phase 1.
 */

/** The Scene Specification version this package understands. */
export const SPEC_VERSION = "0.1" as const;

export type SpecVersion = typeof SPEC_VERSION;
