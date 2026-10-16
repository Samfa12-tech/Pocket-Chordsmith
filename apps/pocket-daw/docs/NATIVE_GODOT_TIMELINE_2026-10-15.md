# Native DAW arrangement chart checkpoint

The old high-level DAW pack importer compiled the first embedded Chordsmith
project. A real native export with a moved clip, gap, generated recorded-media
fixture, FX and clip automation lasted 8.8568125 seconds; that importer produced
a 4-second A/B chart. Import success alone therefore lost the edited arrangement.
The failed before probe is retained as `native-godot-highlevel-before.log`.

New DAW game manifests include `nativeTimeline` v1: the same bounded native
PPQ/time map used by playback, bar/meter coordinates, original clip placement and
authored markers. The existing map builder now lives in the shared DAW timeline
module; it is not duplicated. Export leaves project/source/loop JSON unchanged.
The original portable `.pocketdaw` source remains in the pack.

The high-level Godot importer compiles this timing map directly and defaults to
the native full mix at global origin 0. One `daw_arrangement` occurrence preserves
gaps and reads its ending from the actual full-mix WAV, including native release
tails. It does not substitute embedded PCS sections or reconstruct native DSP.
An explicit layers choice uses the independently rendered stems; nonlinear bus
processing means their sum need not equal the native full mix.

The conductor maps time/seek positions through the native PPQ map and emits mapped
bar/beat and marker signals. On reaching the chart endpoint, it lets Godot's
players consume their complete audio before stopping or restarting a requested
whole-arrangement loop. Gameplay frames cannot cut queued PCM. This is not a
claim of gapless native whole-arrangement looping. The editor identifies the
prepared arrangement and disables procedural preview rendering for it.

Chordsmith/Core and legacy packs without native timing retain the existing
source/adaptive route. Re-export edited native projects to obtain the new route.
Earlier public addon builds do not understand nativeTimeline; this is an
unpublished source candidate and requires the updated addon. Release version and
advertised Godot compatibility still need final reconciliation.

Limits are explicit: at most 16384 bars, bar-aligned meter changes, the existing
manifest/package size limits and validated monotonic finite timing maps. Ordinary
native WAV export remains available for unsupported timeline metadata. Native
arrangement note-level game-event reconstruction and adaptive section remixes
are not implemented; original source and placement metadata are preserved.

## Evidence

After integrating the PR98 bridge correction, full DAW 1208 and TypeScript/
production build pass. Targeted export/native/timeline 73 also pass with actual
project.tempo automation 120→180 and a denominator change. The initial source run
passed 1186 but skipped 14 browser-parity cases because the process browser path
was missing; that failed suite passed 14 after the path was corrected. The final
integrated 1208 run is a single successful full gate.

Final Godot 4.6.3 gate passes, including 21 new native arrangement assertions,
existing 30 mix / 17 ending / 8 residency / 6 loop-clock / 64 origin checks and 138 addon-only
package entries. New assertions cover audio-only import with no embedded PCS,
tempo/meter mapping, markers, seek, tail retention, queued-player completion,
natural end and malformed/unsupported metadata. Full gate logs are retained as
`native-timeline-godot-final-ending.log`. Test-script formatting/type errors,
runtime-created unimported unit WAV setup and an early fixed-wait failure remain
in their unsuccessful diagnostic logs; the final test polls actual player
completion with a bounded deadline.

Real native worker rendered seven production-pack WAVs through a file-backed
transport, with generated stereo media, trim/fades/clip gain, low-pass, master
compression and clip-gain automation. The high-level imported chart actively
processes in the runtime capture. Final rendered Windows WASAPI 48k comparisons
pass all four routes (full mix/layers × separate/synchronized players), all 425127
reference frames and 8.8568125 seconds, natural endings and silence-mutant
rejection. Worst max error 1.6540288925170898e-6; RMS 2.97520290942293e-7. Layer
references are the selected native stems, not an assumed sum-equals-full-mix.

Artifacts are in local validation `native-godot-route/run-1QILLX`: original native
inputs/WAVs, production ZIP/source, `capture-wasapi-final.log`,
`wasapi-capture/highlevel-parity-report.json` and
`wasapi-capture/rendered-pack-runtime.png` (visually inspected). Earlier successful
Dummy/WASAPI captures preceded the final queued-ending guard; final WASAPI data
supersedes them. A diagnostic frame-limited capture ended without four results
and is not a pass. Native WAVs were reused after capture-only corrections.

This is a small runtime reference scene and engine-bus PCM comparison, not
physical recording, human listening, installed DAW/Tauri IPC acceptance or a
full game's SFX/load/working-set budget. Those checks, broader transition/seek
PCM cases and final reviewed release targets remain active. No public upload,
installer preparation, dependency/security/licence change or microphone pass
is claimed. Capture plumbing remains unchanged.
