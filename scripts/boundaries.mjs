/**
 * Single source of truth for the EyeViz package dependency graph.
 *
 * Used by:
 *   - scripts/check-boundaries.mjs (validates every package.json)
 *   - eslint.config.js             (forbids imports outside the allowed graph)
 *
 * Dependency direction (never reverse it):
 *
 *   spec ─┐
 *         ├─► core ─► renderer-three ─► react ─► playground
 *   math ─┘
 *
 * See docs/architecture.md.
 */

/** Package directory → modules its source code and package.json may depend on. */
export const ALLOWED_DEPENDENCIES = {
  spec: ["zod"],
  math: ["mathjs"],
  core: ["@alumieye/eyeviz-spec", "@alumieye/eyeviz-math"],
  "renderer-three": ["@alumieye/eyeviz-core", "@alumieye/eyeviz-spec", "three"],
  react: [
    "@alumieye/eyeviz-core",
    "@alumieye/eyeviz-renderer-three",
    "@alumieye/eyeviz-spec",
    "react",
    "react-dom",
    // Peer only: keeps a single shared Three.js instance in host apps. Source code in
    // this package must not import Three.js directly (enforced by ESLint).
    "three",
  ],
  eyeviz: [
    "@alumieye/eyeviz-core",
    "@alumieye/eyeviz-math",
    "@alumieye/eyeviz-react",
    "@alumieye/eyeviz-renderer-three",
    "@alumieye/eyeviz-spec",
    "react",
    "react-dom",
    "three",
  ],
};

/** Modules that must never be imported from a package's source, even if installed. */
export const FORBIDDEN_IMPORTS = {
  spec: ["three", "react", "react-dom", "mathjs", "@alumieye/*"],
  math: ["three", "react", "react-dom", "zod", "@alumieye/*"],
  core: [
    "three",
    "react",
    "react-dom",
    "mathjs",
    "zod",
    "@alumieye/eyeviz-renderer-*",
    "@alumieye/eyeviz-react",
  ],
  "renderer-three": ["react", "react-dom", "mathjs", "zod", "@alumieye/eyeviz-react"],
  react: ["three", "mathjs", "zod"],
  eyeviz: ["mathjs", "zod"],
};

/** Packages whose source must not see DOM types (enforced via tsconfig `lib`). */
export const DOM_FREE_PACKAGES = ["spec", "math", "core"];
