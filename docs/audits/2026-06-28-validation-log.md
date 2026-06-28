# Pocket Audio Audit Wave Validation Log

Date: 2026-06-28

Purpose: durable evidence for the post-audit work where connector-visible hosted
CI status was not available. This file separates local command validation,
manual Windows/Godot smoke, and hosted CI.

## Evidence Types

- `local command`: command run on this Windows development machine.
- `manual installed smoke`: installed app behavior verified locally by a human or Codex-assisted local run.
- `manual Godot smoke`: Godot editor/project behavior verified locally.
- `hosted CI`: GitHub Actions or another remote CI workflow tied to a commit.

## Audit Wave 1 Evidence

The broad audit-wave commit `9651b56978e1fa26458c3abadcfff4f47cb3e04b` recorded
local validation across browser apps, Pocket DAW, Pocket Audio Core, PCS Format,
and Godot-facing docs/tests. Treat this as local evidence unless a later entry
adds hosted CI links.

| Surface | Evidence type | Validation |
| --- | --- | --- |
| Chordsmith web | local command | `npm run test:e2e` in `apps/chordsmith-web` |
| Pocket DJ | local command | `npm run test:e2e` in `apps/pocket-dj` |
| Pocket DAW | local command | `npm run verify:versions`, `npm test`, `npm run build`, and targeted Rust tests in `apps/pocket-daw` |
| Pocket Audio Core | local command | `npm test`, `npm run build`, and `npm run verify:family-parity` in `packages/pocket-audio-core` |
| PCS Format | local command | `npm test` and `npm run build` in `packages/pcs-format` |
| DAW file association | manual installed smoke | Installed `0.6.34` `.pocketdaw` association, cold-start open, second-instance open, live `open_project`, and `pocket-daw://` handoff coexistence |
| DAW Godot pack | manual Godot smoke | Godot 4.6.3 local headless/editor import evidence is recorded in the workplan for TASK-19 |
| Hosted CI | hosted CI | No commit-linked hosted CI run was recorded during the post-reaudit pass |

## 2026-06-28 Manual Godot Game-Asset Smoke

Sam manually exported a project from Pocket DAW as a game asset and imported it
into Godot. Result: the import worked.

Record this as real manual DAW -> Godot game-asset evidence. It does not replace
hosted CI, exact-artifact release smoke, or the separate Chordsmith direct
browser-push-to-Godot smoke.

## Future Evidence Template

| Date | Commit/build | Surface | Evidence type | Command or action | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | commit/build label | app/package/addon | local command/manual installed smoke/manual Godot smoke/hosted CI | command or human action | pass/fail | artifact hash, Godot version, URL, or CI link |
