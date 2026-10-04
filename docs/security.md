# Security Model

> To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Threat model

Scene Specs are **untrusted input**. They may come from users, third-party developers,
remote content or LLMs. A malicious or simply broken spec must not be able to:

1. execute JavaScript or reach browser/Node APIs;
2. inject HTML or script into the host page;
3. freeze or crash the viewer's browser;
4. leak data from the host application.

EyeViz runs entirely on the viewer's device, so (3) is the main availability risk.

## Guarantees

| Rule                                                            | How it is enforced                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| No `eval`, `new Function`, dynamic `import()` from spec content | Never used; ESLint `no-eval`, `no-implied-eval`, `no-new-func` across the repo                        |
| Expressions cannot reach globals or host objects                | Whitelisted AST; custom evaluator; no property access; see [expressions.md](expressions.md)           |
| No HTML from specs                                              | All spec text (`title`, `description`, `name`, `label`) is plain text and rendered as text nodes only |
| No code or URLs loaded from specs                               | The spec has no fields that reference code, scripts, or remote resources                              |
| Library errors don't leak                                       | Zod/math.js errors are translated to `EyeVizIssue`                                                    |
| Content Security Policy friendly                                | No `unsafe-eval` needed; no injected `<style>` tags                                                   |

## Resource limits

Limits apply at validation time (static) or evaluation time (dynamic). Exceeding one yields
`LIMIT_EXCEEDED` rather than a hang.

| Limit                                       | Default                    | Where                |
| ------------------------------------------- | -------------------------- | -------------------- |
| Objects per scene                           | 1000                       | spec                 |
| Parameters per scene                        | 100                        | spec                 |
| Text field length (`title` / `description`) | 200 / 2000                 | spec                 |
| Expression length                           | 500 chars                  | math                 |
| Expression AST nodes / depth                | 200 / 32                   | math                 |
| Samples per curve                           | 256 default, 4096 hard cap | core (engine option) |
| Total curve samples per scene               | 100 000                    | core                 |
| Domain magnitude                            | finite, `\|value\| ≤ 1e6`  | core                 |

Hosts may lower limits. Raising hard caps requires an explicit engine option and is the
host's responsibility.

## Out of scope for EyeViz

Authentication, rate limiting and content moderation of AI-generated specs belong to the
applications that produce specs, not to the engine.
