import type { SceneModel, SceneRenderer, SceneState } from "@alumieye/eyeviz-core";
import type { NumberVec3 } from "@alumieye/eyeviz-spec";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { buildGuides, disposeGuides } from "./axes";
import { computeBounds, defaultCameraPosition, type Bounds } from "./bounds";
import { prefersReducedMotion } from "./browser";
import { SceneGraph } from "./scene-graph";
import { PALETTES, resolveTheme, type Palette, type ThemeOption } from "./theme";

export interface ThreeRendererOptions {
  /** Default `"auto"`: follows the user's `prefers-color-scheme`. */
  readonly theme?: ThemeOption;
  /** Overrides the spec's `scene.axes`. */
  readonly axes?: boolean;
  /** Overrides the spec's `scene.grid`. */
  readonly grid?: boolean;
  /** `"theme"` (default) paints the theme background; `"transparent"` lets the page show through. */
  readonly background?: "theme" | "transparent";
  /** Upper bound for the device pixel ratio, protecting low-end GPUs. Default 2. */
  readonly maxPixelRatio?: number;
  /**
   * Called when the user clicks or taps an object (its ID) or empty space (`null`).
   * The renderer does not change the selection itself; call `setSelection` to show it.
   */
  readonly onSelect?: (id: string | null) => void;
  /**
   * Called continuously while the user drags a draggable point (one with `drag` parameters),
   * with the world position under the pointer. Pass it to `engine.dragPoint(id, target)`.
   * Without this callback, points cannot be dragged.
   */
  readonly onDrag?: (id: string, target: NumberVec3) => void;
}

interface CameraTween {
  readonly start: number;
  readonly duration: number;
  readonly fromTarget: THREE.Vector3;
  readonly toTarget: THREE.Vector3;
  readonly fromPosition: THREE.Vector3;
  readonly toPosition: THREE.Vector3;
  readonly fromHalfHeight: number;
  readonly toHalfHeight: number;
}

/** Duration of the camera move when a step focuses on objects. */
const FOCUS_MS = 650;

type Dimension = "2d" | "3d";

/**
 * Renders EyeViz scene state with Three.js into a container element.
 *
 * Renders on demand (no permanent animation loop), pauses while off-screen or in a hidden
 * tab, follows the container's size, and releases every resource in `dispose()`.
 * Text (labels, tick numbers) is real DOM text in an overlay, not pixels.
 */
export class ThreeRenderer implements SceneRenderer {
  readonly #root = document.createElement("div");
  readonly #options: ThreeRendererOptions & {
    theme: ThemeOption;
    background: "theme" | "transparent";
  };
  readonly #renderer: THREE.WebGLRenderer;
  readonly #labels = new CSS2DRenderer();
  readonly #scene = new THREE.Scene();
  readonly #perspective = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  readonly #orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);
  readonly #controls: OrbitControls;
  readonly #graph: SceneGraph;
  readonly #guides = new THREE.Group();
  readonly #cleanups: (() => void)[] = [];

  #palette: Palette;
  #model: SceneModel | undefined;
  #bounds: Bounds = { center: [0, 0, 0], radius: 1 };
  #dimension: Dimension = "3d";
  #halfHeight = 1;
  #cameraKey: string | undefined;
  #state: SceneState | undefined;
  #selected: string | null = null;
  #draggable: ReadonlySet<string> = new Set();
  #tween: CameraTween | undefined;
  #frame = 0;
  #onScreen = true;
  #disposed = false;

  constructor(container: HTMLElement, options: ThreeRendererOptions = {}) {
    this.#options = {
      ...options,
      theme: options.theme ?? "auto",
      background: options.background ?? "theme",
    };

    const darkQuery =
      typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
    this.#palette = PALETTES[resolveTheme(this.#options.theme, darkQuery?.matches ?? false)];
    this.#graph = new SceneGraph(this.#palette);

    // Our own wrapper, so the host element's styles are never modified.
    Object.assign(this.#root.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });
    container.appendChild(this.#root);

    this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.#renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2),
    );
    const canvas = this.#renderer.domElement;
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      touchAction: "none",
    });
    this.#root.appendChild(canvas);
    Object.assign(this.#labels.domElement.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    this.#root.appendChild(this.#labels.domElement);

    // EyeViz is z-up (docs/adr/0004-coordinate-system.md). 2D scenes look down at x–y with y up.
    this.#perspective.up.set(0, 0, 1);
    this.#orthographic.up.set(0, 1, 0);
    this.#controls = new OrbitControls(this.#perspective, canvas);
    this.#controls.enableDamping = true;
    this.#controls.dampingFactor = 0.12;
    // Listeners on the controls object die with it; its DOM listeners go in controls.dispose().
    this.#controls.addEventListener("change", () => this.#requestRender());

    this.#scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, -4, 6);
    this.#scene.add(sun, this.#guides, this.#graph.root);
    this.#applyBackground();

    const resizeObserver = new ResizeObserver(() => this.#resize());
    resizeObserver.observe(this.#root);
    this.#cleanups.push(() => resizeObserver.disconnect());

    if (typeof IntersectionObserver === "function") {
      const intersection = new IntersectionObserver((entries) => {
        this.#onScreen = entries.some((entry) => entry.isIntersecting);
        this.#requestRender();
      });
      intersection.observe(this.#root);
      this.#cleanups.push(() => intersection.disconnect());
    }
    this.#onDocument("visibilitychange", () => this.#requestRender());
    this.#listenForClicks(canvas);

    if (darkQuery && this.#options.theme === "auto") {
      const onScheme = () => this.#setPalette(PALETTES[darkQuery.matches ? "dark" : "light"]);
      darkQuery.addEventListener("change", onScheme);
      this.#cleanups.push(() => darkQuery.removeEventListener("change", onScheme));
    }

    this.#resize();
  }

  setModel(model: SceneModel, state: SceneState): void {
    if (this.#disposed) return;
    this.#model = model;
    this.#state = state;
    this.#draggable = new Set(
      [...model.objects.values()].filter((o) => o.type === "point" && o.drag).map((o) => o.id),
    );
    this.#tween = undefined;
    this.#bounds = computeBounds(state);
    this.#graph.setModel(model, state, { scale: this.#bounds.radius });
    this.#graph.setEmphasis(state.highlights, this.#selected);
    this.#setDimension(model.scene.dimension);
    this.#buildGuides();

    // Keep the user's view while editing a spec; reset it only for a new camera definition.
    const cameraKey = JSON.stringify([model.camera ?? null, model.scene.dimension]);
    if (cameraKey !== this.#cameraKey) {
      this.#cameraKey = cameraKey;
      this.#applyCamera();
      if (state.focus.length > 0) this.#focusOn(state, false);
    }

    const label = [model.metadata.title, model.metadata.description].filter(Boolean).join(". ");
    const canvas = this.#renderer.domElement;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label || "EyeViz scene");
    this.#requestRender();
  }

  update(state: SceneState, changed: ReadonlySet<string>): void {
    if (this.#disposed) return;
    const previous = this.#state;
    this.#state = state;
    this.#graph.update(state, changed);
    if (previous?.highlights !== state.highlights)
      this.#graph.setEmphasis(state.highlights, this.#selected);
    if (previous?.focus !== state.focus && state.focus.length > 0) this.#focusOn(state, true);
    this.#requestRender();
  }

  /** Shows `id` as selected (emphasized, without dimming the rest), or clears the selection. */
  setSelection(id: string | null): void {
    if (this.#disposed || id === this.#selected) return;
    this.#selected = id;
    this.#graph.setEmphasis(this.#state?.highlights ?? [], id);
    this.#selected = this.#graph.selected;
    this.#requestRender();
  }

  /** Resets the camera to the spec's camera (or the automatic default view). */
  resetCamera(state?: SceneState): void {
    if (state) this.#bounds = computeBounds(state);
    this.#applyCamera();
    this.#requestRender();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame) cancelAnimationFrame(this.#frame);
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#controls.dispose();
    this.#graph.dispose();
    disposeGuides(this.#guides);
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    this.#root.remove();
  }

  get #camera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.#dimension === "2d" ? this.#orthographic : this.#perspective;
  }

  #setDimension(dimension: Dimension): void {
    if (dimension === this.#dimension) return;
    this.#dimension = dimension;
    this.#controls.object = this.#camera;
    this.#controls.enableRotate = dimension === "3d";
    // In 2D, a one-finger/left drag pans the drawing, like a map.
    this.#controls.mouseButtons.LEFT = dimension === "2d" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.#controls.touches.ONE = dimension === "2d" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    this.#resize();
  }

  #applyCamera(): void {
    const model = this.#model;
    const bounds = this.#bounds;
    const target = model?.camera?.target ?? bounds.center;

    if (this.#dimension === "2d") {
      const camera = this.#orthographic;
      // Frame the bounding rectangle of the drawing (with a margin), not a bounding circle.
      this.#halfHeight = this.#halfHeightFor(bounds, target);
      camera.position.set(target[0], target[1], bounds.radius * 10);
      camera.zoom = 1;
      this.#controls.target.set(target[0], target[1], 0);
      this.#updateOrthographic();
    } else {
      const camera = this.#perspective;
      camera.position.set(...(model?.camera?.position ?? defaultCameraPosition(bounds)));
      this.#controls.target.set(...target);
      const distance = camera.position.distanceTo(this.#controls.target) || 1;
      camera.near = distance / 1000;
      camera.far = distance * 1000;
      camera.updateProjectionMatrix();
    }
    this.#controls.update();
  }

  /** Moves the camera to frame the state's `focus` objects, keeping the viewing direction. */
  #focusOn(state: SceneState, animate: boolean): void {
    const bounds = computeBounds(state, new Set(state.focus));
    const target = new THREE.Vector3(...bounds.center);
    let position: THREE.Vector3;
    let halfHeight = this.#halfHeight;
    if (this.#dimension === "2d") {
      target.z = 0;
      position = new THREE.Vector3(target.x, target.y, this.#orthographic.position.z);
      halfHeight = this.#halfHeightFor(bounds, [target.x, target.y, 0]);
    } else {
      const direction = this.#perspective.position.clone().sub(this.#controls.target).normalize();
      position = target.clone().addScaledVector(direction, bounds.radius * 2.8);
    }
    const camera = this.#camera;
    const instant = !animate || prefersReducedMotion();
    this.#tween = {
      start: performance.now(),
      duration: instant ? 0 : FOCUS_MS,
      fromTarget: this.#controls.target.clone(),
      toTarget: target,
      fromPosition: camera.position.clone(),
      toPosition: position,
      fromHalfHeight: this.#halfHeight / (this.#dimension === "2d" ? this.#orthographic.zoom : 1),
      toHalfHeight: halfHeight,
    };
    if (this.#dimension === "2d") this.#orthographic.zoom = 1;
    if (instant) this.#stepTween(Infinity);
    this.#requestRender();
  }

  /** Applies the camera tween at `now`; returns true while it is still running. */
  #stepTween(now: number): boolean {
    const tween = this.#tween;
    if (!tween) return false;
    const linear = tween.duration === 0 ? 1 : Math.min(1, (now - tween.start) / tween.duration);
    const k = linear < 0.5 ? 2 * linear * linear : 1 - (-2 * linear + 2) ** 2 / 2; // ease in-out
    this.#controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    this.#camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k);
    if (this.#dimension === "2d") {
      this.#halfHeight = tween.fromHalfHeight + (tween.toHalfHeight - tween.fromHalfHeight) * k;
      this.#updateOrthographic();
    }
    if (linear >= 1) this.#tween = undefined;
    return this.#tween !== undefined;
  }

  /** Half-height of the 2D view that frames `bounds` around `target`, with a margin. */
  #halfHeightFor(bounds: Bounds, target: readonly number[]): number {
    const { width, height } = this.#size();
    const aspect = width > 0 && height > 0 ? width / height : 1;
    const min = bounds.min ?? [
      bounds.center[0] - bounds.radius,
      bounds.center[1] - bounds.radius,
      0,
    ];
    const max = bounds.max ?? [
      bounds.center[0] + bounds.radius,
      bounds.center[1] + bounds.radius,
      0,
    ];
    const tx = target[0] as number;
    const ty = target[1] as number;
    const halfWidth = Math.max(Math.abs(max[0] - tx), Math.abs(tx - min[0]), 0.5);
    const halfHeight = Math.max(Math.abs(max[1] - ty), Math.abs(ty - min[1]), 0.5);
    return Math.max(halfHeight, halfWidth / aspect) * 1.15;
  }

  /**
   * Pointer handling: pressing a draggable point drags it (the camera stays still); a short
   * press without movement elsewhere is a click that selects; any other drag orbits/pans.
   */
  #listenForClicks(canvas: HTMLCanvasElement): void {
    let down: { x: number; y: number; time: number } | undefined;
    let dragging: { id: string; plane: THREE.Plane } | undefined;

    const pointerAt = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        rect,
        ndc: new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
      };
    };
    const draggableAt = (event: PointerEvent) => {
      if (!this.#options.onDrag || this.#draggable.size === 0) return null;
      const { rect, ndc } = pointerAt(event);
      return this.#graph.pickAnchor(
        ndc,
        this.#camera,
        { width: rect.width, height: rect.height },
        this.#draggable,
      );
    };

    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      down = { x: event.clientX, y: event.clientY, time: performance.now() };
      const id = draggableAt(event);
      const anchor = id ? this.#graph.anchorOf(id) : undefined;
      if (!id || !anchor) return;
      // Drag on the plane through the point that faces the viewer (x–y plane in 2D).
      const normal =
        this.#dimension === "2d"
          ? new THREE.Vector3(0, 0, 1)
          : this.#camera.getWorldDirection(new THREE.Vector3());
      dragging = { id, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor) };
      this.#controls.enabled = false;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
    };

    const onMove = (event: PointerEvent) => {
      if (dragging) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointerAt(event).ndc, this.#camera);
        const hit = raycaster.ray.intersectPlane(dragging.plane, new THREE.Vector3());
        if (hit) this.#options.onDrag?.(dragging.id, [hit.x, hit.y, hit.z]);
        return;
      }
      if (event.buttons === 0) canvas.style.cursor = draggableAt(event) ? "grab" : "";
    };

    const onUp = (event: PointerEvent) => {
      const start = down;
      down = undefined;
      if (dragging) {
        dragging = undefined;
        this.#controls.enabled = true;
        canvas.style.cursor = "grab";
        if (canvas.hasPointerCapture(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
      }
      const onSelect = this.#options.onSelect;
      if (!start || !onSelect || !event.isPrimary) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > 5 || performance.now() - start.time > 600) return; // a drag, not a click
      const { rect, ndc } = pointerAt(event);
      onSelect(this.#graph.pick(ndc, this.#camera, { width: rect.width, height: rect.height }));
    };

    // Capture phase: runs before OrbitControls' own pointerdown, so a point drag never orbits.
    canvas.addEventListener("pointerdown", onDown, { capture: true });
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    this.#cleanups.push(() => {
      canvas.removeEventListener("pointerdown", onDown, { capture: true });
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    });
  }

  #updateOrthographic(): void {
    const { width, height } = this.#size();
    const aspect = width > 0 && height > 0 ? width / height : 1;
    const camera = this.#orthographic;
    camera.top = this.#halfHeight;
    camera.bottom = -this.#halfHeight;
    camera.left = -this.#halfHeight * aspect;
    camera.right = this.#halfHeight * aspect;
    camera.updateProjectionMatrix();
  }

  #buildGuides(): void {
    disposeGuides(this.#guides);
    const scene = this.#model?.scene;
    buildGuides(this.#guides, this.#bounds, this.#palette, {
      axes: this.#options.axes ?? scene?.axes ?? true,
      grid: this.#options.grid ?? scene?.grid ?? true,
      dimension: this.#dimension,
    });
  }

  #setPalette(palette: Palette): void {
    this.#palette = palette;
    this.#graph.setPalette(palette);
    this.#applyBackground();
    this.#buildGuides(); // guides bake their colors into geometry
    this.#requestRender();
  }

  #applyBackground(): void {
    if (this.#options.background === "transparent") this.#renderer.setClearColor(0x000000, 0);
    else this.#renderer.setClearColor(this.#palette.background, 1);
  }

  #size(): { width: number; height: number } {
    return { width: this.#root.clientWidth, height: this.#root.clientHeight };
  }

  #resize(): void {
    const { width, height } = this.#size();
    if (width === 0 || height === 0) return;
    this.#renderer.setSize(width, height, false);
    this.#labels.setSize(width, height);
    this.#perspective.aspect = width / height;
    this.#perspective.updateProjectionMatrix();
    this.#updateOrthographic();
    const buffer = this.#renderer.getDrawingBufferSize(new THREE.Vector2());
    this.#graph.setResolution(buffer.x, buffer.y);
    this.#requestRender();
  }

  #requestRender(): void {
    if (this.#disposed || this.#frame) return;
    if (!this.#onScreen || (typeof document !== "undefined" && document.hidden)) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      const tweening = this.#stepTween(performance.now());
      const moving = this.#controls.update() || tweening; // damping still settling, or a focus move
      this.#renderer.render(this.#scene, this.#camera);
      this.#labels.render(this.#scene, this.#camera);
      if (moving) this.#requestRender();
    });
  }

  #onDocument(type: string, fn: () => void): void {
    if (typeof document === "undefined") return;
    document.addEventListener(type, fn);
    this.#cleanups.push(() => document.removeEventListener(type, fn));
  }
}
