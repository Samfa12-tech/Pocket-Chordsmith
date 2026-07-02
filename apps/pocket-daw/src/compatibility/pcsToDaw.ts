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
  applyChipTrackEq(fx, project);
  applyChipTrackPresets(tracks, project);
  applyChipMasterChain(fx, project);
  applyMetalTrackEq(fx, project);
  applyMetalTrackPresets(tracks, project);
  applyMetalMasterChain(fx, project);

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
          ...(isLofiProject(project) ? [`Lofi profile detected: ${lofiPresetLabel(project)}. Track presets, editable Pocket Pro EQ curves and a gentle lofi master chain were applied.`] : []),
          ...(isChipProject(project) ? [`Chip tune profile detected: ${chipPresetLabel(project)}. Chip track presets, punch EQ curves and a compact master chain were applied.`] : []),
          ...(isMetalProject(project) ? [`Heavy metal profile detected: ${metalPresetLabel(project)}. Tight drum/bass/guitar metadata, presence EQ curves and a controlled metal master chain were applied.`] : [])
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
    lofiPreset: project.lofiPreset,
    chipPreset: project.chipPreset,
    metalPreset: project.metalPreset
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

function isChipProject(project: SanitizedPcsProject) {
  return project.audioProfile === "chip_tune" || Boolean(project.chipPreset);
}

function isMetalProject(project: SanitizedPcsProject) {
  return project.audioProfile === "heavy_metal" || Boolean(project.metalPreset);
}

function lofiPresetLabel(project: SanitizedPcsProject) {
  return (project.lofiPreset || "lofi_chill")
    .replace(/^lofi_/, "")
    .split("_")
    .map((part) => titleCase(part))
    .join(" ");
}

function chipPresetLabel(project: SanitizedPcsProject) {
  return (project.chipPreset || "chip_tune")
    .replace(/^chip_/, "")
    .split("_")
    .map((part) => titleCase(part))
    .join(" ");
}

function metalPresetLabel(project: SanitizedPcsProject) {
  return (project.metalPreset || "heavy_metal")
    .replace(/^metal_/, "")
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

function applyChipTrackPresets(tracks: Track[], project: SanitizedPcsProject) {
  if (!isChipProject(project)) return;
  tracks.forEach((track) => {
    track.metadata = {
      ...(track.metadata || {}),
      audioProfile: "chip_tune",
      chipPreset: project.chipPreset || "chip_tune"
    };
    if (track.role === "drums") {
      track.name = "Chip Drums";
      track.metadata = { ...(track.metadata || {}), drumKit: project.drumKit, drumGroovePreset: project.drumGroovePreset };
    }
    if (track.role === "bass") {
      track.name = project.bassTone === "modern_chip_sub" ? "Modern Chip Sub" : project.bassTone === "bitcrush_bass" ? "Bitcrush Bass" : "Chip Bass";
      track.metadata = { ...(track.metadata || {}), bassTone: project.bassTone };
    }
    if (track.role === "chords") {
      track.name = `${titleCase(project.chordInstrument.replace(/_/g, " "))} Chords`;
      track.metadata = { ...(track.metadata || {}), chordsmithInstrument: project.chordInstrument };
    }
    if (track.role === "fx-return") {
      track.name = "Chip Delay";
      track.volume = Math.max(track.volume, 0.52);
    }
    if (track.role === "master") {
      track.name = "Chip Master";
    }
  });
}

function applyMetalTrackPresets(tracks: Track[], project: SanitizedPcsProject) {
  if (!isMetalProject(project)) return;
  tracks.forEach((track) => {
    track.metadata = {
      ...(track.metadata || {}),
      audioProfile: "heavy_metal",
      metalPreset: project.metalPreset || "heavy_metal"
    };
    if (track.role === "drums") {
      track.name = project.drumKit === "metal_doom" ? "Doom Drums" : project.drumKit === "metal_arena" ? "Arena Metal Drums" : "Tight Metal Drums";
      track.metadata = { ...(track.metadata || {}), drumKit: project.drumKit, drumGroovePreset: project.drumGroovePreset };
    }
    if (track.role === "bass") {
      track.name = project.bassTone === "metal_grind_bass" ? "Grind Bass" : project.bassTone === "metal_sub_pick" ? "Sub Pick Bass" : "Pick Bass";
      track.metadata = { ...(track.metadata || {}), bassTone: project.bassTone };
    }
    if (track.role === "chords") {
      track.name = `${titleCase(project.chordInstrument.replace(/_/g, " "))} Chugs`;
      track.metadata = { ...(track.metadata || {}), chordsmithInstrument: project.chordInstrument };
    }
    if (track.role === "guitar") {
      track.name = `${titleCase(project.guitarTone.replace(/_/g, " "))} Guitar`;
      track.metadata = { ...(track.metadata || {}), chordsmithInstrument: project.guitarTone, guitarPatternPreset: project.guitarPatternPreset };
    }
    if (track.role === "fx-return") {
      track.name = "Metal Room";
      track.volume = Math.max(track.volume, 0.46);
    }
    if (track.role === "master") {
      track.name = "Metal Master";
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

function applyChipMasterChain(fx: FxState, project: SanitizedPcsProject) {
  if (!isChipProject(project)) return;
  const master = fx.chains.find((chain) => chain.ownerTrackId === "master" || chain.id === "fx_master");
  if (!master) return;
  const texture = project.chipTexture || {};
  const saturation = typeof texture.saturation === "number" ? texture.saturation : 0.18;
  const crush = typeof texture.sampleRateCrush === "number" ? texture.sampleRateCrush : 0.14;
  master.slots = [
    ...master.slots,
    pocketProEqSlot("chip_pro_eq_master", "Chip Master EQ", "gentle-lead-presence"),
    {
      id: "chip_saturation_master",
      type: "saturation",
      name: "Chip Drive",
      enabled: true,
      presetId: "chip-master",
      parameters: { drive: 1.2 + saturation * 2.2, mix: 0.16 + saturation * 0.28 }
    },
    ...(crush > 0.08
      ? [{
          id: "chip_crush_master",
          type: "bitcrusher",
          name: "Chip Texture",
          enabled: true,
          presetId: "chip-master",
          parameters: { bits: 9, mix: Math.min(0.22, crush * 0.75) }
        } satisfies FxPluginInstance]
      : []),
    {
      id: "chip_glue_master",
      type: "compressor",
      name: "Chip Glue",
      enabled: true,
      presetId: "chip-master",
      parameters: { threshold: -17, ratio: 2.8, attack: 0.006, release: 0.12 }
    },
    {
      id: "chip_limiter_master",
      type: "limiter",
      name: "Chip Safety Limiter",
      enabled: true,
      presetId: "chip-master",
      parameters: { threshold: -5, ratio: 14, attack: 0.002, release: 0.08 }
    }
  ];
}

function applyMetalMasterChain(fx: FxState, project: SanitizedPcsProject) {
  if (!isMetalProject(project)) return;
  const master = fx.chains.find((chain) => chain.ownerTrackId === "master" || chain.id === "fx_master");
  if (!master) return;
  const texture = project.metalTexture || {};
  const drive = typeof texture.drive === "number" ? texture.drive : 0.45;
  const tightness = typeof texture.lowTightness === "number" ? texture.lowTightness : 0.8;
  const presence = typeof texture.presence === "number" ? texture.presence : 0.58;
  master.slots = [
    ...master.slots,
    pocketProEqSlot("metal_pro_eq_master", "Metal Master EQ", "gentle-lead-presence"),
    {
      id: "metal_tight_low_master",
      type: "parametric-eq",
      name: "Tight Low Control",
      enabled: true,
      presetId: "metal-master",
      parameters: { lowShelfFrequency: 95, lowShelfGain: -1.5 + tightness * 1.2, lowMidFrequency: 260, lowMidGain: -1.8 * tightness, highMidFrequency: 2600, highMidGain: presence * 1.4, highShelfFrequency: 6200, highShelfGain: presence * 0.9 }
    },
    {
      id: "metal_saturation_master",
      type: "saturation",
      name: "Controlled Amp Weight",
      enabled: true,
      presetId: "metal-master",
      parameters: { drive: 1.1 + drive * 1.4, mix: 0.12 + drive * 0.18 }
    },
    {
      id: "metal_glue_master",
      type: "compressor",
      name: "Metal Glue",
      enabled: true,
      presetId: "metal-master",
      parameters: { threshold: -16, ratio: 3.4, attack: 0.004, release: 0.09 }
    },
    {
      id: "metal_limiter_master",
      type: "limiter",
      name: "Metal Safety Limiter",
      enabled: true,
      presetId: "metal-master",
      parameters: { threshold: -4.8, ratio: 14, attack: 0.002, release: 0.08 }
    }
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

function applyChipTrackEq(fx: FxState, project: SanitizedPcsProject) {
  if (!isChipProject(project)) return;
  const presetForRole = new Map([
    ["drums", ["chip_drum_eq", "Chip Drum EQ", "drum-punch"]],
    ["bass", ["chip_bass_eq", "Chip Bass EQ", "warm-bass-pocket"]],
    ["chords", ["chip_chord_eq", "Chip Chord EQ", "soft-chord-bed"]],
    ["guitar", ["chip_guitar_eq", "Chip Guitar EQ", "gentle-lead-presence"]]
  ]);
  fx.chains.forEach((chain) => {
    const owner = chain.ownerTrackId || "";
    const melody = owner === "melody" || owner.startsWith("melody-");
    const preset = melody ? ["chip_melody_eq", "Chip Lead EQ", "gentle-lead-presence"] : presetForRole.get(owner);
    if (!preset || chain.slots.some((slot) => slot.type === POCKET_PRO_EQ_TYPE && slot.presetId === preset[2])) return;
    const [id, name, presetId] = preset;
    chain.slots = [pocketProEqSlot(`${id}_${owner || chain.id}`, name, presetId), ...chain.slots];
  });
}

function applyMetalTrackEq(fx: FxState, project: SanitizedPcsProject) {
  if (!isMetalProject(project)) return;
  const presetForRole = new Map([
    ["drums", ["metal_drum_eq", "Metal Drum EQ", "drum-punch"]],
    ["bass", ["metal_bass_eq", "Metal Bass EQ", "warm-bass-pocket"]],
    ["chords", ["metal_chord_eq", "Metal Chug EQ", "gentle-lead-presence"]],
    ["guitar", ["metal_guitar_eq", "Metal Guitar EQ", "gentle-lead-presence"]]
  ]);
  fx.chains.forEach((chain) => {
    const owner = chain.ownerTrackId || "";
    const melody = owner === "melody" || owner.startsWith("melody-");
    const preset = melody ? ["metal_melody_eq", "Metal Lead EQ", "gentle-lead-presence"] : presetForRole.get(owner);
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
