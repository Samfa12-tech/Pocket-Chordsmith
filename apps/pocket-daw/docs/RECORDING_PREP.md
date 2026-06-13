# Pocket DAW Recording Prep

Recording is intentionally disabled in v0.5.1/v0.6-foundation work.

## Existing Safe Hooks

- Track model fields: `recordKind`, `armed`, `inputDeviceId`
- Audio settings probe for native/browser devices
- Live vocal and live instrument track placeholders
- Mixer/routing scaffolds for future audio tracks

## Disabled UI

- Live audio tracks can be added as placeholders.
- Arm controls are disabled with a prerequisite message.
- No browser `getUserMedia` request is made.
- No native recording command exists.
- No fake recorded clips are created.

## Prerequisites Before Enabling Recording

- Packaged-app QA for project-relative media, native relink/reload and Collect Media.
- Input/output device selection.
- Latency and buffer-size settings.
- Armed-track rules.
- Waveform capture and recorded clip metadata.
- Meters for input monitoring.
- Routing behavior for monitoring and recording.
- Reload test for recorded clips after app restart.

## First Real Recording Slice

When prerequisites are ready, implement one narrow path first:

1. Native-only mono input capture to the existing project media folder.
2. Save a `.wav` under `project-media/`.
3. Add a Media Pool item with `mediaRefKind: "project"`.
4. Add an audio clip to the armed track.
5. Save, close, reopen and verify the clip reloads.
