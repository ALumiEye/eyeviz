import {
  compileScene,
  EyeVizEngine,
  type EngineOptions,
  type SceneState,
} from "@alumieye/eyeviz-core";
import type { EyeVizIssue } from "@alumieye/eyeviz-spec";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface UseEyeVizResult {
  /** `null` while the spec is invalid. */
  readonly engine: EyeVizEngine | null;
  /** Validation issues of the current spec; empty when valid. */
  readonly issues: readonly EyeVizIssue[];
}

const NO_ISSUES: readonly EyeVizIssue[] = Object.freeze([]);

/**
 * Compiles a spec into an engine. A new engine is created only when `spec` changes identity
 * (memoize or keep specs immutable). Does not subscribe to state, so it never re-renders on
 * parameter or time changes; use `useEyeVizState` for that.
 */
export function useEyeViz(spec: unknown, options?: EngineOptions): UseEyeVizResult {
  const curveSamples = options?.curveSamples;
  return useMemo(() => {
    const result = compileScene(spec);
    if (!result.ok) return { engine: null, issues: result.issues };
    const engineOptions = curveSamples === undefined ? {} : { curveSamples };
    return { engine: new EyeVizEngine(result.model, engineOptions), issues: NO_ISSUES };
  }, [spec, curveSamples]);
}

/**
 * Subscribes to a slice of the engine state. The selector must return an existing reference
 * from the state (e.g. `(s) => s.parameters` or `(s) => s.time`), not a new object, so React
 * only re-renders when that slice changes.
 */
export function useEyeVizState<T>(
  engine: EyeVizEngine | null,
  selector: (state: SceneState) => T,
): T | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => (engine ? engine.subscribe(onChange) : () => {}),
    [engine],
  );
  const read = () => (engine ? selector(engine.getState()) : undefined);
  return useSyncExternalStore(subscribe, read, read);
}
