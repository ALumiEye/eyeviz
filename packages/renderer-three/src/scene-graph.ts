/**
 * Translates EyeViz object states into Three.js objects. Contains no WebGL, DOM or camera
 * code, so it can be tested in Node. Owns (and disposes) every geometry and material it makes.
 */
import type {
  CurveState,
  ObjectModel,
  ObjectState,
  PointState,
  SceneModel,
  SceneState,
  SegmentState,
} from "@alumieye/eyeviz-core";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Palette } from "./theme";

/** Screen-space line widths in CSS pixels. */
const LINE_WIDTH = { segment: 3, curve: 2.5 } as const;

interface View {
  update(state: ObjectState): void;
  setColor(color: THREE.Color): void;
  setResolution(resolution: THREE.Vector2): void;
  dispose(): void;
}

export class SceneGraph {
  readonly root = new THREE.Group();

  readonly #sphere = new THREE.SphereGeometry(1, 24, 16);
  readonly #resolution = new THREE.Vector2(1, 1);
  #views = new Map<string, View>();
  #model: SceneModel | undefined;
  #palette: Palette;
  #pointRadius = 0.08;

  constructor(palette: Palette) {
    this.root.name = "eyeviz-objects";
    this.#palette = palette;
  }

  /** Rebuilds all views for a new model. */
  setModel(model: SceneModel, state: SceneState, pointRadius: number): void {
    this.#disposeViews();
    this.#model = model;
    this.#pointRadius = pointRadius;
    for (const object of model.objects.values()) {
      const view = this.#createView(object);
      this.#views.set(object.id, view);
      const objectState = state.objects[object.id];
      if (objectState) view.update(objectState);
    }
  }

  update(state: SceneState, changed: ReadonlySet<string>): void {
    for (const id of changed) {
      const objectState = state.objects[id];
      if (objectState) this.#views.get(id)?.update(objectState);
    }
  }

  setPalette(palette: Palette): void {
    this.#palette = palette;
    if (!this.#model) return;
    for (const [id, view] of this.#views) {
      const object = this.#model.objects.get(id);
      if (object) view.setColor(this.#colorOf(object));
    }
  }

  /** Line materials need the drawing-buffer size to compute screen-space widths. */
  setResolution(width: number, height: number): void {
    this.#resolution.set(width, height);
    for (const view of this.#views.values()) view.setResolution(this.#resolution);
  }

  dispose(): void {
    this.#disposeViews();
    this.#sphere.dispose();
    this.#model = undefined;
  }

  #disposeViews(): void {
    for (const view of this.#views.values()) view.dispose();
    this.#views = new Map();
    this.root.clear();
  }

  #colorOf(object: ObjectModel): THREE.Color {
    return new THREE.Color(object.color ?? this.#palette[object.type]);
  }

  #createView(object: ObjectModel): View {
    const color = this.#colorOf(object);
    switch (object.type) {
      case "point":
        return new PointView(this.root, object.id, this.#sphere, this.#pointRadius, color);
      case "segment":
        return new SegmentView(this.root, object.id, color, this.#resolution);
      case "curve":
        return new CurveView(this.root, object.id, color, this.#resolution);
    }
  }
}

class PointView implements View {
  readonly #mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;

  constructor(
    parent: THREE.Object3D,
    id: string,
    sphere: THREE.SphereGeometry,
    radius: number,
    color: THREE.Color,
  ) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0 });
    this.#mesh = new THREE.Mesh(sphere, material);
    this.#mesh.name = id;
    this.#mesh.scale.setScalar(radius);
    parent.add(this.#mesh);
  }

  update(state: ObjectState): void {
    const point = state as PointState;
    this.#mesh.visible = point.visible && point.valid;
    if (point.valid) this.#mesh.position.set(...point.position);
  }

  setColor(color: THREE.Color): void {
    this.#mesh.material.color.copy(color);
  }

  setResolution(): void {}

  dispose(): void {
    this.#mesh.removeFromParent();
    this.#mesh.material.dispose(); // the sphere geometry is shared and owned by SceneGraph
  }
}

function lineMaterial(color: THREE.Color, width: number, resolution: THREE.Vector2): LineMaterial {
  const material = new LineMaterial({ color: color.getHex(), linewidth: width, worldUnits: false });
  material.resolution.copy(resolution);
  return material;
}

class SegmentView implements View {
  readonly #line: Line2;
  readonly #geometry = new LineGeometry();
  readonly #material: LineMaterial;

  constructor(parent: THREE.Object3D, id: string, color: THREE.Color, resolution: THREE.Vector2) {
    this.#material = lineMaterial(color, LINE_WIDTH.segment, resolution);
    this.#geometry.setPositions([0, 0, 0, 0, 0, 0]);
    this.#line = new Line2(this.#geometry, this.#material);
    this.#line.name = id;
    parent.add(this.#line);
  }

  update(state: ObjectState): void {
    const segment = state as SegmentState;
    this.#line.visible = segment.visible && segment.valid;
    if (segment.valid) {
      this.#geometry.setPositions([...segment.from, ...segment.to]);
      this.#geometry.computeBoundingSphere();
    }
  }

  setColor(color: THREE.Color): void {
    this.#material.color.copy(color);
  }

  setResolution(resolution: THREE.Vector2): void {
    this.#material.resolution.copy(resolution);
  }

  dispose(): void {
    this.#line.removeFromParent();
    this.#geometry.dispose();
    this.#material.dispose();
  }
}

class CurveView implements View {
  readonly #group = new THREE.Group();
  readonly #material: LineMaterial;
  #geometries: LineGeometry[] = [];

  constructor(parent: THREE.Object3D, id: string, color: THREE.Color, resolution: THREE.Vector2) {
    this.#material = lineMaterial(color, LINE_WIDTH.curve, resolution);
    this.#group.name = id;
    parent.add(this.#group);
  }

  update(state: ObjectState): void {
    const curve = state as CurveState;
    this.#group.visible = curve.visible && curve.valid;
    this.#clear();
    for (const polyline of curve.polylines) {
      const geometry = new LineGeometry();
      geometry.setPositions(polyline as unknown as number[]);
      this.#geometries.push(geometry);
      this.#group.add(new Line2(geometry, this.#material));
    }
  }

  setColor(color: THREE.Color): void {
    this.#material.color.copy(color);
  }

  setResolution(resolution: THREE.Vector2): void {
    this.#material.resolution.copy(resolution);
  }

  dispose(): void {
    this.#clear();
    this.#group.removeFromParent();
    this.#material.dispose();
  }

  #clear(): void {
    for (const geometry of this.#geometries) geometry.dispose();
    this.#geometries = [];
    this.#group.clear();
  }
}
