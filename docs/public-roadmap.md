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

## Next update: shared Campfire Acoustic guitar

- Add the Towtal Chaos-inspired **Campfire Acoustic** instrument (working name)
  across Core, Chordsmith, DJ, native DAW and Godot using the
  [canonical next-update plan](CAMPFIRE_ACOUSTIC_NEXT_UPDATE_PLAN.md).
  This is planned work, with provenance, deterministic rendering, compatibility,
  listening parity and measured performance gates still pending.
- Preserve the existing performance/polish and release priorities below. Godot
  production fidelity uses matching rendered stems; optional native preview
  parity is a separate scope. No release date or completed implementation is
  implied.

## Pocket Chordsmith

- Preserve the current browser app behavior and share-code compatibility.
- Improve docs around imports, exports, MIDI, WAV, and Godot push.
- Add tests around existing behaviors before large UI or engine changes.
- Plan a UI revamp for the next update: give Pocket Chordsmith a more
  interesting, engaging and distinctive musical personality, avoiding a generic
  AI-template aesthetic. Explore visual directions and agree on one with Sam
  before broad implementation; no particular aesthetic is approved yet. Preserve
  legibility, accessible touch targets, keyboard usability and responsive layouts.
  Keep existing behavior, compatibility and performance/reliability priorities
  intact. Design exploration and implementation are pending.

## Pocket DJ

- Keep DJ focused on live performance/remix workflows.
- Strengthen import compatibility and handoff tests.
- Document eventual `PDJ1` session data separately from Chordsmith composition data.

## Pocket DAW

- Prioritize measured preparation/cache-related hitch reduction, dependable UI
  layout and controls, and Godot performance/sound fidelity before broad feature
  growth. Cache work is a suspected cause of owner-reported pauses, not a diagnosis.
  See the [prioritized performance, polish and finishing plan](../apps/pocket-daw/docs/PERFORMANCE_POLISH_AND_FINISH_ROADMAP.md)
  for acceptance criteria, existing DSP-based Finish & Export work and targeted
  reliability regressions. Existing release commitments below remain in place.

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
- Future format planning: design a smart share-code/JSON compression format so
  Pocket Audio songs can travel as shorter codes and links. This is not a
  near-term implementation task. It needs a cross-app compatibility plan for
  Chordsmith, DJ, DAW, Godot, Pocket Audio Core, hosted handoff pages, old
  `PCS1:` imports, raw JSON imports, migrations, fixtures, and fallback UX
  before any new encoded format ships.

## Godot Addon

- Prove real-game performance and sound fidelity from both Chordsmith/Core and
  native DAW rendered exports using the [Godot validation track](../addons/pocket_chordsmith/docs/PERFORMANT_AUDIO_ROADMAP.md#priority-validation-track-game-performance-and-two-source-fidelity).
  Test cold/warm loading, transitions, long sessions and retained audible A/B
  evidence on supported Godot targets; preview-kit audition is not final parity.

- Keep `addons/pocket_chordsmith/` stable.
- Improve examples for runtime callbacks, chart resources, buses, and stem workflows.
- Keep the addon release path separate from full monorepo source archives.
- Revisit Chordsmith -> Godot direct browser push. The localhost receiver and
  pasted `PCS1:` import path work in the editor, but the live browser button is
  not verified as a reliable automatic import path yet.
- Treat Godot editor preview as an audition kit. For closer sound parity, prefer
  DAW Godot Adaptive Pack exports with rendered full mix, stems and section
  loops.
