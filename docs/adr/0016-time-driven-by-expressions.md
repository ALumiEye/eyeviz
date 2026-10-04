# ADR-0016: Motion is written as expressions in `t`; no `behaviors` field

- **Status:** Accepted (Phase 3)

## Context

The original brief sketched `behaviors` that attach time-dependent values to objects, e.g.
`{ "target": "ball", "type": "position", "value": ["v0*cos(theta)*t", …] }`. Since v0.1,
every expression may already use the scene time `t`, so the same motion can be written
directly where the value lives:

```json
{ "id": "ball", "type": "point", "position": ["v0*cos(theta)*t", "v0*sin(theta)*t - g*t^2/2", 0] }
```

## Decision

- **No `behaviors` field.** Motion is expressed by using `t` in any expression. One concept
  (expressions) instead of two (expressions and behaviors that override them).
- **`timeline`** only describes playback: `duration` (a scalar that may depend on parameters,
  never on `t`), `loop`, `autoplay`.
- The engine stays deterministic: it only ever receives `setTime(t)`. A `Playback` object in
  core runs time; it gets animation frames from an injected `FrameScheduler`, so core stays
  free of DOM APIs. `mount()` and the React `usePlayback` hook provide the browser scheduler.
- Autoplay never starts when the user prefers reduced motion.

## Consequences

- Specs stay small; an object's motion is visible where the object is defined.
- "Path so far" is a curve with `domain: [0, "t"]`; an empty domain at `t = 0` is valid.
- Simulations that need numerical integration (forces, collisions) are not expressible yet.
  If needed, they would arrive as a separate, opt-in package rather than as `behaviors`.
