import { buildPocketDawProjectFile } from "../daw/dawProject";
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

interface NativeOpenPayload {
  path: string;
  label: string;
  contents: string;
}

interface NativeSavePayload {
  path: string;
  label: string;
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

export async function saveProjectFile(
  project: PocketDawProject,
  currentPath?: string | null,
  forceSaveAs = false,
  api = defaultNativeFileApi
): Promise<SaveProjectFileResult> {
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

function assertNativeOpenPayload(value: NativeOpenPayload): void {
  if (!value || typeof value.contents !== "string" || typeof value.path !== "string") {
    throw new Error("Native open returned an invalid project file payload.");
  }
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
