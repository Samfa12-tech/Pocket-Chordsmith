export interface FunctionGuideEntry {
  name: string;
  does: string;
  useWhen: string;
  aiNote: string;
}

export interface FunctionGuideSection {
  title: string;
  summary: string;
  entries: FunctionGuideEntry[];
}

export interface FunctionActionReference {
  surface: string;
  control: string;
  actionId?: string;
  selector?: string;
  shortcut?: string;
  does: string;
  useWhen: string;
  aiNote: string;
}

export const FUNCTION_REFERENCE_DOC = "docs/POCKET_DAW_FUNCTION_REFERENCE.md";
export const FUNCTION_ACTION_CATALOG_DOC = "docs/POCKET_DAW_ACTION_CATALOG.md";

export const FUNCTION_GUIDE_SECTIONS: FunctionGuideSection[] = [
  {
    title: "Project And File",
    summary: "Create, open, save, recover and identify Pocket DAW sessions.",
    entries: [
      {
        name: "New Project",
        does: "Starts a fresh unsaved Pocket DAW project and resets the working arrangement.",
        useWhen: "Use before composing a new song or testing an import without touching the current session.",
        aiNote: "Warn before replacing unsaved work. Prefer Save or Save As first when the project has user edits."
      },
      {
        name: "Open .pocketdaw",
        does: "Loads an existing Pocket DAW project file, restores its project data, and hydrates media/cache references where possible.",
        useWhen: "Use to continue a saved DAW session or inspect a user's project state.",
        aiNote: "For automation, prefer the file MCP tools when the app does not need visual smoke."
      },
      {
        name: "Save .pocketdaw",
        does: "Writes the current project to its known file path.",
        useWhen: "Use after meaningful edits, before recording, and before installed-app smoke testing.",
        aiNote: "If there is no file path, the UI must use Save As. MCP v1 does not trigger Save As for an unsaved project."
      },
      {
        name: "Save As",
        does: "Prompts for a new .pocketdaw destination and adopts that filename as the project title when appropriate.",
        useWhen: "Use to create a durable project path, duplicate a session, or prepare recording/project-relative media.",
        aiNote: "A saved path is required for reliable project-media recordings and portable cache collection."
      },
      {
        name: "Recent Files",
        does: "Keeps quick access to recently opened or saved Pocket DAW projects.",
        useWhen: "Use for returning to the last tested project without browsing the filesystem.",
        aiNote: "Recent entries are local runtime state and may differ between dev, installed app, and browser preview."
      },
      {
        name: "Recovery And Autosave",
        does: "Keeps recovery snapshots around risky imports and remembers editable demo/autosave state.",
        useWhen: "Use when an import or file load needs rollback confidence.",
        aiNote: "Do not treat autosave as a replacement for explicit Save before release or recording smoke."
      }
    ]
  },
  {
    title: "Import",
    summary: "Bring Chordsmith, Pocket DJ, audio, MIDI, multi-format DAW sessions and project data into the DAW.",
    entries: [
      {
        name: "Import Paste",
        does: "Parses pasted PCS1 share codes, Pocket Chordsmith JSON, Pocket DJ sessions, PocketHandoff payloads, or raw .pocketdaw JSON.",
        useWhen: "Use for fast Chordsmith or DJ handoff testing without opening a file picker.",
        aiNote: "For Pocket DJ imports, the editable arrangement stays linked to the embedded Chordsmith source while DJ deck/performance state is preserved as metadata, not silently applied to the DAW mix."
      },
      {
        name: "Open File",
        does: "Lets the native/browser file picker route supported project, audio, or MIDI files into the appropriate import path.",
        useWhen: "Use when the file type is known but the user wants one entry point.",
        aiNote: "After import, inspect the status text and media pool to confirm placement."
      },
      {
        name: "Import Audio",
        does: "Imports an audio file into the media pool, decodes it for runtime playback, and makes it placeable on the timeline.",
        useWhen: "Use for loops, vocals, instrument takes, stems, references, or audio clips.",
        aiNote: "Native decode/cache reliability is still important. Check source format, duration, sample rate, channels and missing state."
      },
      {
        name: "Import MIDI",
        does: "Parses .mid/.midi files, adds media pool metadata, and creates editable MIDI clips according to the MIDI placement mode.",
        useWhen: "Use for external melodies, drum parts, chord ideas, or Chordsmith conversion material.",
        aiNote: "Check imported tempo/meter maps and decide whether to adopt tempo, create tempo automation, or keep project tempo unchanged."
      },
      {
        name: "Import Session Folder / Files",
        does: "Reconciles stems, companion MIDI, Ableton Live, DAWproject and validated Mureka AAF exports into one clean Pocket DAW session.",
        useWhen: "Use when the same song was downloaded in several interchange formats or its stems and companion MIDI must remain aligned.",
        aiNote: "Equivalent PCM is deduplicated, dedicated stems win source priority, MIDI references start muted, the most complete companion tempo map wins, and arbitrary non-Mureka AAF layouts are not claimed."
      },
      {
        name: "MIDI Placement Mode",
        does: "Controls whether imported MIDI becomes one clip, per-source-track clips, per-channel clips, or drum-channel splits.",
        useWhen: "Use before importing MIDI files with multiple channels/tracks.",
        aiNote: "For arrangement analysis, per-channel or drum-channel split can be easier for an AI agent to reason about."
      },
      {
        name: "Chordsmith Handoff",
        does: "Accepts app/deep-link handoff payloads and converts Chordsmith material into DAW tracks, clips, sections and generated roles.",
        useWhen: "Use when moving from Pocket Chordsmith composition into DAW arrangement/export.",
        aiNote: "Keep Chordsmith as the musical source of truth. Do not duplicate whole Chordsmith UI logic in the DAW."
      }
    ]
  },
  {
    title: "Transport",
    summary: "Control playback, position, count-in and stuck-note safety.",
    entries: [
      {
        name: "Play / Pause",
        does: "Starts or pauses playback from the current playhead while keeping project edits live.",
        useWhen: "Use for auditioning the current arrangement, mix, imported MIDI, generated Chordsmith roles, or cached playback.",
        aiNote: "Remote agents should use MCP transport status when audio cannot be heard directly."
      },
      {
        name: "Stop",
        does: "Stops playback and live metronome activity.",
        useWhen: "Use before export, recording setup changes, or switching playback modes.",
        aiNote: "If stuck notes or previews remain audible, use MIDI Panic."
      },
      {
        name: "Restart",
        does: "Restarts playback from the beginning of the project.",
        useWhen: "Use for full-arrangement listening passes.",
        aiNote: "During live edits, native restart coalescing should avoid excessive rebuilds."
      },
      {
        name: "Bar 1",
        does: "Moves the playhead back to the first bar.",
        useWhen: "Use to reset audition position without changing the loop region.",
        aiNote: "Useful before deterministic render/listen smoke."
      },
      {
        name: "Metronome",
        does: "Toggles metronome playback and count-in behavior for recording.",
        useWhen: "Use when recording live audio or checking timing against bars/beats.",
        aiNote: "Check count-in settings before judging recording timing."
      },
      {
        name: "MIDI Panic",
        does: "Stops preview playback and clears active MIDI notes that may be stuck.",
        useWhen: "Use after interrupted playback, imported MIDI auditioning, or synth preview problems.",
        aiNote: "This is a safety command; it should not mutate project data."
      }
    ]
  },
  {
    title: "Timeline And Clips",
    summary: "Arrange clips nondestructively across bars, tracks and ranges.",
    entries: [
      {
        name: "Select Clip / Track",
        does: "Chooses the primary clip and track shown in the inspector and lower dock editors; Ctrl-click, Cmd-click or Shift-click adds/removes clips from the current multi-selection.",
        useWhen: "Use before editing clip transforms, track routing, automation, MIDI, audio, Chordsmith section data, drag movement, or bulk timeline clipboard edits.",
        aiNote: "MCP live status reports the runtime multi-selection as selection.clipIds/selection.clips. The primary selected clip still anchors inspector-only commands."
      },
      {
        name: "Move Left / Move Right",
        does: "Moves the selected clip, or every clip in the active multi-selection, earlier or later by the current snap step; dragging one selected clip moves the selected group together.",
        useWhen: "Use for arrangement timing changes while preserving the source clip.",
        aiNote: "Check snap mode before moving. Bar and beat moves are intentionally different."
      },
      {
        name: "Cut / Copy / Paste / Duplicate",
        does: "Cuts, copies, pastes, or duplicates the selected clip or selected clip group without altering original source media.",
        useWhen: "Use for moving material, repeating sections, building song form, copying multi-track MIDI imports, or testing alternate placements.",
        aiNote: "Group clipboard edits preserve relative clip spacing. Cut removes timeline clips and keeps a runtime clipboard copy as one undoable edit; Paste depends on clipboard state."
      },
      {
        name: "Split Clip",
        does: "Splits the selected clip at the playhead.",
        useWhen: "Use before muting, moving, trimming, or exporting a subsection.",
        aiNote: "Prefer split/range edits over destructive source edits."
      },
      {
        name: "Trim Start / Trim End",
        does: "Adjusts clip boundaries by snap steps without modifying source media.",
        useWhen: "Use to tighten arrangement timing or create clean loop edges.",
        aiNote: "For audio clips, check source offset/duration fields if exact source alignment matters."
      },
      {
        name: "Mute Clip / Delete Clip",
        does: "Mute silences the selected clip or clip group nondestructively; Delete removes the selected clip or clip group from the timeline.",
        useWhen: "Use Mute for auditioning alternatives and Delete for removing unwanted arrangement material.",
        aiNote: "Prefer Mute when the user may want to recover an idea quickly."
      },
      {
        name: "Edit Range",
        does: "Defines a bar range for copy range, cut range, split, crop, delete, ripple delete, ripple all, range loop and clear range commands.",
        useWhen: "Use for section-level edits across clips or tracks, or to copy/cut only part of a selected clip.",
        aiNote: "Copy Range and Cut Range use the normal clip clipboard; ripple edits change timeline positions after the range."
      },
      {
        name: "Loop Region",
        does: "Auditions a repeating bar range or selected clip range.",
        useWhen: "Use for mix checking, section editing, recording practice, or loop export prep.",
        aiNote: "Loop state affects playback auditioning, not source data."
      },
      {
        name: "Markers And Game Cues",
        does: "Adds timeline labels and game-state markers for arrangement navigation and adaptive game export planning.",
        useWhen: "Use markers for song notes and game cues for menu/combat/explore/etc. adaptive states.",
        aiNote: "Game cue controls are visible in Game music focus and hidden in Music focus."
      },
      {
        name: "Zoom And Timeline Size",
        does: "Changes pixels-per-bar and timeline height so the user can inspect detail or see more tracks.",
        useWhen: "Use zoom in for step/clip precision and zoom out for full-song structure.",
        aiNote: "These are UI-only view settings."
      }
    ]
  },
  {
    title: "Inspector",
    summary: "Edit the currently selected clip and track in context.",
    entries: [
      {
        name: "Clip Mix",
        does: "Adjusts selected-clip gain and transpose where supported.",
        useWhen: "Use for per-clip balance or generated/MIDI pitch shifts without changing the source project.",
        aiNote: "Audio pitch shifting is not currently available; audio clips expose audio-specific controls instead."
      },
      {
        name: "Track Source Editor",
        does: "Labels generated-role sequencer controls as Chordsmith source edits, separate from selected-clip mix controls.",
        useWhen: "Use when editing drums, bass, chords, melody or guitar from the inspector and the user needs to know whether a control changes clip metadata or source section data.",
        aiNote: "Clip mix controls affect the selected timeline clip; Track source editor controls affect the generated source section."
      },
      {
        name: "Section Stem Mutes",
        does: "Mutes Drums, Bass, Chords, Melody, or Guitar only inside the selected generated-section clip.",
        useWhen: "Use to create clip-level variations from one Chordsmith section.",
        aiNote: "Checked means muted for that selected clip only. The original Chordsmith source stays unchanged."
      },
      {
        name: "Clip Edit Palette",
        does: "Provides quick clip and range edit commands next to the selected clip's metadata.",
        useWhen: "Use when working from the inspector rather than the timeline toolbar.",
        aiNote: "These commands route to the same project command layer as menu/toolbar/keyboard edits."
      },
      {
        name: "Freeze Selected Clip",
        does: "Renders the selected clip into a reusable audio/cache artifact.",
        useWhen: "Use before testing cached playback or preserving an expensive/generated clip as audio.",
        aiNote: "Check render cache and media pool after freezing."
      },
      {
        name: "Export Clip MIDI / Track MIDI",
        does: "Exports MIDI-capable clip or track material to a MIDI file.",
        useWhen: "Use for interchange with Chordsmith, another DAW, a notation tool, or game music tooling.",
        aiNote: "Audio clips do not contain MIDI events and cannot be exported this way."
      },
      {
        name: "Collapsible Inspector Sections",
        does: "Hides or shows selected clip and selected track inspector sections independently.",
        useWhen: "Use when the inspector gets busy and the user only needs one side of the context.",
        aiNote: "Collapse state is UI-only and should not affect project saves or exports."
      }
    ]
  },
  {
    title: "Chordsmith Editing",
    summary: "Edit generated sections and role patterns directly from the DAW.",
    entries: [
      {
        name: "Song Globals",
        does: "Edits BPM, key, scale, time signature, resolution and swing for the imported Chordsmith source.",
        useWhen: "Use for broad musical identity changes before detailed section edits.",
        aiNote: "Changing globals can affect playback/render timing and generated role interpretation."
      },
      {
        name: "Section Add And Length",
        does: "Adds Chordsmith sections and changes the bar length of existing sections.",
        useWhen: "Use to extend arrangement vocabulary before placing clips.",
        aiNote: "Confirm arrangement clips after section length changes."
      },
      {
        name: "Chord Grid",
        does: "Chooses chord symbols per section bar.",
        useWhen: "Use for harmonic changes that should drive generated roles.",
        aiNote: "Chord changes should stay musically coherent with bass/melody/guitar patterns."
      },
      {
        name: "Drum Steps And Presets",
        does: "Edits kick, snare, hat and branch drum steps, tuplets and presets.",
        useWhen: "Use for beat programming, groove variation and generated drum branching.",
        aiNote: "Branch generated drums when separate lane mixing/export control is needed."
      },
      {
        name: "Bass Steps And Presets",
        does: "Edits bass mode, presets, notes, visible accents, and selected-step H/S/T hold, slide, and tuplet metadata.",
        useWhen: "Use for bassline design or matching imported MIDI to generated bass behavior.",
        aiNote: "Auto bass notes can differ from manually placed notes; select the step before using H, S, or T articulation shortcuts."
      },
      {
        name: "Melody Steps",
        does: "Edits melody notes, holds, slides, tuplets, instrument and octave per melody track.",
        useWhen: "Use for lead motif and melodic variation inside a section.",
        aiNote: "Use step selection and page controls for long sections."
      },
      {
        name: "Guitar Steps And Presets",
        does: "Edits guitar enable state, tone, register, strum mode, volume and rhythm steps.",
        useWhen: "Use for rhythm-guitar arrangement and game-loop energy changes.",
        aiNote: "Guitar can be reactivated through Add Track if disabled/inactive."
      }
    ]
  },
  {
    title: "MIDI Editing",
    summary: "Edit imported or created MIDI clips with DAW-grade timing and controller tools.",
    entries: [
      {
        name: "Piano Roll",
        does: "Shows and edits selected MIDI clip notes, clip length, pitch, tick, duration, velocity and channel.",
        useWhen: "Use for precise note editing after import or manual MIDI creation.",
        aiNote: "Use MIDI metadata and tempo map summaries before making timing assumptions."
      },
      {
        name: "Quantize",
        does: "Moves MIDI note starts to a selected rhythmic grid.",
        useWhen: "Use to tighten note starts to 1/4, 1/8, 1/16 or 1/32 grids.",
        aiNote: "Start quantization is destructive to note timing within the project state but can be undone."
      },
      {
        name: "Quantize Note Lengths",
        does: "Snaps MIDI note durations to a selected rhythmic grid without moving note starts.",
        useWhen: "Use to clean imported or played-in MIDI notes whose starts are good but lengths are messy.",
        aiNote: "Length quantization preserves note starts, velocity, channel and expression data; still listen for overlaps or shortened sustains."
      },
      {
        name: "Swing And Groove",
        does: "Applies swing percentages or named groove templates to MIDI timing.",
        useWhen: "Use to add feel after basic timing is correct.",
        aiNote: "Record the chosen groove/swing in metadata so future edits are explainable."
      },
      {
        name: "Velocity And Pitch Transforms",
        does: "Applies bulk velocity shaping or pitch shifts to a MIDI clip.",
        useWhen: "Use for humanization, leveling, octave shifts or semitone adjustments.",
        aiNote: "Check pitch range after transforms, especially for bass and drums."
      },
      {
        name: "Controllers, Program, Bend, Aftertouch",
        does: "Adds, edits, duplicates and deletes MIDI CC, program-change, pitch-bend and aftertouch events. MIDI preview/render events interpret channel-matched CC7 volume, CC10 pan, CC11 expression, CC64 sustain and pitch-bend detune.",
        useWhen: "Use for expressive MIDI playback and interchange.",
        aiNote: "Imported controller data may be dense; keep edits bounded and test playback."
      },
      {
        name: "MIDI To Chordsmith Mapping",
        does: "Separates role-aware faithful transcription from creative Chordsmith arrangement, previews exact packing/resolution/event counts, preserves the raw MIDI reference by default, and can adopt tempo/meter data.",
        useWhen: "Use when a MIDI file should become editable Chordsmith-style source material.",
        aiNote: "Use faithful mode for exact selected roles and arrange mode for intentional generation, repetition or simplification. Never describe a simplified PCS1 progression as faithful."
      }
    ]
  },
  {
    title: "Audio Clip Editing",
    summary: "Edit imported or recorded audio clips nondestructively.",
    entries: [
      {
        name: "Audio Clip Properties",
        does: "Controls clip gain, fade in, fade out, source offset, duration, playback rate and pitch metadata.",
        useWhen: "Use to fit audio to the arrangement without editing the original file.",
        aiNote: "Source files are not modified; gain, fades, source offset, reverse and varispeed affect playback/export."
      },
      {
        name: "Audio Clip Automation",
        does: "Creates, draws, edits and live-records selected audio-clip gain, fade-in, fade-out and source-offset automation lanes.",
        useWhen: "Use when a clip needs level, fade or source-window changes over time without rewriting the source file.",
        aiNote: "Fade/source-offset lanes are evaluated into source-safe audio-region metadata; this is not pitch-preserving time-stretch."
      },
      {
        name: "Short Fades / Reset Fades",
        does: "Adds quick fade boundaries or clears existing fade settings.",
        useWhen: "Use to remove clicks or restore raw clip edges.",
        aiNote: "Fades are source-safe metadata."
      },
      {
        name: "Normalize",
        does: "Sets clip gain based on analyzed peak level.",
        useWhen: "Use to bring quiet imported audio closer to working level before mixing.",
        aiNote: "Normalization changes clip gain metadata, not source samples."
      },
      {
        name: "Transient Analysis And Warp Markers",
        does: "Analyzes transients and creates or clears metadata warp markers.",
        useWhen: "Use before timing/warp workflows or to inspect rhythmic audio.",
        aiNote: "Warp marker playback is still guarded; do not claim full elastic audio until smoke proves it."
      },
      {
        name: "Crossfade / Overlap Fade",
        does: "Creates fades between overlapping clips or at the left edge.",
        useWhen: "Use to smooth edits and comp transitions.",
        aiNote: "Inspect neighboring clips after crossfade operations."
      },
      {
        name: "Invert Phase / Reverse",
        does: "Applies phase inversion or reverse playback metadata to the clip.",
        useWhen: "Use for corrective phase checks or creative audio effects.",
        aiNote: "Verify export/render output for source-safe audio transforms."
      }
    ]
  },
  {
    title: "Recording And Takes",
    summary: "Capture installed-app live audio and manage take lanes.",
    entries: [
      {
        name: "Add Live Vocals / Live Instrument",
        does: "Creates a record-capable live audio track scaffold; input and mono/stereo channel mode are set on the mixer strip.",
        useWhen: "Use before recording vocals, guitar, keys or external instruments.",
        aiNote: "Recording is installed-app-only and should be smoke-tested against the packaged app."
      },
      {
        name: "Arm / Monitor",
        does: "Arms a record-capable track and optionally monitors its input.",
        useWhen: "Use to prepare one live track for capture and input metering.",
        aiNote: "Only one armed recording target is currently expected. Check input device and monitor route."
      },
      {
        name: "Record",
        does: "Captures audio to project-relative WAV media under project-media/recordings and places the take on the timeline, honoring explicit punch and take-lane mode when enabled.",
        useWhen: "Use after saving the project and selecting/arming the intended live track.",
        aiNote: "Confirm saved path, count-in, take placement, media pool item, and reopen persistence."
      },
      {
        name: "Punch And Take Mode",
        does: "Limits live recording placement to the visible punch range when Punch is enabled, and chooses whether the punch replaces overlapping material or creates a new active take lane.",
        useWhen: "Use before repeating a section over existing audio while preserving earlier passes for auditioning or comping.",
        aiNote: "Punch/take-lane recording is wired for installed-app audio capture and source-level Web MIDI input capture; real hardware MIDI smoke is still required before public claims."
      },
      {
        name: "MIDI Input Recording",
        does: "Records note on/off events from the first available Web MIDI input onto the selected MIDI track and commits the result as a normal MIDI take clip.",
        useWhen: "Use with a connected MIDI keyboard/controller when a performed part should become editable, saveable, exportable MIDI take-lane material.",
        aiNote: "Requires Web MIDI support in the runtime and a real MIDI input device. Automated tests cover fake-device capture; installed hardware smoke still needs a controller."
      },
      {
        name: "Manual Recording Latency Offset",
        does: "Stores a per-live-track millisecond placement offset for future recordings. Positive values place new takes earlier; negative values place them later, while the raw WAV media remains unchanged.",
        useWhen: "Use after loopback or listening smoke shows a consistent recorded-track timing offset.",
        aiNote: "This is visible and opt-in. It is not automatic device-latency compensation, and each placed take stores requested/applied offset metadata for audit."
      },
      {
        name: "Take Lanes",
        does: "Groups alternate recorded clips, shows a compact lane overview with active/muted/archived segment counts, activates one take or every clip in a take lane, archives/restores takes, and can comp from the playhead or active edit range.",
        useWhen: "Use to manage repeated passes without deleting source media.",
        aiNote: "Archive is not delete. This is a source-safe lane organizer over ordinary audio clips, not a full stacked waveform take editor yet."
      }
    ]
  },
  {
    title: "Mixer, Routing And FX",
    summary: "Balance tracks, route signals and apply built-in processing.",
    entries: [
      {
        name: "Mixer Strips",
        does: "Provides per-track volume, pan, mute, solo, arm, monitor, output and FX access.",
        useWhen: "Use for everyday mix balancing and routing checks.",
        aiNote: "Meters are live readouts. Do not infer final loudness solely from meter movement."
      },
      {
        name: "Inserts",
        does: "Shows selected-track FX chain and lets users add, bypass, automate or remove built-in FX.",
        useWhen: "Use for track-level sound shaping.",
        aiNote: "Third-party plugin hosting is future work; these are internal FX slots."
      },
      {
        name: "Pocket Pro EQ",
        does: "Provides EQ presets and band controls for supported EQ slots.",
        useWhen: "Use for corrective or tonal EQ on tracks, returns or drum lanes.",
        aiNote: "Check automation/parameter state after applying presets."
      },
      {
        name: "Bus And Return Tracks",
        does: "Adds grouped routing tracks and send-effect return tracks.",
        useWhen: "Use to organize submixes or shared effects.",
        aiNote: "Full send/return processing is still guarded; use current routing summaries and tests."
      },
      {
        name: "Folder Tracks",
        does: "Adds visible timeline organizer tracks that save/reopen, can be renamed, can hold child lanes, and can collapse or expand without processing audio.",
        useWhen: "Use to structure larger arrangements before folder-bus routing is implemented.",
        aiNote: "Folder Mute/Solo now controls child-lane audibility. Folders still do not process audio, own sends, host FX, inherit FX, or create export stems."
      },
      {
        name: "Sends",
        does: "Sets selected source-track send levels and pre/post-fader mode to return tracks.",
        useWhen: "Use for shared reverb/delay-style workflows and routing tests.",
        aiNote: "Verify routing warnings in Export Details/Diagnostics."
      },
      {
        name: "Drum Kit Lanes",
        does: "Mixes drum lanes separately, adds lane FX, gates lanes and manages branch drum rows.",
        useWhen: "Use when generated drums need kit-piece-level balance or export control.",
        aiNote: "Branching can create additional tracks; keep arrangement and export manifests clear."
      }
    ]
  },
  {
    title: "Automation",
    summary: "Create and edit time-varying parameter lanes.",
    entries: [
      {
        name: "Track Automation",
        does: "Creates and edits volume and pan automation for selected tracks.",
        useWhen: "Use for fades, dynamic mix rides and spatial movement.",
        aiNote: "Automation points are project data; use undoable commands and preserve sorted point order."
      },
      {
        name: "Send Automation",
        does: "Creates and edits automation for send levels into return tracks.",
        useWhen: "Use for timed effects throws or section-specific ambience.",
        aiNote: "Confirm target return track before adding send automation."
      },
      {
        name: "Clip Gain Automation",
        does: "Creates and edits gain automation tied to an individual clip.",
        useWhen: "Use for local clip-level rides without changing track volume.",
        aiNote: "Useful for vocal/instrument leveling before global mix moves."
      },
      {
        name: "FX Automation",
        does: "Creates and edits automation for numeric FX parameters.",
        useWhen: "Use for filter sweeps, EQ moves, dynamics changes and other parameter motion.",
        aiNote: "Not every FX parameter is exposed. Check the selected slot's parameter list."
      },
      {
        name: "Tempo And Meter Maps",
        does: "Represents project tempo and time-signature changes from MIDI or manual map edits.",
        useWhen: "Use for imported MIDI with tempo/meter changes or adaptive timing tests.",
        aiNote: "Tempo/meter changes affect rendering and bar/beat interpretation."
      }
    ]
  },
  {
    title: "Media, Cache And Portability",
    summary: "Track source files, decoded buffers, render cache and share safety.",
    entries: [
      {
        name: "Media Pool",
        does: "Lists imported audio/MIDI, source paths, duration, format metadata, runtime/cache status and placement actions.",
        useWhen: "Use to confirm imports, reload/relink missing media, and place audio clips.",
        aiNote: "Always inspect missing/unresolved/cache-only states before saying a project is portable."
      },
      {
        name: "Reload / Relink",
        does: "Reloads known source media or chooses a replacement file for missing media.",
        useWhen: "Use when reopening projects with external audio references.",
        aiNote: "Relink changes project references; preserve user intent and filenames where possible."
      },
      {
        name: "Collect Media Plan",
        does: "Exports a JSON plan for copying external media beside the saved project.",
        useWhen: "Use before sharing a project or embedding a source project in a game pack.",
        aiNote: "The plan is advisory unless a later command actually copies files."
      },
      {
        name: "Build Native Cache",
        does: "Renders generated/runtime audio into project-cache/native-audio WAV assets for reliable native playback.",
        useWhen: "Use before installed-app playback/reopen/export smoke when generated material should be cached.",
        aiNote: "Check native cache diagnostics for stale, invalidated or fallback regions."
      },
      {
        name: "Render Cache Summary",
        does: "Shows freeze, native stem, runtime audio and invalidated cache entries.",
        useWhen: "Use to understand what playback/export can reuse and what must rebuild.",
        aiNote: "Cache metadata can exist even when runtime cache is not active; confirm diagnostics."
      }
    ]
  },
  {
    title: "Export And Game Packs",
    summary: "Render audio/MIDI artifacts and game-ready ZIP packs.",
    entries: [
      {
        name: "Full WAV",
        does: "Renders the full mix to a WAV file using the full-song WAV profile.",
        useWhen: "Use for song previews, masters, smoke tests and interchange.",
        aiNote: "Unsupported codec profiles must fail clearly rather than producing mislabeled WAVs."
      },
      {
        name: "Full MIDI",
        does: "Exports the full project MIDI arrangement.",
        useWhen: "Use for notation, external DAW interchange, or Chordsmith/DJ-related workflows.",
        aiNote: "Audio-only clips will not become MIDI."
      },
      {
        name: "Stem WAV ZIP",
        does: "Exports one WAV per planned stem plus manifest metadata.",
        useWhen: "Use for mixing, game implementation, or external stem review.",
        aiNote: "Check stem count and manifest paths after export."
      },
      {
        name: "Section Loop ZIP",
        does: "Exports generated section loops plus manifest metadata.",
        useWhen: "Use for game loops, adaptive section testing and reusable cue packs.",
        aiNote: "Loop smoke matters before claiming gapless/compressed game formats."
      },
      {
        name: "Godot Game Pack",
        does: "Exports a WAV-based adaptive pack with source .pocketdaw, full mix, stems, loops, manifest, warnings and size summaries.",
        useWhen: "Use to bring rendered Pocket DAW audio into a Godot project without editing the Godot addon.",
        aiNote: "Treat Godot import as manual smoke in the separate Godot worktree."
      },
      {
        name: "Push Godot Pack",
        does: "Tries a local Godot receiver first, then saves the ZIP if no receiver is available.",
        useWhen: "Use when a Godot editor receiver is running and the user wants faster handoff.",
        aiNote: "Do not modify the Godot addon from DAW work unless explicitly requested."
      },
      {
        name: "Web Game Pack",
        does: "Exports a WAV-based web-game audio pack with manifest and deterministic paths.",
        useWhen: "Use for browser/game runtime integration testing.",
        aiNote: "Browser compressed-format support varies; WAV remains the trusted baseline."
      },
      {
        name: "Future Codecs",
        does: "Shows guarded profiles for future FLAC, Ogg Vorbis, MP3 and AIFF support without claiming they currently encode.",
        useWhen: "Use to plan export work and validate unsupported profiles.",
        aiNote: "Do not add .mpg. Treat MPEG audio requests as .mp3 after dependency/license review."
      }
    ]
  },
  {
    title: "View, Focus And Help",
    summary: "Reduce visual load and keep instructions discoverable.",
    entries: [
      {
        name: "Studio Rail",
        does: "Keeps persistent one-click navigation for Library, Project, Clips, Media, Mixer, MIDI, Audio, Export, Godot, Pocket handoff, Diagnostics and Help.",
        useWhen: "Use when the DAW surface feels busy and the user needs to jump between major work areas without hunting through menus.",
        aiNote: "Rail buttons reuse existing command surfaces; they should focus work areas, not create parallel add-on workflows."
      },
      {
        name: "Music Focus",
        does: "Keeps the timeline primary while tucking deeper edit, mix, media and game-export surfaces behind explicit buttons.",
        useWhen: "Use when writing or mixing a song.",
        aiNote: "Focus presets are layout filters only; they do not delete controls, media or project data."
      },
      {
        name: "Game Music Focus",
        does: "Keeps the timeline and game cues prominent, opens Export Details for game-pack work, and keeps the inspector tucked away.",
        useWhen: "Use when preparing adaptive music and game packs.",
        aiNote: "Layout filter only; WAV game packs remain the supported baseline and the Godot addon is not edited."
      },
      {
        name: "Collapsible UI Sections",
        does: "Minimizes timeline tools, inspector clip/track sections, lower dock and media pool. Collapsed timeline tools become a compact arrangement strip instead of a blank hidden panel.",
        useWhen: "Use to reduce UI density while keeping the recovery Show buttons visible.",
        aiNote: "Collapse state is UI-only and should not affect save/export behavior."
      },
      {
        name: "Tooltips",
        does: "Adds hover explanations to buttons and dense edit controls.",
        useWhen: "Use for quick reminders without opening the full guide.",
        aiNote: "If a button is added, update the tooltip map and this function guide."
      },
      {
        name: "Function Guide",
        does: "Opens the in-app guide summarizing user-facing DAW functions and AI-helper notes.",
        useWhen: "Use when a human or AI counterpart needs the purpose, use case and caution for a control.",
        aiNote: `The full Markdown reference lives at ${FUNCTION_REFERENCE_DOC}.`
      }
    ]
  },
  {
    title: "Diagnostics, Updates And MCP",
    summary: "Support testing, releases and AI-assisted operation.",
    entries: [
      {
        name: "About / Diagnostics",
        does: "Shows app version, runtime, project path, audio devices, updater state, handoff state, routing, media, cache and alpha caveats.",
        useWhen: "Use before bug reports, release smoke, or verifying the exact app/runtime being tested.",
        aiNote: "Diagnostics explain current state; exact public release truth remains release-status.json and CURRENT_RELEASE_STATUS.md."
      },
      {
        name: "Copy / Export Diagnostics",
        does: "Copies or downloads structured diagnostic data for bug reports and support.",
        useWhen: "Use when reporting an issue, comparing installed/dev behavior, or preserving smoke evidence.",
        aiNote: "Prefer exported JSON for durable evidence."
      },
      {
        name: "Check For Updates",
        does: "Checks the Tauri updater manifest and can download/install verified updater artifacts.",
        useWhen: "Use in installed-app alpha testing and public checkpoint smoke.",
        aiNote: "Do not claim update success until exact artifact/version/hash smoke is recorded."
      },
      {
        name: "AI / MCP Bridge",
        does: "Shows local MCP command/config snippets and controls the token-protected live app bridge.",
        useWhen: "Use when an AI counterpart should inspect/validate/edit projects or observe/control the running app.",
        aiNote: "File MCP works with closed projects; live MCP needs the running app and bearer token."
      },
      {
        name: "Live MCP Session Import",
        does: "Uses pocket_daw_live_import_session to scan a local folder or supported file through the running native app and return a reconciliation report.",
        useWhen: "Use for agent-driven stems/MIDI/Ableton/DAWproject/Mureka AAF import without driving native file pickers.",
        aiNote: "Large AAF folders can take several minutes. The tool has a five-minute timeout; verify report counts, tempo source, muted MIDI references, native playback status and save/reopen timing before claiming success."
      },
      {
        name: "Send Feedback",
        does: "Drafts an email with user notes and diagnostics when possible.",
        useWhen: "Use for tester reports, confusing behavior, playback issues and installed-app findings.",
        aiNote: "Keep user privacy in mind; diagnostics are for support and should be reviewed before sharing externally."
      }
    ]
  }
];

export const FUNCTION_ACTION_REFERENCE: FunctionActionReference[] = [
  {
    surface: "File And Project",
    control: "New Project",
    actionId: "new-project",
    does: "Creates a clean unsaved project in the current app session.",
    useWhen: "Use when starting a new composition, import test, or scratch project.",
    aiNote: "Check whether the current project has unsaved user work before triggering this."
  },
  {
    surface: "File And Project",
    control: "Open .pocketdaw",
    actionId: "open-project",
    shortcut: "Ctrl+O",
    does: "Opens a Pocket DAW project file through the native/browser picker.",
    useWhen: "Use to continue a saved project or smoke-test file association/open paths.",
    aiNote: "After open, verify project title, file path, track count, clips, and media pool status."
  },
  {
    surface: "File And Project",
    control: "Open File",
    actionId: "open-file",
    shortcut: "Ctrl+O",
    does: "Routes a chosen supported file to project, audio, or MIDI import handling.",
    useWhen: "Use when the user has a local file but may not know which import command applies.",
    aiNote: "Confirm the status message after import because project, audio and MIDI files take different paths."
  },
  {
    surface: "File And Project",
    control: "Save .pocketdaw",
    actionId: "save-project",
    shortcut: "Ctrl+S",
    does: "Writes the current project to the known save path.",
    useWhen: "Use after meaningful edits and before recording, cache building, or release smoke.",
    aiNote: "If the project has no path, this must fall through to Save As in the UI."
  },
  {
    surface: "File And Project",
    control: "Save As",
    actionId: "save-project-as",
    does: "Prompts for a destination and saves the project as a new .pocketdaw file.",
    useWhen: "Use to create a durable path, duplicate a session, or prepare project-relative media folders.",
    aiNote: "A real save path is required before reliable live recording and media collection."
  },
  {
    surface: "File And Project",
    control: "File Panel",
    actionId: "file-window-open",
    does: "Opens the combined project, import, export, media, and cache command panel.",
    useWhen: "Use when a user needs file operations without hunting through menus.",
    aiNote: "This is a navigation surface; it should not mutate project data by itself."
  },
  {
    surface: "File And Project",
    control: "Close File Panel",
    actionId: "file-window-close",
    does: "Closes the File panel.",
    useWhen: "Use after file/import/export commands are no longer needed.",
    aiNote: "Closing panels is UI-only."
  },
  {
    surface: "File And Project",
    control: "Load Demo Copy",
    actionId: "load-demo",
    does: "Loads an editable demo project copy for quick playback and experimentation.",
    useWhen: "Use for first-run checks or when the user wants a working project immediately.",
    aiNote: "Treat it as editable user state once loaded; do not reset it silently."
  },
  {
    surface: "File And Project",
    control: "Reload Demo Template",
    actionId: "reset-demo-template",
    does: "Discards the editable demo copy and reloads the built-in demo template.",
    useWhen: "Use when the user wants to return to a known demo baseline.",
    aiNote: "This can discard demo edits, so it should be intentional."
  },
  {
    surface: "Import",
    control: "Import Paste",
    actionId: "import-text",
    does: "Imports pasted PCS1 share codes, Chordsmith JSON, Pocket DJ sessions, .pocketdaw JSON, or handoff text.",
    useWhen: "Use for fast handoff from another Pocket Audio tool or text-based import.",
    aiNote: "For Pocket DJ imports, validate both the Chordsmith source ref and the preserved pocket-dj source ref; DJ state is metadata until a future explicit apply/export path uses it."
  },
  {
    surface: "Import",
    control: "Import Chordsmith",
    actionId: "import-focus",
    does: "Opens the import/file area and focuses the user toward Chordsmith or text import.",
    useWhen: "Use from the quick-start area when a user wants to bring Chordsmith material in.",
    aiNote: "This opens the surface; the actual import happens through Import Paste or Open File."
  },
  {
    surface: "Import",
    control: "Import Audio",
    actionId: "import-audio",
    does: "Imports an audio file, decodes/cache-prepares it, and adds it to the media pool.",
    useWhen: "Use for loops, vocals, live instrument references, stems, or audio clips.",
    aiNote: "Check decoded format, sample rate, channels, duration, cache path, and missing/unloaded state."
  },
  {
    surface: "Import",
    control: "Import MIDI",
    actionId: "import-midi",
    does: "Imports a .mid or .midi file into editable MIDI media and timeline clips.",
    useWhen: "Use for external melodies, drums, basslines, chord sketches, and MIDI interchange.",
    aiNote: "Review MIDI placement mode, tempo map, meter map, channel splits, and resulting clip count."
  },
  {
    surface: "Import",
    control: "Import Session Folder",
    actionId: "import-daw-session-folder",
    does: "Reconciles stems, companion MIDI, Ableton Live, DAWproject and Mureka AAF exports from one folder into a clean Pocket DAW session.",
    useWhen: "Use when a song was exported in several DAW interchange formats or when stems and MIDI companions need to stay aligned.",
    aiNote: "Audio stems are audible at the safe import gain, editable MIDI references are muted by default, duplicate audio is removed by PCM checksum, and the most complete companion MIDI tempo map is adopted automatically."
  },
  {
    surface: "Import",
    control: "Import Session Files",
    actionId: "import-daw-session-files",
    does: "Imports selected DAW archives or interchange files through the same reconciled session pipeline.",
    useWhen: "Use for one or more .zip, .dawproject, .als, .aaf, .wav, .mid or .midi files when a whole folder is not desired.",
    aiNote: "Standalone Ableton and DAWproject note tracks remain muted if their fixed tempo metadata disagrees with audio; add the companion MIDI tempo-map files for exact alignment."
  },
  {
    surface: "Import",
    control: "MIDI Placement Mode",
    selector: "midiImportPlacementMode",
    does: "Chooses whether imported MIDI lands as one clip, source-track clips, channel clips, or drum-channel splits.",
    useWhen: "Use before importing multi-track or multi-channel MIDI.",
    aiNote: "Per-channel or drum split often gives AI helpers clearer structure for later editing."
  },
  {
    surface: "Transport",
    control: "Play",
    actionId: "play",
    shortcut: "Space",
    does: "Starts playback from the current playhead position.",
    useWhen: "Use to audition arrangement, mix, MIDI, generated roles, and cached/native playback.",
    aiNote: "Remote agents should pair this with MCP status or user-observed audio because they may not hear output."
  },
  {
    surface: "Transport",
    control: "Pause",
    actionId: "pause",
    shortcut: "Space",
    does: "Pauses playback without moving the playhead back to the start.",
    useWhen: "Use to stop auditioning while preserving the current listening position.",
    aiNote: "Pause is transport state only; it should not change project data."
  },
  {
    surface: "Transport",
    control: "Stop",
    actionId: "stop",
    does: "Stops playback and live metronome activity.",
    useWhen: "Use before export, setup changes, or switching contexts.",
    aiNote: "If preview notes remain stuck, use MIDI Panic instead of repeated Stop."
  },
  {
    surface: "Transport",
    control: "Restart",
    actionId: "restart",
    does: "Starts playback again from the beginning of the project.",
    useWhen: "Use for full-arrangement listening passes.",
    aiNote: "Useful before deterministic listen or render smoke."
  },
  {
    surface: "Transport",
    control: "Bar 1",
    actionId: "seek-start",
    shortcut: "Home",
    does: "Moves the playhead back to bar 1.",
    useWhen: "Use to reset position without changing loop settings.",
    aiNote: "This is a safe UI/navigation action."
  },
  {
    surface: "Transport",
    control: "Record",
    actionId: "record-toggle",
    does: "Starts or stops live recording on the armed record-capable track.",
    useWhen: "Use after saving the project, selecting an input, and arming one live track.",
    aiNote: "Installed-app smoke is required; remote agents should not claim audio quality without a human listen."
  },
  {
    surface: "Transport",
    control: "Metronome",
    actionId: "metronome-toggle",
    does: "Turns metronome/count-in behavior on or off.",
    useWhen: "Use for timing practice and live recording setup.",
    aiNote: "Confirm count-in behavior before judging recorded clip alignment."
  },
  {
    surface: "Transport",
    control: "MIDI Panic",
    actionId: "midi-panic",
    does: "Stops preview playback and clears active or stuck MIDI notes.",
    useWhen: "Use after interrupted playback, imported MIDI auditioning, or stuck synth previews.",
    aiNote: "Safety command only; it should not mutate project data."
  },
  {
    surface: "Timeline Editing",
    control: "Undo",
    actionId: "undo",
    shortcut: "Ctrl+Z",
    does: "Reverts the last undoable project edit.",
    useWhen: "Use after accidental or exploratory edits.",
    aiNote: "Prefer undoable commands for AI-driven edits so the user can recover quickly."
  },
  {
    surface: "Timeline Editing",
    control: "Redo",
    actionId: "redo",
    shortcut: "Ctrl+Y",
    does: "Restores the last undone edit.",
    useWhen: "Use after undoing too far.",
    aiNote: "Redo depends on undo stack state and may disappear after a new edit."
  },
  {
    surface: "Timeline Editing",
    control: "Move Clip Left",
    actionId: "clip-left",
    shortcut: "ArrowLeft",
    does: "Moves the selected clip, or every clip in the current multi-selection, earlier by the current snap step.",
    useWhen: "Use to adjust arrangement timing.",
    aiNote: "Check snap mode first; bar, beat and off-grid states imply different movement. Ctrl/Cmd/Shift-select clips before moving a group."
  },
  {
    surface: "Timeline Editing",
    control: "Move Clip Right",
    actionId: "clip-right",
    shortcut: "ArrowRight",
    does: "Moves the selected clip, or every clip in the current multi-selection, later by the current snap step.",
    useWhen: "Use to adjust arrangement timing.",
    aiNote: "Check for overlaps and downstream section timing after moving. Ctrl/Cmd/Shift-select clips before moving a group."
  },
  {
    surface: "Timeline Editing",
    control: "Cut Clip",
    actionId: "clip-cut",
    shortcut: "Ctrl+X",
    does: "Copies the selected clip or selected clip group to the clipboard and removes it from the timeline.",
    useWhen: "Use to move one clip or an arranged group elsewhere while keeping a clipboard copy.",
    aiNote: "This is undoable. Group cuts preserve relative timing for paste. Verify paste target before moving user material."
  },
  {
    surface: "Timeline Editing",
    control: "Copy Clip",
    actionId: "clip-copy",
    shortcut: "Ctrl+C",
    does: "Copies the selected whole clip or selected clip group to the clipboard without changing the timeline.",
    useWhen: "Use before Paste or when repeating single-clip or multi-track material.",
    aiNote: "Clipboard state is runtime UI state, not a durable project artifact."
  },
  {
    surface: "Timeline Editing",
    control: "Paste Clip",
    actionId: "clip-paste",
    shortcut: "Ctrl+V",
    does: "Pastes the current clip or clip-group clipboard at the cursor/playhead context.",
    useWhen: "Use after Cut Clip, Copy Clip, Copy Range, or Cut Range.",
    aiNote: "Group paste keeps the copied clips' relative bar spacing. Paste can fail clearly if the clipboard is empty."
  },
  {
    surface: "Timeline Editing",
    control: "Duplicate Clip",
    actionId: "clip-duplicate",
    shortcut: "D",
    does: "Creates a copy of the selected clip after itself, or a selected clip group after the selected group's span.",
    useWhen: "Use to repeat phrases, loops, sections, imported clips, or multi-track MIDI sections.",
    aiNote: "Duplicate keeps source-safe metadata; inspect overlap if clip lengths are unusual."
  },
  {
    surface: "Timeline Editing",
    control: "Split Clip",
    actionId: "clip-split",
    shortcut: "X",
    does: "Splits the selected clip at the playhead.",
    useWhen: "Use before trimming, muting, moving, or exporting a subsection.",
    aiNote: "Prefer split over destructive source editing."
  },
  {
    surface: "Recording And Takes",
    control: "Make Takes",
    actionId: "create-take-lane-group",
    does: "Groups the selected overlapping audio or MIDI clips on one track as alternate take lanes, preserving them as normal timeline clips with durable take metadata.",
    useWhen: "Use after importing or editing alternate audio or MIDI passes that should be auditioned, archived, comped, saved and exported as a take group.",
    aiNote: "Requires at least two selected clips of one type on one track. For live automation use create_take_lane_group with explicit clipIds."
  },
  {
    surface: "Recording And Takes",
    control: "MIDI Take",
    actionId: "record-midi-take",
    does: "Creates an editable MIDI take on the selected MIDI track at the playhead, or trims it to the active punch range when punch recording is enabled.",
    useWhen: "Use to start a MIDI take-lane pass without importing a MIDI file first, then edit or comp the resulting piano-roll clip.",
    aiNote: "This creates a MIDI take clip through the same undoable placement path used by live MCP. Use MIDI Rec for Web MIDI input capture."
  },
  {
    surface: "Recording And Takes",
    control: "MIDI Input Recording",
    actionId: "midi-record-toggle",
    does: "Starts or stops Web MIDI input capture from the first available MIDI input, then commits captured note events as a MIDI recording take on the selected MIDI track.",
    useWhen: "Use when a connected MIDI controller should record an editable take that can join take lanes, save/reopen and export through the normal MIDI path.",
    aiNote: "Requires a Web MIDI-capable runtime and an attached input. Source tests use a fake device; real installed hardware smoke is still a release gate."
  },
  {
    surface: "Timeline Editing",
    control: "Delete Clip",
    actionId: "clip-delete",
    shortcut: "Delete",
    does: "Removes the selected clip or selected clip group from the timeline.",
    useWhen: "Use when material is no longer needed in the arrangement.",
    aiNote: "Prefer Mute Clip when the user may want to audition alternatives."
  },
  {
    surface: "Timeline Editing",
    control: "Mute Clip",
    actionId: "clip-mute",
    does: "Silences or unsilences the selected clip or selected clip group without removing it.",
    useWhen: "Use to audition alternate arrangements safely.",
    aiNote: "Muted clips still exist and should be considered in arrangement reviews."
  },
  {
    surface: "Timeline Editing",
    control: "Trim Start Left",
    actionId: "trim-start-left",
    does: "Moves the selected clip start earlier by one snap step.",
    useWhen: "Use to reveal earlier source material or extend a clip's entry.",
    aiNote: "Check source offset and available source duration for audio clips."
  },
  {
    surface: "Timeline Editing",
    control: "Trim Start Right",
    actionId: "trim-start-right",
    does: "Moves the selected clip start later by one snap step.",
    useWhen: "Use to tighten clip entry timing.",
    aiNote: "For audio, this should adjust metadata rather than modifying source files."
  },
  {
    surface: "Timeline Editing",
    control: "Trim End Left",
    actionId: "trim-end-left",
    does: "Moves the selected clip end earlier by one snap step.",
    useWhen: "Use to shorten a clip or remove tail material.",
    aiNote: "Check that shortened clips still leave musically useful boundaries."
  },
  {
    surface: "Timeline Editing",
    control: "Trim End Right",
    actionId: "trim-end-right",
    does: "Moves the selected clip end later by one snap step.",
    useWhen: "Use to extend a clip or reveal later source material.",
    aiNote: "For generated and MIDI clips, confirm repeated/extended material behaves as intended."
  },
  {
    surface: "Range Editing",
    control: "Range Clip",
    actionId: "range-selected",
    does: "Sets the active edit range to the selected clip boundaries.",
    useWhen: "Use before range copy, cut, split, crop, delete, ripple, or range loop.",
    aiNote: "Requires a selected clip. Verify range start/end before applying destructive range edits."
  },
  {
    surface: "Range Editing",
    control: "Range Loop",
    actionId: "range-loop",
    does: "Sets the active edit range to the current playback loop boundaries.",
    useWhen: "Use when an existing loop should become the range for copy, cut, split, crop, delete, or ripple edits.",
    aiNote: "This command reads the loop and writes the edit range; it does not move or enable the playback loop."
  },
  {
    surface: "Range Editing",
    control: "Copy Range",
    actionId: "range-copy",
    shortcut: "Ctrl+Shift+C",
    does: "Copies the selected clip material inside the active edit range to the normal clip clipboard.",
    useWhen: "Use to reuse only part of a clip or generated section.",
    aiNote: "This is a selected-clip clipboard operation, not an all-track copy."
  },
  {
    surface: "Range Editing",
    control: "Cut Range",
    actionId: "range-cut",
    shortcut: "Ctrl+Shift+X",
    does: "Copies the selected clip material inside the active edit range, then removes that material from the clip.",
    useWhen: "Use to move only part of a clip elsewhere.",
    aiNote: "This can split/shorten material; verify the active range and selected clip first."
  },
  {
    surface: "Range Editing",
    control: "Split Range",
    actionId: "range-split",
    does: "Splits affected clips at the active range boundaries.",
    useWhen: "Use before crop, mute, delete, or movement of a bounded range.",
    aiNote: "Split Range is usually safer than deleting directly because it exposes boundaries first."
  },
  {
    surface: "Range Editing",
    control: "Crop Range",
    actionId: "range-crop",
    does: "Keeps only the selected clip material inside the active range.",
    useWhen: "Use when the range is the only part of the selected clip that should remain.",
    aiNote: "This removes outside material from the timeline clip but not from source files."
  },
  {
    surface: "Range Editing",
    control: "Delete Range",
    actionId: "range-delete",
    does: "Deletes material inside the active range without closing the timeline gap.",
    useWhen: "Use to silence or remove a bounded section while preserving later timing.",
    aiNote: "Use Ripple Delete only when later clips should move earlier."
  },
  {
    surface: "Range Editing",
    control: "Ripple Delete",
    actionId: "range-ripple-delete",
    does: "Deletes the active range on selected/affected tracks and closes the gap.",
    useWhen: "Use for arrangement edits where later material on those tracks should move earlier.",
    aiNote: "Ripple edits affect timing. Confirm scope before use."
  },
  {
    surface: "Range Editing",
    control: "Ripple All",
    actionId: "range-ripple-all",
    does: "Deletes the active range and closes the gap across all tracks.",
    useWhen: "Use for removing a song section globally.",
    aiNote: "Broad timing change. Prefer user confirmation or careful review."
  },
  {
    surface: "Range Editing",
    control: "Clear Range",
    actionId: "range-clear",
    does: "Clears the active edit range selection.",
    useWhen: "Use when range editing is complete or the range is wrong.",
    aiNote: "UI/project selection state only."
  },
  {
    surface: "Range Editing",
    control: "Range Start / End Fields",
    selector: "rangeStart / rangeEnd",
    does: "Sets the explicit bar range used by range copy, cut, split, crop, delete, ripple, and loop commands.",
    useWhen: "Use when the range should be exact rather than inferred from the selected clip.",
    aiNote: "Validate start is before end and that the selected command reads the intended range."
  },
  {
    surface: "Loop And Markers",
    control: "Toggle Loop",
    actionId: "toggle-loop",
    shortcut: "L",
    does: "Turns the existing loop region on or off.",
    useWhen: "Use to audition repeated ranges without changing the range boundaries.",
    aiNote: "Loop state affects playback, not exported source unless export explicitly reads it."
  },
  {
    surface: "Loop And Markers",
    control: "Loop Selected",
    actionId: "loop-selected",
    shortcut: "P",
    does: "Sets the loop region to the selected clip.",
    useWhen: "Use for focused playback of one clip.",
    aiNote: "Requires a selected clip."
  },
  {
    surface: "Loop And Markers",
    control: "Clear Loop",
    actionId: "loop-clear",
    does: "Disables/clears the current loop region.",
    useWhen: "Use before full-song playback or export checks.",
    aiNote: "Playback state only."
  },
  {
    surface: "Loop And Markers",
    control: "Add Marker",
    actionId: "marker-add",
    shortcut: "G",
    does: "Adds a timeline marker at the playhead.",
    useWhen: "Use for arrangement notes, navigation, and smoke-test anchors.",
    aiNote: "Markers are project data and should be named clearly when used as documentation."
  },
  {
    surface: "Loop And Markers",
    control: "Add Game Cue",
    actionId: "game-state-marker-add",
    does: "Adds a game-state cue marker at the playhead using the selected cue type.",
    useWhen: "Use for adaptive game music planning and Godot/Web pack metadata.",
    aiNote: "Game cues are hidden in Music focus but remain project data."
  },
  {
    surface: "Loop And Markers",
    control: "Game Cue Type",
    selector: "gameStateMarker",
    does: "Chooses the adaptive game-state label used by the next Game Cue marker.",
    useWhen: "Use before adding menu, explore, combat, stinger, victory, or similar game-state cues.",
    aiNote: "Set the cue type before adding the marker; changing the selector alone does not edit existing markers."
  },
  {
    surface: "Loop And Markers",
    control: "Rename Marker",
    selector: "data-marker-rename",
    does: "Renames an existing timeline marker or game cue.",
    useWhen: "Use to make arrangement notes and adaptive cues readable to humans and tools.",
    aiNote: "Names are project data. Preserve game-state meaning when renaming cues."
  },
  {
    surface: "Loop And Markers",
    control: "Delete Marker",
    selector: "data-marker-delete",
    does: "Deletes an existing timeline marker or game cue.",
    useWhen: "Use when a marker no longer describes the arrangement.",
    aiNote: "Deleting game cues can affect game-pack metadata; confirm intent before broad cleanup."
  },
  {
    surface: "View And Focus",
    control: "Studio Rail Navigation",
    selector: "studio-rail / data-studio-rail-target",
    does: "Provides persistent left-rail shortcuts to Library, Project, Clips, Media, Mixer, MIDI, Audio, Export, Godot, Pocket handoff, Diagnostics and Help.",
    useWhen: "Use to move between major DAW work areas without opening menus or adding more toolbar clutter.",
    aiNote: "Rail navigation must reuse the normal action/command path so behavior stays deterministic."
  },
  {
    surface: "View And Focus",
    control: "Studio Rail Clips",
    actionId: "studio-focus-timeline",
    does: "Closes transient panels and scrolls back to the timeline clip-editing surface.",
    useWhen: "Use when the user needs to return to clip arrangement from a modal, lower panel or help surface.",
    aiNote: "Focus action only; it does not edit clips or project data."
  },
  {
    surface: "View And Focus",
    control: "Studio Rail Godot",
    actionId: "studio-focus-godot",
    does: "Switches to Game music focus, selects Export Details and scrolls to the Godot/web game-pack export controls.",
    useWhen: "Use when preparing adaptive music or checking game-pack export state.",
    aiNote: "WAV remains the supported game-pack baseline; this should not edit the Godot addon."
  },
  {
    surface: "View And Focus",
    control: "Music Focus",
    actionId: "preset-music",
    does: "Keeps the timeline primary while tucking deeper edit, mix, media and game-export surfaces behind explicit buttons.",
    useWhen: "Use while writing, arranging, importing, or mixing a song.",
    aiNote: "Layout filter only; it does not remove project data, media or hidden features."
  },
  {
    surface: "View And Focus",
    control: "Game Music Focus",
    actionId: "preset-game-music",
    does: "Switches to Game music focus, keeps timeline/game cues prominent, opens Export Details, and keeps the inspector tucked away.",
    useWhen: "Use while preparing adaptive game music packs.",
    aiNote: "Layout filter only; WAV game packs remain the supported baseline and this does not edit the Godot addon."
  },
  {
    surface: "View And Focus",
    control: "Toggle UI Section",
    actionId: "toggle-ui-section",
    does: "Shows or hides the section named by the button's data-ui-section value.",
    useWhen: "Use to reduce UI density without changing project data.",
    aiNote: "Collapse state is UI-only and should not affect save/export."
  },
  {
    surface: "View And Focus",
    control: "Toggle Inspector",
    actionId: "toggle-inspector",
    does: "Shows or hides the right-side selected clip/track inspector.",
    useWhen: "Use when the timeline needs more width or the current edits do not need inspector context.",
    aiNote: "UI-only state; selected clip/track still exists."
  },
  {
    surface: "View And Focus",
    control: "Zoom In",
    actionId: "zoom-in",
    shortcut: "+",
    does: "Increases timeline pixels per bar.",
    useWhen: "Use for precise clip or step editing.",
    aiNote: "View-only setting."
  },
  {
    surface: "View And Focus",
    control: "Zoom Out",
    actionId: "zoom-out",
    shortcut: "-",
    does: "Decreases timeline pixels per bar.",
    useWhen: "Use to see more of the song structure at once.",
    aiNote: "View-only setting."
  },
  {
    surface: "View And Focus",
    control: "Snap Mode",
    selector: "snapMode",
    does: "Sets the rhythmic grid used by clip moves, trims, and timeline edit commands.",
    useWhen: "Use before precise clip editing so movements land on the intended bar or beat division.",
    aiNote: "Check snap mode before repeated move/trim commands; it changes edit distance."
  },
  {
    surface: "View And Focus",
    control: "Timeline Zoom Slider",
    selector: "timelineZoom / data-zoom-readout",
    does: "Sets and displays the timeline zoom level.",
    useWhen: "Use when visual density needs to change without altering the project.",
    aiNote: "View-only state; do not treat zoom changes as musical edits."
  },
  ...["mixer", "inserts", "sends", "automation", "piano-roll", "audio-editor", "export-details"].map((tab) => ({
    surface: "Lower Dock",
    control: `Lower Dock: ${tab.replace(/-/g, " ")}`,
    actionId: `lower-dock-${tab}`,
    does: `Switches the lower dock to the ${tab.replace(/-/g, " ")} view.`,
    useWhen: "Use to move between mixer, routing, automation, MIDI, audio, and export detail workflows.",
    aiNote: "Dock selection is UI-only; edits happen through controls inside the selected dock."
  })),
  {
    surface: "Track And Routing",
    control: "Add Track",
    actionId: "add-track-open",
    shortcut: "T",
    does: "Opens the Library / Add Track panel grouped by Audio Recording, Instrument / MIDI, Organization, Chordsmith Roles, and Routing.",
    useWhen: "Use to add live audio, MIDI, generated role, folder, bus, or return tracks without hunting through the busier DAW surface.",
    aiNote: "Opening the panel is UI-only; choose a track kind to mutate the project. Input device and mono/stereo mode are set on record-capable mixer strips after creation."
  },
  {
    surface: "Track And Routing",
    control: "Close Add Track",
    actionId: "add-track-close",
    does: "Closes the add-track panel.",
    useWhen: "Use after selecting or cancelling track creation.",
    aiNote: "UI-only."
  },
  {
    surface: "Track And Routing",
    control: "Add Live Vocals",
    selector: "data-add-track-kind:live-vocals",
    does: "Adds a record-capable audio track intended for vocal recording.",
    useWhen: "Use before recording vocals in the installed app.",
    aiNote: "Recording needs a saved project, input selection, mono/stereo channel mode, arm state, and human audio smoke."
  },
  {
    surface: "Track And Routing",
    control: "Add Live Instrument",
    selector: "data-add-track-kind:live-instrument",
    does: "Adds a record-capable audio track intended for external instruments.",
    useWhen: "Use before recording guitar, keys, microphone, or line input.",
    aiNote: "Avoid monitor feedback; check input/output devices and mono/stereo channel mode."
  },
  {
    surface: "Track And Routing",
    control: "Add MIDI Instrument",
    selector: "data-add-track-kind:midi-instrument",
    does: "Adds an empty MIDI instrument track for piano-roll clips.",
    useWhen: "Use when composing MIDI directly inside the DAW.",
    aiNote: "Add a MIDI clip next before editing notes."
  },
  {
    surface: "Track And Routing",
    control: "Add Folder Track",
    selector: "data-add-track-kind:folder",
    does: "Adds a timeline organizer track that can be renamed and saved without processing audio.",
    useWhen: "Use when a growing arrangement needs visible structure before folder-bus routing exists.",
    aiNote: "Folder Mute/Solo controls child-lane audibility. Folder routing, sends, FX and export grouping are still future work."
  },
  {
    surface: "Track And Routing",
    control: "Assign Track Folder",
    selector: "data-track-folder",
    does: "Moves a generated, audio, or MIDI timeline lane into or out of an organizational folder.",
    useWhen: "Use to group lanes visually, collapse busy timelines, and let the parent folder Mute/Solo the assigned child lanes.",
    aiNote: "This is group-control metadata only. Do not infer bus routing, sends, FX inheritance, or export grouping from the folder assignment yet."
  },
  {
    surface: "Track And Routing",
    control: "Toggle Folder Track",
    selector: "data-folder-toggle",
    does: "Collapses or expands a folder track's child timeline lanes.",
    useWhen: "Use when the timeline is busy and the grouped lanes are not being edited directly.",
    aiNote: "Collapse only hides child rows from the timeline view. It does not mute, disable, route, remove, or exclude child tracks from playback/export."
  },
  {
    surface: "Track And Routing",
    control: "Enable Chordsmith Role Track",
    selector: "data-add-track-kind:chordsmith-*",
    does: "Selects or reactivates generated Chordsmith drums, bass, chords, melody, or guitar tracks.",
    useWhen: "Use when a generated role is inactive or needs direct editing.",
    aiNote: "Generated roles should preserve Chordsmith as the musical source of truth."
  },
  {
    surface: "Track And Routing",
    control: "Add Bus Track",
    actionId: "add-bus-track",
    does: "Adds a bus track for grouped routing.",
    useWhen: "Use when multiple tracks should route through a shared submix.",
    aiNote: "Check routing warnings and export summaries after adding buses."
  },
  {
    surface: "Track And Routing",
    control: "Add Return Track",
    actionId: "add-return-track",
    does: "Adds a return track scaffold for send effects.",
    useWhen: "Use for shared effect-return workflows such as ambience or delay.",
    aiNote: "Send/return behavior is guarded; verify routing in Export Details."
  },
  {
    surface: "Track And Routing",
    control: "Track Rename",
    selector: "data-track-rename",
    does: "Renames the selected timeline or mixer track.",
    useWhen: "Use for clearer project organization and support notes.",
    aiNote: "Preserve role meaning in names so export stems stay understandable."
  },
  {
    surface: "Track And Routing",
    control: "Mute Track",
    selector: "data-mute-track",
    shortcut: "M",
    does: "Silences a track without deleting clips or routing; on folder tracks it mutes assigned child lanes as a group.",
    useWhen: "Use to audition arrangements, isolate problems, or temporarily silence a folder group.",
    aiNote: "Mute affects playback/render, including folder child lanes, so inspect it before judging missing audio."
  },
  {
    surface: "Track And Routing",
    control: "Solo Track",
    selector: "data-solo-track",
    shortcut: "S",
    does: "Auditions one or more soloed tracks while suppressing non-soloed tracks; on folder tracks it solos assigned child lanes as a group.",
    useWhen: "Use for focused mix checks or to audition a folder group.",
    aiNote: "Solo state can make healthy tracks seem silent; folder solo intentionally keeps child lanes audible and suppresses unrelated tracks."
  },
  {
    surface: "Track And Routing",
    control: "Arm Track",
    selector: "data-arm-track",
    shortcut: "R",
    does: "Arms or disarms a record-capable track for recording.",
    useWhen: "Use before pressing Record.",
    aiNote: "Only record-capable tracks expose arm controls."
  },
  {
    surface: "Track And Routing",
    control: "Monitor Track",
    selector: "data-monitor-track",
    does: "Toggles live input monitoring for a record-capable track.",
    useWhen: "Use to hear an input while preparing or recording.",
    aiNote: "Warn about feedback risk when speakers are active."
  },
  {
    surface: "Track And Routing",
    control: "Track Volume And Pan",
    selector: "data-volume / data-pan",
    does: "Sets track level and stereo position.",
    useWhen: "Use for core mixing.",
    aiNote: "These are mix parameters; check automation if a value seems to move during playback."
  },
  {
    surface: "Track And Routing",
    control: "Track Input",
    selector: "data-track-input",
    does: "Selects the recording input device or input source for a record-capable track.",
    useWhen: "Use before arming and recording vocals or instruments.",
    aiNote: "Device availability is runtime-specific; record the selected device in smoke notes."
  },
  {
    surface: "Track And Routing",
    control: "Recording Channel Mode",
    selector: "data-track-record-channel-mode",
    does: "Chooses how an input is captured, such as mono/stereo or channel-specific recording modes supported by the runtime.",
    useWhen: "Use when matching a microphone, instrument input, or interface channel to the track.",
    aiNote: "Channel mode affects recorded media shape; verify after a recording smoke pass."
  },
  {
    surface: "Track And Routing",
    control: "Recording Input Channel",
    selector: "data-track-record-channel",
    does: "Chooses the explicit mono input channel or stereo input pair stored in the track's recording assignment metadata.",
    useWhen: "Use when a multi-input interface needs vocals, guitars, keys or mixers assigned to known hardware inputs before recording.",
    aiNote: "Current native recording alpha only captures Mono Ch 1 or Stereo Ch 1-2; other assignments are preflighted and blocked until channel routing lands."
  },
  {
    surface: "Track And Routing",
    control: "Recording Latency Offset",
    selector: "data-track-recording-latency",
    does: "Sets a manual millisecond take-placement offset on a record-capable track. Positive values place new recordings earlier; negative values place them later.",
    useWhen: "Use after calibration or repeat listening shows that new takes land consistently late or early.",
    aiNote: "This is per-track project metadata and affects future placed recordings only. It does not rewrite raw media or claim automatic latency compensation."
  },
  {
    surface: "Track And Routing",
    control: "Track Output Routing",
    selector: "data-track-output",
    does: "Routes a track to master or an available bus destination.",
    useWhen: "Use when grouping tracks, testing buses, or preparing stem/routing export behavior.",
    aiNote: "Routing affects playback and render. Check diagnostics/export warnings after changes."
  },
  {
    surface: "Audio Settings",
    control: "Audio Settings",
    actionId: "audio-settings-open",
    does: "Opens device and recording settings.",
    useWhen: "Use before live recording or input/output smoke.",
    aiNote: "Installed app device lists may differ from browser preview."
  },
  {
    surface: "Audio Settings",
    control: "Close Audio Settings",
    actionId: "audio-settings-close",
    does: "Closes the audio settings panel.",
    useWhen: "Use after checking or refreshing devices.",
    aiNote: "UI-only."
  },
  {
    surface: "Audio Settings",
    control: "Refresh Devices",
    actionId: "audio-refresh",
    does: "Refreshes the app's known audio input/output device list.",
    useWhen: "Use when devices have changed or recording input is missing.",
    aiNote: "Device probing can be runtime-specific; record the app/runtime when reporting results."
  },
  {
    surface: "Media Pool And Cache",
    control: "Show Media Pool",
    actionId: "media-pool-focus",
    does: "Scrolls/focuses the media pool.",
    useWhen: "Use to inspect imports, cache status, missing media, and placement options.",
    aiNote: "Media pool status is central evidence for portability and import reliability."
  },
  {
    surface: "Media Pool And Cache",
    control: "Place On Timeline",
    selector: "data-place-audio",
    does: "Places an imported audio media item as a timeline clip.",
    useWhen: "Use after importing audio that should be arranged or edited.",
    aiNote: "Check selected/target track and clip placement after use."
  },
  {
    surface: "Media Pool And Cache",
    control: "Reload Media",
    selector: "data-reload-media",
    does: "Reloads a known media source into runtime/cache state.",
    useWhen: "Use when media is present but unloaded or stale.",
    aiNote: "Reload should preserve project references."
  },
  {
    surface: "Media Pool And Cache",
    control: "Relink Media",
    selector: "data-relink-media",
    does: "Chooses a replacement file for missing or moved media.",
    useWhen: "Use after reopening a project with broken external paths.",
    aiNote: "Relink changes references; preserve user intent and verify waveform/cache status."
  },
  {
    surface: "Media Pool And Cache",
    control: "Collect Media",
    actionId: "collect-media",
    does: "Copies reloadable external media beside the saved project when possible.",
    useWhen: "Use to make a project more portable.",
    aiNote: "Requires a saved project path and should report blocked items clearly."
  },
  {
    surface: "Media Pool And Cache",
    control: "Collect Media Plan",
    actionId: "export-media-plan",
    does: "Exports a JSON plan that describes which media can be collected and which items are blocked.",
    useWhen: "Use before sharing projects or diagnosing portability.",
    aiNote: "The plan is evidence, not a copy operation."
  },
  {
    surface: "Media Pool And Cache",
    control: "Build Native Cache",
    actionId: "build-native-cache",
    does: "Renders generated/runtime audio to project-cache/native-audio assets.",
    useWhen: "Use before installed-app playback, reopen, and export reliability smoke.",
    aiNote: "Inspect cache diagnostics for invalidated, stale, or fallback entries."
  },
  {
    surface: "Inspector Clip",
    control: "Clip Mix Gain/Transpose",
    selector: "data-clip-transform",
    does: "Edits selected-clip gain or transpose metadata.",
    useWhen: "Use for per-clip balance and MIDI/generated pitch variation.",
    aiNote: "Audio pitch controls may be metadata/preparatory; verify render/playback."
  },
  {
    surface: "Inspector Clip",
    control: "Generated Section Stem Mutes",
    selector: "data-clip-stem-mute",
    does: "Mutes generated roles inside the selected generated-section clip only.",
    useWhen: "Use for clip-level variations without editing the source Chordsmith section.",
    aiNote: "Checked means muted for that clip only."
  },
  {
    surface: "Inspector Clip",
    control: "Freeze Selected Clip",
    actionId: "freeze-selected-clip",
    does: "Renders the selected clip into a reusable audio/cache artifact.",
    useWhen: "Use to preserve generated or expensive material as audio.",
    aiNote: "Check media pool and render cache after freezing."
  },
  {
    surface: "Inspector Clip",
    control: "Export Selected Clip MIDI",
    actionId: "export-selected-clip-midi",
    does: "Exports the selected MIDI-capable clip to a MIDI file.",
    useWhen: "Use for interchange with other tools.",
    aiNote: "Audio clips cannot export MIDI."
  },
  {
    surface: "Inspector Track",
    control: "Export Selected Track MIDI",
    actionId: "export-selected-track-midi",
    does: "Exports all MIDI-capable material on the selected track.",
    useWhen: "Use for external DAWs, notation tools, Chordsmith review, or game tooling.",
    aiNote: "Audio-only track content will not become MIDI."
  },
  {
    surface: "Audio Clip Editing",
    control: "Audio Clip Properties",
    selector: "data-audio-clip-property",
    does: "Edits gain, fade in/out, source offset, duration, playback rate, and pitch metadata.",
    useWhen: "Use to fit imported or recorded audio to the arrangement nondestructively.",
    aiNote: "Source files are not rewritten; verify what metadata currently affects playback/export."
  },
  {
    surface: "Audio Clip Editing",
    control: "Short Fades",
    selector: "data-audio-clip-action:quick-fade",
    does: "Applies short fade-in and fade-out metadata to an audio clip.",
    useWhen: "Use to reduce clicks at edit boundaries.",
    aiNote: "Source-safe metadata only."
  },
  {
    surface: "Audio Clip Editing",
    control: "Reset Fades",
    selector: "data-audio-clip-action:reset-fades",
    does: "Clears audio clip fade metadata.",
    useWhen: "Use to restore raw clip boundaries.",
    aiNote: "This removes smoothing; listen for clicks after reset."
  },
  {
    surface: "Audio Clip Editing",
    control: "Normalize",
    selector: "data-audio-clip-action:normalize-gain",
    does: "Sets clip gain from analyzed peak level.",
    useWhen: "Use to bring quiet audio closer to working level.",
    aiNote: "Changes gain metadata, not source samples."
  },
  {
    surface: "Audio Clip Editing",
    control: "Analyze Transients",
    selector: "data-audio-clip-action:analyze-transients",
    does: "Analyzes likely transient points in the audio source.",
    useWhen: "Use before warp marker creation or rhythmic audio inspection.",
    aiNote: "Analysis metadata is evidence for future warp tools, not full elastic audio by itself."
  },
  {
    surface: "Audio Clip Editing",
    control: "Create Warp Markers",
    selector: "data-audio-clip-action:create-warp-markers",
    does: "Creates metadata warp markers from analyzed transients.",
    useWhen: "Use to prepare timing/warp workflows.",
    aiNote: "Do not claim full warp playback until the relevant render/playback path is proven."
  },
  {
    surface: "Audio Clip Editing",
    control: "Quantize Warp Markers",
    selector: "data-audio-clip-action:quantize-warp-markers-1/4, quantize-warp-markers-1/8, quantize-warp-markers-1/16, quantize-warp-markers-1/32",
    does: "Snaps existing warp marker target positions to a chosen quarter, eighth, sixteenth or thirty-second note grid as source-safe metadata.",
    useWhen: "Use after creating warp markers to prepare live-instrument timing correction at the musical resolution the take needs.",
    aiNote: "This does not time-stretch playback yet; sourceSeconds anchors stay preserved for the future stretch engine."
  },
  {
    surface: "Audio Clip Editing",
    control: "Edit Warp Marker Target",
    selector: "data-audio-warp-marker-target",
    does: "Moves one warp marker's target bar while keeping its sourceSeconds anchor unchanged.",
    useWhen: "Use when transient detection found the right source hit but the musical destination needs human or AI correction.",
    aiNote: "Also available as set_audio_warp_marker_target in file-first MCP and live MCP. Editing clears stale derived warp-rate metadata and returns the clip to metadata-only warp mode."
  },
  {
    surface: "Audio Clip Editing",
    control: "Delete Warp Marker",
    selector: "data-audio-warp-marker-delete",
    does: "Deletes one metadata warp marker without deleting or rewriting source audio.",
    useWhen: "Use when one detected transient is musically wrong but the rest of the warp marker set is useful.",
    aiNote: "Also available as delete_audio_warp_marker in file-first MCP and live MCP. Deleting markers clears stale derived warp-rate metadata."
  },
  {
    surface: "Audio Clip Editing",
    control: "Apply Warp Rate",
    selector: "data-audio-clip-action:apply-warp-varispeed",
    does: "Applies a source-safe global varispeed playback rate from the first and last warp markers, and aligns the first marker by updating clip source-offset metadata where possible.",
    useWhen: "Use after creating or quantizing warp markers when a loop or take needs an audible timing correction before pitch-preserving stretch exists.",
    aiNote: "This changes playback/export timing through varispeed, so pitch changes with speed. It does not edit source samples or claim elastic audio/autotune."
  },
  {
    surface: "Audio Clip Editing",
    control: "Clear Warp",
    selector: "data-audio-clip-action:clear-warp-markers",
    does: "Removes metadata warp markers from an audio clip.",
    useWhen: "Use when analysis markers are wrong or no longer wanted.",
    aiNote: "Clearing markers should not delete source audio. If a warp-derived varispeed rate is still untouched, clearing restores the previous rate/source offset; manual edits are preserved."
  },
  {
    surface: "Audio Clip Editing",
    control: "Crossfade",
    selector: "data-audio-clip-action:crossfade-overlap",
    does: "Creates a crossfade with an overlapping neighboring clip.",
    useWhen: "Use to smooth edits, comps, or overlaps.",
    aiNote: "Inspect neighboring clip boundaries after use."
  },
  {
    surface: "Audio Clip Editing",
    control: "Overlap Fade",
    selector: "data-audio-clip-action:create-crossfade-left",
    does: "Creates a source-safe overlap fade at the left edge of the selected audio clip.",
    useWhen: "Use when a split clip needs a smoother entry.",
    aiNote: "Verify source offset and clip start after the operation."
  },
  {
    surface: "Audio Clip Editing",
    control: "Invert Phase",
    selector: "data-audio-clip-action:invert-phase",
    does: "Applies phase inversion metadata to the audio clip.",
    useWhen: "Use for phase checks or creative cancellation effects.",
    aiNote: "Verify export/render because phase changes can be subtle visually."
  },
  {
    surface: "Audio Clip Editing",
    control: "Reverse",
    selector: "data-audio-clip-action:reverse",
    does: "Reverses the audio clip nondestructively.",
    useWhen: "Use for creative effects or reverse transitions.",
    aiNote: "Check the rendered result; source media should remain unchanged."
  },
  {
    surface: "Recording And Takes",
    control: "Take Lane Overview",
    selector: "data-audio-take-lane-summary",
    does: "Shows each take lane's active/muted/archived segment counts and timeline span.",
    useWhen: "Use before lane activation or range comping to understand which take lane owns each split comp segment.",
    aiNote: "Read-only organization surface; use the take activate, lane activate, archive/restore and comp controls for edits."
  },
  {
    surface: "Recording And Takes",
    control: "Take Activate",
    selector: "data-audio-take-activate",
    does: "Makes a take the active audible clip in its take group.",
    useWhen: "Use when choosing the best pass from multiple recordings.",
    aiNote: "Inactive takes are not deleted."
  },
  {
    surface: "Recording And Takes",
    control: "Take Lane Activate",
    selector: "data-audio-take-lane-activate",
    does: "Activates every non-archived clip in the selected take lane so split comp segments from that lane can be auditioned together.",
    useWhen: "Use after comp splits create multiple clips in each take lane and you want to hear one lane as a whole.",
    aiNote: "This is lane auditioning over normal audio clips; it is not a full stacked waveform take editor."
  },
  {
    surface: "Recording And Takes",
    control: "Archive Take",
    selector: "data-audio-take-archive",
    does: "Archives a take without deleting its source media.",
    useWhen: "Use to hide a take from the active comp workflow while preserving it.",
    aiNote: "Archive is reversible and should not be treated as cleanup."
  },
  {
    surface: "Recording And Takes",
    control: "Restore Take",
    selector: "data-audio-take-restore",
    does: "Restores an archived take to the take group.",
    useWhen: "Use when an archived take needs auditioning again.",
    aiNote: "Verify active/muted state after restore."
  },
  {
    surface: "Recording And Takes",
    control: "Comp From Playhead",
    actionId: "audio-take-comp-from-playhead",
    does: "Creates a take comp beginning at the current playhead.",
    useWhen: "Use to assemble parts of multiple takes.",
    aiNote: "Confirm playhead position and take group before comping."
  },
  {
    surface: "Recording And Takes",
    control: "Comp Range",
    actionId: "audio-take-comp-range",
    does: "Splits grouped takes at the active edit range and makes the selected take audible only inside that range.",
    useWhen: "Use to build a vocal or instrument comp from a short phrase without replacing the earlier or later active take segments.",
    aiNote: "Set the edit range first; source media and outside-range comp choices should remain intact."
  },
  {
    surface: "MIDI Editing",
    control: "Add Empty MIDI Clip",
    actionId: "add-empty-midi-clip",
    does: "Adds a blank MIDI clip to the selected MIDI track.",
    useWhen: "Use before drawing or entering MIDI notes from scratch.",
    aiNote: "Requires a MIDI track selection."
  },
  {
    surface: "MIDI Editing",
    control: "MIDI Clip Bars",
    selector: "data-midi-clip-property:barLength",
    does: "Changes the selected MIDI clip's bar length.",
    useWhen: "Use before drawing notes or looping a MIDI phrase that needs a different duration.",
    aiNote: "Clip length changes timing bounds; inspect notes after shortening a clip."
  },
  {
    surface: "MIDI Editing",
    control: "Quantize",
    selector: "data-midi-quantize",
    does: "Moves MIDI note starts to the selected rhythmic grid.",
    useWhen: "Use to tighten note starts to quarter, eighth, sixteenth, or thirty-second notes.",
    aiNote: "This edits MIDI start timing in project state but remains undoable. Also available as quantize_midi_clip through file-first MCP and live MCP."
  },
  {
    surface: "MIDI Editing",
    control: "Quantize Note Lengths",
    selector: "data-midi-duration-quantize",
    does: "Snaps MIDI note durations to the selected rhythmic grid without moving note starts.",
    useWhen: "Use when imported or recorded MIDI has acceptable starts but ragged note lengths.",
    aiNote: "Preserves starts, velocity, channel and expression metadata; verify musical sustains after use. Also available as quantize_midi_durations through file-first MCP and live MCP."
  },
  {
    surface: "MIDI Editing",
    control: "Swing",
    selector: "data-midi-swing",
    does: "Applies straight or swung eighth-note timing to the MIDI clip.",
    useWhen: "Use after basic timing is correct and feel needs adjustment.",
    aiNote: "Record/inspect the last swing metadata when explaining the result. Also available as swing_midi_clip through file-first MCP and live MCP."
  },
  {
    surface: "MIDI Editing",
    control: "Groove",
    selector: "data-midi-groove",
    does: "Applies a named groove template to MIDI timing.",
    useWhen: "Use for style-specific timing feel.",
    aiNote: "Groove changes should be listened to, not judged from note positions alone. Also available as apply_midi_groove through file-first MCP and live MCP."
  },
  {
    surface: "MIDI Editing",
    control: "Velocity Transform",
    selector: "data-midi-velocity-transform",
    does: "Applies a bulk velocity edit such as leveling or deterministic humanization.",
    useWhen: "Use to shape note dynamics quickly.",
    aiNote: "Check drum/bass parts because velocity may change perceived groove strongly. Also available as transform_midi_velocity through file-first MCP and live MCP."
  },
  {
    surface: "MIDI Editing",
    control: "Pitch Transform",
    selector: "data-midi-pitch-transform",
    does: "Transposes MIDI notes by semitone or octave steps.",
    useWhen: "Use for octave placement or key correction.",
    aiNote: "Check pitch range after transforms, especially drums and bass. Also available as transform_midi_pitch through file-first MCP and live MCP."
  },
  {
    surface: "MIDI Editing",
    control: "MIDI Note Add/Edit/Move/Duplicate/Delete",
    selector: "data-midi-note-*",
    does: "Adds notes and edits note pitch, start tick, length, velocity, channel, movement, duplication, and deletion.",
    useWhen: "Use for detailed piano-roll editing.",
    aiNote: "Keep note edits bounded and verify bar/tick interpretation against the clip PPQ and tempo map."
  },
  {
    surface: "MIDI Editing",
    control: "MIDI Controller/Program/Bend/Aftertouch",
    selector: "data-midi-controller-* / data-midi-program-* / data-midi-pitch-bend-* / data-midi-aftertouch-*",
    does: "Adds, edits, duplicates, and deletes expressive MIDI events. The MIDI preview/render path interprets channel-matched CC7 volume, CC10 pan, CC11 expression, CC64 sustain, and pitch-bend detune.",
    useWhen: "Use for MIDI expression and interchange detail.",
    aiNote: "Imported controller data can be dense; avoid broad destructive edits without a clear target."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "MIDI Conversion Mode And Preview",
    selector: "data-midi-conversion-intent, data-midi-faithful-role-source, data-midi-faithful-preview, data-midi-conversion-preview, midiFaithfulConversionPreviews[], midiChordsmithConversionPreviews[]",
    does: "Chooses Faithful transcription or Arrange into Chordsmith. Faithful preview shows independent role sources, exact source/destination bars, timing resolution/error, A-H packing, source/written/filtered/grouped counts, generated-part counts, raw-reference action, chord compatibility and fidelity before Apply.",
    useWhen: "Use before converting imported MIDI so transcription and creative arrangement cannot be confused.",
    aiNote: "Faithful mode packs up to 128 bars sequentially, writes exact DAW melody/chord overlays and generates no accompaniment by default. Mixed-quality PCS1 progression copies remain simplified."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Map Drums",
    actionId: "convert-midi-drums",
    does: "Maps General MIDI drum notes into generated drum branch overlays.",
    useWhen: "Use when imported MIDI drums should become editable generated drum lanes.",
    aiNote: "Listen and inspect mapping because MIDI drum files vary widely."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Map Bass",
    actionId: "convert-midi-bass",
    does: "Maps low non-drum MIDI notes into generated bass overlays.",
    useWhen: "Use when an imported bassline should become Chordsmith-style source.",
    aiNote: "Check octave and root interpretation after conversion."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Map Chords",
    actionId: "convert-midi-chords",
    does: "Maps simultaneous non-drum MIDI notes into generated chord overlays.",
    useWhen: "Use when chord MIDI should inform the Chordsmith harmonic grid.",
    aiNote: "Chord inference is a helper; inspect musical correctness."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Map Melody",
    actionId: "convert-midi-melody",
    does: "Maps non-drum MIDI notes into generated melody overlays.",
    useWhen: "Use when importing a lead or motif into Chordsmith-style editing.",
    aiNote: "Check section, track index, and note range after mapping."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Apply Faithful Transcription",
    actionId: "convert-midi-faithful",
    does: "Applies independent inferred or manually selected melody/chord roles, exact sequential A-H packing, source-derived resolution and exact DAW overlays as one undoable command with structured history.",
    useWhen: "Use when source order, length, note attacks, durations and chord voicings must remain auditable.",
    aiNote: "The raw MIDI reference is kept by default. Sources above 128 bars must remain raw, be split, or use creative arrangement; they are never silently collapsed."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Apply Creative Arrangement",
    actionId: "convert-midi-arrangement",
    does: "Maps drums, bass, chord groups and melody notes from the selected source into generated overlays as one undoable creative sketch.",
    useWhen: "Use when generated accompaniment and interpretive simplification are desired rather than exact transcription.",
    aiNote: "This is explicitly creative arrangement. Review generated counts, padding, section reuse and losses before applying."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Adopt Tempo",
    actionId: "adopt-midi-tempo",
    does: "Applies the imported MIDI start tempo and supported /4 meter to project globals.",
    useWhen: "Use when the MIDI file should define project tempo.",
    aiNote: "Do not adopt tempo silently if existing project timing matters."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Tempo Lane",
    actionId: "adopt-midi-tempo-map",
    does: "Converts imported MIDI tempo events into project tempo automation.",
    useWhen: "Use when a MIDI file contains tempo changes that should be preserved.",
    aiNote: "Tempo automation affects render and bar/beat interpretation."
  },
  {
    surface: "MIDI To Chordsmith",
    control: "Meter Lane",
    actionId: "adopt-midi-meter-map",
    does: "Converts imported MIDI time-signature events into the project meter map.",
    useWhen: "Use when changing meters should survive import.",
    aiNote: "Meter maps affect display and timing; verify after adoption."
  },
  {
    surface: "Chordsmith Editing",
    control: "Song Globals",
    selector: "data-chordsmith-global",
    does: "Edits BPM, key, scale, time signature, resolution, and swing for the Chordsmith source.",
    useWhen: "Use for broad musical identity changes.",
    aiNote: "Changing globals can alter timing, generation, and export behavior."
  },
  {
    surface: "Chordsmith Editing",
    control: "Section Chord Selectors",
    selector: "data-section-chord",
    does: "Chooses chord symbols for each bar in the selected Chordsmith section.",
    useWhen: "Use to change the harmonic progression that drives generated roles.",
    aiNote: "Chord changes can alter bass, melody, guitar, and export behavior; inspect generated roles afterward."
  },
  {
    surface: "Chordsmith Editing",
    control: "Add Section",
    actionId: "section-add",
    does: "Adds a Chordsmith section to the source project.",
    useWhen: "Use to create more arrangement material or variations.",
    aiNote: "Confirm timeline clips after adding/changing sections."
  },
  {
    surface: "Chordsmith Editing",
    control: "Section Bars",
    selector: "data-section-bars",
    does: "Changes the bar length of a Chordsmith section.",
    useWhen: "Use to alter section duration before placing or repeating clips.",
    aiNote: "Changing section length can affect existing arrangement assumptions."
  },
  {
    surface: "Chordsmith Editing",
    control: "Step Page",
    selector: "data-step-page",
    does: "Moves long section step editors to the previous or next visible page.",
    useWhen: "Use when a section has more steps than fit in the current editor window.",
    aiNote: "Page navigation is UI-only; it changes which steps are visible, not the section data."
  },
  {
    surface: "Chordsmith Editing",
    control: "Drum/Bass/Guitar Presets",
    selector: "data-drum-preset-section / data-bass-preset-section / data-guitar-preset-section",
    does: "Fills role patterns from Chordsmith preset libraries.",
    useWhen: "Use for quick groove or rhythm starting points.",
    aiNote: "Preset application is source editing; inspect generated steps afterward."
  },
  {
    surface: "Chordsmith Editing",
    control: "Drum Steps And Branch Steps",
    selector: "data-drum-step / data-drum-branch-step",
    does: "Cycles drum lane hits, accents, and branch lane steps.",
    useWhen: "Use for beat programming and kit-piece variations.",
    aiNote: "Branch lanes are live-only overlays unless explicitly collapsed/exported through supported paths."
  },
  {
    surface: "Chordsmith Editing",
    control: "Drum Tuplet Toggle",
    selector: "data-drum-tuplet",
    does: "Toggles tuplet feel metadata for the selected drum step.",
    useWhen: "Use to create triplet/tuplet timing accents inside a drum pattern.",
    aiNote: "Tuplet metadata changes generated timing feel; listen after applying."
  },
  {
    surface: "Chordsmith Editing",
    control: "Bass Mode",
    selector: "data-bass-mode",
    does: "Chooses how generated bass interprets section harmony and manual bass steps.",
    useWhen: "Use before detailed bass step editing or when matching imported MIDI bass behavior.",
    aiNote: "Mode changes can make existing steps sound different without changing their labels."
  },
  {
    surface: "Chordsmith Editing",
    control: "Bass Steps, Holds, Slides, Accents",
    selector: "data-bass-step / data-bass-accent / selected bass step + H/S/T",
    shortcut: "H hold / S slide / T tuplet",
    does: "Edits bass note steps, visible accent steps, and selected-step hold/slide/tuplet performance metadata.",
    useWhen: "Use for bassline construction and articulation.",
    aiNote: "Hold/slide are currently keyboard-driven from the selected step; avoid assuming hidden legacy selectors are visible buttons."
  },
  {
    surface: "Chordsmith Editing",
    control: "Melody Steps",
    selector: "data-melody-step",
    does: "Edits melody note steps and their hold/slide/tuplet metadata.",
    useWhen: "Use for motif and lead-line editing.",
    aiNote: "Use page controls when sections are longer than the visible editor window."
  },
  {
    surface: "Chordsmith Editing",
    control: "Melody Track Settings",
    selector: "data-melody-instrument / data-melody-octave / data-melody-pan / data-melody-mute / data-melody-solo",
    does: "Sets melody track instrument, octave, pan, mute, and solo values for generated melody playback.",
    useWhen: "Use to balance or isolate melody tracks while editing generated sections.",
    aiNote: "Mute and solo affect audition/render perception; inspect them before diagnosing missing melody."
  },
  {
    surface: "Chordsmith Editing",
    control: "Melody Hold / Slide / Tuplet",
    selector: "data-melody-hold / data-melody-slide / data-melody-tuplet",
    does: "Toggles performance metadata on selected melody steps.",
    useWhen: "Use for legato notes, slides, and tuplet rhythmic feel.",
    aiNote: "These controls require a selected melody step; verify the selected step before toggling."
  },
  {
    surface: "Chordsmith Editing",
    control: "Chord Instrument",
    selector: "data-chord-instrument",
    does: "Chooses the generated chord instrument voice.",
    useWhen: "Use when changing the character of chord playback without rewriting the chord progression.",
    aiNote: "Instrument changes affect tone, not harmonic content."
  },
  {
    surface: "Chordsmith Editing",
    control: "Guitar Steps",
    selector: "data-guitar-step",
    does: "Edits guitar rhythm articulations per step.",
    useWhen: "Use for rhythm-guitar patterns and energy changes.",
    aiNote: "Guitar may need its generated role track active before editing is visible."
  },
  {
    surface: "Chordsmith Editing",
    control: "Guitar Settings",
    selector: "data-guitar-setting",
    does: "Enables guitar and edits tone, register, strum mode, and volume.",
    useWhen: "Use to shape generated guitar before arranging or exporting game loops.",
    aiNote: "Guitar enable state affects whether guitar material is audible and exported."
  },
  {
    surface: "Drum Kit Lanes",
    control: "Branch Drums",
    actionId: "branch-generated-drums",
    does: "Creates branch track views for generated drum kit lanes.",
    useWhen: "Use when kit pieces need separate mix, FX, sends, or export control.",
    aiNote: "Branch views should preserve the original Chordsmith drum source."
  },
  {
    surface: "Drum Kit Lanes",
    control: "Branch Entry Gesture",
    selector: "data-drum-branch-entry",
    does: "Marks timeline/clip regions that can branch generated drum lanes by double-click or context action.",
    useWhen: "Use when a user wants separate kit-piece lane control from a generated drum source.",
    aiNote: "Branching should create editable/mixable views without destroying the source drum pattern."
  },
  {
    surface: "Drum Kit Lanes",
    control: "Hide/Show Branch Rows",
    actionId: "toggle-drum-branch-group",
    does: "Hides or shows generated drum branch rows without deleting branch data.",
    useWhen: "Use to reduce timeline clutter while keeping branch mix/export setup.",
    aiNote: "Visibility is not deletion."
  },
  {
    surface: "Drum Kit Lanes",
    control: "Collapse Branches",
    actionId: "collapse-generated-drum-branches",
    does: "Removes generated drum branch track views while preserving the source kit.",
    useWhen: "Use after branch editing/export review when the timeline is too busy.",
    aiNote: "Confirm whether branch-specific routing/FX should remain before collapsing."
  },
  {
    surface: "Drum Kit Lanes",
    control: "Drum Lane Mix",
    selector: "data-drum-lane-volume / data-drum-lane-pan / data-drum-lane-gate / data-drum-lane-mute",
    does: "Edits kit-piece volume, pan, gate length, and mute state.",
    useWhen: "Use for generated drum balance and articulation.",
    aiNote: "Gate changes generated hit duration and can invalidate caches."
  },
  {
    surface: "Mixer And FX",
    control: "Add FX",
    selector: "data-add-fx / data-drum-lane-add-fx",
    does: "Adds a built-in effect slot to a track or drum lane.",
    useWhen: "Use for internal processing such as EQ, delay, dynamics, or color.",
    aiNote: "Third-party plugin hosting is not claimed."
  },
  {
    surface: "Mixer And FX",
    control: "Bypass/Enable FX",
    selector: "data-fx-toggle / data-drum-lane-fx-toggle",
    does: "Bypasses or enables an effect slot.",
    useWhen: "Use to audition processing impact.",
    aiNote: "Bypassed effects still exist in the project."
  },
  {
    surface: "Mixer And FX",
    control: "Remove FX",
    selector: "data-fx-remove / data-drum-lane-fx-remove",
    does: "Removes an effect slot from its chain.",
    useWhen: "Use when an effect is no longer wanted.",
    aiNote: "This can remove parameter/automation context; verify undo coverage."
  },
  {
    surface: "Mixer And FX",
    control: "Pocket Pro EQ Presets And Bands",
    selector: "data-fx-eq-preset / data-fx-param",
    does: "Applies EQ presets and edits EQ band enable, frequency, gain, and Q parameters.",
    useWhen: "Use for tonal shaping and corrective EQ.",
    aiNote: "Check parameter automation after changing EQ values."
  },
  {
    surface: "Sends And Automation",
    control: "Send Level And Mode",
    selector: "data-track-send-level / data-track-send-mode",
    does: "Sets send amount and pre/post-fader mode from a source track to a return track.",
    useWhen: "Use for shared ambience/effects routing.",
    aiNote: "Verify target return and routing warnings."
  },
  {
    surface: "Sends And Automation",
    control: "Create Automation Lane",
    selector: "data-clip-automation-create / data-automation-create / data-send-automation-create / data-project-automation-create / data-fx-automation-create",
    does: "Creates an automation lane for audio clip gain/fades/source offset, track parameters, sends, project tempo, or FX parameters.",
    useWhen: "Use when a value should change over time.",
    aiNote: "Automation is project data; preserve sorted point order and target identity."
  },
  {
    surface: "Sends And Automation",
    control: "Add Automation Point",
    selector: "data-clip-automation-add-point / data-automation-add-point / data-send-automation-add-point / data-project-automation-add-point / data-fx-automation-add-point",
    does: "Adds an automation point at the playhead using the current value.",
    useWhen: "Use for mix rides, filter sweeps, tempo changes, and timed effects.",
    aiNote: "Confirm playhead position and current value first."
  },
  {
    surface: "Sends And Automation",
    control: "Edit/Delete Automation Point",
    selector: "data-automation-point-* / data-automation-delete-point",
    does: "Edits bar, value, curve, or deletes an automation point.",
    useWhen: "Use for precise automation shaping.",
    aiNote: "Deleting points can change playback across a region; keep edits bounded."
  },
  {
    surface: "Sends And Automation",
    control: "Enable Automation Lane",
    selector: "data-automation-enabled",
    does: "Turns an automation lane on or off without deleting its points.",
    useWhen: "Use to compare automated and static playback or temporarily bypass a lane.",
    aiNote: "Disabled lanes still hold data. Do not delete points just to audition a bypass."
  },
  {
    surface: "Sends And Automation",
    control: "Automation Lane Surface",
    selector: "data-automation-lane-surface / data-automation-lane-start-bar / data-automation-lane-end-bar / data-automation-lane-min / data-automation-lane-max",
    does: "Displays the drawable automation area and encodes the bar/value bounds used for pointer-created points.",
    useWhen: "Use for visual editing of automation curves across clip, track, send, project, and FX targets.",
    aiNote: "Surface bounds are control metadata; use them to place points precisely and preserve target identity."
  },
  {
    surface: "Sends And Automation",
    control: "Project Meter Map",
    selector: "data-project-meter-map-*",
    does: "Adds, edits, or deletes time-signature map points.",
    useWhen: "Use when a project needs meter changes from MIDI or manual arrangement work.",
    aiNote: "Meter changes affect bar/beat display and render timing."
  },
  {
    surface: "Export",
    control: "Export Profile Controls",
    selector: "data-export-profile-setting",
    does: "Edits WAV export settings such as sample rate, tail length, channels, normalization, dither and bit depth.",
    useWhen: "Use before rendering full-song WAVs, stem ZIPs or section-loop ZIPs with specific delivery settings.",
    aiNote: "These settings affect later export output; unsupported codec profiles must still reject clearly."
  },
  {
    surface: "Export",
    control: "Full WAV",
    actionId: "export-wav",
    shortcut: "Ctrl+E",
    does: "Renders the full mix to a WAV file.",
    useWhen: "Use for song preview, master checks, and baseline audio export.",
    aiNote: "Unsupported codec profiles must fail clearly instead of writing mislabeled WAVs."
  },
  {
    surface: "Export",
    control: "Full MIDI",
    actionId: "export-midi",
    does: "Exports the full project MIDI arrangement.",
    useWhen: "Use for notation, external DAW interchange, or Chordsmith/DJ workflows.",
    aiNote: "Audio clips do not become MIDI."
  },
  {
    surface: "Export",
    control: "Stem WAV ZIP",
    actionId: "export-stems",
    does: "Exports one WAV per stem group plus manifest metadata.",
    useWhen: "Use for mixing, game implementation, and external stem review.",
    aiNote: "Inspect manifest paths, stem count, and warnings."
  },
  {
    surface: "Export",
    control: "Section Loop ZIP",
    actionId: "export-section-manifest",
    does: "Exports generated section loop WAVs plus manifest metadata.",
    useWhen: "Use for loop packs and adaptive game cue tests.",
    aiNote: "Loop/gapless smoke matters before compressed game format claims."
  },
  {
    surface: "Export",
    control: "Godot Game Pack",
    actionId: "export-godot-manifest",
    does: "Exports a WAV-based adaptive pack for Godot with source project, full mix, stems, loops, manifest, warnings, and size summaries.",
    useWhen: "Use to move rendered DAW audio into a Godot workflow.",
    aiNote: "Do not edit the Godot addon from DAW work unless explicitly requested."
  },
  {
    surface: "Export",
    control: "Push Godot Pack",
    actionId: "push-godot-pack",
    does: "Attempts to send a generated Godot pack to a local receiver, then falls back to saving the ZIP.",
    useWhen: "Use when a Godot editor receiver is running.",
    aiNote: "Treat push as handoff smoke; inspect fallback behavior."
  },
  {
    surface: "Export",
    control: "Web Game Pack",
    actionId: "export-web-game-manifest",
    does: "Exports a WAV-based web game audio pack with deterministic paths and manifest data.",
    useWhen: "Use for browser/game runtime integration tests.",
    aiNote: "Compressed web formats need separate runtime smoke; WAV is the baseline."
  },
  {
    surface: "Export",
    control: "Future Codec Buttons",
    actionId: "export-full-flac",
    selector: "export-full-flac / export-stem-flacs / export-godot-ogg-pack / export-web-ogg-pack / export-full-mp3 / export-aiff-interchange",
    does: "Shows planned FLAC, Ogg, MP3, and AIFF profiles as disabled or guarded unsupported exports.",
    useWhen: "Use to explain roadmap direction without claiming encoders are shipped.",
    aiNote: "These must reject clearly until encoder dependencies, UI, manifests, and smoke are proven."
  },
  {
    surface: "Export",
    control: "Diagnostics JSON",
    actionId: "export-diagnostics",
    does: "Downloads a structured diagnostics snapshot.",
    useWhen: "Use for durable bug reports and release smoke evidence.",
    aiNote: "Review for privacy before sharing externally."
  },
  {
    surface: "Diagnostics And Support",
    control: "About / Diagnostics",
    actionId: "controls-open",
    does: "Opens app, project, media, cache, routing, updater, handoff, recording, and support diagnostics.",
    useWhen: "Use before bug reports, installed-app smoke, or release checks.",
    aiNote: "Release truth remains release-status.json and docs/CURRENT_RELEASE_STATUS.md."
  },
  {
    surface: "Diagnostics And Support",
    control: "Close Diagnostics",
    actionId: "controls-close",
    does: "Closes the diagnostics panel.",
    useWhen: "Use after reading or exporting diagnostics.",
    aiNote: "UI-only."
  },
  {
    surface: "Diagnostics And Support",
    control: "Copy Diagnostics",
    actionId: "copy-diagnostics",
    does: "Copies structured diagnostics to the clipboard.",
    useWhen: "Use when a support note or issue report needs current app state.",
    aiNote: "Prefer exported JSON for long-lived evidence."
  },
  {
    surface: "Diagnostics And Support",
    control: "Function Guide",
    actionId: "function-guide-open",
    does: "Opens the in-app function guide and action catalog.",
    useWhen: "Use when a human or AI helper needs control meanings in context.",
    aiNote: "Keep this catalog aligned whenever adding buttons or command surfaces."
  },
  {
    surface: "Diagnostics And Support",
    control: "Close Function Guide",
    actionId: "function-guide-close",
    does: "Closes the in-app function guide.",
    useWhen: "Use after reading help.",
    aiNote: "UI-only."
  },
  {
    surface: "Diagnostics And Support",
    control: "Check For Updates",
    actionId: "updater-open",
    does: "Opens the updater panel.",
    useWhen: "Use in installed-app smoke to inspect updater state.",
    aiNote: "Opening the panel is not proof that update download/install succeeded."
  },
  {
    surface: "Diagnostics And Support",
    control: "Run Update Check",
    actionId: "updater-check",
    does: "Checks the signed GitHub Releases updater manifest.",
    useWhen: "Use to verify whether a newer installed-app build is available.",
    aiNote: "Record exact version/result when using this as release evidence."
  },
  {
    surface: "Diagnostics And Support",
    control: "Download And Install Update",
    actionId: "updater-download-install",
    does: "Downloads and stages an available signed update.",
    useWhen: "Use only when the updater reports an available update.",
    aiNote: "Verify ready-to-restart state and artifact/version details."
  },
  {
    surface: "Diagnostics And Support",
    control: "Restart After Update",
    actionId: "updater-restart",
    does: "Restarts Pocket DAW to finish a staged update.",
    useWhen: "Use after update installation is ready to restart.",
    aiNote: "Only use when the app explicitly reports ready-to-restart."
  },
  {
    surface: "Diagnostics And Support",
    control: "Close Updater",
    actionId: "updater-close",
    does: "Closes the updater panel.",
    useWhen: "Use after checking updater state.",
    aiNote: "UI-only."
  },
  {
    surface: "Diagnostics And Support",
    control: "Updater Auto Check",
    selector: "data-updater-auto-check",
    does: "Enables or disables automatic update checks.",
    useWhen: "Use when configuring installed-app update behavior.",
    aiNote: "This is app preference state, not a DAW project edit."
  },
  {
    surface: "AI / MCP Bridge",
    control: "AI / MCP Bridge",
    actionId: "mcp-setup-open",
    does: "Opens local MCP command/config snippets and live bridge controls.",
    useWhen: "Use when an AI counterpart should inspect, validate, edit, or observe/control the app.",
    aiNote: "Live bridge requires the running installed app and bearer token; file MCP can work closed."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Enable Live App Bridge",
    selector: "data-ai-bridge-enabled",
    does: "Toggles the token-protected live localhost bridge for the current app session.",
    useWhen: "Use when a trusted AI tool needs live app state/control.",
    aiNote: "Do not expose the bearer token broadly."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Test Live Bridge",
    actionId: "ai-bridge-test",
    does: "Runs a connectivity test against the live MCP bridge.",
    useWhen: "Use before relying on live app MCP tools.",
    aiNote: "A failed test means use file MCP or visual/browser control instead."
  },
  {
    surface: "AI / MCP Bridge",
    control: "File MCP Folder Commands",
    selector: "set_track_folder, toggle_folder_expanded, toggle_track_mute, toggle_track_solo",
    does: "Lets file-first MCP assign timeline lanes to folder tracks, collapse or expand the folder, and use folder Mute/Solo as child-lane group controls.",
    useWhen: "Use when a human or AI counterpart needs to organize a busy project or smoke folder behavior without driving the visual UI.",
    aiNote: "These commands reuse existing undoable app command paths. Folder commands still do not imply folder-bus routing, sends, FX inheritance or export grouping."
  },
  {
    surface: "AI / MCP Bridge",
    control: "File MCP Recording Latency Offset",
    selector: "set_recording_latency_offset",
    does: "Lets file-first MCP set a live track's manual recording latency offset in seconds or milliseconds through the same undoable command path as the mixer UI.",
    useWhen: "Use before recording smoke when a project has known interface or monitoring delay that should be reflected in future take placement.",
    aiNote: "This is explicit project metadata only. Positive values place new takes earlier; negative values place them later, and clips record requested/applied offset metadata."
  },
  {
    surface: "AI / MCP Bridge",
    control: "File MCP Recording Input Channel",
    selector: "set_recording_input_channel",
    does: "Lets file-first MCP store explicit live-track Mono Ch N, Stereo Ch N-N+1 or future split-mono recording input assignments. The visual mixer still exposes the current mono/stereo alpha choices.",
    useWhen: "Use before recording smoke or when an AI counterpart needs to prepare a multi-input project without driving the visual mixer.",
    aiNote: "This writes project assignment metadata only. Split-mono and other non-default maps remain blocked by native-alpha preflight until native channel routing lands."
  },
  {
    surface: "AI / MCP Bridge",
    control: "File MCP Take Lane Activation",
    selector: "create_take_lane_group, place_midi_recording_take, activate_audio_take_lane, set_audio_take_archived, comp_audio_take_from_bar, comp_audio_take_range, pocket_daw_live_apply_commands:create_take_lane_group, place_midi_recording_take, activate_audio_take_lane, set_audio_take_archived, comp_audio_take_from_bar, comp_audio_take_range",
    does: "Groups overlapping audio or MIDI clips into take lanes, places punched MIDI recording takes from note events, activates every non-archived clip in the selected lane, archives/restores takes without deleting media, and splits grouped takes into first comp segments or active edit-range comps through the undoable command path, from file-first MCP or the tokened live bridge.",
    useWhen: "Use for file-first or MCP-observed live take-lane creation, MIDI recording-take placement, audition, archive/restore and comp smoke after repeated takes or alternate MIDI clips exist.",
    aiNote: "This is the first same-track take-lane workflow over ordinary clips. Dedicated stacked lane subtracks, collapse/solo and full polished comp editing still need exact installed-app smoke before release claims."
  },
  {
    surface: "AI / MCP Bridge",
    control: "MCP Punch Recording Placement",
    selector: "place_punch_recording_clip, place_punch_recording_clip_from_range, pocket_daw_live_apply_commands:place_punch_recording_clip_from_range",
    does: "Places an explicit punch-window clip from an existing raw recording media item through the undoable command path, either from command-provided bars or from the active `set_punch_range` selection. Pass `createTakeLane: true` to preserve overlapping material as an inactive take lane.",
    useWhen: "Use for file-first or MCP-observed live punch/take-lane smoke, especially after a real installed recording produces a raw project-media WAV.",
    aiNote: "This places existing media; it does not start native capture by itself. Pair it with installed recording smoke before public release claims."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Recording Options And Transport",
    selector: "pocket_daw_live_control:set_recording_options, record_start, record_stop, record_toggle, midi_record_start, midi_record_stop, midi_record_toggle",
    does: "Lets the tokened live bridge set Punch on/off, choose Replace or Take Lane recording mode, start/stop/toggle installed-app audio recording, and start/stop/toggle Web MIDI input recording through the same guarded app paths as the transport buttons.",
    useWhen: "Use during MCP-observed installed-app recording smoke after saving the project, selecting/arming the live track, choosing the hardware input, and setting the intended punch range.",
    aiNote: "The no-hardware punch/take-lane smoke asserts and sets these controls but does not perform real microphone/interface capture or real connected-controller MIDI capture."
  },
  {
    surface: "AI / MCP Bridge",
    control: "MCP Punch Range Setup",
    selector: "set_punch_range, pocket_daw_live_apply_commands:set_punch_range, timelineSelection",
    does: "Marks the current timeline selection as an explicit punch range through file-first MCP or the tokened live bridge so punch/take smoke can distinguish punch intent from ordinary edit ranges.",
    useWhen: "Use before punch-placement smoke or installed punch recording tests when an AI counterpart needs a visible punch window without driving the timeline UI.",
    aiNote: "This only stores `timeline.selection.source = \"punch\"`. It does not start recording or place audio by itself."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Edit Range",
    selector: "pocket_daw_live_apply_commands:set_timeline_selection, set_timeline_selection_to_clip, clear_timeline_selection, split_timeline_selection, crop_clip_to_timeline_selection, delete_clip_range, ripple_delete_clip_range, ripple_delete_timeline_selection",
    does: "Lets the tokened live bridge set an ordinary edit range, range a selected clip, clear the edit range, split clips at the active range, crop the selected clip, delete the selected clip range, or ripple-delete selected/all-track ranges through the same undoable command paths as the timeline UI.",
    useWhen: "Use during MCP-observed editing smoke when an AI counterpart needs precise range setup or source-safe destructive-looking range edits in the running app without broad UI automation.",
    aiNote: "This is normal edit-range control, not punch intent. Confirm `timelineSelection.source` before applying destructive-looking range edits."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Audio Clip Actions",
    selector: "pocket_daw_live_apply_commands:apply_audio_clip_action",
    does: "Lets the tokened live bridge apply selected audio-clip actions such as Normalize, Analyze Transients, Create/Quantize/Clear Warp Markers, Invert Phase, Reverse, Short Fades, Reset Fades and crossfade helpers through the same undoable command path as the Audio Editor buttons.",
    useWhen: "Use during MCP-observed audio editing smoke when a clip needs source-safe analysis or metadata edits without visual UI driving.",
    aiNote: "Warp and quantize actions are metadata-only preparation for future time-stretch. They do not claim elastic audio, pitch correction or changed source samples."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Recording Latency Offset",
    selector: "pocket_daw_live_apply_commands:set_recording_latency_offset",
    does: "Lets the tokened live bridge set the running app's selected live-track manual recording latency offset through the same command path as the mixer UI.",
    useWhen: "Use during MCP-observed installed-app recording smoke when the running app needs a known timing offset prepared without visual UI driving.",
    aiNote: "Requires the installed app live bridge. It is visible, opt-in placement metadata, not automatic hardware-latency detection."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Recording Input Channel",
    selector: "pocket_daw_live_apply_commands:set_recording_input_channel",
    does: "Lets the tokened live bridge set the running app's selected live-track Mono Ch N, Stereo Ch N-N+1 or future split-mono recording input assignment through the same undoable command path as the mixer UI.",
    useWhen: "Use during MCP-observed installed-app smoke when the running app needs a recording input prepared without visual UI driving.",
    aiNote: "Requires the installed app live bridge. Split-mono and other non-default channel maps still remain blocked by native-alpha preflight until native channel routing lands."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Arm And Monitor",
    selector: "pocket_daw_live_apply_commands:set_track_armed, set_track_monitor",
    does: "Lets the tokened live bridge arm or disarm a live audio track and enable or disable input monitoring through existing undoable track commands.",
    useWhen: "Use during MCP-observed recording setup when the intended live track needs to be prepared without broad UI automation.",
    aiNote: "Desired-state commands are idempotent. Actual recording/playback quality still needs installed-app and human audio smoke."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Track Input",
    selector: "pocket_daw_live_apply_commands:set_track_input",
    does: "Lets the tokened live bridge set a live track's visible input device through the same command path as the mixer input selector.",
    useWhen: "Use before arming or recording when MCP needs to prepare the running app for a known hardware input.",
    aiNote: "Device IDs are runtime-specific. Confirm the selected input through live status and real installed-app smoke."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Selection Status",
    selector: "pocket_daw_live_status:selection",
    does: "Reports the running app's selected track, primary selected clip and full runtime selected clip group through selection.clipIds and selection.clips.",
    useWhen: "Use during MCP-observed arrangement smoke to confirm multi-selected clips before group Move, Mute, Delete, Copy, Cut, Paste or Duplicate actions.",
    aiNote: "Read-only status. Multi-selection is runtime UI state; saved project files do not persist it."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Track Setup Status",
    selector: "pocket_daw_live_status:tracks",
    does: "Reports per-track arm, monitor, input device, recording mode, recording input assignment, folder and output routing setup from the running app.",
    useWhen: "Use during recording or routing smoke to confirm the running app matches the visible mixer before pressing Record or exporting.",
    aiNote: "Read-only status. It helps observe setup, but real audio recording/playback still needs installed-app smoke."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Media And Takes",
    selector: "pocket_daw_live_status:media",
    does: "Reports media-pool counts, missing/runtime-only/cache-only portability state, safe project-relative source/cache paths and grouped audio-take summary from the running app; live control also supports collect_media, reload_media and explicit-path relink_media actions.",
    useWhen: "Use after importing or recording audio, and during collect/move/reopen/relink smoke, to confirm the project no longer depends on external source paths.",
    aiNote: "Absolute media paths are not exposed. Cache recovery remains marked missing/unresolved until the original source is relinked and recollected."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Live MCP Export Readiness",
    selector: "pocket_daw_live_status:export",
    does: "Reports compact Godot/Web game-pack readiness and pairs with live `export_project` control for explicit-path WAV, MIDI, stem ZIP, section-loop ZIP, Godot Adaptive Pack and Web Game Pack smoke exports.",
    useWhen: "Use before exporting or during installed portability/game-pack smoke so the running native app can produce artifacts without Save As dialog automation.",
    aiNote: "ZIP outputs still require manifest/file verification, and release claims require target-runtime evidence such as a successful Godot headless import report."
  },
  {
    surface: "AI / MCP Bridge",
    control: "File MCP Verify Game Pack",
    selector: "pocket_daw_verify_game_pack",
    does: "Verifies an existing Godot/Web game-pack ZIP against its manifest, embedded source project, file-size summary, deterministic paths and WAV-only codec boundary.",
    useWhen: "Use after exporting a pack and before any Godot/Web target-runtime smoke claim.",
    aiNote: "Read-only. Requires an explicit ZIP path and still reports that manual target-runtime smoke is required before release claims."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Recording Input Preflight Diagnostics",
    selector: "recording.inputPreflight, recordingInputPreflight, recordingFutureCapturePlan, recording.futureCapturePlan, audioTakeSummary.groups[].lanes[], media.audioTakes.groups[].lanes[]",
    does: "Reports whether the current armed live tracks and saved input channel assignments are valid before native recording starts; file-first MCP summaries and live MCP status also expose grouped future-capture planning plus take-lane IDs, lane states, segment spans, clip IDs/names and active clip IDs for smoke observation.",
    useWhen: "Use when recording will not start, when checking mono/stereo channel assignments, when observing take-lane activation, or before future multitrack hardware smoke.",
    aiNote: "Exposed in support diagnostics, file-first MCP summaries and live MCP status. Grouped capture planning and lane observation are source-only and do not claim simultaneous native multitrack recording or the full visual take-lane editor is shipped."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Copy MCP Setup",
    actionId: "copy-mcp-setup",
    does: "Copies command, JSON, TOML, or all MCP setup snippets.",
    useWhen: "Use to configure an AI client for Pocket DAW.",
    aiNote: "Check whether the snippet is for file MCP or live bridge before using it."
  },
  {
    surface: "AI / MCP Bridge",
    control: "Close MCP Setup",
    actionId: "mcp-setup-close",
    does: "Closes the AI / MCP Bridge panel.",
    useWhen: "Use after setup details are copied or reviewed.",
    aiNote: "UI-only."
  },
  {
    surface: "Feedback",
    control: "Send Feedback",
    actionId: "feedback-open",
    does: "Opens the feedback panel.",
    useWhen: "Use when the user wants to report confusing behavior, bugs, or testing notes.",
    aiNote: "Encourage reviewing diagnostics before external sharing."
  },
  {
    surface: "Feedback",
    control: "Copy Feedback Diagnostics",
    actionId: "feedback-copy-diagnostics",
    does: "Copies diagnostics from the feedback panel.",
    useWhen: "Use to include support state with a feedback note.",
    aiNote: "Diagnostics can contain local paths; review privacy."
  },
  {
    surface: "Feedback",
    control: "Feedback Text",
    selector: "data-feedback-text",
    does: "Stores the human-written feedback body before copying diagnostics or opening an email.",
    useWhen: "Use when describing a bug, manual smoke result, or feature request from inside the app.",
    aiNote: "Do not include private project paths or personal data unless the user explicitly wants that shared."
  },
  {
    surface: "Feedback",
    control: "Send Feedback Email",
    actionId: "feedback-send",
    does: "Drafts or opens an email with feedback text and diagnostics when possible.",
    useWhen: "Use for tester reports.",
    aiNote: "The user should review before sending."
  },
  {
    surface: "Feedback",
    control: "Close Feedback",
    actionId: "feedback-close",
    does: "Closes the feedback panel.",
    useWhen: "Use after feedback is sent, copied, or cancelled.",
    aiNote: "UI-only."
  },
  {
    surface: "Feedback",
    control: "More By Samfa12",
    actionId: "more-by-samfa12",
    does: "Opens the external Samfa12 page.",
    useWhen: "Use when the user wants related apps/projects.",
    aiNote: "This leaves the app context through an external URL."
  }
];

export const FUNCTION_ACTION_TOOLTIPS: Record<string, string> = FUNCTION_ACTION_REFERENCE.reduce<Record<string, string>>((tooltips, entry) => {
  if (entry.actionId) tooltips[entry.actionId] = entry.does;
  if (entry.selector?.includes("export-stem-flacs")) tooltips["export-stem-flacs"] = entry.does;
  if (entry.selector?.includes("export-godot-ogg-pack")) tooltips["export-godot-ogg-pack"] = entry.does;
  if (entry.selector?.includes("export-web-ogg-pack")) tooltips["export-web-ogg-pack"] = entry.does;
  if (entry.selector?.includes("export-full-mp3")) tooltips["export-full-mp3"] = entry.does;
  if (entry.selector?.includes("export-aiff-interchange")) tooltips["export-aiff-interchange"] = entry.does;
  return tooltips;
}, {});
