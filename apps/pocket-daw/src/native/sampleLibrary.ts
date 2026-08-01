export const SAMPLE_LIBRARY_VERSION = 1 as const;
export const SAMPLE_LIBRARY_STORAGE_KEY = "pocket_daw_sample_library_v1";
export const SAMPLE_LIBRARY_RECENT_LIMIT = 40;
export const SUPPORTED_SAMPLE_EXTENSIONS = ["wav", "mp3", "ogg", "flac", "aiff", "aif"] as const;

export type SupportedSampleExtension = typeof SUPPORTED_SAMPLE_EXTENSIONS[number];
export type SampleLibraryCategory = "drums" | "bass" | "chords" | "melody" | "guitar" | "fx" | "other";
export type SampleLibrarySource = "starter" | "file" | "folder";

export interface DiscoveredSampleFile {
  path: string;
  name: string;
  folderPath: string;
  extension: SupportedSampleExtension;
  sizeBytes: number;
  modifiedUnixMs: number | null;
}

export interface SampleLibraryEntry extends DiscoveredSampleFile {
  id: string;
  category: SampleLibraryCategory;
  source: SampleLibrarySource;
  sourceRoot: string | null;
  addedAt: string;
  lastSeenAt: string;
  waveformPeaks?: number[];
}

export interface SampleLibraryFolder {
  id: string;
  path: string;
  label: string;
  addedAt: string;
  lastScannedAt: string;
}

export interface SampleLibrarySettings {
  previewVolume: number;
  lastCategory: SampleLibraryCategory | "all";
  lastFolderId: string | null;
}

export interface SampleLibraryIndex {
  version: typeof SAMPLE_LIBRARY_VERSION;
  folders: SampleLibraryFolder[];
  entries: SampleLibraryEntry[];
  favoriteIds: string[];
  recentIds: string[];
  settings: SampleLibrarySettings;
}

export interface NativeSampleLibraryDiscovery {
  rootPath: string | null;
  rootLabel: string | null;
  files: DiscoveredSampleFile[];
  warnings: string[];
  truncated: boolean;
}

export interface SampleLibraryFilter {
  query?: string;
  category?: SampleLibraryCategory | "all";
  folderId?: string | null;
  favoritesOnly?: boolean;
}

export interface NativeSampleLibraryApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export function createEmptySampleLibraryIndex(): SampleLibraryIndex {
  return {
    version: SAMPLE_LIBRARY_VERSION,
    folders: [],
    entries: [],
    favoriteIds: [],
    recentIds: [],
    settings: {
      previewVolume: 0.8,
      lastCategory: "all",
      lastFolderId: null
    }
  };
}

export function isSupportedSamplePath(path: string): boolean {
  return supportedExtensionForPath(path) !== null;
}

export function supportedExtensionForPath(path: string): SupportedSampleExtension | null {
  const extension = path.split(".").pop()?.toLowerCase();
  return SUPPORTED_SAMPLE_EXTENSIONS.includes(extension as SupportedSampleExtension)
    ? extension as SupportedSampleExtension
    : null;
}

export function inferSampleCategory(path: string): SampleLibraryCategory {
  const value = path.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/\b(kick|snare|hat|hihat|clap|tom|cymbal|drum|percussion|perc)\b/.test(value)) return "drums";
  if (/\b(bass|sub|upright)\b/.test(value)) return "bass";
  if (/\b(chord|pad|keys|piano|rhodes)\b/.test(value)) return "chords";
  if (/\b(melody|lead|pluck|bell|sax|trumpet|harmonica|whistle|banjo)\b/.test(value)) return "melody";
  if (/\b(guitar|chug|twang)\b/.test(value)) return "guitar";
  if (/\b(fx|impact|hit|transition|reward|victory|warning|riser|sweep)\b/.test(value)) return "fx";
  return "other";
}

export function mergeSampleLibraryDiscovery(
  index: SampleLibraryIndex,
  discovery: NativeSampleLibraryDiscovery,
  source: SampleLibrarySource,
  now = new Date().toISOString()
): SampleLibraryIndex {
  const next = sanitizeSampleLibraryIndex(index);
  const rootPath = discovery.rootPath ? normalizeLocalPath(discovery.rootPath) : null;
  let folder: SampleLibraryFolder | null = null;
  if (source === "folder" && rootPath) {
    const folderId = stableLocalId("folder", rootPath);
    folder = next.folders.find((item) => item.id === folderId) || {
      id: folderId,
      path: discovery.rootPath!,
      label: discovery.rootLabel || fileNameFromPath(discovery.rootPath!) || "Sample folder",
      addedAt: now,
      lastScannedAt: now
    };
    folder = { ...folder, label: discovery.rootLabel || folder.label, lastScannedAt: now };
    next.folders = [folder, ...next.folders.filter((item) => item.id !== folder!.id)];
  }

  const discoveredPaths = new Set(discovery.files.map((file) => normalizeLocalPath(file.path)));
  const existingByPath = new Map(next.entries.map((entry) => [normalizeLocalPath(entry.path), entry]));
  const discoveredEntries = discovery.files
    .filter((file) => isSupportedSamplePath(file.path))
    .map((file) => {
      const pathKey = normalizeLocalPath(file.path);
      const existing = existingByPath.get(pathKey);
      return {
        ...file,
        extension: supportedExtensionForPath(file.path)!,
        id: existing?.id || stableLocalId("sample", pathKey),
        category: inferSampleCategory(`${file.folderPath} ${file.name}`),
        source,
        sourceRoot: source === "folder" ? discovery.rootPath : source === "starter" ? discovery.rootPath : null,
        addedAt: existing?.addedAt || now,
        lastSeenAt: now,
        waveformPeaks: existing?.waveformPeaks
      } satisfies SampleLibraryEntry;
    });

  let retained = next.entries.filter((entry) => !discoveredPaths.has(normalizeLocalPath(entry.path)));
  if (source === "folder" && rootPath) {
    retained = retained.filter((entry) => !(entry.source === "folder" && normalizeLocalPath(entry.sourceRoot || "") === rootPath));
  } else if (source === "starter" && rootPath) {
    retained = retained.filter((entry) => !(entry.source === "starter" && normalizeLocalPath(entry.sourceRoot || "") === rootPath));
  }
  next.entries = [...discoveredEntries, ...retained];
  return pruneDanglingIds(next);
}

export function removeSampleLibraryFolder(index: SampleLibraryIndex, folderId: string): SampleLibraryIndex {
  const next = sanitizeSampleLibraryIndex(index);
  const folder = next.folders.find((item) => item.id === folderId);
  if (!folder) return next;
  const root = normalizeLocalPath(folder.path);
  next.folders = next.folders.filter((item) => item.id !== folderId);
  next.entries = next.entries.filter((entry) => !(entry.source === "folder" && normalizeLocalPath(entry.sourceRoot || "") === root));
  if (next.settings.lastFolderId === folderId) next.settings.lastFolderId = null;
  return pruneDanglingIds(next);
}

export function toggleSampleFavorite(index: SampleLibraryIndex, entryId: string): SampleLibraryIndex {
  const next = sanitizeSampleLibraryIndex(index);
  if (!next.entries.some((entry) => entry.id === entryId)) return next;
  next.favoriteIds = next.favoriteIds.includes(entryId)
    ? next.favoriteIds.filter((id) => id !== entryId)
    : [entryId, ...next.favoriteIds];
  return next;
}

export function recordSampleRecent(index: SampleLibraryIndex, entryId: string): SampleLibraryIndex {
  const next = sanitizeSampleLibraryIndex(index);
  if (!next.entries.some((entry) => entry.id === entryId)) return next;
  next.recentIds = [entryId, ...next.recentIds.filter((id) => id !== entryId)].slice(0, SAMPLE_LIBRARY_RECENT_LIMIT);
  return next;
}

export function filterSampleLibraryEntries(index: SampleLibraryIndex, filter: SampleLibraryFilter = {}): SampleLibraryEntry[] {
  const queryTokens = normalizeSearchText(filter.query || "").split(" ").filter(Boolean);
  const favoriteIds = new Set(index.favoriteIds);
  const folder = filter.folderId ? index.folders.find((item) => item.id === filter.folderId) : null;
  const folderRoot = folder ? normalizeLocalPath(folder.path) : null;
  return index.entries.filter((entry) => {
    if (filter.category && filter.category !== "all" && entry.category !== filter.category) return false;
    if (filter.favoritesOnly && !favoriteIds.has(entry.id)) return false;
    if (folderRoot && normalizeLocalPath(entry.sourceRoot || "") !== folderRoot) return false;
    if (!queryTokens.length) return true;
    const haystack = normalizeSearchText(`${entry.name} ${entry.folderPath} ${entry.category} ${entry.extension}`);
    return queryTokens.every((token) => haystack.includes(token));
  });
}

export function recentSampleLibraryEntries(index: SampleLibraryIndex): SampleLibraryEntry[] {
  const entries = new Map(index.entries.map((entry) => [entry.id, entry]));
  return index.recentIds.map((id) => entries.get(id)).filter((entry): entry is SampleLibraryEntry => !!entry);
}

export async function selectSampleLibraryFilesNative(api = defaultNativeSampleLibraryApi): Promise<NativeSampleLibraryDiscovery | null> {
  if (!api.isAvailable()) return null;
  return validateDiscovery(await api.invoke<NativeSampleLibraryDiscovery | null>("sample_library_select_files"));
}

export async function selectSampleLibraryFolderNative(api = defaultNativeSampleLibraryApi): Promise<NativeSampleLibraryDiscovery | null> {
  if (!api.isAvailable()) return null;
  return validateDiscovery(await api.invoke<NativeSampleLibraryDiscovery | null>("sample_library_select_folder"));
}

export async function scanSampleLibraryFolderNative(path: string, api = defaultNativeSampleLibraryApi): Promise<NativeSampleLibraryDiscovery | null> {
  if (!api.isAvailable()) return null;
  return validateDiscovery(await api.invoke<NativeSampleLibraryDiscovery>("sample_library_scan_folder", { path }));
}

export async function scanSampleLibraryPathsNative(paths: string[], api = defaultNativeSampleLibraryApi): Promise<NativeSampleLibraryDiscovery | null> {
  if (!api.isAvailable() || !paths.length) return null;
  return validateDiscovery(await api.invoke<NativeSampleLibraryDiscovery>("sample_library_scan_paths", { paths }));
}

export async function discoverStarterSoundsNative(api = defaultNativeSampleLibraryApi): Promise<NativeSampleLibraryDiscovery | null> {
  if (!api.isAvailable()) return null;
  return validateDiscovery(await api.invoke<NativeSampleLibraryDiscovery>("sample_library_starter_sounds"));
}

export async function loadSampleLibraryIndex(api = defaultNativeSampleLibraryApi): Promise<SampleLibraryIndex> {
  if (api.isAvailable()) {
    const value = await api.invoke<unknown>("sample_library_load_state");
    return sanitizeSampleLibraryIndex(value);
  }
  try {
    return sanitizeSampleLibraryIndex(JSON.parse(safeLocalStorage()?.getItem(SAMPLE_LIBRARY_STORAGE_KEY) || "null"));
  } catch {
    return createEmptySampleLibraryIndex();
  }
}

export async function saveSampleLibraryIndex(index: SampleLibraryIndex, api = defaultNativeSampleLibraryApi): Promise<SampleLibraryIndex> {
  const clean = sanitizeSampleLibraryIndex(index);
  if (api.isAvailable()) {
    await api.invoke<void>("sample_library_save_state", { state: clean });
  } else {
    safeLocalStorage()?.setItem(SAMPLE_LIBRARY_STORAGE_KEY, JSON.stringify(clean));
  }
  return clean;
}

export function sanitizeSampleLibraryIndex(value: unknown): SampleLibraryIndex {
  const empty = createEmptySampleLibraryIndex();
  if (!value || typeof value !== "object") return empty;
  const raw = value as Record<string, unknown>;
  const entries = Array.isArray(raw.entries) ? raw.entries.map(sanitizeEntry).filter((entry): entry is SampleLibraryEntry => !!entry) : [];
  const entryIds = new Set(entries.map((entry) => entry.id));
  const folders = Array.isArray(raw.folders) ? raw.folders.map(sanitizeFolder).filter((folder): folder is SampleLibraryFolder => !!folder) : [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings as Record<string, unknown> : {};
  return {
    version: SAMPLE_LIBRARY_VERSION,
    folders: uniqueBy(folders, (folder) => normalizeLocalPath(folder.path)),
    entries: uniqueBy(entries, (entry) => normalizeLocalPath(entry.path)),
    favoriteIds: cleanIds(raw.favoriteIds, entryIds),
    recentIds: cleanIds(raw.recentIds, entryIds).slice(0, SAMPLE_LIBRARY_RECENT_LIMIT),
    settings: {
      previewVolume: clampNumber(settings.previewVolume, 0, 1, empty.settings.previewVolume),
      lastCategory: isCategory(settings.lastCategory) || settings.lastCategory === "all" ? settings.lastCategory : "all",
      lastFolderId: typeof settings.lastFolderId === "string" && folderIds.has(settings.lastFolderId) ? settings.lastFolderId : null
    }
  };
}

function sanitizeEntry(value: unknown): SampleLibraryEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  const extension = supportedExtensionForPath(path);
  if (!path || !extension) return null;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fileNameFromPath(path);
  const source = raw.source === "starter" || raw.source === "folder" ? raw.source : "file";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : stableLocalId("sample", normalizeLocalPath(path)),
    path,
    name,
    folderPath: typeof raw.folderPath === "string" ? raw.folderPath : parentPath(path),
    extension,
    sizeBytes: cleanNonNegativeNumber(raw.sizeBytes),
    modifiedUnixMs: cleanNullableNumber(raw.modifiedUnixMs),
    category: isCategory(raw.category) ? raw.category : inferSampleCategory(`${path} ${name}`),
    source,
    sourceRoot: typeof raw.sourceRoot === "string" && raw.sourceRoot ? raw.sourceRoot : null,
    addedAt: cleanDateString(raw.addedAt),
    lastSeenAt: cleanDateString(raw.lastSeenAt),
    waveformPeaks: Array.isArray(raw.waveformPeaks)
      ? raw.waveformPeaks.slice(0, 256).map((value) => clampNumber(value, 0, 1, 0))
      : undefined
  };
}

function sanitizeFolder(value: unknown): SampleLibraryFolder | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  if (!path) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : stableLocalId("folder", normalizeLocalPath(path)),
    path,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : fileNameFromPath(path) || "Sample folder",
    addedAt: cleanDateString(raw.addedAt),
    lastScannedAt: cleanDateString(raw.lastScannedAt)
  };
}

function validateDiscovery(value: NativeSampleLibraryDiscovery | null): NativeSampleLibraryDiscovery | null {
  if (value === null) return null;
  if (!value || !Array.isArray(value.files) || !Array.isArray(value.warnings)) throw new Error("Native sample discovery returned an invalid result.");
  return {
    rootPath: typeof value.rootPath === "string" ? value.rootPath : null,
    rootLabel: typeof value.rootLabel === "string" ? value.rootLabel : null,
    files: value.files.map((file) => sanitizeDiscoveredFile(file)).filter((file): file is DiscoveredSampleFile => !!file),
    warnings: value.warnings.map(String),
    truncated: value.truncated === true
  };
}

function sanitizeDiscoveredFile(value: unknown): DiscoveredSampleFile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const path = typeof raw.path === "string" ? raw.path : "";
  const extension = supportedExtensionForPath(path);
  if (!path || !extension) return null;
  return {
    path,
    name: typeof raw.name === "string" && raw.name ? raw.name : fileNameFromPath(path),
    folderPath: typeof raw.folderPath === "string" ? raw.folderPath : parentPath(path),
    extension,
    sizeBytes: cleanNonNegativeNumber(raw.sizeBytes),
    modifiedUnixMs: cleanNullableNumber(raw.modifiedUnixMs)
  };
}

function pruneDanglingIds(index: SampleLibraryIndex): SampleLibraryIndex {
  const ids = new Set(index.entries.map((entry) => entry.id));
  index.favoriteIds = index.favoriteIds.filter((id) => ids.has(id));
  index.recentIds = index.recentIds.filter((id) => ids.has(id));
  return index;
}

function stableLocalId(kind: "sample" | "folder", value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${kind}_${(hash >>> 0).toString(36)}`;
}

function normalizeLocalPath(value: string): string {
  return value.trim().replace(/\//g, "\\").replace(/\\+$/g, "").toLocaleLowerCase("en-US");
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || "";
}

function parentPath(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join("\\");
}

function cleanDateString(value: unknown): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : new Date(0).toISOString();
}

function cleanNonNegativeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function cleanNullableNumber(value: unknown): number | null {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) && number >= 0 ? number : null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function isCategory(value: unknown): value is SampleLibraryCategory {
  return value === "drums" || value === "bass" || value === "chords" || value === "melody" || value === "guitar" || value === "fx" || value === "other";
}

function cleanIds(value: unknown, allowed: Set<string>): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id)))]
    : [];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const defaultNativeSampleLibraryApi: NativeSampleLibraryApi = {
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
