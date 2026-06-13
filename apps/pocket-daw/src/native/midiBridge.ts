export const MIDI_MEDIA_ACCEPT = ".mid,.midi,audio/midi";
export const MAX_MIDI_IMPORT_BYTES = 25 * 1024 * 1024;

export interface ImportedMidiBytes {
  name: string;
  uri?: string;
  sizeBytes?: number;
  bytes: ArrayBuffer;
  mode: "native" | "browser";
}

interface NativeMidiPayload {
  path: string;
  label: string;
  sizeBytes?: number;
  bytes: number[];
}

export interface NativeMidiApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export async function importMidiNative(api = defaultNativeMidiApi): Promise<ImportedMidiBytes | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeMidiPayload | null>("open_midi_file");
  if (!result) return null;
  if (!Array.isArray(result.bytes) || typeof result.path !== "string") {
    throw new Error("Native MIDI import returned an invalid media payload.");
  }
  return {
    name: result.label || fileNameFromPath(result.path),
    uri: result.path,
    sizeBytes: result.sizeBytes,
    bytes: new Uint8Array(result.bytes).buffer,
    mode: "native"
  };
}

export async function importedMidiFromBrowserFile(file: File): Promise<ImportedMidiBytes> {
  if (file.size > MAX_MIDI_IMPORT_BYTES) {
    throw new Error("MIDI file is too large for this release. Try a smaller MIDI file.");
  }
  return {
    name: file.name,
    sizeBytes: file.size,
    bytes: await file.arrayBuffer(),
    mode: "browser"
  };
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || "Imported MIDI";
}

const defaultNativeMidiApi: NativeMidiApi = {
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
