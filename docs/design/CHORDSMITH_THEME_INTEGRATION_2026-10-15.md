# Chordsmith themes in the existing editor

Sam approved Set List, Pedal Board and Tape Notes as additions to the existing
theme selector. Chordsmith/Samfa12 blue remains the default. Its stored ID is
still `night`; the label now reads `Chordsmith blue (Night)`. Existing `ocean`,
`forest` and `sunset` IDs and palettes remain available. No storage migration or
preference reset was introduced.

The existing `applyTheme`, Settings selector, project sanitizer, JSON/PCS1 data,
save slots, autosave and undo paths carry the new IDs `set_list`, `pedal_board`
and `tape_notes`. They share the full editor, layout, transport and controls.
Theme-specific rules cover editor surfaces, Settings, transport, tooltips,
selected states and focus; existing instrument step colors remain distinct.
Set List uses warm paper, score lines and serif chord labels. Pedal Board uses
sage surfaces, amber transport and tactile chord caps. Tape Notes uses charcoal,
peach cues and restrained monospace readouts. The new rules are scoped to these
IDs so changing back restores the existing theme surfaces.

## Executed validation

- 104 existing Chromium desktop/Pixel 7 touch-emulation smoke cases pass,
  including real WAV export/cancellation, MIDI, JSON/share and handoff behavior.
- Two new persistent desktop/touch E2E cases round-trip all seven theme choices
  through the real save/load and undo controls, comparing every non-theme
  exported song/editor field and asserting no transport autoplay.
- Actual browser captures cover four themes (blue plus the three additions),
  widths 1440/720/375/360 and Simple/Advanced modes: 32 layouts, no page overflow
  or escaped fixed transport. Eight desktop/phone screenshots were inspected.
- New choices also survive autosave restoration and JSON sanitization; all four
  existing theme choices survive import. Actual touch-emulation Settings and
  save/load taps restore each new choice. Keyboard traversal retains focus.
- Measured theme palette body/muted/primary text contrast is at least 4.88:1;
  control borders against their control surface are at least 3.06:1. This checks
  these tokens, not every combination or accessibility certification.
- Existing builder regenerates canonical HTML; freshness, source lint,
  TypeScript, format, size budgets, organization, governance and whitespace gates
  pass. No dependency, audio, schema, licence or version change.

Evidence is retained locally under ignored `local-artifacts/scratch/validation/`:
`chordsmith-themes-e2e.log`, `chordsmith-themes-persistence-e2e.log`,
`chordsmith-themes-visual.log`, `chordsmith-themes/validation.json` and eight PNGs.
The additional measurement script is `verify-chordsmith-themes.mjs` in that
validation directory. These are actual editor screenshots, not the PR80 study.
No physical phone, screen reader or Windows scaling certification is claimed.
No app was published. Parent review remains required before public release.
