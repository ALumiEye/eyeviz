# EyeViz

**by ALumiEye**

EyeViz is an open-source interactive STEM visualization engine by ALumiEye.

_From equations to interactive visualizations._

> **Project status: Phase 6 — visual authoring.** Scenes can be built without code in the
> playground's visual editor (Vietnamese/English), or written as JSON. Scene Spec v0.1 covers
> points, segments, vectors, planes, curves, surfaces and labels, with parameters, 2D/3D scenes,
> motion over time, step-by-step explanations, selection and draggable points. Nothing is
> published to npm yet; all APIs are **experimental**.

**Try it:** [alumieye.github.io/eyeviz](https://alumieye.github.io/eyeviz/) — the playground
runs entirely in your browser (visual editor in Vietnamese or English, or JSON).

## What EyeViz is

EyeViz turns a structured description of a mathematical or scientific model — a
**Scene Specification** — into a deterministic, interactive 2D/3D visualization that runs
entirely in the browser.

```
Model → Scene Specification → EyeViz Core → Renderer → Interactive Scene
```

- **Declarative.** A scene is JSON: parameters, points, vectors, planes, curves, surfaces,
  labels… No code.
- **Deterministic.** The same spec, parameters and time always produce the same scene.
- **Safe.** Specs are untrusted input. Expressions such as `v0*cos(theta)*t` are parsed and
  evaluated by a whitelisted math engine — never by `eval`.
- **Renderer-independent.** Three.js is the first renderer, not the abstraction. The spec
  contains no rendering details.
- **Client-side.** No server. Static hosting is enough.

EyeViz is _not_ an AI tool, a drawing app, a charting library, a physics engine or an LMS.
Because specs are simple, explicit JSON, they are easy for people — and for LLMs — to write;
EyeViz itself contains no AI.

## Why

Interactive diagrams make mathematics and science observable, but they are usually built one
by one as hand-coded demos. EyeViz separates **describing** a model from **executing and
rendering** it, so visualizations become data that can be stored, generated, validated,
versioned and rendered anywhere.

## A Scene Specification

```json
{
  "version": "0.1",
  "metadata": { "title": "Point on a circle" },
  "parameters": [
    { "id": "theta", "value": 30, "unit": "deg", "min": 0, "max": 360, "control": "slider" }
  ],
  "objects": [
    { "id": "O", "type": "point", "position": [0, 0, 0] },
    { "id": "P", "type": "point", "position": ["3*cos(theta)", "3*sin(theta)", 0] },
    { "id": "OP", "type": "segment", "from": "O", "to": "P" }
  ]
}
```

Moving the `theta` slider moves `P`, and the segment `OP` follows. See
[docs/scene-spec.md](docs/scene-spec.md) for the full v0.1 draft.

## Usage

```bash
npm install @alumieye/eyeviz three
```

```tsx
import { EyeVizScene } from "@alumieye/eyeviz/react";

<EyeVizScene spec={scene} />;
```

```ts
// Any framework, or plain HTML:
import { mount } from "@alumieye/eyeviz/three";

const view = mount(document.getElementById("scene")!, scene);
view.engine.setParameter("theta", 45);
view.playback.play(); // for scenes that use time t
view.dispose();
```

```ts
// Without React or a browser (Node, workers, tests):
import { EyeVizEngine } from "@alumieye/eyeviz";

const engine = new EyeVizEngine(scene);
engine.setParameter("theta", 60);
engine.setTime(1.5);
const state = engine.getState(); // evaluated coordinates, curve polylines, issues
```

```ts
// Validate untrusted input (e.g. LLM output) without throwing:
import { compileScene } from "@alumieye/eyeviz";

const result = compileScene(json);
if (!result.ok) console.log(result.issues); // [{ code, message, path, details }]
```

## Packages

| Package                                                      | Purpose                                       |
| ------------------------------------------------------------ | --------------------------------------------- |
| [`@alumieye/eyeviz`](packages/eyeviz)                        | Single install; subpaths `./three`, `./react` |
| [`@alumieye/eyeviz-spec`](packages/spec)                     | Scene Specification types, schema, validation |
| [`@alumieye/eyeviz-math`](packages/math)                     | Safe expression parsing and evaluation        |
| [`@alumieye/eyeviz-core`](packages/core)                     | Deterministic runtime: spec → model → state   |
| [`@alumieye/eyeviz-renderer-three`](packages/renderer-three) | Three.js renderer                             |
| [`@alumieye/eyeviz-react`](packages/react)                   | React components and hooks                    |

```
spec ─┐
      ├─► core ─► renderer-three ─► react ─► playground
math ─┘
```

The dependency direction is enforced in CI. See [docs/architecture.md](docs/architecture.md).

## Development

Requirements: Node ≥ 22.12 and pnpm 10 (`corepack enable`).

```bash
pnpm install        # one command installs everything
pnpm dev            # start the playground (no build step needed)
pnpm test           # unit tests
pnpm verify         # everything CI runs: lint, format, types, boundaries, tests, build, package QA
```

Other scripts: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:boundaries`,
`pnpm check:packages`, `pnpm check:licenses`, `pnpm changeset`.

## Documentation

- [Architecture](docs/architecture.md)
- [Scene Specification v0.1](docs/scene-spec.md)
- [Expressions](docs/expressions.md)
- [Renderer contract](docs/renderer-contract.md)
- [Security model](docs/security.md)
- [Roadmap](docs/roadmap.md)
- [Architecture Decision Records](docs/adr/README.md)

## Roadmap

| Phase | Theme                                                                       | Status |
| ----- | --------------------------------------------------------------------------- | ------ |
| 0     | Architecture foundation                                                     | Done   |
| 1     | Core vertical slice: spec, math, core, Three.js renderer, React, playground | Done   |
| 2     | Vectors, planes, surfaces, labels, axes, 2D scenes                          | Done   |
| 3     | Timeline and animation                                                      | Done   |
| 4     | Steps, highlight, focus, selection                                          | Done   |
| 5     | Direct manipulation: draggable points, inspector                            | Done   |
| 6     | Visual editor (bilingual), authoring commands, undo/redo                    | Done   |

Details in [docs/roadmap.md](docs/roadmap.md).

## Contributing

EyeViz values a small number of concepts that compose well over a large number of features.
Before contributing, please read [CONTRIBUTING.md](CONTRIBUTING.md) and the architecture
docs. Changes to the Scene Specification or public APIs need an issue or ADR first.

## License

[Apache-2.0](LICENSE) © ALumiEye
