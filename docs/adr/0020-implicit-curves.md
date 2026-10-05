# ADR-0020: Implicit curves (`implicit`)

- **Status:** Accepted (Phase 7)

## Context

School mathematics is full of curves that are not graphs of a function: circles
`x² + y² = r²`, ellipses, hyperbolas, `y² = x³ − x`, `|x| + |y| = 1`. With only parametric
curves (ADR-0006), a teacher must know a parametrization (`cos`, `sin`, `cosh`…) or split the
curve into several graphs. The quick graph input could not accept `x² + y² = 4` at all.

## Decision

A new object type, additive to Scene Spec 0.1 (still a draft before the first publish, ADR-0007):

```json
{
  "id": "c",
  "type": "implicit",
  "equation": "x^2 + y^2 = r^2",
  "domain": { "x": [-5, 5], "y": [-5, 5] }
}
```

- **`equation` is written as on paper**: two expressions joined by exactly one `=`. It reads
  naturally for teachers and for LLMs, and both sides keep the normal expression rules. The
  core compiles each side separately; issues point at `objects[i].equation`. Renaming a
  parameter rewrites the equation like any expression.
- **`variables` is optional**, default `["x", "y"]`; the same local-variable rules as
  `surface` apply (two different names, one domain each, no collision with IDs). It exists for
  the rare scene that has a parameter named `x` or `y`.
- **The curve lies in the plane z = 0**, so it also works in 3D scenes.
- **Rendering stays renderer-neutral**: the core traces `F = left − right = 0` with marching
  squares on a uniform grid (engine option `implicitSamples`, default 128 × 128, at most
  512 × 512 and 250 000 vertices per scene), joins the pieces across cells and returns
  polylines, exactly like a sampled curve. Renderers draw them as lines.
  - Saddle cells are resolved by the value at the cell centre.
  - A crossing is accepted only if `|F|` at the interpolated point is small compared with the
    cell's corner values, so a pole (`y = 1/x`) is not drawn as a vertical line.
  - Cells touching undefined values are skipped. An equation undefined everywhere is an issue;
    an equation with no solution in the domain is valid and draws nothing.

## Consequences

- Conics and other relations are one line of spec, and the quick graph input turns
  `x² + y² = 4` into an implicit curve (`y = …` without `y` on the right stays a graph).
- Only sign changes are found: curves where `F` touches zero without crossing it
  (`x² + y² = 0`, `(x − y)² = 0`) are not drawn. Resolution is fixed per grid, so very small
  loops (smaller than a cell) can be missed; a finer `implicitSamples` helps.
- Updates cost about 3 ms per curve at the default resolution (measured in Node), fine for
  sliders. Adaptive refinement is postponed until a lesson needs it.
