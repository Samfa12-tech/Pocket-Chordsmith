# Pocket Audio Sound Parity Matrix

Use this matrix before changing sound IDs, voice curves, render/cache behavior, export packs, or playback profiles. Passing one layer does not prove full-family audio parity.

## Status Legend

- **Verified gate**: covered by a repeatable automated command in this repo.
- **First-pass**: implemented enough for deterministic fixtures or scaffolding, but not signed off as exact sound parity.
- **Manual smoke**: requires installed app, browser, Godot editor, or listening evidence.
- **Preview**: useful for auditioning/integration, not a production parity claim.

## Matrix

| Surface | Current role | Parity status | Required evidence before claiming parity |
| --- | --- | --- | --- |
| Pocket Chordsmith live playback | Primary sketchpad playback and editing feedback. | Manual smoke plus shared surface checks. | Chordsmith e2e smoke, no console errors, project-specific listening check for changed voices. |
| Pocket Chordsmith WAV export | Browser export path; v68 can use Core first with legacy fallback. | First-pass Core render plus legacy fallback; not full sound parity by default. | Chordsmith e2e WAV smoke, fixture duration/rough metrics, listening A/B when sound changes. |
| Pocket DJ live playback | Performance/remix deck; audible engine remains legacy DJ scheduler/synth. | Core mirrored state exists, audible parity is manual. | DJ e2e smoke for import/play/queue/mutes/build/drop plus listening check. |
| Pocket Audio Core event renderer | Shared deterministic timeline/event layer. | Verified gate. | `npm test`, `npm run compare:chordsmith-browser-trace`, and fixture golden tests. |
| Pocket Audio Core WAV/stem renderer | Shared headless render/export scaffold. | First-pass deterministic renderer. | `npm test`, render metrics, and explicit note that this is not exact Chordsmith/DJ/DAW sound parity unless A/B evidence is recorded. |
| Pocket DAW WebAudio/dev fallback | Development fallback and browser preview path. | Partial compatibility path, not installed-product truth. | DAW tests/build and browser/dev smoke only when the fallback is intentionally touched. |
| Pocket DAW native live playback | Installed-app playback target. | Manual smoke plus unit/native tests. | `npm test`, relevant native/cache tests, installed-app listening evidence, About/Diagnostics native playback counters. |
| Pocket DAW native render cache | Cached generated stems and imported/runtime audio handoff. | Verified by targeted tests and installed smoke when changed. | Native render-cache tests, cache invalidation checks, installed-app diagnostics showing expected cache/fallback counts. |
| Pocket DAW exports/game packs | Production arrangement and game-pack output. | Mixed: automated pack structure plus manual import/listening. | DAW tests/build, pack verification, Godot/web import smoke, and rendered asset listening check. |
| Godot addon editor preview kit | Audition/sample-kit path for editor and demos. | Preview. | Godot headless validation and editor preview smoke; do not claim exact Chordsmith/DAW parity from preview alone. |
| Godot addon STEM_SYNC/HYBRID runtime | Shipped game path using rendered stems/samples and conductor events. | Manual smoke plus headless validation. | `HEADLESS_VALIDATION.md` gate, DAW Adaptive Pack import validation, real scene playback/listening on target platforms. |
| Shared sound registries and generated surfaces | Sound IDs, lofi/chip metadata, generated Godot constants, DAW native recipes. | Verified gate. | `npm run verify:family-parity` from `packages/pocket-audio-core`. |

## Required Commands By Change Type

Sound ID, lofi/chip metadata, voice curve, generated surface, or cross-app sound registry changes:

```powershell
cd packages/pocket-audio-core
npm run verify:family-parity
```

Core-only event/render fixture changes:

```powershell
cd packages/pocket-audio-core
npm test
npm run build
npm run compare:chordsmith-browser-trace
```

Pocket DAW native/cache sound changes:

```powershell
cd apps/pocket-daw
npm test
npm run build
```

Then perform installed-app listening smoke and record exact version, installer hash, project, backend, cache/fallback counters, and result in the release status or smoke notes.

Godot pack/runtime changes:

```powershell
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/import_daw_game_pack.gd -- --pack <godot-adaptive-pack.zip>
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart <chart.tres> --profile <profile.tres> --report <report.md>
```

Then perform a real scene playback smoke if the change affects shipped runtime audio.

## Claiming Parity

Do not write "sound parity" or "matches Chordsmith" in release notes unless the evidence names:

- source project or fixture;
- app/build/version tested;
- renderer/backend tested;
- commands run;
- manual listening result when audible tone is the claim;
- known differences that remain.
