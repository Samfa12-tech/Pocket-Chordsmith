# Game Pack Export Smoke Checklist

Use this checklist for Pocket DAW Godot/Web ZIP pack verification. Keep this work scoped to `apps/pocket-daw/`; do not edit `addons/` while running these checks.

## Current supported pack

- Export target: Godot Adaptive Pack or Web Game Pack.
- Audio format: WAV only.
- Expected ZIP folders: `audio/full/`, `audio/stems/`, `audio/sections/`, `manifests/`, `source/`.
- Expected manifest fields: project metadata, deterministic paths, artifact summaries, byte-size summary, WAV codec metadata, planned FLAC/Ogg/MP3 metadata marked as planned.

## DAW smoke

- Open or create a project with generated sections.
- Export Godot Adaptive Pack.
- Export Web Game Pack.
- Run `npm run verify:game-pack -- path/to/export.zip --kind godot-adaptive-pack` for the Godot ZIP.
- Run `npm run verify:game-pack -- path/to/export.zip --kind web-game-pack` for the Web ZIP.
- Use Push Godot Pack only when a local loopback receiver is running; if unavailable, confirm Pocket DAW saves the fallback ZIP and still run the verifier command on that ZIP.
- Inspect each ZIP and confirm it contains:
  - one manifest under `manifests/`;
  - one source `.pocketdaw.json` under `source/`;
  - one full mix WAV under `audio/full/`;
  - stem WAVs under `audio/stems/`;
  - section loop WAVs under `audio/sections/`.
- Open the manifest and confirm:
  - every listed `files` path exists in the ZIP;
  - every `artifacts` path exists in the ZIP;
  - `sizeSummary.missingSizePaths` is empty;
  - `sizeSummary.renderedFileCount` equals `sizeSummary.expectedFileCount`;
  - current audio metadata says `format: "wav"` and `status: "implemented"`;
  - FLAC, Ogg Vorbis and MP3 metadata remain `status: "planned"`.

## Manual target smoke

- Import the Godot pack into the separate Godot test worktree without changing the addon.
- Record the Pocket DAW version, ZIP filename, Godot version, addon version, import path and result.
- For Web Game Pack, load the ZIP contents in the target web-game harness and confirm the manifest paths resolve.

Evidence template:

- Pocket DAW version:
- Godot ZIP filename:
- Godot ZIP SHA-256:
- Godot version:
- Godot addon version:
- Godot import path:
- Godot result: PASSED / FAILED / MANUAL NOT RUN
- Web ZIP filename:
- Web ZIP SHA-256:
- Web harness/app:
- Web browser/runtime:
- Web manifest root/path:
- Web result: PASSED / FAILED / MANUAL NOT RUN
- tester/date:
- notes:

Current milestone status: Godot target import smoke and Web target harness smoke are Manual / Not run. Automated ZIP structure tests cover manifest/source/mix/stems/section-loop packaging only; release notes must not claim target-runtime validation until this checklist records the relevant pass.

## Release claim boundary

- Current release notes may claim WAV-based Godot/Web ZIP packs only when this checklist passes.
- Do not claim FLAC, Ogg Vorbis, MP3 or compressed loop-safe packs until encoders, manifests and real target-runtime smoke are all proven.
