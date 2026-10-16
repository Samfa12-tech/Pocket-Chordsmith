# Ordinary transport preparation ownership and bounded residency hints

0.6.56 is a source-only correction to integration head
`3d1a81001fb131b06aa064cc60a427376b339e6b`. That head remains held even though
hosted CI/CodeQL and its full local production browser suite passed.

## Reproduced ordinary Stop defect

Actual imported App methods reproduce the failure without copied method bodies:
start ordinary bridge Play, defer `engine.prepareNativeRuntimeAudioForPlayback`,
send Stop and observe its stopped acknowledgment, then complete preparation.
The previous App predicate defaulted to always true, so it called `engine.play`
after Stop had already invalidated the engine token. Restart had the same gap.
Stop could therefore be acknowledged before a later unrequested playback start.

The existing actual-App ownership test host now exercises bridge Play/Restart,
button/menu Play/Restart, Pause, Seek, busy-paint cancellation, newer ordinary
Play ownership and normal successful starts. Its engine/device/render boundaries
are substituted; the App preparation methods and ownership predicates are real.
Six ordinary cancellation/ordering cases and two hint-growth cases failed on the
unchanged 0.6.55 implementation. Their red output is retained.

Play and Restart now share `startPreparedTransport`. It combines an App request
generation, the engine's transport revision and any caller-supplied ownership
predicate. The combined predicate travels through hydration, busy paint and
native preparation. The engine reserves its own generation synchronously when
start is dispatched; the App records that revision immediately and rechecks it
after the await. Stop, Pause, Seek and project changes therefore remain able to
cancel the request before or during engine startup. A newer preparation owns its
own busy state, and older completions cannot clear it. Expected cancellation is
quiet; current preparation failures still propagate.

Existing MIDI `ownsStart`, hydration repair callbacks and Finish/selection
ownership are composed rather than replaced. Their regressions remain in the
complete source suite. Native sample timing, capture code and DSP are unchanged.

## Metadata retention defect and bound

The native decoded PCM cache remains bounded by its unchanged 512 MiB LRU. The
separate JavaScript residency hints were an unpruned Set. A control with 1,000
source revisions of one asset retained 1,000 strings, even while the simulated
native cache stayed tiny. This was metadata/history growth, not unbounded PCM.

Hints now retain at most one revision per asset and at most 256 distinct assets.
An individual serialized hint key is retained only at 512 characters or fewer.
Insertion/access updates recency. This bounds historical metadata and the
retaining-Stop snapshot independently of native audio memory. A hint pruned by
count, revision or key length simply uses the original full-byte transfer path.

Stop still invalidates in-flight acknowledgments. Restoring a successful retained
snapshot does not overwrite a newer hint learned during that Stop. Failed,
legacy, empty or superseded Stop acknowledgments remain conservative. Exact
content revision checks and the existing one-shot native-eviction retry remain.
Tests cover 1,000 revisions, 1,000 distinct assets, pruned/full-byte fallback,
current fast-path reuse and oversized keys, alongside the existing lifecycle and
lost/stale acknowledgment regressions.

## Validation and release boundary

The complete manifest-owned 0.6.56 suite passed **1,291 tests in 108 files**;
TypeScript, synchronized version/CI checks and production UI build passed.
The full production/static browser suite, including both unchanged 150 ms worker
limits, must be recorded for this exact corrected source. Hosted development
browser success does not substitute for those production-worker cases.

The prior 0.6.55 static rerun passed all62 cases, with cancellation/completion
heartbeat gaps11.1/104.6 ms. Its original208.3 ms failure and isolated101.4 ms
pass remain retained; none is silently relabeled as a 0.6.56 result.

The owned 0.6.55 preparation was deliberately terminated during Cargo tests
after the independent-review blocker arrived. The observed compiler exit was
caused by that controlled stop. No installer or receipt existed; partial output,
process provenance and completion/log files remain retained. Do not resume or
rebuild that version. Frozen0.6.54 and the private0.6.53 take are unchanged.

No0.6.56 installer, installation, current microphone take, complete installed
acceptance, merge or publication exists. Independent review of the corrected
immutable head precedes renewed release progression. Recheck user work before
replacement and request microphone readiness only on the final installed
candidate. The existing capture thresholds/verifier rules remain unchanged.

Published Chordsmith/DJ/Core sources and the held main Godot addon are unchanged.
Horde optimisation remains deferred until DAW and Godot are done and published.
