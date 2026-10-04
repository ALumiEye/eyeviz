import type { FrameScheduler } from "@alumieye/eyeviz-core";

/** Animation frames from the browser, for `Playback.attach`. */
export const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** True when the user asked the operating system to reduce motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
