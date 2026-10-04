/**
 * Public TypeScript types of the EyeViz Scene Specification v0.1.
 *
 * These are hand-written on purpose: the public API must not expose Zod types
 * (see docs/adr/0009-packaging-and-distribution.md). A type-level test keeps them in sync
 * with the internal schema.
 */

/** A number, or an expression string such as `"3*cos(theta)"`. */
export type Scalar = number | string;

/** A 3D vector of scalars: `[x, y, z]` in right-handed, z-up coordinates. */
export type Vec3 = readonly [Scalar, Scalar, Scalar];

/** A 3D vector of plain numbers. */
export type NumberVec3 = readonly [number, number, number];

export interface SceneMetadata {
  readonly title?: string;
  /** Plain text. Used as the textual fallback / accessible description of the scene. */
  readonly description?: string;
  /** BCP 47 language tag of the human-readable text, e.g. `"vi"` or `"en"`. */
  readonly lang?: string;
}

export interface SceneSettings {
  /** `"2d"`: the x–y plane seen from +z, rotation locked. Default `"3d"`. */
  readonly dimension?: "2d" | "3d";
  /** Show coordinate axes with ticks. Default `true`. */
  readonly axes?: boolean;
  /** Show a grid on the z = 0 plane. Default `true`. */
  readonly grid?: boolean;
}

/**
 * Playback of scene time `t`. Motion itself is written as expressions in `t`; the timeline
 * only says how a player should run time. See docs/adr/0016-time-driven-by-expressions.md.
 */
export interface TimelineSpec {
  /** Seconds. May depend on parameters (e.g. a flight time). Without it, time runs on. */
  readonly duration?: Scalar;
  /** Restart from 0 at the end. Default `false` (stop at the end). */
  readonly loop?: boolean;
  /** Start playing when shown (players respect reduced-motion preferences). Default `false`. */
  readonly autoplay?: boolean;
}

export interface CameraSpec {
  readonly position?: NumberVec3;
  readonly target?: NumberVec3;
}

export type AngleUnit = "rad" | "deg";

export interface NumberParameterSpec {
  readonly id: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Angle unit. A `"deg"` parameter is converted to radians inside expressions. */
  readonly unit?: AngleUnit;
  readonly label?: string;
  /** `false` marks a named constant that UIs should not offer as a control. Default `true`. */
  readonly interactive?: boolean;
  /** UI hint only. The engine never renders controls. */
  readonly control?: "slider" | "input";
}

export interface BooleanParameterSpec {
  readonly id: string;
  readonly value: boolean;
  readonly label?: string;
  readonly interactive?: boolean;
  /** UI hint only. The engine never renders controls. */
  readonly control?: "toggle";
}

export type ParameterSpec = NumberParameterSpec | BooleanParameterSpec;

interface ObjectSpecBase {
  readonly id: string;
  /** Human-readable name, e.g. for a scene tree or assistive technology. */
  readonly name?: string;
  /** A boolean, or the ID of a boolean parameter. Default `true`. */
  readonly visible?: boolean | string;
  /** `#rrggbb`. A presentation hint; renderers pick theme-aware defaults when absent. */
  readonly color?: string;
}

export interface PointSpec extends ObjectSpecBase {
  readonly type: "point";
  readonly position: Vec3;
  /**
   * Number parameters that dragging the point may change (1–3). The engine picks the values
   * that bring the point closest to the pointer, so the position's formula is the constraint:
   * `["r*cos(theta)", "r*sin(theta)", 0]` with `drag: ["theta"]` moves along a circle.
   * See docs/adr/0018-direct-manipulation.md.
   */
  readonly drag?: readonly string[];
}

export interface SegmentSpec extends ObjectSpecBase {
  readonly type: "segment";
  /** ID of a point. */
  readonly from: string;
  /** ID of a point. */
  readonly to: string;
}

/** A point ID, or an inline position. */
export type Anchor = string | Vec3;

export interface VectorSpec extends ObjectSpecBase {
  readonly type: "vector";
  /** Where the arrow starts. Default the origin `[0, 0, 0]`. */
  readonly origin?: Anchor;
  /** Displacement from the origin to the arrow tip. */
  readonly components: Vec3;
}

/**
 * A plane, given either `through` three points or by a `point` and a `normal`.
 * Planes are infinite; `extent` is the half-size of the square patch that is drawn
 * (default: chosen from the scene size).
 */
export interface PlaneSpec extends ObjectSpecBase {
  readonly type: "plane";
  readonly through?: readonly [string, string, string];
  readonly point?: Anchor;
  readonly normal?: Vec3;
  readonly extent?: Scalar;
}

export interface CurveSpec extends ObjectSpecBase {
  readonly type: "curve";
  /** Name of the curve's own variable, local to `position`. */
  readonly variable: string;
  /** `[start, end]` of the variable. */
  readonly domain: readonly [Scalar, Scalar];
  /** Position as a function of `variable`. */
  readonly position: Vec3;
}

/** A parametric surface `position(u, v)` for `u, v` in their domains. */
export interface SurfaceSpec extends ObjectSpecBase {
  readonly type: "surface";
  readonly variables: readonly [string, string];
  /** One `[start, end]` per variable, keyed by variable name. */
  readonly domain: Readonly<Record<string, readonly [Scalar, Scalar]>>;
  readonly position: Vec3;
}

/** Plain text shown at a point or position. Never interpreted as HTML. */
export interface LabelSpec extends ObjectSpecBase {
  readonly type: "label";
  readonly text: string;
  readonly at: Anchor;
}

export type SceneObjectSpec =
  PointSpec | SegmentSpec | VectorSpec | PlaneSpec | CurveSpec | SurfaceSpec | LabelSpec;

export type SceneObjectType = SceneObjectSpec["type"];

/**
 * One step of a step-by-step explanation. `show`/`hide` accumulate over the steps; an object
 * listed in some step's `show` stays hidden until that step. `highlight` and `focus` apply
 * to this step only. See docs/adr/0017-steps.md.
 */
export interface StepSpec {
  readonly id: string;
  readonly title?: string;
  /** Plain text explaining the step. */
  readonly description?: string;
  readonly show?: readonly string[];
  readonly hide?: readonly string[];
  /** Emphasize these objects (others are dimmed) during this step. */
  readonly highlight?: readonly string[];
  /** Frame the camera on these objects during this step. */
  readonly focus?: readonly string[];
}

export interface SceneSpec {
  readonly version: "0.1";
  readonly metadata?: SceneMetadata;
  readonly scene?: SceneSettings;
  readonly camera?: CameraSpec;
  readonly timeline?: TimelineSpec;
  readonly parameters?: readonly ParameterSpec[];
  readonly objects: readonly SceneObjectSpec[];
  readonly steps?: readonly StepSpec[];
}
