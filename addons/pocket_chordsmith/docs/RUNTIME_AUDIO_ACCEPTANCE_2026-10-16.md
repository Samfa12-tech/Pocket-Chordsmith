# Prepared audio loading and runtime evidence

This candidate uses Godot's threaded resource loader during explicit loading-scene
preparation of imported `res://` stems. It preserves the existing conductor,
Godot players/buses, prepared PCM ending/loop policy and playback clock.
`prewarm_sections_async()` prepares adaptive section sets;
`prewarm_arrangement_async()` prepares native DAW global full-song assets.
Neither starts playback. Synchronous APIs retain their existing behaviour.

The loader requests one asset at a time with subthreads disabled, polls across
frames, and retrieves only a completed request. A temporary root-owned job drains
I/O even when its conductor leaves or is freed. Cancellation detaches the consumer
while it is alive, preventing a suspended coroutine from retaining its old
profile. It does not abort Godot's already-requested disk operation. Explicit
cancellation, profile replacement, in-place path/policy changes and tree exit
reject cache promotion. Successful warm preparation reuses the same PCM resource.
This follows Godot's [ResourceLoader API](https://docs.godotengine.org/en/stable/classes/class_resourceloader.html).

`threaded_assets` counts imported worker loads. `max_thread_wait_us` measures the
wait; `max_asset_load_us` measures remaining main-thread preparation. Raw
unimported WAV decode and copying PCM for the prepared ending guard still run on
the main thread. Prepare before gameplay: this is not a per-frame guarantee.

## Local cost measurements

The reproducible manual harness makes eight distinct 60-second stereo PCM16
48 kHz assets by repeating a retained native-derived WAV. It loads eight assets,
plays four music layers, moves a label, and issues short generated game SFX.
Its background-only, music and music-plus-SFX phases each last three seconds.
The first conductor load is measured; the OS file cache is not flushed.

| Measurement | Local evidence |
| --- | --- |
| Previous synchronous per-asset load | 29–31 ms; headless cold frame max 31.096 ms |
| Threaded imported load, reproducible headless run | Eight worker assets; main-thread prepare max 19.837 ms; cold frame max 21.113 ms |
| Warm Play, 20 starts | Max 0.435 ms |
| Headless baseline / music / music-plus-SFX frame max | 17.708 / 16.758 / 16.700 ms, 60 fps cap |
| Headless SFX | 23 requests; nonzero captured SFX bus PCM, peak 0.053294 |
| Prepared PCM residency | Eight resources, 92,164,224 bytes including ending guards |

The main-thread preparation target of one 60 Hz frame **was not met**. The warm
2 ms start and synthetic 33 ms steady-state CPU frame targets were met in this
run. Logical resident PCM is bounded by this fixture; it is not process working
set, peak memory or long-session evidence.

A separate rendered WASAPI run used Godot 4.6.3 / OpenGL compatibility on the
NVIDIA GeForce RTX 5050 Laptop GPU, driver 610.47. Its graphics-only baseline
already had a 604.347 ms maximum / 513.332 ms p95 frame gap; music max was
746.776 ms and music-plus-SFX max 265.642 ms. SFX bus PCM was nonzero. The rendered
frame target failed; this does not isolate an audio cause or prove usable game
performance. Retain that failed baseline and investigate window/render conditions
before making a rendered performance claim. No GPU or security settings changed.

A separate process-only `--disable-vsync` control improved baseline/music/SFX p95
to 16.773 / 16.712 / 16.718 ms, but maxima remained 462.723 / 458.649 / 461.377 ms.
This control still fails the worst-frame target. It changed no project setting
or global driver configuration and does not establish the cause of those stalls.

Run from the repository with a retained stereo 48 kHz WAV:

```text
node scripts/verify-godot-audio-budget.mjs --godot-bin <godot> --native-wav <wav> --headless
node scripts/verify-godot-audio-budget.mjs --godot-bin <godot> --native-wav <wav> --driver WASAPI
```

Each creates a new ignored local-artifacts workspace with exact fixture hashes,
raw frame arrays, logs, summary and (when rendered) a screenshot. Measurement
success does not mean every timing budget passed; the summary lists each budget.

## Float-WAV compatibility boundary

Production DAW game packs currently declare and write PCM16. A separate
compatibility fixture replaces only their full mix with PR103's actual native
float32 render (SHA-256 `c39cdd5bb66ce66cb2b394e58afea9d62529c05825db669b60ebf24abf266c3d`).
It is not a production float32 game-pack export or a new supported format claim.

Godot 4.6.3 imports that float WAV as PCM16: 425,127 stereo frames / 8.8568125 s /
48 kHz. Four rendered WASAPI bus captures (full mix/layers, separate/synchronized
players) cover all reference frames, end naturally and reject silence mutants.
Float full-mix maximum error is 0.000030515 / RMS 0.000013392, consistent with
PCM16 conversion. Unchanged PCM16 layers have max 0.000001654 / RMS 0.000000298.
This is bounded PCM compatibility, not float-exact playback. Compression disabled
does not preserve float precision. Existing import logs' NUL warnings are also
present in the retained PCM16 baseline and are not a new float-only result.

The final capture also exercised the new global arrangement prewarm API before
each route: one or four threaded assets prepared, zero failures, no autoplay;
all four complete PCM comparisons and natural endings still passed.

The actual native source includes Campfire plus generated recorded-media-path
audio, clip edits, FX, automation and tail. Generated media is not a physical
microphone recording. Engine-bus capture on WASAPI is not device-consumed PCM or
human listening evidence. No installed DAW or physical-device pass is claimed.

## Regression and remaining gates

The corrected 22 deterministic loading checks cover cold/deduplicated and warm PCM,
global native arrangement preparation, no autoplay, explicit/profile/in-place
cancellation, exit/free, eventual owned-job cleanup and missing assets. Verbose
teardown completed without leaked objects/resources after the coroutine fix.
The full Godot gate and addon-only package check passed (142 files); final CI
and independent source review remain separate.

Still open: representative full-game/load/unload/long-session/peak working-set
and transition/dropout evidence, rendered frame stalls, human level-matched
listening and final release payloads. Runtime testing is on 4.6.3; public 4.4
compatibility advertising still needs reconciliation before publication.
No addon version, licence, publication, account or credential changes here.

### Review correction to PR106

The hosted Godot job for head `844370fb1afcf338186f129a7b55dbf075120534`
printed a previously-freed-instance script exception at the old lifecycle test's
`_free_subject`, then reported `failures: []` / 19 checks / exit 0. That run is
**not a clean Godot 19/19 pass**. Disabling processing on `child_entered_tree`
did not deterministically hold completion through `_ready` and fast loading.

The follow-up uses a test conductor factory with a delayed-completion load job.
Its real resource request starts normally, but completion stays explicitly held
while the consumer is detached or freed. Assertions prove the consumer is gone
and the owned job is still pending before releasing completion, then check
eventual cleanup. It does not claim cancellation coverage from a validity guard.
The default production factory returns the same existing load job.

`verify-godot-ci.mjs` and the measurement runner now reject unexpected script
exceptions or leaked objects/resources even when Godot exits zero. Six Node
regressions include the exact hosted exception plus its misleading green summary;
replaying the retained hosted output through the guard also rejects it. Ordinary
warnings remain distinct from unexpected runtime errors. Local corrected loading
checks and the fail-closed full Godot gate passed; exact follow-up hosted/source
review remains pending. Prior float-conversion and failed performance-budget
evidence remains scoped to its retained source/captures and is not upgraded.
