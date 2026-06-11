# Codex Prompt 04 — Build Parity Harness and Golden Fixtures

Build a proper parity harness for Pocket Audio Core before integrating it into Pocket Chordsmith, Pocket DJ or Pocket DAW.

## Goal

Prove that Pocket Audio Core understands the same project data, produces the same musical timeline, and can render comparable audio.

Timing/event parity is the first priority. Audio parity is the second priority.

## Required fixtures

Create a fixtures folder:

```text
packages/pocket-audio-core/tests/fixtures/
```

Add fixtures for:

1. Basic 4/4 major progression, no swing.
2. 3/4 time signature.
3. Swing groove.
4. Triplets/tuplets in drums.
5. Melody holds.
6. Melody slides if supported.
7. Bass manual notes, holds, slides and accents.
8. Guitar enabled with at least two pattern styles.
9. Multiple melody tracks with mute/solo/pan.
10. Section sequence A-B-C-D-A.
11. Build/drop/FX state fixture.
12. Legacy/minimal project with missing fields.

Where possible, use real exported Pocket Chordsmith JSON or `PCS1:` examples. Store both raw JSON and expected normalised snapshots if useful.

## Event trace output

Create a deterministic event trace format:

```text
packages/pocket-audio-core/tests/golden/<fixture>.events.json
```

The trace should include:

- section transitions
- bar/beat positions
- event time
- event duration
- stem
- event type
- note/pitch or drum name where relevant
- velocity/accent
- instrument/tone metadata where relevant
- tuplet/triplet markers where relevant

Do not include non-deterministic audio node IDs.

## Audio render output

Create optional rendered metrics:

```text
packages/pocket-audio-core/tests/golden/<fixture>.audio-metrics.json
```

Metrics should include:

- duration seconds
- sample rate
- channel count
- peak
- RMS
- rough spectral centroid or simple frequency-band summaries if feasible
- hash of quantised samples if deterministic enough in the same runtime

Do not rely only on bit-exact hashes across all browsers/OSes. Use event trace as the strict parity layer.

## Comparison commands

Add commands such as:

```bash
npm run test:core
npm run test:golden
npm run test:render
npm run update:golden
```

If the repo does not use npm, add equivalent scripts or document manual commands.

## App comparison

If feasible, create a helper that can run the current app's timeline/event generation and compare it to the core timeline. If the app code is too tangled, document what must be manually compared.

## Reports

Create:

```text
docs/POCKET_AUDIO_CORE_PARITY_REPORT.md
```

Include:

- fixtures tested
- event parity status
- audio metrics status
- known differences
- whether differences are acceptable
- commands run
- browser/Node versions used

## Pass/fail rule

Do not integrate into Pocket Chordsmith or Pocket DJ until:

- schema tests pass
- timeline/event tests pass for core fixtures
- at least one browser smoke test plays the demo without console errors
- offline render duration is correct for multiple fixtures

## Do not

- Do not hide differences by weakening tests too far.
- Do not mark parity as complete if only a simple fixture passes.
- Do not use visual playback position as proof of audio timing.
