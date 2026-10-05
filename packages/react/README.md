# @alumieye/eyeviz-react

Part of [EyeViz](../../README.md) — open-source interactive STEM visualization engine by ALumiEye.

React bindings: `<EyeVizScene>`, `useEyeViz()`, `useEyeVizState()` and `usePlayback()`.
Usually imported through the umbrella package as `@alumieye/eyeviz/react`.

```tsx
import { EyeVizScene } from "@alumieye/eyeviz/react";

<EyeVizScene spec={scene} />;
```

- **Server rendering:** only the container and the scene's title and description are rendered;
  Three.js runs in the browser only.
- **Lazy:** Three.js and the WebGL context are created when the scene approaches the viewport
  (`lazy={false}` to start at once).
- **Resilient:** a failed renderer download is retried (after 1 s, 3 s and 9 s, and when the
  browser comes back online). If the renderer cannot start — or WebGL is unavailable — the
  scene's title and description are shown as text and the container gets
  `data-eyeviz-error="renderer"`.
- **Invalid specs** keep the last valid scene on screen; `onIssues` reports why.

> Status: experimental. Not yet published.
