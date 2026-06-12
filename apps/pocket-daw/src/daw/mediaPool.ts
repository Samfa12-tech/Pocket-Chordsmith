import type { JsonObject, MediaPoolItem, PocketDawProject, RenderCacheItem } from "./schema";
import { cloneProject } from "./dawProject";

export interface CreateMediaPoolItemInput {
  kind: MediaPoolItem["kind"];
  name: string;
  uri?: string;
  mimeType?: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  sizeBytes?: number;
  checksum?: string;
  metadata?: JsonObject;
}

export interface MediaPoolStatus {
  missing: boolean;
  external: boolean;
  unresolved: boolean;
  runtimeAvailable: boolean;
  runtimeOnly: boolean;
  reloadable: boolean;
  label: string;
}

export interface CollectMediaPlanItem {
  id: string;
  name: string;
  kind: MediaPoolItem["kind"];
  sourceUri?: string;
  targetRelativePath?: string;
  action: "copy-to-project-media" | "already-project-media" | "blocked";
  reason?: string;
}

export interface CollectMediaPlan {
  projectTitle: string;
  targetFolder: "project-media";
  copy: CollectMediaPlanItem[];
  alreadyProject: CollectMediaPlanItem[];
  blocked: CollectMediaPlanItem[];
  notes: string[];
}

export function addMediaPoolItem(project: PocketDawProject, item: MediaPoolItem): PocketDawProject {
  const next = cloneProject(project);
  const existingIndex = next.mediaPool.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) next.mediaPool[existingIndex] = mergeMediaPoolItem(next.mediaPool[existingIndex], item);
  else next.mediaPool.push(item);
  return next;
}

export function createMediaPoolItem(input: CreateMediaPoolItemInput, existing: MediaPoolItem[] = []): MediaPoolItem {
  return {
    id: nextMediaPoolItemId(existing),
    kind: input.kind,
    name: input.name.trim() || "Untitled media",
    uri: input.uri,
    mimeType: input.mimeType,
    durationSeconds: cleanOptionalNumber(input.durationSeconds),
    sampleRate: cleanOptionalNumber(input.sampleRate),
    channels: cleanOptionalNumber(input.channels),
    sizeBytes: cleanOptionalNumber(input.sizeBytes),
    checksum: input.checksum,
    metadata: { ...(input.metadata || {}) }
  };
}

export function findMediaPoolItem(project: PocketDawProject, id: string): MediaPoolItem | null {
  return project.mediaPool.find((item) => item.id === id) || null;
}

export function updateMediaPoolItemMetadata(project: PocketDawProject, id: string, metadata: JsonObject): PocketDawProject {
  const next = cloneProject(project);
  const item = next.mediaPool.find((entry) => entry.id === id);
  if (!item) return project;
  item.metadata = {
    ...(item.metadata || {}),
    ...metadata
  };
  return next;
}

export function updateMediaPoolItem(project: PocketDawProject, id: string, patch: Partial<Omit<MediaPoolItem, "id" | "metadata">> & { metadata?: JsonObject }): PocketDawProject {
  const next = cloneProject(project);
  const item = next.mediaPool.find((entry) => entry.id === id);
  if (!item) return project;
  const existingMetadata = { ...(item.metadata || {}) };
  Object.assign(item, patch);
  item.metadata = {
    ...existingMetadata,
    ...(patch.metadata || {})
  };
  return next;
}

export function markMediaPoolItemMissing(project: PocketDawProject, id: string, missing = true, reason?: string): PocketDawProject {
  return updateMediaPoolItemMetadata(project, id, {
    missing,
    unresolved: missing,
    missingReason: reason || (missing ? "Media path has not been resolved." : "")
  });
}

export function markMediaPoolItemExternal(project: PocketDawProject, id: string, external = true): PocketDawProject {
  return updateMediaPoolItemMetadata(project, id, { external });
}

export function removeUnusedMediaPoolItem(project: PocketDawProject, id: string): { project: PocketDawProject; removed: boolean; reason?: string } {
  const next = cloneProject(project);
  if (next.timeline.clips.some((clip) => clip.mediaPoolItemId === id)) {
    return { project, removed: false, reason: "Media item is used by a timeline clip." };
  }
  if (next.renderCache.some((cache) => cache.mediaPoolItemId === id)) {
    return { project, removed: false, reason: "Media item is linked to a render cache entry." };
  }
  const before = next.mediaPool.length;
  next.mediaPool = next.mediaPool.filter((item) => item.id !== id);
  return { project: next, removed: next.mediaPool.length !== before };
}

export function renderCacheItemsForMedia(project: PocketDawProject, mediaPoolItemId: string): RenderCacheItem[] {
  return project.renderCache.filter((item) => item.mediaPoolItemId === mediaPoolItemId);
}

export function mediaPoolStatus(item: MediaPoolItem, runtimeAvailable = false): MediaPoolStatus {
  const metadata = item.metadata || {};
  const missing = metadata.missing === true;
  const unresolved = metadata.unresolved === true;
  const runtimeOnly = metadata.runtimeOnly === true;
  const projectMedia = isProjectMediaItem(item);
  const external = !projectMedia && (metadata.external === true || isExternalUri(item.uri));
  const reloadable = item.kind === "audio" && external && !runtimeOnly && !missing && !!item.uri;
  const label = missing
    ? "Missing"
    : runtimeAvailable
      ? "Available in runtime"
      : unresolved
        ? "Unresolved"
        : runtimeOnly
          ? "Browser runtime-only"
          : external
            ? "External unloaded"
            : "Project media";
  return { missing, unresolved, external, runtimeAvailable, runtimeOnly, reloadable, label };
}

export function createCollectMediaPlan(project: PocketDawProject): CollectMediaPlan {
  const usedTargets = new Set<string>();
  const items = project.mediaPool.map((item): CollectMediaPlanItem => {
    const status = mediaPoolStatus(item);
    if (isProjectMediaItem(item)) {
      return {
        id: item.id,
        name: item.name,
        kind: item.kind,
        sourceUri: item.uri,
        targetRelativePath: String(item.metadata?.projectRelativePath || item.uri || ""),
        action: "already-project-media"
      };
    }
    if (status.missing || status.unresolved) {
      return blockedPlanItem(item, item.uri, status.missing ? "Media is missing. Relink it before collecting." : "Media path is unresolved. Relink it before collecting.");
    }
    if (status.runtimeOnly) {
      return blockedPlanItem(item, item.uri, "Browser runtime-only media has no durable path. Re-import or save from the native app before collecting.");
    }
    if (!item.uri) {
      return blockedPlanItem(item, undefined, "No source URI is stored for this media item.");
    }
    if (!status.external) {
      return {
        id: item.id,
        name: item.name,
        kind: item.kind,
        sourceUri: item.uri,
        targetRelativePath: projectMediaRelativePath(item, usedTargets),
        action: "already-project-media"
      };
    }
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      sourceUri: item.uri,
      targetRelativePath: projectMediaRelativePath(item, usedTargets),
      action: "copy-to-project-media"
    };
  });
  return {
    projectTitle: project.project.title,
    targetFolder: "project-media",
    copy: items.filter((item) => item.action === "copy-to-project-media"),
    alreadyProject: items.filter((item) => item.action === "already-project-media"),
    blocked: items.filter((item) => item.action === "blocked"),
    notes: [
      "This is a deterministic collect-media plan. v0.6 native copy/relink is still guarded, so review the plan before moving files.",
      "Browser runtime-only media cannot be collected because browsers do not expose a durable source path after import."
    ]
  };
}

export function projectMediaRelativePath(item: MediaPoolItem, usedTargets: Set<string> = new Set()): string {
  const baseName = safeFileName(item.name || fileNameFromUri(item.uri) || item.id);
  let target = `project-media/${baseName}`;
  let suffix = 2;
  while (usedTargets.has(target.toLowerCase())) {
    const dot = baseName.lastIndexOf(".");
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const ext = dot > 0 ? baseName.slice(dot) : "";
    target = `project-media/${stem}-${suffix}${ext}`;
    suffix += 1;
  }
  usedTargets.add(target.toLowerCase());
  return target;
}

function mergeMediaPoolItem(existing: MediaPoolItem, incoming: MediaPoolItem): MediaPoolItem {
  return {
    ...existing,
    ...incoming,
    metadata: {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {})
    }
  };
}

function nextMediaPoolItemId(items: MediaPoolItem[]): string {
  let i = items.length + 1;
  const ids = new Set(items.map((item) => item.id));
  while (ids.has(`media_${String(i).padStart(3, "0")}`)) i += 1;
  return `media_${String(i).padStart(3, "0")}`;
}

function cleanOptionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function isExternalUri(uri?: string): boolean {
  if (!uri) return false;
  return /^(file|https?):/i.test(uri) || /^[a-z]:[\\/]/i.test(uri) || uri.startsWith("\\\\");
}

function isProjectMediaItem(item: MediaPoolItem): boolean {
  const metadata = item.metadata || {};
  if (metadata.mediaRefKind === "project" || metadata.projectRelativePath) return true;
  const uri = item.uri || "";
  return uri.startsWith("project://media/") || uri.startsWith("project-media/");
}

function blockedPlanItem(item: MediaPoolItem, sourceUri: string | undefined, reason: string): CollectMediaPlanItem {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    sourceUri,
    action: "blocked",
    reason
  };
}

function fileNameFromUri(uri?: string): string {
  return uri?.split(/[\\/]/).filter(Boolean).pop() || "";
}

function safeFileName(value: string): string {
  const name = value.trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-").replace(/\s+/g, " ").replace(/^\.+/, "").slice(0, 96);
  return name || "media-file";
}
