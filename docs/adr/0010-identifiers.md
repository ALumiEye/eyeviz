# ADR-0010: Identifier-style IDs in one namespace

- **Status:** Accepted (Phase 0)

## Context

Parameter IDs appear inside expressions, so they must be valid identifiers. Object IDs could
allow hyphens (`sin-curve`), but future expressions may reference object properties (`A.x`),
and separate namespaces would make `A` ambiguous.

## Decision

- All IDs match `^[A-Za-z_][A-Za-z0-9_]*$`, up to 64 characters.
- Parameters and objects share **one namespace**: an ID is unique across both.
- Reserved names (`t`, `pi`, `e`, whitelisted function names) are not valid IDs.

## Consequences

- Expressions can later reference objects without ambiguity or a syntax change.
- `sin-curve` must be written `sin_curve` or `sinCurve`.
