/**
 * Internal Zod schema of the Scene Specification v0.1. Not exported from the package:
 * consumers use `validateSpec()`, the hand-written types and the JSON Schema.
 */
import * as z from "zod";
import { ID_PATTERN, SPEC_LIMITS } from "./limits";

const id = z
  .string()
  .max(SPEC_LIMITS.maxIdLength)
  .regex(
    ID_PATTERN,
    "IDs must start with a letter or '_' and contain only letters, digits and '_'",
  );

const expression = z.string().min(1).max(SPEC_LIMITS.maxExpressionLength);
const scalar = z.union([z.number(), expression]);
const vec3 = z.tuple([scalar, scalar, scalar]);
const numberVec3 = z.tuple([z.number(), z.number(), z.number()]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colors must be '#rrggbb' hex strings");
const label = z.string().max(SPEC_LIMITS.maxNameLength);

const metadata = z.strictObject({
  title: z.exactOptional(z.string().max(SPEC_LIMITS.maxTitleLength)),
  description: z.exactOptional(z.string().max(SPEC_LIMITS.maxDescriptionLength)),
  lang: z.exactOptional(
    z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "Expected a BCP 47 language tag"),
  ),
});

const camera = z.strictObject({
  position: z.exactOptional(numberVec3),
  target: z.exactOptional(numberVec3),
});

const numberParameter = z.strictObject({
  id,
  value: z.number(),
  min: z.exactOptional(z.number()),
  max: z.exactOptional(z.number()),
  step: z.exactOptional(z.number().positive()),
  unit: z.exactOptional(z.enum(["rad", "deg"])),
  label: z.exactOptional(label),
  interactive: z.exactOptional(z.boolean()),
  control: z.exactOptional(z.enum(["slider", "input"])),
});

const booleanParameter = z.strictObject({
  id,
  value: z.boolean(),
  label: z.exactOptional(label),
  interactive: z.exactOptional(z.boolean()),
  control: z.exactOptional(z.literal("toggle")),
});

const objectBase = {
  id,
  name: z.exactOptional(label),
  visible: z.exactOptional(z.union([z.boolean(), id])),
  color: z.exactOptional(color),
};

const point = z.strictObject({
  ...objectBase,
  type: z.literal("point"),
  position: vec3,
  drag: z.exactOptional(z.array(id).min(1).max(3)),
});

const segment = z.strictObject({ ...objectBase, type: z.literal("segment"), from: id, to: id });

const curve = z.strictObject({
  ...objectBase,
  type: z.literal("curve"),
  variable: id,
  domain: z.tuple([scalar, scalar]),
  position: vec3,
});

/** A point ID, or an inline position. */
const anchor = z.union([id, vec3]);

const vector = z.strictObject({
  ...objectBase,
  type: z.literal("vector"),
  origin: z.exactOptional(anchor),
  components: vec3,
});

// Two forms (three points, or point + normal); exactly one is enforced by validateSpec,
// because Zod cannot nest a union inside the discriminated union.
const plane = z.strictObject({
  ...objectBase,
  type: z.literal("plane"),
  through: z.exactOptional(z.tuple([id, id, id])),
  point: z.exactOptional(anchor),
  normal: z.exactOptional(vec3),
  extent: z.exactOptional(scalar),
});

const surface = z.strictObject({
  ...objectBase,
  type: z.literal("surface"),
  variables: z.tuple([id, id]),
  domain: z.record(id, z.tuple([scalar, scalar])),
  position: vec3,
});

const labelObject = z.strictObject({
  ...objectBase,
  type: z.literal("label"),
  text: z.string().min(1).max(SPEC_LIMITS.maxLabelLength),
  at: anchor,
});

export const sceneObjectSchema = z.discriminatedUnion("type", [
  point,
  segment,
  vector,
  plane,
  curve,
  surface,
  labelObject,
]);

export const parameterSchema = z.union([numberParameter, booleanParameter]);

const scene = z.strictObject({
  dimension: z.exactOptional(z.enum(["2d", "3d"])),
  axes: z.exactOptional(z.boolean()),
  grid: z.exactOptional(z.boolean()),
});

const timeline = z.strictObject({
  duration: z.exactOptional(scalar),
  loop: z.exactOptional(z.boolean()),
  autoplay: z.exactOptional(z.boolean()),
});

const idList = z.array(id).max(SPEC_LIMITS.maxObjects);

const step = z.strictObject({
  id,
  title: z.exactOptional(z.string().max(SPEC_LIMITS.maxTitleLength)),
  description: z.exactOptional(z.string().max(SPEC_LIMITS.maxDescriptionLength)),
  show: z.exactOptional(idList),
  hide: z.exactOptional(idList),
  highlight: z.exactOptional(idList),
  focus: z.exactOptional(idList),
});

export const sceneSpecSchema = z.strictObject({
  version: z.literal("0.1"),
  metadata: z.exactOptional(metadata),
  scene: z.exactOptional(scene),
  camera: z.exactOptional(camera),
  timeline: z.exactOptional(timeline),
  parameters: z.exactOptional(z.array(parameterSchema).max(SPEC_LIMITS.maxParameters)),
  objects: z.array(sceneObjectSchema).max(SPEC_LIMITS.maxObjects),
  steps: z.exactOptional(z.array(step).max(SPEC_LIMITS.maxSteps)),
});
