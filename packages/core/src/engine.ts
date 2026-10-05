import { EyeVizError, type EyeVizIssue, type NumberVec3 } from "@alumieye/eyeviz-spec";
import { compileScene, isSceneModel } from "./compile";
import { solveDrag } from "./drag";
import {
  evaluateObject,
  evaluateStandalone,
  evaluateVec3,
  type EvaluationContext,
} from "./evaluate";
import type { ExpressionScope } from "@alumieye/eyeviz-math";
import {
  TIME_SYMBOL,
  type NumberParameterModel,
  type ObjectModel,
  type ParameterModel,
  type SceneModel,
} from "./model";
import type { ObjectState, SceneState } from "./state";

export interface EngineOptions {
  /** Samples per curve. Default 256, at most 4096. Lowered automatically for scenes with many curves. */
  readonly curveSamples?: number;
  /** Samples per side of each surface grid. Default 48, at most 256. Lowered for many surfaces. */
  readonly surfaceSamples?: number;
  /**
   * Samples per side of each implicit curve's grid. Default 128, at most 512. Lowered for scenes
   * with many implicit curves.
   */
  readonly implicitSamples?: number;
}

export const ENGINE_LIMITS = Object.freeze({
  defaultCurveSamples: 256,
  maxCurveSamples: 4096,
  maxTotalCurveSamples: 100_000,
  defaultSurfaceSamples: 48,
  maxSurfaceSamples: 256,
  maxTotalSurfaceVertices: 250_000,
  defaultImplicitSamples: 128,
  maxImplicitSamples: 512,
  maxTotalImplicitVertices: 250_000,
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
  readonly #surfaceSamples: number;
  readonly #implicitSamples: number;
  readonly #parameterList: readonly ParameterModel[];
  readonly #listeners = new Set<StateListener>();
  #values: Record<string, number | boolean>;
  #durationResult: DurationResult = NO_DURATION;
  #step: number | null;
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
    let surfaces = 0;
    let implicits = 0;
    for (const object of this.model.objects.values()) {
      if (object.type === "curve") curves++;
      if (object.type === "surface") surfaces++;
      if (object.type === "implicit") implicits++;
    }
    const requested = clamp(
      Math.floor(options.curveSamples ?? ENGINE_LIMITS.defaultCurveSamples),
      2,
      ENGINE_LIMITS.maxCurveSamples,
    );
    this.#curveSamples =
      curves > 0
        ? Math.max(2, Math.min(requested, Math.floor(ENGINE_LIMITS.maxTotalCurveSamples / curves)))
        : requested;
    const requestedSurface = clamp(
      Math.floor(options.surfaceSamples ?? ENGINE_LIMITS.defaultSurfaceSamples),
      2,
      ENGINE_LIMITS.maxSurfaceSamples,
    );
    this.#surfaceSamples =
      surfaces > 0
        ? Math.max(
            2,
            Math.min(
              requestedSurface,
              Math.floor(Math.sqrt(ENGINE_LIMITS.maxTotalSurfaceVertices / surfaces)),
            ),
          )
        : requestedSurface;
    const requestedImplicit = clamp(
      Math.floor(options.implicitSamples ?? ENGINE_LIMITS.defaultImplicitSamples),
      2,
      ENGINE_LIMITS.maxImplicitSamples,
    );
    this.#implicitSamples =
      implicits > 0
        ? Math.max(
            2,
            Math.min(
              requestedImplicit,
              Math.floor(Math.sqrt(ENGINE_LIMITS.maxTotalImplicitVertices / implicits)),
            ),
          )
        : requestedImplicit;

    this.#parameterList = Object.freeze([...this.model.parameters.values()]);
    this.#values = Object.freeze(
      Object.fromEntries(this.#parameterList.map((p) => [p.id, p.defaultValue])),
    );
    // A lesson starts at its first step; setStep(null) shows the whole scene.
    this.#step = this.model.steps.length > 0 ? 0 : null;
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

  /** True if the point with `id` declares `drag` parameters. */
  isDraggable(id: string): boolean {
    const object = this.model.objects.get(id);
    return object?.type === "point" && object.drag !== undefined;
  }

  /**
   * Moves a draggable point as close as possible to `target` by changing its `drag`
   * parameters (respecting their min, max and step). The point's formula acts as the
   * constraint, e.g. a point defined by an angle stays on its circle.
   * @throws EyeVizError if the point does not exist or is not draggable.
   */
  dragPoint(id: string, target: NumberVec3): void {
    const point = this.model.objects.get(id);
    if (point?.type !== "point" || !point.drag) {
      throw new EyeVizError([
        {
          code: "INVALID_PARAMETER",
          message: `'${id}' is not a draggable point`,
          path: "",
          details: { id },
        },
      ]);
    }
    if (!target.every(Number.isFinite)) return;
    const parameters = point.drag.map((p) => this.model.parameters.get(p) as NumberParameterModel);
    const time = this.#state.time;
    const values = { ...this.#values };
    const solved = solveDrag(
      (candidate) => {
        parameters.forEach((p, i) => (values[p.id] = candidate[i] as number));
        return evaluateVec3(point.position, this.#scope(values, time).scope);
      },
      parameters.map((p) => this.#values[p.id] as number),
      parameters.map((p) => ({
        ...(p.min !== undefined ? { min: p.min } : {}),
        ...(p.max !== undefined ? { max: p.max } : {}),
        ...(p.step !== undefined ? { step: p.step } : {}),
      })),
      target,
    );
    this.setParameters(Object.fromEntries(parameters.map((p, i) => [p.id, solved[i] as number])));
  }

  /** Steps in order (empty when the scene has none). */
  getSteps(): SceneModel["steps"] {
    return this.model.steps;
  }

  /**
   * Moves to step `index` (0-based), or `null` to show the whole scene.
   * @throws EyeVizError for an index outside the steps.
   */
  setStep(index: number | null): void {
    if (
      index !== null &&
      (!Number.isInteger(index) || index < 0 || index >= this.model.steps.length)
    ) {
      throw new EyeVizError([
        {
          code: "INVALID_PARAMETER",
          message: `Step ${index} does not exist; this scene has ${this.model.steps.length} step(s)`,
          path: "steps",
        },
      ]);
    }
    if (index === this.#step) return;
    this.#step = index;
    this.#commit(
      this.#evaluate(
        this.#state.time,
        this.#values,
        this.#state,
        new Set(),
        this.model.stepTargets,
      ),
    );
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
    alsoAffected?: ReadonlySet<string>,
  ): { state: SceneState; changed: ReadonlySet<string> } {
    const { scope, booleans } = this.#scope(values, time);

    const affected = previous && changedSymbols ? this.#affected(changedSymbols) : undefined;
    for (const id of alsoAffected ?? []) affected?.add(id);
    const step = this.#step === null ? undefined : this.model.steps[this.#step];
    const objects: Record<string, ObjectState> = previous ? { ...previous.objects } : {};
    const context: EvaluationContext = {
      scope,
      booleans,
      curveSamples: this.#curveSamples,
      surfaceSamples: this.#surfaceSamples,
      implicitSamples: this.#implicitSamples,
      stepHidden: step?.hidden ?? NO_IDS,
      objects,
    };
    for (const id of this.model.order) {
      if (affected && !affected.has(id)) continue;
      objects[id] = evaluateObject(this.model.objects.get(id) as ObjectModel, context);
    }

    const timeline = this.model.timeline;
    const durationChanged =
      !previous || [...(changedSymbols ?? [])].some((s) => timeline?.dependencies.has(s));
    const duration = durationChanged ? this.#duration(scope) : this.#durationResult;
    this.#durationResult = duration;
    const issues = collectIssues(objects, this.model.order);

    const state: SceneState = Object.freeze({
      time,
      parameters: previous && previous.parameters === values ? previous.parameters : values,
      objects: Object.freeze(objects),
      issues: duration.issue ? Object.freeze([...issues, duration.issue]) : issues,
      step: this.#step,
      // Keep identities stable while the step does not change, so UIs can compare cheaply.
      highlights:
        previous && previous.step === this.#step
          ? previous.highlights
          : (step?.highlight ?? NO_LIST),
      focus: previous && previous.step === this.#step ? previous.focus : (step?.focus ?? NO_LIST),
      ...(duration.value !== undefined ? { duration: duration.value } : {}),
    });
    return { state, changed: affected ?? new Set(this.model.order) };
  }

  /** Expression scope (numbers, angles in radians) and boolean values for `values` at `time`. */
  #scope(
    values: Readonly<Record<string, number | boolean>>,
    time: number,
  ): { scope: Record<string, number>; booleans: Record<string, boolean> } {
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
    return { scope, booleans };
  }

  /** The timeline duration for the current parameters; invalid values are reported, not thrown. */
  #duration(scope: ExpressionScope): DurationResult {
    const scalar = this.model.timeline?.duration;
    if (!scalar) return NO_DURATION;
    const value = evaluateStandalone(scalar, scope);
    if (Number.isFinite(value) && value > 0) return Object.freeze({ value });
    return Object.freeze({
      issue: {
        code: "EXPRESSION_EVALUATION" as const,
        message: `The timeline duration must be a positive number, got ${String(value)} for the current parameters`,
        path: "timeline.duration",
      },
    });
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

interface DurationResult {
  readonly value?: number;
  readonly issue?: EyeVizIssue;
}

const NO_DURATION: DurationResult = Object.freeze({});
const NO_IDS: ReadonlySet<string> = new Set();
const NO_LIST: readonly string[] = Object.freeze([]);

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
