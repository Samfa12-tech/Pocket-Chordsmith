# Punch, Comping And Take Lanes Plan

This is the design anchor for punch-in/out, non-destructive take lanes and comping. Current source now has a user-facing first slice for punch recording and take-lane placement, while the published public checkpoint remains whatever `release-status.json` and `docs/CURRENT_RELEASE_STATUS.md` record after exact installed-artifact smoke.

## Current Baseline

- `src/app/App.ts` stops native recording, imports the WAV through `addImportedAudioMedia`, then places it through replace, punch-replace, full take-lane or punch take-lane flows before flushing autosave and saving the project file.
- The transport exposes `Punch` and `Replace` / `Take Lane` controls. Punch mode requires an explicit timeline punch selection and refuses to start when the playhead/requested start is after punch-in.
- `src/daw/audioClips.ts` implements `placeRecordingClipOnTrack` with same-track overwrite plus explicit manual latency-offset placement metadata, `placePunchRecordingClipOnTrack` for punch-window commits, and `placeTakeLaneRecordingClipOnTrack` for non-destructive full-take lanes.
- Placed audio clips now preserve source recording/take metadata such as `takeGroupId`, `recordingTakeGroupId`, `takeLaneId`, `takeLaneIndex`, `takeStatus`, `inputMode`, `channelMap` and latency evidence from the media item.
- `src/daw/clips.ts` has grouped-take helpers for audio and MIDI clips that create take-lane groups from overlapping selected clips, activate same-track sibling takes, activate whole take lanes for auditioning, archive/restore takes without deleting media, and split overlap-aligned grouped takes at the playhead for a first source-preserving comp segment foundation through normal undoable command/UI paths.
- `src/daw/midiClips.ts` can place punched MIDI recording takes from captured note events onto MIDI tracks, trimming notes to the punch window and preserving the same take group/lane metadata used by playback, save/reopen and MIDI export. Web MIDI input capture now starts transport when needed and auto-stops at the punch-out bar when Punch is enabled.
- Replace placement remains destructive at the clip level: overlapped audio clips are split away from the new recording range, and the right-hand remainder advances `metadata.sourceOffsetSeconds`. Take-lane placement is non-destructive: overlapping material is preserved as inactive grouped takes and the new recording becomes the active lane. Punch placement applies splitting or lane grouping only to an explicit visible punch range and stores `punchStartBar`, `punchEndBar`, `captureStartBar`, `sourceOffsetSeconds` and `sourceDurationSeconds` on the committed take clip.
- `clipIsAudibleTake` is now the shared export/playback policy for take metadata. Audio region rendering, generated/MIDI event rendering and MIDI export ignore inactive or archived take lanes even if a stale clip mute flag says otherwise.
- `src/daw/schema.ts` already has optional `Clip.lane`, `Clip.metadata`, `Track.metadata` and `MediaPoolItem.metadata`.
- `src/compatibility/migrations.ts` preserves clip, track and media metadata and clamps optional `Clip.lane` without requiring a schema-version bump for metadata-only planning.
- `tests/recordingAlpha.test.ts` intentionally covers fractional record placement, same-track overwrite splitting and right-hand source-offset preservation.

## Design Goals

- Preserve the current alpha behavior until the new feature has its own UI, command path and tests.
- Make punch regions explicit. A future punch may come from a selected timeline range, a loop range, or dedicated punch markers, but it should not silently infer a destructive edit from transport position alone.
- Keep raw recordings non-destructive by default. A captured WAV should remain in the media pool even when only a shorter punch window is committed to the timeline.
- Treat take lanes as timeline organization over normal audio clips first, not as a new incompatible project file type.
- Store enough metadata to reopen, undo, export and audit takes without hidden timing or compensation.
- Keep comping opt-in and visible. Export and playback should use only the audible comp or active take segments, while inactive lanes stay muted or archived.

## Proposed Metadata Direction

Keep `.pocketdaw` schema `2` while the first implementation proves the behavior. Store future fields in the existing metadata objects before adding hard schema fields.

Recorded media should identify the raw take:

```ts
interface RecordingTakeMediaMetadata {
  importMode: "native-recording";
  recordingTakeId: string;
  recordingTakeGroupId: string;
  recordingSessionId: number;
  recordedTrackId: string;
  requestedStartBar: number;
  requestedEndBar?: number;
  captureStartTransportSeconds: number | null;
  captureDurationSeconds: number;
  punchStartBar?: number;
  punchEndBar?: number;
  latencyCompensationAppliedSeconds: 0;
}
```

Timeline clips should identify their take-lane and comp role:

```ts
type TakeClipStatus = "active" | "muted-take" | "archived-take" | "comp-segment";

interface RecordingTakeClipMetadata {
  recordingTakeId: string;
  recordingTakeGroupId: string;
  takeLaneId: string;
  takeLaneIndex: number;
  takeStatus: TakeClipStatus;
  sourceOffsetSeconds: number;
  sourceDurationSeconds: number;
  punchStartBar?: number;
  punchEndBar?: number;
  compGroupId?: string;
  compSourceTakeId?: string;
  crossfadeInSeconds?: number;
  crossfadeOutSeconds?: number;
}
```

Use `Clip.lane` only as an optional visual lane index until the UI contract is proven. The durable identity should live in `metadata.takeLaneId` so reordering lanes does not rewrite the meaning of existing takes.

## Punch Recording Flow

1. Resolve a punch region from a user-visible source: selected range, loop range, or punch markers.
2. Start playback before the punch as pre-roll/count-in when requested.
3. Start native capture early enough to preserve safety margin, but store the raw capture as the source media.
4. Commit an audible clip only for the punch window, with `sourceOffsetSeconds` pointing into the raw take.
5. Preserve or mute the previous material according to the selected mode:
   - `Replace visible range`: current overwrite behavior, but with the new take metadata.
   - `Create new take lane`: no destructive timeline split; new take lands on a muted or active lane.
6. Store timing evidence plus `latencyCompensationRequestedSeconds`, `latencyCompensationAppliedSeconds` and `latencyCompensationMode` when the track has a visible manual offset.

## Take Lane And Comping Flow

- A take lane belongs to one track and one `recordingTakeGroupId`.
- The first foundation can turn overlapping selected audio or MIDI clips on one track into a durable take group, choose an active same-track grouped take by durable take metadata, activate every non-archived clip in a take lane for auditioning, archive/restore rejected takes, and split grouped audio or MIDI takes at the playhead for source-preserving comp decisions. The full implementation should still add explicit lane collapse/expand, richer mute/solo lane controls, dedicated punch markers, richer comp segment metadata and clearer lane identities.
- Comping has started as split audio clips that reference source take metadata and preserve source offsets. It does not need a new clip type if later comp segments become audio clips with `takeStatus: "comp-segment"`.
- Crossfades should use existing audio fade metadata first (`fadeInSeconds`, `fadeOutSeconds`) and only add comp-specific crossfade metadata when the UI needs to distinguish edit fades from comp boundaries.
- Undo/autosave must treat take-lane edits as normal project edits through `commitProject` and autosave flushes, matching current recording completion behavior.
- Save/reopen must preserve inactive lanes, comp segment metadata, source offsets and raw media references.

## Playback And Export Boundary

- Normal playback should ignore inactive take lanes by using `clipIsAudibleTake` and the active comp/take policy rather than relying only on the clip mute flag.
- WAV/stem/Godot pack export should render the same audible timeline users hear in the DAW.
- Inactive take media can remain in the media pool but should not appear as audible regions unless a lane is explicitly activated.
- Cache signatures should include any audible take/comp decision that changes rendered audio, but should not invalidate just because archived inactive takes exist.

## Risk Notes

- Do not combine this with ASIO or stereo/multitrack capture in the first slice. Those have separate design anchors.
- Do not destroy raw takes when editing a comp. Delete/archive should be explicit and undoable.
- Do not silently move clips for latency. Store evidence first; apply offsets only through the visible per-track manual offset command/control.
- Do not make `Clip.lane` the only durable lane identity. Lane ordering will change.
- Do not claim this source slice as the published public release behavior until installed recording smoke proves at least one punch flow and one save/reopen flow on the exact packaged artifact.

## Verification Targets

- Existing recording alpha tests still pass for current same-track overwrite behavior.
- Metadata roundtrip test preserves `recordingTakeId`, `recordingTakeGroupId`, `takeLaneId`, `takeStatus`, `punchStartBar`, `punchEndBar` and comp fields. Source has explicit punch-range setup, transport UI state, raw-take preservation, active-punch-range placement, same-track punch-window splitting, take-lane placement and save/reopen metadata survival coverage.
- Audio-clip region tests prove inactive take lanes do not render and active comp segments render with correct `sourceOffsetSeconds`.
- Event-renderer and MIDI-export tests prove inactive or archived MIDI take lanes do not play/export, even if mute state is stale, and lane activation switches the exported take.
- Undo/autosave tests should prove record completion, take activation, lane archive and comp edits are committed as project changes.
- Migration tests prove old projects without take metadata load unchanged and future metadata survives normalization.
- Installed smoke records or fixtures a punch take, creates MIDI take lanes and punched MIDI recording-take clips through the tokened live bridge, saves, reopens, audits punch/MIDI take metadata, edits MIDI take lanes through the tokened live bridge, and exports the same audible comp/take result. Candidate builds can use `npm run smoke:installed:punch-takes` for the no-hardware fixture path. Use `--require-export-files` while the generated export paths still exist to re-check the WAV/MIDI artifacts from the summary. For real hardware gates, use `--record-ms 5000` plus `--require-audible-audio` for non-trivial mic/interface signal evidence, and `npm run verify:installed:punch-takes -- --summary <summary.json> --installer <setup.exe> --require-midi-input` as the strict connected-controller gate once hardware is available. Source tests cover fake-device Web MIDI capture and MIDI punch-out; human listening evidence is still required before public audio-quality claims.

## Release Boundary

Until a deliberate public checkpoint is published, release notes should describe this as an unreleased source/local-candidate implementation rather than public behavior. The current source recording implementation remains one armed live audio track at a time, with user-facing punch replace, punch take-lane and full take-lane placement; MIDI take lanes cover imported/timeline clips, manual/bridge take-lane grouping, UI-created MIDI take clips, Web MIDI input capture from the first available input with transport start and punch-out, live-bridge punched MIDI recording-take placement, live-bridge range edits, playback and export. Real connected-controller installed smoke is still required before public MIDI hardware-capture claims.
