import type { Clip, PocketDawProject, Track, TimelineMarker } from "./schema";
import { cloneProject } from "./dawProject";
import { assertExportProfileSupported } from "./exportProfiles";
import { createAudioMediaAnalysisSummary, createMediaPortabilitySummary, createRenderCacheSummary, type AudioMediaAnalysisSummary, type MediaPortabilitySummary, type RenderCacheSummary } from "./mediaPool";
import { validateProjectInvariants } from "./projectInvariants";
import { createRoutingExportSummary, type RoutingExportSummary } from "./routing";
import { barsToSeconds } from "./timeline";
import { createZipBlob, type ZipArchiveEntry } from "./zipArchive";
import { DRUM_LANE_DEFS, generatedDrumBranchLane, ensureDrumLaneMixerInPlace } from "./drumLanes";
import {
  GAME_PACK_FOLDERS,
  gamePackFullMixPath,
  gamePackManifestPath,
  gamePackSectionLoopPath,
  gamePackSourceProjectPath,
  gamePackStemPath,
  safeGamePackName
} from "../../../../packages/pocket-audio-core/src/export/game-pack-paths.js";

export interface StemExportPlanItem {
  id: string;
  label: string;
  trackIds: string[];
  fileName: string;
  packPath: string;
}

export interface SectionLoopExportItem {
  id: string;
  sectionId: string;
  name: string;
  startBar: number;
  endBar: number;
  bpm: number;
  key: string;
  scale: string;
  timeSig: number;
  lengthBars: number;
  lengthSeconds: number;
  fileName: string;
  packPath: string;
  status: "renderable";
  sourceClipId: string;
}

export interface ClipRenderProject {
  project: PocketDawProject;
  clip: Clip;
}

export type GamePackAudioFormat = "wav" | "flac" | "ogg-vorbis" | "mp3";

export interface GamePackAudioCodecMetadata {
  format: GamePackAudioFormat;
  container: string;
  codec: string;
  extension: string;
  mimeType: string;
  status: "implemented" | "planned";
  sampleRate: number;
  channels: 1 | 2;
  bitDepth?: 16 | 24 | 32;
  bitrateKbps?: number;
  quality?: number;
  compressionLevel?: number;
  normalization: {
    mode: "off" | "peak";
    targetPeak?: number;
  };
  sourceWavIncluded: boolean;
  targetRuntimeSmoke: "required-before-release-claim";
}

export interface GamePackArtifactSummary {
  path: string;
  role: "manifest" | "source-project" | "full-mix" | "stem" | "section-loop";
  label: string;
  sizeBytes: number | null;
  audio?: GamePackAudioCodecMetadata;
  sourceId?: string;
}

export interface GamePackSizeSummary {
  expectedFileCount: number;
  renderedFileCount: number;
  audioFileCount: number;
  totalSizeBytes: number | null;
  audioSizeBytes: number | null;
  largestEntry: { path: string; sizeBytes: number } | null;
  missingSizePaths: string[];
}

export interface GamePackAudioSummary {
  current: GamePackAudioCodecMetadata;
  plannedFormats: GamePackAudioCodecMetadata[];
  releaseStatus: string;
}

export interface GamePackDeliveryTarget {
  id: "godot-local-loopback" | "godot-zip" | "web-zip";
  label: string;
  kind: GameExportManifest["kind"];
  delivery: "local-loopback-with-zip-fallback" | "zip-save-as";
  action: "push-godot-pack" | "export-godot-manifest" | "export-web-game-manifest";
  supportedAudioFormats: GamePackAudioFormat[];
  verifierCommand: string;
  targetRuntimeSmoke: "manual-required-before-release-claim";
  notes: string[];
  endpointUrl?: string;
}

export interface GameExportManifest {
  kind: "godot-adaptive-pack" | "web-game-pack";
  projectTitle: string;
  bpm: number;
  key: string;
  scale: string;
  timeSig: number;
  manifestFile: string;
  fullMix: string;
  sourceProject: string;
  stems: StemExportPlanItem[];
  sectionLoops: SectionLoopExportItem[];
  markers: Array<TimelineMarker & { seconds: number }>;
  files: string[];
  artifacts: GamePackArtifactSummary[];
  sizeSummary: GamePackSizeSummary;
  audio: GamePackAudioSummary;
  routing: RoutingExportSummary;
  renderCache: RenderCacheSummary;
  mediaAnalysis: AudioMediaAnalysisSummary;
  mediaPortability: MediaPortabilitySummary;
  folders: {
    full: string;
    stems: string;
    sections: string;
    manifests: string;
    source: string;
  };
  warnings: string[];
  notes: string[];
}

export interface GamePackZipResult {
  manifest: GameExportManifest;
  blob: Blob;
  entries: Array<{ path: string; size: number }>;
}

export interface GamePackZipOptions {
  renderWav: (project: PocketDawProject) => Promise<Blob>;
  sourceProjectContents: string;
  onProgress?: (label: string, detail: string) => Promise<void> | void;
}

export function createGamePackDeliveryTargets(): GamePackDeliveryTarget[] {
  return [
    {
      id: "godot-local-loopback",
      label: "Push Godot Pack",
      kind: "godot-adaptive-pack",
      delivery: "local-loopback-with-zip-fallback",
      action: "push-godot-pack",
      endpointUrl: "http://127.0.0.1:47859/pocket-daw/godot/game-pack",
      supportedAudioFormats: ["wav"],
      verifierCommand: "npm run verify:game-pack -- <zip> --kind godot-adaptive-pack",
      targetRuntimeSmoke: "manual-required-before-release-claim",
      notes: [
        "Attempts a local loopback Godot receiver first.",
        "Falls back to the standard Godot ZIP Save As/download path when the receiver is unavailable.",
        "Does not imply Godot target import smoke has passed."
      ]
    },
    {
      id: "godot-zip",
      label: "Godot Game Pack ZIP",
      kind: "godot-adaptive-pack",
      delivery: "zip-save-as",
      action: "export-godot-manifest",
      supportedAudioFormats: ["wav"],
      verifierCommand: "npm run verify:game-pack -- <zip> --kind godot-adaptive-pack",
      targetRuntimeSmoke: "manual-required-before-release-claim",
      notes: [
        "Exports the Godot pack as a deterministic ZIP with manifest, source project, full mix, stems and section loops.",
        "Manual Godot import smoke is required before release claims."
      ]
    },
    {
      id: "web-zip",
      label: "Web Game Pack ZIP",
      kind: "web-game-pack",
      delivery: "zip-save-as",
      action: "export-web-game-manifest",
      supportedAudioFormats: ["wav"],
      verifierCommand: "npm run verify:game-pack -- <zip> --kind web-game-pack",
      targetRuntimeSmoke: "manual-required-before-release-claim",
      notes: [
        "Exports the web-game pack as a deterministic ZIP with manifest, source project, full mix, stems and section loops.",
        "Manual target web-game smoke is required before release claims."
      ]
    }
  ];
}

export interface StemExportManifest {
  kind: "stem-wavs";
  projectTitle: string;
  bpm: number;
  key: string;
  scale: string;
  timeSig: number;
  manifestFile: string;
  stems: StemExportPlanItem[];
  files: string[];
  artifacts: GamePackArtifactSummary[];
  sizeSummary: GamePackSizeSummary;
  audio: GamePackAudioSummary;
  routing: RoutingExportSummary;
  renderCache: RenderCacheSummary;
  mediaAnalysis: AudioMediaAnalysisSummary;
  mediaPortability: MediaPortabilitySummary;
  folders: {
    stems: string;
    manifests: string;
  };
  warnings: string[];
  notes: string[];
}

export interface StemZipResult {
  manifest: StemExportManifest;
  blob: Blob;
  entries: Array<{ path: string; size: number }>;
}

export interface StemZipOptions {
  renderWav: (project: PocketDawProject) => Promise<Blob>;
  onProgress?: (label: string, detail: string) => Promise<void> | void;
}

export interface SectionLoopExportManifest {
  kind: "section-loop-wavs";
  projectTitle: string;
  bpm: number;
  key: string;
  scale: string;
  timeSig: number;
  manifestFile: string;
  sectionLoops: SectionLoopExportItem[];
  files: string[];
  artifacts: GamePackArtifactSummary[];
  sizeSummary: GamePackSizeSummary;
  audio: GamePackAudioSummary;
  routing: RoutingExportSummary;
  renderCache: RenderCacheSummary;
  mediaAnalysis: AudioMediaAnalysisSummary;
  mediaPortability: MediaPortabilitySummary;
  folders: {
    sections: string;
    manifests: string;
  };
  warnings: string[];
  notes: string[];
}

export interface SectionLoopZipResult {
  manifest: SectionLoopExportManifest;
  blob: Blob;
  entries: Array<{ path: string; size: number }>;
}

export interface SectionLoopZipOptions {
  renderWav: (project: PocketDawProject) => Promise<Blob>;
  onProgress?: (label: string, detail: string) => Promise<void> | void;
}

export function createStemExportPlan(project: PocketDawProject): StemExportPlanItem[] {
  const generatedRoles = ["drums", "bass", "chords", "melody", "guitar"];
  const plans = generatedRoles
    .flatMap((role) => generatedRoleStemItems(project, role));

  const audioTracks = project.tracks.filter((track) => track.trackType === "audio" && track.role !== "master").map((track) => stemItem(`audio-${track.id}`, track.name, [track.id], project));
  const midiTracks = project.tracks.filter((track) => track.trackType === "midi").map((track) => stemItem(`midi-${track.id}`, track.name, [track.id], project));
  return [...plans, ...audioTracks, ...midiTracks];
}

function generatedRoleStemItems(project: PocketDawProject, role: string): StemExportPlanItem[] {
  if (role !== "drums") {
    const ids = project.tracks.filter((track) => track.role === role && track.active !== false).map((track) => track.id);
    return ids.length ? [stemItem(role, titleCase(role), ids, project)] : [];
  }
  const parentIds = project.tracks
    .filter((track) => track.role === "drums" && track.active !== false && !generatedDrumBranchLane(track))
    .map((track) => track.id);
  const fullDrums = parentIds.length ? [stemItem("drums", "Drums", parentIds, project)] : [];
  const branchStems = project.tracks
    .filter((track) => track.role === "drums" && track.active !== false && generatedDrumBranchLane(track))
    .map((track) => {
      const lane = generatedDrumBranchLane(track)!;
      const label = `Drums ${track.name || titleCase(lane)}`;
      return stemItem(`drums-${lane}`, label, [track.id], project);
    });
  return [...fullDrums, ...branchStems];
}

export function createStemExportManifest(project: PocketDawProject): StemExportManifest {
  const stems = createStemExportPlan(project);
  const audio = createGamePackAudioSummary(project, "stem-wavs");
  const routing = createRoutingExportSummary(project);
  const renderCache = createRenderCacheSummary(project);
  const mediaAnalysis = createAudioMediaAnalysisSummary(project);
  const mediaPortability = createMediaPortabilitySummary(project);
  const manifestFile = "manifests/stem-wavs-manifest.json";
  const files = [manifestFile, ...stems.map((stem) => stem.packPath)];
  const artifacts = createStemExportArtifactSummaries({ manifestFile, stems, audio: audio.current });
  const invariantReport = validateProjectInvariants(project);
  const warnings = [
    ...collectExportWarnings(project, { includeSectionLoopWarning: false }),
    ...invariantReport.errors.map((issue) => `Project invariant error: ${issue.message}`),
    ...invariantReport.warnings.map((issue) => `Project invariant warning: ${issue.message}`)
  ];
  return {
    kind: "stem-wavs",
    projectTitle: project.project.title,
    bpm: project.project.bpm,
    key: project.project.key,
    scale: project.project.scale,
    timeSig: project.project.timeSig,
    manifestFile,
    stems,
    files,
    artifacts,
    sizeSummary: summarizeArtifacts(artifacts),
    audio,
    routing,
    renderCache,
    mediaAnalysis,
    mediaPortability,
    folders: {
      stems: GAME_PACK_FOLDERS.stems,
      manifests: GAME_PACK_FOLDERS.manifests
    },
    warnings,
    notes: [
      "Stem WAV export now downloads a single ZIP archive instead of multiple sequential browser downloads.",
      "Stem file paths match the game-pack stem folder layout so Godot, web-game and standalone workflows can reuse the same deterministic names.",
      "Compressed FLAC, Ogg Vorbis and MP3 stem packs are planned but not release-supported until encoder dependencies and runtime smoke are proven."
    ]
  };
}

export async function createStemZipBlob(project: PocketDawProject, options: StemZipOptions): Promise<StemZipResult> {
  const profile = project.exportProfiles.find((item) => item.id === "stem-wavs");
  if (profile) assertExportProfileSupported(profile, "Stem WAV export");
  const manifest = createStemExportManifest(project);
  if (!manifest.stems.length) throw new Error("No stem groups are available for this project.");
  const entries: ZipArchiveEntry[] = [];
  const entrySummaries: Array<{ path: string; size: number }> = [];
  const pushEntry = async (path: string, data: Blob | string) => {
    const size = byteSize(data);
    entries.push({ path, data });
    entrySummaries.push({ path, size });
  };

  for (const [index, stem] of manifest.stems.entries()) {
    await options.onProgress?.(`Rendering stem ${index + 1} of ${manifest.stems.length}`, stem.label);
    await pushEntry(stem.packPath, await options.renderWav(projectWithOnlyTracksAudible(project, stem.trackIds, "stem-wavs")));
  }

  const finalManifest = finalizeStemManifestSizes(manifest, entrySummaries);
  const manifestJson = JSON.stringify(finalManifest, null, 2);
  entries.push({ path: finalManifest.manifestFile, data: manifestJson });
  entrySummaries.push({ path: finalManifest.manifestFile, size: byteSize(manifestJson) });
  await options.onProgress?.("Assembling stem ZIP", `${entries.length} file${entries.length === 1 ? "" : "s"}`);
  return {
    manifest: finalManifest,
    blob: await createZipBlob(entries),
    entries: entrySummaries
  };
}

export function projectWithOnlyTracksAudible(project: PocketDawProject, trackIds: string[], wavProfileId = "full-song-wav"): PocketDawProject {
  const keep = new Set(trackIds);
  const branchLanes = new Set<string>();
  const branchParentTrackIds = new Set<string>();
  project.tracks.forEach((track) => {
    if (!keep.has(track.id)) return;
    const lane = generatedDrumBranchLane(track);
    if (!lane) return;
    branchLanes.add(lane);
    branchParentTrackIds.add(String(track.metadata?.parentGeneratedTrackId || "drums"));
  });
  const next = cloneProject(project);
  if (branchLanes.size) {
    ensureDrumLaneMixerInPlace(next);
    next.tracks.forEach((track) => {
      if (track.role !== "drums" || generatedDrumBranchLane(track)) return;
      const lanes = track.metadata?.drumLanes;
      if (!lanes || typeof lanes !== "object" || Array.isArray(lanes)) return;
      DRUM_LANE_DEFS.forEach((lane) => {
        const current = lanes[lane.id];
        if (current && typeof current === "object" && !Array.isArray(current)) {
          current.solo = branchLanes.has(lane.id);
        }
      });
    });
  }
  next.tracks = next.tracks.map((track) => {
      if (track.role === "master" || track.trackType === "bus" || track.trackType === "return") return { ...track, mute: false, solo: false, active: track.active };
      return { ...track, mute: !(keep.has(track.id) || branchParentTrackIds.has(track.id)), solo: false };
    });
  return projectWithWavRenderProfile(next, wavProfileId);
}

export function projectForClipRender(project: PocketDawProject, clipId: string): ClipRenderProject | null {
  const source = project.timeline.clips.find((clip) => clip.id === clipId);
  if (!source) return null;
  const next = cloneProject(project);
  const renderClip: Clip = {
    ...JSON.parse(JSON.stringify(source)),
    startBar: 1,
    muted: false,
    metadata: {
      ...(source.metadata || {}),
      freezeSourceClipId: source.id,
      freezeSourceStartBar: source.startBar
    }
  };
  next.timeline.clips = [renderClip];
  next.timeline.markers = [];
  next.timeline.loop = { enabled: false, startBar: 1, endBar: Math.max(2, Math.ceil(renderClip.barLength) + 1) };
  next.timeline.cursor = { bar: 1, beat: 1, tick: 0 };
  next.timeline.bars = Math.max(1, Math.ceil(renderClip.barLength));
  next.exportProfiles = next.exportProfiles.map((profile) => (
    profile.id === "full-song-wav"
      ? { ...profile, settings: { ...profile.settings, tailSeconds: 0.25 } }
      : profile
  ));
  return { project: next, clip: source };
}

export function createSectionLoopMetadata(project: PocketDawProject): SectionLoopExportItem[] {
  return project.timeline.clips
    .filter((clip) => clip.type === "generated-section" && clip.sectionId)
    .map((clip) => {
      const lengthBars = Math.max(0.25, clip.barLength);
      const name = `Section ${clip.sectionId} Bar ${formatBarSlug(clip.startBar)}`;
      const packPath = gamePackSectionLoopPath(project.project.title, name);
      return {
        id: `loop_${clip.id}`,
        sectionId: clip.sectionId!,
        name,
        startBar: clip.startBar,
        endBar: clip.startBar + clip.barLength,
        bpm: project.project.bpm,
        key: project.project.key,
        scale: project.project.scale,
        timeSig: project.project.timeSig,
        lengthBars,
        lengthSeconds: barsToSeconds(lengthBars, project.project.bpm, project.project.timeSig),
        fileName: fileNameFromPackPath(packPath),
        packPath,
        status: "renderable",
        sourceClipId: clip.id
      };
    });
}

export function createSectionLoopExportManifest(project: PocketDawProject): SectionLoopExportManifest {
  const sectionLoops = createSectionLoopMetadata(project);
  const audio = createGamePackAudioSummary(project, "section-loops");
  const routing = createRoutingExportSummary(project);
  const renderCache = createRenderCacheSummary(project);
  const mediaAnalysis = createAudioMediaAnalysisSummary(project);
  const mediaPortability = createMediaPortabilitySummary(project);
  const manifestFile = "manifests/section-loops-manifest.json";
  const files = [manifestFile, ...sectionLoops.map((loop) => loop.packPath)];
  const artifacts = createSectionLoopArtifactSummaries({ manifestFile, sectionLoops, audio: audio.current });
  const invariantReport = validateProjectInvariants(project);
  const warnings = [
    ...collectExportWarnings(project, { includeSectionLoopWarning: false }),
    ...invariantReport.errors.map((issue) => `Project invariant error: ${issue.message}`),
    ...invariantReport.warnings.map((issue) => `Project invariant warning: ${issue.message}`)
  ];
  return {
    kind: "section-loop-wavs",
    projectTitle: project.project.title,
    bpm: project.project.bpm,
    key: project.project.key,
    scale: project.project.scale,
    timeSig: project.project.timeSig,
    manifestFile,
    sectionLoops,
    files,
    artifacts,
    sizeSummary: summarizeArtifacts(artifacts),
    audio,
    routing,
    renderCache,
    mediaAnalysis,
    mediaPortability,
    folders: {
      sections: GAME_PACK_FOLDERS.sections,
      manifests: GAME_PACK_FOLDERS.manifests
    },
    warnings,
    notes: [
      "Section loop WAV export downloads a single ZIP archive instead of multiple sequential browser downloads.",
      "Each loop is rendered without export tail and uses the same deterministic section-loop path layout as Godot and web-game packs.",
      "Compressed Ogg Vorbis and MP3 loop packs remain planned until encoder dependencies and loop smoke are proven."
    ]
  };
}

export async function createSectionLoopZipBlob(project: PocketDawProject, options: SectionLoopZipOptions): Promise<SectionLoopZipResult> {
  const profile = project.exportProfiles.find((item) => item.id === "section-loops");
  if (profile) assertExportProfileSupported(profile, "Section Loop WAV export");
  const manifest = createSectionLoopExportManifest(project);
  if (!manifest.sectionLoops.length) throw new Error("No generated section loops are available for export.");
  const entries: ZipArchiveEntry[] = [];
  const entrySummaries: Array<{ path: string; size: number }> = [];
  const pushEntry = async (path: string, data: Blob | string) => {
    const size = byteSize(data);
    entries.push({ path, data });
    entrySummaries.push({ path, size });
  };

  for (const [index, loop] of manifest.sectionLoops.entries()) {
    await options.onProgress?.(`Rendering section loop ${index + 1} of ${manifest.sectionLoops.length}`, loop.name);
    await pushEntry(loop.packPath, await options.renderWav(projectForSectionLoopRender(project, loop)));
  }

  const finalManifest = finalizeSectionLoopManifestSizes(manifest, entrySummaries);
  const manifestJson = JSON.stringify(finalManifest, null, 2);
  entries.push({ path: finalManifest.manifestFile, data: manifestJson });
  entrySummaries.push({ path: finalManifest.manifestFile, size: byteSize(manifestJson) });
  await options.onProgress?.("Assembling section-loop ZIP", `${entries.length} file${entries.length === 1 ? "" : "s"}`);
  return {
    manifest: finalManifest,
    blob: await createZipBlob(entries),
    entries: entrySummaries
  };
}

export function projectForSectionLoopRender(project: PocketDawProject, loop: SectionLoopExportItem): PocketDawProject {
  const source = project.timeline.clips.find((clip) => clip.id === loop.sourceClipId);
  if (!source || source.type !== "generated-section" || !source.sectionId) return project;
  const next = cloneProject(project);
  const renderClip: Clip = {
    ...JSON.parse(JSON.stringify(source)),
    id: `${source.id}_loop_render`,
    startBar: 1,
    barLength: loop.lengthBars,
    muted: false,
    linked: false
  };
  next.timeline = {
    ...next.timeline,
    bars: loop.lengthBars,
    clips: [renderClip],
    loop: {
      enabled: true,
      startBar: 1,
      endBar: 1 + loop.lengthBars
    }
  };
  return projectWithWavRenderProfile(next, "section-loops", { tailSeconds: 0 });
}

function projectWithWavRenderProfile(project: PocketDawProject, sourceProfileId: string, settingsPatch: Record<string, number | boolean | string> = {}): PocketDawProject {
  const source = project.exportProfiles.find((profile) => profile.id === sourceProfileId);
  if (!source || source.id === "full-song-wav" && !Object.keys(settingsPatch).length) return project;
  return {
    ...project,
    exportProfiles: project.exportProfiles.map((profile) => {
      if (profile.id !== "full-song-wav") return profile;
      return {
        ...profile,
        sampleRate: source.sampleRate ?? profile.sampleRate,
        bitDepth: source.bitDepth ?? profile.bitDepth,
        settings: {
          ...(profile.settings || {}),
          ...(source.settings || {}),
          ...settingsPatch
        }
      };
    })
  };
}

export function createGameExportManifest(project: PocketDawProject, kind: GameExportManifest["kind"]): GameExportManifest {
  const stems = createStemExportPlan(project);
  const sectionLoops = createSectionLoopMetadata(project);
  const audio = createGamePackAudioSummary(project);
  const routing = createRoutingExportSummary(project);
  const renderCache = createRenderCacheSummary(project);
  const mediaAnalysis = createAudioMediaAnalysisSummary(project);
  const mediaPortability = createMediaPortabilitySummary(project);
  const markers = project.timeline.markers.map((marker) => ({
    ...marker,
    seconds: barsToSeconds(Math.max(0, marker.bar - 1), project.project.bpm, project.project.timeSig)
  }));
  const manifestFile = gamePackManifestPath(kind);
  const fullMixFile = gamePackFullMixPath(project.project.title);
  const sourceProject = gamePackSourceProjectPath(project.project.title);
  const files = [manifestFile, fullMixFile, ...stems.map((stem) => stem.packPath), ...sectionLoops.map((loop) => loop.packPath), sourceProject];
  const artifacts = createGamePackArtifactSummaries({
    manifestFile,
    fullMixFile,
    sourceProject,
    stems,
    sectionLoops,
    audio: audio.current
  });
  const invariantReport = validateProjectInvariants(project);
  const warnings = [
    ...collectExportWarnings(project),
    ...invariantReport.errors.map((issue) => `Project invariant error: ${issue.message}`),
    ...invariantReport.warnings.map((issue) => `Project invariant warning: ${issue.message}`)
  ];
  return {
    kind,
    projectTitle: project.project.title,
    bpm: project.project.bpm,
    key: project.project.key,
    scale: project.project.scale,
    timeSig: project.project.timeSig,
    manifestFile,
    fullMix: fullMixFile,
    sourceProject,
    stems,
    sectionLoops,
    markers,
    files,
    artifacts,
    sizeSummary: summarizeArtifacts(artifacts),
    audio,
    routing,
    renderCache,
    mediaAnalysis,
    mediaPortability,
    folders: {
      full: GAME_PACK_FOLDERS.full,
      stems: GAME_PACK_FOLDERS.stems,
      sections: GAME_PACK_FOLDERS.sections,
      manifests: GAME_PACK_FOLDERS.manifests,
      source: GAME_PACK_FOLDERS.source
    },
    warnings,
    notes: [
      "Full mix, stem WAVs and section loop WAVs are rendered into this pack.",
      "Manifest paths use the target pack folder layout so Godot and web-game importers can collect files deterministically.",
      "The source .pocketdaw JSON is included for round-trip edits.",
      "Compressed FLAC, Ogg Vorbis and MP3 pack metadata is reserved for future encoder-backed profiles; current packs remain WAV-only."
    ]
  };
}

export async function createGamePackZipBlob(project: PocketDawProject, kind: GameExportManifest["kind"], options: GamePackZipOptions): Promise<GamePackZipResult> {
  const profile = project.exportProfiles.find((item) => item.id === kind);
  if (profile) assertExportProfileSupported(profile, "Game-pack export");
  const manifest = createGameExportManifest(project, kind);
  const entries: ZipArchiveEntry[] = [];
  const entrySummaries: Array<{ path: string; size: number }> = [];
  const pushEntry = async (path: string, data: Blob | string) => {
    const size = byteSize(data);
    entries.push({ path, data });
    entrySummaries.push({ path, size });
  };
  const totalRenders = 1 + manifest.stems.length + manifest.sectionLoops.length;
  let renderIndex = 0;

  await options.onProgress?.(`Rendering game-pack audio ${++renderIndex} of ${totalRenders}`, "Full mix");
  await pushEntry(manifest.fullMix, await options.renderWav(project));

  for (const stem of manifest.stems) {
    await options.onProgress?.(`Rendering game-pack audio ${++renderIndex} of ${totalRenders}`, stem.label);
    await pushEntry(stem.packPath, await options.renderWav(projectWithOnlyTracksAudible(project, stem.trackIds)));
  }

  for (const loop of manifest.sectionLoops) {
    await options.onProgress?.(`Rendering game-pack audio ${++renderIndex} of ${totalRenders}`, loop.name);
    await pushEntry(loop.packPath, await options.renderWav(projectForSectionLoopRender(project, loop)));
  }

  await pushEntry(manifest.sourceProject, options.sourceProjectContents);
  const finalManifest = finalizeManifestSizes(manifest, entrySummaries);
  const manifestJson = JSON.stringify(finalManifest, null, 2);
  entries.push({ path: finalManifest.manifestFile, data: manifestJson });
  entrySummaries.push({ path: finalManifest.manifestFile, size: byteSize(manifestJson) });
  await options.onProgress?.("Assembling game-pack ZIP", `${entries.length} file${entries.length === 1 ? "" : "s"}`);
  return {
    manifest: finalManifest,
    blob: await createZipBlob(entries),
    entries: entrySummaries
  };
}

export function collectExportWarnings(project: PocketDawProject, options: { includeSectionLoopWarning?: boolean } = {}): string[] {
  const includeSectionLoopWarning = options.includeSectionLoopWarning !== false;
  const warnings: string[] = [];
  project.mediaPool.forEach((item) => {
    if (item.metadata?.missing === true || item.metadata?.unresolved === true) warnings.push(`${item.name}: media is missing or unresolved.`);
    if (item.metadata?.runtimeOnly === true) warnings.push(`${item.name}: browser runtime-only media must be re-imported in native mode before a durable pack.`);
  });
  const mutedTracks = project.tracks.filter((track) => track.mute && track.role !== "master").map((track) => track.name);
  if (mutedTracks.length) warnings.push(`Muted tracks are excluded from audible renders: ${mutedTracks.join(", ")}.`);
  if (includeSectionLoopWarning && !createSectionLoopMetadata(project).length) warnings.push("No generated sections are available for section-loop export.");
  const invalidatedRenderCacheCount = createRenderCacheSummary(project).invalidatedCount;
  if (invalidatedRenderCacheCount) warnings.push(`${invalidatedRenderCacheCount} render-cache item${invalidatedRenderCacheCount === 1 ? " is" : "s are"} invalidated; rebuild or refreeze before relying on cached game-pack assets.`);
  const mediaAnalysis = createAudioMediaAnalysisSummary(project);
  const mediaPortability = createMediaPortabilitySummary(project);
  if (mediaPortability.needsCollectionOrRelinkCount) {
    warnings.push(`${mediaPortability.needsCollectionOrRelinkCount} media item${mediaPortability.needsCollectionOrRelinkCount === 1 ? "" : "s"} must be collected or relinked before the embedded source project is portable.`);
  }
  if (mediaAnalysis.clipsMissingWaveformCount) warnings.push(`${mediaAnalysis.clipsMissingWaveformCount} audio clip${mediaAnalysis.clipsMissingWaveformCount === 1 ? " is" : "s are"} missing waveform analysis; normalize and future waveform edits will be limited until media is analyzed.`);
  if (mediaAnalysis.staleAnalysisCount) warnings.push(`${mediaAnalysis.staleAnalysisCount} audio media item${mediaAnalysis.staleAnalysisCount === 1 ? " has" : "s have"} stale waveform analysis flags; reload or re-analyze before release smoke.`);
  warnings.push(...createRoutingExportSummary(project).warnings);
  return warnings;
}

function stemItem(id: string, label: string, trackIds: string[], project: PocketDawProject): StemExportPlanItem {
  const packPath = gamePackStemPath(project.project.title, label);
  return {
    id,
    label,
    trackIds,
    fileName: fileNameFromPackPath(packPath),
    packPath
  };
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatBarSlug(value: number): string {
  const safe = Number.isFinite(value) ? value : 1;
  return Number.isInteger(safe) ? String(safe) : String(safe).replace(".", "-");
}

function fileNameFromPackPath(path: string): string {
  return path.split("/").pop() || `${safeGamePackName(path, "pocket-daw")}.wav`;
}

export function gamePackAudioCodecMetadata(format: GamePackAudioFormat, sampleRate = 44100, normalization: GamePackAudioCodecMetadata["normalization"] = { mode: "off" }): GamePackAudioCodecMetadata {
  const base = {
    sampleRate,
    channels: 2 as const,
    normalization,
    sourceWavIncluded: false
  };
  if (format === "wav") {
    return {
      ...base,
      format,
      container: "wav",
      codec: "pcm-s16le",
      extension: "wav",
      mimeType: "audio/wav",
      status: "implemented",
      bitDepth: 16,
      targetRuntimeSmoke: "required-before-release-claim"
    };
  }
  if (format === "flac") {
    return {
      ...base,
      format,
      container: "flac",
      codec: "flac",
      extension: "flac",
      mimeType: "audio/flac",
      status: "planned",
      bitDepth: 16,
      compressionLevel: 5,
      targetRuntimeSmoke: "required-before-release-claim"
    };
  }
  if (format === "ogg-vorbis") {
    return {
      ...base,
      format,
      container: "ogg",
      codec: "vorbis",
      extension: "ogg",
      mimeType: "audio/ogg",
      status: "planned",
      quality: 5,
      targetRuntimeSmoke: "required-before-release-claim"
    };
  }
  return {
    ...base,
    format,
    container: "mp3",
    codec: "mp3",
    extension: "mp3",
    mimeType: "audio/mpeg",
    status: "planned",
    bitrateKbps: 192,
    targetRuntimeSmoke: "required-before-release-claim"
  };
}

function createGamePackAudioSummary(project: PocketDawProject, profileId = "full-song-wav"): GamePackAudioSummary {
  const profile = project.exportProfiles.find((item) => item.id === profileId);
  const profileRate = Number(profile?.sampleRate);
  const sampleRate = Number.isFinite(profileRate) && profileRate >= 22050 && profileRate <= 192000
    ? Math.round(profileRate)
    : project.project.sampleRate || 44100;
  const normalization = exportProfileNormalizationMetadata(profile);
  return {
    current: gamePackAudioCodecMetadata("wav", sampleRate, normalization),
    plannedFormats: [
      gamePackAudioCodecMetadata("flac", sampleRate, normalization),
      gamePackAudioCodecMetadata("ogg-vorbis", sampleRate, normalization),
      gamePackAudioCodecMetadata("mp3", sampleRate, normalization)
    ],
    releaseStatus: "Current Godot/Web game packs are WAV-only until encoder dependencies and target-runtime smoke are proven."
  };
}

function exportProfileNormalizationMetadata(profile: PocketDawProject["exportProfiles"][number] | undefined): GamePackAudioCodecMetadata["normalization"] {
  const normalize = profile?.settings?.normalize;
  if (normalize === true || normalize === "peak") return { mode: "peak", targetPeak: 0.95 };
  return { mode: "off" };
}

function createGamePackArtifactSummaries(input: {
  manifestFile: string;
  fullMixFile: string;
  sourceProject: string;
  stems: StemExportPlanItem[];
  sectionLoops: SectionLoopExportItem[];
  audio: GamePackAudioCodecMetadata;
}): GamePackArtifactSummary[] {
  return [
    { path: input.manifestFile, role: "manifest", label: "Pack manifest", sizeBytes: null },
    { path: input.fullMixFile, role: "full-mix", label: "Full mix", sizeBytes: null, audio: input.audio },
    ...input.stems.map((stem) => ({
      path: stem.packPath,
      role: "stem" as const,
      label: stem.label,
      sizeBytes: null,
      audio: input.audio,
      sourceId: stem.id
    })),
    ...input.sectionLoops.map((loop) => ({
      path: loop.packPath,
      role: "section-loop" as const,
      label: loop.name,
      sizeBytes: null,
      audio: input.audio,
      sourceId: loop.id
    })),
    { path: input.sourceProject, role: "source-project", label: "Source Pocket DAW project", sizeBytes: null }
  ];
}

function createStemExportArtifactSummaries(input: {
  manifestFile: string;
  stems: StemExportPlanItem[];
  audio: GamePackAudioCodecMetadata;
}): GamePackArtifactSummary[] {
  return [
    { path: input.manifestFile, role: "manifest", label: "Stem manifest", sizeBytes: null },
    ...input.stems.map((stem) => ({
      path: stem.packPath,
      role: "stem" as const,
      label: stem.label,
      sizeBytes: null,
      audio: input.audio,
      sourceId: stem.id
    }))
  ];
}

function createSectionLoopArtifactSummaries(input: {
  manifestFile: string;
  sectionLoops: SectionLoopExportItem[];
  audio: GamePackAudioCodecMetadata;
}): GamePackArtifactSummary[] {
  return [
    { path: input.manifestFile, role: "manifest", label: "Section loop manifest", sizeBytes: null },
    ...input.sectionLoops.map((loop) => ({
      path: loop.packPath,
      role: "section-loop" as const,
      label: loop.name,
      sizeBytes: null,
      audio: input.audio,
      sourceId: loop.id
    }))
  ];
}

function finalizeManifestSizes(manifest: GameExportManifest, entries: Array<{ path: string; size: number }>): GameExportManifest {
  let next = applyArtifactSizes(manifest, entries);
  for (let index = 0; index < 5; index += 1) {
    const manifestSize = byteSize(JSON.stringify(next, null, 2));
    const withManifest = applyArtifactSizes(manifest, [...entries, { path: manifest.manifestFile, size: manifestSize }]);
    if (byteSize(JSON.stringify(withManifest, null, 2)) === manifestSize) return withManifest;
    next = withManifest;
  }
  return next;
}

function finalizeStemManifestSizes(manifest: StemExportManifest, entries: Array<{ path: string; size: number }>): StemExportManifest {
  let next = applyStemArtifactSizes(manifest, entries);
  for (let index = 0; index < 5; index += 1) {
    const manifestSize = byteSize(JSON.stringify(next, null, 2));
    const withManifest = applyStemArtifactSizes(manifest, [...entries, { path: manifest.manifestFile, size: manifestSize }]);
    if (byteSize(JSON.stringify(withManifest, null, 2)) === manifestSize) return withManifest;
    next = withManifest;
  }
  return next;
}

function applyStemArtifactSizes(manifest: StemExportManifest, entries: Array<{ path: string; size: number }>): StemExportManifest {
  const sizes = new Map(entries.map((entry) => [entry.path, entry.size]));
  const artifacts = manifest.artifacts.map((artifact) => ({
    ...artifact,
    sizeBytes: sizes.get(artifact.path) ?? null
  }));
  return {
    ...manifest,
    artifacts,
    sizeSummary: summarizeArtifacts(artifacts)
  };
}

function finalizeSectionLoopManifestSizes(manifest: SectionLoopExportManifest, entries: Array<{ path: string; size: number }>): SectionLoopExportManifest {
  let next = applySectionLoopArtifactSizes(manifest, entries);
  for (let index = 0; index < 5; index += 1) {
    const manifestSize = byteSize(JSON.stringify(next, null, 2));
    const withManifest = applySectionLoopArtifactSizes(manifest, [...entries, { path: manifest.manifestFile, size: manifestSize }]);
    if (byteSize(JSON.stringify(withManifest, null, 2)) === manifestSize) return withManifest;
    next = withManifest;
  }
  return next;
}

function applySectionLoopArtifactSizes(manifest: SectionLoopExportManifest, entries: Array<{ path: string; size: number }>): SectionLoopExportManifest {
  const sizes = new Map(entries.map((entry) => [entry.path, entry.size]));
  const artifacts = manifest.artifacts.map((artifact) => ({
    ...artifact,
    sizeBytes: sizes.get(artifact.path) ?? null
  }));
  return {
    ...manifest,
    artifacts,
    sizeSummary: summarizeArtifacts(artifacts)
  };
}

function applyArtifactSizes(manifest: GameExportManifest, entries: Array<{ path: string; size: number }>): GameExportManifest {
  const sizes = new Map(entries.map((entry) => [entry.path, entry.size]));
  const artifacts = manifest.artifacts.map((artifact) => ({
    ...artifact,
    sizeBytes: sizes.get(artifact.path) ?? null
  }));
  return {
    ...manifest,
    artifacts,
    sizeSummary: summarizeArtifacts(artifacts)
  };
}

function summarizeArtifacts(artifacts: GamePackArtifactSummary[]): GamePackSizeSummary {
  const rendered = artifacts.filter((artifact) => artifact.sizeBytes !== null);
  const audio = artifacts.filter((artifact) => artifact.audio);
  const renderedAudio = audio.filter((artifact) => artifact.sizeBytes !== null);
  const largest = rendered.reduce<GamePackArtifactSummary | null>((current, artifact) => {
    if (!current) return artifact;
    return (artifact.sizeBytes || 0) > (current.sizeBytes || 0) ? artifact : current;
  }, null);
  return {
    expectedFileCount: artifacts.length,
    renderedFileCount: rendered.length,
    audioFileCount: audio.length,
    totalSizeBytes: rendered.length === artifacts.length ? rendered.reduce((sum, artifact) => sum + (artifact.sizeBytes || 0), 0) : null,
    audioSizeBytes: renderedAudio.length === audio.length ? renderedAudio.reduce((sum, artifact) => sum + (artifact.sizeBytes || 0), 0) : null,
    largestEntry: largest && largest.sizeBytes !== null ? { path: largest.path, sizeBytes: largest.sizeBytes } : null,
    missingSizePaths: artifacts.filter((artifact) => artifact.sizeBytes === null).map((artifact) => artifact.path)
  };
}

function byteSize(data: Blob | string): number {
  return typeof data === "string" ? new TextEncoder().encode(data).byteLength : data.size;
}
