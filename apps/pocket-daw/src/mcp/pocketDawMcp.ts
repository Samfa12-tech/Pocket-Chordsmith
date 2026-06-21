import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
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
import { arrangeMidiToHeavyMetalProject } from "../daw/midiArrangement.ts";
import { validateProjectInvariants } from "../daw/projectInvariants.ts";
import { POCKET_DAW_SCHEMA_VERSION, POCKET_DAW_VERSION, type PocketDawProject } from "../daw/schema.ts";

export const POCKET_DAW_MCP_TOOLS = [
  "pocket_daw_read_project",
  "pocket_daw_validate_project",
  "pocket_daw_create_from_chordsmith",
  "pocket_daw_arrange_midi",
  "pocket_daw_apply_commands",
  "pocket_daw_export_plan",
  "pocket_daw_live_status",
  "pocket_daw_live_control",
  "pocket_daw_live_performance",
  "pocket_daw_live_apply_commands"
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

export type PocketDawLiveCommand =
  | { type: "set_track_volume"; trackId: string; volume: number }
  | { type: "set_track_pan"; trackId: string; pan: number }
  | { type: "set_track_mute"; trackId: string; mute: boolean }
  | { type: "set_track_solo"; trackId: string; solo: boolean };

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
    case "pocket_daw_apply_commands":
      return jsonToolResult(applyCommands(args));
    case "pocket_daw_export_plan":
      return jsonToolResult(exportPlan(args));
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
          enum: ["play", "pause", "stop", "restart", "seek_bar", "save_current", "select_track", "select_clip", "open_project"]
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
          "toggle_track_mute",
          "move_clip_to_bar",
          "add_marker",
          "set_section_bars",
          "set_section_chord",
          "cycle_drum_step",
          "cycle_bass_step",
          "cycle_melody_step",
          "set_fx_parameter"
        ]
      },
      trackId: stringSchema(),
      clipId: stringSchema(),
      sectionId: stringSchema(),
      chainId: stringSchema(),
      slotId: stringSchema(),
      lane: { type: "string", enum: ["kick", "snare", "hat"] },
      parameter: stringSchema(),
      volume: numberSchema(),
      pan: numberSchema(),
      startBar: numberSchema(),
      bar: numberSchema(),
      bars: numberSchema(),
      barIndex: numberSchema(),
      degree: numberSchema(),
      step: numberSchema(),
      trackIndex: numberSchema(),
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
        enum: ["set_track_volume", "set_track_pan", "set_track_mute", "set_track_solo"]
      },
      trackId: stringSchema(),
      volume: numberSchema(),
      pan: numberSchema(),
      mute: booleanSchema(),
      solo: booleanSchema()
    },
    ["type", "trackId"]
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
