/**
 * Typed, serializable edit commands on Scene Specifications. Commands are plain JSON, so a
 * UI, a script or a program generating edits can all use them. Each command returns a new
 * spec (the input is never mutated) or an explanation of why it cannot be applied.
 *
 * Commands keep references consistent (renaming updates every use; removing a point removes
 * what depends on it). They do not validate expressions — `compileScene` does that — so an
 * editor can hold a work-in-progress formula.
 */
import { renameSymbol } from "@alumieye/eyeviz-math";
import {
  ID_PATTERN,
  type ParameterSpec,
  type SceneMetadata,
  type SceneObjectSpec,
  type SceneSettings,
  type SceneSpec,
  type StepSpec,
  type TimelineSpec,
  type CameraSpec,
} from "@alumieye/eyeviz-spec";
import {
  mapObjectExpressions,
  objectExpressions,
  objectReferences,
  renameObjectReferences,
  usedIds,
  usesSymbol,
} from "./scalars";

/** Field changes: a value sets the field; `null` removes an optional field. */
export type Changes = Readonly<Record<string, unknown>>;

export type EditCommand =
  | { readonly op: "addObject"; readonly object: SceneObjectSpec; readonly index?: number }
  | { readonly op: "updateObject"; readonly id: string; readonly changes: Changes }
  | { readonly op: "removeObject"; readonly id: string }
  | { readonly op: "moveObject"; readonly id: string; readonly index: number }
  | { readonly op: "addParameter"; readonly parameter: ParameterSpec; readonly index?: number }
  | { readonly op: "updateParameter"; readonly id: string; readonly changes: Changes }
  | { readonly op: "removeParameter"; readonly id: string }
  | { readonly op: "rename"; readonly from: string; readonly to: string }
  | { readonly op: "addStep"; readonly step: StepSpec; readonly index?: number }
  | { readonly op: "updateStep"; readonly id: string; readonly changes: Changes }
  | { readonly op: "removeStep"; readonly id: string }
  | { readonly op: "moveStep"; readonly id: string; readonly index: number }
  | { readonly op: "setMetadata"; readonly value: SceneMetadata | null }
  | { readonly op: "setScene"; readonly value: SceneSettings | null }
  | { readonly op: "setCamera"; readonly value: CameraSpec | null }
  | { readonly op: "setTimeline"; readonly value: TimelineSpec | null };

export type EditErrorCode =
  "NOT_FOUND" | "DUPLICATE_ID" | "INVALID_ID" | "IN_USE" | "INVALID_COMMAND";

export interface EditError {
  readonly code: EditErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type EditResult =
  | {
      readonly ok: true;
      readonly spec: SceneSpec;
      /** Human-readable summary, e.g. for an undo menu. */
      readonly summary: string;
      /** IDs removed as a consequence (e.g. segments of a removed point). */
      readonly removed?: readonly string[];
    }
  | { readonly ok: false; readonly error: EditError };

const fail = (
  code: EditErrorCode,
  message: string,
  details?: Record<string, unknown>,
): EditResult => ({
  ok: false,
  error: details ? { code, message, details } : { code, message },
});

/** Fields that commands may never change through `changes` (use rename / remove + add). */
const FIXED_FIELDS = new Set(["id", "type"]);

/** Applies one command. Never mutates `spec`. */
export function applyCommand(spec: SceneSpec, command: EditCommand): EditResult {
  switch (command.op) {
    case "addObject": {
      const id = command.object.id;
      const problem = checkNewId(spec, id);
      if (problem) return problem;
      return done(
        { ...spec, objects: insert(spec.objects, command.object, command.index) },
        `Add ${command.object.type} ${id}`,
      );
    }

    case "updateObject": {
      const index = spec.objects.findIndex((o) => o.id === command.id);
      if (index < 0) return fail("NOT_FOUND", `There is no object '${command.id}'`);
      const fixed = Object.keys(command.changes).find((k) => FIXED_FIELDS.has(k));
      if (fixed)
        return fail(
          "INVALID_COMMAND",
          `'${fixed}' cannot be changed here; use rename, or remove and add`,
        );
      const updated = withChanges(spec.objects[index] as SceneObjectSpec, command.changes);
      return done(
        { ...spec, objects: replaceAt(spec.objects, index, updated) },
        `Edit ${command.id}`,
      );
    }

    case "removeObject": {
      if (!spec.objects.some((o) => o.id === command.id)) {
        return fail("NOT_FOUND", `There is no object '${command.id}'`);
      }
      // Remove the object and everything that references it, transitively.
      const removed = new Set([command.id]);
      for (let grew = true; grew;) {
        grew = false;
        for (const object of spec.objects) {
          if (!removed.has(object.id) && objectReferences(object).some((r) => removed.has(r))) {
            removed.add(object.id);
            grew = true;
          }
        }
      }
      const steps = spec.steps?.map((step) => withoutIds(step, removed));
      return done(
        {
          ...spec,
          objects: spec.objects.filter((o) => !removed.has(o.id)),
          ...(steps ? { steps } : {}),
        },
        removed.size > 1
          ? `Remove ${command.id} and ${removed.size - 1} dependent object(s)`
          : `Remove ${command.id}`,
        [...removed].filter((id) => id !== command.id),
      );
    }

    case "moveObject": {
      const index = spec.objects.findIndex((o) => o.id === command.id);
      if (index < 0) return fail("NOT_FOUND", `There is no object '${command.id}'`);
      return done(
        { ...spec, objects: move(spec.objects, index, command.index) },
        `Move ${command.id}`,
      );
    }

    case "addParameter": {
      const id = command.parameter.id;
      const problem = checkNewId(spec, id);
      if (problem) return problem;
      return done(
        { ...spec, parameters: insert(spec.parameters ?? [], command.parameter, command.index) },
        `Add parameter ${id}`,
      );
    }

    case "updateParameter": {
      const parameters = spec.parameters ?? [];
      const index = parameters.findIndex((p) => p.id === command.id);
      if (index < 0) return fail("NOT_FOUND", `There is no parameter '${command.id}'`);
      if (Object.hasOwn(command.changes, "id"))
        return fail("INVALID_COMMAND", "Use rename to change an ID");
      const updated = withChanges(parameters[index] as ParameterSpec, command.changes);
      return done(
        { ...spec, parameters: replaceAt(parameters, index, updated) },
        `Edit parameter ${command.id}`,
      );
    }

    case "removeParameter": {
      if (!(spec.parameters ?? []).some((p) => p.id === command.id)) {
        return fail("NOT_FOUND", `There is no parameter '${command.id}'`);
      }
      const users = parameterUsers(spec, command.id);
      if (users.length > 0) {
        return fail("IN_USE", `'${command.id}' is still used by ${users.join(", ")}`, { users });
      }
      return done(
        { ...spec, parameters: (spec.parameters ?? []).filter((p) => p.id !== command.id) },
        `Remove parameter ${command.id}`,
      );
    }

    case "rename":
      return rename(spec, command.from, command.to);

    case "addStep": {
      const steps = spec.steps ?? [];
      if (!ID_PATTERN.test(command.step.id))
        return fail("INVALID_ID", invalidIdMessage(command.step.id));
      if (steps.some((s) => s.id === command.step.id)) {
        return fail("DUPLICATE_ID", `There is already a step '${command.step.id}'`);
      }
      return done(
        { ...spec, steps: insert(steps, command.step, command.index) },
        `Add step ${command.step.id}`,
      );
    }

    case "updateStep": {
      const steps = spec.steps ?? [];
      const index = steps.findIndex((s) => s.id === command.id);
      if (index < 0) return fail("NOT_FOUND", `There is no step '${command.id}'`);
      const changes = command.changes;
      if (typeof changes.id === "string" && changes.id !== command.id) {
        if (!ID_PATTERN.test(changes.id)) return fail("INVALID_ID", invalidIdMessage(changes.id));
        if (steps.some((s) => s.id === changes.id))
          return fail("DUPLICATE_ID", `There is already a step '${changes.id}'`);
      }
      return done(
        { ...spec, steps: replaceAt(steps, index, withChanges(steps[index] as StepSpec, changes)) },
        `Edit step ${command.id}`,
      );
    }

    case "removeStep": {
      const steps = spec.steps ?? [];
      if (!steps.some((s) => s.id === command.id))
        return fail("NOT_FOUND", `There is no step '${command.id}'`);
      const rest = steps.filter((s) => s.id !== command.id);
      const { steps: _removed, ...withoutSteps } = spec;
      return done(
        rest.length > 0 ? { ...spec, steps: rest } : withoutSteps,
        `Remove step ${command.id}`,
      );
    }

    case "moveStep": {
      const steps = spec.steps ?? [];
      const index = steps.findIndex((s) => s.id === command.id);
      if (index < 0) return fail("NOT_FOUND", `There is no step '${command.id}'`);
      return done({ ...spec, steps: move(steps, index, command.index) }, `Move step ${command.id}`);
    }

    case "setMetadata":
      return done(setSection(spec, "metadata", command.value), "Edit title and description");
    case "setScene":
      return done(setSection(spec, "scene", command.value), "Edit scene settings");
    case "setCamera":
      return done(setSection(spec, "camera", command.value), "Edit camera");
    case "setTimeline":
      return done(setSection(spec, "timeline", command.value), "Edit timeline");
  }
}

/** Objects, steps or settings that use parameter `id` (by name). */
export function parameterUsers(spec: SceneSpec, id: string): string[] {
  const users: string[] = [];
  for (const object of spec.objects) {
    const inExpressions = objectExpressions(object).some((e) => usesSymbol(e, id));
    const inVisible = object.visible === id;
    const inDrag = object.type === "point" && object.drag?.includes(id);
    if (inExpressions || inVisible || inDrag) users.push(object.id);
  }
  const duration = spec.timeline?.duration;
  if (typeof duration === "string" && usesSymbol(duration, id)) users.push("timeline");
  return users;
}

function rename(spec: SceneSpec, from: string, to: string): EditResult {
  if (from === to) return done(spec, `Rename ${from}`);
  const isParameter = (spec.parameters ?? []).some((p) => p.id === from);
  const isObject = spec.objects.some((o) => o.id === from);
  if (!isParameter && !isObject) return fail("NOT_FOUND", `There is nothing named '${from}'`);
  const problem = checkNewId(spec, to);
  if (problem) return problem;

  if (isObject) {
    const objects = spec.objects.map((o) =>
      renameObjectReferences(o.id === from ? { ...o, id: to } : o, from, to),
    );
    const steps = spec.steps?.map((step) => renameInStep(step, from, to));
    return done({ ...spec, objects, ...(steps ? { steps } : {}) }, `Rename ${from} to ${to}`);
  }

  const swap = (value: string) => renameSymbol(value, from, to);
  const parameters = (spec.parameters ?? []).map((p) => (p.id === from ? { ...p, id: to } : p));
  const objects = spec.objects.map((object) => {
    let next = mapObjectExpressions(object, swap);
    if (next.visible === from) next = { ...next, visible: to };
    if (next.type === "point" && next.drag)
      next = { ...next, drag: next.drag.map((d) => (d === from ? to : d)) };
    return next;
  });
  const timeline =
    spec.timeline && typeof spec.timeline.duration === "string"
      ? { ...spec.timeline, duration: swap(spec.timeline.duration) }
      : spec.timeline;
  return done(
    { ...spec, parameters, objects, ...(timeline ? { timeline } : {}) },
    `Rename ${from} to ${to}`,
  );
}

function checkNewId(spec: SceneSpec, id: string): EditResult | undefined {
  if (!ID_PATTERN.test(id)) return fail("INVALID_ID", invalidIdMessage(id));
  if (usedIds(spec).has(id))
    return fail("DUPLICATE_ID", `The name '${id}' is already used`, { id });
  return undefined;
}

function invalidIdMessage(id: string): string {
  return `'${id}' is not a valid name: start with a letter or '_', then letters, digits or '_'`;
}

function done(spec: SceneSpec, summary: string, removed?: string[]): EditResult {
  return removed && removed.length > 0
    ? { ok: true, spec, summary, removed }
    : { ok: true, spec, summary };
}

function withChanges<T extends object>(target: T, changes: Changes): T {
  const next = { ...target } as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

function withoutIds(step: StepSpec, removed: ReadonlySet<string>): StepSpec {
  const next: Record<string, unknown> = { ...step };
  for (const field of ["show", "hide", "highlight", "focus"] as const) {
    const list = step[field];
    if (!list) continue;
    const kept = list.filter((id) => !removed.has(id));
    if (kept.length > 0) next[field] = kept;
    else delete next[field];
  }
  return next as unknown as StepSpec;
}

function renameInStep(step: StepSpec, from: string, to: string): StepSpec {
  const next: Record<string, unknown> = { ...step };
  for (const field of ["show", "hide", "highlight", "focus"] as const) {
    const list = step[field];
    if (list) next[field] = list.map((id) => (id === from ? to : id));
  }
  return next as unknown as StepSpec;
}

function setSection<K extends "metadata" | "scene" | "camera" | "timeline">(
  spec: SceneSpec,
  key: K,
  value: SceneSpec[K] | null,
): SceneSpec {
  const next: Record<string, unknown> = { ...spec };
  if (value === null || value === undefined) delete next[key];
  else next[key] = value;
  return next as unknown as SceneSpec;
}

function insert<T>(list: readonly T[], item: T, index?: number): T[] {
  const at =
    index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(index)));
  return [...list.slice(0, at), item, ...list.slice(at)];
}

function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, Math.floor(to))), 0, item as T);
  return next;
}
