# Security

Pocket Audio is a small public source project, but security and privacy issues
still matter, especially around local file handling, generated packages, browser
handoffs, and the Godot editor localhost receiver.

## Supported Scope

Security reports are most useful for:

- `apps/chordsmith-web/`
- `apps/pocket-dj/`
- `apps/pocket-daw/`
- `packages/pocket-audio-core/`
- `addons/pocket_chordsmith/`
- release and packaging scripts

Older archive snapshots are retained for reference and may not receive fixes
unless the same issue affects a current component.

## Reporting

If GitHub security advisories are available for this repository, use a private
security advisory. Otherwise contact the maintainer through the repository owner
or open a minimal public issue that avoids exploit details until a maintainer can
move the report to a private channel.

Please include:

- affected path or component
- steps to reproduce
- expected and actual behavior
- local environment, browser, Godot, or Node version if relevant
- whether generated files or user content are involved

## Localhost Receiver Note

The Godot addon includes an editor-only localhost receiver for browser-to-Godot
handoff. It is intended for local editor workflows, not exposed production
servers. Reports about receiver scope, validation, or accidental network
exposure are welcome.
