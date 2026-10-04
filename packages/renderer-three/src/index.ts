/**
 * @alumieye/eyeviz-renderer-three
 *
 * Renders evaluated EyeViz scene state with Three.js. All Three.js concepts
 * (geometries, materials, line widths, controls) live here and never leak into the
 * Scene Specification. See docs/renderer-contract.md.
 */
export { ThreeRenderer, type ThreeRendererOptions } from "./three-renderer";
export { mount, type EyeVizMount, type MountOptions } from "./mount";
export { SceneGraph } from "./scene-graph";
export { computeBounds, defaultCameraPosition, type Bounds } from "./bounds";
export { PALETTES, resolveTheme, type Palette, type ThemeName, type ThemeOption } from "./theme";
