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
  startBar: number;
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
  elapsedSeconds: number;
  sampleRate: number;
  inputDeviceName: string | null;
  outputDeviceName: string | null;
  peak: number;
  sampleCount: number;
  lastError: string | null;
}

export interface NativeRecordingStopResult {
  trackId: string;
  targetPath: string;
  targetRelativePath: string;
  fileName: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
  peak: number;
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
      elapsedSeconds: 0,
      sampleRate: 0,
      inputDeviceName: null,
      outputDeviceName: null,
      peak: 0,
      sampleCount: 0,
      lastError: "Live recording is only available in the installed Pocket DAW app."
    };
  }
  return invoke<NativeRecordingStatus>("native_recording_status");
}
