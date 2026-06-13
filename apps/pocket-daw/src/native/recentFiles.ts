const RECENT_KEY = "pocket_daw_recent_v1";
const AUTOSAVE_KEY = "pocket_daw_autosave_v1";
const AUTOSAVE_FILE_KEY = "pocket_daw_autosave_file_v1";
const UPDATER_AUTO_CHECK_KEY = "pocket_daw_updater_auto_check_v1";

export interface RecentProject {
  label: string;
  path: string | null;
  openedAt: string;
}

export interface AutosaveFileState {
  label: string;
  path: string | null;
}

export function saveRecentProject(label: string, path: string | null = null): void {
  const key = recentKey(label, path);
  const existing = loadRecentProjects().filter((item) => recentKey(item.label, item.path) !== key);
  localStorage.setItem(RECENT_KEY, JSON.stringify([{ label, path, openedAt: new Date().toISOString() }, ...existing].slice(0, 8)));
}

export function saveRecentLabel(label: string): void {
  saveRecentProject(label, null);
}

export function loadRecentProjects(): RecentProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === "string") return { label: item, path: null, openedAt: "" };
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        return {
          label: String(raw.label || raw.path || "Untitled project"),
          path: typeof raw.path === "string" ? raw.path : null,
          openedAt: typeof raw.openedAt === "string" ? raw.openedAt : ""
        };
      })
      .filter((item): item is RecentProject => !!item && !!item.label);
  } catch {
    return [];
  }
}

export function loadRecentLabels(): string[] {
  return loadRecentProjects().map((item) => item.path ? `${item.label} - ${item.path}` : item.label);
}

export function saveAutosave(raw: string, currentFile?: AutosaveFileState): void {
  localStorage.setItem(AUTOSAVE_KEY, raw);
  if (currentFile !== undefined) {
    localStorage.setItem(AUTOSAVE_FILE_KEY, JSON.stringify({
      label: currentFile.label || "Autosaved project",
      path: currentFile.path || null
    }));
  }
}

export function loadAutosave(): string | null {
  return localStorage.getItem(AUTOSAVE_KEY);
}

export function loadAutosaveFileState(): AutosaveFileState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTOSAVE_FILE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    const raw = parsed as Record<string, unknown>;
    const label = typeof raw.label === "string" && raw.label ? raw.label : null;
    const path = typeof raw.path === "string" && raw.path ? raw.path : null;
    if (!label && !path) return null;
    return { label: label || path || "Autosaved project", path };
  } catch {
    return null;
  }
}

export function saveUpdaterAutoCheckPreference(enabled: boolean): void {
  safeLocalStorage()?.setItem(UPDATER_AUTO_CHECK_KEY, enabled ? "1" : "0");
}

export function loadUpdaterAutoCheckPreference(): boolean {
  const stored = safeLocalStorage()?.getItem(UPDATER_AUTO_CHECK_KEY);
  if (stored === "0") return false;
  return true;
}

function recentKey(label: string, path: string | null) {
  return `${path || ""}::${label}`;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
