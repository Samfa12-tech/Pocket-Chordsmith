# Pocket DAW Release Testing Fast Path

Use this as the default procedure for an exact-artifact Pocket DAW checkpoint.
It records the lessons from the `0.6.41` release, where the release passed but
too much time was lost to repeated hardware smoke, duplicated gates, an
incorrect background PowerShell invocation, and late rediscovery of the itch
bootstrapper policy.

Current boundary: 0.6.47 is a source-only process checkpoint. No 0.6.47
installer was produced. The next package-producing source checkpoint must bump
to at least 0.6.48 before running `release:prepare`.

## Core Rule

Run `release:prepare` once. It runs every source gate once, performs one Tauri
release build and one package/stage/verify pass, then writes an immutable
candidate receipt that binds the full commit, version, setup/MSI and updater
signatures, release/updater/bootstrapper manifests, checksums, verdict, and
packaged VST3 sidecar hash. If source or any receipt-bound byte changes,
invalidate the evidence and start again at a new version from the final commit.

After preparation, `verify:candidate` is evidence-only: it re-hashes the
receipt and frozen artifacts and runs the existing strict installed-evidence
validators without source tests or builds. `release:publish-exact` accepts only
that receipt plus its immutable candidate-verification report and uploads those
already-smoked bytes. It never builds or restages.

## One-Pass Order

Run from `apps/pocket-daw/`.

1. Read `release-status.json`, `docs/CURRENT_RELEASE_STATUS.md`, this file, and
   `docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md` before deciding the release path.
2. Finish source, test, release-script, and release-note changes first.
3. Commit them and require a clean tracked worktree.
4. Run the single bundled prepare gate once:

   ```powershell
   npm run release:prepare
   ```

   This performs version/sound/CI/parity gates, one Vitest run, one Cargo run,
   one Chromium E2E run, one Tauri release build (whose configured frontend
   hook builds once), one release package, one artifact verification, and one
   updater stage. It refuses a dirty tracked tree and refuses to overwrite an
   existing receipt. `release:update` and `release:update:full` are safe aliases;
   `verify:itch` is a deprecated alias for the same one-pass command.
   `release:update:fast` is retired and fails without touching artifacts.
5. Retain `releases/updater/pocket-daw-candidate-receipt-v<version>.json`.
   Its commit, staged setup path/hash and other artifact hashes are immutable
   candidate identity. Do not hand-edit it.
6. Run private/owned MIDI fixture validation once through the current parser
   and converter. Keep the fixture and report ignored; never commit owned MIDI.
7. Generate the native-capture fingerprint and select exactly one audio-evidence
   mode using the fail-closed rules below. Fresh and baseline-reuse modes use one
   combined exact-installed punch/take smoke. Manual-fresh mode explicitly binds
   one direct manual recording plus one later, separately named automated
   companion run; it never claims they were the same run. The current installer
   always has to prove a real PCM take of the requested duration, retained
   WAV/MIDI export integrity, and connected loopMIDI input.
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
12. Run `verify:candidate` once with the receipt, both game packs, current-installer
    export/MIDI flags, and exactly one fresh-audible, manual-fresh-audible, or
    baseline-reuse mode.
13. Re-hash the staged setup and confirm it did not change.
14. Push the tested commit, then publish with `PUBLISH=1 npm run
    release:publish-exact -- --receipt <receipt> --verification-report <report>`.
    The command re-hashes the receipt, every frozen upload and every retained
    evidence file before upload, targets the receipt commit explicitly, and
    performs the remote manifest/download checks without a build or restage.

Do not separately rerun commands already completed in the receipt unless
diagnosing a failure. A diagnosis does not update the immutable receipt; any
source or package-producing correction requires a new version and prepare run.

## Combined Installed Audio and MIDI Smoke

The final strict summary must prove both hardware paths in the same run in
`fresh-audible` mode. Do not merge summaries or weaken thresholds. The explicit
`manual-fresh-audible` contract below is different: it retains a directly
analyzed manual WAV and a separately identified automated companion summary,
and its schema forbids describing them as same-run evidence.

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

The v2 fingerprint covers semantic PCM acquisition: the native CPAL recorder,
recording bridge/input and device routing, armed preview/start control,
capture-only native entry regions, the CPAL dependency closure, and the Tauri
API dependency used by the bridge. Post-capture take labels are excluded because
they cannot change captured samples and are independently enforced by the
current installed smoke. A source edit outside those inputs does not invalidate
human audibility evidence. A changed/missing input, changed dependency, changed
schema, or malformed fingerprint does.

Select exactly one mode:

- `fresh-audible`: required when the fingerprint changed or no eligible prior
  baseline is retained. The current run must clear the existing 3-second,
  0.005 file-peak, and 0.001 file-RMS thresholds. Do not lower them.
- `baseline-reuse`: allowed only when an exact prior direct `fresh-audible` or
  fully verified direct `manual-fresh-audible` attestation, its installer, and
  its attested punch summary are retained. The verifier re-hashes all files,
  re-verifies the direct audible evidence, requires an identical semantic PCM
  fingerprint, and forbids reuse chains. The current attestation must bind the
  prior attestation and installer filenames and SHA-256 values.
- `manual-fresh-audible`: allowed when one deliberate recording already exists
  from the exact candidate and another microphone action is unnecessary. A
  generated report independently re-hashes and parses that WAV, enforces the
  unchanged duration/peak/RMS thresholds, binds the referenced project clip,
  pre-capture project, input device/channel, exact installer, commit and
  fingerprint, and records capture/finalization timestamps. A later automated
  companion run against the same installer must still prove current PCM file
  integrity, connected loopMIDI and retained WAV/MIDI exports. The attestation
  binds both files and hashes separately; neither file may be substituted,
  chained, timestamped before the manual capture, or described as same-run.

The installed smoke refreshes the candidate's native device list before it
arms recording. By default it selects the probed default input and zero-based
channel index `0` (Mono Ch 1). To bind a different mono channel, pass the exact
probed device ID and a zero-based channel index. For example, this machine's
built-in two-channel microphone array uses:

```powershell
--audio-input-device-id "wasapi:input:microphone-array" `
--audio-input-channel-index 1
```

The runner fails closed if the device is absent, the channel is out of range,
the saved/reopened project does not preserve the assignment, or native armed
preview does not report the exact device/channel before the unchanged meter
threshold. Do not substitute a display name for the probed device ID.

Use the proven ten-second timing for both phases. In fresh mode:

```powershell
npm run smoke:installed:punch-takes -- `
  --out <ignored-final-evidence-folder> `
  --installer "$setup" `
  --record-ms 10000 `
  --midi-record-ms 10000 `
  --audio-input-device-id <available-input-device-id> `
  --audio-input-channel-index <available-zero-based-channel> `
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

In manual-fresh mode, first create the direct manual report beside retained
copies of the recorded project, its pre-capture project, and referenced WAV:

```powershell
npm run evidence:manual-fresh-audible -- create `
  --out-path <ignored-evidence-folder>\manual-fresh-audible-evidence.json `
  --project-path <ignored-evidence-folder>\recorded.pocketdaw `
  --pre-capture-project-path <ignored-evidence-folder>\recorded.pocketdaw.bak `
  --wav-path <ignored-evidence-folder>\project-media\recordings\manual-take.wav `
  --installer-path "$setup" `
  --fingerprint-path <ignored-evidence-folder>\native-capture-fingerprint.json `
  --version <version> --commit <exact-candidate-commit> `
  --clip-id <recorded-clip-id> --track-id <recorded-track-id>
```

The report creator refuses overwrite, non-PCM16/native WAVs, threshold failure,
missing project references, channel drift, hash/timestamp mismatch, and files
outside its retained evidence folder. `--fingerprint-path` is the fingerprint
retained at capture time: v2 for new runs, or the exact original v1 preflight
file for the legacy 0.6.46 take. The report always computes and binds the
semantic v2 candidate fingerprint as well. Then run the automated companion once,
without `--require-audible-audio`; keep explicit input routing when applicable:

```powershell
npm run smoke:installed:punch-takes -- `
  --out <ignored-companion-folder> `
  --installer "$setup" `
  --record-ms 10000 `
  --midi-record-ms 10000 `
  --audio-input-device-id "wasapi:input:microphone-array" `
  --audio-input-channel-index 1 `
  --require-midi-input `
  --require-export-files
```

The exact `0.6.46` candidate at commit
`e650be444207cb81c7b91035be5eb4e62fafc326` wrote `[0]` into mono take metadata
even when native capture received Mono Ch2. Only that version/commit may use the
narrow `known-bug-corroborated` rule, and only when both the pre-capture and
recorded projects preserve the same explicit non-Ch1 assignment while the clip
and media contain the exact legacy `[0]` defect. All later candidates require
take metadata to match the selected channel exactly. Its automated companion
must use a channel whose saved take metadata is truthful (Mono Ch1 is the
compatible default for that one legacy build); the manual report remains the
independently corroborated Mono Ch2 audible proof. Every rebuilt candidate must
use the intended explicit channel, and the installed smoke now fails unless the
saved clip and media channel maps both equal that request.

The manual report also retains the exact original v1 capture-run fingerprint
and verifies it deterministically at the candidate commit. The semantic v2
fingerprint and independently tested take metadata are a versioned separation,
not a broad source-change bypass.

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
    "fingerprint": { "schema": "pocket-daw-native-pcm-capture-v2", "algorithm": "sha256", "value": "<sha256>", "inputs": [] }
  }
}
```

```json
{
  "audioCaptureEvidence": {
    "mode": "manual-fresh-audible",
    "fingerprint": { "schema": "pocket-daw-native-pcm-capture-v2", "algorithm": "sha256", "value": "<sha256>", "inputs": [] },
    "manual": {
      "evidenceFile": "manual-fresh-audible-evidence.json",
      "evidenceSha256": "<sha256>"
    },
    "companion": {
      "summaryFile": "automated-companion-summary.json",
      "summarySha256": "<sha256>"
    }
  }
}
```

```json
{
  "audioCaptureEvidence": {
    "mode": "baseline-reuse",
    "fingerprint": { "schema": "pocket-daw-native-pcm-capture-v2", "algorithm": "sha256", "value": "<sha256>", "inputs": [] },
    "baseline": {
      "attestationFile": "<prior-attestation.json>",
      "attestationSha256": "<sha256>",
      "installerFile": "<prior-setup.exe>",
      "installerSha256": "<sha256>"
    }
  }
}
```

The abbreviated empty `inputs` arrays above are explanatory only; every real
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
  --receipt <candidate-receipt.json> `
  --attestation <final-attestation.json> `
  --punch-take-summary <final-punch-summary.json> `
  --media-portability-summary <final-media-summary.json> `
  --vst3-host-summary <final-vst3-host-summary.json> `
  --require-audible-audio `
  --require-export-files `
  --require-midi-input `
  --game-pack <final-godot.zip> --kind godot-adaptive-pack `
  --game-pack <final-web.zip> --kind web-game-pack
```

Baseline-reuse mode replaces only `--require-audible-audio`:

```powershell
npm run verify:candidate -- `
  --receipt <candidate-receipt.json> `
  --attestation <final-attestation.json> `
  --punch-take-summary <final-punch-summary.json> `
  --media-portability-summary <final-media-summary.json> `
  --vst3-host-summary <final-vst3-host-summary.json> `
  --audio-capture-baseline-attestation <prior-fresh-attestation.json> `
  --audio-capture-baseline-installer <prior-exact-setup.exe> `
  --require-export-files `
  --require-midi-input `
  --game-pack <final-godot.zip> --kind godot-adaptive-pack `
  --game-pack <final-web.zip> --kind web-game-pack
```

Manual-fresh-audible mode also omits `--require-audible-audio` and baseline
paths, and supplies its exact direct report:

```powershell
npm run verify:candidate -- `
  --receipt <candidate-receipt.json> `
  --attestation <final-attestation.json> `
  --punch-take-summary <automated-companion-summary.json> `
  --manual-fresh-audible-evidence <manual-fresh-audible-evidence.json> `
  --media-portability-summary <final-media-summary.json> `
  --vst3-host-summary <final-vst3-host-summary.json> `
  --require-export-files `
  --require-midi-input `
  --game-pack <final-godot.zip> --kind godot-adaptive-pack `
  --game-pack <final-web.zip> --kind web-game-pack
```

For guarded publication in this mode, set
`MANUAL_FRESH_AUDIBLE_EVIDENCE` to that exact report in addition to the normal
`SMOKE_ATTESTATION` and `PUNCH_TAKE_SUMMARY` bindings. Do not set
`PUNCH_TAKE_REQUIRE_AUDIBLE_AUDIO` or either baseline environment variable.

The verifier rejects neither-mode, multiple modes, partial baseline paths,
changed fingerprints, altered manual/companion/baseline bytes, invalid evidence
ordering, reuse chains, and any baseline whose own mode is not direct
`fresh-audible` or fully verified direct `manual-fresh-audible`.

After it passes, retain the emitted
`pocket-daw-candidate-verification-v<version>.json`. It binds the receipt and
all evidence bytes. The setup path, version and commit come from the receipt;
legacy `--installer`, `--version`, and `--commit` arguments are optional and
are rejected if they disagree.

## Publication Without Rebuild

The exact-smoked staged files live under `releases/updater/`. Push the tested
commit first, then run:

```powershell
$env:PUBLISH = "1"
npm run release:publish-exact -- `
  --receipt <candidate-receipt.json> `
  --verification-report <candidate-verification.json>
```

The command verifies all frozen artifacts and retained evidence, uploads the
receipt-bound asset list, and sets `--target` to the receipt commit. The legacy
`release:update:publish` name is a safe alias for this exact-only path and no
longer builds.

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
- Calling any installer-producing command after the receipt exists.
- Deleting or editing a receipt to restage same-version bytes instead of bumping the version.
- Repeating microphone tests without first inspecting peak/RMS in the summary.
- Expecting the user to provide MIDI input instead of using loopMIDI.
- Starting a PowerShell helper with an unquoted path containing spaces.
- Shortening the proven recording timing and moving capture outside the punch
  window.
- Treating `ECONNREFUSED` as a product failure before the app bridge is ready.
- Combining audio evidence from one run with MIDI evidence from another unless
  the attestation explicitly uses `manual-fresh-audible`, separately hashes both
  direct files, and never claims they were captured in the same run.
- Reconstructing attestation facts from chat instead of retained JSON and file
  hashes.
- Rediscovering itch policy at publication time instead of reading it first.
- Updating generated release truth in a way that pretends a post-release docs
  commit is the exact tested binary commit. Record the released commit, and
  require a version bump before the next package-producing source checkpoint.
