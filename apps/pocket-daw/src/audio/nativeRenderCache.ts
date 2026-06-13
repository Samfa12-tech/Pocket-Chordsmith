import { cloneProject } from "../daw/dawProject";
import type { Clip, PocketDawProject, RenderCacheItem, TrackRole } from "../daw/schema";
import { barsToSeconds } from "../daw/timeline";
import type { NativeAudioAsset, NativeAudioRegion } from "../native/audioPlayback";
import { writeNativeCacheAsset, type NativeMediaApi } from "../native/mediaBridge";
import { renderTimelineAudioRegions } from "./audioRegions";
import { getCachedAudioBuffer } from "./audioBufferCache";
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
}

export interface NativeRenderCachePersistResult {
  cache: NativeRenderCache;
  writtenAssetCount: number;
  skippedAssetCount: number;
  writtenByteCount: number;
  errors: string[];
  renderCacheItems: RenderCacheItem[];
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
      pan: 0
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
  api?: NativeMediaApi
): Promise<NativeRenderCachePersistResult> {
  const errors: string[] = [];
  let writtenAssetCount = 0;
  let skippedAssetCount = 0;
  let writtenByteCount = 0;
  const writes = new Map<string, Awaited<ReturnType<typeof writeNativeCacheAsset>>>();

  for (const asset of cache.assets) {
    const relativePath = asset.relativePath || nativeRenderCacheRelativePath(asset.id);
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
      persistedAt: new Date().toISOString()
    });
  });
  cache.renderCacheItems = renderCacheItems;
  cache.cachedAssetByteCount = cache.assets.reduce((total, asset) => total + nativeAssetByteLength(asset), 0);

  return {
    cache,
    writtenAssetCount,
    skippedAssetCount,
    writtenByteCount,
    errors,
    renderCacheItems
  };
}

export function mergeNativeRenderCacheItems(project: PocketDawProject, items: RenderCacheItem[]): PocketDawProject {
  if (!items.length) return project;
  const sourceHash = String(items[0].metadata?.sourceHash || "");
  const incomingIds = new Set(items.map((item) => item.id));
  const nextCache = project.renderCache
    .filter((item) => !incomingIds.has(item.id))
    .map((item) => {
      if (!isNativeCacheItem(item) || String(item.metadata?.sourceHash || "") === sourceHash) return item;
      return {
        ...item,
        invalidated: true,
        metadata: {
          ...item.metadata,
          invalidatedBySourceHash: sourceHash
        }
      };
    });
  return {
    ...project,
    renderCache: [...nextCache, ...items]
  };
}

export function nativeRenderCacheRelativePath(assetId: string): string {
  return `${NATIVE_RENDER_CACHE_ROOT}/${safeCacheFileStem(assetId)}.wav`;
}

export function nativeRenderCacheSignature(project: PocketDawProject): string {
  return hashString(JSON.stringify({
    project: project.project,
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
    tracks: project.tracks.map((track) => ({
      id: track.id,
      role: track.role,
      active: track.active,
      fxChainId: track.fxChainId
    })),
    fx: project.fx
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
  const assetProject = cloneProject(project);
  assetProject.timeline = {
    ...assetProject.timeline,
    bars: Math.max(1, Math.ceil(item.clip.barLength)),
    loop: { enabled: false, startBar: 1, endBar: Math.max(2, Math.ceil(item.clip.barLength) + 1) },
    markers: [],
    clips: [{
      ...item.clip,
      id: `${item.clip.id}_cache_source`,
      trackId: item.trackId,
      startBar: 1
    }]
  };
  assetProject.tracks = assetProject.tracks.map((track) => {
    if (track.role === "master") return { ...track, volume: 1, pan: 0, mute: false, solo: false };
    const active = track.id === item.trackId;
    return { ...track, volume: active ? 1 : track.volume, pan: active ? 0 : track.pan, mute: !active, solo: false };
  });
  const blob = await renderProjectToWavBlob(assetProject);
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  const durationSeconds = barsToSeconds(item.clip.barLength, project.project.bpm, project.project.timeSig);
  const id = `native-cache-${hashString(item.key)}`;
  return {
    id,
    name: `${item.clip.sectionId || "section"} ${item.role} ${item.trackId}`,
    relativePath: nativeRenderCacheRelativePath(id),
    mimeType: "audio/wav",
    sampleRate: project.project.sampleRate,
    channels: 2,
    durationSeconds,
    sizeBytes: bytes.length,
    sourceHash: item.key.split("_")[0] || undefined,
    bytes
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
      pan: 0
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

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
