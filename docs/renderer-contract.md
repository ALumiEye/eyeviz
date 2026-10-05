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

`mount(container, spec, options)` does exactly this and returns `{ engine, renderer, playback, dispose }`.
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

## Three.js renderer

| State      | Three.js representation                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `point`    | Small sphere (shared geometry)                                                                                  |
| `segment`  | `Line2` (screen-space width; WebGL `LineBasicMaterial` is always 1px)                                           |
| `vector`   | Arrow: cylinder shaft + cone head (shared geometries), hidden when zero-length                                  |
| `plane`    | Translucent square patch with an outline, oriented along the normal                                             |
| `curve`    | One `Line2` per polyline                                                                                        |
| `implicit` | Like `curve`: one `Line2` per polyline                                                                          |
| `surface`  | Indexed mesh with smooth normals over the defined grid cells, plus faint grid lines                             |
| `label`    | DOM text in a `CSS2DRenderer` overlay ([ADR-0014](adr/0014-labels-as-dom-text.md))                              |
| axes/grid  | From `scene.axes` / `scene.grid` (renderer options override): axes with ticks, numbers and names; grid on z = 0 |

- **Coordinates:** EyeViz is z-up. The 3D camera sets `camera.up = (0, 0, 1)` and keeps world
  coordinates unchanged, so no per-point conversion is needed.
- **2D scenes** (`scene.dimension: "2d"`) use an orthographic camera looking down at the x–y
  plane, framing the drawing's bounding rectangle. Rotation is disabled; dragging pans and the
  wheel/pinch zooms. Only the x and y axes are drawn.
- **Sizes:** world-space sizes (point radius, arrow heads, default plane extent) scale with
  the scene's bounding sphere, so small and large scenes read the same.
- **Render on demand:** a frame is drawn only when state, camera or size changes. There is no
  permanent `requestAnimationFrame` loop. When the canvas is off-screen or the tab is hidden,
  rendering pauses.
- **Responsiveness:** a `ResizeObserver` keeps canvas and label overlay matched to the
  renderer's own wrapper element; device pixel ratio is capped to protect low-end GPUs.
- **Incremental updates:** `update()` touches only the objects in `changed`; geometries and
  materials are reused where possible.
- **Themes:** `"light" | "dark" | "auto"`. No ALumiEye branding in rendering.
- **Emphasis:** objects in `state.highlights` are drawn in the highlight colour, larger
  (points, arrows) or thicker (lines); all others fade. Never colour alone.
- **Focus:** when `state.focus` changes, the camera moves smoothly (≈0.65 s, keeping the
  viewing direction) to frame those objects; instantly under reduced motion.
- **Selection:** a click/tap that is not a drag calls `onSelect(id | null)`. Points and labels
  are matched within 14 CSS px on screen (small targets), lines within 8 px, meshes and planes
  by ray casting. `setSelection(id)` emphasizes the selected object without dimming others.
  `mount()` wires the two together.
- **Dragging:** pressing a point that declares `drag` starts a drag instead of orbiting.
  While the pointer moves, `onDrag(id, target)` reports the world position on the drag plane
  (x–y in 2D; the plane through the point facing the viewer in 3D); hosts pass it to
  `engine.dragPoint`. The cursor shows `grab`/`grabbing` over draggable points.

## Disposal checklist

`dispose()` must release, and tests must check:

- every `BufferGeometry` and `Material` created by the renderer;
- textures (none in Phase 1, but the rule applies);
- `OrbitControls` and their DOM listeners;
- `ResizeObserver`, `IntersectionObserver`, `visibilitychange` listeners;
- any pending animation frame;
- the `WebGLRenderer` (and its context, via `forceContextLoss` where appropriate);
- the label overlay and its elements;
- the wrapper element (with canvas and overlay) it inserted into the container.

`dispose()` is idempotent. React StrictMode mounts, unmounts and re-mounts components in
development; the React adapter relies on dispose being complete and safe to call twice.

## Testing

`SceneGraph` (state → Three.js objects, colors, updates, disposal of every geometry and
material) is unit-tested in Node without WebGL. `ThreeRenderer`'s WebGL, observer and control
lifecycle is exercised in the playground; automated browser tests are not set up yet.
Pixel-level screenshot tests are deliberately postponed.
