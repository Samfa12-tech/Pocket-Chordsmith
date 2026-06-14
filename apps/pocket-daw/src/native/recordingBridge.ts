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

interface NativeRecordingApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

function defaultApi(): NativeRecordingApi | null {
  const tauri = (window as unknown as { __TAURI__?: { core?: NativeRecordingApi } }).__TAURI__;
  return tauri?.core || null;
}

export function isNativeRecordingAvailable(api: NativeRecordingApi | null = defaultApi()): boolean {
  return !!api;
}

export async function startNativeRecording(payload: NativeRecordingStartPayload, api: NativeRecordingApi | null = defaultApi()): Promise<NativeRecordingStatus> {
  if (!api) throw new Error("Live recording is only available in the installed Pocket DAW app.");
  return api.invoke<NativeRecordingStatus>("native_recording_start", { payload });
}

export async function stopNativeRecording(api: NativeRecordingApi | null = defaultApi()): Promise<NativeRecordingStopResult> {
  if (!api) throw new Error("Live recording is only available in the installed Pocket DAW app.");
  return api.invoke<NativeRecordingStopResult>("native_recording_stop");
}

export async function nativeRecordingStatus(api: NativeRecordingApi | null = defaultApi()): Promise<NativeRecordingStatus> {
  if (!api) {
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
      lastError: "Live recording is only available in the installed Pocket DAW app."
    };
  }
  return api.invoke<NativeRecordingStatus>("native_recording_status");
}
