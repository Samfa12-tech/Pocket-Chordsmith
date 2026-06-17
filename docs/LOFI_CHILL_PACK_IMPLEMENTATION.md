# Lofi Chill Pack Implementation

This note records the first shared lofi/chillhop pass for the Pocket Chordsmith / Pocket Audio family.

## Architecture

Pocket Audio Core exists in this repository at `packages/pocket-audio-core/`, but it is still a v0 shared runtime scaffold. For this pass, the true shared layer is the lofi preset/spec module:

- `packages/pocket-audio-core/src/presets/lofi.js`
- `packages/pocket-audio-core/src/index.js`
- `packages/pocket-audio-core/src/schema/normalise-project.js`

The web apps and Godot addon still keep their own procedural renderers/importers. They now consume or mirror the same preset IDs, metadata fields, instrument IDs, drum-kit IDs, texture defaults, and groove names so a lofi project can move through the family without needing external sample packs.

## Shared Optional Fields

Schema remains Pocket Chordsmith schema `16`. No schema bump was made. New data is optional and defaults to clean/standard behavior when missing:

- `audioProfile`: `"standard"` or `"lofi_chill"`
- `lofiPreset`: shared lofi preset ID
- `stylePreset`: accepted as an alias for future/export-tool compatibility
- `lofiTexture`: `{ enabled, vinylCrackle, tapeHiss, wowFlutter, warmth, lowPassAge, bitCrush }`
- `drumKit`: `"classic"`, `"lofi_dusty"`, `"lofi_brush"`, or `"lofi_tape_soft"`
- `drumGroovePreset`: lofi groove ID such as `"lofi_backbeat_76"`
- `bassTone`: `"classic"`, `"warm_sub"`, `"soft_upright"`, or `"rounded_triangle_bass"`

Old projects with none of these fields import as `standard`. Unknown lofi enum values should fall back to a warm, soft, or standard equivalent in each target.

## Presets

The shared preset IDs are:

- `lofi_study_room`
- `lofi_rainy_window`
- `lofi_moon_garden`
- `lofi_koi_pond`
- `lofi_train_window`
- `lofi_ant_farm_night`
- `lofi_menu_warmth`
- `lofi_sleepy_waltz`

The intended BPM range is 60 to 90 BPM, with most presets from 68 to 84 BPM. Defaults favor mellow sevenths/add9 colors, soft swung drums, conservative gain, subtle tape/vinyl texture, and loopable game-background arrangements.

## Changed Integration Points

Pocket Chordsmith:

- `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html`
- `apps/chordsmith-web/demos/lofi_study_room_loop.json`
- `apps/chordsmith-web/demos/lofi_rainy_window_loop.json`
- `apps/chordsmith-web/demos/lofi_koi_pond_loop.json`

Pocket DJ:

- `apps/pocket-dj/pocket_dj_v1g_core_bridge.html`

Pocket Audio Core:

- `packages/pocket-audio-core/src/presets/lofi.js`
- `packages/pocket-audio-core/src/index.js`
- `packages/pocket-audio-core/src/schema/normalise-project.js`

Pocket DAW:

- `apps/pocket-daw/src/compatibility/pcsSanitizer.ts`
- `apps/pocket-daw/src/compatibility/pcsToDaw.ts`
- `apps/pocket-daw/src/demo/demoProject.ts`

Godot addon:

- `addons/pocket_chordsmith/import/pcs_schema_migrator.gd`
- `addons/pocket_chordsmith/import/pcs_chart_compiler.gd`
- `addons/pocket_chordsmith/resources/pcs_chart_resource.gd`
- `addons/pocket_chordsmith/resources/pcs_playback_profile.gd`
- `addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd`
- `addons/pocket_chordsmith/editor/pcs_audio_bus_tools.gd`
- `addons/pocket_chordsmith/editor/pcs_sound_kit_generator.gd`
- `addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres`

## Procedural Sound Policy

No external sample packs are bundled. The lofi pack uses procedural Web Audio approximations in browser apps and generated or mapped preview sounds in the Godot addon. Shipped games can replace preview sounds or stems with their own licensed audio, but the repository does not require that path.

Default texture amounts are intentionally subtle. Turn `lofiTexture.enabled` off for clean exports, low-end mobile debugging, or projects that use rendered stems with real production texture already printed.

## Game Usage Notes

Use Pocket Chordsmith to create the loop, Pocket DJ to test section energy and gentle performance macros, Pocket DAW for arrangement/stem work where useful, and the Godot addon to compile charts for runtime timing and state control.

Recommended Godot calls for a chill game:

```gdscript
conductor.set_music_state("menu")
conductor.set_music_state("explore")
conductor.queue_music_state("night", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
conductor.queue_music_state("night", PocketChordsmithConductor.TransitionBoundary.NEXT_SECTION)
conductor.lowpass_music(0.65)
conductor.set_bus_effect_amount("Music_Texture", "lowpass", 0.35)
```

The addon now stores lofi metadata on `PCSChartResource` so games can choose adaptive menu, explore, night, rain, and fuller-loop states without parsing full Chordsmith JSON at runtime.

