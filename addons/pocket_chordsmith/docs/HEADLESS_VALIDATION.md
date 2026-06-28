# Headless Validation, Push Smoke, and Receiver Review

Use this as the deterministic addon validation path before addon releases, game-pack changes, or Push-to-Godot changes. Replace `godot` with the installed console binary when needed, for example `Godot_v4.6-stable_win64_console.exe` on Windows.

## Headless Gate

Run these from a Godot project that has `addons/pocket_chordsmith/` installed and enabled:

```powershell
godot --headless --path <project> --editor --quit
godot --headless --path <project> res://addons/pocket_chordsmith/demos/demo_music_level.tscn --quit-after 2
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd -- --source res://addons/pocket_chordsmith/demos/demo_pocket_chordsmith_project.json --output res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart res://addons/pocket_chordsmith/demos/demo_pcs_chart.tres --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres --report res://pocket_chordsmith_integration_report.md
```

For Pocket DAW Godot Adaptive Pack checks, import the real exported ZIP and validate the generated chart/profile:

```powershell
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/import_daw_game_pack.gd -- --pack <godot-adaptive-pack.zip> --output-root res://music/pocket_chordsmith_packs
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart <imported-chart.tres> --profile <imported-profile.tres> --report res://pocket_chordsmith_daw_pack_report.md
```

The gate passes only when each command exits `0`, validation prints `OK`, and reports have no errors. Warnings are acceptable only when they are expected for the selected playback profile, such as missing stems in a preview-only profile.

## Direct Push Smoke

Direct browser push requires an open Godot editor with the addon enabled because the receiver is started by the `Chordsmith` editor screen.

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
