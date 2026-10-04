# Roadmap

EyeViz grows in small phases. Later phases are listed so that today's architecture does not
block them; they are **not commitments**.

| Phase | Theme                    | Status      |
| ----- | ------------------------ | ----------- |
| 0     | Architecture foundation  | **Done**    |
| 1     | Core vertical slice      | **Done**    |
| 2     | Mathematical primitives  | **Done**    |
| 3     | Parameters and animation | **Done**    |
| 4     | Educational interactions | **Done**    |
| 5     | Direct manipulation      | **Done**    |
| 6     | Visual authoring         | **Done**    |
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

- [x] Generated parameter controls (sliders, number inputs, toggles) — since Phase 1
- [x] `timeline` — duration (may depend on parameters), loop, autoplay
- [x] Decision: no `behaviors`; motion is expressions in `t` ([ADR-0016](adr/0016-time-driven-by-expressions.md))
- [x] `Playback` in core: play, pause, reset, seek, speed; injected frame scheduler
- [x] `mount()` returns `playback`; React `usePlayback()`; autoplay respects reduced motion
- [x] Playground timeline bar: play/pause, reset, scrubber, time readout, speed
- [x] Examples: projectile motion, harmonic oscillator

## Phase 4 — Educational interactions

- [x] `steps` with cumulative `show`/`hide`, per-step `highlight` and `focus` ([ADR-0017](adr/0017-steps.md))
- [x] `engine.setStep(i | null)`; step-derived state (`step`, `highlights`, `focus`)
- [x] Renderer emphasis (highlight + dim, not colour alone) and smooth camera focus
- [x] Object selection by click/tap: `onSelect` / `setSelection`, React `selected` / `onSelect`
- [x] Playground: steps bar (previous/next/whole scene), selection panel with "Show in spec"
- [x] Steps in the pyramid and vector-addition examples

## Phase 5 — Direct manipulation

- [x] Draggable points via `drag` parameters; constraints by parametrization ([ADR-0018](adr/0018-direct-manipulation.md))
- [x] Drag solver (scan + golden section, Levenberg–Marquardt), bounds and step snapping
- [x] Renderer drag interaction (2D plane / view-facing plane in 3D, no orbiting while dragging)
- [x] `mount()` and `<EyeVizScene>` drag by default (`draggable={false}` to disable)
- [x] Playground inspector: live values (position, length, normal…), dependencies, drag parameters
- [x] Examples: unit circle; draggable points in the triangle, sine, vectors and paraboloid examples

## Phase 6 — Visual authoring

- [x] `@alumieye/eyeviz-authoring`: serializable edit commands, consistent rename/remove,
      `SceneDocument` with coalescing undo/redo, templates ([ADR-0019](adr/0019-authoring-and-visual-editor.md))
- [x] Playground: Visual mode (object tree, "Add" menu, property forms for every object type,
      parameters, steps and scene settings; formula fields with inline errors) and JSON mode,
      synchronized two ways through the document
- [x] Bilingual UI (Vietnamese default, English)
- [x] Drag fixed points to edit their coordinates; undo/redo (buttons and keyboard)
- [x] New 2D/3D scenes, autosaved draft, stable default framing for new scenes

Not yet: object type conversion, multi-select, copy/paste, a formula palette.

## Phase 7 — Advanced STEM (exploratory)

Vector fields, calculus visualizations, linear transformations, waves, optics, optional physics.
