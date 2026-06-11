const RECENT_KEY = "pocket_daw_recent_v1";
const AUTOSAVE_KEY = "pocket_daw_autosave_v1";

export interface RecentProject {
  label: string;
  path: string | null;
  openedAt: string;
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

export function saveAutosave(raw: string): void {
  localStorage.setItem(AUTOSAVE_KEY, raw);
}

export function loadAutosave(): string | null {
  return localStorage.getItem(AUTOSAVE_KEY);
}

function recentKey(label: string, path: string | null) {
  return `${path || ""}::${label}`;
}
