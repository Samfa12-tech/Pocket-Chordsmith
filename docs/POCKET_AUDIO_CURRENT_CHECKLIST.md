# Pocket Audio current checklist

This is a short checkpoint index; detailed implementation/test/publication
evidence remains in POCKET_AUDIO_UPDATE_LEDGER_2026-10-15.md. Nothing below
means published or physically heard unless explicitly evidenced there.

| Work | Implemented/tested checkpoint | Still open |
| --- | --- | --- |
| Reliability audit | Bounded cache, playback, timing, mixer and UI fixes in prior reviewed slices | Long-session/working-set budgets; retain hypotheses where runtime evidence is absent |
| Campfire family | Original shared implementation, voicings/seed/rate/gain/tail/cache identity and legacy source tests | Real vocal/live/listening acceptance and documented live fallback limits |
| Chordsmith/DJ | Selected theme work and shared runtime; existing desktop/touch/browser evidence | Remaining BeatStitch/contextual Hear, optional examples, feedback, A/B and phone controls |
| DAW Hear/Finish | PR101/103/104/105 source accepted; cold hydration fixed; delayed-discovery correction passes local full browser51 and DAW1235 | Follow-up exact hosted/source review; installed/native/device/listening remains separate |
| Cold saved audio | PR104 returns the installed clone; six new regressions pass locally and hosted; source hold cleared | Final installed cold/reopen acceptance |
| Meter/delivery | PR100 calibration; PR103 native monitor/seven WAV references; final-file QC presentation, cancellation/report/unfinished-input checks implemented locally | New QC candidate source/hosted review; exact installed output checks |
| Godot | Core/Chordsmith/native routes; bounded float32→PCM16 captures; worker loading; corrected controlled-completion22 and fail-closed full gate pass locally | PR106 nominal green job invalid; follow-up hosted/source review; full-game/rendered/listening/version gates remain |
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

PR106 head844370fb1afcf338186f129a7b55dbf075120534 is held: hosted CI38825154382
browser45passed/2failed/2skipped; its Godot job exited0 despite a script exception,
so it is not a clean19-check pass. CodeQL38825154407 passed both languages.
The follow-up reproduces both DAW failures via delayed startup discovery (actual
full-shell render stacks captured), preserves active Export/File controls, and
adds controlled Godot completion holds plus rejection of unexpected script errors.
Local follow-up: full DAW1235, browser51 (including2longworkers), Godot22 plus
fullgate142addonentries, root-tooling26 (6newgatechecks), typecheck/build and
repo/security/governance/pins/manifest passed. Core/Rust/physical/installed were
not rerun for this correction. Exact follow-up hosted/source review is pending.
Chordsmith contextual audition WIP is safely stashed at
b62bcdcf4b5de65201187a80eab167ad635f28e0 (16 local desktop/touch checks passed;
unit runner temp-path failure is not a pass). Resume after integrating correction.

PR107 exactf2ef0d382349de5a5c0e189192f96876af9c3471 hosted browser48passed/
1failed/2skipped (CI38827765430). Godot segment independently source-accepted:
hosted22clean/no script errors or leaks/package142 and CodeQL38827765437 both
languages green. The residual DAW race is now causally reproduced by controlling
the3500ms startup updater; captured checkForUpdates render stacks detach both
Finish and unfinishedQC. A follow-up protects both automatic phases, retains
available-update notifications/results and keeps explicit updater UI responsive.
See apps/pocket-daw/docs/PASSIVE_READINESS_RENDERING_2026-10-16.md.
Updater follow-up local fullbrowser56/56 (both long-workers included), DAW1235,
typecheck/build/repo/security/governance/manifest/whitespace passed. Exact
follow-up hosted/source review remains pending; prior failed head is preserved.
Latest Chordsmith stashb056b6897daa86e8c76dce9a9986991770cf1be4 preserves138
desktop/touch passes before final copy/naming cleanup; cleanup is not retested.
Size now HTML1073923/1100000, modules899954/900000; budgets unchanged. Older
stashes are retained. Unit4/lint/typecheck passed before cleanup.

The capture fingerprint is unchanged; the source-level microphone omission is
documented as omitted, not passed. If later shared/capture impact requires a
physical check, reserve the required check for Sam this evening and continue
independent work. No such physical result is currently claimed.

Public targets remain Chordsmith/DJ itch plus mirrors, exact DAW GitHub/updater
installer, and separate Godot addon itch ZIP plus official Store and Library5174.
Use fresh website main and preserve editorial commitb2469ac41f721074868b89d1fbab9ccfea56e34f.
Reef Sweep, PR75 and dependency PRs71–74 remain untouched. Deferred contribution,
share-code compression, deep ASIO and multitrack work remain backlog.

Chordsmith contextual audition is implemented in the next isolated source slice:
final22desktop/touch checks after copy/naming/marker cleanup pass; earlier full138
including unchanged smoke, final lint/typecheck/unit4/deterministic/size pass.
HTML1073923/1100000, modules899954/900000; no budget increase. See
apps/chordsmith-web/docs/CONTEXTUAL_AUDITION_2026-10-16.md for bounded scope.
PR108 confirmed0c89efd7734ad9314d68a6d1f33b6cd37820d2a3; exact hosted DAW browser
and frontend pass, Rust CodeQL pending. No product publication/installed pass.
