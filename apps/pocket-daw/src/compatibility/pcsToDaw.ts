import { createDefaultExportProfiles } from "../daw/exportProfiles";
import { createDefaultTracks } from "../daw/tracks";
import { createDefaultAudioDeviceSettings, createDefaultMetronomeSettings } from "../daw/dawProject";
import { createDefaultFxState } from "../daw/fx";
import { ensureDrumLaneMixerInPlace } from "../daw/drumLanes";
import { chordsmithDawSynthFxSlots } from "../../../../packages/pocket-audio-core/src/fx/chordsmith-fx.js";
import { POCKET_PRO_EQ_TYPE, pocketProEqPresetParameters } from "../../../../packages/pocket-audio-core/src/fx/pro-eq.js";
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
  applyLofiTrackEq(fx, project);
  applyLofiTrackPresets(tracks, project);
  applyLofiMasterChain(fx, project);

  const daw: PocketDawProject = {
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
        notes: [
          "Imported through Pocket DAW v0 compatibility sanitizer. Unknown source fields are preserved in original.",
          ...(isLofiProject(project) ? [`Lofi profile detected: ${lofiPresetLabel(project)}. Track presets, editable Pocket Pro EQ curves and a gentle lofi master chain were applied.`] : [])
        ]
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
  ensureDrumLaneMixerInPlace(daw);
  return daw;
}

function alignTracksToChordsmithSource(tracks: ReturnType<typeof createDefaultTracks>, project: SanitizedPcsProject, guitarActive: boolean) {
  const byRole = new Map(tracks.map((track) => [track.role, track]));
  const drums = byRole.get("drums");
  const bass = byRole.get("bass");
  const chords = byRole.get("chords");
  const guitar = byRole.get("guitar");
  const master = byRole.get("master");
  const fxReturn = byRole.get("fx-return");

  const sourceSoundMetadata = {
    audioProfile: project.audioProfile,
    lofiPreset: project.lofiPreset
  };
  if (drums) {
    drums.volume = project.beatVolume;
    drums.metadata = {
      ...(drums.metadata || {}),
      ...sourceSoundMetadata,
      drumKit: project.drumKit,
      drumGroovePreset: project.drumGroovePreset
    };
  }
  if (bass) {
    bass.volume = project.beatVolume;
    bass.active = project.bassOn;
    bass.mute = !project.bassOn;
    bass.metadata = {
      ...(bass.metadata || {}),
      ...sourceSoundMetadata,
      bassTone: project.bassTone
    };
  }
  if (chords) {
    chords.volume = project.chordVolume;
    chords.active = project.chordsOn;
    chords.mute = !project.chordsOn;
    chords.metadata = {
      ...(chords.metadata || {}),
      ...sourceSoundMetadata,
      chordsmithInstrument: project.chordInstrument
    };
  }
  tracks.filter((track) => track.role === "melody").forEach((track) => {
    const melodyIndex = melodyTrackIndex(track);
    track.volume = project.leadVolume;
    track.pan = firstMelodyPan(project, melodyIndex);
    track.mute = melodyLaneMutedInSequence(project, melodyIndex);
    track.active = true;
    track.metadata = {
      ...(track.metadata || {}),
      ...sourceSoundMetadata,
      chordsmithMelodyTrackIndex: melodyIndex,
      chordsmithInstrument: firstMelodyInstrument(project, melodyIndex)
    };
  });
  if (guitar) {
    guitar.volume = project.guitarVolume;
    guitar.active = guitarActive;
    guitar.mute = !guitarActive;
    guitar.metadata = {
      ...(guitar.metadata || {}),
      ...sourceSoundMetadata,
      chordsmithInstrument: project.guitarTone
    };
  }
  if (master) master.volume = project.masterVolume;
  if (fxReturn) fxReturn.pan = 0;

  tracks.forEach((track) => {
    if (["drums", "bass", "chords", "guitar"].includes(track.role)) track.pan = 0;
  });
}

function isLofiProject(project: SanitizedPcsProject) {
  return project.audioProfile === "lofi_chill" || Boolean(project.lofiPreset);
}

function lofiPresetLabel(project: SanitizedPcsProject) {
  return (project.lofiPreset || "lofi_chill")
    .replace(/^lofi_/, "")
    .split("_")
    .map((part) => titleCase(part))
    .join(" ");
}

function applyLofiTrackPresets(tracks: Track[], project: SanitizedPcsProject) {
  if (!isLofiProject(project)) return;
  tracks.forEach((track) => {
    track.metadata = {
      ...(track.metadata || {}),
      audioProfile: "lofi_chill",
      lofiPreset: project.lofiPreset || "lofi_chill"
    };
    if (track.role === "drums") {
      track.name = "Lofi Drums";
      track.metadata = { ...(track.metadata || {}), drumKit: project.drumKit, drumGroovePreset: project.drumGroovePreset };
    }
    if (track.role === "bass") {
      track.name = project.bassTone === "soft_upright" ? "Soft Upright Bass" : project.bassTone === "rounded_triangle_bass" ? "Rounded Triangle Bass" : "Warm Sub Bass";
      track.metadata = { ...(track.metadata || {}), bassTone: project.bassTone };
    }
    if (track.role === "chords") {
      track.name = `${titleCase(project.chordInstrument.replace(/_/g, " "))} Chords`;
      track.metadata = { ...(track.metadata || {}), chordsmithInstrument: project.chordInstrument };
    }
    if (track.role === "fx-return") {
      track.name = "Lofi Space";
      track.volume = Math.max(track.volume, 0.58);
    }
    if (track.role === "master") {
      track.name = "Lofi Master";
    }
  });
}

function applyLofiMasterChain(fx: FxState, project: SanitizedPcsProject) {
  if (!isLofiProject(project)) return;
  const master = fx.chains.find((chain) => chain.ownerTrackId === "master" || chain.id === "fx_master");
  if (!master) return;
  const texture = project.lofiTexture || {};
  const warmth = typeof texture.warmth === "number" ? texture.warmth : 0.16;
  const age = typeof texture.lowPassAge === "number" ? texture.lowPassAge : 0.22;
  const bit = typeof texture.bitCrush === "number" ? texture.bitCrush : 0.01;
  master.slots = [
    ...master.slots,
    pocketProEqSlot("lofi_pro_eq_master", "Lofi Master EQ", "lofi-soft-rolloff"),
    {
      id: "lofi_lowpass_master",
      type: "low-pass",
      name: "Lofi Age Low Pass",
      enabled: true,
      presetId: "lofi-master",
      parameters: { frequency: Math.round(10500 - age * 5200), q: 0.62 }
    },
    {
      id: "lofi_saturation_master",
      type: "saturation",
      name: "Lofi Warmth",
      enabled: true,
      presetId: "lofi-master",
      parameters: { drive: 1.1 + warmth * 1.6, mix: 0.18 + warmth * 0.28 }
    },
    {
      id: "lofi_glue_master",
      type: "compressor",
      name: "Lofi Glue",
      enabled: true,
      presetId: "lofi-master",
      parameters: { threshold: -18, ratio: 2.2, attack: 0.01, release: 0.18 }
    },
    {
      id: "lofi_limiter_master",
      type: "limiter",
      name: "Lofi Safety Limiter",
      enabled: true,
      presetId: "lofi-master",
      parameters: { threshold: -5.5, ratio: 12, attack: 0.003, release: 0.1 }
    },
    ...(bit > 0.03
      ? [{
          id: "lofi_bit_colour_master",
          type: "bitcrusher",
          name: "Mild Sample Colour",
          enabled: true,
          presetId: "lofi-master",
          parameters: { bits: 10, mix: Math.min(0.18, bit * 0.55) }
        } satisfies FxPluginInstance]
      : [])
  ];
}

function applyLofiTrackEq(fx: FxState, project: SanitizedPcsProject) {
  if (!isLofiProject(project)) return;
  const presetForRole = new Map([
    ["drums", ["lofi_drum_eq", "Lofi Drum EQ", "lofi-drum-softener"]],
    ["bass", ["lofi_bass_eq", "Warm Bass EQ", "warm-bass-pocket"]],
    ["chords", ["lofi_chord_eq", "Soft Chord EQ", "soft-chord-bed"]],
    ["guitar", ["lofi_guitar_eq", "Gentle Guitar EQ", "soft-chord-bed"]]
  ]);
  fx.chains.forEach((chain) => {
    const owner = chain.ownerTrackId || "";
    const melody = owner === "melody" || owner.startsWith("melody-");
    const preset = melody ? ["lofi_melody_eq", "Gentle Lead EQ", "gentle-lead-presence"] : presetForRole.get(owner);
    if (!preset || chain.slots.some((slot) => slot.type === POCKET_PRO_EQ_TYPE && slot.presetId === preset[2])) return;
    const [id, name, presetId] = preset;
    chain.slots = [pocketProEqSlot(`${id}_${owner || chain.id}`, name, presetId), ...chain.slots];
  });
}

function pocketProEqSlot(id: string, name: string, presetId: string): FxPluginInstance {
  return {
    id,
    type: POCKET_PRO_EQ_TYPE,
    name,
    enabled: true,
    presetId,
    parameters: pocketProEqPresetParameters(presetId)
  };
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
  return chordsmithDawSynthFxSlots({
    delay: project.fxDelay,
    chorus: project.fxChorus,
    flanger: project.fxFlanger,
    reverb: project.fxReverb,
    mix: project.fxMix
  }) as FxPluginInstance[];
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
