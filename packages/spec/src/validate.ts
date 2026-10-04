import type * as z from "zod";
import { formatPath, type EyeVizIssue } from "./issues";
import { sceneSpecSchema } from "./schema";
import type { NumberParameterSpec, ParameterSpec, SceneObjectSpec, SceneSpec } from "./types";
import { SPEC_VERSION } from "./version";

export type ValidationResult =
  | { readonly ok: true; readonly spec: SceneSpec }
  | { readonly ok: false; readonly issues: readonly EyeVizIssue[] };

/**
 * Validates untrusted input against the Scene Specification: structure (schema), parameter
 * consistency, unique IDs and references between objects.
 *
 * Expression syntax and symbol checks need the expression engine and are performed by
 * `@alumieye/eyeviz-core` when compiling a scene.
 */
export function validateSpec(input: unknown): ValidationResult {
  const versionIssue = checkVersion(input);
  if (versionIssue) return { ok: false, issues: [versionIssue] };

  const parsed = sceneSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.flatMap((issue) => toIssues(issue, [])) };
  }

  const spec: SceneSpec = parsed.data;
  const issues = [...checkParameters(spec), ...checkIdsAndReferences(spec)];
  return issues.length > 0 ? { ok: false, issues } : { ok: true, spec };
}

function checkVersion(input: unknown): EyeVizIssue | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      code: "SCHEMA_VALIDATION",
      message: "A Scene Specification must be a JSON object",
      path: "",
    };
  }
  const version = (input as { version?: unknown }).version;
  if (version === undefined) {
    return {
      code: "SCHEMA_VALIDATION",
      message: `Missing "version". Add "version": "${SPEC_VERSION}"`,
      path: "version",
    };
  }
  if (version !== SPEC_VERSION) {
    return {
      code: "UNSUPPORTED_VERSION",
      message: `Unsupported Scene Specification version ${JSON.stringify(version)}; this runtime supports "${SPEC_VERSION}"`,
      path: "version",
      details: { version, supported: [SPEC_VERSION] },
    };
  }
  return undefined;
}

function toIssues(issue: z.core.$ZodIssue, prefix: readonly PropertyKey[]): EyeVizIssue[] {
  const fullPath = [...prefix, ...issue.path];
  // For a union that matched no branch, report the closest branch (fewest problems) instead
  // of a vague "invalid input": e.g. a number parameter with a bad unit reports the unit.
  if (issue.code === "invalid_union" && issue.errors.length > 0) {
    const closest = issue.errors.reduce((best, branch) =>
      branch.length < best.length ? branch : best,
    );
    return closest.flatMap((inner) => toIssues(inner, fullPath));
  }
  const path = formatPath(fullPath);
  if (issue.code === "unrecognized_keys") {
    const keys = issue.keys.map((k) => `"${k}"`).join(", ");
    return [
      {
        code: "SCHEMA_VALIDATION",
        message: `Unknown field${issue.keys.length > 1 ? "s" : ""} ${keys}`,
        path,
        details: { keys: issue.keys },
      },
    ];
  }
  return [{ code: "SCHEMA_VALIDATION", message: issue.message, path }];
}

function checkParameters(spec: SceneSpec): EyeVizIssue[] {
  const issues: EyeVizIssue[] = [];
  spec.parameters?.forEach((p, i) => {
    if (typeof p.value !== "number") return;
    const n = p as NumberParameterSpec;
    const at = `parameters[${i}]`;
    const invalid = (message: string, field: string) =>
      issues.push({ code: "INVALID_PARAMETER", message, path: `${at}.${field}` });

    if (n.min !== undefined && n.max !== undefined && n.min >= n.max) {
      invalid(`Parameter '${n.id}': min (${n.min}) must be less than max (${n.max})`, "min");
    }
    if (n.min !== undefined && n.value < n.min) {
      invalid(`Parameter '${n.id}': value ${n.value} is below min ${n.min}`, "value");
    }
    if (n.max !== undefined && n.value > n.max) {
      invalid(`Parameter '${n.id}': value ${n.value} is above max ${n.max}`, "value");
    }
    if (n.control === "slider" && (n.min === undefined || n.max === undefined)) {
      invalid(`Parameter '${n.id}': a slider needs both "min" and "max"`, "control");
    }
  });
  return issues;
}

function checkIdsAndReferences(spec: SceneSpec): EyeVizIssue[] {
  const issues: EyeVizIssue[] = [];
  const parameters = new Map<string, { param: ParameterSpec; index: number }>();
  const objects = new Map<string, { object: SceneObjectSpec; index: number }>();
  const firstPath = new Map<string, string>();

  const claim = (id: string, path: string) => {
    const previous = firstPath.get(id);
    if (previous !== undefined) {
      issues.push({
        code: "DUPLICATE_ID",
        message: `Duplicate ID '${id}' (already used at ${previous}). Parameters and objects share one namespace`,
        path,
        details: { id, firstPath: previous },
      });
      return false;
    }
    firstPath.set(id, path);
    return true;
  };

  spec.parameters?.forEach((param, index) => {
    if (claim(param.id, `parameters[${index}].id`)) parameters.set(param.id, { param, index });
  });
  spec.objects.forEach((object, index) => {
    if (claim(object.id, `objects[${index}].id`)) objects.set(object.id, { object, index });
  });

  spec.objects.forEach((object, index) => {
    const at = `objects[${index}]`;

    if (typeof object.visible === "string") {
      const target = parameters.get(object.visible);
      if (!target) {
        issues.push(missing(object.visible, "boolean parameter", `${at}.visible`));
      } else if (typeof target.param.value !== "boolean") {
        issues.push({
          code: "INVALID_REFERENCE_TYPE",
          message: `"visible" of '${object.id}' must reference a boolean parameter; '${object.visible}' is a number parameter`,
          path: `${at}.visible`,
          details: { id: object.visible, expected: "boolean parameter" },
        });
      }
    }

    if (object.type === "segment") {
      for (const field of ["from", "to"] as const) {
        const ref = object[field];
        const target = objects.get(ref);
        if (!target) {
          issues.push(
            parameters.has(ref)
              ? wrongType(ref, "point", "parameter", `${at}.${field}`)
              : missing(ref, "point", `${at}.${field}`),
          );
        } else if (target.object.type !== "point") {
          issues.push(wrongType(ref, "point", target.object.type, `${at}.${field}`));
        }
      }
    }

    if (object.type === "curve" && firstPath.has(object.variable)) {
      issues.push({
        code: "DUPLICATE_ID",
        message: `Curve variable '${object.variable}' of '${object.id}' collides with the ID at ${firstPath.get(object.variable)}`,
        path: `${at}.variable`,
        details: { id: object.variable },
      });
    }
  });

  return issues;
}

function missing(id: string, expected: string, path: string): EyeVizIssue {
  return {
    code: "MISSING_REFERENCE",
    message: `Reference to unknown ${expected} '${id}'`,
    path,
    details: { id, expected },
  };
}

function wrongType(id: string, expected: string, actual: string, path: string): EyeVizIssue {
  return {
    code: "INVALID_REFERENCE_TYPE",
    message: `'${id}' is a ${actual}, but a ${expected} is required here`,
    path,
    details: { id, expected, actual },
  };
}
