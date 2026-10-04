/** Helpers to find and rewrite the expressions and references inside a spec. */
import { renameSymbol } from "@alumieye/eyeviz-math";
import type { Anchor, Scalar, SceneObjectSpec, SceneSpec, Vec3 } from "@alumieye/eyeviz-spec";

type ScalarMap = (value: string) => string;

const mapScalar = (value: Scalar, fn: ScalarMap): Scalar =>
  typeof value === "string" ? fn(value) : value;
const mapVec3 = (vec: Vec3, fn: ScalarMap): Vec3 => [
  mapScalar(vec[0], fn),
  mapScalar(vec[1], fn),
  mapScalar(vec[2], fn),
];
const mapAnchor = (anchor: Anchor, fn: ScalarMap): Anchor =>
  typeof anchor === "string" ? anchor : mapVec3(anchor, fn);

/** Returns a copy of `object` with `fn` applied to every expression string it contains. */
export function mapObjectExpressions(object: SceneObjectSpec, fn: ScalarMap): SceneObjectSpec {
  switch (object.type) {
    case "point":
      return { ...object, position: mapVec3(object.position, fn) };
    case "segment":
      return object;
    case "vector":
      return {
        ...object,
        ...(object.origin !== undefined ? { origin: mapAnchor(object.origin, fn) } : {}),
        components: mapVec3(object.components, fn),
      };
    case "plane":
      return {
        ...object,
        ...(object.point !== undefined ? { point: mapAnchor(object.point, fn) } : {}),
        ...(object.normal !== undefined ? { normal: mapVec3(object.normal, fn) } : {}),
        ...(object.extent !== undefined ? { extent: mapScalar(object.extent, fn) } : {}),
      };
    case "curve":
      return {
        ...object,
        domain: [mapScalar(object.domain[0], fn), mapScalar(object.domain[1], fn)],
        position: mapVec3(object.position, fn),
      };
    case "surface":
      return {
        ...object,
        domain: Object.fromEntries(
          Object.entries(object.domain).map(([k, [a, b]]) => [
            k,
            [mapScalar(a, fn), mapScalar(b, fn)] as const,
          ]),
        ),
        position: mapVec3(object.position, fn),
      };
    case "label":
      return { ...object, at: mapAnchor(object.at, fn) };
  }
}

/** Every expression string in the object. */
export function objectExpressions(object: SceneObjectSpec): string[] {
  const found: string[] = [];
  mapObjectExpressions(object, (value) => {
    found.push(value);
    return value;
  });
  return found;
}

/** True if `expression` uses the variable `name`. */
export function usesSymbol(expression: string, name: string): boolean {
  return renameSymbol(expression, name, `${name}__probe`) !== expression;
}

/** IDs of objects (points) that `object` references directly. */
export function objectReferences(object: SceneObjectSpec): string[] {
  switch (object.type) {
    case "segment":
      return [object.from, object.to];
    case "vector":
      return typeof object.origin === "string" ? [object.origin] : [];
    case "plane":
      return [
        ...(object.through ?? []),
        ...(typeof object.point === "string" ? [object.point] : []),
      ];
    case "label":
      return typeof object.at === "string" ? [object.at] : [];
    default:
      return [];
  }
}

/** Returns a copy of `object` with references to object `from` renamed to `to`. */
export function renameObjectReferences(
  object: SceneObjectSpec,
  from: string,
  to: string,
): SceneObjectSpec {
  const swap = (id: string) => (id === from ? to : id);
  const swapAnchor = (anchor: Anchor) => (typeof anchor === "string" ? swap(anchor) : anchor);
  switch (object.type) {
    case "segment":
      return { ...object, from: swap(object.from), to: swap(object.to) };
    case "vector":
      return object.origin !== undefined
        ? { ...object, origin: swapAnchor(object.origin) }
        : object;
    case "plane":
      return {
        ...object,
        ...(object.through
          ? { through: object.through.map(swap) as [string, string, string] }
          : {}),
        ...(object.point !== undefined ? { point: swapAnchor(object.point) } : {}),
      };
    case "label":
      return { ...object, at: swapAnchor(object.at) };
    default:
      return object;
  }
}

/** All IDs in use (parameters and objects share one namespace). */
export function usedIds(spec: SceneSpec): Set<string> {
  return new Set([...(spec.parameters ?? []).map((p) => p.id), ...spec.objects.map((o) => o.id)]);
}
