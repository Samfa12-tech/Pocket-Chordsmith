import type { PocketDawProject, Track, TimelineMarker } from "./schema";
import { barsToSeconds } from "./timeline";

export interface StemExportPlanItem {
  id: string;
  label: string;
  trackIds: string[];
  fileName: string;
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
        fileName: `${safeName(project.project.title)}-${safeName(name)}-loop.wav`
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
  const manifestFile = kind === "godot-adaptive-pack" ? "godot-adaptive-manifest.json" : "web-game-manifest.json";
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
    files: [manifestFile, ...stems.map((stem) => stem.fileName), ...sectionLoops.map((loop) => loop.fileName)],
    notes: [
      "Manifest preview only: push-to-Godot and browser zip packaging are future work.",
      "Stem and loop file names describe the intended export set for this project."
    ]
  };
}

function stemItem(id: string, label: string, trackIds: string[], project: PocketDawProject): StemExportPlanItem {
  return {
    id,
    label,
    trackIds,
    fileName: `${safeName(project.project.title)}-${safeName(label)}-stem.wav`
  };
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pocket-daw";
}
