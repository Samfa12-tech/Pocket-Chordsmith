# Chordsmith visual directions — review study

Open `chordsmith-directions-2026-10-15.html` directly in a browser. It is a self-contained, offline comparison of three alternatives, with no external assets or dependencies. No direction is selected on first load and no application styling has changed.

| Direction | Character | Main idea |
| --- | --- | --- |
| Set List | Warm paper and musical notation | Large chord lettering, fine score lines, rust cues and ink transport |
| Pedal Board | Playful musical equipment | Sage surfaces, tactile chord caps and distinct rhythm switches |
| Tape Notes | Focused studio | Warm charcoal, peach cues, paper readouts and restrained monospace details |

All three show the same song, chords and controls. Select a chord, toggle rhythm steps, edit tempo, open the sound disclosure, and choose a direction. The copy action produces a short review note; it does not send feedback. Save and audio controls are visibly disabled because this is a visual study. Campfire Acoustic is marked proposed.

This is a focused composition view, not a replacement for the complete app. The eventual selected direction must retain existing keyboard shortcuts, touch targets, sections A–H, rich JSON/PCS1 data, editor panels, save/recovery and export flows. Sam may choose a direction or borrow individual details before a broader reskin is implemented.

## Validation

Validated in Chromium 153 at widths 1440, 720, 375 and 360 pixels: no page overflow, transport contained in each mock, no initial selection, functioning direction/chord/rhythm/tempo/disclosure controls, keyboard access, and no console errors or audio/autoplay. Real clipboard write was stubbed during the automated check. Mobile and desktop screenshots were inspected. Local evidence is ignored under `local-artifacts/scratch/design-directions/` (`validation.json` and four screenshots).

This does not claim full accessibility certification, real-device validation or app integration. In the real editor, verify selected-state contrast, Windows scaling, screen-reader names, focus restoration and all existing popovers against the final selected palette.
