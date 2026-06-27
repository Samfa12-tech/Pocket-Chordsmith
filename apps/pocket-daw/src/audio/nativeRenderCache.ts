import { cloneProject } from "../daw/dawProject";
import type { Clip, PocketDawProject, RenderCacheItem, TrackRole } from "../daw/schema";
import { barsToSeconds } from "../daw/timeline";
import { DRUM_LANE_DEFS, getDrumLaneMix } from "../daw/drumLanes";
import { midiDataFromClip } from "../daw/midiClips";
import { buildNativeAudioStartPayload, type NativeAudioAsset, type NativeAudioRegion } from "../native/audioPlayback";
import { pruneNativeCacheAssets, readNativeCacheAsset, renderNativeAudioWav, writeNativeCacheAsset, type NativeCachePruneResult, type NativeMediaApi } from "../native/mediaBridge";
import { POCKET_BASS_TONE_CONFIGS, POCKET_DRUM_KIT_CONFIGS } from "../../../../packages/pocket-audio-core/src/sounds/lofi-registry.js";
import { POCKET_CHORD_INSTRUMENT_CONFIGS, POCKET_LEAD_INSTRUMENT_CONFIGS } from "../../../../packages/pocket-audio-core/src/sounds/instruments.js";
import { POCKET_GUITAR_TONE_CONFIGS } from "../../../../packages/pocket-audio-core/src/sounds/guitar.js";
import { POCKET_PRO_EQ_BANDS } from "../../../../packages/pocket-audio-core/src/fx/pro-eq.js";
import { audioRegionFromClip, renderTimelineAudioRegions } from "./audioRegions";
import { getCachedAudioBuffer, type CachedAudioBuffer } from "./audioBufferCache";
import { renderTimelineEvents } from "./eventRenderer";
import { encodeWav } from "./offlineRender";

export const NATIVE_RENDER_CACHE_ROOT = "project-cache/native-audio";
export const NATIVE_GENERATED_STEM_TAIL_SECONDS = 0.25;
export const NATIVE_AUDIO_RENDERER_CONTRACT_VERSION = "native-audio-renderer-v13-e2819320";
export const NATIVE_CACHE_STEM_RENDER_MODE = "cache-stem";
const STEM_ROLES: TrackRole[] = ["drums", "bass", "chords", "melody", "guitar"];

export interface NativeRenderCache {
  signature: string;
  coverage?: "full" | "partial";
  requestedClipIds?: string[];
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
  generatedStemRenderFailureCount?: number;
  lastGeneratedStemRenderError?: string | null;
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

export interface NativeRenderCacheBuildOptions {
  clipIds?: Set<string>;
  coverage?: "full" | "partial";
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
  clipId?: string;
  generatedKey?: string;
}

interface AssetBuildItem {
  key: string;
  assetId: string;
  sourceHash: string;
  clip: Clip;
  trackId: string;
  role: TrackRole;
}

interface RuntimeAudioAssetSource {
  bytes: number[];
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  sizeBytes: number;
  sourceEncoding: "original-wav" | "decoded-buffer-wav";
  sourceByteHash?: string;
  sourceByteLength?: number;
}

export async function buildNativeRenderCache(
  project: PocketDawProject,
  signature = nativeRenderCacheSignature(project),
  reuseCache: NativeRenderCache | null = null,
  options: NativeRenderCacheBuildOptions = {}
): Promise<NativeRenderCache> {
  const requestedClipIds = options.clipIds ? new Set(options.clipIds) : null;
  const cacheableClips = project.timeline.clips
    .filter(isNativeStemCacheableClip)
    .filter((clip) => !requestedClipIds || requestedClipIds.has(clip.id));
  const assets = new Map<string, NativeAudioAsset>();
  const reusableAssets = nativeGeneratedStemReusableAssets(reuseCache);
  const regions: NativeAudioRegion[] = [];
  const cachedClipIds = new Set<string>();
  const renderCacheItems: RenderCacheItem[] = [];
  let renderCacheHitCount = 0;
  let renderCacheMissCount = 0;
  let generatedRegionCount = 0;
  let runtimeAudioRegionCount = 0;
  let missingRuntimeAudioRegionCount = 0;
  let generatedStemRenderFailureCount = 0;
  let lastGeneratedStemRenderError: string | null = null;
  const createdAt = new Date().toISOString();

  for (const item of cacheableClips.flatMap((clip) => assetBuildItems(project, clip))) {
    let asset: NativeAudioAsset | null | undefined = assets.get(item.key);
    if (asset) {
      renderCacheHitCount += 1;
    } else {
      asset = reusableAssets.get(item.assetId);
      if (asset) {
        asset = { ...asset, sourceHash: item.sourceHash };
        renderCacheHitCount += 1;
      } else {
        renderCacheMissCount += 1;
        const rendered = await renderAsset(project, item);
        asset = rendered.asset;
        if (!asset) {
          generatedStemRenderFailureCount += 1;
          lastGeneratedStemRenderError = rendered.error;
          continue;
        }
      }
      assets.set(item.key, asset);
      renderCacheItems.push(renderCacheItemForAsset(asset, createdAt, item));
    }
    const duration = barsToSeconds(item.clip.barLength, project.project.bpm, project.project.timeSig);
    const regionDuration = generatedStemRenderDuration(duration);
    regions.push({
      id: `${item.clip.id}_${item.trackId}_${item.role}`,
      assetId: asset.id,
      trackId: item.trackId,
      startTime: barsToSeconds(item.clip.startBar - 1, project.project.bpm, project.project.timeSig),
      sourceOffset: 0,
      duration: Math.min(regionDuration, asset.durationSeconds),
      gain: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0
    });
    generatedRegionCount += 1;
    cachedClipIds.add(item.clip.id);
  }

  generatedRegionCount -= pruneOverlappingGeneratedStemRegionsForNativeParity(regions, cachedClipIds, renderCacheItems, assets);

  const runtimeStats = await appendRuntimeAudioCache(project, signature, assets, regions, cachedClipIds, renderCacheItems, createdAt);
  renderCacheHitCount += runtimeStats.renderCacheHitCount;
  renderCacheMissCount += runtimeStats.renderCacheMissCount;
  runtimeAudioRegionCount += runtimeStats.runtimeAudioRegionCount;
  missingRuntimeAudioRegionCount += runtimeStats.missingRuntimeAudioRegionCount;

  return {
    signature,
    coverage: options.coverage || (requestedClipIds ? "partial" : "full"),
    requestedClipIds: requestedClipIds ? Array.from(requestedClipIds) : undefined,
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
    cachedAssetByteCount: Array.from(assets.values()).reduce((total, asset) => total + nativeAssetByteLength(asset), 0),
    generatedStemRenderFailureCount,
    lastGeneratedStemRenderError
  };
}

function pruneOverlappingGeneratedStemRegionsForNativeParity(
  regions: NativeAudioRegion[],
  cachedClipIds: Set<string>,
  renderCacheItems: RenderCacheItem[],
  assets: Map<string, NativeAudioAsset>
): number {
  const itemByAssetId = new Map<string, RenderCacheItem>();
  for (const item of renderCacheItems) {
    if (String(item.metadata?.cacheKind || "") !== "native-generated-stem") continue;
    const assetId = String(item.metadata?.assetId || item.id || "");
    if (assetId) itemByAssetId.set(assetId, item);
  }
  const generatedRegions = regions
    .map((region, index) => ({ region, index, item: itemByAssetId.get(region.assetId) || null }))
    .filter((entry): entry is { region: NativeAudioRegion; index: number; item: RenderCacheItem } => !!entry.item)
    .sort((left, right) => {
      if (left.region.trackId !== right.region.trackId) return left.region.trackId.localeCompare(right.region.trackId);
      return left.region.startTime - right.region.startTime;
    });

  const rejectedAssetIds = new Set<string>();
  for (let index = 0; index < generatedRegions.length; index += 1) {
    const current = generatedRegions[index];
    const currentEnd = generatedStemRegionBodyEnd(current.region);
    for (let nextIndex = index + 1; nextIndex < generatedRegions.length; nextIndex += 1) {
      const next = generatedRegions[nextIndex];
      if (next.region.trackId !== current.region.trackId) break;
      if (next.region.startTime >= currentEnd) break;
      const nextEnd = generatedStemRegionBodyEnd(next.region);
      if (nextEnd <= current.region.startTime) continue;
      rejectedAssetIds.add(current.region.assetId);
      rejectedAssetIds.add(next.region.assetId);
    }
  }
  if (!rejectedAssetIds.size) return 0;

  let removedRegionCount = 0;
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    if (!rejectedAssetIds.has(regions[index].assetId)) continue;
    regions.splice(index, 1);
    removedRegionCount += 1;
  }
  for (let index = renderCacheItems.length - 1; index >= 0; index -= 1) {
    const item = renderCacheItems[index];
    const assetId = String(item.metadata?.assetId || item.id || "");
    if (rejectedAssetIds.has(assetId)) renderCacheItems.splice(index, 1);
  }
  for (const [key, asset] of assets) {
    if (rejectedAssetIds.has(asset.id)) assets.delete(key);
  }

  cachedClipIds.clear();
  for (const item of renderCacheItems) {
    if (item.sourceClipId) cachedClipIds.add(item.sourceClipId);
  }
  return removedRegionCount;
}

function generatedStemRegionBodyEnd(region: NativeAudioRegion): number {
  return region.startTime + Math.max(0, region.duration - NATIVE_GENERATED_STEM_TAIL_SECONDS);
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
    const expectedHashes = expectedNativeCacheSourceHashes(project, item, cacheKind, signature, runtimeSignature);
    if (sourceHash && !expectedHashes.has(sourceHash)) {
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
      if (cacheKind === "native-generated-stem") {
        hydrated.push(...hydratedGeneratedStemEntries(project, item, asset, assetId, cacheKind));
      } else {
        hydrated.push({
          item,
          asset,
          region: nativeRegionFromHydratedItem(project, item, asset),
          cacheKind,
          clipId: item.sourceClipId
        });
      }
    } catch (error) {
      hydrationFailureCount += 1;
      errors.push(error instanceof Error ? error.message : String(error || "Native cache hydration failed."));
    }
  }

  const generatedGroups = new Map<string, HydratedCacheEntry[]>();
  const runtimeEntries: HydratedCacheEntry[] = [];
  hydrated.forEach((entry) => {
    if (entry.cacheKind === "native-generated-stem" && entry.clipId) {
      const group = generatedGroups.get(entry.clipId) || [];
      group.push(entry);
      generatedGroups.set(entry.clipId, group);
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

  const acceptedAssets = new Map<string, NativeAudioAsset>();
  const acceptedRenderCacheItems = new Map<string, RenderCacheItem>();
  acceptedEntries.forEach((entry) => {
    acceptedAssets.set(entry.asset.id, entry.asset);
    acceptedRenderCacheItems.set(entry.item.id, entry.item);
  });
  const regions = acceptedEntries.map((entry) => entry.region).filter((region): region is NativeAudioRegion => !!region);
  const assets = Array.from(acceptedAssets.values());
  const renderCacheItems = Array.from(acceptedRenderCacheItems.values());
  const cachedClipIds = new Set<string>();
  acceptedEntries.forEach((entry) => {
    if (entry.clipId) cachedClipIds.add(entry.clipId);
    else if (entry.item.sourceClipId) cachedClipIds.add(entry.item.sourceClipId);
  });

  const cache: NativeRenderCache | null = assets.length || regions.length
    ? {
        signature,
        assets,
        regions,
        cachedClipIds,
        renderCacheItems,
        renderCacheHitCount: renderCacheItems.length,
        renderCacheMissCount: 0,
        proceduralFallbackEventCount: 0,
        generatedRegionCount: acceptedEntries.filter((entry) => entry.cacheKind === "native-generated-stem").length,
        runtimeAudioRegionCount: acceptedEntries.filter((entry) => entry.cacheKind === "native-runtime-audio").length,
        missingRuntimeAudioRegionCount: 0,
        cachedAssetByteCount: assets.reduce((total, asset) => total + nativeAssetByteLength(asset), 0),
        hydratedCacheItemCount: renderCacheItems.length,
        hydrationFailureCount,
        staleSourceHashCount,
        skippedInvalidPathCount,
        hydratedCacheReadByteCount
      }
    : null;

  return {
    cache,
    hydratedCacheItemCount: renderCacheItems.length,
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
  const incomingIds = new Set(items.map((item) => item.id));
  const nextCache = project.renderCache
    .filter((item) => !incomingIds.has(item.id))
    .filter((item) => !isNativeCacheItem(item) || isNativeCacheItemCurrent(project, item));
  return {
    ...project,
    renderCache: [...nextCache, ...items]
  };
}

export function filterNativeRenderCacheForProject(project: PocketDawProject, cache: NativeRenderCache, signature = nativeRenderCacheSignature(project)): NativeRenderCache | null {
  const currentItems = cache.renderCacheItems.filter((item) => !isNativeCacheItem(item) || isNativeCacheItemCurrent(project, item));
  if (!currentItems.length) return null;

  const keptAssetIds = new Set(currentItems.map((item) => String(item.metadata?.assetId || item.id)));
  const assets = cache.assets.filter((asset) => keptAssetIds.has(asset.id));
  const availableAssetIds = new Set(assets.map((asset) => asset.id));
  const regions = cache.regions.filter((region) => availableAssetIds.has(region.assetId));
  if (!regions.length) return null;

  const cachedClipIds = new Set<string>();
  currentItems.forEach((item) => {
    if (item.sourceClipId && regions.some((region) => region.assetId === String(item.metadata?.assetId || item.id))) {
      cachedClipIds.add(item.sourceClipId);
    }
  });

  const generatedRegionCount = regions.filter((region) => {
    const item = currentItems.find((entry) => String(entry.metadata?.assetId || entry.id) === region.assetId);
    return String(item?.metadata?.cacheKind || "") === "native-generated-stem";
  }).length;
  const runtimeAudioRegionCount = regions.filter((region) => {
    const item = currentItems.find((entry) => String(entry.metadata?.assetId || entry.id) === region.assetId);
    return String(item?.metadata?.cacheKind || "") === "native-runtime-audio";
  }).length;

  return {
    ...cache,
    signature,
    assets,
    regions,
    cachedClipIds,
    renderCacheItems: currentItems,
    renderCacheHitCount: currentItems.length,
    renderCacheMissCount: 0,
    proceduralFallbackEventCount: 0,
    generatedRegionCount,
    runtimeAudioRegionCount,
    missingRuntimeAudioRegionCount: 0,
    cachedAssetByteCount: assets.reduce((total, asset) => total + nativeAssetByteLength(asset), 0)
  };
}

function isNativeCacheItemCurrent(project: PocketDawProject, item: RenderCacheItem): boolean {
  const cacheKind = String(item.metadata?.cacheKind || "");
  const sourceHash = String(item.metadata?.sourceHash || "");
  if (!sourceHash) return false;
  return expectedNativeCacheSourceHashes(project, item, cacheKind).has(sourceHash);
}

function expectedNativeCacheSourceHashes(
  project: PocketDawProject,
  item: RenderCacheItem,
  cacheKind: string,
  generatedSignature = nativeRenderCacheSignature(project),
  runtimeSignature = nativeRuntimeAudioCacheSignature(project)
): Set<string> {
  const hashes = new Set<string>();
  if (cacheKind === "native-runtime-audio") {
    hashes.add(runtimeSignature);
    return hashes;
  }
  if (cacheKind !== "native-generated-stem") {
    hashes.add(generatedSignature);
    return hashes;
  }
  const rendererContractVersion = String(item.metadata?.rendererContractVersion || "");
  if (rendererContractVersion && rendererContractVersion !== NATIVE_AUDIO_RENDERER_CONTRACT_VERSION) return hashes;
  const renderMode = String(item.metadata?.renderMode || "");
  if (renderMode && renderMode !== NATIVE_CACHE_STEM_RENDER_MODE) return hashes;
  const clip = item.sourceClipId ? project.timeline.clips.find((entry) => entry.id === item.sourceClipId) : null;
  const trackId = String(item.metadata?.trackId || clip?.trackId || "");
  if (clip && trackId) hashes.add(nativeGeneratedStemSourceHash(project, clip, trackId));
  if (!clip || !trackId) {
    const assetId = String(item.metadata?.assetId || item.id);
    project.timeline.clips
      .filter(isNativeStemCacheableClip)
      .flatMap((candidate) => assetBuildItems(project, candidate))
      .filter((candidate) => candidate.assetId === assetId)
      .forEach((candidate) => hashes.add(candidate.sourceHash));
  }
  hashes.add(generatedSignature);
  return hashes;
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
    nativeRenderer: nativeAudioRendererContract(project.project.sampleRate),
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
    midiClips: project.timeline.clips
      .filter((clip) => clip.type === "midi")
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
      .filter((track) => STEM_ROLES.includes(track.role) || track.trackType === "midi")
      .map((track) => ({
        id: track.id,
        trackType: track.trackType,
        role: track.role,
        active: track.active
      })),
    drumLaneMix: nativeCacheStemDrumLaneMixState(project),
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

function nativeAudioRendererContract(sampleRate: number) {
  return {
    version: NATIVE_AUDIO_RENDERER_CONTRACT_VERSION,
    recipeHash: nativeRendererRecipeHash(),
    renderMode: NATIVE_CACHE_STEM_RENDER_MODE,
    renderSampleRate: sampleRate,
    stemTailSeconds: NATIVE_GENERATED_STEM_TAIL_SECONDS
  };
}

function nativeRendererRecipeHash(): string {
  return hashString(JSON.stringify({
    drumKits: POCKET_DRUM_KIT_CONFIGS,
    bassTones: POCKET_BASS_TONE_CONFIGS,
    chordInstruments: POCKET_CHORD_INSTRUMENT_CONFIGS,
    leadInstruments: POCKET_LEAD_INSTRUMENT_CONFIGS,
    guitarTones: POCKET_GUITAR_TONE_CONFIGS,
    proEqBands: POCKET_PRO_EQ_BANDS
  }));
}

function isNativeStemCacheableClip(clip: Clip): boolean {
  if (clip.muted) return false;
  if (clip.type === "generated-section") return !!clip.sectionId;
  if (clip.type === "midi") return midiDataFromClip(clip).notes.length > 0;
  return false;
}

function assetBuildItems(project: PocketDawProject, clip: Clip): AssetBuildItem[] {
  if (clip.type === "midi") return midiAssetBuildItems(project, clip);
  return generatedSectionAssetBuildItems(project, clip);
}

function generatedSectionAssetBuildItems(project: PocketDawProject, clip: Clip): AssetBuildItem[] {
  const stemMutes = clip.transforms.stemMutes || {};
  return STEM_ROLES.flatMap((role) => {
    if (stemMutes[role]) return [];
    const tracks = project.tracks.filter((track) => track.role === role && track.active !== false);
    return tracks.map((track) => {
      const sourceHash = nativeGeneratedStemSourceHash(project, clip, track.id);
      const key = `${clip.sourceRefId || "primary"}_${clip.sectionId || "section"}_${clip.barLength}_${role}_${track.id}_${hashString(JSON.stringify(clip.transforms))}_${sourceHash}`;
      return {
        key,
        assetId: nativeGeneratedStemAssetId(key),
        sourceHash,
        clip,
        trackId: track.id,
        role
      };
    });
  });
}

function midiAssetBuildItems(project: PocketDawProject, clip: Clip): AssetBuildItem[] {
  const track = project.tracks.find((item) => item.id === clip.trackId && item.active !== false);
  if (!track) return [];
  const sourceHash = nativeGeneratedStemSourceHash(project, clip, track.id);
  const key = `midi_${clip.id}_${clip.trackId}_${clip.barLength}_${hashString(JSON.stringify(clip.transforms))}_${sourceHash}`;
  return [{
    key,
    assetId: nativeGeneratedStemAssetId(key),
    sourceHash,
    clip,
    trackId: track.id,
    role: track.role
  }];
}

async function renderAsset(project: PocketDawProject, item: AssetBuildItem): Promise<{ asset: NativeAudioAsset | null; error: string | null }> {
  const assetProject = projectForNativeGeneratedStemRender(project, item.clip, item.trackId);
  const clipDurationSeconds = barsToSeconds(item.clip.barLength, project.project.bpm, project.project.timeSig);
  const renderDurationSeconds = generatedStemRenderDuration(clipDurationSeconds);
  const { rendered: nativeRender, error } = await renderNativeGeneratedStemWav(assetProject, renderDurationSeconds);
  if (!nativeRender?.bytes?.length) return { asset: null, error: error || "Native cache-stem renderer returned no audio." };
  const bytes = nativeRender.bytes;
  const sampleRate = nativeRender.sampleRate || project.project.sampleRate;
  const channels = nativeRender.channels || 2;
  const durationSeconds = nativeRender.durationSeconds || renderDurationSeconds;
  const id = item.assetId;
  return {
    asset: {
      id,
      name: `${item.clip.sectionId || "section"} ${item.role} ${item.trackId}`,
      relativePath: nativeRenderCacheRelativePath(id),
      mimeType: "audio/wav",
      sampleRate,
      channels,
      durationSeconds,
      sizeBytes: bytes.length,
      sourceHash: item.sourceHash,
      bytes
    },
    error: null
  };
}

function nativeGeneratedStemReusableAssets(cache: NativeRenderCache | null): Map<string, NativeAudioAsset> {
  const reusable = new Map<string, NativeAudioAsset>();
  if (!cache) return reusable;
  cache.assets.forEach((asset) => {
    if (asset.id && asset.bytes?.length) reusable.set(asset.id, asset);
  });
  return reusable;
}

function nativeGeneratedStemAssetId(key: string): string {
  return `native-cache-${hashString(key)}`;
}

function nativeGeneratedStemSourceHash(project: PocketDawProject, clip: Clip, trackId: string): string {
  const assetProject = projectForNativeGeneratedStemRender(project, clip, trackId);
  const events = renderTimelineEvents(assetProject).filter((event) => event.trackId === trackId);
  const isDrumStem = isDrumRoleTrack(assetProject, trackId);
  return hashString(JSON.stringify({
    nativeRenderer: nativeAudioRendererContract(assetProject.project.sampleRate),
    project: {
      bpm: assetProject.project.bpm,
      key: assetProject.project.key,
      scale: assetProject.project.scale,
      timeSig: assetProject.project.timeSig,
      swing: assetProject.project.swing,
      resolution: assetProject.project.resolution,
      sampleRate: assetProject.project.sampleRate,
      ppq: assetProject.project.ppq
    },
    trackId,
    events,
    drumLaneMix: isDrumStem ? nativeCacheStemDrumLaneMixState(assetProject) : [],
    fx: nativeGeneratedStemBakedFxState(assetProject, trackId),
    renderTailSeconds: NATIVE_GENERATED_STEM_TAIL_SECONDS
  }));
}

function generatedStemRenderDuration(durationSeconds: number): number {
  return Math.max(0, durationSeconds) + NATIVE_GENERATED_STEM_TAIL_SECONDS;
}

async function renderNativeGeneratedStemWav(assetProject: PocketDawProject, durationSeconds: number) {
  try {
    const events = renderTimelineEvents(assetProject);
    const payload = buildNativeAudioStartPayload(assetProject, events, 0);
    const rendered = await renderNativeAudioWav({ ...payload, loop: null, metronome: null }, durationSeconds, NATIVE_CACHE_STEM_RENDER_MODE);
    return {
      rendered,
      error: rendered ? null : "Native cache-stem renderer returned no audio."
    };
  } catch (error) {
    return {
      rendered: null,
      error: error instanceof Error ? error.message : String(error || "Native cache-stem renderer failed.")
    };
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
      trackId,
      startBar: 1
    }]
  };
  assetProject.tracks = assetProject.tracks.map((track) => {
    if (track.role === "master") return { ...track, volume: 1, pan: 0, mute: false, solo: false };
    const active = track.id === trackId;
    return { ...track, volume: active ? 1 : track.volume, pan: active ? 0 : track.pan, mute: !active, solo: false, automationLaneIds: [] };
  });
  assetProject.automation = { ...assetProject.automation, lanes: [] };
  assetProject.fx = nativeCacheStemFxState(assetProject);
  assetProject.mixer = { ...assetProject.mixer, masterLimiter: false };
  return assetProject;
}

function nativeCacheStemFxState(project: PocketDawProject): PocketDawProject["fx"] {
  return {
    chains: (project.fx?.chains || []).filter((chain) => typeof chain.metadata?.drumLaneId === "string")
  };
}

function nativeCacheStemDrumLaneMixState(project: PocketDawProject) {
  return DRUM_LANE_DEFS.map((lane) => {
    const mix = getDrumLaneMix(project, lane.id);
    return {
      id: lane.id,
      volume: mix.volume,
      pan: mix.pan,
      mute: mix.mute
    };
  });
}

function nativeGeneratedStemBakedFxState(project: PocketDawProject, trackId: string): PocketDawProject["fx"] {
  return isDrumRoleTrack(project, trackId) ? nativeCacheStemFxState(project) : { chains: [] };
}

function isDrumRoleTrack(project: PocketDawProject, trackId: string): boolean {
  return project.tracks.some((track) => track.id === trackId && track.role === "drums");
}

function renderCacheItemForAsset(asset: NativeAudioAsset, createdAt: string, item: AssetBuildItem): RenderCacheItem {
  return {
    id: asset.id,
    sourceClipId: item.clip.id,
    createdAt,
    invalidated: false,
    metadata: {
      cacheKind: "native-generated-stem",
      cacheScope: "project-native-audio",
      sourceHash: item.sourceHash,
      rendererContractVersion: NATIVE_AUDIO_RENDERER_CONTRACT_VERSION,
      rendererRecipeHash: nativeRendererRecipeHash(),
      renderMode: NATIVE_CACHE_STEM_RENDER_MODE,
      renderSampleRate: asset.sampleRate,
      assetId: asset.id,
      assetRelativePath: asset.relativePath || nativeRenderCacheRelativePath(asset.id),
      mimeType: asset.mimeType || "audio/wav",
      role: item.role,
      trackId: item.trackId,
      renderTailSeconds: NATIVE_GENERATED_STEM_TAIL_SECONDS,
      sampleRate: asset.sampleRate,
      channels: asset.channels,
      durationSeconds: asset.durationSeconds,
      byteLength: nativeAssetByteLength(asset),
      durableCacheReady: false
    }
  };
}

function renderCacheItemForRuntimeAudio(
  asset: NativeAudioAsset,
  signature: string,
  createdAt: string,
  clipId: string,
  mediaPoolItemId: string,
  source?: Pick<RuntimeAudioAssetSource, "sourceEncoding" | "sourceByteHash" | "sourceByteLength">
): RenderCacheItem {
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
      sourceEncoding: source?.sourceEncoding || "decoded-buffer-wav",
      ...(source?.sourceByteHash ? { sourceByteHash: source.sourceByteHash } : {}),
      ...(typeof source?.sourceByteLength === "number" ? { sourceByteLength: source.sourceByteLength } : {}),
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

function hydratedGeneratedStemEntries(
  project: PocketDawProject,
  item: RenderCacheItem,
  asset: NativeAudioAsset,
  assetId: string,
  cacheKind: string
): HydratedCacheEntry[] {
  const sourceHash = String(item.metadata?.sourceHash || "");
  const matchingBuildItems = project.timeline.clips
    .filter(isNativeStemCacheableClip)
    .flatMap((clip) => assetBuildItems(project, clip))
    .filter((buildItem) => buildItem.assetId === assetId && (!sourceHash || buildItem.sourceHash === sourceHash));

  if (!matchingBuildItems.length) {
    return [{
      item,
      asset,
      region: nativeRegionFromHydratedItem(project, item, asset),
      cacheKind,
      clipId: item.sourceClipId,
      generatedKey: generatedStemKey(item)
    }];
  }

  return matchingBuildItems.map((buildItem) => ({
    item,
    asset,
    region: nativeGeneratedRegionFromClip(project, buildItem.clip, buildItem.trackId, asset),
    cacheKind,
    clipId: buildItem.clip.id,
    generatedKey: `${buildItem.role}:${buildItem.trackId}`
  }));
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
    return nativeGeneratedRegionFromClip(project, clip, trackId, asset);
  }

  return null;
}

function nativeGeneratedRegionFromClip(project: PocketDawProject, clip: Clip, trackId: string, asset: NativeAudioAsset): NativeAudioRegion {
  const clipDuration = barsToSeconds(clip.barLength, project.project.bpm, project.project.timeSig);
  return {
    id: `${clip.id}_${trackId}_${asset.id}_hydrated`,
    assetId: asset.id,
    trackId,
    startTime: barsToSeconds(clip.startBar - 1, project.project.bpm, project.project.timeSig),
    sourceOffset: 0,
    duration: Math.min(generatedStemRenderDuration(clipDuration), asset.durationSeconds),
    gain: 1,
    pan: 0,
    fadeIn: 0,
    fadeOut: 0
  };
}

function hydratedDurationFallback(project: PocketDawProject, item: RenderCacheItem): number {
  const clip = item.sourceClipId ? project.timeline.clips.find((entry) => entry.id === item.sourceClipId) : null;
  if (!clip) return 0;
  const clipDuration = barsToSeconds(clip.barLength, project.project.bpm, project.project.timeSig);
  return String(item.metadata?.cacheKind || "") === "native-generated-stem"
    ? generatedStemRenderDuration(clipDuration)
    : clipDuration;
}

function expectedGeneratedStemKeys(project: PocketDawProject, clip: Clip): Set<string> {
  if (clip.type === "midi") {
    const track = project.tracks.find((item) => item.id === clip.trackId && item.active !== false);
    return track ? new Set([`${track.role}:${track.id}`]) : new Set();
  }
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
      const source = await runtimeAudioAssetSource(cached);
      const id = `native-audio-${hashString(key)}`;
      asset = {
        id,
        name: `${region.mediaPoolItemId} runtime audio`,
        relativePath: nativeRenderCacheRelativePath(id),
        mimeType: "audio/wav",
        sampleRate: source.sampleRate,
        channels: source.channels,
        durationSeconds: source.durationSeconds,
        sizeBytes: source.sizeBytes,
        sourceHash: signature,
        bytes: source.bytes
      };
      assets.set(key, asset);
      renderCacheItems.push(renderCacheItemForRuntimeAudio(asset, signature, createdAt, region.clipId, region.mediaPoolItemId, source));
    }
    const duration = Math.min(region.durationSeconds, Math.max(0, asset.durationSeconds - region.sourceOffsetSeconds));
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

async function runtimeAudioAssetSource(cached: CachedAudioBuffer): Promise<RuntimeAudioAssetSource> {
  const sourceWav = sourceWavForNativeRuntime(cached);
  if (sourceWav) return sourceWav;
  const bytes = Array.from(new Uint8Array(await encodeWav(cached.buffer).arrayBuffer()));
  return {
    bytes,
    sampleRate: cached.sampleRate,
    channels: cached.channels,
    durationSeconds: cached.durationSeconds,
    sizeBytes: bytes.length,
    sourceEncoding: "decoded-buffer-wav"
  };
}

function sourceWavForNativeRuntime(cached: CachedAudioBuffer): RuntimeAudioAssetSource | null {
  if (!cached.sourceBytes) return null;
  const bytes = new Uint8Array(cached.sourceBytes);
  const wav = parseSupportedNativeWav(bytes);
  if (!wav) return null;
  return {
    bytes: Array.from(bytes),
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    durationSeconds: wav.durationSeconds,
    sizeBytes: bytes.length,
    sourceEncoding: "original-wav",
    sourceByteHash: cached.sourceByteHash,
    sourceByteLength: cached.sourceByteLength
  };
}

function parseSupportedNativeWav(bytes: Uint8Array): { sampleRate: number; channels: number; durationSeconds: number } | null {
  if (bytes.length < 44 || !bytesHaveAscii(bytes, 0, "RIFF") || !bytesHaveAscii(bytes, 8, "WAVE")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let format = 0;
  let dataLength = 0;
  while (cursor + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[cursor], bytes[cursor + 1], bytes[cursor + 2], bytes[cursor + 3]);
    const length = view.getUint32(cursor + 4, true);
    const chunkStart = cursor + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd > bytes.length) return null;
    if (id === "fmt ") {
      if (length < 16) return null;
      format = view.getUint16(chunkStart, true);
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (id === "data") {
      dataLength = length;
    }
    cursor = chunkEnd + (length % 2);
  }
  const supportedFormat = (format === 1 && bitsPerSample === 16) || (format === 3 && bitsPerSample === 32);
  if (!supportedFormat || channels < 1 || channels > 2 || sampleRate <= 0 || dataLength <= 0) return null;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / Math.max(1, bytesPerSample * channels));
  return { sampleRate, channels, durationSeconds: frameCount / sampleRate };
}

function bytesHaveAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function runtimeAudioAssetKey(project: PocketDawProject, mediaPoolItemId: string, cached: CachedAudioBuffer): string {
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
    durationSeconds: cached.durationSeconds.toFixed(6),
    sourceByteHash: cached.sourceByteHash,
    sourceByteLength: cached.sourceByteLength,
    sourceMimeType: cached.sourceMimeType
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
