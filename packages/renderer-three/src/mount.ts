import { EyeVizEngine, type EngineOptions } from "@alumieye/eyeviz-core";
import { ThreeRenderer, type ThreeRendererOptions } from "./three-renderer";

export interface MountOptions extends ThreeRendererOptions {
  readonly engine?: EngineOptions;
}

export interface EyeVizMount {
  readonly engine: EyeVizEngine;
  readonly renderer: ThreeRenderer;
  /** Stops rendering and releases every resource. Idempotent. */
  dispose(): void;
}

/**
 * Framework-agnostic entry point: renders a Scene Spec into `container` and keeps it in sync
 * with the engine. Works in any framework or in plain HTML.
 *
 * ```ts
 * const view = mount(document.getElementById("scene")!, spec);
 * view.engine.setParameter("theta", 45);
 * view.dispose();
 * ```
 *
 * @throws EyeVizError if the spec is invalid.
 */
export function mount(
  container: HTMLElement,
  spec: unknown,
  options: MountOptions = {},
): EyeVizMount {
  const { engine: engineOptions, ...rendererOptions } = options;
  const engine = new EyeVizEngine(spec, engineOptions);
  const renderer = new ThreeRenderer(container, rendererOptions);
  renderer.setModel(engine.model, engine.getState());
  const unsubscribe = engine.subscribe((state, changed) => renderer.update(state, changed));
  let disposed = false;
  return {
    engine,
    renderer,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      renderer.dispose();
    },
  };
}
