import { describe, expect, it, vi } from "vitest";
import { EyeVizError } from "@alumieye/eyeviz-spec";
import { compileScene, EyeVizEngine, type PointState, type SegmentState } from "../src/index";
import { scene } from "./helpers";

const triangle = scene(
  [
    { id: "A", type: "point", position: [0, 0, 0] },
    { id: "C", type: "point", position: ["r*cos(theta)", "r*sin(theta)", "t"] },
    { id: "B", type: "point", position: [4, 0, 0] },
    { id: "AB", type: "segment", from: "A", to: "B" },
    { id: "AC", type: "segment", from: "A", to: "C", visible: "show" },
  ],
  [
    { id: "theta", value: 90, unit: "deg", min: 0, max: 180 },
    { id: "r", value: 2, min: 0, max: 10 },
    { id: "show", value: true },
  ],
);

const point = (engine: EyeVizEngine, id: string) => engine.getState().objects[id] as PointState;
const segment = (engine: EyeVizEngine, id: string) => engine.getState().objects[id] as SegmentState;

describe("EyeVizEngine", () => {
  it("throws EyeVizError with issues for invalid specs", () => {
    try {
      new EyeVizEngine({
        version: "0.1",
        objects: [{ id: "P", type: "point", position: ["x", 0, 0] }],
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EyeVizError);
      expect((error as EyeVizError).issues[0]?.code).toBe("UNKNOWN_SYMBOL");
    }
  });

  it("accepts a compiled model", () => {
    const result = compileScene(triangle);
    if (!result.ok) throw new Error("expected success");
    expect(new EyeVizEngine(result.model).model).toBe(result.model);
  });

  it("evaluates the initial state, converting degrees to radians", () => {
    const engine = new EyeVizEngine(triangle);
    const [x, y, z] = point(engine, "C").position;
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(2, 12);
    expect(z).toBe(0);
    expect(engine.getState().parameters.theta).toBe(90); // reported in declared units
  });

  it("propagates parameter changes to dependent points and segments", () => {
    const engine = new EyeVizEngine(triangle);
    engine.setParameter("theta", 0);
    expect(point(engine, "C").position[0]).toBeCloseTo(2, 12);
    expect(segment(engine, "AC").to).toEqual(point(engine, "C").position);
  });

  it("re-evaluates only affected objects and reports them", () => {
    const engine = new EyeVizEngine(triangle);
    const before = engine.getState();
    const listener = vi.fn();
    engine.subscribe(listener);

    engine.setParameter("r", 3);

    const after = engine.getState();
    const changed = listener.mock.calls[0]?.[1] as ReadonlySet<string>;
    expect([...changed].sort()).toEqual(["AC", "C"]);
    expect(after.objects.A).toBe(before.objects.A);
    expect(after.objects.AB).toBe(before.objects.AB);
    expect(after.objects.C).not.toBe(before.objects.C);
  });

  it("updates time-dependent objects on setTime and keeps parameters identity", () => {
    const engine = new EyeVizEngine(triangle);
    const parameters = engine.getState().parameters;
    engine.setTime(1.5);
    expect(point(engine, "C").position[2]).toBe(1.5);
    expect(engine.getTime()).toBe(1.5);
    expect(engine.getState().parameters).toBe(parameters);
  });

  it("toggles visibility through boolean parameters", () => {
    const engine = new EyeVizEngine(triangle);
    engine.setParameter("show", false);
    expect(segment(engine, "AC").visible).toBe(false);
    expect(segment(engine, "AB").visible).toBe(true);
  });

  it("clamps numbers to their bounds", () => {
    const engine = new EyeVizEngine(triangle);
    engine.setParameter("r", 99);
    expect(engine.getParameterValue("r")).toBe(10);
  });

  it("does not notify when nothing changes", () => {
    const engine = new EyeVizEngine(triangle);
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.setParameter("r", 2);
    engine.setTime(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("batches several parameters into one update", () => {
    const engine = new EyeVizEngine(triangle);
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.setParameters({ r: 5, theta: 45 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes", () => {
    const engine = new EyeVizEngine(triangle);
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    unsubscribe();
    engine.setParameter("r", 3);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", 1, "MISSING_REFERENCE"],
    ["r", "3", "INVALID_PARAMETER"],
    ["r", Number.NaN, "INVALID_PARAMETER"],
    ["show", 1, "INVALID_PARAMETER"],
  ])("rejects setParameter(%j, %j)", (id, value, code) => {
    const engine = new EyeVizEngine(triangle);
    expect(() => engine.setParameter(id, value as never)).toThrowError(EyeVizError);
    try {
      engine.setParameter(id, value as never);
    } catch (error) {
      expect((error as EyeVizError).issues[0]?.code).toBe(code);
    }
  });

  it("rejects non-finite time", () => {
    expect(() => new EyeVizEngine(triangle).setTime(Infinity)).toThrowError(EyeVizError);
  });

  it("reports numerical problems in state without throwing", () => {
    const engine = new EyeVizEngine(
      scene(
        [
          { id: "P", type: "point", position: ["sqrt(a)", 0, 0] },
          { id: "Q", type: "point", position: [0, 0, 0] },
          { id: "PQ", type: "segment", from: "P", to: "Q" },
        ],
        [{ id: "a", value: 1, min: -1, max: 1 }],
      ),
    );
    expect(engine.getState().issues).toEqual([]);
    engine.setParameter("a", -1);
    const state = engine.getState();
    expect(state.objects.P?.valid).toBe(false);
    expect(state.objects.PQ?.valid).toBe(false);
    expect(state.issues[0]).toMatchObject({
      code: "EXPRESSION_EVALUATION",
      path: "objects[0].position[0]",
    });
  });
});

describe("determinism invariant", () => {
  it("produces identical state for identical spec, parameters and time", () => {
    const run = () => {
      const engine = new EyeVizEngine(triangle);
      engine.setParameters({ theta: 33, r: 7.25 });
      engine.setTime(2.5);
      engine.setParameter("show", false);
      return engine.getState();
    };
    expect(run()).toEqual(run());
  });

  it("does not depend on the path taken to reach a state", () => {
    const direct = new EyeVizEngine(triangle);
    direct.setParameters({ theta: 10, r: 4 });
    const winding = new EyeVizEngine(triangle);
    winding.setParameter("r", 9);
    winding.setParameter("theta", 170);
    winding.setTime(3);
    winding.setTime(0);
    winding.setParameters({ theta: 10, r: 4 });
    expect(winding.getState()).toEqual(direct.getState());
  });
});
