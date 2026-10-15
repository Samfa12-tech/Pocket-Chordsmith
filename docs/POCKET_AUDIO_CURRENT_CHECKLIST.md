# Pocket Audio current checklist

This is a short checkpoint index; detailed implementation/test/publication
evidence remains in POCKET_AUDIO_UPDATE_LEDGER_2026-10-15.md. Nothing below
means published or physically heard unless explicitly evidenced there.

| Work | Implemented/tested checkpoint | Still open |
| --- | --- | --- |
| Reliability audit | Bounded cache, playback, timing, mixer and UI fixes in prior reviewed slices | Long-session/working-set budgets; retain hypotheses where runtime evidence is absent |
| Campfire family | Original shared implementation, voicings/seed/rate/gain/tail/cache identity and legacy source tests | Real vocal/live/listening acceptance and documented live fallback limits |
| Chordsmith/DJ | Selected theme work and shared runtime; existing desktop/touch/browser evidence | Remaining BeatStitch/contextual Hear, optional examples, feedback, A/B and phone controls |
| DAW Hear/Finish | PR101 foundation, PR103 incremental source and PR104 hydration correction accepted; PR102 workflow retained | Installed/native/device/listening acceptance remains separate |
| Cold saved audio | PR104 returns the installed clone; six new regressions pass locally and hosted; source hold cleared | Final installed cold/reopen acceptance |
| Meter/delivery | PR100 calibration; PR103 native monitor/seven WAV references; final-file QC presentation, cancellation/report/unfinished-input checks implemented locally | New QC candidate source/hosted review; exact installed output checks |
| Godot | Core/Chordsmith/native arranged routes; bounded float32→PCM16 compatibility captures; worker loading and synthetic SFX/cold-warm/residency measurements | New loading candidate review; rendered frame stalls, full-game/long-session/peak working-set/listening; reconcile advertised 4.4 vs tested 4.6.3 |
| DAW safeguards | Existing save/Undo/media/plugin foundations retained; menu/focus/overflow fixes | Remaining dense-session, popover/shortcut and actual Windows scaling acceptance |
| Installed acceptance | No new installer built; source/PCM/UI evidence kept separate | One exact final installed candidate, retained real exports, device/loopMIDI/output/listening checks |
| Release truth | Draft candidates and evidence ledger; Core stays private/workspace-only | Versions/family manifest/current advisory applicability; reviewed candidates before public targets |

Review truth: PR101 head60b7c9f and PR103 incremental head51045df accepted source;
PR104 head65534010c704fdb3633a8a549db1f7d8b1d4fd7b independently accepted and
clears the reported hydration source hold. Exact CI38820399984 and
CodeQL38820399393 succeeded; hosted browser **43 passed, 2 skipped**, frontend
1228 passed. All earlier reviewed heads are preserved. Hosted PR103 browser:
**37 passed, 2 skipped**; the local full
PR102 browser run was **39 passed**. Five-minute worker timing/cancellation is
local evidence and a distinct acceptance item, not a hosted or device pass.
The delivery-QC slice has local Core213/DAW1235/typecheck/build and targeted
browser22 passes (including both real long-worker checks), not yet hosted or
installed evidence. See apps/pocket-daw/docs/DELIVERY_WAV_QC_2026-10-16.md.
PR105 exact158b7f11623a22dc3ab4442927ea12b875edd272 independently accepted in
source. CI38822567029 and CodeQL38822567991 terminal success; hosted Core213,
DAW1235, browser47passed/2long-worker skipped. Its decoder/QC is not general WAV
file certification. Installed/device/listening acceptance remains separate.
Godot loading/compatibility details and explicit failed/open performance budgets:
addons/pocket_chordsmith/docs/RUNTIME_AUDIO_ACCEPTANCE_2026-10-16.md.

The capture fingerprint is unchanged; the source-level microphone omission is
documented as omitted, not passed. If later shared/capture impact requires a
physical check, reserve the required check for Sam this evening and continue
independent work. No such physical result is currently claimed.

Public targets remain Chordsmith/DJ itch plus mirrors, exact DAW GitHub/updater
installer, and separate Godot addon itch ZIP plus official Store and Library5174.
Use fresh website main and preserve editorial commitb2469ac41f721074868b89d1fbab9ccfea56e34f.
Reef Sweep, PR75 and dependency PRs71–74 remain untouched. Deferred contribution,
share-code compression, deep ASIO and multitrack work remain backlog.
