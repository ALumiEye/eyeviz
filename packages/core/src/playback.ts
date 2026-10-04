import type { EyeVizEngine } from "./engine";

/**
 * Supplies animation frames. In a browser: `{ request: requestAnimationFrame, cancel: cancelAnimationFrame }`.
 * Injected so that core stays free of DOM APIs and playback is testable with a fake clock.
 */
export interface FrameScheduler {
  request(callback: (timestampMs: number) => void): number;
  cancel(handle: number): void;
}

export interface PlaybackStatus {
  readonly playing: boolean;
  readonly speed: number;
}

export type PlaybackListener = (status: PlaybackStatus) => void;

/** Longest step taken in one frame, so a backgrounded tab does not jump ahead. */
const MAX_FRAME_SECONDS = 0.1;

/**
 * Plays scene time for an engine: play, pause, reset, seek, speed, loop.
 *
 * Playback only ever calls `engine.setTime(t)`; the engine stays deterministic. Respects the
 * timeline: stops (or loops) at `duration`, which may change with parameters while playing.
 * Without a duration, time runs on.
 */
export class Playback {
  readonly engine: EyeVizEngine;

  readonly #listeners = new Set<PlaybackListener>();
  #playing = false;
  #speed = 1;
  #scheduler: FrameScheduler | undefined;
  #frame: number | undefined;
  #lastTimestamp: number | undefined;

  constructor(engine: EyeVizEngine) {
    this.engine = engine;
  }

  get playing(): boolean {
    return this.#playing;
  }

  get speed(): number {
    return this.#speed;
  }

  /** Sets the playback rate; `1` is real time. Clamped to [0.05, 10]. */
  setSpeed(value: number): void {
    const next = Number.isFinite(value) ? Math.min(10, Math.max(0.05, value)) : 1;
    if (next === this.#speed) return;
    this.#speed = next;
    this.#notify();
  }

  get status(): PlaybackStatus {
    return { playing: this.#playing, speed: this.#speed };
  }

  /** Starts playing. At the end of a non-looping timeline, starts again from 0. */
  play(): void {
    if (this.#playing) return;
    const duration = this.engine.getState().duration;
    if (duration !== undefined && this.engine.getTime() >= duration) this.engine.setTime(0);
    this.#playing = true;
    this.#lastTimestamp = undefined;
    this.#schedule();
    this.#notify();
  }

  pause(): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#unschedule();
    this.#notify();
  }

  toggle(): void {
    if (this.#playing) this.pause();
    else this.play();
  }

  /** Pauses and returns to t = 0. */
  reset(): void {
    this.pause();
    this.engine.setTime(0);
  }

  /** Jumps to `time`, clamped to [0, duration]. */
  seek(time: number): void {
    if (!Number.isFinite(time)) return;
    const duration = this.engine.getState().duration;
    this.engine.setTime(Math.min(Math.max(0, time), duration ?? Infinity));
  }

  /** Advances time by `seconds` of wall-clock time (scaled by `speed`). Used by the frame loop. */
  advance(seconds: number): void {
    if (!this.#playing || !(seconds > 0)) return;
    const duration = this.engine.getState().duration;
    let next = this.engine.getTime() + seconds * this.#speed;
    if (duration !== undefined && next >= duration) {
      if (this.engine.model.timeline?.loop) {
        next -= duration * Math.floor(next / duration);
      } else {
        this.engine.setTime(duration);
        this.pause();
        return;
      }
    }
    this.engine.setTime(next);
  }

  /** Drives playback from a frame scheduler. Returns a function that detaches it. */
  attach(scheduler: FrameScheduler): () => void {
    this.#unschedule();
    this.#scheduler = scheduler;
    this.#schedule();
    return () => {
      if (this.#scheduler !== scheduler) return;
      this.#unschedule();
      this.#scheduler = undefined;
    };
  }

  subscribe(listener: PlaybackListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Pauses, detaches and drops listeners. */
  dispose(): void {
    this.pause();
    this.#unschedule();
    this.#scheduler = undefined;
    this.#listeners.clear();
  }

  #schedule(): void {
    const scheduler = this.#scheduler;
    if (!scheduler || !this.#playing || this.#frame !== undefined) return;
    this.#frame = scheduler.request((timestamp) => {
      this.#frame = undefined;
      const last = this.#lastTimestamp;
      this.#lastTimestamp = timestamp;
      if (last !== undefined) this.advance(Math.min(MAX_FRAME_SECONDS, (timestamp - last) / 1000));
      this.#schedule();
    });
  }

  #unschedule(): void {
    if (this.#frame !== undefined) this.#scheduler?.cancel(this.#frame);
    this.#frame = undefined;
    this.#lastTimestamp = undefined;
  }

  #notify(): void {
    const status = this.status;
    for (const listener of [...this.#listeners]) listener(status);
  }
}
