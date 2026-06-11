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
  const external = metadata.external === true || isExternalUri(item.uri);
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
            : "Project";
  return { missing, unresolved, external, runtimeAvailable, runtimeOnly, reloadable, label };
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
