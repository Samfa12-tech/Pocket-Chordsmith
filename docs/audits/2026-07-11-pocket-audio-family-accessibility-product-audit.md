# Pocket Audio Family Accessibility and Product Audit

Date: 2026-07-11

## Audit scope

This combined UX and accessibility audit covers the four user-facing Pocket Audio apps and the three enabling products named by the current family architecture:

- Pocket Chordsmith web composer
- Pocket DJ
- Pocket Audio Handoff
- Pocket DAW native Windows app
- Pocket Chordsmith Godot addon
- Pocket Audio Core
- PCS Format

The user goal is to create a song in Chordsmith, perform it in DJ, transfer it between devices, finish it in DAW, and move it into Godot without accessibility or product-boundary failures.

This is not a WCAG conformance certification. It combines live screenshots/DOM inspection, canonical source review, public mirror comparison, automated regression execution, a physical Android pass, a real Godot editor keyboard pass, and exact installed-candidate DAW WebView checks. Spoken NVDA output, global Windows High Contrast/200% DPI, and manual audio-feedback judgment remain follow-up work.

## Executive verdict

No P0 blocker was found. The family architecture and product roles are coherent. At the audit baseline, accessibility was nevertheless a release-quality risk across every interactive product:

- Pocket Chordsmith's core sequencer lacked meaningful screen-reader names/state and keyboard editing parity.
- Pocket DJ's import, mixer, status, and modal patterns were incomplete.
- Pocket Audio Handoff had clear visual flow but its two primary text fields were not labelled.
- Pocket DAW had a strong semantic shell, but dialogs, thousands of sequencer tab stops, cell naming, toggle state, and fixed-width layout were serious barriers.
- The Godot addon disabled keyboard focus on all 14 main toolbar buttons.

The production sequence remains foundation-first: accessible names and state, keyboard parity, focus lifecycle, labels/live regions, then reflow/motion/trust polish. Implementation, browser automation, physical Android touch/semantics, interactive Godot keyboard focus, and installed-DAW WebView checks are complete. Spoken assistive-technology output and global Windows display-mode checks remain open.

## Product health scorecard

| Product | Role clarity | Functional baseline | Accessibility health | Overall |
| --- | --- | --- | --- | --- |
| Pocket Chordsmith | Strong | 74/74 browser tests plus physical Android pass | Source/browser/phone remediation passes; spoken AT pending | Foundation implemented |
| Pocket DJ | Strong | Combined DJ/Handoff suite 18/18 passes | Automated remediation passes; manual AT pending | Foundation implemented |
| Pocket Audio Handoff | Strong, staged flow | Combined suite 18/18; relay 4/4 | Automated remediation passes; manual AT pending | Foundation implemented |
| Pocket DAW | Strong native-only boundary | Build, 1016 unit tests, browser 14/14, installed candidate pass | Installed WebView remediation passes; global OS modes/spoken AT pending | Foundation implemented and installed locally |
| Godot addon | Strong runtime/integration role | Godot 4.6.3 headless contract and editor smoke pass | Keyboard focus/activation verified; host spoken AT pending | Foundation implemented |
| Pocket Audio Core | Honest scaffold boundary | Family parity gate exists | Headless API, not a UI surface | Healthy for current scaffold status |
| PCS Format | Clear narrow contract | Fixture/build tests exist | Headless contract, not a UI surface | Healthy but not full schema owner yet |

## Highest-priority family findings

The findings and source-line references in this section are the audit-date baseline. They intentionally describe the pre-remediation state; use the remediation appendix and Wave 5 ledger for current source/test status.

### P1-1: Sequencer controls need stable accessible names and state

Pocket Chordsmith live inspection found exactly 86 unnamed sequencer buttons: 12 Kick, 14 Snare, 16 Hat, 12 Bass, 16 Guitar, and 16 Melody cells. At that snapshot, the renderer gave off cells empty text and active cells terse repeated glyphs. Audit-snapshot references: `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html` lines 5881-5887, 6041-6056, and 6261-6265.

Pocket DAW had the same systemic issue at a larger scale. The baseline default demo rendered 2,814 buttons, and step controls relied on title text and glyphs. Audit-snapshot reference: `apps/pocket-daw/src/app/ui.ts` lines 875-930.

Acceptance criteria:

- Every cell exposes lane/track, section where applicable, step, musical state, and edit state.
- Example: `Kick, section A, step 5, off`; `Bass, section B, step 3, root, held`.
- Toggle-like cells expose `aria-pressed` or an equivalent robust state.
- Current playback position is separate from edit state so announcements remain stable.
- Automated checks find zero unnamed cells in empty, active, accent, hold, slide, tuplet, and playback-current states.

### P1-2: Core editing gestures require keyboard equivalents

At the audit baseline, Chordsmith hold, slide, triplet, accent, clear, and X-Y-pad interactions were pointer-drag/long-press only. The remediation adds keyboard commands for the sequencer gestures and a semantic X-Y slider with arrows, Shift fine adjustment, Home/End, replay, stop, instructions, live value text, and focus styling.

At the audit baseline, Pocket DAW's timeline ruler, clip drag handles, and repeat handles were non-semantic pointer surfaces without equivalent direct seek/repeat keyboard behavior. Audit-snapshot references: `apps/pocket-daw/src/app/ui.ts` lines 531-532, 642, and 867-870.

At the audit baseline, the Godot addon made all 14 main toolbar buttons unfocusable through one shared helper. Audit-snapshot reference: `addons/pocket_chordsmith/editor/pcs_main_screen.gd` lines 324-330 used `Control.FOCUS_NONE`.

Acceptance criteria:

- Every authoring and performance action can be completed with keyboard alone.
- Chordsmith and DAW grids use a roving-tabindex/grid pattern with arrow navigation rather than one Tab stop per cell.
- Godot toolbar buttons use normal keyboard focus and retain visible focus indication.
- Pointer gestures remain shortcuts, not the only way to invoke an action.

### P1-3: Labels are missing across all three hosted flows

At baseline, Pocket Chordsmith had unassociated visible labels across core settings and import/export controls. Audit-snapshot references: `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html` lines 270-277, 382-477, 838-877, and 906-914.

At baseline, Pocket DJ's import textarea was placeholder-only, stem mutes were named `M`, volume sliders were unnamed, and mute state was CSS-only. Audit-snapshot references: `apps/pocket-dj/pocket_dj_v1g_core_bridge.html` lines 98 and 2484.

At baseline, Pocket Audio Handoff's song-code textarea and transfer-code input were placeholder-only. Audit-snapshot references: `apps/pocket-audio-handoff/index.html` lines 63 and 98.

At baseline, Pocket DAW's loop number fields and readonly MCP textareas lacked useful programmatic labels. Audit-snapshot references: `apps/pocket-daw/src/app/ui.ts` lines 499-501 and 3818-3826.

Acceptance criteria:

- Every input, select, and textarea has a persistent unique computed name.
- Placeholder and current option text are not treated as labels.
- DJ mixer controls resolve as `Mute drums`, `Drums volume`, and so on, with `aria-pressed` on mute.

### P1-4: Dialog focus handling is inconsistent

At baseline, Pocket Chordsmith already had labelled modal semantics, initial focus, focus loop, Escape close, and return-to-trigger, but did not inert background content.

At baseline, Pocket DJ's help overlay had modal semantics and Escape support but did not move, trap, or restore focus. Audit-snapshot reference: `apps/pocket-dj/pocket_dj_v1g_core_bridge.html` lines 2531-2547.

At baseline, Pocket DAW declared modal semantics but its open handlers only changed state and rerendered. Keyboard testing found focus on `BODY`, background Tab movement, and ineffective Escape. Audit-snapshot references: `ui.ts` lines 3507-3509 and `App.ts` lines 3039-3106.

Acceptance criteria:

- Opening focuses the dialog heading or first useful control.
- Tab and Shift+Tab remain inside.
- Escape closes when safe.
- Focus returns to the trigger.
- Background content is inert and unavailable to the virtual cursor.

### P1-5: Important state changes are silent to assistive technology

At baseline, Chordsmith status, autosave, handoff, WAV progress, and MIDI summary updated as plain text without live-region semantics. Audit-snapshot references: `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html` lines 1677-1678 and 2384-2387.

At baseline, DJ import/deck/toast changes and Handoff import/relay/expiry/payload changes lacked live regions. Audit-snapshot references: DJ lines 2229-2232 and Handoff lines 274-340.

Pocket DAW was the positive baseline reference here: its status/busy surfaces already used polite live-region semantics. Audit-snapshot reference: `apps/pocket-daw/src/app/ui.ts` lines 382-386.

Acceptance criteria:

- Success, error, import, copy, relay, autosave, render, and export messages are announced once without stealing focus.
- Field-specific validation is also attached with `aria-describedby` and `aria-invalid`.

## Product-specific findings

Unless a bullet explicitly says otherwise, these product-specific issue lists are the audit-date baseline. Current implementation status is in the remediation appendix.

### Pocket Chordsmith

Strengths:

- Clear composer/studio role, correct `lang`, responsive metadata, real `h1`, native controls, and strong settings-dialog focus behavior.
- Simple/Advanced separation protects beginner flow.
- Functional regression coverage is broad and passes in desktop and Pixel 7 projects.

Additional issues:

- P1: genre tabs use roving `tabIndex`, but no Arrow/Home/End handlers; inactive tabs are unreachable. Source: lines 6808-6817 and 29763-29765.
- P2: Mute/Solo, track, section, note, current, and selected state rely heavily on CSS classes without consistent ARIA state.
- P2: drum pads are native buttons but only `pointerdown` triggers sound, so Enter/Space activation does not honor the native button contract. Source: lines 4541-4556.
- P2: the large editor has one heading and no main landmark; Progression, Beat, Melody, Parts, and Settings are styled generic text.
- P3: tooltip instructions shown on focus are not associated with controls through `aria-describedby`.
- P3: beginner-facing screen exposes implementation language such as `Pocket Audio Core bridge build` and `0.1.0-scaffold`; keep this in diagnostics/details.

### Pocket DJ

Strengths:

- Excellent product boundary: the stage, not another composition editor.
- Demo shortcuts make the empty state testable and understandable.
- Native controls, useful help affordance, 44px primary targets, clear section-pad visual states, robust handoff fallback, and passing deck behavior tests.

Additional issues:

- P1: no `h1`; the opening import experience sits outside the only `main`. Source: lines 88-121.
- P2: current, queued, held, drop-target, sequence, build, and drop states are primarily class-driven.
- P2: the `D` keyboard alternative for long-press drop targeting exists in code but is absent from help. Source: lines 2320-2328 and 252.
- P2: fixed bottom transport may overlap content at high zoom; verify 320 CSS px and 200/400 percent zoom.
- P2: `Clear Session` immediately removes local storage with no confirmation or undo. Source: lines 2644-2646.
- P3: continuous pulse/glow animations do not respect `prefers-reduced-motion`.

### Pocket Audio Handoff

Strengths:

- Best semantic shell of the hosted family: skip link, navigation, `main`, `h1`, labelled sections, native actions, and a genuinely responsive single-column mobile layout.
- The staged phone-to-desktop flow is clear and offers URL, clipboard, file, short-code, DAW protocol, and Godot fallbacks.
- Error/recovery copy is specific.

Additional issues:

- P1: visually hidden 1x1 file input can receive focus while the visible label has no keyboard focus treatment. Source: `apps/pocket-audio-handoff/index.html` lines 40 and 66-67.
- P2: relay creation uploads the PCS1 payload, but the UI does not explain endpoint trust, exact/max expiry, automatic deletion, or that copy/file alternatives avoid relay storage. Source: lines 225-234 and 294-305.
- P3: nested card headings use `h2` instead of `h3` under the parent `h2` sections.
- P3: 40px controls meet the WCAG 2.2 minimum with spacing but should move to the family-preferred 44px mobile target.
- P2: placeholder contrast measured 3.90:1 on the textarea/input dark background, below 4.5:1 for normal text; DJ's import placeholder measured 4.26:1.

### Pocket DAW

Strengths:

- Strong native Windows identity, one `h1`, named navigation/main landmarks, many native controls and wrapped labels, polite status/busy regions, visible focus, creation-preset `aria-pressed`, and honest alpha/browser-fallback copy.
- Current build passes; targeted keyboard/interaction tests passed.

Additional issues:

- P1: the grid is an impractical Tab sequence and active cells lose their meaningful name; use roving focus plus explicit state.
- P1: Punch, Take Lane, Metro, track M/S/R, and Monitor use class-only state instead of `aria-pressed`. Source: `apps/pocket-daw/src/app/ui.ts` lines 361-363 and 766-769.
- P2: `body` uses `min-width: 1080px` and `overflow: hidden`; current-run 800px and 200% zoom captures remain a 1080px canvas and clip content. Source: `apps/pocket-daw/src/styles/base.css` lines 32-42.
- P2: sequencer cells can be 20px high and inline drum cells smaller, which is too small for reliable touch/limited-dexterity use. Source: `base.css` lines 1762-1776 and `timeline.css` lines 647-660.
- P3: busy/export scan animations have no reduced-motion override. Source: `base.css` lines 489-496 and 2453-2460.

### Godot addon

Strengths:

- Clear integration/runtime boundary, descriptive button copy/tooltips, specific import reports and status messages, and honest distinction between preview audio and production stems.

Audit-baseline issues:

- P1: all 14 main toolbar actions were removed from keyboard focus through the shared `_toolbar_button()` helper.
- P2: the one-line horizontal toolbar is very dense. After restoring keyboard access, group actions by Import, Prepare, Preview, Save, and Help; preserve the existing Godot design language.
- Verification gap: test the real Godot editor with keyboard navigation and the host platform screen reader; source inspection alone cannot establish Godot accessibility API output.

### Pocket Audio Core and PCS Format

These are headless enabling products, not user-facing apps. Their product boundaries are currently healthy:

- Core accurately calls itself `0.1.0-scaffold` and explicitly rejects exact timing/sound/MIDI/Godot parity claims.
- PCS Format accurately owns only a narrow schema-16 contract slice and preserves unknown fields.

Product recommendations:

- Keep scaffold/parity language in developer diagnostics and docs, not beginner app headers.
- Add a concise “which product owns what” quick-reference near the top of Core and PCS docs; the current detail is accurate but long.
- Keep the shared family parity gate as a release prerequisite, while avoiding the claim that it proves UI accessibility or audio parity.

## Cross-product opportunities

1. Create shared accessibility acceptance helpers, not necessarily a shared visual component library:
   - accessible sequencer-cell naming/state contract
   - roving grid keyboard behavior
   - toggle naming/`aria-pressed`
   - modal focus lifecycle
   - status/error announcement contract
   - persistent labels and descriptions

2. Standardize transfer terminology. Use a short glossary consistently: `Pocket Chordsmith song`, `PCS1 song code`, `Pocket DJ session`, `.pocketdaw project`, and `Godot Adaptive Pack`.

3. Add accessibility smoke tests to existing Playwright/Vitest coverage:
   - exactly one `h1` and active `main`
   - zero unnamed visible form controls/buttons
   - unique lane/step names and correct state after editing
   - keyboard-only critical path
   - focus entry/trap/Escape/return for every dialog
   - reduced-motion CSS behavior
   - 320 CSS px, 200%, and 400% reflow checkpoints

4. Keep canonical and public copies synchronized. The samfa12.com Chordsmith and DJ copies differ from canonical builds only in public metadata, while Handoff adds the website shell. Accessibility fixes must land in the canonical apps and then be propagated to the website mirrors so the public audit result actually changes.

## Recommended remediation waves

### Wave A: remove access blockers

- Chordsmith/DAW cell names, state, roving grid navigation, and full keyboard edit parity.
- DJ mixer names/state and import label.
- Handoff field labels and visible file-input focus.
- DAW/DJ modal focus lifecycle.
- Godot toolbar focus.

### Wave B: make state and structure understandable

- Live regions and field-specific errors.
- Chordsmith/DJ landmarks and heading outline.
- Toggle/current/queued/mute/solo state.
- Persistent instructions for nonstandard shortcuts.

### Wave C: resilience and trust

- DAW zoom/reflow and target sizing.
- Reduced motion.
- Placeholder contrast.
- Relay privacy/expiry copy.
- Destructive-action confirmation/undo.

## Evidence captured

Live/public screenshots:

- `pocket-audio-family-2026-07-11/screenshots/01-pocket-chordsmith-live.png`
- `pocket-audio-family-2026-07-11/screenshots/02-pocket-dj-live.png`
- `pocket-audio-family-2026-07-11/screenshots/03-pocket-audio-handoff-live.png`
- `pocket-audio-family-2026-07-11/screenshots/04-pocket-chordsmith-mobile.png`
- `pocket-audio-family-2026-07-11/screenshots/05-pocket-dj-mobile.png`
- `pocket-audio-family-2026-07-11/screenshots/06-pocket-audio-handoff-mobile.png`

Pocket DAW browser-fallback screenshots:

- `pocket-audio-family-2026-07-11/screenshots/daw/desktop.png`
- `pocket-audio-family-2026-07-11/screenshots/daw/small.png`
- `pocket-audio-family-2026-07-11/screenshots/daw/zoom200.png`
- `pocket-audio-family-2026-07-11/screenshots/daw/add-track-dialog.png`

Physical Android post-fix evidence (Samsung SM-S948B, Android 16):

- `pocket-audio-family-2026-07-11/phone/android-sm-s948b-chordsmith-sequencer-before-tap.png`
- `pocket-audio-family-2026-07-11/phone/android-sm-s948b-chordsmith-sequencer-after-tap.png`
- `pocket-audio-family-2026-07-11/phone/android-sm-s948b-chordsmith-sequencer-focused-accessibility.xml`
- `pocket-audio-family-2026-07-11/phone/android-sm-s948b-chordsmith-sequencer-after-tap-accessibility.xml`
- `pocket-audio-family-2026-07-11/phone/android-sm-s948b-chordsmith-xy-pad.png`
- `pocket-audio-family-2026-07-11/phone/android-sm-s948b-chordsmith-xy-pad-accessibility.xml`

Validation run during this audit:

- Pocket Chordsmith: `npm run test:e2e` — 52 passed.
- Pocket DJ: `npm run test:e2e` — 9 passed.
- Pocket DAW baseline: targeted keyboard/interaction tests — 6 passed; `npm run build` passed with existing chunk warnings. Current remediation evidence is recorded below.

## Evidence limits and follow-up verification

- The live browser capture confirmed public DOM structure and the exact Chordsmith unnamed-cell count, but it is not a screen-reader session.
- The baseline browser viewport override produced a scaled desktop canvas for public Chordsmith and DJ while Handoff respected the phone viewport. A later physical Samsung Android 16 pass against the canonical working tree confirmed portrait reflow for all three browser apps without document-level horizontal overflow.
- The original Pocket DAW captures were browser fallback evidence, not installed-Tauri evidence. A later exact local candidate WebView pass covers keyboard/dialog/reflow/forced-colors emulation; global Windows display modes, subjective audio feedback, and a future published exact-release repeat remain separate follow-ups.
- No NVDA speech transcript, physical long-press test, relay retention inspection, installed-app Windows High Contrast session, or Godot editor screen-reader test was completed. Browser forced-colors focus checks now pass for Chordsmith, DJ, Handoff, and the DAW fallback.
- The baseline functional suites did not clear the accessibility findings because they lacked names/state/focus assertions. The remediation suites now contain explicit semantics, keyboard, focus lifecycle, error-association, reflow, motion, and forced-colors regressions; passing them is implementation evidence, not a WCAG certification or substitute for spoken-output testing.

## Remediation progress - 2026-07-11

Implemented in the canonical apps:

- Pocket Chordsmith now exposes native stateful sequencer buttons, roving grid navigation, keyboard editing commands, a semantic keyboard-operable X-Y slider, programmatic form labels, associated field errors, ARIA genre tabs, keyboard-operable drum pads, live status output, complete settings-dialog inert/focus lifecycle, explicit focus indicators, reduced-motion suppression, and forced-colors selected/focus treatment. Its Playwright suite passes 74/74 across desktop and mobile, including 320 CSS px reflow, native button role/pressed state, 24px lane targets, X-Y controls, field-error lifecycle, focus-preserving announcements, modal inert cleanup/restoration, reduced motion, and forced colors; the production build passes.
- Pocket DJ now has an `h1`/`main` structure, a labelled import field with associated errors, stateful mixer controls, live status output, complete help-dialog focus handling, reduced-motion treatment, and clear confirmation. The combined DJ/Handoff Playwright suite passes 18/18, including validation association/clearing without focus theft, 320 CSS px reflow, forced-colors focus, reduced motion, bidirectional focus trapping, scroll locking, and all close-path restoration.
- Pocket Audio Handoff now has persistent labels/descriptions and associated clearing field errors for payload, transfer code, and file input flows; live status output; improved heading order, focus treatment, target sizing, placeholder contrast, and relay privacy/expiry copy. Relay tests pass 4/4.
- Pocket DAW has complete dialog inert/focus lifecycle including successful-import rerenders, associated import errors, stateful transport/track/loop controls, contextual selector names, stateful sequencer names with roving navigation, keyboard timeline controls, semantic keyboard repeat sliders using the existing undo/timing command path, target sizing, reflow, reduced motion, and a 3px forced-colors focus indicator. Full Vitest passes 1016/1016, browser Playwright passes 14/14, and production/native installer builds pass. The exact installed v0.6.40 candidate passes repeat Arrow/Shift/Home/End/focus/undo, import invalid/edit/success/restore, modal lifecycle, form names, sequencer/ruler keyboard flow, reduced motion, native/800px overflow, and forced colors at Windows DPR 1.25.
- The Godot toolbar buttons now use `FOCUS_ALL`. Godot 4.6.3 headless editor startup parses and registers the addon successfully. An interactive disposable-project check confirmed visible Tab/Shift+Tab movement between Import JSON and Import DAW plus Enter/Space activation of Import JSON; host screen-reader output remains outstanding.
- The Chordsmith, DJ, and Handoff public website mirrors were refreshed through the website repository's managed sync path. Catalogue validation passes for 52 records and site validation passes for 11 core pages.
- Physical Samsung Android 16 checks at a 411 CSS px portrait viewport found no document-level horizontal overflow in Chordsmith, DJ, or Handoff. After remediation, a Chordsmith step exposes `button` through Chrome AX and `android.widget.ToggleButton` with clickable/focusable state through Android; physical tap changed “Kick, step 5, off” to “on.” Lane labels measure at least 24 CSS px. The X-Y control exposes a named/value-bearing slider and Android `SeekBar` with keyboard instructions.
- The Godot toolbar now has a durable headless contract: all 14 tagged actions must remain named, explained, and `FOCUS_ALL`. The validator passes under Godot 4.6.3 in addition to the interactive editor smoke.

Optional conformance and release follow-ups after the implementation wave:

- NVDA speech checks for names, state changes, errors, imports, handoffs, playback, render, and export feedback.
- Godot host screen-reader output and toolbar announcements.
- Spoken TalkBack/NVDA output, physical long-press timing, global Windows High Contrast/200% OS DPI, landscape phone rotation, computed contrast where not already asserted, and 400% reflow evidence where applicable.

Local manual-gate audit notes:

- The approved final Pocket DAW candidate was built and silently installed locally without publishing. Installer SHA-256: `f3b3751922e1dce25d90ce4b0282c064796e0302c6622b7a52ef792a2127e26f`; installed executable SHA-256: `dc1f535f9be22051018a4ce00a873c5014eaaa86aecc8dccefedb1e4f698a4b2`. The source is an explicitly identified dirty accessibility candidate, not the published v0.6.40 artifact.
- A disposable Godot 4.6.3 project was registered with the current addon, used for interactive toolbar keyboard verification, closed, and removed. The editor's weak Windows accessibility tree did not expose the addon controls, so screen-reader semantics remain unproven even though native keyboard focus and activation passed visually.
