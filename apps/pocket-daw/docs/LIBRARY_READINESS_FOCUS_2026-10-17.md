# Preserve live Library controls during background readiness updates

0.6.57 is a bounded UI correction on top of scoped-accepted transport/hint head
`38f70df3b81280e6bbcb1982907dbbf6c63f7fe6`. Native timing, DSP, recording,
project history, explicit update actions and the published family apps are
unchanged.

## Runtime reproduction

The first 0.6.56 preparation stopped before packaging: its development browser
gate passed58, skipped2 production-only cases, and failed a cold Finish deadline
and sample-selection focus. A fresh isolated development diagnostic passed the
unchanged cold Finish case in5.2 seconds and selection focus in10 quick contexts.
Those quick controls did not cover the delayed startup callback.

A subsequent real frontend control selected the sample checkbox, then waited
across the existing3.5-second startup check. The checkbox stayed selected but
lost focus after the background readiness callback replaced the Library DOM.
The served source version was0.6.56. This is a product reproduction separate
from native playback, physical listening or device capture.

`renderReadinessUpdate` already protected Finish/import surfaces. Its general
focus restoration handles IDs and action buttons, whereas live sample controls
have other stable attributes. An open Library always took the full-render path.
That could replace a focused checkbox, composition input, filter or unfinished
placement value when startup updater/discovery work completed.

## Bounded correction

Background readiness still updates state and notifications. When focus is inside
the open Library workbench, its readiness render now follows the existing
deferred-render path and preserves the live DOM. An intentional surface change
renders the latest state. Explicit updater actions still open and refresh their
panel; no update download or install happens automatically.

The correction is a single early condition in `shouldDeferReadinessRender`.
It does not change ordinary transport ownership, native residency/cache bounds,
recording, the audio clock or save/undo behavior. It also does not claim to fix
the unrelated cold Finish deadline or previously retained worker heartbeat
outliers; those remain separately identified outcomes.

## Validation and retained outcomes

Fifteen deterministic real-frontend cases failed on the unchanged product
behavior, then passed after the fix. They release updater begin, updater
completion and late VST3 discovery while selection, search composition/caret,
category, folder or unfinished placement owns focus. They require the same live
node, focus, value, selection, caret and root render count. The native command
boundary is substituted; these are UI/source controls rather than hardware
evidence. The fixture initializes the native sample index before holding the
later readiness event. Earlier fixture-construction failures are retained and
are not counted as product regressions.

The independent real delayed-timer control now retains focused selection on
served0.6.57. The complete source suite passes1,291 tests in108 files. Its first
run omitted the retained browser-runtime environment and could not launch the
parity browser; that run remains retained. The corrected full run passes all
tests. TypeScript and the production UI build pass; version, CI-workflow,
governance, repository organization and whitespace checks pass.

The complete unprofiled production-browser run passes all77 cases, with zero
skips, failures or retries. Both unchanged150ms worker limits ran: cancellation
heartbeat gap11.7ms; five-minute completion heartbeat gap98.9ms. All original62
cases remain, including cold Finish/reopen and explicit updater controls. The
worker bundle is unchanged. Hosted development-mode browser success alone does
not satisfy those two production-only cases. Rust/Clippy are not rerun for this
UI-only follow-up; the accepted base's native results remain historical.

## Candidate boundary

The 0.6.56 production-route preparation retry was deliberately stopped during
browser checks after the real delayed focus defect was found. The interrupted
case/exit is controlled termination, not a further product failure. Neither
0.6.56 attempt created a native release target, installer or receipt. Logs,
traces, source identities and the withheld marker remain retained. Only its new
regenerable compiler incremental cache was removed to correct a disk preflight;
compiled tests and all meaningful evidence remain. Do not resume that version.

No0.6.57 installer, installation, microphone take, whole installed acceptance,
merge or publication exists. The capture fingerprint remains
`e9da9acb8d6235a4f26f74f1c3601289d77c4125299cb345bb0fbf82956c8bce`.
The existing verifier/baseline constraints are unchanged: request deliberate
readiness only after the final accepted installer is ready. Frozen0.6.54 and
private0.6.53 evidence retain their original identities. The prior installed
app is closed; recheck and preserve recovered user work before replacement/tests.

Published Chordsmith/DJ/Core bytes and the held main addon remain unchanged.
Godot runtime/listing gates and the Horde deferral remain in force.
