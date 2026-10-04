/**
 * @alumieye/eyeviz-react
 *
 * Thin React integration over the framework-agnostic EyeViz renderer:
 * `<EyeVizScene spec={scene} />`, `useEyeViz(scene)` and `useEyeVizState(engine, selector)`.
 * Three.js is loaded lazily in the browser; importing this package on a server is safe.
 */
export { EyeVizScene, type EyeVizSceneProps } from "./eyeviz-scene";
export { useEyeViz, useEyeVizState, type UseEyeVizResult } from "./use-eyeviz";
