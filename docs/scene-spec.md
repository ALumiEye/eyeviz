# EyeViz Scene Specification v0.1

> Status: **Draft, implemented.** Version `0.1` may still change until the first
> npm release; after that, changes are additive or require a new version.
> See [ADR-0007](adr/0007-spec-versioning.md).

A Scene Specification ("spec") is a JSON document describing a mathematical or scientific
scene: its parameters and the objects in it. It describes **semantics, not rendering**:
there are no meshes, materials, segment counts or renderer settings in a spec.

## Example

```json
{
  "version": "0.1",
  "metadata": {
    "title": "Unit circle and a sine wave",
    "description": "Point P moves on a circle of radius 3; y = a·sin(k·x) is drawn below.",
    "lang": "en"
  },
  "camera": { "position": [0, -12, 8], "target": [0, 0, 0] },
  "parameters": [
    {
      "id": "theta",
      "value": 30,
      "unit": "deg",
      "min": 0,
      "max": 360,
      "step": 1,
      "control": "slider"
    },
    { "id": "a", "value": 1, "min": 0, "max": 3, "step": 0.1, "label": "Amplitude" },
    { "id": "k", "value": 1, "min": 0.1, "max": 5, "step": 0.1, "label": "Frequency" },
    { "id": "showWave", "value": true, "control": "toggle", "label": "Show wave" }
  ],
  "objects": [
    { "id": "O", "type": "point", "position": [0, 0, 0] },
    { "id": "P", "type": "point", "position": ["3*cos(theta)", "3*sin(theta)", 0] },
    { "id": "OP", "type": "segment", "from": "O", "to": "P" },
    {
      "id": "wave",
      "type": "curve",
      "variable": "x",
      "domain": [-10, 10],
      "position": ["x", "a*sin(k*x) - 5", "0"],
      "visible": "showWave",
      "color": "#2f6fdf"
    }
  ]
}
```

## Conventions

- **Coordinates:** right-handed Cartesian, **z up**. Renderers adapt to their own convention.
  See [ADR-0004](adr/0004-coordinate-system.md).
- **Angles:** trigonometric functions take radians. A number parameter with `"unit": "deg"`
  is authored and displayed in degrees, and is **converted to radians when it appears in an
  expression**. See [ADR-0005](adr/0005-angle-units.md).
- **Scalars:** wherever a field accepts a `Scalar`, it is either a JSON number or an
  [expression](expressions.md) string. `Vec3` is `[Scalar, Scalar, Scalar]`.
- **Strictness:** unknown keys are rejected, so typos are reported instead of ignored.
- **IDs:** match `^[A-Za-z_][A-Za-z0-9_]*$`, at most 64 characters, and are unique across
  parameters _and_ objects (one namespace). Reserved names (`t`, `pi`, `e`, function names)
  cannot be used. See [ADR-0010](adr/0010-identifiers.md).

## Top level

| Field        | Type                       | Required | Notes                                    |
| ------------ | -------------------------- | -------- | ---------------------------------------- |
| `version`    | `"0.1"`                    | yes      | Unknown versions → `UNSUPPORTED_VERSION` |
| `metadata`   | [Metadata](#metadata)      | no       |                                          |
| `scene`      | [Scene](#scene)            | no       | Dimension, axes, grid                    |
| `camera`     | [Camera](#camera)          | no       | Renderer picks a default view if absent  |
| `parameters` | [Parameter](#parameters)[] | no       | At most 100                              |
| `objects`    | [SceneObject](#objects)[]  | yes      | At most 1000; may be empty               |

### Metadata

| Field         | Type   | Notes                                                                              |
| ------------- | ------ | ---------------------------------------------------------------------------------- |
| `title`       | string | ≤ 200 characters                                                                   |
| `description` | string | ≤ 2000 characters. Plain text; used as the textual fallback/accessible description |
| `lang`        | string | BCP 47 tag of the human-readable text, e.g. `"vi"`, `"en"`                         |

Metadata is plain text. HTML is never interpreted.

### Scene

| Field       | Type             | Default | Notes                                                                               |
| ----------- | ---------------- | ------- | ----------------------------------------------------------------------------------- |
| `dimension` | `"2d"` \| `"3d"` | `"3d"`  | `"2d"` shows the x–y plane from above with rotation locked (graphs, plane geometry) |
| `axes`      | boolean          | `true`  | Coordinate axes with tick marks, numbers and names                                  |
| `grid`      | boolean          | `true`  | Grid on the z = 0 plane                                                             |

### Camera

| Field      | Type                       | Notes                 |
| ---------- | -------------------------- | --------------------- |
| `position` | `[number, number, number]` | Initial eye position  |
| `target`   | `[number, number, number]` | Initial look-at point |

Camera values are numbers, not expressions, in v0.1. In 2D scenes only `target` is used
(the center of the view); the renderer frames the drawing automatically.

## Parameters

Parameters are named, first-class model values. Expressions reference them by ID. The kind
of parameter is determined by the JSON type of `value`.

**Number parameter**

| Field         | Type                    | Notes                                                      |
| ------------- | ----------------------- | ---------------------------------------------------------- |
| `id`          | identifier              |                                                            |
| `value`       | number                  | Finite. Must satisfy `min ≤ value ≤ max` when bounds exist |
| `min`, `max`  | number                  | Optional. `min < max`                                      |
| `step`        | number                  | Optional, `> 0`                                            |
| `unit`        | `"rad"` \| `"deg"`      | Optional. Only angle units have defined semantics in v0.1  |
| `label`       | string                  | Human-readable name for UIs                                |
| `interactive` | boolean                 | Default `true`. `false` = a named constant (e.g. `g`)      |
| `control`     | `"slider"` \| `"input"` | **UI hint only.** `"slider"` requires `min` and `max`      |

**Boolean parameter**

| Field         | Type       | Notes            |
| ------------- | ---------- | ---------------- |
| `id`          | identifier |                  |
| `value`       | boolean    |                  |
| `label`       | string     |                  |
| `interactive` | boolean    | Default `true`   |
| `control`     | `"toggle"` | **UI hint only** |

The engine never renders controls. `control` tells a UI (the playground, a host app) which
control to generate. Boolean parameters cannot appear in expressions; they drive `visible`.

When a host sets a number parameter, the engine clamps it to `[min, max]`.

## Objects

Every object has:

| Field     | Type                            | Notes                                                    |
| --------- | ------------------------------- | -------------------------------------------------------- |
| `id`      | identifier                      | Stable; used for references, selection and diffing       |
| `type`    | string                          | Discriminator                                            |
| `name`    | string                          | Optional human-readable name (scene tree, accessibility) |
| `visible` | boolean \| boolean-parameter id | Default `true`                                           |
| `color`   | `"#rrggbb"`                     | Optional. Renderers choose theme-aware defaults per type |

Colour is a presentation hint. Meaning must not be conveyed by colour alone.

### `point`

| Field      | Type   | Notes                                          |
| ---------- | ------ | ---------------------------------------------- |
| `position` | `Vec3` | Expressions may use parameters, `t`, constants |

### `segment`

| Field  | Type     | Notes             |
| ------ | -------- | ----------------- |
| `from` | point id | Must be a `point` |
| `to`   | point id | Must be a `point` |

Segments reference points instead of duplicating coordinates; moving a point moves every
segment attached to it.

### `vector`

An arrow from `origin` to `origin + components`.

| Field        | Type               | Notes                                        |
| ------------ | ------------------ | -------------------------------------------- |
| `origin`     | point id \| `Vec3` | Optional, default `[0, 0, 0]`                |
| `components` | `Vec3`             | The displacement; a zero vector is not drawn |

```json
{ "id": "v", "type": "vector", "origin": "A", "components": ["v0*cos(theta)", "v0*sin(theta)", 0] }
```

### `plane`

A plane, given in exactly one of two ways:

| Field     | Type                             | Notes                                                            |
| --------- | -------------------------------- | ---------------------------------------------------------------- |
| `through` | `[point id, point id, point id]` | Three different points. Collinear points are reported at runtime |
| `point`   | point id \| `Vec3`               | With `normal`: a point on the plane                              |
| `normal`  | `Vec3`                           | With `point`: a non-zero normal vector                           |
| `extent`  | `Scalar`                         | Optional half-size of the drawn square patch (> 0)               |

Planes are infinite; only a square patch around the plane's center is drawn. Without
`extent`, a plane through three points is drawn a little larger than its triangle, and a
point + normal plane is sized to the scene.

```json
{ "id": "P", "type": "plane", "through": ["S", "A", "B"] }
{ "id": "Q", "type": "plane", "point": [0, 0, 1], "normal": [0, 0, 1], "extent": 3 }
```

### `curve`

A parametric curve `position(variable)` for `variable ∈ domain`.

| Field      | Type               | Notes                                                                           |
| ---------- | ------------------ | ------------------------------------------------------------------------------- |
| `variable` | identifier         | Local to this curve. Must not collide with a parameter, object or reserved name |
| `domain`   | `[Scalar, Scalar]` | Start and end. May use parameters and `t`, not `variable`                       |
| `position` | `Vec3`             | Expressions may use `variable`, parameters, `t`, constants                      |

The graph of `y = f(x)` is written `"variable": "x", "position": ["x", "f(x)", "0"]`.
A helix is `"variable": "s", "position": ["cos(s)", "sin(s)", "s/5"]`. One form covers 2D
graphs and 3D space curves; surfaces follow the same pattern. See
[ADR-0006](adr/0006-parametric-curves.md).

Sampling density is not part of the spec. Where the curve is undefined (e.g. `tan(x)` at
`π/2`, `sqrt(x)` for `x < 0`), it is broken into separate pieces rather than connected.

### `surface`

A parametric surface `position(u, v)` for `u` and `v` in their domains.

| Field       | Type                               | Notes                                                          |
| ----------- | ---------------------------------- | -------------------------------------------------------------- |
| `variables` | `[identifier, identifier]`         | Two different names, local to this surface                     |
| `domain`    | `{ [variable]: [Scalar, Scalar] }` | Exactly one range per variable. May use parameters and `t`     |
| `position`  | `Vec3`                             | Expressions may use both variables, parameters, `t`, constants |

The graph of `z = f(x, y)` is `"variables": ["x", "y"], "position": ["x", "y", "f(x, y)"]`;
a sphere is `"variables": ["u", "v"], "position": ["cos(u)*sin(v)", "sin(u)*sin(v)", "cos(v)"]`.
Grid density is an engine option, not a spec field. Where the surface is undefined
(e.g. `sqrt(x)` for `x < 0`), that part is left out.

### `label`

Plain text shown next to a point or position. Text is never interpreted as HTML.

| Field  | Type               | Notes                         |
| ------ | ------------------ | ----------------------------- |
| `text` | string             | 1–200 characters              |
| `at`   | point id \| `Vec3` | A label on a point follows it |

```json
{ "id": "lA", "type": "label", "text": "A", "at": "A" }
```

## Symbol scope

| Context                                             | Number parameters | `t` | Constants (`pi`, `e`) | Own variable(s) |
| --------------------------------------------------- | :---------------: | :-: | :-------------------: | :-------------: |
| `point.position`, `label.at`, `vector.*`, `plane.*` |         ✓         |  ✓  |           ✓           |                 |
| `curve.domain`, `surface.domain`                    |         ✓         |  ✓  |           ✓           |                 |
| `curve.position`                                    |         ✓         |  ✓  |           ✓           |  ✓ `variable`   |
| `surface.position`                                  |         ✓         |  ✓  |           ✓           |  ✓ `variables`  |

`t` is the scene time in seconds (default `0`). Timeline playback arrives in Phase 3; the
symbol is reserved and evaluable from v0.1.

## Validation errors

Invalid specs produce structured issues with a JSON path, for example:

```json
{
  "code": "UNKNOWN_SYMBOL",
  "message": "Unknown symbol 'velocity0' in expression \"velocity0*cos(theta)\"",
  "path": "objects[3].position[0]",
  "details": { "symbol": "velocity0" }
}
```

See [architecture.md §7](architecture.md#7-error-model) for all codes.

## Not in v0.1

These are planned and will be added **additively** (non-normative sketches only):

| Field / type | Phase | Sketch                                                                   |
| ------------ | ----- | ------------------------------------------------------------------------ |
| `timeline`   | 3     | duration, loop                                                           |
| `behaviors`  | 3     | to be decided: may be unnecessary because expressions already accept `t` |
| `steps`      | 4     | `show` / `hide` / `highlight` / `focus` by object ID                     |

Field names in this table are not final.
