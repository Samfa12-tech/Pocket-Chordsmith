import type { PocketDawProject, Track, TrackRole } from "./schema";
import { cloneProject } from "./dawProject";
import { createEmptyFxChain } from "./fx";
import { DEFAULT_MASTER_VOLUME, DEFAULT_STEM_MIX } from "../../../../packages/pocket-audio-core/src/constants.js";

const TRACK_DEFS: Array<{ id: string; name: string; role: TrackRole; colour: string; volume: number; pan: number }> = [
  { id: "drums", name: "Drums", role: "drums", colour: "#40d8ff", volume: DEFAULT_STEM_MIX.drums.volume, pan: DEFAULT_STEM_MIX.drums.pan },
  { id: "bass", name: "Bass", role: "bass", colour: "#7cff9b", volume: DEFAULT_STEM_MIX.bass.volume, pan: DEFAULT_STEM_MIX.bass.pan },
  { id: "chords", name: "Chords", role: "chords", colour: "#b88cff", volume: DEFAULT_STEM_MIX.chords.volume, pan: DEFAULT_STEM_MIX.chords.pan },
  { id: "melody", name: "Melody", role: "melody", colour: "#ff68c8", volume: DEFAULT_STEM_MIX.melody.volume, pan: DEFAULT_STEM_MIX.melody.pan },
  { id: "guitar", name: "Guitar", role: "guitar", colour: "#ffc857", volume: DEFAULT_STEM_MIX.guitar.volume, pan: DEFAULT_STEM_MIX.guitar.pan },
  { id: "fx-return", name: "FX Return", role: "fx-return", colour: "#8aa0ff", volume: 0.55, pan: 0 },
  { id: "master", name: "Master", role: "master", colour: "#ffffff", volume: DEFAULT_MASTER_VOLUME, pan: 0 }
];

export function createDefaultTracks(options: { guitarActive?: boolean } = {}): Track[] {
  return TRACK_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    trackType: def.role === "fx-return" ? "return" : def.role === "master" ? "master" : "generated",
    role: def.role,
    volume: def.volume,
    pan: def.pan,
    mute: def.role === "guitar" && options.guitarActive === false,
    solo: false,
    armed: false,
    colour: def.colour,
    active: def.role === "guitar" ? options.guitarActive !== false : true,
    routing: {
      inputIds: [],
      outputId: def.role === "master" ? null : "master",
      sendIds: def.role === "master" ? [] : ["fx-return"]
    },
    automationLaneIds: [],
    fxChainId: `fx_${def.id}`,
    recordKind: "none",
    inputDeviceId: null,
    monitorEnabled: false,
    recordingChannelMode: "mono"
  }));
}

export function trackIsAudible(track: Track, allTracks: Track[]): boolean {
  const anySolo = allTracks.some((t) => t.solo && t.role !== "master" && t.role !== "fx-return");
  if (track.mute || track.active === false) return false;
  if (anySolo && !track.solo && track.role !== "master" && track.role !== "fx-return") return false;
  return true;
}

export function renameTrack(project: PocketDawProject, trackId: string, name: string): PocketDawProject {
  const cleaned = cleanTrackName(name);
  if (!cleaned) return project;
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (!track || track.name === cleaned) return project;
  track.name = cleaned;
  const chain = next.fx?.chains.find((item) => item.ownerTrackId === trackId || item.id === track.fxChainId);
  if (chain) chain.name = `${cleaned} FX`;
  return next;
}

export type AddTrackKind = "live-vocals" | "live-instrument" | "midi-instrument" | "chordsmith-drums" | "chordsmith-bass" | "chordsmith-chords" | "chordsmith-melody" | "chordsmith-guitar";

export function addTrackToProject(project: PocketDawProject, kind: AddTrackKind): { project: PocketDawProject; trackId: string } {
  const generatedRole = kind.replace("chordsmith-", "") as TrackRole;
  if (kind.startsWith("chordsmith-")) {
    const next = cloneProject(project);
    const existing = next.tracks.find((track) => track.role === generatedRole);
    if (existing) {
      existing.active = true;
      existing.mute = false;
      return { project: next, trackId: existing.id };
    }
    const id = uniqueTrackId(next, generatedRole);
    const track = makeTrack(id, titleCase(generatedRole), "generated", generatedRole, "#40d8ff", "none");
    insertBeforeMaster(next, track);
    return { project: withFxChain(next, track), trackId: id };
  }
  if (kind === "midi-instrument") {
    const id = uniqueTrackId(project, "midi");
    const track = makeTrack(id, "MIDI Instrument", "midi", "media", "#b88cff", "none");
    const next = cloneProject(project);
    insertBeforeMaster(next, track);
    return { project: withFxChain(next, track), trackId: id };
  }
  const role: TrackRole = "media";
  const base = kind === "live-vocals" ? "Live Vocals" : "Live Instrument";
  const id = uniqueTrackId(project, kind);
  const recordKind = kind as "live-vocals" | "live-instrument";
  const track = makeTrack(id, base, "audio", role, kind === "live-vocals" ? "#ff7aa8" : "#7dd3ff", recordKind);
  const next = cloneProject(project);
  insertBeforeMaster(next, track);
  return { project: withFxChain(next, track), trackId: id };
}

function makeTrack(id: string, name: string, trackType: Track["trackType"], role: TrackRole, colour: string, recordKind: Track["recordKind"]): Track {
  return {
    id,
    name,
    trackType,
    role,
    volume: 0.82,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    colour,
    routing: { inputIds: [], outputId: "master", sendIds: ["fx-return"] },
    automationLaneIds: [],
    fxChainId: `fx_${id}`,
    recordKind,
    inputDeviceId: null,
    monitorEnabled: false,
    recordingChannelMode: "mono",
    active: true
  };
}

function insertBeforeMaster(project: PocketDawProject, track: Track) {
  const masterIndex = project.tracks.findIndex((item) => item.role === "master");
  if (masterIndex === -1) project.tracks.push(track);
  else project.tracks.splice(masterIndex, 0, track);
}

function withFxChain(project: PocketDawProject, track: Track) {
  project.fx = project.fx || { chains: [] };
  if (!project.fx.chains.some((chain) => chain.id === track.fxChainId)) {
    project.fx.chains.push(createEmptyFxChain(track.id, `${track.name} FX`));
  }
  return project;
}

function uniqueTrackId(project: PocketDawProject, base: string) {
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let id = safe;
  let n = 2;
  while (project.tracks.some((track) => track.id === id)) {
    id = `${safe}-${n}`;
    n += 1;
  }
  return id;
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function cleanTrackName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 64);
}
