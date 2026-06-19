import { POCKET_AUDIO_CORE_VERSION, STEM_IDS } from "../constants.js";
import { buildPocketAudioTimeline } from "../events/timeline-events.js";
import { normalisePocketChordsmithProject } from "../schema/normalise-project.js";
import { parsePocketChordsmithInput } from "../schema/parse-share-code.js";
import { renderPocketAudioWav } from "../engine/offline-renderer.js";
import { chordsmithFxParameters } from "../fx/chordsmith-fx.js";
import { POCKET_LOFI_SOUND_REGISTRY } from "../sounds/lofi-registry.js";
import { GAME_PACK_FOLDERS, gamePackPath } from "./game-pack-paths.js";
import { renderPocketAudioStems } from "./stems.js";
import { createSilentWavBlob } from "./wav.js";

export const GODOT_EXPORT_PROFILES = Object.freeze({
  STEM_SYNC: "STEM_SYNC",
  LOOP_KIT: "LOOP_KIT",
  HYBRID: "HYBRID",
  PROCEDURAL_PREVIEW: "PROCEDURAL_PREVIEW"
});

export async function createGodotExportKit(input, options = {}) {
  const project = normaliseInput(input);
  const profile = normaliseProfile(options.profile || GODOT_EXPORT_PROFILES.LOOP_KIT);
  const sampleRate = Number(options.sampleRate || 48000);
  const files = new Map();
  const manifest = createBaseManifest(project, { profile, sampleRate });

  if (profile === GODOT_EXPORT_PROFILES.STEM_SYNC) {
    await addStemSyncAssets(project, manifest, files, { sampleRate });
  } else if (profile === GODOT_EXPORT_PROFILES.LOOP_KIT) {
    await addLoopKitAssets(project, manifest, files, { sampleRate, includeStems: options.includeStems !== false });
  } else if (profile === GODOT_EXPORT_PROFILES.HYBRID) {
    await addHybridAssets(project, manifest, files, { sampleRate });
  } else {
    manifest.previewOnly = true;
    manifest.notes.push("PROCEDURAL_PREVIEW is for editor convenience only and is not a parity export.");
  }

  manifest.events = buildManifestEvents(project);
  manifest.fileCount = files.size;
  return { manifest, files };
}

export function createGodotManifest(input, options = {}) {
  const project = normaliseInput(input);
  const profile = normaliseProfile(options.profile || GODOT_EXPORT_PROFILES.LOOP_KIT);
  const sampleRate = Number(options.sampleRate || 48000);
  const manifest = createBaseManifest(project, { profile, sampleRate });
  manifest.events = buildManifestEvents(project);
  return manifest;
}

function normaliseInput(input) {
  const raw = input?.app === "PocketAudioProject" ? input : parsePocketChordsmithInput(input);
  return raw?.app === "PocketAudioProject" ? raw : normalisePocketChordsmithProject(raw);
}

function normaliseProfile(profile) {
  const safe = String(profile || "").toUpperCase();
  if (!Object.values(GODOT_EXPORT_PROFILES).includes(safe)) throw new Error(`Unknown Godot export profile: ${profile}`);
  return safe;
}

function createBaseManifest(project, { profile, sampleRate }) {
  const sections = {};
  Object.entries(project.sections).forEach(([id, section]) => {
    const timeline = buildPocketAudioTimeline(project, { scope: "section", sectionId: id });
    sections[id] = {
      bars: section.bars,
      duration: roundTime(timeline.duration),
      loopStart: 0,
      loopEnd: roundTime(timeline.duration),
      assets: {}
    };
  });
  return {
    app: "PocketAudioCoreGodotKit",
    coreVersion: POCKET_AUDIO_CORE_VERSION,
    profile,
    sourceProjectSchema: project.source?.sourceSchemaVersion || 16,
    title: project.meta.title,
    bpm: project.meta.bpm,
    timeSig: project.meta.timeSig,
    swing: project.meta.swing,
    audioProfile: project.meta.audioProfile || "standard",
    fx: createFxManifest(project),
    lofi: createLofiManifest(project),
    soundRegistry: createSoundRegistryManifest(project),
    sampleRate,
    sequence: project.sequence.slice(),
    sections,
    assets: {},
    folders: {
      full: GAME_PACK_FOLDERS.full,
      stems: GAME_PACK_FOLDERS.stems,
      sections: GAME_PACK_FOLDERS.sections,
      samples: GAME_PACK_FOLDERS.samples
    },
    events: [],
    notes: [
      "Exact parity requires these core-rendered assets. Native Godot procedural playback should be labelled preview until tested."
    ]
  };
}

async function addStemSyncAssets(project, manifest, files, { sampleRate }) {
  const fullMixName = gamePackPath("full", "full_mix.wav");
  files.set(fullMixName, renderPocketAudioWav(project, { scope: "sequence", sampleRate, tailSeconds: 0 }));
  manifest.assets.mix = fullMixName;
  const stems = await renderPocketAudioStems(project, { scope: "sequence", sampleRate, tailSeconds: 0, stems: STEM_IDS });
  STEM_IDS.forEach((stem) => {
    const name = gamePackPath("stems", `${stem}.wav`);
    files.set(name, stems[stem]);
    manifest.assets[stem] = name;
  });
}

async function addLoopKitAssets(project, manifest, files, { sampleRate, includeStems }) {
  for (const sectionId of Object.keys(manifest.sections)) {
    const sectionManifest = manifest.sections[sectionId];
    const mixName = gamePackPath("sections", `section_${sectionId}_mix.wav`);
    files.set(mixName, renderPocketAudioWav(project, { scope: "section", sectionId, sampleRate, tailSeconds: 0 }));
    sectionManifest.assets.mix = mixName;
    if (includeStems) {
      const stems = await renderPocketAudioStems(project, { scope: "section", sectionId, sampleRate, tailSeconds: 0, stems: STEM_IDS });
      STEM_IDS.forEach((stem) => {
        const name = gamePackPath("stems", `section_${sectionId}_${stem}.wav`);
        files.set(name, stems[stem]);
        sectionManifest.assets[stem] = name;
      });
    }
  }
}

async function addHybridAssets(project, manifest, files, { sampleRate }) {
  const stems = await renderPocketAudioStems(project, { scope: "sequence", sampleRate, tailSeconds: 0, stems: STEM_IDS });
  STEM_IDS.forEach((stem) => {
    const name = gamePackPath("stems", `bed_${stem}.wav`);
    files.set(name, stems[stem]);
    manifest.assets[stem] = name;
  });
  ["kick", "snare", "crash", "victory_stinger"].forEach((sample) => {
    const name = gamePackPath("samples", `${sample}.wav`);
    files.set(name, createSilentWavBlob({ durationSeconds: sample.endsWith("stinger") ? 0.75 : 0.25, sampleRate }));
    manifest.assets[sample] = name;
  });
  manifest.notes.push("HYBRID sample assets are generated placeholders in this v0 export and should be replaced as the sample kit matures.");
}

function createFxManifest(project) {
  const fx = project.mixer?.fx || {};
  const mapped = chordsmithFxParameters({
    delay: fx.delay,
    chorus: fx.chorus,
    flanger: fx.flanger,
    reverb: fx.reverb,
    mix: fx.mix
  });
  return {
    source: cloneJson(mapped.source),
    dryGain: mapped.dryGain,
    wetMasterGain: mapped.wetMasterGain,
    tone: cloneJson(mapped.tone),
    delay: cloneJson(mapped.delay),
    chorus: cloneJson(mapped.chorus),
    flanger: cloneJson(mapped.flanger),
    reverb: cloneJson(mapped.reverb),
    sidechain: cloneJson(fx.sidechain || {})
  };
}

function buildManifestEvents(project) {
  const timeline = buildPocketAudioTimeline(project, { scope: "sequence" });
  const sectionStartEvents = [];
  let cursor = 0;
  timeline.sectionIds.forEach((sectionId, arrangementIndex) => {
    const sectionTimeline = buildPocketAudioTimeline(project, { scope: "section", sectionId });
    sectionStartEvents.push({
      time: roundTime(cursor),
      sectionId,
      arrangementIndex,
      bar: 1,
      beat: 1,
      type: "section_start"
    });
    cursor += sectionTimeline.duration;
  });
  const musicalEvents = timeline.events.map(createManifestEvent);
  return [...sectionStartEvents, ...musicalEvents].sort((a, b) => a.time - b.time || eventOrder(a.type) - eventOrder(b.type));
}

function createManifestEvent(event) {
  const out = {
    time: roundTime(event.time),
    sectionId: event.sectionId,
    bar: event.bar,
    beat: event.beat,
    stem: event.stem,
    type: event.type,
    tick: event.tick,
    durationTicks: event.durationTicks,
    step: event.step,
    arrangementIndex: event.arrangementIndex,
    duration: roundTime(event.duration || 0)
  };
  [
    "audioProfile",
    "lofiPreset",
    "drumKit",
    "bassTone",
    "instrument",
    "articulation",
    "midi",
    "midiNotes",
    "velocity",
    "pan",
    "accent",
    "tuplet",
    "slideMidi",
    "slideOffset",
    "direction"
  ].forEach((key) => {
    if (event[key] !== undefined) out[key] = cloneJson(event[key]);
  });
  if (event.lofiTexture?.enabled) out.lofiTexture = cloneJson(event.lofiTexture);
  return out;
}

function createLofiManifest(project) {
  const lofi = project.lofi || {};
  return {
    presetId: lofi.presetId || "",
    drumKit: lofi.drumKit || "classic",
    drumGroovePreset: lofi.drumGroovePreset || "",
    bassTone: lofi.bassTone || "classic",
    texture: cloneJson(lofi.texture || {}),
    intensityHints: cloneJson(lofi.intensityHints || {})
  };
}

function createSoundRegistryManifest(project) {
  if (project.meta.audioProfile !== "lofi_chill") return {};
  return {
    lofi: cloneJson(POCKET_LOFI_SOUND_REGISTRY)
  };
}

function eventOrder(type) {
  return type === "section_start" ? 0 : 1;
}

function roundTime(value) {
  return Math.round(Number(value || 0) * 1000000) / 1000000;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
