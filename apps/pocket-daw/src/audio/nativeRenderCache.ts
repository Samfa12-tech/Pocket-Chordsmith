import { cloneProject } from "../daw/dawProject";
import type { Clip, PocketDawProject, RenderCacheItem, TrackRole } from "../daw/schema";
import { barsToSeconds } from "../daw/timeline";
import { buildNativeAudioStartPayload, type NativeAudioAsset, type NativeAudioRegion } from "../native/audioPlayback";
import { pruneNativeCacheAssets, readNativeCacheAsset, renderNativeAudioWav, writeNativeCacheAsset, type NativeCachePruneResult, type NativeMediaApi } from "../native/mediaBridge";
import { audioRegionFromClip, renderTimelineAudioRegions } from "./audioRegions";
import { getCachedAudioBuffer } from "./audioBufferCache";
import { renderTimelineEvents } from "./eventRenderer";
import { encodeWav, renderProjectToWavBlob } from "./offlineRender";

export const NATIVE_RENDER_CACHE_ROOT = "project-cache/native-audio";
const STEM_ROLES: TrackRole[] = ["drums", "bass", "chords", "melody", "guitar"];

export interface NativeRenderCache {
  signature: string;
  assets: NativeAudioAsset[];
  regions: NativeAudioRegion[];
  cachedClipIds: Set<string>;
  renderCacheItems: RenderCacheItem[];
  renderCacheHitCount: number;
  renderCacheMissCount: number;
  proceduralFallbackEventCount: number;
  generatedRegionCount: number;
  runtimeAudioRegionCount: number;
  missingRuntimeAudioRegionCount: number;
  cachedAssetByteCount: number;
  hydratedCacheItemCount?: number;
  hydrationFailureCount?: number;
  staleSourceHashCount?: number;
  skippedInvalidPathCount?: number;
  hydratedCacheReadByteCount?: number;
}

export interface NativeRenderCachePersistResult {
  cache: NativeRenderCache;
  writtenAssetCount: number;
  skippedAssetCount: number;
  writtenByteCount: number;
  prunedAssetCount: number;
  prunedByteCount: number;
  pruneSkippedAssetCount: number;
  errors: string[];
  renderCacheItems: RenderCacheItem[];
}

export interface NativeRenderCachePersistOptions {
  prune?: boolean;
  namespace?: string;
}

export interface NativeRenderCacheHydrationResult {
  cache: NativeRenderCache | null;
  hydratedCacheItemCount: number;
  hydrationFailureCount: number;
  staleSourceHashCount: number;
  skippedInvalidPathCount: number;
  skippedPartialGeneratedClipCount: number;
  hydratedCacheReadByteCount: number;
  errors: string[];
}

interface HydratedCacheEntry {
  item: RenderCacheItem;
  asset: NativeAudioAsset;
  region: NativeAudioRegion | null;
  cacheKind: string;
  generatedKey?: string;
}

interface AssetBuildItem {
  key: string;
  clip: Clip;
  trackId: string;
  role: TrackRole;
}

export async function buildNativeRenderCache(project: PocketDawProject, signature = nativeRenderCacheSignature(project)): Promise<NativeRenderCache> {
  const generatedClips = project.timeline.clips.filter((clip) => clip.type === "generated-section" && !clip.muted && clip.sectionId);
  const assets = new Map<string, NativeAudioAsset>();
  const regions: NativeAudioRegion[] = [];
  const cachedClipIds = new Set<string>();
  const renderCacheItems: RenderCacheItem[] = [];
  let renderCacheHitCount = 0;
  let renderCacheMissCount = 0;
  let generatedRegionCount = 0;
  let runtimeAudioRegionCount = 0;
  let missingRuntimeAudioRegionCount = 0;
  const createdAt = new Date().toISOString();

  for (const item of generatedClips.flatMap((clip) => assetBuildItems(project, clip, signature))) {
    let asset = assets.get(item.key);
    if (asset) {
      renderCacheHitCount += 1;
    } else {
      renderCacheMissCount += 1;
      asset = await renderAsset(project, item);
      assets.set(item.key, asset);
      renderCacheItems.push(renderCacheItemForAsset(asset, signature, createdAt, item));
    }
    const duration = barsToSeconds(item.clip.barLength, project.project.bpm, project.project.timeSig);
    regions.push({
      id: `${item.clip.id}_${item.trackId}_${item.role}`,
      assetId: asset.id,
      trackId: item.trackId,
      startTime: barsToSeconds(item.clip.startBar - 1, project.project.bpm, project.project.timeSig),
      sourceOffset: 0,
      duration: Math.min(duration, asset.durationSeconds),
      gain: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0
    });
    generatedRegionCount += 1;
    cachedClipIds.add(item.clip.id);
  }

  const runtimeStats = await appendRuntimeAudioCache(project, signature, assets, regions, cachedClipIds, renderCacheItems, createdAt);
  renderCacheHitCount += runtimeStats.renderCacheHitCount;
  renderCacheMissCount += runtimeStats.renderCacheMissCount;
  runtimeAudioRegionCount += runtimeStats.runtimeAudioRegionCount;
  missingRuntimeAudioRegionCount += runtimeStats.missingRuntimeAudioRegionCount;

  return {
    signature,
    assets: Array.from(assets.values()),
    regions,
    cachedClipIds,
    renderCacheItems,
    renderCacheHitCount,
    renderCacheMissCount,
    proceduralFallbackEventCount: 0,
    generatedRegionCount,
    runtimeAudioRegionCount,
    missingRuntimeAudioRegionCount,
    cachedAssetByteCount: Array.from(assets.values()).reduce((total, asset) => total + nativeAssetByteLength(asset), 0)
  };
}

export async function buildNativeRuntimeAudioCache(project: PocketDawProject, signature = nativeRuntimeAudioCacheSignature(project)): Promise<NativeRenderCache> {
  const assets = new Map<string, NativeAudioAsset>();
  const regions: NativeAudioRegion[] = [];
  const cachedClipIds = new Set<string>();
  const renderCacheItems: RenderCacheItem[] = [];
  const createdAt = new Date().toISOString();
  const stats = await appendRuntimeAudioCache(project, signature, assets, regions, cachedClipIds, renderCacheItems, createdAt);
  return {
    signature,
    assets: Array.from(assets.values()),
    regions,
    cachedClipIds,
    renderCacheItems,
    renderCacheHitCount: stats.renderCacheHitCount,
    renderCacheMissCount: stats.renderCacheMissCount,
    proceduralFallbackEventCount: 0,
    generatedRegionCount: 0,
    runtimeAudioRegionCount: stats.runtimeAudioRegionCount,
    missingRuntimeAudioRegionCount: stats.missingRuntimeAudioRegionCount,
    cachedAssetByteCount: Array.from(assets.values()).reduce((total, asset) => total + nativeAssetByteLength(asset), 0)
  };
}

export async function persistNativeRenderCacheAssets(
  projectFilePath: string,
  cache: NativeRenderCache,
  api?: NativeMediaApi,
  options: NativeRenderCachePersistOptions = {}
): Promise<NativeRenderCachePersistResult> {
  const errors: string[] = [];
  let writtenAssetCount = 0;
  let skippedAssetCount = 0;
  let writtenByteCount = 0;
  let prunedAssetCount = 0;
  let prunedByteCount = 0;
  let pruneSkippedAssetCount = 0;
  const writes = new Map<string, Awaited<ReturnType<typeof writeNativeCacheAsset>>>();
  const namespace = safeCacheNamespace(options.namespace || nativeRenderCacheProjectNamespace(projectFilePath));

  for (const asset of cache.assets) {
    const relativePath = nativeRenderCacheRelativePath(asset.id, namespace);
    try {
      const result = await writeNativeCacheAsset(projectFilePath, {
        assetId: asset.id,
        relativePath,
        bytes: asset.bytes || []
      }, api);
      if (!result) {
        skippedAssetCount += 1;
        continue;
      }
      writes.set(asset.id, result);
      asset.relativePath = result.relativePath;
      asset.sizeBytes = result.sizeBytes;
      writtenAssetCount += 1;
      writtenByteCount += result.sizeBytes;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error || "Native cache write failed."));
    }
  }

  const renderCacheItems = cache.renderCacheItems.map((item) => {
    const assetId = String(item.metadata?.assetId || item.id);
    const write = writes.get(assetId);
    if (!write) return item;
    return withCacheMetadata(item, {
      assetRelativePath: write.relativePath,
      nativePath: write.path,
      byteLength: write.sizeBytes,
      durableCacheReady: true,
      cacheNamespace: namespace,
      persistedAt: new Date().toISOString()
    });
  });
  cache.renderCacheItems = renderCacheItems;
  cache.cachedAssetByteCount = cache.assets.reduce((total, asset) => total + nativeAssetByteLength(asset), 0);

  const prune = options.prune === true && !errors.length && !skippedAssetCount
    ? await prunePersistedNativeRenderCacheAssets(projectFilePath, renderCacheItems, api)
    : null;
  if (prune) {
    prunedAssetCount = prune.deletedCount;
    prunedByteCount = prune.deletedByteCount;
    pruneSkippedAssetCount = prune.skippedCount;
    errors.push(...prune.errors);
  }

  return {
    cache,
    writtenAssetCount,
    skippedAssetCount,
    writtenByteCount,
    prunedAssetCount,
    prunedByteCount,
    pruneSkippedAssetCount,
    errors,
    renderCacheItems
  };
}

export async function prunePersistedNativeRenderCacheAssets(
  projectFilePath: string,
  renderCacheItems: RenderCacheItem[],
  api?: NativeMediaApi
): Promise<NativeCachePruneResult | null> {
  const keepRelativePaths = Array.from(new Set(renderCacheItems
    .map((item) => String(item.metadata?.assetRelativePath || ""))
    .filter((path) => path && isSafeNativeCacheRelativePath(path))));
  return keepRelativePaths.length ? pruneNativeCacheAssets(projectFilePath, keepRelativePaths, api) : null;
}

export async function hydrateNativeRenderCacheAssets(
  projectFilePath: string,
  project: PocketDawProject,
  api?: NativeMediaApi
): Promise<NativeRenderCacheHydrationResult> {
  const signature = nativeRenderCacheSignature(project);
  const runtimeSignature = nativeRuntimeAudioCacheSignature(project);
  const errors: string[] = [];
  const hydrated: HydratedCacheEntry[] = [];
  let hydrationFailureCount = 0;
  let staleSourceHashCount = 0;
  let skippedInvalidPathCount = 0;
  let hydratedCacheReadByteCount = 0;
  let skippedPartialGeneratedClipCount = 0;

  for (const item of project.renderCache || []) {
    const cacheKind = String(item.metadata?.cacheKind || "");
    if (item.invalidated || !cacheKind.startsWith("native-")) continue;
    const sourceHash = String(item.metadata?.sourceHash || "");
    const expectedHash = cacheKind === "native-runtime-audio" ? runtimeSignature : signature;
    if (sourceHash && sourceHash !== expectedHash) {
      staleSourceHashCount += 1;
      continue;
    }
    const relativePath = String(item.metadata?.assetRelativePath || "");
    if (!isSafeNativeCacheRelativePath(relativePath)) {
      skippedInvalidPathCount += 1;
      continue;
    }
    const assetId = String(item.metadata?.assetId || item.id);
    try {
      const read = await readNativeCacheAsset(projectFilePath, assetId, relativePath, api);
      if (!read) {
        hydrationFailureCount += 1;
        continue;
      }
      const bytes = Array.from(new Uint8Array(read.bytes));
      hydratedCacheReadByteCount += read.sizeBytes || bytes.length;
      const asset = nativeAssetFromHydratedItem(project, item, assetId, read.relativePath, bytes, read.sizeBytes);
      hydrated.push({
        item,
        asset,
        region: nativeRegionFromHydratedItem(project, item, asset),
        cacheKind,
        generatedKey: cacheKind === "native-generated-stem" ? generatedStemKey(item) : undefined
      });
    } catch (error) {
      hydrationFailureCount += 1;
      errors.push(error instanceof Error ? error.message : String(error || "Native cache hydration failed."));
    }
  }

  const generatedGroups = new Map<string, HydratedCacheEntry[]>();
  const runtimeEntries: HydratedCacheEntry[] = [];
  hydrated.forEach((entry) => {
    if (entry.cacheKind === "native-generated-stem" && entry.item.sourceClipId) {
      const group = generatedGroups.get(entry.item.sourceClipId) || [];
      group.push(entry);
      generatedGroups.set(entry.item.sourceClipId, group);
    } else if (entry.cacheKind === "native-runtime-audio") {
      runtimeEntries.push(entry);
    }
  });

  const acceptedEntries: HydratedCacheEntry[] = [...runtimeEntries];
  generatedGroups.forEach((entries, clipId) => {
    const clip = project.timeline.clips.find((item) => item.id === clipId);
    const expected = clip ? expectedGeneratedStemKeys(project, clip) : new Set<string>();
    const available = new Set(entries.map((entry) => entry.generatedKey || "").filter(Boolean));
    const complete = expected.size > 0 && Array.from(expected).every((key) => available.has(key));
    if (!complete) {
      skippedPartialGeneratedClipCount += 1;
      return;
    }
    acceptedEntries.push(...entries);
  });

  const regions = acceptedEntries.map((entry) => entry.region).filter((region): region is NativeAudioRegion => !!region);
  const assets = acceptedEntries.map((entry) => entry.asset);
  const cachedClipIds = new Set<string>();
  acceptedEntries.forEach((entry) => {
    if (entry.item.sourceClipId) cachedClipIds.add(entry.item.sourceClipId);
  });

  const cache: NativeRenderCache | null = assets.length || regions.length
    ? {
        signature,
        assets,
        regions,
        cachedClipIds,
        renderCacheItems: acceptedEntries.map((entry) => entry.item),
        renderCacheHitCount: acceptedEntries.length,
        renderCacheMissCount: 0,
        proceduralFallbackEventCount: 0,
        generatedRegionCount: acceptedEntries.filter((entry) => entry.cacheKind === "native-generated-stem").length,
        runtimeAudioRegionCount: acceptedEntries.filter((entry) => entry.cacheKind === "native-runtime-audio").length,
        missingRuntimeAudioRegionCount: 0,
        cachedAssetByteCount: assets.reduce((total, asset) => total + nativeAssetByteLength(asset), 0),
        hydratedCacheItemCount: acceptedEntries.length,
        hydrationFailureCount,
        staleSourceHashCount,
        skippedInvalidPathCount,
        hydratedCacheReadByteCount
      }
    : null;

  return {
    cache,
    hydratedCacheItemCount: acceptedEntries.length,
    hydrationFailureCount,
    staleSourceHashCount,
    skippedInvalidPathCount,
    skippedPartialGeneratedClipCount,
    hydratedCacheReadByteCount,
    errors
  };
}

export function mergeNativeRenderCacheItems(project: PocketDawProject, items: RenderCacheItem[]): PocketDawProject {
  if (!items.length) return project;
  const sourceHash = String(items[0].metadata?.sourceHash || "");
  const incomingIds = new Set(items.map((item) => item.id));
  const nextCache = project.renderCache
    .filter((item) => !incomingIds.has(item.id))
    .filter((item) => !isNativeCacheItem(item) || String(item.metadata?.sourceHash || "") === sourceHash);
  return {
    ...project,
    renderCache: [...nextCache, ...items]
  };
}

export function nativeRenderCacheRelativePath(assetId: string, namespace?: string): string {
  const stem = safeCacheFileStem(assetId);
  const safeNamespace = namespace ? safeCacheNamespace(namespace) : "";
  return safeNamespace
    ? `${NATIVE_RENDER_CACHE_ROOT}/${safeNamespace}/${stem}.wav`
    : `${NATIVE_RENDER_CACHE_ROOT}/${stem}.wav`;
}

export function nativeRenderCacheProjectNamespace(projectFilePath: string): string {
  const normalized = String(projectFilePath || "unsaved")
    .replace(/\\/g, "/")
    .trim()
    .toLowerCase();
  const fileStem = (normalized.split("/").filter(Boolean).pop() || "project").replace(/\.pocketdaw$/i, "");
  return safeCacheNamespace(`${safeCacheFileStem(fileStem).slice(0, 40)}-${hashString64(normalized)}`);
}

export function nativeRenderCacheSignature(project: PocketDawProject): string {
  return hashString(JSON.stringify({
    project: {
      bpm: project.project.bpm,
      key: project.project.key,
      scale: project.project.scale,
      timeSig: project.project.timeSig,
      swing: project.project.swing,
      resolution: project.project.resolution,
      sampleRate: project.project.sampleRate,
      ppq: project.project.ppq
    },
    sourceRefs: project.sourceRefs.map((ref) => ({ id: ref.id, checksum: ref.checksum, normalized: ref.normalized })),
    clips: project.timeline.clips
      .filter((clip) => clip.type === "generated-section")
      .map((clip) => ({
        id: clip.id,
        sourceRefId: clip.sourceRefId,
        sectionId: clip.sectionId,
        startBar: clip.startBar,
        barLength: clip.barLength,
        muted: clip.muted,
        transforms: clip.transforms
      })),
    audioClips: project.timeline.clips
      .filter((clip) => clip.type === "audio")
      .map((clip) => ({
        id: clip.id,
        trackId: clip.trackId,
        mediaPoolItemId: clip.mediaPoolItemId,
        startBar: clip.startBar,
        barLength: clip.barLength,
        muted: clip.muted,
        transforms: clip.transforms,
        metadata: clip.metadata
      })),
    mediaPool: project.mediaPool.map((item) => ({
      id: item.id,
      kind: item.kind,
      uri: item.uri,
      durationSeconds: item.durationSeconds,
      sampleRate: item.sampleRate,
      channels: item.channels,
      sizeBytes: item.sizeBytes,
      checksum: item.checksum,
      mediaRefKind: item.metadata?.mediaRefKind,
      projectRelativePath: item.metadata?.projectRelativePath,
      nativePath: item.metadata?.nativePath,
      missing: item.metadata?.missing,
      unresolved: item.metadata?.unresolved
    })),
    tracks: project.tracks
      .filter((track) => STEM_ROLES.includes(track.role))
      .map((track) => ({
        id: track.id,
        role: track.role,
        active: track.active
      })),
    drumLaneFx: nativeCacheStemFxState(project)
  }));
}

export function nativeRuntimeAudioCacheSignature(project: PocketDawProject): string {
  const audioClips = project.timeline.clips
    .filter((clip) => clip.type === "audio")
    .map((clip) => ({
      id: clip.id,
      trackId: clip.trackId,
      mediaPoolItemId: clip.mediaPoolItemId,
      startBar: clip.startBar,
      barLength: clip.barLength,
      muted: clip.muted,
      transforms: clip.transforms,
      metadata: clip.metadata
    }));
  const mediaIds = new Set(audioClips.map((clip) => clip.mediaPoolItemId).filter(Boolean));
  return hashString(JSON.stringify({
    project: {
      bpm: project.project.bpm,
      timeSig: project.project.timeSig,
      sampleRate: project.project.sampleRate
    },
    audioClips,
    mediaPool: project.mediaPool
      .filter((item) => mediaIds.has(item.id))
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        uri: item.uri,
        durationSeconds: item.durationSeconds,
        sampleRate: item.sampleRate,
        channels: item.channels,
        sizeBytes: item.sizeBytes,
        checksum: item.checksum,
        mediaRefKind: item.metadata?.mediaRefKind,
        projectRelativePath: item.metadata?.projectRelativePath,
        nativePath: item.metadata?.nativePath,
        missing: item.metadata?.missing,
        unresolved: item.metadata?.unresolved
      }))
  }));
}

function assetBuildItems(project: PocketDawProject, clip: Clip, signature: string): AssetBuildItem[] {
  const stemMutes = clip.transforms.stemMutes || {};
  return STEM_ROLES.flatMap((role) => {
    if (stemMutes[role]) return [];
    const tracks = project.tracks.filter((track) => track.role === role && track.active !== false);
    return tracks.map((track) => ({
      key: `${signature}_${clip.sourceRefId || "primary"}_${clip.sectionId || "section"}_${clip.barLength}_${role}_${track.id}_${hashString(JSON.stringify(clip.transforms))}`,
      clip,
      trackId: track.id,
      role
    }));
  });
}

async function renderAsset(project: PocketDawProject, item: AssetBuildItem): Promise<NativeAudioAsset> {
  const assetProject = projectForNativeGeneratedStemRender(project, item.clip, item.trackId);
  const durationSeconds = barsToSeconds(item.clip.barLength, project.project.bpm, project.project.timeSig);
  const nativeRender = await renderNativeGeneratedStemWav(assetProject, durationSeconds);
  let bytes = nativeRender?.bytes;
  let sampleRate = nativeRender?.sampleRate || project.project.sampleRate;
  let channels = nativeRender?.channels || 2;
  if (!bytes) {
    const blob = await renderProjectToWavBlob(assetProject, { includeChordsmithOfflineLofiTexture: item.role === "drums" });
    bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    sampleRate = project.project.sampleRate;
    channels = 2;
  }
  const id = `native-cache-${hashString(item.key)}`;
  return {
    id,
    name: `${item.clip.sectionId || "section"} ${item.role} ${item.trackId}`,
    relativePath: nativeRenderCacheRelativePath(id),
    mimeType: "audio/wav",
    sampleRate,
    channels,
    durationSeconds,
    sizeBytes: bytes.length,
    sourceHash: item.key.split("_")[0] || undefined,
    bytes
  };
}

async function renderNativeGeneratedStemWav(assetProject: PocketDawProject, durationSeconds: number) {
  try {
    const events = renderTimelineEvents(assetProject);
    const payload = buildNativeAudioStartPayload(assetProject, events, 0);
    return await renderNativeAudioWav({ ...payload, loop: null, metronome: null }, durationSeconds);
  } catch {
    return null;
  }
}

export function projectForNativeGeneratedStemRender(project: PocketDawProject, clip: Clip, trackId: string): PocketDawProject {
  const assetProject = cloneProject(project);
  const metronome = assetProject.project.metronome;
  assetProject.project = {
    ...assetProject.project,
    metronome: {
      enabled: false,
      countInBars: metronome?.countInBars ?? 0,
      volume: metronome?.volume ?? 0
    }
  };
  assetProject.timeline = {
    ...assetProject.timeline,
    bars: Math.max(1, Math.ceil(clip.barLength)),
    loop: { enabled: false, startBar: 1, endBar: Math.max(2, Math.ceil(clip.barLength) + 1) },
    markers: [],
    clips: [{
      ...clip,
      id: `${clip.id}_cache_source`,
      trackId,
      startBar: 1
    }]
  };
  assetProject.tracks = assetProject.tracks.map((track) => {
    if (track.role === "master") return { ...track, volume: 1, pan: 0, mute: false, solo: false };
    const active = track.id === trackId;
    return { ...track, volume: active ? 1 : track.volume, pan: active ? 0 : track.pan, mute: !active, solo: false };
  });
  assetProject.fx = nativeCacheStemFxState(assetProject);
  assetProject.mixer = { ...assetProject.mixer, masterLimiter: false };
  return assetProject;
}

function nativeCacheStemFxState(project: PocketDawProject): PocketDawProject["fx"] {
  return {
    chains: (project.fx?.chains || []).filter((chain) => typeof chain.metadata?.drumLaneId === "string")
  };
}

function renderCacheItemForAsset(asset: NativeAudioAsset, signature: string, createdAt: string, item: AssetBuildItem): RenderCacheItem {
  return {
    id: asset.id,
    sourceClipId: item.clip.id,
    createdAt,
    invalidated: false,
    metadata: {
      cacheKind: "native-generated-stem",
      cacheScope: "project-native-audio",
      sourceHash: signature,
      assetId: asset.id,
      assetRelativePath: asset.relativePath || nativeRenderCacheRelativePath(asset.id),
      mimeType: asset.mimeType || "audio/wav",
      role: item.role,
      trackId: item.trackId,
      sampleRate: asset.sampleRate,
      channels: asset.channels,
      durationSeconds: asset.durationSeconds,
      byteLength: nativeAssetByteLength(asset),
      durableCacheReady: false
    }
  };
}

function renderCacheItemForRuntimeAudio(asset: NativeAudioAsset, signature: string, createdAt: string, clipId: string, mediaPoolItemId: string): RenderCacheItem {
  return {
    id: asset.id,
    sourceClipId: clipId,
    mediaPoolItemId,
    createdAt,
    invalidated: false,
    metadata: {
      cacheKind: "native-runtime-audio",
      cacheScope: "project-native-audio",
      sourceHash: signature,
      assetId: asset.id,
      assetRelativePath: asset.relativePath || nativeRenderCacheRelativePath(asset.id),
      mimeType: asset.mimeType || "audio/wav",
      sampleRate: asset.sampleRate,
      channels: asset.channels,
      durationSeconds: asset.durationSeconds,
      byteLength: nativeAssetByteLength(asset),
      durableCacheReady: false
    }
  };
}

function nativeAssetFromHydratedItem(
  project: PocketDawProject,
  item: RenderCacheItem,
  assetId: string,
  relativePath: string,
  bytes: number[],
  sizeBytes: number
): NativeAudioAsset {
  return {
    id: assetId,
    name: String(item.metadata?.name || item.id),
    relativePath,
    mimeType: String(item.metadata?.mimeType || "audio/wav"),
    sampleRate: cleanPositiveNumber(item.metadata?.sampleRate, project.project.sampleRate),
    channels: Math.max(1, Math.min(2, Math.round(cleanPositiveNumber(item.metadata?.channels, 2)))),
    durationSeconds: cleanPositiveNumber(item.metadata?.durationSeconds, hydratedDurationFallback(project, item)),
    sizeBytes: sizeBytes || bytes.length,
    sourceHash: String(item.metadata?.sourceHash || ""),
    bytes
  };
}

function nativeRegionFromHydratedItem(project: PocketDawProject, item: RenderCacheItem, asset: NativeAudioAsset): NativeAudioRegion | null {
  const clip = item.sourceClipId ? project.timeline.clips.find((entry) => entry.id === item.sourceClipId) : null;
  if (!clip) return null;
  const cacheKind = String(item.metadata?.cacheKind || "");
  if (cacheKind === "native-runtime-audio") {
    const media = item.mediaPoolItemId ? project.mediaPool.find((entry) => entry.id === item.mediaPoolItemId) : null;
    if (!media) return null;
    const region = audioRegionFromClip(project, clip, media);
    return {
      id: `${clip.id}_${region.trackId}_${asset.id}_hydrated`,
      assetId: asset.id,
      trackId: region.trackId,
      startTime: region.startTimeSeconds,
      sourceOffset: region.sourceOffsetSeconds,
      duration: Math.min(region.durationSeconds, asset.durationSeconds),
      gain: region.gain,
      pan: 0,
      fadeIn: region.fadeInSeconds,
      fadeOut: region.fadeOutSeconds
    };
  }

  if (cacheKind === "native-generated-stem") {
    const trackId = String(item.metadata?.trackId || clip.trackId);
    return {
      id: `${clip.id}_${trackId}_${asset.id}_hydrated`,
      assetId: asset.id,
      trackId,
      startTime: barsToSeconds(clip.startBar - 1, project.project.bpm, project.project.timeSig),
      sourceOffset: 0,
      duration: Math.min(barsToSeconds(clip.barLength, project.project.bpm, project.project.timeSig), asset.durationSeconds),
      gain: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0
    };
  }

  return null;
}

function hydratedDurationFallback(project: PocketDawProject, item: RenderCacheItem): number {
  const clip = item.sourceClipId ? project.timeline.clips.find((entry) => entry.id === item.sourceClipId) : null;
  if (!clip) return 0;
  return barsToSeconds(clip.barLength, project.project.bpm, project.project.timeSig);
}

function expectedGeneratedStemKeys(project: PocketDawProject, clip: Clip): Set<string> {
  const stemMutes = clip.transforms?.stemMutes || {};
  return new Set(STEM_ROLES.flatMap((role) => {
    if (stemMutes[role]) return [];
    return project.tracks
      .filter((track) => track.role === role && track.active !== false)
      .map((track) => `${role}:${track.id}`);
  }));
}

function generatedStemKey(item: RenderCacheItem): string {
  return `${String(item.metadata?.role || "")}:${String(item.metadata?.trackId || "")}`;
}

function isSafeNativeCacheRelativePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized.startsWith(`${NATIVE_RENDER_CACHE_ROOT}/`)) return false;
  if (!normalized.toLowerCase().endsWith(".wav")) return false;
  return normalized.split("/").every((part) => part && part !== "." && part !== "..");
}

function cleanPositiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function nativeAssetByteLength(asset: NativeAudioAsset): number {
  return asset.sizeBytes || asset.bytes?.length || 0;
}

async function appendRuntimeAudioCache(
  project: PocketDawProject,
  signature: string,
  assets: Map<string, NativeAudioAsset>,
  regions: NativeAudioRegion[],
  cachedClipIds: Set<string>,
  renderCacheItems: RenderCacheItem[],
  createdAt: string
): Promise<Pick<NativeRenderCache, "renderCacheHitCount" | "renderCacheMissCount" | "runtimeAudioRegionCount" | "missingRuntimeAudioRegionCount">> {
  let renderCacheHitCount = 0;
  let renderCacheMissCount = 0;
  let runtimeAudioRegionCount = 0;
  let missingRuntimeAudioRegionCount = 0;
  for (const region of renderTimelineAudioRegions(project, { includeMutedTracks: true }).audioRegions) {
    const cached = getCachedAudioBuffer(region.mediaPoolItemId);
    if (!cached || cached.channels < 1 || cached.channels > 2 || cached.buffer.duration <= region.sourceOffsetSeconds) {
      missingRuntimeAudioRegionCount += 1;
      continue;
    }
    const key = runtimeAudioAssetKey(project, region.mediaPoolItemId, cached);
    let asset = assets.get(key);
    if (asset) {
      renderCacheHitCount += 1;
    } else {
      renderCacheMissCount += 1;
      const id = `native-audio-${hashString(key)}`;
      const bytes = Array.from(new Uint8Array(await encodeWav(cached.buffer).arrayBuffer()));
      asset = {
        id,
        name: `${region.mediaPoolItemId} runtime audio`,
        relativePath: nativeRenderCacheRelativePath(id),
        mimeType: "audio/wav",
        sampleRate: cached.sampleRate,
        channels: cached.channels,
        durationSeconds: cached.durationSeconds,
        sizeBytes: bytes.length,
        sourceHash: signature,
        bytes
      };
      assets.set(key, asset);
      renderCacheItems.push(renderCacheItemForRuntimeAudio(asset, signature, createdAt, region.clipId, region.mediaPoolItemId));
    }
    const duration = Math.min(region.durationSeconds, Math.max(0, cached.durationSeconds - region.sourceOffsetSeconds));
    if (duration <= 0) {
      missingRuntimeAudioRegionCount += 1;
      continue;
    }
    regions.push({
      id: `${region.clipId}_${region.trackId}_${region.mediaPoolItemId}`,
      assetId: asset.id,
      trackId: region.trackId,
      startTime: region.startTimeSeconds,
      sourceOffset: region.sourceOffsetSeconds,
      duration,
      gain: region.gain,
      pan: 0,
      fadeIn: region.fadeInSeconds,
      fadeOut: region.fadeOutSeconds
    });
    runtimeAudioRegionCount += 1;
    cachedClipIds.add(region.clipId);
  }
  return { renderCacheHitCount, renderCacheMissCount, runtimeAudioRegionCount, missingRuntimeAudioRegionCount };
}

function runtimeAudioAssetKey(project: PocketDawProject, mediaPoolItemId: string, cached: { sampleRate: number; channels: number; durationSeconds: number }): string {
  const item = project.mediaPool.find((entry) => entry.id === mediaPoolItemId);
  return `audio_${hashString(JSON.stringify({
    mediaPoolItemId,
    uri: item?.uri,
    sizeBytes: item?.sizeBytes,
    checksum: item?.checksum,
    mediaRefKind: item?.metadata?.mediaRefKind,
    projectRelativePath: item?.metadata?.projectRelativePath,
    nativePath: item?.metadata?.nativePath,
    sampleRate: cached.sampleRate,
    channels: cached.channels,
    durationSeconds: cached.durationSeconds.toFixed(6)
  }))}`;
}

function withCacheMetadata(item: RenderCacheItem, patch: Record<string, string | number | boolean>): RenderCacheItem {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      ...patch
    }
  };
}

function isNativeCacheItem(item: RenderCacheItem): boolean {
  return String(item.metadata?.cacheKind || "").startsWith("native-");
}

function safeCacheFileStem(value: string): string {
  const safe = value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return safe || `asset-${hashString(value)}`;
}

function safeCacheNamespace(value: string): string {
  const safe = safeCacheFileStem(value).slice(0, 80);
  return safe || `project-${hashString(value)}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashString64(value: string): string {
  return `${hashString(`a:${value}`)}${hashString(`b:${value}`)}`;
}
