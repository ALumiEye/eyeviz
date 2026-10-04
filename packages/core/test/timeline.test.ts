import { describe, expect, it } from "vitest";
import {
  compileScene,
  EyeVizEngine,
  Playback,
  type CurveState,
  type FrameScheduler,
  type PointState,
} from "../src/index";
import { compileIssues } from "./helpers";

const projectile = {
  version: "0.1",
  timeline: { duration: "2*v0*sin(theta)/g" },
  parameters: [
    { id: "v0", value: 10 },
    { id: "theta", value: 30, unit: "deg" },
    { id: "g", value: 10 },
  ],
  objects: [
    { id: "ball", type: "point", position: ["v0*cos(theta)*t", "v0*sin(theta)*t - g*t^2/2", 0] },
    {
      id: "path",
      type: "curve",
      variable: "s",
      domain: [0, "t"],
      position: ["v0*cos(theta)*s", "v0*sin(theta)*s - g*s^2/2", 0],
    },
  ],
};

/** A fake frame clock: `tick(ms)` fires the pending frame `ms` milliseconds later. */
function fakeScheduler() {
  let now = 0;
  let pending: ((t: number) => void) | undefined;
  const scheduler: FrameScheduler = {
    request: (cb) => {
      pending = cb;
      return 1;
    },
    cancel: () => {
      pending = undefined;
    },
  };
  const tick = (ms: number) => {
    now += ms;
    const cb = pending;
    pending = undefined;
    cb?.(now);
  };
  return { scheduler, tick, hasPending: () => pending !== undefined };
}

describe("timeline in the model and state", () => {
  it("evaluates the duration from parameters (in seconds)", () => {
    const engine = new EyeVizEngine(projectile);
    expect(engine.getState().duration).toBeCloseTo(1); // 2·10·sin 30° / 10
    engine.setParameter("v0", 20);
    expect(engine.getState().duration).toBeCloseTo(2);
  });

  it("marks scenes that use time as animated", () => {
    const animated = compileScene({
      version: "0.1",
      objects: [{ id: "P", type: "point", position: ["t", 0, 0] }],
    });
    const still = compileScene({
      version: "0.1",
      objects: [{ id: "P", type: "point", position: [1, 0, 0] }],
    });
    expect(animated.ok && animated.model.animated).toBe(true);
    expect(still.ok && still.model.animated).toBe(false);
  });

  it("rejects a duration that depends on t", () => {
    expect(
      compileIssues({ version: "0.1", timeline: { duration: "t + 1" }, objects: [] })[0]?.path,
    ).toBe("timeline.duration");
  });

  it("reports a non-positive duration without throwing", () => {
    const engine = new EyeVizEngine(projectile);
    engine.setParameter("theta", 0);
    expect(engine.getState().duration).toBeUndefined();
    expect(engine.getState().issues.at(-1)?.path).toBe("timeline.duration");
  });

  it("draws nothing (and reports nothing) for an empty domain [0, t] at t = 0", () => {
    const engine = new EyeVizEngine(projectile);
    const path = engine.getState().objects.path as CurveState;
    expect(path.valid).toBe(true);
    expect(path.polylines).toEqual([]);
    expect(engine.getState().issues).toEqual([]);
  });
});

describe("Playback", () => {
  it("advances time, scaled by speed", () => {
    const playback = new Playback(new EyeVizEngine(projectile));
    playback.play();
    playback.advance(0.25);
    playback.setSpeed(2);
    playback.advance(0.1);
    expect(playback.engine.getTime()).toBeCloseTo(0.45);
  });

  it("stops at the end of a non-looping timeline, and restarts on play", () => {
    const playback = new Playback(new EyeVizEngine(projectile));
    playback.play();
    playback.advance(5);
    expect(playback.engine.getTime()).toBeCloseTo(1);
    expect(playback.playing).toBe(false);
    playback.play();
    expect(playback.engine.getTime()).toBe(0);
  });

  it("wraps around when looping", () => {
    const playback = new Playback(
      new EyeVizEngine({ ...projectile, timeline: { duration: 2, loop: true } }),
    );
    playback.play();
    playback.advance(2.5);
    expect(playback.engine.getTime()).toBeCloseTo(0.5);
    expect(playback.playing).toBe(true);
  });

  it("runs on without a duration", () => {
    const playback = new Playback(
      new EyeVizEngine({
        version: "0.1",
        objects: [{ id: "P", type: "point", position: ["t", 0, 0] }],
      }),
    );
    playback.play();
    playback.advance(100);
    expect(playback.engine.getTime()).toBe(100);
  });

  it("seeks within [0, duration] and resets", () => {
    const playback = new Playback(new EyeVizEngine(projectile));
    playback.seek(0.5);
    expect((playback.engine.getState().objects.ball as PointState).position[0]).toBeCloseTo(
      10 * Math.cos(Math.PI / 6) * 0.5,
    );
    playback.seek(99);
    expect(playback.engine.getTime()).toBeCloseTo(1);
    playback.seek(-1);
    expect(playback.engine.getTime()).toBe(0);
    playback.play();
    playback.reset();
    expect([playback.playing, playback.engine.getTime()]).toEqual([false, 0]);
  });

  it("is driven by an injected frame scheduler and stops scheduling when paused", () => {
    const playback = new Playback(new EyeVizEngine(projectile));
    const clock = fakeScheduler();
    const detach = playback.attach(clock.scheduler);
    expect(clock.hasPending()).toBe(false); // not playing yet

    playback.play();
    clock.tick(16); // first frame only records the timestamp
    clock.tick(100);
    expect(playback.engine.getTime()).toBeCloseTo(0.1);

    clock.tick(5000); // a long gap (background tab) advances at most 0.1 s
    expect(playback.engine.getTime()).toBeCloseTo(0.2);

    playback.pause();
    expect(clock.hasPending()).toBe(false);
    detach();
  });

  it("notifies listeners of status changes", () => {
    const playback = new Playback(new EyeVizEngine(projectile));
    const seen: boolean[] = [];
    playback.subscribe((status) => seen.push(status.playing));
    playback.play();
    playback.pause();
    playback.dispose();
    playback.play();
    expect(seen).toEqual([true, false]);
  });

  it("produces the same states as calling setTime directly (determinism)", () => {
    const played = new Playback(new EyeVizEngine(projectile));
    played.play();
    played.advance(0.3);
    played.advance(0.4);
    const direct = new EyeVizEngine(projectile);
    direct.setTime(played.engine.getTime());
    expect(played.engine.getState()).toEqual(direct.getState());
  });
});
