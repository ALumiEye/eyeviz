# ADR-0007: Scene Spec versioning and compatibility

- **Status:** Accepted (Phase 0)

## Context

Once external users and AI pipelines store specs, breaking the schema becomes expensive.

## Decision

- Every spec declares `"version"`. The engine rejects unknown versions with
  `UNSUPPORTED_VERSION`.
- Spec versions are independent of npm package versions.
- `0.1` is a **draft until the first npm publish**. After that:
  - additive, optional fields may be added within a minor spec version;
  - removing or changing the meaning of a field requires a new spec version;
  - the runtime keeps loading older versions by migrating them forward (`0.1 → 0.2 → 1.0`)
    into the current Model, one small pure function per step.
- No migration framework is built until a second version exists.
- Schemas are strict (unknown keys rejected), so an older runtime fails loudly on a newer spec.

## Consequences

- Stored specs remain loadable as EyeViz evolves.
- Strictness trades forward-compatibility for early error detection, which matters more for
  hand-written and LLM-generated specs.
