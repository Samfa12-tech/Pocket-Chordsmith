# Pocket DAW Current Status, Historical Notes, and What's Next

## Current public alpha

Pocket DAW is live for Windows alpha testing on itch at `https://samfa12.itch.io/pocket-daw` and linked from `https://samfa12.com`.

- Current public release truth: see `docs/CURRENT_RELEASE_STATUS.md`; `0.6.38` is the current published updater checkpoint with timeline-first UI, Pocket Audio handoff hardening, punch/take-lane recording foundations and exact-artifact smoke evidence.
- Last completed public artifact record in this repo: tracked in `release-status.json`
- Last installed public smoke evidence in this repo: tracked in `release-status.json`
- Machine-readable release status: `release-status.json`
- Primary itch channel: `windows-installer`
- GitHub updater manifest: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Current published artifact commit: tracked in `release-status.json`

This is alpha-testing software, not a finished professional DAW. Future installed-app updates should be tested through the Tauri updater flow instead of requiring testers to manually redownload every build.

`docs/CURRENT_RELEASE_STATUS.md` is generated from `release-status.json` and is the release-truth anchor. Older version sections below are retained as historical implementation and QA notes; do not treat old version headings as current status unless the generated release-status doc agrees.

Source commits after the last published checkpoint are unreleased until the
next checkpoint is deliberately versioned, packaged, hashed, smoke-tested, and
published. Do not create another installer from a later commit while leaving
the package/Tauri/schema metadata at the previous public checkpoint.

## Current 0.6.38 Checkpoint

- Workspace/UI: Pocket DAW now opens timeline-first with inspector/detail docks minimized, the lower dock tucked by default in Music mode, a compact first-view timeline toolbar for only primary actions, full edit/range tools behind an explicit Tools expander, Music/Game Music focus presets that actually change layout defaults, and panel toggles that preserve timeline scroll.
- Pocket Audio handoff: the installed DAW launch path from `samfa12.com` now uses the download/open handoff flow, with downloaded/opened payloads accepted reliably and cleared after import so successful handoffs do not repeat unexpectedly.
- Manual smoke evidence from Sam on 2026-07-03: save/load passed, Pocket Audio handoff push from `samfa12.com` into Pocket DAW passed, and audible playback sounded good.
- Release evidence is tracked in `release-status.json` and generated into `docs/CURRENT_RELEASE_STATUS.md`; the 0.6.38 updater manifest, exact installer hash, installed punch/take-lane smoke and public manifest verification are recorded there.

## Checkpointed Source Work In 0.6.38

- UI density checkpoint: current source opens with the timeline as the dominant work area, hides native file inputs offscreen, keeps the lower dock tucked in Music mode, keeps full timeline/range tools behind the explicit `Tools` expander, and scrolls the app shell to the lower dock when rail/dock buttons open it. Sam manually confirmed the new UI direction is good enough to pause UI work for now.
- CI/release reliability checkpoint: `.github/workflows/ci.yml` now uses GitHub action majors that run on the current Node action runtime, Pocket Audio Core declares its Playwright browser-trace dependency, and `npm run verify:release` now runs both `verify:ci-workflow` and `packages/pocket-audio-core` `verify:family-parity` before DAW tests/build/package checks.
- Remaining goal boundary: the small/medium reliability and UI-density work is now checkpointed; the remaining north-star gaps are large feature tracks, especially simultaneous multitrack capture, user-facing punch/take lanes, pitch-preserving time-stretch/pitch-shift, richer routing/latency tools, compressed export codecs and eventual plugin-host research.

## DAW capability map and next direction

Pocket DAW's direction is a robust, free, native Windows-first DAW that works directly with Pocket Chordsmith, Pocket DJ, Godot, and web-game export workflows. Direct generative-AI music creation is not a product goal. Local diagnostics, import helpers, and MCP bridges may remain useful, but they should support deterministic DAW work rather than become the product identity.

Help/status note: user-facing DAW functions now have a broad human/AI guide in `docs/POCKET_DAW_FUNCTION_REFERENCE.md` plus an explicit 228-entry button/selector/shortcut catalog in `docs/POCKET_DAW_ACTION_CATALOG.md`, both sourced from `src/app/functionGuide.ts` and rendered in the in-app Help -> Function Guide panel. New controls should update that catalog and tests so crowded UI areas remain explainable.

### Capability map

- Multitrack recording: partly present. The app has an installed-app-only live recording alpha for one armed track at a time, with explicit per-track mono/stereo recording mode, native CPAL mono/stereo WAV writing, durable take grouping/channel metadata, and recorded project-media placement. Source now has explicit recording input assignment/preflight foundations that can model mono, stereo and future split-mono channel maps, expose Mono Ch N and Stereo Ch N-N+1 assignment choices in the mixer UI, file-first MCP command path and tokened live MCP apply-commands path, let MCP prepare future split-mono assignments while keeping them preflight-blocked for the current native alpha, reject unavailable channel assignments before native capture starts, keep non-default channel maps blocked from the current native alpha instead of silently recording the wrong channels, and expose that readiness through support diagnostics, file-first MCP project summaries and tokened live MCP status. Source also has a grouped future-capture planner, surfaced in file-first MCP summaries as `recordingFutureCapturePlan` and live MCP status as `recording.futureCapturePlan`, that turns valid mono/stereo/split-mono armed-track assignments into deterministic shared recordingSessionId/takeGroupId metadata, output channel counts and project-relative WAV paths without starting native multitrack capture. Source also has same-track grouped-take activation, whole take-lane activation for auditioning from the inspector, compact take-lane overview cards that show each lane's segment span plus active/muted/archived counts, file-first MCP and tokened live MCP, archive/restore, comp-from-playhead and active-edit-range comp segment foundations for audio clips that share a take group, a file/live MCP `set_punch_range` foundation that marks timeline selections as explicit punch intent, and helper-level, file-first MCP plus tokened live MCP punch placement foundations that can commit only an explicit punch window from a longer raw take either from command bars or from the active punch range while preserving source/take metadata through save/reopen. It does not yet support simultaneous multitrack capture, user-facing punch recording, full stacked-waveform take-lane editing, full comp editing, non-default native channel routing, or ASIO-oriented low-latency capture.
- Non-destructive editing: partly present. Clips reference source media, audio imports enter the media pool, generated sections remain source-backed, clip edits are undoable, and split/duplicate/trim/move workflows exist from menus and the selected-clip edit palette. Generated-section clips have undoable transpose, gain and role stem-mute controls for Drums, Bass, Chords, Melody and Guitar that affect playback/export without changing source Chordsmith data. Valid section-backed generated-pattern clips with patternId metadata now render through the Chordsmith section event engine while preserving their own sourceStartBar windows, transforms and stem mutes. Audio clips now have undoable inspector controls for clip gain, fade in, fade out, source offset, explicit duration, playback rate and varispeed pitch semitones, plus source-safe Short fades, Reset fades, Normalize, Analyze transients, Create/Clear warp markers, Apply warp rate, Invert phase, Reverse, existing-overlap Crossfade, split-clip Overlap fade, same-track grouped take activation, Archive/Restore Take, Comp from playhead and Comp range actions that write clip/media metadata from waveform/timeline context without altering source media. Reverse and varispeed rate/pitch-as-speed are carried through WebAudio playback, offline WAV render and native runtime-audio regions. Warp markers are metadata target/source anchors from analyzed transients; split/crop/source-window edits filter and retarget them, and Apply warp rate can derive an audible/exported global varispeed rate from the first/last anchors, but pitch-preserving time-stretch is not enabled yet. Audio split/trim and grouped-take comp splits preserve source offsets instead of altering source media; range comping now splits take groups at the active edit range and activates only the selected lane inside that range while leaving earlier/later active segments intact. Imported audio placement, invalid duration repair, overwrite splitting, left-edge trim/extend, source-preserving range split/crop/delete/ripple edits and overlap crossfade durations now use active meter-map bar lengths for clip lengths and source-offset seconds. Source now also has first-class timeline edit ranges: users, file-first MCP and tokened live MCP smoke can range a clip, set explicit ordinary edit ranges, clear them, copy the loop into the edit range, see a range overlay, split generated-section/generated-pattern/audio/MIDI clips at range boundaries, crop them to the range, delete the selected clip's range while preserving outside material, same-track ripple-delete clip ranges, ripple-delete the edit range across all tracks, preserve generated sourceStartBar windows and audio source offsets, and trim/shift MIDI notes plus CC/program/pitch-bend/aftertouch events during MIDI range edits. The next step is to deepen this into pitch-preserving time-stretch, pitch-shift, punch recording, full comping, and take-lane workflows.
- MIDI sequencing and virtual instruments: partly present. MIDI files can import into editable clips, preserve DAW-useful metadata for tempo events, time-signature events, key signatures, lyrics, SysEx counts and track summaries, convert imported tempo/meter metadata into a tested Media Pool tempo-map summary with bar/beat/tick and seconds positions, use multi-event MIDI tempo maps for MIDI note preview/render timing, and choose raw placement as one compatible clip, one clip per source track, one clip per MIDI channel, or channel-10 drum notes split by pitch while sharing the same source media-pool item. Users can also add an empty MIDI Instrument track and place an empty MIDI clip at the playhead for piano-roll authoring without importing a file. Imported or authored MIDI preserves, edits, duplicates and re-exports basic MIDI CC controller points, program changes, pitch bends, poly aftertouch and channel aftertouch, plays through the preview synth, applies channel-matched CC7 volume, CC10 pan, CC11 expression, CC64 sustain and pitch-bend detune to MIDI preview/render events, appears in the piano-roll inspector, directly edits clip bar length plus note pitch, tick, duration, velocity and channel, duplicates note and CC rows through undoable editor actions, extends the clip when authored or edited CC/program/pitch-bend/aftertouch ticks move beyond the current clip end, quantizes note starts and note durations to 1/4, 1/8, 1/16 or 1/32 grids, applies straight/55/60/65% eighth-note swing, applies deterministic Straight 16, Pocket 16 and Shuffle 8 reusable groove templates, runs clip-level Level 96 and deterministic Humanize velocity transforms, transposes whole clips by semitone or octave with MIDI-safe pitch clamping, split/crop/delete/ripple selected MIDI clips to timeline edit ranges while trimming/retiming overlapping notes, CCs, programs, pitch bends and aftertouch, maps selected General MIDI drum clips into generated Drums branch overlays and selected non-drum MIDI clips into generated Bass/Chords/Melody overlays without mutating the source MIDI clip or Chordsmith grids, explicitly adopts imported MIDI start tempo and supported /4 meter into project globals through UI/command/MCP paths when wanted, explicitly converts imported MIDI tempo events into hold-style project tempo automation points and imported MIDI time-signature events into project meter-map points without mutating the MIDI clip, lets users add/edit/delete project meter-map points in the lower-dock Automation tab and file-first MCP command path, displays effective meter-map meters in the ruler/readout, drives browser/native metronome beat counts and downbeat accents from project meter-map points, uses effective meter-map numerators for Beat snap during clip dragging, ruler seeking and command-path clip moves, applies active project meter-map bar lengths to shared timeline bar/seconds conversion, loop/seek bounds, event placement, generated native render-cache stem region timing and full-song duration, and exports notes plus preserved CC/program/pitch-bend/aftertouch events, DAW track-name metadata and project meter-map time-signature meta events for better interchange. Pocket Audio Core supplies native generated instruments. Missing pieces include fuller piano-roll workflows, MIDI recording from controllers, wider controller-to-instrument mapping, sampler-style instruments, deeper section/progression arrangement interpretation over variable meters, source-audio warp behavior over meter changes, and third-party instrument hosting.
- Audio routing and mixing board: partly present. Track volume, pan, gate, mute, solo, basic bus routing, return-track metadata, selected-track insert FX controls, selected-track send level controls, explicit post/pre-fader send mode metadata, first organizational folder tracks, routing export summaries/warnings in manifests, support diagnostics and the Export dock, first send-level automation for return tracks, stem export, full shared-kit source-view drum branch tracks that proxy lane volume/pan/gate/mute/solo, and a tabbed lower dock with Mixer, Inserts, Sends, Automation, Piano Roll, Audio Editor and Export views exist. Folder tracks are saveable/renamable timeline organizers and can hold/collapse child lanes; folder Mute/Solo now controls child-lane audibility in browser/native playback and render paths, but folders do not yet route audio, inherit sends/FX or create export grouping/stems. WebAudio playback, browser offline WAV render and the native renderer now split track input from fader gain so pre-fader sends can feed returns before source-track volume. Generated drum branch Solo now persists in drum-lane metadata, filters generated drum events to soloed lanes and invalidates native drum stem cache signatures. Drum-lane Gate scales generated drum event durations and participates in native drum stem cache signatures. Branch views and deterministic stems now cover Kick, Snare, Clap, Hi-hat, Open Hat, Low/Mid/High Tom, Crash and Ride; visible branch views also split existing Chordsmith level-2 Snare/Hi-hat source accents into Clap/Open Hat events while unbranched rendering remains Pocket Audio Core-aligned. Branch rows carry stable drum group/lane attributes and a grouped timeline treatment, and an undoable Hide/Show Branch Rows command persists group visibility without deleting branch tracks, routing, sends, FX or stems. Live-only branch rows now write DAW-only source overlay steps for Tom/Crash/Ride-style kit pieces that save/reopen, play, render and export in branch stems without mutating preserved Chordsmith source grids; the file-first MCP command path can now branch generated drums, cycle those live-kit overlay steps and set lane gate/volume/pan/mute for final smoke/bridge workflows. The next step is fuller send/return processing, folder-bus routing, clearer meters, latency tools, and export paths that reflect the routing graph.
- Plugin hosting: not present. No VST, AU, AAX, CLAP, LV2, or other third-party plugin format is hosted yet. This should wait until the internal mixer, render graph, automation contract, preset storage, latency handling, and crash-containment story are mature.
- Deep automation: partly present. Volume, pan, clip gain, clip fade-in/fade-out, clip source-offset, send-level, first built-in FX parameter, and first project-tempo automation lanes exist. Linear, hold, ease-in and ease-out curves are evaluated by the shared automation helper and clip-gain render paths, automation point rows expose the same curve choices through the UI, undoable command path and file-first MCP update command for track, send, clip-control and project-tempo lanes, and active lanes now render reusable curve surfaces that can be clicked or dragged to add drawn points directly into the lane as one undoable gesture. The first recorded/write automation path records live mixer volume/pan, send-level, prepared audio clip gain/fade/source-offset and numeric FX parameter moves into existing automation lanes during playback without auto-creating surprise lanes. Built-in numeric FX parameters can now create/add automation from the insert UI and MCP command path, attach back to the owning track, evaluate into native playback payloads at transport start, and schedule WebAudio/offline `AudioParam` changes for supported built-in parameters such as EQ frequency/gain/Q, gain, delay time/feedback/mix, compressor settings and modulation rate/depth. Selected audio clips have first-class clip-control automation lanes that save/reopen, render gain through audio-region envelopes, evaluate fade/source-offset lanes into source-safe audio-region metadata, reuse the existing automation point editor and accept live write points from prepared clip controls while playback is running. Selected track sends now create send-level lanes that save/reopen, update WebAudio playback/offline WAV render levels, and seed native playback at the start bar. Project tempo automation now has clamped BPM points, lower-dock UI, undoable commands, MCP command coverage, shared bar-to-seconds/seconds-to-bar timing helpers, generated/MIDI event placement, audio-region start/duration placement, WebAudio/native loop and seek bounds, timeline ruler bar/beat time labels, WebAudio/native metronome click timing, MIDI export placement, full-song browser/native WAV duration sizing, and browser offline WAV track/pan/send automation sampling through active meter-map bar lengths. Missing pieces include richer beat-grid snap/edit behavior over ramps, source-audio warp/time-stretch decisions, native continuous FX scheduling beyond start payload values, recorded automation for instrument parameters, and eventually hosted plugin parameters.
- Export and bounce: good foundation, incomplete product coverage. Full-song WAV, MIDI, stem ZIP, section-loop ZIP, selected-clip freeze-to-audio with media/render-cache provenance, render-cache, waveform-analysis and media-portability health summaries in diagnostics/About/feedback, the Export Details dock and export manifests, source `.pocketdaw`, Godot/web-game ZIP packs, and first-class game-state cue markers for calm/danger/combat/win/lose/menu are present. Stem ZIP, Section Loop ZIP, Godot and Web manifests now report sanitized media portability counts and warn when media must be collected or relinked before an embedded source project is portable. Section-loop and game-pack manifests compute loop lengthSeconds and marker seconds through the shared meter-map-aware timeline clock. Media portability now uses one shared verifier across Media Pool, Export Details, diagnostics and export warnings, including cache-only recovery state and path-free action reasons; Godot/Web game-pack embedded source projects are rebuilt through a portable copy that strips local provenance fields while normal saves keep recovery metadata. The DAW-side `verify:game-pack` command also parses the embedded source `.pocketdaw` JSON inside Godot/Web ZIPs, rejects local media reference fields without printing path values, and compares those counts with the manifest shared-media-portability summary. The Export dock exposes Full Song WAV sample-rate, tail, channel-mode, normalization, fixed-point Off/TPDF dithering, and 16-bit PCM, 24-bit PCM and 32-bit float controls; full-song, stem and section-loop WAV renders now carry their active profile sample rates, channel modes, peak-normalization settings, dither settings and 16/24/32-bit depth into the shared browser/native WAV renderer. Export-profile validation rejects unsupported WAV sample-rate/channel/normalization/dither/bit-depth settings instead of producing mislabeled files. Stem, section-loop, Godot and web-game ZIP builders now run a shared package self-check over manifest paths, ZIP entry summaries, artifact sizes and implemented WAV metadata before reporting success. In current source, ZIP export flows request a native Save As destination in the Tauri shell and fall back to browser downloads in dev/browser mode; do not describe that as public-release-smoked until the exact installer checklist records it. Missing pieces include MP3/FLAC export, richer bounce profiles, real-time bounce when needed, routing-aware print/freeze, and batch package reliability.
- Quantization for live instruments: early source-safe foundation only. MIDI quantization and reusable groove templates now provide the first timing tools; selected audio clips can write source-preserving transient marker metadata from waveform peaks, convert those transients into warp markers through UI/command/MCP paths, quantize existing warp marker targets to the project 1/16 grid without changing source anchors, draw stored transient markers in media waveform previews, play/export source-safe varispeed rate/pitch-as-speed clips, and apply a global warp-marker varispeed rate for audible timing correction. Groove matching, pitch-preserving time-stretch and careful multi-anchor playback/export timing correction remain future work.
- Vocal pitch correction/autotune: not present. This belongs after source-safe audio editing, transient/pitch analysis, time-stretch/pitch-shift, automation, and monitoring latency are reliable.

### Greysound non-AI lessons worth borrowing

- Keep a persistent left studio rail for Library, Clips, Media Pool, Project, Export, Diagnostics, Pocket handoff, and Godot/web-game tools. The useful pattern is fast navigation, not AI generation. The first left rail now provides Library, Project, Clips, Media, Mixer, MIDI, Audio, Export, Godot, Pocket, Diagnostics and Help navigation through the normal command path.
- Use a compact top strip with transport, time, tempo, key, meter, loop, click, count-off, and latency status visible without stealing timeline space.
- Make the lower area a single dock that can flip between Mixer, Inserts, Sends, Automation, Piano Roll, Audio Editor, and Export Details for the same selected tracks. The first lower dock now flips between Mixer, Inserts, Sends, Automation, Piano Roll, Audio Editor and Export while reusing existing selected-track/clip controls.
- Use a clear Add Track dialog for Audio, Instrument, Bus/Aux, Return, Chordsmith, MIDI, and Folder tracks, with mono/stereo/input choices where relevant. The current Library / Add Track panel now includes first organizational Folder tracks, clearly marked as non-routing timeline organizers with child assignment, collapse, and group Mute/Solo controls.
- Promote deterministic edit actions: analyze audio, clip gain, normalize, split, duplicate, fade, crossfade, reverse, invert phase, varispeed, time-stretch, pitch-shift, delete fades, and delete selection. Cut, copy, paste, duplicate, split, trim, mute and delete now exist in the selected-clip edit palette, while Normalize, analyze transients, warp markers, quantize warp marker targets, Apply warp rate, short fades, reset fades, invert phase, reverse, source-safe varispeed rate/pitch-as-speed, existing-overlap crossfade and split-clip overlap fade exist in the selected audio-clip inspector. First range-aware editing now exists through Range Clip, Range Loop (set edit range from current loop), Copy Range, Cut Range, Split Range, Crop Range, Delete Range, Ripple Delete, Ripple All and Clear Range across generated-section/generated-pattern/audio clips, with MIDI split/crop/delete/ripple trimming and retiming notes/expression events through the same command and MCP paths. The remaining work is pitch-preserving time-stretch and pitch-shift variants.
- Surface options such as pre-fader metering, loop, click, count-off, MIDI panic, latency calibration, and device setup as ordinary DAW controls, not hidden settings. MIDI Panic now appears in Transport and immediately stops preview playback/stuck active notes through the normal transport path.

### Native implementation rule

New DAW features should not be bolted on as side modules. Each important capability should become part of the project schema, command model, undo/redo stack, UI, playback engine, save/open path, render/export path, and smoke tests. Pocket Chordsmith, Pocket DJ, and Godot integrations should use those same primitives rather than separate one-off flows.

### Ordered future feature path

1. Release-state hygiene and installed reliability: Open, Save, Save As, recent files, media relink/reload, diagnostics, updater checks, and exact release smoke tests.
2. Pocket ecosystem polish: Chordsmith import/edit parity, Pocket DJ handoff, Godot/web-game ZIP packs, manifest correctness, game-state cue markers, and push-to-Godot after ZIP smoke is reliable. Pocket DJ `PDJ1:`/session imports now keep editable DAW clips linked to the embedded Chordsmith source while preserving DJ deck, mixer, launch, sequence and FX performance state as a separate `pocket-dj` source ref through save/reopen; the File window, diagnostics payload and file-first MCP project summary expose that preserved DJ state without silently applying it to the DAW mix, and future work can use the metadata for return/export handoff instead of asking DJ users to rebuild it. Timeline game cues now support calm, danger, combat, win, lose and menu values through schema/migration, UI, MCP and game-pack manifests.
3. Non-destructive editing foundation: clip gain, fades/overlap crossfades, source offsets, contextual edit menus, stronger split/trim/range selection, and source-preserving destructive-looking operations. The first edit-range model plus Copy Range, Cut Range, Split Range, Crop Range, Delete Range, same-track Ripple Delete, source-safe Ripple All, loop-to-range selection actions and tokened live MCP range setup/split commands now exist across generated-section/generated-pattern/audio/MIDI clips, preserving generated source windows, audio source offsets and outside MIDI notes/expression data. Valid generated-pattern clips now render Chordsmith section material through the same event engine as generated-section clips, making range-edited pattern slices audible instead of purely structural. Grouped audio takes can now comp the selected lane over the active edit range while preserving source offsets and outside active segments. Audio clips can now turn analyzed transients into warp markers, quantize warp marker targets to the project 1/16 grid through UI/command/MCP paths, play/export source-safe varispeed rate/pitch-as-speed clips through browser and native runtime-audio paths, and apply a global warp-marker varispeed rate for audible timing correction. Next deepen take-lane organization and pitch-preserving time-stretch/pitch-shift playback actions.
4. Media pool and waveform editing: better waveform display, audio analysis cache, project-relative media storage, relink UX, clip analysis commands, and per-clip metadata. Media Pool cards, diagnostics and project validation now summarize or warn on waveform-ready audio media, normalize-ready audio clips, peak point coverage, transient marker counts, stale analysis flags, decoded-cache counts and media-portability counts so future waveform/editing work has a project-health contract. Media waveform previews now draw stored transient markers over the peak display, and selected audio clips can persist target/source warp marker anchors derived from those transients without changing source media. Relinking audio and fresh reload analysis clear stale source-derived waveform/native-decoder/decoded-cache/transient metadata while preserving user annotations, then mark or report analysis state honestly, preventing old peaks, markers or decoded WAV caches from being treated as authoritative for a new source. Playback/export hydration from a source path or decoded native cache now applies the same repair metadata quietly without adding undo history. Project-relative media/cache paths are normalized for slashes and `project://media/` forms, traversal, absolute and scheme paths are rejected for reload candidates, and project diagnostics warn when saved refs are unsafe. Browser runtime-only audio stays non-reloadable/non-collectable but now exposes Relink so installed-app users can attach a durable native source.
5. MIDI sequencing and quantization: controller input, fuller piano roll, velocity/controller lanes, MIDI transform tools, and first-class sampler/instrument tracks. The first source-safe MIDI quantize/swing actions now snap selected MIDI clip note starts to 1/4, 1/8, 1/16 or 1/32, and note-length quantize snaps durations to the same grids while preserving starts, velocity, channel and expression metadata. Straight/55/60/65% eighth-note swing applies feel without changing duration, velocity or pitch. Reusable Straight 16, Pocket 16 and Shuffle 8 groove templates now apply deterministic timing/velocity feels through the same undoable MIDI clip command path and store the selected template in clip metadata. The first clip-level velocity transforms now level notes to 96 or apply deterministic +/-12 humanization without changing pitch or timing, pitch transforms transpose whole clips down/up by semitone or octave with MIDI-safe 0-127 clamping while preserving timing and velocity, the piano-roll note rows now directly edit clip bar length plus note pitch, tick, duration, velocity and channel, duplicate notes through undoable commands, and extend the clip when newly authored notes or CC points land beyond the current end. The first controller/program/pitch-bend/aftertouch lane foundation preserves, edits, duplicates and MIDI-exports CC number/tick/value/channel, program-change program/tick/channel, pitch-bend value/tick/channel, and channel/poly aftertouch value/tick/channel/note while mapping channel-matched CC7 volume, CC10 pan, CC11 expression, CC64 sustain and pitch-bend detune into MIDI preview/render events; edited CC/program/pitch-bend/aftertouch ticks extend the clip when needed so expression events remain playable/exportable. Raw MIDI import placement can create one clip, per-source-track clips, per-channel clips or channel-10 drum-note clips without duplicating source media, selected MIDI clips can map General MIDI drum notes into generated Drums branch overlays through UI/command/MCP paths, imported MIDI tempo events can be explicitly converted into project tempo automation through UI/command/MCP paths, and users can create an empty MIDI Instrument track plus empty MIDI clip for direct piano-roll authoring.
6. Mixer/routing dock: Mixer/Inserts/Sends/Automation tabs, full send/return processing, bus folders, meters, pre/post-fader choices, latency calibration, and routing-aware exports. The first lower dock now provides Mixer, Inserts, Sends, Automation, Piano Roll, Audio Editor and Export tabs over the selected track/clip; selected-track insert and send controls expose FX chains, return-track send sliders, explicit post/pre-fader mode, and send automation controls through both the dock and inspector, with edits routed through the undoable command paths. Export Details and game-pack manifests now include routing summaries and guarded warnings. Pre-fader sends now use the track input before fader gain in WebAudio playback, browser offline WAV render and the native renderer, so planned-mode warnings have been removed from diagnostics/manifests. Generated drum branch Solo now uses the same branch-view metadata path as branch volume/pan/gate/mute and filters generated drum events to the soloed lane; Drum Kit Lanes expose Gate as a first-class duration control that affects playback/render and native drum stem cache signatures. Branch Drums is available from the button path plus double-click and right-click/context affordances on the Drums track/clip surfaces. Stem and game-pack export plans now add deterministic shared-kit branch stems when generated drum branch views are visible, rendering each branch by keeping the parent Drums source audible and soloing the matching lane. Visible branch meters now tap matching parent drum-lane events so branch tracks show activity alongside the parent Drums meter. Visible branch lanes now own their generated event destinations, so branch output routing, FX and sends affect WebAudio playback, browser offline WAV render and native playback payloads while parent Drums remains the overall kit source view. Visible branch rendering now turns existing level-2 Snare/Hat accents into Clap/Open Hat branch events and stems without changing collapsed-source playback. Branch rows now expose drum group/lane data attributes and a grouped timeline treatment instead of presenting the kit pieces as unrelated generated tracks; Hide/Show Branch Rows is undoable and persisted separately from destructive branch removal. Live-only branch rows now author DAW-only overlay hits for Tom/Crash/Ride-style kit pieces that feed playback, save/reopen and branch stems, and file-first MCP commands can create the branch view plus author those overlay hits and lane-gate settings for smoke automation.
7. Deep automation: drawn and recorded automation for volume, pan, clip gain, clip fades, clip source offsets, sends, FX, tempo, and instrument parameters, with curves and reliable export playback. The first clip-control automation foundation now creates selected-audio-clip gain/fade/source-offset lanes, persists them through `.pocketdaw`, evaluates linear/hold/ease curves in audio-region envelopes or source-safe region metadata, and records live prepared clip-control moves into existing lanes during playback. The first send-level automation foundation now creates source-track-to-return level lanes, persists them through `.pocketdaw`, evaluates them in WebAudio playback/offline WAV render, and carries the start-bar value into native playback payloads. Automation point rows now expose Linear, Hold, Ease in and Ease out curves through the shared UI/command/MCP update path for track, send, clip-control and project-tempo lanes, active lanes render click-or-drag curve surfaces so users can place points visually as one undoable drawn gesture before fine-tuning rows, and live mixer volume/pan, send-level, prepared clip-control and numeric FX parameter moves now record into existing automation lanes during playback. Built-in numeric FX parameters now have first automation-lane creation/add-point controls in the insert UI plus file-first MCP commands, with evaluated start-bar values feeding native playback payloads and supported WebAudio/offline built-in FX parameters scheduled onto real `AudioParam`s. The first project-tempo automation lane now stores/evaluates clamped BPM points through lower-dock UI, undoable command and MCP paths, and the shared project timeline clock applies it to generated/MIDI event placement, audio-region start/duration placement, WebAudio/native loop and seek bounds, timeline ruler bar/beat time labels, WebAudio/native metronome click timing, MIDI export placement and full-song WAV render duration; next deepen recorded automation for instrument parameters, native continuous FX scheduling and source-audio warp/time-stretch behavior over tempo ramps.
8. Export and bounce expansion: MP3/FLAC, fuller bounce profiles, freeze/print tracks, routing-aware stems, batch exports, and release-grade package verification. The current WAV profiles expose sample-rate, channel-mode, peak-normalization, Off/TPDF dithering and 16-bit PCM, 24-bit PCM and 32-bit float controls in the Export dock, and full-song/stem/section-loop profile settings are honored by browser and native WAV renders; unsupported WAV settings are rejected before export until the renderer genuinely supports them. Stem, section-loop, Godot and web-game ZIP builders now self-check manifest paths, entry summaries, artifact sizes and implemented WAV metadata before success.
9. Stereo and simultaneous multitrack recording: explicit input assignment, stereo tracks, monitoring controls, low-latency device paths, full take lanes, punch recording, and comping. One-track mono/stereo recording plus input preflight, source-only grouped future-capture planning, grouped-take activation, UI/file/live MCP take-lane audition activation, lane-level MCP/status observation, UI/file/live MCP archive/restore, comp-from-bar and active-edit-range comp foundations, explicit MCP punch-range setup and helper/file/live MCP punch-window placement are foundations only; simultaneous capture, user-facing punch regions and full take-lane editing remain future work.
10. Audio quantization and pitch tools: transient detection, warp markers, source-safe varispeed rate/pitch-as-speed and global warp-marker varispeed now have a first playback/export foundation; pitch-preserving time-stretch, pitch-shift, groove matching, and vocal pitch correction/autotune still wait until preservation and latency are dependable.
11. Plugin hosting or bridge: evaluate CLAP/VST3/LV2 and related open-source host code only after the native mixer, automation, preset, render, and crash-boundary contracts are ready.

Future plugin-host testing resource: Sam flagged this community-maintained Reddit-user plugin spreadsheet as a useful candidate pool for eventual plugin-host smoke matrices: `https://docs.google.com/spreadsheets/d/1qYb97aGzuAzDK8YoNB3N1LaVOEoelJc7y2CXCZBd0RU/edit?gid=0#gid=0`. Treat it as an external research source, not an endorsement or bundled dependency list. Before testing against it, review each candidate for license/distribution terms, Windows availability, format support, offline installer safety, reproducible download links, CPU/crash behavior, preset/state persistence, automation surface, latency reporting, scan failure behavior and whether it is appropriate for a free Pocket DAW test matrix.

### Open-source acceleration policy

Existing open-source audio projects can accelerate Pocket DAW, but license and architecture review must happen before any code is embedded. Prefer permissive or clearly compatible components, native-service boundaries, and small focused libraries for decoding/encoding, waveform analysis, pitch detection, time-stretching, MIDI parsing, and plugin-format experiments. GPL or commercial dual-license codebases should be treated as references or separate optional tools unless the licensing is deliberately accepted.

Early research queue:

- Symphonia: Rust audio decoding/demuxing candidate under MPL-2.0; useful to review for native import/decode paths.
- CLAP: MIT-licensed plugin API candidate for future plugin-host research, likely friendlier than older proprietary plugin SDK assumptions.
- SoundTouch: LGPL-2.1 time-stretch/pitch/tempo library candidate; review linking and distribution obligations before embedding.
- Rubber Band: high-quality time-stretch/pitch-shift candidate, but GPL/commercial licensing means reference or separately licensed component unless deliberately accepted.
- aubio: pitch/onset/beat analysis candidate, but GPL licensing means reference or separately licensed component unless deliberately accepted.
- Tracktion Engine and JUCE: strong DAW/audio-framework references, but GPL/AGPL/commercial licensing and architecture weight mean research first, not a casual port.

## Windows project open polish

The 2026-06-20 live MCP smoke exposed user-facing workflow gaps. The 2026-06-28 installed `0.6.34` smoke now verifies the local file-association path; keep these rows as regression gates for future public checkpoints:

- Release truth is `release-status.json` plus generated `docs/CURRENT_RELEASE_STATUS.md`. Source commits, historical notes, and local dev runs are not public release evidence until those files record the matching artifact and installed-smoke result.
- Every new public candidate needs a dated installed-app reliability run in `docs/WINDOWS_TESTING_CHECKLIST.md` against the exact installer/updater artifact, not just the source tree.
- Native Open, Save, Save As and recent files must be manually smoked together: open `.pocketdaw`/JSON, save to current path, Save As to a new path, reopen both files, and confirm stale/missing recent paths fail clearly.
- `.pocketdaw` is registered as a Pocket DAW project file type for the installed app on this machine, with HKCU/HKCR ProgID and OpenWithProgids evidence.
- Cold-start `.pocketdaw` launch opens the clicked project, and second-instance launch focuses the existing app before loading the clicked project.
- The live bridge `open_project` action can reopen explicit `.pocketdaw` paths in the running installed app.
- `pocket-daw://` Chordsmith handoff still imports after association testing.
- Native audio import and MIDI import must be re-smoked in the installed app before the next public checkpoint: import, place/edit where relevant, save, close, reopen, and confirm media/MIDI metadata and unloaded-media statuses remain honest.
- Updater status must be visible through About/Diagnostics and Help -> Check for Updates. A checkpoint should record whether the installed app reports no update or finds the staged newer signed updater artifact.
- DAW -> Godot game-asset export/import has manual smoke evidence from 2026-06-28: Sam exported a project from Pocket DAW as a game asset, imported it into Godot, and confirmed it worked. Repeat future release smoke with artifact names, Godot/addon versions, import path, and validator result.
- Implementation and packaged-smoke plan: `docs/FILE_ASSOCIATION_IMPLEMENTATION_PLAN.md`.
- Keep the current MIDI import behavior clear: real `.mid` files import as editable MIDI media/clips, now with richer preserved metadata for tempo/time-signature events, key signatures, lyrics, SysEx counts and track summaries. Chordsmith's latest MIDI importer is useful as an optional interpretation layer, not a replacement for raw DAW import: borrow its pre-roll/guide-note cleanup, resolution/key/chord inference, channel/program/pan hints, phrase fingerprinting, and detailed import diagnostics for future DAW-native "Interpret MIDI" or "Convert MIDI to Chordsmith arrangement" commands. Design anchor: `docs/MIDI_IMPORT_AND_CHORDSMITH_CONVERSION_PLAN.md`.
- Keep recording scope honest: the current alpha remains one armed live track at a time, with source-level mono/stereo mode support. Future simultaneous multitrack capture should follow `docs/STEREO_MULTITRACK_RECORDING_PLAN.md`.
- Keep ASIO out of the default release path until host selection, diagnostics and installed-app evidence exist. Research anchor: `docs/ASIO_LOW_LATENCY_BACKEND_SPIKE.md`.
- Keep punch-in/out, comping and full take lanes out of release claims until the explicit design path in `docs/PUNCH_COMPING_TAKE_LANES_PLAN.md` has command, UI, save/reopen and installed-smoke evidence. The source-only grouped-take activation, archive/restore, comp-from-playhead and active-edit-range comp helpers are foundations, not a finished comping claim.
- Keep MP3, FLAC and compressed game-pack export out of release claims until codec dependencies, profile validation, manifest metadata and real target-runtime smoke follow `docs/MULTI_FORMAT_EXPORT_PLAN.md`.

## Architecture notes

- The current `src/app/App.ts` responsibility map and first extraction record live in `docs/APP_TS_RESPONSIBILITY_MAP.md`.
- The first low-risk extraction moved updater panel state transitions into `src/app/updaterOrchestration.ts`, while `App.ts` still owns native bridge calls and render timing.
- Future architecture slices should keep avoiding recording, file open/save, native cache, and game-pack export flows until each seam has focused state/behavior tests.

## Published in v0.6.19 - MCP heavy-metal MIDI arrangement

The MCP bridge now has a file-first `pocket_daw_arrange_midi` workflow in source. It parses a MIDI file, infers a simple A-H Chordsmith arrangement, applies current metal drums/guitar/FX presets, optionally keeps the raw MIDI as a muted reference clip, and writes only when `outputPath` is explicit. The live bridge source also accepts `open_project` for explicit `.pocketdaw` paths, so the packaged next build can create a project through MCP and then load it into the running app without computer-use UI clicks.

Smoke artifact generated from `C:\Users\sam_s\Downloads\Zelda - Ocarina of Time - Zelda Medley.mid`: `C:\Users\sam_s\Music\zelda-ocarina-medley-heavy-metal.pocketdaw`. It validates as a 96-bar A minor, 87 BPM project with Metal Drums, Picked Root Bass, Distorted Lead Melody, Metal Rhythm Guitar, a Metal Master chain, and a muted Raw MIDI Reference clip.

## v0.6.19 Native Transport + Cache - published

`0.6.19` publishes the accumulated 0.6.14-0.6.19 work through GitHub updater assets and the bootstrapper manifest. The checkpoint adds native loop-region wrapping, native metronome rendering, latest-only native restart coalescing during rapid live composition edits, fresh native-cache reuse after live edits, narrower native-cache signatures, Save As title adoption from `.pocketdaw` filenames, guitar track metadata/active-state sync, and scroll-preserving routing/add/metronome interactions.

- GitHub updater release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.19`
- Setup EXE SHA-256: `511143d2533046339fef6d818c854a1e9e5968901b0abd1f3023aa32f36fa79f`
- Bootstrapper manifest: `pocket-daw-bootstrapper-latest.json` reports version `0.6.19` and the same setup EXE hash.
- Itch bootstrapper: no repush expected unless the bootstrapper itself changes; the existing itch channel remains the public downloader for the latest GitHub installer.

## v0.6.14 Chip Tune + AI / MCP Bridge - included in v0.6.19

`0.6.14` adds Pocket Audio chip tune metadata preservation through Chordsmith import, DAW source metadata, WebAudio/native event payloads, generated native sound recipes, and the shared sound-surface parity checks. It also carries the file-first AI/MCP bridge improvements for arranging MIDI into `.pocketdaw` projects and opening explicit project paths from the bridge.

- GitHub updater release: included in `pocket-daw-v0.6.19`.
- Itch bootstrapper: no repush expected unless the bootstrapper itself changes; the existing itch channel remains the public downloader for the latest GitHub installer.

## v0.6.13 AI / MCP Bridge v1 - published, installed smoke pending

`0.6.13` expands `Help -> Setup MCP Bridge` into `Help -> AI / MCP Bridge`. The file MCP bridge remains the fast path for `.pocketdaw` inspection, validation, Chordsmith import, typed project edits and export planning while Pocket DAW is open or closed.

The installed app now has an optional token-protected live bridge on the existing local handoff server at `127.0.0.1:47858`. When enabled from the Help panel, MCP live tools can read running-app status, control transport, select tracks/clips, save an already-saved project and apply deterministic mixer edits for track volume, pan, mute and solo. Source now also lets the live bridge assign live-track recording input channels through `pocket_daw_live_apply_commands`, using the same undoable command path as the mixer UI, reports recording-input native-alpha preflight through `pocket_daw_live_status`, and includes compact export readiness for Godot/Web game packs so MCP smoke can confirm manifest paths, stem/loop counts, warnings and delivery targets from the running app. The live bridge writes a local session file for MCP discovery and returns clear unavailable/disabled/auth responses instead of relying on broad UI automation.

Published evidence as of 2026-06-20:

- GitHub release `pocket-daw-v0.6.13` was published with setup EXE/MSI, updater signatures, release manifest, checksums, `pocket-daw-latest.json`, and `pocket-daw-bootstrapper-latest.json`.
- The latest updater and bootstrapper manifests both report version `0.6.13`.
- Remote setup EXE SHA-256 was verified as `a7ac2494b4bf3b96502bacfd58af3d06dc8efc17d75d297042a1ec10a0a37fc6`.
- Itch was not pushed; the existing bootstrapper remains the public itch entry point.

## v0.6.12 Corrected MCP Setup Snippets - installed smoke pending

`0.6.12` corrects `Help -> Setup MCP Bridge` so the copy-ready snippets use the tested Windows MCP launch shape: `cmd` with arguments `["/d", "/c", "npm", "--prefix", "<Pocket DAW workspace>", "run", "mcp:pocket-daw"]`.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1737936`, user version `bootstrapper-0.6.12`, carries the bootstrapper-only upload.
- GitHub release `pocket-daw-v0.6.12` was published with setup EXE/MSI, updater signatures, release manifest, checksums, `pocket-daw-latest.json`, `pocket-daw-bootstrapper-latest.json`, and `Pocket_DAW_Itch_Bootstrapper_v0.6.12.exe`.
- Remote setup EXE SHA-256 was verified as `5acd4f48b9f2c3b81999fa4ee058fce181932f84ef8d5b5abd2e5b0f9833a692`.
- Bootstrapper EXE SHA-256 is `3e8ffcdceb9d76d622fe90194c52552384384a3fcc8ead0fb87cde4d976f1294`.

## v0.6.11 Bootstrapper Close And MCP Setup - installed smoke pending

`0.6.11` keeps the `0.6.10` GitHub-updater/bootstrapper model, makes the bootstrapper close after launching the verified setup EXE, and adds `Help -> Setup MCP Bridge` in the installed app with copy-ready command, Claude/JSON and Codex TOML snippets.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1737902`, user version `bootstrapper-0.6.11`, carries the bootstrapper-only upload.
- GitHub release `pocket-daw-v0.6.11` was published with setup EXE/MSI, updater signatures, release manifest, checksums, `pocket-daw-latest.json`, `pocket-daw-bootstrapper-latest.json`, and `Pocket_DAW_Itch_Bootstrapper_v0.6.11.exe`.
- Remote setup EXE SHA-256 was verified as `ac1e923662fef3f9df7f3e42d97607e5862a7c392b659cc84d89e343e45816f9`.
- Bootstrapper EXE SHA-256 is `c1e95390938153028640915fdf8f4ee2cceb67a3867679602cd606226a65c47d`.

## v0.6.10 Bootstrapper And MCP Bridge - bootstrapper smoke passed

`0.6.10` moves normal public app updates to GitHub Releases plus the Tauri updater. The itch channel should now carry the small bootstrapper upload from `releases/itch-bootstrapper/upload/`; it downloads the latest GitHub setup EXE, verifies SHA-256 from `pocket-daw-bootstrapper-latest.json`, launches the verified installer, and closes after setup launches.

This release also adds `npm run mcp:pocket-daw`, a local stdio MCP bridge for structured project read/validate/import/edit/export-plan tasks. Computer/browser control remains the right path for installed-app visual QA, playback confidence and updater smoke.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1737832`, user version `bootstrapper-0.6.10`, now carries the bootstrapper-only upload instead of the full setup/MSI installer pair.
- GitHub release `pocket-daw-v0.6.10` was published with setup EXE/MSI, updater signatures, release manifest, checksums, `pocket-daw-latest.json`, `pocket-daw-bootstrapper-latest.json`, and `Pocket_DAW_Itch_Bootstrapper_v0.6.10.exe`.
- Remote setup EXE SHA-256 was verified as `c893ddcc545738c79fb72bd486b75cbe263534b466fcd4d2f593574d509fd00e`.
- Bootstrapper EXE SHA-256 is `5e966c6a1ef1397484ded8d5ae1f9c9bbdb5a3f3d4dd5cbc451c41ec83570e68`.

## v0.6.9 Native Lofi Bass Hotfix - installed smoke pending

`0.6.9` was the native lofi-bass audibility hotfix. It kept the `0.6.8` native-cache diagnostics patch and fixed native procedural `warm_sub`/lofi bass playback so soloed imported bass remained audible when the native cache was not active.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1736808`, user version `0.6.9`.
- GitHub release `pocket-daw-v0.6.9` was published with the then-current setup EXE/MSI, updater signatures, release manifest, checksums and `pocket-daw-latest.json`.
- The GitHub latest updater manifest pointed at `Pocket.DAW_0.6.9_x64-setup.exe` before later checkpoints replaced it.
- Remote setup EXE SHA-256 was verified as `406bd7432dda5f4c3dfccb041c6e2362f5b683559476900f239ec46843d60f09`.

Installed-app smoke for `0.6.9` should re-open the reported `lofi demo project.pocketdaw`, confirm About/Diagnostics reports `0.6.9`, solo Bass at 100-120%, and verify the audible bass matches the moving Bass meter.

Installed-app bass smoke result: Sam confirmed on 2026-06-19 that Bass is audible in installed `0.6.9`.

Shared parity gate result: `npm run verify:family-parity` from `packages/pocket-audio-core/` passed on 2026-06-19, covering shared sound-surface freshness, cross-app drift tests, Chordsmith browser trace parity, core event/render/Godot pack fixtures, and DAW Chordsmith import/render/export parity tests.

## v0.6.8 Native Cache Diagnostics Patch - installed smoke pending

`0.6.8` was the previous installer/updater test build. It keeps the `0.6.7` native-cache performance patch, adds Native Playback/Native Cache readouts in the Media Pool and About/Diagnostics panels so testers can confirm cached regions, cached clips and procedural fallback events while A/B testing imported lofi projects, and stops lofi texture/noise ticks from falsely driving the Drums mixer meter.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1736802`, user version `0.6.8`.
- GitHub release `pocket-daw-v0.6.8` was published with the then-current setup EXE/MSI, updater signatures, release manifest, checksums and `pocket-daw-latest.json`.
- The GitHub latest updater manifest pointed at `Pocket.DAW_0.6.8_x64-setup.exe` before `0.6.9` replaced it.
- Remote setup EXE SHA-256 was verified as `57635be4f5b509e27584e820956752155870709d9ad97ebcf619ecdeebd8c577`.

The same native-cache and Drums-meter smoke remains part of the `0.6.9` installed-app pass before calling the baseline fully verified.

## v0.6.4 Lofi/Chillhop Compatibility Alpha

- Pocket DAW accepts optional lofi/chillhop Pocket Chordsmith fields such as `audioProfile`, `lofiPreset`, `stylePreset`, `lofiTexture`, `drumKit`, `drumGroovePreset`, and `bassTone` without changing the `.pocketdaw` schema.
- Imported lofi projects receive soft DAW track presets for drums, bass, chords, melody, ambience, and master output while preserving original Chordsmith source fields.
- Lofi imports add a gentle master chain with conservative low-pass, warmth/saturation, glue compression/limiting, and optional bit-colour metadata.
- The lofi template helper creates a Study Room-style Chordsmith project for future template-picker UI and import/export tests.
- The v0.6.3 live-recording and mixer polish remains part of the current baseline.
- Required installed smoke for this baseline: lofi import, recording alpha, updater behavior, save/open/reopen, WAV/MIDI export sanity, and exact artifact-hash tracking.

## v0.6.3 Live Recording And Mixer Polish Alpha

- Live-vocals mixer input controls are compact and stable, and small timeline track-label buttons no longer inherit rounded strip styling.
- Timeline/mixer Mute, Solo, Arm, Monitor and input edits preserve scroll while playback/recording is running.
- Timeline recording preview clicks are non-seeking so they cannot jump the playhead or scroll position.
- Record now starts/resumes playback from the captured record start bar after count-in so unmuted backing tracks play while recording.
- Monitor toggles and mixer gain/pan changes now update the active native CPAL monitor stream during an in-progress take.
- Stopping a take records over overlapping same-track audio clips and preserves only the non-overlapping left/right material.
- Mixer/transport polish keeps timeline scroll stable around track controls, restores live armed-input metering, and darkens Pocket DAW bass playback toward Pocket Chordsmith export parity.

## v0.6.0 Recording Alpha

- Added installed-app-only native CPAL mono recording commands for one armed live audio track.
- Recording now requires a saved `.pocketdaw` project so WAV takes are written under `project-media/recordings/`.
- Stop Record imports the take as a project-media Media Pool item and places an audio clip on the armed track at the original record start bar.
- Added transport `Record`, metronome toggle, recording timer/count-in status, and timeline/mixer `M`, `S`, `R`, `Monitor` controls for live tracks.
- Added project metronome settings and `track.monitorEnabled` defaults/migration while preserving existing save compatibility.
- Added metronome/count-in click playback that is not included in WAV/MIDI exports.
- Added diagnostics fields for recording state, armed tracks, monitor-enabled tracks and metronome/count-in settings.
- Added Rust tests for WAV writer/path safety and TypeScript tests for migration defaults, metronome timing, live track arm/monitor controls and recorded clip placement.
- Still out of scope: ASIO, simultaneous multitrack recording, stereo recording modes, punch-in/out, comping/take lanes, latency compensation UI and FX monitoring. The punch/comping/take-lane design anchor is `docs/PUNCH_COMPING_TAKE_LANES_PLAN.md`.

## v0.5.14 Stabilization Pass - source changes pending installed release

- Fixed Standard MIDI File import for real-world format 1 files with a tempo/meta track followed by note tracks. The parser now reads each `MTrk` chunk length before calculating the track end, preserves overlapping same-pitch notes, validates chunk boundaries, and reports malformed track headers with track/byte context.
- Added compact synthetic MIDI regression fixtures for the Zelda-style shape: format 1, PPQ 1024, metadata-only tempo track, and a separate piano note track. The full third-party MIDI file is not committed.
- MIDI import metadata now keeps parsed track count and track summaries while preserving the existing single MIDI clip workflow for compatibility.
- Fixed full-song MIDI export so multi-track exports declare SMF format 1 correctly and preserve the project BPM tempo event.
- Chordsmith/PCS1/raw JSON import now saves a separate pre-import recovery snapshot before replacing the visible project, then opens the imported song as a fresh unsaved project.
- Added regression coverage that PCS1 and raw Chordsmith JSON imports preserve source BPM, including the 136 BPM smoke-test case.
- Raised and inset modal panels so About/Diagnostics and updater dialogs render above the installed-app menu/transport bars with reachable close controls.
- Startup update checks now stay quiet when no update is available, but open the updater panel when an update is found.

## North star

The durable product destination is tracked in `POCKET_DAW_NORTH_STAR.md`.

Pocket DAW should eventually do everything Pocket Chordsmith can do for song creation, plus real DAW work: native timeline arrangement, simultaneous mono/stereo multitrack recording with suitable hardware, MIDI/audio clips, imported audio-file tracks, mixing, automation, live preview, timeline scrub, multi-format export with bitrate/quality controls, stem export, Godot/web-game packs, push from Pocket Chordsmith to Pocket DAW, and push from Pocket DAW to Godot. Multi-format export planning is tracked in `docs/MULTI_FORMAT_EXPORT_PLAN.md`; current implemented audio export remains WAV-based unless a release manifest proves installed codec support.

## v0.5.13 Public Alpha Follow-Up Notes

- Pocket Chordsmith direct "Send to Pocket DAW" is passing in the installed v0.5.13 smoke run through the downloaded PCS1 handoff-file fallback.
- Handoff/import BPM preservation still needs a fix: Sam's source Pocket Chordsmith project was 136 BPM, but Pocket DAW imported/exported it at 112 BPM, likely from the current DAW project/default. Import should preserve the exported BPM exactly.
- Handoff/import should behave like opening a new imported project, not silently mutate the currently open project. If a project is already open, Pocket DAW should autosave it before loading the imported handoff.
- WAV export was manually confirmed working for `C:\Users\sam_s\Downloads\imported-chordsmith-project.wav`.
- MIDI export produced `C:\Users\sam_s\Downloads\imported-chordsmith-project.mid`; structural inspection parsed 6 tracks and 869 note-on events with matching note-offs, but the file inherits the wrong 112 BPM and declares format 0 despite multiple tracks, so MIDI export needs external playback verification and a header/tempo follow-up.
- About/Diagnostics panel placement had an installed Windows failure where it could render underneath the top control bar, leaving the close control unreachable. Source now offsets modal panels below the menu/transport chrome with scrollable viewport bounds; installed-app smoke is still required.

## What works now

- Browser-runnable Vite + TypeScript app in `pocket-daw`.
- Native Windows Tauri v2 app wrapper in `src-tauri`.
- Native CPAL playback backend for generated Pocket Chordsmith and MIDI-preview event playback in the installed app.
- Native CPAL recording alpha for one armed live track in installed builds, with saved-project prerequisite, mono/stereo mode metadata and project-media WAV take creation.
- Future-ready `.pocketdaw` JSON schema with source refs, timeline clips, tracks, automation, routing, media pool, render cache, export profiles and import history.
- Defensive Pocket Chordsmith import for `PCS1:` share codes and raw JSON.
- `.pocketdaw` open/save roundtrip.
- Pocket DJ source-session import when the original Chordsmith project is available in the DJ session.
- Unknown Chordsmith fields are preserved in `sourceRefs[].original`.
- Chordsmith `songSequence` converts to `generated-section` clips on a generic timeline.
- Fallback conversion uses active sections A-H if no usable sequence exists.
- Desktop DAW shell with transport, track list, timeline, inspector, mixer and import/export panel.
- Desktop-style menu strip for File, Edit, View, Track, Transport and Help commands.
- Public alpha release is live on itch and documented in `docs/ALPHA_TESTING_RELEASE_STATUS.md`.
- Installed builds can check GitHub Releases for signed Tauri updater artifacts, with startup auto-check enabled for alpha testing and manual `Help -> Check for Updates` still available.
- Native-aware project workflow for New, Open, Save and Save As, with browser download/open fallback when the Tauri shell is unavailable.
- Current project file label/path tracking and richer recent-project records where native paths are available.
- Clip selection, move left/right by snap or whole-bar keyboard shortcuts, copy, paste, duplicate, split, trim, delete and mute.
- Timeline zoom, bar/beat snap, click-to-seek, drag-to-scrub, playhead/cursor display and loop region controls.
- Timeline workspace can be drag-resized, the inspector can be hidden/resized, and mixer/channel controls move lower as the timeline expands.
- Generated-section clips have a cyan snap-move drag rail and a green right repeat rail for extending sections as linked copies.
- Set loop to selected clip and clear loop actions.
- Basic marker lane with add, rename and delete support using the existing marker schema.
- Visible Media Pool panel with item metadata, missing/external status, guarded future import buttons and render-cache relationship display.
- Chordsmith parity editor in the inspector for section scope, globals, chords, drums, bass, melody and guitar settings.
- Section editor can follow the selected generated-section clip or manually target Sections A-H.
- Chordsmith step editors page through the full section length instead of only the first compact step slice.
- Cross-platform browser preview packaging writes a versioned zip with current docs at the root.
- Release verification can run tests, production build, browser preview packaging and native debug build when the Rust/Tauri toolchain is available.
- Free public itch release automation now stages installed Windows setup/MSI artifacts and updater `.sig` files under `releases/itch/installers/`.
- Release manifests and SHA-256 checksum files are generated from actual artifacts instead of copied by hand.
- Untrusted `.pocketdaw`/JSON project rendering is hardened for names, IDs, data attributes and inline colors.
- Native and browser fallback imports reject oversized project, MIDI and audio files before whole-file reads.
- Persisted native cache hydration can read valid `project-cache/native-audio/*.wav` entries when source hashes match.
- Full native release bundling is now explicit through `npm run verify:native-release` / `npm run tauri:build`.
- The main app shell uses explicit layout zones for menu, transport, studio, mixer, export, media and import so lower panels do not rely on implicit grid rows.
- PocketHandoff import can consume URL query/hash envelopes, raw hash envelopes, `window.name`, localStorage and legacy `pcs1`/`pcs`/`code`/`import` params.
- Consumed PocketHandoff payloads are cleared after a successful import so reloads do not repeat the handoff.
- Audio import can decode supported files into a runtime buffer cache and add source metadata to the Media Pool.
- Audio Media Pool items can be placed on the timeline as audio clips on an audio track.
- Audio clips render as separate audio regions for live playback and full-song WAV export when their decoded buffers are available.
- Lightweight waveform peak metadata is stored for imported audio and shown in the Media Pool/timeline.
- MIDI import can parse `.mid`/`.midi` files into Media Pool items and editable MIDI timeline clips.
- MIDI clips play through the built-in preview synth and participate in full-song WAV rendering.
- Selected MIDI clips show a compact piano-roll inspector for add/delete/move/pitch/duration/velocity edits plus source-preserving Map Drums, Map Bass, Map Chords and Map Melody commands for generated overlays and an explicit Adopt Tempo action for imported MIDI start tempo/meter.
- Selected tracks can create/edit basic volume and pan automation lanes in the inspector.
- Live playback and offline WAV export apply first-pass track volume/pan automation.
- Tracks can be routed to master or to created bus tracks; return tracks are scaffolded with guarded send metadata.
- Stem WAV export is available as a single ZIP archive with one WAV per generated/audio/MIDI track group plus a manifest and size summary.
- Section-loop WAV export is available as a single ZIP archive with deterministic loop WAV paths, manifest metadata and size summaries; Godot adaptive pack and web game pack exports now build collected ZIP packs with rendered audio, manifest metadata and the source `.pocketdaw` JSON.
- Media Pool status distinguishes runtime-loaded audio, external unloaded paths, browser runtime-only imports, missing/unresolved items and project media.
- Native Collect Media copies external audio beside a saved `.pocketdaw` file under `project-media/` and updates media-pool refs to durable project media. Reload, relink and collect now report the shared media-portability status after the action; game-pack source projects are cleaned through the portable-copy serializer so local `originalUri`, native path and reload-source provenance do not leak into shared packs.
- Native Reload and Relink can refresh project/external audio buffers in the installed app; relink clears stale source-derived waveform/native-decoder/decoded-cache metadata before any fresh analysis or cache write is attached, and browser runtime-only audio exposes Relink as the repair path to a durable native source.
- Build Native Cache writes generated-section and runtime-loaded audio WAV assets beside a saved project under `project-cache/native-audio/`; generated native cache regions, browser offline automation scheduling and native cache payload window sizing now use the shared timeline clock for meter-map-aware start times and durations.
- Native render-cache metadata records stable `assetRelativePath`, `nativePath`, sample metadata, `sourceHash`, byte length and `durableCacheReady` state inside optional `project.renderCache` metadata.
- Native render-cache prewarm can build generated-section stem WAV assets while idle in the installed app, so ready caches are preferred without blocking the Play command.
- Runtime-loaded audio clips can be encoded into native WAV asset regions for CPAL playback when their decoded buffers are available.
- Native playback diagnostics now report cached asset/region counts, render-cache metadata count, hit/miss counts, procedural fallback events, runtime-audio region misses, prewarm state and discarded stale builds.
- Pocket Audio Core convergence is documented, with a small rendered-event adapter added while the real core package/branch remains absent from this checkout.
- Live playback now returns to the loop start when the playhead reaches the loop end.
- Track mute, solo, volume and pan editing.
- Timeline and mixer track headers expose `M`, `S`, `R` and `Monitor` controls for live audio tracks; arming is limited to one live track at a time.
- Undo/redo for clip and mixer edits.
- Web Audio lookahead playback scheduler remains as a browser/dev fallback, not the product playback target.
- Generated drums, bass, chords, melody and guitar are audible when source data exists.
- Offline full-song WAV export.
- Full-song MIDI export with separate drums, bass, chords, melody and guitar tracks.
- Autosave/recovery through browser local storage as an emergency recovery path rather than the main project workflow.
- Tests for PCS1 decoding, raw JSON import, timeline conversion, roundtrip, migrations, section lengths, unknown-field preservation and export profile presence.

## v0.1.1 Controls + Feedback

- Mixer controls are now labeled as Volume and Pan.
- Pan readouts show center/left/right values.
- Mute and Solo buttons use full labels.
- Track strips show Active, Muted, Solo or Inactive state.
- Mixer meters are now live audio peak meters instead of static volume bars.
- Transport shows Playing/Stopped state and a clearer bar readout.
- Timeline grid supports click-to-seek by bar.
- A compact Controls panel explains import, transport, timeline, mixer, save and export controls.

## v0.1.2 Playback Stability + Debug

- Playback ticks now update only live DOM readouts for playhead, meters and transport state instead of re-rendering the whole app every beat.
- The audio engine no longer advances via a wall-clock fallback when the AudioContext is not actually running.
- Scheduler tick updates are throttled to reduce playback CPU load.
- Guitar generated events now carry the imported guitar tone and use a clearer, louder generated guitar voice.
- Added an Export Diagnostics button for capturing project, UI, mixer and audio scheduler state as JSON.
- Added a debug native build script: `npm run tauri:debug`.

## v0.1.3 Workflow Core + FX + Audio I/O Probe

- Added DAW-style keyboard controls, including Space play/pause, Home Bar 1, M/S/R track controls, clip movement, duplicate/delete, zoom, save/open/export and Add Track.
- Added Pause semantics so Space preserves the playhead; Stop and Bar 1 remain explicit reset controls.
- Added Add Track for Live Vocals, Live Instrument and Chordsmith instrument roles.
- Added schema v2 with per-track FX chains and audio device settings.
- Added built-in Web Audio FX chains with utility, filters, EQ, dynamics, saturation, delay, reverb, modulation and tremolo/autopan options.
- FX Return no longer exposes mute/solo; Master no longer exposes solo.
- Added native Tauri/CPAL audio device probing for WASAPI-visible devices, with browser MediaDevices fallback in dev mode.
- Prepared `generated-pattern`/Chordsmith beat sequencer boundaries for the next v0.2 editor milestone.

## v0.1.4 Visual Sequencers + Compact Import Fix

- Added selected-section Chordsmith visual editing inside the Pocket DAW inspector.
- Chord progression, section length, drum grid, bass notes, melody notes and guitar pattern steps can now be edited from Pocket DAW.
- Edits update the preserved Chordsmith normalized source while keeping unknown imported fields intact.
- Section length edits resync generated-section clip lengths, marker positions and timeline bar count.
- Visual sequencer edits flow through the existing undo/redo, autosave, playback, WAV export and MIDI export paths.
- Added tests for edited section/chord/drum/bass/melody/guitar data roundtripping and rendering into events.
- Fixed compact Pocket Chordsmith v16 imports so 64-step section arrays keep their original timing instead of being stretched out of the audible section window.

## v0.1.5 Native Workflow + Render Pipeline Foundation

- Added defensive Tauri native project file commands for Open, Save and Save As.
- Save writes back to the current native project path when one exists; Save As chooses a new path and updates the app's current file label.
- Open accepts `.pocketdaw` and JSON project files in the native shell, while the browser file picker remains the fallback for preview/dev mode.
- Recent projects can now retain both user-facing labels and native paths when available.
- Added a compact desktop-style menu strip wired through the same shared action dispatch as toolbar buttons and shortcuts.
- Refactored timeline rendering into clip resolvers: `generated-section` is now one resolver, `generated-pattern` now has a first section-backed audible resolver, while `audio`, `automation` and `marker` clips safely render no generated events until implemented.
- Loop playback now seeks back to the loop start when playback reaches the loop end, without relying on full app rerenders per tick.
- Added tests for native file bridge behavior, menu action wiring, unsupported clip-type safety and loop seek calculations.

## v0.1.6 Timeline, Transport and Editing Feel

- Improved timeline seeking so the ruler/grid can be clicked or dragged for scrub-style playhead movement.
- Added a visible cursor line distinct from the live playhead and selected clip outline.
- Transport now shows a clearer bar/beat readout instead of only a decimal bar.
- Added UI snap mode for Bar, Beat and Off; toolbar clip movement respects the selected snap while keyboard arrows remain whole-bar movement.
- Added split selected clip at playhead.
- Added generated-section trim start/end controls, with source-offset metadata so trimmed/split clips affect playback and export windows.
- Added copy/paste selected clip at the playhead.
- Added loop-to-selected-clip and clear-loop actions.
- Added a marker lane with add-at-playhead, rename and delete actions.
- Added shortcuts for split, loop selected, add marker and clip copy/paste.
- Added tests for split, trim, loop-to-clip, marker roundtrip/delete, snap helpers and generated clip render-window behavior.

## v0.1.7 Media Pool Foundation and Visual Material Browser

- Added a visible Media Pool panel between the mixer and import area.
- Media Pool items now display name, kind, duration, sample rate, channel count, file size, URI, missing/external/project status and linked render cache entries.
- Added guarded Import Audio, Import MIDI and Add Rendered Stem buttons with disabled states so unfinished import/playback features are not presented as complete.
- Expanded `src/daw/mediaPool.ts` into pure helpers for create, add, find, metadata update, item patching, missing/unresolved marking, external marking, safe unused removal, status reporting and render-cache relationship lookup.
- Media metadata preserves unknown future fields during updates.
- `.pocketdaw` roundtrip preserves media pool and render cache entries.
- Migration continues to initialize empty media pool and render cache arrays for older projects.
- Added tests for media pool helpers, render-cache links, metadata preservation, project roundtrip, old-project migration and visible Media Pool UI.
- Audio-file clip playback, waveform decoding and real MIDI/audio import remain later phases.

## v0.2.0 Chordsmith Parity Editor Expansion

- Expanded the Chordsmith inspector editor beyond selected-clip-only editing with Follow Clip and manual Section A-H targeting.
- Added page controls for full-section step editing, so longer imported sections can be edited past the first visible slice.
- Added source-backed global controls for key, scale, BPM and swing.
- Time signature and resolution remain visible/preserved but guarded from editing in this pass because changing them safely requires resampling section grids.
- Melody editing now supports lane selection plus instrument, octave, pan, mute and solo controls.
- Melody note edits now preserve and expose hold, slide and tuplet rows.
- Bass editing now exposes auto/manual mode plus manual note, hold, slide and accent rows.
- Drum editing now uses clearer lane labels and exposes tuplet rows while preserving imported rhythm detail.
- Guitar editing now exposes enabled, tone, register, strum mode and volume controls plus pattern editing.
- Expanded original Chordsmith source-shadow sync so supported parity edits roundtrip through `sourceRefs[].original` without dropping unknown future fields.
- Added tests for later-page step edits, globals, melody lane settings, guitar settings, source preservation and UI controls.

## v0.2.1 Release Hygiene, Packaging and Native Verification Prep

- Bumped package, schema-export version and native app metadata to v0.2.1 while leaving schema version 2 unchanged.
- Replaced the PowerShell-only browser preview zip step with a cross-platform Node packager using `adm-zip`.
- Browser preview zip names now come from `package.json`, for example `releases/pocket-daw-browser-preview-v0.2.1.zip`.
- Preview packages include `index.html` at the zip root, built assets and current docs.
- Release docs in `releases/` are refreshed from the root docs whenever `npm run package:preview` runs.
- Added `npm run verify:release` to run tests, production build, browser preview packaging and native debug verification when `cargo` is available.
- Reviewed frontend/Rust native project file command names: `open_project_file`, `save_project_file_as` and `write_project_file` match.
- Added defensive validation for malformed native open/save payloads while preserving browser fallback behavior.
- Added tests for preview zip naming/root contents and native open/cancel/error behavior.

## v0.3.0 Audio Media Import and Audio Clip Foundation

- Added native-aware audio import with a Tauri audio file picker/read command and browser file-input fallback.
- Supported first-pass extensions are `.wav`, `.mp3`, `.ogg`, `.flac`, `.aiff` and `.aif`, subject to the current Web Audio decoder.
- Added a runtime-only audio buffer cache keyed by `mediaPoolItemId`; decoded `AudioBuffer` data is not serialized into `.pocketdaw`.
- Imported audio creates `audio` Media Pool items with name, URI/path where available, MIME type, duration, sample rate, channel count, size and waveform peak metadata.
- Browser-preview imports are marked runtime-only because the selected file bytes are not safely persisted in the project file.
- Added Place on Timeline for audio Media Pool items; it creates an audio track if needed and an `audio` clip linked to the media item.
- Added audio region rendering alongside generated note events, with source offset, duration, gain and basic fade fields prepared in clip metadata.
- Live playback schedules decoded audio clips at natural speed and seeks into clips by source offset when playback starts inside them.
- Offline WAV export includes decoded audio clips when their runtime buffers are available.
- Missing or undecoded audio media is skipped rather than crashing playback/export.
- Media Pool and timeline now show lightweight waveform-style previews for imported audio.
- Import MIDI and rendered-stem actions remain guarded for later prompts.
- Added tests for audio media creation, project roundtrip, audio clip placement, audio region calculation, missing media warnings and updated Media Pool UI.

## v0.4.0 MIDI Clips and Piano Roll Foundation

- Added native-aware MIDI import with a Tauri `.mid`/`.midi` file picker/read command and browser file-input fallback.
- Added a small Standard MIDI File parser for PPQ-timed format 0/1 files, note on/off events, track names, tempo and time signature metadata.
- Imported MIDI creates `midi` Media Pool items plus a linked `midi` timeline clip on a MIDI track.
- MIDI clip note data is stored in `.pocketdaw` clip metadata so imported notes survive save/open roundtrips.
- Timeline rendering now shows MIDI clips on MIDI rows with a compact note strip.
- Live playback and offline WAV export schedule MIDI clip notes through the built-in preview synth.
- The selected MIDI clip inspector includes a compact piano-roll foundation for adding, deleting, moving, transposing, resizing and velocity-editing notes, plus Map Drums, Map Bass, Map Chords and Map Melody commands that write DAW-only generated overlays and Adopt Tempo for project-global alignment.
- At the original v0.4.0 boundary, unsupported MIDI events such as controllers, program changes, aftertouch, pitch bend and SysEx were ignored without crashing and counted in metadata; this is now superseded for CCs, program changes, pitch bends and aftertouch, which are preserved, editable in the Piano Roll and re-exported.
- Added tests for MIDI parsing fixtures, unsupported event handling, import-to-media-and-clip behavior, note edit helpers, render events and UI editor markup.

## v0.5.0 Automation, Mixer Routing and Export Foundations

- Expanded automation helpers for lane creation, point add/update/delete, clamped evaluation, hold/linear curves and track volume/pan target paths.
- Added selected-track automation UI for Volume multiplier and Pan lanes, including enable/disable, add-at-playhead, point value/bar edits and deletion.
- Live playback applies automation on scheduler ticks with smoothed gain/pan updates, without forcing full app rerenders.
- Offline WAV export applies track volume/pan automation at a fixed useful render resolution.
- Added bus track creation, return track creation, output routing to Master or bus tracks and routing-cycle protection.
- Bus routing is respected in live playback and offline WAV export. Full send/return processing remains guarded.
- Added stem export planning for Drums, Bass, Chords, Melody, Guitar, Audio tracks and MIDI tracks.
- Stem WAV export renders each stem into a bundled ZIP archive by reusing offline render with filtered audible tracks, deterministic pack paths and a manifest.
- Added section-loop WAV ZIP export with section ID/name, start/end bars, BPM, key, scale, time signature, loop duration, intended pack paths, manifest metadata and size summaries.
- Added Godot adaptive pack and web game pack ZIP exports with project metadata, source project JSON, rendered full mix, stems, section loops, markers and deterministic pack paths.
- Added tests for automation helpers/evaluation, routing helpers/cycle prevention, export job helpers/manifests and roundtrip preservation.

## v0.5.1 Release Hardening, Layout and Handoff

- Bumped app, package and native metadata to v0.5.1.
- Fixed the shell layout by replacing the old six-row grid with explicit top-level zones for menu, transport, studio, mixer, export, media and import.
- Bounded the mixer and let export/media/import panels auto-size so timeline, mixer, export panel, media pool and import controls no longer compete for the same fixed rows.
- Added UI smoke coverage for layout-zone order.
- Added PocketHandoff envelope ingestion for URL query/hash, raw hash envelope, `window.name`, localStorage and legacy import params.
- Added successful handoff cleanup so URL/window/storage payloads do not re-import on reload.
- Historical v0.5.1 note: Godot and web-game exports were labelled as JSON-only previews at that point; current builds export collected pack ZIPs.
- Historical v0.5.1 note: stem export used per-stem browser downloads at that point; current builds export a Stem WAV ZIP with a manifest.
- Expanded Media Pool status wording and added a disabled `Reload Media` scaffold for external audio that needs a future relink/reload flow.
- Added `tauri:build` and `verify:native-release` so full native release bundling is available as an explicit release check.
- Added `docs/V0_5_1_HARDENING_NOTES.md` and `docs/POCKET_AUDIO_CORE_CONVERGENCE_REVIEW.md`; preview packages now include those docs under `docs/`.

## v0.6 Foundation Readiness

- Added `docs/v0.5.1-verification.md` as the explicit verification gate with Windows installer/manual checks marked NOT RUN where they were not performed.
- Added private-alpha release docs: `PRIVATE_ALPHA_RELEASE_CHECKLIST.md`, `RELEASE_NOTES_TEMPLATE.md` and `WINDOWS_TESTING_CHECKLIST.md`.
- Added `docs/V0_6_FOUNDATION_NOTES.md` and `docs/RECORDING_PREP.md` to track media persistence, export pack, handoff, parity fixture and recording prerequisites.
- Media Pool now has a deterministic collect-media plan export that separates copyable external files, project media and blocked runtime-only/missing media.
- Game manifests now use deterministic pack paths under `audio/full/`, `audio/stems/`, `audio/sections/`, `manifests/` and include warnings for runtime-only/missing media and muted tracks.
- Pocket Chordsmith now has a visible `Send to Pocket DAW` handoff path using PocketHandoff URL/window/localStorage/clipboard fallbacks.
- Added PCS parity fixtures covering simple loops, multi-section timing, manual bass, multi-lane melody tuplets/slides and guitar/global metadata.
- Recording moved from placeholder to a v0.6.0 installed-app alpha slice: one armed mono live track, saved-project prerequisite, monitor toggle, metronome/count-in and project-media WAV clip creation.
- Added a safe `src/audio/pocketAudioCoreAdapter.ts` bridge for future Pocket Audio Core alignment without replacing the current playback/render engine.

## Browser preview

Run:

```powershell
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Packaging status

Release hygiene commands for this pass:

```powershell
npm run verify:versions
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run verify:itch
```

Historical v0.6.6 local release verification target:

- `npm run verify:versions`: checks package, lockfile, Tauri, Cargo and schema version sync.
- `npm test`: runs the automated TypeScript/Vitest suite.
- `npm run build`: runs TypeScript and Vite production build.
- `cargo test --manifest-path src-tauri/Cargo.toml`: runs the native Rust test suite.
- `npm run package:preview`: writes the browser preview zip for local/dev preview only; it is not a public Pocket DAW app distribution channel.
- `npm run package:itch`: builds/stages installer artifacts, updater `.sig` files, release docs, manifest and checksums.
- `npm run verify:artifacts`: verifies generated hashes, ZIP layout, forbidden files and signing policy.
- `npm run verify:itch`: runs the local release gate with no upload.

Primary itch release artifacts are generated under:

```text
releases/itch/installers/Pocket DAW_0.6.6_x64-setup.exe
releases/itch/installers/Pocket DAW_0.6.6_x64-setup.exe.sig
releases/itch/installers/Pocket DAW_0.6.6_x64_en-US.msi
releases/itch/installers/Pocket DAW_0.6.6_x64_en-US.msi.sig
releases/itch/pocket-daw-release-manifest-v0.6.6.json
releases/itch/CHECKSUMS_SHA256_v0.6.6.txt
releases/itch/FINAL_RELEASE_VERDICT_v0.6.6.md
```

The installed Windows setup/MSI artifacts are the public itch artifacts. The browser preview ZIP is a local/dev preview helper, not the Pocket DAW public distribution target.

The native Windows debug app can be checked with:

```powershell
npm run tauri:debug
```

If the shell cannot find the Rust toolchain, prepend Cargo to PATH first:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
npm run tauri:debug
```

Historical installers and debug executables may remain in `releases/`, but they are not current release artifacts unless regenerated by the current release pipeline. Native save/open dialogs, native audio import and native MIDI import are implemented through defensive Tauri commands with browser fallbacks, and installed Windows smoke evidence is tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`.

## Manual checklist

- Load demo project.
- Paste a PCS1 code.
- Load a PocketHandoff URL or `window.name`/localStorage payload and confirm it imports once, then does not re-import on reload.
- Import raw JSON.
- Press play.
- Mute drums.
- Solo bass.
- Move a section clip.
- Change snap mode between Bar and Beat.
- Duplicate a section clip.
- Copy and paste a section clip.
- Split a section clip at the playhead.
- Trim the start and end of a generated-section clip.
- Delete a section clip.
- Enable loop region.
- Set loop to the selected clip.
- Clear loop.
- Add, rename and delete a marker.
- Confirm the Media Pool empty state is visible.
- Confirm the timeline, mixer, export panel, media pool and import controls occupy separate visible zones without overlap.
- Import a MIDI file and confirm a MIDI Media Pool item plus MIDI clip appear.
- Select the MIDI clip and edit notes in the piano-roll inspector.
- Select a track, create Volume automation, add/edit/delete a point and confirm playback volume changes.
- Create a Bus track, route Bass or Melody to it, and confirm playback/export still works.
- Export Stem WAV ZIP and confirm one archive is produced with deterministic stem WAV paths plus `manifests/stem-wavs-manifest.json`.
- Export Section Loop ZIP, Godot Game Pack and Web Game Pack; inspect the JSON metadata inside each pack.
- Confirm Add Rendered Stem remains disabled/guarded.
- Confirm external unloaded audio shows a guarded Reload Media scaffold instead of pretending relink is complete.
- Open a project with media pool entries and confirm metadata/status/cache links survive save and reopen.
- Select an audio clip, edit Gain, Fade in, Fade out and Source offset in the Inspector, then play/export and confirm the source file is not modified.
- Split and trim an audio clip, then confirm the right-hand/trimmed clip starts from the matching source offset rather than replaying the beginning.
- Create a New Project.
- Open a `.pocketdaw` or JSON project.
- Save `.pocketdaw`.
- Save As to a different `.pocketdaw` path in the native shell.
- Reopen `.pocketdaw`.
- Export WAV.
- Export MIDI.
- Open Audio Settings and refresh device list.
- Add a Live Vocals track.
- Add FX to a track and export WAV.

## v0.2.1 release QA checklist

- Create a New Project.
- Open a `.pocketdaw` file.
- Save to the current project path in the native shell.
- Save As to a new `.pocketdaw` path in the native shell.
- Confirm recent project labels and native paths are shown correctly.
- Confirm browser fallback open/save still works outside Tauri.
- Run `npm run package:preview`.
- Confirm `releases/pocket-daw-browser-preview-v0.2.1.zip` exists.
- Confirm the preview zip has `index.html` at the root.
- Run `npm run verify:release`.
- Mark native Tauri project dialogs verified only after checking them in `npm run tauri:dev` or a packaged Windows build.

## v0.3.0 audio QA checklist

- Import a small `.wav` file in browser preview.
- Confirm the audio item appears in the Media Pool with duration, sample rate, channels, size and waveform preview.
- Place the audio item on the timeline.
- Press play and confirm the audio clip is heard when the runtime buffer is still loaded.
- Seek into the middle of the audio clip and confirm playback starts from the matching source offset.
- Export WAV and confirm decoded audio clips are included.
- Save and reopen `.pocketdaw`; confirm media metadata persists but browser-selected bytes are not embedded.
- In native/Tauri, import an audio file and confirm the Media Pool stores the native path/URI.
- Confirm unsupported formats show a friendly decode error and do not crash.

## v0.4.0 MIDI QA checklist

- Import a small `.mid` file in browser preview.
- Confirm the MIDI item appears in the Media Pool with note count and PPQ metadata.
- Confirm a MIDI clip appears on the timeline and the inspector shows the piano-roll editor.
- Add, delete, move, transpose, resize and change velocity for at least one note.
- Press play and confirm MIDI clip notes are audible through the preview synth.
- Export WAV and confirm MIDI clip notes are included.
- Save and reopen `.pocketdaw`; confirm MIDI note metadata persists.
- In native/Tauri, import a MIDI file and confirm the Media Pool stores the native path/URI.
- Confirm MIDI files with unsupported controller/program/pitch events do not crash.

## v0.5.0 automation/routing/export QA checklist

- Select Bass, create a Volume automation lane, add a point at the playhead, set one point lower and press play.
- Create a Pan automation lane and confirm the inspector shows editable point values.
- Save and reopen `.pocketdaw`; confirm automation lanes and bus routing survive.
- Add a Bus track and route Bass to the bus, then export WAV.
- Add a Return track and confirm it is clearly scaffolded/guarded rather than pretending send processing is complete.
- Export Stem WAV ZIP; confirm the archive contains each planned stem and `manifests/stem-wavs-manifest.json`.
- Export Section Loop ZIP, Godot Game Pack and Web Game Pack; confirm the section-loop archive contains manifest JSON and loop WAVs, and the game pack ZIPs contain manifest JSON, source `.pocketdaw`, full mix, stems, section loops and markers. Run `npm run verify:game-pack -- <zip> --kind godot-adaptive-pack` or `--kind web-game-pack` and confirm it passes embedded-source local-reference checks before manual Godot/Web import smoke.

## v0.5.1 hardening QA checklist

- Confirm the first screen shows distinct menu, transport, studio, mixer, export, media and import zones.
- Confirm the mixer scrolls inside its own zone when many track strips are present.
- Confirm export/media/import panels stay below the mixer and do not overlap each other.
- Open a URL with `?pcs1=` or `#pcs1=` and confirm Pocket DAW imports the payload once.
- Open a URL with a PocketHandoff envelope and confirm the URL is cleaned after successful import.
- Historical v0.5.1 check: Godot/Web exports were JSON-only then; current builds should show game-pack ZIP export controls.
- Confirm external audio with a known path but no runtime buffer shows `External unloaded`.
- Confirm browser-only imports still show as runtime-only after reopening a project without embedded bytes.
- Run `npm run verify:native-release` on a machine with Cargo/Tauri available before distributing native test builds.

## Current editor boundary

## v0.5.2 Desktop Audio Pivot

- Pocket DAW is now treated as an installable computer app, not a Web Audio product.
- Installed playback attempts the native CPAL backend first for generated Chordsmith and MIDI-preview rendered events.
- Web Audio remains available only as a fallback when the Tauri/native command path is unavailable.
- The diagnostics export reports `playbackBackend`, `nativeAudio`, scheduler gaps, late/skipped events, graph reconfigure counts, project sync mode and `renderCountDuringPlayback`.
- Mixer volume, pan, mute and solo update native track controls without rebuilding the project.
- Badly late Web Audio fallback drums/hats are skipped instead of bunched at the current audio time.
- The native playback path is still a first event-synth implementation, not final parity instruments or native audio-file streaming.
- Audio-file import now has a native Symphonia decode foundation in source, with WebView decoding still available as fallback; the next desktop-grade step is installed smoke plus deeper native streaming/cache recovery coverage.

v0.5.2 moved generated playback out of the browser timing path, but Pocket DAW is still not a full professional mixing/export console. Automation is no longer limited to only track volume and pan, but drawn FX/tempo/hosted-parameter automation remains future work. Bus routing, pre-fader sends, first return processing, Stem ZIP and Section Loop ZIP exports, and Godot/web-game manifest packs now exist in source. Audio clips still have no time-stretching/warping or full waveform editor, and persistent native decoded media cache recovery still needs installed-app smoke. Runtime-loaded audio clips can feed native WAV regions, while durable native decode/streaming remains an active desktop-grade reliability path.

## What should come next

- First priority after the collected ZIP export slices: manually smoke standalone stem/section-loop/game-pack ZIP contents in installed Pocket DAW and Godot/web-game import workflows, then add push-to-Godot.
- Ship the Windows project-open polish found during live AI testing: installer `.pocketdaw` association, startup/second-instance file argument opening, and a checklist row for double-click/Open With.
- Keep this export-pack path ahead of deeper recording work, ASIO, simultaneous multitrack capture, or broad DAW editor expansion.
- Manually verify native Open, Save and Save As inside `npm run tauri:dev` or a packaged native build.
- Manually verify that packaged playback diagnostics show `playbackBackend: native-cpal` while scrolling, dragging mixer controls and editing Chordsmith steps.
- Add installer signing/version metadata polish.
- Extend Pocket Chordsmith to Pocket DAW push/handoff into a polished cross-app button flow and live-host smoke test.
- Add Pocket DAW to Godot push/export workflow.
- Deepen the now-present timeline multi-selection, clip clipboard and edit-range foundations with box/range selection gestures, clearer visual grouping and installed-app smoke.
- Add stronger live preview from any clip edge/selection and better scrub-audition behavior.
- Add Chordsmith FX and sidechain parity controls after the core musical lanes stay stable.
- Add timeline visualisation for generated and audio material: waveform-style previews for audio clips, plus useful energy/note-density lanes for generated Chordsmith tracks.
- Extend the drum-branch source-view foundation: add richer branch folder controls, overlay editing polish for live-only kit pieces and any remaining branch export/import smoke notes. Design anchor: `docs/DRUM_BRANCHING_PLAN.md`.
- Bring over all live-playback Pocket Chordsmith drum instruments and kit variations so branched drum tracks can use the same source sounds rather than a reduced DAW-only kit.
- Add longer-form performance tracing for expensive arrangements.
- Manually verify project-relative media collect/reload/relink in the packaged app, including the source-switch case where relink must remove old decoded-cache metadata before any new cache is written.
- Manually smoke Stem WAV ZIP export in the installed app and inspect `manifests/stem-wavs-manifest.json` before making release claims.
- Expand export profiles beyond WAV/MIDI to support multiple formats, sample rates, bit depths, channel modes and bitrate/quality targets.
- Manually smoke Section Loop ZIP export in the installed app and inspect `manifests/section-loops-manifest.json` before making release claims.
- Manually smoke generated-section clip transpose, gain and stem mute controls across playback, WAV export, stem ZIP and save/reopen.
- Continue installed-app smoke for persisted native cache hydration from `project-cache/native-audio` WAVs on project open, including stale source-hash, invalid-path and read-failure diagnostics.
- Expand the current one-armed voice/instrument recording alpha toward simultaneous multitrack recording on multi-input hardware, including clear multi-input channel assignment and take-lane/comping behavior.
- Manually smoke per-track Mono/Stereo recording mode in the installed app and inspect the resulting WAV channel count plus take metadata after save/reopen.
- Expand MIDI import into a deeper DAW feature: richer channel/instrument mapping, fuller global tempo/meter-aware playback/export, section/progression arrangement interpretation, controller lanes and fuller piano-roll editing. Raw placement now supports single-clip, per-source-track, per-channel and drum-channel split import while preserving source media identity, imported tempo/meter maps surface as Media Pool summaries and drive MIDI note timing for multi-tempo clips, project tempo automation and editable project meter-map points now have command/UI/MCP coverage, meter-map display marks effective ruler/readout meters, browser/native metronome clicks use meter-map beat counts, accents and active bar-length timing, Beat snap uses effective meter-map numerators for editing placement, shared timeline bar/seconds conversion uses active meter-map bar lengths, MIDI export writes project meter-map points as standard time-signature meta events, and selected MIDI clips can now map General MIDI drums plus low-bass, simultaneous chord groups and melodic non-drum notes into generated overlays without mutating source grids. Deeper generated-section grid interpretation and source-audio warp behavior over variable meters remain future work.
- Source now has a simple optional MIDI-to-Chordsmith arrangement mapping command for "make this MIDI into drums/bass/chords/melody" workflows across the piano-roll UI, app command path and file-first MCP path; raw MIDI clip import remains the preserving/default DAW path. Future work is deeper section/progression interpretation, style choices beyond the current heavy-metal project arranger, and better musical review surfaces after conversion.
- Move imported audio-file decoding and streaming into Rust/native code, then replace the first CPAL event synth with cached samples, rendered voice assets or a hybrid sample/synth backend where it improves desktop DAW reliability without removing editability.

## Sample-backed playback lessons

Pocket DAW should reuse the Godot addon's `audio/web_kit` sample set as a seed library for the first sample-backed generated engine. The most immediately useful assets are the drum one-shots (`kick`, `snare`, `hat`, accent/open variants, `clap`), guitar articulation hits (`guitar_chug`, `guitar_open`, `guitar_accent`, `guitar_scratch`), stingers, and the basic bass/chord/melody preview tones. Treat these as bundled preview/performance assets, not the final high-fidelity instrument library.

The Godot addon also gives Pocket DAW a proven implementation pattern: preload/cache small WAVs before playback, trim silent tails, keep gain maps per sample/layer, drop badly late hits instead of playing catch-up bursts, keep verbose pitch/sample logging off during playback, and route drum/guitar/melody/bass/chord material through stable buses instead of rebuilding work per note.

Pocket Chordsmith web can borrow the same lightweight lessons without becoming a DAW: cache generated buffers, prewarm common kits after first user audio unlock, avoid console logging in dense playback, drop very late hits instead of bunching them, and prefer sample-backed drums/guitar articulations where they preserve the Pocket Chordsmith sound with less CPU.

## v0.5.3 Editor Stability

- Chordsmith sequencer edits snapshot/restore intentional scroll panes so the inspector no longer jumps to the top after step clicks.
- Drum, bass and melody step clicks patch the visible step cell directly instead of replacing the whole shell for every edit.
- Chordsmith editor changes now use the composition-event sync path, keeping project-load sync reserved for open/import/new/demo-style changes.
- Native CPAL playback bypasses stale pre-render WAV regions after live Chordsmith edits and restarts from the current position using updated procedural events.
- Diagnostics now report native render-cache bypass state, build count, last build duration and last build reason.
- Native render-cache prewarm now avoids building cache assets directly inside the Play command; deeper worker/Rust cache building remains a follow-up.
- `docs/v0.5.3-editor-stability.md` tracks the manual smoke focus and the remaining limitation that persistent cache storage/native decode still need a later pass.

## v0.5.4 Native Cache Foundation

- Bumped app/package/native metadata to v0.5.4 while keeping the persisted project schema at version 2.
- Native cache assets now carry stable project-relative WAV targets under `project-cache/native-audio/`.
- Added Tauri commands to write/read native cache WAV assets with path traversal protection.
- Added a Build Native Cache media command for saved projects; it renders generated section stems and runtime-loaded audio clips, writes WAV assets, merges optional render-cache metadata, and saves the project refs.
- Native playback payloads remain backward-compatible and still carry in-memory WAV bytes for the current CPAL region player.
- Persistent cache hydration from disk was the next cache step in v0.5.4; v0.5.5 added guarded hydration for valid saved WAV cache assets.

## v0.5.8 Itch Release Readiness

- Bumped app/package/native metadata to v0.5.8 while keeping persisted project schema version 2.
- Added earlier Windows itch packaging experiments; current policy supersedes them with installer-only distribution under `releases/itch/installers/`.
- Refined timeline defaults for the updater test build: 240 px/bar startup zoom, live zoom slider resizing, and row/ruler layering so track headers scroll under the bar/time ruler instead of covering it.
- Fixed inline Chordsmith sequencer rows so drum, bass, melody and guitar grids start exactly on bar 1 with no text-label offset.
- Moved inline lane labels into the left track header and added direct timeline controls for BPM, key, scale, time signature, sequencer resolution and Add Section.
- Added release manifest, SHA-256 checksum generation, artifact verification and a final verdict file.
- Added free itch page copy and a table-based Windows smoke checklist.
- Current policy makes installers the only public Pocket DAW distribution path.
- Added a guarded butler push script that refuses to upload unless `PUBLISH=1` is set.
- Hardened string-rendered UI output against malicious project-controlled IDs, colors, names, media fields and automation IDs.
- Normalized loaded `.pocketdaw`/JSON tracks, clips, media, markers and automation lanes to prevent render/layout crashes.
- Added project, MIDI, audio and native-cache size limits before whole-file reads.
- Added persisted native cache hydration from saved `project-cache/native-audio/*.wav` files when source hashes match, with diagnostics for hydrated, stale, invalid and failed cache entries.

## v0.5.9 Alpha Testing Release

- Updated app/package/native metadata to v0.5.9 while keeping persisted project schema version 2.
- Published/uses the alpha-testing itch installer channel at `samfa12/pocket-daw:windows-installer`.
- Added `docs/ALPHA_TESTING_RELEASE_STATUS.md` as the then-current public alpha status anchor.
- Added a Pocket DAW app README that points testers to itch, the updater endpoint and local verification commands.
- Treats Pocket DAW as installed-app only for public alpha testing; updater confidence comes from the installed app.
- Published the GitHub updater release `pocket-daw-v0.5.9-updater-test` with `pocket-daw-latest.json`, setup EXE, `.sig`, checksums and release notes.
- Added resizable timeline workspace controls so the mixer moves lower as the timeline grows.
- Added inspector hide/show and inspector width resize controls.
- Added generated-section drag rails: cyan for snap-move, green for linked repeat/extend copies.
- Added Ctrl/Meta-wheel and touch/pinch timeline zoom handling.
- Added native titlebar-safe spacing so the desktop menu remains visible in the installed Windows shell.
- Updated README and release docs from WIP/private-alpha wording to public alpha testing wording.
