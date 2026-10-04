# ADR-0002: Expression engine — math.js parser only, own evaluator

- **Status:** Superseded by [ADR-0013](0013-hand-written-expression-parser.md) (Phase 2)

## Context

Specs contain formulas such as `v0*cos(theta)*t`. Specs are untrusted, so formulas must be
evaluated without executing code. Writing a parser from scratch is possible but slower to
get right; math.js has a mature parser but a very large surface (units, matrices, strings,
assignments, function definitions, its own `evaluate`).

## Decision

- Use math.js **only to parse** an expression into an AST, inside `@alumieye/eyeviz-math`.
- Walk the AST and accept only whitelisted node types, operators and functions.
- Compile the validated AST into EyeViz's own evaluator (closures). Never call math.js
  `evaluate`/`compile`.
- Reject implicit multiplication (`2x`); require explicit `*`.
- Translate all math.js errors to EyeViz issues.
- No other package imports math.js (enforced by ESLint and the dependency allowlist).

## Consequences

- Security surface is defined by our whitelist, not by math.js's feature set.
- If math.js's bundle cost is too high even with a minimal `create()` factory, the parser can
  be replaced by a small hand-written one without changing the public API.
- Explicit multiplication is slightly less convenient but unambiguous for humans and LLMs.
