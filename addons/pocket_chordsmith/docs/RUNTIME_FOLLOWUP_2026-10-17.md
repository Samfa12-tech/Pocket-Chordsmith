# Runtime follow-up and corrected native-mode evidence

PR143 remains frozen at `2fb2f49df3659402d9290b6c6ed98dd2498ee700`.
Its hosted Godot job117279523937/run38993078036 tested merge commit
`a8ebba0dc53ca6f3e662de342c254f76738aa802`, whose parents are released main
`63c89d4687e7e8aea26287297ed83badcef6bc63` and that PR head. Its206 NUL
diagnostics and original artifacts remain unchanged, with merge-ref provenance.

## Corrections

The production follow-up `04ea76fede839c2557f4c04b2ebf18df7781df2d` replaces
invalid `String.chr(0)` construction in two path guards with the actual returned
replacement character, preserving their rejection behavior. The isolated original
call emits one warning and returns codepoint65533. See
[the cause and exact scope](NUL_DIAGNOSTIC_CAUSE_2026-10-17.md).
All16 source-only stages pass, including31 path-policy checks, with zero
Unexpected-NUL messages. Ordinary unrelated bus-routing warnings remain visible.

A separate measurement defect was then found: native JSON-manifest imports save
profiles beside the pack. Preparing two modes into that same pack overwrote the
first profile, so the previous native musical runs labelled standalone and
synchronized both used synchronized playback. Their PCM remains valid for that
mode, but their standalone musical claims are withdrawn. This was a harness error,
not evidence of a production playback defect; old logs/receipts are retained.

The preparation tool now saves the returned profiles to distinct route paths.
The musical probe rejects saved-mode mismatches and records actual ownership after
Play: standalone must have the selected number of active layer players and no
active synchronized player; synchronized must have one synchronized player and no
active layer players. Merely checking requested configuration is insufficient.

Both affected native cases were repeated once with corrected preparation and
observed ownership. The current44.1k installed0.6.59 export matches the concurrent
48k Godot resampler control exactly in **both observed modes**. The retained48k
conformance fixture preserves all425127 decoded reference frames/tail in both
observed modes, maximum error1.65e-6. Natural endings, zero capture drops and
silence/final-frame negative controls pass. Current-export clock errors are
18.049/18.258ms; retained48k errors11.648/11.828ms, below unchanged150ms.
These corrected results supersede the earlier duplicate-mode claims, not the
retained evidence. Core's distinct-profile preparation was unaffected.

## Bounded rendering-mode attribution

Four serial controls used the exact frozenPR143 source and the same rendered
48-actor scene: automatic visible-window rendering and the historical minimized
forced-draw mode, each with Core and native audio. Each has45s stopped,15s looping
music/SFX, then explicit180ms delay and50ms CPU calibrations. The stopped interval
extends past the old Core failure's roughly39s offset. No source patch or driver
setting was used to manufacture a performance pass.

| Workload | Maximum ordinary stopped gap | Maximum ordinary music/SFX gap |
| --- | --- | --- |
| Automatic Core |19.12ms|17.12ms|
| Automatic native |17.65ms|17.34ms|
| Forced-draw Core |17.41ms|17.25ms|
| Forced-draw native |20.26ms|17.45ms|

All ordinary windows pass the unchanged33.333ms bound. Whole-run gates fail,
retaining the known delay/CPU gaps. Automatic Core also retains an89.252ms startup
gap before addon setup; scene draw CPU spans account for less than0.5ms. Its CPU
counter coverage is incomplete, so its residual is not assigned to GPU or OS work.
No equivalent startup spike appeared in the other serial cases; ordering/cache/
background state was not controlled, so this is not a rendering-mode speedup claim.

External read-only counters query only each owned process and its uniquely earliest
created thread candidate. They are quantized counters, not a native callback-bound
thread identity or scheduler trace. The known delay has zero charged candidate
CPU; the known50ms CPU control has about46.875-62.5ms bracketed candidate CPU.
All sampler brackets and actual periods remain. This validates the discriminator
for these controls but cannot retrospectively assign the older199/45/520ms or
other unrecorded active failures.

Because the controls intentionally retain frozen source, their setup still emits
72 Core/34 native NUL warnings; their runtime logs have none. The frozen native
preparation issue means both rendering-mode native controls use synchronized
playback despite the old requested standalone label. Their rendering comparison
remains matched, but they are not counted as standalone native music evidence.
The corrected musical cases above provide that evidence separately.

No historical unexplained stall reproduced. That acceptance hold remains open;
new quiet windows do not waive it. Concurrent source inspection and small Git/
network operations occurred on the shared host; no controlled quiet-host or
universal hardware-performance admission is claimed. The audio-sensitive window
ended after the four controls and two corrected native runs; other task builds
were held during that window.

## Remaining release holds

Independent review of this follow-up, unresolved historical performance failures,
and brief human listening remain required. No final release ZIP or public upload
was performed. Candidate compatibility remains the tested4.6 line, public1.2.0
unchanged. Sam uploads the final Store ZIP; no Store API key or duplicate submission.
Raw PCM, source/hash snapshots, failed attempts and counter traces remain local;
no private microphone evidence is uploaded.
