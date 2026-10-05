import * as THREE from "three";
import { formatTick, niceStep, type Bounds } from "./bounds";
import { createLabel } from "./labels";
import type { Palette } from "./theme";

export interface GuideOptions {
  readonly axes: boolean;
  readonly grid: boolean;
  readonly dimension: "2d" | "3d";
  /**
   * The area to cover and the tick step, instead of deriving them from `bounds`. 2D views use it
   * so that the grid and the numbers follow zoom and pan.
   */
  readonly region?: GuideRegion;
}

/** A box to draw guides in (z is ignored in 2D) and the spacing of grid lines and ticks. */
export interface GuideRegion {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly step: number;
}

/** At most this many grid lines per direction; a denser grid would be noise. */
const MAX_LINES = 400;

/** Half-length of axes and grid: covers the scene with some margin, in whole tick steps. */
export function guideExtent(bounds: Bounds, ticksPerHalfAxis = 5): number {
  const reach = Math.max(
    1,
    ...(bounds.min && bounds.max
      ? [...bounds.min, ...bounds.max].map(Math.abs)
      : [bounds.center.map(Math.abs).reduce((a, b) => Math.max(a, b)) + bounds.radius]),
  );
  const step = niceStep(reach, ticksPerHalfAxis);
  return Math.ceil((reach * 1.1) / step) * step;
}

/** Fewer numbers in 3D, where tick labels of three axes overlap in perspective. */
const ticksPerHalfAxis = (dimension: "2d" | "3d") => (dimension === "2d" ? 5 : 3);

/** The default region: a cube around the origin that covers `bounds`. */
function regionFor(bounds: Bounds, dimension: "2d" | "3d"): GuideRegion {
  const extent = guideExtent(bounds, ticksPerHalfAxis(dimension));
  return {
    min: [-extent, -extent, -extent],
    max: [extent, extent, extent],
    step: niceStep(extent, ticksPerHalfAxis(dimension)),
  };
}

/**
 * Builds coordinate guides: a grid on z = 0, and axes through the origin with ticks, numbers
 * and axis names. In 2D only x and y are drawn. Everything is added to `group`;
 * `disposeGuides` releases it. Returns the axis-name labels (to keep them in view).
 */
export function buildGuides(
  group: THREE.Group,
  bounds: Bounds,
  palette: Palette,
  options: GuideOptions,
): THREE.Object3D[] {
  const region = options.region ?? regionFor(bounds, options.dimension);
  const { min, max } = region;
  // Never draw more lines than can be seen: widen the step if needed.
  let step = region.step;
  while (Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / step > MAX_LINES) step *= 2;
  const multiples = (from: number, to: number) => {
    const values: number[] = [];
    for (let k = Math.ceil(from / step); k * step <= to + step * 1e-9; k++) values.push(k * step);
    return values;
  };

  if (options.grid) {
    const positions: number[] = [];
    const colors: number[] = [];
    const minor = new THREE.Color(palette.grid);
    const major = new THREE.Color(palette.gridCenter);
    // Just behind objects drawn on z = 0.
    const z = -Math.max(max[0] - min[0], max[1] - min[1]) * 1e-5;
    const line = (a: number[], b: number[], color: THREE.Color) => {
      positions.push(...a, ...b);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    };
    for (const x of multiples(min[0], max[0])) {
      line([x, min[1], z], [x, max[1], z], Math.abs(x) < step / 2 ? major : minor);
    }
    for (const y of multiples(min[1], max[1])) {
      line([min[0], y, z], [max[0], y, z], Math.abs(y) < step / 2 ? major : minor);
    }
    group.add(lineSegments(positions, colors));
  }

  if (!options.axes) return [];

  const axisCount = options.dimension === "2d" ? 2 : 3;
  const tickSize = step * 0.06;
  const positions: number[] = [];
  const colors: number[] = [];
  const names: THREE.Object3D[] = [];
  const push = (from: number[], to: number[], color: THREE.Color) => {
    positions.push(...from, ...to);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  };

  for (let axis = 0; axis < axisCount; axis++) {
    const color = new THREE.Color(palette.axes[axis] as number);
    const at = (value: number, offset: number[] = [0, 0, 0]) => {
      const p = [...offset];
      p[axis] = (p[axis] as number) + value;
      return p;
    };
    push(at(min[axis] as number), at(max[axis] as number), color);

    // Ticks perpendicular to the axis, in the plane that faces the viewer best.
    const across = axis === 0 ? 1 : 0;
    const tickOffset = [0, 0, 0];
    tickOffset[across] = tickSize;
    const tickOffsetNeg = tickOffset.map((v) => -v);
    for (const value of multiples(min[axis] as number, max[axis] as number)) {
      if (Math.abs(value) < step / 2) continue;
      push(at(value, tickOffsetNeg), at(value, tickOffset), color);
      const label = createLabel(formatTick(value, step), {
        color: palette.tickLabel,
        halo: palette.labelHalo,
        size: 11,
        weight: 400,
      });
      label.position.set(
        ...(at(
          value,
          tickOffsetNeg.map((v) => v * 2),
        ) as [number, number, number]),
      );
      label.center.set(axis === 0 ? 0.5 : 1, axis === 0 ? 0 : 0.5);
      group.add(label);
    }

    const name = createLabel(["x", "y", "z"][axis] as string, {
      color: palette.axes[axis] as number,
      halo: palette.labelHalo,
      size: 14,
      weight: 600,
    });
    name.position.set(...(at(max[axis] as number) as [number, number, number]));
    name.userData.axis = axis;
    group.add(name);
    names.push(name);
  }

  const origin = createLabel("O", {
    color: palette.tickLabel,
    halo: palette.labelHalo,
    size: 11,
    weight: 400,
  });
  origin.center.set(1, 0);
  group.add(origin);

  group.add(lineSegments(positions, colors));
  return names;
}

function lineSegments(positions: number[], colors: number[]): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
}

export function disposeGuides(group: THREE.Group): void {
  group.traverse((object) => {
    const { geometry, material } = object as Partial<THREE.Mesh>;
    geometry?.dispose();
    for (const m of Array.isArray(material) ? material : material ? [material] : []) m.dispose();
  });
  // Removing CSS2DObjects also removes their DOM elements.
  for (const child of [...group.children]) child.removeFromParent();
}
