# ADR-0003: Framework-agnostic Three.js renderer, no React Three Fiber

- **Status:** Accepted (Phase 0). Deviates from the original brief, which listed R3F/Drei.

## Context

The brief suggested React Three Fiber and Drei for React integration. If the renderer were
written in R3F, rendering logic would live inside React components: the renderer could not be
used from Angular, Vue or plain HTML, and resource disposal would be split across React's
lifecycle rather than owned by one object.

## Decision

- `@alumieye/eyeviz-renderer-three` is plain, imperative Three.js implementing the
  `SceneRenderer` contract, with explicit `dispose()`.
- `@alumieye/eyeviz-react` is a thin wrapper that mounts this renderer into a `<div>`.
- R3F and Drei are not dependencies in V1.

## Consequences

- One renderer serves React, other frameworks (via `mount()`, later a Web Component) and
  vanilla pages.
- Consumers never need to understand R3F's `<Canvas>`, scenes or render loops.
- Users who want to compose EyeViz objects inside their own R3F scenes are not served in V1;
  an optional `eyeviz-r3f` adapter can be added later on top of the same contract.
