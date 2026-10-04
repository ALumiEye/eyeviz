# ADR-0019: Authoring commands and the visual editor

- **Status:** Accepted (Phase 6)

## Context

Non-technical authors (teachers, content creators) must be able to build scenes without
reading or writing JSON. The brief requires that a visual editor never synchronizes UI
components with JSON strings: a semantic layer must sit in between.

## Decision

- New package **`@alumieye/eyeviz-authoring`** (depends on `spec` and `math` only; no UI,
  no renderer). It provides:
  - **typed, serializable edit commands** (`addObject`, `updateObject`, `removeObject`,
    `moveObject`, `addParameter`, `updateParameter`, `removeParameter`, `rename`, step
    commands, `setMetadata`/`setScene`/`setCamera`/`setTimeline`), applied by the pure
    function `applyCommand(spec, command)`;
  - consistency rules: `rename` updates every reference and every formula
    (`renameSymbol`); `removeObject` removes dependents and cleans steps; a parameter that is
    still used cannot be removed;
  - `SceneDocument`: the spec being edited, with undo/redo; bursts of edits with the same
    coalescing key (typing in a field, dragging) become one undo step;
  - templates for new objects, parameters, steps and empty scenes.
- Commands are plain JSON, so the same vocabulary serves visual editors, scripts and programs
  that edit scenes on a user's behalf. They do not validate formulas — `compileScene` does —
  so a work-in-progress formula can be held and reported in place.
- The **playground becomes one app with two modes**: _Visual_ (default: object tree,
  property forms, live preview) and _JSON_ (advanced, two-way: valid JSON edits become undoable
  document changes). The UI is bilingual (Vietnamese default, English), without an i18n library.
- In the visual editor, dragging a point with fixed coordinates edits those coordinates
  (rounded to 0.01, one undo step per drag); points with `drag` parameters still move through
  their parameters. Renderers expose this through a drag mode (`"declared"` | `"all"`).

## Consequences

- The document (spec) is the single source of truth; every view (tree, forms, JSON, scene)
  derives from it, and undo/redo covers every kind of edit.
- Private ALumiEye products can build their own editors, or AI-assisted editing, on the same
  commands without depending on the playground.
- Changing an object's type is "remove and add" by design: types have different fields.
