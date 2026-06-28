# Pocket DJ PDJ1 Session Format

`PDJ1:` is the planned Pocket DJ session/share-code envelope. It captures performance state for a live remix deck without rewriting the source Pocket Chordsmith composition.

Pocket DJ currently accepts `PDJ1:` input, raw `PocketDJ` session JSON, `PCS1:` share codes and raw Pocket Chordsmith JSON in `pocket_dj_v1g_core_bridge.html`. The current local save uses the same session object under `pocket_dj_v1_last_session`; this note defines the boundary that future public `PDJ1:` export/import should keep.

## Boundary

- `PCS1:` remains the composition/source format for chords, melody, drum grids, bass, guitar, section definitions, song sequence and authoring metadata.
- `PDJ1:` owns DJ performance choices: current deck state, section launch preferences, stem mutes/volumes, FX values, build/drop state, cue points, loops, and remix notes.
- Pocket DJ must not become a second Chordsmith editor. If chords, notes, patterns or arrangement data change, that belongs in `PCS1:` or a future source-format migration.
- Edit-back to Pocket Chordsmith sends only the source `PCS1:` project. DJ-only state stays in Pocket DJ unless a future target explicitly supports performance annotations.

## Current Session Shape

The current session object created by `createDjSessionFromChordsmithProject()` has this top-level shape:

```json
{
  "app": "PocketDJ",
  "djVersion": 1,
  "source": {},
  "deck": {},
  "sections": {},
  "performance": {}
}
```

`PDJ1:` should encode this object as UTF-8 JSON with base64url payload after the `PDJ1:` prefix. Import should continue to normalize through `normalizePocketDjSession()` so missing or older fields can safely fall back to the source `PCS1:` project.

## Source References

`source` should preserve enough data to rebuild the deck and edit the song:

- `app`: currently `PocketChordsmith`.
- `sourcePrefix`: currently `PCS1`.
- `projectVersion`: source project schema, currently `16`.
- `project`: the sanitized Pocket Chordsmith project used as the canonical musical source.
- Future optional metadata: `sourceHash`, `importedAt`, `sourceTitle`, `sourceCode`, `sourceUrl`, `originAppVersion`.

The embedded `source.project` is intentionally redundant with `sections` and `deck` summaries. It lets Pocket DJ re-normalize sessions after format changes and lets Edit Source rebuild a clean `PCS1:` code.

## Deck Summary

`deck` is a performance-friendly cache of source facts and current sound profile:

- Identity/timing: `name`, `bpm`, `key`, `scale`, `theme`, `timeSig`, `swing`.
- Sound/style: `audioProfile`, `lofiPreset`, `lofiTexture`, `chipPreset`, `chipTexture`, `drumKit`, `drumGroovePreset`, `bassTone`.
- Source playback settings: `resolution`, chord settings, melody pitch mode, bass mode, guitar settings, humanize and sidechain values.

Importers should treat `deck` as derived. If it conflicts with `source.project`, the source project wins unless a future schema marks a field as DJ-owned.

## Performance State

`performance` is DJ-owned state. Current implemented fields are:

- Section launch: `currentSection`, `queuedSection`, `launchQuantize`, `dropTarget`.
- Loop/sequence: `loopCurrentSection`, `sequence`, `sequencePlaying`, `sequenceRepeat`, `sequenceIndex`.
- Mixer: `stemVolumes`, `stemMutes`, `masterVolume`.
- FX: `fx.filter`, `fx.echo`, `fx.chorus`, `fx.flanger`, `fx.reverb`, `fx.mix`.
- Macro status: `buildActive`.

Runtime-only scheduler details such as audio context nodes, timers, animation frame IDs, current sample phase and transient drop-scheduling flags should not be serialized. On load, Pocket DJ should reset transient playback state and resume from the normalized `performance` snapshot.

## Cues And Loops

The current app has `loopCurrentSection`, `dropTarget`, launch quantization and sequence controls. Future `PDJ1` revisions can add explicit cue and loop data:

```json
{
  "cues": [
    { "id": "drop-a", "label": "Drop A", "section": "D", "bar": 0, "beat": 0, "color": "lime" }
  ],
  "loops": [
    { "id": "hold-a", "section": "A", "startBar": 0, "bars": 2, "mode": "section" }
  ]
}
```

Cue/loop entries should reference section IDs and bar/beat offsets in the source project. They should not duplicate note grids or rendered audio.

## Performance Macros

Macros should be stored as named performance recipes, not as source edits. Current macro behavior maps to target FX and stem-volume changes for Build, Drop, Gentle Build, Rainy Drop, Filtered Study Mode and Tape Stop.

Future macro records should use stable IDs and a small declarative target shape:

```json
{
  "macros": [
    {
      "id": "filtered-study",
      "label": "Filtered Study Mode",
      "durationBeats": 4,
      "targets": {
        "fx": { "filter": 0.34, "echo": 0.03, "reverb": 0.24, "mix": 0.55 },
        "stemVolumes": { "drums": 0.38, "bass": 0.42, "chords": 0.7, "melody": 0.34, "guitar": 0.42 }
      }
    }
  ]
}
```

Macro definitions may be app presets or session customizations. Macro playback history should live in a separate future `performanceLog` if needed.

## Edit-Back Behavior

The existing Edit Source flow builds a `PCS1:` code from `session.source.project`, stores a `PocketHandoff` payload with `kind: "dj-to-chordsmith"`, and opens Pocket Chordsmith with fallback copy/paste text.

Keep that behavior:

- Chordsmith receives the source composition only.
- DJ state such as mutes, filters, loops, cues, macros and drop targets is not applied to Chordsmith silently.
- If future edit-back needs to preserve DJ annotations, send them as an explicit companion payload and make Chordsmith ignore them unless it implements a visible import path.

## Validation Targets

Future `PDJ1` implementation work should add tests for:

- `PDJ1:` import roundtrip through `parseAnyImportText()` and `normalizePocketDjSession()`.
- Local save/load compatibility with older sessions missing cue/macro fields.
- Section queue, loop, build/drop, filter, stem mute/volume and lofi/chip metadata preservation.
- Edit Source continuing to emit `PCS1:` and not a mutated `PDJ1:` payload.
- Invalid `PDJ1:` payloads failing with friendly import errors and no console/page errors.
