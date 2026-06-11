import {
  POCKET_DAW_APP,
  POCKET_DAW_SCHEMA_VERSION,
  POCKET_DAW_VERSION,
  type JsonObject,
  type PocketDawProject
} from "./schema";
import { createDefaultExportProfiles } from "./exportProfiles";
import { createDefaultTracks } from "./tracks";
import { createDefaultFxState } from "./fx";

export function createEmptyPocketDawProject(): PocketDawProject {
  const tracks = createDefaultTracks();
  return {
    app: POCKET_DAW_APP,
    schemaVersion: POCKET_DAW_SCHEMA_VERSION,
    dawVersion: POCKET_DAW_VERSION,
    sourceRefs: [],
    project: {
      id: "project_001",
      title: "Imported Chordsmith Song",
      bpm: 118,
      key: "A",
      scale: "minor",
      timeSig: 4,
      swing: 0.04,
      resolution: 4,
      sampleRate: 44100,
      ppq: 480
    },
    timeline: {
      bars: 32,
      cursor: { bar: 1, beat: 1, tick: 0 },
      loop: { enabled: false, startBar: 1, endBar: 9 },
      markers: [],
      clips: []
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

export function buildPocketDawProjectFile(project: PocketDawProject): string {
  return JSON.stringify(project, null, 2);
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
