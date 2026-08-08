# Security Automation Policy

Repository-owned controls are:

- weekly Dependabot updates for every npm lockfile, Pocket DAW Cargo and pinned
  GitHub Actions;
- pull-request dependency review;
- CodeQL analysis for JavaScript/TypeScript and Rust;
- Rust formatting, tests and Clippy with warnings denied;
- a tracked-file secret-pattern scan that reports only file/line locations;
- lockfile/licensing/security-scope verification;
- CODEOWNERS review for native, handoff, Godot import, schema and release paths.

GitHub secret scanning and push protection are hosting controls and cannot be
enabled by a repository file. The repository owner should enable both in GitHub
Settings > Code security when the hosting plan exposes them. Until then, the CI
scan is a defense-in-depth gate; it is not described as equivalent to GitHub's
full secret-scanning service.

Deployment credentials, analytics configuration and private release evidence
remain outside the repository. Security checks must never print secret values.
