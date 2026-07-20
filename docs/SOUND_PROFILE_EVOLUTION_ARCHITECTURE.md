# Pocket Audio Sound Profile Evolution

Status: implemented contract; automated family verification completed on
2026-07-20. Target listening remains a release gate, not a source-contract gap.

This document is the family-wide source of truth for evolving Standard, Lofi,
Chiptune, Western, Heavy Metal, and Funk without flattening their musical
identity at PCS or app boundaries.

## Product invariant

A sound profile is complete only when all of these layers agree:

1. **Identity** - the project names a stable profile, preset, and recipe
   version.
2. **Composition** - generators and starter content use genre-specific phrase
   and arrangement grammar.
3. **Performance** - note velocity, duration, articulation, expression, and
   phrase role are represented explicitly.
4. **Rendering** - every exposed sound parameter changes audible output in the
   renderer that claims to support it.
5. **Portability** - Chordsmith, Core, DJ, DAW, and Godot preserve unsupported
   intent and report any audible fallback or export loss.

Metadata-only support does not satisfy this contract.

## Compatibility boundary

- Keep the `PCS1:` envelope.
- Schema 16 remains a supported compact source and projection target.
- Schema 17 is additive and becomes canonical when rich events or first-class
  Western/Funk identity are present.
- Readers must preserve unknown fields, including namespaced expression data.
- Writers may emit schema 16 only when the project is legacy-safe.
- Lossy schema-16 projection must return a structured loss report; it must not
  claim round-trip compatibility.
- Original rich source must survive import/save/handoff even when the current
  playback backend uses a fallback.

## Schema-17 project surface

The canonical additive fields are:

```json
{
  "projectVersion": 17,
  "formatFeatures": [
    "sound-profile-v1",
    "rich-events-v1",
    "articulations-v1",
    "expanded-drums-v1",
    "capability-report-v1"
  ],
  "soundProfile": {
    "id": "funk_groove",
    "preset": "funk_classic_pocket",
    "recipeVersion": 1,
    "parameters": {}
  },
  "sections": {
    "A": {
      "tracks": {
        "bass": {
          "events": [
            {
              "step": 0,
              "duration": 1,
              "note": 0,
              "velocity": 112,
              "articulation": "slap",
              "sound": "funk_slap_pop",
              "role": "anchor",
              "expression": {},
              "technique": { "funk": { "hand": "thumb" } }
            }
          ]
        }
      }
    }
  }
}
```

Events use `step` for grid-authored data and may use `tick` when imported or
authored at PPQ precision. `notes` is used for polyphonic events and `note` for
single-note events. Unknown `expression` and `technique` namespaces are copied
unchanged.

## Stable profile IDs

| User label | Stable ID | Initial reference preset |
| --- | --- | --- |
| Chordsmith | `standard` | `standard_chordsmith` |
| Lofi | `lofi_chill` | `lofi_study_room` |
| Chiptune | `chip_arcade` | `chip_nes_pulse` |
| Western | `western_frontier` | `western_trail` |
| Metal | `heavy_metal` | `metal_tight_riff` |
| Funk | `funk_groove` | `funk_classic_pocket` |

Legacy aliases remain readable but normalize to these IDs.

## Common performance vocabulary

Common articulations include `finger`, `slap`, `pop`, `mute`, `ghost`,
`hammer`, `pull`, `slide`, `hold`, `staccato`, `legato`, `bend`, `vibrato`,
`tremolo`, `open`, `chug`, `scratch`, `palm_mute`, `accent`, `flam`, `drag`,
`roll`, and `choke`.

The common drum lanes are `kick`, `snare`, `rim`, `clap`, `hat_closed`,
`hat_open`, `ride`, `crash`, `china`, `tom_high`, `tom_mid`, `tom_low`, and
`percussion`. A renderer may map unsupported lanes to the nearest owned sample
or recipe, but it must record that fallback.

Style-specific commands stay namespaced:

- `technique.chip`: channel, duty, envelope, sweep, arpeggio, noise period,
  wavetable, retrigger, pitch slide, and vibrato commands.
- `technique.metal`: palm-mute depth, pick direction, tremolo rate, string,
  and dual-take seed.
- `technique.western`: pick/strum direction, banjo roll, bow direction,
  breath direction, and bend intent.
- `technique.funk`: playing hand, rake, ghost depth, pocket offset, and
  call/response role.

## Sound recipe boundary

PCS stores what the musician or generator intended. Pocket Audio Core sound
manifests store how that intent is rendered. A recipe may describe source
layers, envelopes, filters, transient generators, nonlinear stages,
amp/cabinet or resonator stages, stereo/take rules, sends, gain safety, and
fallback mappings.

The same manifest data must generate or feed the browser/Core, Pocket DAW
native, Pocket DJ, and Godot preview surfaces. Godot STEM_SYNC/HYBRID remains
the production parity path; its procedural/sample preview is an audition path.

## Profile reference slices

### Heavy Metal

The reference slice is `metal_tight_riff`: riff-led guitar events, controlled
preamp plus cabinet shaping, audible palm muting and pick attack, deterministic
dual takes, clean-low plus grit bass, expanded metal drums, and kick/bass/guitar
rhythmic lock. Every Metal texture parameter must perturb rendered audio.

### Funk

The reference slice is `funk_classic_pocket`: clear beat-one anchor, slap/pop
and connected bass articulations, dead notes, ghost snare, 16th-note hat
dynamics, clipped stabs, and phrase fills that lead into the next downbeat.

### Chiptune

The reference slice is `chip_nes_pulse`: channel-aware pulse/triangle/noise
roles, duty/envelope commands, voice limits, and deterministic fallback. Modern
unconstrained chip presets remain a separate mode.

### Western

The reference slice is `western_trail`: first-class profile identity,
boom-chick/train groove, acoustic/upright bass intent, alternating-pick guitar,
banjo roll, harmonica bend/breath, and fiddle/mandolin/resonator-friendly sound
roles.

### Lofi and Standard

Lofi keeps its current coherent texture/groove/harmony foundation and gains the
same expressive event and renderer-conformance guarantees. Standard is the
neutral fallback and compatibility reference, not an unlabelled bucket for
unsupported genres.

## Capability and loss contract

Each consumer advertises supported feature and articulation IDs. Import never
deletes unsupported intent. Rendering and legacy projection return entries of
this shape:

```json
{
  "path": "sections.A.tracks.bass.events[2].articulation",
  "feature": "bass-articulation:pop",
  "action": "fallback",
  "fallback": "accent",
  "message": "Pop rendered as an accented finger note."
}
```

Actions are `preserved`, `fallback`, `dropped`, or `approximated`. Saving and
handoff preserve the original field even after a playback fallback.

## Automated acceptance

The shared fixture corpus must include schema-16 migration, schema-17 unknown
field round-trip, every common articulation, invalid connected-note fallbacks,
expanded drum lanes, every profile, and a deterministic two-bar reference for
Metal, Funk, Chip, and Western.

Tests must cover:

- schema migration and loss-report determinism;
- import/save/handoff preservation in every app;
- event-trace parity at the common contract;
- audible parameter perturbation for every exposed texture control;
- profile-pair audio metrics that prove more than simple byte inequality;
- native cache invalidation when recipe/profile data changes;
- Godot headless import and runtime diagnostics;
- conservative gain, finite samples, and peak safety.

Manual listening remains required before an exact audible parity or public
release claim, as defined in `POCKET_AUDIO_SOUND_PARITY_MATRIX.md`.

The family surface guard can be run from the repository root with:

```powershell
node scripts/verify-sound-profile-contract.mjs
```

## Implemented family slice

The schema-17 contract is implemented in PCS Format 0.2 and Pocket Audio Core
0.2. Pocket Chordsmith authors and round-trips rich events; Pocket DJ preserves
them and exposes profile macros; Pocket DAW incorporates them into native event
rendering and cache signatures; and the Godot addon compiles them while
reporting preview fallbacks. The common fixture and surface guards cover all
six profiles. Metal and Funk additionally have parameter-perturbation tests so
their exposed controls cannot regress into metadata-only switches.

Backend-specific listening is deliberately kept separate from structural and
automated evidence. No release should claim exact mastered parity merely from
these passing contract tests.
