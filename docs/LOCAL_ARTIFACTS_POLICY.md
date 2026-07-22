# Local Artifacts Policy

The repository root contains only canonical source, tracked documentation, and
repository tooling. Local material that is too large, generated, private, or
historical belongs under the ignored `local-artifacts/` folder.

## Canonical Source

- `addons/pocket_chordsmith/` is the only Pocket Chordsmith Godot addon source.
- `apps/` contains the active Chordsmith, DJ, and native Pocket DAW apps.
- `packages/` contains shared libraries and format contracts.
- `docs/` contains durable, tracked documentation and release procedures.
- `scripts/` contains reusable repository tooling.

Never duplicate an app, addon, or package checkout at the repository root.
Historical checkouts are local references, not alternate sources of truth.

## Local Artifact Layout

```text
local-artifacts/
  staging/    # replaceable packages and candidate output
  archive/    # retained release evidence and historical references
  scratch/    # rebuildable, short-lived experiments and temporary tools
```

Use a descriptive component and version/date below those categories, for
example `archive/godot-addon/1.2.0/` or
`scratch/mureka/2026-07-17/`. A package that must be retained has one canonical
copy, its checksum, and an adjacent manifest or evidence note. Byte-identical
channel copies are not retained.

## Operational Exceptions

Pocket DAW keeps its ignored `apps/pocket-daw/releases/` directory because the
native release scripts and exact-installer evidence use `updater/` and `itch/`
there. Do not move those paths piecemeal. A future migration must update the
scripts, documentation, and release verification atomically.

Generated dependency/build/cache folders remain ignored beside the component
that produces them (`node_modules/`, `dist/`, `src-tauri/target/`, Godot
`.import`/`.uid`, test reports, and local `.pocketdaw` saves).

## Retention Rules

- Scratch material is removable once its result is recorded or reproducible.
- Staging retains the current candidate only; superseded candidates are
  archived only when their evidence is needed.
- Archive retains exact published installers, updater manifests, checksums,
  audio-delivery archives, and named historical references.
- Never delete a release artifact merely because it is old: first verify its
  checksum/evidence is represented by the retained canonical copy.

## Enforcement

Run `node scripts/check-repo-organization.mjs` before committing structural
work. CI rejects legacy root artifact folders, root-level release packages, and
nested Git repositories inside canonical source roots.
