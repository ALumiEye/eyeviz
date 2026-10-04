import type { EyeVizEngine } from "@alumieye/eyeviz";
import { useEyeVizState, usePlayback } from "@alumieye/eyeviz/react";

const SPEEDS = [0.25, 0.5, 1, 2];

/** Play / pause / reset / seek / speed for scenes that use time. */
export function TimelineBar({ engine }: { engine: EyeVizEngine }) {
  const { playback, status } = usePlayback(engine);
  const time = useEyeVizState(engine, (state) => state.time) ?? 0;
  const duration = useEyeVizState(engine, (state) => state.duration);
  if (!playback) return null;

  return (
    <div className="timeline" role="group" aria-label="Timeline">
      <button
        type="button"
        className="timeline-play"
        aria-label={status.playing ? "Pause" : "Play"}
        aria-pressed={status.playing}
        onClick={() => playback.toggle()}
      >
        {status.playing ? "❚❚" : "▶"}
      </button>
      <button type="button" aria-label="Reset to t = 0" onClick={() => playback.reset()}>
        ⏮
      </button>
      {duration !== undefined ? (
        <input
          type="range"
          className="timeline-scrubber"
          aria-label="Time"
          min={0}
          max={duration}
          step={duration / 500}
          value={Math.min(time, duration)}
          onChange={(event) => playback.seek(event.target.valueAsNumber)}
        />
      ) : (
        <span className="timeline-spacer" />
      )}
      <output className="timeline-time" aria-live="off">
        t = {time.toFixed(2)} s{duration !== undefined ? ` / ${duration.toFixed(2)} s` : ""}
      </output>
      <label className="timeline-speed">
        <span className="visually-hidden">Speed</span>
        <select
          value={status.speed}
          onChange={(event) => playback.setSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
