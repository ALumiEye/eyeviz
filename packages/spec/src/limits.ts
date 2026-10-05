/** Static limits enforced while validating a spec. See docs/security.md. */
export const SPEC_LIMITS = {
  maxObjects: 1000,
  maxParameters: 100,
  maxIdLength: 64,
  maxTitleLength: 200,
  maxDescriptionLength: 2000,
  maxNameLength: 200,
  maxExpressionLength: 500,
  maxLabelLength: 200,
  maxSteps: 100,
} as const;

/** IDs are identifiers so that expressions can reference them. See docs/adr/0010-identifiers.md. */
export const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Variables of an implicit curve when the spec does not name them. */
export const DEFAULT_IMPLICIT_VARIABLES: readonly [string, string] = Object.freeze(["x", "y"]) as [
  string,
  string,
];
