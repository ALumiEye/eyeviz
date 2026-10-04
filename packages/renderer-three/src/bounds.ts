import type { SceneState } from "@alumieye/eyeviz-core";
import type { NumberVec3 } from "@alumieye/eyeviz-spec";

export interface Bounds {
  readonly center: NumberVec3;
  /** Radius of the bounding sphere; at least 1 so empty or tiny scenes stay viewable. */
  readonly radius: number;
}

/** Bounding sphere of every valid point and curve in the state, plus the origin. */
export function computeBounds(state: SceneState): Bounds {
  const min = [0, 0, 0];
  const max = [0, 0, 0];
  const include = (x: number, y: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    min[0] = Math.min(min[0] as number, x);
    min[1] = Math.min(min[1] as number, y);
    min[2] = Math.min(min[2] as number, z);
    max[0] = Math.max(max[0] as number, x);
    max[1] = Math.max(max[1] as number, y);
    max[2] = Math.max(max[2] as number, z);
  };

  for (const object of Object.values(state.objects)) {
    if (!object.valid) continue;
    if (object.type === "point") include(...object.position);
    if (object.type === "curve") {
      for (const line of object.polylines) {
        for (let i = 0; i < line.length; i += 3) {
          include(line[i] as number, line[i + 1] as number, line[i + 2] as number);
        }
      }
    }
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
  return { center, radius: Math.max(1, half) };
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
