import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import {
  addMarkerAtPlayheadCommand,
  commitProject,
  cycleBassStepCommand,
  cycleDrumStepCommand,
  cycleMelodyStepCommand,
  importTextToProject,
  loadPocketDawRaw,
  moveClipToBarCommand,
  setFxSlotParameterCommand,
  setSectionBarsCommand,
  setSectionChordCommand,
  setTrackPanCommand,
  setTrackVolumeCommand,
  toggleTrackMuteCommand
} from "../app/commands.ts";
import { createInitialState, loadProjectIntoState, type AppState } from "../app/state.ts";
import { buildPocketDawProjectFile } from "../daw/dawProject.ts";
import { createGameExportManifest, createSectionLoopMetadata, createStemExportPlan } from "../daw/exportJobs.ts";
import { POCKET_DAW_SCHEMA_VERSION, POCKET_DAW_VERSION, type PocketDawProject } from "../daw/schema.ts";

export const POCKET_DAW_MCP_TOOLS = [
  "pocket_daw_read_project",
  "pocket_daw_validate_project",
  "pocket_daw_create_from_chordsmith",
  "pocket_daw_apply_commands",
  "pocket_daw_export_plan"
] as const;

export type PocketDawMcpTool = (typeof POCKET_DAW_MCP_TOOLS)[number];

export type PocketDawMcpCommand =
  | { type: "set_track_volume"; trackId: string; volume: number }
  | { type: "set_track_pan"; trackId: string; pan: number }
  | { type: "toggle_track_mute"; trackId: string }
  | { type: "move_clip_to_bar"; clipId: string; startBar: number }
  | { type: "add_marker"; bar: number }
  | { type: "set_section_bars"; sectionId: string; bars: number }
  | { type: "set_section_chord"; sectionId: string; barIndex: number; degree: number }
  | { type: "cycle_drum_step"; sectionId: string; lane: "kick" | "snare" | "hat"; step: number }
  | { type: "cycle_bass_step"; sectionId: string; step: number }
  | { type: "cycle_melody_step"; sectionId: string; trackIndex: number; step: number }
  | { type: "set_fx_parameter"; chainId: string; slotId: string; parameter: string; value: number | boolean };

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
    case "pocket_daw_apply_commands":
      return jsonToolResult(applyCommands(args));
    case "pocket_daw_export_plan":
      return jsonToolResult(exportPlan(args));
    default:
      throw new Error(`Unknown Pocket DAW MCP tool: ${name}`);
  }
}

export function pocketDawMcpToolList() {
  return [
    {
      name: "pocket_daw_read_project",
      description: "Load, migrate and summarize a Pocket DAW project without modifying it.",
      inputSchema: objectSchema({ projectPath: stringSchema(), raw: stringSchema(), includeProject: booleanSchema() })
    },
    {
      name: "pocket_daw_validate_project",
      description: "Validate a Pocket DAW project and return schema/invariant warnings without modifying it.",
      inputSchema: objectSchema({ projectPath: stringSchema(), raw: stringSchema() })
    },
    {
      name: "pocket_daw_create_from_chordsmith",
      description: "Convert PCS1/raw Pocket Chordsmith/Pocket DJ JSON into a Pocket DAW project.",
      inputSchema: objectSchema({ text: stringSchema(), inputPath: stringSchema(), outputPath: stringSchema() })
    },
    {
      name: "pocket_daw_apply_commands",
      description: "Apply a typed batch of safe Pocket DAW edit commands. Writes only when outputPath is provided.",
      inputSchema: objectSchema({ projectPath: stringSchema(), raw: stringSchema(), commands: { type: "array" }, outputPath: stringSchema() })
    },
    {
      name: "pocket_daw_export_plan",
      description: "Summarize stem, section-loop and game-pack export plans without WebAudio/native rendering.",
      inputSchema: objectSchema({ projectPath: stringSchema(), raw: stringSchema() })
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
    ok: true,
    summary: summarizeProject(project),
    warnings: validatePocketDawProject(project)
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
    }
  };
}

function applyCommand(state: AppState, command: PocketDawMcpCommand): AppState {
  switch (command.type) {
    case "set_track_volume":
      return setTrackVolumeCommand(state, command.trackId, command.volume);
    case "set_track_pan":
      return setTrackPanCommand(state, command.trackId, command.pan);
    case "toggle_track_mute":
      return toggleTrackMuteCommand(state, command.trackId);
    case "move_clip_to_bar":
      return moveClipToBarCommand(state, command.clipId, command.startBar);
    case "add_marker":
      return addMarkerAtPlayheadCommand({ ...state, playheadBar: command.bar });
    case "set_section_bars":
      return setSectionBarsCommand(state, command.sectionId, command.bars);
    case "set_section_chord":
      return setSectionChordCommand(state, command.sectionId, command.barIndex, command.degree);
    case "cycle_drum_step":
      return cycleDrumStepCommand(state, command.sectionId, command.lane, command.step);
    case "cycle_bass_step":
      return cycleBassStepCommand(state, command.sectionId, command.step);
    case "cycle_melody_step":
      return cycleMelodyStepCommand(state, command.sectionId, command.trackIndex, command.step);
    case "set_fx_parameter":
      return setFxSlotParameterCommand(state, command.chainId, command.slotId, command.parameter, command.value);
    default:
      throw new Error(`Unsupported Pocket DAW MCP command: ${(command as { type?: string }).type || "[missing type]"}`);
  }
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
    bars: project.timeline.bars,
    trackCount: project.tracks.length,
    clipCount: project.timeline.clips.length,
    mediaPoolCount: project.mediaPool.length,
    tracks: project.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      role: track.role,
      type: track.trackType,
      volume: track.volume,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo
    })),
    clips: project.timeline.clips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      type: clip.type,
      trackId: clip.trackId,
      startBar: clip.startBar,
      barLength: clip.barLength,
      sectionId: clip.sectionId
    }))
  };
}

function validatePocketDawProject(project: PocketDawProject): string[] {
  const warnings: string[] = [];
  if (project.schemaVersion !== POCKET_DAW_SCHEMA_VERSION) warnings.push(`Project schemaVersion ${project.schemaVersion} will migrate to ${POCKET_DAW_SCHEMA_VERSION}.`);
  if (!project.tracks.some((track) => track.role === "master")) warnings.push("Project has no master track.");
  const trackIds = new Set(project.tracks.map((track) => track.id));
  for (const clip of project.timeline.clips) {
    if (clip.trackId && !trackIds.has(clip.trackId)) warnings.push(`Clip ${clip.id} targets missing track ${clip.trackId}.`);
    if (clip.barLength <= 0) warnings.push(`Clip ${clip.id} has non-positive barLength.`);
  }
  if (project.timeline.bars <= 0) warnings.push("Timeline bars must be greater than zero.");
  return warnings;
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

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    additionalProperties: true
  };
}

function stringSchema() {
  return { type: "string" };
}

function booleanSchema() {
  return { type: "boolean" };
}
