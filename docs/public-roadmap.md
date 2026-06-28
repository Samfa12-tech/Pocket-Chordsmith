# Public Roadmap

This roadmap is intentionally practical. It describes areas where contribution
is useful without promising dates or treating WIP components as finished public
products.

## Near Term

- Keep licensing and package metadata clear as components mature.
- Improve `PCS1:` and JSON compatibility fixtures.
- Add small examples for Chordsmith -> DJ, Chordsmith -> Godot, and Core export flows.
- Keep CI covering core, web, DJ, DAW, and repo hygiene.
- Document manual release checks for itch and Godot addon publishing.

## Pocket Chordsmith

- Preserve the current browser app behavior and share-code compatibility.
- Improve docs around imports, exports, MIDI, WAV, and Godot push.
- Add tests around existing behaviors before large UI or engine changes.

## Pocket DJ

- Keep DJ focused on live performance/remix workflows.
- Strengthen import compatibility and handoff tests.
- Document eventual `PDJ1` session data separately from Chordsmith composition data.

## Pocket DAW

- Keep `apps/pocket-daw/` clearly marked public-alpha, source-available, and
  private-license until licensing, packaging, and product scope are deliberately
  settled.
- Improve tests, docs, and import/export clarity before calling it a stable
  public release.
- Next product slice from the current release-status baseline: repeat and
  record collected Godot adaptive pack and web-game ZIP export smoke with named
  artifacts and target versions, strengthen update-through-app smoke, then add
  push-to-Godot or native destination selection before deeper ASIO,
  simultaneous multitrack capture, or broad DAW editor expansion. A manual
  DAW -> Godot game-asset export/import smoke passed on 2026-06-28.

## Pocket Audio Core And PCS Format

- Continue extracting shared parsing, normalisation, timeline, WAV/stem, and game-runtime APIs.
- Treat current core output as scaffolded until sound/timing parity is proven.
- Move canonical format definitions into `packages/pcs-format/` only when the shared boundary is stable.

## Godot Addon

- Keep `addons/pocket_chordsmith/` stable.
- Improve examples for runtime callbacks, chart resources, buses, and stem workflows.
- Keep the addon release path separate from full monorepo source archives.
- Revisit Chordsmith -> Godot direct browser push. The localhost receiver and
  pasted `PCS1:` import path work in the editor, but the live browser button is
  not verified as a reliable automatic import path yet.
- Treat Godot editor preview as an audition kit. For closer sound parity, prefer
  DAW Godot Adaptive Pack exports with rendered full mix, stems and section
  loops.
