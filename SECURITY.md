# Security Policy

EyeViz treats Scene Specifications as untrusted input. Any way for a spec to execute code,
inject HTML, reach browser or Node APIs, or freeze the viewer's browser is a security issue.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting
("Report a vulnerability" under the repository's Security tab). We aim to acknowledge reports
within five working days.

## Supported versions

EyeViz is pre-release. Until 1.0, only the latest published version receives security fixes.

See [docs/security.md](docs/security.md) for the security model and resource limits.
