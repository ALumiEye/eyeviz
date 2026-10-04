/**
 * Scene Spec → Scene Model.
 *
 * 1. structural + referential validation (`@alumieye/eyeviz-spec`)
 * 2. reserved names
 * 3. expression compilation and symbol validation (`@alumieye/eyeviz-math`)
 * 4. dependency graph and evaluation order (cycle detection)
 *
 * Every issue found is reported, not just the first.
 */
import {
  compileExpression,
  isFunctionName,
  SUPPORTED_CONSTANTS,
  SUPPORTED_FUNCTIONS,
} from "@alumieye/eyeviz-math";
import {
  validateSpec,
  type Anchor,
  type EyeVizIssue,
  type Scalar,
  type SceneObjectSpec,
  type SceneSpec,
  type Vec3,
} from "@alumieye/eyeviz-spec";
import {
  TIME_SYMBOL,
  type AnchorModel,
  type ObjectModel,
  type PlaneModel,
  type ParameterModel,
  type ScalarModel,
  type SceneModel,
  type StepModel,
  type TimelineModel,
  type Vec3Model,
  type VisibilityModel,
} from "./model";
import { suggest } from "./suggest";

export type CompileResult =
  | { readonly ok: true; readonly model: SceneModel }
  | { readonly ok: false; readonly issues: readonly EyeVizIssue[] };

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  TIME_SYMBOL,
  ...SUPPORTED_CONSTANTS,
  ...SUPPORTED_FUNCTIONS,
]);

const compiledModels = new WeakSet<object>();

/** True if `value` is a model produced by `compileScene` (and therefore already validated). */
export function isSceneModel(value: unknown): value is SceneModel {
  return typeof value === "object" && value !== null && compiledModels.has(value);
}

/** Validates and compiles untrusted input into a Scene Model. Never throws for bad input. */
export function compileScene(input: unknown): CompileResult {
  const validation = validateSpec(input);
  if (!validation.ok) return validation;
  return new Compiler(validation.spec).run();
}

class Compiler {
  private readonly issues: EyeVizIssue[] = [];
  private readonly numberParameters = new Set<string>();
  private readonly booleanParameters = new Set<string>();
  private readonly objectIds = new Set<string>();

  constructor(private readonly spec: SceneSpec) {}

  run(): CompileResult {
    const parameters = this.compileParameters();
    for (const object of this.spec.objects) this.objectIds.add(object.id);
    this.checkReservedNames();

    const objects = new Map<string, ObjectModel>();
    this.spec.objects.forEach((object, index) => {
      objects.set(object.id, this.compileObject(object, index));
    });

    const timeline = this.compileTimeline();
    const order = this.evaluationOrder(objects);
    if (this.issues.length > 0) return { ok: false, issues: this.issues };

    const dependents = new Map<string, Set<string>>();
    for (const object of objects.values()) {
      for (const dependency of object.dependencies) {
        let set = dependents.get(dependency);
        if (!set) dependents.set(dependency, (set = new Set()));
        set.add(object.id);
      }
    }

    const model: SceneModel = Object.freeze({
      version: this.spec.version,
      metadata: Object.freeze({ ...this.spec.metadata }),
      scene: Object.freeze({
        dimension: this.spec.scene?.dimension ?? "3d",
        axes: this.spec.scene?.axes ?? true,
        grid: this.spec.scene?.grid ?? true,
      }),
      ...(this.spec.camera ? { camera: this.spec.camera } : {}),
      ...(timeline ? { timeline } : {}),
      animated: timeline !== undefined || dependents.has(TIME_SYMBOL),
      ...this.compileSteps(),
      parameters,
      objects,
      order,
      dependents,
    });
    compiledModels.add(model);
    return { ok: true, model };
  }

  private compileParameters(): Map<string, ParameterModel> {
    const parameters = new Map<string, ParameterModel>();
    this.spec.parameters?.forEach((p, index) => {
      const common = {
        id: p.id,
        index,
        interactive: p.interactive ?? true,
        ...(p.label !== undefined ? { label: p.label } : {}),
      };
      if (typeof p.value === "number") {
        const n = p as Extract<typeof p, { value: number }>;
        this.numberParameters.add(p.id);
        parameters.set(p.id, {
          kind: "number",
          ...common,
          defaultValue: n.value,
          ...(n.min !== undefined ? { min: n.min } : {}),
          ...(n.max !== undefined ? { max: n.max } : {}),
          ...(n.step !== undefined ? { step: n.step } : {}),
          ...(n.unit !== undefined ? { unit: n.unit } : {}),
          ...(n.control !== undefined ? { control: n.control } : {}),
        });
      } else {
        const b = p as Extract<typeof p, { value: boolean }>;
        this.booleanParameters.add(p.id);
        parameters.set(p.id, {
          kind: "boolean",
          ...common,
          defaultValue: b.value,
          ...(b.control !== undefined ? { control: b.control } : {}),
        });
      }
    });
    return parameters;
  }

  private compileSteps(): { steps: readonly StepModel[]; stepTargets: ReadonlySet<string> } {
    const specs = this.spec.steps ?? [];
    const targets = new Set<string>();
    for (const step of specs) {
      for (const id of [
        ...(step.show ?? []),
        ...(step.hide ?? []),
        ...(step.highlight ?? []),
        ...(step.focus ?? []),
      ]) {
        targets.add(id);
      }
    }
    // Objects introduced by any step start hidden; show/hide then accumulate step by step.
    const hidden = new Set(specs.flatMap((step) => step.show ?? []));
    const steps = specs.map((step, index): StepModel => {
      for (const id of step.show ?? []) hidden.delete(id);
      for (const id of step.hide ?? []) hidden.add(id);
      return Object.freeze({
        id: step.id,
        index,
        ...(step.title !== undefined ? { title: step.title } : {}),
        ...(step.description !== undefined ? { description: step.description } : {}),
        hidden: new Set(hidden),
        highlight: Object.freeze([...(step.highlight ?? [])]),
        focus: Object.freeze([...(step.focus ?? [])]),
      });
    });
    return { steps: Object.freeze(steps), stepTargets: targets };
  }

  private compileTimeline(): TimelineModel | undefined {
    const spec = this.spec.timeline;
    if (!spec) return undefined;
    const dependencies = new Set<string>();
    let duration: ScalarModel | undefined;
    if (spec.duration !== undefined) {
      duration = this.compileScalar(spec.duration, "timeline.duration", dependencies);
      if (dependencies.has(TIME_SYMBOL)) {
        this.issues.push({
          code: "INVALID_REFERENCE_TYPE",
          message: "The timeline duration cannot depend on time 't' itself",
          path: "timeline.duration",
        });
      }
    }
    return Object.freeze({
      ...(duration ? { duration } : {}),
      loop: spec.loop ?? false,
      autoplay: spec.autoplay ?? false,
      dependencies,
    });
  }

  private checkReservedNames(): void {
    const check = (name: string, path: string) => {
      if (RESERVED_NAMES.has(name)) {
        this.issues.push({
          code: "RESERVED_NAME",
          message: `'${name}' is reserved (time, constants and function names cannot be used as IDs)`,
          path,
          details: { name },
        });
      }
    };
    this.spec.parameters?.forEach((p, i) => check(p.id, `parameters[${i}].id`));
    this.spec.objects.forEach((o, i) => {
      check(o.id, `objects[${i}].id`);
      if (o.type === "curve") check(o.variable, `objects[${i}].variable`);
      if (o.type === "surface") {
        o.variables.forEach((v, j) => check(v, `objects[${i}].variables[${j}]`));
      }
    });
  }

  private compileObject(object: SceneObjectSpec, index: number): ObjectModel {
    const at = `objects[${index}]`;
    const dependencies = new Set<string>();
    const visible: VisibilityModel =
      typeof object.visible === "string"
        ? { kind: "parameter", id: object.visible }
        : { kind: "constant", value: object.visible ?? true };
    if (visible.kind === "parameter") dependencies.add(visible.id);

    const base = {
      id: object.id,
      index,
      visible,
      dependencies,
      ...(object.name !== undefined ? { name: object.name } : {}),
      ...(object.color !== undefined ? { color: object.color } : {}),
    };

    switch (object.type) {
      case "point":
        return {
          ...base,
          type: "point",
          position: this.compileVec3(object.position, `${at}.position`, dependencies),
        };
      case "segment":
        dependencies.add(object.from);
        dependencies.add(object.to);
        return { ...base, type: "segment", from: object.from, to: object.to };
      case "vector":
        return {
          ...base,
          type: "vector",
          origin: this.compileAnchor(object.origin ?? [0, 0, 0], `${at}.origin`, dependencies),
          components: this.compileVec3(object.components, `${at}.components`, dependencies),
        };
      case "plane": {
        const extent =
          object.extent === undefined
            ? undefined
            : this.compileScalar(object.extent, `${at}.extent`, dependencies);
        let form: PlaneModel["form"];
        if (object.through) {
          for (const id of object.through) dependencies.add(id);
          form = { kind: "through", points: object.through };
        } else {
          form = {
            kind: "point-normal",
            point: this.compileAnchor(object.point as Anchor, `${at}.point`, dependencies),
            normal: this.compileVec3(object.normal as Vec3, `${at}.normal`, dependencies),
          };
        }
        return { ...base, type: "plane", form, ...(extent ? { extent } : {}) };
      }
      case "curve":
        return {
          ...base,
          type: "curve",
          variable: object.variable,
          domain: [
            this.compileScalar(object.domain[0], `${at}.domain[0]`, dependencies),
            this.compileScalar(object.domain[1], `${at}.domain[1]`, dependencies),
          ],
          position: this.compileVec3(object.position, `${at}.position`, dependencies, [
            object.variable,
          ]),
        };
      case "surface": {
        const [u, v] = object.variables;
        const range = (variable: string) => {
          const [start, end] = object.domain[variable] as readonly [Scalar, Scalar];
          return [
            this.compileScalar(start, `${at}.domain.${variable}[0]`, dependencies),
            this.compileScalar(end, `${at}.domain.${variable}[1]`, dependencies),
          ] as const;
        };
        return {
          ...base,
          type: "surface",
          variables: [u, v],
          domain: [range(u), range(v)],
          position: this.compileVec3(object.position, `${at}.position`, dependencies, [u, v]),
        };
      }
      case "label":
        return {
          ...base,
          type: "label",
          text: object.text,
          at: this.compileAnchor(object.at, `${at}.at`, dependencies),
        };
    }
  }

  private compileAnchor(anchor: Anchor, path: string, dependencies: Set<string>): AnchorModel {
    if (typeof anchor === "string") {
      dependencies.add(anchor);
      return { kind: "point", id: anchor };
    }
    return { kind: "position", position: this.compileVec3(anchor, path, dependencies) };
  }

  private compileVec3(
    vec: Vec3,
    path: string,
    dependencies: Set<string>,
    locals: readonly string[] = [],
  ): Vec3Model {
    return [
      this.compileScalar(vec[0], `${path}[0]`, dependencies, locals),
      this.compileScalar(vec[1], `${path}[1]`, dependencies, locals),
      this.compileScalar(vec[2], `${path}[2]`, dependencies, locals),
    ];
  }

  private compileScalar(
    value: Scalar,
    path: string,
    dependencies: Set<string>,
    locals: readonly string[] = [],
  ): ScalarModel {
    if (typeof value === "number") return { kind: "constant", value };

    const result = compileExpression(value);
    if (!result.ok) {
      this.issues.push({ ...result.issue, path });
      return { kind: "constant", value: NaN };
    }

    for (const symbol of result.expression.symbols) {
      if (locals.includes(symbol)) continue;
      if (symbol === TIME_SYMBOL || this.numberParameters.has(symbol)) {
        dependencies.add(symbol);
        continue;
      }
      this.issues.push(this.symbolIssue(symbol, value, path, locals));
    }
    return { kind: "expression", expression: result.expression };
  }

  private symbolIssue(
    symbol: string,
    source: string,
    path: string,
    locals: readonly string[],
  ): EyeVizIssue {
    const where = `in expression ${JSON.stringify(source)}`;
    if (this.booleanParameters.has(symbol)) {
      return {
        code: "INVALID_REFERENCE_TYPE",
        message: `Boolean parameter '${symbol}' cannot be used ${where}; only number parameters can`,
        path,
        details: { symbol },
      };
    }
    if (this.objectIds.has(symbol)) {
      return {
        code: "INVALID_REFERENCE_TYPE",
        message: `Object '${symbol}' cannot be used ${where}; expressions may only use number parameters, '${TIME_SYMBOL}'${locals.map((l) => ` and '${l}'`).join("")}`,
        path,
        details: { symbol },
      };
    }
    if (isFunctionName(symbol)) {
      return {
        code: "EXPRESSION_SYNTAX",
        message: `Function '${symbol}' must be called with arguments, e.g. ${symbol}(x), ${where}`,
        path,
        details: { symbol },
      };
    }
    const candidates = [...this.numberParameters, TIME_SYMBOL, ...locals];
    const suggestion = suggest(symbol, candidates);
    return {
      code: "UNKNOWN_SYMBOL",
      message: `Unknown symbol '${symbol}' ${where}${suggestion ? `. Did you mean '${suggestion}'?` : ""}`,
      path,
      details: suggestion ? { symbol, suggestion } : { symbol },
    };
  }

  /** Kahn's algorithm over object → object dependencies; ties keep spec order. */
  private evaluationOrder(objects: ReadonlyMap<string, ObjectModel>): string[] {
    const indegree = new Map<string, number>();
    const users = new Map<string, string[]>();
    for (const object of objects.values()) {
      let count = 0;
      for (const dependency of object.dependencies) {
        if (!objects.has(dependency)) continue;
        count++;
        let list = users.get(dependency);
        if (!list) users.set(dependency, (list = []));
        list.push(object.id);
      }
      indegree.set(object.id, count);
    }

    const order: string[] = [];
    const ready = [...objects.keys()].filter((id) => indegree.get(id) === 0);
    while (ready.length > 0) {
      const id = ready.shift() as string;
      order.push(id);
      for (const user of users.get(id) ?? []) {
        const remaining = (indegree.get(user) as number) - 1;
        indegree.set(user, remaining);
        if (remaining === 0) ready.push(user);
      }
    }

    if (order.length < objects.size) {
      const cyclic = [...objects.values()].filter((o) => (indegree.get(o.id) as number) > 0);
      for (const object of cyclic) {
        this.issues.push({
          code: "CIRCULAR_DEPENDENCY",
          message: `'${object.id}' is part of a circular dependency (${cyclic.map((o) => o.id).join(" → ")})`,
          path: `objects[${object.index}]`,
          details: { cycle: cyclic.map((o) => o.id) },
        });
      }
    }
    return order;
  }
}
