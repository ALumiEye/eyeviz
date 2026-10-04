/**
 * @alumieye/eyeviz
 *
 * Single-install entry point for EyeViz. The root entry is renderer-neutral and safe to
 * import anywhere (Node, workers, SSR). Browser renderers live in subpaths:
 *
 *   import { ... } from "@alumieye/eyeviz";            // spec + core
 *   import { ... } from "@alumieye/eyeviz/authoring";  // edit commands, undo/redo
 *   import { ... } from "@alumieye/eyeviz/three";  // Three.js renderer
 *   import { ... } from "@alumieye/eyeviz/react";  // React integration
 */
export * from "@alumieye/eyeviz-spec";
export * from "@alumieye/eyeviz-core";
