# Expressions

> Status: specified in Phase 0, implemented in Phase 1 in `@alumieye/eyeviz-math`.

Expressions are the most security-sensitive part of EyeViz. Scene Specs are untrusted input,
so an expression is **data describing a mathematical formula**, never code.

```
"v0*cos(theta)*t"
```

## Pipeline

```
expression string
      │  length limit
      ▼
parse (math.js parser, used only to build an AST)
      │
      ▼
whitelist walk ── rejects any node type, operator or function not listed below
      │  node-count and depth limits
      ▼
symbol extraction + validation against the scope of the field (done by core)
      │
      ▼
compile to an EyeViz evaluator (plain closures over the validated AST)
      │
      ▼
evaluate(scope) → number   (may be NaN or ±Infinity; never throws for numeric reasons)
```

math.js is used **only for parsing**. Its `evaluate`/`compile` functions are never called,
and no part of the codebase outside `@alumieye/eyeviz-math` imports math.js. No `eval`,
`new Function`, dynamic `import()` or property access on host objects happens anywhere.
See [ADR-0002](adr/0002-expression-engine.md).

## Grammar (v0.1)

| Element   | Supported                                                              |
| --------- | ---------------------------------------------------------------------- |
| Numbers   | `2`, `0.5`, `1e-3`                                                     |
| Operators | `+`, `-`, `*`, `/`, `^` (power, right-associative), unary `-` and `+`  |
| Grouping  | `( … )`                                                                |
| Functions | `sin cos tan asin acos atan atan2 sqrt exp log abs min max floor ceil` |
| Constants | `pi`, `e`                                                              |
| Variables | number parameter IDs, `t`, the curve `variable`                        |

`log(x)` is the natural logarithm. `atan2(y, x)` follows `Math.atan2`. `min`/`max` take two
or more arguments.

## Explicitly rejected

| Construct                        | Example                                       | Reason                                     |
| -------------------------------- | --------------------------------------------- | ------------------------------------------ |
| Implicit multiplication          | `2x`, `2 pi`, `(a)(b)`                        | Ambiguous; write `2*x`                     |
| Assignment, function definition  | `a = 1`, `f(x) = x^2`                         | Expressions are pure                       |
| Property / index access          | `a.b`, `a[0]`                                 | No object model; reserved for future `A.x` |
| Strings, matrices, ranges, units | `"s"`, `[1,2]`, `1:3`, `5 cm`                 | Out of scope                               |
| Conditionals, comparisons, logic | `a > 0 ? 1 : 2`, `a and b`                    | Out of scope for v0.1                      |
| Factorial, transpose, modulo     | `n!`, `A'`, `a mod b`                         | Out of scope for v0.1                      |
| Any non-whitelisted function     | `import(...)`, `evaluate(...)`, `constructor` | Security                                   |

Rejected constructs produce `EXPRESSION_SYNTAX` or `UNKNOWN_FUNCTION`, with the offending
fragment in `details`.

## Angle semantics

Trigonometric functions take and return **radians**. A number parameter declared with
`"unit": "deg"` is converted to radians at the expression boundary:

```
parameter theta = 30 (deg)   →   expression sees theta = 30 · π / 180 ≈ 0.5236
```

The conversion is applied exactly once, by the engine, when building the evaluation scope.
`state.parameters.theta` still reports `30`. There is no implicit conversion anywhere else.
See [ADR-0005](adr/0005-angle-units.md).

## Numerical results

| Situation                                  | Behaviour                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Finite result                              | Used as is                                                                    |
| `NaN`, `±Infinity` in a point              | Object marked `valid: false`; `EXPRESSION_EVALUATION` issue in `state.issues` |
| `NaN`, `±Infinity` in a curve sample       | That sample is dropped and the polyline is split there                        |
| Invalid domain (`start ≥ end`, non-finite) | Curve marked `valid: false` with an issue                                     |

Numerical problems never throw and never crash rendering.

## Limits

| Limit              | Value          |
| ------------------ | -------------- |
| Expression length  | 500 characters |
| AST nodes          | 200            |
| AST depth          | 32             |
| Function arguments | 8              |

Exceeding a limit yields `LIMIT_EXCEEDED`. See [security.md](security.md).

## Determinism

Expressions are pure: their result depends only on the scope values. The evaluator uses
`Math.*` functions, so results are identical within one JavaScript engine; tiny last-bit
differences between engines are possible and not considered a bug.

## Planned public API

```ts
interface CompiledExpression {
  readonly source: string;
  readonly symbols: ReadonlySet<string>; // free variables, e.g. {"v0", "theta", "t"}
  evaluate(scope: ExpressionScope): number;
}

function compileExpression(source: string): ExpressionResult; // { ok, expression } | { ok: false, issues }
```

Symbol validation is performed by `core`, which knows which names are in scope for each field.
