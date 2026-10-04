# ADR-0017: Steps, highlighting, focus and selection

- **Status:** Accepted (Phase 4)

## Context

Educational scenes are often explained step by step: "first the base, then the apex, now
the plane through S, A and B". EyeViz is not an LMS, so steps must stay a small, declarative
part of the scene — no quizzes, grading or progress tracking.

## Decision

`steps` is an optional array. Each step has an `id`, optional `title`/`description`, and four
lists of object IDs:

| Field       | Scope          | Meaning                                                                                           |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `show`      | cumulative     | Objects appear from this step on. An object listed in any step's `show` is hidden until that step |
| `hide`      | cumulative     | Objects disappear from this step on (until shown again)                                           |
| `highlight` | this step only | Emphasize these objects; renderers dim the others                                                 |
| `focus`     | this step only | Frame the camera on these objects                                                                 |

- Objects never mentioned by a `show` are always visible (axes, context, the base drawing).
- An object's own `visible` still applies: final visibility = step visibility AND `visible`.
- Cumulative visibility is precomputed per step at compile time, so `engine.setStep(i)` is
  cheap and the state stays a pure function of (spec, parameters, time, step).
- A scene with steps starts at step 0; `setStep(null)` shows the whole scene.
- **Selection** (clicking an object) is UI state, not part of the spec: the renderer reports
  clicks through `onSelect(id | null)` and shows a selection set with `setSelection(id)`.
- Emphasis never relies on colour alone: highlighted points/arrows grow, lines get thicker,
  everything else fades. Focus moves the camera smoothly, or instantly under reduced motion.

## Consequences

- Lessons are expressed with plain ID lists that an LLM can generate reliably.
- Step-specific parameter values or times are not supported yet; they can be added to a step
  later, additively, if real lessons need them.
