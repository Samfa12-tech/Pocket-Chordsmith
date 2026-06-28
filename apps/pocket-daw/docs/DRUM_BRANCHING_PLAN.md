# Drum Branching Plan

This note defines the future workflow for expanding generated Chordsmith drums into separate DAW tracks without breaking source preservation.

Current Pocket DAW already supports per-drum-lane mix and FX metadata on the generated `Drums` track. That is the right foundation. The future branch/explode workflow should expose separate Kick, Snare, Hat, Clap, Open Hat, and future kit-piece tracks for DAW mixing while keeping the canonical Chordsmith drum source intact.

## Current Boundary

Current generated drums are source-driven:

- `sourceRefs[].original` preserves the imported Pocket Chordsmith project.
- `sourceRefs[].normalized` carries sanitized Chordsmith source data.
- generated section clips reference the Chordsmith source and render drum events from `gridA-H.kick`, `gridA-H.snare`, `gridA-H.hat`, tuplets, accents, drum kit, groove metadata, and shared drum-lane definitions.
- per-lane mix/FX currently live under the generated Drums track metadata as `metadata.drumLanes`.

The existing per-lane mixer is not a full branch/explode workflow. It should remain the lightweight default because it keeps simple projects compact.

## User Workflows

### Show Drum Kit Lanes

Default current behavior. The Drums track remains one generated track with lane-level controls in the inspector/mixer.

Use this for:

- quick Chordsmith editing
- stem/export parity
- simple alpha projects
- users who do not need separate drum tracks

### Branch Generated Drums

Command label: `Branch Drums to Tracks`

Creates visible child tracks for sequenced drum lanes while preserving the parent generated Drums track and Chordsmith source.

Initial branch targets:

- Kick
- Snare
- Hi-hat

Near-term branch targets from shared drum-lane definitions:

- Open Hat
- Clap
- Ride
- Crash
- Tom or future kit-piece lanes as shared core exposes them

### Collapse Drum Branches

Command label: `Collapse Drum Branches`

Hides or removes generated child views while preserving the lane metadata and canonical source. This should not delete Chordsmith grid data.

## Data Model Direction

Do not duplicate drum source grids into independent authored clips as the default. Instead, represent branches as views/adapters over the same source events.

Suggested metadata shape:

```json
{
  "drumBranching": {
    "enabled": true,
    "parentTrackId": "drums",
    "mode": "generated-source-view",
    "lanes": {
      "kick": { "trackId": "drums:kick", "visible": true },
      "snare": { "trackId": "drums:snare", "visible": true },
      "hat": { "trackId": "drums:hat", "visible": true }
    }
  }
}
```

Child tracks should carry metadata that points back to the parent and lane:

```json
{
  "generatedDrumLane": "snare",
  "parentGeneratedTrackId": "drums",
  "sourceRefId": "src_pcs_001",
  "branchMode": "generated-source-view"
}
```

Track IDs may use a safe internal convention such as `drums-kick`, `drums-snare`, and `drums-hat`; display labels can be user-facing names.

## Editing Rules

Source edits:

- Step edits on branched Kick/Snare/Hat tracks must call the same Chordsmith editor commands used by the current drum grid.
- Tuplets, accents, and section lengths must keep updating `sourceRefs[].original` and `sourceRefs[].normalized`.
- Unknown source fields must remain preserved.

Mix edits:

- Volume, pan, mute, solo, FX, and routing on a branch should update lane-level metadata, not duplicate source grids.
- Existing `metadata.drumLanes` should remain the first storage location for lane mix and FX IDs.
- Branch track mixer controls can mirror or edit that lane metadata.

Conversion/export:

- MIDI/WAV/stem export should be able to render branch lanes independently when requested.
- Default full-song export should keep the same audible result as the parent Drums track unless the user changes branch mix/routing.
- Native cache signatures must include branch/lane mix and FX changes that affect rendered drum audio.

Destructive conversion:

- A separate future `Bounce Drum Branches to Audio` or `Convert Branches to Independent Clips` command may create real clips.
- It must be explicit and should keep the source generated Drums track/reference available unless the user deletes it.

## UI Expectations

Entry points:

- Drums track context menu: `Branch Drums to Tracks`
- selected generated Drums clip action: `Branch Drums`
- inspector button near `Drum Kit Lanes`

Visual behavior:

- Parent Drums track remains visible by default with a branch/collapse affordance.
- Child tracks appear adjacent to the parent.
- Child tracks use familiar track controls for mute, solo, volume, pan, FX, and routing.
- Child clip surfaces show lane-specific generated steps, but editing still writes through Chordsmith source commands.

Safety copy:

```text
Branching creates editable drum-lane views. Your Chordsmith drum source stays preserved.
```

## Verification Targets

Before implementing branch creation:

- Existing per-lane mix/FX tests keep passing.
- Source-preservation tests prove drum step and tuplet edits still roundtrip through `sourceRefs[].original`.

When implementing branch creation:

- Branching creates child tracks without changing audible output.
- Branch track step edits update the same Chordsmith source as the parent drum grid.
- Collapse hides/removes child views without deleting source drum grids.
- Save/reopen preserves branch metadata and child track order.
- Native cache invalidates only affected generated drum audio when branch mix/FX changes.
- Export can render full Drums, lane-specific stems, or branch tracks deterministically.

## Non-Goals

- Do not make branch tracks the default for every imported Chordsmith project.
- Do not duplicate drum grids into separate unsynced clip data during normal branching.
- Do not remove the compact Drums track lane editor.
- Do not require audio stems or sample kits before branch views can exist.
- Do not claim full production drum routing until native playback/export/cache tests prove branch parity.
