# Pocket DAW Action Catalog

Last updated: 2026-07-02

This catalog is generated from `src/app/functionGuide.ts` so the Markdown help and the in-app Function Guide describe the same controls. The broader workflow guide remains `docs/POCKET_DAW_FUNCTION_REFERENCE.md`.

Use `data-action` values for ordinary command buttons. Use selector entries for controls that are generated per clip, track, MIDI event, automation lane, media item, or FX slot.

## File And Project

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| New Project | `data-action=new-project` |  | Creates a clean unsaved project in the current app session. | Use when starting a new composition, import test, or scratch project. | Check whether the current project has unsaved user work before triggering this. |
| Open .pocketdaw | `data-action=open-project` | Ctrl+O | Opens a Pocket DAW project file through the native/browser picker. | Use to continue a saved project or smoke-test file association/open paths. | After open, verify project title, file path, track count, clips, and media pool status. |
| Open File | `data-action=open-file` | Ctrl+O | Routes a chosen supported file to project, audio, or MIDI import handling. | Use when the user has a local file but may not know which import command applies. | Confirm the status message after import because project, audio and MIDI files take different paths. |
| Save .pocketdaw | `data-action=save-project` | Ctrl+S | Writes the current project to the known save path. | Use after meaningful edits and before recording, cache building, or release smoke. | If the project has no path, this must fall through to Save As in the UI. |
| Save As | `data-action=save-project-as` |  | Prompts for a destination and saves the project as a new .pocketdaw file. | Use to create a durable path, duplicate a session, or prepare project-relative media folders. | A real save path is required before reliable live recording and media collection. |
| File Panel | `data-action=file-window-open` |  | Opens the combined project, import, export, media, and cache command panel. | Use when a user needs file operations without hunting through menus. | This is a navigation surface; it should not mutate project data by itself. |
| Close File Panel | `data-action=file-window-close` |  | Closes the File panel. | Use after file/import/export commands are no longer needed. | Closing panels is UI-only. |
| Load Demo Copy | `data-action=load-demo` |  | Loads an editable demo project copy for quick playback and experimentation. | Use for first-run checks or when the user wants a working project immediately. | Treat it as editable user state once loaded; do not reset it silently. |
| Reload Demo Template | `data-action=reset-demo-template` |  | Discards the editable demo copy and reloads the built-in demo template. | Use when the user wants to return to a known demo baseline. | This can discard demo edits, so it should be intentional. |

## Import

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Import Paste | `data-action=import-text` |  | Imports pasted PCS1 share codes, Chordsmith JSON, Pocket DJ source sessions, .pocketdaw JSON, or handoff text. | Use for fast handoff from another Pocket Audio tool or text-based import. | Validate the resulting tracks, clips, sections, and source metadata after import. |
| Import Chordsmith | `data-action=import-focus` |  | Opens the import/file area and focuses the user toward Chordsmith or text import. | Use from the quick-start area when a user wants to bring Chordsmith material in. | This opens the surface; the actual import happens through Import Paste or Open File. |
| Import Audio | `data-action=import-audio` |  | Imports an audio file, decodes/cache-prepares it, and adds it to the media pool. | Use for loops, vocals, live instrument references, stems, or audio clips. | Check decoded format, sample rate, channels, duration, cache path, and missing/unloaded state. |
| Import MIDI | `data-action=import-midi` |  | Imports a .mid or .midi file into editable MIDI media and timeline clips. | Use for external melodies, drums, basslines, chord sketches, and MIDI interchange. | Review MIDI placement mode, tempo map, meter map, channel splits, and resulting clip count. |
| MIDI Placement Mode | `midiImportPlacementMode` |  | Chooses whether imported MIDI lands as one clip, source-track clips, channel clips, or drum-channel splits. | Use before importing multi-track or multi-channel MIDI. | Per-channel or drum split often gives AI helpers clearer structure for later editing. |

## Transport

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Play | `data-action=play` | Space | Starts playback from the current playhead position. | Use to audition arrangement, mix, MIDI, generated roles, and cached/native playback. | Remote agents should pair this with MCP status or user-observed audio because they may not hear output. |
| Pause | `data-action=pause` | Space | Pauses playback without moving the playhead back to the start. | Use to stop auditioning while preserving the current listening position. | Pause is transport state only; it should not change project data. |
| Stop | `data-action=stop` |  | Stops playback and live metronome activity. | Use before export, setup changes, or switching contexts. | If preview notes remain stuck, use MIDI Panic instead of repeated Stop. |
| Restart | `data-action=restart` |  | Starts playback again from the beginning of the project. | Use for full-arrangement listening passes. | Useful before deterministic listen or render smoke. |
| Bar 1 | `data-action=seek-start` | Home | Moves the playhead back to bar 1. | Use to reset position without changing loop settings. | This is a safe UI/navigation action. |
| Record | `data-action=record-toggle` |  | Starts or stops live recording on the armed record-capable track. | Use after saving the project, selecting an input, and arming one live track. | Installed-app smoke is required; remote agents should not claim audio quality without a human listen. |
| Metronome | `data-action=metronome-toggle` |  | Turns metronome/count-in behavior on or off. | Use for timing practice and live recording setup. | Confirm count-in behavior before judging recorded clip alignment. |
| MIDI Panic | `data-action=midi-panic` |  | Stops preview playback and clears active or stuck MIDI notes. | Use after interrupted playback, imported MIDI auditioning, or stuck synth previews. | Safety command only; it should not mutate project data. |

## Timeline Editing

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Undo | `data-action=undo` | Ctrl+Z | Reverts the last undoable project edit. | Use after accidental or exploratory edits. | Prefer undoable commands for AI-driven edits so the user can recover quickly. |
| Redo | `data-action=redo` | Ctrl+Y | Restores the last undone edit. | Use after undoing too far. | Redo depends on undo stack state and may disappear after a new edit. |
| Move Clip Left | `data-action=clip-left` | ArrowLeft | Moves the selected clip earlier by the current snap step. | Use to adjust arrangement timing. | Check snap mode first; bar, beat and off-grid states imply different movement. |
| Move Clip Right | `data-action=clip-right` | ArrowRight | Moves the selected clip later by the current snap step. | Use to adjust arrangement timing. | Check for overlaps and downstream section timing after moving. |
| Cut Clip | `data-action=clip-cut` | Ctrl+X | Copies the selected clip to the clipboard and removes it from the timeline. | Use to move material elsewhere while keeping a clipboard copy. | This is undoable. Verify paste target before moving user material. |
| Copy Clip | `data-action=clip-copy` | Ctrl+C | Copies the selected whole clip to the clipboard without changing the timeline. | Use before Paste or when repeating material. | Clipboard state is runtime UI state, not a durable project artifact. |
| Paste Clip | `data-action=clip-paste` | Ctrl+V | Pastes the current clip clipboard at the cursor/playhead context. | Use after Cut Clip, Copy Clip, Copy Range, or Cut Range. | Paste can fail clearly if the clipboard is empty. |
| Duplicate Clip | `data-action=clip-duplicate` | D | Creates a copy of the selected clip immediately after itself. | Use to repeat phrases, loops, sections, or imported clips. | Duplicate keeps source-safe metadata; inspect overlap if clip lengths are unusual. |
| Split Clip | `data-action=clip-split` | X | Splits the selected clip at the playhead. | Use before trimming, muting, moving, or exporting a subsection. | Prefer split over destructive source editing. |
| Delete Clip | `data-action=clip-delete` | Delete | Removes the selected clip from the timeline. | Use when material is no longer needed in the arrangement. | Prefer Mute Clip when the user may want to audition alternatives. |
| Mute Clip | `data-action=clip-mute` |  | Silences or unsilences the selected clip without removing it. | Use to audition alternate arrangements safely. | Muted clips still exist and should be considered in arrangement reviews. |
| Trim Start Left | `data-action=trim-start-left` |  | Moves the selected clip start earlier by one snap step. | Use to reveal earlier source material or extend a clip's entry. | Check source offset and available source duration for audio clips. |
| Trim Start Right | `data-action=trim-start-right` |  | Moves the selected clip start later by one snap step. | Use to tighten clip entry timing. | For audio, this should adjust metadata rather than modifying source files. |
| Trim End Left | `data-action=trim-end-left` |  | Moves the selected clip end earlier by one snap step. | Use to shorten a clip or remove tail material. | Check that shortened clips still leave musically useful boundaries. |
| Trim End Right | `data-action=trim-end-right` |  | Moves the selected clip end later by one snap step. | Use to extend a clip or reveal later source material. | For generated and MIDI clips, confirm repeated/extended material behaves as intended. |

## Range Editing

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Range Clip | `data-action=range-selected` |  | Sets the active edit range to the selected clip boundaries. | Use before range copy, cut, split, crop, delete, ripple, or range loop. | Requires a selected clip. Verify range start/end before applying destructive range edits. |
| Range Loop | `data-action=range-loop` |  | Sets the active edit range to the current playback loop boundaries. | Use when an existing loop should become the range for copy, cut, split, crop, delete, or ripple edits. | This command reads the loop and writes the edit range; it does not move or enable the playback loop. |
| Copy Range | `data-action=range-copy` | Ctrl+Shift+C | Copies the selected clip material inside the active edit range to the normal clip clipboard. | Use to reuse only part of a clip or generated section. | This is a selected-clip clipboard operation, not an all-track copy. |
| Cut Range | `data-action=range-cut` | Ctrl+Shift+X | Copies the selected clip material inside the active edit range, then removes that material from the clip. | Use to move only part of a clip elsewhere. | This can split/shorten material; verify the active range and selected clip first. |
| Split Range | `data-action=range-split` |  | Splits affected clips at the active range boundaries. | Use before crop, mute, delete, or movement of a bounded range. | Split Range is usually safer than deleting directly because it exposes boundaries first. |
| Crop Range | `data-action=range-crop` |  | Keeps only the selected clip material inside the active range. | Use when the range is the only part of the selected clip that should remain. | This removes outside material from the timeline clip but not from source files. |
| Delete Range | `data-action=range-delete` |  | Deletes material inside the active range without closing the timeline gap. | Use to silence or remove a bounded section while preserving later timing. | Use Ripple Delete only when later clips should move earlier. |
| Ripple Delete | `data-action=range-ripple-delete` |  | Deletes the active range on selected/affected tracks and closes the gap. | Use for arrangement edits where later material on those tracks should move earlier. | Ripple edits affect timing. Confirm scope before use. |
| Ripple All | `data-action=range-ripple-all` |  | Deletes the active range and closes the gap across all tracks. | Use for removing a song section globally. | Broad timing change. Prefer user confirmation or careful review. |
| Clear Range | `data-action=range-clear` |  | Clears the active edit range selection. | Use when range editing is complete or the range is wrong. | UI/project selection state only. |
| Range Start / End Fields | `rangeStart / rangeEnd` |  | Sets the explicit bar range used by range copy, cut, split, crop, delete, ripple, and loop commands. | Use when the range should be exact rather than inferred from the selected clip. | Validate start is before end and that the selected command reads the intended range. |

## Loop And Markers

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Toggle Loop | `data-action=toggle-loop` | L | Turns the existing loop region on or off. | Use to audition repeated ranges without changing the range boundaries. | Loop state affects playback, not exported source unless export explicitly reads it. |
| Loop Selected | `data-action=loop-selected` | P | Sets the loop region to the selected clip. | Use for focused playback of one clip. | Requires a selected clip. |
| Clear Loop | `data-action=loop-clear` |  | Disables/clears the current loop region. | Use before full-song playback or export checks. | Playback state only. |
| Add Marker | `data-action=marker-add` | G | Adds a timeline marker at the playhead. | Use for arrangement notes, navigation, and smoke-test anchors. | Markers are project data and should be named clearly when used as documentation. |
| Add Game Cue | `data-action=game-state-marker-add` |  | Adds a game-state cue marker at the playhead using the selected cue type. | Use for adaptive game music planning and Godot/Web pack metadata. | Game cues are hidden in Music focus but remain project data. |
| Game Cue Type | `gameStateMarker` |  | Chooses the adaptive game-state label used by the next Game Cue marker. | Use before adding menu, explore, combat, stinger, victory, or similar game-state cues. | Set the cue type before adding the marker; changing the selector alone does not edit existing markers. |
| Rename Marker | `data-marker-rename` |  | Renames an existing timeline marker or game cue. | Use to make arrangement notes and adaptive cues readable to humans and tools. | Names are project data. Preserve game-state meaning when renaming cues. |
| Delete Marker | `data-marker-delete` |  | Deletes an existing timeline marker or game cue. | Use when a marker no longer describes the arrangement. | Deleting game cues can affect game-pack metadata; confirm intent before broad cleanup. |

## View And Focus

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Studio Rail Navigation | `studio-rail / data-studio-rail-target` |  | Provides persistent left-rail shortcuts to Library, Project, Clips, Media, Mixer, MIDI, Audio, Export, Godot, Pocket handoff, Diagnostics and Help. | Use to move between major DAW work areas without opening menus or adding more toolbar clutter. | Rail navigation must reuse the normal action/command path so behavior stays deterministic. |
| Studio Rail Clips | `data-action=studio-focus-timeline` |  | Closes transient panels and scrolls back to the timeline clip-editing surface. | Use when the user needs to return to clip arrangement from a modal, lower panel or help surface. | Focus action only; it does not edit clips or project data. |
| Studio Rail Godot | `data-action=studio-focus-godot` |  | Switches to Game music focus, selects Export Details and scrolls to the Godot/web game-pack export controls. | Use when preparing adaptive music or checking game-pack export state. | WAV remains the supported game-pack baseline; this should not edit the Godot addon. |
| Music Focus | `data-action=preset-music` |  | Keeps composition, editing, and mixing controls prominent while hiding game-export clutter. | Use while writing, arranging, importing, or mixing a song. | View filter only; it does not remove project data or disable hidden features. |
| Game Music Focus | `data-action=preset-game-music` |  | Keeps game cue and game-pack controls visible while hiding live-recording take clutter. | Use while preparing adaptive game music packs. | View filter only; WAV game packs remain the supported baseline. |
| Toggle UI Section | `data-action=toggle-ui-section` |  | Shows or hides the section named by the button's data-ui-section value. | Use to reduce UI density without changing project data. | Collapse state is UI-only and should not affect save/export. |
| Toggle Inspector | `data-action=toggle-inspector` |  | Shows or hides the right-side selected clip/track inspector. | Use when the timeline needs more width or the current edits do not need inspector context. | UI-only state; selected clip/track still exists. |
| Zoom In | `data-action=zoom-in` | + | Increases timeline pixels per bar. | Use for precise clip or step editing. | View-only setting. |
| Zoom Out | `data-action=zoom-out` | - | Decreases timeline pixels per bar. | Use to see more of the song structure at once. | View-only setting. |
| Snap Mode | `snapMode` |  | Sets the rhythmic grid used by clip moves, trims, and timeline edit commands. | Use before precise clip editing so movements land on the intended bar or beat division. | Check snap mode before repeated move/trim commands; it changes edit distance. |
| Timeline Zoom Slider | `timelineZoom / data-zoom-readout` |  | Sets and displays the timeline zoom level. | Use when visual density needs to change without altering the project. | View-only state; do not treat zoom changes as musical edits. |

## Lower Dock

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Lower Dock: mixer | `data-action=lower-dock-mixer` |  | Switches the lower dock to the mixer view. | Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows. | Dock selection is UI-only; edits happen through controls inside the selected dock. |
| Lower Dock: inserts | `data-action=lower-dock-inserts` |  | Switches the lower dock to the inserts view. | Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows. | Dock selection is UI-only; edits happen through controls inside the selected dock. |
| Lower Dock: sends | `data-action=lower-dock-sends` |  | Switches the lower dock to the sends view. | Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows. | Dock selection is UI-only; edits happen through controls inside the selected dock. |
| Lower Dock: automation | `data-action=lower-dock-automation` |  | Switches the lower dock to the automation view. | Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows. | Dock selection is UI-only; edits happen through controls inside the selected dock. |
| Lower Dock: piano roll | `data-action=lower-dock-piano-roll` |  | Switches the lower dock to the piano roll view. | Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows. | Dock selection is UI-only; edits happen through controls inside the selected dock. |
| Lower Dock: audio editor | `data-action=lower-dock-audio-editor` |  | Switches the lower dock to the audio editor view. | Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows. | Dock selection is UI-only; edits happen through controls inside the selected dock. |
| Lower Dock: export details | `data-action=lower-dock-export-details` |  | Switches the lower dock to the export details view. | Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows. | Dock selection is UI-only; edits happen through controls inside the selected dock. |

## Track And Routing

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Add Track | `data-action=add-track-open` | T | Opens the Library / Add Track panel grouped by Audio Recording, Instrument / MIDI, Organization, Chordsmith Roles, and Routing. | Use to add live audio, MIDI, generated role, folder, bus, or return tracks without hunting through the busier DAW surface. | Opening the panel is UI-only; choose a track kind to mutate the project. Input device and mono/stereo mode are set on record-capable mixer strips after creation. |
| Close Add Track | `data-action=add-track-close` |  | Closes the add-track panel. | Use after selecting or cancelling track creation. | UI-only. |
| Add Live Vocals | `data-add-track-kind:live-vocals` |  | Adds a record-capable audio track intended for vocal recording. | Use before recording vocals in the installed app. | Recording needs a saved project, input selection, mono/stereo channel mode, arm state, and human audio smoke. |
| Add Live Instrument | `data-add-track-kind:live-instrument` |  | Adds a record-capable audio track intended for external instruments. | Use before recording guitar, keys, microphone, or line input. | Avoid monitor feedback; check input/output devices and mono/stereo channel mode. |
| Add MIDI Instrument | `data-add-track-kind:midi-instrument` |  | Adds an empty MIDI instrument track for piano-roll clips. | Use when composing MIDI directly inside the DAW. | Add a MIDI clip next before editing notes. |
| Add Folder Track | `data-add-track-kind:folder` |  | Adds a timeline organizer track that can be renamed and saved without processing audio. | Use when a growing arrangement needs visible structure before folder-bus routing exists. | Folder Mute/Solo controls child-lane audibility. Folder routing, sends, FX and export grouping are still future work. |
| Assign Track Folder | `data-track-folder` |  | Moves a generated, audio, or MIDI timeline lane into or out of an organizational folder. | Use to group lanes visually, collapse busy timelines, and let the parent folder Mute/Solo the assigned child lanes. | This is group-control metadata only. Do not infer bus routing, sends, FX inheritance, or export grouping from the folder assignment yet. |
| Toggle Folder Track | `data-folder-toggle` |  | Collapses or expands a folder track's child timeline lanes. | Use when the timeline is busy and the grouped lanes are not being edited directly. | Collapse only hides child rows from the timeline view. It does not mute, disable, route, remove, or exclude child tracks from playback/export. |
| Enable Chordsmith Role Track | `data-add-track-kind:chordsmith-*` |  | Selects or reactivates generated Chordsmith drums, bass, chords, melody, or guitar tracks. | Use when a generated role is inactive or needs direct editing. | Generated roles should preserve Chordsmith as the musical source of truth. |
| Add Bus Track | `data-action=add-bus-track` |  | Adds a bus track for grouped routing. | Use when multiple tracks should route through a shared submix. | Check routing warnings and export summaries after adding buses. |
| Add Return Track | `data-action=add-return-track` |  | Adds a return track scaffold for send effects. | Use for shared effect-return workflows such as ambience or delay. | Send/return behavior is guarded; verify routing in Export Details. |
| Track Rename | `data-track-rename` |  | Renames the selected timeline or mixer track. | Use for clearer project organization and support notes. | Preserve role meaning in names so export stems stay understandable. |
| Mute Track | `data-mute-track` | M | Silences a track without deleting clips or routing; on folder tracks it mutes assigned child lanes as a group. | Use to audition arrangements, isolate problems, or temporarily silence a folder group. | Mute affects playback/render, including folder child lanes, so inspect it before judging missing audio. |
| Solo Track | `data-solo-track` | S | Auditions one or more soloed tracks while suppressing non-soloed tracks; on folder tracks it solos assigned child lanes as a group. | Use for focused mix checks or to audition a folder group. | Solo state can make healthy tracks seem silent; folder solo intentionally keeps child lanes audible and suppresses unrelated tracks. |
| Arm Track | `data-arm-track` | R | Arms or disarms a record-capable track for recording. | Use before pressing Record. | Only record-capable tracks expose arm controls. |
| Monitor Track | `data-monitor-track` |  | Toggles live input monitoring for a record-capable track. | Use to hear an input while preparing or recording. | Warn about feedback risk when speakers are active. |
| Track Volume And Pan | `data-volume / data-pan` |  | Sets track level and stereo position. | Use for core mixing. | These are mix parameters; check automation if a value seems to move during playback. |
| Track Input | `data-track-input` |  | Selects the recording input device or input source for a record-capable track. | Use before arming and recording vocals or instruments. | Device availability is runtime-specific; record the selected device in smoke notes. |
| Recording Channel Mode | `data-track-record-channel-mode` |  | Chooses how an input is captured, such as mono/stereo or channel-specific recording modes supported by the runtime. | Use when matching a microphone, instrument input, or interface channel to the track. | Channel mode affects recorded media shape; verify after a recording smoke pass. |
| Recording Input Channel | `data-track-record-channel` |  | Chooses the explicit mono input channel or stereo input pair stored in the track's recording assignment metadata. | Use when a multi-input interface needs vocals, guitars, keys or mixers assigned to known hardware inputs before recording. | Current native recording alpha only captures Mono Ch 1 or Stereo Ch 1-2; other assignments are preflighted and blocked until channel routing lands. |
| Track Output Routing | `data-track-output` |  | Routes a track to master or an available bus destination. | Use when grouping tracks, testing buses, or preparing stem/routing export behavior. | Routing affects playback and render. Check diagnostics/export warnings after changes. |

## Audio Settings

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Audio Settings | `data-action=audio-settings-open` |  | Opens device and recording settings. | Use before live recording or input/output smoke. | Installed app device lists may differ from browser preview. |
| Close Audio Settings | `data-action=audio-settings-close` |  | Closes the audio settings panel. | Use after checking or refreshing devices. | UI-only. |
| Refresh Devices | `data-action=audio-refresh` |  | Refreshes the app's known audio input/output device list. | Use when devices have changed or recording input is missing. | Device probing can be runtime-specific; record the app/runtime when reporting results. |

## Media Pool And Cache

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Show Media Pool | `data-action=media-pool-focus` |  | Scrolls/focuses the media pool. | Use to inspect imports, cache status, missing media, and placement options. | Media pool status is central evidence for portability and import reliability. |
| Place On Timeline | `data-place-audio` |  | Places an imported audio media item as a timeline clip. | Use after importing audio that should be arranged or edited. | Check selected/target track and clip placement after use. |
| Reload Media | `data-reload-media` |  | Reloads a known media source into runtime/cache state. | Use when media is present but unloaded or stale. | Reload should preserve project references. |
| Relink Media | `data-relink-media` |  | Chooses a replacement file for missing or moved media. | Use after reopening a project with broken external paths. | Relink changes references; preserve user intent and verify waveform/cache status. |
| Collect Media | `data-action=collect-media` |  | Copies reloadable external media beside the saved project when possible. | Use to make a project more portable. | Requires a saved project path and should report blocked items clearly. |
| Collect Media Plan | `data-action=export-media-plan` |  | Exports a JSON plan that describes which media can be collected and which items are blocked. | Use before sharing projects or diagnosing portability. | The plan is evidence, not a copy operation. |
| Build Native Cache | `data-action=build-native-cache` |  | Renders generated/runtime audio to project-cache/native-audio assets. | Use before installed-app playback, reopen, and export reliability smoke. | Inspect cache diagnostics for invalidated, stale, or fallback entries. |

## Inspector Clip

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Clip Mix Gain/Transpose | `data-clip-transform` |  | Edits selected-clip gain or transpose metadata. | Use for per-clip balance and MIDI/generated pitch variation. | Audio pitch controls may be metadata/preparatory; verify render/playback. |
| Generated Section Stem Mutes | `data-clip-stem-mute` |  | Mutes generated roles inside the selected generated-section clip only. | Use for clip-level variations without editing the source Chordsmith section. | Checked means muted for that clip only. |
| Freeze Selected Clip | `data-action=freeze-selected-clip` |  | Renders the selected clip into a reusable audio/cache artifact. | Use to preserve generated or expensive material as audio. | Check media pool and render cache after freezing. |
| Export Selected Clip MIDI | `data-action=export-selected-clip-midi` |  | Exports the selected MIDI-capable clip to a MIDI file. | Use for interchange with other tools. | Audio clips cannot export MIDI. |

## Inspector Track

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Export Selected Track MIDI | `data-action=export-selected-track-midi` |  | Exports all MIDI-capable material on the selected track. | Use for external DAWs, notation tools, Chordsmith review, or game tooling. | Audio-only track content will not become MIDI. |

## Audio Clip Editing

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Audio Clip Properties | `data-audio-clip-property` |  | Edits gain, fade in/out, source offset, duration, playback rate, and pitch metadata. | Use to fit imported or recorded audio to the arrangement nondestructively. | Source files are not rewritten; verify what metadata currently affects playback/export. |
| Short Fades | `data-audio-clip-action:quick-fade` |  | Applies short fade-in and fade-out metadata to an audio clip. | Use to reduce clicks at edit boundaries. | Source-safe metadata only. |
| Reset Fades | `data-audio-clip-action:reset-fades` |  | Clears audio clip fade metadata. | Use to restore raw clip boundaries. | This removes smoothing; listen for clicks after reset. |
| Normalize | `data-audio-clip-action:normalize-gain` |  | Sets clip gain from analyzed peak level. | Use to bring quiet audio closer to working level. | Changes gain metadata, not source samples. |
| Analyze Transients | `data-audio-clip-action:analyze-transients` |  | Analyzes likely transient points in the audio source. | Use before warp marker creation or rhythmic audio inspection. | Analysis metadata is evidence for future warp tools, not full elastic audio by itself. |
| Create Warp Markers | `data-audio-clip-action:create-warp-markers` |  | Creates metadata warp markers from analyzed transients. | Use to prepare timing/warp workflows. | Do not claim full warp playback until the relevant render/playback path is proven. |
| Quantize Warp Markers | `data-audio-clip-action:quantize-warp-markers` |  | Snaps existing warp marker target positions to the project 1/16 grid as source-safe metadata. | Use after creating warp markers to prepare live-instrument timing correction. | This does not time-stretch playback yet; sourceSeconds anchors stay preserved for the future stretch engine. |
| Clear Warp | `data-audio-clip-action:clear-warp-markers` |  | Removes metadata warp markers from an audio clip. | Use when analysis markers are wrong or no longer wanted. | Clearing markers should not delete source audio. |
| Crossfade | `data-audio-clip-action:crossfade-overlap` |  | Creates a crossfade with an overlapping neighboring clip. | Use to smooth edits, comps, or overlaps. | Inspect neighboring clip boundaries after use. |
| Overlap Fade | `data-audio-clip-action:create-crossfade-left` |  | Creates a source-safe overlap fade at the left edge of the selected audio clip. | Use when a split clip needs a smoother entry. | Verify source offset and clip start after the operation. |
| Invert Phase | `data-audio-clip-action:invert-phase` |  | Applies phase inversion metadata to the audio clip. | Use for phase checks or creative cancellation effects. | Verify export/render because phase changes can be subtle visually. |
| Reverse | `data-audio-clip-action:reverse` |  | Reverses the audio clip nondestructively. | Use for creative effects or reverse transitions. | Check the rendered result; source media should remain unchanged. |

## Recording And Takes

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Take Activate | `data-audio-take-activate` |  | Makes a take the active audible clip in its take group. | Use when choosing the best pass from multiple recordings. | Inactive takes are not deleted. |
| Archive Take | `data-audio-take-archive` |  | Archives a take without deleting its source media. | Use to hide a take from the active comp workflow while preserving it. | Archive is reversible and should not be treated as cleanup. |
| Restore Take | `data-audio-take-restore` |  | Restores an archived take to the take group. | Use when an archived take needs auditioning again. | Verify active/muted state after restore. |
| Comp From Playhead | `data-action=audio-take-comp-from-playhead` |  | Creates a take comp beginning at the current playhead. | Use to assemble parts of multiple takes. | Confirm playhead position and take group before comping. |

## MIDI Editing

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Add Empty MIDI Clip | `data-action=add-empty-midi-clip` |  | Adds a blank MIDI clip to the selected MIDI track. | Use before drawing or entering MIDI notes from scratch. | Requires a MIDI track selection. |
| MIDI Clip Bars | `data-midi-clip-property:barLength` |  | Changes the selected MIDI clip's bar length. | Use before drawing notes or looping a MIDI phrase that needs a different duration. | Clip length changes timing bounds; inspect notes after shortening a clip. |
| Quantize | `data-midi-quantize` |  | Moves MIDI notes to the selected rhythmic grid. | Use to tighten timing to quarter, eighth, sixteenth, or thirty-second notes. | This edits MIDI timing in project state but remains undoable. |
| Swing | `data-midi-swing` |  | Applies straight or swung eighth-note timing to the MIDI clip. | Use after basic timing is correct and feel needs adjustment. | Record/inspect the last swing metadata when explaining the result. |
| Groove | `data-midi-groove` |  | Applies a named groove template to MIDI timing. | Use for style-specific timing feel. | Groove changes should be listened to, not judged from note positions alone. |
| Velocity Transform | `data-midi-velocity-transform` |  | Applies a bulk velocity edit such as leveling or deterministic humanization. | Use to shape note dynamics quickly. | Check drum/bass parts because velocity may change perceived groove strongly. |
| Pitch Transform | `data-midi-pitch-transform` |  | Transposes MIDI notes by semitone or octave steps. | Use for octave placement or key correction. | Check pitch range after transforms, especially drums and bass. |
| MIDI Note Add/Edit/Move/Duplicate/Delete | `data-midi-note-*` |  | Adds notes and edits note pitch, start tick, length, velocity, channel, movement, duplication, and deletion. | Use for detailed piano-roll editing. | Keep note edits bounded and verify bar/tick interpretation against the clip PPQ and tempo map. |
| MIDI Controller/Program/Bend/Aftertouch | `data-midi-controller-* / data-midi-program-* / data-midi-pitch-bend-* / data-midi-aftertouch-*` |  | Adds, edits, duplicates, and deletes expressive MIDI events. The MIDI preview/render path interprets channel-matched CC7 volume, CC10 pan, CC11 expression, CC64 sustain, and pitch-bend detune. | Use for MIDI expression and interchange detail. | Imported controller data can be dense; avoid broad destructive edits without a clear target. |

## MIDI To Chordsmith

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Map Drums | `data-action=convert-midi-drums` |  | Maps General MIDI drum notes into generated drum branch overlays. | Use when imported MIDI drums should become editable generated drum lanes. | Listen and inspect mapping because MIDI drum files vary widely. |
| Map Bass | `data-action=convert-midi-bass` |  | Maps low non-drum MIDI notes into generated bass overlays. | Use when an imported bassline should become Chordsmith-style source. | Check octave and root interpretation after conversion. |
| Map Chords | `data-action=convert-midi-chords` |  | Maps simultaneous non-drum MIDI notes into generated chord overlays. | Use when chord MIDI should inform the Chordsmith harmonic grid. | Chord inference is a helper; inspect musical correctness. |
| Map Melody | `data-action=convert-midi-melody` |  | Maps non-drum MIDI notes into generated melody overlays. | Use when importing a lead or motif into Chordsmith-style editing. | Check section, track index, and note range after mapping. |
| Map Arrangement | `data-action=convert-midi-arrangement` |  | Maps drums, bass, chord groups and melody notes from the selected MIDI clip into generated overlays in one undoable, source-preserving pass. | Use when a MIDI clip should become editable Chordsmith-style arrangement material without replacing the raw MIDI import. | Treat this as an interpretation helper; preserve the raw MIDI clip and listen/inspect each role after mapping. |
| Adopt Tempo | `data-action=adopt-midi-tempo` |  | Applies the imported MIDI start tempo and supported /4 meter to project globals. | Use when the MIDI file should define project tempo. | Do not adopt tempo silently if existing project timing matters. |
| Tempo Lane | `data-action=adopt-midi-tempo-map` |  | Converts imported MIDI tempo events into project tempo automation. | Use when a MIDI file contains tempo changes that should be preserved. | Tempo automation affects render and bar/beat interpretation. |
| Meter Lane | `data-action=adopt-midi-meter-map` |  | Converts imported MIDI time-signature events into the project meter map. | Use when changing meters should survive import. | Meter maps affect display and timing; verify after adoption. |

## Chordsmith Editing

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Song Globals | `data-chordsmith-global` |  | Edits BPM, key, scale, time signature, resolution, and swing for the Chordsmith source. | Use for broad musical identity changes. | Changing globals can alter timing, generation, and export behavior. |
| Section Chord Selectors | `data-section-chord` |  | Chooses chord symbols for each bar in the selected Chordsmith section. | Use to change the harmonic progression that drives generated roles. | Chord changes can alter bass, melody, guitar, and export behavior; inspect generated roles afterward. |
| Add Section | `data-action=section-add` |  | Adds a Chordsmith section to the source project. | Use to create more arrangement material or variations. | Confirm timeline clips after adding/changing sections. |
| Section Bars | `data-section-bars` |  | Changes the bar length of a Chordsmith section. | Use to alter section duration before placing or repeating clips. | Changing section length can affect existing arrangement assumptions. |
| Step Page | `data-step-page` |  | Moves long section step editors to the previous or next visible page. | Use when a section has more steps than fit in the current editor window. | Page navigation is UI-only; it changes which steps are visible, not the section data. |
| Drum/Bass/Guitar Presets | `data-drum-preset-section / data-bass-preset-section / data-guitar-preset-section` |  | Fills role patterns from Chordsmith preset libraries. | Use for quick groove or rhythm starting points. | Preset application is source editing; inspect generated steps afterward. |
| Drum Steps And Branch Steps | `data-drum-step / data-drum-branch-step` |  | Cycles drum lane hits, accents, and branch lane steps. | Use for beat programming and kit-piece variations. | Branch lanes are live-only overlays unless explicitly collapsed/exported through supported paths. |
| Drum Tuplet Toggle | `data-drum-tuplet` |  | Toggles tuplet feel metadata for the selected drum step. | Use to create triplet/tuplet timing accents inside a drum pattern. | Tuplet metadata changes generated timing feel; listen after applying. |
| Bass Mode | `data-bass-mode` |  | Chooses how generated bass interprets section harmony and manual bass steps. | Use before detailed bass step editing or when matching imported MIDI bass behavior. | Mode changes can make existing steps sound different without changing their labels. |
| Bass Steps, Holds, Slides, Accents | `data-bass-step / data-bass-accent / selected bass step + H/S/T` | H hold / S slide / T tuplet | Edits bass note steps, visible accent steps, and selected-step hold/slide/tuplet performance metadata. | Use for bassline construction and articulation. | Hold/slide are currently keyboard-driven from the selected step; avoid assuming hidden legacy selectors are visible buttons. |
| Melody Steps | `data-melody-step` |  | Edits melody note steps and their hold/slide/tuplet metadata. | Use for motif and lead-line editing. | Use page controls when sections are longer than the visible editor window. |
| Melody Track Settings | `data-melody-instrument / data-melody-octave / data-melody-pan / data-melody-mute / data-melody-solo` |  | Sets melody track instrument, octave, pan, mute, and solo values for generated melody playback. | Use to balance or isolate melody tracks while editing generated sections. | Mute and solo affect audition/render perception; inspect them before diagnosing missing melody. |
| Melody Hold / Slide / Tuplet | `data-melody-hold / data-melody-slide / data-melody-tuplet` |  | Toggles performance metadata on selected melody steps. | Use for legato notes, slides, and tuplet rhythmic feel. | These controls require a selected melody step; verify the selected step before toggling. |
| Chord Instrument | `data-chord-instrument` |  | Chooses the generated chord instrument voice. | Use when changing the character of chord playback without rewriting the chord progression. | Instrument changes affect tone, not harmonic content. |
| Guitar Steps | `data-guitar-step` |  | Edits guitar rhythm articulations per step. | Use for rhythm-guitar patterns and energy changes. | Guitar may need its generated role track active before editing is visible. |
| Guitar Settings | `data-guitar-setting` |  | Enables guitar and edits tone, register, strum mode, and volume. | Use to shape generated guitar before arranging or exporting game loops. | Guitar enable state affects whether guitar material is audible and exported. |

## Drum Kit Lanes

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Branch Drums | `data-action=branch-generated-drums` |  | Creates branch track views for generated drum kit lanes. | Use when kit pieces need separate mix, FX, sends, or export control. | Branch views should preserve the original Chordsmith drum source. |
| Branch Entry Gesture | `data-drum-branch-entry` |  | Marks timeline/clip regions that can branch generated drum lanes by double-click or context action. | Use when a user wants separate kit-piece lane control from a generated drum source. | Branching should create editable/mixable views without destroying the source drum pattern. |
| Hide/Show Branch Rows | `data-action=toggle-drum-branch-group` |  | Hides or shows generated drum branch rows without deleting branch data. | Use to reduce timeline clutter while keeping branch mix/export setup. | Visibility is not deletion. |
| Collapse Branches | `data-action=collapse-generated-drum-branches` |  | Removes generated drum branch track views while preserving the source kit. | Use after branch editing/export review when the timeline is too busy. | Confirm whether branch-specific routing/FX should remain before collapsing. |
| Drum Lane Mix | `data-drum-lane-volume / data-drum-lane-pan / data-drum-lane-gate / data-drum-lane-mute` |  | Edits kit-piece volume, pan, gate length, and mute state. | Use for generated drum balance and articulation. | Gate changes generated hit duration and can invalidate caches. |

## Mixer And FX

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Add FX | `data-add-fx / data-drum-lane-add-fx` |  | Adds a built-in effect slot to a track or drum lane. | Use for internal processing such as EQ, delay, dynamics, or color. | Third-party plugin hosting is not claimed. |
| Bypass/Enable FX | `data-fx-toggle / data-drum-lane-fx-toggle` |  | Bypasses or enables an effect slot. | Use to audition processing impact. | Bypassed effects still exist in the project. |
| Remove FX | `data-fx-remove / data-drum-lane-fx-remove` |  | Removes an effect slot from its chain. | Use when an effect is no longer wanted. | This can remove parameter/automation context; verify undo coverage. |
| Pocket Pro EQ Presets And Bands | `data-fx-eq-preset / data-fx-param` |  | Applies EQ presets and edits EQ band enable, frequency, gain, and Q parameters. | Use for tonal shaping and corrective EQ. | Check parameter automation after changing EQ values. |

## Sends And Automation

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Send Level And Mode | `data-track-send-level / data-track-send-mode` |  | Sets send amount and pre/post-fader mode from a source track to a return track. | Use for shared ambience/effects routing. | Verify target return and routing warnings. |
| Create Automation Lane | `data-clip-automation-create / data-automation-create / data-send-automation-create / data-project-automation-create / data-fx-automation-create` |  | Creates an automation lane for clip gain, track parameters, sends, project tempo, or FX parameters. | Use when a value should change over time. | Automation is project data; preserve sorted point order and target identity. |
| Add Automation Point | `data-clip-automation-add-point / data-automation-add-point / data-send-automation-add-point / data-project-automation-add-point / data-fx-automation-add-point` |  | Adds an automation point at the playhead using the current value. | Use for mix rides, filter sweeps, tempo changes, and timed effects. | Confirm playhead position and current value first. |
| Edit/Delete Automation Point | `data-automation-point-* / data-automation-delete-point` |  | Edits bar, value, curve, or deletes an automation point. | Use for precise automation shaping. | Deleting points can change playback across a region; keep edits bounded. |
| Enable Automation Lane | `data-automation-enabled` |  | Turns an automation lane on or off without deleting its points. | Use to compare automated and static playback or temporarily bypass a lane. | Disabled lanes still hold data. Do not delete points just to audition a bypass. |
| Automation Lane Surface | `data-automation-lane-surface / data-automation-lane-start-bar / data-automation-lane-end-bar / data-automation-lane-min / data-automation-lane-max` |  | Displays the drawable automation area and encodes the bar/value bounds used for pointer-created points. | Use for visual editing of automation curves across clip, track, send, project, and FX targets. | Surface bounds are control metadata; use them to place points precisely and preserve target identity. |
| Project Meter Map | `data-project-meter-map-*` |  | Adds, edits, or deletes time-signature map points. | Use when a project needs meter changes from MIDI or manual arrangement work. | Meter changes affect bar/beat display and render timing. |

## Export

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Export Profile Controls | `data-export-profile-setting` |  | Edits WAV export settings such as sample rate, tail length, channels, normalization, dither and bit depth. | Use before rendering full-song WAVs, stem ZIPs or section-loop ZIPs with specific delivery settings. | These settings affect later export output; unsupported codec profiles must still reject clearly. |
| Full WAV | `data-action=export-wav` | Ctrl+E | Renders the full mix to a WAV file. | Use for song preview, master checks, and baseline audio export. | Unsupported codec profiles must fail clearly instead of writing mislabeled WAVs. |
| Full MIDI | `data-action=export-midi` |  | Exports the full project MIDI arrangement. | Use for notation, external DAW interchange, or Chordsmith/DJ workflows. | Audio clips do not become MIDI. |
| Stem WAV ZIP | `data-action=export-stems` |  | Exports one WAV per stem group plus manifest metadata. | Use for mixing, game implementation, and external stem review. | Inspect manifest paths, stem count, and warnings. |
| Section Loop ZIP | `data-action=export-section-manifest` |  | Exports generated section loop WAVs plus manifest metadata. | Use for loop packs and adaptive game cue tests. | Loop/gapless smoke matters before compressed game format claims. |
| Godot Game Pack | `data-action=export-godot-manifest` |  | Exports a WAV-based adaptive pack for Godot with source project, full mix, stems, loops, manifest, warnings, and size summaries. | Use to move rendered DAW audio into a Godot workflow. | Do not edit the Godot addon from DAW work unless explicitly requested. |
| Push Godot Pack | `data-action=push-godot-pack` |  | Attempts to send a generated Godot pack to a local receiver, then falls back to saving the ZIP. | Use when a Godot editor receiver is running. | Treat push as handoff smoke; inspect fallback behavior. |
| Web Game Pack | `data-action=export-web-game-manifest` |  | Exports a WAV-based web game audio pack with deterministic paths and manifest data. | Use for browser/game runtime integration tests. | Compressed web formats need separate runtime smoke; WAV is the baseline. |
| Future Codec Buttons | `data-action=export-full-flac`<br>`export-full-flac / export-stem-flacs / export-godot-ogg-pack / export-web-ogg-pack / export-full-mp3 / export-aiff-interchange` |  | Shows planned FLAC, Ogg, MP3, and AIFF profiles as disabled or guarded unsupported exports. | Use to explain roadmap direction without claiming encoders are shipped. | These must reject clearly until encoder dependencies, UI, manifests, and smoke are proven. |
| Diagnostics JSON | `data-action=export-diagnostics` |  | Downloads a structured diagnostics snapshot. | Use for durable bug reports and release smoke evidence. | Review for privacy before sharing externally. |

## Diagnostics And Support

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| About / Diagnostics | `data-action=controls-open` |  | Opens app, project, media, cache, routing, updater, handoff, recording, and support diagnostics. | Use before bug reports, installed-app smoke, or release checks. | Release truth remains release-status.json and docs/CURRENT_RELEASE_STATUS.md. |
| Close Diagnostics | `data-action=controls-close` |  | Closes the diagnostics panel. | Use after reading or exporting diagnostics. | UI-only. |
| Copy Diagnostics | `data-action=copy-diagnostics` |  | Copies structured diagnostics to the clipboard. | Use when a support note or issue report needs current app state. | Prefer exported JSON for long-lived evidence. |
| Function Guide | `data-action=function-guide-open` |  | Opens the in-app function guide and action catalog. | Use when a human or AI helper needs control meanings in context. | Keep this catalog aligned whenever adding buttons or command surfaces. |
| Close Function Guide | `data-action=function-guide-close` |  | Closes the in-app function guide. | Use after reading help. | UI-only. |
| Check For Updates | `data-action=updater-open` |  | Opens the updater panel. | Use in installed-app smoke to inspect updater state. | Opening the panel is not proof that update download/install succeeded. |
| Run Update Check | `data-action=updater-check` |  | Checks the signed GitHub Releases updater manifest. | Use to verify whether a newer installed-app build is available. | Record exact version/result when using this as release evidence. |
| Download And Install Update | `data-action=updater-download-install` |  | Downloads and stages an available signed update. | Use only when the updater reports an available update. | Verify ready-to-restart state and artifact/version details. |
| Restart After Update | `data-action=updater-restart` |  | Restarts Pocket DAW to finish a staged update. | Use after update installation is ready to restart. | Only use when the app explicitly reports ready-to-restart. |
| Close Updater | `data-action=updater-close` |  | Closes the updater panel. | Use after checking updater state. | UI-only. |
| Updater Auto Check | `data-updater-auto-check` |  | Enables or disables automatic update checks. | Use when configuring installed-app update behavior. | This is app preference state, not a DAW project edit. |

## AI / MCP Bridge

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| AI / MCP Bridge | `data-action=mcp-setup-open` |  | Opens local MCP command/config snippets and live bridge controls. | Use when an AI counterpart should inspect, validate, edit, or observe/control the app. | Live bridge requires the running installed app and bearer token; file MCP can work closed. |
| Enable Live App Bridge | `data-ai-bridge-enabled` |  | Toggles the token-protected live localhost bridge for the current app session. | Use when a trusted AI tool needs live app state/control. | Do not expose the bearer token broadly. |
| Test Live Bridge | `data-action=ai-bridge-test` |  | Runs a connectivity test against the live MCP bridge. | Use before relying on live app MCP tools. | A failed test means use file MCP or visual/browser control instead. |
| File MCP Folder Commands | `set_track_folder`, `toggle_folder_expanded`, `toggle_track_mute`, `toggle_track_solo` |  | Lets file-first MCP assign timeline lanes to folder tracks, collapse or expand the folder, and use folder Mute/Solo as child-lane group controls. | Use when a human or AI counterpart needs to organize a busy project or smoke folder behavior without driving the visual UI. | These commands reuse existing undoable app command paths. Folder commands still do not imply folder-bus routing, sends, FX inheritance or export grouping. |
| File MCP Recording Input Channel | `set_recording_input_channel` |  | Lets file-first MCP store the same explicit live-track Mono Ch N or Stereo Ch N-N+1 recording input assignment exposed in the mixer UI. | Use before recording smoke or when an AI counterpart needs to prepare a multi-input project without driving the visual mixer. | This writes project assignment metadata and native-alpha preflight can still block non-default channel maps until native channel routing lands. |
| File MCP Punch Recording Placement | `place_punch_recording_clip` |  | Places an explicit punch-window clip from an existing raw recording media item through the undoable command path. | Use for file-first punch/take-lane smoke before a full installed punch recording UI exists. | This is a metadata/placement foundation only; it does not start native recording or prove user-facing punch recording. |
| Live MCP Recording Input Channel | `pocket_daw_live_apply_commands:set_recording_input_channel` |  | Lets the tokened live bridge set the running app's selected live-track Mono Ch N or Stereo Ch N-N+1 recording input assignment through the same undoable command path as the mixer UI. | Use during MCP-observed installed-app smoke when the running app needs a recording input prepared without visual UI driving. | Requires the installed app live bridge. Non-default channel maps still remain blocked by native-alpha preflight until native channel routing lands. |
| Live MCP Arm And Monitor | `pocket_daw_live_apply_commands:set_track_armed, set_track_monitor` |  | Lets the tokened live bridge arm or disarm a live audio track and enable or disable input monitoring through existing undoable track commands. | Use during MCP-observed recording setup when the intended live track needs to be prepared without broad UI automation. | Desired-state commands are idempotent. Actual recording/playback quality still needs installed-app and human audio smoke. |
| Live MCP Track Input | `pocket_daw_live_apply_commands:set_track_input` |  | Lets the tokened live bridge set a live track's visible input device through the same command path as the mixer input selector. | Use before arming or recording when MCP needs to prepare the running app for a known hardware input. | Device IDs are runtime-specific. Confirm the selected input through live status and real installed-app smoke. |
| Live MCP Track Setup Status | `pocket_daw_live_status:tracks` |  | Reports per-track arm, monitor, input device, recording mode, recording input assignment, folder and output routing setup from the running app. | Use during recording or routing smoke to confirm the running app matches the visible mixer before pressing Record or exporting. | Read-only status. It helps observe setup, but real audio recording/playback still needs installed-app smoke. |
| Live MCP Media And Takes | `pocket_daw_live_status:media` |  | Reports media-pool counts, missing/runtime-only media counts and grouped audio-take summary from the running app. | Use after importing or recording audio to confirm project media and take groups appeared before save/reopen smoke. | Read-only status. It confirms project state, not whether the recorded audio sounds correct. |
| Live MCP Export Readiness | `pocket_daw_live_status:export` |  | Reports compact Godot/Web game-pack readiness from the running app, including manifest paths, full-mix path, stem/loop counts, warning counts and delivery targets. | Use before exporting or manually importing a game pack so the AI counterpart can observe the running project's export shape. | Read-only status. It does not replace ZIP verification or manual Godot/Web target-runtime smoke. |
| File MCP Verify Game Pack | `pocket_daw_verify_game_pack` |  | Verifies an existing Godot/Web game-pack ZIP against its manifest, embedded source project, file-size summary, deterministic paths and WAV-only codec boundary. | Use after exporting a pack and before any Godot/Web target-runtime smoke claim. | Read-only. Requires an explicit ZIP path and still reports that manual target-runtime smoke is required before release claims. |
| Recording Input Preflight Diagnostics | `recording.inputPreflight`, `recordingInputPreflight` |  | Reports whether the current armed live tracks and saved input channel assignments are valid before native recording starts. | Use when recording will not start, when checking mono/stereo channel assignments, or before future multitrack hardware smoke. | Exposed in support diagnostics and file-first MCP summaries. It is a readiness report, not a claim that simultaneous multitrack recording is shipped. |
| Copy MCP Setup | `data-action=copy-mcp-setup` |  | Copies command, JSON, TOML, or all MCP setup snippets. | Use to configure an AI client for Pocket DAW. | Check whether the snippet is for file MCP or live bridge before using it. |
| Close MCP Setup | `data-action=mcp-setup-close` |  | Closes the AI / MCP Bridge panel. | Use after setup details are copied or reviewed. | UI-only. |

## Feedback

| Control | Action / Selector | Shortcut | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- | --- | --- |
| Send Feedback | `data-action=feedback-open` |  | Opens the feedback panel. | Use when the user wants to report confusing behavior, bugs, or testing notes. | Encourage reviewing diagnostics before external sharing. |
| Copy Feedback Diagnostics | `data-action=feedback-copy-diagnostics` |  | Copies diagnostics from the feedback panel. | Use to include support state with a feedback note. | Diagnostics can contain local paths; review privacy. |
| Feedback Text | `data-feedback-text` |  | Stores the human-written feedback body before copying diagnostics or opening an email. | Use when describing a bug, manual smoke result, or feature request from inside the app. | Do not include private project paths or personal data unless the user explicitly wants that shared. |
| Send Feedback Email | `data-action=feedback-send` |  | Drafts or opens an email with feedback text and diagnostics when possible. | Use for tester reports. | The user should review before sending. |
| Close Feedback | `data-action=feedback-close` |  | Closes the feedback panel. | Use after feedback is sent, copied, or cancelled. | UI-only. |
| More By Samfa12 | `data-action=more-by-samfa12` |  | Opens the external Samfa12 page. | Use when the user wants related apps/projects. | This leaves the app context through an external URL. |

## Maintenance Rule

When adding, renaming, or removing a user-facing DAW control, update `FUNCTION_ACTION_REFERENCE` in `src/app/functionGuide.ts`, regenerate this catalog, and add or update UI tests that prove the control is visible and documented.
