/** Sensible defaults for objects and parameters created from an editor's "Add" menu. */
import { SUPPORTED_CONSTANTS, SUPPORTED_FUNCTIONS } from "@alumieye/eyeviz-math";
import type {
  ParameterSpec,
  SceneObjectSpec,
  SceneObjectType,
  SceneSpec,
  StepSpec,
} from "@alumieye/eyeviz-spec";
import { usedIds } from "./scalars";

const RESERVED = new Set(["t", ...SUPPORTED_CONSTANTS, ...SUPPORTED_FUNCTIONS]);

/** `prefix` if free, else `prefix1`, `prefix2`… (never a reserved name). */
export function uniqueId(spec: SceneSpec, prefix: string): string {
  const used = usedIds(spec);
  const free = (id: string) => !used.has(id) && !RESERVED.has(id);
  if (free(prefix)) return prefix;
  for (let n = 1; ; n++) if (free(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** Next free point name in the A, B, C… tradition (skipping E, which is not reserved but confusing), then P1, P2… */
export function nextPointName(spec: SceneSpec): string {
  const used = usedIds(spec);
  for (const letter of "ABCDFGHIJKLMNOPQRSTUVWXYZ") if (!used.has(letter)) return letter;
  return uniqueId(spec, "P");
}

/** The kinds of things an editor can add. */
export type NewItemKind = SceneObjectType | "graph" | "number" | "toggle";

/**
 * Creates a new object with defaults that render immediately. Segments connect the last two
 * points; labels attach to the last point. Returns `undefined` if a segment needs more points.
 */
export function createObject(spec: SceneSpec, type: NewItemKind): SceneObjectSpec | undefined {
  const points = spec.objects.filter((o) => o.type === "point").map((o) => o.id);
  const variable = (preferred: string, fallback: string) =>
    usedIds(spec).has(preferred) ? fallback : preferred;
  switch (type) {
    case "point":
      return { id: nextPointName(spec), type: "point", position: [1, 1, 0] };
    case "segment": {
      if (points.length < 2) return undefined;
      const [from, to] = points.slice(-2) as [string, string];
      return { id: uniqueId(spec, `${from}${to}`), type: "segment", from, to };
    }
    case "vector":
      return { id: uniqueId(spec, "v"), type: "vector", components: [2, 1, 0] };
    case "plane":
      return {
        id: uniqueId(spec, "plane"),
        type: "plane",
        point: [0, 0, 0],
        normal: [0, 0, 1],
        extent: 3,
      };
    case "curve":
    case "graph": {
      const x = variable("x", "u");
      return {
        id: uniqueId(spec, "graph"),
        type: "curve",
        variable: x,
        domain: [-5, 5],
        position: [x, `sin(${x})`, 0],
      };
    }
    case "surface": {
      const [x, y] = [variable("x", "u"), variable("y", "v")];
      return {
        id: uniqueId(spec, "surface"),
        type: "surface",
        variables: [x, y],
        domain: { [x]: [-2, 2], [y]: [-2, 2] },
        position: [x, y, `(${x}^2 - ${y}^2)/4`],
      };
    }
    case "label":
      return {
        id: uniqueId(spec, "label"),
        type: "label",
        text: "Label",
        at: points.at(-1) ?? [0, 0, 0],
      };
    case "number":
    case "toggle":
      return undefined;
  }
}

/** Creates a new parameter: a slider from 0 to 5, or an on/off toggle. */
export function createParameter(spec: SceneSpec, kind: "number" | "toggle"): ParameterSpec {
  if (kind === "toggle") {
    return { id: uniqueId(spec, "show"), value: true, label: "Show", control: "toggle" };
  }
  const id = uniqueId(spec, "a");
  return { id, value: 1, min: 0, max: 5, step: 0.1, label: id, control: "slider" };
}

/** Creates a new, empty step. */
export function createStep(spec: SceneSpec): StepSpec {
  const ids = new Set((spec.steps ?? []).map((s) => s.id));
  let n = (spec.steps?.length ?? 0) + 1;
  while (ids.has(`step${n}`)) n++;
  return { id: `step${n}`, title: `Step ${n}` };
}

/** A minimal valid scene to start from. */
export function emptyScene(dimension: "2d" | "3d" = "3d"): SceneSpec {
  return {
    version: "0.1",
    metadata: { title: "Untitled scene" },
    ...(dimension === "2d" ? { scene: { dimension: "2d" } } : {}),
    objects: [],
  };
}
