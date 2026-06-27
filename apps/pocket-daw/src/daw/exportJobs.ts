import type { Clip, PocketDawProject, Track, TimelineMarker } from "./schema";
import { cloneProject } from "./dawProject";
import { validateProjectInvariants } from "./projectInvariants";
import { barsToSeconds } from "./timeline";
import { createZipBlob, type ZipArchiveEntry } from "./zipArchive";
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

export function createStemExportPlan(project: PocketDawProject): StemExportPlanItem[] {
  const generatedRoles = ["drums", "bass", "chords", "melody", "guitar"];
  const plans = generatedRoles
    .map((role) => {
      const ids = project.tracks.filter((track) => track.role === role && track.active !== false).map((track) => track.id);
      return ids.length ? stemItem(role, titleCase(role), ids, project) : null;
    })
    .filter(Boolean) as StemExportPlanItem[];

  const audioTracks = project.tracks.filter((track) => track.trackType === "audio" && track.role !== "master").map((track) => stemItem(`audio-${track.id}`, track.name, [track.id], project));
  const midiTracks = project.tracks.filter((track) => track.trackType === "midi").map((track) => stemItem(`midi-${track.id}`, track.name, [track.id], project));
  return [...plans, ...audioTracks, ...midiTracks];
}

export function projectWithOnlyTracksAudible(project: PocketDawProject, trackIds: string[]): PocketDawProject {
  const keep = new Set(trackIds);
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.role === "master" || track.trackType === "bus" || track.trackType === "return") return { ...track, mute: false, solo: false, active: track.active };
      return { ...track, mute: !keep.has(track.id), solo: false };
    })
  };
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
  next.exportProfiles = next.exportProfiles.map((profile) => {
    if (profile.id !== "full-song-wav") return profile;
    return {
      ...profile,
      settings: {
        ...(profile.settings || {}),
        tailSeconds: 0
      }
    };
  });
  return next;
}

export function createGameExportManifest(project: PocketDawProject, kind: GameExportManifest["kind"]): GameExportManifest {
  const stems = createStemExportPlan(project);
  const sectionLoops = createSectionLoopMetadata(project);
  const markers = project.timeline.markers.map((marker) => ({
    ...marker,
    seconds: barsToSeconds(Math.max(0, marker.bar - 1), project.project.bpm, project.project.timeSig)
  }));
  const manifestFile = gamePackManifestPath(kind);
  const fullMixFile = gamePackFullMixPath(project.project.title);
  const sourceProject = gamePackSourceProjectPath(project.project.title);
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
    files: [manifestFile, fullMixFile, ...stems.map((stem) => stem.packPath), ...sectionLoops.map((loop) => loop.packPath), sourceProject],
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
      "The source .pocketdaw JSON is included for round-trip edits."
    ]
  };
}

export async function createGamePackZipBlob(project: PocketDawProject, kind: GameExportManifest["kind"], options: GamePackZipOptions): Promise<GamePackZipResult> {
  const manifest = createGameExportManifest(project, kind);
  const entries: ZipArchiveEntry[] = [];
  const entrySummaries: Array<{ path: string; size: number }> = [];
  const pushEntry = async (path: string, data: Blob | string) => {
    const size = typeof data === "string" ? new TextEncoder().encode(data).byteLength : data.size;
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
  await pushEntry(manifest.manifestFile, JSON.stringify(manifest, null, 2));
  await options.onProgress?.("Assembling game-pack ZIP", `${entries.length} file${entries.length === 1 ? "" : "s"}`);
  return {
    manifest,
    blob: await createZipBlob(entries),
    entries: entrySummaries
  };
}

export function collectExportWarnings(project: PocketDawProject): string[] {
  const warnings: string[] = [];
  project.mediaPool.forEach((item) => {
    if (item.metadata?.missing === true || item.metadata?.unresolved === true) warnings.push(`${item.name}: media is missing or unresolved.`);
    if (item.metadata?.runtimeOnly === true) warnings.push(`${item.name}: browser runtime-only media must be re-imported in native mode before a durable pack.`);
  });
  const mutedTracks = project.tracks.filter((track) => track.mute && track.role !== "master").map((track) => track.name);
  if (mutedTracks.length) warnings.push(`Muted tracks are excluded from audible renders: ${mutedTracks.join(", ")}.`);
  if (!createSectionLoopMetadata(project).length) warnings.push("No generated sections are available for section-loop export.");
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
