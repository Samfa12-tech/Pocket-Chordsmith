# Punch, Comping And Take Lanes Plan

This is the design anchor for punch-in/out, non-destructive take lanes and comping. It does not change the current shipped behavior: Pocket DAW still records one armed live track at a time in the installed app, writes a project-relative WAV take, and places that take on the armed track with same-track overwrite.

## Current Baseline

- `src/app/App.ts` stops native recording, imports the WAV through `addImportedAudioMedia`, places it with `placeRecordingClipOnTrack`, flushes autosave, then saves the project file.
- `src/daw/audioClips.ts` implements `placeRecordingClipOnTrack` as `placeAudioClipOnTrack(..., { overwriteOverlaps: true })`, and now has a helper-level `placePunchRecordingClipOnTrack` foundation plus undoable command/file-first MCP wiring that commits only an explicit punch window from a longer raw take while preserving source/take metadata.
- Placed audio clips now preserve source recording/take metadata such as `takeGroupId`, `recordingTakeGroupId`, `takeLaneId`, `takeLaneIndex`, `takeStatus`, `inputMode`, `channelMap` and latency evidence from the media item.
- `src/daw/clips.ts` has grouped-take helpers that activate same-track sibling takes, activate whole take lanes for auditioning, archive/restore takes without deleting media, and split overlap-aligned grouped takes at the playhead for a first source-preserving comp segment foundation through normal undoable command/UI paths.
- Current same-track overwrite is destructive at the clip level: overlapped audio clips are split away from the new recording range, and the right-hand remainder advances `metadata.sourceOffsetSeconds`. File-first and live MCP can now mark an explicit punch range by storing `timeline.selection.source = "punch"` before later punch/take smoke, and both file-first MCP plus the tokened live MCP bridge can place an existing raw take from that active punch range. The helper-level punch foundation applies splitting only to an explicit visible punch range and stores `punchStartBar`, `punchEndBar`, `captureStartBar`, `sourceOffsetSeconds` and `sourceDurationSeconds` on the committed take clip.
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
6. Store timing evidence and `latencyCompensationAppliedSeconds: 0` unless a future visible compensation command applies an offset.

## Take Lane And Comping Flow

- A take lane belongs to one track and one `recordingTakeGroupId`.
- The first foundation can already choose an active same-track grouped take by clip mute state, activate every non-archived clip in a take lane for auditioning, archive/restore rejected takes, and split grouped takes at the playhead for source-preserving comp decisions. The full implementation should still add explicit lane collapse/expand, richer mute/solo lane controls, dedicated punch regions, richer comp segment metadata and clearer lane identities.
- Comping has started as split audio clips that reference source take metadata and preserve source offsets. It does not need a new clip type if later comp segments become audio clips with `takeStatus: "comp-segment"`.
- Crossfades should use existing audio fade metadata first (`fadeInSeconds`, `fadeOutSeconds`) and only add comp-specific crossfade metadata when the UI needs to distinguish edit fades from comp boundaries.
- Undo/autosave must treat take-lane edits as normal project edits through `commitProject` and autosave flushes, matching current recording completion behavior.
- Save/reopen must preserve inactive lanes, comp segment metadata, source offsets and raw media references.

## Playback And Export Boundary

- Normal playback should ignore inactive take lanes by using existing clip mute state and the active comp/take policy.
- WAV/stem/Godot pack export should render the same audible timeline users hear in the DAW.
- Inactive take media can remain in the media pool but should not appear as audible regions unless a lane is explicitly activated.
- Cache signatures should include any audible take/comp decision that changes rendered audio, but should not invalidate just because archived inactive takes exist.

## Risk Notes

- Do not combine this with ASIO or stereo/multitrack capture in the first slice. Those have separate design anchors.
- Do not destroy raw takes when editing a comp. Delete/archive should be explicit and undoable.
- Do not silently move clips for latency. Store evidence first; apply offsets only through a visible command.
- Do not make `Clip.lane` the only durable lane identity. Lane ordering will change.
- Do not claim punch/comping in release notes until installed recording smoke proves at least one punch flow and one save/reopen flow.

## Verification Targets

- Existing recording alpha tests still pass for current same-track overwrite behavior.
- Metadata roundtrip test preserves `recordingTakeId`, `recordingTakeGroupId`, `takeLaneId`, `takeStatus`, `punchStartBar`, `punchEndBar` and comp fields. Source now has explicit MCP punch-range setup plus helper-level, undoable command, file-first MCP and tokened live MCP punch placement coverage for raw-take preservation, active-punch-range placement, same-track punch-window splitting, MCP summary visibility and save/reopen metadata survival; native punch UI/transport smoke remains future work.
- Audio-clip region tests prove inactive take lanes do not render and active comp segments do render with correct `sourceOffsetSeconds`.
- Undo/autosave tests prove record completion, take activation, lane archive and comp edits are committed as project changes. Source already has unit coverage for grouped take activation, take-lane activation/auditioning from UI plus file/live MCP, archive/restore, comp-from-playhead splitting and save/reopen metadata preservation; installed smoke and full punch-flow coverage remain future work.
- Migration tests prove old projects without take metadata load unchanged and future metadata survives normalization.
- Installed smoke records a punch take, saves, reopens, audits media references under `project-media/recordings`, and exports the same audible comp/take result.

## Release Boundary

Until the full command paths, UI states and installed smoke exist, release notes should continue to say: no punch-in/out, no full comping and no full take-lane workflow. The current recording implementation remains one armed live track at a time with same-track overwrite placement, plus source-only grouped-take activation, UI/file/live MCP take-lane activation/auditioning, archive/restore and comp-from-playhead foundations for clips that already share a take group.
