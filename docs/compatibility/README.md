# Compatibility

Compatibility notes for PCS/JSON interchange, handoffs, and app-to-runtime behavior live here as the family settles around shared packages.

## Current Baselines

- Pocket Chordsmith project schema: `16`.
- Main interchange prefix: `PCS1:`.
- Pocket Chordsmith current app: `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html`.
- Pocket DJ current app: `apps/pocket-dj/pocket_dj_v1g_core_bridge.html`.
- Godot addon release baseline: `1.1.7`.

## Handoff Rules

- Chordsmith-to-DJ handoff packages the source song as `PCS1:` inside the existing `PocketHandoff` browser envelope.
- Browser handoffs use URL fragments, `window.name`, and same-origin `localStorage` fallback.
- `apps/chordsmith-web/index.html` and `apps/pocket-dj/index.html` must preserve both `window.location.search` and `window.location.hash` when redirecting to the active single-file app.
- Godot push first tries `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`, then keeps clipboard/manual paste fallback.

## Shared Package Direction

- `packages/pcs-format/` is the future home for canonical PCS format definitions, migrations, fixtures, and compatibility helpers.
- `packages/pocket-audio-core/` is the shared runtime/export direction, but apps should keep existing import/export fallbacks until parity is proven.
