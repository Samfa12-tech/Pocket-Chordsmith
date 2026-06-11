export const AUDIO_MEDIA_ACCEPT = ".wav,.mp3,.ogg,.flac,.aiff,.aif,audio/*";

export interface ImportedAudioBytes {
  name: string;
  uri?: string;
  mimeType?: string;
  sizeBytes?: number;
  bytes: ArrayBuffer;
  mode: "native" | "browser";
}

interface NativeAudioPayload {
  path: string;
  label: string;
  mimeType?: string;
  sizeBytes?: number;
  bytes: number[];
}

export interface NativeMediaApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export async function importAudioMediaNative(api = defaultNativeMediaApi): Promise<ImportedAudioBytes | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeAudioPayload | null>("open_audio_media_file");
  if (!result) return null;
  if (!Array.isArray(result.bytes) || typeof result.path !== "string") {
    throw new Error("Native audio import returned an invalid media payload.");
  }
  return {
    name: result.label || fileNameFromPath(result.path),
    uri: result.path,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    bytes: new Uint8Array(result.bytes).buffer,
    mode: "native"
  };
}

export async function importedAudioFromBrowserFile(file: File): Promise<ImportedAudioBytes> {
  return {
    name: file.name,
    uri: undefined,
    mimeType: file.type || mimeTypeForName(file.name),
    sizeBytes: file.size,
    bytes: await file.arrayBuffer(),
    mode: "browser"
  };
}

export function mimeTypeForName(name: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "flac") return "audio/flac";
  if (ext === "aiff" || ext === "aif") return "audio/aiff";
  return undefined;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || "Imported audio";
}

const defaultNativeMediaApi: NativeMediaApi = {
  isAvailable() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  },
  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const api = await import("@tauri-apps/api/core");
    return api.invoke<T>(command, args);
  }
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
