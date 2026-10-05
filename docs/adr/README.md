# Architecture Decision Records

Each ADR records one significant decision: its context, the decision, and its consequences.
ADRs are immutable once accepted; a later ADR may supersede an earlier one.

| ADR                                               | Title                                                                    | Status   |
| ------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| [0001](0001-spec-model-state.md)                  | Separate Scene Spec, Scene Model and Scene State                         | Accepted |
| [0002](0002-expression-engine.md)                 | Expression engine: math.js parser only, own evaluator                    | Accepted |
| [0003](0003-framework-agnostic-three-renderer.md) | Framework-agnostic Three.js renderer, no React Three Fiber               | Accepted |
| [0004](0004-coordinate-system.md)                 | Right-handed, z-up coordinate system                                     | Accepted |
| [0005](0005-angle-units.md)                       | Radians internally; degree parameters convert at the expression boundary | Accepted |
| [0006](0006-parametric-curves.md)                 | Curves are parametric only                                               | Accepted |
| [0007](0007-spec-versioning.md)                   | Scene Spec versioning and compatibility                                  | Accepted |
| [0008](0008-client-side-rendering.md)             | All rendering runs client-side                                           | Accepted |
| [0009](0009-packaging-and-distribution.md)        | Packaging and distribution for enterprise reuse                          | Accepted |
| [0010](0010-identifiers.md)                       | Identifier-style IDs in one namespace                                    | Accepted |
| [0011](0011-react-first-integration.md)           | React is the first-class framework integration                           | Accepted |
| [0012](0012-toolchain.md)                         | Toolchain: TypeScript 6, tsup, Vitest, Changesets                        | Accepted |
| [0013](0013-hand-written-expression-parser.md)    | Hand-written expression parser (supersedes 0002)                         | Accepted |
| [0014](0014-labels-as-dom-text.md)                | Labels and tick numbers are DOM text                                     | Accepted |
| [0015](0015-phase-2-primitives.md)                | Shapes of the Phase 2 primitives                                         | Accepted |
| [0016](0016-time-driven-by-expressions.md)        | Motion is written as expressions in `t`                                  | Accepted |
| [0017](0017-steps.md)                             | Steps, highlighting, focus and selection                                 | Accepted |
| [0018](0018-direct-manipulation.md)               | Direct manipulation through parameters                                   | Accepted |
| [0019](0019-authoring-and-visual-editor.md)       | Authoring commands and the visual editor                                 | Accepted |
| [0020](0020-implicit-curves.md)                   | Implicit curves from equations                                           | Accepted |

Template: Status · Context · Decision · Consequences.
