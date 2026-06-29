# Headless Validation, Push Smoke, and Receiver Review

Use this as the deterministic addon validation path before addon releases, game-pack changes, or Push-to-Godot changes. Replace `godot` with the installed console binary when needed, for example `Godot_v4.6-stable_win64_console.exe` on Windows.

## Headless Gate

Run these from a Godot project that has `addons/pocket_chordsmith/` installed and enabled:

```powershell
godot --headless --path <project> --editor --quit
godot --headless --path <project> res://addons/pocket_chordsmith/demos/demo_music_level.tscn --quit-after 2
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd -- --source res://addons/pocket_chordsmith/demos/demo_pocket_chordsmith_project.json --output res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/export_pocket_chordsmith_event_trace.gd -- --chart res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres --report res://pocket_chordsmith_godot_event_trace.json
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres --report res://pocket_chordsmith_integration_report.md
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_native_preview.gd -- --chart res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres --report res://pocket_chordsmith_native_preview_report.json
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/profile_pocket_chordsmith_preview_performance.gd -- --chart res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/render_pocket_chordsmith_preview_audio.gd -- --chart res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres --output-root res://pocket_chordsmith_preview_render
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_preview_mix.gd -- --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
```

If the preview mix validator reports muted Chordsmith buses or old effects on
`Music_Master`, `Music_FX`, `Music_Guitar`, or another Chordsmith music bus,
repair the project mixer and rerun the validator:

```powershell
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/repair_pocket_chordsmith_preview_mix.gd -- --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_preview_mix.gd -- --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
```

The same repair is available in the editor `Chordsmith` tab as `Reset Preview
Mix`. It only touches the Chordsmith music buses: it creates/routes missing
buses, unmutes them, and removes saved effects from those buses so the preview
uses Godot's mixer volumes without hidden reverb, distortion, or legacy guitar
FX.

For Pocket DAW Godot Adaptive Pack checks, import the real exported ZIP and validate the generated chart/profile:

```powershell
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/import_daw_game_pack.gd -- --pack <godot-adaptive-pack.zip> --output-root res://music/pocket_chordsmith_packs
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart <imported-chart.tres> --profile <imported-profile.tres> --report res://pocket_chordsmith_daw_pack_report.md
```

The gate passes only when each command exits `0`, validation prints `OK`, and reports have no errors. Warnings are acceptable only when they are expected for the selected playback profile, such as missing stems in a preview-only profile. The event trace exporter writes normalized compiled-event JSON so Godot imports can be compared against Chordsmith browser/core event traces without inspecting `.tres` resources by hand. The native preview validator generates representative bass, melody, guitar, and chord note streams so stream packing, slide handling, stereo melody output, rhythm-guitar synthesis, and chord voice synthesis fail deterministically instead of only during editor audition. When `--report` is provided, it also writes JSON per-event preview metrics such as track type, instrument, peak, RMS, roughness/brightness proxies, duration, sample count, and source flags; use that report to debug lane or instrument loudness differences against Chordsmith/core traces. The preview performance profiler measures full native prewarm cost, Play-button startup cost, and first preview process-frame cost so dense charts do not regress into editor freezes. The preview-audio renderer bakes text-only chart previews into visible WAV files and a generated stem profile; the default render path uses the fast sample kit, while `--prefer-native` is available only for deliberate slower experiments. The preview mix validator keeps the bundled sample preview dry by default: no automatic master/guitar/track-bus FX, no hidden bass ducking, and recommended buses unmuted/routed for Godot mixer control.

For a stricter browser-to-Godot import parity check, run the Pocket Audio Core comparator from `packages/pocket-audio-core/` with the same JSON or `PCS1:` source:

```powershell
npm run compare:chordsmith-godot-trace -- --source <project.json-or-pcs1.txt> --godot-bin <Godot_console.exe> --godot-project <project-dir> --voice-metrics --keep-reports
```

This drives the real browser `PocketChordsmithParityTrace.fromProject(...)` hook, compiles the same source through the Godot addon, exports Godot's compiled-event trace, and compares the normalized musical events. `--native-metrics` writes the Godot native-preview stream metrics report. `--voice-metrics` also renders representative Chordsmith browser preview voices in headless Chromium and prints browser-to-Godot ratios for peak, RMS, mean absolute sample delta, and zero-crossing rate. Treat those ratios as debugging evidence for the preview approximation, not as proof of mastered game-audio identity; use Pocket DAW/Godot adaptive packs or rendered stems for exact shipped mix parity.

## Direct Push Smoke

Direct browser push requires an open Godot editor with the addon enabled because the receiver is started by the `Chordsmith` editor screen.

After replacing addon files in a project that is already open in Godot, restart the editor before judging playback. Godot can keep old script/resource instances alive after hot-swapping addon files, and disabling/re-enabling editor plugins while other editor add-ons are running can be less stable than a full close/reopen.

1. Open the Godot project in the editor.
2. Enable the `Pocket Chordsmith` plugin.
3. Open the `Chordsmith` tab and leave it visible.
4. Confirm the receiver answers:

```powershell
Invoke-RestMethod http://127.0.0.1:9087/pocket-chordsmith/health
```

5. Open the current Pocket Chordsmith web app or hosted itch build.
6. Load a known song with non-default BPM, key, scale, sections, and at least drums, bass, chords, melody, and guitar if possible.
7. Click `Push to Godot`.
8. Confirm the Godot `Chordsmith` tab imports the song, reports success, and shows the expected BPM/key/scale and a non-zero event count.
9. Save the chart resource and run the runtime validator against the saved chart.
10. If the browser falls back to hidden form submit, clipboard, or manual paste, do not record automatic direct push as verified until the Godot editor visibly imports the song. Paste the same `PCS1:` payload in the Godot tab when needed and record that path as fallback/manual import only.

Record the browser URL or build label, Godot version, addon version, receiver health result, import result, chart path, validation command, and validation result.

## Receiver Security Review

The editor receiver in `editor/pcs_push_receiver.gd` is intentionally narrow in what it can do:

- binds only to `127.0.0.1`;
- accepts only `GET /pocket-chordsmith/health`, `POST /pocket-chordsmith/push-to-godot`, and CORS `OPTIONS`;
- caps request bodies at `1 MiB`;
- times clients out after `2500 ms`;
- imports only through the editor callback and returns `503` when the importer is not ready.

It also intentionally returns broad CORS headers, including `Access-Control-Allow-Origin: *`, so hosted Pocket Chordsmith pages can POST to the local editor receiver. This differs from Pocket DAW's stricter local bridge, which requires loopback hosts, trusted local origins, and bearer-token authorization for live control endpoints.

Keep the current broad CORS stance only while the receiver remains editor-only, loopback-only, import-only, and bounded. Revisit origin allow-listing before adding any receiver action that writes outside chart import, controls runtime playback, reads project files, exposes filesystem paths, or stays active without the editor tab.

Chrome may still block hosted itch iframe pages from reaching loopback before
the receiver can accept the push. A console message such as `Permission was
denied for this request to access the loopback address space` means the browser
embedding policy blocked localhost access; it is not proof that Godot ignored a
valid payload. In that case use a local/standalone Chordsmith build or paste the
copied `PCS1:` code into the Chordsmith tab.
