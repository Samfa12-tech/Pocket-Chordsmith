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
  cacheReloadable: boolean;
  reloadable: boolean;
  relinkable: boolean;
  label: string;
}

export interface MediaPoolReloadCandidate {
  path: string;
  kind: "source" | "decoded-cache";
  label: string;
  projectRelative: boolean;
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

export interface MediaPortabilitySummary {
  totalMediaCount: number;
  audioMediaCount: number;
  portableCount: number;
  alreadyProjectCount: number;
  copyableExternalCount: number;
  cacheOnlyCount: number;
  blockedCount: number;
  runtimeOnlyCount: number;
  missingOrUnresolvedCount: number;
  needsCollectionOrRelinkCount: number;
  embeddedSourceProjectPortable: boolean;
}

export type MediaPortabilityState =
  | "portable-project"
  | "copyable-external"
  | "cache-only"
  | "runtime-only"
  | "missing-or-unresolved"
  | "blocked";

export interface MediaPortabilityVerificationItem {
  id: string;
  name: string;
  kind: MediaPoolItem["kind"];
  state: MediaPortabilityState;
  portable: boolean;
  action: "none" | "collect" | "relink" | "reload-cache";
  reason: string;
  hasProjectRelativePath: boolean;
  hasDecodedCache: boolean;
  reloadable: boolean;
  relinkable: boolean;
}

export interface MediaPortabilityVerification extends MediaPortabilitySummary {
  items: MediaPortabilityVerificationItem[];
  warnings: string[];
}

export interface SharedMediaPortabilityVerification {
  localReferenceFieldCount: number;
  localReferenceItemCount: number;
  affectedItemIds: string[];
  affectedFieldKeys: string[];
  portableForSharing: boolean;
}

export interface CollectedMediaItem {
  id: string;
  sourceUri: string;
  targetPath: string;
  targetRelativePath: string;
  sizeBytes?: number;
}

export interface LinkFreezeRenderCacheInput {
  sourceClipId: string;
  mediaPoolItemId: string;
  createdAt?: string;
  profileId?: string;
  metadata?: JsonObject;
}

export interface RenderCacheSummary {
  totalCount: number;
  activeCount: number;
  invalidatedCount: number;
  linkedMediaCount: number;
  unlinkedCount: number;
  freezeRenderCount: number;
  nativeGeneratedStemCount: number;
  nativeRuntimeAudioCount: number;
  latestCreatedAt: string | null;
  byKind: Record<string, number>;
}

export interface AudioMediaAnalysisSummary {
  audioMediaCount: number;
  audioClipCount: number;
  waveformReadyCount: number;
  waveformMissingCount: number;
  waveformPeakPointCount: number;
  maxPeak: number | null;
  normalizeReadyClipCount: number;
  clipsMissingWaveformCount: number;
  staleAnalysisCount: number;
  decodedCacheCount: number;
  transientReadyCount: number;
  transientMarkerCount: number;
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

export function markMediaPoolItemCollected(project: PocketDawProject, collected: CollectedMediaItem): PocketDawProject {
  const item = findMediaPoolItem(project, collected.id);
  if (!item) return project;
  const targetRelativePath = normalizeProjectRelativeMediaPath(collected.targetRelativePath) || projectMediaRelativePath(item);
  return updateMediaPoolItem(project, collected.id, {
    uri: targetRelativePath,
    sizeBytes: cleanOptionalNumber(collected.sizeBytes) ?? item.sizeBytes,
    metadata: {
      mediaRefKind: "project",
      projectRelativePath: targetRelativePath,
      collectedAt: new Date().toISOString(),
      originalUri: item.metadata?.originalUri || collected.sourceUri,
      external: false,
      runtimeOnly: false,
      missing: false,
      unresolved: false,
      nativePath: collected.targetPath
    }
  });
}

export function normalizeProjectRelativeMediaPath(path: string): string {
  const raw = String(path || "").trim().replace(/^project:\/\/media\//i, "project-media/");
  if (!raw || /^[a-z]+:/i.test(raw) || /^[a-z]:[\\/]/i.test(raw) || raw.startsWith("/") || raw.startsWith("\\\\")) return "";
  const normalized = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== ".")
    .join("/");
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) return "";
  if (!normalized.startsWith("project-media/") && !normalized.startsWith("project-cache/")) return "";
  return normalized;
}

export function markMediaPoolItemRelinked(project: PocketDawProject, id: string, source: { uri: string; name?: string; sizeBytes?: number; mimeType?: string }): PocketDawProject {
  const item = findMediaPoolItem(project, id);
  if (!item) return project;
  const next = cloneProject(project);
  const nextItem = next.mediaPool.find((entry) => entry.id === id);
  if (!nextItem) return project;
  nextItem.name = source.name || item.name;
  nextItem.uri = source.uri;
  nextItem.sizeBytes = cleanOptionalNumber(source.sizeBytes) ?? item.sizeBytes;
  nextItem.mimeType = source.mimeType || item.mimeType;
  nextItem.metadata = {
    ...metadataWithoutSourceDerivedFields(item.metadata),
    mediaRefKind: "external",
    originalUri: source.uri,
    external: true,
    runtimeOnly: false,
    missing: false,
    unresolved: false,
    relinkedAt: new Date().toISOString(),
    analysisInvalidated: true,
    waveformNeedsRefresh: true
  };
  return next;
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

export function createRenderCacheSummary(project: PocketDawProject): RenderCacheSummary {
  const byKind: Record<string, number> = {};
  let latestCreatedAt: string | null = null;
  project.renderCache.forEach((item) => {
    const kind = metadataString(item.metadata?.cacheKind) || "unknown";
    byKind[kind] = (byKind[kind] || 0) + 1;
    if (item.createdAt && (!latestCreatedAt || item.createdAt > latestCreatedAt)) latestCreatedAt = item.createdAt;
  });
  return {
    totalCount: project.renderCache.length,
    activeCount: project.renderCache.filter((item) => !item.invalidated).length,
    invalidatedCount: project.renderCache.filter((item) => item.invalidated).length,
    linkedMediaCount: project.renderCache.filter((item) => !!item.mediaPoolItemId).length,
    unlinkedCount: project.renderCache.filter((item) => !item.mediaPoolItemId).length,
    freezeRenderCount: byKind["freeze-render"] || 0,
    nativeGeneratedStemCount: byKind["native-generated-stem"] || 0,
    nativeRuntimeAudioCount: byKind["native-runtime-audio"] || 0,
    latestCreatedAt,
    byKind
  };
}

export function createAudioMediaAnalysisSummary(project: PocketDawProject): AudioMediaAnalysisSummary {
  const audioItems = project.mediaPool.filter((item) => item.kind === "audio");
  const peaksByMediaId = new Map(audioItems.map((item) => [item.id, waveformPeaksFromMetadata(item.metadata?.waveformPeaks)]));
  const waveformReady = audioItems.filter((item) => (peaksByMediaId.get(item.id) || []).length > 0);
  const transientMarkersByMediaId = new Map(audioItems.map((item) => [item.id, transientMarkersFromMetadata(item.metadata?.audioTransientMarkersSeconds)]));
  const transientReady = audioItems.filter((item) => (transientMarkersByMediaId.get(item.id) || []).length > 0);
  const peakPointCount = waveformReady.reduce((sum, item) => sum + (peaksByMediaId.get(item.id) || []).length, 0);
  const transientMarkerCount = transientReady.reduce((sum, item) => sum + (transientMarkersByMediaId.get(item.id) || []).length, 0);
  const maxPeak = waveformReady.reduce<number | null>((current, item) => {
    const peaks = peaksByMediaId.get(item.id) || [];
    const itemPeak = peaks.reduce((peak, value) => Math.max(peak, value), 0);
    return current === null ? itemPeak : Math.max(current, itemPeak);
  }, null);
  const audioClips = project.timeline.clips.filter((clip) => clip.type === "audio" && !!clip.mediaPoolItemId);
  const normalizeReadyClipCount = audioClips.filter((clip) => !!clip.mediaPoolItemId && (peaksByMediaId.get(clip.mediaPoolItemId) || []).length > 0).length;
  return {
    audioMediaCount: audioItems.length,
    audioClipCount: audioClips.length,
    waveformReadyCount: waveformReady.length,
    waveformMissingCount: audioItems.length - waveformReady.length,
    waveformPeakPointCount: peakPointCount,
    maxPeak,
    normalizeReadyClipCount,
    clipsMissingWaveformCount: audioClips.length - normalizeReadyClipCount,
    staleAnalysisCount: audioItems.filter((item) => item.metadata?.analysisInvalidated === true || item.metadata?.waveformNeedsRefresh === true).length,
    decodedCacheCount: audioItems.filter((item) => !!metadataString(item.metadata?.nativeDecodedCacheRelativePath)).length,
    transientReadyCount: transientReady.length,
    transientMarkerCount
  };
}

export function linkFreezeRenderCacheItem(project: PocketDawProject, input: LinkFreezeRenderCacheInput): PocketDawProject {
  const media = findMediaPoolItem(project, input.mediaPoolItemId);
  const sourceClip = project.timeline.clips.find((clip) => clip.id === input.sourceClipId);
  if (!media || !sourceClip) return project;
  const next = cloneProject(project);
  const id = `freeze_${safeCacheId(input.sourceClipId)}_${safeCacheId(input.mediaPoolItemId)}`;
  const item: RenderCacheItem = {
    id,
    sourceClipId: input.sourceClipId,
    mediaPoolItemId: input.mediaPoolItemId,
    profileId: input.profileId || "freeze-selected-clip-wav",
    createdAt: input.createdAt || new Date().toISOString(),
    invalidated: false,
    metadata: {
      cacheKind: "freeze-render",
      sourceClipName: sourceClip.name,
      sourceTrackId: sourceClip.trackId,
      sourceStartBar: sourceClip.startBar,
      sourceBarLength: sourceClip.barLength,
      renderedMediaName: media.name,
      renderedMediaUri: media.uri || "",
      renderedDurationSeconds: media.durationSeconds || 0,
      renderedSampleRate: media.sampleRate || 0,
      renderedChannels: media.channels || 0,
      renderedSizeBytes: media.sizeBytes || 0,
      ...(input.metadata || {})
    }
  };
  next.renderCache = next.renderCache.filter((entry) => entry.id !== id);
  next.renderCache.push(item);
  return next;
}

export function mediaPoolStatus(item: MediaPoolItem, runtimeAvailable = false): MediaPoolStatus {
  const metadata = item.metadata || {};
  const missing = metadata.missing === true;
  const unresolved = metadata.unresolved === true;
  const runtimeOnly = metadata.runtimeOnly === true;
  const projectMedia = isProjectMediaItem(item);
  const external = !projectMedia && (metadata.external === true || isExternalUri(item.uri));
  const cacheReloadable = item.kind === "audio" && !runtimeOnly && !!normalizeProjectRelativeMediaPath(metadataString(metadata.nativeDecodedCacheRelativePath));
  const sourceReloadable = item.kind === "audio" && !runtimeOnly && !missing && !!item.uri && (external || projectMedia);
  const reloadable = sourceReloadable || cacheReloadable;
  const relinkable = item.kind === "audio" && (runtimeOnly || external || projectMedia || missing || unresolved);
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
  return { missing, unresolved, external, runtimeAvailable, runtimeOnly, cacheReloadable, reloadable, relinkable, label };
}

export function mediaPoolReloadPath(item: MediaPoolItem): string | null {
  return mediaPoolReloadCandidates(item)[0]?.path || null;
}

export function mediaPoolReloadCandidates(item: MediaPoolItem): MediaPoolReloadCandidate[] {
  const status = mediaPoolStatus(item);
  if (!status.reloadable || status.runtimeOnly || item.kind !== "audio") return [];
  const metadata = item.metadata || {};
  const candidates: MediaPoolReloadCandidate[] = [];
  if (!status.missing && !status.unresolved && item.uri && (status.external || isProjectMediaItem(item))) {
    const sourcePath = status.external
      ? String(item.uri || "").trim()
      : normalizeProjectRelativeMediaPath(String(metadata.projectRelativePath || item.uri || ""));
    if (sourcePath) {
      candidates.push({
        path: sourcePath,
        kind: "source",
        label: status.external ? "original source" : "project media",
        projectRelative: !status.external
      });
    }
  }
  const cachePath = normalizeProjectRelativeMediaPath(metadataString(metadata.nativeDecodedCacheRelativePath));
  if (cachePath && !candidates.some((candidate) => sameReloadPath(candidate.path, cachePath))) {
    candidates.push({
      path: cachePath,
      kind: "decoded-cache",
      label: "decoded native cache",
      projectRelative: true
    });
  }
  return candidates;
}

export function createCollectMediaPlan(project: PocketDawProject): CollectMediaPlan {
  const usedTargets = new Set<string>(project.mediaPool
    .filter((item) => isProjectMediaItem(item))
    .map((item) => normalizeProjectRelativeMediaPath(String(item.metadata?.projectRelativePath || item.uri || "")))
    .filter(Boolean)
    .map((path) => path.toLowerCase()));
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
      return blockedPlanItem(item, item.uri, "Browser runtime-only media has no durable path. Relink it in the installed app before collecting.");
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
      "This is a deterministic collect-media plan. In the native app, Collect Media copies copyable files beside the saved project under project-media/.",
      "Browser runtime-only media cannot be collected because browsers do not expose a durable source path after import."
    ]
  };
}

export function createMediaPortabilitySummary(project: PocketDawProject): MediaPortabilitySummary {
  const { items: _items, warnings: _warnings, ...summary } = verifyMediaPortability(project);
  return summary;
}

export function verifyMediaPortability(project: PocketDawProject): MediaPortabilityVerification {
  const plan = createCollectMediaPlan(project);
  const planItems = new Map<string, CollectMediaPlanItem>();
  [...plan.copy, ...plan.alreadyProject, ...plan.blocked].forEach((item) => planItems.set(item.id, item));
  const items = project.mediaPool.map((item): MediaPortabilityVerificationItem => {
    const status = mediaPoolStatus(item);
    const planItem = planItems.get(item.id);
    const hasProjectRelativePath = isProjectMediaItem(item);
    const hasDecodedCache = item.kind === "audio" && status.cacheReloadable;
    const name = portableMediaName(item);
    if ((status.missing || status.unresolved) && hasDecodedCache) {
      return portabilityItem(item, status, {
        name,
        state: "cache-only",
        portable: false,
        action: "reload-cache",
        reason: "Decoded cache can restore playback, but the original source should be relinked before release smoke.",
        hasProjectRelativePath,
        hasDecodedCache
      });
    }
    if (status.missing || status.unresolved) {
      return portabilityItem(item, status, {
        name,
        state: "missing-or-unresolved",
        portable: false,
        action: "relink",
        reason: "Media is missing or unresolved and needs relink.",
        hasProjectRelativePath,
        hasDecodedCache
      });
    }
    if (hasProjectRelativePath && planItem?.action === "already-project-media") {
      return portabilityItem(item, status, {
        name,
        state: "portable-project",
        portable: true,
        action: "none",
        reason: "Project-relative media is saved beside the source project.",
        hasProjectRelativePath,
        hasDecodedCache
      });
    }
    if (status.runtimeOnly) {
      return portabilityItem(item, status, {
        name,
        state: "runtime-only",
        portable: false,
        action: "relink",
        reason: "Browser runtime-only media needs a durable native source before collection.",
        hasProjectRelativePath,
        hasDecodedCache
      });
    }
    if (planItem?.action === "copy-to-project-media") {
      return portabilityItem(item, status, {
        name,
        state: "copyable-external",
        portable: false,
        action: "collect",
        reason: "External media can be collected into project-media.",
        hasProjectRelativePath,
        hasDecodedCache
      });
    }
    return portabilityItem(item, status, {
      name,
      state: "blocked",
      portable: false,
      action: "relink",
      reason: planItem?.reason || "Media is not portable yet and needs relink or collection.",
      hasProjectRelativePath,
      hasDecodedCache
    });
  });
  const portableCount = items.filter((item) => item.portable).length;
  const copyableExternalCount = items.filter((item) => item.state === "copyable-external").length;
  const cacheOnlyCount = items.filter((item) => item.state === "cache-only").length;
  const runtimeOnlyCount = items.filter((item) => item.state === "runtime-only").length;
  const missingOrUnresolvedCount = items.filter((item) => item.state === "missing-or-unresolved" || item.state === "cache-only").length;
  const blockedCount = items.filter((item) => item.state === "blocked" || item.state === "runtime-only" || item.state === "missing-or-unresolved" || item.state === "cache-only").length;
  const needsCollectionOrRelinkCount = items.filter((item) => !item.portable).length;
  const warnings = items
    .filter((item) => !item.portable)
    .map((item) => `${item.name}: ${item.reason}`);
  return {
    totalMediaCount: project.mediaPool.length,
    audioMediaCount: project.mediaPool.filter((item) => item.kind === "audio").length,
    portableCount,
    alreadyProjectCount: items.filter((item) => item.state === "portable-project").length,
    copyableExternalCount,
    cacheOnlyCount,
    blockedCount,
    runtimeOnlyCount,
    missingOrUnresolvedCount,
    needsCollectionOrRelinkCount,
    embeddedSourceProjectPortable: needsCollectionOrRelinkCount === 0,
    items,
    warnings
  };
}

export function createPortableMediaProject(project: PocketDawProject): PocketDawProject {
  const next = cloneProject(project);
  next.mediaPool = next.mediaPool.map((item) => {
    const metadata = stripLocalMediaMetadata(item.metadata);
    const projectRelativeUri = portableProjectRelativeUri(item);
    return {
      ...item,
      uri: projectRelativeUri || item.uri,
      metadata
    };
  });
  return next;
}

export function verifySharedMediaPortability(project: PocketDawProject): SharedMediaPortabilityVerification {
  const affectedItemIds = new Set<string>();
  const affectedFieldKeys = new Set<string>();
  let localReferenceFieldCount = 0;
  project.mediaPool.forEach((item) => {
    const fields: Array<[string, unknown]> = [["uri", item.uri], ...Object.entries(item.metadata || {})];
    fields.forEach(([key, value]) => {
      if (!isLocalMediaReferenceField(key, value)) return;
      affectedItemIds.add(item.id);
      affectedFieldKeys.add(key);
      localReferenceFieldCount += 1;
    });
  });
  return {
    localReferenceFieldCount,
    localReferenceItemCount: affectedItemIds.size,
    affectedItemIds: Array.from(affectedItemIds),
    affectedFieldKeys: Array.from(affectedFieldKeys).sort(),
    portableForSharing: localReferenceFieldCount === 0
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

function metadataString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metadataWithoutSourceDerivedFields(metadata: JsonObject | undefined): JsonObject {
  const next = { ...(metadata || {}) };
  [
    "projectRelativePath",
    "collectedAt",
    "nativePath",
    "waveformPeaks",
    "sourceMimeType",
    "sourceSizeBytes",
    "sourceEncoding",
    "decodedMimeType",
    "decodedSizeBytes",
    "nativeDecodedSampleRate",
    "nativeDecodedChannels",
    "nativeDecodedDurationSeconds",
    "nativeDecodedFrameCount",
    "nativeDecoder",
    "nativeDecodeError",
    "nativeDecoded",
    "nativeDecodedCacheRelativePath",
    "nativeDecodedCachePath",
    "nativeDecodedCacheSizeBytes",
    "nativeDecodedCacheKind",
    "nativeDecodedCacheUpdatedAt",
    "nativeDecodedCacheError",
    "lastReloadSourceKind",
    "lastReloadSourcePath",
    "restoredFromNativeDecodedCache",
    "audioTransientMarkersSeconds",
    "audioTransientThreshold",
    "audioTransientPeakCount",
    "audioTransientMaxPeak",
    "audioTransientUpdatedAt"
  ].forEach((key) => {
    delete next[key];
  });
  return next;
}

function waveformPeaksFromMetadata(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => Math.min(1, item));
}

function transientMarkersFromMetadata(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0);
}

function sameReloadPath(a: string, b: string): boolean {
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}

function isProjectMediaItem(item: MediaPoolItem): boolean {
  const metadata = item.metadata || {};
  if (normalizeProjectRelativeMediaPath(metadataString(metadata.projectRelativePath))) return true;
  const uri = item.uri || "";
  return !!normalizeProjectRelativeMediaPath(uri);
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

function portabilityItem(
  item: MediaPoolItem,
  status: MediaPoolStatus,
  input: Omit<MediaPortabilityVerificationItem, "id" | "kind" | "reloadable" | "relinkable">
): MediaPortabilityVerificationItem {
  return {
    id: item.id,
    kind: item.kind,
    reloadable: status.reloadable,
    relinkable: status.relinkable,
    ...input
  };
}

function portableMediaName(item: MediaPoolItem): string {
  return fileNameFromUri(item.name) || fileNameFromUri(item.uri) || safeFileName(item.name || item.id);
}

function portableProjectRelativeUri(item: MediaPoolItem): string {
  const metadata = item.metadata || {};
  return normalizeProjectRelativeMediaPath(metadataString(metadata.projectRelativePath))
    || normalizeProjectRelativeMediaPath(String(item.uri || ""))
    || normalizeProjectRelativeMediaPath(metadataString(metadata.nativeDecodedCacheRelativePath));
}

function stripLocalMediaMetadata(metadata: JsonObject | undefined): JsonObject {
  const next = { ...(metadata || {}) };
  [
    "originalUri",
    "nativePath",
    "nativeDecodedCachePath",
    "lastReloadSourcePath",
    "relinkedFromUri",
    "sourceUri"
  ].forEach((key) => {
    delete next[key];
  });
  Object.entries(next).forEach(([key, value]) => {
    if (isLocalMediaReferenceField(key, value)) delete next[key];
  });
  return next;
}

function isLocalMediaReferenceField(key: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (normalizeProjectRelativeMediaPath(trimmed)) return false;
  if (key === "uri" || /(?:uri|path|file|source|original|native|reload)/i.test(key)) {
    return isExternalUri(trimmed) || /^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\\\");
  }
  return false;
}

function fileNameFromUri(uri?: string): string {
  return uri?.split(/[\\/]/).filter(Boolean).pop() || "";
}

function safeFileName(value: string): string {
  const name = value.trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-").replace(/\s+/g, " ").replace(/^\.+/, "").slice(0, 96);
  return name || "media-file";
}

function safeCacheId(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "item";
}
