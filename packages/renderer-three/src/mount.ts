import { EyeVizEngine, Playback, type EngineOptions } from "@alumieye/eyeviz-core";
import { browserScheduler, prefersReducedMotion } from "./browser";
import { ThreeRenderer, type ThreeRendererOptions } from "./three-renderer";

export interface MountOptions extends ThreeRendererOptions {
  readonly engine?: EngineOptions;
  /** Overrides the spec's `timeline.autoplay`. Autoplay never starts under reduced motion. */
  readonly autoplay?: boolean;
}

export interface EyeVizMount {
  readonly engine: EyeVizEngine;
  readonly renderer: ThreeRenderer;
  /** Play, pause, seek and reset scene time. */
  readonly playback: Playback;
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
 * view.playback.play();
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
  const { engine: engineOptions, autoplay, ...rendererOptions } = options;
  const engine = new EyeVizEngine(spec, engineOptions);
  const renderer = new ThreeRenderer(container, rendererOptions);
  renderer.setModel(engine.model, engine.getState());
  const unsubscribe = engine.subscribe((state, changed) => renderer.update(state, changed));
  const playback = new Playback(engine);
  const detach = playback.attach(browserScheduler);
  if ((autoplay ?? engine.model.timeline?.autoplay) && !prefersReducedMotion()) playback.play();
  let disposed = false;
  return {
    engine,
    renderer,
    playback,
    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      playback.dispose();
      unsubscribe();
      renderer.dispose();
    },
  };
}
