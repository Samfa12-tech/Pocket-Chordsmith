import type { SessionImportBundle, SessionSourceFormat } from "../daw/sessionImport";

interface NativeSessionApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

const SESSION_FORMATS = new Set<SessionSourceFormat>(["stems", "midi", "ableton-live", "dawproject", "aaf", "unknown"]);

export async function importDawSessionFolderNative(api = defaultNativeSessionApi): Promise<SessionImportBundle | null> {
  if (!api.isAvailable()) return null;
  const payload = await api.invoke<unknown>("open_daw_session_folder");
  return payload === null ? null : normalizeSessionPayload(payload);
}

export async function importDawSessionFilesNative(api = defaultNativeSessionApi): Promise<SessionImportBundle | null> {
  if (!api.isAvailable()) return null;
  const payload = await api.invoke<unknown>("open_daw_session_files");
  return payload === null ? null : normalizeSessionPayload(payload);
}

export async function readDawSessionPathNative(path: string, api = defaultNativeSessionApi): Promise<SessionImportBundle | null> {
  if (!api.isAvailable()) return null;
  const payload = await api.invoke<unknown>("read_daw_session_path", { path });
  return normalizeSessionPayload(payload);
}

export function normalizeSessionPayload(payload: unknown): SessionImportBundle {
  const raw = record(payload, "Native DAW session import returned an invalid payload.");
  const title = requiredString(raw.title, "Session title");
  const sourcePaths = stringArray(raw.sourcePaths);
  const formats = stringArray(raw.formats).map(sessionFormat);
  const audioAssets = array(raw.audioAssets).map((value, index) => {
    const item = record(value, `Audio asset ${index + 1} is invalid.`);
    return {
      name: requiredString(item.name, `Audio asset ${index + 1} name`),
      role: optionalString(item.role),
      uri: requiredString(item.uri, `Audio asset ${index + 1} URI`),
      mimeType: optionalString(item.mimeType),
      durationSeconds: positiveNumber(item.durationSeconds, `Audio asset ${index + 1} duration`),
      sampleRate: positiveNumber(item.sampleRate, `Audio asset ${index + 1} sample rate`),
      channels: positiveNumber(item.channels, `Audio asset ${index + 1} channels`),
      sizeBytes: optionalPositiveNumber(item.sizeBytes),
      checksum: optionalString(item.checksum),
      pcmChecksum: optionalString(item.pcmChecksum),
      sourceFormat: sessionFormat(item.sourceFormat),
      sourcePath: optionalString(item.sourcePath),
      sourceEntry: optionalString(item.sourceEntry)
    };
  });
  const midiAssets = array(raw.midiAssets).map((value, index) => {
    const item = record(value, `MIDI asset ${index + 1} is invalid.`);
    const bytes = array(item.bytes).map((byte) => {
      const value = Number(byte);
      if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`MIDI asset ${index + 1} contains invalid bytes.`);
      return value;
    });
    return {
      name: requiredString(item.name, `MIDI asset ${index + 1} name`),
      role: optionalString(item.role),
      bytes,
      sizeBytes: optionalPositiveNumber(item.sizeBytes),
      checksum: optionalString(item.checksum),
      sourceFormat: sessionFormat(item.sourceFormat),
      sourcePath: optionalString(item.sourcePath),
      sourceEntry: optionalString(item.sourceEntry)
    };
  });
  const noteTracks = array(raw.noteTracks).map((value, index) => {
    const item = record(value, `Session note track ${index + 1} is invalid.`);
    return {
      name: requiredString(item.name, `Session note track ${index + 1} name`),
      role: optionalString(item.role),
      sourceFormat: sessionFormat(item.sourceFormat),
      sourcePath: optionalString(item.sourcePath),
      sourceEntry: optionalString(item.sourceEntry),
      ppq: optionalPositiveNumber(item.ppq),
      notes: array(item.notes).map((noteValue, noteIndex) => {
        const note = record(noteValue, `Session note ${noteIndex + 1} in track ${index + 1} is invalid.`);
        return {
          pitch: boundedNumber(note.pitch, 0, 127, "MIDI pitch"),
          startBeat: boundedNumber(note.startBeat, 0, Number.MAX_SAFE_INTEGER, "MIDI note start"),
          durationBeats: positiveNumber(note.durationBeats, "MIDI note duration"),
          velocity: boundedNumber(note.velocity, 1, 127, "MIDI velocity"),
          channel: boundedNumber(note.channel ?? 0, 0, 15, "MIDI channel")
        };
      })
    };
  });
  if (!audioAssets.length && !midiAssets.length && !noteTracks.length) {
    throw new Error("Native DAW session import returned no audio or MIDI content.");
  }
  return {
    title,
    sourcePaths,
    formats,
    audioAssets,
    midiAssets,
    noteTracks,
    fixedTempoBpm: optionalPositiveNumber(raw.fixedTempoBpm),
    warnings: stringArray(raw.warnings),
    checksum: optionalString(raw.checksum)
  };
}

function sessionFormat(value: unknown): SessionSourceFormat {
  const format = String(value || "unknown") as SessionSourceFormat;
  return SESSION_FORMATS.has(format) ? format : "unknown";
}

function record(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return array(value).map((item) => String(item || "").trim()).filter(Boolean);
}

function requiredString(value: unknown, label: string): string {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is missing.`);
  return text;
}

function optionalString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function positiveNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} is invalid.`);
  return number;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function boundedNumber(value: unknown, min: number, max: number, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} is invalid.`);
  return number;
}

const defaultNativeSessionApi: NativeSessionApi = {
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
