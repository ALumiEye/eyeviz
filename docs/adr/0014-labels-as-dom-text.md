# ADR-0014: Labels and tick numbers are DOM text

- **Status:** Accepted (Phase 2)

## Context

Educational scenes need readable text: point names (A, B, C), annotations and axis numbers.
Text can be rendered as WebGL textures (sprites, SDF fonts) or as DOM elements positioned
over the canvas.

## Decision

The Three.js renderer draws text with `CSS2DRenderer` in an overlay above the canvas:

- crisp at any zoom and pixel density, no font atlas to ship;
- real text: selectable, translatable by the browser, readable by assistive technology;
- always set with `textContent` — spec text is never interpreted as HTML;
- styled through the CSSOM (no `<style>` injection), so strict CSPs keep working;
- a text-shadow halo in the theme background colour keeps labels readable on any object.

The renderer wraps canvas and overlay in its own `<div>`, so the host element's styles are
never modified.

## Consequences

- Labels are not occluded by 3D objects (they always draw on top). Acceptable for annotations;
  revisit if dense 3D scenes need depth-aware text.
- Very large numbers of labels (thousands) would be slower than GPU text; scenes are capped at
  1000 objects and axes generate a bounded number of ticks.
