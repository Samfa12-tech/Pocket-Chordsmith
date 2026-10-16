# Ordinary prepared arrangement endings

An ordinary imported Core full-song profile used the adaptive section-sequence
progression path. At a musical section boundary it could seek/restart the global
prepared WAV, even with `loop_enabled=false`. Runtime captures found the final
37.333 ms of a two-second Core reference changed before its PCM was consumed.
The conductor also remained logically playing. Native arranged packs already
had a complete-arrangement ending path and passed their full reference.

The conductor now tracks whether its sequence came from the default chart
arrangement. Only that ordinary sequence, with global prepared arrangement
assets and no native section-loop preparation, shares the existing complete-
arrangement ending behavior. Section boundaries advance its gameplay cursor
without seeking the absolute PCM. Finite playback waits for the selected players
to finish, then stops; declared whole-song looping remains supported.

Explicit states, queued sections/sequences and native section loops retain their
existing progression. Intent is tracked separately from section names, so a
section called `arrangement` is not mistaken for default playback. The gameplay
cursor still advances for queued `NEXT_LOOP` transitions. Stop and worker
cancellation behavior are unchanged.

## Regression coverage

`pcs_prepared_arrangement_ending_test.gd` keeps conductor processing active and
captures actual Godot bus PCM in four standalone/synchronized fullmix/layer cases.
It requires finite completion, no unintended loop, complete energetic ending,
zero capture drops and freed conductors. It also covers declared ordinary,
state, section and sequence loops, a multi-section `NEXT_LOOP` transition and
Stop during a rendered tail. The test is included in the existing Godot CI gate.

The same test against the unchanged prior conductor fails all four finite-stop
and unintended-loop checks. A separate local fixture comparison checks all
96,000 Core reference frames plus both complete 425,127-frame native fullmix
routes, with the existing PCM/tail tolerances and silence/truncation controls.
No processing-disabled diagnostic is accepted as a corrected gameplay case.

This is an ending correctness change. It does not clear retained frame-budget or
intermittent clock failures, establish production-game/device/listening parity,
or authorize a release/replacement package. Review and release evidence remain
separate. Bulky runtime evidence stays local; no workflow retention or spending
settings are changed by this patch.
