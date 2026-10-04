# ADR-0011: React is the first-class framework integration

- **Status:** Accepted (Phase 0)

## Context

Both React and Angular were considered. With ADR-0003 the hot rendering path lives outside
any framework, so framework choice affects authoring cost, not frame rate.

## Decision

- React gets the official adapter (`<EyeVizScene>`, `useEyeViz`) and powers the playground.
- Other frameworks use the framework-agnostic `mount()` API, and later a Web Component.
- No dedicated Angular/Vue packages until real demand exists.

## Consequences

- Larger contributor pool and better AI-assisted coding support for the React code.
- Maintenance is limited to one framework adapter; Angular's six-monthly majors don't
  burden the project.
- Framework-specific state must not drive per-frame updates: the renderer subscribes to the
  engine directly, and React reads only coarse state via `useSyncExternalStore`.
