import type { SceneState } from "@alumieye/eyeviz-core";
import type { NumberVec3 } from "@alumieye/eyeviz-spec";

/** What lies under the pointer in a 2D view: an object and the point on it. */
export interface HoverHit {
  readonly id: string;
  readonly position: NumberVec3;
}

/**
 * The point of a visible 2D object nearest to `at` (x, y), within `tolerance` world units:
 * a point object, or the nearest point on a graph (curve or implicit curve). Points win over
 * graphs passing near them. Positions on graphs are interpolated between samples.
 */
export function nearestOnScene(
  state: SceneState,
  at: readonly [number, number],
  tolerance: number,
): HoverHit | null {
  const [px, py] = at;
  let best: HoverHit | null = null;
  let bestDistance = tolerance;

  for (const object of Object.values(state.objects)) {
    if (!object.visible || !object.valid || object.type !== "point") continue;
    const [x, y] = object.position;
    const distance = Math.hypot(x - px, y - py);
    if (distance <= bestDistance) {
      best = { id: object.id, position: object.position };
      bestDistance = distance;
    }
  }
  if (best) return best;

  for (const object of Object.values(state.objects)) {
    if (!object.visible || !object.valid) continue;
    if (object.type !== "curve" && object.type !== "implicit") continue;
    for (const line of object.polylines) {
      for (let i = 3; i < line.length; i += 3) {
        const ax = line[i - 3] as number;
        const ay = line[i - 2] as number;
        const bx = line[i] as number;
        const by = line[i + 1] as number;
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSq = dx * dx + dy * dy;
        const t =
          lengthSq === 0
            ? 0
            : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
        const x = ax + dx * t;
        const y = ay + dy * t;
        const distance = Math.hypot(x - px, y - py);
        if (distance < bestDistance) {
          const az = line[i - 1] as number;
          const bz = line[i + 2] as number;
          best = { id: object.id, position: [x, y, az + (bz - az) * t] };
          bestDistance = distance;
        }
      }
    }
  }
  return best;
}

/** Decimals that show a position to about one pixel (`worldPerPixel` world units). */
export function coordinateDecimals(worldPerPixel: number): number {
  return Math.max(0, Math.min(6, Math.ceil(-Math.log10(worldPerPixel * 2))));
}

/** Default coordinate text: `(1.25, −0.5)`. Trailing zeros are dropped. */
export function formatCoordinates(position: NumberVec3, decimals: number): string {
  const [x, y] = position;
  return `(${formatNumber(x, decimals)}, ${formatNumber(y, decimals)})`;
}

/** `1.50` → `1.5`, `-0` → `0`, with a real minus sign. */
export function formatNumber(value: number, decimals: number): string {
  let text = value.toFixed(decimals);
  if (text.includes(".")) text = text.replace(/\.?0+$/, "");
  if (/^-0$/.test(text)) return "0";
  return text.replace("-", "−");
}
