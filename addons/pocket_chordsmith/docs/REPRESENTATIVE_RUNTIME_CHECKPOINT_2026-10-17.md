# Representative rendered runtime checkpoint, 17 October 2026

This is a source review checkpoint for candidate 1.3.0, based on released monorepo
commit `63c89d4687e7e8aea26287297ed83badcef6bc63`. Public Godot remains 1.2.0.
Production addon changes are transplanted from independently reviewed PR127
`9609876ea44c69751631ad8f399f88ab66d5eff8`; the combined historical branch is not
merged. Released DAW, browser, DJ and Core source bytes remain unchanged.
No new production timing adjustment is justified by these measurements.

## Implemented and tested

The reviewed source includes section-local prepared origins, explicit fullmix/layer
selection, native arranged chart timing, guarded finite PCM endings, background
prepared loading with cancellation/ownership guards, and finite editor audition.
Existing chart/share-code compatibility and Godot players/buses remain the basis.

New first-party diagnostic tools under `scripts/godot-runtime/` use a small rendered
800x480 scene with 48 moving actors and twelve pooled SFX players. Four phase-coded
plain/addon routes admit the instrumentation first. Musical cases then run complete
finite references while issuing ten SFX requests per second. The probe retains
frame gaps, conductor spans, player positions, scheduler deadlines, captured PCM,
source hashes, backend identity and explicit 180ms main-thread delay controls.
PCM and JSON persistence run after observation, avoiding prior in-window encode and
peak-scan interference. No existing game is edited. All captures are engine-bus
output, not microphone or speaker-consumed audio.

Godot 4.6.3 official `7d41c59c457bd5a245092b4e7eb2d833e3b3f8c3`, Windows,
OpenGL compatibility, NVIDIA RTX5050 Laptop GPU/610.47, WASAPI/48kHz were observed.
No global driver or device setting was changed.

| Evidence | Result and scope |
| --- | --- |
| WASAPI phase-code admission | Four routes, zero capture drops, preserved anchors; maximum player/wall error below10ms. Steady phase maxima below25.1ms. |
| Matched Dummy admission | Same source/scene, zero drops; maximum phase error below77ms. This sample passes the unchanged150ms bound and does not reproduce or clear older intermittent Dummy failures. |
| Fresh Core0.3.0 fixture, D/G/Bm/A at76BPM | Fullmix and five-layer playback, both standalone and synchronized, preserve complete decoded48kPCM and natural endings. Maximum fullmix error2.46e-6; layers3.30e-5, within original PCM16 tolerances. |
| Exact installed DAW0.6.59 exported pack | Original44.1k audio plays through observed48kWASAPI. Both addon modes match a concurrent plain-player Godot resampler control exactly, including the fixed source-duration/tail window. This is rendered-control parity, not direct44.1k-to48k decoded PCM parity or a resampler certification. |
| Retained native48k conformance fixture | Both addon modes preserve all425127 source frames, complete tail and natural ending against decoded reference; maximum error1.65e-6. Fixture contains generated recording-path media, Campfire, native FX/automation; no fresh physical-recording claim. |
| Cold loading and warm Play | Musical cases prepare without autoplay; measured main-thread per-asset work below1.4ms, warm Play below2ms. These short fixtures do not prove arbitrary asset-size or long-session limits. |
| Source-only suite | All15 existing source/runtime/editor stages pass; includes49 arrangement-ending,104 prepared-worker,157 worker-ownership and82 passage-audition checks. Shutdown waiter markers and strict script/leak guards pass. The separate12 Node process/shutdown guard tests pass. |

PCM comparisons retain original tolerances: max absolute error8/32767,
RMS2/32767, latency alignment at most0.5seconds, full reference coverage, and
tail-energy checks. Silence and missing-final-frame controls must fail. Native
layer exports are not claimed to reproduce shared/master FX by summing stems.

## Failed attempts and limits retained

The original150ms clock,33.333ms frame, one60Hz-frame main-thread cold load and2ms
warm Play limits are unchanged. New musical startup gaps of95-102ms fall almost
entirely inside the explicit first `RenderingServer.force_draw` call, before any
conductor playback. Deliberate180ms delays remain recorded as frame failures;
whole-run frame gates therefore fail. Fresh finite active windows contain no other
above-bound gap. This measured attribution does not assign causes to historical
unlabelled199/45/520ms or active-gameplay failures, which remain open.

The first musical attempt failed before playback because the harness omitted its
chart output directory. The first native run rejected direct PCM comparison when
WASAPI's actual48k rate differed from the44.1k reference. A later harness fix
resolves live players each sample because native setup can replace the initial
player reference; the preceding invalid native clock readings are retained.
The corrected current-native sample has preserved anchors and less than11ms
player/wall error in both modes. No clock behavior was changed in production.

The48k fixture snapshot guard correctly reports changes to two copied, preexisting
generated `.tres` outputs when importing its manifest. All154 addon source files
and original WAV/JSON inputs remain unchanged; original retained fixtures outside
the copied project are untouched. Future projects exclude generated resource
outputs rather than treating them as immutable source inputs.

The first source-only suite attempt crashed after an editor-settings save failure
in the restricted host profile. The corrected suite uses project-scoped settings
directories and retains its project/logs without packaging. Ordinary bus-routing
warnings and existing Unicode-NUL diagnostics remain unsuppressed; their origin
has not been established. One Core run overlapped the start of that source-only
attempt; it is not presented as a controlled quiet-machine benchmark.

## Published and blocked ledger

| Item | Implemented | Tested | Published | Remaining hold |
| --- | --- | --- | --- | --- |
| Candidate addon source | Reviewed127 transplant plus diagnostic tools | Source suite and bounded rendered references above | No; public1.2.0 | Independent review of this immutable transplant/checkpoint |
| Core/Chordsmith and arranged DAW prepared playback | Yes | Separate source/reference/control scopes above | Candidate only | Brief human listening with music/SFX and stop/transition interactions |
| Performance/clock claims | Instrumentation present | New samples pass scoped active/clock bounds; all historical failures retained | No universal claim | Historical intermittent stalls/divergence and representative longer-use confidence remain unresolved |
| Store/Library compatibility | Candidate metadata documents4.6 line |4.6.3 runtime; prior4.4.1 compile/API checks only | Public listing still older4.4/1.2 | Final candidate metadata must use tested4.6 line; no full4.4 runtime claim |
| Release ZIP, itch, Store, Library | Existing addon-only packager available | Packaging deliberately not run | None in this checkpoint | Source review and runtime/listening acceptance first; Sam uploads Store ZIP himself; no Store API access or duplicate submission |

Local raw evidence is retained under
`local-artifacts/scratch/validation/representative-scene/`,
`representative-musical-scene/` and `godot-source-ci/`. The private checkpoint
receipt maps each immutable input, attempt and analysis. No bulky/private recording
evidence is included in this source checkpoint, and no addon release ZIP exists.
