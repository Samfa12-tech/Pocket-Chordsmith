import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import {
  addMarkerAtPlayheadCommand,
  addGameStateMarkerAtPlayheadCommand,
  addFxAutomationPointCommand,
  addProjectAutomationPointCommand,
  addProjectMeterMapPointCommand,
  activateAudioTakeLaneCommand,
  activateAudioTakeCommand,
  adoptMidiMeterMapCommand,
  adoptMidiTempoMapAutomationCommand,
  adoptMidiTempoMapStartCommand,
  applySelectedAudioClipActionCommand,
  branchGeneratedDrumsCommand,
  clearTimelineSelectionCommand,
  compAudioTakeFromPlayheadCommand,
  convertMidiArrangementToGeneratedOverlaysCommand,
  convertMidiBassToGeneratedOverlaysCommand,
  convertMidiChordsToGeneratedOverlaysCommand,
  convertMidiDrumsToBranchOverlaysCommand,
  convertMidiMelodyToGeneratedOverlaysCommand,
  commitProject,
  cropSelectedClipToTimelineSelectionCommand,
  cycleBassStepCommand,
  cycleDrumBranchStepCommand,
  cycleDrumStepCommand,
  cycleMelodyStepCommand,
  deleteSelectedClipRangeCommand,
  deleteProjectMeterMapPointCommand,
  importTextToProject,
  loadPocketDawRaw,
  moveClipToBarCommand,
  placePunchRecordingClipCommand,
  placePunchRecordingClipFromRangeCommand,
  rippleDeleteSelectedClipRangeCommand,
  rippleDeleteTimelineSelectionCommand,
  ensureFxAutomationLaneCommand,
  ensureProjectAutomationLaneCommand,
  setPunchRangeCommand,
  setTimelineSelectionRangeCommand,
  setTimelineSelectionToLoopCommand,
  setTimelineSelectionToSelectedClipCommand,
  setDrumLaneGateCommand,
  setDrumLaneMuteCommand,
  setDrumLanePanCommand,
  setDrumLaneVolumeCommand,
  setFxSlotParameterCommand,
  setAudioTakeArchivedCommand,
  setSectionBarsCommand,
  setSectionChordCommand,
  setTrackPanCommand,
  setTrackFolderCommand,
  setTrackVolumeCommand,
  setTrackRecordingInputChannelCommand,
  splitTimelineSelectionCommand,
  toggleFolderExpandedCommand,
  toggleTrackMuteCommand,
  toggleTrackSoloCommand,
  updateAutomationPointCommand,
  updateProjectMeterMapPointCommand
} from "../app/commands.ts";
import { createInitialState, loadProjectIntoState, type AppState } from "../app/state.ts";
import { createAudioTakeDiagnosticsSummary } from "../app/diagnostics.ts";
import { buildPocketDawProjectFile } from "../daw/dawProject.ts";
import { DRUM_LANE_IDS, type DrumLaneId } from "../daw/drumLanes.ts";
import { createGameExportManifest, createGamePackDeliveryTargets, createSectionLoopMetadata, createStemExportPlan } from "../daw/exportJobs.ts";
import { arrangeMidiToHeavyMetalProject } from "../daw/midiArrangement.ts";
import { validateProjectInvariants } from "../daw/projectInvariants.ts";
import { buildGroupedRecordingCapturePlan, buildNativeRecordingAlphaInputPreflight } from "../daw/recordingInputs.ts";
import { GAME_STATE_MARKERS, POCKET_DAW_SCHEMA_VERSION, POCKET_DAW_VERSION, type GameStateMarkerId, type PocketDawProject } from "../daw/schema.ts";

export const POCKET_DAW_MCP_TOOLS = [
  "pocket_daw_read_project",
  "pocket_daw_validate_project",
  "pocket_daw_create_from_chordsmith",
  "pocket_daw_arrange_midi",
  "pocket_daw_release_master",
  "pocket_daw_apply_commands",
  "pocket_daw_export_plan",
  "pocket_daw_verify_game_pack",
  "pocket_daw_live_status",
  "pocket_daw_live_control",
  "pocket_daw_live_performance",
  "pocket_daw_live_apply_commands"
] as const;

export type PocketDawMcpTool = (typeof POCKET_DAW_MCP_TOOLS)[number];

export type PocketDawMcpCommand =
  | { type: "set_track_volume"; trackId: string; volume: number }
  | { type: "set_track_pan"; trackId: string; pan: number }
  | { type: "set_track_folder"; trackId: string; folderId?: string | null }
  | { type: "toggle_folder_expanded"; folderId: string }
  | { type: "toggle_track_mute"; trackId: string }
  | { type: "toggle_track_solo"; trackId: string }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "mono"; channelIndex?: number }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "split-mono"; channelIndex?: number }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "stereo"; channelPair?: [number, number] }
  | { type: "move_clip_to_bar"; clipId: string; startBar: number }
  | { type: "set_timeline_selection"; startBar: number; endBar: number }
  | { type: "set_punch_range"; startBar: number; endBar: number }
  | { type: "set_timeline_selection_to_clip"; clipId: string }
  | { type: "set_timeline_selection_to_loop" }
  | { type: "clear_timeline_selection" }
  | { type: "split_timeline_selection" }
  | { type: "crop_clip_to_timeline_selection"; clipId: string }
  | { type: "delete_clip_range"; clipId: string }
  | { type: "ripple_delete_clip_range"; clipId: string }
  | { type: "ripple_delete_timeline_selection" }
  | { type: "apply_audio_clip_action"; clipId: string; action: "normalize-gain" | "reset-fades" | "quick-fade" | "crossfade-overlap" | "create-crossfade-left" | "invert-phase" | "reverse" | "analyze-transients" | "create-warp-markers" | "quantize-warp-markers" | "clear-warp-markers" }
  | { type: "activate_audio_take"; clipId: string }
  | { type: "activate_audio_take_lane"; clipId: string }
  | { type: "set_audio_take_archived"; clipId: string; archived: boolean }
  | { type: "comp_audio_take_from_bar"; clipId: string; bar: number }
  | { type: "place_punch_recording_clip"; mediaPoolItemId: string; trackId: string; captureStartBar: number; punchStartBar: number; punchEndBar: number }
  | { type: "place_punch_recording_clip_from_range"; mediaPoolItemId: string; trackId: string; captureStartBar: number }
  | { type: "add_marker"; bar: number }
  | { type: "add_game_state_marker"; bar: number; gameState: GameStateMarkerId }
  | { type: "set_section_bars"; sectionId: string; bars: number }
  | { type: "set_section_chord"; sectionId: string; barIndex: number; degree: number }
  | { type: "cycle_drum_step"; sectionId: string; lane: "kick" | "snare" | "hat"; step: number }
  | { type: "branch_generated_drums" }
  | { type: "convert_midi_drums"; clipId: string; sectionId?: string }
  | { type: "convert_midi_bass"; clipId: string; sectionId?: string }
  | { type: "convert_midi_chords"; clipId: string; sectionId?: string }
  | { type: "convert_midi_melody"; clipId: string; sectionId?: string; trackIndex?: number }
  | { type: "convert_midi_arrangement"; clipId: string; sectionId?: string; trackIndex?: number }
  | { type: "adopt_midi_tempo"; clipId: string }
  | { type: "adopt_midi_tempo_map"; clipId: string }
  | { type: "adopt_midi_meter_map"; clipId: string }
  | { type: "cycle_drum_branch_step"; sectionId: string; lane: DrumLaneId; step: number }
  | { type: "set_drum_lane_volume"; lane: DrumLaneId; volume: number }
  | { type: "set_drum_lane_pan"; lane: DrumLaneId; pan: number }
  | { type: "set_drum_lane_gate"; lane: DrumLaneId; gate: number }
  | { type: "set_drum_lane_mute"; lane: DrumLaneId; mute: boolean }
  | { type: "cycle_bass_step"; sectionId: string; step: number }
  | { type: "cycle_melody_step"; sectionId: string; trackIndex: number; step: number }
  | { type: "ensure_project_automation"; field: "tempo" }
  | { type: "add_project_automation_point"; field: "tempo"; bar?: number }
  | { type: "add_project_meter_map_point"; bar?: number; numerator?: number; denominator?: number }
  | { type: "update_project_meter_map_point"; pointId: string; bar?: number; numerator?: number; denominator?: number }
  | { type: "delete_project_meter_map_point"; pointId: string }
  | { type: "update_automation_point"; laneId: string; pointIndex: number; bar: number; value: number; curve?: "linear" | "hold" | "ease-in" | "ease-out" }
  | { type: "ensure_fx_automation"; chainId: string; slotId: string; parameter: string }
  | { type: "add_fx_automation_point"; chainId: string; slotId: string; parameter: string; bar?: number }
  | { type: "set_fx_parameter"; chainId: string; slotId: string; parameter: string; value: number | boolean };

export type PocketDawLiveCommand =
  | { type: "set_track_volume"; trackId: string; volume: number }
  | { type: "set_track_pan"; trackId: string; pan: number }
  | { type: "set_track_mute"; trackId: string; mute: boolean }
  | { type: "set_track_solo"; trackId: string; solo: boolean }
  | { type: "set_track_input"; trackId: string; inputDeviceId?: string | null }
  | { type: "set_track_armed"; trackId: string; armed: boolean }
  | { type: "set_track_monitor"; trackId: string; monitorEnabled: boolean }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "mono"; channelIndex?: number }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "split-mono"; channelIndex?: number }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "stereo"; channelPair?: [number, number] }
  | { type: "set_punch_range"; startBar: number; endBar: number }
  | { type: "set_timeline_selection"; startBar: number; endBar: number }
  | { type: "set_timeline_selection_to_clip"; clipId: string }
  | { type: "clear_timeline_selection" }
  | { type: "split_timeline_selection" }
  | { type: "crop_clip_to_timeline_selection"; clipId: string }
  | { type: "delete_clip_range"; clipId: string }
  | { type: "ripple_delete_clip_range"; clipId: string }
  | { type: "ripple_delete_timeline_selection" }
  | { type: "activate_audio_take_lane"; clipId: string }
  | { type: "set_audio_take_archived"; clipId: string; archived: boolean }
  | { type: "comp_audio_take_from_bar"; clipId: string; bar: number }
  | { type: "place_punch_recording_clip_from_range"; mediaPoolItemId: string; trackId: string; captureStartBar: number };

interface PocketDawLiveSession {
  app?: string;
  url?: string;
  statusUrl?: string;
  controlUrl?: string;
  token?: string;
  enabled?: boolean;
  sessionPath?: string;
  processId?: number;
  startedAt?: string;
}

export const POCKET_DAW_LIVE_SESSION_FILE = process.env.POCKET_DAW_LIVE_BRIDGE_FILE ||
  join(process.env.LOCALAPPDATA || tmpdir(), "Pocket DAW", "ai-bridge-session.json");

interface ProjectInput {
  projectPath?: string;
  raw?: string;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

export async function callPocketDawMcpTool(name: string, args: unknown = {}): Promise<ToolResult> {
  switch (name) {
    case "pocket_daw_read_project":
      return jsonToolResult(readProject(args));
    case "pocket_daw_validate_project":
      return jsonToolResult(validateProject(args));
    case "pocket_daw_create_from_chordsmith":
      return jsonToolResult(createFromChordsmith(args));
    case "pocket_daw_arrange_midi":
      return jsonToolResult(arrangeMidi(args));
    case "pocket_daw_release_master":
      return jsonToolResult(await releaseMaster(args));
    case "pocket_daw_apply_commands":
      return jsonToolResult(applyCommands(args));
    case "pocket_daw_export_plan":
      return jsonToolResult(exportPlan(args));
    case "pocket_daw_verify_game_pack":
      return jsonToolResult(await verifyGamePack(args));
    case "pocket_daw_live_status":
      return jsonToolResult(await liveStatus(args));
    case "pocket_daw_live_control":
      return jsonToolResult(await liveControl(args));
    case "pocket_daw_live_performance":
      return jsonToolResult(await livePerformance(args));
    case "pocket_daw_live_apply_commands":
      return jsonToolResult(await liveApplyCommands(args));
    default:
      throw new Error(`Unknown Pocket DAW MCP tool: ${name}`);
  }
}

export function pocketDawMcpToolList() {
  return [
    {
      name: "pocket_daw_read_project",
      description: "Load, migrate and summarize a Pocket DAW project without modifying it.",
      inputSchema: objectSchema({ projectPath: stringSchema(), raw: stringSchema(), includeProject: booleanSchema() }),
      annotations: readOnlyToolAnnotations()
    },
    {
      name: "pocket_daw_validate_project",
      description: "Validate a Pocket DAW project and return schema/invariant warnings without modifying it.",
      inputSchema: objectSchema({ projectPath: stringSchema(), raw: stringSchema() }),
      annotations: readOnlyToolAnnotations()
    },
    {
      name: "pocket_daw_create_from_chordsmith",
      description: "Convert PCS1/raw Pocket Chordsmith/Pocket DJ JSON into a Pocket DAW project.",
      inputSchema: objectSchema({ text: stringSchema(), inputPath: stringSchema(), outputPath: stringSchema() }),
      annotations: writeOnlyWhenOutputPathAnnotations()
    },
    {
      name: "pocket_daw_arrange_midi",
      description: "Arrange a MIDI file into a Chordsmith-style Pocket DAW project using a heavy-metal preset.",
      inputSchema: objectSchema({
        midiPath: stringSchema(),
        baseProjectPath: stringSchema(),
        outputPath: stringSchema(),
        title: stringSchema(),
        style: { type: "string", enum: ["heavy_metal"] },
        keepRawMidiClip: booleanSchema()
      }, ["midiPath"]),
      annotations: writeOnlyWhenOutputPathAnnotations()
    },
    {
      name: "pocket_daw_release_master",
      description: "Render, analyse, master and export a schema-16 Pocket Chordsmith song or a Pocket DAW project with an embedded source song using Pocket Audio Core release profiles.",
      inputSchema: objectSchema({
        inputPath: stringSchema(),
        projectPath: stringSchema(),
        text: stringSchema(),
        outputPath: stringSchema(),
        profile: stringSchema(),
        scope: { type: "string", enum: ["sequence", "section", "all"] },
        export: stringSchema(),
        force: booleanSchema(),
        analyzeOnly: booleanSchema(),
        albumConsistency: booleanSchema()
      }, ["outputPath"]),
      annotations: writeOnlyWhenOutputPathAnnotations()
    },
    {
      name: "pocket_daw_apply_commands",
      description: "Apply a typed batch of safe Pocket DAW edit commands. Writes only when outputPath is provided.",
      inputSchema: objectSchema(
        { projectPath: stringSchema(), raw: stringSchema(), commands: arraySchema(commandSchema()), outputPath: stringSchema() },
        ["commands"]
      ),
      annotations: writeOnlyWhenOutputPathAnnotations()
    },
    {
      name: "pocket_daw_export_plan",
      description: "Summarize stem, section-loop and game-pack export plans without WebAudio/native rendering.",
      inputSchema: objectSchema({ projectPath: stringSchema(), raw: stringSchema() }),
      annotations: readOnlyToolAnnotations()
    },
    {
      name: "pocket_daw_verify_game_pack",
      description: "Verify an existing Godot/Web game-pack ZIP against its manifest, embedded source project and WAV-only codec boundary.",
      inputSchema: objectSchema({
        zipPath: stringSchema(),
        kind: { type: "string", enum: ["godot-adaptive-pack", "web-game-pack"] }
      }, ["zipPath"]),
      annotations: readOnlyToolAnnotations()
    },
    {
      name: "pocket_daw_live_status",
      description: "Read status from a running installed Pocket DAW app when its live bridge is enabled.",
      inputSchema: objectSchema({ sessionPath: stringSchema() }),
      annotations: readOnlyToolAnnotations()
    },
    {
      name: "pocket_daw_live_control",
      description: "Control a running Pocket DAW app transport, selection, or saved-project save through the tokened local live bridge.",
      inputSchema: objectSchema({
        action: {
          type: "string",
          enum: ["play", "pause", "stop", "restart", "midi_panic", "seek_bar", "save_current", "select_track", "select_clip", "open_project"]
        },
        projectPath: stringSchema(),
        bar: numberSchema(),
        trackId: stringSchema(),
        clipId: stringSchema(),
        sessionPath: stringSchema()
      }, ["action"]),
      annotations: liveControlToolAnnotations()
    },
    {
      name: "pocket_daw_live_performance",
      description: "Start, stop, reset, sample, or read bounded live performance diagnostics from a running Pocket DAW app through the tokened live bridge.",
      inputSchema: objectSchema({
        action: {
          type: "string",
          enum: ["status", "start", "sample", "stop", "reset"]
        },
        maxSamples: numberSchema(),
        sessionPath: stringSchema()
      }),
      annotations: liveControlToolAnnotations()
    },
    {
      name: "pocket_daw_live_apply_commands",
      description: "Apply deterministic safe mixer edits to a running Pocket DAW app through the tokened local live bridge.",
      inputSchema: objectSchema({
        commands: arraySchema(liveCommandSchema()),
        sessionPath: stringSchema()
      }, ["commands"]),
      annotations: liveControlToolAnnotations()
    }
  ];
}

function readProject(args: unknown) {
  const options = asRecord(args);
  const project = loadProject(options);
  return {
    ok: true,
    summary: summarizeProject(project),
    project: options.includeProject === true ? project : undefined
  };
}

function validateProject(args: unknown) {
  const project = loadProject(asRecord(args));
  return {
    summary: summarizeProject(project),
    ...validatePocketDawProject(project)
  };
}

function createFromChordsmith(args: unknown) {
  const options = asRecord(args);
  const text = typeof options.text === "string" ? options.text : readTextInput(options.inputPath);
  const result = importTextToProject(text);
  const outputPath = stringValue(options.outputPath);
  if (outputPath) writeProjectFile(outputPath, result.project);
  return {
    ok: true,
    message: result.message,
    written: outputPath || null,
    summary: summarizeProject(result.project),
    project: outputPath ? undefined : result.project
  };
}

function arrangeMidi(args: unknown) {
  const options = asRecord(args);
  const midiPath = resolveUserPath(options.midiPath);
  const baseProjectPath = stringValue(options.baseProjectPath);
  const baseProject = baseProjectPath ? loadProject({ projectPath: baseProjectPath }) : null;
  const bytes = new Uint8Array(readFileSync(midiPath));
  const result = arrangeMidiToHeavyMetalProject(bytes, {
    title: stringValue(options.title) || undefined,
    fileName: midiPath,
    style: stringValue(options.style) || "heavy_metal",
    keepRawMidiClip: options.keepRawMidiClip === false ? false : true,
    baseProject
  });
  const outputPath = stringValue(options.outputPath);
  if (outputPath) writeProjectFile(outputPath, result.project);
  return {
    ok: true,
    written: outputPath || null,
    extraction: result.extraction,
    warnings: result.warnings,
    summary: summarizeProject(result.project),
    project: outputPath ? undefined : result.project
  };
}

async function releaseMaster(args: unknown) {
  const options = asRecord(args);
  const outputPath = stringValue(options.outputPath);
  if (!outputPath) throw new Error("pocket_daw_release_master requires outputPath because it writes release artifacts.");
  const outDir = resolveUserPath(outputPath, { mustExist: false });
  mkdirSync(outDir, { recursive: true });
  const inputPath = await prepareReleaseMasterInput(options, outDir);
  const { batchMasterRelease } = await import("../../../../packages/pocket-audio-core/src/mastering/batch-release.js");
  const result = await batchMasterRelease({
    input: inputPath,
    out: outDir,
    profile: stringValue(options.profile) || "spotify_lofi_chill",
    scope: stringValue(options.scope) || "sequence",
    export: stringValue(options.export) || "wav24,stems,report",
    force: options.force === true,
    analyzeOnly: options.analyzeOnly === true,
    albumConsistency: options.albumConsistency === false ? false : true
  });
  return {
    ok: result.manifest.status !== "FAIL",
    status: result.manifest.status,
    outDir: result.outDir,
    inputPath,
    manifest: result.manifest,
    reports: result.reports.map((report: {
      title: string;
      qc: { status: string; warnings: string[]; failures: string[] };
      postAnalysis: { integratedLufs: number | null; truePeakDbtp: number | null; clippedSamples: number; nonFiniteSamples: number };
      masterSettings: { loudnessTargetStatus?: string; limiterGainReductionDb?: number };
      outputs: Record<string, string>;
    }) => ({
      title: report.title,
      status: report.qc.status,
      warnings: report.qc.warnings,
      failures: report.qc.failures,
      integratedLufs: report.postAnalysis.integratedLufs,
      truePeakDbtp: report.postAnalysis.truePeakDbtp,
      clippedSamples: report.postAnalysis.clippedSamples,
      nonFiniteSamples: report.postAnalysis.nonFiniteSamples,
      loudnessTargetStatus: report.masterSettings.loudnessTargetStatus,
      limiterGainReductionDb: report.masterSettings.limiterGainReductionDb,
      outputs: report.outputs
    }))
  };
}

function applyCommands(args: unknown) {
  const options = asRecord(args);
  const commands = Array.isArray(options.commands) ? options.commands as PocketDawMcpCommand[] : [];
  if (!commands.length) throw new Error("pocket_daw_apply_commands requires a non-empty commands array.");
  let state = stateForProject(loadProject(options));
  const statuses: string[] = [];
  for (const command of commands) {
    state = applyCommand(state, command);
    statuses.push(state.status);
  }
  const project = state.undoStack.present;
  const outputPath = stringValue(options.outputPath);
  if (outputPath) writeProjectFile(outputPath, project);
  return {
    ok: true,
    written: outputPath || null,
    commandCount: commands.length,
    statuses,
    summary: summarizeProject(project),
    project: outputPath ? undefined : project
  };
}

function exportPlan(args: unknown) {
  const project = loadProject(asRecord(args));
  return {
    ok: true,
    summary: summarizeProject(project),
    stems: createStemExportPlan(project),
    sectionLoops: createSectionLoopMetadata(project),
    gamePacks: {
      godot: createGameExportManifest(project, "godot-adaptive-pack"),
      web: createGameExportManifest(project, "web-game-pack")
    },
    gamePackDeliveryTargets: createGamePackDeliveryTargets()
  };
}

async function verifyGamePack(args: unknown) {
  const options = asRecord(args);
  const zipPath = resolveUserPath(options.zipPath);
  const kind = stringValue(options.kind);
  const verifier = await import("../../scripts/verify-game-pack.mjs") as {
    verifyGamePackZip: (zipPath: string, options?: { kind?: string }) => unknown;
  };
  return verifier.verifyGamePackZip(zipPath, kind ? { kind } : {});
}

async function liveStatus(args: unknown) {
  const session = readLiveSession(asRecord(args));
  if (!session.ok) return session;
  return liveFetch(session.session.statusUrl, session.session, "GET");
}

async function liveControl(args: unknown) {
  const options = asRecord(args);
  const session = readLiveSession(options);
  if (!session.ok) return session;
  const body = { ...options };
  delete body.sessionPath;
  return liveFetch(session.session.controlUrl, session.session, "POST", body);
}

async function livePerformance(args: unknown) {
  const options = asRecord(args);
  const session = readLiveSession(options);
  if (!session.ok) return session;
  const mode = stringValue(options.action) || "status";
  const body: Record<string, unknown> = {
    action: "performance_diagnostics",
    mode
  };
  if (options.maxSamples !== undefined) body.maxSamples = options.maxSamples;
  return liveFetch(session.session.controlUrl, session.session, "POST", body);
}

async function liveApplyCommands(args: unknown) {
  const options = asRecord(args);
  const session = readLiveSession(options);
  if (!session.ok) return session;
  const commands = Array.isArray(options.commands) ? options.commands as PocketDawLiveCommand[] : [];
  if (!commands.length) throw new Error("pocket_daw_live_apply_commands requires a non-empty commands array.");
  return liveFetch(session.session.controlUrl, session.session, "POST", {
    action: "apply_commands",
    commands
  });
}

function readLiveSession(options: Record<string, unknown>): { ok: true; session: Required<Pick<PocketDawLiveSession, "statusUrl" | "controlUrl" | "token">> & PocketDawLiveSession } | { ok: false; available: false; code: string; message: string; sessionPath: string } {
  const sessionPath = stringValue(options.sessionPath) || POCKET_DAW_LIVE_SESSION_FILE;
  if (!existsSync(sessionPath)) {
    return {
      ok: false,
      available: false,
      code: "app_not_running",
      message: "Pocket DAW live bridge session file was not found. Open the installed app and enable Help > AI / MCP Bridge.",
      sessionPath
    };
  }
  try {
    const session = JSON.parse(readFileSync(sessionPath, "utf8")) as PocketDawLiveSession;
    if (!session.statusUrl || !session.controlUrl || !session.token) {
      return {
        ok: false,
        available: false,
        code: "invalid_session",
        message: "Pocket DAW live bridge session file is missing statusUrl, controlUrl, or token.",
        sessionPath
      };
    }
    return {
      ok: true,
      session: {
        ...session,
        statusUrl: session.statusUrl,
        controlUrl: session.controlUrl,
        token: session.token,
        sessionPath
      }
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      code: "invalid_session",
      message: error instanceof Error ? error.message : "Could not read Pocket DAW live bridge session file.",
      sessionPath
    };
  }
}

async function liveFetch(url: string, session: Pick<PocketDawLiveSession, "token">, method: "GET" | "POST", body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.token || ""}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    const parsed = (text.trim() ? JSON.parse(text) : {}) as Record<string, unknown>;
    return {
      ...parsed,
      httpStatus: response.status,
      ok: response.ok && parsed.ok !== false
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      code: error instanceof Error && error.name === "AbortError" ? "app_timeout" : "app_unavailable",
      message: error instanceof Error ? error.message : "Pocket DAW live bridge is unavailable."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function applyCommand(state: AppState, command: PocketDawMcpCommand): AppState {
  switch (command.type) {
    case "set_track_volume":
      return setTrackVolumeCommand(state, command.trackId, command.volume);
    case "set_track_pan":
      return setTrackPanCommand(state, command.trackId, command.pan);
    case "set_track_folder":
      return setTrackFolderCommand(state, command.trackId, command.folderId || null);
    case "toggle_folder_expanded":
      return toggleFolderExpandedCommand(state, command.folderId);
    case "toggle_track_mute":
      return toggleTrackMuteCommand(state, command.trackId);
    case "toggle_track_solo":
      return toggleTrackSoloCommand(state, command.trackId);
    case "set_recording_input_channel":
      return setTrackRecordingInputChannelCommand(state, command.trackId, recordingInputChannelValueFromMcpCommand(command), command.deviceId ?? undefined);
    case "move_clip_to_bar":
      return moveClipToBarCommand(state, command.clipId, command.startBar);
    case "set_timeline_selection":
      return setTimelineSelectionRangeCommand(state, command.startBar, command.endBar);
    case "set_punch_range":
      return setPunchRangeCommand(state, command.startBar, command.endBar);
    case "set_timeline_selection_to_clip":
      return setTimelineSelectionToSelectedClipCommand({ ...state, selectedClipId: command.clipId });
    case "set_timeline_selection_to_loop":
      return setTimelineSelectionToLoopCommand(state);
    case "clear_timeline_selection":
      return clearTimelineSelectionCommand(state);
    case "split_timeline_selection":
      return splitTimelineSelectionCommand(state);
    case "crop_clip_to_timeline_selection":
      return cropSelectedClipToTimelineSelectionCommand({ ...state, selectedClipId: command.clipId });
    case "delete_clip_range":
      return deleteSelectedClipRangeCommand({ ...state, selectedClipId: command.clipId });
    case "ripple_delete_clip_range":
      return rippleDeleteSelectedClipRangeCommand({ ...state, selectedClipId: command.clipId });
    case "ripple_delete_timeline_selection":
      return rippleDeleteTimelineSelectionCommand(state);
    case "apply_audio_clip_action":
      return applySelectedAudioClipActionCommand(state, command.clipId, command.action);
    case "activate_audio_take":
      return activateAudioTakeCommand(state, command.clipId);
    case "activate_audio_take_lane":
      return activateAudioTakeLaneCommand(state, command.clipId);
    case "set_audio_take_archived":
      return setAudioTakeArchivedCommand(state, command.clipId, command.archived);
    case "comp_audio_take_from_bar":
      return compAudioTakeFromPlayheadCommand({ ...state, playheadBar: command.bar }, command.clipId);
    case "place_punch_recording_clip":
      return placePunchRecordingClipCommand(state, command.mediaPoolItemId, command.trackId, command.captureStartBar, command.punchStartBar, command.punchEndBar);
    case "place_punch_recording_clip_from_range":
      return placePunchRecordingClipFromRangeCommand(state, command.mediaPoolItemId, command.trackId, command.captureStartBar);
    case "add_marker":
      return addMarkerAtPlayheadCommand({ ...state, playheadBar: command.bar });
    case "add_game_state_marker":
      return addGameStateMarkerAtPlayheadCommand({ ...state, playheadBar: command.bar }, command.gameState);
    case "set_section_bars":
      return setSectionBarsCommand(state, command.sectionId, command.bars);
    case "set_section_chord":
      return setSectionChordCommand(state, command.sectionId, command.barIndex, command.degree);
    case "cycle_drum_step":
      return cycleDrumStepCommand(state, command.sectionId, command.lane, command.step);
    case "branch_generated_drums":
      return branchGeneratedDrumsCommand(state);
    case "convert_midi_drums":
      return convertMidiDrumsToBranchOverlaysCommand(state, command.clipId, command.sectionId || state.chordsmithEditorSectionId || "A");
    case "convert_midi_bass":
      return convertMidiBassToGeneratedOverlaysCommand(state, command.clipId, command.sectionId || state.chordsmithEditorSectionId || "A");
    case "convert_midi_chords":
      return convertMidiChordsToGeneratedOverlaysCommand(state, command.clipId, command.sectionId || state.chordsmithEditorSectionId || "A");
    case "convert_midi_melody":
      return convertMidiMelodyToGeneratedOverlaysCommand(state, command.clipId, command.sectionId || state.chordsmithEditorSectionId || "A", command.trackIndex || 0);
    case "convert_midi_arrangement":
      return convertMidiArrangementToGeneratedOverlaysCommand(state, command.clipId, command.sectionId || state.chordsmithEditorSectionId || "A", command.trackIndex || 0);
    case "adopt_midi_tempo":
      return adoptMidiTempoMapStartCommand(state, command.clipId);
    case "adopt_midi_tempo_map":
      return adoptMidiTempoMapAutomationCommand(state, command.clipId);
    case "adopt_midi_meter_map":
      return adoptMidiMeterMapCommand(state, command.clipId);
    case "cycle_drum_branch_step":
      return cycleDrumBranchStepCommand(state, command.sectionId, command.lane, command.step);
    case "set_drum_lane_volume":
      return setDrumLaneVolumeCommand(state, command.lane, command.volume);
    case "set_drum_lane_pan":
      return setDrumLanePanCommand(state, command.lane, command.pan);
    case "set_drum_lane_gate":
      return setDrumLaneGateCommand(state, command.lane, command.gate);
    case "set_drum_lane_mute":
      return setDrumLaneMuteCommand(state, command.lane, command.mute);
    case "cycle_bass_step":
      return cycleBassStepCommand(state, command.sectionId, command.step);
    case "cycle_melody_step":
      return cycleMelodyStepCommand(state, command.sectionId, command.trackIndex, command.step);
    case "ensure_project_automation":
      return ensureProjectAutomationLaneCommand(state, command.field);
    case "add_project_automation_point":
      return addProjectAutomationPointCommand({ ...state, playheadBar: command.bar || state.playheadBar }, command.field);
    case "add_project_meter_map_point":
      return addProjectMeterMapPointCommand({ ...state, playheadBar: command.bar || state.playheadBar }, {
        bar: command.bar,
        numerator: command.numerator,
        denominator: command.denominator
      });
    case "update_project_meter_map_point":
      return updateProjectMeterMapPointCommand(state, command.pointId, {
        bar: command.bar,
        numerator: command.numerator,
        denominator: command.denominator
      });
    case "delete_project_meter_map_point":
      return deleteProjectMeterMapPointCommand(state, command.pointId);
    case "update_automation_point":
      return updateAutomationPointCommand(state, command.laneId, command.pointIndex, command.bar, command.value, command.curve);
    case "ensure_fx_automation":
      return ensureFxAutomationLaneCommand(state, command.chainId, command.slotId, command.parameter);
    case "add_fx_automation_point":
      return addFxAutomationPointCommand({ ...state, playheadBar: command.bar || state.playheadBar }, command.chainId, command.slotId, command.parameter);
    case "set_fx_parameter":
      return setFxSlotParameterCommand(state, command.chainId, command.slotId, command.parameter, command.value);
    default:
      throw new Error(`Unsupported Pocket DAW MCP command: ${(command as { type?: string }).type || "[missing type]"}`);
  }
}

function recordingInputChannelValueFromMcpCommand(command: Extract<PocketDawMcpCommand, { type: "set_recording_input_channel" }>): string {
  if (command.mode === "stereo") {
    const pair = Array.isArray(command.channelPair) ? command.channelPair : [0, 1];
    return `stereo:${Math.max(0, Math.floor(Number(pair[0]) || 0))}:${Math.max(0, Math.floor(Number(pair[1]) || 1))}`;
  }
  if (command.mode === "split-mono") return `split-mono:${Math.max(0, Math.floor(Number(command.channelIndex) || 0))}`;
  return `mono:${Math.max(0, Math.floor(Number(command.channelIndex) || 0))}`;
}

function loadProject(input: ProjectInput): PocketDawProject {
  const raw = typeof input.raw === "string" ? input.raw : readTextInput(input.projectPath);
  return loadPocketDawRaw(raw);
}

function readTextInput(path: unknown): string {
  const resolved = resolveUserPath(path);
  return readFileSync(resolved, "utf8");
}

function writeProjectFile(path: string, project: PocketDawProject) {
  const resolved = resolveUserPath(path, { mustExist: false });
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, buildPocketDawProjectFile(project));
}

async function prepareReleaseMasterInput(options: Record<string, unknown>, outDir: string): Promise<string> {
  const inputPath = stringValue(options.inputPath);
  if (inputPath) return inputPath.includes("*") ? normalize(isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath)) : resolveUserPath(inputPath);
  const text = typeof options.text === "string" ? options.text : nativeSourceTextFromDawProject(options.projectPath);
  const parsed = JSON.parse(text) as { title?: string; projectVersion?: number; schemaVersion?: number };
  const version = Number(parsed.projectVersion ?? parsed.schemaVersion);
  if (version !== 16) throw new Error(`pocket_daw_release_master requires native schema-16 source JSON; got schema ${Number.isFinite(version) ? version : "unknown"}.`);
  const inputDir = join(outDir, "source-projects");
  mkdirSync(inputDir, { recursive: true });
  const stem = sanitizeMcpFileStem(parsed.title || "pocket-daw-release-source");
  const path = join(inputDir, `${stem}.mcp-source.json`);
  writeFileSync(path, JSON.stringify(parsed, null, 2));
  return path;
}

function nativeSourceTextFromDawProject(projectPath: unknown): string {
  const project = loadProject({ projectPath: stringValue(projectPath) || undefined }) as PocketDawProject & {
    sourceRefs?: Array<{ original?: unknown; schemaVersion?: number; sourceType?: string; title?: string }>;
  };
  const source = (project.sourceRefs || []).find((item) => (
    item.original &&
    item.sourceType === "pocket-chordsmith" &&
    Number((item.original as { projectVersion?: number; schemaVersion?: number }).projectVersion ?? (item.original as { schemaVersion?: number }).schemaVersion ?? item.schemaVersion) === 16
  ));
  if (!source?.original) {
    throw new Error("Pocket DAW project does not contain an embedded native schema-16 Pocket Chordsmith source.");
  }
  return JSON.stringify(source.original);
}

function sanitizeMcpFileStem(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "pocket-daw-release-source";
}

function resolveUserPath(path: unknown, { mustExist = true } = {}) {
  if (typeof path !== "string" || !path.trim()) throw new Error("A file path is required.");
  const resolved = normalize(isAbsolute(path) ? path : resolve(process.cwd(), path));
  if (mustExist && !existsSync(resolved)) throw new Error(`File does not exist: ${resolved}`);
  return resolved;
}

function stateForProject(project: PocketDawProject): AppState {
  const initial = createInitialState();
  return loadProjectIntoState(initial, project, {
    status: "Loaded by Pocket DAW MCP.",
    currentFile: { path: null, label: project.project.title || "Pocket DAW MCP project" }
  });
}

function summarizeProject(project: PocketDawProject) {
  return {
    app: project.app,
    schemaVersion: project.schemaVersion,
    dawVersion: project.dawVersion,
    currentDawVersion: POCKET_DAW_VERSION,
    currentSchemaVersion: POCKET_DAW_SCHEMA_VERSION,
    title: project.project.title,
    bpm: project.project.bpm,
    key: project.project.key,
    scale: project.project.scale,
    timeSig: project.project.timeSig,
    meterMapPointCount: project.project.meterMap?.length || 0,
    meterMap: project.project.meterMap || [],
    bars: project.timeline.bars,
    timelineSelection: project.timeline.selection || null,
    trackCount: project.tracks.length,
    clipCount: project.timeline.clips.length,
    mediaPoolCount: project.mediaPool.length,
    audioTakeSummary: createAudioTakeDiagnosticsSummary(project),
    recordingInputPreflight: buildNativeRecordingAlphaInputPreflight(project),
    recordingFutureCapturePlan: buildGroupedRecordingCapturePlan(project, {
      requestedStartBar: 1,
      recordingSessionId: "mcp-preview",
      takeGroupId: "mcp-preview-take-group"
    }),
    tracks: project.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      role: track.role,
      type: track.trackType,
      volume: track.volume,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo,
      folderId: track.folderId || null,
      folderExpanded: track.trackType === "folder" ? track.metadata?.folderExpanded !== false : undefined
    })),
    clips: project.timeline.clips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      type: clip.type,
      trackId: clip.trackId,
      startBar: clip.startBar,
      barLength: clip.barLength,
      sectionId: clip.sectionId,
      takeGroupId: typeof clip.metadata?.recordingTakeGroupId === "string" ? clip.metadata.recordingTakeGroupId : clip.metadata?.takeGroupId,
      takeStatus: clip.metadata?.takeStatus,
      takeLaneId: clip.metadata?.takeLaneId,
      punchStartBar: clip.metadata?.punchStartBar,
      punchEndBar: clip.metadata?.punchEndBar,
      captureStartBar: clip.metadata?.captureStartBar,
      audioWarpMarkerCount: Array.isArray(clip.metadata?.audioWarpMarkers) ? clip.metadata.audioWarpMarkers.length : undefined
    }))
  };
}

function validatePocketDawProject(project: PocketDawProject): { ok: boolean; errors: string[]; warnings: string[] } {
  const invariants = validateProjectInvariants(project);
  const warnings: string[] = [];
  if (project.schemaVersion !== POCKET_DAW_SCHEMA_VERSION) warnings.push(`Project schemaVersion ${project.schemaVersion} will migrate to ${POCKET_DAW_SCHEMA_VERSION}.`);
  return {
    ok: invariants.ok,
    errors: invariants.errors.map((issue) => issue.message),
    warnings: [...warnings, ...invariants.warnings.map((issue) => issue.message)]
  };
}

function jsonToolResult(value: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(stripUndefined(value), null, 2)
      }
    ]
  };
}

function stripUndefined(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  const schema: Record<string, unknown> = {
    type: "object",
    properties,
    additionalProperties: false
  };
  if (required.length) schema.required = required;
  return schema;
}

function stringSchema() {
  return { type: "string" };
}

function booleanSchema() {
  return { type: "boolean" };
}

function arraySchema(items: Record<string, unknown>) {
  return { type: "array", items };
}

function commandSchema() {
  return objectSchema(
    {
      type: {
        type: "string",
        enum: [
          "set_track_volume",
          "set_track_pan",
          "set_track_folder",
          "toggle_folder_expanded",
          "toggle_track_mute",
          "toggle_track_solo",
          "set_recording_input_channel",
          "move_clip_to_bar",
          "set_timeline_selection",
          "set_punch_range",
          "place_punch_recording_clip_from_range",
          "set_timeline_selection_to_clip",
          "set_timeline_selection_to_loop",
          "clear_timeline_selection",
          "split_timeline_selection",
          "crop_clip_to_timeline_selection",
          "delete_clip_range",
          "ripple_delete_clip_range",
          "ripple_delete_timeline_selection",
          "apply_audio_clip_action",
          "activate_audio_take",
          "activate_audio_take_lane",
          "set_audio_take_archived",
          "comp_audio_take_from_bar",
          "place_punch_recording_clip",
          "place_punch_recording_clip_from_range",
          "add_marker",
          "add_game_state_marker",
          "set_section_bars",
          "set_section_chord",
          "cycle_drum_step",
          "branch_generated_drums",
          "convert_midi_drums",
          "convert_midi_bass",
          "convert_midi_chords",
          "convert_midi_melody",
          "convert_midi_arrangement",
          "adopt_midi_tempo",
          "adopt_midi_tempo_map",
          "adopt_midi_meter_map",
          "cycle_drum_branch_step",
          "set_drum_lane_volume",
          "set_drum_lane_pan",
          "set_drum_lane_gate",
          "set_drum_lane_mute",
          "cycle_bass_step",
          "cycle_melody_step",
          "ensure_project_automation",
          "add_project_automation_point",
          "add_project_meter_map_point",
          "update_project_meter_map_point",
          "delete_project_meter_map_point",
          "update_automation_point",
          "ensure_fx_automation",
          "add_fx_automation_point",
          "set_fx_parameter"
        ]
      },
      trackId: stringSchema(),
      deviceId: { oneOf: [stringSchema(), { type: "null" }] },
      mode: { type: "string", enum: ["mono", "split-mono", "stereo"] },
      channelIndex: numberSchema(),
      channelPair: arraySchema(numberSchema()),
      folderId: { oneOf: [stringSchema(), { type: "null" }] },
      clipId: stringSchema(),
      mediaPoolItemId: stringSchema(),
      sectionId: stringSchema(),
      laneId: stringSchema(),
      pointId: stringSchema(),
      chainId: stringSchema(),
      slotId: stringSchema(),
      lane: { type: "string", enum: [...DRUM_LANE_IDS] },
      gameState: { type: "string", enum: [...GAME_STATE_MARKERS] },
      action: {
        type: "string",
        enum: ["normalize-gain", "reset-fades", "quick-fade", "crossfade-overlap", "create-crossfade-left", "invert-phase", "reverse", "analyze-transients", "create-warp-markers", "quantize-warp-markers", "clear-warp-markers"]
      },
      parameter: stringSchema(),
      field: { type: "string", enum: ["tempo"] },
      curve: { type: "string", enum: ["linear", "hold", "ease-in", "ease-out"] },
      volume: numberSchema(),
      pan: numberSchema(),
      gate: numberSchema(),
      mute: booleanSchema(),
      archived: booleanSchema(),
      startBar: numberSchema(),
      endBar: numberSchema(),
      captureStartBar: numberSchema(),
      punchStartBar: numberSchema(),
      punchEndBar: numberSchema(),
      bar: numberSchema(),
      bars: numberSchema(),
      barIndex: numberSchema(),
      degree: numberSchema(),
      step: numberSchema(),
      trackIndex: numberSchema(),
      pointIndex: numberSchema(),
      numerator: numberSchema(),
      denominator: numberSchema(),
      value: { oneOf: [numberSchema(), booleanSchema()] }
    },
    ["type"]
  );
}

function liveCommandSchema() {
  return objectSchema(
    {
      type: {
        type: "string",
        enum: ["set_track_volume", "set_track_pan", "set_track_mute", "set_track_solo", "set_track_input", "set_track_armed", "set_track_monitor", "set_recording_input_channel", "set_punch_range", "set_timeline_selection", "set_timeline_selection_to_clip", "clear_timeline_selection", "split_timeline_selection", "crop_clip_to_timeline_selection", "delete_clip_range", "ripple_delete_clip_range", "ripple_delete_timeline_selection", "activate_audio_take_lane", "set_audio_take_archived", "comp_audio_take_from_bar", "place_punch_recording_clip_from_range"]
      },
      trackId: stringSchema(),
      clipId: stringSchema(),
      mediaPoolItemId: stringSchema(),
      inputDeviceId: stringSchema(),
      deviceId: stringSchema(),
      mode: { type: "string", enum: ["mono", "split-mono", "stereo"] },
      channelIndex: numberSchema(),
      channelPair: { type: "array", items: numberSchema(), minItems: 2, maxItems: 2 },
      volume: numberSchema(),
      pan: numberSchema(),
      mute: booleanSchema(),
      solo: booleanSchema(),
      armed: booleanSchema(),
      monitorEnabled: booleanSchema(),
      archived: booleanSchema(),
      bar: numberSchema(),
      startBar: numberSchema(),
      endBar: numberSchema(),
      captureStartBar: numberSchema()
    },
    ["type"]
  );
}

function numberSchema() {
  return { type: "number" };
}

function readOnlyToolAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false
  };
}

function writeOnlyWhenOutputPathAnnotations() {
  return {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false
  };
}

function liveControlToolAnnotations() {
  return {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false
  };
}
