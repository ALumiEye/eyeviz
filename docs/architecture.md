# EyeViz Architecture

> Status: Phase 1 implemented. APIs are **experimental** until the first npm release.

## 1. What EyeViz is

EyeViz turns a declarative, serializable **Scene Specification** into a deterministic,
interactive visualization:

```
Model → Scene Specification → EyeViz Core → Renderer → Interactive Scene
```

The Scene Specification and the deterministic runtime are the product. Three.js is one
renderer among possible future ones (SVG, Canvas, WebGPU, native).

EyeViz contains no AI. AI products may _generate_ Scene Specifications; EyeViz validates
and executes them like any other untrusted input.

## 2. Three layers of data

| Layer           | What it is                                                                                | Mutable?              | Owner      |
| --------------- | ----------------------------------------------------------------------------------------- | --------------------- | ---------- |
| **Scene Spec**  | Declarative JSON. Versioned, serializable, untrusted.                                     | No (input)            | Author/LLM |
| **Scene Model** | Validated, compiled semantics: parsed expressions, resolved references, dependency graph. | Replaced, not mutated | `core`     |
| **Scene State** | Evaluated values for one `(parameters, time)`: coordinates, polylines, visibility.        | Immutable snapshots   | `core`     |

```
Scene Spec ──validate──► Scene Model ──evaluate(parameters, t)──► Scene State ──► Renderer
   (JSON)    spec+core     (compiled)          core                 (values)      three/svg/…
```

**Invariant:** `evaluate(model, parameters, t, step)` is a pure function. Identical spec,
parameters and time produce identical state (within one JavaScript runtime — see §8).

Why three layers rather than mutating the JSON: the Model is the semantic bridge for the
future visual editor, undo/redo, dependency tracking and schema migrations. UI never
synchronizes directly with JSON strings. See [ADR-0001](adr/0001-spec-model-state.md).

## 3. Packages

| Package                           | Responsibility                                                                   | May depend on                              |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `@alumieye/eyeviz-spec`           | Spec types, schema, structural + referential validation, versioning, JSON Schema | `zod` (internal only)                      |
| `@alumieye/eyeviz-math`           | Expression parsing, whitelisting, evaluation, symbol extraction                  | nothing (no dependencies)                  |
| `@alumieye/eyeviz-core`           | Spec → Model compilation, parameter/time state, evaluation, sampling, events     | spec, math                                 |
| `@alumieye/eyeviz-renderer-three` | Scene State → Three.js; camera, controls, disposal                               | core, spec, `three` (peer)                 |
| `@alumieye/eyeviz-react`          | `<EyeVizScene>`, `useEyeViz()`                                                   | core, renderer-three, spec, `react` (peer) |
| `@alumieye/eyeviz`                | Single-install entry: `.` (spec + core), `./three`, `./react`                    | all of the above                           |
| `apps/playground` (private)       | Spec editor, validation panel, live preview, generated controls                  | `@alumieye/eyeviz`                         |

### Dependency direction

```
spec ─┐
      ├─► core ─► renderer-three ─► react ─► playground
math ─┘
```

Never reverse it. `spec` and `math` are independent of each other: the schema does not need
to evaluate expressions, and the expression engine does not know what a scene is.

### Enforcement

Boundaries are enforced by tooling, not convention:

1. **`scripts/boundaries.mjs`** — the single source of truth for the allowed graph.
2. **`pnpm check:boundaries`** — fails if any `package.json` declares a dependency outside it.
3. **ESLint `no-restricted-imports`** — fails if source code imports a forbidden module
   (e.g. `three` or `zod` from `core`, `react` from the renderer).
4. **TypeScript `lib`** — `spec`, `math` and `core` compile without DOM types, so
   `document`, `window` or `HTMLElement` cannot appear there.
5. **pnpm's strict `node_modules`** — undeclared dependencies cannot be resolved.

## 4. Scene Model

```ts
interface SceneModel {
  readonly version: "0.1";
  readonly metadata: SceneMetadata;
  readonly camera?: CameraSpec;
  readonly parameters: ReadonlyMap<string, ParameterModel>; // spec order, with defaults
  readonly objects: ReadonlyMap<string, ObjectModel>; // compiled expressions, resolved refs
  readonly order: readonly string[]; // topological evaluation order
  readonly dependents: ReadonlyMap<string, ReadonlySet<string>>; // symbol/object → object ids
}
```

`compileScene(input)` returns `{ ok: true, model }` or `{ ok: false, issues }`. It reports
**all** issues it can find rather than stopping at the first.

Compilation steps:

1. Structural validation (schema) — `spec`.
2. Referential validation: duplicate IDs, missing references, wrong reference types — `spec`.
3. Expression compilation and symbol validation — `core` using `math`.
4. Reserved names (`t`, `pi`, `e`, function names) — `core`.
5. Dependency graph construction and cycle detection — `core`.

Models are frozen and branded: `isSceneModel(value)` is true only for models produced by
`compileScene`, so `new EyeVizEngine(model)` can skip re-validation safely.

## 5. Scene State

```ts
interface SceneState {
  readonly time: number;
  readonly parameters: Readonly<Record<string, number | boolean>>; // in declared units
  readonly objects: Readonly<Record<string, ObjectState>>;
  readonly issues: readonly EyeVizIssue[]; // runtime (numerical) issues, never thrown
}

// Every object state also has: id, visible, valid, issues.
type ObjectState =
  | { type: "point"; position: NumberVec3 }
  | { type: "segment"; from: NumberVec3; to: NumberVec3 }
  | { type: "vector"; origin: NumberVec3; components: NumberVec3 }
  | { type: "plane"; center: NumberVec3; normal: NumberVec3; extent?: number } // unit normal
  | { type: "curve"; polylines: readonly Float64Array[] } // interleaved x, y, z
  | { type: "surface"; rows: number; columns: number; positions: Float64Array } // NaN = undefined
  | { type: "label"; text: string; position: NumberVec3 };
```

- **Structural sharing:** an object whose inputs did not change keeps the same state object
  identity, so renderers and React can diff by reference.
- **Curves are sampled in `core`**, not in a renderer, so every renderer draws the same
  geometry and sampling is testable without a browser. Polylines are split at non-finite
  values and discontinuities (a bisection test distinguishes jumps and asymptotes from steep
  but continuous curves). Sample density is an engine option, never a spec field: 256 per
  curve by default, at most 4096, and at most 100 000 per scene.
- Surfaces are sampled on a uniform grid (default 48 × 48, at most 256 × 256 and 250 000
  vertices per scene); undefined vertices are `NaN` and their cells are not drawn.
- Hidden curves and surfaces are not sampled; they are sampled when they become visible.
- `state.parameters` keeps its identity while only time changes, so UIs can subscribe cheaply.

## 6. Engine and incremental updates

```ts
const engine = new EyeVizEngine(spec); // throws EyeVizError({ issues }) if invalid
engine.getParameters(); // definitions, for generating controls
engine.setParameter("theta", 60); // clamped to [min, max]
engine.setParameters({ r: 2, theta: 45 }); // one update
engine.setTime(1.5);
engine.setStep(1); // steps: null shows the whole scene
const state = engine.getState(); // + state.duration, state.step, state.highlights, state.focus
const unsubscribe = engine.subscribe((state, changed) => {
  /* changed: Set<objectId> */
});
```

`setParameter("theta")` re-evaluates only `dependents.get("theta")` and their transitive
dependents (e.g. point `P` and then segment `OP`), producing a new state snapshot and a
`changed` set. The engine never touches the DOM and runs unchanged in Node, workers and tests.

## 7. Error model

All public errors are plain, serializable objects:

```ts
interface EyeVizIssue {
  code: EyeVizIssueCode;
  message: string; // human-readable, LLM-actionable
  path: string; // e.g. "objects[2].position[0]"
  details?: Record<string, unknown>;
}
```

Codes: `SCHEMA_VALIDATION`, `UNSUPPORTED_VERSION`, `DUPLICATE_ID`, `RESERVED_NAME`,
`MISSING_REFERENCE`, `INVALID_REFERENCE_TYPE`, `INVALID_PARAMETER`, `EXPRESSION_SYNTAX`,
`UNKNOWN_SYMBOL`, `UNKNOWN_FUNCTION`, `CIRCULAR_DEPENDENCY`, `EXPRESSION_EVALUATION`,
`LIMIT_EXCEEDED`. Unknown symbols include a "Did you mean …?" suggestion when one is close.

- Compile-time issues prevent an engine from being created.
- Runtime numerical issues (e.g. `sqrt(-1)`) never throw: the object is marked
  `valid: false` and the issue is reported in `state.issues`.
- Library exceptions (e.g. Zod) are always translated; they are never public API.

APIs that throw use one class, `EyeVizError`, which carries `issues`.

## 8. Determinism

Given identical spec, parameter values and time, the engine produces identical state.
Consequences:

- No wall-clock time, randomness or global mutable state in `core`.
- Playback only ever calls `setTime(t)`. `Playback` (in core) handles play/pause/seek/speed/loop
  and receives animation frames from an injected `FrameScheduler`, so core never touches
  `requestAnimationFrame`. `mount()` and React's `usePlayback()` supply the browser scheduler.
- The guarantee holds **within one JavaScript runtime**. Engines may differ in the last bit
  of `Math.sin` and friends, so cross-browser bit-equality is not promised.

## 9. Rendering is client-side

All computation and rendering run on the viewer's device. EyeViz requires no server and
ships as static assets. Packages are import-safe in Node/SSR environments but render nothing
there. See [ADR-0008](adr/0008-client-side-rendering.md).

## 10. Distribution

Consumers install one package and import by subpath:

```ts
import { validateSpec } from "@alumieye/eyeviz"; // renderer-neutral, ESM + CJS
import { mount } from "@alumieye/eyeviz/three"; // framework-agnostic
import { EyeVizScene } from "@alumieye/eyeviz/react"; // React
```

Individual packages are also published. All packages share one version number.
`three`, `react` and `react-dom` are peer dependencies. Zod is never exposed in public types.
See [ADR-0009](adr/0009-packaging-and-distribution.md).

## 11. Toolchain

| Concern       | Choice                                                                            |
| ------------- | --------------------------------------------------------------------------------- |
| Language      | TypeScript 6.0, strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Packages      | pnpm workspaces                                                                   |
| Library build | tsup (ESM + CJS for neutral packages, ESM for browser packages)                   |
| App build     | Vite                                                                              |
| Tests         | Vitest, resolving workspace packages from source                                  |
| Lint/format   | ESLint (flat config, typescript-eslint), Prettier                                 |
| Releases      | Changesets, fixed version group                                                   |
| Package QA    | publint, @arethetypeswrong/cli, license allowlist                                 |

During development every package resolves siblings through the `source` export condition,
so `pnpm dev` and `pnpm test` work without building. Published builds resolve against
compiled `dist/`. See [ADR-0012](adr/0012-toolchain.md).
