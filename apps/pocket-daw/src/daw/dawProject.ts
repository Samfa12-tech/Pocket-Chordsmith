import {
  POCKET_DAW_APP,
  POCKET_DAW_SCHEMA_VERSION,
  POCKET_DAW_VERSION,
  type Clip,
  type JsonObject,
  type MetronomeSettings,
  type PocketDawProject,
  type ProjectMeta,
  type SourceRef
} from "./schema";
import { createDefaultExportProfiles } from "./exportProfiles";
import { createDefaultTracks } from "./tracks";
import { createDefaultFxState } from "./fx";
import { ensureDrumLaneMixerInPlace } from "./drumLanes";
import { sanitizePocketChordsmithProject, SECTION_IDS, type SanitizedPcsProject } from "../compatibility/pcsSanitizer";
import { DEFAULT_FX, DEFAULT_MASTER_VOLUME, DEFAULT_STEM_MIX } from "../../../../packages/pocket-audio-core/src/constants.js";
import { DEFAULT_CHORD_INSTRUMENT } from "../../../../packages/pocket-audio-core/src/sounds/instruments.js";
import { DEFAULT_GUITAR_REGISTER } from "../../../../packages/pocket-audio-core/src/sounds/guitar.js";

const STARTER_SOURCE_REF_ID = "src_pcs_starter";

export function createEmptyPocketDawProject(): PocketDawProject {
  const tracks = createDefaultTracks({ guitarActive: true });
  const starter = createStarterChordsmithSource("Untitled Project");
  const clip = createStarterGeneratedSectionClip(starter.ref.id, starter.pcs.sections.A.bars);
  const project: PocketDawProject = {
    app: POCKET_DAW_APP,
    schemaVersion: POCKET_DAW_SCHEMA_VERSION,
    dawVersion: POCKET_DAW_VERSION,
    sourceRefs: [starter.ref],
    project: {
      id: "project_001",
      title: starter.pcs.rawTitle,
      bpm: starter.pcs.bpm,
      key: starter.pcs.key,
      scale: starter.pcs.scale,
      timeSig: starter.pcs.timeSig,
      swing: starter.pcs.swing,
      resolution: starter.pcs.resolution,
      sampleRate: 44100,
      ppq: 480,
      metronome: createDefaultMetronomeSettings()
    },
    timeline: {
      bars: 8,
      cursor: { bar: 1, beat: 1, tick: 0 },
      loop: { enabled: false, startBar: 1, endBar: clip.barLength + 1 },
      markers: [
        {
          id: `marker_${clip.id}`,
          bar: clip.startBar,
          name: "Section A",
          color: clip.color,
          markerType: "section"
        }
      ],
      clips: [clip]
    },
    tracks,
    automation: { lanes: [] },
    routing: { masterTrackId: "master", buses: [], returns: [] },
    mediaPool: [],
    renderCache: [],
    fx: createDefaultFxState(tracks),
    audioDeviceSettings: createDefaultAudioDeviceSettings(),
    mixer: { masterLimiter: true, meterMode: "peak" },
    exportProfiles: createDefaultExportProfiles(),
    importHistory: []
  };
  ensureDrumLaneMixerInPlace(project);
  return project;
}

export function ensureStarterChordsmithSource(project: PocketDawProject): PocketDawProject {
  if (project.sourceRefs.some((ref) => ref.sourceType === "pocket-chordsmith")) return project;
  const hasGeneratedTrack = project.tracks.some((track) => track.trackType === "generated" && ["drums", "bass", "chords", "melody", "guitar"].includes(track.role));
  if (!hasGeneratedTrack) return project;

  const next = cloneProject(project);
  const refId = uniqueSourceRefId(next.sourceRefs, STARTER_SOURCE_REF_ID);
  const starter = createStarterChordsmithSource(next.project.title || "Untitled Project", next.project, refId);
  next.sourceRefs.push(starter.ref);
  next.project.bpm = starter.pcs.bpm;
  next.project.key = starter.pcs.key;
  next.project.scale = starter.pcs.scale;
  next.project.timeSig = starter.pcs.timeSig;
  next.project.swing = starter.pcs.swing;
  next.project.resolution = starter.pcs.resolution;

  const generatedClips = next.timeline.clips.filter((clip) => clip.type === "generated-section");
  if (generatedClips.length) {
    generatedClips.forEach((clip) => {
      clip.sourceRefId = clip.sourceRefId || refId;
      clip.sectionId = clip.sectionId || "A";
      clip.linked = clip.linked !== false;
      clip.transforms = clip.transforms || { transpose: 0, octave: 0, gain: 1, stemMutes: {} };
    });
  } else {
    const clip = createStarterGeneratedSectionClip(refId, starter.pcs.sections.A.bars, uniqueClipId(next.timeline.clips, "clip_001"));
    next.timeline.clips.push(clip);
    next.timeline.bars = Math.max(next.timeline.bars || 1, clip.startBar + clip.barLength - 1);
    next.timeline.loop = next.timeline.loop || { enabled: false, startBar: 1, endBar: clip.barLength + 1 };
    next.timeline.loop.endBar = Math.max(next.timeline.loop.endBar, clip.barLength + 1);
    if (!next.timeline.markers.some((marker) => marker.name === "Section A" && marker.bar === 1)) {
      next.timeline.markers.push({
        id: `marker_${clip.id}`,
        bar: clip.startBar,
        name: "Section A",
        color: clip.color,
        markerType: "section"
      });
    }
  }
  return next;
}

export function createDefaultAudioDeviceSettings() {
  return {
    host: "wasapi",
    inputDeviceId: null,
    outputDeviceId: null,
    sampleRate: 44100,
    bufferSize: 512,
    inputChannels: 2,
    outputChannels: 2,
    devices: [],
    notes: ["WASAPI probe first. ASIO support is reserved for a later native-audio pass."]
  };
}

export function createDefaultMetronomeSettings(): MetronomeSettings {
  return {
    enabled: false,
    countInBars: 1,
    volume: 0.55
  };
}

export function buildPocketDawProjectFile(project: PocketDawProject): string {
  return JSON.stringify({ ...project, dawVersion: POCKET_DAW_VERSION }, null, 2);
}

export function parsePocketDawProjectFile(raw: unknown): PocketDawProject {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("That .pocketdaw file is not a JSON object.");
  }
  if ((parsed as JsonObject).app !== POCKET_DAW_APP) {
    throw new Error("That file is JSON, but it is not a Pocket DAW project.");
  }
  return parsed as PocketDawProject;
}

export function cloneProject(project: PocketDawProject): PocketDawProject {
  return JSON.parse(JSON.stringify(project)) as PocketDawProject;
}

function createStarterChordsmithSource(title: string, meta: Partial<ProjectMeta> = {}, sourceRefId = STARTER_SOURCE_REF_ID): { pcs: SanitizedPcsProject; ref: SourceRef } {
  const sectionBars = Object.fromEntries(SECTION_IDS.map((id) => [id, 4]));
  const pcs = sanitizePocketChordsmithProject({
    projectVersion: 16,
    title,
    key: meta.key || "A",
    scale: meta.scale || "minor",
    timeSig: meta.timeSig || 4,
    bpm: meta.bpm || 118,
    swing: meta.swing ?? 0.04,
    resolution: meta.resolution || 4,
    chordType: "seventh",
    chordInstrument: DEFAULT_CHORD_INSTRUMENT,
    chordPlayMode: "block",
    chordRhythmMode: "sustain",
    chordOctave: 0,
    melodyPitchMode: "scale",
    masterVolume: DEFAULT_MASTER_VOLUME,
    chordVolume: DEFAULT_STEM_MIX.chords.volume,
    beatVolume: DEFAULT_STEM_MIX.drums.volume,
    leadVolume: DEFAULT_STEM_MIX.melody.volume,
    bassMode: "auto",
    guitarEnabled: true,
    guitarTone: "crunch",
    guitarRegister: DEFAULT_GUITAR_REGISTER,
    guitarStrumMode: "alternate",
    guitarVolume: DEFAULT_STEM_MIX.guitar.volume,
    fxDelay: 0.04,
    fxChorus: 0.18,
    fxFlanger: 0.06,
    fxReverb: 0.08,
    fxMix: DEFAULT_FX.mix,
    sectionBars,
    songSequence: ["A"]
  });
  const ref: SourceRef = {
    id: sourceRefId,
    sourceType: "pocket-chordsmith",
    sourcePrefix: "PCS1",
    schemaVersion: pcs.projectVersion,
    importedAt: new Date().toISOString(),
    title: pcs.rawTitle,
    original: pcs.original,
    normalized: JSON.parse(JSON.stringify(pcs)),
    notes: ["Created by Pocket DAW starter template so new projects can use the Chordsmith sequencer immediately."]
  };
  return { pcs, ref };
}

function createStarterGeneratedSectionClip(sourceRefId: string, barLength: number, id = "clip_001"): Clip {
  return {
    id,
    type: "generated-section",
    trackId: "arrangement",
    sourceRefId,
    sectionId: "A",
    startBar: 1,
    barLength,
    name: "Section A",
    muted: false,
    color: "#40d8ff",
    linked: true,
    transforms: {
      transpose: 0,
      octave: 0,
      gain: 1,
      stemMutes: {}
    },
    lane: 0,
    metadata: {
      sourceIndex: 0,
      sectionBars: barLength
    }
  };
}

function uniqueSourceRefId(sourceRefs: SourceRef[], base: string) {
  const ids = new Set(sourceRefs.map((ref) => ref.id));
  let id = base;
  let n = 2;
  while (ids.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

function uniqueClipId(clips: Clip[], base: string) {
  const ids = new Set(clips.map((clip) => clip.id));
  let id = base;
  let n = 2;
  while (ids.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}
