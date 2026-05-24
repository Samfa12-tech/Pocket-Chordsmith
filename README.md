# Pocket Chordsmith

Pocket Chordsmith is a single-file, mobile-first music sketchpad for building chord progressions, beats, basslines, melodies, arrangements, MIDI exports, and WAV exports in the browser.

The current app build is `pocket_chordsmith_v61_rock_guitar_fix.html`. `index.html` redirects to it so the project can be uploaded as a simple web app bundle, including on itch.io.

## Included Files

- `index.html` - hosting entry point.
- `pocket_chordsmith_v61_rock_guitar_fix.html` - current Pocket Chordsmith app.
- `icon.png` - browser favicon and mobile home-screen icon.
- `demo.json` - standalone demo project data.
- `background.png` - promotional/background artwork for store pages or future app surfaces.
- `skills/pocket-chordsmith-composer/SKILL.md` - Codex skill for creating import-ready Pocket Chordsmith project JSON.
- `POCKET_CHORDSMITH_CODEX_CONTEXT.md` - stable Codex/AI development context covering app rules, compatibility expectations, feature behaviour, testing checklists, and update discipline.

## Local Use

Open `index.html` or `pocket_chordsmith_v61_rock_guitar_fix.html` in a browser. For stricter browser testing, serve the folder locally:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

## Release Notes

For itch.io, upload a zip that contains at least:

- `index.html`
- `pocket_chordsmith_v61_rock_guitar_fix.html`
- `icon.png`

Keep generated exports, old local snapshots, and add-on packaging zips out of Git unless they are intentional release artifacts.

## Codex / AI Development Context

Before using Codex or another AI coding assistant to modify Pocket Chordsmith, read:

- `POCKET_CHORDSMITH_CODEX_CONTEXT.md`

That file contains the stable development rules for the app, including Simple/Advanced mode expectations, triplet behaviour, MIDI import/export requirements, save compatibility, WAV export, mobile UI constraints, and testing checklists.
