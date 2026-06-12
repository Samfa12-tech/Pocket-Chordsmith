import type { PocketDawProject, Track, TimelineMarker } from "./schema";
import { barsToSeconds } from "./timeline";

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
  status: "planned-render";
}

export interface GameExportManifest {
  kind: "godot-adaptive-pack" | "web-game-pack";
  projectTitle: string;
  bpm: number;
  key: string;
  scale: string;
  timeSig: number;
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

export function createSectionLoopMetadata(project: PocketDawProject): SectionLoopExportItem[] {
  return project.timeline.clips
    .filter((clip) => clip.type === "generated-section" && clip.sectionId)
    .map((clip) => {
      const lengthBars = Math.max(0.25, clip.barLength);
      const name = `Section ${clip.sectionId}`;
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
        fileName: `${safeName(project.project.title)}-${safeName(name)}-loop.wav`,
        packPath: `audio/sections/${safeName(project.project.title)}-${safeName(name)}-loop.wav`,
        status: "planned-render"
      };
    });
}

export function createGameExportManifest(project: PocketDawProject, kind: GameExportManifest["kind"]): GameExportManifest {
  const stems = createStemExportPlan(project);
  const sectionLoops = createSectionLoopMetadata(project);
  const markers = project.timeline.markers.map((marker) => ({
    ...marker,
    seconds: barsToSeconds(Math.max(0, marker.bar - 1), project.project.bpm, project.project.timeSig)
  }));
  const manifestFile = kind === "godot-adaptive-pack" ? "manifests/godot-adaptive-manifest.json" : "manifests/web-game-manifest.json";
  const fullMixFile = `audio/full/${safeName(project.project.title)}-full-mix.wav`;
  const warnings = collectExportWarnings(project);
  return {
    kind,
    projectTitle: project.project.title,
    bpm: project.project.bpm,
    key: project.project.key,
    scale: project.project.scale,
    timeSig: project.project.timeSig,
    stems,
    sectionLoops,
    markers,
    files: [manifestFile, fullMixFile, ...stems.map((stem) => stem.packPath), ...sectionLoops.map((loop) => loop.packPath)],
    folders: {
      full: "audio/full/",
      stems: "audio/stems/",
      sections: "audio/sections/",
      manifests: "manifests/",
      source: "source/"
    },
    warnings,
    notes: [
      "Full mix and stem WAVs are renderable today through browser/native downloads.",
      "Section loop and bundled ZIP assembly are planned-render paths until the section-only render writer lands.",
      "Manifest paths use the target pack folder layout so exported files can be collected deterministically."
    ]
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
  const fileName = `${safeName(project.project.title)}-${safeName(label)}-stem.wav`;
  return {
    id,
    label,
    trackIds,
    fileName,
    packPath: `audio/stems/${fileName}`
  };
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pocket-daw";
}
