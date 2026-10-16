# Selected DJ passage audition

The section-pad context now offers **Hear this bit** and **Stop audition**.
The visible range names the current section, chosen bar, actual preceding bars
and tail. An optional disclosure holds the passage settings and a manual listening
cue. Selection and settings never autoplay. The cue is guidance, not a measured
audio finding; stem/FX controls remain the manual override.

The existing live scheduler, voices and prepared Campfire bank are reused. The
finite plan preserves original section step indices and audio-clock timing; it
does not wrap, launch a queued section or advance the sequence. Whole-bar lead-in
includes preceding attacks. Earlier held notes need ordinary Play. Active builds,
drops and fills explicitly ask for normal performance playback instead of
silently changing that performance.

Audition Stop preserves deck FX, volumes, queued launch, hold and sequence settings.
It cancels real transient sources, including future starts, and fades the preview
master briefly. Prepared Campfire voices use their existing Stop. Held bass and
slide durations respect the musical boundary after accent scaling. Existing
effects retain their normal release; no physical silence or listening quality is
certified. Ordinary Play/Stop performance behavior remains separate.

Stop during preparation, an external control/edit, passage change or session
replacement invalidates ownership. Source/session snapshots after async readiness
reject stale preparation; obsolete errors cannot replace the stopped status.
Cancelling before a mixer action updates only transport/context nodes, preserving
the original control, keyboard focus and its first following edit. No saved
schema, original source, PCS1/PDJ handoff or dependency changed.

Validation: all80 existing/new desktop and phone Chromium cases passed, including
26 contextual cases, real nonzero-to-silent held-bass bus PCM, saved-deck identity,
queued sequence preservation, stale readiness, warm Campfire reuse, normal looping,
build/drop fallback, keyboard editing and320px reachability. The phone image was
inspected. Six existing Firefox/WebKit smoke cases and six scheduler-policy checks
passed. Lint, limited tooling typecheck, format, explicit source syntax,
deterministic9-fragment and existing size budget passed: active HTML232369/300000.

The final transport routing adjustment passes all30 contextual cases, including
existing Stop/Pause preserving FX without restarting. Those transport controls
own their cancellation once; other edits cancel before their handlers run.

The first fixture run selected option label2 when it intended value2 (bar3);
explicit value selection fixed that test ambiguity. That interrupted run is not
counted as passing. The final80-check run has no skips. Packaging/provenance,
hosted review and publication are separate gates. Broader proposal A/B and
Apply/Discard/Undo follow-through remains open; this slice introduces finite
audition and actionable manual guidance.
