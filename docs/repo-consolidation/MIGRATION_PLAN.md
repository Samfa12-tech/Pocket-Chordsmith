# Migration Plan

## What Moved

- Godot addon source moved from the local nested source folder `godot-addon/addons/pocket_chordsmith/` into the public monorepo path `addons/pocket_chordsmith/`.
- Pocket Chordsmith web moved from `web-app/` into `apps/chordsmith-web/`.
- Pocket DJ moved from `pocket_dj/` into `apps/pocket-dj/`.
- Pocket DAW moved from the nested `pocket-daw/` checkout into `apps/pocket-daw/`.

## What Stayed

- `addons/pocket_chordsmith/` remains the Godot addon path.
- `packages/pocket-audio-core/` remains the shared audio runtime/export package location.
- Local source/reference folders such as `web-app/`, `godot-addon/`, `pocket_dj/`, and `pocket-daw/` are ignored after consolidation and should be treated as import references, not canonical source.

## Repos That Can Eventually Be Archived

- `pocket-chordsmith-web` can likely be frozen once the monorepo web app source and hosting/release path are verified.
- `pocket-daw` can likely be frozen after the imported `apps/pocket-daw/` app is confirmed as the active development path.
- Any addon-only workflow should point to `addons/pocket_chordsmith/` in this repository before old standalone copies are archived.

## Manual Verification Still Needed

- Open Pocket Chordsmith web through `apps/chordsmith-web/index.html` and verify v68/v67 handoff paths in real browsers.
- Open Pocket DJ through `apps/pocket-dj/index.html` and verify `PCS1:` import plus edit-back handoff to Chordsmith.
- Verify Godot Editor addon enablement from `addons/pocket_chordsmith/plugin.cfg`.
- Run a native Tauri build for Pocket DAW on a clean machine before cutting any installer.
- Confirm public GitHub visibility/licensing expectations before advertising app source as reusable.
