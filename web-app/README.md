# Pocket Chordsmith

Pocket Chordsmith is a single-file, mobile-first music sketchpad for building chord progressions, beats, basslines, melodies, arrangements, MIDI exports, and WAV exports in the browser.

The current app build is `pocket_chordsmith_v67_direct_godot_push.html`. `index.html` redirects to it so the project can be uploaded as a simple web app bundle, including on itch.io.

## Included Files

- `index.html` - hosting entry point.
- `pocket_chordsmith_v67_direct_godot_push.html` - current Pocket Chordsmith app.
- `pocket_chordsmith_v65_midi_guitar_import_polish.html` - previous MIDI/guitar import polish build.
- `pocket_chordsmith_v65_notes_and_limitations.txt` - implementation notes, limitations, and manual test recommendations for v65.
- `pocket_chordsmith_v64_western_sounds.html` - previous western sound compatibility build.
- `pocket_chordsmith_v63_sound_timing_controls.html` - previous sound and timing controls build.
- `pocket_chordsmith_v62_key_chord_randomiser.html` - older key/chord randomiser build.
- `pocket_chordsmith_v61_rock_guitar_fix.html` - older rock guitar fix build.
- `icon.png` - browser favicon and mobile home-screen icon.
- `demo.json` - standalone demo project data.
- `background.png` - promotional/background artwork for store pages or future app surfaces.
- `skills/pocket-chordsmith-composer/SKILL.md` - Codex skill for creating import-ready Pocket Chordsmith project JSON.
- `POCKET_CHORDSMITH_CODEX_CONTEXT.md` - stable Codex/AI development context covering app rules, compatibility expectations, feature behaviour, testing checklists, and update discipline.

## Local Use

Open `web-app/index.html` or `web-app/pocket_chordsmith_v67_direct_godot_push.html` in a browser from this workspace. For stricter browser testing, serve the `web-app` folder locally:

```powershell
cd web-app
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

The project also has a local npm toolchain for repeatable preview, build, test, and packaging work:

```powershell
cd web-app
npm install
npm run dev
npm run build
npm run test:e2e
npm run package:itch
```

- `npm run dev` serves the app on `0.0.0.0` so phones on the local network can open it.
- `npm run preview` serves the built app on `0.0.0.0`.
- `npm run test:e2e` runs Playwright from the project-local dependency.
- `npm run package:itch` builds and writes `../releases/web-app/pocket-chordsmith-web.zip`.

## Release Notes

### v67 Direct Godot Push

- New file/version: `pocket_chordsmith_v67_direct_godot_push.html`.
- `Push to Godot` first posts the current `PCS1:` code to the local Godot addon receiver at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`.
- If the receiver is unavailable or the browser blocks local HTTP, the button falls back to the v66 clipboard/paste instructions.

### v66 Push to Handoffs

- New file/version: `pocket_chordsmith_v66_push_to_handoffs.html`.
- Functions changed/added: adds `POCKET_CHORDSMITH_URL`, `POCKET_DJ_URL`, `PocketHandoff` URL/window/localStorage helpers, `copyTextForHandoff()`, `setPushHandoffStatus()`, `openHandoffUrl()`, `pushToPocketDj()`, `consumeIncomingChordsmithHandoff()`, and `pushToGodot()`; updates project/export UI and button binding.
- New data fields: none. Handoffs use existing `PCS1:` share-code project data.
- Compatibility/migration logic: schema remains `16`; existing import/export/share-code flow is unchanged; Godot and Pocket DJ receive the same full-song project data as Copy Share Code.
- Tests actually run: cached Node `vm.Script` syntax parse of the single-file script; static ID/event wiring checks; rendered browser smoke checks for page load and handoff controls.
- Known limitations: browser pop-up/clipboard permissions can still require the user to paste the shown code manually; public itch project pages may need direct app upload/launch URLs to forward URL handoffs into the embedded HTML app; Godot import needs manual verification inside the Godot editor.

### v65 MIDI/Guitar Import Polish

- New file/version: `pocket_chordsmith_v65_midi_guitar_import_polish.html`.
- Functions changed/added: adds playback-section visual following, guitar fill actions, guitar pattern generation from chords, connected hold rendering, safer visible-section validation, unified import auto-detection, clearer MIDI import summaries, compact JSON export, and supporting helpers around section-aware guitar lengths.
- New data fields: `followPlaybackSection`, defaulting to enabled. Project schema remains `16`.
- Compatibility/migration logic: raw JSON and `PCS1:` share codes continue through compatible import paths; v64 western sounds remain supported; MIDI-only imports keep guitar disabled until the user explicitly fills or enables guitar; companion hold/slide/tuplet arrays remain included in exports.
- Tests actually run: `node --check`; static VM tests for generated guitar lengths and 3/4 resolution 2 patterns; raw JSON auto-import parsing; `PCS1:` share-code auto-import parsing.
- Known limitations: real-device Web Audio, touch UI, MIDI-file visual comparison, WAV export, MIDI export, live drum recording, all older imports, and exhaustive v64 regression tests still need manual browser QA.

Recommended manual checks before calling v65 fully release-ready:

- Open v65 on desktop and phone.
- Load the demo and confirm Play Song visibly follows A/B/C/D section playback.
- Import raw JSON and `PCS1:` share codes through the main Import button.
- Import a MIDI-only project, enable/fill guitar, and confirm guitar is audible instead of silently empty.
- Confirm held melody notes visually connect and survive JSON/share-code export and re-import.
- Test MIDI export and WAV export with holds, guitar, bass, and multiple melody tracks.

### v64 Western Sounds

- New file/version: `pocket_chordsmith_v64_western_sounds.html`.
- Functions changed/added: adds procedural `saloon_piano`, `banjo`, `harmonica`, `cowboy_whistle`, `western_twang`, western drum/guitar presets, `fillDrumPresetForSection()`, `setSectionProgressionDegrees()`, and `applyWesternMelodyShowcase()`; updates chord, melody, guitar, demo, WAV, and preset rendering paths.
- New data fields: none. The update reuses existing `chordInstrument`, `melodyInstruments*`, `guitarTone`, `guitarPatternPreset`, section grids, and guitar patterns.
- Compatibility/migration logic: schema remains `16`; old projects keep their existing sounds, and v64 projects with western enum values normalise in v64 without changing the saved project shape.
- Tests actually run: bundled Node `vm.Script` syntax parse of the single-file script; control/option wiring audit for western controls; headless Chrome/CDP smoke through `index.html` redirect; Advanced-mode western option checks; western demo load; JSON, Share Code and localStorage round trips; quantized MIDI event generation; single-section WAV export; live Demo playback time-signature switch from 4/4 to 3/4 with the `playback restarted safely` status; mobile-width overflow check at 390px; console/runtime error collection.
- Known limitations: western sounds are procedural Web Audio approximations, not sampled banjo, harmonica, piano, or guitar recordings. MIDI export remains note/channel based and does not emit General MIDI program-change metadata for western timbres.

### v63 Sound and Timing Controls

- New file/version: `pocket_chordsmith_v63_sound_timing_controls.html`.
- Functions changed/added: adds `CHORD_INSTRUMENTS`, `MELODY_INSTRUMENTS`, `LIVE_DRUM_RECORD_LOOKAHEAD_SECONDS`, `LIVE_CHORD_VOICE_LIMIT`, `chordInstrumentConfig()`, `chordEnvelope()`, `playChordTone()`, `makeOfflineChordTone()`, `pruneChordVoices()`, `silenceChordVoices()`, `previewCurrentChordSetting()`, `bindKeyboardShortcuts()`, `transposeChromaticMelodiesForKeyChange()`, `alignMelodyPickerToKey()`, `resetLiveRecordStepClock()`, `rememberScheduledStepForRecording()` and `nearestLiveRecordStep()`; updates `applyRandomIdea()`, `fillTrack()`, `playChord()`, `leadInstrumentConfig()`, `playLeadInstrument()`, `playLeadPhraseInstrument()`, `makeOfflineLeadPhrase()`, WAV chord rendering, `recordDrumPadHit()`, `schedulePlanStep()`, `startPlayback()`, `stopPlayback()`, `restartPlaybackPlanAfterStructureChange()`, `normaliseProjectData()`, `exportProject()`, `importProject()`, `renderAll()` and `bindControls()`.
- New data fields: `chordInstrument`, defaulting to `pocket`.
- Compatibility/migration logic: schema remains `16`; old projects default to the Pocket Chordsmith chord sound and old melody instrument IDs are preserved.
- Tests actually run: bundled Node `vm.Script` syntax parse of the single-file script; control ID wiring audit; headless browser checks for Advanced chord sound placement, melody instrument options, Fill Quarter at sixteenth resolution, random-key selector sync, JSON export of `chordInstrument`, mobile-width horizontal overflow, rapid chord-setting changes with the live chord voice cap present, floating Undo wiring, chord-setting undo, Ctrl+Z undo, and input-field Ctrl+Z avoidance.
- Known limitations: new sounds are Web Audio approximations, not sampled instrument libraries. Live drum record now quantises against the audio scheduler's nearest known grid step, but device-specific input/audio latency may still vary.

### v62 Key Chord Randomiser

- New file/version: `pocket_chordsmith_v62_key_chord_randomiser.html`.
- Functions changed/added: adds curated `CHORD_RANDOMISER_PATTERNS`, `DRUM_PRESETS`, and `MELODY_IDEA_STYLES`; adds `randomChoice()`, `randomKeyAndChordPattern()`, `applyRandomIdea()`, `applyDrumPreset()`, drum-preset rendering helpers, melody-index helpers, and `applyMelodyIdea()`; updates `renderAll()`, `bindControls()`, and `init()` to keep the new controls wired.
- New data fields: none. The randomiser writes into the existing global key/scale fields and active section progression. Drum presets write into the existing kick, snare, and hat grid. Melody idea writes into the active melody track only.
- Compatibility/migration logic: schema remains `16`; old projects continue through the existing import and normalisation paths.
- Tests actually run: bundled Node `vm.Script` syntax parse of the single-file script; new-control ID wiring audit; headless Chrome/CDP smoke tests through `index.html` redirect, including random chord activation, selector sync, Metal drum preset activation, Advanced-mode Melody idea activation, autosave dirty state, mobile fit at 390px, runtime error collection, and a mojibake check for the current v62 page text.
- Known limitations: the key/chord randomiser changes the global key/scale and the active section's four-bar progression. Drum presets only fill kick, snare, and hat. Melody idea fills the active melody track only; it does not generate bass, guitar rhythm, lyrics, or full multi-section arrangements.

For itch.io, upload a zip that contains at least:

- `index.html`
- `pocket_chordsmith_v67_direct_godot_push.html`
- `icon.png`

Keep generated exports, old local snapshots, and add-on packaging zips out of Git unless they are intentional release artifacts.

Older local HTML snapshots live in `../archive/web-app-snapshots/`.

## Codex / AI Development Context

Before using Codex or another AI coding assistant to modify Pocket Chordsmith, read:

- `POCKET_CHORDSMITH_CODEX_CONTEXT.md`

That file contains the stable development rules for the app, including Simple/Advanced mode expectations, triplet behaviour, MIDI import/export requirements, save compatibility, WAV export, mobile UI constraints, testing checklists, and upcoming "Push to" work.
