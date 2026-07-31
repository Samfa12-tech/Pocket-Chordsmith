# Pocket Chordsmith Genre Composer

Status: source implementation and automated browser coverage added on
2026-07-31. This document does not record a completed human listening sign-off.

## What the genre buttons do

The five primary buttons now compose editable multi-section songs:

- Compose Lofi Song
- Compose Chip Tune
- Compose Metal Song
- Compose Western Song
- Compose Funk Song

They are not sound-profile switches or one-section idea generators. Each action
creates a deterministic song identity, plans related sections A-H, populates an
intentional sequence, then writes normal Pocket Chordsmith progression, drums,
bass, guitar, melody, articulation, and section data. One Undo restores the
previous project.

The Genre Studio keeps the secondary actions separate:

- **Current Section** keeps the earlier focused-idea workflow.
- **Apply Sound Profile** changes the applicable instrument/renderer recipe
  settings without rewriting sections.
- **Compose Full Song** writes a complete song using the selected archetype.
- **Game Loop** uses the same planner but produces a loop-safe sequence.

Generation stops and safely restarts playback when necessary. There are no
material locks in the current editor, so full-song composition intentionally
replaces the editable arrangement after recording a single undo snapshot.

## Composition and sound profiles are separate

A sound profile describes how notes are performed and rendered: instruments,
drum kit, bass/guitar tone, articulation, texture, cabinet/FX behavior, and
other recipe parameters. A composition archetype describes what is written:
tempo range, harmonic vocabulary, motif, rhythmic cell, song form, role,
energy, active instruments, and transition behavior.

This boundary follows the family contract in
[`docs/SOUND_PROFILE_EVOLUTION_ARCHITECTURE.md`](../../docs/SOUND_PROFILE_EVOLUTION_ARCHITECTURE.md).
The browser still uses its existing live and WAV engines; this composer does
not replace them.

## Deterministic identity and form

`src/genre-composer.js` owns a dependency-free seeded planner. A plan stores:

- generator version and seed;
- genre and archetype;
- key, scale/modal colour, BPM and valid BPM range;
- primary and contrast progressions;
- shared motif and rhythmic cell;
- instrument policy;
- section roles, energy curve, motif transformations, and sequence.

Enter an optional fixed seed in Genre Studio to reproduce a song or game loop.
Leaving it blank creates a new seed and saves that identity as optional
`genreComposition` project metadata. The same generator version, genre,
archetype, seed, and mode produce the same plan.

The current editor supports a maximum of four bars per section. Full songs use
six to eight related A-H sections and repeat selected verse/chorus sections in
the sequence instead of claiming unsupported eight-bar section cells.

## Archetypes and tempo ranges

| Genre | Current archetypes | BPM range |
| --- | --- | --- |
| Heavy Metal | Classic Chug, Thrash Gallop, Doom Procession, Power Anthem, Boss Blast, Breakdown Gate | 55-228 by subtype |
| Lofi / Chill | Study Beat, Rainy Boom-bap, Sleepy Waltz, Koi Loop | 62-94 by subtype |
| Western | Frontier Ride, Train Chase, Cowboy Waltz, Duel | 70-150 by subtype |
| Chiptune | Arcade Start, Dungeon Pulse, Boss, Menu Glow | 88-164 by subtype |
| Funk | Classic Pocket, Slap Party, Clav Stabs, Brass Break | 88-125 by subtype |

Metal plans use riff-led minor/modal language and place kick, picked bass, and
rhythm-guitar attacks from one shared rhythmic cell. Verse and breakdown plans
forbid busy lead parts; chorus and solo plans admit an octave/harmonised hook
or genre-appropriate lead. Metal automatic leads never select banjo, cowboy
whistle, soft bells, or mellow-vibes voices.

Lofi uses sparse lead roles, warm bass approach notes, reduced sections, and
loop-friendly returns. Western selects boom-chick/train/waltz behavior,
root/fifth bass, saloon/twang accompaniment, and call-response lead roles.
Chiptune assigns pulse lead, triangle-bass, and noise-drum roles rather than
using the guitar lane. Funk uses rests, muted guitar, ghost snare support, and
slap/pop/mute/hammer/pull bass vocabulary around beat-one anchors.

## Project and compatibility contract

Generated songs use native editable section fields (`progressionA-H`, grids,
melody tracks, bass notes/articulations, drum lanes, guitar patterns,
`sectionBars`, and `songSequence`). The optional `genreComposition` field
retains planning identity; missing it remains valid for existing saves.

Schema 17 remains canonical. Rich events and sound profile metadata are built
through the existing export path. Schema 16 projection remains available only
through its existing explicit loss-report mechanism; rich source intent is not
silently replaced by a lossy projection. Existing JSON, `PCS1:`, save slots,
MIDI export/import, WAV export, Pocket DJ, Pocket DAW, and Godot handoff paths
continue to consume the same project fields.

## Automated checks

From `apps/chordsmith-web`:

```powershell
npm run test:composer
npm run test:e2e -- genre-composer.spec.js
npm run build
```

`test:composer` validates all compact review seeds in
`tests/fixtures/genre-composer-seeds.json`: three per Metal subtype and at least
one for every Lofi, Western, Chiptune, and Funk archetype. Browser tests cover button-driven
full-song generation, deterministic seed output, schema-17 export/import,
metal rhythm-section alignment, section-role lead policy, and automatic
instrument exclusions.

## Listening review still required

Automated checks do not prove musical quality or audible parity. For each
representative fixture, use the selected seed/archetype, play Section A, play
the song sequence, export WAV, and compare the browser and WAV output.

Record these manual results before a public release claim:

- genre recognition without reading the label;
- coherent form, shared motif, and section contrast;
- appropriate instruments and rhythm-section coordination;
- no persistent masking, clipping, broken/hanging notes, or unsafe level;
- acceptable phone-speaker and headphone playback;
- live/WAV correspondence for the exact current browser build.

The current source change has no claimed human listening completion and no
claim of cross-backend mastered sound parity. See
[`docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md`](../../docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md)
for the separate family evidence requirements.
