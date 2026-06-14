import { createDefaultExportProfiles } from "../daw/exportProfiles";
import { createDefaultTracks } from "../daw/tracks";
import { createDefaultAudioDeviceSettings, createDefaultMetronomeSettings } from "../daw/dawProject";
import { createDefaultFxState } from "../daw/fx";
import {
  POCKET_DAW_APP,
  POCKET_DAW_SCHEMA_VERSION,
  POCKET_DAW_VERSION,
  type Clip,
  type FxPluginInstance,
  type FxState,
  type PocketDawProject,
  type Track
} from "../daw/schema";
import { SECTION_IDS, type SanitizedPcsProject } from "./pcsSanitizer";

export function createDawProjectFromChordsmithProject(project: SanitizedPcsProject): PocketDawProject {
  const sourceRefId = "src_pcs_001";
  const sequence = usableSequence(project);
  let bar = 1;
  const clips: Clip[] = sequence.map((sectionId, index) => {
    const section = project.sections[sectionId];
    const clip: Clip = {
      id: `clip_${String(index + 1).padStart(3, "0")}`,
      type: "generated-section",
      trackId: "arrangement",
      sourceRefId,
      sectionId,
      startBar: bar,
      barLength: section.bars,
      name: `Section ${sectionId}`,
      muted: false,
      color: sectionColor(sectionId),
      linked: true,
      transforms: {
        transpose: 0,
        octave: 0,
        gain: 1,
        stemMutes: {}
      },
      lane: 0,
      metadata: {
        sourceIndex: index,
        sectionBars: section.bars
      }
    };
    bar += section.bars;
    return clip;
  });

  const guitarActive = project.guitarEnabled && SECTION_IDS.some((id) => project.sections[id].guitarPattern.some((v) => v !== "off"));
  const totalBars = Math.max(1, clips.reduce((max, clip) => Math.max(max, clip.startBar + clip.barLength - 1), 1));
  const tracks = createDefaultTracks({ guitarActive });
  addSourceMelodyTracks(tracks, project);
  alignTracksToChordsmithSource(tracks, project, guitarActive);
  const fx = createDefaultFxState(tracks);
  alignFxToChordsmithSource(fx, project);

  return {
    app: POCKET_DAW_APP,
    schemaVersion: POCKET_DAW_SCHEMA_VERSION,
    dawVersion: POCKET_DAW_VERSION,
    sourceRefs: [
      {
        id: sourceRefId,
        sourceType: "pocket-chordsmith",
        sourcePrefix: "PCS1",
        schemaVersion: project.projectVersion,
        importedAt: new Date().toISOString(),
        title: project.rawTitle,
        original: project.original,
        normalized: JSON.parse(JSON.stringify(project)),
        notes: ["Imported through Pocket DAW v0 compatibility sanitizer. Unknown source fields are preserved in original."]
      }
    ],
    project: {
      id: `project_${Date.now().toString(36)}`,
      title: project.rawTitle || "Imported Chordsmith Song",
      bpm: project.bpm,
      key: project.key,
      scale: project.scale,
      timeSig: project.timeSig,
      swing: project.swing,
      resolution: project.resolution,
      sampleRate: 44100,
      ppq: 480,
      metronome: createDefaultMetronomeSettings()
    },
    timeline: {
      bars: totalBars,
      cursor: { bar: 1, beat: 1, tick: 0 },
      loop: { enabled: false, startBar: 1, endBar: Math.min(totalBars + 1, 9) },
      markers: clips.map((clip) => ({
        id: `marker_${clip.id}`,
        bar: clip.startBar,
        name: clip.sectionId ? `Section ${clip.sectionId}` : clip.name,
        color: clip.color,
        markerType: "section"
      })),
      clips
    },
    tracks,
    automation: { lanes: [] },
    routing: { masterTrackId: "master", buses: [], returns: [] },
    mediaPool: [],
    renderCache: [],
    fx,
    audioDeviceSettings: createDefaultAudioDeviceSettings(),
    mixer: { masterLimiter: true, meterMode: "peak" },
    exportProfiles: createDefaultExportProfiles(),
    importHistory: [
      {
        id: "import_001",
        sourceRefId,
        importedAt: new Date().toISOString(),
        importKind: "PCS1",
        message: `Imported ${sequence.length} Chordsmith section clip${sequence.length === 1 ? "" : "s"}.`
      }
    ]
  };
}

function alignTracksToChordsmithSource(tracks: ReturnType<typeof createDefaultTracks>, project: SanitizedPcsProject, guitarActive: boolean) {
  const byRole = new Map(tracks.map((track) => [track.role, track]));
  const drums = byRole.get("drums");
  const bass = byRole.get("bass");
  const chords = byRole.get("chords");
  const guitar = byRole.get("guitar");
  const master = byRole.get("master");
  const fxReturn = byRole.get("fx-return");

  if (drums) drums.volume = project.beatVolume;
  if (bass) {
    bass.volume = project.beatVolume;
    bass.active = project.bassOn;
    bass.mute = !project.bassOn;
  }
  if (chords) {
    chords.volume = project.chordVolume;
    chords.active = project.chordsOn;
    chords.mute = !project.chordsOn;
  }
  tracks.filter((track) => track.role === "melody").forEach((track) => {
    const melodyIndex = melodyTrackIndex(track);
    track.volume = project.leadVolume;
    track.pan = firstMelodyPan(project, melodyIndex);
    track.mute = melodyLaneMutedInSequence(project, melodyIndex);
    track.active = true;
    track.metadata = {
      ...(track.metadata || {}),
      chordsmithMelodyTrackIndex: melodyIndex,
      chordsmithInstrument: firstMelodyInstrument(project, melodyIndex)
    };
  });
  if (guitar) {
    guitar.volume = project.guitarVolume;
    guitar.active = guitarActive;
    guitar.mute = !guitarActive;
  }
  if (master) master.volume = project.masterVolume;
  if (fxReturn) fxReturn.pan = 0;

  tracks.forEach((track) => {
    if (["drums", "bass", "chords", "guitar"].includes(track.role)) track.pan = 0;
  });
}

function alignFxToChordsmithSource(fx: FxState, project: SanitizedPcsProject) {
  const synthSlots = chordsmithSynthFxSlots(project);
  if (!synthSlots.length) return;
  fx.chains.filter((chain) => chain.ownerTrackId === "chords" || chain.ownerTrackId?.startsWith("melody")).forEach((chain) => {
    chain.slots = synthSlots.map((slot) => ({ ...slot, id: `${slot.id}_${chain.ownerTrackId || chain.id}` }));
  });
}

function addSourceMelodyTracks(tracks: Track[], project: SanitizedPcsProject) {
  const count = sourceMelodyTrackCount(project);
  const first = tracks.find((track) => track.id === "melody");
  if (first) {
    first.name = melodyTrackName(project, 0);
    first.metadata = { ...(first.metadata || {}), chordsmithMelodyTrackIndex: 0 };
  }
  const insertAt = tracks.findIndex((track) => track.id === "guitar");
  for (let index = 1; index < count; index += 1) {
    const id = `melody-${index + 1}`;
    if (tracks.some((track) => track.id === id)) continue;
    const track: Track = {
      id,
      name: melodyTrackName(project, index),
      trackType: "generated",
      role: "melody",
      volume: project.leadVolume,
      pan: firstMelodyPan(project, index),
      mute: melodyLaneMutedInSequence(project, index),
      solo: false,
      armed: false,
      colour: melodyColour(index),
      routing: { inputIds: [], outputId: "master", sendIds: ["fx-return"] },
      automationLaneIds: [],
      fxChainId: `fx_${id}`,
      recordKind: "none",
      inputDeviceId: null,
      active: true,
      metadata: {
        chordsmithMelodyTrackIndex: index,
        chordsmithInstrument: firstMelodyInstrument(project, index)
      }
    };
    if (insertAt >= 0) tracks.splice(insertAt + index - 1, 0, track);
    else tracks.push(track);
  }
}

function sourceMelodyTrackCount(project: SanitizedPcsProject) {
  return Math.max(1, ...SECTION_IDS.map((id) => project.sections[id]?.melodyTracks.length || 0));
}

function melodyTrackIndex(track: Track) {
  const value = track.metadata?.chordsmithMelodyTrackIndex;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : track.id === "melody" ? 0 : Math.max(0, Number(track.id.match(/-(\d+)$/)?.[1] || 1) - 1);
}

function firstMelodyInstrument(project: SanitizedPcsProject, index: number) {
  for (const sectionId of usableSequence(project)) {
    const instrument = project.sections[sectionId]?.melodyInstruments[index];
    if (instrument) return instrument;
  }
  for (const id of SECTION_IDS) {
    const instrument = project.sections[id]?.melodyInstruments[index];
    if (instrument) return instrument;
  }
  return "synth";
}

function firstMelodyPan(project: SanitizedPcsProject, index: number) {
  for (const sectionId of usableSequence(project)) {
    const pan = project.sections[sectionId]?.melodyPan[index];
    if (typeof pan === "number") return pan;
  }
  return 0;
}

function melodyLaneMutedInSequence(project: SanitizedPcsProject, index: number) {
  const sections = usableSequence(project).map((id) => project.sections[id]).filter(Boolean);
  if (!sections.length) return false;
  return sections.every((section) => section.melodyMute[index] === true || !section.melodyTracks[index]?.some((note) => note !== null && note !== undefined));
}

function melodyTrackName(project: SanitizedPcsProject, index: number) {
  const label = index === 0 ? "Melody 1" : `Melody ${index + 1}`;
  const instrument = firstMelodyInstrument(project, index).replace(/_/g, " ");
  return `${label} - ${titleCase(instrument)}`;
}

function melodyColour(index: number) {
  return ["#ff68c8", "#ff7aa8", "#ff8f5c", "#ffd166", "#5cf1d6", "#8aa0ff", "#b88cff", "#7cff9b"][index % 8];
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function chordsmithSynthFxSlots(project: SanitizedPcsProject): FxPluginInstance[] {
  const slots: FxPluginInstance[] = [];
  const wetScale = project.fxMix * 1.45;
  const delayMix = clamp(project.fxDelay * 0.95 * wetScale, 0, 1);
  const chorusMix = clamp(project.fxChorus * 0.95 * wetScale, 0, 1);
  const reverbMix = clamp(project.fxReverb * 1.05 * wetScale, 0, 1);

  if (delayMix > 0.01) {
    slots.push({
      id: "pcs_delay",
      type: "delay",
      name: "Chordsmith Delay",
      enabled: true,
      presetId: "pocket-chordsmith",
      parameters: {
        time: 0.1 + project.fxDelay * 0.42,
        feedback: 0.05 + project.fxDelay * 0.72,
        mix: delayMix
      }
    });
  }
  if (chorusMix > 0.01 || project.fxFlanger > 0.01) {
    slots.push({
      id: "pcs_chorus",
      type: "chorus",
      name: "Chordsmith Mod",
      enabled: true,
      presetId: "pocket-chordsmith",
      parameters: {
        rate: 0.25 + project.fxChorus * 1.9 + project.fxFlanger * 0.55,
        depth: 0.0014 + project.fxChorus * 0.03 + project.fxFlanger * 0.0062,
        mix: clamp(chorusMix + project.fxFlanger * 0.35 * wetScale, 0, 1)
      }
    });
  }
  if (reverbMix > 0.01) {
    slots.push({
      id: "pcs_reverb",
      type: "reverb",
      name: "Chordsmith Reverb",
      enabled: true,
      presetId: "pocket-chordsmith",
      parameters: {
        decay: 1.6,
        mix: reverbMix
      }
    });
  }
  return slots;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function usableSequence(project: SanitizedPcsProject) {
  const sequence = project.songSequence.filter((id) => project.sections[id]);
  if (sequence.length) return sequence;
  const active = SECTION_IDS.filter((id) => project.sections[id]?.active);
  return active.length ? active : ["A" as const];
}

function sectionColor(sectionId: string): string {
  const colors: Record<string, string> = {
    A: "#40d8ff",
    B: "#7cff9b",
    C: "#b88cff",
    D: "#ff68c8",
    E: "#ffc857",
    F: "#5cf1d6",
    G: "#ff7a7a",
    H: "#9db2ff"
  };
  return colors[sectionId] || "#40d8ff";
}
