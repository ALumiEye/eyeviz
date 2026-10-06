import type { SceneState } from "@alumieye/eyeviz-core";
import type { NumberVec3 } from "@alumieye/eyeviz-spec";

export interface Bounds {
  /** Axis-aligned box of the scene (always includes the origin). */
  readonly min?: NumberVec3;
  readonly max?: NumberVec3;
  readonly center: NumberVec3;
  /** Radius of the bounding sphere; at least 1 so empty or tiny scenes stay viewable. */
  readonly radius: number;
}

/**
 * Coordinates beyond ±this are framed as if they stopped here. A graph like y = eˣ on
 * [−50, 50] reaches 10²¹; framing all of it would show nothing else.
 */
export const VIEW_LIMIT = 1e4;

const clampView = (v: number) => Math.max(-VIEW_LIMIT, Math.min(VIEW_LIMIT, v));

/**
 * Bounding box and sphere of the valid objects in the state — all of them plus the origin, or
 * only the objects in `only` (used to focus the camera on a step's objects).
 *
 * In 2D, curves are framed like graphs on paper: across their whole x range, but vertically
 * only within the frame's width (at least 10) of their typical height, so a steep part
 * (y = x⁵, y = eˣ) runs off the top instead of shrinking everything else to a dot.
 */
export function computeBounds(
  state: SceneState,
  only?: ReadonlySet<string>,
  dimension: "2d" | "3d" = "3d",
): Bounds {
  const min = only ? [Infinity, Infinity, Infinity] : [0, 0, 0];
  const max = only ? [-Infinity, -Infinity, -Infinity] : [0, 0, 0];
  const include = (x: number, y: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    x = clampView(x);
    y = clampView(y);
    z = clampView(z);
    min[0] = Math.min(min[0] as number, x);
    min[1] = Math.min(min[1] as number, y);
    min[2] = Math.min(min[2] as number, z);
    max[0] = Math.max(max[0] as number, x);
    max[1] = Math.max(max[1] as number, y);
    max[2] = Math.max(max[2] as number, z);
  };

  const includeAll = (values: Float64Array) => {
    for (let i = 0; i < values.length; i += 3) {
      include(values[i] as number, values[i + 1] as number, values[i + 2] as number);
    }
  };

  // 2D curves are included after everything else, once the frame's width is known.
  const graphs: (readonly Float64Array[])[] = [];

  for (const object of Object.values(state.objects)) {
    if (!object.valid || (only && !only.has(object.id))) continue;
    switch (object.type) {
      case "point":
      case "label":
        include(...object.position);
        break;
      case "vector": {
        const [ox, oy, oz] = object.origin;
        const [cx, cy, cz] = object.components;
        include(ox, oy, oz);
        include(ox + cx, oy + cy, oz + cz);
        break;
      }
      case "plane":
        include(...object.center);
        break;
      case "curve":
      case "implicit":
        if (dimension === "2d") graphs.push(object.polylines);
        else for (const line of object.polylines) includeAll(line);
        break;
      case "surface":
        includeAll(object.positions);
        break;
      case "segment":
        // Its endpoints are points, which are included anyway — unless only some objects count.
        if (only) {
          include(...object.from);
          include(...object.to);
        }
        break;
    }
  }

  if (graphs.length > 0) includeGraphs(graphs, include, min, max);

  if (!Number.isFinite(min[0] as number)) return { center: [0, 0, 0], radius: 1 };
  // Nothing but the origin (e.g. a new, empty scene): frame a comfortable ±5 so that objects
  // added next are on screen.
  if (!only && min.every((v, i) => v === max[i])) {
    return { min: [-5, -5, -5], max: [5, 5, 5], center: [0, 0, 0], radius: 5 };
  }

  const center: NumberVec3 = [
    ((min[0] as number) + (max[0] as number)) / 2,
    ((min[1] as number) + (max[1] as number)) / 2,
    ((min[2] as number) + (max[2] as number)) / 2,
  ];
  const half =
    Math.hypot(
      (max[0] as number) - (min[0] as number),
      (max[1] as number) - (min[1] as number),
      (max[2] as number) - (min[2] as number),
    ) / 2;
  return {
    min: [min[0] as number, min[1] as number, min[2] as number],
    max: [max[0] as number, max[1] as number, max[2] as number],
    center,
    radius: Math.max(1, half),
  };
}

/** A three-quarter view from the front-right, looking at the scene center (z up). */
export function defaultCameraPosition(bounds: Bounds): NumberVec3 {
  const direction = [0.55, -0.85, 0.55];
  const length = Math.hypot(...direction);
  const distance = bounds.radius * 2.8;
  return [
    bounds.center[0] + ((direction[0] as number) / length) * distance,
    bounds.center[1] + ((direction[1] as number) / length) * distance,
    bounds.center[2] + ((direction[2] as number) / length) * distance,
  ];
}

/** A "nice" tick spacing (1, 2 or 5 × 10ⁿ) giving about `target` ticks over `extent`. */
export function niceStep(extent: number, target = 5): number {
  const raw = Math.max(extent, 1e-9) / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return nice * magnitude;
}

/** Formats a tick value without floating-point noise (e.g. 0.30000000000000004 → "0.3"). */
export function formatTick(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const text = value.toFixed(decimals);
  return text === "-0" ? "0" : text.replace("-", "−");
}

/**
 * Includes 2D graphs the way a graph on paper is framed: the window's height is about its
 * width (at least 10), centred on each graph's median height, and the parts of a graph outside
 * that window count neither vertically nor horizontally. A few passes let width and height
 * settle (y = x⁵ on [−50, 50] beside y = sin x frames the region near the origin).
 */
function includeGraphs(
  graphs: readonly (readonly Float64Array[])[],
  include: (x: number, y: number, z: number) => void,
  min: number[],
  max: number[],
): void {
  const medians = graphs.map((lines) => {
    const ys: number[] = [];
    for (const line of lines) for (let i = 1; i < line.length; i += 3) ys.push(line[i] as number);
    ys.sort((a, b) => a - b);
    return ys.length > 0 ? (ys[Math.floor(ys.length / 2)] as number) : NaN;
  });
  // Horizontal extent of everything but the graphs, then of the graphs' visible parts.
  const baseLeft = min[0] as number;
  const baseRight = max[0] as number;
  const extentWithin = (reach: number) => {
    let left = baseLeft;
    let right = baseRight;
    graphs.forEach((lines, g) => {
      for (const line of lines) {
        for (let i = 0; i < line.length; i += 3) {
          if (Math.abs((line[i + 1] as number) - (medians[g] as number)) > reach) continue;
          left = Math.min(left, clampView(line[i] as number));
          right = Math.max(right, clampView(line[i] as number));
        }
      }
    });
    return Number.isFinite(right - left) ? right - left : 0;
  };

  let reach = Math.max(10, extentWithin(Infinity));
  for (let pass = 0; pass < 3; pass++) reach = Math.max(10, extentWithin(reach));

  graphs.forEach((lines, g) => {
    for (const line of lines) {
      for (let i = 0; i < line.length; i += 3) {
        if (Math.abs((line[i + 1] as number) - (medians[g] as number)) > reach) continue;
        include(line[i] as number, line[i + 1] as number, line[i + 2] as number);
      }
    }
  });
}
