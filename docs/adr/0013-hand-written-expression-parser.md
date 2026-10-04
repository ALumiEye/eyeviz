# ADR-0013: Hand-written expression parser

- **Status:** Accepted (Phase 2). Supersedes [ADR-0002](0002-expression-engine.md).

## Context

ADR-0002 used math.js only as a parser. Measured in Phase 1, that parser alone was about
**90 kB gzip** of a **127 kB** renderer-neutral runtime, while EyeViz's own code was about
12 kB. The grammar EyeViz accepts is tiny (numbers, identifiers, `+ - * / ^`, parentheses,
whitelisted function calls), and everything else math.js parses had to be rejected anyway.

## Decision

- Replace math.js with a ~200-line recursive-descent parser in `@alumieye/eyeviz-math`
  that produces EyeViz's own AST, followed by the existing whitelist walk and closure compiler.
- The public API (`compileExpression`, issue codes, limits) is unchanged.
- The parser rejects, by construction, everything outside the grammar: assignment, property
  access, strings, matrices, ranges, units, conditionals, implicit multiplication.
- Nesting depth is limited while parsing (parentheses, unary chains and exponents), so hostile
  input cannot exhaust the call stack.
- `@alumieye/eyeviz-math` has **no runtime dependencies**.

## Consequences

- Runtime size dropped from ≈127 kB to ≈37 kB gzip (math package: ≈92 kB → ≈2.4 kB).
- The security surface is now code we own and test, including a deterministic fuzz test.
- New syntax must be added to our grammar deliberately — which is the desired property.
