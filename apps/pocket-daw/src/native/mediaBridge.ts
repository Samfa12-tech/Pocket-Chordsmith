import type { NativeAudioStartPayload } from "./audioPlayback";

export const AUDIO_MEDIA_ACCEPT = ".wav,.mp3,.ogg,.flac,.aiff,.aif,audio/*";
export const MAX_AUDIO_IMPORT_BYTES = 250 * 1024 * 1024;

export interface ImportedAudioBytes {
  name: string;
  uri?: string;
  mimeType?: string;
  sizeBytes?: number;
  bytes: ArrayBuffer;
  mode: "native" | "browser";
  sourceMimeType?: string;
  sourceSizeBytes?: number;
  sourceEncoding?: string;
  decodedMimeType?: string;
  decodedSizeBytes?: number;
  sampleRate?: number;
  channels?: number;
  durationSeconds?: number;
  frameCount?: number;
  decoder?: string;
  nativeDecodeError?: string;
}

export interface CollectProjectMediaInput {
  id: string;
  sourceUri: string;
  targetRelativePath: string;
}

export interface CollectedProjectMedia {
  id: string;
  sourceUri: string;
  targetPath: string;
  targetRelativePath: string;
  sizeBytes: number;
}

export interface NativeCacheAssetWriteInput {
  assetId: string;
  relativePath: string;
  bytes: number[] | Uint8Array | ArrayBuffer;
}

export interface NativeCacheAssetWriteResult {
  assetId: string;
  path: string;
  relativePath: string;
  sizeBytes: number;
}

export interface NativeCacheAssetReadResult extends NativeCacheAssetWriteResult {
  bytes: ArrayBuffer;
}

export interface NativeCachePruneResult {
  deletedCount: number;
  deletedByteCount: number;
  skippedCount: number;
  errors: string[];
}

export interface NativeRenderedWav {
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  sizeBytes: number;
  bytes: number[];
}

interface NativeAudioPayload {
  path: string;
  label: string;
  mimeType?: string;
  sizeBytes?: number;
  bytes: number[];
  sourceMimeType?: string;
  sourceSizeBytes?: number;
  sourceEncoding?: string;
  decodedMimeType?: string;
  decodedSizeBytes?: number;
  sampleRate?: number;
  channels?: number;
  durationSeconds?: number;
  frameCount?: number;
  decoder?: string;
  nativeDecodeError?: string;
}

interface NativeCollectedProjectMediaPayload {
  id: string;
  sourceUri: string;
  targetPath: string;
  targetRelativePath: string;
  sizeBytes: number;
}

interface NativeCacheAssetWritePayload {
  assetId: string;
  path: string;
  relativePath: string;
  sizeBytes: number;
}

interface NativeCacheAssetReadPayload extends NativeCacheAssetWritePayload {
  bytes: number[];
}

interface NativeCachePrunePayload {
  deletedCount: number;
  deletedByteCount: number;
  skippedCount: number;
  errors: string[];
}

interface NativeRenderedWavPayload {
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  sizeBytes: number;
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
  return importedAudioFromNativePayload(result);
}

export async function relinkAudioMediaNative(api = defaultNativeMediaApi): Promise<ImportedAudioBytes | null> {
  return importAudioMediaNative(api);
}

export async function loadAudioMediaNative(path: string, projectFilePath?: string | null, api = defaultNativeMediaApi): Promise<ImportedAudioBytes | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeAudioPayload>("read_audio_media_file", { path, projectFilePath: projectFilePath || null });
  return importedAudioFromNativePayload(result);
}

export async function collectProjectMediaNative(projectFilePath: string, items: CollectProjectMediaInput[], api = defaultNativeMediaApi): Promise<CollectedProjectMedia[] | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeCollectedProjectMediaPayload[]>("collect_project_media", { projectFilePath, items });
  if (!Array.isArray(result)) throw new Error("Native collect-media returned an invalid result.");
  return result.map((item) => {
    if (typeof item.id !== "string" || typeof item.sourceUri !== "string" || typeof item.targetPath !== "string" || typeof item.targetRelativePath !== "string") {
      throw new Error("Native collect-media returned an invalid media item.");
    }
    return {
      id: item.id,
      sourceUri: item.sourceUri,
      targetPath: item.targetPath,
      targetRelativePath: item.targetRelativePath,
      sizeBytes: Number(item.sizeBytes) || 0
    };
  });
}

export async function writeNativeCacheAsset(
  projectFilePath: string,
  asset: NativeCacheAssetWriteInput,
  api = defaultNativeMediaApi
): Promise<NativeCacheAssetWriteResult | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeCacheAssetWritePayload>("write_native_cache_asset", {
    projectFilePath,
    assetId: asset.assetId,
    relativePath: asset.relativePath,
    bytes: bytesForNativeInvoke(asset.bytes)
  });
  assertNativeCacheAssetPayload(result);
  return {
    assetId: result.assetId,
    path: result.path,
    relativePath: result.relativePath,
    sizeBytes: Number(result.sizeBytes) || 0
  };
}

export async function readNativeCacheAsset(
  projectFilePath: string,
  assetId: string,
  relativePath: string,
  api = defaultNativeMediaApi
): Promise<NativeCacheAssetReadResult | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeCacheAssetReadPayload>("read_native_cache_asset", { projectFilePath, assetId, relativePath });
  assertNativeCacheAssetPayload(result);
  if (!Array.isArray(result.bytes)) throw new Error("Native cache read returned invalid bytes.");
  return {
    assetId: result.assetId,
    path: result.path,
    relativePath: result.relativePath,
    sizeBytes: Number(result.sizeBytes) || 0,
    bytes: new Uint8Array(result.bytes).buffer
  };
}

export async function pruneNativeCacheAssets(
  projectFilePath: string,
  keepRelativePaths: string[],
  api = defaultNativeMediaApi
): Promise<NativeCachePruneResult | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeCachePrunePayload>("prune_native_cache_assets", { projectFilePath, keepRelativePaths });
  if (!result || !Array.isArray(result.errors)) throw new Error("Native cache prune returned an invalid result.");
  return {
    deletedCount: Number(result.deletedCount) || 0,
    deletedByteCount: Number(result.deletedByteCount) || 0,
    skippedCount: Number(result.skippedCount) || 0,
    errors: result.errors.map((error) => String(error))
  };
}

export async function renderNativeAudioWav(
  payload: NativeAudioStartPayload,
  durationSeconds: number,
  renderModeOrApi?: "mix" | "cache-stem" | NativeMediaApi,
  injectedApi?: NativeMediaApi
): Promise<NativeRenderedWav | null> {
  const renderMode = typeof renderModeOrApi === "string" ? renderModeOrApi : undefined;
  const api = typeof renderModeOrApi === "object" && renderModeOrApi ? renderModeOrApi : injectedApi || defaultNativeMediaApi;
  if (!api.isAvailable()) return null;
  const args: Record<string, unknown> = { payload, durationSeconds };
  if (renderMode) args.renderMode = renderMode;
  const result = await api.invoke<NativeRenderedWavPayload>("native_audio_render_wav", args);
  if (!result || !Array.isArray(result.bytes)) throw new Error("Native audio render returned an invalid WAV payload.");
  return {
    sampleRate: Number(result.sampleRate) || payload.sampleRate || 48_000,
    channels: Number(result.channels) || 2,
    durationSeconds: Number(result.durationSeconds) || durationSeconds,
    sizeBytes: Number(result.sizeBytes) || result.bytes.length,
    bytes: result.bytes
  };
}

function importedAudioFromNativePayload(result: NativeAudioPayload): ImportedAudioBytes {
  if (!Array.isArray(result.bytes) || typeof result.path !== "string") {
    throw new Error("Native audio import returned an invalid media payload.");
  }
  return {
    name: result.label || fileNameFromPath(result.path),
    uri: result.path,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    bytes: new Uint8Array(result.bytes).buffer,
    mode: "native",
    sourceMimeType: result.sourceMimeType,
    sourceSizeBytes: cleanPositiveNumber(result.sourceSizeBytes),
    sourceEncoding: result.sourceEncoding,
    decodedMimeType: result.decodedMimeType,
    decodedSizeBytes: cleanPositiveNumber(result.decodedSizeBytes),
    sampleRate: cleanPositiveNumber(result.sampleRate),
    channels: cleanPositiveNumber(result.channels),
    durationSeconds: cleanPositiveNumber(result.durationSeconds),
    frameCount: cleanPositiveNumber(result.frameCount),
    decoder: result.decoder,
    nativeDecodeError: result.nativeDecodeError
  };
}

export async function importedAudioFromBrowserFile(file: File): Promise<ImportedAudioBytes> {
  if (file.size > MAX_AUDIO_IMPORT_BYTES) {
    throw new Error("Audio file is too large for this release. Try a shorter file or wait for native streaming support.");
  }
  return {
    name: file.name,
    uri: undefined,
    mimeType: file.type || mimeTypeForName(file.name),
    sizeBytes: file.size,
    bytes: await file.arrayBuffer(),
    mode: "browser",
    sourceMimeType: file.type || mimeTypeForName(file.name),
    sourceSizeBytes: file.size,
    sourceEncoding: file.name.split(".").pop()?.toLowerCase() || "unknown"
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

function bytesForNativeInvoke(bytes: number[] | Uint8Array | ArrayBuffer): number[] {
  if (Array.isArray(bytes)) return bytes;
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

function assertNativeCacheAssetPayload(value: NativeCacheAssetWritePayload): void {
  if (!value || typeof value.assetId !== "string" || typeof value.path !== "string" || typeof value.relativePath !== "string") {
    throw new Error("Native cache command returned an invalid asset payload.");
  }
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || "Imported audio";
}

function cleanPositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
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
