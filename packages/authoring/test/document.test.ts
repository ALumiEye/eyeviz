import { compileScene } from "@alumieye/eyeviz-core";
import { describe, expect, it } from "vitest";
import {
  createObject,
  createParameter,
  createStep,
  emptyScene,
  nextPointName,
  SceneDocument,
  uniqueId,
  type NewItemKind,
} from "../src/index";

describe("SceneDocument", () => {
  const point = (id: string) =>
    ({ op: "addObject", object: { id, type: "point", position: [0, 0, 0] } }) as const;

  it("applies, undoes and redoes", () => {
    const doc = new SceneDocument(emptyScene());
    doc.apply(point("A"));
    doc.apply(point("B"));
    expect(doc.spec.objects.map((o) => o.id)).toEqual(["A", "B"]);
    expect(doc.undoSummary).toBe("Add point B");
    doc.undo();
    expect(doc.spec.objects.map((o) => o.id)).toEqual(["A"]);
    doc.redo();
    expect(doc.spec.objects.map((o) => o.id)).toEqual(["A", "B"]);
    doc.undo();
    doc.apply(point("C")); // a new edit clears the redo stack
    expect(doc.canRedo).toBe(false);
  });

  it("leaves everything unchanged when a command fails", () => {
    const doc = new SceneDocument(emptyScene());
    const before = doc.spec;
    const result = doc.apply({ op: "removeObject", id: "nope" });
    expect(result.ok).toBe(false);
    expect(doc.spec).toBe(before);
    expect(doc.canUndo).toBe(false);
  });

  it("coalesces bursts of edits with the same key into one undo step", () => {
    let now = 0;
    const doc = new SceneDocument(emptyScene(), { now: () => now });
    doc.apply(point("A"));
    for (const x of [1, 2, 3]) {
      now += 100;
      doc.apply(
        { op: "updateObject", id: "A", changes: { position: [x, 0, 0] } },
        { coalesceKey: "drag:A" },
      );
    }
    now += 5000; // a pause starts a new step
    doc.apply(
      { op: "updateObject", id: "A", changes: { position: [9, 0, 0] } },
      { coalesceKey: "drag:A" },
    );
    doc.undo();
    expect(doc.spec.objects[0]).toMatchObject({ position: [3, 0, 0] });
    doc.undo();
    expect(doc.spec.objects[0]).toMatchObject({ position: [0, 0, 0] });
  });

  it("limits history", () => {
    const doc = new SceneDocument(emptyScene(), { historyLimit: 2 });
    doc.apply(point("A"));
    doc.apply(point("B"));
    doc.apply(point("C"));
    expect(doc.undo() && doc.undo()).toBe(true);
    expect(doc.undo()).toBe(false);
    expect(doc.spec.objects.map((o) => o.id)).toEqual(["A"]);
  });

  it("replaces the whole spec as one undoable step and notifies listeners", () => {
    const doc = new SceneDocument(emptyScene());
    const sources: string[] = [];
    doc.subscribe((change) => sources.push(change.source));
    doc.replace({ ...emptyScene("2d") });
    doc.undo();
    doc.redo();
    expect(sources).toEqual(["replace", "undo", "redo"]);
  });
});

describe("templates", () => {
  it("names points A, B, C… skipping used names", () => {
    const doc = new SceneDocument(emptyScene());
    doc.apply({ op: "addObject", object: createObject(doc.spec, "point")! });
    doc.apply({ op: "addObject", object: createObject(doc.spec, "point")! });
    expect(doc.spec.objects.map((o) => o.id)).toEqual(["A", "B"]);
    expect(nextPointName(doc.spec)).toBe("C");
  });

  it("makes unique, non-reserved ids", () => {
    const spec = { ...emptyScene(), parameters: [{ id: "a", value: 1 }] };
    expect(uniqueId(spec, "a")).toBe("a1");
    expect(uniqueId(spec, "t")).toBe("t1");
  });

  it("needs two points for a segment", () => {
    expect(createObject(emptyScene(), "segment")).toBeUndefined();
  });

  it.each(["point", "vector", "plane", "graph", "surface", "label"] as NewItemKind[])(
    "creates a %s that compiles in an empty scene",
    (kind) => {
      const doc = new SceneDocument(emptyScene());
      const result = doc.apply({ op: "addObject", object: createObject(doc.spec, kind)! });
      expect(result.ok).toBe(true);
      expect(compileScene(doc.spec).ok).toBe(true);
    },
  );

  it("creates parameters and steps that compile", () => {
    const doc = new SceneDocument(emptyScene());
    doc.apply({ op: "addParameter", parameter: createParameter(doc.spec, "number") });
    doc.apply({ op: "addParameter", parameter: createParameter(doc.spec, "toggle") });
    doc.apply({ op: "addStep", step: createStep(doc.spec) });
    expect(compileScene(doc.spec).ok).toBe(true);
    expect(doc.spec.parameters?.map((p) => p.id)).toEqual(["a", "show"]);
  });
});
