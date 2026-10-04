import * as THREE from "three";
import { formatTick, niceStep, type Bounds } from "./bounds";
import { createLabel } from "./labels";
import type { Palette } from "./theme";

export interface GuideOptions {
  readonly axes: boolean;
  readonly grid: boolean;
  readonly dimension: "2d" | "3d";
}

/** Half-length of axes and grid: covers the scene with some margin, in whole tick steps. */
export function guideExtent(bounds: Bounds): number {
  const reach = Math.max(
    1,
    ...(bounds.min && bounds.max
      ? [...bounds.min, ...bounds.max].map(Math.abs)
      : [bounds.center.map(Math.abs).reduce((a, b) => Math.max(a, b)) + bounds.radius]),
  );
  const step = niceStep(reach);
  return Math.ceil((reach * 1.1) / step) * step;
}

/**
 * Builds coordinate guides: a grid on z = 0, and axes with ticks, numbers and axis names.
 * In 2D only x and y are drawn. Everything is added to `group`; `disposeGuides` releases it.
 */
export function buildGuides(
  group: THREE.Group,
  bounds: Bounds,
  palette: Palette,
  options: GuideOptions,
): void {
  const extent = guideExtent(bounds);
  const step = niceStep(extent);

  if (options.grid) {
    const divisions = Math.min(200, Math.round((2 * extent) / step));
    const grid = new THREE.GridHelper(2 * extent, divisions, palette.gridCenter, palette.grid);
    grid.rotation.x = Math.PI / 2; // GridHelper lies in x–z; EyeViz's ground plane is x–y
    grid.position.z = -extent * 1e-4; // keep the grid just behind objects drawn on z = 0
    group.add(grid);
  }

  if (!options.axes) return;

  const axisCount = options.dimension === "2d" ? 2 : 3;
  const tickSize = extent * 0.012;
  const positions: number[] = [];
  const colors: number[] = [];
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
    push(at(-extent), at(extent), color);

    // Ticks perpendicular to the axis, in the plane that faces the viewer best.
    const across = axis === 0 ? 1 : 0;
    const tickOffset = [0, 0, 0];
    tickOffset[across] = tickSize;
    const tickOffsetNeg = tickOffset.map((v) => -v);
    for (let value = -extent; value <= extent + step / 2; value += step) {
      const rounded = Math.round(value / step) * step;
      if (rounded === 0) continue;
      push(at(rounded, tickOffsetNeg), at(rounded, tickOffset), color);
      const label = createLabel(formatTick(rounded, step), {
        color: palette.tickLabel,
        halo: palette.labelHalo,
        size: 11,
        weight: 400,
      });
      label.position.set(
        ...(at(
          rounded,
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
    name.position.set(...(at(extent) as [number, number, number]));
    group.add(name);
  }

  const origin = createLabel("O", {
    color: palette.tickLabel,
    halo: palette.labelHalo,
    size: 11,
    weight: 400,
  });
  origin.center.set(1, 0);
  group.add(origin);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true })));
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
