import { compileScene } from "@alumieye/eyeviz-core";
import type { SceneSpec } from "@alumieye/eyeviz-spec";
import { describe, expect, it } from "vitest";
import { applyCommand, parameterUsers, type EditCommand } from "../src/index";

const base: SceneSpec = {
  version: "0.1",
  timeline: { duration: "2*v0/g" },
  parameters: [
    { id: "theta", value: 30, unit: "deg" },
    { id: "v0", value: 10 },
    { id: "g", value: 9.81 },
    { id: "show", value: true },
  ],
  objects: [
    { id: "A", type: "point", position: [0, 0, 0] },
    { id: "B", type: "point", position: ["cos(theta)", "sin(theta)", 0], drag: ["theta"] },
    { id: "C", type: "point", position: [0, 2, 0] },
    { id: "AB", type: "segment", from: "A", to: "B", visible: "show" },
    { id: "v", type: "vector", origin: "B", components: ["v0*cos(theta)", 1, 0] },
    { id: "P", type: "plane", through: ["A", "B", "C"] },
    { id: "lB", type: "label", text: "B", at: "B" },
    { id: "w", type: "curve", variable: "s", domain: [0, "theta"], position: ["s", "sin(s)", 0] },
  ],
  steps: [
    { id: "one", show: ["A", "B", "AB"], highlight: ["B"] },
    { id: "two", show: ["v", "lB"], focus: ["B"] },
  ],
};

function apply(command: EditCommand, spec: SceneSpec = base): SceneSpec {
  const result = applyCommand(spec, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.spec;
}

function compiles(spec: SceneSpec): void {
  const result = compileScene(spec);
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
}

describe("starting point", () => {
  it("is a valid scene", () => compiles(base));
});

describe("objects", () => {
  it("adds, keeping the input untouched", () => {
    const snapshot = JSON.stringify(base);
    const next = apply({
      op: "addObject",
      object: { id: "D", type: "point", position: [1, 1, 1] },
      index: 1,
    });
    expect(next.objects[1]?.id).toBe("D");
    expect(JSON.stringify(base)).toBe(snapshot);
    compiles(next);
  });

  it.each([
    ["A", "DUPLICATE_ID"],
    ["theta", "DUPLICATE_ID"],
    ["2x", "INVALID_ID"],
  ])("refuses the id %s", (id, code) => {
    const result = applyCommand(base, {
      op: "addObject",
      object: { id, type: "point", position: [0, 0, 0] },
    });
    expect(result.ok ? undefined : result.error.code).toBe(code);
  });

  it("updates fields and removes optional ones with null", () => {
    const next = apply({
      op: "updateObject",
      id: "AB",
      changes: { color: "#ff0000", visible: null },
    });
    expect(next.objects[3]).toEqual({
      id: "AB",
      type: "segment",
      from: "A",
      to: "B",
      color: "#ff0000",
    });
  });

  it("does not change id or type through updates", () => {
    const result = applyCommand(base, { op: "updateObject", id: "A", changes: { type: "label" } });
    expect(result.ok ? undefined : result.error.code).toBe("INVALID_COMMAND");
  });

  it("removes dependents transitively and cleans steps", () => {
    const result = applyCommand(base, { op: "removeObject", id: "B" });
    if (!result.ok) throw new Error(result.error.message);
    expect([...(result.removed ?? [])].sort()).toEqual(["AB", "P", "lB", "v"]);
    expect(result.spec.objects.map((o) => o.id)).toEqual(["A", "C", "w"]);
    expect(result.spec.steps).toEqual([{ id: "one", show: ["A"] }, { id: "two" }]);
    compiles(result.spec);
  });

  it("moves objects", () => {
    expect(apply({ op: "moveObject", id: "w", index: 0 }).objects[0]?.id).toBe("w");
  });
});

describe("parameters", () => {
  it("knows where a parameter is used", () => {
    expect(parameterUsers(base, "theta").sort()).toEqual(["B", "v", "w"]);
    expect(parameterUsers(base, "v0")).toEqual(["v", "timeline"]);
    expect(parameterUsers(base, "show")).toEqual(["AB"]);
  });

  it("refuses to remove a parameter in use, and removes an unused one", () => {
    const result = applyCommand(base, { op: "removeParameter", id: "g" });
    expect(result.ok ? undefined : result.error).toMatchObject({
      code: "IN_USE",
      details: { users: ["timeline"] },
    });
    const free = apply({ op: "addParameter", parameter: { id: "k", value: 1 } });
    expect(
      apply({ op: "removeParameter", id: "k" }, free).parameters?.some((p) => p.id === "k"),
    ).toBe(false);
  });

  it("updates a parameter", () => {
    const next = apply({ op: "updateParameter", id: "v0", changes: { min: 0, max: 20 } });
    expect(next.parameters?.[1]).toEqual({ id: "v0", value: 10, min: 0, max: 20 });
  });
});

describe("rename", () => {
  it("renames a parameter everywhere: expressions, drag, visible, timeline", () => {
    const next = apply({ op: "rename", from: "theta", to: "angle" });
    const byId = (id: string) => next.objects.find((o) => o.id === id);
    expect(next.parameters?.[0]?.id).toBe("angle");
    expect(byId("B")).toMatchObject({ position: ["cos(angle)", "sin(angle)", 0], drag: ["angle"] });
    expect(byId("v")).toMatchObject({ components: ["v0*cos(angle)", 1, 0] });
    expect(byId("w")).toMatchObject({ domain: [0, "angle"] });
    expect(apply({ op: "rename", from: "show", to: "visibleAB" }).objects[3]).toMatchObject({
      visible: "visibleAB",
    });
    expect(apply({ op: "rename", from: "g", to: "gravity" }).timeline).toEqual({
      duration: "2*v0/gravity",
    });
    compiles(next);
  });

  it("renames an object and every reference to it, including steps", () => {
    const next = apply({ op: "rename", from: "B", to: "Q" });
    const byId = (id: string) => next.objects.find((o) => o.id === id);
    expect(byId("AB")).toMatchObject({ to: "Q" });
    expect(byId("v")).toMatchObject({ origin: "Q" });
    expect(byId("P")).toMatchObject({ through: ["A", "Q", "C"] });
    expect(byId("lB")).toMatchObject({ at: "Q" });
    expect(next.steps?.[0]).toEqual({ id: "one", show: ["A", "Q", "AB"], highlight: ["Q"] });
    compiles(next);
  });

  it("refuses names that are taken or invalid", () => {
    const taken = applyCommand(base, { op: "rename", from: "A", to: "theta" });
    const invalid = applyCommand(base, { op: "rename", from: "A", to: "a-b" });
    const missing = applyCommand(base, { op: "rename", from: "Z", to: "Y" });
    expect([taken, invalid, missing].map((r) => (r.ok ? undefined : r.error.code))).toEqual([
      "DUPLICATE_ID",
      "INVALID_ID",
      "NOT_FOUND",
    ]);
  });
});

describe("steps and settings", () => {
  it("adds, edits, moves and removes steps", () => {
    let spec = apply({ op: "addStep", step: { id: "three", title: "Three" } });
    spec = apply({ op: "updateStep", id: "three", changes: { show: ["P"] } }, spec);
    spec = apply({ op: "moveStep", id: "three", index: 0 }, spec);
    expect(spec.steps?.map((s) => s.id)).toEqual(["three", "one", "two"]);
    spec = apply({ op: "removeStep", id: "three" }, spec);
    spec = apply({ op: "removeStep", id: "one" }, spec);
    spec = apply({ op: "removeStep", id: "two" }, spec);
    expect("steps" in spec).toBe(false);
  });

  it("sets and clears sections", () => {
    const spec = apply({ op: "setScene", value: { dimension: "2d" } });
    expect(spec.scene).toEqual({ dimension: "2d" });
    expect("timeline" in apply({ op: "setTimeline", value: null })).toBe(false);
  });
});
