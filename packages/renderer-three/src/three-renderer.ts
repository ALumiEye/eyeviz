import type { SceneModel, SceneRenderer, SceneState } from "@alumieye/eyeviz-core";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computeBounds, defaultCameraPosition, type Bounds } from "./bounds";
import { SceneGraph } from "./scene-graph";
import { PALETTES, resolveTheme, type Palette, type ThemeOption } from "./theme";

export interface ThreeRendererOptions {
  /** Default `"auto"`: follows the user's `prefers-color-scheme`. */
  readonly theme?: ThemeOption;
  /** Draw x/y/z axes through the origin. Default `true`. */
  readonly axes?: boolean;
  /** Draw a grid on the z = 0 plane. Default `true`. */
  readonly grid?: boolean;
  /** `"theme"` (default) paints the theme background; `"transparent"` lets the page show through. */
  readonly background?: "theme" | "transparent";
  /** Upper bound for the device pixel ratio, protecting low-end GPUs. Default 2. */
  readonly maxPixelRatio?: number;
}

/**
 * Renders EyeViz scene state with Three.js into a container element.
 *
 * Renders on demand (no permanent animation loop), pauses while off-screen or in a hidden
 * tab, follows the container's size, and releases every resource in `dispose()`.
 */
export class ThreeRenderer implements SceneRenderer {
  readonly #container: HTMLElement;
  readonly #options: Required<Omit<ThreeRendererOptions, "theme">> & { theme: ThemeOption };
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  readonly #controls: OrbitControls;
  readonly #graph: SceneGraph;
  readonly #helpers = new THREE.Group();
  readonly #cleanups: (() => void)[] = [];

  #palette: Palette;
  #bounds: Bounds = { center: [0, 0, 0], radius: 1 };
  #cameraKey: string | undefined;
  #frame = 0;
  #onScreen = true;
  #disposed = false;

  constructor(container: HTMLElement, options: ThreeRendererOptions = {}) {
    this.#container = container;
    this.#options = {
      theme: options.theme ?? "auto",
      axes: options.axes ?? true,
      grid: options.grid ?? true,
      background: options.background ?? "theme",
      maxPixelRatio: options.maxPixelRatio ?? 2,
    };

    const darkQuery =
      typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
    this.#palette = PALETTES[resolveTheme(this.#options.theme, darkQuery?.matches ?? false)];
    this.#graph = new SceneGraph(this.#palette);

    this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.#renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.#options.maxPixelRatio),
    );
    const canvas = this.#renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    container.appendChild(canvas);

    // EyeViz is z-up (docs/adr/0004-coordinate-system.md).
    this.#camera.up.set(0, 0, 1);
    this.#controls = new OrbitControls(this.#camera, canvas);
    this.#controls.enableDamping = true;
    this.#controls.dampingFactor = 0.12;
    // Listeners on the controls object die with it; its DOM listeners go in controls.dispose().
    this.#controls.addEventListener("change", () => this.#requestRender());

    this.#scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, -4, 6);
    this.#scene.add(sun, this.#helpers, this.#graph.root);
    this.#applyBackground();

    const resizeObserver = new ResizeObserver(() => this.#resize());
    resizeObserver.observe(container);
    this.#cleanups.push(() => resizeObserver.disconnect());

    if (typeof IntersectionObserver === "function") {
      const intersection = new IntersectionObserver((entries) => {
        this.#onScreen = entries.some((entry) => entry.isIntersecting);
        this.#requestRender();
      });
      intersection.observe(container);
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
    const bounds = computeBounds(state);
    this.#bounds = bounds;
    this.#graph.setModel(model, state, bounds.radius * 0.022);
    this.#buildHelpers();

    // Keep the user's view while editing a spec; reset it only for a new camera definition.
    const cameraKey = JSON.stringify(model.camera ?? null);
    if (cameraKey !== this.#cameraKey) {
      this.#cameraKey = cameraKey;
      this.#applyCamera(model, bounds);
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
  resetCamera(model: SceneModel, state: SceneState): void {
    this.#applyCamera(model, computeBounds(state));
    this.#requestRender();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame) cancelAnimationFrame(this.#frame);
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#controls.dispose();
    this.#graph.dispose();
    this.#disposeHelpers();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    this.#renderer.domElement.remove();
  }

  #applyCamera(model: SceneModel, bounds: Bounds): void {
    const target = model.camera?.target ?? bounds.center;
    const position = model.camera?.position ?? defaultCameraPosition(bounds);
    this.#camera.position.set(...position);
    this.#controls.target.set(...target);
    const distance = this.#camera.position.distanceTo(this.#controls.target) || 1;
    this.#camera.near = distance / 1000;
    this.#camera.far = distance * 1000;
    this.#camera.updateProjectionMatrix();
    this.#controls.update();
  }

  #buildHelpers(): void {
    this.#disposeHelpers();
    const bounds = this.#bounds;
    const extent = Math.ceil(
      Math.max(Math.abs(bounds.center[0]), Math.abs(bounds.center[1])) + bounds.radius,
    );

    if (this.#options.grid) {
      const size = 2 * extent;
      const grid = new THREE.GridHelper(
        size,
        Math.min(size, 100),
        this.#palette.gridCenter,
        this.#palette.grid,
      );
      grid.rotation.x = Math.PI / 2; // GridHelper lies in x–z; EyeViz's ground plane is x–y
      this.#helpers.add(grid);
    }

    if (this.#options.axes) {
      const length = extent;
      const positions = [
        -length,
        0,
        0,
        length,
        0,
        0,
        0,
        -length,
        0,
        0,
        length,
        0,
        0,
        0,
        -length,
        0,
        0,
        length,
      ];
      const colors = this.#palette.axes.flatMap((hex) => {
        const c = new THREE.Color(hex);
        return [c.r, c.g, c.b, c.r, c.g, c.b];
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      this.#helpers.add(
        new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true })),
      );
    }
  }

  #disposeHelpers(): void {
    this.#helpers.traverse((object) => {
      const { geometry, material } = object as Partial<THREE.Mesh>;
      geometry?.dispose();
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.dispose();
    });
    this.#helpers.clear();
  }

  #setPalette(palette: Palette): void {
    this.#palette = palette;
    this.#graph.setPalette(palette);
    this.#applyBackground();
    this.#buildHelpers(); // helpers bake their colors into geometry
    this.#requestRender();
  }

  #applyBackground(): void {
    if (this.#options.background === "transparent") this.#renderer.setClearColor(0x000000, 0);
    else this.#renderer.setClearColor(this.#palette.background, 1);
  }

  #resize(): void {
    const width = this.#container.clientWidth;
    const height = this.#container.clientHeight;
    if (width === 0 || height === 0) return;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
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
      if (moving) this.#requestRender();
    });
  }

  #onDocument(type: string, fn: () => void): void {
    if (typeof document === "undefined") return;
    document.addEventListener(type, fn);
    this.#cleanups.push(() => document.removeEventListener(type, fn));
  }
}
