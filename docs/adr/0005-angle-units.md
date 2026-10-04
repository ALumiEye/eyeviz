# ADR-0005: Radians internally; degree parameters convert at the expression boundary

- **Status:** Accepted (Phase 0)

## Context

Educational content usually states angles in degrees, while trigonometric functions work in
radians. Silently mixing units is a classic source of wrong visualizations.

## Decision

- All trigonometric functions take and return radians.
- A number parameter may declare `"unit": "rad" | "deg"`. No other units have semantics in v0.1.
- A `"deg"` parameter is authored, displayed and reported in degrees, and converted to radians
  exactly once, when the engine builds the expression scope.

## Consequences

- `sin(theta)` with `theta = 30 (deg)` gives `0.5`, as authors expect.
- `state.parameters.theta` reports `30`; expressions see `π/6`.
- Physical units (m/s, N…) are not modelled; authors may describe them in `label`.
