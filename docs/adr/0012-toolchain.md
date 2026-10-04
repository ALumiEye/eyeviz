# ADR-0012: Toolchain — TypeScript 6, tsup, Vitest, Changesets

- **Status:** Accepted (Phase 0)

## Context

At the time of Phase 0 (October 2026), TypeScript 7 (the native compiler) is released but
its JavaScript API is not stable, and typescript-eslint supports TypeScript `< 6.1`.

## Decision

- Pin **TypeScript `~6.0`**. Re-evaluate TypeScript 7 when typescript-eslint and the
  declaration bundler support it.
- **tsup** builds libraries. Its declaration build injects `baseUrl`, deprecated in TS 6;
  `ignoreDeprecations: "6.0"` is set **only** in each package's `tsconfig.build.json`.
  `pnpm typecheck` runs without it. If tsup stalls, tsdown is the drop-in successor to evaluate.
- **Vite** for the playground; **Vitest** for tests. Both resolve workspace packages through
  the `source` export condition, so nothing needs building before `pnpm dev` or `pnpm test`.
- **Changesets** for versioning with a fixed group (ADR-0009).
- Contributors need Node `>= 22.12`; published packages support Node `>= 18`.

## Consequences

- One known, documented deprecation suppression in build configs.
- A toolchain upgrade (TS 7, tsdown) is a contained change in root configs.
