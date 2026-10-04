# ADR-0001: Separate Scene Spec, Scene Model and Scene State

- **Status:** Accepted (Phase 0)

## Context

The raw JSON could be used directly as runtime state. That is simple at first but couples
everything to the serialization format: dependency tracking, undo/redo, a visual editor and
schema migrations would all have to operate on JSON strings or untyped objects.

## Decision

Three distinct layers:

1. **Scene Spec** — declarative, versioned JSON input. Never mutated.
2. **Scene Model** — validated, compiled semantics (parsed expressions, resolved references,
   dependency graph), produced by `compileScene`.
3. **Scene State** — immutable evaluated snapshot for one `(parameters, t)`.

Renderers consume State only. UIs and future editors operate on the Model, never on JSON text.

## Consequences

- `evaluate(model, parameters, t)` can be pure and tested without a browser.
- Incremental updates follow the Model's dependency graph.
- A future visual editor maps Model ⇄ Spec explicitly, enabling round-trips and migrations.
- Slightly more code than "just use the JSON"; justified by the editor and migration roadmap.
