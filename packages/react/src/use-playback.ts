import {
  Playback,
  type EyeVizEngine,
  type FrameScheduler,
  type PlaybackStatus,
} from "@alumieye/eyeviz-core";
import { useEffect, useMemo, useSyncExternalStore } from "react";

const scheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

const IDLE: PlaybackStatus = Object.freeze({ playing: false, speed: 1 });
const noop = () => () => {};

export interface UsePlaybackOptions {
  /** Start playing on mount. Defaults to the spec's `timeline.autoplay`; never under reduced motion. */
  readonly autoplay?: boolean;
}

export interface UsePlaybackResult {
  /** `null` while there is no engine. */
  readonly playback: Playback | null;
  readonly status: PlaybackStatus;
}

/**
 * Creates a `Playback` for an engine and drives it with animation frames while mounted.
 * Re-renders only when play/pause/speed change; read time with `useEyeVizState(engine, s => s.time)`.
 */
export function usePlayback(
  engine: EyeVizEngine | null,
  options: UsePlaybackOptions = {},
): UsePlaybackResult {
  const playback = useMemo(() => (engine ? new Playback(engine) : null), [engine]);
  const autoplay = options.autoplay ?? engine?.model.timeline?.autoplay ?? false;

  useEffect(() => {
    if (!playback) return;
    const detach = playback.attach(scheduler);
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (autoplay && !reduced) playback.play();
    return () => {
      detach();
      playback.pause();
    };
  }, [playback, autoplay]);

  const status = useSyncExternalStore(
    playback ? (onChange) => playback.subscribe(onChange) : noop,
    () => (playback ? cachedStatus(playback) : IDLE),
    () => IDLE,
  );
  return { playback, status };
}

// useSyncExternalStore needs a stable snapshot per status; cache by value.
const cache = new WeakMap<Playback, PlaybackStatus>();
function cachedStatus(playback: Playback): PlaybackStatus {
  const current = playback.status;
  const previous = cache.get(playback);
  if (previous && previous.playing === current.playing && previous.speed === current.speed)
    return previous;
  cache.set(playback, current);
  return current;
}
