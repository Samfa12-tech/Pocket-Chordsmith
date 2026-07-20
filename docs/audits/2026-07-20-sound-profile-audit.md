# Pocket Audio Sound Profile Audit

Date: 2026-07-20
Scope: Pocket Chordsmith, PCS Format, Pocket Audio Core, Pocket DJ, Pocket DAW,
and the Pocket Chordsmith Godot addon.

## Conclusion

Base Chordsmith and Lofi are the strongest current profiles. Lofi is the only
genre profile whose composition choices, timing, texture, instruments, and
offline rendering form a reasonably coherent end-to-end identity. Chiptune,
Western, and Heavy Metal expose more genre-labelled metadata than genre-aware
performance or rendering. Heavy Metal is the largest audible failure.

The root problem is not a shortage of presets. The family lacks one shared
contract from musical performance intent, through a versioned sound recipe, to
each renderer. Profile support is currently often proven by preserving a
preset name, even when the renderer ignores its controls or collapses the sound
to a generic voice.

## Profile findings

| Profile | Current maturity | Principal gap |
| --- | --- | --- |
| Standard | useful neutral foundation | broad authoring but generic and uneven renderer depth |
| Lofi | strongest | richer per-lane dynamics, articulations, and cross-renderer parity |
| Chiptune | partial | ordinary poly synth with chip labels rather than constrained channels/tracker commands |
| Western | partial | inferred from instruments and exported as Standard rather than a first-class profile |
| Heavy Metal | weak | no convincing guitar/bass/drum production chain or riff-led performance grammar |
| Funk | blocked by format | slap/pop/connected bass, ghost dynamics, and pocket timing cannot survive canonically |

## Highest-priority defects

1. The shared canonical schema reduces bass to notes, holds, slides, and binary
   accents, while guitar has only a small fixed articulation set. It cannot
   carry the techniques needed by Funk, Metal, Western, or channel-aware Chip.
2. Chordsmith's importer rebuilds projects from a fixed whitelist. The lower
   PCS parser preserves unknown fields, but the application boundary can still
   discard future expressive data.
3. Western is explicitly stored as `audioProfile: standard` and later inferred
   from instrument IDs. Its identity therefore does not port reliably.
4. Metal and Chip texture values are sanitized and exported but are not
   consumed by the principal Chordsmith/Core audio paths. Pocket DAW native
   deserializes several values without using them.
5. Metal generation uses simple power-chord progressions, repeated root/fifth
   bass patterns, and short scale motifs. Rendering is primarily distorted
   oscillator synthesis without a cabinet stage, independent double takes,
   realistic pick/palm-mute behaviour, or a complete metal drum vocabulary.
6. Chiptune exposes many oscillator patches but no hardware channel allocation,
   duty/envelope commands, tracker macros, wavetable/noise roles, or voice
   stealing.
7. Godot preview mappings collapse many Chip and Metal sound IDs to generic
   bass, chord, and melody streams. This is acceptable only as a declared
   preview fallback; STEM_SYNC/HYBRID remains the production parity route.
8. Existing tests prove metadata preservation and that some buffers differ.
   They do not consistently prove that each exposed parameter changes sound or
   that a profile is perceptually distinct from the neutral renderer.

## Required correction

Implement the contract in `docs/SOUND_PROFILE_EVOLUTION_ARCHITECTURE.md`:

- additive PCS schema 17 under the existing `PCS1:` envelope;
- schema-16 migration and explicit legacy projection loss reports;
- first-class Standard, Lofi, Chip, Western, Metal, and Funk identities;
- sparse expressive events and expanded drum lanes;
- namespaced style-specific performance commands;
- versioned shared sound recipes consumed by each renderer;
- capability negotiation that preserves unsupported intent;
- parameter-perturbation, event-parity, audio-safety, and listening gates.

Metal and Funk are the first vertical slices. Metal proves the instrument,
production, and riff path; Funk proves articulation, dynamics, microtiming, and
interlocking groove. Chiptune then proves channel-aware specialist commands,
and Western proves first-class acoustic performance identity.

## Remediation status

The source-level recommendations from this audit are implemented on the
sound-profile evolution branch:

| Finding | Implemented correction |
| --- | --- |
| Compact format erased technique | PCS schema 17 sparse events, articulation, expression, role, sound, and namespaced technique fields |
| Unknown data was lost at app boundaries | Rich-source retention and unknown-field round-trip tests in PCS Format and Chordsmith |
| Western was inferred as Standard | First-class `western_frontier` profile, presets, grammar, registries, and fallback reporting |
| Metal/Chip controls were metadata-only | Parameter-sensitive Core/DAW rendering plus Chip channel/duty/envelope commands |
| Metal lacked performance/production identity | Riff grammar, chug/pick intent, cabinet shaping, deterministic dual takes, metal bass, and expanded drums |
| Chip lacked constrained roles | Pulse/triangle/noise channel intent and namespaced tracker-style commands |
| Godot collapsed previews silently | Explicit capability/loss diagnostics while preserving rich source; stems remain the production path |
| Tests proved only inequality | Per-parameter perturbation, event preservation, cache invalidation, safety, and family surface gates |

Manual listening against exact target builds remains required before a public
audible-parity claim. That is release evidence still to collect, not an
unimplemented schema or renderer recommendation.

## Evidence standard

A profile is complete only when identity, composition grammar, expressive
events, audible rendering, and cross-app preservation all pass. A preset name,
UI control, generated constant, or non-equal audio hash alone is not proof.
Use `docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md` for backend-specific automated
and listening evidence.
