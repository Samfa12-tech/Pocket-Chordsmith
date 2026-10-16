# Selected-bar audition

The progression now offers user-invoked **Hear this bit** and **Stop audition**.
Its visible range names the selected section/bar, actual lead-in and tail. The
optional disclosure contains passage settings and one listening cue. That cue is
guidance, not an automatic finding. Nothing plays when selecting a chord,
opening the disclosure or changing a setting.

This uses the existing live scheduler, voice release and prepared Campfire PCM.
The finite plan retains original section steps and deterministic seeds. Lead-in
is zero, one or two whole bars, clamped at the section start so a preceding chord
attack is included. The last selected bar ends scheduling; completion follows
the AudioContext clock through the selected 0.5, 1 or 2 second tail. Existing
voice/effect release may ring after Stop; this is not a hard output-silence bound.
Use ordinary Play section to hear held notes that began before this passage.

The project, selected chord/section, Undo and unfinished input remain unchanged.
An edit, selection or passage-setting change invalidates the audition. Existing
playback request ownership and a source snapshot reject late preparation after
Stop or edits. An obsolete preparation error cannot replace the stopped status.
Normal section/song playback keeps its existing looping behavior. No saved
schema, PCS1/song IDs, export path, dependency or capture code changed.

Validation:

- Full existing/new desktop and phone Chromium suite: 138 passed before the final
  internal-name/copy/disclosure-marker cleanup. Final unchanged-behavior cleanup:
  all 22 contextual tests passed again, including actual browser Web Audio,
  finite scheduling, warm Campfire reuse, normal looping, stale preparation,
  failure fallback, cancellation and 44px phone controls. Failure fixtures replace
  preparation only; they do not attest native/device PCM or listening quality.
- Final lint, limited authored-module typecheck and four existing WAV preflight
  unit checks passed. Deterministic single-file check passed with 16 fragments.
- Active HTML 1,073,923 / 1,100,000 bytes; modular source 899,954 / 900,000 bytes.
  Budgets were not raised. The phone screenshot was inspected; the disclosure
  marker is visible and the page has no horizontal overflow.

The public v68 file is a source candidate. No itch/mirror publication, physical
phone/speaker listening or exact-installed native acceptance is claimed. The
broader proposal A/B, Apply/Discard/Undo and optional playable examples remain
separate follow-through; this slice adds contextual audition and manual guidance.

## Bass lifecycle review correction

PR109's original head `c463574938fd81732ffe6f31bfd117311b2f4bfe` is held.
Independent review found that ordinary bass and slide oscillators were not in a
release list. A held bass could continue past audition completion or manual Stop.
The original new audition fixtures disabled bass and missed this existing engine
gap; their passing transport checks were insufficient for a finite audio claim.

Three real-browser counterexamples reproduce the problem against that preserved
build: a four-bar held phrase at 240 BPM has a 3.76s duration. A selected first bar
with 0.5s tail ends at AudioContext time 1.54s, but original bass stops are 4.05s /
3.3732s, and slide stops 4.02s. Manual Stop does not reschedule them. Early fixture
runs that accidentally projected a hold onto the first trigger were invalid;
the retained counterexamples construct the exact live fixture after import and
assert the trigger and its false hold flag. An explicit real scheduler attack
keeps runner load from skipping that trigger and hiding the problem.

The follow-up registers bass in the existing voice prune/release machinery,
without adding a voice-stealing cap or changing ordinary musical durations. Stop
releases active bass with the existing short fade and cancels future bass before
its scheduled start. Audition limits duration after accent scaling to the musical
boundary; normal release fits inside the displayed minimum tail. Slide targets
outside the passage stay out of that preview. The same Stop releases ordinary
held bass. Live source ownership is separate from offline/MIDI export.

The correction adds desktop/phone held bass, slide, natural completion, manual
Stop, future lookahead, rapid restart and ordinary full-duration/Stop regressions.
Validation and publication status are recorded in the family ledger. Existing
effects may ring during their release; this is not a physical silence/listening
attestation. Internal helper names/spacing and redundant range arithmetic were
trimmed to preserve the existing size budget, which was not raised.
