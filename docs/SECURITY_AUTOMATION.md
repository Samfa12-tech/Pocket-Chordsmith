# Security Automation Policy

Repository-owned controls are:

- weekly Dependabot updates for every npm lockfile, Pocket DAW Cargo and pinned
  GitHub Actions;
- pull-request dependency review when the repository's GitHub Dependency graph
  setting is enabled; until then the workflow records a warning and the
  repository-owned all-lockfile high-severity audits remain hard gates;
- CodeQL analysis for JavaScript/TypeScript and Rust;
- Rust formatting, tests and Clippy with warnings denied;
- a tracked-file secret-pattern scan that reports only file/line locations;
- lockfile/licensing/security-scope verification;
- CODEOWNERS review for native, handoff, Godot import, schema and release paths.

GitHub Dependency graph, secret scanning, and push protection are hosting
controls and cannot be enabled by a repository file. The repository owner
should enable all available controls in GitHub Settings > Code security. Until
then, the CI scan and all-lockfile audits are defense-in-depth gates; they are
not described as equivalent to GitHub's
full secret-scanning service.

Deployment credentials, analytics configuration and private release evidence
remain outside the repository. Security checks must never print secret values.
