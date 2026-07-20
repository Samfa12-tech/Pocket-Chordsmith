# Pocket Audio Funk Sound Pack

Status: implemented source specification for PCS schema 17 and Pocket Audio
Core 0.2. Exact target listening remains a release checkpoint.

This document defines the musical identity, content vocabulary, cross-app
contract, and validation gates for a funk profile across Pocket Chordsmith,
Pocket Audio Core, Pocket DJ, Pocket DAW, and the Pocket Chordsmith Godot
addon. The family-wide compatibility and renderer contract is defined in
`SOUND_PROFILE_EVOLUTION_ARCHITECTURE.md`; this document owns Funk's musical
and content requirements.

## The product idea

Funk should feel like a band locking into a pocket and enjoying the spaces
between the beats. The pack is therefore not just a brighter bass patch or a
"happy" preset. Its identity comes from the relationship between:

- a clear anchor on **the one**;
- short, syncopated 16th-note phrases;
- a repetitive bass riff that interlocks with kick and snare;
- quiet ghost notes beside strong accents;
- clipped chord, guitar, and horn-like stabs;
- small performance articulations that make repeated notes feel played;
- restrained fills that set up the next bar without destroying the groove.

The central design rule is:

> Funk is a pocket-and-articulation profile. Tone supports the groove; it does
> not create the groove by itself.

## PCS should not be the limiting layer

The sound pack is a good reason to evolve PCS rather than force every style
through the current compact grid vocabulary. Chiptune, western, funk, metal,
and future packs have genuinely different performance intent:

- chiptune needs pulse width, arpeggio, pitch-slide, noise-channel, and duty
  changes;
- western needs pick/strum direction, hammer/pull, bends, twang, swing, and
  pickup phrasing;
- funk needs dead notes, slap/pop, hammer/pull, ghost dynamics, pocket timing,
  and call-and-response phrase roles;
- metal needs palm mute, chug, gallop, tremolo, breakdown accents, and tight
  damping.

The format should carry that intent. A renderer may simplify it for a target,
but the source project must not lose it merely because one app has not caught up
yet.

### Recommended PCS evolution

Keep the `PCS1:` prefix as the family envelope and make the schema version the
compatibility boundary. The implemented format slice is a rich, versioned
event model in schema 17,
with the existing compact schema-16 fields retained as a legacy read/write
projection.

Conceptually, the canonical shape should move toward this:

```json
{
  "projectVersion": 17,
  "formatFeatures": ["rich-events", "style-profile", "articulations"],
  "style": {
    "profile": "funk_groove",
    "preset": "funk_slap_party",
    "parameters": { "pocket": 0.78, "ghostNotes": 0.42 }
  },
  "sections": {
    "A": {
      "bars": 4,
      "tracks": {
        "bass": {
          "events": [
            { "step": 0, "note": 0, "velocity": 112, "articulation": "slap" },
            { "step": 2, "note": 7, "velocity": 82, "articulation": "pop" },
            { "step": 3, "note": 5, "velocity": 42, "articulation": "mute" },
            { "step": 4, "note": 7, "velocity": 68, "articulation": "hammer" }
          ]
        }
      }
    }
  }
}
```

This is an expressive direction, not a frozen final schema. The important
properties are:

- sparse events instead of an ever-growing set of parallel arrays;
- common fields (`step`, `duration`, `note`, `velocity`, `articulation`,
  `sound`) plus namespaced style-specific fields;
- explicit `formatFeatures` so apps can negotiate support instead of guessing;
- unknown-field preservation at the PCS boundary;
- a deterministic legacy projection for older Chordsmith/DJ/Godot readers;
- warnings when a target intentionally drops a technique or expression.

The current compact fields remain useful for simple projects, fast grids, and
small game payloads. They should become a lossless projection only for projects
whose features fit that subset. A rich Funk or Metal project must not be
silently flattened to `bassNotes`/`bassAccent` and called round-trip compatible.

### Compatibility policy

1. Current readers continue to accept schema 16 and older projects.
2. New readers accept both compact legacy data and rich events.
3. New writers emit schema 16 only when the project uses the legacy-safe
   subset; otherwise they emit the next schema while retaining the `PCS1:`
   prefix.
4. Older readers may request a legacy projection, but the export must include
   a visible loss report or `compatibility.warnings`.
5. Apps may render a supported subset, but they must preserve the original
   rich source when importing, saving, or handing off to another app.
6. `packages/pcs-format/` owns parsing, feature declarations, migrations,
   projection rules, and fixtures. Pocket Audio Core owns runtime meaning and
   rendering; apps own their editing and native/platform boundaries.

This gives us permission to improve Chordsmith and PCS together. The goal is
not for every app to understand every technique on day one; the goal is for
the family interchange to stop erasing musical intent.

## Research synthesis

The research consistently points to a small set of perceptual ingredients:

1. Funk prioritises a relentless, highly syncopated groove and repeated riffs
   over conventional verse/chorus escalation. Short, intermeshed stabs and
   intentional gaps are part of the whole texture, not empty space. See the
   [Cambridge overview of funk](https://www.cambridge.org/core/books/abs/popular-music-genres/funk-the-breakbeat-starts-here/55837A608444BA396211AFFCF319C2C2).
2. The bass is a foreground rhythmic instrument. Common descriptions emphasise
   a heavy repetitive bass line, simple harmony, and percussive slap technique;
   the typical ensemble also includes rhythm guitar, electric piano/synth,
   drums, and short horn figures. See the [OnMusic funk definition](https://dictionary.onmusic.org/terms/1526-funk_music).
3. Slap-bass vocabulary is more specific than "make the bass brighter": thumb
   attacks, dead/muted notes, pulls/pops, slides, hammer-ons, and pull-offs
   have different attack and sustain behaviour. Berklee's notation separates
   these articulations and stresses that slurs sound without a new plucking-hand
   attack. See [Berklee's slap-bass technique guide](https://online.berklee.edu/takenote/slap-bass-lines-slap-technique/).
4. Funk drum realism comes from dynamic contrast: strong backbeats, very quiet
   ghost notes, 16th-note movement, open-hat punctuation, and short fills at
   phrase boundaries. See [MusicRadar's MIDI drum programming guide](https://www.musicradar.com/tutorials/music-production-tutorials/midi-drums-program-drum-week)
   and the [Zildjian drum method](https://ae.zildjian.com/wp-content/uploads/Zildjian_Drum_Method_Lesson_18.pdf).

This gives us a useful test: if muting the bass articulation and ghost-note
layers leaves an ordinary minor-key loop, the pack is not doing enough.

## Profile contract

Use these stable identifiers:

```text
audioProfile: funk_groove
default preset: funk_classic_pocket
style preset prefix: funk_
```

The profile should be additive to the current project contract. Existing
standard, lofi, chip, and heavy-metal projects must normalise and render
unchanged. Do not make `funk_groove` the default for projects that have no
explicit profile or preset.

### Starter presets

| ID | Character | BPM | Harmony | Primary groove | Bass voice |
| --- | --- | ---: | --- | --- | --- |
| `funk_classic_pocket` | dry, tight, one-chord pocket | 98 | Dorian/minor 7 | 16th hats, backbeat, ghost snare | `funk_finger_pocket` |
| `funk_slap_party` | octave jumps and slap/pop answers | 112 | Dorian/minor 7 | syncopated kick with open-hat pickups | `funk_slap_pop` |
| `funk_clav_stabs` | clipped clav/guitar conversation | 104 | dominant 9 / minor 7 | sparse kick, tight snare, stabs | `funk_muted_thump` |
| `funk_brass_break` | repeating horn-style figures | 116 | one- or two-chord vamp | breakbeat pocket and phrase fills | `funk_slap_pop` |
| `funk_soul_pocket` | rounder, warmer live-band feel | 88 | soul/Dorian vamp | laid-back 16ths, lighter ghost notes | `funk_round_finger` |
| `funk_game_chase` | energetic but readable game loop | 124 | minor/Dorian | compact breakbeat, clear one | `funk_synth_pocket` |

These are starting content identities, not six promises to build six separate
synth engines. A preset may share a renderer while changing its curves,
pattern family, articulation density, and mix defaults.

## Sound vocabulary

### Bass

The bass is the pack's primary identity layer. Proposed IDs:

| ID | Use | Behaviour |
| --- | --- | --- |
| `funk_finger_pocket` | default | rounded electric-bass body, firm pluck, short release, controlled upper mids |
| `funk_slap_pop` | headline sound | percussive thumb transient plus bright octave/pop transient; pitched body remains audible |
| `funk_muted_thump` | ghost/dead notes | mostly unpitched low-mid thump with a small pitched residue |
| `funk_round_finger` | soul variant | softer attack, longer low-mid body, less click |
| `funk_synth_pocket` | game/DJ variant | compact saw/triangle hybrid, low-pass envelope, clear transient without harshness |

The bass pattern library should include at least:

- root + octave answer;
- root + fifth pickup;
- muted 16th rake into the one;
- slap low note / pop high note exchange;
- hammer-on two-note cell;
- pull-off descending answer;
- slide into a phrase-ending root;
- a one-bar fill that leaves the final 16th available for the next downbeat.

### Drums

Proposed groove IDs:

| ID | Role |
| --- | --- |
| `funk_backbeat_98` | dependable starter: hats on 16ths, strong 2/4, syncopated kick |
| `funk_ghost_push` | quiet snare ghosts around the backbeat |
| `funk_one_drop` | sparse bar or half-bar that reasserts beat 1 |
| `funk_open_hat_lift` | open-hat punctuation into a new phrase, choked by the next hat |
| `funk_breakbeat_pocket` | busier game/DJ variation with restrained kick syncopation |
| `funk_fill_16ths` | short snare/tom fill for the last beat of an 8- or 16-bar phrase |

The pattern definitions must express level as well as presence. A ghost note
is not a normal snare hit with a different name: it should sit substantially
below the backbeat and must not win the voice budget over bass, chord, or lead.

### Harmony, guitar, and lead

The pack should favour short, dry, percussive gestures:

- `funk_clav_stab`: high-passed, short-decay chord or single-note clav hit;
- `funk_rhodes_stab`: warmer electric-piano answer with a slightly longer tail;
- `funk_muted_guitar`: clipped muted strum/scratch language;
- `funk_brass_stack`: compact horn-like chord stab for repeated call-and-response;
- `funk_muted_trumpet`: short lead punctuation rather than a sustained solo;
- `funk_sax_punch`: phrase-ending accent or two- to four-note fill.

Do not fill every step. Silence, repeated motifs, and call-and-response are
content features, not missing arrangement.

## Bass articulation model

The current Chordsmith surface already has `bassNotes`, `bassHold`,
`bassSlide`, and `bassAccent`. In the legacy projection, Funk can begin with
an additive per-step articulation track. In the richer PCS representation,
articulation belongs on the bass event itself so velocity, duration, technique,
and expression travel together.

Legacy-compatible projection example:

```json
{
  "bassArticulation": [
    "slap", "hold", "pop", "off", "hammer", "pull", "mute", "slide"
  ]
}
```

The semantic values are the important part. The projection should be sparse,
backward-compatible, and aligned to the existing bass step grid. The rich
representation must remain authoritative whenever a project uses fields that
the projection cannot preserve.

| Value | Meaning | Attack | Pitch behaviour |
| --- | --- | --- | --- |
| `finger` | normal plucked note | new | normal |
| `slap` | thumb/percussive low attack | new, strong transient | pitched body |
| `pop` | pulled bright note, usually octave/upper chord tone | new, bright transient | pitched body |
| `mute` | dead note / ghost thump | new, mostly noise/body | no useful sustain |
| `hammer` | fretting-hand hammer-on | no new plucking attack | rises from previous note |
| `pull` | fretting-hand pull-off | no new plucking attack | falls from previous note |
| `slide` | existing or extended slide semantics | source attack | continuous pitch transition |
| `hold` | continuation of the previous note | none | unchanged pitch |

Rules:

- `hammer` and `pull` require a valid adjacent pitched note. If the source is
  invalid, render as `finger` and expose a diagnostic rather than producing a
  silent event.
- `slap` and `pop` are attacks, not new pitches. The pattern author may set
  the octave separately; the renderer must not silently transpose every pop.
- `mute` may use a null/placeholder pitch in the editor but should export a
  deterministic event so the groove survives in live playback, WAV, DAW, and
  Godot preview paths.
- `slide` stays distinct from hammer/pull. A slide is continuous pitch travel;
  a hammer/pull is a connected articulation with no new right-hand attack.
- `hold` remains the continuation marker used by current grid logic. Do not
  replace it with a second competing sustain representation.

### Rendering behaviour

The first implementation can remain procedural and compact:

- finger: current funk bass body with a short pluck envelope;
- slap: add a cached, band-limited click/noise transient and a slightly shorter
  body decay;
- pop: add a brighter transient and a modest upper harmonic emphasis;
- mute: use a short filtered noise/body pulse with very low pitch sustain;
- hammer/pull: use the current connected-voice path, suppressing the second
  attack and applying a short pitch glide or pitch-envelope transition;
- slide: retain the current slide path, adding a profile-specific rate/curve;
- all variants: conservative gain, short release, shared resource caches, and
  no per-hit heavyweight allocation.

The offline renderer, browser live engine, Pocket DJ preview, Pocket DAW native
recipe/cache, and Godot preview generator must consume the same semantic event
fields. Godot shipped game audio may still use rendered stems/samples; that is
the parity-audio path, while the editor preview remains an audition path.

## Cross-app implementation map

| Surface | Funk work | Boundary / acceptance |
| --- | --- | --- |
| Pocket Audio Core | Add profile/preset registries, bass articulation normalisation, deterministic event semantics, procedural voices, drum groove definitions, and shared metadata. | Core owns meaning and offline/live reference behaviour. Run family parity, unit, render, and browser trace checks. |
| Pocket Chordsmith | Add Funk profile/preset selection, funk starter/demo project, bass articulation cells or a compact articulation picker, funk drum/bass/guitar fill actions, and export/import display. | Keep the composer as authoring source. Preserve old projects and current grid resolution fallbacks. |
| Pocket DJ | Preserve Funk metadata on import; add a Funk demo deck and performance macros for one-drop, bass mute, slap/pop emphasis, ghost-snare lift, and phrase fill. | DJ can transform performance state but must not rewrite the source PCS composition. Test import, play, queue, section hold, mutes, builds, drops, and reset. |
| Pocket DAW | Map Funk metadata into native sound recipes/cache signatures; expose bass articulation in arrangement/detail editing where supported; render the same stems and export metadata. | Native audio engine/sample clock remains authoritative. Never make UI timers drive musical timing or cache duration. Installed listening smoke is required for audible claims. |
| Godot addon | Generate Funk metadata/constants and preview aliases; import Funk chart/game packs; keep event articulation available to runtime diagnostics and rendered game assets. | Headless import/compile plus a real scene playback check for shipped runtime. Preview-kit similarity alone is not parity evidence. |
| Game adapters | Provide compact profile/state hooks such as menu, explore, action, boss, victory, and one-drop transitions. | Keep grouped voice budgets so hats/SFX cannot starve bass, harmony, or melody. |

## Chordsmith authoring experience

The minimum useful authoring flow is:

1. Choose **Funk** and a starter preset.
2. See a one-bar or two-bar groove with an obvious beat-1 anchor.
3. Edit bass pitch as today; choose an articulation from the cell menu or a
   small contextual toolbar.
4. Apply a named fill to bass, drums, guitar, or stabs without overwriting
   unrelated tracks unless the user explicitly chooses replace.
5. Hear the result immediately and export the same project to DJ, DAW, and
   Godot.

The UI should show `slap`, `pop`, `hammer`, `pull`, and `mute` as musical
actions, not implementation jargon. A tooltip can explain the technique, but
the grid should remain compact. The pack should make a good groove in a few
clicks before exposing advanced articulation editing.

## Content plan

The first content slice should be deliberately small and listenable:

- 6 style presets listed above;
- 6 drum grooves plus 3 phrase fills;
- 5 bass tones;
- 8 bass riff recipes, including hammer/pull and slap/pop examples;
- 4 guitar/clav/stab patterns;
- 3 short lead/horn response patterns;
- one 8-bar showcase project with A/B/C/D sections;
- one low-density game loop and one high-energy DJ demo;
- one DAW export fixture and one Godot adaptive-pack fixture.

Every example should demonstrate a different relationship between bass, kick,
and stabs. Do not ship six presets that are the same 16th-note loop with a
different filter cutoff.

## Delivery phases

### Phase 0 — format contract and fixtures

- Define the next PCS rich-event schema and feature negotiation rules; do not
  contort the format to avoid a migration.
- Define compact schema-16 projection and an explicit loss report.
- Add fixtures for every Funk articulation, invalid adjacency, mixed rich and
  compact sections, and old projects with no style data.
- Add a deterministic two-bar Funk reference project with no private media.

### Phase 1 — shared engine

- Add `funk.js`, `funk-registry.js`, and shared preset exports following the
  existing lofi/chip/metal pattern.
- Add live/offline bass articulation rendering and Funk drum definitions.
- Add diagnostics for invalid articulation, fallback resolution, and per-role
  voice drops.
- Keep procedural resources cached and bounded for browser/game use.

### Phase 2 — Chordsmith

- Add profile/preset UI and starter content.
- Add the smallest usable bass articulation editor.
- Add Funk fill generators and export/import round-trip coverage.

### Phase 3 — DJ, DAW, and Godot

- Add DJ metadata/macros and e2e demo coverage.
- Add DAW native recipes/cache signature updates and one installed listening
  pass against the exact tested build.
- Add Godot generated metadata, pack import, headless validation, and scene
  playback/listening evidence.

### Phase 4 — polish and release evidence

- Tune gain, transient harshness, release tails, and groove density by ear.
- Compare Chordsmith live, Core offline, DJ, DAW native, and Godot rendered
  stems against the same fixture.
- Document known differences rather than claiming parity from structure alone.

## Acceptance gates

The pack is ready for a family checkpoint when all of these are true:

- **Musical:** the one is clear; the bass remains the identity layer; muted,
  ghost, and accented notes are audibly distinct; fills lead somewhere;
  repeated loops still feel alive without random timing drift.
- **Authoring:** a new user can load Funk, get a coherent groove, and make a
  bass articulation change without editing JSON by hand.
- **Data:** old PCS projects round-trip unchanged; Funk projects preserve
  profile, preset, articulation, and phrase data through JSON/PCS1, DJ, DAW,
  and Godot export paths.
- **Parity:** Core tests, browser trace, Chordsmith smoke, DJ e2e, DAW tests,
  Godot headless import, and target listening evidence all name the same
  fixture and build/backend where relevant.
- **Performance:** no per-hit impulse/noise/curve rebuilds; grouped voice
  budgets preserve bass and harmony under game load; dense 16ths degrade
  gracefully.
- **Safety:** conservative gain, no clipping, no piercing pop transient, short
  rhythmic tails, and no unauthorised private media or external runtime assets.

Use the existing [Pocket Audio sound parity matrix](POCKET_AUDIO_SOUND_PARITY_MATRIX.md)
for the evidence standard. In particular, a Godot preview-kit import is not by
itself proof of Chordsmith/DAW/DJ synth parity.

## Locked implementation decisions

1. The user-facing pack name is **Funk** and the stable profile ID is
   `funk_groove`.
2. The rich-event evolution is PCS schema 17 under the existing `PCS1:`
   envelope. Schema 16 remains a supported legacy format and projection.
3. `mute` is a bass-event articulation in the first slice, not a separate
   percussion track.
4. The first procedural slice uses compact clav, guitar, and brass-stack
   approximations. A richer horn model may follow without changing the PCS
   event contract.
5. `funk_classic_pocket` is the reference parity fixture; `funk_slap_party`
   and `funk_game_chase` exercise the higher-density articulation and game
   paths.

## Implemented first slice

- Six authoring presets and a generated multi-section Funk loop are available
  in Pocket Chordsmith.
- Core provides five bass voices, two drum kits, nine bass riff recipes, six
  primary grooves plus three fills, four stab/guitar recipes, and three lead
  response recipes.
- Finger, slap, pop, mute, hammer, pull, slide, and hold survive schema-17
  import/export. Invalid connected notes produce a deterministic fallback
  diagnostic.
- `pocket`, `ghostNotes`, `slapAmount`, `popBrightness`, `muteDepth`, and
  `stabTightness` each perturb reference rendering and are covered by automated
  regression tests.
- DJ macros alter performance state without rewriting source composition; DAW
  native rendering/cache signatures and Godot import diagnostics preserve the
  same profile intent.

The remaining release activity is ear-led tuning and exact-build listening
evidence across target backends. It does not require another PCS format change.
