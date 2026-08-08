# Unsupported Runnable Archive Policy

Files under `apps/archive/unsupported-runnable-builds/` are historical evidence,
not current source, release inputs, security-supported applications, or examples
to copy forward.

- Archived files are immutable. Add a new archive entry instead of editing an
  existing snapshot.
- Every retained file is listed in `archive-manifest.json` with a version, date,
  retention reason and SHA-256.
- `ARCHIVE_INDEX.md` is generated from the manifest and verified in CI.
- Current app package scripts use explicit allowlists and never read this tree.
- `.ignore` keeps normal repository searches out of this tree; search it only by
  naming the path explicitly.
- `.gitattributes` excludes the runnable archive from generated source archives.
- Security support applies to current component paths. Reproduce a historical
  issue against current source before reporting it as a current vulnerability.

Run `node scripts/generate-archive-index.mjs` after adding a deliberately retained
snapshot. CI uses `node scripts/generate-archive-index.mjs --check`.
