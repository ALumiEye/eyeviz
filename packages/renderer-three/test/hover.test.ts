import { EyeVizEngine } from "@alumieye/eyeviz-core";
import { describe, expect, it } from "vitest";
import { coordinateDecimals, formatCoordinates, formatNumber, nearestOnScene } from "../src/index";

const engine = new EyeVizEngine({
  version: "0.1",
  scene: { dimension: "2d" },
  parameters: [{ id: "show", value: false }],
  objects: [
    { id: "f", type: "curve", variable: "x", domain: [-5, 5], position: ["x", "x^2", 0] },
    { id: "P", type: "point", position: [1, 1.05, 0] },
    { id: "c", type: "implicit", equation: "x^2 + y^2 = 9", domain: { x: [-5, 5], y: [-5, 5] } },
    { id: "h", type: "point", position: [4, 0, 0], visible: "show" },
  ],
});
const state = engine.getState();

describe("nearestOnScene", () => {
  it("finds the point on a graph under the pointer, between samples", () => {
    const hit = nearestOnScene(state, [2, 4.02], 0.1);
    expect(hit?.id).toBe("f");
    expect(hit?.position[0]).toBeCloseTo(2, 1);
    expect(hit?.position[1]).toBeCloseTo(4, 1);
  });

  it("prefers a point over a graph passing near it", () => {
    expect(nearestOnScene(state, [1, 1.02], 0.1)?.id).toBe("P");
  });

  it("finds implicit curves", () => {
    const hit = nearestOnScene(state, [0, -3.03], 0.1);
    expect(hit?.id).toBe("c");
    expect(Math.hypot(hit?.position[0] ?? 0, hit?.position[1] ?? 0)).toBeCloseTo(3, 1);
  });

  it("ignores what is far away or hidden", () => {
    expect(nearestOnScene(state, [4, -1], 0.1)).toBeNull();
    expect(nearestOnScene(state, [4, 0], 0.1)).toBeNull();
  });
});

describe("coordinate text", () => {
  it("shows about one pixel of precision", () => {
    expect(coordinateDecimals(0.01)).toBe(2);
    expect(coordinateDecimals(0.5)).toBe(0);
    expect(coordinateDecimals(1e-9)).toBe(6);
  });

  it("formats without trailing zeros and with a real minus sign", () => {
    expect(formatNumber(1.5, 2)).toBe("1.5");
    expect(formatNumber(-0.001, 2)).toBe("0");
    expect(formatCoordinates([1.25, -0.5, 0], 2)).toBe("(1.25, −0.5)");
  });
});
