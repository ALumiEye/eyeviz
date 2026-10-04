import { describe, expect, it } from "vitest";
import { getSceneSpecJsonSchema, SPEC_VERSION, validateSpec, type EyeVizIssue } from "../src/index";

const base = {
  version: "0.1",
  parameters: [
    { id: "theta", value: 30, unit: "deg", min: 0, max: 90, control: "slider" },
    { id: "show", value: true, control: "toggle" },
  ],
  objects: [
    { id: "A", type: "point", position: [0, 0, 0] },
    { id: "B", type: "point", position: ["cos(theta)", "sin(theta)", 0] },
    { id: "AB", type: "segment", from: "A", to: "B", visible: "show" },
    { id: "wave", type: "curve", variable: "x", domain: [-1, 1], position: ["x", "x^2", 0] },
  ],
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Deep-clones `base` and applies a mutation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests deliberately build invalid specs
function variant(mutate: (spec: any) => void): unknown {
  const spec = clone(base);
  mutate(spec);
  return spec;
}

function issuesOf(input: unknown): readonly EyeVizIssue[] {
  const result = validateSpec(input);
  if (result.ok) throw new Error("expected validation to fail");
  return result.issues;
}

describe("validateSpec — valid input", () => {
  it("accepts a complete v0.1 scene", () => {
    const result = validateSpec(base);
    expect(result.ok).toBe(true);
  });

  it("accepts the minimal scene", () => {
    expect(validateSpec({ version: "0.1", objects: [] }).ok).toBe(true);
  });

  it("does not mutate its input", () => {
    const input = clone(base);
    validateSpec(input);
    expect(input).toEqual(base);
  });
});

describe("validateSpec — structure", () => {
  it.each([null, 42, "scene", []])("rejects non-object input %j", (input) => {
    expect(issuesOf(input)[0]?.code).toBe("SCHEMA_VALIDATION");
  });

  it("requires a version", () => {
    expect(issuesOf({ objects: [] })[0]).toMatchObject({
      code: "SCHEMA_VALIDATION",
      path: "version",
    });
  });

  it("rejects unsupported versions with a dedicated code", () => {
    expect(issuesOf({ version: "2.0", objects: [] })[0]).toMatchObject({
      code: "UNSUPPORTED_VERSION",
      details: { supported: [SPEC_VERSION] },
    });
  });

  it("rejects unknown fields with their path", () => {
    const issues = issuesOf(variant((s) => (s.objects[0].geometrySegments = 64)));
    expect(issues[0]).toMatchObject({
      code: "SCHEMA_VALIDATION",
      path: "objects[0]",
      details: { keys: ["geometrySegments"] },
    });
  });

  it("rejects unknown object types", () => {
    const issues = issuesOf(variant((s) => (s.objects[0].type = "sphere")));
    expect(issues[0]?.path).toBe("objects[0].type");
  });

  it("rejects malformed positions", () => {
    const issues = issuesOf(variant((s) => (s.objects[0].position = [0, 0])));
    expect(issues[0]?.path).toBe("objects[0].position");
  });

  it("rejects invalid IDs", () => {
    const issues = issuesOf(variant((s) => (s.objects[0].id = "sin-curve")));
    expect(issues[0]?.path).toBe("objects[0].id");
  });

  it("rejects invalid colors", () => {
    const issues = issuesOf(variant((s) => (s.objects[0].color = "red")));
    expect(issues[0]?.path).toBe("objects[0].color");
  });

  it("rejects empty expressions", () => {
    const issues = issuesOf(variant((s) => (s.objects[0].position[0] = "")));
    expect(issues[0]?.path).toBe("objects[0].position[0]");
  });

  it("enforces object count limits", () => {
    const objects = Array.from({ length: 1001 }, (_, i) => ({
      id: `p${i}`,
      type: "point",
      position: [0, 0, 0],
    }));
    expect(issuesOf({ version: "0.1", objects })[0]?.path).toBe("objects");
  });
});

describe("validateSpec — parameters", () => {
  it("rejects min >= max", () => {
    const issues = issuesOf(variant((s) => (s.parameters[0].min = 100)));
    expect(
      issues.some((i) => i.code === "INVALID_PARAMETER" && i.path === "parameters[0].min"),
    ).toBe(true);
  });

  it("rejects a value outside its bounds", () => {
    const issues = issuesOf(variant((s) => (s.parameters[0].value = 120)));
    expect(issues[0]).toMatchObject({ code: "INVALID_PARAMETER", path: "parameters[0].value" });
  });

  it("requires bounds for sliders", () => {
    const issues = issuesOf(variant((s) => delete s.parameters[0].max));
    expect(issues[0]).toMatchObject({ code: "INVALID_PARAMETER", path: "parameters[0].control" });
  });

  it("rejects number-only fields on boolean parameters", () => {
    const issues = issuesOf(variant((s) => (s.parameters[1].min = 0)));
    expect(issues[0]?.path).toBe("parameters[1]");
  });

  it("rejects unknown units", () => {
    const issues = issuesOf(variant((s) => (s.parameters[0].unit = "m/s")));
    expect(issues[0]?.path).toBe("parameters[0].unit");
  });
});

describe("validateSpec — IDs and references", () => {
  it("rejects duplicate object IDs", () => {
    const issues = issuesOf(variant((s) => (s.objects[1].id = "A")));
    expect(issues[0]).toMatchObject({
      code: "DUPLICATE_ID",
      path: "objects[1].id",
      details: { id: "A", firstPath: "objects[0].id" },
    });
  });

  it("treats parameters and objects as one namespace", () => {
    const issues = issuesOf(variant((s) => (s.objects[0].id = "theta")));
    expect(issues[0]).toMatchObject({ code: "DUPLICATE_ID", path: "objects[0].id" });
  });

  it("rejects missing segment endpoints", () => {
    const issues = issuesOf(variant((s) => (s.objects[2].to = "C")));
    expect(issues[0]).toMatchObject({ code: "MISSING_REFERENCE", path: "objects[2].to" });
  });

  it("rejects segment endpoints that are not points", () => {
    const issues = issuesOf(variant((s) => (s.objects[2].to = "wave")));
    expect(issues[0]).toMatchObject({
      code: "INVALID_REFERENCE_TYPE",
      details: { expected: "point", actual: "curve" },
    });
  });

  it("rejects segment endpoints that are parameters", () => {
    const issues = issuesOf(variant((s) => (s.objects[2].to = "theta")));
    expect(issues[0]).toMatchObject({ code: "INVALID_REFERENCE_TYPE", path: "objects[2].to" });
  });

  it("requires visible to reference a boolean parameter", () => {
    expect(issuesOf(variant((s) => (s.objects[2].visible = "nope")))[0]?.code).toBe(
      "MISSING_REFERENCE",
    );
    expect(issuesOf(variant((s) => (s.objects[2].visible = "theta")))[0]?.code).toBe(
      "INVALID_REFERENCE_TYPE",
    );
  });

  it("rejects a curve variable that shadows an ID", () => {
    const issues = issuesOf(variant((s) => (s.objects[3].variable = "theta")));
    expect(issues[0]).toMatchObject({ code: "DUPLICATE_ID", path: "objects[3].variable" });
  });

  it("reports every problem, not just the first", () => {
    const issues = issuesOf(
      variant((s) => {
        s.objects[1].id = "A";
        s.objects[2].to = "missing";
      }),
    );
    expect(issues.map((i) => i.code)).toEqual(["DUPLICATE_ID", "MISSING_REFERENCE"]);
  });
});

describe("getSceneSpecJsonSchema", () => {
  it("returns a JSON Schema that serializes", () => {
    const schema = getSceneSpecJsonSchema();
    expect(schema.$schema).toContain("json-schema.org");
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    expect(getSceneSpecJsonSchema()).toBe(schema);
  });
});
