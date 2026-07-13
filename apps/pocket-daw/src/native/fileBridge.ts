import { buildPocketDawProjectFile } from "../daw/dawProject";
import { validateProjectInvariants } from "../daw/projectInvariants";
import type { PocketDawProject } from "../daw/schema";

export interface ProjectFileState {
  path: string | null;
  label: string;
}

export interface OpenProjectFileResult {
  contents: string;
  file: ProjectFileState;
}

export interface SaveProjectFileResult {
  file: ProjectFileState | null;
  mode: "native" | "browser-fallback" | "cancelled";
  message: string;
}

export interface SaveBinaryFileResult {
  file: ProjectFileState | null;
  mode: "native" | "browser-fallback" | "cancelled";
  message: string;
  bytesWritten?: number;
}

export type BinaryExportKind = "wav" | "midi" | "zip";

interface NativeOpenPayload {
  path: string;
  label: string;
  contents: string;
}

interface NativeSavePayload {
  path: string;
  label: string;
  backupPath?: string | null;
  bytesWritten?: number;
  recoveryWarnings?: string[];
}

interface NativeBinarySavePayload {
  path: string;
  label: string;
  bytesWritten: number;
}

export interface NativeProjectRecoveryCandidate {
  path: string;
  sizeBytes: number;
  modifiedUnixMs: number | null;
  valid: boolean;
  note: string;
}

export interface NativeProjectRecoveryState {
  current: NativeProjectRecoveryCandidate | null;
  temp: NativeProjectRecoveryCandidate | null;
  backup: NativeProjectRecoveryCandidate | null;
}

export type ProjectRecoveryRecommendationKind = "none" | "offer-temp" | "offer-backup" | "current-invalid";

export interface ProjectRecoveryRecommendation {
  kind: ProjectRecoveryRecommendationKind;
  candidate: "temp" | "backup" | "current" | null;
  message: string;
}

export interface NativeFileApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export const browserProjectFileState: ProjectFileState = {
  path: null,
  label: "Unsaved browser project"
};

export function projectFileStateFromPath(path: string | null | undefined, fallbackLabel = "Untitled project"): ProjectFileState {
  if (!path) return { path: null, label: fallbackLabel };
  return {
    path,
    label: path.split(/[\\/]/).filter(Boolean).pop() || fallbackLabel
  };
}

export function projectTitleFromFileState(file: ProjectFileState | null | undefined): string | null {
  const label = String(file?.label || file?.path?.split(/[\\/]/).filter(Boolean).pop() || "").trim();
  if (!label) return null;
  const withoutExtension = label.replace(/\.pocketdaw$/i, "").trim();
  return withoutExtension || label;
}

export async function openProjectFileNative(api = defaultNativeFileApi): Promise<OpenProjectFileResult | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeOpenPayload | null>("open_project_file");
  if (!result) return null;
  assertNativeOpenPayload(result);
  return {
    contents: result.contents,
    file: {
      path: result.path,
      label: result.label || projectFileStateFromPath(result.path).label
    }
  };
}

export async function readProjectFileNative(path: string, api = defaultNativeFileApi): Promise<OpenProjectFileResult | null> {
  if (!api.isAvailable()) return null;
  const result = await api.invoke<NativeOpenPayload>("read_project_file", { path });
  assertNativeOpenPayload(result);
  return {
    contents: result.contents,
    file: {
      path: result.path,
      label: result.label || projectFileStateFromPath(result.path).label
    }
  };
}

export async function discoverProjectRecoveryNative(path: string, api = defaultNativeFileApi): Promise<NativeProjectRecoveryState | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<NativeProjectRecoveryState>("discover_project_recovery", { path });
}

export function projectRecoveryRecommendation(state: NativeProjectRecoveryState | null): ProjectRecoveryRecommendation {
  if (!state) return { kind: "none", candidate: null, message: "No native project recovery information is available." };
  const current = state.current;
  const temp = state.temp;
  const backup = state.backup;
  if (temp?.valid && isNewerThan(temp, current)) {
    return {
      kind: "offer-temp",
      candidate: "temp",
      message: "A newer valid temporary project save exists. Offer recovery before overwriting the current project."
    };
  }
  if (backup?.valid && (!current?.valid || isNewerThan(backup, current))) {
    return {
      kind: "offer-backup",
      candidate: "backup",
      message: current?.valid
        ? "A newer valid project backup exists. Offer recovery before continuing."
        : "The current project is not valid, but a valid backup is available."
    };
  }
  if (current && !current.valid) {
    return {
      kind: "current-invalid",
      candidate: "current",
      message: "The current project file is not a valid Pocket DAW project and no newer valid recovery candidate was found."
    };
  }
  return { kind: "none", candidate: null, message: "No newer valid project recovery candidate was found." };
}

export async function saveProjectFile(
  project: PocketDawProject,
  currentPath?: string | null,
  forceSaveAs = false,
  api = defaultNativeFileApi
): Promise<SaveProjectFileResult> {
  const invariants = validateProjectInvariants(project);
  if (invariants.errors.length) {
    throw new Error(`Project has ${invariants.errors.length} save-blocking invariant error(s): ${invariants.errors[0].message}`);
  }
  const contents = buildPocketDawProjectFile(project);
  const defaultName = safeName(project.project.title, "pocketdaw");
  if (api.isAvailable()) {
    try {
      if (currentPath && !forceSaveAs) {
        const saved = await api.invoke<NativeSavePayload>("write_project_file", { path: currentPath, contents });
        assertNativeSavePayload(saved);
        return {
          file: projectFileStateFromPath(saved.path, saved.label),
          mode: "native",
          message: `Saved ${saved.label || projectFileStateFromPath(saved.path).label}.`
        };
      }
      const saved = await api.invoke<NativeSavePayload | null>("save_project_file_as", { defaultName, contents });
      if (!saved) {
        return { file: currentPath ? projectFileStateFromPath(currentPath) : null, mode: "cancelled", message: "Save cancelled." };
      }
      assertNativeSavePayload(saved);
      return {
        file: projectFileStateFromPath(saved.path, saved.label),
        mode: "native",
        message: `Saved ${saved.label || projectFileStateFromPath(saved.path).label}.`
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error || "Native save failed.");
      downloadBlob(new Blob([contents], { type: "application/json" }), defaultName);
      return {
        file: null,
        mode: "browser-fallback",
        message: `Native save failed (${reason}). Downloaded browser fallback.`
      };
    }
  }
  downloadBlob(new Blob([contents], { type: "application/json" }), defaultName);
  return { file: null, mode: "browser-fallback", message: "Downloaded browser fallback .pocketdaw file." };
}

export async function writeProjectFileNativeStrict(
  project: PocketDawProject,
  currentPath: string,
  api = defaultNativeFileApi
): Promise<SaveProjectFileResult> {
  const invariants = validateProjectInvariants(project);
  if (invariants.errors.length) {
    throw new Error(`Project has ${invariants.errors.length} save-blocking invariant error(s): ${invariants.errors[0].message}`);
  }
  if (!currentPath) throw new Error("A saved .pocketdaw path is required.");
  if (!api.isAvailable()) throw new Error("Strict project save is only available in the installed native app.");
  const contents = buildPocketDawProjectFile(project);
  const saved = await api.invoke<NativeSavePayload>("write_project_file", { path: currentPath, contents });
  assertNativeSavePayload(saved);
  return {
    file: projectFileStateFromPath(saved.path, saved.label),
    mode: "native",
    message: `Saved ${saved.label || projectFileStateFromPath(saved.path).label}.`
  };
}

export async function saveBlobFileAs(
  blob: Blob,
  defaultName: string,
  api = defaultNativeFileApi
): Promise<SaveBinaryFileResult> {
  if (api.isAvailable()) {
    try {
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const saved = await api.invoke<NativeBinarySavePayload | null>("save_binary_file_as", {
        defaultName,
        bytes
      });
      if (!saved) return { file: null, mode: "cancelled", message: "Save cancelled." };
      assertNativeBinarySavePayload(saved);
      return {
        file: projectFileStateFromPath(saved.path, saved.label),
        mode: "native",
        message: `Saved ${saved.label || projectFileStateFromPath(saved.path).label}.`,
        bytesWritten: saved.bytesWritten
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error || "Native save failed.");
      downloadBlob(blob, defaultName);
      return {
        file: null,
        mode: "browser-fallback",
        message: `Native save failed (${reason}). Downloaded browser fallback.`,
        bytesWritten: blob.size
      };
    }
  }
  downloadBlob(blob, defaultName);
  return {
    file: null,
    mode: "browser-fallback",
    message: "Downloaded browser fallback file.",
    bytesWritten: blob.size
  };
}

export async function writeBlobFileNative(
  path: string,
  blob: Blob,
  kind: BinaryExportKind,
  api = defaultNativeFileApi
): Promise<SaveBinaryFileResult> {
  if (!api.isAvailable()) {
    throw new Error("Native binary writes are unavailable in this runtime.");
  }
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  const saved = await api.invoke<NativeBinarySavePayload>("write_binary_file", {
    path,
    bytes,
    kind
  });
  assertNativeBinarySavePayload(saved);
  return {
    file: projectFileStateFromPath(saved.path, saved.label),
    mode: "native",
    message: `Saved ${saved.label || projectFileStateFromPath(saved.path).label}.`,
    bytesWritten: saved.bytesWritten
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeName(title: string, ext: string): string {
  return `${title || "pocket-daw-project"}`.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() + `.${ext}`;
}

function assertNativeSavePayload(value: NativeSavePayload): void {
  if (!value || typeof value.path !== "string") {
    throw new Error("Native save returned an invalid project file payload.");
  }
}

function assertNativeBinarySavePayload(value: NativeBinarySavePayload): void {
  if (!value || typeof value.path !== "string" || typeof value.bytesWritten !== "number") {
    throw new Error("Native save returned an invalid binary file payload.");
  }
}

function assertNativeOpenPayload(value: NativeOpenPayload): void {
  if (!value || typeof value.contents !== "string" || typeof value.path !== "string") {
    throw new Error("Native open returned an invalid project file payload.");
  }
}

function isNewerThan(
  candidate: NativeProjectRecoveryCandidate,
  current: NativeProjectRecoveryCandidate | null
): boolean {
  if (!current) return true;
  if (!candidate.modifiedUnixMs) return false;
  if (!current.modifiedUnixMs) return true;
  return candidate.modifiedUnixMs > current.modifiedUnixMs;
}

const defaultNativeFileApi: NativeFileApi = {
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
