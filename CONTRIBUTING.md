# Contributing to EyeViz

Thank you for your interest in EyeViz.

## Principles

- **Small concepts that compose.** Prefer generic primitives (point, curve, parameter) over
  subject-specific features (`ProjectileExercise`).
- **The spec describes semantics, not rendering.** No renderer details in the Scene Spec.
- **Deterministic and safe.** No `eval`, no hidden time or randomness in `core`.
- **Respect the dependency direction.** `spec`/`math` → `core` → renderers → `react`.
  CI enforces it (`pnpm check:boundaries`, ESLint).
- **KISS / YAGNI.** No plugin frameworks, DI containers or speculative abstractions.

## What needs discussion first

Open an issue (and usually an ADR in `docs/adr/`) before changing:

- the Scene Specification;
- public package APIs;
- dependencies of published packages;
- package boundaries.

Bug fixes, tests, docs and examples are welcome directly as pull requests.

## Workflow

```bash
pnpm install
pnpm dev        # playground
pnpm verify     # run before opening a PR
pnpm changeset  # describe user-facing changes to published packages
```

- Tests use Vitest and must not need network access.
- Prefer deterministic core tests over screenshot tests.
- Keep the docs truthful: do not document features that do not exist; mark experimental APIs.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
