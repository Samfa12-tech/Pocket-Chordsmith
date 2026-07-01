#!/usr/bin/env node
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(repoRoot, "releases", "samfa12-compilation-album-1");
const dirs = {
  allSources: join(outRoot, "sources", "schema16-all"),
  albumSources: join(outRoot, "sources", "schema16-album"),
  projects: join(outRoot, "projects"),
  metadata: join(outRoot, "metadata")
};

const paths = {
  spinIndex: "C:\\Users\\sam_s\\Documents\\Spin Vector\\app\\android-capacitor\\www\\index.html",
  dustMain: "C:\\Users\\sam_s\\Documents\\Dust on the River\\src\\dust-on-the-river\\game\\main.js",
  possumApp: "C:\\Users\\sam_s\\Documents\\Possum Cafe\\PossumCafeAndroid\\Test\\app.js",
  possumSuite: "C:\\Users\\sam_s\\Documents\\Possum Cafe\\archive\\standalone-prototypes\\Last Table at Possums\\music-suite.js"
};

const albumSelections = [
  "spin-vector:pulse-reactor",
  "spin-vector:gravity-garden",
  "spin-vector:orbit-furnace",
  "spin-vector:rift-storm",
  "spin-vector:singularity-core",
  "spin-vector:adventure-drift",
  "dust-on-the-river:retired-gun-at-the-station",
  "dust-on-the-river:steam-train-arrival",
  "dust-on-the-river:public-bar-piano-and-warm-stew",
  "dust-on-the-river:horseback-travel",
  "dust-on-the-river:rain-on-tin",
  "dust-on-the-river:river-homestead-waltz",
  "possum-cafe:main-menu-original",
  "possum-cafe:main-menu-lantern",
  "possum-cafe:shift-rain",
  "possum-cafe:shift-warm",
  "possum-cafe:shift-wind",
  "possum-cafe:tomorrows-prep-list"
];

const SECTION_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const NOTE_INDEX = { C:0, "C#":1, Db:1, D:2, "D#":3, Eb:3, E:4, F:5, "F#":6, Gb:6, G:7, "G#":8, Ab:8, A:9, "A#":10, Bb:10, B:11 };
const INDEX_NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
};

await main();

async function main() {
  await resetOutput();
  const spin = await loadSpinSongs();
  const dust = await loadDustCues();
  const possum = await loadPossumSongs();
  const all = [...spin, ...dust, ...possum].map((entry) => ({
    ...entry,
    project: ensureMinimumDuration(entry.project, 120)
  }));

  const rows = [];
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  for (const [index, entry] of all.entries()) {
    const fileName = `${String(index + 1).padStart(2, "0")}-${slug(entry.project.title)}.json`;
    const outputPath = join(dirs.allSources, fileName);
    await writeJson(outputPath, entry.project);
    rows.push(summaryRow(entry, outputPath, index + 1, albumSelections.includes(entry.id) ? "album" : "harvest"));
  }

  const albumRows = [];
  for (const [index, id] of albumSelections.entries()) {
    const entry = byId.get(id);
    if (!entry) throw new Error(`Album selection missing: ${id}`);
    const project = { ...entry.project, title: albumTitle(index + 1, entry.project.title) };
    const fileName = `${String(index + 1).padStart(2, "0")}-${slug(entry.project.title)}.json`;
    const outputPath = join(dirs.albumSources, fileName);
    await writeJson(outputPath, project);
    albumRows.push(summaryRow({ ...entry, project }, outputPath, index + 1, "album"));
  }

  await writeFile(join(dirs.metadata, "harvest-inventory.csv"), csv(rows));
  await writeFile(join(dirs.metadata, "album-tracklist.csv"), csv(albumRows));
  await writeJson(join(dirs.metadata, "album-tracklist.json"), {
    albumTitle: "Samfa12's Compilation Album #1",
    artist: "Samfa12",
    generatedAt: new Date().toISOString(),
    minimumTrackSeconds: 120,
    trackCount: albumRows.length,
    tracks: albumRows
  });
  await writeFile(join(dirs.metadata, "README.md"), albumReadme(albumRows));

  console.log(JSON.stringify({
    ok: true,
    allHarvested: all.length,
    albumTracks: albumRows.length,
    albumSources: dirs.albumSources,
    metadata: dirs.metadata
  }, null, 2));
}

async function resetOutput() {
  await rm(dirs.allSources, { recursive: true, force: true });
  await rm(dirs.albumSources, { recursive: true, force: true });
  await rm(dirs.metadata, { recursive: true, force: true });
  await mkdir(dirs.allSources, { recursive: true });
  await mkdir(dirs.albumSources, { recursive: true });
  await mkdir(dirs.projects, { recursive: true });
  await mkdir(dirs.metadata, { recursive: true });
}

async function loadSpinSongs() {
  const html = await readFile(paths.spinIndex, "utf8");
  const start = html.indexOf("const PULSE_REACTOR_SONG");
  const end = html.indexOf("const audio =", start);
  if (start < 0 || end < 0) throw new Error("Could not locate Spin Vector song block.");
  const code = html.slice(start, end) + `
    globalThis.__songs = [
      ...CHORDSMITH_LEVEL_SONGS,
      HANGAR_DRIFT_SONG, ADVENTURE_DRIFT_SONG, SHOP_SPINDLE_SONG, VECTOR_SKIRMISH_SONG,
      BOLT_MALLOY_THEME, MIDGE_UNIT_THEME, SHOPKEEPER_THEME, HANGAR_MECHANIC_THEME,
      GAUNTLET_GATE_THEME, KIP_STATIC_THEME, RUE_WRENCH_THEME, NOVA_HALE_THEME
    ];
  `;
  const context = {};
  vm.createContext(context);
  vm.runInContext(code, context, { timeout: 1000 });
  return uniqueByName(context.__songs).map((song) => ({
    id: `spin-vector:${slug(song.name)}`,
    game: "Spin Vector",
    sourceKind: "custom runtime song",
    sourcePath: paths.spinIndex,
    project: fromSpinSong(song)
  }));
}

async function loadDustCues() {
  const main = await readFile(paths.dustMain, "utf8");
  const match = main.match(/const cues = (\{[\s\S]*?\n\s*\});\s*\n\s*let nodes/);
  if (!match) throw new Error("Could not locate Dust cue block.");
  const objectLiteral = match[1];
  const code = `
    function pcsChord(root, quality, octave){ return { root, quality, octave }; }
    globalThis.__cues = ${objectLiteral};
  `;
  const context = {};
  vm.createContext(context);
  vm.runInContext(code, context, { timeout: 1000 });
  return Object.values(context.__cues).map((cue) => ({
    id: `dust-on-the-river:${slug(cue.label || cue.id)}`,
    game: "Dust on the River",
    sourceKind: "adaptive cue",
    sourcePath: paths.dustMain,
    project: fromDustCue(cue)
  }));
}

async function loadPossumSongs() {
  const app = await readFile(paths.possumApp, "utf8");
  const start = app.indexOf("  const SHIFT_MUSIC =");
  const end = app.indexOf("  const CafeMusic = (() =>", start);
  if (start < 0 || end < 0) throw new Error("Could not locate Possum Cafe music block.");
  const code = app.slice(start, end) + `
    globalThis.__songs = [
      ...MENU_MUSIC_OPTIONS.map((item) => ({ id: item.id, label: item.label, song: item.song })),
      ...Object.values(SHIFT_MUSIC_OPTIONS).flat().map((item) => ({ id: item.id, label: item.label, song: item.song }))
    ];
  `;
  const context = {};
  vm.createContext(context);
  vm.runInContext(code, context, { timeout: 1000 });
  const seen = new Set();
  const active = [];
  for (const item of context.__songs) {
    const key = hash(JSON.stringify(item.song));
    if (seen.has(key)) continue;
    seen.add(key);
    active.push({
      id: `possum-cafe:${slug(item.label)}`,
      game: "Possum Cafe",
      sourceKind: "active schema-10 Chordsmith project",
      sourcePath: paths.possumApp,
      project: fromPossumProject(item.song, item.label)
    });
  }

  const suiteText = await readFile(paths.possumSuite, "utf8");
  const suiteStart = suiteText.indexOf("export const POCKET_CHORDSMITH_SUITE =");
  const suiteEnd = suiteText.indexOf("\n\nexport const DEFAULT_MUSIC_CUE", suiteStart);
  const suiteCode = suiteText
    .slice(0, suiteEnd > 0 ? suiteEnd : undefined)
    .replace(/^export /gm, "")
    + "\nglobalThis.__suite = POCKET_CHORDSMITH_SUITE;";
  const suiteContext = {};
  vm.createContext(suiteContext);
  vm.runInContext(suiteCode, suiteContext, { timeout: 1000 });
  const archive = Object.values(suiteContext.__suite).map((item) => ({
    id: `possum-cafe:${slug(item.label)}`,
    game: "Possum Cafe",
    sourceKind: "archived schema-16 Chordsmith project",
    sourcePath: paths.possumSuite,
    project: normalizeNativeProject(item.project, item.label, "Possum Cafe")
  }));
  return [...active, ...archive];
}

function fromSpinSong(song) {
  const project = baseProject({
    title: song.name,
    key: song.key,
    scale: song.scale,
    bpm: song.bpm,
    timeSig: song.timeSig,
    resolution: song.resolution,
    swing: song.swing || 0.04,
    chordType: sanitizeChordType(song.chordType),
    chordPlayMode: song.chordPlayMode || "arp_up",
    chordRhythmMode: song.chordRhythmMode || "quarter",
    notes: song.notes,
    game: "Spin Vector"
  });
  for (const id of ["A", "B", "C", "D"]) {
    const steps = sectionSteps(project, id);
    project[`progression${id}`] = fitArray(song.progression?.[id], 4, 0);
    project[`grid${id}`] = {
      kick: gridString(song.grid?.[id]?.kick, steps),
      snare: gridString(song.grid?.[id]?.snare, steps),
      hat: gridString(song.grid?.[id]?.hat, steps),
      bass: gridString(song.grid?.[id]?.bass, steps)
    };
    const melodies = (song.melody?.[id] || []).map((track) => expandBeatMelody(track, steps, project.resolution));
    setMelody(project, id, melodies, song.instruments?.[id], song.octaves?.[id], song.pans?.[id]);
  }
  applyMix(project, song.mix, song.masterGain);
  project.songSequence = sanitizeSequence(song.songSequence);
  return project;
}

function fromDustCue(cue) {
  const first = cue.chords?.[0] || { root: "C", quality: "maj" };
  const scale = String(first.quality || "").includes("min") ? "minor" : "major";
  const project = baseProject({
    title: cue.label || cue.id,
    key: first.root,
    scale,
    bpm: cue.bpm,
    timeSig: cue.timeSig || 4,
    resolution: 4,
    swing: cue.swing || 0,
    chordType: chordTypeFromQualities(cue.chords),
    chordPlayMode: cue.piano ? "block" : "strum_up",
    chordRhythmMode: cue.timeSig === 3 ? "half" : "quarter",
    notes: `Converted from Dust cue '${cue.id}'. Ambience: ${cue.ambience || "none"}.`,
    game: "Dust on the River"
  });
  project.songSequence = ["A", "B", "A", "C", "A", "B", "D", "A"];
  for (const section of ["A", "B", "C", "D"]) {
    project[`progression${section}`] = cue.chords.map((chord) => chordToDegree(chord, project.key, project.scale));
    project[`grid${section}`] = dustGrid(cue, project, section);
    const leadTrack = dustMotif(cue.lead, project, section, 0);
    const pluckTrack = dustMotif(cue.pluck || cue.piano, project, section, 1);
    setMelody(project, section, [leadTrack, pluckTrack], [
      dustVoiceToInstrument(cue.lead?.voice),
      dustVoiceToInstrument(cue.pluck?.voice || (cue.piano ? "saloon_piano" : "banjo"))
    ], [0, -1], [-0.18, 0.18]);
  }
  applyMix(project, {
    drums: cue.beat,
    bass: cue.bassGain,
    chords: cue.chord,
    leads: cue.leadGain
  }, cue.gain);
  return project;
}

function fromPossumProject(source, label) {
  const project = normalizeNativeProject(source, label, "Possum Cafe");
  project.title = label.replace(/^Main Menu: /, "").replace(/^Shift: /, "Cafe ");
  project.sourceNotes = `Converted from active Possum Cafe runtime option '${label}'.`;
  return project;
}

function normalizeNativeProject(source, label, game) {
  const project = JSON.parse(JSON.stringify(source));
  project.projectVersion = 16;
  project.title = label || source.title || source.name || "Pocket Chordsmith Project";
  project.sourceNotes = `Harvested from ${game}.`;
  fillProjectDefaults(project);
  return project;
}

function baseProject({ title, key, scale, bpm, timeSig, resolution, swing, chordType, chordPlayMode, chordRhythmMode, notes, game }) {
  const project = {
    projectVersion: 16,
    title,
    key: key || "C",
    scale: scale || "major",
    timeSig: Number(timeSig || 4),
    bpm: Number(bpm || 90),
    swing: Number(swing || 0),
    theme: "sunset",
    uiMode: "advanced",
    chordType: chordType || "triad",
    chordInstrument: "pocket",
    resolution: Number(resolution || 4),
    melodyPitchMode: "scale",
    midiExportMode: "full",
    midiChordExport: "chords",
    midiExactDurations: true,
    guitarEnabled: false,
    guitarTone: "clean",
    guitarRegister: "mid",
    guitarStrumMode: "down",
    guitarPatternPreset: "off",
    guitarVolume: 0.5,
    chordPlayMode: chordPlayMode || "block",
    chordRhythmMode: chordRhythmMode || "quarter",
    chordOctave: 0,
    melodyOctave: 0,
    melodyInputMode: "grid",
    xyPlaybackMode: "ostinato",
    xyPadMode: "frequency",
    xyScaleMode: "pentatonic",
    xyChordFollow: true,
    xyRecordToGrid: false,
    fxDelay: 0.08,
    fxChorus: 0.12,
    fxFlanger: 0,
    fxReverb: 0.18,
    fxMix: 0.32,
    metronomeOn: false,
    chordsOn: true,
    bassOn: true,
    showMelodyPads: true,
    showDrumPads: true,
    drumRecordToGrid: false,
    showMelodyPicker: true,
    showTrackControls: true,
    bassMode: "auto",
    humanizeOn: true,
    sidechainOn: true,
    sidechainAmount: 0.25,
    lastAdvancedResolution: Number(resolution || 4),
    sectionBars: Object.fromEntries(SECTION_IDS.map((id) => [id, ["A", "B", "C", "D"].includes(id) ? 4 : 1])),
    songSequence: ["A", "B", "A", "C", "A", "B", "D", "A"],
    followPlaybackSection: true,
    sourceNotes: notes || `Harvested from ${game}.`
  };
  fillProjectDefaults(project);
  return project;
}

function fillProjectDefaults(project) {
  project.projectVersion = 16;
  project.timeSig = [3, 4].includes(Number(project.timeSig)) ? Number(project.timeSig) : 4;
  project.resolution = [1, 2, 4, 8, 16].includes(Number(project.resolution)) ? Number(project.resolution) : 4;
  project.sectionBars = project.sectionBars || {};
  for (const id of SECTION_IDS) {
    project.sectionBars[id] = Math.max(1, Math.min(4, Number(project.sectionBars[id] || (["A", "B", "C", "D"].includes(id) ? 4 : 1))));
    const steps = sectionSteps(project, id);
    project[`progression${id}`] = fitArray(project[`progression${id}`], project.sectionBars[id], 0);
    const grid = project[`grid${id}`] || {};
    project[`grid${id}`] = {
      kick: fitArray(grid.kick, steps, 0),
      snare: fitArray(grid.snare, steps, 0),
      hat: fitArray(grid.hat, steps, 0),
      bass: fitArray(grid.bass, steps, 0)
    };
    project[`gridTuplets${id}`] = tupletGrid(steps);
    const melodies = project[`melodyTracks${id}`] || [];
    setMelody(project, id, melodies, project[`melodyInstruments${id}`], project[`melodyOctaves${id}`], project[`melodyPan${id}`]);
    project[`bassHold${id}`] = fitArray(project[`bassHold${id}`], steps, false);
    project[`bassSlide${id}`] = fitArray(project[`bassSlide${id}`], steps, false);
    project[`bassNotes${id}`] = fitArray(project[`bassNotes${id}`], steps, null);
    project[`bassAccent${id}`] = fitArray(project[`bassAccent${id}`], steps, false);
    project[`guitarPattern${id}`] = fitArray(project[`guitarPattern${id}`], steps, "off");
  }
  project.songSequence = sanitizeSequence(project.songSequence);
}

function setMelody(project, id, tracks, instruments = [], octaves = [], pans = []) {
  const steps = sectionSteps(project, id);
  const safeTracks = (tracks || []).slice(0, 6);
  while (safeTracks.length < 2) safeTracks.push([]);
  project[`melodyTracks${id}`] = safeTracks.map((track) => fitArray(track, steps, null));
  project[`melodyInstruments${id}`] = safeTracks.map((_, index) => sanitizeInstrument(instruments?.[index]));
  project[`melodyOctaves${id}`] = safeTracks.map((_, index) => clamp(Number(octaves?.[index] ?? 0), -2, 2));
  project[`melodyMute${id}`] = safeTracks.map(() => false);
  project[`melodySolo${id}`] = safeTracks.map(() => false);
  project[`melodyPan${id}`] = safeTracks.map((_, index) => clamp(Number(pans?.[index] ?? 0), -1, 1));
  project[`melodyHold${id}`] = safeTracks.map(() => fitArray([], steps, false));
  project[`melodySlide${id}`] = safeTracks.map(() => fitArray([], steps, false));
  project[`melodyTuplets${id}`] = safeTracks.map(() => fitArray([], steps, false));
}

function ensureMinimumDuration(project, minimumSeconds) {
  fillProjectDefaults(project);
  const base = sanitizeSequence(project.songSequence);
  let sequence = [...base];
  while (durationSeconds(project, sequence) < minimumSeconds && sequence.length + base.length <= 64) {
    sequence.push(...base);
  }
  while (durationSeconds(project, sequence) < minimumSeconds && sequence.length < 64) {
    sequence.push(base[sequence.length % base.length] || "A");
  }
  project.songSequence = sequence.slice(0, 64);
  project.albumPrep = {
    minimumSeconds,
    estimatedDurationSeconds: Math.round(durationSeconds(project, project.songSequence) * 100) / 100,
    repeatedForAlbumLength: project.songSequence.length > base.length
  };
  return project;
}

function durationSeconds(project, sequence = project.songSequence) {
  const beats = sequence.reduce((sum, section) => sum + Number(project.sectionBars?.[section] || 4) * Number(project.timeSig || 4), 0);
  return beats * 60 / Number(project.bpm || 90);
}

function dustGrid(cue, project, section) {
  const steps = sectionSteps(project, section);
  const grid = { kick: fitArray([], steps, 0), snare: fitArray([], steps, 0), hat: fitArray([], steps, 0), bass: fitArray([], steps, 0) };
  const drums = cue.drums || {};
  addDustDrum(grid.kick, drums.kick || drums.stomp || [], 2);
  addDustDrum(grid.snare, drums.snare || drums.clap || drums.rim || [], 1);
  addDustDrum(grid.hat, drums.brush || drums.hoof || drums.chug || drums.splash || [], 1);
  addDustDrum(grid.bass, cue.bassSteps || [], 2);
  return grid;
}

function addDustDrum(lane, steps, value) {
  for (let bar = 0; bar < 4; bar += 1) {
    for (const step of steps || []) {
      const index = bar * 16 + Number(step || 0);
      if (index >= 0 && index < lane.length) lane[index] = value;
    }
  }
}

function dustMotif(part, project, section, offset) {
  const steps = sectionSteps(project, section);
  const out = fitArray([], steps, null);
  if (!part?.steps?.length) return out;
  for (let bar = 0; bar < 4; bar += 1) {
    part.steps.forEach((step, index) => {
      const interval = part.intervals?.[index % part.intervals.length] ?? 0;
      const pos = bar * 16 + Number(step || 0) + offset;
      if (pos >= 0 && pos < out.length) out[pos] = intervalToScaleNote(interval, project.scale);
    });
  }
  return out;
}

function expandBeatMelody(track, steps, resolution) {
  const out = fitArray([], steps, null);
  const stride = Math.max(1, Number(resolution || 4));
  (track || []).forEach((note, index) => {
    const pos = index * stride;
    if (pos < out.length) out[pos] = note;
  });
  return out;
}

function gridString(text, steps) {
  return fitArray(String(text || "").split("").map((char) => Number(char) || 0), steps, 0);
}

function tupletGrid(steps) {
  return {
    kick: fitArray([], steps, false),
    snare: fitArray([], steps, false),
    hat: fitArray([], steps, false),
    bass: fitArray([], steps, false)
  };
}

function applyMix(project, mix = {}, masterGain) {
  project.masterVolume = clamp(Number(masterGain ?? 0.82), 0.3, 0.95);
  project.beatVolume = clamp(Number(mix.drums ?? 0.78), 0.05, 1);
  project.chordVolume = clamp(Number(mix.chords ?? 0.72), 0.05, 1);
  project.leadVolume = clamp(Number(mix.leads ?? mix.melody ?? 0.65), 0.05, 1);
  project.guitarVolume = clamp(Number(mix.guitar ?? 0.5), 0.05, 1);
}

function chordToDegree(chord, key, scale) {
  const root = NOTE_INDEX[chord.root] ?? 0;
  const keyIndex = NOTE_INDEX[key] ?? 0;
  const semitone = (root - keyIndex + 12) % 12;
  const steps = SCALE_STEPS[scale] || SCALE_STEPS.major;
  let best = 0;
  let bestDistance = 99;
  steps.forEach((value, index) => {
    const distance = Math.min(Math.abs(value - semitone), 12 - Math.abs(value - semitone));
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function intervalToScaleNote(interval, scale) {
  const steps = SCALE_STEPS[scale] || SCALE_STEPS.major;
  const normalized = ((Number(interval || 0) % 24) + 24) % 24;
  const octave = normalized >= 12 ? 7 : 0;
  const semitone = normalized % 12;
  let best = 0;
  let bestDistance = 99;
  steps.forEach((value, index) => {
    const distance = Math.min(Math.abs(value - semitone), 12 - Math.abs(value - semitone));
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return clamp(octave + best, 0, 13);
}

function chordTypeFromQualities(chords = []) {
  const text = chords.map((chord) => chord.quality).join(" ");
  if (/sus4/.test(text)) return "sus4";
  if (/sus2/.test(text)) return "sus2";
  if (/7/.test(text)) return "seventh";
  return "triad";
}

function sanitizeChordType(value) {
  return ["triad", "seventh", "sus2", "sus4"].includes(value) ? value : "triad";
}

function dustVoiceToInstrument(voice) {
  if (voice === "banjo") return "banjo";
  if (voice === "harmonica") return "harmonica";
  if (voice === "cowboy_whistle") return "cowboy_whistle";
  if (voice === "saloon_piano") return "soft";
  if (voice === "fiddle") return "lead_guitar";
  if (voice === "jawharp") return "soft_pluck";
  return "banjo";
}

function sanitizeInstrument(value) {
  const allowed = new Set(["pulse", "soft", "synth", "bell", "lead_guitar", "distorted_lead_guitar", "banjo", "harmonica", "cowboy_whistle", "trumpet", "saxophone", "mellow_vibes", "soft_pluck", "mellow_sax", "muted_trumpet", "tape_bell", "chip_square_lead", "chip_pulse_lead", "chip_triangle_blip", "chip_bell_stack", "modern_chip_lead"]);
  return allowed.has(value) ? value : "synth";
}

function sectionSteps(project, id) {
  return Number(project.sectionBars?.[id] || 4) * Number(project.timeSig || 4) * Number(project.resolution || 4);
}

function sanitizeSequence(sequence) {
  const out = (Array.isArray(sequence) ? sequence : ["A"]).map((item) => String(item).toUpperCase()).filter((item) => SECTION_IDS.includes(item));
  return out.length ? out.slice(0, 64) : ["A"];
}

function fitArray(value, length, fallback) {
  const out = new Array(length).fill(fallback);
  if (!Array.isArray(value)) return out;
  for (let index = 0; index < Math.min(length, value.length); index += 1) out[index] = value[index] ?? fallback;
  return out;
}

function uniqueByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summaryRow(entry, outputPath, trackNumber, role) {
  return {
    trackNumber,
    role,
    id: entry.id,
    game: entry.game,
    title: entry.project.title,
    bpm: entry.project.bpm,
    key: entry.project.key,
    scale: entry.project.scale,
    durationSeconds: entry.project.albumPrep?.estimatedDurationSeconds ?? Math.round(durationSeconds(entry.project) * 100) / 100,
    repeatedForAlbumLength: entry.project.albumPrep?.repeatedForAlbumLength ?? false,
    sourceKind: entry.sourceKind,
    sourcePath: entry.sourcePath,
    outputPath
  };
}

function albumTitle(trackNumber, title) {
  return title.replace(/^\d+\.\s+/, "");
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}

function csv(rows) {
  const headers = Object.keys(rows[0] || {});
  return [headers.join(","), ...rows.map((row) => headers.map((key) => quoteCsv(row[key])).join(","))].join("\n") + "\n";
}

function quoteCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function albumReadme(rows) {
  return `# Samfa12's Compilation Album #1

Generated from harvested Pocket Chordsmith / Pocket Audio song data in Spin Vector, Dust on the River, and Possum Cafe.

- Artist: Samfa12
- Minimum track length: 2:00
- Album source JSON: \`${dirs.albumSources}\`
- Mastering target: Spotify-style 44.1 kHz streaming profile from Pocket Audio Core; CD Baby upload copies should be 16-bit/44.1 kHz stereo WAV.

## Tracklist

${rows.map((row) => `${row.trackNumber}. ${row.title} (${row.game}) - ${formatDuration(row.durationSeconds)}`).join("\n")}
`;
}

function formatDuration(seconds) {
  const total = Math.round(Number(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function slug(value) {
  return String(value || "track")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "track";
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
