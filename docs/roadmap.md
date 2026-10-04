# Roadmap

EyeViz grows in small phases. Later phases are listed so that today's architecture does not
block them; they are **not commitments**.

| Phase | Theme                    | Status      |
| ----- | ------------------------ | ----------- |
| 0     | Architecture foundation  | **Done**    |
| 1     | Core vertical slice      | **Done**    |
| 2     | Mathematical primitives  | **Done**    |
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

- [x] **spec** — v0.1 schema, `validateSpec`, referential checks, JSON Schema export
- [x] **math** — whitelisted parser and evaluator, limits, error mapping
- [x] **core** — `compileScene`, dependency graph, `EyeVizEngine` (parameters, time,
      deg→rad, incremental updates), point, segment, curve, discontinuity-aware sampler,
      renderer contract
- [x] **renderer-three** — points, segments, curves, axes/grid, light/dark themes,
      render-on-demand, disposal; framework-agnostic `mount()`
- [x] **react** — `<EyeVizScene>` (lazy Three.js, SSR-safe), `useEyeViz()`, `useEyeVizState()`
- [x] **playground** — Monaco editor with schema autocomplete and inline issues, validation
      panel with locations, live preview that keeps the last valid scene, generated controls,
      example selector, format/copy/download, responsive layout
- [x] **examples** — points & segments, sine curve, helix (compiled by a core test)

Before the first npm publish:

- [x] Replace the math.js parser with a hand-written one: runtime ≈127 kB → ≈37 kB gzip
      ([ADR-0013](adr/0013-hand-written-expression-parser.md))
- [ ] API report (API Extractor) and bundle-size budget in CI
- [ ] Automated browser test for the Three.js renderer lifecycle

## Phase 2 — Mathematical primitives

- [x] `label` — DOM text anchored to a point or position
- [x] `scene` — `dimension` (`"2d"` orthographic / `"3d"`), `axes` with ticks and numbers, `grid`
- [x] `vector` — arrow from an origin (point or position) with components
- [x] `plane` — through three points, or point + normal; collinear points reported
- [x] `surface` — parametric `position(u, v)` sampled on a grid; undefined regions skipped
- [x] Examples: sine graph (2D), vector addition (2D), square pyramid with a plane, paraboloid

Deferred (not needed yet): static SVG renderer, Web Component wrapper, surface
discontinuity detection.

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
