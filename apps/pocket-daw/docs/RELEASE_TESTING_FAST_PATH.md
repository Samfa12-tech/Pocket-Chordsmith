# Pocket DAW Release Testing Fast Path

Use this as the default procedure for an exact-artifact Pocket DAW checkpoint.
It records the lessons from the `0.6.41` release, where the release passed but
too much time was lost to repeated hardware smoke, duplicated gates, an
incorrect background PowerShell invocation, and late rediscovery of the itch
bootstrapper policy.

## Core Rule

Build the release installer once, record its SHA-256, and bind every installed
smoke summary, attestation, target report, updater manifest, and remote check to
that exact file. If a source or installer-producing change occurs, invalidate
the old evidence and start again from the final commit.

Do not rebuild after exact-installer smoke. In particular, do not run
`release:update:publish` after smoke: it rebuilds installers. Publish the
already-smoked files from `releases/updater/` instead.

## One-Pass Order

Run from `apps/pocket-daw/`.

1. Read `release-status.json`, `docs/CURRENT_RELEASE_STATUS.md`, this file, and
   `docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md` before deciding the release path.
2. Finish source, test, release-script, and release-note changes first.
3. Commit them and require a clean tracked worktree.
4. Run the bundled build gates once:

   ```powershell
   npm run release:update:full
   npm run verify:itch
   npm run release:update:fast
   ```

   `verify:itch` automatically sets `POCKET_DAW_SKIP_NATIVE_BUILD=1` so it
   validates and restages the installer built by `release:update:full` instead
   of producing a second native binary. `release:update:fast` then restages
   updater manifests around those same-version installers; it does not rebuild
   the native binary and cannot publish.
5. Record the full source commit, staged setup path, and setup SHA-256. Treat
   these three values as immutable candidate identity.
6. Run private/owned MIDI fixture validation once through the current parser
   and converter. Keep the fixture and report ignored; never commit owned MIDI.
7. Generate the native-capture fingerprint and select exactly one audio-evidence
   mode using the fail-closed rules below. Run one combined exact-installed
   punch/take smoke. The current installer always has to prove a real PCM take
   of the requested duration, retained WAV/MIDI export integrity, and connected
   loopMIDI input; only the human audibility threshold may come from an eligible
   prior baseline.
8. Run installed media portability once. Reuse its Godot and Web ZIPs for the
   target-runtime smokes and candidate verifier.
9. Run the installed VST3 host smoke against the sidecar inside that exact
   installation. It must process the deterministic instrument and effect
   fixtures and bind the installed sidecar hash to the candidate metadata.
10. Run one final Godot import/runtime smoke and one final Chromium Web Audio
   smoke. If either finds a product bug, fix it, commit, rebuild once, and
   discard all earlier exact-artifact evidence.
11. Build the attestation from the final evidence paths and SHA-256 values,
    including `audioCaptureEvidence` exactly as described below.
12. Run `verify:candidate` once with both game packs, current-installer
    export/MIDI flags, and exactly one fresh-audible or baseline-reuse mode.
13. Re-hash the staged setup and confirm it did not change.
14. Push the tested commit, publish the already-staged files without a rebuild,
    and verify the remote manifest, installer download hash, release tag, and
    target commit.

Do not separately rerun commands already contained inside these guarded scripts
unless diagnosing a failure. The guards intentionally repeat some checks; avoid
adding another manual layer of duplicate `npm test`, Cargo, build, and E2E runs.

## Combined Installed Audio and MIDI Smoke

The final strict summary must prove both hardware paths in the same run. Do not
merge separate summaries and do not weaken thresholds to obtain a pass.

Preflight:

```powershell
Get-Process loopMIDI
$setup = (Resolve-Path 'releases/updater/Pocket.DAW_<version>_x64-setup.exe').Path
$helper = (Resolve-Path 'scripts/send-loopmidi-smoke.ps1').Path
```

Start the exact installed app, allow its local bridge to become ready, then
start the MIDI sender. Quote the helper path because this repository path
contains spaces:

```powershell
$app = Join-Path $env:LOCALAPPDATA 'Pocket DAW\pocket-daw.exe'
Start-Process -FilePath $app
Start-Sleep -Seconds 12

$quotedHelper = '"' + $helper + '"'
Start-Process -FilePath 'powershell.exe' `
  -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quotedHelper) `
  -WindowStyle Hidden
Start-Sleep -Seconds 2
```

Generate and retain the deterministic capture fingerprint first:

```powershell
npm run --silent evidence:native-capture-fingerprint > <ignored-final-evidence-folder>\native-capture-fingerprint.json
```

The fingerprint covers the native CPAL recorder, recording bridge/input and
orchestration modules, capture-only regions in the large app/native entry
files, the CPAL dependency closure, and the Tauri API dependency used by the
bridge. A source edit outside those inputs does not invalidate human audibility
evidence. A changed/missing input, changed dependency, changed recipe schema,
or malformed fingerprint does.

Select exactly one mode:

- `fresh-audible`: required when the fingerprint changed or no eligible prior
  baseline is retained. The current run must clear the existing 3-second,
  0.005 file-peak, and 0.001 file-RMS thresholds. Do not lower them.
- `baseline-reuse`: allowed only when an exact prior `fresh-audible`
  attestation, its installer, and its attested punch summary are retained. The
  verifier re-hashes all of them, re-verifies the old summary at the unchanged
  audible thresholds, requires an identical current fingerprint, and forbids
  reuse chains. The current attestation must bind the prior attestation and
  installer filenames and SHA-256 values.

Use the proven ten-second timing for both phases. In fresh mode:

```powershell
npm run smoke:installed:punch-takes -- `
  --out <ignored-final-evidence-folder> `
  --installer "$setup" `
  --record-ms 10000 `
  --midi-record-ms 10000 `
  --require-audible-audio `
  --require-midi-input `
  --require-export-files
```

In baseline-reuse mode, run the same exact current-installer capture without
`--require-audible-audio`; keep both duration arguments and both MIDI/export
requirements:

```powershell
npm run smoke:installed:punch-takes -- `
  --out <ignored-final-evidence-folder> `
  --installer "$setup" `
  --record-ms 10000 `
  --midi-record-ms 10000 `
  --require-midi-input `
  --require-export-files
```

For a fresh run, verify that exact summary with `--require-audible-audio` as
before. In reuse mode, omit only that flag; `verify:candidate` performs the
baseline proof:

```powershell
npm run verify:installed:punch-takes -- `
  --summary <punch-take-lane-installed-smoke-summary.json> `
  --installer "$setup" `
  --require-audible-audio `
  --require-midi-input `
  --require-export-files
```

The attestation must contain one of these shapes (the fingerprint object is the
exact JSON emitted by `evidence:native-capture-fingerprint`):

```json
{
  "audioCaptureEvidence": {
    "mode": "fresh-audible",
    "fingerprint": { "schema": "pocket-daw-native-capture-v1", "algorithm": "sha256", "value": "<sha256>", "inputs": [] }
  }
}
```

```json
{
  "audioCaptureEvidence": {
    "mode": "baseline-reuse",
    "fingerprint": { "schema": "pocket-daw-native-capture-v1", "algorithm": "sha256", "value": "<sha256>", "inputs": [] },
    "baseline": {
      "attestationFile": "<prior-attestation.json>",
      "attestationSha256": "<sha256>",
      "installerFile": "<prior-setup.exe>",
      "installerSha256": "<sha256>"
    }
  }
}
```

The abbreviated empty `inputs` arrays above are explanatory only; the real
attestation must contain the complete non-empty emitted fingerprint.

Why ten seconds matters: shortening the first phase to four seconds left the
transport before the requested MIDI punch window in the `0.6.41` rehearsal.
The sender was connected and a take lane was created, but the in-window note
count was zero. Reusing the proven `10000/10000` timing captured 19 notes and
passed the strict audio thresholds in one unattended run.

If fresh audible audio fails, inspect the single summary first. Ask the user for
one deliberate microphone pass only when fresh mode is required and local
automation cannot meet the unchanged threshold; do not repeatedly ask them to
make noise. An unrelated installer with an eligible unchanged baseline needs no
human microphone pass. MIDI input remains the agent's job via the tracked
loopMIDI sender on every candidate.

## Process Launch and Cleanup Rules

- A `Start-Process -ArgumentList` script path containing spaces must be quoted
  inside the argument list. An unquoted `-File` path can make the helper exit
  immediately while the DAW reports zero MIDI notes.
- Do not find and kill helper processes by matching a command line that also
  appears in the current cleanup command. That can terminate the cleanup shell
  itself. Store the helper PID from `Start-Process -PassThru`, or stop a known
  PID/exact process name while excluding `$PID`.
- Confirm the installed app bridge is accepting requests before starting the
  smoke. An immediate `ECONNREFUSED` is a readiness failure, not a MIDI failure.
- Normalize installer and output paths to absolute paths before native bridge
  calls.
- Inspect the written JSON summary after a failure; do not guess from only the
  final exception text.

## MIDI Fixture Rules

- Distinguish live MIDI-input proof from MIDI-file conversion proof. The former
  uses loopMIDI and the installed app; the latter uses the owned score and the
  current parser/converter.
- Validate an owned score once and write a small ignored JSON metrics report.
- Assert source format/PPQ, tempo, meter, key, source/destination bars, section
  packing, resolution exactness, role counts, final voicings, generated-role
  counts, and raw-reference retention.
- Prefer the file/MCP/native bridge to fragile UI clicking when the claim is
  data fidelity rather than visual interaction.
- Never include the owned MIDI, PCS1 payload, or extracted handoff in git or a
  public release asset.

## Target Runtime Evidence

Use the installed media-portability smoke outputs as the only source packs:

- Godot: import the final Godot ZIP into a clean target project and retain the
  runtime report. Record engine version and pack SHA-256.
- Web: serve/extract the final Web ZIP, decode full mix, stems, and section loop
  in Chromium, and retain the runtime JSON. Require non-zero peak and a decoded
  duration matching the manifest within tolerance.

A packaging verifier warning that manual target smoke is required is expected;
it is satisfied by the retained Godot and Chromium reports, not by rerunning the
packager.

## Final Candidate Command

Fresh-audible mode:

```powershell
npm run verify:candidate -- `
  --attestation <final-attestation.json> `
  --installer <exact-staged-setup.exe> `
  --punch-take-summary <final-punch-summary.json> `
  --media-portability-summary <final-media-summary.json> `
  --vst3-host-summary <final-vst3-host-summary.json> `
  --require-audible-audio `
  --require-export-files `
  --require-midi-input `
  --commit <full-tested-commit> `
  --game-pack <final-godot.zip> --kind godot-adaptive-pack `
  --game-pack <final-web.zip> --kind web-game-pack
```

Baseline-reuse mode replaces only `--require-audible-audio`:

```powershell
npm run verify:candidate -- `
  --attestation <final-attestation.json> `
  --installer <exact-staged-setup.exe> `
  --punch-take-summary <final-punch-summary.json> `
  --media-portability-summary <final-media-summary.json> `
  --vst3-host-summary <final-vst3-host-summary.json> `
  --audio-capture-baseline-attestation <prior-fresh-attestation.json> `
  --audio-capture-baseline-installer <prior-exact-setup.exe> `
  --require-export-files `
  --require-midi-input `
  --commit <full-tested-commit> `
  --game-pack <final-godot.zip> --kind godot-adaptive-pack `
  --game-pack <final-web.zip> --kind web-game-pack
```

The verifier rejects neither-mode, both-mode, partial baseline paths, changed
fingerprints, altered baseline bytes, non-prior timestamps/commits, and any
baseline whose own mode is not direct `fresh-audible`.

After it passes, re-hash the setup EXE and compare it to the attestation and
installed-smoke summaries before publication.

## Publication Without Rebuild

The exact-smoked staged files live under `releases/updater/`. Push the tested
commit first, then create the GitHub release from those files using the asset
list in `scripts/release-updater-build.mjs:createGithubRelease`. Set
`--target` to the tested full commit. Do not call a build command between smoke
and upload.

Post-publication checks:

1. `gh release view <tag>` reports the intended target commit and all assets.
2. GitHub `latest/download/pocket-daw-latest.json` reports the new version.
3. The manifest setup URL returns HTTP 200 after redirects.
4. A downloaded remote setup EXE hashes exactly like the local staged setup.
5. `pocket-daw-bootstrapper-latest.json` reports the same installer hash.
6. The release tag, `origin/main`, and tested commit agree.

## Itch Policy

Normal Pocket DAW checkpoints do not push itch. The `windows-installer` channel
contains the stable downloader/bootstrapper, which reads the latest GitHub
bootstrapper manifest. Run `PUBLISH=1 npm run itch:push:bootstrapper` only when
the bootstrapper executable or its upload payload changes. `butler status`
remaining on an older bootstrapper user-version is therefore expected for a
normal GitHub updater release.

The old full-installer `itch:push` command is an emergency/manual fallback, not
the normal checkpoint path.

## Mistakes That Invalidate or Waste a Release Run

- Rebuilding or restaging a different setup EXE after exact-installer smoke.
- Running `release:update:publish` after collecting artifact-bound evidence.
- Repeating microphone tests without first inspecting peak/RMS in the summary.
- Expecting the user to provide MIDI input instead of using loopMIDI.
- Starting a PowerShell helper with an unquoted path containing spaces.
- Shortening the proven recording timing and moving capture outside the punch
  window.
- Treating `ECONNREFUSED` as a product failure before the app bridge is ready.
- Combining audio evidence from one run with MIDI evidence from another.
- Reconstructing attestation facts from chat instead of retained JSON and file
  hashes.
- Rediscovering itch policy at publication time instead of reading it first.
- Updating generated release truth in a way that pretends a post-release docs
  commit is the exact tested binary commit. Record the released commit, and
  require a version bump before the next package-producing source checkpoint.
