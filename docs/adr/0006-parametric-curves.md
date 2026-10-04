# ADR-0006: Curves are parametric only

- **Status:** Accepted (Phase 0). Deviates from the brief's `"expression": "sin(x)"` example.

## Context

The brief showed curves as explicit graphs: `{ "expression": "sin(x)", "variable": "x" }`.
That form cannot describe space curves (helix), closed curves (circle) or trajectories, and
leaves implicit which axis the result maps to.

## Decision

A curve is `position(variable)`, a `Vec3` of expressions over `variable ∈ domain`:

```json
{ "type": "curve", "variable": "x", "domain": [-10, 10], "position": ["x", "sin(x)", "0"] }
```

It reuses the `position` vocabulary of points. Surfaces will follow the same shape with two
variables.

## Consequences

- One form covers graphs, space curves and trajectories; no polymorphic curve schema.
- Simple graphs are slightly more verbose. A convenience form can be added later additively
  if real usage asks for it.
