# Web Release Provenance

Repository-owned web package commands write a ZIP and an adjacent
`*.release.json` manifest under `local-artifacts/staging/<component>/`. The
manifest binds the package hash to the source commit, app build, schema/core
versions, build time, source entry and required package files.

Keep credentials out of these files. After publication, copy the exact adjacent
manifest here only when the uploaded bytes and remote deployment identifier have
been verified. A package generated from a dirty tree is evidence for local
testing, not a deployable provenance claim.

The Chordsmith record in this directory is the last deployment for which the
repository still retains the exact published ZIP and hash. Existing Pocket DJ
and Handoff deployments predate this manifest contract; do not retroactively
claim an unknown package hash. Their next deployment must retain the generated
manifest.
