import { describe, expect, it, vi } from "vitest";
import { EyeVizError, validateSpec } from "@alumieye/eyeviz-spec";
import { EyeVizEngine, type CurveState } from "../src/index";

const lesson = {
  version: "0.1",
  parameters: [{ id: "showAll", value: true }],
  objects: [
    { id: "O", type: "point", position: [0, 0, 0] },
    { id: "A", type: "point", position: [1, 0, 0] },
    { id: "B", type: "point", position: [0, 1, 0] },
    { id: "OA", type: "segment", from: "O", to: "A" },
    { id: "OB", type: "segment", from: "O", to: "B", visible: "showAll" },
    {
      id: "arc",
      type: "curve",
      variable: "s",
      domain: [0, 1.57],
      position: ["cos(s)", "sin(s)", 0],
    },
  ],
  steps: [
    { id: "s1", title: "Point A", show: ["A", "OA"], focus: ["O", "A"] },
    { id: "s2", title: "Point B", show: ["B", "OB"], highlight: ["OB"] },
    { id: "s3", title: "The arc", show: ["arc"], hide: ["OA"] },
  ],
};

const visible = (engine: EyeVizEngine) =>
  Object.values(engine.getState().objects)
    .filter((o) => o.visible)
    .map((o) => o.id)
    .sort();

describe("steps — validation", () => {
  it("rejects unknown objects and duplicate step IDs", () => {
    const result = validateSpec({
      ...lesson,
      steps: [
        { id: "x", show: ["Z"] },
        { id: "x", highlight: ["showAll"] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => [i.code, i.path])).toEqual([
      ["MISSING_REFERENCE", "steps[0].show[0]"],
      ["DUPLICATE_ID", "steps[1].id"],
      ["INVALID_REFERENCE_TYPE", "steps[1].highlight[0]"],
    ]);
  });
});

describe("steps — semantics", () => {
  it("starts at the first step; objects introduced later are hidden, others always shown", () => {
    const engine = new EyeVizEngine(lesson);
    expect(engine.getState().step).toBe(0);
    expect(visible(engine)).toEqual(["A", "O", "OA"]);
  });

  it("accumulates show and hide over the steps", () => {
    const engine = new EyeVizEngine(lesson);
    engine.setStep(1);
    expect(visible(engine)).toEqual(["A", "B", "O", "OA", "OB"]);
    engine.setStep(2);
    expect(visible(engine)).toEqual(["A", "B", "O", "OB", "arc"]);
  });

  it("applies highlight and focus to the current step only", () => {
    const engine = new EyeVizEngine(lesson);
    expect(engine.getState().focus).toEqual(["O", "A"]);
    expect(engine.getState().highlights).toEqual([]);
    engine.setStep(1);
    expect(engine.getState().highlights).toEqual(["OB"]);
    expect(engine.getState().focus).toEqual([]);
  });

  it("shows the whole scene with setStep(null)", () => {
    const engine = new EyeVizEngine(lesson);
    engine.setStep(null);
    expect(visible(engine)).toEqual(["A", "B", "O", "OA", "OB", "arc"]);
  });

  it("combines with the objects' own visibility", () => {
    const engine = new EyeVizEngine(lesson);
    engine.setStep(1);
    engine.setParameter("showAll", false);
    expect(visible(engine)).not.toContain("OB");
  });

  it("samples curves when a step reveals them", () => {
    const engine = new EyeVizEngine(lesson);
    expect((engine.getState().objects.arc as CurveState).polylines).toEqual([]);
    engine.setStep(2);
    expect((engine.getState().objects.arc as CurveState).polylines.length).toBe(1);
  });

  it("re-evaluates only objects mentioned by steps", () => {
    const engine = new EyeVizEngine(lesson);
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.setStep(1);
    expect([...(listener.mock.calls[0]?.[1] as Set<string>)].sort()).toEqual([
      "A",
      "B",
      "O",
      "OA",
      "OB",
      "arc",
    ]);
    expect(engine.getState().objects).toBeDefined();
  });

  it("keeps step-derived identities while only time changes", () => {
    const engine = new EyeVizEngine(lesson);
    const { focus, highlights } = engine.getState();
    engine.setTime(1);
    expect(engine.getState().focus).toBe(focus);
    expect(engine.getState().highlights).toBe(highlights);
  });

  it("rejects steps that do not exist", () => {
    const engine = new EyeVizEngine(lesson);
    expect(() => engine.setStep(3)).toThrowError(EyeVizError);
    expect(() => engine.setStep(-1)).toThrowError(EyeVizError);
    expect(() => engine.setStep(0.5)).toThrowError(EyeVizError);
  });

  it("has no step for scenes without steps", () => {
    const { steps, ...withoutSteps } = lesson;
    expect(steps).toHaveLength(3);
    const engine = new EyeVizEngine(withoutSteps);
    expect(engine.getState().step).toBeNull();
    expect(visible(engine).length).toBe(6);
  });

  it("is deterministic regardless of the path between steps", () => {
    const a = new EyeVizEngine(lesson);
    a.setStep(2);
    const b = new EyeVizEngine(lesson);
    b.setStep(null);
    b.setStep(1);
    b.setStep(2);
    expect(b.getState()).toEqual(a.getState());
  });
});
