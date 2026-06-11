# Consolidation Report

## Summary

The Pocket Audio family has been consolidated into the public `Pocket-Chordsmith` monorepo structure.

- Godot addon source now lives at `addons/pocket_chordsmith/`.
- Pocket Chordsmith web now lives at `apps/chordsmith-web/`.
- Pocket DJ now lives at `apps/pocket-dj/`.
- Pocket DAW now lives at `apps/pocket-daw/`.
- PCS format has a scaffold at `packages/pcs-format/`.
- Pocket Audio Core remains at `packages/pocket-audio-core/`.

## Final Folder Layout

```text
Pocket-Chordsmith/
  README.md
  CHANGELOG.md
  LICENSES.md
  .gitignore
  addons/
    pocket_chordsmith/
  apps/
    chordsmith-web/
    pocket-dj/
    pocket-daw/
  packages/
    pcs-format/
    pocket-audio-core/
  docs/
    architecture/
    compatibility/
    release-checklists/
    repo-consolidation/
```

## Sources Used

- Godot addon: local `godot-addon/addons/pocket_chordsmith/`, cross-checked against the public `Pocket-Chordsmith` clone.
- Pocket Chordsmith web: local `web-app/`, using `pocket_chordsmith_v68_core_bridge.html` as current and retaining `pocket_chordsmith_v67_direct_godot_push.html`.
- Pocket DJ: local `pocket_dj/`, using `pocket_dj_v1g_core_bridge.html` as current and retaining `pocket_dj_v1f_push_handoffs.html`.
- Pocket DAW: local nested `pocket-daw/` working tree, because it contains newer uncommitted integration work than the shallow `pocket-daw` clone.
- Pocket Audio Core: existing `packages/pocket-audio-core/` package.
- PCS format: new scaffold only.

## Validation

- Confirmed `addons/pocket_chordsmith/plugin.cfg` exists.
- Confirmed `apps/chordsmith-web/index.html` exists.
- Confirmed `apps/pocket-dj/index.html` exists.
- Confirmed `apps/pocket-daw/package.json` keeps `"private": true`.
- Ran `npm install` in `apps/pocket-daw`: passed, 0 vulnerabilities reported.
- Ran `npm test` in `apps/pocket-daw`: passed, 25 test files and 83 tests.
- Ran `npm run build` in `apps/pocket-daw`: passed.
- Checked Chordsmith and DJ HTML entry/current files for broken local `href`/`src` references and accidental absolute `/assets/` references: passed.
- Checked `addons/`, `apps/`, `packages/`, and `docs/` for nested `.git` folders: none found.
- Checked imported source/docs for files over 5 MB outside generated folders: none found.
- Searched imported source/docs for obvious API keys, secrets, recovery codes, and private keys: no secret material found; matches were benign code variables or documentation warnings.

## Warnings And Limitations

- Pocket DAW build emitted a Vite warning about `@tauri-apps/api/core.js` being both dynamically and statically imported. The build still completed successfully.
- Pocket DAW native Tauri packaging was not run in this pass.
- Browser handoffs were statically checked but not manually verified in a live browser/Godot Editor session.
- `.pocketdaw` demo files remain ignored by the requested root `.gitignore` rule and were not committed as source.
- Local source/reference folders such as `web-app/`, `godot-addon/`, `pocket_dj/`, and `pocket-daw/` remain on disk but are ignored by the monorepo.

## Recommended Next Steps

1. Open `apps/chordsmith-web/index.html` in a browser and verify v68 playback/export plus v67 direct Godot push fallback behavior.
2. Open `apps/pocket-dj/index.html` and verify `PCS1:` import plus edit-back handoff.
3. Enable the addon from `addons/pocket_chordsmith/` inside Godot and verify the local push receiver.
4. Run a clean-machine Pocket DAW Tauri package check before publishing installers.
5. Decide when to freeze or archive the old private `pocket-chordsmith-web` and `pocket-daw` repositories.
