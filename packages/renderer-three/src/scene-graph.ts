/**
 * Translates EyeViz object states into Three.js objects. Contains no WebGL or camera code,
 * so it can be tested without a GPU. Owns (and disposes) every geometry and material it makes.
 */
import type {
  CurveState,
  LabelState,
  ObjectModel,
  ObjectState,
  PlaneState,
  PointState,
  SceneModel,
  SceneState,
  SegmentState,
  SurfaceState,
  VectorState,
} from "@alumieye/eyeviz-core";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { applyLabelStyle, createLabel } from "./labels";
import type { Palette } from "./theme";

/** Screen-space line widths in CSS pixels. */
const LINE_WIDTH = { segment: 3, curve: 2.5 } as const;

/** World-space sizes are proportional to the scene's size so every scene reads the same. */
export interface Sizes {
  /** Radius of the scene's bounding sphere. */
  readonly scale: number;
}

interface View {
  update(state: ObjectState): void;
  setColor(color: THREE.Color, palette: Palette): void;
  setResolution(resolution: THREE.Vector2): void;
  dispose(): void;
}

/** Geometries shared by all views of one kind; owned and disposed by the SceneGraph. */
interface Shared {
  readonly sphere: THREE.SphereGeometry;
  /** Unit cylinder from y = 0 to y = 1. */
  readonly shaft: THREE.CylinderGeometry;
  /** Unit cone from y = 0 (base) to y = 1 (tip). */
  readonly head: THREE.ConeGeometry;
  /** 2 × 2 square in the x–y plane. */
  readonly square: THREE.PlaneGeometry;
  readonly squareOutline: THREE.BufferGeometry;
}

export class SceneGraph {
  readonly root = new THREE.Group();

  readonly #shared: Shared;
  readonly #resolution = new THREE.Vector2(1, 1);
  #views = new Map<string, View>();
  #model: SceneModel | undefined;
  #palette: Palette;
  #sizes: Sizes = { scale: 1 };

  constructor(palette: Palette) {
    this.root.name = "eyeviz-objects";
    this.#palette = palette;
    const shaft = new THREE.CylinderGeometry(1, 1, 1, 16);
    shaft.translate(0, 0.5, 0);
    const head = new THREE.ConeGeometry(1, 1, 24);
    head.translate(0, 0.5, 0);
    const outline = new THREE.BufferGeometry().setFromPoints(
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
    );
    this.#shared = {
      sphere: new THREE.SphereGeometry(1, 24, 16),
      shaft,
      head,
      square: new THREE.PlaneGeometry(2, 2),
      squareOutline: outline,
    };
  }

  /** Rebuilds all views for a new model. */
  setModel(model: SceneModel, state: SceneState, sizes: Sizes): void {
    this.#disposeViews();
    this.#model = model;
    this.#sizes = sizes;
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
      if (object) view.setColor(this.#colorOf(object), palette);
    }
  }

  /** Line materials need the drawing-buffer size to compute screen-space widths. */
  setResolution(width: number, height: number): void {
    this.#resolution.set(width, height);
    for (const view of this.#views.values()) view.setResolution(this.#resolution);
  }

  dispose(): void {
    this.#disposeViews();
    for (const geometry of Object.values(this.#shared)) geometry.dispose();
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
    const { scale } = this.#sizes;
    switch (object.type) {
      case "point":
        return new PointView(this.root, object.id, this.#shared.sphere, scale * 0.022, color);
      case "segment":
        return new SegmentView(this.root, object.id, color, this.#resolution);
      case "vector":
        return new VectorView(this.root, object.id, this.#shared, scale, color);
      case "plane":
        return new PlaneView(this.root, object.id, this.#shared, scale, color);
      case "curve":
        return new CurveView(this.root, object.id, color, this.#resolution);
      case "surface":
        return new SurfaceView(this.root, object.id, color);
      case "label":
        return new LabelView(this.root, object.id, color, this.#palette);
    }
  }
}

const standard = (color: THREE.Color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0 });

class PointView implements View {
  readonly #mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;

  constructor(
    parent: THREE.Object3D,
    id: string,
    sphere: THREE.SphereGeometry,
    radius: number,
    color: THREE.Color,
  ) {
    this.#mesh = new THREE.Mesh(sphere, standard(color));
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
    this.#mesh.material.dispose(); // geometry is shared and owned by SceneGraph
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

const UP = new THREE.Vector3(0, 1, 0);

/** An arrow: a cylinder shaft and a cone head, oriented along the vector. */
class VectorView implements View {
  readonly #group = new THREE.Group();
  readonly #shaft: THREE.Mesh;
  readonly #head: THREE.Mesh;
  readonly #material: THREE.MeshStandardMaterial;
  readonly #direction = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    id: string,
    shared: Shared,
    private readonly scale: number,
    color: THREE.Color,
  ) {
    this.#material = standard(color);
    this.#shaft = new THREE.Mesh(shared.shaft, this.#material);
    this.#head = new THREE.Mesh(shared.head, this.#material);
    this.#group.add(this.#shaft, this.#head);
    this.#group.name = id;
    parent.add(this.#group);
  }

  update(state: ObjectState): void {
    const vector = state as VectorState;
    this.#direction.set(...vector.components);
    const length = this.#direction.length();
    this.#group.visible = vector.visible && vector.valid && length > 0;
    if (!this.#group.visible) return;

    const headLength = Math.min(length * 0.35, this.scale * 0.07);
    const headRadius = Math.min(headLength * 0.45, this.scale * 0.025);
    const shaftRadius = headRadius * 0.35;
    this.#group.position.set(...vector.origin);
    this.#group.quaternion.setFromUnitVectors(UP, this.#direction.normalize());
    this.#shaft.scale.set(shaftRadius, length - headLength, shaftRadius);
    this.#head.position.set(0, length - headLength, 0);
    this.#head.scale.set(headRadius, headLength, headRadius);
  }

  setColor(color: THREE.Color): void {
    this.#material.color.copy(color);
  }

  setResolution(): void {}

  dispose(): void {
    this.#group.removeFromParent();
    this.#material.dispose();
  }
}

const Z = new THREE.Vector3(0, 0, 1);

/** A translucent square patch of the (infinite) plane with a crisp outline. */
class PlaneView implements View {
  readonly #group = new THREE.Group();
  readonly #fill: THREE.MeshStandardMaterial;
  readonly #edge: THREE.LineBasicMaterial;
  readonly #normal = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    id: string,
    shared: Shared,
    private readonly scale: number,
    color: THREE.Color,
  ) {
    this.#fill = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.8,
    });
    this.#edge = new THREE.LineBasicMaterial({ color });
    this.#group.add(
      new THREE.Mesh(shared.square, this.#fill),
      new THREE.LineLoop(shared.squareOutline, this.#edge),
    );
    this.#group.name = id;
    parent.add(this.#group);
  }

  update(state: ObjectState): void {
    const plane = state as PlaneState;
    this.#group.visible = plane.visible && plane.valid;
    if (!this.#group.visible) return;
    this.#group.position.set(...plane.center);
    this.#group.quaternion.setFromUnitVectors(Z, this.#normal.set(...plane.normal));
    this.#group.scale.setScalar(plane.extent ?? this.scale);
  }

  setColor(color: THREE.Color): void {
    this.#fill.color.copy(color);
    this.#edge.color.copy(color);
  }

  setResolution(): void {}

  dispose(): void {
    this.#group.removeFromParent();
    this.#fill.dispose();
    this.#edge.dispose();
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

/** A smooth-shaded mesh over the sampled grid, plus faint grid lines for depth perception. */
class SurfaceView implements View {
  readonly #group = new THREE.Group();
  readonly #material: THREE.MeshStandardMaterial;
  readonly #lineMaterial: THREE.LineBasicMaterial;
  #geometries: THREE.BufferGeometry[] = [];

  constructor(parent: THREE.Object3D, id: string, color: THREE.Color) {
    this.#material = new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.#lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
    this.#group.name = id;
    parent.add(this.#group);
  }

  update(state: ObjectState): void {
    const surface = state as SurfaceState;
    this.#group.visible = surface.visible && surface.valid;
    this.#clear();
    if (!this.#group.visible || surface.rows < 2) return;

    const { rows, columns, positions } = surface;
    const vertex = (i: number, j: number) => i * columns + j;
    const finite = (k: number) => !Number.isNaN(positions[k * 3]);

    const triangles: number[] = [];
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < columns - 1; j++) {
        const a = vertex(i, j);
        const b = vertex(i, j + 1);
        const c = vertex(i + 1, j);
        const d = vertex(i + 1, j + 1);
        // Skip any cell touching an undefined vertex instead of drawing garbage.
        if (finite(a) && finite(b) && finite(c) && finite(d)) triangles.push(a, b, d, a, d, c);
      }
    }

    // Undefined vertices are never referenced; zero them so bounds/normals stay finite.
    const coordinates = Float32Array.from(positions, (v) => (Number.isNaN(v) ? 0 : v));
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute("position", new THREE.BufferAttribute(coordinates, 3));
    mesh.setIndex(triangles);
    mesh.computeVertexNormals();
    this.#geometries.push(mesh);
    this.#group.add(new THREE.Mesh(mesh, this.#material));

    // Grid lines: about 12 per direction.
    const stride = Math.max(1, Math.round((Math.max(rows, columns) - 1) / 12));
    const lines: number[] = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns - 1; j++) {
        if (i % stride === 0 && finite(vertex(i, j)) && finite(vertex(i, j + 1))) {
          lines.push(vertex(i, j), vertex(i, j + 1));
        }
      }
    }
    for (let j = 0; j < columns; j++) {
      for (let i = 0; i < rows - 1; i++) {
        if (j % stride === 0 && finite(vertex(i, j)) && finite(vertex(i + 1, j))) {
          lines.push(vertex(i, j), vertex(i + 1, j));
        }
      }
    }
    const wire = new THREE.BufferGeometry();
    wire.setAttribute("position", new THREE.BufferAttribute(coordinates, 3));
    wire.setIndex(lines);
    this.#geometries.push(wire);
    this.#group.add(new THREE.LineSegments(wire, this.#lineMaterial));
  }

  setColor(color: THREE.Color): void {
    this.#material.color.copy(color);
    this.#lineMaterial.color.copy(color);
  }

  setResolution(): void {}

  dispose(): void {
    this.#clear();
    this.#group.removeFromParent();
    this.#material.dispose();
    this.#lineMaterial.dispose();
  }

  #clear(): void {
    for (const geometry of this.#geometries) geometry.dispose();
    this.#geometries = [];
    this.#group.clear();
  }
}

class LabelView implements View {
  readonly #label: CSS2DObject;

  constructor(parent: THREE.Object3D, id: string, color: THREE.Color, palette: Palette) {
    this.#label = createLabel("", { color: color.getHex(), halo: palette.labelHalo, size: 14 });
    this.#label.name = id;
    parent.add(this.#label);
  }

  update(state: ObjectState): void {
    const label = state as LabelState;
    this.#label.visible = label.visible && label.valid;
    this.#label.element.textContent = label.text;
    if (label.valid) this.#label.position.set(...label.position);
  }

  setColor(color: THREE.Color, palette: Palette): void {
    applyLabelStyle(this.#label.element, {
      color: color.getHex(),
      halo: palette.labelHalo,
      size: 14,
    });
  }

  setResolution(): void {}

  dispose(): void {
    this.#label.removeFromParent(); // CSS2DObject removes its element from the DOM on removal
  }
}
