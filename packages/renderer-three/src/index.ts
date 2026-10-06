/**
 * @alumieye/eyeviz-renderer-three
 *
 * Renders evaluated EyeViz scene state with Three.js. All Three.js concepts
 * (geometries, materials, line widths, controls) live here and never leak into the
 * Scene Specification. See docs/renderer-contract.md.
 */
export { ThreeRenderer, type ThreeRendererOptions } from "./three-renderer";
export { mount, type EyeVizMount, type MountOptions } from "./mount";
export { browserScheduler, prefersReducedMotion } from "./browser";
export { SceneGraph, type Emphasis } from "./scene-graph";
export {
  computeBounds,
  defaultCameraPosition,
  formatTick,
  niceStep,
  VIEW_LIMIT,
  type Bounds,
} from "./bounds";
export {
  coordinateDecimals,
  formatCoordinates,
  formatNumber,
  nearestOnScene,
  type HoverHit,
} from "./hover";
export {
  buildGuides,
  disposeGuides,
  guideExtent,
  type GuideOptions,
  type GuideRegion,
} from "./axes";
export { PALETTES, resolveTheme, type Palette, type ThemeName, type ThemeOption } from "./theme";
