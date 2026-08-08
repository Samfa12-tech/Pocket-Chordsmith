# Pocket Audio Family Release Dashboard

The current dashboard is generated from the machine-readable family manifest:

- Source: `FAMILY_MANIFEST.json`
- Generated dashboard: `docs/generated/RELEASE_DASHBOARD.md`
- Component version matrix: `docs/generated/COMPONENT_VERSION_MATRIX.md`

Run `node scripts/generate-family-governance.mjs` to refresh generated views.
CI runs the same command with `--check` and fails on path, version, release or
documentation drift.

Pocket DAW exact release claims remain owned by
`apps/pocket-daw/release-status.json` and its generated current-status document.
Source, latest published and last exact installed-smoke versions are separate
domains and must not be collapsed into one claim.
