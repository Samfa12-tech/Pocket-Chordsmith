---
name: pocket-chordsmith-composer
description: Compose polished, import-ready Pocket Chordsmith songs as project JSON for the single-file HTML app, including chord progressions, drums, bass, melody tracks, sections, arrangement, MIDI-friendly structure, and mobile-conscious density.
---

# Pocket Chordsmith Composer

Use this skill when asked to create, improve, vary, or export music for Pocket Chordsmith as JSON.

## First Steps

1. Check the current app HTML for `PROJECT_SCHEMA_VERSION`, `SECTION_IDS`, `MAX_BARS`, `MAX_MELODY_TRACKS`, and allowed select values before composing. Prefer the newest schema in the project.
2. Compose for phone use first: clear loop identity, fast auditioning, restrained density, and export that imports without hand repair.
3. Return valid JSON only when the user asks for import-ready output. Do not wrap it in Markdown unless the user asks for explanation.

## Current JSON Contract

For schema v15, emit a single object with:

- Global fields: `projectVersion`, `key`, `scale`, `timeSig`, `bpm`, `swing`, `theme`, `uiMode`, `chordType`, `resolution`, `melodyPitchMode`, `midiExportMode`, `midiChordExport`, `midiExactDurations`, `chordPlayMode`, `chordRhythmMode`, `chordOctave`, `melodyOctave`, `melodyInputMode`, `xyPlaybackMode`, `xyPadMode`, `xyScaleMode`, `xyChordFollow`, `xyRecordToGrid`, `fxDelay`, `fxChorus`, `fxFlanger`, `fxReverb`, `fxMix`, `showMelodyPads`, `showDrumPads`, `drumRecordToGrid`, `showMelodyPicker`, `showTrackControls`, `bassMode`, `humanizeOn`, `sidechainOn`, `sidechainAmount`, `lastAdvancedResolution`, `sectionBars`, `songSequence`.
- For each section `A` through `H`: `progressionX`, `gridX`, `gridTupletsX`, `melodyTracksX`, `melodyInstrumentsX`, `melodyOctavesX`, `melodyMuteX`, `melodySoloX`, `melodyPanX`, `melodyHoldX`, `melodySlideX`, `melodyTupletsX`, `bassHoldX`, `bassSlideX`, `bassNotesX`, `bassAccentX`.

Use `timeSig` of `4` or `3`. Use `resolution` of `1`, `2`, `4`, `8`, or `16`; for mobile-first songs prefer `2` or `4`. Array length should be `MAX_BARS * timeSig * resolution`, even when `sectionBars` is shorter. Sections may play only their first `sectionBars[section]` bars.

## Value Meanings

- Chord progressions are degree numbers `0..6`. In major these map to `I, ii, iii, IV, V, vi, vii dim`; in minor to `i, ii dim, III, iv, v, VI, VII`.
- Drum/bass grid cells use `0` off, `1` hit, `2` accent. `gridX` has `kick`, `snare`, `hat`, and `bass`.
- Melody notes use `null` for rest. In scale mode, note indexes `0..13` are two scale octaves. In chromatic mode, `0..23` are two chromatic octaves starting from C.
- `melodyInstrumentsX` values are `pulse`, `soft`, `synth`, or `bell`.
- `melodyPanX` values are `-1..1`; keep lead lines spread gently, for example `[-0.35, 0.35]`.
- Hold, slide, tuplet, mute, solo, and accent arrays are booleans.
- Tuplet arrays mark the first cell of a two-step span that should play as three notes. Use sparingly.
- `bassMode` can be `auto` for chord-root bass from `grid.bass`, or `manual` with `bassNotesX` indexes `0..13`.

## Composition Heuristics

Build a song, not just a loop:

- Give section `A` the hook, `B` contrast, `C` a reduced bridge or breakdown, and `D` a payoff or outro. Use `E-H` only when the request needs more form.
- Keep `songSequence` intentional, for example `["A","A","B","A","C","B","D","A"]`.
- Make each section legible on phone speakers: kick/bass should not be over-busy, hats should imply motion, and lead melodies should leave rests.
- Write melodies as motifs with variation. Use call-and-response, one or two memorable contour ideas, and avoid filling every step.
- Use chord rhythm and play mode to define feel: `strum_up` or `strum_down` for songlike sketches, `arp_up` or `arp_down` for motion, `block` for punch.
- Prefer `humanizeOn: true`, mild `swing` between `0.03` and `0.12`, and `sidechainOn: true` for dance or pop sketches.
- For mobile performance and WAV export, avoid schema-maximal density: keep melody tracks to 1-3, avoid resolution `16` unless requested, and keep long arrangements concise.

## Validation

Before delivering JSON:

1. Parse it with a JSON parser.
2. Confirm every per-step array has the required length.
3. Confirm `songSequence` only references `A-H` and does not exceed 64 slots.
4. Confirm all section fields exist for any section referenced by the arrangement.
5. If possible, import it into the HTML app, export it back out, and compare that the key musical choices survived normalization.

## Output Discipline

When the user asks for a new composition, produce one import-ready JSON object. When they ask for options, produce separate named JSON files or clearly separated objects. Keep any explanatory notes outside the JSON and only include them when the user did not ask for JSON-only output.
