# Renderer Contract

> Status: implemented by `@alumieye/eyeviz-renderer-three`.

A renderer turns **Scene State** into pixels. It never reads the raw Scene Spec and never
evaluates expressions; everything it draws has already been computed by `core`. This is what
lets several renderers (Three.js today; SVG, Canvas or WebGPU later) draw the same scene.

## Interface

The contract lives in `@alumieye/eyeviz-core` and uses only renderer-neutral types:

```ts
interface SceneRenderer {
  /** Build everything for a (new) model. Called on first render and whenever the spec changes. */
  setModel(model: SceneModel, state: SceneState): void;

  /** Apply a new state. `changed` lists object IDs whose state identity changed. */
  update(state: SceneState, changed: ReadonlySet<string>): void;

  /** Release every resource. The renderer is unusable afterwards. Idempotent. */
  dispose(): void;
}
```

Mounting is renderer-specific and therefore not part of the shared interface. The Three.js
renderer takes its container in the constructor:

```ts
const renderer = new ThreeRenderer(container, { theme: "auto", axes: true, grid: true });
renderer.setModel(engine.model, engine.getState());
engine.subscribe((state, changed) => renderer.update(state, changed));
```

`mount(container, spec, options)` does exactly this and returns `{ engine, renderer, dispose }`.
It is the framework-agnostic entry point for Angular, Vue or plain HTML.

When `setModel` receives a new model (e.g. the spec was edited), the renderer keeps the
user's current camera unless the spec's `camera` changed. One WebGL context is reused for
the renderer's whole lifetime.

## Responsibilities

| Concern                                 | Owner    |
| --------------------------------------- | -------- |
| Expression evaluation                   | core     |
| Curve sampling, discontinuities         | core     |
| Object visibility (resolved boolean)    | core     |
| Converting state to geometry, materials | renderer |
| Camera, orbit controls, resizing        | renderer |
| Visual defaults, theme, line widths     | renderer |
| Frame scheduling                        | renderer |

## Three.js renderer (Phase 1)

| State     | Three.js representation                                               |
| --------- | --------------------------------------------------------------------- |
| `point`   | Small sphere with a shared geometry                                   |
| `segment` | `Line2` (screen-space width; WebGL `LineBasicMaterial` is always 1px) |
| `curve`   | One `Line2` per polyline                                              |
| axes/grid | Renderer option, not a spec field (spec support arrives in Phase 2)   |

- **Coordinates:** EyeViz is z-up. The renderer sets `camera.up = (0, 0, 1)` and keeps world
  coordinates unchanged, so no per-point conversion is needed.
- **Render on demand:** the renderer draws a frame only when state, camera or size changes.
  There is no permanent `requestAnimationFrame` loop. When the canvas is off-screen or the
  tab is hidden, rendering pauses.
- **Responsiveness:** a `ResizeObserver` keeps the canvas matched to its container; device
  pixel ratio is capped to protect low-end mobile GPUs.
- **Incremental updates:** `update()` touches only the objects in `changed`; geometries and
  materials are reused where possible.
- **Themes:** `"light" | "dark" | "auto"`. No ALumiEye branding in rendering.

## Disposal checklist

`dispose()` must release, and tests must check:

- every `BufferGeometry` and `Material` created by the renderer;
- textures (none in Phase 1, but the rule applies);
- `OrbitControls` and their DOM listeners;
- `ResizeObserver`, `IntersectionObserver`, `visibilitychange` listeners;
- any pending animation frame;
- the `WebGLRenderer` (and its context, via `forceContextLoss` where appropriate);
- the canvas element it inserted into the container.

`dispose()` is idempotent. React StrictMode mounts, unmounts and re-mounts components in
development; the React adapter relies on dispose being complete and safe to call twice.

## Testing

`SceneGraph` (state → Three.js objects, colors, updates, disposal of every geometry and
material) is unit-tested in Node without WebGL. `ThreeRenderer`'s WebGL, observer and control
lifecycle is exercised in the playground; automated browser tests are not set up yet.
Pixel-level screenshot tests are deliberately postponed.
