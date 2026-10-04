import { describe, expect, it } from "vitest";
import { EyeVizError, validateSpec } from "@alumieye/eyeviz-spec";
import { EyeVizEngine, solveDrag, type PointState } from "../src/index";
import { compileIssues } from "./helpers";

const point = (engine: EyeVizEngine, id: string) =>
  (engine.getState().objects[id] as PointState).position;

const scene = (objects: unknown[], parameters: unknown[]) => ({
  version: "0.1",
  parameters,
  objects,
});

describe("drag — validation", () => {
  it("requires interactive number parameters", () => {
    const result = validateSpec(
      scene(
        [{ id: "P", type: "point", position: ["a", 0, 0], drag: ["flag", "k", "zzz"] }],
        [
          { id: "a", value: 0 },
          { id: "flag", value: true },
          { id: "k", value: 1, interactive: false },
        ],
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => [i.code, i.path])).toEqual([
      ["INVALID_REFERENCE_TYPE", "objects[0].drag[0]"],
      ["INVALID_PARAMETER", "objects[0].drag[1]"],
      ["MISSING_REFERENCE", "objects[0].drag[2]"],
    ]);
  });

  it("requires the position to use every drag parameter", () => {
    const issues = compileIssues(
      scene(
        [{ id: "P", type: "point", position: ["a", 0, 0], drag: ["b"] }],
        [
          { id: "a", value: 0 },
          { id: "b", value: 0 },
        ],
      ),
    );
    expect(issues[0]).toMatchObject({ code: "INVALID_REFERENCE_TYPE", path: "objects[0].drag[0]" });
  });
});

describe("dragPoint", () => {
  it("moves a free point exactly to the target", () => {
    const engine = new EyeVizEngine(
      scene(
        [{ id: "P", type: "point", position: ["px", "py", 0], drag: ["px", "py"] }],
        [
          { id: "px", value: 0 },
          { id: "py", value: 0 },
        ],
      ),
    );
    engine.dragPoint("P", [3.25, -1.5, 7]); // z is not free: it stays 0
    expect(point(engine, "P")[0]).toBeCloseTo(3.25, 9);
    expect(point(engine, "P")[1]).toBeCloseTo(-1.5, 9);
    expect(point(engine, "P")[2]).toBe(0);
  });

  it("keeps a point on its circle (angle in degrees, snapped to the step)", () => {
    const engine = new EyeVizEngine(
      scene(
        [
          {
            id: "P",
            type: "point",
            position: ["2*cos(theta)", "2*sin(theta)", 0],
            drag: ["theta"],
          },
        ],
        [{ id: "theta", value: 0, unit: "deg", min: 0, max: 360, step: 1 }],
      ),
    );
    engine.dragPoint("P", [-5, 5, 0]); // direction of 135°
    expect(engine.getParameterValue("theta")).toBe(135);
    const [x, y] = point(engine, "P");
    expect(Math.hypot(x, y)).toBeCloseTo(2, 12);
  });

  it("finds the nearest point on a curve, within the parameter's bounds", () => {
    const engine = new EyeVizEngine(
      scene(
        [{ id: "P", type: "point", position: ["x0", "x0^2", 0], drag: ["x0"] }],
        [{ id: "x0", value: 0, min: -2, max: 2 }],
      ),
    );
    engine.dragPoint("P", [1, 1, 0]);
    expect(engine.getParameterValue("x0")).toBeCloseTo(1, 4);
    engine.dragPoint("P", [10, 100, 0]);
    expect(engine.getParameterValue("x0")).toBe(2); // clamped to max
  });

  it("solves two parameters at once (distance and angle)", () => {
    const engine = new EyeVizEngine(
      scene(
        [{ id: "C", type: "point", position: ["r*cos(a)", "r*sin(a)", 1], drag: ["r", "a"] }],
        [
          { id: "r", value: 1, min: 0, max: 10 },
          { id: "a", value: 0.3, min: -3.2, max: 3.2 },
        ],
      ),
    );
    engine.dragPoint("C", [0, 3, 1]);
    expect(engine.getParameterValue("r")).toBeCloseTo(3, 6);
    expect(engine.getParameterValue("a")).toBeCloseTo(Math.PI / 2, 6);
  });

  it("propagates like a parameter change (segments follow)", () => {
    const engine = new EyeVizEngine(
      scene(
        [
          { id: "O", type: "point", position: [0, 0, 0] },
          { id: "P", type: "point", position: ["px", 0, 0], drag: ["px"] },
          { id: "OP", type: "segment", from: "O", to: "P" },
        ],
        [{ id: "px", value: 1 }],
      ),
    );
    engine.dragPoint("P", [4, 0, 0]);
    expect((engine.getState().objects.OP as { to: readonly number[] }).to[0]).toBeCloseTo(4, 6);
  });

  it("rejects points that are not draggable", () => {
    const engine = new EyeVizEngine(scene([{ id: "P", type: "point", position: [0, 0, 0] }], []));
    expect(engine.isDraggable("P")).toBe(false);
    expect(() => engine.dragPoint("P", [1, 1, 1])).toThrowError(EyeVizError);
  });

  it("is deterministic", () => {
    const make = () =>
      new EyeVizEngine(
        scene(
          [{ id: "P", type: "point", position: ["r*cos(a)", "r*sin(a)", 0], drag: ["r", "a"] }],
          [
            { id: "r", value: 1 },
            { id: "a", value: 0 },
          ],
        ),
      );
    const a = make();
    const b = make();
    a.dragPoint("P", [-1.3, 0.7, 0]);
    b.dragPoint("P", [-1.3, 0.7, 0]);
    expect(a.getState()).toEqual(b.getState());
  });
});

describe("solveDrag", () => {
  it("ignores regions where the point is undefined", () => {
    const [v] = solveDrag(
      (vals) => [vals[0] as number, Math.sqrt(vals[0] as number), 0],
      [1],
      [{ min: -5, max: 5 }],
      [-3, 0, 0],
    );
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
