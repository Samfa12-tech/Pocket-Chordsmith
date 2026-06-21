import type { AudioEngine } from "../audio/audioEngine";
import { getCachedAudioBuffer } from "../audio/audioBufferCache";
import { mediaPoolStatus } from "../daw/mediaPool";
import { validateProjectInvariants, type ProjectInvariantIssue } from "../daw/projectInvariants";
import { POCKET_DAW_VERSION } from "../daw/schema";
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
    bars: number;
    clipCount: number;
    trackCount: number;
    sourceRefCount: number;
    invariantErrorCount: number;
    invariantWarningCount: number;
    invariantErrors: ProjectInvariantIssue[];
    invariantWarnings: ProjectInvariantIssue[];
  };
  audio: {
    playbackBackend: string;
    nativeStatus: string | null;
    nativeLastError: string | null;
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
  media: {
    poolCount: number;
    projectMediaCount: number;
    externalReferenceCount: number;
    runtimeOnlyCount: number;
    missingCount: number;
    runtimeAvailableCount: number;
    renderCacheCount: number;
    nativeRenderCache: AudioEngineDiagnostics["nativeRenderCache"];
  };
  storage: {
    projectPath: string | null;
    userDataPath: string;
  };
  performance: PerformanceDiagnosticsReport | null;
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
      bars: project.timeline.bars,
      clipCount: project.timeline.clips.length,
      trackCount: project.tracks.length,
      sourceRefCount: project.sourceRefs.length,
      invariantErrorCount: invariants.errors.length,
      invariantWarningCount: invariants.warnings.length,
      invariantErrors: invariants.errors,
      invariantWarnings: invariants.warnings
    },
    audio: {
      playbackBackend: String(audioDiagnostics.playbackBackend),
      nativeStatus: audioDiagnostics.nativeAudio.status ? String(audioDiagnostics.nativeAudio.status) : null,
      nativeLastError: audioDiagnostics.nativeAudio.lastError,
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
    media: {
      poolCount: project.mediaPool.length,
      projectMediaCount,
      externalReferenceCount,
      runtimeOnlyCount,
      missingCount,
      runtimeAvailableCount,
      renderCacheCount: project.renderCache.length,
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

function recordingTimingConfidence(state: AppState): "none" | "low" | "diagnostic" {
  if (state.recording.status === "idle" && !state.recording.playbackCaptureAnchor && !state.recording.playbackStopAnchor) return "none";
  if (state.recording.playbackCaptureAnchor?.renderedFrameCount !== null && state.recording.playbackCaptureAnchor?.renderedFrameCount !== undefined) return "diagnostic";
  return "low";
}

function recordingTimingNotes(state: AppState): string[] {
  const notes = [
    "No automatic latency compensation is applied.",
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
