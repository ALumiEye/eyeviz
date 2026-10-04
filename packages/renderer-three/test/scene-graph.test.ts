import { EyeVizEngine } from "@alumieye/eyeviz-core";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  computeBounds,
  defaultCameraPosition,
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
  graph.setModel(engine.model, engine.getState(), 0.1);
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
    expect(byName("AB").type).toBe("Line2");
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
    graph.setModel(engine.model, engine.getState(), 0.1);
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
    graph.setModel(engine.model, engine.getState(), 0.1);
    engine.subscribe((state, changed) => graph.update(state, changed));
    const curve = graph.root.getObjectByName("w") as THREE.Object3D;
    const { resources, disposed } = trackDisposal(curve);
    const before = [...resources].filter((r) => r instanceof THREE.BufferGeometry);

    engine.setParameter("k", 2);

    expect(before.every((g) => disposed.has(g))).toBe(true);
    expect(curve.children).toHaveLength(1);
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
    graph.setModel(engine.model, engine.getState(), 0.1);
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

  it("never returns a degenerate radius", () => {
    const engine = new EyeVizEngine({ version: "0.1", objects: [] });
    expect(computeBounds(engine.getState()).radius).toBe(1);
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
