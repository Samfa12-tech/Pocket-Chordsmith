# Version1.3.0 runtime acceptance — 17 October2026

The accepted runtime target is Godot4.6.3 on Windows/WASAPI. Store and Asset Library
metadata target the4.6 line. Older4.4.1 API-compilation evidence does not establish
full4.4 runtime validation. This release preserves the reviewed runtime bytes;
the final acceptance changes release documentation and metadata only.

Core-derived prepared audio and fully arranged native DAW-export audio were
checked in actual standalone and synchronized Godot players. Separate WASAPI
controls verified decoded output, rendered endings/tails and sampled clock bounds,
including native44.1→48k output against a concurrent raw-player resampler control.
Human listening passed for both sources, both playback modes, short game SFX,
Restart next bar and Stop. Button receipts record restart requests in synchronized
mode; standalone-specific restart is not independently established by those logs.
These are scoped observations, not every-device or every-project guarantees.

One final379second silent Dummy-driver replay used the historical canonical
reactive scene and original Core2second/native8.8568125second assets, with a
concurrent raw player and an additional native music/SFX extension. Across120seconds
stopped and240seconds playing, all21,600 wholly contained steady frame intervals
met the unchanged33.333ms limit; maximum18.061ms. The older199/45/520ms stopped
stalls were **not reproduced; cause unknown**. Their original failures remain
retained, and no historical root-cause or universal hitch-free claim is made.

Seven whole-run over-budget intervals remain, including startup, synchronous
import/setup, diagnostic PCM encoding and final trace persistence. The largest was
259.381ms; a further133.575ms post-report interval was captured externally and
retained. Import and preparation should finish before steady gameplay. New
post-prewarm Play calls were381µs/288µs; this is not a fresh cold-import guarantee.

The plain Dummy player exceeded the unchanged150ms wall-clock phase bound, reaching
about946ms in the extended window. Addon loop-local phase checks are not absolute
loop-count proof. Dummy timing remains failed; acceptance covers the separately
verified Windows/WASAPI target. Zero capture-buffer discards and nonzero SFX are
liveness evidence, not proof that every possible audible dropout is absent.

Engine-memory samples retained stable resource counts and zero orphan nodes, while
diagnostic trace allocations grew. This is not an hour-long leak or process
working-set guarantee. Native window-thread CPU counters were directly bound to
the owned HWND, but quantized CPU/cycle brackets do not identify scheduler states,
native stacks or GPU causes.

The owner accepted this documented residual historical-stall risk after both human
listening checks. No further timing campaigns were required for this release.
Earlier candidate reports, failed controls, duplicated native-mode measurements
and their corrections remain available in the repository history and runtime
ledgers. This acceptance supersedes their pending-listening/release-hold wording;
it does not relabel any failed test as passed.
