# EyeViz Architecture

> Status: Phase 0. This document describes the target architecture for Phase 1. Sections
> marked _Planned_ describe code that does not exist yet.

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

**Invariant:** `evaluate(model, parameters, t)` is a pure function. Identical spec,
parameters and time produce identical state (within one JavaScript runtime — see §8).

Why three layers rather than mutating the JSON: the Model is the semantic bridge for the
future visual editor, undo/redo, dependency tracking and schema migrations. UI never
synchronizes directly with JSON strings. See [ADR-0001](adr/0001-spec-model-state.md).

## 3. Packages

| Package                           | Responsibility                                                                   | May depend on                              |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `@alumieye/eyeviz-spec`           | Spec types, schema, structural + referential validation, versioning, JSON Schema | `zod` (internal only)                      |
| `@alumieye/eyeviz-math`           | Expression parsing, whitelisting, evaluation, symbol extraction                  | `mathjs` (internal only)                   |
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
   (e.g. `three` from `core`, `mathjs` from anywhere but `math`).
4. **TypeScript `lib`** — `spec`, `math` and `core` compile without DOM types, so
   `document`, `window` or `HTMLElement` cannot appear there.
5. **pnpm's strict `node_modules`** — undeclared dependencies cannot be resolved.

## 4. Scene Model (_Planned_)

```ts
interface SceneModel {
  readonly version: "0.1";
  readonly metadata: SceneMetadata;
  readonly camera: CameraModel;
  readonly parameters: ReadonlyMap<string, ParameterModel>;
  readonly objects: ReadonlyMap<string, ObjectModel>; // compiled expressions, resolved refs
  readonly order: readonly string[]; // topological evaluation order
  readonly dependents: ReadonlyMap<string, ReadonlySet<string>>; // symbol → object ids
}
```

`compileScene(input)` returns `{ ok: true, model }` or `{ ok: false, issues }`. It reports
**all** issues it can find rather than stopping at the first.

Compilation steps:

1. Structural validation (schema) — `spec`.
2. Referential validation: duplicate IDs, missing references, wrong reference types — `spec`.
3. Expression compilation and symbol validation — `core` using `math`.
4. Dependency graph construction and cycle detection — `core`.

## 5. Scene State (_Planned_)

```ts
interface SceneState {
  readonly time: number;
  readonly parameters: Readonly<Record<string, number | boolean>>; // in declared units
  readonly objects: Readonly<Record<string, ObjectState>>;
  readonly issues: readonly EyeVizIssue[]; // runtime (numerical) issues, never thrown
}

type ObjectState =
  | { type: "point"; visible: boolean; valid: boolean; position: Vec3 }
  | { type: "segment"; visible: boolean; valid: boolean; from: Vec3; to: Vec3 }
  | { type: "curve"; visible: boolean; valid: boolean; polylines: readonly Float64Array[] };
```

- **Structural sharing:** an object whose inputs did not change keeps the same state object
  identity, so renderers and React can diff by reference.
- **Curves are sampled in `core`**, not in a renderer, so every renderer draws the same
  geometry and sampling is testable without a browser. Polylines are split at non-finite
  values and suspected discontinuities. Sample density is an engine option, never a spec field.

## 6. Engine and incremental updates (_Planned_)

```ts
const engine = new EyeVizEngine(spec); // throws EyeVizError({ issues }) if invalid
engine.setParameter("theta", 60);
engine.setTime(1.5);
const state = engine.getState();
const unsubscribe = engine.subscribe((state, changed) => {
  /* changed: Set<objectId> */
});
```

`setParameter("theta")` re-evaluates only `dependents.get("theta")` and their transitive
dependents (e.g. point `P` and then segment `OP`), producing a new state snapshot and a
`changed` set. The engine never touches the DOM and runs unchanged in Node, workers and tests.

## 7. Error model (_Planned_)

All public errors are plain, serializable objects:

```ts
interface EyeVizIssue {
  code: EyeVizIssueCode;
  message: string; // human-readable, LLM-actionable
  path: string; // e.g. "objects[2].position[0]"
  details?: Record<string, unknown>;
}
```

Codes: `SCHEMA_VALIDATION`, `UNSUPPORTED_VERSION`, `DUPLICATE_ID`, `MISSING_REFERENCE`,
`INVALID_REFERENCE_TYPE`, `EXPRESSION_SYNTAX`, `UNKNOWN_SYMBOL`, `UNKNOWN_FUNCTION`,
`CIRCULAR_DEPENDENCY`, `EXPRESSION_EVALUATION`, `LIMIT_EXCEEDED`.

- Compile-time issues prevent an engine from being created.
- Runtime numerical issues (e.g. `sqrt(-1)`) never throw: the object is marked
  `valid: false` and the issue is reported in `state.issues`.
- Library exceptions (Zod, math.js) are always translated; they are never public API.

APIs that throw use one class, `EyeVizError`, which carries `issues`.

## 8. Determinism

Given identical spec, parameter values and time, the engine produces identical state.
Consequences:

- No wall-clock time, randomness or global mutable state in `core`.
- Playback (Phase 3) only ever calls `setTime(t)`; the frame clock lives in renderers/UI.
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
import { mount } from "@alumieye/eyeviz/three"; // framework-agnostic (Planned)
import { EyeVizScene } from "@alumieye/eyeviz/react"; // React (Planned)
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
