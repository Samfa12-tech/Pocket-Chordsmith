import { invoke } from "@tauri-apps/api/core";

export interface NativeRecordingStartPayload {
  projectFilePath: string;
  projectTitle: string;
  trackId: string;
  trackName: string;
  inputDeviceId?: string | null;
  outputDeviceId?: string | null;
  monitorEnabled: boolean;
  monitorVolume: number;
  monitorPan: number;
  channelMode: "mono" | "stereo";
  recordingSessionId?: number | null;
  startBar: number;
  requestedStartSeconds?: number | null;
  sampleRate: number;
}

export interface NativeRecordingMonitorPayload {
  outputDeviceId?: string | null;
  monitorEnabled: boolean;
  monitorVolume: number;
  monitorPan: number;
}

export interface NativeRecordingPreviewPayload {
  trackId: string;
  inputDeviceId?: string | null;
  outputDeviceId?: string | null;
  monitorEnabled: boolean;
  monitorVolume: number;
  monitorPan: number;
}

export interface NativeRecordingStatus {
  backend: "native-cpal" | string;
  available: boolean;
  active: boolean;
  monitoring: boolean;
  trackId: string | null;
  recordingSessionId: number | null;
  requestedStartBar: number | null;
  requestedStartSeconds: number | null;
  requestedSampleRate: number;
  captureSampleRate: number;
  elapsedSeconds: number;
  sampleRate: number;
  captureStartedAtUnixMs: number | null;
  inputDeviceName: string | null;
  outputDeviceName: string | null;
  peak: number;
  sampleCount: number;
  monitorBufferedFrameCount: number;
  inputFrameCount: number;
  capturedFrameCount: number;
  captureStartInputFrame: number | null;
  firstInputFrame: number | null;
  droppedInputFrameCount: number;
  monitorUnderrunCount: number;
  monitorOverrunCount: number;
  lastError: string | null;
}

export interface NativeRecordingStopResult {
  trackId: string;
  recordingSessionId: number | null;
  requestedStartBar: number | null;
  requestedStartSeconds: number | null;
  requestedSampleRate: number;
  captureSampleRate: number;
  targetPath: string;
  targetRelativePath: string;
  fileName: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
  peak: number;
  captureStartedAtUnixMs: number | null;
  inputFrameCount: number;
  capturedFrameCount: number;
  captureStartInputFrame: number | null;
  firstInputFrame: number | null;
  droppedInputFrameCount: number;
  monitorBufferedFrameCount: number;
  monitorUnderrunCount: number;
  monitorOverrunCount: number;
}

export function isNativeRecordingAvailable(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

export async function startNativeRecording(payload: NativeRecordingStartPayload): Promise<NativeRecordingStatus> {
  if (!isNativeRecordingAvailable()) throw new Error("Live recording is only available in the installed Pocket DAW app.");
  return invoke<NativeRecordingStatus>("native_recording_start", { payload });
}

export async function stopNativeRecording(): Promise<NativeRecordingStopResult> {
  if (!isNativeRecordingAvailable()) throw new Error("Live recording is only available in the installed Pocket DAW app.");
  return invoke<NativeRecordingStopResult>("native_recording_stop");
}

export async function updateNativeRecordingMonitor(payload: NativeRecordingMonitorPayload): Promise<NativeRecordingStatus> {
  if (!isNativeRecordingAvailable()) throw new Error("Live recording is only available in the installed Pocket DAW app.");
  return invoke<NativeRecordingStatus>("native_recording_update_monitor", { payload });
}

export async function startNativeRecordingPreview(payload: NativeRecordingPreviewPayload): Promise<NativeRecordingStatus> {
  if (!isNativeRecordingAvailable()) throw new Error("Live recording is only available in the installed Pocket DAW app.");
  return invoke<NativeRecordingStatus>("native_recording_start_preview", { payload });
}

export async function stopNativeRecordingPreview(): Promise<NativeRecordingStatus> {
  if (!isNativeRecordingAvailable()) throw new Error("Live recording is only available in the installed Pocket DAW app.");
  return invoke<NativeRecordingStatus>("native_recording_stop_preview");
}

export async function nativeRecordingStatus(): Promise<NativeRecordingStatus> {
  if (!isNativeRecordingAvailable()) {
    return {
      backend: "browser",
      available: false,
      active: false,
      monitoring: false,
      trackId: null,
      recordingSessionId: null,
      requestedStartBar: null,
      requestedStartSeconds: null,
      requestedSampleRate: 0,
      captureSampleRate: 0,
      elapsedSeconds: 0,
      sampleRate: 0,
      captureStartedAtUnixMs: null,
      inputDeviceName: null,
      outputDeviceName: null,
      peak: 0,
      sampleCount: 0,
      monitorBufferedFrameCount: 0,
      inputFrameCount: 0,
      capturedFrameCount: 0,
      captureStartInputFrame: null,
      firstInputFrame: null,
      droppedInputFrameCount: 0,
      monitorUnderrunCount: 0,
      monitorOverrunCount: 0,
      lastError: "Live recording is only available in the installed Pocket DAW app."
    };
  }
  return invoke<NativeRecordingStatus>("native_recording_status");
}
