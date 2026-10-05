// @vitest-environment jsdom
import { EyeVizEngine } from "@alumieye/eyeviz-core";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildGuides,
  computeBounds,
  defaultCameraPosition,
  disposeGuides,
  formatTick,
  niceStep,
  PALETTES,
  resolveTheme,
  SceneGraph,
} from "../src/index";

const spec = {
  version: "0.1",
  parameters: [
    { id: "a", value: 1, min: -5, max: 5 },
    { id: "show", value: true },
  ],
  objects: [
    { id: "A", type: "point", position: [0, 0, 0] },
    { id: "B", type: "point", position: ["a", 2, 0], color: "#ff0000" },
    { id: "AB", type: "segment", from: "A", to: "B", visible: "show" },
    { id: "f", type: "curve", variable: "x", domain: [-4, 4], position: ["x", "tan(x)", 0] },
  ],
};

function setup() {
  const engine = new EyeVizEngine(spec, { curveSamples: 128 });
  const graph = new SceneGraph(PALETTES.light);
  graph.setModel(engine.model, engine.getState(), { scale: 1 });
  engine.subscribe((state, changed) => graph.update(state, changed));
  const byName = (name: string) => graph.root.getObjectByName(name) as THREE.Object3D;
  return { engine, graph, byName };
}

/** Collects every geometry and material reachable from `root` and tracks their disposal. */
function trackDisposal(root: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse((object) => {
    const { geometry, material } = object as Partial<THREE.Mesh>;
    if (geometry) resources.add(geometry);
    if (material) resources.add(material as THREE.Material);
  });
  const disposed = new Set<unknown>();
  for (const resource of resources) {
    resource.addEventListener("dispose", () => disposed.add(resource));
  }
  return { resources, disposed };
}

describe("SceneGraph", () => {
  it("creates one view per object", () => {
    const { byName } = setup();
    expect(byName("A")).toBeInstanceOf(THREE.Mesh);
    expect(byName("AB").children[0]?.type).toBe("Line2");
    // tan(x) on [-4, 4] has two asymptotes → three pieces
    expect(byName("f").children).toHaveLength(3);
  });

  it("positions points from state (z-up world, no axis swap)", () => {
    const { byName } = setup();
    expect(byName("B").position.toArray()).toEqual([1, 2, 0]);
  });

  it("applies spec colors, else theme defaults by type", () => {
    const { byName } = setup();
    const color = (name: string) =>
      ((byName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color;
    expect(color("B").getHex()).toBe(0xff0000);
    expect(color("A").getHex()).toBe(PALETTES.light.point);
  });

  it("follows engine updates", () => {
    const { engine, byName } = setup();
    engine.setParameter("a", -3);
    expect(byName("B").position.x).toBe(-3);
    engine.setParameter("show", false);
    expect(byName("AB").visible).toBe(false);
  });

  it("hides invalid objects", () => {
    const engine = new EyeVizEngine({
      version: "0.1",
      parameters: [{ id: "a", value: 1 }],
      objects: [{ id: "P", type: "point", position: ["sqrt(a)", 0, 0] }],
    });
    const graph = new SceneGraph(PALETTES.dark);
    graph.setModel(engine.model, engine.getState(), { scale: 1 });
    engine.subscribe((s, c) => graph.update(s, c));
    engine.setParameter("a", -1);
    expect(graph.root.getObjectByName("P")?.visible).toBe(false);
  });

  it("switches palettes without rebuilding", () => {
    const { graph, byName } = setup();
    const mesh = byName("A");
    graph.setPalette(PALETTES.dark);
    expect(byName("A")).toBe(mesh);
    expect(((mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      PALETTES.dark.point,
    );
  });

  it("disposes old curve geometries when a curve is re-sampled", () => {
    const engine = new EyeVizEngine({
      version: "0.1",
      parameters: [{ id: "k", value: 1 }],
      objects: [
        { id: "w", type: "curve", variable: "x", domain: [0, 1], position: ["x", "k*x", 0] },
      ],
    });
    const graph = new SceneGraph(PALETTES.light);
    graph.setModel(engine.model, engine.getState(), { scale: 1 });
    engine.subscribe((state, changed) => graph.update(state, changed));
    const curve = graph.root.getObjectByName("w") as THREE.Object3D;
    const { resources, disposed } = trackDisposal(curve);
    const before = [...resources].filter((r) => r instanceof THREE.BufferGeometry);

    engine.setParameter("k", 2);

    expect(before.every((g) => disposed.has(g))).toBe(true);
    expect(curve.children).toHaveLength(1);
  });

  it("draws an implicit curve as lines and redraws it when parameters change", () => {
    const engine = new EyeVizEngine({
      version: "0.1",
      parameters: [{ id: "r", value: 2 }],
      objects: [
        {
          id: "c",
          type: "implicit",
          equation: "x^2 - y^2 = r",
          domain: { x: [-4, 4], y: [-4, 4] },
        },
      ],
    });
    const graph = new SceneGraph(PALETTES.light);
    graph.setModel(engine.model, engine.getState(), { scale: 1 });
    engine.subscribe((state, changed) => graph.update(state, changed));
    const view = graph.root.getObjectByName("c") as THREE.Object3D;
    // Two branches of the hyperbola → two lines, in the curve colour.
    expect(view.children.map((c) => c.type)).toEqual(["Line2", "Line2"]);
    const { disposed, resources } = trackDisposal(view);
    const before = [...resources].filter((r) => r instanceof THREE.BufferGeometry);
    engine.setParameter("r", -2);
    expect(before.every((g) => disposed.has(g))).toBe(true);
    expect(view.children).toHaveLength(2);
    expect(PALETTES.light.implicit).toBe(PALETTES.light.curve);
  });

  it("releases every geometry and material on dispose", () => {
    const { graph } = setup();
    const { resources, disposed } = trackDisposal(graph.root);
    expect(resources.size).toBeGreaterThan(5);
    graph.dispose();
    expect(disposed.size).toBe(resources.size);
    expect(graph.root.children).toHaveLength(0);
  });

  it("releases the previous views when a new model is set", () => {
    const { engine, graph } = setup();
    const { resources, disposed } = trackDisposal(graph.root);
    graph.setModel(engine.model, engine.getState(), { scale: 1 });
    // Everything except the shared sphere geometry is released and recreated.
    const shared = [...resources].filter((r) => r instanceof THREE.SphereGeometry);
    expect(disposed.size).toBe(resources.size - shared.length);
  });
});

describe("bounds and camera", () => {
  it("includes points, curves and the origin", () => {
    const engine = new EyeVizEngine({
      version: "0.1",
      objects: [
        { id: "P", type: "point", position: [10, 0, 0] },
        { id: "c", type: "curve", variable: "s", domain: [0, 1], position: ["s", "s", "4*s"] },
      ],
    });
    const bounds = computeBounds(engine.getState());
    expect(bounds.center[0]).toBeCloseTo(5);
    expect(bounds.radius).toBeCloseTo(Math.hypot(10, 1, 4) / 2);
  });

  it("includes implicit curves", () => {
    const engine = new EyeVizEngine({
      version: "0.1",
      objects: [
        {
          id: "c",
          type: "implicit",
          equation: "x^2 + y^2 = 64",
          domain: { x: [-9, 9], y: [-9, 9] },
        },
      ],
    });
    const bounds = computeBounds(engine.getState());
    expect(bounds.max?.[0]).toBeCloseTo(8, 0);
    expect(bounds.min?.[1]).toBeCloseTo(-8, 0);
  });

  it("frames ±5 for an empty scene, so new objects are on screen", () => {
    const engine = new EyeVizEngine({ version: "0.1", objects: [] });
    expect(computeBounds(engine.getState())).toMatchObject({
      radius: 5,
      min: [-5, -5, -5],
      max: [5, 5, 5],
    });
  });

  it("places the default camera above and in front of the scene", () => {
    const [, y, z] = defaultCameraPosition({ center: [0, 0, 0], radius: 2 });
    expect(y).toBeLessThan(0);
    expect(z).toBeGreaterThan(0);
  });

  it("resolves auto themes", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("Phase 2 primitives", () => {
  const spec = {
    version: "0.1",
    parameters: [{ id: "k", value: 1 }],
    objects: [
      { id: "A", type: "point", position: [0, 0, 0] },
      { id: "B", type: "point", position: [2, 0, 0] },
      { id: "C", type: "point", position: [0, 2, 0] },
      { id: "v", type: "vector", origin: "A", components: [0, 0, "2*k"] },
      { id: "P", type: "plane", through: ["A", "B", "C"] },
      {
        id: "S",
        type: "surface",
        variables: ["x", "y"],
        domain: { x: [-1, 1], y: [-1, 1] },
        position: ["x", "y", "k*sqrt(x)"],
      },
      { id: "lA", type: "label", text: "<b>A</b>", at: "A" },
    ],
  };

  function setupAll() {
    const engine = new EyeVizEngine(spec, { surfaceSamples: 9 });
    const graph = new SceneGraph(PALETTES.light);
    graph.setModel(engine.model, engine.getState(), { scale: 2 });
    engine.subscribe((state, changed) => graph.update(state, changed));
    return {
      engine,
      graph,
      byName: (n: string) => graph.root.getObjectByName(n) as THREE.Object3D,
    };
  }

  it("draws a vector as an arrow pointing along its components", () => {
    const { engine, byName } = setupAll();
    const arrow = byName("v");
    const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
    expect(tip.z).toBeCloseTo(1);
    engine.setParameter("k", 0); // zero-length vectors are hidden
    expect(arrow.visible).toBe(false);
  });

  it("orients a plane along its normal", () => {
    const { byName } = setupAll();
    const plane = byName("P");
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plane.quaternion);
    expect(normal.z).toBeCloseTo(1);
    expect(plane.scale.x).toBeGreaterThan(0);
  });

  it("meshes only the defined part of a surface", () => {
    const { byName } = setupAll();
    const mesh = byName("S").children[0] as THREE.Mesh;
    const index = mesh.geometry.getIndex();
    // sqrt(x) is undefined for x < 0: only cells with 0 <= x are drawn (4 of 8 columns).
    expect(index?.count).toBe(8 * 4 * 6);
    const positions = mesh.geometry.getAttribute("position").array as Float32Array;
    expect([...positions].every(Number.isFinite)).toBe(true);
  });

  it("renders label text as text, never as HTML", () => {
    const { byName } = setupAll();
    const label = byName("lA") as THREE.Object3D & { element: HTMLElement };
    expect(label.element.textContent).toBe("<b>A</b>");
    expect(label.element.querySelector("b")).toBeNull();
  });

  it("releases every resource of every primitive", () => {
    const { graph } = setupAll();
    const { resources, disposed } = trackDisposal(graph.root);
    graph.dispose();
    expect(disposed.size).toBe(resources.size);
  });
});

describe("guides (axes, ticks, grid)", () => {
  it.each([
    [10, 2],
    [1, 0.2],
    [37, 5],
    [0.004, 0.001],
  ])("niceStep(%d) = %d", (extent, step) => {
    expect(niceStep(extent)).toBeCloseTo(step);
  });

  it("formats ticks without floating-point noise", () => {
    expect(formatTick(0.30000000000000004, 0.1)).toBe("0.3");
    expect(formatTick(-2, 1)).toBe("−2");
  });

  it("draws x, y and z in 3D, only x and y in 2D, and cleans up", () => {
    const count = (dimension: "2d" | "3d") => {
      const group = new THREE.Group();
      buildGuides(group, { center: [0, 0, 0], radius: 5 }, PALETTES.light, {
        axes: true,
        grid: true,
        dimension,
      });
      const names = group.children
        .filter((c) => "element" in c)
        .map((c) => (c as unknown as { element: HTMLElement }).element.textContent);
      const result = { names, children: group.children.length };
      disposeGuides(group);
      expect(group.children).toHaveLength(0);
      return result;
    };
    expect(count("3d").names).toEqual(expect.arrayContaining(["x", "y", "z"]));
    expect(count("2d").names).not.toContain("z");
  });

  it("can draw nothing", () => {
    const group = new THREE.Group();
    buildGuides(group, { center: [0, 0, 0], radius: 5 }, PALETTES.light, {
      axes: false,
      grid: false,
      dimension: "3d",
    });
    expect(group.children).toHaveLength(0);
  });
});

describe("emphasis and picking", () => {
  const spec = {
    version: "0.1",
    objects: [
      { id: "A", type: "point", position: [0, 0, 0] },
      { id: "B", type: "point", position: [4, 0, 0] },
      { id: "AB", type: "segment", from: "A", to: "B" },
      { id: "lB", type: "label", text: "B", at: "B" },
    ],
    steps: [{ id: "s", highlight: ["AB"] }],
  };

  function setupLesson() {
    const engine = new EyeVizEngine(spec);
    const graph = new SceneGraph(PALETTES.light);
    graph.setModel(engine.model, engine.getState(), { scale: 2 });
    const byName = (n: string) => graph.root.getObjectByName(n) as THREE.Object3D;
    const pointMaterial = (n: string) =>
      (byName(n) as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const lineMaterial = (n: string) =>
      (byName(n).children[0] as THREE.Mesh).material as THREE.Material & {
        linewidth: number;
        color: THREE.Color;
      };
    return { engine, graph, byName, pointMaterial, lineMaterial };
  }

  it("highlights the step's objects and dims the rest, not by colour alone", () => {
    const { pointMaterial, lineMaterial } = setupLesson();
    expect(lineMaterial("AB").color.getHex()).toBe(PALETTES.light.highlight);
    expect(lineMaterial("AB").linewidth).toBeGreaterThan(3);
    expect(pointMaterial("A").opacity).toBeLessThan(0.5);
    expect(pointMaterial("A").transparent).toBe(true);
  });

  it("restores normal styling when highlights clear", () => {
    const { graph, pointMaterial, lineMaterial } = setupLesson();
    graph.setEmphasis([], null);
    expect(pointMaterial("A").opacity).toBe(1);
    expect(lineMaterial("AB").color.getHex()).toBe(PALETTES.light.segment);
    expect(lineMaterial("AB").linewidth).toBe(3);
  });

  it("emphasizes a selection without dimming the others", () => {
    const { graph, byName, pointMaterial } = setupLesson();
    graph.setEmphasis([], "B");
    expect(graph.selected).toBe("B");
    expect(byName("B").scale.x).toBeGreaterThan(byName("A").scale.x);
    expect(pointMaterial("A").opacity).toBe(1);
    graph.setEmphasis([], "nope");
    expect(graph.selected).toBeNull();
  });

  it("picks points by screen distance and ignores empty space", () => {
    const { graph } = setupLesson();
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, -100, 100);
    camera.updateMatrixWorld();
    const size = { width: 500, height: 500 };
    graph.setResolution(500, 500); // as the renderer does on resize
    // B is at x = 4 → NDC 0.8; a pointer 10 px away still picks it (label B shares the spot).
    expect(["B", "lB"]).toContain(graph.pick(new THREE.Vector2(0.8 + 10 / 250, 0), camera, size));
    expect(graph.pick(new THREE.Vector2(0, 0.8), camera, size)).toBeNull();
    // Restricting to draggable points: the label at the same spot is ignored.
    expect(graph.pickAnchor(new THREE.Vector2(0.8, 0), camera, size, new Set(["B"]))).toBe("B");
    expect(graph.pickAnchor(new THREE.Vector2(0.8, 0), camera, size, new Set(["A"]))).toBeNull();
    expect(graph.anchorOf("B")?.toArray()).toEqual([4, 0, 0]);
    // On the segment, away from both endpoints: picked by ray casting.
    expect(graph.pick(new THREE.Vector2(0.4, 0.01), camera, size)).toBe("AB");
  });
});
