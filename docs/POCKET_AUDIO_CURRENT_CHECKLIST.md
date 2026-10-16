# Pocket Audio current checklist

Detailed history and failed attempts remain in
[the implementation ledger](POCKET_AUDIO_UPDATE_LEDGER_2026-10-15.md).
Source, executed tests, installed acceptance and publication are distinct.
No new product candidate has been published.

| Work | Implemented and tested | Remaining acceptance |
| --- | --- | --- |
| Reliability audit | Bounded cache, cancellation, playback, timing, mixer and UI fixes in reviewed slices | Representative long-session and peak working-set budgets; unmeasured audit entries remain hypotheses |
| Campfire family | Original shared recipe and family selectors; full voicings, deterministic seed/rate/gain/tail/cache identity and legacy-source tests | Human listening and live/vocal acceptance; retain documented live fallback limits |
| Chordsmith | Approved themes retain Night blue default and saved choices; selected-bar Hear/Stop, visible lead-in/tail, optional manual cue and stale-preparation guards | PR110 bass follow-up is source accepted with exact hosted gates; broader proposal A/B, optional playable examples and final physical-phone acceptance |
| Chordsmith bass correction | Old-head range/Stop failures reproduced; owned bass release, future-source cancellation, finite duration and slide bounds implemented | PR110 source accepted and exact hosted gates pass; no physical listening claim |
| DJ | Existing shared prepared Campfire/runtime, finite contextual Hear and cold Restart correction; PR111+112 stack source accepted with exact hosted gates | Broader comparison follow-through and physical listening; original111 alone remains held |
| DAW Hear/Finish | PR101/103/104/105 source accepted; native monitor, final downloaded-WAV QC and hydration ownership implemented | Exact final installed/native/device/listening acceptance |
| Passive DAW readiness | PR107/108 accepted; Export/File DOM survives readiness. Follow-up preserves the returned Import/Pocket trigger after File closes; three controlled failures corrected | Follow-up source/hosted review; dense installed WebView/Windows scaling acceptance |
| Meter/delivery | PR100 external calibration and PR103 native monitor/seven WAV references; PR105 final Blob QC source accepted | Exact installed decoded outputs; internal QC is not general WAV-file certification |
| Godot | Both Core/Chordsmith and fully arranged native DAW routes; bounded float32-to-PCM16 captures, threaded loading/cancellation; optional prepared-passage editor Hear/Stop with rendered bus evidence | Editor candidate review/hosted gate; cold preparation and rendered worst-frame budgets failed; representative game, long-session, working-set, dropout/listening evidence and version reconciliation |
| DAW safeguards | Existing save/Undo/media/plugin foundations retained; menu, focus and overflow corrections | Dense-session popovers/shortcuts and actual Windows scaling |
| Installed candidate | No new installer built; source/browser/PCM evidence kept separate | One reviewed exact candidate, eligible retained capture baseline, real current exports, loopMIDI/device/output/listening checks |
| Release truth | Candidates Chordsmithv69/DJv1h/Core0.3.0/Godot1.3.0; DAWsource0.6.51. Verified public Chordv68/DJv1g/Godot1.2/DAW0.6.50 remain unchanged | Candidate metadata/source review; exact installed acceptance; Godot listing must use tested4.6.3 scope, not old4.4 claim |

PR108 exact `0c89efd7734ad9314d68a6d1f33b6cd37820d2a3` is source accepted.
CI38829962766 and CodeQL38829962684 succeeded. Six CI jobs ran and seven
components were intentionally skipped; this is not thirteen component reruns.
Hosted DAW browser: 54 passed/two long-worker skips; local full: 56 passed.

PR109 exact `c463574938fd81732ffe6f31bfd117311b2f4bfe` has successful
CI38830488145 and CodeQL38830488197, but remains held for the independently
confirmed bass Stop/range defect. Its passing bass-disabled fixtures did not
prove finite bass audio. See
[the contextual audition report](../apps/chordsmith-web/docs/CONTEXTUAL_AUDITION_2026-10-16.md).
The follow-up passes 151 full desktop/phone workflow and genre checks with five
intentional phone genre-metric skips, plus four additional real-browser beat-bus
PCM checks. These prove nonzero generated bass becomes silent after Stop/end on
that browser bus. They do not prove a speaker route or human listening.
Lint, limited authored-module typecheck, four unit checks, deterministic bundle,
production Vite build and existing size budgets pass: HTML1,073,920/1,100,000;
modules899,951/900,000. PR110 follow-up is independently source accepted; exact CI38832462861 and CodeQL38832462897 succeeded.

PR106's nominally green Godot run was invalid because it printed a script error.
PR107's corrected hosted lifecycle checks are clean:22 checks, no script errors
or leaks, package142; the fail-closed gate rejects the old misleading output.
Failed/open runtime budgets are retained in
[Godot acceptance evidence](../addons/pocket_chordsmith/docs/RUNTIME_AUDIO_ACCEPTANCE_2026-10-16.md).

The native capture fingerprint is unchanged. Source-level microphone work is
omitted, not passed. The final exact installed run must still establish an
eligible directly retained baseline and current PCM/file integrity, connected
loopMIDI and real retained WAV/MIDI exports. If a fresh physical check becomes
necessary, retain Sam's Friday16October evening AEDT check and continue independent
work. No physical result is currently claimed.

Review candidates before public release. Targets remain Chordsmith/DJ itch and
existing mirrors, exact DAW GitHub/updater installer, and the separate Godot addon
ZIP on Chordsmith itch plus official Store and Library5174. Product mirrors must
start from fresh website main and preserve editorial commit
`b2469ac41f721074868b89d1fbab9ccfea56e34f`.
Core stays private/workspace-only. Reef Sweep, PR75 and dependency PRs71-74 remain
untouched. Contribution buttons, share-code compression, deep ASIO and multitrack
remain backlog. No spend, accounts, credentials/security or licence changes.
