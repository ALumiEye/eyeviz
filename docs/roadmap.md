# Roadmap

EyeViz grows in small phases. Later phases are listed so that today's architecture does not
block them; they are **not commitments**.

| Phase | Theme                    | Status      |
| ----- | ------------------------ | ----------- |
| 0     | Architecture foundation  | **Done**    |
| 1     | Core vertical slice      | Next        |
| 2     | Mathematical primitives  | Planned     |
| 3     | Parameters and animation | Planned     |
| 4     | Educational interactions | Planned     |
| 5     | Direct manipulation      | Planned     |
| 6     | Visual authoring         | Planned     |
| 7     | Advanced STEM            | Exploratory |

## Phase 0 — Architecture foundation

- [x] pnpm monorepo, strict TypeScript, ESLint, Prettier, Vitest
- [x] Package skeletons with explicit boundaries (`spec`, `math`, `core`, `renderer-three`, `react`, umbrella `eyeviz`)
- [x] Boundary enforcement (dependency allowlist, restricted imports, DOM-free `lib`)
- [x] Package QA: publint, are-the-types-wrong, license allowlist
- [x] Changesets with a fixed version group
- [x] CI on GitHub Actions
- [x] Architecture docs, Scene Spec v0.1 proposal, ADRs

## Phase 1 — Core vertical slice

Goal: prove every layer with the smallest end-to-end slice.

1. **spec** — v0.1 schema, `validateSpec`, referential checks, JSON Schema export.
2. **math** — parser wrapper, whitelist, evaluator, limits, error mapping.
3. **core** — compile, dependency graph, `EyeVizEngine` (parameters, time, deg→rad), point,
   segment, curve, sampler, renderer contract.
4. **renderer-three** — points, segments, curves, axes option, themes, render-on-demand, disposal.
5. **react** — `<EyeVizScene>`, `useEyeViz()`; framework-agnostic `mount()` in renderer-three.
6. **playground** — editor, live validation with error locations, live preview, generated
   parameter controls, example selector, copy/export; invalid edits keep the last valid scene.
7. **examples** — points & segments, sine curve, helix.
8. API report (API Extractor) and bundle-size budget before the first publish.

Done when `pnpm install && pnpm dev` opens a playground that renders a spec interactively and
all success criteria in the project brief are met.

## Phase 2 — Mathematical primitives

Vector, plane, surface, labels, coordinate axes in the spec, 2D scenes. Examples: `sin(x)`,
paraboloid, vectors, 3D geometry. Optional static SVG renderer for posters/previews.
Web Component wrapper for non-React hosts.

## Phase 3 — Parameters and animation

Timeline (play/pause/reset/seek), decision on `behaviors` vs plain `t` expressions.
Examples: projectile motion, harmonic oscillator.

## Phase 4 — Educational interactions

Steps with show/hide/highlight/focus; object selection.

## Phase 5 — Direct manipulation

Draggable points, inspector support, simple constraints.

## Phase 6 — Visual authoring

Scene tree, inspector, add/remove objects, Model ↔ Spec round-tripping.

## Phase 7 — Advanced STEM (exploratory)

Vector fields, calculus visualizations, linear transformations, waves, optics, optional physics.
