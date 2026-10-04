import { EyeVizError, type EyeVizIssue } from "@alumieye/eyeviz-spec";
import { compileScene, isSceneModel } from "./compile";
import { evaluateObject, type EvaluationContext } from "./evaluate";
import { TIME_SYMBOL, type ObjectModel, type ParameterModel, type SceneModel } from "./model";
import type { ObjectState, SceneState } from "./state";

export interface EngineOptions {
  /** Samples per curve. Default 256, at most 4096. Lowered automatically for scenes with many curves. */
  readonly curveSamples?: number;
}

export const ENGINE_LIMITS = Object.freeze({
  defaultCurveSamples: 256,
  maxCurveSamples: 4096,
  maxTotalCurveSamples: 100_000,
});

export type StateListener = (state: SceneState, changed: ReadonlySet<string>) => void;

export type ParameterValues = Readonly<Record<string, number | boolean>>;

/**
 * The deterministic EyeViz runtime. Given the same spec, parameter values and time it always
 * produces the same state. Has no DOM, renderer or framework dependencies.
 *
 * ```ts
 * const engine = new EyeVizEngine(spec);
 * engine.setParameter("theta", 60);
 * engine.setTime(1.5);
 * const state = engine.getState();
 * ```
 */
export class EyeVizEngine {
  readonly model: SceneModel;

  readonly #curveSamples: number;
  readonly #parameterList: readonly ParameterModel[];
  readonly #listeners = new Set<StateListener>();
  #values: Record<string, number | boolean>;
  #state: SceneState;

  /**
   * @param input An untrusted Scene Spec, or a model returned by `compileScene`.
   * @throws EyeVizError with all validation issues if the spec is invalid.
   */
  constructor(input: unknown, options: EngineOptions = {}) {
    if (isSceneModel(input)) {
      this.model = input;
    } else {
      const result = compileScene(input);
      if (!result.ok) throw new EyeVizError(result.issues);
      this.model = result.model;
    }

    let curves = 0;
    for (const object of this.model.objects.values()) if (object.type === "curve") curves++;
    const requested = clamp(
      Math.floor(options.curveSamples ?? ENGINE_LIMITS.defaultCurveSamples),
      2,
      ENGINE_LIMITS.maxCurveSamples,
    );
    this.#curveSamples =
      curves > 0
        ? Math.max(2, Math.min(requested, Math.floor(ENGINE_LIMITS.maxTotalCurveSamples / curves)))
        : requested;

    this.#parameterList = Object.freeze([...this.model.parameters.values()]);
    this.#values = Object.freeze(
      Object.fromEntries(this.#parameterList.map((p) => [p.id, p.defaultValue])),
    );
    this.#state = this.#evaluate(0, this.#values).state;
  }

  getState(): SceneState {
    return this.#state;
  }

  getTime(): number {
    return this.#state.time;
  }

  /** Parameter definitions in spec order (for generating controls). */
  getParameters(): readonly ParameterModel[] {
    return this.#parameterList;
  }

  /** Current value in the parameter's declared unit. */
  getParameterValue(id: string): number | boolean {
    this.#parameter(id);
    return this.#values[id] as number | boolean;
  }

  /**
   * Sets one parameter. Numbers are clamped to `[min, max]`.
   * @throws EyeVizError for an unknown parameter or a value of the wrong type.
   */
  setParameter(id: string, value: number | boolean): void {
    this.setParameters({ [id]: value });
  }

  /** Sets several parameters at once, producing a single state update. */
  setParameters(values: ParameterValues): void {
    const next = { ...this.#values };
    const changed = new Set<string>();
    for (const [id, raw] of Object.entries(values)) {
      const parameter = this.#parameter(id);
      const value = coerce(parameter, raw);
      if (next[id] !== value) {
        next[id] = value;
        changed.add(id);
      }
    }
    if (changed.size === 0) return;
    this.#values = Object.freeze(next);
    this.#commit(this.#evaluate(this.#state.time, this.#values, this.#state, changed));
  }

  /** Sets the scene time `t` in seconds. */
  setTime(time: number): void {
    if (!Number.isFinite(time)) {
      throw new EyeVizError([
        {
          code: "INVALID_PARAMETER",
          message: `Time must be a finite number, got ${time}`,
          path: "",
        },
      ]);
    }
    if (time === this.#state.time) return;
    this.#commit(this.#evaluate(time, this.#values, this.#state, new Set([TIME_SYMBOL])));
  }

  /** Called synchronously after every state change with the IDs of changed objects. */
  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #parameter(id: string): ParameterModel {
    const parameter = this.model.parameters.get(id);
    if (!parameter) {
      throw new EyeVizError([
        {
          code: "MISSING_REFERENCE",
          message: `Unknown parameter '${id}'`,
          path: "",
          details: { id },
        },
      ]);
    }
    return parameter;
  }

  #commit(next: { state: SceneState; changed: ReadonlySet<string> }): void {
    this.#state = next.state;
    for (const listener of [...this.#listeners]) listener(next.state, next.changed);
  }

  /**
   * Evaluates a new state. Without `previous`, every object is evaluated; otherwise only the
   * objects affected by `changedSymbols`, and unchanged object states are reused.
   */
  #evaluate(
    time: number,
    values: Readonly<Record<string, number | boolean>>,
    previous?: SceneState,
    changedSymbols?: ReadonlySet<string>,
  ): { state: SceneState; changed: ReadonlySet<string> } {
    const scope: Record<string, number> = Object.create(null);
    const booleans: Record<string, boolean> = Object.create(null);
    for (const parameter of this.#parameterList) {
      const value = values[parameter.id];
      if (parameter.kind === "boolean") booleans[parameter.id] = value as boolean;
      // Degree parameters are converted exactly once, here (docs/adr/0005-angle-units.md).
      else
        scope[parameter.id] =
          parameter.unit === "deg" ? ((value as number) * Math.PI) / 180 : (value as number);
    }
    scope[TIME_SYMBOL] = time;

    const affected = previous && changedSymbols ? this.#affected(changedSymbols) : undefined;
    const objects: Record<string, ObjectState> = previous ? { ...previous.objects } : {};
    const context: EvaluationContext = {
      scope,
      booleans,
      curveSamples: this.#curveSamples,
      objects,
    };
    for (const id of this.model.order) {
      if (affected && !affected.has(id)) continue;
      objects[id] = evaluateObject(this.model.objects.get(id) as ObjectModel, context);
    }

    const state: SceneState = Object.freeze({
      time,
      parameters: previous && previous.parameters === values ? previous.parameters : values,
      objects: Object.freeze(objects),
      issues: collectIssues(objects, this.model.order),
    });
    return { state, changed: affected ?? new Set(this.model.order) };
  }

  /** Objects that (transitively) depend on any of `symbols`. */
  #affected(symbols: ReadonlySet<string>): Set<string> {
    const affected = new Set<string>();
    const queue = [...symbols];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      for (const dependent of this.model.dependents.get(key) ?? []) {
        if (!affected.has(dependent)) {
          affected.add(dependent);
          queue.push(dependent);
        }
      }
    }
    return affected;
  }
}

function collectIssues(
  objects: Readonly<Record<string, ObjectState>>,
  order: readonly string[],
): readonly EyeVizIssue[] {
  const issues: EyeVizIssue[] = [];
  for (const id of order) issues.push(...(objects[id] as ObjectState).issues);
  return Object.freeze(issues);
}

function coerce(parameter: ParameterModel, value: unknown): number | boolean {
  if (parameter.kind === "boolean") {
    if (typeof value !== "boolean") throw typeError(parameter, "a boolean", value);
    return value;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw typeError(parameter, "a finite number", value);
  }
  return clamp(value, parameter.min ?? -Infinity, parameter.max ?? Infinity);
}

function typeError(parameter: ParameterModel, expected: string, value: unknown): EyeVizError {
  return new EyeVizError([
    {
      code: "INVALID_PARAMETER",
      message: `Parameter '${parameter.id}' expects ${expected}, got ${JSON.stringify(value) ?? String(value)}`,
      path: `parameters[${parameter.index}]`,
      details: { id: parameter.id },
    },
  ]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
