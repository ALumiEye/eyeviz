# ADR-0009: Packaging and distribution for enterprise reuse

- **Status:** Accepted (Phase 0)

## Context

EyeViz will be embedded in enterprise products with varied toolchains (Vite, webpack, Next.js,
Jest/CJS, older TypeScript settings), strict CSPs, and apps that may already use Three.js.

## Decision

- **Umbrella package** `@alumieye/eyeviz` with subpaths `.` (spec + core), `./three`, `./react`.
  The individual packages are also published.
- **Lockstep versions** via a Changesets fixed group: all packages always share one version.
- **Formats:** renderer-neutral packages (`spec`, `math`, `core`, umbrella root) ship ESM + CJS;
  browser packages ship ESM only. `typesVersions` supports legacy `moduleResolution: node`.
- **Peer dependencies:** `three`, `react`, `react-dom` — one shared instance in the host app.
- **Zod is internal.** Public API exposes EyeViz types, `validateSpec()` and a JSON Schema;
  host apps never need a matching Zod version.
- `sideEffects: false`, source maps, declaration files.
- CI gates: publint, are-the-types-wrong, license allowlist; bundle-size budget and API report
  before the first publish. Releases publish with npm provenance.
- No global CSS, no injected `<style>`, no singletons, no `eval` (CSP-safe).

## Consequences

- `npm i @alumieye/eyeviz three` is enough for most consumers.
- Every release bumps all packages, even unchanged ones; acceptable for consistency.
- Exporting Zod schemas directly is off the table for the public API.
