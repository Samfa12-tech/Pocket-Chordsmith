# Pocket Chordsmith Godot Addon Changelog

## Unreleased

Pocket Audio schema-17 sound-profile compatibility update.

Added:

- Schema-17 import, migration, validation, and chart-resource preservation for
  canonical sound profiles, sparse expressive events, expanded drum lanes,
  articulation, expression, performance roles, sounds, and namespaced
  technique data.
- Capability negotiation and structured fallback/loss diagnostics without
  deleting unsupported source intent.
- Generated shared constants and safe Web Kit preview aliases for Funk,
  Western, Chiptune, and upgraded Heavy Metal identifiers.
- Headless schema-17 and schema-16 migration contract fixtures.

Notes:

- Procedural/sample preview remains an audition path. Use prepared
  `STEM_SYNC` or `HYBRID` assets for production-grade profile identity.

## 1.1.9

Pocket Audio Heavy Metal profile compatibility update.

Added:

- Import and chart-resource metadata preservation for the `heavy_metal` audio profile, `metalPreset`, `metalTexture`, metal drum kits, bass tones, chord instruments, melody instruments, guitar tones, and groove preset hints.
- Shared Godot constants for the six Heavy Metal style presets: `metal_classic_chug`, `metal_thrashing_gallop`, `metal_doom_procession`, `metal_power_anthem`, `metal_boss_blast`, and `metal_breakdown_gate`.
- Bundled web-kit playback profile aliases for `metal_tight`, `metal_arena`, and `metal_doom` drum kits.
- Bundled web-kit playback profile aliases for `metal_pick_bass`, `metal_sub_pick`, `metal_grind_bass`, `metal_power_stack`, `dark_organ_stack`, `shred_lead_guitar`, and `twin_harmony_lead`.
- Bundled web-kit playback profile aliases for `tight_metal` and `doom_fuzz` guitar tone articulations.

Changed:

- Updated addon package metadata to `1.1.9`.
- Extended surface-drift coverage so every shared guitar tone must have checked-in Godot preview aliases.

Notes:

- The bundled web-kit mappings are safe preview aliases and do not add external samples. For final game audio identity, use Pocket DAW Godot Adaptive Packs, rendered stems, licensed samples, or a project-specific HYBRID/STEM_SYNC playback profile.

## 1.1.8

Pocket Chordsmith-to-Godot adaptive stems and sample-preview sound parity update.

Added:

- First-class `PCSPlaybackProfile.section_stem_sets` for prepared section-specific stems, with helpers for section aliases such as `01_A`, `section_A`, and `A_loop`.
- Runtime section audio switching: `PocketChordsmithConductor.queue_section("B")` and `jump_to_section("B")` now resolve the matching section stem map instead of only moving chart timing.
- Audio prewarm and diagnostics APIs for section/state/full-song stems: `prewarm_section()`, `prewarm_sections()`, `get_missing_audio_assets()`, and `validate_audio_assets()`.
- Flexible prepared game-pack manifest handling for section assets, section loops, state stems, stem-key aliases such as `lead` to `melody`, and embedded source project JSON.
- `tools/validate_adaptive_stems.gd` for headless validation of section-stem profile serialization, DAW/game-pack import, PCS1 compile, conductor section switching, and prewarm missing-asset diagnostics.
- Bundled web-kit preview WAVs and playback-profile mappings for `saloon_piano`, `banjo`, `harmonica`, `cowboy_whistle`, `trumpet`, `saxophone`, and `western_twang` guitar articulations.
- Chart performance metadata for Chordsmith FX, humanize, sidechain, mix, and pan settings so Godot previews can reproduce more of the browser playback character.
- A visible `Render Preview Audio` workflow that bakes text-only Chordsmith imports into per-section and full-song WAV stems before preview playback.
- Headless tools for rendering preview stems, validating native preview audio, validating/repairing the dry preview mix, exporting compiled-event traces, and profiling preview performance.
- Drift tests covering Godot preview sample recipes, western sound IDs, FX graph settings, humanize, guitar gates, and chord rhythm parity.

Changed:

- Prepared DAW/Godot game packs now populate `section_stem_sets` while keeping legacy `stem_sets` compatibility.
- Per-stem and per-layer volume/mute APIs now normalize names through the same runtime path, so `set_stem_volume("drums", -6.0)` and `set_layer_volume("drums", -6.0)` affect the same layer controls.
- The addon UI now labels generated sample-kit output as preview audio, and the demo scene button reports missing/open failures instead of silently doing nothing.
- Godot chord, guitar, bass, and melody preview events now preserve Chordsmith voicing order, pitch mapping, mix-volume scaling, deterministic humanize feel, melody pan buses, sidechain ducking, and stepped slide approximations.
- The conductor applies Chordsmith-style delay, chorus, flanger, reverb, and tone shaping to the sample-preview bus when compiled FX settings are present.
- Generated preview stems stay split by role so drums, bass, chords, guitar, and melody continue to route through the usual Godot music buses for volume and FX control.
- Recommended music buses are dry by default, with a `Reset Preview Mix` action and repair tool for removing stale preview reverb/distortion from older project bus layouts.
- Live preview startup no longer performs full-song native tonal stream synthesis. Cached native streams are still used, explicit loading-screen prewarm can still build them, and live cache misses fall back to bundled Web Kit samples instead of freezing the editor.
- Native tonal preview cache keys now include chart timing, preventing streams generated for one tempo from being reused with another imported chart.
- `prewarm_audio()` is safe by default and skips full native tonal stream generation unless called as `prewarm_audio(false, true)`.
- Added `prewarm_native_preview_slice()` and diagnostics for native cache hits/fallbacks so projects can warm higher-fidelity preview streams from loading/progress screens while keeping live playback non-blocking.
- Runtime validation now warns about known preview approximations while accepting the updated web-kit profile and sample set.

## 1.1.7

Pocket Audio sound-pack compatibility update.

Added:

- Import and chart-resource metadata for Pocket Chordsmith lofi/chillhop profile IDs, preset IDs, texture settings, adaptive music states, and game-state hints.
- Import and chart-resource metadata for Pocket Chordsmith chip tune profile IDs, preset IDs, texture settings, drum kits, bass tones, chord instruments, melody instruments, and groove presets.
- Web-kit playback profile mappings for lofi chord, melody, bass, and drum identifiers including dusty Rhodes, felt piano, cassette keys, warm pad, mellow vibes, tape bell, warm sub, soft upright, and lofi drum hits.
- Web-kit playback profile mappings for chip chord, melody, bass, and drum identifiers using safe procedural/alias preview routing instead of external sample packs.
- Recommended `Music_Texture` bus support for vinyl/tape texture routing and lofi-friendly preview effects.

Changed:

- Runtime conductor diagnostics and music-state helpers now preserve enough lofi metadata for menu, explore, night, rain, and fuller-loop game states without parsing the original Pocket Chordsmith JSON at runtime.
- Chart compilation preserves chip preset and texture metadata so games can route arcade, boss, menu, dungeon, and victory cues without parsing full source JSON at runtime.
- Import/build scripts are more robust in fresh or headless Godot projects by relying on explicit addon script paths instead of fragile class-name registration.
- Missing preview WAV checks now allow generated web-kit files to be detected before Godot import metadata exists.

## 1.1.6

Direct Push-to-Godot browser handoff update.

Added:

- Editor-only localhost receiver at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`.
- Pocket Chordsmith browser app v67 can send `PCS1:` song codes directly to the open Godot addon.
- The `Chordsmith` tab imports and compiles pushed songs immediately, then leaves saving as an explicit `Save Chart Resource` step.

Changed:

- Push-to-Godot docs now describe the direct receiver flow with the existing clipboard/paste fallback.

## 1.1.5

Pocket Chordsmith v64 western sound compatibility update.

Changed:

- Importer schema now preserves v64 western sound IDs from web exports: `saloon_piano`, `banjo`, `harmonica`, `cowboy_whistle`, and `western_twang`.
- Importer schema now preserves v64 western guitar pattern presets: `boom_chick`, `train_chop`, and `western_waltz`.
- The bundled web-kit playback profile maps new western chord and melody IDs to safe preview samples, so v64 charts compile and audition without custom sample packs.
- Generated web-kit playback profiles now include the v63 and v64 chord/melody sample keys.

## 1.1.4

Runtime sample-preview stability update.

Changed:

- Sample preview now drops hits that are more than 120 ticks late instead of playing old notes as catch-up bursts.
- Runtime diagnostics now report `sample_play_skipped_late_total`.
- The bundled web-kit profile and generated web-kit profiles use the tighter late-hit threshold.
- Playback profile warnings now flag pitched-event debug logging, compressed/imported WAV preview loading, and missing `Music_Guitar` buses.

Docs:

- Sample preview docs now call out diagnostic logging as a temporary-only option and list the generated guitar web-kit samples.

## 1.1.3

Sound-option compatibility update for Pocket Chordsmith v63 projects.

Changed:

- Chord events now preserve the browser app's optional `chordInstrument` choice in event flags.
- Sample-preview lookup can route chord-specific keys such as `chord:piano`, `chord:harp`, `chord:warm_pad`, `chord:glass`, and `chord:pocket` when a playback profile provides them.
- The bundled web-kit profile maps new chord and melody sound IDs to safe existing preview samples, so v63 charts compile and audition without custom sample packs.

## 1.1.2

Guitar preview audio update for the v60 rock guitar import path.

Added:

- Dedicated `Music_Guitar` bus support through `PCSPlaybackProfile.guitar_bus`.
- Dry-by-default `Music_Guitar` setup for the recommended bus layout, leaving guitar tone and effects to Godot's native audio mixer unless a playback profile explicitly opts in.
- Generated web-kit guitar samples for open strums, palm-muted chugs, accents, and scratches.

Changed:

- Guitar sample preview now routes to `Music_Guitar` instead of the chord bus.
- Web-kit guitar event sample keys now point to guitar-specific WAVs instead of `chord_tone.wav`.
- Guitar sample pitch preview uses low-E style source tuning so root/fifth/octave stacks sit in a more useful rhythm-guitar range.

## 1.1.1

Rock guitar import compatibility update for Pocket Chordsmith v60 projects.

Added:

- Importer schema support for optional v60 guitar settings and per-section guitar patterns.
- Chart compiler output for guitar rhythm events, including root/fifth/octave power-chord note stacks, palm-muted chugs, accents, scratches, holds, register, tone, and strum-direction flags.
- HYBRID/sample-preview fallback keys for guitar events so new charts can audition in Godot without custom samples.
- A `guitar` stem layer in generated playback profile templates and stem workflow docs.

Changed:

- Timeline, section list, and import summary views now include guitar event counts when present.
- Sample preview routes guitar through the chord bus and allows three-note power chords while keeping older chord preview limits unchanged.
- Older projects still normalise with guitar disabled and empty per-section guitar patterns.

## 1.1.0

Web export compatibility update for sample preview and hybrid playback.

Added:

- A `sample_preview_force_web_stream_for_pitched` playback profile option, enabled by default, so pitched bass, chord, and melody preview samples use Godot stream playback on web exports.
- A `sample_preview_log_pitched_events` debug option for inspecting sample key, MIDI note, pitch scale, bus, and playback type when diagnosing tonal preview playback.

Changed:

- Pitched sample preview now requests `AudioServer.PLAYBACK_TYPE_STREAM` on web builds where needed, avoiding the melody pitch variation issue seen in exported games.
- Tonal sample preview keeps the same behavior on desktop/native exports unless the project explicitly changes profile settings.

## 1.0.0

First stable release of the Godot addon.

Added:

- Pocket Chordsmith web-kit WAV generator and generated HYBRID playback profile.
- Godot-native audio playback extension points for stems, buses, samples, stingers, ducking, and filter/effect automation.
- Adaptive music state and boundary-aware transition APIs on `PocketChordsmithConductor`.
- Batch JSON compiler and runtime validator command-line tools.
- Runtime diagnostics for event cursor, emitted/late/skipped events, state, section, beat, tick, sample requests, and playback warnings.
- Integration docs, stem workflow docs, sample preview docs, UID/cache recovery notes, shipping checklist, and AI `SKILL.md`.

Changed:

- The addon author is now `Samfa12`.
- The editor toolbar is horizontally scrollable and includes button tooltips.
- The plugin can import from file, pasted JSON, or pasted `PCS1:` share code text.
- `PocketChordsmithPlayer.gd` is documented as legacy editor/demo preview rather than the shipped runtime playback layer.

Known limits:

- Generated samples are close Pocket Chordsmith-style recreations, not bit-identical WebAudio exports.
- Stem playback is prepared around Godot-native streams; projects still need to provide final rendered stems for shipped music beds.
- Full visual sequence editing still belongs in the web app for this release.
