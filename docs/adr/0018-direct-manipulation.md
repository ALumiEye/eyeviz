# ADR-0018: Direct manipulation through parameters; constraints by parametrization

- **Status:** Accepted (Phase 5)

## Context

Learners should be able to drag points, often under a constraint ("A moves on circle C").
General geometric constraint solvers are large and hard to make deterministic; the brief
explicitly ruled one out for V1 but asked not to make it impossible later.

## Decision

- A point may declare `drag`: 1–3 interactive **number parameters** used in its position.
- Dragging asks the engine for the parameter values that bring the point **closest to the
  pointer** (`engine.dragPoint(id, target)`), within each parameter's `min`/`max`, snapped to
  its `step`. The result is applied with `setParameters`, exactly like moving sliders.
- The point's formula _is_ the constraint:

  | Constraint      | Position                                | `drag`         |
  | --------------- | --------------------------------------- | -------------- |
  | free in a plane | `["px", "py", 0]`                       | `["px", "py"]` |
  | on a circle     | `["r*cos(theta)", "r*sin(theta)", 0]`   | `["theta"]`    |
  | on a graph      | `["x0", "f(x0)", 0]`                    | `["x0"]`       |
  | on a segment AB | `["ax + s*(bx - ax)", …]`, `s ∈ [0, 1]` | `["s"]`        |

- Solver: one bounded parameter → global scan + golden-section refinement (periodic angles
  work); otherwise damped Gauss–Newton (Levenberg–Marquardt) with numeric derivatives,
  clamped to bounds. Deterministic; no randomness.
- Renderers report drags as world positions (`onDrag(id, target)`): on the x–y plane in 2D,
  on the plane through the point facing the viewer in 3D. The camera does not move while
  dragging; a short press still selects.
- Every draggable point is also controllable through its parameters' sliders, which keeps
  dragging accessible to keyboard users.

## Consequences

- State remains a pure function of (spec, parameters, time, step): a drag is just a
  parameter change, so undo/redo and sharing work through parameter values.
- Constraints that cannot be written as a parametrization (e.g. "intersection of two moving
  circles" with branch selection) need a real solver later; it can be added behind the same
  `dragPoint` API.
