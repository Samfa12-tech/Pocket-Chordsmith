# Command Line Chart Compile

Compile one JSON file:

```powershell
Godot_v4.6-stable_win64_console.exe --headless --path "C:\path\to\project" --script res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd -- --source "res://music/level_01.json"
```

Compile a folder recursively and save resources beside source JSON files:

```powershell
Godot_v4.6-stable_win64_console.exe --headless --path "C:\path\to\project" --script res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd -- --source "res://music/charts" --beside-source
```

Supported source shapes:

- direct Pocket Chordsmith project JSON
- `{ "pocketChordsmithProject": { ... } }`
- `{ "levels": [{ "levelId": "...", "pocketChordsmithProject": { ... } }] }`

