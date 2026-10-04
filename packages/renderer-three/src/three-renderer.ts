import type { SceneModel, SceneRenderer, SceneState } from "@alumieye/eyeviz-core";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { buildGuides, disposeGuides } from "./axes";
import { computeBounds, defaultCameraPosition, type Bounds } from "./bounds";
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
}

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
    this.#bounds = computeBounds(state);
    this.#graph.setModel(model, state, { scale: this.#bounds.radius });
    this.#setDimension(model.scene.dimension);
    this.#buildGuides();

    // Keep the user's view while editing a spec; reset it only for a new camera definition.
    const cameraKey = JSON.stringify([model.camera ?? null, model.scene.dimension]);
    if (cameraKey !== this.#cameraKey) {
      this.#cameraKey = cameraKey;
      this.#applyCamera();
    }

    const label = [model.metadata.title, model.metadata.description].filter(Boolean).join(". ");
    const canvas = this.#renderer.domElement;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label || "EyeViz scene");
    this.#requestRender();
  }

  update(state: SceneState, changed: ReadonlySet<string>): void {
    if (this.#disposed || changed.size === 0) return;
    this.#graph.update(state, changed);
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
      const halfWidth = Math.max(Math.abs(max[0] - target[0]), Math.abs(target[0] - min[0]), 0.5);
      const halfHeight = Math.max(Math.abs(max[1] - target[1]), Math.abs(target[1] - min[1]), 0.5);
      this.#halfHeight = Math.max(halfHeight, halfWidth / aspect) * 1.15;
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
      const moving = this.#controls.update(); // true while damping is still settling
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
