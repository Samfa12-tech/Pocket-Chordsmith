import { cloneProject } from "../daw/dawProject";
import type { Clip, PocketDawProject, TrackRole } from "../daw/schema";
import { barsToSeconds } from "../daw/timeline";
import { trackIsAudible } from "../daw/tracks";
import type { NativeAudioAsset, NativeAudioRegion } from "../native/audioPlayback";
import { renderProjectToWavBlob } from "./offlineRender";

const STEM_ROLES: TrackRole[] = ["drums", "bass", "chords", "melody", "guitar"];

export interface NativeRenderCache {
  signature: string;
  assets: NativeAudioAsset[];
  regions: NativeAudioRegion[];
  cachedClipIds: Set<string>;
  renderCacheHitCount: number;
  renderCacheMissCount: number;
  proceduralFallbackEventCount: number;
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
  let renderCacheHitCount = 0;
  let renderCacheMissCount = 0;

  for (const item of generatedClips.flatMap((clip) => assetBuildItems(project, clip, signature))) {
    let asset = assets.get(item.key);
    if (asset) {
      renderCacheHitCount += 1;
    } else {
      renderCacheMissCount += 1;
      asset = await renderAsset(project, item);
      assets.set(item.key, asset);
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
    cachedClipIds.add(item.clip.id);
  }

  return {
    signature,
    assets: Array.from(assets.values()),
    regions,
    cachedClipIds,
    renderCacheHitCount,
    renderCacheMissCount,
    proceduralFallbackEventCount: 0
  };
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
    tracks: project.tracks.map((track) => ({
      id: track.id,
      role: track.role,
      active: track.active,
      mute: track.mute,
      solo: track.solo,
      fxChainId: track.fxChainId
    })),
    fx: project.fx
  }));
}

function assetBuildItems(project: PocketDawProject, clip: Clip, signature: string): AssetBuildItem[] {
  const stemMutes = clip.transforms.stemMutes || {};
  return STEM_ROLES.flatMap((role) => {
    if (stemMutes[role]) return [];
    const tracks = project.tracks.filter((track) => track.role === role && track.active !== false && trackIsAudible(track, project.tracks));
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
    sampleRate: project.project.sampleRate,
    channels: 2,
    durationSeconds,
    bytes
  };
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
