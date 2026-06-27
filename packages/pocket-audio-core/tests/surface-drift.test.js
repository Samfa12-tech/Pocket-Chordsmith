import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FX,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_LOFI_TEXTURE,
  DEFAULT_STEM_MIX,
  LOFI_AUDIO_PROFILE_ID,
  LOFI_BASS_TONES,
  LOFI_CHORD_INSTRUMENTS,
  LOFI_DRUM_GROOVE_PRESETS,
  LOFI_DRUM_KITS,
  LOFI_MELODY_INSTRUMENTS,
  LOFI_STYLE_PRESET_IDS,
  CHIP_AUDIO_PROFILE_ID,
  CHIP_BASS_TONES,
  CHIP_CHORD_INSTRUMENTS,
  CHIP_DRUM_GROOVE_PRESETS,
  CHIP_DRUM_KITS,
  CHIP_MELODY_INSTRUMENTS,
  CHIP_STYLE_PRESET_IDS,
  CHORDSMITH_CHORD_PLAY_MODES,
  CHORDSMITH_CHORD_RHYTHM,
  CHORDSMITH_CHORD_RHYTHM_MODES,
  CHORDSMITH_DRUM_FEEL,
  CHORDSMITH_PHRASE_GATES,
  CHORDSMITH_PITCHED_TUPLET,
  DRUM_PATTERN_DEFS,
  DRUM_PRESETS,
  CHORDSMITH_LIVE_DRUM_VOICES,
  CHORDSMITH_SEQUENCED_DRUM_LANE_IDS,
  POCKET_DRUM_LANES,
  POCKET_DRUM_KIT_CONFIGS,
  DEFAULT_CLASSIC_DRUM_KIT,
  DEFAULT_LOFI_DRUM_KIT,
  POCKET_BUILT_IN_FX_TYPES,
  POCKET_PRO_EQ_BANDS,
  POCKET_BASS_TONE_CONFIGS,
  POCKET_GUITAR_TONE_CONFIGS,
  POCKET_GUITAR_TONES,
  DEFAULT_GUITAR_REGISTER,
  DEFAULT_GUITAR_STRUM_MODE,
  DEFAULT_GUITAR_TONE,
  DEFAULT_CHORD_INSTRUMENT,
  DEFAULT_MELODY_INSTRUMENT,
  POCKET_CHORD_INSTRUMENTS,
  POCKET_CHORD_INSTRUMENT_CONFIGS,
  POCKET_MELODY_INSTRUMENTS,
  POCKET_LEAD_INSTRUMENT_CONFIGS,
  CHORDSMITH_GUITAR_GATE_SECONDS,
  CHORDSMITH_HUMANIZE_TIMING_SECONDS,
  CHORDSMITH_LOFI_TEXTURE_LIVE,
  CHORDSMITH_SIDECHAIN_ATTACK_SECONDS,
  CHORDSMITH_SIDECHAIN_RELEASE_SECONDS,
  CHORDSMITH_SIDECHAIN_DEPTH,
  CHORDSMITH_SIDECHAIN_FLOOR,
  CHORDSMITH_OFFLINE_RENDER_HEADROOM,
  CHORDSMITH_OFFLINE_STEM_GAIN,
  CHORDSMITH_FX_GRAPH,
  GAME_PACK_FOLDERS,
  gamePackManifestPath
} from "../src/index.js";

const repoRoot = new URL("../../../", import.meta.url);

const surfaces = {
  chordsmith: new URL("apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html", repoRoot),
  pocketDj: new URL("apps/pocket-dj/pocket_dj_v1g_core_bridge.html", repoRoot),
  pocketDawDrumPresets: new URL("apps/pocket-daw/src/daw/chordsmithDrumPresets.ts", repoRoot),
  pocketDawFx: new URL("apps/pocket-daw/src/daw/fx.ts", repoRoot),
  pocketDawInstruments: new URL("apps/pocket-daw/src/audio/instruments.ts", repoRoot),
  pocketDawGeneratedSoundRecipes: new URL("apps/pocket-daw/src-tauri/src/generated_sound_recipes.rs", repoRoot),
  pocketDawGenerateNativeSoundRecipes: new URL("apps/pocket-daw/scripts/generate-native-sound-recipes.mjs", repoRoot),
  pocketDawNativeAudio: new URL("apps/pocket-daw/src-tauri/src/native_audio.rs", repoRoot),
  pocketDawNativePlayback: new URL("apps/pocket-daw/src/native/audioPlayback.ts", repoRoot),
  pocketDawOfflineRender: new URL("apps/pocket-daw/src/audio/offlineRender.ts", repoRoot),
  pocketDawRenderer: new URL("apps/pocket-daw/src/audio/eventRenderer.ts", repoRoot),
  pocketDawEditor: new URL("apps/pocket-daw/src/daw/chordsmithEditor.ts", repoRoot),
  pocketDawProject: new URL("apps/pocket-daw/src/daw/dawProject.ts", repoRoot),
  pocketDawDemo: new URL("apps/pocket-daw/src/demo/demoProject.ts", repoRoot),
  pocketDawTracks: new URL("apps/pocket-daw/src/daw/tracks.ts", repoRoot),
  pocketDawUi: new URL("apps/pocket-daw/src/app/ui.ts", repoRoot),
  pocketDawSanitizer: new URL("apps/pocket-daw/src/compatibility/pcsSanitizer.ts", repoRoot),
  pocketDawImport: new URL("apps/pocket-daw/src/compatibility/pcsToDaw.ts", repoRoot),
  pocketDawExportJobs: new URL("apps/pocket-daw/src/daw/exportJobs.ts", repoRoot),
  coreNormalizer: new URL("packages/pocket-audio-core/src/schema/normalise-project.js", repoRoot),
  coreLiveEngine: new URL("packages/pocket-audio-core/src/engine/live-engine.js", repoRoot),
  coreGamePackPaths: new URL("packages/pocket-audio-core/src/export/game-pack-paths.js", repoRoot),
  godotSharedSoundConstants: new URL("addons/pocket_chordsmith/import/pcs_shared_sound_constants.gd", repoRoot),
  pocketAudioCorePackage: new URL("packages/pocket-audio-core/package.json", repoRoot),
  pocketAudioCoreReadme: new URL("packages/pocket-audio-core/README.md", repoRoot),
  pocketAudioCoreSyncSoundSurfaces: new URL("packages/pocket-audio-core/scripts/sync-shared-sound-surfaces.mjs", repoRoot),
  godotGamePackManifest: new URL("addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd", repoRoot),
  godotGenerateSoundMetadata: new URL("packages/pocket-audio-core/scripts/generate-godot-sound-metadata.mjs", repoRoot),
  godotMigrator: new URL("addons/pocket_chordsmith/import/pcs_schema_migrator.gd", repoRoot),
  godotCompiler: new URL("addons/pocket_chordsmith/import/pcs_chart_compiler.gd", repoRoot),
  godotValidator: new URL("addons/pocket_chordsmith/import/pcs_validator.gd", repoRoot),
  godotBuildTools: new URL("addons/pocket_chordsmith/import/pcs_chart_build_tools.gd", repoRoot),
  godotKitExport: new URL("packages/pocket-audio-core/src/export/godot-kit.js", repoRoot),
  godotConductor: new URL("addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd", repoRoot),
  godotSoundKitGenerator: new URL("addons/pocket_chordsmith/editor/pcs_sound_kit_generator.gd", repoRoot),
  godotWebKitProfile: new URL("addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres", repoRoot)
};

test("public lofi IDs stay aligned across Chordsmith, DJ, Godot and core", async () => {
  const [chordsmith, pocketDj, godotMigrator, godotSharedSoundConstants, coreLofiPresets, pocketDawSanitizer] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.godotMigrator, "utf8"),
    readFile(surfaces.godotSharedSoundConstants, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/presets/lofi.js", repoRoot), "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8")
  ]);

  const expectedDrumKits = ["classic", ...LOFI_DRUM_KITS];
  const expectedBassTones = ["classic", ...LOFI_BASS_TONES];
  const expectedPocketDrumKits = ["classic", ...LOFI_DRUM_KITS, ...CHIP_DRUM_KITS];
  const expectedPocketBassTones = ["classic", ...LOFI_BASS_TONES, ...CHIP_BASS_TONES];
  const expectedDrumGroovePresets = [...LOFI_DRUM_GROOVE_PRESETS];

  assert.equal(extractStringConst(chordsmith, "LOFI_AUDIO_PROFILE_ID"), LOFI_AUDIO_PROFILE_ID);
  assert.deepEqual(extractJsArrayConst(chordsmith, "LOFI_DRUM_KITS"), expectedDrumKits);
  assert.deepEqual(extractJsArrayConst(chordsmith, "LOFI_BASS_TONES"), expectedBassTones);
  assert.deepEqual(extractJsObjectKeys(chordsmith, "LOFI_STYLE_PRESETS"), LOFI_STYLE_PRESET_IDS);

  assert.equal(extractStringConst(pocketDj, "LOFI_AUDIO_PROFILE_ID"), LOFI_AUDIO_PROFILE_ID);
  assert.deepEqual(extractJsArrayConst(pocketDj, "LOFI_CHORD_INSTRUMENTS"), LOFI_CHORD_INSTRUMENTS);
  assert.deepEqual(extractJsArrayConst(pocketDj, "LOFI_MELODY_INSTRUMENTS"), LOFI_MELODY_INSTRUMENTS);
  assert.deepEqual(extractJsArrayConst(pocketDj, "LOFI_DRUM_KITS"), expectedDrumKits);
  assert.deepEqual(extractJsArrayConst(pocketDj, "LOFI_BASS_TONES"), expectedBassTones);
  assert.deepEqual(extractJsArrayConst(pocketDj, "LOFI_STYLE_PRESETS"), LOFI_STYLE_PRESET_IDS);

  assert.equal(extractGdStringConst(godotSharedSoundConstants, "LOFI_AUDIO_PROFILE_ID"), LOFI_AUDIO_PROFILE_ID);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "LOFI_CHORD_INSTRUMENTS"), LOFI_CHORD_INSTRUMENTS);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "LOFI_MELODY_INSTRUMENTS"), LOFI_MELODY_INSTRUMENTS);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "POCKET_DRUM_KITS"), expectedPocketDrumKits);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "POCKET_BASS_TONES"), expectedPocketBassTones);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "LOFI_STYLE_PRESETS"), LOFI_STYLE_PRESET_IDS);
  assert.equal(extractGdStringConst(godotSharedSoundConstants, "CHIP_AUDIO_PROFILE_ID"), CHIP_AUDIO_PROFILE_ID);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "CHIP_CHORD_INSTRUMENTS"), CHIP_CHORD_INSTRUMENTS);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "CHIP_MELODY_INSTRUMENTS"), CHIP_MELODY_INSTRUMENTS);
  assert.deepEqual(extractGdArrayConst(godotSharedSoundConstants, "CHIP_STYLE_PRESETS"), CHIP_STYLE_PRESET_IDS);
  assert.ok(godotMigrator.includes("const SharedSoundConstants := preload"), "Godot migrator should consume generated shared sound constants");
  assert.ok(godotMigrator.includes("POCKET_CHORD_INSTRUMENTS := SharedSoundConstants.POCKET_CHORD_INSTRUMENTS"), "Godot migrator should validate chord IDs from generated shared sound constants");
  assert.ok(godotMigrator.includes("POCKET_MELODY_INSTRUMENTS := SharedSoundConstants.POCKET_MELODY_INSTRUMENTS"), "Godot migrator should validate melody IDs from generated shared sound constants");
  assert.ok(godotMigrator.includes("POCKET_DRUM_KITS := SharedSoundConstants.POCKET_DRUM_KITS"), "Godot migrator should validate drum kit IDs from generated shared sound constants");
  assert.ok(godotMigrator.includes("POCKET_BASS_TONES := SharedSoundConstants.POCKET_BASS_TONES"), "Godot migrator should validate bass tone IDs from generated shared sound constants");

  assert.ok(coreLofiPresets.includes("safeChoice(project.drumKit, LOFI_DRUM_KITS"), "core lofi normalizer should validate drum-kit IDs against shared presets");
  assert.ok(coreLofiPresets.includes("safeChoice(project.drumGroovePreset, LOFI_DRUM_GROOVE_PRESETS"), "core lofi normalizer should validate drum groove IDs against shared presets");
  assert.ok(coreLofiPresets.includes("safeChoice(project.bassTone"), "core lofi normalizer should validate bass-tone IDs against shared presets");
  expectedDrumGroovePresets.forEach((id) => {
    assert.ok(coreLofiPresets.includes(`"${id}"`), `core lofi normalizer should expose ${id}`);
  });
  assert.ok(pocketDawSanitizer.includes("LOFI_DRUM_GROOVE_PRESETS"), "Pocket DAW sanitizer should consume shared lofi drum groove IDs");
  assert.ok(pocketDawSanitizer.includes("getLofiStylePreset"), "Pocket DAW sanitizer should use shared lofi preset fallbacks");
  assert.ok(pocketDawSanitizer.includes("sanitizeDrumGroovePreset"), "Pocket DAW sanitizer should validate imported lofi drum grooves");
  assert.ok(pocketDawSanitizer.includes("CHIP_DRUM_GROOVE_PRESETS"), "Pocket DAW sanitizer should validate imported chip drum grooves");
});

test("shared sound surface generation stays one-command across DAW and Godot", async () => {
  const [packageJson, syncScript, readme] = await Promise.all([
    readFile(surfaces.pocketAudioCorePackage, "utf8"),
    readFile(surfaces.pocketAudioCoreSyncSoundSurfaces, "utf8"),
    readFile(surfaces.pocketAudioCoreReadme, "utf8")
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.equal(
    scripts["generate:sound-surfaces"],
    "node scripts/sync-shared-sound-surfaces.mjs",
    "Pocket Audio Core should expose one generate command for shared sound surfaces"
  );
  assert.equal(
    scripts["verify:sound-surfaces"],
    "node scripts/sync-shared-sound-surfaces.mjs --check",
    "Pocket Audio Core should expose one stale-check command for shared sound surfaces"
  );
  assert.ok(
    syncScript.includes("generate-godot-sound-metadata.mjs"),
    "shared sound surface workflow should refresh Godot sample-preview metadata"
  );
  assert.ok(
    syncScript.includes("generate-native-sound-recipes.mjs"),
    "shared sound surface workflow should refresh Pocket DAW native recipes"
  );
  assert.ok(
    readme.includes("npm run generate:sound-surfaces"),
    "README should document the shared sound surface generation workflow"
  );
});

test("lofi texture defaults stay aligned across Chordsmith, DJ, DAW, Godot and core", async () => {
  const [chordsmith, pocketDj, pocketDawSanitizer, godotMigrator, godotSharedSoundConstants] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(surfaces.godotMigrator, "utf8"),
    readFile(surfaces.godotSharedSoundConstants, "utf8")
  ]);

  assertLofiTextureDefaults(chordsmith, "Chordsmith", DEFAULT_LOFI_TEXTURE);
  assertLofiTextureDefaults(pocketDj, "Pocket DJ", DEFAULT_LOFI_TEXTURE);
  assert.ok(pocketDawSanitizer.includes("normaliseLofiTexture"), "Pocket DAW lofi texture sanitizer should delegate to shared core");
  assert.ok(pocketDawSanitizer.includes("getLofiStylePreset(lofiPreset || undefined)"), "Pocket DAW lofi texture sanitizer should use preset texture defaults");
  assert.ok(pocketDawSanitizer.includes("DEFAULT_LOFI_TEXTURE"), "Pocket DAW lofi texture sanitizer should use shared standard fallback");
  assert.ok(godotSharedSoundConstants.includes("LOFI_STYLE_PRESET_TEXTURES"), "Godot generated constants should include lofi preset texture defaults");
  assert.ok(godotSharedSoundConstants.includes('"lofi_rainy_window": {"enabled": true'), "Godot generated constants should preserve preset texture enabled flags");
  assert.ok(godotMigrator.includes("LOFI_STYLE_PRESET_TEXTURES := SharedSoundConstants.LOFI_STYLE_PRESET_TEXTURES"), "Godot migrator should consume generated lofi preset texture defaults");
  assert.ok(godotMigrator.includes('preset_texture.get("enabled", false)'), "Godot lofi texture sanitizer should use preset enabled defaults");
  assert.ok(godotMigrator.includes(`preset_texture.get("wowFlutter", ${numberLiteral(DEFAULT_LOFI_TEXTURE.wowFlutter)})`), "Godot lofi texture sanitizer should fall back through preset wow/flutter defaults");
  assert.ok(godotMigrator.includes(`preset_texture.get("bitCrush", ${numberLiteral(DEFAULT_LOFI_TEXTURE.bitCrush)})`), "Godot lofi texture sanitizer should fall back through preset bitcrush defaults");
});

test("Pocket Audio Core renderer applies shared Chordsmith offline lofi texture", async () => {
  const [coreOfflineRenderer, pocketDawOfflineRender] = await Promise.all([
    readFile(new URL("packages/pocket-audio-core/src/engine/offline-renderer.js", repoRoot), "utf8"),
    readFile(surfaces.pocketDawOfflineRender, "utf8")
  ]);

  assert.ok(coreOfflineRenderer.includes("chordsmithLofiTextureOfflineSample"), "core offline renderer should use shared Chordsmith lofi texture sample math");
  assert.ok(coreOfflineRenderer.includes("CHORDSMITH_LOFI_TEXTURE_OFFLINE"), "core offline renderer should use shared Chordsmith offline lofi constants");
  assert.ok(coreOfflineRenderer.includes("renderLofiTexture(project, left, right, sampleRate)"), "core offline renderer should apply lofi texture to exported buffers");
  assert.ok(pocketDawOfflineRender.includes("chordsmithLofiTextureOfflineSample"), "Pocket DAW WebAudio export should use shared Chordsmith lofi texture sample math");
  assert.ok(pocketDawOfflineRender.includes('event.kind === "texture"'), "Pocket DAW WebAudio export should avoid double-rendering live texture events when continuous texture is scheduled");
});

test("Pocket DAW native runtime receives imported lofi texture values", async () => {
  const [nativePlayback, nativeAudio] = await Promise.all([
    readFile(surfaces.pocketDawNativePlayback, "utf8"),
    readFile(surfaces.pocketDawNativeAudio, "utf8")
  ]);

  assert.ok(nativePlayback.includes("lofiTexture: event.lofiTexture"), "native bridge should send imported lofi texture values");
  assert.ok(nativePlayback.includes("step: event.step"), "native bridge should send Chordsmith step indexes for seeded texture");
  assert.ok(nativeAudio.includes("lofi_texture: Option<NativeLofiTexture>"), "native runtime should deserialize lofi texture values");
  assert.ok(nativeAudio.includes("CHORDSMITH_LOFI_TEXTURE_HISS_GAIN"), "native runtime should use Chordsmith lofi texture constants");
  assert.ok(nativeAudio.includes("chordsmith_step_seed(event, 43)"), "native runtime should use Chordsmith step seed for crackle probability");
  assertRustConst(nativeAudio, "CHORDSMITH_LOFI_TEXTURE_HISS_ATTACK_SECONDS", CHORDSMITH_LOFI_TEXTURE_LIVE.hissAttackSeconds);
  assertRustConst(nativeAudio, "CHORDSMITH_LOFI_TEXTURE_HISS_RELEASE_SECONDS", CHORDSMITH_LOFI_TEXTURE_LIVE.hissReleaseSeconds);
  assertRustConst(nativeAudio, "CHORDSMITH_LOFI_TEXTURE_HISS_GAIN", CHORDSMITH_LOFI_TEXTURE_LIVE.hissGain);
  assertRustConst(nativeAudio, "CHORDSMITH_LOFI_TEXTURE_CRACKLE_THRESHOLD", CHORDSMITH_LOFI_TEXTURE_LIVE.crackleThreshold);
  assertRustConst(nativeAudio, "CHORDSMITH_LOFI_TEXTURE_CRACKLE_GAIN", CHORDSMITH_LOFI_TEXTURE_LIVE.crackleGain);
  assertRustConst(nativeAudio, "CHORDSMITH_LOFI_TEXTURE_CRACKLE_DECAY_SECONDS", CHORDSMITH_LOFI_TEXTURE_LIVE.crackleDecaySeconds);
  assertRustConst(nativeAudio, "CHORDSMITH_LOFI_TEXTURE_CRACKLE_STOP_SECONDS", CHORDSMITH_LOFI_TEXTURE_LIVE.crackleStopSeconds);
});

test("Pocket DAW native sidechain curve stays aligned with shared Chordsmith pump", async () => {
  const [pocketDawSidechain, pocketDawNativeAudio] = await Promise.all([
    readFile(new URL("apps/pocket-daw/src/audio/sidechain.ts", repoRoot), "utf8"),
    readFile(surfaces.pocketDawNativeAudio, "utf8")
  ]);

  assert.ok(pocketDawSidechain.includes("CHORDSMITH_SIDECHAIN_ATTACK_SECONDS"), "Pocket DAW WebAudio sidechain should consume shared attack timing");
  assert.ok(pocketDawSidechain.includes("CHORDSMITH_SIDECHAIN_RELEASE_SECONDS"), "Pocket DAW WebAudio sidechain should consume shared release timing");
  assert.ok(pocketDawSidechain.includes("chordsmithSidechainDuckGain"), "Pocket DAW WebAudio sidechain should consume shared duck-depth math");
  assertRustConst(pocketDawNativeAudio, "CHORDSMITH_SIDECHAIN_ATTACK_SECONDS", CHORDSMITH_SIDECHAIN_ATTACK_SECONDS);
  assertRustConst(pocketDawNativeAudio, "CHORDSMITH_SIDECHAIN_RELEASE_SECONDS", CHORDSMITH_SIDECHAIN_RELEASE_SECONDS);
  assertRustConst(pocketDawNativeAudio, "CHORDSMITH_SIDECHAIN_DEPTH", CHORDSMITH_SIDECHAIN_DEPTH);
  assertRustConst(pocketDawNativeAudio, "CHORDSMITH_SIDECHAIN_FLOOR", CHORDSMITH_SIDECHAIN_FLOOR);
  assert.ok(pocketDawNativeAudio.includes("chordsmith_sidechain_gain_at(amount, t - trigger.time)"), "Pocket DAW native sidechain should use the Chordsmith gain curve per compiled trigger");
});

test("Pocket DJ imports lofi IDs from shared core before normalising decks", async () => {
  const pocketDj = await readFile(surfaces.pocketDj, "utf8");

  assert.ok(pocketDj.includes('coreArrayExport("LOFI_CHORD_INSTRUMENTS"'), "Pocket DJ should read lofi chord IDs from shared core when available");
  assert.ok(pocketDj.includes('coreArrayExport("LOFI_MELODY_INSTRUMENTS"'), "Pocket DJ should read lofi melody IDs from shared core when available");
  assert.ok(pocketDj.includes('coreArrayExport("LOFI_DRUM_KITS"'), "Pocket DJ should read lofi drum-kit IDs from shared core when available");
  assert.ok(pocketDj.includes('coreArrayExport("LOFI_BASS_TONES"'), "Pocket DJ should read lofi bass-tone IDs from shared core when available");
  assert.ok(pocketDj.includes('coreArrayExport("LOFI_STYLE_PRESET_IDS"'), "Pocket DJ should read lofi preset IDs from shared core when available");
  assert.match(pocketDj, /async function handleImport\(\)[\s\S]*?await loadPocketAudioCoreModule\(\)\.catch\(\(\) => null\);[\s\S]*?sanitizePocketChordsmithProject/, "manual imports should give core a chance to load before sanitizing");
  assert.match(pocketDj, /async function consumeIncomingPocketDjHandoff\(\)[\s\S]*?await loadPocketAudioCoreModule\(\)\.catch\(\(\) => null\);[\s\S]*?sanitizePocketChordsmithProject/, "handoffs should give core a chance to load before sanitizing");
});

test("Chordsmith composer consults shared core sound IDs before sanitizing projects", async () => {
  const chordsmith = await readFile(surfaces.chordsmith, "utf8");

  assert.ok(chordsmith.includes('coreArrayExport("POCKET_CHORD_INSTRUMENTS"'), "Chordsmith should read chord instrument IDs from shared core when available");
  assert.ok(chordsmith.includes('coreArrayExport("POCKET_MELODY_INSTRUMENTS"'), "Chordsmith should read melody instrument IDs from shared core when available");
  assert.ok(chordsmith.includes('coreArrayExport("LOFI_DRUM_KITS"'), "Chordsmith should read lofi drum-kit IDs from shared core when available");
  assert.ok(chordsmith.includes('coreArrayExport("LOFI_BASS_TONES"'), "Chordsmith should read lofi bass-tone IDs from shared core when available");
  assert.ok(chordsmith.includes('coreArrayExport("LOFI_DRUM_GROOVE_PRESETS"'), "Chordsmith should read lofi drum groove IDs from shared core when available");
  assert.ok(chordsmith.includes('coreArrayExport("POCKET_GUITAR_TONES"'), "Chordsmith should read guitar tone IDs from shared core when available");
  assert.match(chordsmith, /function sanitizeProjectData\(raw\)[\s\S]*?safeChoice\(raw\.drumKit,\s*pocketDrumKitIds\(\),\s*"classic"\)[\s\S]*?safeChoice\(raw\.chordInstrument,\s*chordInstrumentIds\(\),\s*"pocket"\)/, "Chordsmith import sanitizer should validate sound IDs through shared-core helpers");
  assert.match(chordsmith, /function ensureMelodyInstrumentsLength\(list, trackCount\)[\s\S]*?const allowed = melodyInstrumentIds\(\);[\s\S]*?allowed\.includes\(v\)/, "Chordsmith melody track sanitizer should validate instrument IDs through shared-core helpers");
});

test("Chordsmith app exposes a browser parity trace hook for current live export events", async () => {
  const chordsmith = await readFile(surfaces.chordsmith, "utf8");

  assert.ok(chordsmith.includes("function buildChordsmithParityTrace("), "Chordsmith should expose a current-state parity trace builder");
  assert.ok(chordsmith.includes("function buildChordsmithParityTraceFromProject("), "Chordsmith should expose a project-input parity trace builder for browser harnesses");
  assert.ok(chordsmith.includes("window.PocketChordsmithParityTrace"), "Chordsmith should attach the parity trace API to window");
  assert.ok(chordsmith.includes("buildSequenceEvents().map(normalizeChordsmithTraceEvent)"), "Chordsmith trace should use the same event path as Chordsmith WAV/MIDI export");
  assert.ok(chordsmith.includes("importProject(rawProject);"), "Chordsmith project-input trace should use the app import normalizer before tracing");
  assert.ok(chordsmith.includes("importProject(snapshot);"), "Chordsmith project-input trace should restore the user's current project after tracing");
});

test("Chordsmith browser trace comparison stays available as a package command", async () => {
  const [packageJson, comparisonScript, chordsmith] = await Promise.all([
    readFile(surfaces.pocketAudioCorePackage, "utf8"),
    readFile(new URL("packages/pocket-audio-core/scripts/compare-chordsmith-browser-trace.mjs", repoRoot), "utf8"),
    readFile(surfaces.chordsmith, "utf8")
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.equal(
    scripts["compare:chordsmith-browser-trace"],
    "node scripts/compare-chordsmith-browser-trace.mjs",
    "Pocket Audio Core should expose the browser-vs-core Chordsmith trace comparison"
  );
  assert.ok(comparisonScript.includes("PocketChordsmithParityTrace.fromProject"), "comparison script should drive the real browser parity hook");
  assert.ok(comparisonScript.includes("normalisePocketChordsmithProject(browserTrace.project)"), "comparison script should verify core against the Chordsmith-normalized export");
  assert.ok(chordsmith.includes("function inferProjectUiMode("), "Chordsmith should infer advanced mode for legacy/imported high-resolution projects");
});

test("Chordsmith playback FX defaults stay aligned across core, DJ and DAW import", async () => {
  const [chordsmith, pocketDj, pocketDawSanitizer, pocketDawProject, pocketDawDemo] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(surfaces.pocketDawProject, "utf8"),
    readFile(surfaces.pocketDawDemo, "utf8")
  ]);

  assert.match(chordsmith, new RegExp(`fxDelay\\s*:\\s*${numberPattern(DEFAULT_FX.delay)}`), "Chordsmith fxDelay default should match core");
  assert.match(chordsmith, new RegExp(`fxChorus\\s*:\\s*${numberPattern(DEFAULT_FX.chorus)}`), "Chordsmith fxChorus default should match core");
  assert.match(chordsmith, new RegExp(`fxFlanger\\s*:\\s*${numberPattern(DEFAULT_FX.flanger)}`), "Chordsmith fxFlanger default should match core");
  assert.match(chordsmith, new RegExp(`fxReverb\\s*:\\s*${numberPattern(DEFAULT_FX.reverb)}`), "Chordsmith fxReverb default should match core");
  assert.match(chordsmith, new RegExp(`fxMix\\s*:\\s*${numberPattern(DEFAULT_FX.mix)}`), "Chordsmith fxMix default should match core");
  assert.match(chordsmith, new RegExp(`sidechainAmount\\s*:\\s*${numberPattern(DEFAULT_FX.sidechain.amount)}`), "Chordsmith pump amount default should match core");

  assert.match(pocketDj, new RegExp(`echo\\s*:\\s*${numberPattern(DEFAULT_FX.echo)}`), "Pocket DJ echo default should match core");
  assert.match(pocketDj, new RegExp(`reverb\\s*:\\s*${numberPattern(DEFAULT_FX.reverb)}`), "Pocket DJ reverb default should match core");
  assert.ok(pocketDawSanitizer.includes("DEFAULT_FX"), "Pocket DAW sanitizer should consume shared Chordsmith FX defaults");
  ["delay", "chorus", "flanger", "reverb", "mix"].forEach((key) => {
    assert.ok(pocketDawSanitizer.includes(`DEFAULT_FX.${key}`), `Pocket DAW sanitizer should use DEFAULT_FX.${key}`);
  });
  assert.ok(pocketDawSanitizer.includes("DEFAULT_FX.sidechain.amount"), "Pocket DAW sanitizer should use shared pump amount default");
  assert.ok(pocketDawProject.includes("DEFAULT_FX.mix"), "Pocket DAW starter source should consume shared FX mix default");
  assert.ok(pocketDawDemo.includes("DEFAULT_FX.mix"), "Pocket DAW demo template should consume shared FX mix default");
  assert.ok(!pocketDawProject.includes("fxMix: 0.65"), "Pocket DAW starter source should not keep a local FX mix default");
  assert.ok(!pocketDawDemo.includes("fxMix: 0.65"), "Pocket DAW demo template should not keep a local FX mix default");
});

test("Chordsmith default stem mix stays aligned across core, DJ and DAW", async () => {
  const [chordsmith, pocketDj, pocketDawSanitizer, pocketDawTracks, pocketDawProject, pocketDawUi, coreNormalizer, coreTimeline] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(surfaces.pocketDawTracks, "utf8"),
    readFile(surfaces.pocketDawProject, "utf8"),
    readFile(surfaces.pocketDawUi, "utf8"),
    readFile(surfaces.coreNormalizer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8")
  ]);

  assert.ok(chordsmith.includes(`value="${numberLiteral(DEFAULT_MASTER_VOLUME)}"`), "Chordsmith master slider default should match core");
  assert.ok(chordsmith.includes(`value="${numberLiteral(DEFAULT_STEM_MIX.chords.volume)}"`), "Chordsmith chord slider default should match core");
  assert.ok(chordsmith.includes(`value="${numberLiteral(DEFAULT_STEM_MIX.drums.volume)}"`), "Chordsmith beat slider default should match core");
  assert.ok(chordsmith.includes(`value="${numberLiteral(DEFAULT_STEM_MIX.melody.volume)}"`), "Chordsmith lead slider default should match core");
  assert.ok(chordsmith.includes(`guitarVolume:${numberLiteral(DEFAULT_STEM_MIX.guitar.volume)}`), "Chordsmith guitar default should match core");
  assert.ok(pocketDj.includes(`value="${numberLiteral(DEFAULT_MASTER_VOLUME)}"`), "Pocket DJ master slider default should match core");
  assert.ok(!pocketDj.includes('value="0.88"'), "Pocket DJ master slider should not keep its older louder default");
  assert.ok(pocketDj.includes(`DEFAULT_STEM_VOLUMES = {drums:${numberLiteral(DEFAULT_STEM_MIX.drums.volume)},bass:${numberLiteral(DEFAULT_STEM_MIX.bass.volume)},chords:${numberLiteral(DEFAULT_STEM_MIX.chords.volume)},melody:${numberLiteral(DEFAULT_STEM_MIX.melody.volume)},guitar:${numberLiteral(DEFAULT_STEM_MIX.guitar.volume)}}`), "Pocket DJ stem defaults should match core");
  assert.ok(pocketDawSanitizer.includes("DEFAULT_MASTER_VOLUME"), "Pocket DAW sanitizer should consume shared master volume default");
  assert.ok(pocketDawSanitizer.includes("DEFAULT_STEM_MIX.guitar.volume"), "Pocket DAW sanitizer should consume shared guitar volume default");
  assert.ok(pocketDawTracks.includes("DEFAULT_STEM_MIX.drums.volume"), "Pocket DAW default tracks should consume shared generated stem defaults");
  assert.ok(pocketDawTracks.includes("DEFAULT_MASTER_VOLUME"), "Pocket DAW master track should consume shared master default");
  assert.ok(pocketDawProject.includes("DEFAULT_STEM_MIX.guitar.volume"), "Pocket DAW starter Chordsmith source should consume shared guitar default");
  assert.ok(pocketDawUi.includes("DEFAULT_STEM_MIX.guitar.volume"), "Pocket DAW editor UI should consume shared guitar volume default");
  assert.ok(coreNormalizer.includes("DEFAULT_STEM_MIX.guitar.volume"), "core normalizer should consume shared guitar stem default");
  assert.ok(coreTimeline.includes("DEFAULT_STEM_MIX.chords.volume"), "core timeline chord fallback should consume shared chord stem default");
  assert.ok(coreTimeline.includes("DEFAULT_STEM_MIX.melody.volume"), "core timeline melody fallback should consume shared melody stem default");
  assert.ok(!pocketDawTracks.includes("volume: 0.92"), "Pocket DAW generated drums should not keep a louder local default");
  assert.ok(!pocketDawProject.includes("masterVolume: 0.9"), "Pocket DAW starter source should not keep a louder local master default");
  assert.ok(!pocketDawUi.includes("pcs.guitarVolume, 0.66"), "Pocket DAW editor UI should not keep a local guitar volume fallback");
  assert.ok(!coreNormalizer.includes("asNumber(project.guitarVolume, 0.66)"), "core normalizer should not keep a local guitar default");
  assert.ok(!coreTimeline.includes("?? 0.72"), "core timeline should not keep a local chord volume fallback");
  assert.ok(!coreTimeline.includes("?? 0.65"), "core timeline should not keep a local melody volume fallback");
});

test("Chordsmith section active rules stay aligned between core and DAW import", async () => {
  const [pocketDawSanitizer, coreNormalizer] = await Promise.all([
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(surfaces.coreNormalizer, "utf8")
  ]);

  assert.ok(pocketDawSanitizer.includes("sequenceHas"), "Pocket DAW should mark explicitly sequenced sections active");
  assert.ok(coreNormalizer.includes("requestedSequenceIds"), "core normalizer should mark explicitly sequenced sections active");
  assert.ok(pocketDawSanitizer.includes("bassNotes.some((v) => v !== null)"), "Pocket DAW should mark manual bass sections active");
  assert.ok(coreNormalizer.includes("bassNotes.some((note) => note !== null)"), "core normalizer should mark manual bass sections active");
  assert.ok(pocketDawSanitizer.includes("progressionDiffers(progressionRaw)"), "Pocket DAW should mark changed chord progression sections active");
  assert.ok(coreNormalizer.includes("progressionDiffers(progressionRaw)"), "core normalizer should mark changed chord progression sections active");
  assert.ok(pocketDawSanitizer.includes("project.guitarEnabled && guitarHasPattern(guitarPattern)"), "Pocket DAW should only count guitar patterns when guitar is enabled");
  assert.ok(coreNormalizer.includes("Boolean(project.guitarEnabled) && guitarPattern.some"), "core normalizer should only count guitar patterns when guitar is enabled");
}
);

test("Chordsmith offline stem export staging stays shared with core", async () => {
  const [chordsmith, coreOfflineRenderer, pocketDawOfflineRender] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/engine/offline-renderer.js", repoRoot), "utf8"),
    readFile(surfaces.pocketDawOfflineRender, "utf8")
  ]);

  assert.ok(chordsmith.includes(`chordG.gain.value = parseFloat(els.chordVol.value) * ${numberLiteral(CHORDSMITH_OFFLINE_STEM_GAIN.chords)}`), "Chordsmith chord WAV gain should match shared offline staging");
  assert.ok(chordsmith.includes(`beatG.gain.value = parseFloat(els.beatVol.value) * ${numberLiteral(CHORDSMITH_OFFLINE_STEM_GAIN.drums)}`), "Chordsmith beat WAV gain should match shared offline staging");
  assert.ok(chordsmith.includes(`leadG.gain.value = (els.leadVol ? parseFloat(els.leadVol.value) : ${numberLiteral(DEFAULT_STEM_MIX.melody.volume)}) * ${numberLiteral(CHORDSMITH_OFFLINE_STEM_GAIN.melody)}`), "Chordsmith lead WAV gain should match shared offline staging");
  assert.ok(chordsmith.includes(`guitarG.gain.value = (state.guitarVolume ?? ${numberLiteral(DEFAULT_STEM_MIX.guitar.volume)}) * ${numberLiteral(CHORDSMITH_OFFLINE_STEM_GAIN.guitar)}`), "Chordsmith guitar WAV gain should match shared offline staging");
  assert.equal(CHORDSMITH_OFFLINE_RENDER_HEADROOM, 0.34);
  assert.ok(coreOfflineRenderer.includes("chordsmithOfflineStemRenderGain(stem)"), "Core offline renderer should derive synthetic stem scale from shared Chordsmith export staging");
  assert.ok(!coreOfflineRenderer.includes("if (stem === \"chords\") return 0.08"), "Core offline renderer should not keep the old local chord stem scale");
  assert.ok(pocketDawOfflineRender.includes("CHORDSMITH_OFFLINE_STEM_GAIN"), "Pocket DAW WAV export should consume shared Chordsmith offline stem staging");
  assert.ok(pocketDawOfflineRender.includes("chordsmithOfflineTrackExportGain(project, track, audibleVolume)"), "Pocket DAW WAV export should apply Chordsmith staging at generated track output gain");
});

test("Chordsmith FX graph constants stay shared for DAW imports and DJ live FX", async () => {
  const [chordsmith, pocketDawImport, pocketDj] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDawImport, "utf8"),
    readFile(surfaces.pocketDj, "utf8")
  ]);

  assert.ok(chordsmith.includes(`Math.max(${numberLiteral(CHORDSMITH_FX_GRAPH.dryGainFloor)}, 1.0 - (fxMixAmt * ${numberLiteral(CHORDSMITH_FX_GRAPH.dryGainMixDepth)})`), "Chordsmith dry gain floor should match shared FX graph");
  assert.ok(chordsmith.includes(`fxMixAmt * ${numberLiteral(CHORDSMITH_FX_GRAPH.wetMasterGain)}`), "Chordsmith wet master gain should match shared FX graph");
  assert.ok(chordsmith.includes(`delayAmt * ${numberLiteral(CHORDSMITH_FX_GRAPH.delay.timeRange)}`), "Chordsmith delay time range should match shared FX graph");
  assert.ok(chordsmith.includes(`flangerAmt * ${numberLiteral(CHORDSMITH_FX_GRAPH.flanger.feedbackRange)}`), "Chordsmith flanger feedback range should match shared FX graph");
  assert.ok(pocketDawImport.includes("chordsmithDawSynthFxSlots"), "Pocket DAW import should use shared Chordsmith FX slot mapper");
  assert.ok(!pocketDawImport.includes("0.1 + project.fxDelay * 0.42"), "Pocket DAW import should not keep local delay mapping formulas");
  assert.ok(pocketDj.includes("pocketAudioCoreModule.chordsmithFxParameters"), "Pocket DJ should consume the shared Chordsmith FX mapper when core is available");
  assert.ok(pocketDj.includes("function fallbackChordsmithFxParameters"), "Pocket DJ should keep a portable fallback mapper");
  assert.ok(pocketDj.includes("const mapped = chordsmithFxParams"), "Pocket DJ live FX should apply mapped Chordsmith parameters");
  assert.ok(pocketDj.includes("fxWetMasterGain.gain.setTargetAtTime(mapped.wetMasterGain"), "Pocket DJ wet master should use mapped Chordsmith gain");
  assert.ok(pocketDj.includes("delayNode.delayTime.setTargetAtTime(mapped.delay.time"), "Pocket DJ delay should use mapped Chordsmith timing");
  assert.ok(pocketDj.includes("flangerFeedbackGain.gain.setTargetAtTime(mapped.flanger.feedback"), "Pocket DJ flanger feedback should use mapped Chordsmith feedback");
});

test("Godot game-pack manifests expose the shared Chordsmith FX profile", async () => {
  const godotKitExport = await readFile(surfaces.godotKitExport, "utf8");

  assert.ok(godotKitExport.includes("chordsmithFxParameters"), "Godot kit export should derive FX profile from the shared Chordsmith FX mapper");
  assert.ok(godotKitExport.includes("fx: createFxManifest(project)"), "Godot kit manifest should expose normalized Chordsmith FX data");
  assert.ok(godotKitExport.includes("sidechain: cloneJson(fx.sidechain"), "Godot kit manifest should expose Chordsmith pump settings");
});

test("Godot and DAW game-pack exports share the core pack path contract", async () => {
  const [coreGamePackPaths, godotKitExport, pocketDawExportJobs, godotSharedSoundConstants, godotGamePackManifest, godotBuildTools] = await Promise.all([
    readFile(surfaces.coreGamePackPaths, "utf8"),
    readFile(surfaces.godotKitExport, "utf8"),
    readFile(surfaces.pocketDawExportJobs, "utf8"),
    readFile(surfaces.godotSharedSoundConstants, "utf8"),
    readFile(surfaces.godotGamePackManifest, "utf8"),
    readFile(surfaces.godotBuildTools, "utf8")
  ]);

  assert.deepEqual(GAME_PACK_FOLDERS, {
    full: "audio/full/",
    stems: "audio/stems/",
    sections: "audio/sections/",
    samples: "audio/samples/",
    manifests: "manifests/",
    source: "source/"
  });
  assert.equal(gamePackManifestPath("godot-adaptive-pack"), "manifests/godot-adaptive-manifest.json");
  assert.equal(gamePackManifestPath("web-game-pack"), "manifests/web-game-manifest.json");
  assert.ok(coreGamePackPaths.includes("GAME_PACK_FOLDERS"), "shared core should own game-pack folder constants");
  assert.ok(godotKitExport.includes("from \"./game-pack-paths.js\""), "Godot kit export should consume shared pack paths");
  assert.ok(godotKitExport.includes("gamePackPath(\"sections\""), "Godot kit section loops should use shared pack paths");
  assert.ok(godotKitExport.includes("GAME_PACK_FOLDERS.samples"), "Godot kit samples should publish the shared samples folder");
  assert.ok(pocketDawExportJobs.includes("packages/pocket-audio-core/src/export/game-pack-paths.js"), "Pocket DAW export jobs should consume shared pack paths");
  assert.ok(pocketDawExportJobs.includes("gamePackManifestPath(kind)"), "Pocket DAW manifest file names should use shared pack paths");
  assert.ok(pocketDawExportJobs.includes("gamePackSectionLoopPath(project.project.title, name)"), "Pocket DAW section loops should use shared pack paths");
  assert.ok(!pocketDawExportJobs.includes("manifests/godot-adaptive-manifest.json\" : \"manifests/web-game-manifest.json"), "Pocket DAW should not keep local game manifest path branching");
  assert.ok(godotSharedSoundConstants.includes('const GAME_PACK_FOLDERS := {"full": "audio/full/"'), "Godot generated constants should expose shared pack folders");
  assert.ok(godotSharedSoundConstants.includes('const GODOT_GAME_PACK_MANIFEST_PATH := "manifests/godot-adaptive-manifest.json"'), "Godot generated constants should expose the shared Godot manifest path");
  assert.ok(godotGamePackManifest.includes("SharedSoundConstants.GAME_PACK_FOLDERS"), "Godot manifest helper should consume generated folder constants");
  assert.ok(godotGamePackManifest.includes("SharedSoundConstants.GAME_PACK_MANIFEST_FILES"), "Godot manifest helper should consume generated manifest file constants");
  assert.ok(godotGamePackManifest.includes("create_playback_profile_from_manifest"), "Godot manifest helper should build addon playback profiles from core/DAW manifests");
  assert.ok(godotGamePackManifest.includes("section_stem_sets_from_manifest"), "Godot manifest helper should map LOOP_KIT section assets into playback profile stem sets");
  assert.ok(godotGamePackManifest.includes("resolve_asset_path"), "Godot manifest helper should resolve pack-relative asset paths under a root");
  assert.ok(godotBuildTools.includes("create_playback_profile_from_game_pack_manifest"), "Godot build tools should expose game-pack manifest profile creation");
});

test("Chordsmith drum groove presets stay aligned with shared core and DAW consumes core", async () => {
  const [chordsmith, pocketDawDrumPresets] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDawDrumPresets, "utf8")
  ]);
  const chordsmithDrums = extractChordsmithDrumPresets(chordsmith);

  assert.deepEqual(chordsmithDrums.presets, DRUM_PRESETS);
  assert.deepEqual(chordsmithDrums.patternDefs, DRUM_PATTERN_DEFS);
  assert.ok(
    pocketDawDrumPresets.includes("packages/pocket-audio-core/src/patterns/drum-presets.js"),
    "Pocket DAW should consume the shared drum preset module instead of keeping its own groove table"
  );
});

test("Chordsmith live drum pads stay aligned with shared drum lane definitions", async () => {
  const [chordsmith, pocketDawDrumLanes, pocketDawUi, pocketDawOfflineRender, pocketDawAudioEngine] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(new URL("apps/pocket-daw/src/daw/drumLanes.ts", repoRoot), "utf8"),
    readFile(surfaces.pocketDawUi, "utf8"),
    readFile(surfaces.pocketDawOfflineRender, "utf8"),
    readFile(new URL("apps/pocket-daw/src/audio/audioEngine.ts", repoRoot), "utf8")
  ]);
  const pads = extractChordsmithDrumPads(chordsmith);
  const expectedPads = POCKET_DRUM_LANES.map((lane) => ({
    id: lane.chordsmithPad,
    name: lane.chordsmithPadName,
    meta: lane.chordsmithPadMeta,
    key: lane.chordsmithPadKey,
    cls: lane.chordsmithPadClass,
    recordTrack: lane.chordsmithRecordTrack,
    recordLevel: lane.chordsmithRecordLevel
  }));

  assert.deepEqual(pads, expectedPads);
  assert.ok(pocketDawDrumLanes.includes("POCKET_DRUM_LANES"), "Pocket DAW drum lanes should consume the shared live drum lane registry");
  assert.ok(pocketDawUi.includes("DRUM_LANE_DEFS.map"), "Pocket DAW UI should expose every shared drum lane in the mixer");
  assert.ok(pocketDawOfflineRender.includes("DRUM_LANE_DEFS.forEach"), "Pocket DAW offline export should create an FX input for every shared drum lane");
  assert.ok(pocketDawAudioEngine.includes("DRUM_LANE_DEFS.forEach"), "Pocket DAW live playback should create an FX input for every shared drum lane");
});

test("Chordsmith sequenced drum lanes stay aligned across DAW, DJ, Godot and core", async () => {
  const [chordsmith, pocketDj, pocketDawRenderer, coreTimeline, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);
  const compactSequenced = compactJsStringArray(CHORDSMITH_SEQUENCED_DRUM_LANE_IDS);
  const gdSequenced = gdStringArray(CHORDSMITH_SEQUENCED_DRUM_LANE_IDS);

  assert.deepEqual(CHORDSMITH_SEQUENCED_DRUM_LANE_IDS, ["kick", "snare", "hat"]);
  assert.ok(chordsmith.includes(`${compactSequenced}.forEach((trackId, idx) => {`), "Chordsmith playback should sequence the shared kick/snare/hat lanes");
  assert.ok(chordsmith.includes(`${compactSequenced}.forEach(track => { if(state.grid[track]) state.grid[track].fill(0); });`), "Chordsmith clear-beat action should target the shared sequenced drum lanes");
  assert.ok(pocketDj.includes(`${compactSequenced}.forEach(track => {`), "Pocket DJ should sequence the same kick/snare/hat lanes");
  assert.ok(pocketDawRenderer.includes("CHORDSMITH_SEQUENCED_DRUM_LANE_IDS"), "Pocket DAW renderer should consume the shared sequenced drum lane IDs");
  assert.ok(coreTimeline.includes("CHORDSMITH_SEQUENCED_DRUM_LANE_IDS"), "core timeline should consume the shared sequenced drum lane IDs");
  assert.ok(godotCompiler.includes(`const DRUM_TRACKS := ${gdSequenced}`), "Godot compiler should sequence the same kick/snare/hat lanes");
  assert.ok(godotCompiler.includes('const GRID_TRACKS := ["kick", "snare", "hat", "bass"]'), "Godot bass grid should stay separate from sequenced drum lanes");
});

test("Chordsmith live drum voice constants stay aligned across DAW and native", async () => {
  const [chordsmith, pocketDawInstruments, pocketDawNativeAudio] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDawInstruments, "utf8"),
    readFile(surfaces.pocketDawNativeAudio, "utf8")
  ]);

  assert.ok(chordsmith.includes(`else if(id === "clap") playClap(t, ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.clap.peak)} * v);`), "Chordsmith clap pad peak should match shared live voice constants");
  assert.ok(chordsmith.includes(`else if(id === "tomlow") playTom(${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.tomlow.frequency)}, t, ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.tomlow.peak)} * v);`), "Chordsmith low tom pad should match shared live voice constants");
  assert.ok(chordsmith.includes(`else if(id === "tommid") playTom(${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.tommid.frequency)}, t, ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.tommid.peak)} * v);`), "Chordsmith mid tom pad should match shared live voice constants");
  assert.ok(chordsmith.includes(`else if(id === "tomhi") playTom(${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.tomhi.frequency)}, t, ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.tomhi.peak)} * v);`), "Chordsmith high tom pad should match shared live voice constants");
  assert.ok(chordsmith.includes(`else if(id === "crash") playCymbal(t, ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.crash.peak)} * v, false);`), "Chordsmith crash pad should match shared live voice constants");
  assert.ok(chordsmith.includes(`else if(id === "ride") playCymbal(t, ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.ride.peak)} * v, true);`), "Chordsmith ride pad should match shared live voice constants");
  assert.ok(chordsmith.includes(`const dur = ride ? ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.ride.durationSeconds)} : ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.crash.durationSeconds)};`), "Chordsmith cymbal durations should match shared live voice constants");
  assert.ok(chordsmith.includes(`hp.frequency.setValueAtTime(ride ? ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.ride.highpass)} : ${numberLiteral(CHORDSMITH_LIVE_DRUM_VOICES.crash.highpass)}, t)`), "Chordsmith cymbal highpass should match shared live voice constants");

  assert.ok(pocketDawInstruments.includes("CHORDSMITH_LIVE_DRUM_VOICES"), "Pocket DAW WebAudio should consume shared live drum voice constants");
  assert.ok(!pocketDawInstruments.includes('if (event.kind === "clap") {\n    snare('), "Pocket DAW clap should not add an extra snare layer");
  assert.ok(!pocketDawInstruments.includes("lane === \"tommid\" ? 154 : 205"), "Pocket DAW tom constants should not keep older local frequencies");
  assert.ok(!pocketDawInstruments.includes("lane === \"crash\" ? 0.78 : 0.32"), "Pocket DAW cymbal durations should not keep older local values");

  assert.ok(pocketDawNativeAudio.includes('"tomlow" => 118.0'), "Pocket DAW native low tom should match Chordsmith frequency");
  assert.ok(pocketDawNativeAudio.includes('"tommid" => 158.0'), "Pocket DAW native mid tom should match Chordsmith frequency");
  assert.ok(pocketDawNativeAudio.includes("_ => 218.0"), "Pocket DAW native high tom should match Chordsmith frequency");
  assert.ok(pocketDawNativeAudio.includes("base * (0.58_f64).powf(sweep)"), "Pocket DAW native tom sweep should match Chordsmith ratio");
  assert.ok(pocketDawNativeAudio.includes('if event.kind == "crash" { 0.9 } else { 0.42 }'), "Pocket DAW native cymbal durations should match Chordsmith");
});

test("Pocket DAW built-in FX defaults come from shared core", async () => {
  const [pocketDawFx, pocketDawUi, pocketDawSanitizer] = await Promise.all([
    readFile(surfaces.pocketDawFx, "utf8"),
    readFile(surfaces.pocketDawUi, "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8")
  ]);

  assert.ok(
    pocketDawFx.includes("packages/pocket-audio-core/src/fx/built-in-fx.js"),
    "Pocket DAW should consume shared built-in FX defaults"
  );
  assert.ok(pocketDawFx.includes("BUILT_IN_FX = POCKET_BUILT_IN_FX"), "Pocket DAW should expose the shared FX catalog through its typed facade");
  assert.ok(pocketDawFx.includes("pocketProEqPresetParameters"), "Pocket DAW should apply shared Pocket Pro EQ preset parameters");
  assert.ok(pocketDawUi.includes("POCKET_PRO_EQ_PRESETS"), "Pocket DAW UI should render shared Pocket Pro EQ presets");
  assert.ok(pocketDawSanitizer.includes("humanizeOn"), "Pocket DAW sanitizer should preserve Chordsmith performance feel flags");
  assert.ok(POCKET_BUILT_IN_FX_TYPES.includes("parametric-eq"), "shared FX catalog should include Pocket Pro EQ");
});

test("Pocket DAW generated native sound recipes stay in sync with shared core", async () => {
  execFileSync(
    process.execPath,
    [fileURLToPath(surfaces.pocketDawGenerateNativeSoundRecipes), "--check"],
    { cwd: fileURLToPath(new URL("apps/pocket-daw", repoRoot)), stdio: "pipe" }
  );

  const [pocketDawNativeAudio, pocketDawGeneratedSoundRecipes, generator] = await Promise.all([
    readFile(surfaces.pocketDawNativeAudio, "utf8"),
    readFile(surfaces.pocketDawGeneratedSoundRecipes, "utf8"),
    readFile(surfaces.pocketDawGenerateNativeSoundRecipes, "utf8")
  ]);

  assert.ok(generator.includes("POCKET_PRO_EQ_BANDS"), "Pocket DAW native recipe generator should consume shared Pocket Pro EQ bands");
  assert.ok(pocketDawNativeAudio.includes('include!("generated_sound_recipes.rs")'), "Pocket DAW native playback should include generated shared sound recipes");
  assert.ok(!pocketDawNativeAudio.includes("fn parametric_eq_filters("), "Pocket DAW native playback should not keep a handwritten Pro EQ band table");
  assert.ok(pocketDawGeneratedSoundRecipes.includes("fn parametric_eq_filters"), "Pocket DAW generated native recipes should expose Pocket Pro EQ filters");
  POCKET_PRO_EQ_BANDS.forEach((band) => {
    assert.ok(pocketDawGeneratedSoundRecipes.includes(`"${band.enabledParam}"`), `generated native Pro EQ should include ${band.enabledParam}`);
    assert.ok(pocketDawGeneratedSoundRecipes.includes(`"${band.frequencyParam}"`), `generated native Pro EQ should include ${band.frequencyParam}`);
    assert.ok(pocketDawGeneratedSoundRecipes.includes(`param(params, "${band.frequencyParam}", ${rustNumberLiteral(band.defaultFrequency)}).clamp(${rustNumberLiteral(band.minFrequency)}, ${rustNumberLiteral(band.maxFrequency)})`), `generated native Pro EQ should mirror ${band.id} frequency defaults/clamps`);
    if (band.gainParam) {
      assert.ok(pocketDawGeneratedSoundRecipes.includes(`"${band.gainParam}"`), `generated native Pro EQ should include ${band.gainParam}`);
      assert.ok(pocketDawGeneratedSoundRecipes.includes(`param(params, "${band.gainParam}", ${rustNumberLiteral(band.defaultGain)}).clamp(${rustNumberLiteral(band.minGain)}, ${rustNumberLiteral(band.maxGain)})`), `generated native Pro EQ should mirror ${band.id} gain defaults/clamps`);
    }
    if (band.qParam) {
      assert.ok(pocketDawGeneratedSoundRecipes.includes(`"${band.qParam}"`), `generated native Pro EQ should include ${band.qParam}`);
      assert.ok(pocketDawGeneratedSoundRecipes.includes(`param(params, "${band.qParam}", ${rustNumberLiteral(band.defaultQ)}).clamp(${rustNumberLiteral(band.minQ)}, ${rustNumberLiteral(band.maxQ)})`), `generated native Pro EQ should mirror ${band.id} Q defaults/clamps`);
    }
  });
});

test("Godot generated sound metadata stays in sync with shared core", () => {
  execFileSync(
    process.execPath,
    [fileURLToPath(surfaces.godotGenerateSoundMetadata), "--check"],
    { cwd: fileURLToPath(new URL("packages/pocket-audio-core", repoRoot)), stdio: "pipe" }
  );
});

test("Chordsmith performance humanise constants stay aligned across apps", async () => {
  const [chordsmith, pocketDj, pocketDawRenderer, coreTimeline] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8")
  ]);

  assert.ok(chordsmith.includes(`* ${CHORDSMITH_HUMANIZE_TIMING_SECONDS}`), "Chordsmith timing humanise should match shared core");
  assert.ok(chordsmith.includes("0.88 + featureSeed(step, seed + 99) * 0.20"), "Chordsmith peak humanise should match shared core");
  assert.ok(pocketDj.includes(`* ${CHORDSMITH_HUMANIZE_TIMING_SECONDS}`), "Pocket DJ timing humanise should match shared core");
  assert.ok(pocketDj.includes("0.88 + featureSeed(step, seed + 99) * 0.20"), "Pocket DJ peak humanise should match shared core");
  assert.ok(pocketDawRenderer.includes("chordsmithHumanizeOffset"), "Pocket DAW renderer should consume shared timing humanise");
  assert.ok(pocketDawRenderer.includes("chordsmithHumanizePeak"), "Pocket DAW renderer should consume shared peak humanise");
  assert.ok(coreTimeline.includes("chordsmithHumanizeOffset"), "core timeline should consume shared timing humanise");
  assert.ok(coreTimeline.includes("chordsmithHumanizePeak"), "core timeline should consume shared peak humanise");
});

test("Chordsmith swing timing stays aligned across DJ, DAW, Godot and core", async () => {
  const [chordsmith, pocketDj, pocketDawRenderer, coreTimeline, musicTimeline, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/music/timeline.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);

  assert.ok(chordsmith.includes("resolution !== 3"), "Chordsmith should keep triplet steps evenly spaced instead of swinging them");
  assert.ok(pocketDj.includes("resolution() !== 3"), "Pocket DJ should mirror Chordsmith triplet swing exclusion");
  assert.ok(godotCompiler.includes("resolution == 3"), "Godot compiler should mirror Chordsmith triplet swing exclusion");
  assert.ok(musicTimeline.includes("export function stepDurationSeconds"), "shared core should expose Chordsmith step-duration timing");
  assert.ok(musicTimeline.includes("export function spanDurationSeconds"), "shared core should expose Chordsmith span timing");
  assert.ok(musicTimeline.includes("export function tripletTimesForSpan"), "shared core should expose Chordsmith triplet timing");
  assert.ok(coreTimeline.includes("spanDurationSeconds"), "core timeline should consume shared span timing");
  assert.ok(coreTimeline.includes("tripletTimesForSpan"), "core timeline should consume shared triplet timing");
  assert.ok(pocketDawRenderer.includes("buildStepTimeline"), "Pocket DAW renderer should consume shared step timing");
  assert.ok(pocketDawRenderer.includes("spanDurationSeconds"), "Pocket DAW renderer should consume shared span timing");
  assert.ok(pocketDawRenderer.includes("tripletTimesForSpan"), "Pocket DAW renderer should consume shared triplet timing");
  assert.ok(!pocketDawRenderer.includes("const base = secondsPerBeat / resolution"), "Pocket DAW renderer should not keep a local swing timing copy");
});

test("Chordsmith pitch mapping stays aligned across DAW, DJ, Godot and core", async () => {
  const [chordsmith, pocketDj, pocketDawRenderer, coreTimeline, pitchHelper, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/music/pitches.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);

  ["[0,2,4,5,7,9,11]", "[0,2,3,5,7,8,10]"].forEach((scale) => {
    assert.ok(chordsmith.includes(scale), `Chordsmith should keep scale table ${scale}`);
    assert.ok(pocketDj.includes(scale), `Pocket DJ should keep scale table ${scale}`);
    assert.ok(godotCompiler.includes(scale.replaceAll(",", ", ")), `Godot compiler should keep scale table ${scale}`);
  });
  assert.ok(chordsmith.includes('["maj","min","min","maj","maj","min","dim"]'), "Chordsmith major chord quality table should stay aligned");
  assert.ok(chordsmith.includes('["min","dim","maj","min","min","maj","maj"]'), "Chordsmith minor chord quality table should stay aligned");
  assert.ok(pocketDj.includes('["maj","min","min","maj","maj","min","dim"]'), "Pocket DJ major chord quality table should stay aligned");
  assert.ok(pocketDj.includes('["min","dim","maj","min","min","maj","maj"]'), "Pocket DJ minor chord quality table should stay aligned");
  assert.ok(godotCompiler.includes('["maj", "min", "min", "maj", "maj", "min", "dim"]'), "Godot major chord quality table should stay aligned");
  assert.ok(godotCompiler.includes('["min", "dim", "maj", "min", "min", "maj", "maj"]'), "Godot minor chord quality table should stay aligned");
  assert.ok(pitchHelper.includes("export function chordsmithChordForStep"), "shared core should expose Chordsmith chord pitch mapping");
  assert.ok(pitchHelper.includes("export function chordsmithMelodyIndexToMidi"), "shared core should expose Chordsmith melody pitch mapping");
  assert.ok(pitchHelper.includes("export function chordsmithBassIndexToMidi"), "shared core should expose Chordsmith bass pitch mapping");
  assert.ok(coreTimeline.includes("chordsmithChordForStep"), "core timeline should consume shared chord pitch mapping");
  assert.ok(coreTimeline.includes("chordsmithPowerChordNotes"), "core timeline should consume shared guitar pitch mapping");
  assert.ok(pocketDawRenderer.includes("chordsmithChordForStep"), "Pocket DAW renderer should consume shared chord pitch mapping");
  assert.ok(pocketDawRenderer.includes("chordsmithPowerChordNotes"), "Pocket DAW renderer should consume shared guitar pitch mapping");
  assert.ok(!pocketDawRenderer.includes("const NOTES ="), "Pocket DAW renderer should not keep a local note-name table for Chordsmith pitch mapping");
  assert.ok(!pocketDawRenderer.includes("function scalePcs"), "Pocket DAW renderer should not keep local scale pitch mapping");
});

test("Chordsmith pitched tuplet gates stay aligned across DAW, Godot and core", async () => {
  const [chordsmith, pocketDawRenderer, coreTimeline, tupletHelper, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/performance/tuplets.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);

  assert.ok(chordsmith.includes("Math.max(0.08, spanDur / 3 * 0.86)"), "Chordsmith live pitched tuplets should keep source gate formula");
  assert.ok(chordsmith.includes("Math.round((leftMidi + rightMidi) / 2)"), "Chordsmith bass tuplets should keep midpoint MIDI formula");
  assert.ok(chordsmith.includes("function melodyTripletMiddleIndex"), "Chordsmith melody tuplets should keep midpoint note-index helper");
  assert.ok(godotCompiler.includes("float(span_ticks) / 3.0 * 0.86"), "Godot compiler should keep Chordsmith pitched tuplet gate formula");
  assert.match(tupletHelper, new RegExp(`gateFloorSeconds\\s*:\\s*${numberPattern(CHORDSMITH_PITCHED_TUPLET.gateFloorSeconds)}`), "shared pitched tuplet floor should match Chordsmith");
  assert.match(tupletHelper, new RegExp(`gateSpanMul\\s*:\\s*${numberPattern(CHORDSMITH_PITCHED_TUPLET.gateSpanMul)}`), "shared pitched tuplet multiplier should match Chordsmith");
  assert.ok(coreTimeline.includes("chordsmithPitchedTupletDuration"), "core timeline should consume shared pitched tuplet gate");
  assert.ok(coreTimeline.includes("chordsmithPitchedTupletMiddleMidi"), "core timeline should consume shared bass tuplet midpoint");
  assert.ok(coreTimeline.includes("chordsmithPitchedTupletMiddleIndex"), "core timeline should consume shared melody tuplet midpoint");
  assert.ok(pocketDawRenderer.includes("chordsmithPitchedTupletDuration"), "Pocket DAW renderer should consume shared pitched tuplet gate");
  assert.ok(pocketDawRenderer.includes("chordsmithPitchedTupletMiddleMidi"), "Pocket DAW renderer should consume shared bass tuplet midpoint");
  assert.ok(pocketDawRenderer.includes("chordsmithPitchedTupletMiddleIndex"), "Pocket DAW renderer should consume shared melody tuplet midpoint");
  assert.ok(!pocketDawRenderer.includes("spanDur / 3 * 0.86"), "Pocket DAW renderer should not keep a local pitched tuplet gate formula");
});

test("Chordsmith lofi texture playback constants stay aligned across DAW and DJ", async () => {
  const [chordsmith, pocketDj, pocketDawInstruments] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawInstruments, "utf8")
  ]);

  assert.match(chordsmith, new RegExp(`lofi_hiss_[\\s\\S]*?,\\s*${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.hissSeconds)}\\s*,\\s*false\\)`), "Chordsmith lofi hiss length should match shared core");
  assert.match(chordsmith, new RegExp(`linearRampToValueAtTime\\(${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.hissGain)}\\s*\\*\\s*hiss`), "Chordsmith lofi hiss gain should match shared core");
  assert.match(chordsmith, new RegExp(`crackle\\s*\\*\\s*${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.crackleThreshold)}`), "Chordsmith crackle chance should match shared core");
  assert.match(chordsmith, new RegExp(`setValueAtTime\\(${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.crackleGain)}\\s*\\*\\s*crackle`), "Chordsmith crackle gain should match shared core");

  assert.match(pocketDj, new RegExp(`lofi_hiss_[\\s\\S]*?,\\s*${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.hissSeconds)}\\s*,\\s*false\\)`), "Pocket DJ lofi hiss length should match Chordsmith");
  assert.match(pocketDj, new RegExp(`linearRampToValueAtTime\\(${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.hissGain)}\\s*\\*\\s*hiss`), "Pocket DJ lofi hiss gain should match Chordsmith");
  assert.match(pocketDj, new RegExp(`crackle\\s*\\*\\s*${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.crackleThreshold)}`), "Pocket DJ crackle chance should match Chordsmith");
  assert.match(pocketDj, new RegExp(`setValueAtTime\\(${numberPattern(CHORDSMITH_LOFI_TEXTURE_LIVE.crackleGain)}\\s*\\*\\s*crackle`), "Pocket DJ crackle gain should match Chordsmith");

  assert.ok(pocketDawInstruments.includes("CHORDSMITH_LOFI_TEXTURE_LIVE"), "Pocket DAW synth should consume shared lofi texture constants");
  assert.ok(pocketDawInstruments.includes("chordsmithLofiTextureLiveCrackleShouldTrigger"), "Pocket DAW synth should use shared Chordsmith crackle trigger math");
  assert.ok(pocketDawInstruments.includes("chordsmithLofiTextureLiveCrackleFrequency"), "Pocket DAW synth should use shared Chordsmith crackle frequency math");
  assert.ok(pocketDawInstruments.includes("chordsmithFeatureSeed(step, index + 50)"), "Pocket DAW guitar detune should use Chordsmith seed math");
});

test("Chordsmith drum kit voice recipes stay shared across Chordsmith, DJ and DAW", async () => {
  const [chordsmith, pocketDj, pocketDawInstruments, pocketDawNativeAudio, pocketDawGeneratedSoundRecipes] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawInstruments, "utf8"),
    readFile(surfaces.pocketDawNativeAudio, "utf8"),
    readFile(surfaces.pocketDawGeneratedSoundRecipes, "utf8")
  ]);

  assert.ok(chordsmith.includes("pocketAudioCoreModule?.POCKET_DRUM_KIT_CONFIGS"), "Chordsmith should prefer shared drum kit configs when core is loaded");
  assert.ok(pocketDj.includes("pocketAudioCoreModule?.POCKET_DRUM_KIT_CONFIGS"), "Pocket DJ should prefer shared drum kit configs when core is loaded");
  assert.ok(chordsmith.includes("pocketAudioCoreModule?.resolvePocketDrumKitId"), "Chordsmith should prefer the shared drum kit resolver when core is loaded");
  assert.ok(pocketDj.includes("pocketAudioCoreModule?.resolvePocketDrumKitId"), "Pocket DJ should prefer the shared drum kit resolver when core is loaded");
  assert.ok(chordsmith.includes("FALLBACK_DRUM_KIT_CONFIGS[kit] ? kit"), "Chordsmith local fallback should reject unknown drum kit IDs before choosing classic or lofi default");
  assert.ok(pocketDj.includes("FALLBACK_DRUM_KIT_CONFIGS[kit] ? kit"), "Pocket DJ local fallback should reject unknown drum kit IDs before choosing classic or lofi default");
  assert.ok(pocketDawInstruments.includes("POCKET_DRUM_KIT_CONFIGS"), "Pocket DAW should consume shared drum kit configs");
  assert.ok(pocketDawInstruments.includes("resolvePocketDrumKitId"), "Pocket DAW WebAudio should consume the shared drum kit resolver");
  assert.ok(pocketDawNativeAudio.includes('include!("generated_sound_recipes.rs")'), "Pocket DAW native playback should include generated shared sound recipes");
  assert.ok(pocketDawGeneratedSoundRecipes.includes("fn native_drum_kit_config"), "Pocket DAW generated native recipes should expose drum kit configs");
  assert.ok(pocketDawGeneratedSoundRecipes.includes("fn generated_native_resolve_drum_kit"), "Pocket DAW generated native recipes should expose the shared drum kit resolver");
  assert.ok(pocketDawNativeAudio.includes("generated_native_resolve_drum_kit"), "Pocket DAW native playback should use the generated shared drum kit resolver");
  assert.ok(pocketDawGeneratedSoundRecipes.includes(`=> "${DEFAULT_LOFI_DRUM_KIT}"`), "Pocket DAW native resolver should use the shared lofi drum fallback");
  assert.ok(pocketDawGeneratedSoundRecipes.includes(`=> "${DEFAULT_CLASSIC_DRUM_KIT}"`), "Pocket DAW native resolver should use the shared classic drum fallback");
  assert.ok(pocketDawNativeAudio.includes("drum_exp_ramp"), "Pocket DAW native playback should use Chordsmith-style drum gain ramps");
  assert.ok(pocketDawInstruments.includes('kit === "classic" ? "snare"'), "Pocket DAW should preserve the classic snare noise key");
  assert.ok(chordsmith.includes('kit === "classic" ? "snare"'), "Chordsmith should preserve the classic snare noise key");
  assert.ok(pocketDj.includes('kit === "classic" ? "snare"'), "Pocket DJ should preserve the classic snare noise key");

  ["classic", "lofi_dusty", "lofi_brush", "lofi_tape_soft"].forEach((id) => {
    assertDrumKitConfig(chordsmith, "Chordsmith", id, POCKET_DRUM_KIT_CONFIGS[id]);
    assertDrumKitConfig(pocketDj, "Pocket DJ", id, POCKET_DRUM_KIT_CONFIGS[id]);
    assertNativeDrumKitConfig(pocketDawGeneratedSoundRecipes, "Pocket DAW generated native", id, POCKET_DRUM_KIT_CONFIGS[id]);
  });
});

test("Chordsmith drum event gates and peaks stay aligned across DAW, Godot and core", async () => {
  const [chordsmith, pocketDawRenderer, coreTimeline, drumFeel, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/performance/drum-feel.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);

  assert.match(chordsmith, /(?:level|lev) === 2 \? 1\.12 : 0\.95/, "Chordsmith should keep the kick peak source formula");
  assert.match(chordsmith, /(?:level|lev) === 2 \? 0\.72 : 0\.5/, "Chordsmith should keep the snare peak source formula");
  assert.match(chordsmith, /(?:level|lev) === 2 \? 0\.24 : 0\.16/, "Chordsmith should keep the hat peak source formula");
  assert.ok(chordsmith.includes('dur: Math.min(type === "kick" ? 0.10'), "Chordsmith should keep the normal drum gate source formula");
  assert.ok(chordsmith.includes('Math.min(type === "hat" && lev === 2 ? 0.12 : 0.08, spanDur / 3 * 0.7)'), "Chordsmith should keep the tuplet drum gate source formula");
  assert.ok(coreTimeline.includes("chordsmithDrumStepDuration"), "core timeline should consume shared drum gate helper");
  assert.ok(coreTimeline.includes("chordsmithDrumTupletDuration"), "core timeline should consume shared drum tuplet helper");
  assert.ok(pocketDawRenderer.includes("chordsmithDrumStepDuration"), "Pocket DAW renderer should consume shared drum gate helper");
  assert.ok(pocketDawRenderer.includes("chordsmithDrumTupletDuration"), "Pocket DAW renderer should consume shared drum tuplet helper");
  Object.entries(CHORDSMITH_DRUM_FEEL.peak).forEach(([lane, config]) => {
    assert.match(drumFeel, new RegExp(`${lane}[\\s\\S]*?normal\\s*:\\s*${numberPattern(config.normal)}[\\s\\S]*?accent\\s*:\\s*${numberPattern(config.accent)}`), `shared drum ${lane} peaks should match Chordsmith`);
  });
  Object.entries(CHORDSMITH_DRUM_FEEL.gate).forEach(([key, value]) => {
    assert.match(drumFeel, new RegExp(`${key}\\s*:\\s*${numberPattern(value)}`), `shared drum gate ${key} should match Chordsmith`);
  });
  assert.ok(godotCompiler.includes("_drum_duration_ticks(project, track_id, level, step)"), "Godot compiler should use Chordsmith normal drum gate helper");
  assert.ok(godotCompiler.includes("_drum_tuplet_duration_ticks(project, track_id, hit_level, span_ticks)"), "Godot compiler should use Chordsmith tuplet drum gate helper");
  assert.ok(godotCompiler.includes("0.70"), "Godot compiler should preserve Chordsmith drum gate multiplier");
});

test("Chordsmith chord rhythm gates stay aligned across DJ, DAW, Godot and core", async () => {
  const [chordsmith, pocketDj, pocketDawRenderer, pocketDawSanitizer, coreTimeline, coreNormalizer, chordRhythm, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(surfaces.coreNormalizer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/performance/chord-rhythm.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);

  assert.deepEqual(CHORDSMITH_CHORD_PLAY_MODES, ["block", "strum_up", "strum_down", "arp_up", "arp_down"]);
  assert.deepEqual(CHORDSMITH_CHORD_RHYTHM_MODES, ["sustain", "quarter", "half"]);
  CHORDSMITH_CHORD_PLAY_MODES.forEach((id) => {
    assert.ok(chordsmith.includes(`<option value="${id}"`), `Chordsmith UI should expose chord play mode ${id}`);
  });
  CHORDSMITH_CHORD_RHYTHM_MODES.forEach((id) => {
    assert.ok(chordsmith.includes(`<option value="${id}"`), `Chordsmith UI should expose chord rhythm mode ${id}`);
  });
  assert.ok(chordsmith.includes("beatDur()*0.9"), "Chordsmith should keep quarter chord gate source formula");
  assert.ok(chordsmith.includes("beatDur()*1.8"), "Chordsmith should keep half chord gate source formula");
  assert.ok(chordsmith.includes("beatDur() * state.timeSig * 0.92"), "Chordsmith should keep sustain chord gate source formula");
  assert.ok(pocketDj.includes("beatDur()*.9"), "Pocket DJ fallback should mirror Chordsmith quarter chord gate");
  assert.ok(pocketDj.includes("beatDur()*1.8"), "Pocket DJ fallback should mirror Chordsmith half chord gate");
  assert.ok(pocketDj.includes(")*.92"), "Pocket DJ fallback should mirror Chordsmith sustain chord gate");
  assert.ok(coreTimeline.includes("chordsmithChordRhythmStarts"), "core timeline should consume shared chord rhythm helper");
  assert.ok(pocketDawRenderer.includes("chordsmithChordRhythmStarts"), "Pocket DAW renderer should consume shared chord rhythm helper");
  assert.ok(coreNormalizer.includes("CHORDSMITH_CHORD_PLAY_MODES"), "core normalizer should validate chord play modes against shared Chordsmith IDs");
  assert.ok(coreNormalizer.includes("CHORDSMITH_CHORD_RHYTHM_MODES"), "core normalizer should validate chord rhythm modes against shared Chordsmith IDs");
  assert.ok(pocketDawSanitizer.includes("CHORDSMITH_CHORD_PLAY_MODES"), "Pocket DAW sanitizer should validate chord play modes against shared Chordsmith IDs");
  assert.ok(pocketDawSanitizer.includes("CHORDSMITH_CHORD_RHYTHM_MODES"), "Pocket DAW sanitizer should validate chord rhythm modes against shared Chordsmith IDs");
  Object.entries(CHORDSMITH_CHORD_RHYTHM).forEach(([key, value]) => {
    assert.match(chordRhythm, new RegExp(`${key}\\s*:\\s*${numberPattern(value)}`), `shared chord rhythm ${key} should match Chordsmith`);
  });
  assert.ok(godotCompiler.includes("* 0.92"), "Godot compiler should preserve Chordsmith sustain chord gate");
  assert.ok(godotCompiler.includes("* 0.90"), "Godot compiler should preserve Chordsmith quarter chord gate");
  assert.ok(godotCompiler.includes("* 1.80"), "Godot compiler should preserve Chordsmith half chord gate");
  assert.ok(godotCompiler.includes("* 1.20"), "Godot compiler should preserve Chordsmith 3/4 half chord gate");
});

test("Chordsmith bass and melody phrase gates stay aligned across DJ, DAW, Godot and core", async () => {
  const [chordsmith, pocketDj, pocketDawRenderer, coreTimeline, phrases, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/performance/phrases.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);

  assert.ok(chordsmith.includes("Math.max(0.18, dur * 0.94)"), "Chordsmith should keep bass phrase gate source formula");
  assert.ok(chordsmith.includes("Math.max(0.18, dur * 0.92)"), "Chordsmith should keep melody phrase gate source formula");
  assert.ok(pocketDj.includes("Math.max(.18, dur*.94)"), "Pocket DJ fallback should mirror Chordsmith bass phrase gate");
  assert.ok(pocketDj.includes("Math.max(.18, dur*.92)"), "Pocket DJ fallback should mirror Chordsmith melody phrase gate");
  assert.ok(pocketDj.includes("section.bassSlide[i] && bassTriggerAt(section,i)"), "Pocket DJ fallback should detect bass slides after the hold run");
  assert.ok(coreTimeline.includes("chordsmithPhraseInfo"), "core timeline should consume shared phrase helper");
  assert.ok(pocketDawRenderer.includes("chordsmithPhraseInfo"), "Pocket DAW renderer should consume shared phrase helper");
  Object.entries(CHORDSMITH_PHRASE_GATES).forEach(([key, value]) => {
    assert.match(phrases, new RegExp(`${key}\\s*:\\s*${numberPattern(value)}`), `shared phrase gate ${key} should match Chordsmith`);
  });
  assert.ok(godotCompiler.includes("duration_ticks = max(1, int(round(float(duration_ticks) * 0.94)))"), "Godot compiler should always apply Chordsmith bass phrase gate");
  assert.ok(godotCompiler.includes("duration_ticks = max(1, int(round(float(duration_ticks) * 0.92)))"), "Godot compiler should always apply Chordsmith melody phrase gate");
  assert.ok(!godotCompiler.includes('project.get("midiExactDurations", true)):\\n\\t\\tduration_ticks'), "Godot runtime phrase gates should not depend on MIDI exact-duration export settings");
});

test("bass voice recipes stay aligned across Chordsmith, DJ, DAW and core live playback", async () => {
  const [chordsmith, pocketDj, pocketDawInstruments, pocketDawNativeAudio, pocketDawGeneratedSoundRecipes, coreLiveEngine] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawInstruments, "utf8"),
    readFile(surfaces.pocketDawNativeAudio, "utf8"),
    readFile(surfaces.pocketDawGeneratedSoundRecipes, "utf8"),
    readFile(surfaces.coreLiveEngine, "utf8")
  ]);

  Object.entries(POCKET_BASS_TONE_CONFIGS).forEach(([id, config]) => {
    assertBassConfig(chordsmith, "Chordsmith", id, config);
    assertBassConfig(pocketDj, "Pocket DJ", id, config);
    assertNativeBassConfig(pocketDawGeneratedSoundRecipes, "Pocket DAW generated native", id, config);
  });
  assert.ok(pocketDawInstruments.includes("POCKET_BASS_TONE_CONFIGS"), "Pocket DAW should consume the shared bass-tone registry");
  assert.ok(pocketDawNativeAudio.includes('include!("generated_sound_recipes.rs")'), "Pocket DAW native playback should include generated shared sound recipes");
  assert.ok(pocketDawGeneratedSoundRecipes.includes("fn native_bass_tone_config"), "Pocket DAW generated native recipes should mirror the shared bass-tone registry");
  assert.ok(pocketDawNativeAudio.includes("lowpass_tone_factor(freq, cfg.cutoff)"), "Pocket DAW native bass should shape the main layer from shared cutoff values");
  assert.ok(!pocketDawNativeAudio.includes("let sub_dur = (dur * 0.65)"), "Pocket DAW native bass should not keep the old short sub-layer envelope");
  assert.ok(!pocketDawNativeAudio.includes("sub_dur, 0.006"), "Pocket DAW native bass should use the shared bass attack for the sub layer");
  assert.ok(pocketDawInstruments.includes("resolvePocketBassToneId"), "Pocket DAW should default missing bass tones through the shared resolver");
  assert.ok(coreLiveEngine.includes("cfg.subWave"), "core live bass should schedule the shared sub layer like Chordsmith and DAW");
  assert.ok(coreLiveEngine.includes("cfg.subPeak"), "core live bass should apply the shared sub-layer level");
  assert.ok(coreLiveEngine.includes("cfg.subCutoff"), "core live bass should shape the shared sub layer separately from the main layer");
});

test("Chordsmith guitar tone surface stays aligned across DJ, DAW and core", async () => {
  const [chordsmith, pocketDj, pocketDawInstruments, pocketDawNativeAudio, pocketDawGeneratedSoundRecipes, pocketDawEditor, pocketDawUi, pocketDawSanitizer, coreNormalizer] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawInstruments, "utf8"),
    readFile(surfaces.pocketDawNativeAudio, "utf8"),
    readFile(surfaces.pocketDawGeneratedSoundRecipes, "utf8"),
    readFile(surfaces.pocketDawEditor, "utf8"),
    readFile(surfaces.pocketDawUi, "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(surfaces.coreNormalizer, "utf8")
  ]);

  assert.deepEqual(extractJsArrayConst(chordsmith, "GUITAR_TONES"), POCKET_GUITAR_TONES);
  POCKET_GUITAR_TONES.forEach((id) => {
    assertGuitarConfig(chordsmith, "Chordsmith", id, POCKET_GUITAR_TONE_CONFIGS[id]);
    assertGuitarConfig(pocketDj, "Pocket DJ", id, POCKET_GUITAR_TONE_CONFIGS[id]);
    assertNativeGuitarConfig(pocketDawGeneratedSoundRecipes, "Pocket DAW generated native", id, POCKET_GUITAR_TONE_CONFIGS[id]);
  });
  assert.ok(pocketDawInstruments.includes("POCKET_GUITAR_TONE_CONFIGS"), "Pocket DAW synth should consume shared guitar tone curves");
  assert.ok(pocketDawNativeAudio.includes("generated_guitar_tone_config"), "Pocket DAW native audio should keep installed playback tone-aware through generated recipes");
  assert.ok(pocketDawEditor.includes("POCKET_GUITAR_TONES"), "Pocket DAW Chordsmith editor should consume shared guitar tone IDs");
  assert.ok(pocketDawUi.includes("POCKET_GUITAR_TONES"), "Pocket DAW UI should render shared guitar tone IDs");
  assert.ok(pocketDawSanitizer.includes("POCKET_GUITAR_TONES"), "Pocket DAW import sanitizer should validate guitar tones against shared IDs");
  assert.ok(coreNormalizer.includes("POCKET_GUITAR_TONES"), "core normalizer should validate guitar tones against shared IDs");
  assert.ok(coreNormalizer.includes("POCKET_GUITAR_REGISTERS"), "core normalizer should validate guitar registers against shared IDs");
  assert.ok(coreNormalizer.includes("POCKET_GUITAR_STRUM_MODES"), "core normalizer should validate guitar strum modes against shared IDs");
});

test("Chordsmith guitar event gates stay aligned across DJ, DAW, Godot and core", async () => {
  const [chordsmith, pocketDj, pocketDawRenderer, coreTimeline, guitarGates, godotCompiler] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/performance/guitar-gates.js", repoRoot), "utf8"),
    readFile(surfaces.godotCompiler, "utf8")
  ]);
  const chugFormula = "Math.max(0.055, Math.min(0.16, stepDur * 0.58))";
  const scratchFormula = "Math.max(0.035, Math.min(0.075, stepDur * 0.42))";
  const sustainFormula = /Math\.max\(0\.16,\s*Math\.min\(1\.8,\s*(?:dur|duration) \* \(articulation === "accent" \? 0\.98 : 0\.92\)\)\)/;

  assert.ok(chordsmith.includes(chugFormula), "Chordsmith guitar chug gate should remain the source formula");
  assert.ok(chordsmith.includes(scratchFormula), "Chordsmith guitar scratch gate should remain the source formula");
  assert.match(chordsmith, sustainFormula, "Chordsmith guitar sustain/accent gate should remain the source formula");
  assert.ok(pocketDj.includes("Math.max(.055, Math.min(.16, stepDur*.58))"), "Pocket DJ fallback should mirror Chordsmith guitar chug gate");
  assert.ok(pocketDj.includes("Math.max(.035, Math.min(.075, stepDur*.42))"), "Pocket DJ fallback should mirror Chordsmith guitar scratch gate");
  assert.ok(pocketDj.includes('Math.max(.16, Math.min(1.8, dur * (art === "accent" ? .98 : .92)))'), "Pocket DJ fallback should mirror Chordsmith guitar sustain/accent gate");
  assert.ok(coreTimeline.includes("chordsmithGuitarStepDuration"), "core timeline should consume shared guitar gate helper");
  assert.ok(pocketDawRenderer.includes("chordsmithGuitarStepDuration"), "Pocket DAW renderer should consume shared guitar gate helper");
  Object.entries(CHORDSMITH_GUITAR_GATE_SECONDS).forEach(([key, value]) => {
    assert.match(guitarGates, new RegExp(`${key}\\s*:\\s*${numberPattern(value)}`), `shared guitar gate ${key} should match Chordsmith`);
  });
  assert.ok(godotCompiler.includes("_seconds_to_ticks(project, 0.055)"), "Godot compiler should preserve Chordsmith chug floor in ticks");
  assert.ok(godotCompiler.includes("_seconds_to_ticks(project, 0.075)"), "Godot compiler should preserve Chordsmith scratch ceiling in ticks");
  assert.ok(godotCompiler.includes('var gate := 0.98 if articulation == "accent" else 0.92'), "Godot compiler should preserve Chordsmith accent/open gate ratio");
});

test("Chordsmith default sound IDs stay shared across core and DAW", async () => {
  const [coreNormalizer, coreTimeline, pocketDawSanitizer, pocketDawEditor, pocketDawRenderer, pocketDawInstruments, pocketDawProject, pocketDawDemo] = await Promise.all([
    readFile(surfaces.coreNormalizer, "utf8"),
    readFile(new URL("packages/pocket-audio-core/src/events/timeline-events.js", repoRoot), "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(surfaces.pocketDawEditor, "utf8"),
    readFile(surfaces.pocketDawRenderer, "utf8"),
    readFile(surfaces.pocketDawInstruments, "utf8"),
    readFile(surfaces.pocketDawProject, "utf8"),
    readFile(surfaces.pocketDawDemo, "utf8")
  ]);

  assert.equal(DEFAULT_CHORD_INSTRUMENT, "pocket");
  assert.equal(DEFAULT_MELODY_INSTRUMENT, "pulse");
  assert.equal(DEFAULT_GUITAR_TONE, "high_gain");
  assert.equal(DEFAULT_GUITAR_REGISTER, "low");
  assert.equal(DEFAULT_GUITAR_STRUM_MODE, "down");

  ["DEFAULT_CHORD_INSTRUMENT", "DEFAULT_MELODY_INSTRUMENT", "DEFAULT_GUITAR_TONE", "DEFAULT_GUITAR_REGISTER", "DEFAULT_GUITAR_STRUM_MODE"].forEach((id) => {
    assert.ok(coreNormalizer.includes(id), `core normalizer should consume ${id}`);
    assert.ok(pocketDawSanitizer.includes(id), `Pocket DAW sanitizer should consume ${id}`);
  });
  assert.ok(pocketDawEditor.includes("DEFAULT_MELODY_INSTRUMENT"), "Pocket DAW editor should use the shared melody default");
  assert.ok(pocketDawEditor.includes("DEFAULT_GUITAR_TONE"), "Pocket DAW editor should use the shared guitar tone default");
  assert.ok(pocketDawEditor.includes("DEFAULT_GUITAR_REGISTER"), "Pocket DAW editor should use the shared guitar register default");
  assert.ok(pocketDawEditor.includes("DEFAULT_GUITAR_STRUM_MODE"), "Pocket DAW editor should use the shared guitar strum default");
  assert.ok(pocketDawRenderer.includes("DEFAULT_MELODY_INSTRUMENT"), "Pocket DAW renderer should use the shared melody default");
  assert.ok(pocketDawRenderer.includes("DEFAULT_GUITAR_STRUM_MODE"), "Pocket DAW renderer should use the shared guitar strum default");
  assert.ok(coreTimeline.includes("DEFAULT_GUITAR_STRUM_MODE"), "core timeline should use the shared guitar strum default");
  assert.ok(pocketDawInstruments.includes("DEFAULT_CHORD_INSTRUMENT"), "Pocket DAW scheduler should use the shared chord default");
  assert.ok(pocketDawInstruments.includes("DEFAULT_MELODY_INSTRUMENT"), "Pocket DAW scheduler should use the shared melody default");
  assert.ok(pocketDawInstruments.includes("DEFAULT_GUITAR_TONE"), "Pocket DAW scheduler should use the shared guitar tone default");
  assert.ok(pocketDawProject.includes("DEFAULT_CHORD_INSTRUMENT"), "Pocket DAW starter source should use the shared chord default");
  assert.ok(pocketDawProject.includes("DEFAULT_GUITAR_REGISTER"), "Pocket DAW starter source should use the shared guitar register default");
  assert.ok(pocketDawDemo.includes("DEFAULT_GUITAR_REGISTER"), "Pocket DAW demo template should use the shared guitar register default");
  assert.ok(!pocketDawProject.includes('chordInstrument: "pocket"'), "Pocket DAW starter source should not keep a local chord instrument default");
  assert.ok(!pocketDawProject.includes('guitarRegister: "low"'), "Pocket DAW starter source should not keep a local guitar register default");
  assert.ok(!pocketDawDemo.includes('guitarRegister: "low"'), "Pocket DAW demo template should not keep a local guitar register default");
}
);

test("Chordsmith chord and melody instrument surfaces stay aligned across DJ, DAW and core", async () => {
  const [chordsmith, pocketDj, pocketDawInstruments, pocketDawNativeAudio, pocketDawGeneratedSoundRecipes, pocketDawUi, pocketDawSanitizer, pocketDawEditor, coreNormalizer] = await Promise.all([
    readFile(surfaces.chordsmith, "utf8"),
    readFile(surfaces.pocketDj, "utf8"),
    readFile(surfaces.pocketDawInstruments, "utf8"),
    readFile(surfaces.pocketDawNativeAudio, "utf8"),
    readFile(surfaces.pocketDawGeneratedSoundRecipes, "utf8"),
    readFile(surfaces.pocketDawUi, "utf8"),
    readFile(surfaces.pocketDawSanitizer, "utf8"),
    readFile(surfaces.pocketDawEditor, "utf8"),
    readFile(surfaces.coreNormalizer, "utf8")
  ]);

  assert.deepEqual(extractJsArrayConst(chordsmith, "CHORD_INSTRUMENTS"), POCKET_CHORD_INSTRUMENTS);
  assert.deepEqual(extractJsArrayConst(chordsmith, "MELODY_INSTRUMENTS"), POCKET_MELODY_INSTRUMENTS);
  assert.ok(pocketDawInstruments.includes("findPocketChordInstrumentConfig"), "Pocket DAW chord synth should consume shared chord instrument configs");
  assert.ok(pocketDawInstruments.includes("findPocketLeadInstrumentConfig"), "Pocket DAW melody synth should consume shared melody instrument configs");
  assert.ok(pocketDawNativeAudio.includes("generated_native_chord_config"), "Pocket DAW native chord synth should consume generated shared chord instrument configs");
  assert.ok(pocketDawNativeAudio.includes("generated_native_lead_config"), "Pocket DAW native melody synth should consume generated shared melody instrument configs");
  assert.ok(pocketDawGeneratedSoundRecipes.includes("fn generated_native_chord_config"), "Pocket DAW generated native recipes should expose chord instrument configs");
  assert.ok(pocketDawGeneratedSoundRecipes.includes("fn generated_native_lead_config"), "Pocket DAW generated native recipes should expose melody instrument configs");
  assert.ok(pocketDawUi.includes("POCKET_MELODY_INSTRUMENTS"), "Pocket DAW UI should render shared melody instrument IDs");
  assert.ok(pocketDawSanitizer.includes("POCKET_CHORD_INSTRUMENTS"), "Pocket DAW import sanitizer should accept chord instruments from shared core");
  assert.ok(pocketDawSanitizer.includes("POCKET_MELODY_INSTRUMENTS"), "Pocket DAW import sanitizer should accept melody instruments from shared core");
  assert.ok(pocketDawEditor.includes("POCKET_MELODY_INSTRUMENTS"), "Pocket DAW editor should validate melody instrument writes against shared core");
  assert.ok(coreNormalizer.includes("POCKET_CHORD_INSTRUMENTS"), "core normalizer should accept chord instruments from shared core");
  assert.ok(coreNormalizer.includes("POCKET_MELODY_INSTRUMENTS"), "core normalizer should accept melody instruments from shared core");

  ["pocket", "piano", "glass", "dusty_rhodes", "lofi_warm_pad"].forEach((id) => {
    assertChordInstrumentConfig(chordsmith, "Chordsmith", id, POCKET_CHORD_INSTRUMENT_CONFIGS[id]);
    assertChordInstrumentConfig(pocketDj, "Pocket DJ", id, POCKET_CHORD_INSTRUMENT_CONFIGS[id]);
  });
  ["pulse", "bell", "harmonica", "muted_trumpet", "tape_bell"].forEach((id) => {
    assertLeadInstrumentConfig(chordsmith, "Chordsmith", id, POCKET_LEAD_INSTRUMENT_CONFIGS[id]);
    assertLeadInstrumentConfig(pocketDj, "Pocket DJ", id, POCKET_LEAD_INSTRUMENT_CONFIGS[id]);
  });
  POCKET_CHORD_INSTRUMENTS.forEach((id) => {
    assertNativeChordInstrumentConfig(pocketDawGeneratedSoundRecipes, "Pocket DAW generated native", id, POCKET_CHORD_INSTRUMENT_CONFIGS[id]);
  });
  POCKET_MELODY_INSTRUMENTS.forEach((id) => {
    assertNativeLeadInstrumentConfig(pocketDawGeneratedSoundRecipes, "Pocket DAW generated native", id, POCKET_LEAD_INSTRUMENT_CONFIGS[id]);
  });
});

test("Godot lofi drum sample aliases stay aligned with core drum-kit IDs", async () => {
  const [compiler, validator, buildTools, conductor, soundKitGenerator, godotSharedSoundConstants] = await Promise.all([
    readFile(surfaces.godotCompiler, "utf8"),
    readFile(surfaces.godotValidator, "utf8"),
    readFile(surfaces.godotBuildTools, "utf8"),
    readFile(surfaces.godotConductor, "utf8"),
    readFile(surfaces.godotSoundKitGenerator, "utf8"),
    readFile(surfaces.godotSharedSoundConstants, "utf8")
  ]);
  const expectedKitAliases = LOFI_DRUM_KITS.flatMap((kit) => ["kick", "snare", "hat", "open_hat"].map((lane) => `${kit}:${lane}`));

  assert.ok(compiler.includes('"drum_kit": drum_kit'), "Godot compiler should preserve per-event drum_kit flags");
  assert.ok(conductor.includes('flags.get("drum_kit"'), "Godot conductor should resolve lofi drum sample keys from drum_kit flags");
  assert.ok(validator.includes('flags.get("drum_kit"'), "Godot validator should check the same lofi drum sample keys as runtime");
  assert.ok(godotSharedSoundConstants.includes("const GODOT_DRUM_SAMPLE_STREAMS :="), "Godot generated constants should expose drum sample-preview streams");
  assert.ok(buildTools.includes("SharedSoundConstants.GODOT_DRUM_SAMPLE_STREAMS"), "Godot playback profile template should consume generated drum sample stream keys");
  assert.ok(soundKitGenerator.includes("SharedSoundConstants.GODOT_DRUM_SAMPLE_STREAMS"), "Godot web kit generator should consume generated drum sample stream keys");
  expectedKitAliases.forEach((key) => {
    assert.ok(godotSharedSoundConstants.includes(`"${key}"`), `Godot generated drum sample stream constants missing ${key}`);
  });
});

test("Godot sample-preview event streams cover shared pitched sound IDs", async () => {
  const [soundKitGenerator, webKitProfile, conductor, godotSharedSoundConstants] = await Promise.all([
    readFile(surfaces.godotSoundKitGenerator, "utf8"),
    readFile(surfaces.godotWebKitProfile, "utf8"),
    readFile(surfaces.godotConductor, "utf8"),
    readFile(surfaces.godotSharedSoundConstants, "utf8")
  ]);
  const expectedKeys = [
    "bass",
    "bass:auto_bass",
    "bass:manual_bass",
    ...Object.keys(POCKET_BASS_TONE_CONFIGS).map((id) => `bass:${id}`),
    "chord",
    "chord:tone",
    ...POCKET_CHORD_INSTRUMENTS.map((id) => `chord:${id}`),
    "guitar",
    "guitar:open",
    "guitar:chug",
    "guitar:accent",
    "guitar:scratch",
    "melody",
    ...POCKET_MELODY_INSTRUMENTS.map((id) => `melody:${id}`)
  ];

  assert.ok(
    conductor.includes('var bass_key := "bass:%s" % instrument_id'),
    "Godot conductor should resolve bass sample-preview keys from event instrument IDs"
  );
  assert.ok(
    conductor.includes('var chord_key := "chord:%s" % chord_instrument'),
    "Godot conductor should resolve chord sample-preview keys from event flags"
  );
  assert.ok(
    conductor.includes('var melody_key := "melody:%s" % instrument_id'),
    "Godot conductor should resolve melody sample-preview keys from event instrument IDs"
  );
  assert.ok(godotSharedSoundConstants.includes("const GODOT_EVENT_SAMPLE_STREAMS :="), "Godot generated constants should expose event sample-preview streams");
  assert.ok(soundKitGenerator.includes("SharedSoundConstants.GODOT_EVENT_SAMPLE_STREAMS"), "Godot sound-kit generator should consume generated event sample stream keys");
  expectedKeys.forEach((key) => {
    assert.ok(godotSharedSoundConstants.includes(`"${key}"`), `Godot generated event sample stream constants missing ${key}`);
    assert.ok(webKitProfile.includes(`"${key}"`), `Godot checked-in web kit profile missing event sample stream ${key}`);
  });
});

function extractStringConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*"([^"]+)"`));
  assert.ok(match, `${name} string const missing`);
  return match[1];
}

function extractGdStringConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*:=\\s*"([^"]+)"`));
  assert.ok(match, `${name} GDScript string const missing`);
  return match[1];
}

function extractJsArrayConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `${name} JS array const missing`);
  return stringLiterals(match[1]);
}

function extractGdArrayConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*:=\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `${name} GDScript array const missing`);
  return stringLiterals(match[1]);
}

function extractJsObjectKeys(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `${name} JS object const missing`);
  return Array.from(match[1].matchAll(/^\s*(lofi_[a-z0-9_]+)\s*:/gm), (item) => item[1]);
}

function extractChordsmithDrumPresets(source) {
  const presetMatch = source.match(/const\s+DRUM_PRESETS\s*=\s*([\s\S]*?\n\];)/);
  const patternMatch = source.match(/const\s+DRUM_PATTERN_DEFS\s*=\s*([\s\S]*?\n\};)\nconst\s+MELODY_IDEA_STYLES/);
  assert.ok(presetMatch, "Chordsmith DRUM_PRESETS const missing");
  assert.ok(patternMatch, "Chordsmith DRUM_PATTERN_DEFS const missing");
  const load = new Function(
    "drumHits",
    "drumGroove",
    "drumAccentHits",
    `const DRUM_PRESETS = ${presetMatch[1]}
const DRUM_PATTERN_DEFS = ${patternMatch[1]}
return { presets: DRUM_PRESETS, patternDefs: DRUM_PATTERN_DEFS };`
  );
  return load(chordsmithDrumHits, chordsmithDrumGroove, chordsmithDrumAccentHits);
}

function extractChordsmithDrumPads(source) {
  const match = source.match(/const\s+DRUM_PADS\s*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(match, "Chordsmith DRUM_PADS const missing");
  const load = new Function(`return [${match[1]}];`);
  return load();
}

function chordsmithDrumHits(track, pos16, level = 1, options = {}) {
  return pos16.map((pos) => ({ track, pos16: pos, level, ...options }));
}

function chordsmithDrumGroove(...groups) {
  return groups.flat();
}

function chordsmithDrumAccentHits(track, pos16, accentPos16 = []) {
  return chordsmithDrumGroove(chordsmithDrumHits(track, pos16, 1), chordsmithDrumHits(track, accentPos16, 2));
}

function stringLiterals(source) {
  return Array.from(source.matchAll(/"([^"]+)"/g), (item) => item[1]);
}

function compactJsStringArray(values) {
  return `[${values.map((value) => `"${value}"`).join(",")}]`;
}

function gdStringArray(values) {
  return `[${values.map((value) => `"${value}"`).join(", ")}]`;
}

function assertLofiTextureDefaults(source, label, expected) {
  const match = source.match(/const\s+DEFAULT_LOFI_TEXTURE\s*=\s*\{([^}]+)\}/);
  assert.ok(match, `${label} DEFAULT_LOFI_TEXTURE missing`);
  const body = match[1];
  assert.match(body, new RegExp(`enabled\\s*:\\s*${expected.enabled}`), `${label} lofi texture enabled default should match shared core`);
  ["vinylCrackle", "tapeHiss", "wowFlutter", "warmth", "lowPassAge", "bitCrush"].forEach((key) => {
    assert.match(body, new RegExp(`${key}\\s*:\\s*${numberPattern(expected[key])}`), `${label} ${key} default should match shared core`);
  });
}

function assertDrumKitConfig(source, label, id, expected) {
  const configPattern = new RegExp(
    `${id}\\s*:\\s*\\{[\\s\\S]*?` +
      `startFreq\\s*:\\s*${numberPattern(expected.kick.startFreq)}[\\s\\S]*?` +
      `endFreq\\s*:\\s*${numberPattern(expected.kick.endFreq)}[\\s\\S]*?` +
      `sweepSeconds\\s*:\\s*${numberPattern(expected.kick.sweepSeconds)}[\\s\\S]*?` +
      `gainScale\\s*:\\s*${numberPattern(expected.kick.gainScale)}[\\s\\S]*?` +
      `noiseSeconds\\s*:\\s*${numberPattern(expected.snare.noiseSeconds)}[\\s\\S]*?` +
      `highpass\\s*:\\s*${numberPattern(expected.snare.highpass)}[\\s\\S]*?` +
      `gainScale\\s*:\\s*${numberPattern(expected.snare.gainScale)}[\\s\\S]*?` +
      `closedLength\\s*:\\s*${numberPattern(expected.hat.closedLength)}[\\s\\S]*?` +
      `openLength\\s*:\\s*${numberPattern(expected.hat.openLength)}[\\s\\S]*?` +
      `highpassClosed\\s*:\\s*${numberPattern(expected.hat.highpassClosed)}[\\s\\S]*?` +
      `highpassOpen\\s*:\\s*${numberPattern(expected.hat.highpassOpen)}`,
    "s"
  );
  assert.match(source, configPattern, `${label} ${id} drum kit config should match shared registry`);
}

function assertNativeDrumKitConfig(source, label, id, expected) {
  const fnName = `native_drum_kit_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const configPattern = new RegExp(
    `fn\\s+${fnName}\\s*\\(\\)\\s*->\\s*NativeDrumKitConfig\\s*\\{[\\s\\S]*?NativeDrumKitConfig\\s*\\{[\\s\\S]*?` +
      `start_freq\\s*:\\s*${rustNumberPattern(expected.kick.startFreq)}[\\s\\S]*?` +
      `end_freq\\s*:\\s*${rustNumberPattern(expected.kick.endFreq)}[\\s\\S]*?` +
      `sweep_seconds\\s*:\\s*${rustNumberPattern(expected.kick.sweepSeconds)}[\\s\\S]*?` +
      `gain_scale\\s*:\\s*${rustNumberPattern(expected.kick.gainScale)}[\\s\\S]*?` +
      `noise_seconds\\s*:\\s*${rustNumberPattern(expected.snare.noiseSeconds)}[\\s\\S]*?` +
      `highpass\\s*:\\s*${rustNumberPattern(expected.snare.highpass)}[\\s\\S]*?` +
      `gain_scale\\s*:\\s*${rustNumberPattern(expected.snare.gainScale)}[\\s\\S]*?` +
      `closed_length\\s*:\\s*${rustNumberPattern(expected.hat.closedLength)}[\\s\\S]*?` +
      `open_length\\s*:\\s*${rustNumberPattern(expected.hat.openLength)}[\\s\\S]*?` +
      `highpass_closed\\s*:\\s*${rustNumberPattern(expected.hat.highpassClosed)}[\\s\\S]*?` +
      `highpass_open\\s*:\\s*${rustNumberPattern(expected.hat.highpassOpen)}`,
    "s"
  );
  assert.match(source, configPattern, `${label} ${id} drum kit config should match shared registry`);
}

function assertBassConfig(source, label, id, expected) {
  const configSource = id === "classic"
    ? source
    : extractBassToneBranch(source, id);
  const configPattern = new RegExp(
    `mainWave\\s*:\\s*"${expected.mainWave}"[\\s\\S]*?` +
      `subWave\\s*:\\s*"${expected.subWave}"[\\s\\S]*?` +
      `mainPeak\\s*:\\s*${numberPattern(expected.mainPeak)}[\\s\\S]*?` +
      `subPeak\\s*:\\s*${numberPattern(expected.subPeak)}[\\s\\S]*?` +
      `cutoff\\s*:\\s*${numberPattern(expected.cutoff)}[\\s\\S]*?` +
      `subCutoff\\s*:\\s*${numberPattern(expected.subCutoff)}`,
    "s"
  );
  assert.match(configSource, configPattern, `${label} ${id} bass config should match shared registry`);
}

function assertNativeBassConfig(source, label, id, expected) {
  const fnName = `native_bass_tone_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const configPattern = new RegExp(
    `fn\\s+${fnName}\\s*\\(\\)\\s*->\\s*NativeBassToneConfig\\s*\\{[\\s\\S]*?NativeBassToneConfig\\s*\\{[\\s\\S]*?` +
      `main_wave\\s*:\\s*"${expected.mainWave}"[\\s\\S]*?` +
      `sub_wave\\s*:\\s*"${expected.subWave}"[\\s\\S]*?` +
      `main_peak\\s*:\\s*${rustNumberPattern(expected.mainPeak)}[\\s\\S]*?` +
      `sub_peak\\s*:\\s*${rustNumberPattern(expected.subPeak)}[\\s\\S]*?` +
      `cutoff\\s*:\\s*${rustNumberPattern(expected.cutoff)}[\\s\\S]*?` +
      `sub_cutoff\\s*:\\s*${rustNumberPattern(expected.subCutoff)}[\\s\\S]*?` +
      `attack\\s*:\\s*${rustNumberPattern(expected.attack)}`,
    "s"
  );
  assert.match(source, configPattern, `${label} ${id} bass config should match shared registry`);
}

function assertGuitarConfig(source, label, id, expected) {
  const configSource = extractGuitarToneBranch(source, id);
  ["drive", "input", "peak", "lowpass", "highpass", "body", "mid", "spread", "sustain", "mute", "scratch"].forEach((key) => {
    assert.match(configSource, new RegExp(`${key}\\s*:\\s*${numberPattern(expected[key])}`), `${label} ${id} guitar ${key} should match shared registry`);
  });
}

function assertNativeGuitarConfig(source, label, id, expected) {
  const fnName = `generated_guitar_tone_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const configPattern = new RegExp(
    `fn\\s+${fnName}\\s*\\(\\)\\s*->\\s*NativeGuitarToneConfig\\s*\\{[\\s\\S]*?NativeGuitarToneConfig\\s*\\{[\\s\\S]*?` +
      `drive\\s*:\\s*${rustNumberPattern(expected.drive)}[\\s\\S]*?` +
      `input\\s*:\\s*${rustNumberPattern(expected.input)}[\\s\\S]*?` +
      `peak\\s*:\\s*${rustNumberPattern(expected.peak)}[\\s\\S]*?` +
      `lowpass\\s*:\\s*${rustNumberPattern(expected.lowpass)}[\\s\\S]*?` +
      `highpass\\s*:\\s*${rustNumberPattern(expected.highpass)}[\\s\\S]*?` +
      `body\\s*:\\s*${rustNumberPattern(expected.body)}[\\s\\S]*?` +
      `mid\\s*:\\s*${rustNumberPattern(expected.mid)}[\\s\\S]*?` +
      `spread\\s*:\\s*${rustNumberPattern(expected.spread)}[\\s\\S]*?` +
      `sustain\\s*:\\s*${rustNumberPattern(expected.sustain)}[\\s\\S]*?` +
      `mute\\s*:\\s*${rustNumberPattern(expected.mute)}[\\s\\S]*?` +
      `scratch\\s*:\\s*${rustNumberPattern(expected.scratch)}`,
    "s"
  );
  assert.match(source, configPattern, `${label} ${id} guitar config should match shared registry`);
}

function assertChordInstrumentConfig(source, label, id, expected) {
  const configSource = id === "pocket" ? extractChordInstrumentFallback(source) : extractInstrumentBranch(source, "name", id);
  ["rootWave", "wave", "filter"].forEach((key) => {
    assert.match(configSource, new RegExp(`${key}\\s*:\\s*"${expected[key]}"`), `${label} ${id} chord ${key} should match shared registry`);
  });
  ["peak", "freq", "filterQ", "attack", "decay", "sustain", "release", "durMul", "spreadMul", "maxLiveDur"].forEach((key) => {
    assert.match(configSource, new RegExp(`${key}\\s*:\\s*${numberPattern(expected[key])}`), `${label} ${id} chord ${key} should match shared registry`);
  });
}

function assertLeadInstrumentConfig(source, label, id, expected) {
  const configSource = id === "pulse" ? extractLeadInstrumentFallback(source) : extractInstrumentBranch(source, "name", id);
  ["wave", "filter"].forEach((key) => {
    assert.match(configSource, new RegExp(`${key}\\s*:\\s*"${expected[key]}"`), `${label} ${id} lead ${key} should match shared registry`);
  });
  ["peak", "freq", "durMul"].forEach((key) => {
    assert.match(configSource, new RegExp(`${key}\\s*:\\s*${numberPattern(expected[key])}`), `${label} ${id} lead ${key} should match shared registry`);
  });
}

function assertNativeLeadInstrumentConfig(source, label, id, expected) {
  const fnName = `generated_native_lead_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const configPattern = new RegExp(
    `fn\\s+${fnName}\\s*\\(\\)\\s*->\\s*NativeLeadConfig\\s*\\{[\\s\\S]*?NativeLeadConfig\\s*\\{[\\s\\S]*?` +
      `wave\\s*:\\s*"${expected.wave}"[\\s\\S]*?` +
      `peak\\s*:\\s*${rustNumberPattern(expected.peak)}[\\s\\S]*?` +
      `filter\\s*:\\s*"${expected.filter}"[\\s\\S]*?` +
      `freq\\s*:\\s*${rustNumberPattern(expected.freq)}[\\s\\S]*?` +
      `dur_mul\\s*:\\s*${rustNumberPattern(expected.durMul)}`,
    "s"
  );
  assert.match(source, configPattern, `${label} ${id} lead config should match shared registry`);
}

function assertNativeChordInstrumentConfig(source, label, id, expected) {
  const fnName = `generated_native_chord_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const configPattern = new RegExp(
    `fn\\s+${fnName}\\s*\\(\\)\\s*->\\s*NativeChordConfig\\s*\\{[\\s\\S]*?NativeChordConfig\\s*\\{[\\s\\S]*?` +
      `root_wave\\s*:\\s*"${expected.rootWave}"[\\s\\S]*?` +
      `wave\\s*:\\s*"${expected.wave}"[\\s\\S]*?` +
      `peak\\s*:\\s*${rustNumberPattern(expected.peak)}[\\s\\S]*?` +
      `filter\\s*:\\s*"${expected.filter}"[\\s\\S]*?` +
      `freq\\s*:\\s*${rustNumberPattern(expected.freq)}[\\s\\S]*?` +
      `filter_q\\s*:\\s*${rustNumberPattern(expected.filterQ)}[\\s\\S]*?` +
      `attack\\s*:\\s*${rustNumberPattern(expected.attack)}[\\s\\S]*?` +
      `decay\\s*:\\s*${rustNumberPattern(expected.decay)}[\\s\\S]*?` +
      `sustain\\s*:\\s*${rustNumberPattern(expected.sustain)}[\\s\\S]*?` +
      `release\\s*:\\s*${rustNumberPattern(expected.release)}[\\s\\S]*?` +
      `dur_mul\\s*:\\s*${rustNumberPattern(expected.durMul)}[\\s\\S]*?` +
      `spread_mul\\s*:\\s*${rustNumberPattern(expected.spreadMul)}[\\s\\S]*?` +
      `max_live_dur\\s*:\\s*${rustNumberPattern(expected.maxLiveDur)}`,
    "s"
  );
  assert.match(source, configPattern, `${label} ${id} chord config should match shared registry`);
  if (expected.filterSweep == null) {
    assert.match(source, new RegExp(`fn\\s+${fnName}\\s*\\(\\)\\s*->\\s*NativeChordConfig\\s*\\{[\\s\\S]*?filter_sweep\\s*:\\s*None`, "s"), `${label} ${id} chord filter sweep should match shared registry`);
  } else {
    assert.match(source, new RegExp(`fn\\s+${fnName}\\s*\\(\\)\\s*->\\s*NativeChordConfig\\s*\\{[\\s\\S]*?filter_sweep\\s*:\\s*Some\\(${rustNumberPattern(expected.filterSweep)}\\)`, "s"), `${label} ${id} chord filter sweep should match shared registry`);
  }
}

function extractBassToneBranch(source, id) {
  const match = source.match(new RegExp(`if\\s*\\([^)]*tone\\s*={0,2}={0,1}\\s*"${id}"[\\s\\S]*?return\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `${id} bass branch missing`);
  return match[1];
}

function extractGuitarToneBranch(source, id) {
  const match = source.match(new RegExp(`if\\s*\\([^)]*tone\\s*={0,2}={0,1}\\s*"${id}"[\\s\\S]*?return\\s*\\{([\\s\\S]*?)\\}`));
  if (match) return match[1];
  const fallback = source.match(/return\s*\{drive\s*:[\s\S]*?\};?\s*\n\}/);
  assert.ok(id === "high_gain" && fallback, `${id} guitar branch missing`);
  return fallback[0];
}

function extractInstrumentBranch(source, variable, id) {
  const match = source.match(new RegExp(`if\\s*\\([^)]*${variable}\\s*={0,2}={0,1}\\s*"${id}"[\\s\\S]*?return\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `${id} instrument branch missing`);
  return match[1];
}

function extractChordInstrumentFallback(source) {
  const match = source.match(/return\s*\{[\s\S]*?rootWave\s*:\s*"triangle"[\s\S]*?maxLiveDur\s*:\s*1(?:\.15)?[\s\S]*?\};?\s*\n\}/);
  assert.ok(match, "pocket chord fallback missing");
  return match[0];
}

function extractLeadInstrumentFallback(source) {
  const match = source.match(/return\s*\{[^{}]*wave\s*:\s*"square"[^{}]*peak\s*:\s*(?:0?\.2(?:0)?)[^{}]*durMul\s*:\s*1[^{}]*\}/);
  assert.ok(match, "pulse lead fallback missing");
  return match[0];
}

function numberPattern(value) {
  if (value === 1) return "1(?:\\.0)?";
  if (value > 0 && value < 1) {
    const fixed = String(value).replace(/^0/, "0?");
    return `(?:${fixed})`;
  }
  return String(value).replace(".", "\\.");
}

function numberLiteral(value) {
  return String(value);
}

function rustNumberLiteral(value) {
  const number = Number(value);
  return Number.isInteger(number) ? `${number}.0` : String(number);
}

function assertRustConst(source, name, expected) {
  assert.match(
    source,
    new RegExp(`const\\s+${name}\\s*:\\s*f(?:32|64)\\s*=\\s*${rustNumberPattern(expected)}\\s*;`),
    `Pocket DAW native ${name} should match shared Chordsmith constants`
  );
}

function rustNumberPattern(value) {
  const base = Number.isInteger(value) && value !== 1
    ? `${String(value)}(?:\\.0)?`
    : numberPattern(value);
  return `${base}(?:_f(?:32|64))?`;
}
