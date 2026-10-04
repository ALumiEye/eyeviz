# ADR-0004: Right-handed, z-up coordinate system

- **Status:** Accepted (Phase 0)

## Context

Mathematics and physics textbooks use right-handed coordinates with z pointing up (surfaces
`z = f(x, y)`, projectiles rising in z or y on a 2D plane). Three.js defaults to y-up.

## Decision

The Scene Specification uses **right-handed Cartesian coordinates with z up**. Renderers
adapt; the Three.js renderer sets `camera.up = (0, 0, 1)` and keeps world coordinates as is.

## Consequences

- Specs read like textbook mathematics; LLMs generate them with fewer convention errors.
- Renderer code must never assume y-up. 2D scenes (Phase 2) use the x–y plane viewed from +z.
