# MIDI Import And Chordsmith Conversion Plan

This note separates two related but different workflows:

- Import real `.mid` / `.midi` files as DAW timeline data.
- Convert selected MIDI material into editable Chordsmith-generated arrangement lanes.

Keeping these as separate commands prevents the MIDI import path from silently throwing away tracks, channels, tempo data, controller data, or drum detail just because a user also wants a Chordsmith-style sketch.

## Current Behavior

Current Pocket DAW builds parse a MIDI file into:

- one Media Pool item with format, PPQ, tempo, time signature, track names, parsed track count, note count, and track summaries
- one editable MIDI timeline clip
- note metadata with pitch, start tick, duration, velocity, channel, and source track index
- preview-synth playback through the normal timeline render/event path

This is intentionally conservative. Controller, program-change, pitch-bend, sysex, and richer tempo-map details are counted or ignored rather than promoted into editable DAW lanes.

## Command Boundary

### Import MIDI

Command label: `Import MIDI`

Purpose: preserve the source file as DAW material.

Responsibilities:

- Parse SMF format 0 and format 1 files defensively.
- Keep source track, channel, PPQ, tempo/time-signature, and note metadata available on the media item and MIDI clip.
- Create editable MIDI clips without forcing Chordsmith drums/bass/chords/melody semantics.
- Preserve or summarize non-note data that cannot be edited yet.
- Keep imported MIDI exportable and playable through preview/native paths as those paths mature.

Non-goals:

- Guess chords.
- Split General MIDI channel 10 into Chordsmith drum lanes.
- Replace the project Chordsmith source.
- Mutate generated drum/bass/chord/melody/guitar tracks.

### Convert MIDI To Chordsmith Arrangement

Command label: `Convert MIDI to Chordsmith Arrangement`

Purpose: create an editable Chordsmith-style sketch from selected MIDI data.

Responsibilities:

- Take an explicit selected MIDI clip or media item as input.
- Ask for or infer mapping settings before changing generated tracks.
- Create or update Chordsmith source data through the same source-preserving editor path used by visual Chordsmith edits.
- Keep the raw imported MIDI as a reference clip unless the user explicitly removes it.
- Report confidence, ignored material, and destructive edits before applying.

Non-goals:

- Treat every MIDI file as a valid Chordsmith project.
- Collapse complex orchestral or multitrack MIDI into a single melody without user visibility.
- Overwrite unknown Chordsmith source fields.

## Import Roadmap

1. Preserve richer MIDI facts.
   - Track names, channels, programs, controller counts, pitch-bend counts, tempo events, time-signature events, lyric/text marker counts, and drum-channel summaries.
   - Keep raw-ish summaries in metadata even before the UI can edit them.

2. Split import placement options.
   - `Single MIDI Clip`: current compatible behavior.
   - `One Clip Per Source Track`: creates separate clips/tracks from `trackIndex`.
   - `One Clip Per Channel`: useful for format 0 files.
   - `Drum Channel Split`: optional view that groups channel 10 notes without converting to Chordsmith drums.

3. Represent tempo maps explicitly.
   - Keep first-tempo behavior for the current project tempo until tempo lanes exist.
   - Store tempo/time-signature event lists on the MIDI media item.
   - Warn when a file has multiple tempo or time-signature changes.

4. Preserve controller/program data.
   - Store program changes and controller events by track/channel.
   - Use them for labels and future automation lanes, not immediate playback promises.
   - Do not discard pitch bend; store it as unrendered expressive data until synth/native paths support it.

5. Add native playback/export maturity.
   - Preview synth remains enough for alpha import confidence.
   - Native playback should eventually receive MIDI notes plus program/controller summaries without blocking import.

## Conversion Roadmap

1. Add an explicit conversion command beside, not inside, import.
2. Show a conversion preview:
   - detected key, scale, tempo, time signature
   - suggested section length and A-H sequence
   - mapped drum lanes, bass roots, chord rhythm, melody lead, and optional guitar rhythm
   - ignored tracks/channels/controllers
3. Provide mapping choices:
   - drums from channel 10 or chosen track
   - bass from lowest monophonic track/channel
   - chords from block/polyphonic tracks
   - melody from highest/lead track
   - keep raw MIDI reference clip on/off
4. Apply through Chordsmith editor commands/source refs:
   - generated tracks update from normalized source data
   - undo/redo works as one conversion step
   - the original MIDI item remains in the Media Pool

## Verification Targets

Import tests:

- format 0 single-track, multi-channel file
- format 1 tempo track plus note tracks
- channel 10 drum notes preserved as MIDI notes with channel metadata
- multiple tempo/time-signature events summarized without changing project tempo silently
- controller/program/pitch-bend counts preserved in metadata
- one-clip, per-track, and per-channel import placement options when those modes are implemented

Conversion tests:

- conversion does not run during ordinary import
- conversion creates Chordsmith source edits through undoable commands
- raw MIDI reference clip can remain muted and linked to the source media
- conversion report lists ignored/ambiguous material
- drum, bass, chord, melody, and guitar heuristics are deterministic for fixture files

## Release Language

Until the roadmap above is implemented, describe current MIDI import as:

```text
MIDI import creates editable MIDI media/clips for preview playback and export. It does not yet perform full multitrack arrangement import or automatic Chordsmith conversion.
```

Do not describe current import as a complete MIDI sequencer, controller editor, tempo-map editor, or Chordsmith converter.
