import type { AudioEngine } from "../audio/audioEngine";
import { getCachedAudioBuffer } from "../audio/audioBufferCache";
import { createAudioMediaAnalysisSummary, createPortableMediaProject, createRenderCacheSummary, mediaPoolStatus, verifyMediaPortability, verifySharedMediaPortability, type AudioMediaAnalysisSummary, type MediaPortabilityVerification, type RenderCacheSummary, type SharedMediaPortabilityVerification } from "../daw/mediaPool";
import { validateProjectInvariants, type ProjectInvariantIssue } from "../daw/projectInvariants";
import { buildNativeRecordingAlphaInputPreflight, type RecordingInputPreflight } from "../daw/recordingInputs";
import { createRoutingExportSummary, type RoutingExportSummary } from "../daw/routing";
import { POCKET_DAW_VERSION, type Clip, type PocketDawProject } from "../daw/schema";
import { createPocketDjSourceSummary, type PocketDjSourceSummary } from "../daw/pocketDjSources";
import { createMidiChordsmithConversionPreviews, type MidiChordsmithConversionPreview } from "../daw/midiConversionPreview";
import { recordingLatencyOffsetSeconds } from "../daw/tracks";
import { currentProject, type AppState } from "./state";
import type { PerformanceDiagnosticsReport } from "./performanceDiagnostics";

export type AudioEngineDiagnostics = ReturnType<AudioEngine["getDiagnostics"]>;

export interface TesterDiagnosticsPayload {
  capturedAt: string;
  app: {
    name: "Pocket DAW";
    version: string;
    buildId: string;
    commit: string;
    runtime: string;
    platform: string;
    installerOnly: true;
  };
  project: {
    id: string;
    title: string;
    fileLabel: string;
    filePath: string | null;
    dawVersion: string;
    schemaVersion: number;
    bpm: number;
    timeSig: number;
    meterMapPointCount: number;
    meterMap: NonNullable<PocketDawProject["project"]["meterMap"]>;
    bars: number;
    clipCount: number;
    trackCount: number;
    sourceRefCount: number;
    invariantErrorCount: number;
    invariantWarningCount: number;
    invariantErrors: ProjectInvariantIssue[];
    invariantWarnings: ProjectInvariantIssue[];
    pocketDjSource: PocketDjSourceSummary | null;
    audioTakes: AudioTakeDiagnosticsSummary;
    midiChordsmithConversionPreviews: MidiChordsmithConversionPreview[];
  };
  audio: {
    playbackBackend: string;
    nativeStatus: string | null;
    nativeLastError: string | null;
    nativeCallbackCount: number | null;
    nativeLastCallbackMicros: number | null;
    nativeMaxCallbackMicros: number | null;
    nativeSlowCallbackCount: number | null;
    deviceHost: string;
    deviceCount: number;
    defaultInputId: string | null;
    defaultOutputId: string | null;
  };
  recording: {
    status: string;
    trackId: string | null;
    armedTrackIds: string[];
    monitorTrackIds: string[];
    metronomeEnabled: boolean;
    countInBars: number;
    metronomeVolume: number;
    elapsedSeconds: number;
    inputPeak: number;
    inputDeviceName: string | null;
    outputDeviceName: string | null;
    monitoring: boolean;
    message: string;
    timingConfidence: "none" | "low" | "diagnostic";
    appliedOffsetSeconds: number;
    playbackCaptureRenderedFrameCount: number | null;
    playbackStopRenderedFrameCount: number | null;
    playbackSampleRate: number | null;
    inputPreflight: RecordingInputPreflight;
    confidence: RecordingConfidenceDiagnostics;
    timingNotes: string[];
  };
  updater: {
    status: string;
    message: string;
    currentVersion: string;
    availableVersion: string | null;
    autoCheckOnStartup: boolean;
    endpoint: string;
  };
  handoff: {
    source: string | null;
    result: string;
    kind: string | null;
    receivedAt: string | null;
    message: string;
  };
  routing: RoutingExportSummary;
  media: {
    poolCount: number;
    projectMediaCount: number;
    externalReferenceCount: number;
    runtimeOnlyCount: number;
    missingCount: number;
    runtimeAvailableCount: number;
    renderCacheCount: number;
    portability: MediaPortabilityVerification;
    sharedPortability: SharedMediaPortabilityVerification;
    renderCache: RenderCacheSummary;
    analysis: AudioMediaAnalysisSummary;
    nativeRenderCache: AudioEngineDiagnostics["nativeRenderCache"];
  };
  storage: {
    projectPath: string | null;
    userDataPath: string;
  };
  performance: PerformanceDiagnosticsReport | null;
}

export interface RecordingConfidenceDiagnostics {
  projectSaved: boolean;
  selectedInputDeviceId: string | null;
  selectedInputDeviceName: string | null;
  selectedOutputDeviceId: string | null;
  selectedOutputDeviceName: string | null;
  sampleRate: number | null;
  selectedTrackChannelMode: string | null;
  selectedTrackChannelMap: number[];
  capturePlanLabels: string[];
  savedMediaRoot: string;
  latestRecordedMediaPath: string | null;
  latestRecordedMediaName: string | null;
  midiInputStatus: string;
  midiInputName: string | null;
  midiInputMessage: string;
  readyForAudioCapture: boolean;
  readyForStrictAudibleAudioEvidence: boolean;
  readyForConnectedMidiEvidence: boolean;
  blockers: string[];
  notes: string[];
}

export interface AudioTakeDiagnosticsSummary {
  groupedClipCount: number;
  groupCount: number;
  activeCount: number;
  mutedCount: number;
  archivedCount: number;
  groups: Array<{
    groupId: string;
    clipCount: number;
    activeCount: number;
    mutedCount: number;
    archivedCount: number;
    lanes: Array<{
      laneId: string;
      laneIndex: number | null;
      laneState: "active" | "muted" | "archived" | "mixed";
      clipCount: number;
      activeCount: number;
      mutedCount: number;
      archivedCount: number;
      startBar: number | null;
      endBar: number | null;
      clipIds: string[];
      clipNames: string[];
      segmentNames: string[];
      activeClipIds: string[];
    }>;
  }>;
}

const UPDATER_ENDPOINT = "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json";

export function buildTesterDiagnosticsPayload(
  state: AppState,
  audioDiagnostics: AudioEngineDiagnostics,
  options: { capturedAt?: string; runtime?: string; platform?: string; performance?: PerformanceDiagnosticsReport | null } = {}
): TesterDiagnosticsPayload {
  const project = currentProject(state);
  const mediaStatuses = project.mediaPool.map((item) => mediaPoolStatus(item));
  const projectMediaCount = mediaStatuses.filter((status) => !status.external && !status.runtimeOnly && !status.missing && !status.unresolved).length;
  const externalReferenceCount = mediaStatuses.filter((status) => status.external).length;
  const runtimeOnlyCount = mediaStatuses.filter((status) => status.runtimeOnly).length;
  const missingCount = mediaStatuses.filter((status) => status.missing || status.unresolved).length;
  const runtimeAvailableCount = project.mediaPool.filter((item) => item.kind === "audio" && !!getCachedAudioBuffer(item.id)).length;
  const devices = project.audioDeviceSettings.devices || [];
  const metronome = project.project.metronome || { enabled: false, countInBars: 1, volume: 0.55 };
  const invariants = validateProjectInvariants(project);
  const routing = createRoutingExportSummary(project);
  const recordingInputPreflight = buildNativeRecordingAlphaInputPreflight(project);

  return {
    capturedAt: options.capturedAt || new Date().toISOString(),
    app: {
      name: "Pocket DAW",
      version: POCKET_DAW_VERSION,
      buildId: runtimeBuildId(),
      commit: runtimeCommit(),
      runtime: options.runtime || runtimeLabel(),
      platform: options.platform || runtimePlatform(),
      installerOnly: true
    },
    project: {
      id: project.project.id,
      title: project.project.title,
      fileLabel: state.currentFile.label,
      filePath: state.currentFile.path,
      dawVersion: project.dawVersion,
      schemaVersion: project.schemaVersion,
      bpm: project.project.bpm,
      timeSig: project.project.timeSig,
      meterMapPointCount: project.project.meterMap?.length || 0,
      meterMap: project.project.meterMap || [],
      bars: project.timeline.bars,
      clipCount: project.timeline.clips.length,
      trackCount: project.tracks.length,
      sourceRefCount: project.sourceRefs.length,
      invariantErrorCount: invariants.errors.length,
      invariantWarningCount: invariants.warnings.length,
      invariantErrors: invariants.errors,
      invariantWarnings: invariants.warnings,
      pocketDjSource: createPocketDjSourceSummary(project),
      audioTakes: createAudioTakeDiagnosticsSummary(project),
      midiChordsmithConversionPreviews: createMidiChordsmithConversionPreviews(project)
    },
    audio: {
      playbackBackend: String(audioDiagnostics.playbackBackend),
      nativeStatus: audioDiagnostics.nativeAudio.status ? String(audioDiagnostics.nativeAudio.status) : null,
      nativeLastError: audioDiagnostics.nativeAudio.lastError,
      nativeCallbackCount: audioDiagnostics.nativeAudio.status?.callbackCount ?? null,
      nativeLastCallbackMicros: audioDiagnostics.nativeAudio.status?.lastCallbackMicros ?? null,
      nativeMaxCallbackMicros: audioDiagnostics.nativeAudio.status?.maxCallbackMicros ?? null,
      nativeSlowCallbackCount: audioDiagnostics.nativeAudio.status?.slowCallbackCount ?? null,
      deviceHost: project.audioDeviceSettings.host,
      deviceCount: devices.length,
      defaultInputId: project.audioDeviceSettings.inputDeviceId || null,
      defaultOutputId: project.audioDeviceSettings.outputDeviceId || null
    },
    recording: {
      status: state.recording.status,
      trackId: state.recording.trackId,
      armedTrackIds: project.tracks.filter((track) => track.armed).map((track) => track.id),
      monitorTrackIds: project.tracks.filter((track) => track.monitorEnabled).map((track) => track.id),
      metronomeEnabled: metronome.enabled,
      countInBars: metronome.countInBars,
      metronomeVolume: metronome.volume,
      elapsedSeconds: state.recording.elapsedSeconds,
      inputPeak: state.recording.inputPeak,
      inputDeviceName: state.recording.inputDeviceName,
      outputDeviceName: state.recording.outputDeviceName,
      monitoring: state.recording.monitoring,
      message: state.recording.message,
      timingConfidence: recordingTimingConfidence(state),
      appliedOffsetSeconds: 0,
      playbackCaptureRenderedFrameCount: state.recording.playbackCaptureAnchor?.renderedFrameCount ?? null,
      playbackStopRenderedFrameCount: state.recording.playbackStopAnchor?.renderedFrameCount ?? null,
      playbackSampleRate: state.recording.playbackCaptureAnchor?.sampleRate ?? state.recording.playbackStopAnchor?.sampleRate ?? null,
      inputPreflight: recordingInputPreflight,
      confidence: recordingConfidenceDiagnostics(state, recordingInputPreflight),
      timingNotes: recordingTimingNotes(state)
    },
    updater: {
      status: state.updaterStatus,
      message: state.updaterMessage,
      currentVersion: state.updaterCurrentVersion,
      availableVersion: state.updaterAvailableVersion,
      autoCheckOnStartup: state.updaterAutoCheckOnStartup,
      endpoint: UPDATER_ENDPOINT
    },
    handoff: {
      source: state.lastHandoff.source,
      result: state.lastHandoff.result,
      kind: state.lastHandoff.kind,
      receivedAt: state.lastHandoff.receivedAt,
      message: state.lastHandoff.message
    },
    routing,
    media: {
      poolCount: project.mediaPool.length,
      projectMediaCount,
      externalReferenceCount,
      runtimeOnlyCount,
      missingCount,
      runtimeAvailableCount,
      renderCacheCount: project.renderCache.length,
      portability: verifyMediaPortability(project),
      sharedPortability: verifySharedMediaPortability(createPortableMediaProject(project)),
      renderCache: createRenderCacheSummary(project),
      analysis: createAudioMediaAnalysisSummary(project),
      nativeRenderCache: audioDiagnostics.nativeRenderCache
    },
    storage: {
      projectPath: state.currentFile.path,
      userDataPath: state.currentFile.path
        ? "Project-adjacent media/cache folders are relative to the saved .pocketdaw file."
        : "Unsaved project; autosave/recent settings use the installed app or browser runtime storage."
    },
    performance: options.performance || null
  };
}

function recordingConfidenceDiagnostics(state: AppState, inputPreflight: RecordingInputPreflight): RecordingConfidenceDiagnostics {
  const project = currentProject(state);
  const devices = project.audioDeviceSettings.devices || [];
  const selectedInputDeviceId = project.audioDeviceSettings.inputDeviceId || inputPreflight.capturePlan[0]?.deviceId || null;
  const selectedOutputDeviceId = project.audioDeviceSettings.outputDeviceId || null;
  const selectedInputDevice = selectedInputDeviceId ? devices.find((device) => device.id === selectedInputDeviceId) || null : null;
  const selectedOutputDevice = selectedOutputDeviceId ? devices.find((device) => device.id === selectedOutputDeviceId) || null : null;
  const selectedTrack = inputPreflight.selectedTrackId
    ? project.tracks.find((track) => track.id === inputPreflight.selectedTrackId) || null
    : null;
  const capturePlanItem = inputPreflight.capturePlan[0] || null;
  const latestRecording = [...project.mediaPool].reverse().find((item) => {
    const metadata = item.metadata as Record<string, unknown> | undefined;
    return item.kind === "audio" && metadata?.importMode === "native-recording";
  }) || null;
  const latestRecordingMetadata = latestRecording?.metadata as Record<string, unknown> | undefined;
  const latestRecordedMediaPath = typeof latestRecordingMetadata?.projectRelativePath === "string"
    ? latestRecordingMetadata.projectRelativePath
    : latestRecording?.uri || null;
  const blockers = [
    ...inputPreflight.errors,
    ...(state.midiInputRecording.status === "error" && state.midiInputRecording.message ? [`MIDI input: ${state.midiInputRecording.message}`] : [])
  ];
  const sampleRate = state.recording.playbackCaptureAnchor?.sampleRate
    ?? state.recording.playbackStopAnchor?.sampleRate
    ?? project.audioDeviceSettings.sampleRate
    ?? project.project.sampleRate
    ?? null;
  return {
    projectSaved: Boolean(state.currentFile.path),
    selectedInputDeviceId,
    selectedInputDeviceName: state.recording.inputDeviceName || selectedInputDevice?.name || selectedInputDeviceId,
    selectedOutputDeviceId,
    selectedOutputDeviceName: state.recording.outputDeviceName || selectedOutputDevice?.name || selectedOutputDeviceId,
    sampleRate: typeof sampleRate === "number" && Number.isFinite(sampleRate) ? sampleRate : null,
    selectedTrackChannelMode: capturePlanItem?.mode || selectedTrack?.recordingChannelMode || null,
    selectedTrackChannelMap: capturePlanItem?.channelMap || [],
    capturePlanLabels: inputPreflight.capturePlan.map((item) => item.label),
    savedMediaRoot: "project-media/recordings",
    latestRecordedMediaPath,
    latestRecordedMediaName: latestRecording?.name || null,
    midiInputStatus: state.midiInputRecording.status,
    midiInputName: state.midiInputRecording.inputName,
    midiInputMessage: state.midiInputRecording.message,
    readyForAudioCapture: Boolean(state.currentFile.path) && inputPreflight.ok,
    readyForStrictAudibleAudioEvidence: Boolean(state.currentFile.path) && inputPreflight.ok && state.recording.status !== "error",
    readyForConnectedMidiEvidence: state.midiInputRecording.status === "recording" || Boolean(state.midiInputRecording.inputName),
    blockers,
    notes: recordingConfidenceNotes(state, inputPreflight, latestRecordedMediaPath)
  };
}

function recordingConfidenceNotes(state: AppState, inputPreflight: RecordingInputPreflight, latestRecordedMediaPath: string | null): string[] {
  const notes: string[] = [];
  notes.push(inputPreflight.ok ? "Audio input preflight is ready for the current armed track." : "Audio input preflight is blocking recording.");
  notes.push(latestRecordedMediaPath ? `Latest native recording media path: ${latestRecordedMediaPath}.` : "No saved native recording media is present in this project yet.");
  if (state.midiInputRecording.inputName) {
    notes.push(`MIDI input selected during this session: ${state.midiInputRecording.inputName}.`);
  } else {
    notes.push("No connected MIDI input has been captured in this diagnostics session.");
  }
  return notes;
}

export function createAudioTakeDiagnosticsSummary(project: PocketDawProject): AudioTakeDiagnosticsSummary {
  const audioTakeClips = project.timeline.clips.filter((clip) => (clip.type === "audio" || clip.type === "midi") && (clip.metadata?.recordingTakeGroupId || clip.metadata?.takeGroupId));
  const groups = new Map<string, AudioTakeDiagnosticsSummary["groups"][number]>();
  let activeCount = 0;
  let mutedCount = 0;
  let archivedCount = 0;
  audioTakeClips.forEach((clip) => {
    const groupId = String(clip.metadata?.recordingTakeGroupId || clip.metadata?.takeGroupId || "");
    const current = groups.get(groupId) || { groupId, clipCount: 0, activeCount: 0, mutedCount: 0, archivedCount: 0, lanes: [] };
    const status = audioTakeStatusForDiagnostics(clip);
    current.clipCount += 1;
    if (isAudibleTakeStatus(status) && !clip.muted) {
      current.activeCount += 1;
      activeCount += 1;
    }
    if (status === "archived-take") {
      current.archivedCount += 1;
      archivedCount += 1;
    }
    if (status === "muted-take" || clip.muted) {
      current.mutedCount += 1;
      mutedCount += 1;
    }
    const lane = audioTakeLaneSummaryForClip(current.lanes, clip, groupId, current.lanes.length);
    lane.clipCount += 1;
    lane.startBar = lane.startBar === null ? clip.startBar : Math.min(lane.startBar, clip.startBar);
    lane.endBar = lane.endBar === null ? clip.startBar + clip.barLength : Math.max(lane.endBar, clip.startBar + clip.barLength);
    lane.clipIds.push(clip.id);
    lane.clipNames.push(clip.name);
    lane.segmentNames.push(clip.name);
    if (isAudibleTakeStatus(status) && !clip.muted) {
      lane.activeCount += 1;
      lane.activeClipIds.push(clip.id);
    }
    if (status === "archived-take") lane.archivedCount += 1;
    if (status === "muted-take" || clip.muted) lane.mutedCount += 1;
    groups.set(groupId, current);
  });
  return {
    groupedClipCount: audioTakeClips.length,
    groupCount: groups.size,
    activeCount,
    mutedCount,
    archivedCount,
    groups: [...groups.values()]
      .map((group) => ({
        ...group,
        lanes: group.lanes
          .sort((a, b) => (a.laneIndex ?? Number.MAX_SAFE_INTEGER) - (b.laneIndex ?? Number.MAX_SAFE_INTEGER) || a.laneId.localeCompare(b.laneId))
          .map((lane) => ({
            ...lane,
            laneState: audioTakeLaneStateForDiagnostics(lane)
          }))
      }))
      .sort((a, b) => a.groupId.localeCompare(b.groupId))
  };
}

function audioTakeStatusForDiagnostics(clip: Clip): "active" | "comp-segment" | "muted-take" | "archived-take" {
  return clip.metadata?.takeStatus === "archived-take" || clip.metadata?.takeStatus === "muted-take" || clip.metadata?.takeStatus === "active" || clip.metadata?.takeStatus === "comp-segment"
    ? clip.metadata.takeStatus
    : clip.muted || clip.metadata?.takeActive === false
      ? "muted-take"
      : "active";
}

function isAudibleTakeStatus(status: "active" | "comp-segment" | "muted-take" | "archived-take"): boolean {
  return status === "active" || status === "comp-segment";
}

function audioTakeLaneSummaryForClip(
  lanes: AudioTakeDiagnosticsSummary["groups"][number]["lanes"],
  clip: Clip,
  groupId: string,
  fallbackIndex: number
): AudioTakeDiagnosticsSummary["groups"][number]["lanes"][number] {
  const laneIndex = audioTakeLaneIndexForDiagnostics(clip, fallbackIndex);
  const laneId = typeof clip.metadata?.takeLaneId === "string" && clip.metadata.takeLaneId.trim()
    ? clip.metadata.takeLaneId.trim()
    : `${groupId}-lane-${laneIndex ?? fallbackIndex + 1}`;
  let lane = lanes.find((item) => item.laneId === laneId);
  if (!lane) {
    lane = {
      laneId,
      laneIndex,
      laneState: "muted",
      clipCount: 0,
      activeCount: 0,
      mutedCount: 0,
      archivedCount: 0,
      startBar: null,
      endBar: null,
      clipIds: [],
      clipNames: [],
      segmentNames: [],
      activeClipIds: []
    };
    lanes.push(lane);
  }
  return lane;
}

function audioTakeLaneStateForDiagnostics(lane: AudioTakeDiagnosticsSummary["groups"][number]["lanes"][number]): "active" | "muted" | "archived" | "mixed" {
  if (lane.clipCount > 0 && lane.archivedCount === lane.clipCount) return "archived";
  if (lane.activeCount > 0 && lane.mutedCount === 0 && lane.archivedCount === 0) return "active";
  if (lane.activeCount === 0 && (lane.mutedCount > 0 || lane.archivedCount > 0)) return "muted";
  return "mixed";
}

function audioTakeLaneIndexForDiagnostics(clip: Clip, fallbackIndex: number): number | null {
  const value = Number(clip.metadata?.takeLaneIndex ?? clip.metadata?.takeIndex);
  if (Number.isFinite(value) && value > 0) return Math.round(value);
  return fallbackIndex + 1;
}

function recordingTimingConfidence(state: AppState): "none" | "low" | "diagnostic" {
  if (state.recording.status === "idle" && !state.recording.playbackCaptureAnchor && !state.recording.playbackStopAnchor) return "none";
  if (state.recording.playbackCaptureAnchor?.renderedFrameCount !== null && state.recording.playbackCaptureAnchor?.renderedFrameCount !== undefined) return "diagnostic";
  return "low";
}

function recordingTimingNotes(state: AppState): string[] {
  const project = currentProject(state);
  const manualOffsets = project.tracks
    .filter((track) => track.recordKind && track.recordKind !== "none")
    .map((track) => ({ track, offsetSeconds: recordingLatencyOffsetSeconds(track) }))
    .filter((entry) => entry.offsetSeconds !== 0);
  const notes = [
    "No automatic latency compensation is applied.",
    manualOffsets.length
      ? `Manual recording latency offsets are configured for ${manualOffsets.map((entry) => `${entry.track.name} (${Math.round(entry.offsetSeconds * 1000)} ms)`).join(", ")}.`
      : "No manual recording latency offsets are configured.",
    "Browser monotonic timestamps are presentation estimates, not sample-clock anchors."
  ];
  if (!state.recording.playbackCaptureAnchor) notes.push("No native playback capture anchor is available for the current recording state.");
  if (state.recording.playbackCaptureAnchor && state.recording.playbackStopAnchor) notes.push("Native playback frame anchors are available for diagnostic comparison.");
  return notes;
}

export function diagnosticsJson(payload: TesterDiagnosticsPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function runtimeBuildId(): string {
  return String(metaEnv().VITE_POCKET_DAW_BUILD_ID || metaEnv().VITE_BUILD_ID || "dev-or-unset");
}

export function runtimeCommit(): string {
  return String(metaEnv().VITE_GIT_COMMIT || metaEnv().VITE_COMMIT_SHA || "unavailable");
}

export function runtimeLabel(): string {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "Installed/Tauri" : "Browser/dev";
}

export function runtimePlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  return [navigator.platform, navigator.userAgent].filter(Boolean).join(" / ");
}

function metaEnv(): Record<string, string | boolean | undefined> {
  return ((import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env || {});
}
