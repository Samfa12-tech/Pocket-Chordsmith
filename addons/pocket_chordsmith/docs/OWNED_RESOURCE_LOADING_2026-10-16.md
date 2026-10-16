# Owned background resource loading

The retained 1.3 candidate intermittently prints a zero-reference ObjectDB leak
after passing its audition assertions. A separate Godot 4.6.3 project reproduces
that warning without addon code: 512 correct ordinary Resource loads leak 513
objects through request/status/get. A synchronous control is clean. Deferring get
by one frame still leaks eight objects; ten final drain frames still leave 513.
These are per-run counts, not a universal leak rate.

The [4.6.3 loader source](https://github.com/godotengine/godot/blob/4.6.3-stable/core/io/resource_loader.cpp)
suggests a final-reference race around public threaded-request tokens. This is
an inference, not an upstream-confirmed diagnosis of every teardown warning.
The fail-closed guard and the failed evidence remain unchanged.

## Bounded addon correction

Each root-owned load job now submits a standalone RefCounted reader to Godot's
existing bounded WorkerThreadPool. The reader calls synchronous ResourceLoader
on a worker and retains its result; it never touches scene nodes or the consumer.
Main-thread processing polls task completion and joins only completed tasks
before publishing the same AudioStream. This path avoids the public threaded
request/get API. No OS thread is created per asset and no engine setting changes.
See the official [pool lifecycle contract](https://docs.godotengine.org/en/4.6/classes/class_workerthreadpool.html).

Stop, profile changes and consumer destruction detach the waiter immediately
while the root-owned job drains. If the job itself leaves the tree, it marks
itself detached, resolves its consumer and joins its task before release. The
conductor rejects that result before caching or scheduling a second asset.
Actual job/tree destruction can therefore wait for outstanding I/O; ordinary
consumer Stop/free does not. This is an explicit teardown cost, not a gameplay
frame-budget pass. Playback clocks, PCM ending/loop policy, gains, source
identities and cache-epoch guards are unchanged.

## Executed controls

- Pure pooled control: 12 runs of 512 correct loads, all clean under the unchanged
  guard. A separate owned-thread control was also clean; production uses the pool.
- 157 owned-loader checks pass: 128 real AudioStream reads and exact PCM,
  concurrent same-path Resource identity, eight concurrent uncached assets, and
  actual reads held inside live workers during Stop, consumer free and job detach.
  Final Stop/free calls took 39/79 microseconds without joining the active root
  job. Direct job removal waited about 51 ms for a deliberate 50 ms test hold.
- Whole-tree shutdown quits with a real loaded worker held for 150 ms, resolves
  the caller cancelled, schedules no second asset and releases without script
  errors, leaked objects/resources or abandoned-task warnings.
- The full pooled gate passes existing 23 async and 82 audition checks, both new
  lifecycle probes, clock/origin/mix contracts and 150-file addon-only packaging.
- Twelve additional 82-assertion pooled audition runs exit cleanly under the
  original error/leak guard.

## Separate measurement-tool cleanup

Fresh budget runs on both old and corrected loaders exposed a different leak:
AudioStreamPlaybackWAV and the synthetic sfx.wav were still held at tool quit.
The tool now stops that SFX player, clears its stream and drains two process
frames before removing the capture bus. Baseline and corrected controls then
exit cleanly under the original guard. This does not relabel earlier failed runs
or fix the engine's public threaded API.

## PCM evidence and remaining gates

Before the worker-copy follow-up below, EOF-padding/copy work was synchronous.
That initial pooled eight-by-60-
second fixture measured 20.081 ms main-thread preparation, above the 16.667 ms
target. Its 92,164,224 logical cached PCM bytes and warm Play maximum of 0.454 ms
pass only their scoped bounds. Baseline and initial owned-thread runs also exceed
the cold target. No performance improvement is claimed from this loader fix.

A rendered Godot 4.6.3/WASAPI 48 kHz control covers both native full-mix player
routes, generated section transitions and manual Stop. Both native captures
cover all 216,000 reference frames from 2.0 through 6.5 seconds: maximum error
1.647e-6 and RMS error 2.930e-7, with zero capture-buffer drops. Only proven
all-zero leading capture frames are removed, and silence mutants fail. The same
fixture emits the baseline's 28 nonfatal Unicode NUL warnings; this is not
universally clean stdout.

These measurements are not a full-game, peak process working-set, physical
output/device, general dropout or human level-matched listening pass. Godot
publication and representative-game acceptance remain open until corrected
source and actual candidates are independently reviewed. The frozen DAW 0.6.51
installer and existing held Godot ZIPs are unchanged.


## Worker-side prepared-WAV copy follow-up

The asynchronous imported `res://` stem route now performs WAV duplication,
section-loop setup and ending-padding copies in the same owned pooled reader.
A shared pure helper applies the existing PCM/loop policy to both synchronous
and worker callers. It receives an output-rate snapshot and never accesses
scene nodes or AudioServer from its worker. Cached raw PCM and obsolete ending
rate snapshots also use the worker. Legacy synchronous APIs and directly assigned
AudioStream values retain their existing synchronous behavior.

Only the consumer publishes caches, after the existing generation, profile,
signature and tree guards plus an output-rate check. Stop/free ownership and
bounded pool concurrency are unchanged. Prepared copies retain one cache entry;
unchanged compressed/non-WAV/unsupported-rate fallbacks retain their historical
raw/prepared aliases. Authored loop points and original resources/files are
preserved. Warnings are delivered on the main thread.

The main-thread metric includes submission/preflight and resumed publication;
worker wait remains separate. Three alternating serial baseline/prototype CPU
pairs used the same Godot 4.6.3, Dummy driver, eight 60-second stereo 48 kHz assets,
fixture/source hashes, inclusive timing boundary and teardown protocol. OS cache
was not flushed. The baseline processing algorithm was unchanged; only its timing
boundary and measurement-tool cleanup matched the prototype.

| Pair | Baseline main preparation | Worker-copy main preparation |
| --- | ---: | ---: |
| 1 | 20.492 ms | 1.229 ms |
| 2 | 21.936 ms | 1.189 ms |
| 3 | 21.095 ms | 1.067 ms |

All six process/teardown guards pass. The original 16.667 ms main-preparation
budget is met by all three prototype runs. Total cold completion took about
400–417 ms versus baseline 286–318 ms; reduced main-thread blocking does not mean
faster overall loading. One prototype game/SFX frame reached 43.602 ms, failing
its 33.333 ms bound; it is retained without an assumed cause or discarded outlier.
Broader sustained-frame and representative-game acceptance remains open.

After preserving fallback cache aliases, a fresh runtime run measured main
preparation 1.447 ms, warm Play 1.239 ms, cold-frame maximum 16.741 ms and the same
92,164,224 logical PCM bytes. This scoped pass does not erase the 43.602 ms failure.

The first optimization benchmark failed the unchanged ObjectDB/resource guard.
Verbose evidence identifies audio-playback objects still held at measurement-tool
shutdown. The tool now records weak references to its own active playbacks,
stops/frees players, and waits at most two seconds for actual release. A timeout
or missing/incomplete teardown report fails; the global error/leak guard is
unchanged. The identical cleanup is applied to baseline controls. Measured
teardown waits vary up to about 100 ms after the initial two frames. Failed runs
remain retained and are not relabeled as successful.

Worker controls cover PCM8/PCM16, mono/stereo, 44.1/48 kHz sources, loop/ending
policies, immutable imported resources/files, cached raw PCM, stale-rate metadata,
authored loops and unchanged fallback cache identities. An initial fixture
incorrectly compared a ResourceSaver constructor object with a separately loaded
Resource; that failure is retained. The corrected fixture retains the actual
imported Resource and adds explicit preconditions. Numerical CPU evidence alone
is not rendered game, peak process-memory, device-output or listening acceptance.
The frozen DAW installer and held addon release artifacts are unchanged.

A final-source headless Godot 4.6.3/Dummy 48 kHz AudioServer capture also passes both native full-mix routes: all 216,000 reference frames (2.0-6.5 seconds), maximum error 1.6465783e-6, RMS error 2.9295904e-7, zero capture-buffer drops, and rejected silence controls. This is runtime PCM evidence, not a rendered/device/listening pass for this follow-up. The corrected full source gate passes 104 prepared-worker checks, 157 owned-lifecycle checks, 23 async/82 audition checks, shutdown completion markers, clock/origin/mix contracts and 152-entry addon packaging. Both unchanged global result and scoped shutdown validator suites pass 12 Node tests.
