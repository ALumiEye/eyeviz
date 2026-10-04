# ADR-0015: Shapes of the Phase 2 primitives

- **Status:** Accepted (Phase 2)

## Decision

All additions are optional and additive to Scene Spec 0.1 (still a draft before the first
publish, see ADR-0007).

| Primitive | Shape                                                                     | Why                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene`   | `{ dimension: "2d" \| "3d", axes, grid }`                                 | Axes and 2D framing are part of the model's meaning (a graph is read off its axes), so they belong in the spec, not only in renderer options. Renderer options can still override. |
| `label`   | `{ text, at: pointId \| Vec3 }`                                           | One concept for every annotation; anchoring to a point keeps the label attached as the point moves.                                                                                |
| `vector`  | `{ origin?: pointId \| Vec3, components: Vec3 }`                          | Matches the mathematical definition (displacement from an origin) used in physics and linear algebra.                                                                              |
| `plane`   | `{ through: [p, q, r] }` or `{ point, normal }`, optional `extent`        | The two ways textbooks define a plane. Planes are infinite; `extent` only sizes the drawn patch. Exactly one form is enforced by validation.                                       |
| `surface` | `{ variables: [u, v], domain: { u: [a, b], v: [c, d] }, position: Vec3 }` | Same parametric pattern as curves (ADR-0006): graphs `z = f(x, y)`, spheres and tori use one form.                                                                                 |

- Anchors (`pointId | Vec3`) are shared by `label`, `vector` and `plane`.
- Surfaces are sampled in `core` on a uniform grid (default 48 × 48, max 256 × 256, at most
  250 000 vertices per scene); cells touching undefined vertices are skipped.
- 2D scenes use an orthographic camera looking down at the x–y plane, with rotation disabled.

## Consequences

- Specs stay small and explicit; an LLM can generate each primitive from one example.
- Surface discontinuity detection (like curves have) is postponed; only undefined regions are
  handled.
