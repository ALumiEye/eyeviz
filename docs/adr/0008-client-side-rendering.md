# ADR-0008: All rendering runs client-side

- **Status:** Accepted (Phase 0)

## Context

EyeViz must be cheap to host and must not require a rendering service. Visualizations can be
computed on modern consumer devices.

## Decision

- All evaluation, sampling and rendering run on the viewer's device.
- EyeViz requires no backend and deploys as static files.
- Packages are import-safe in Node/SSR (no DOM access at module load) but render nothing on
  a server.
- Viewer-device cost is controlled by lazy mounting (only when the scene is near the viewport),
  dynamic loading of Three.js, render-on-demand, pausing when hidden, and sampling caps.
- For discoverability and accessibility, hosts receive plain text (`metadata`, and later a
  generated scene description) to place in the page; prerendering HTML around a scene is the
  host's choice and never required by EyeViz.

## Consequences

- Zero server cost; works on static hosting and offline.
- Search engines see only the host page's text around the canvas; EyeViz provides that text
  but does not produce server-rendered visuals.
