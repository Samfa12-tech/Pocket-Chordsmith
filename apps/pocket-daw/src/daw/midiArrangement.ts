import { sanitizePocketChordsmithProject, SECTION_IDS, type SectionId } from "../compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../compatibility/pcsToDaw";
import { parseStandardMidiFile, type ParsedMidiFile, type ParsedMidiNote } from "./midiParser";
import { importMidiFileToProject } from "./midiClips";
import type { FxPluginInstance, PocketDawProject } from "./schema";
import { drumPresetEventsForProject, pos16ToStep, shouldUsePresetEvent } from "./chordsmithDrumPresets";
import { POCKET_PRO_EQ_TYPE, pocketProEqPresetParameters } from "../../../../packages/pocket-audio-core/src/fx/pro-eq.js";

export interface MidiArrangementOptions {
  title?: string;
  fileName?: string;
  style?: "heavy_metal" | string;
  keepRawMidiClip?: boolean;
  baseProject?: PocketDawProject | null;
}

export interface MidiArrangementResult {
  project: PocketDawProject;
  extraction: MidiArrangementExtractionSummary;
  warnings: string[];
}

export interface MidiArrangementExtractionSummary {
  style: "heavy_metal";
  title: string;
  bpm: number;
  timeSig: number;
  key: string;
  scale: "major" | "minor";
  sourceNoteCount: number;
  drumNoteCount: number;
  musicalNoteCount: number;
  sourceBars: number;
  outputBars: number;
  paddingBars: number;
  sectionCount: number;
  uniqueSectionCount: number;
  repeatedSourceSections: number;
  repeatedDestinationSections: number;
  heuristicSubstitutions: number;
  rawMidiClip: "muted-reference" | "omitted";
  sectionAssignments: Array<{
    sourceChunk: number;
    destinationSectionId: SectionId;
    materialSourceChunk: number;
    heuristicSubstitution: boolean;
  }>;
  sections: Array<{
    id: SectionId;
    sourceChunk: number;
    preset: string;
    guitarPattern: string;
    density: number;
    chordDegrees: number[];
  }>;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_INTERVALS: Record<"major" | "minor", number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
};
type DrumLane = "kick" | "snare" | "hat";

interface ChunkAnalysis {
  chunkIndex: number;
  startBar: number;
  endBar: number;
  density: number;
  avgPitch: number;
  chordDegrees: number[];
  nonDrumNotes: ParsedMidiNote[];
  drumNotes: ParsedMidiNote[];
}

export function arrangeMidiToHeavyMetalProject(bytes: Uint8Array, options: MidiArrangementOptions = {}): MidiArrangementResult {
  const parsed = parseStandardMidiFile(bytes);
  if (!parsed.notes.length) throw new Error("MIDI file contains no note events to arrange.");
  const warnings: string[] = [];
  if (options.style && options.style !== "heavy_metal") warnings.push(`Unknown MIDI arrangement style "${options.style}"; using heavy_metal.`);

  const base = options.baseProject || null;
  const timeSig = clampInt(parsed.timeSig || base?.project.timeSig || 4, 3, 7);
  if (timeSig !== 4) warnings.push(`MIDI time signature is ${timeSig}/4. Heavy-metal v1 is optimized for 4/4, so drums/guitar use safe fallback patterns.`);
  const bpm = clampInt(parsed.tempoBpm || base?.project.bpm || 128, 40, 240);
  const allNotes = parsed.notes.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  const drumNotes = allNotes.filter(isDrumNote);
  const musicalNotes = allNotes.filter((note) => !isDrumNote(note));
  const keyRoot = musicalNotes.length ? inferKeyRoot(musicalNotes) : keyRootFromProject(base) ?? 0;
  const scale = (base?.project.scale === "major" || base?.project.scale === "minor") ? base.project.scale : "minor";
  const key = NOTE_NAMES[keyRoot] || "C";
  const sourceBars = Math.max(1, Math.ceil(maxTick(allNotes) / Math.max(1, parsed.ppq * timeSig)));
  const sectionCount = Math.max(1, Math.ceil(sourceBars / 4));
  const chunks = Array.from({ length: sectionCount }, (_value, index) => analyzeChunk(parsed, index, timeSig, keyRoot, scale));
  const assignments = assignSections(chunks);
  const heuristicSubstitutions = assignments.filter((assignment) => assignment.chunkIndex !== assignment.sourceChunk);
  if (heuristicSubstitutions.length) {
    warnings.push(`${heuristicSubstitutions.length} later four-bar source chunk${heuristicSubstitutions.length === 1 ? " was" : "s were"} replaced with nearest A-H section material for this creative arrangement.`);
  }
  const raw: Record<string, unknown> = {
    projectVersion: 16,
    title: options.title || titleFromFileName(options.fileName) || "Heavy Metal MIDI Arrangement",
    key,
    scale,
    timeSig,
    bpm,
    swing: 0,
    resolution: 4,
    chordType: "triad",
    chordInstrument: "pocket",
    chordPlayMode: "power",
    chordRhythmMode: "stab",
    chordOctave: -1,
    melodyPitchMode: "scale",
    masterVolume: 0.94,
    chordVolume: 0.38,
    beatVolume: 0.9,
    leadVolume: 0.62,
    chordsOn: true,
    bassOn: true,
    bassMode: "manual",
    guitarEnabled: true,
    guitarTone: "metal",
    guitarRegister: "low",
    guitarStrumMode: "down",
    guitarVolume: 0.72,
    fxDelay: 0.04,
    fxChorus: 0.04,
    fxFlanger: 0.02,
    fxReverb: 0.08,
    fxMix: 0.24,
    humanizeOn: false,
    sidechainOn: false,
    sidechainAmount: 0,
    sectionBars: Object.fromEntries(SECTION_IDS.map((id) => [id, 4])),
    songSequence: assignments.map((assignment) => assignment.sectionId)
  };

  const sectionSummaries: MidiArrangementExtractionSummary["sections"] = [];
  for (const assignment of assignments) {
    if (raw[`progression${assignment.sectionId}`]) continue;
    const chunk = chunks[assignment.sourceChunk];
    const stepCount = 4 * timeSig * 4;
    raw[`progression${assignment.sectionId}`] = chunk.chordDegrees;
    raw[`grid${assignment.sectionId}`] = drumGridForChunk(chunk, parsed, timeSig);
    raw[`gridTuplets${assignment.sectionId}`] = emptyGridTuplets(stepCount);
    raw[`bassNotes${assignment.sectionId}`] = bassNotesForChunk(chunk, parsed, timeSig, keyRoot, scale);
    raw[`bassAccent${assignment.sectionId}`] = accentGrid(stepCount, timeSig, 4);
    raw[`melodyTracks${assignment.sectionId}`] = [melodyTrackForChunk(chunk, parsed, timeSig, keyRoot, scale)];
    raw[`melodyInstruments${assignment.sectionId}`] = ["distorted_lead_guitar"];
    raw[`melodyOctaves${assignment.sectionId}`] = [0];
    raw[`melodyPan${assignment.sectionId}`] = [0.12];
    raw[`guitarPattern${assignment.sectionId}`] = guitarPatternForChunk(chunk, timeSig);
    sectionSummaries.push({
      id: assignment.sectionId,
      sourceChunk: assignment.sourceChunk,
      preset: drumPresetForChunk(chunk, timeSig),
      guitarPattern: guitarPresetForChunk(chunk, timeSig),
      density: round(chunk.density, 3),
      chordDegrees: chunk.chordDegrees
    });
  }

  let project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(raw));
  project = styleProjectAsHeavyMetal(project);
  if (options.keepRawMidiClip !== false) {
    const imported = importMidiFileToProject(project, parsed, options.fileName || "source.mid", options.fileName, bytes.byteLength);
    project = imported.project;
    const midiTrack = project.tracks.find((track) => track.id === imported.trackId);
    if (midiTrack) {
      midiTrack.name = "Raw MIDI Reference";
      midiTrack.volume = 0.18;
      midiTrack.mute = true;
      midiTrack.metadata = { ...(midiTrack.metadata || {}), referenceOnly: true, arrangementSource: "midi-heavy-metal" };
    }
    const clip = project.timeline.clips.find((item) => item.id === imported.clipId);
    if (clip) {
      clip.name = "Raw MIDI Reference";
      clip.muted = true;
      clip.color = "#5d6276";
    }
  }
  project.importHistory.push({
    id: `import_${String(project.importHistory.length + 1).padStart(3, "0")}`,
    sourceRefId: project.sourceRefs[0]?.id || "src_pcs_001",
    importedAt: new Date().toISOString(),
    importKind: "raw-json",
    message: `Arranged ${parsed.notes.length} MIDI notes into a heavy-metal Chordsmith-style project.`
  });
  project.timeline.loop = { enabled: false, startBar: 1, endBar: Math.min(project.timeline.bars + 1, 17) };

  return {
    project,
    warnings,
    extraction: {
      style: "heavy_metal",
      title: String(raw.title),
      bpm,
      timeSig,
      key,
      scale,
      sourceNoteCount: parsed.notes.length,
      drumNoteCount: drumNotes.length,
      musicalNoteCount: musicalNotes.length,
      sourceBars,
      outputBars: sectionCount * 4,
      paddingBars: Math.max(0, sectionCount * 4 - sourceBars),
      sectionCount,
      uniqueSectionCount: sectionSummaries.length,
      repeatedSourceSections: 0,
      repeatedDestinationSections: Math.max(0, assignments.length - sectionSummaries.length),
      heuristicSubstitutions: heuristicSubstitutions.length,
      rawMidiClip: options.keepRawMidiClip === false ? "omitted" : "muted-reference",
      sectionAssignments: assignments.map((assignment) => ({
        sourceChunk: assignment.chunkIndex,
        destinationSectionId: assignment.sectionId,
        materialSourceChunk: assignment.sourceChunk,
        heuristicSubstitution: assignment.chunkIndex !== assignment.sourceChunk
      })),
      sections: sectionSummaries
    }
  };
}

function analyzeChunk(parsed: ParsedMidiFile, chunkIndex: number, timeSig: number, keyRoot: number, scale: "major" | "minor"): ChunkAnalysis {
  const startBar = chunkIndex * 4 + 1;
  const endBar = startBar + 3;
  const startTick = (startBar - 1) * timeSig * parsed.ppq;
  const endTick = (endBar) * timeSig * parsed.ppq;
  const notes = parsed.notes.filter((note) => note.startTick < endTick && note.startTick + note.durationTicks > startTick);
  const nonDrumNotes = notes.filter((note) => !isDrumNote(note));
  const drumNotes = notes.filter(isDrumNote);
  const beats = Math.max(1, 4 * timeSig);
  const density = nonDrumNotes.length / beats;
  const avgPitch = nonDrumNotes.length ? nonDrumNotes.reduce((sum, note) => sum + note.pitch, 0) / nonDrumNotes.length : 60;
  return {
    chunkIndex,
    startBar,
    endBar,
    density,
    avgPitch,
    chordDegrees: Array.from({ length: 4 }, (_value, barOffset) => chordDegreeForBar(nonDrumNotes, startBar + barOffset, parsed.ppq, timeSig, keyRoot, scale)),
    nonDrumNotes,
    drumNotes
  };
}

function assignSections(chunks: ChunkAnalysis[]): Array<{ chunkIndex: number; sectionId: SectionId; sourceChunk: number }> {
  const assigned: Array<{ chunkIndex: number; sectionId: SectionId; sourceChunk: number }> = [];
  const sources: ChunkAnalysis[] = [];
  for (const chunk of chunks) {
    if (sources.length < SECTION_IDS.length) {
      sources.push(chunk);
      assigned.push({ chunkIndex: chunk.chunkIndex, sectionId: SECTION_IDS[sources.length - 1], sourceChunk: chunk.chunkIndex });
      continue;
    }
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    sources.forEach((source, index) => {
      const distance = Math.abs(source.density - chunk.density) + Math.abs(source.avgPitch - chunk.avgPitch) / 48;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    assigned.push({ chunkIndex: chunk.chunkIndex, sectionId: SECTION_IDS[bestIndex], sourceChunk: bestIndex });
  }
  return assigned;
}

function drumGridForChunk(chunk: ChunkAnalysis, parsed: ParsedMidiFile, timeSig: number): Record<DrumLane | "bass", number[]> {
  const stepCount = 4 * timeSig * 4;
  const grid = emptyGrid(stepCount);
  if (chunk.drumNotes.length) {
    for (const note of chunk.drumNotes) {
      const lane = drumLaneForPitch(note.pitch);
      if (!lane) continue;
      const step = tickToChunkStep(note.startTick, parsed.ppq, timeSig, chunk.startBar);
      if (step >= 0 && step < stepCount) grid[lane][step] = Math.max(grid[lane][step], note.velocity >= 104 ? 2 : 1);
    }
    return grid;
  }
  const preset = drumPresetForChunk(chunk, timeSig);
  if (timeSig !== 4 && preset !== "rock") return grid;
  const pattern = drumPresetEventsForProject(preset, { timeSig, resolution: 4 });
  for (let bar = 0; bar < 4; bar += 1) {
    for (const event of pattern.events) {
      if (!shouldUsePresetEvent(event, 4)) continue;
      const step = pos16ToStep(bar, event.pos16, { timeSig, resolution: 4 }, stepCount);
      if (step >= 0 && step < stepCount) grid[event.track][step] = Math.max(grid[event.track][step], Math.max(1, Math.min(2, Math.round(event.level || 1))));
    }
  }
  return grid;
}

function bassNotesForChunk(chunk: ChunkAnalysis, parsed: ParsedMidiFile, timeSig: number, keyRoot: number, scale: "major" | "minor"): Array<number | null> {
  const stepCount = 4 * timeSig * 4;
  const out = new Array<number | null>(stepCount).fill(null);
  const candidates = chunk.nonDrumNotes.filter((note) => note.pitch <= 60 || note.velocity >= 92);
  for (const note of candidates) {
    const step = tickToChunkStep(note.startTick, parsed.ppq, timeSig, chunk.startBar);
    if (step < 0 || step >= stepCount) continue;
    const existing = out[step];
    if (existing === null || note.pitch < scaleDegreeToApproxPitch(existing, keyRoot, scale)) {
      out[step] = pitchToScaleDegree(note.pitch, keyRoot, scale, 13);
    }
  }
  if (!out.some((value) => value !== null)) {
    chunk.chordDegrees.forEach((degree, bar) => {
      const step = bar * timeSig * 4;
      if (step < out.length) out[step] = degree;
    });
  }
  return out;
}

function melodyTrackForChunk(chunk: ChunkAnalysis, parsed: ParsedMidiFile, timeSig: number, keyRoot: number, scale: "major" | "minor"): Array<number | null> {
  const stepCount = 4 * timeSig * 4;
  const out = new Array<number | null>(stepCount).fill(null);
  const byStep = new Map<number, ParsedMidiNote>();
  for (const note of chunk.nonDrumNotes.filter((item) => item.pitch >= 55)) {
    const step = tickToChunkStep(note.startTick, parsed.ppq, timeSig, chunk.startBar);
    if (step < 0 || step >= stepCount) continue;
    const current = byStep.get(step);
    if (!current || note.pitch > current.pitch || note.velocity > current.velocity + 8) byStep.set(step, note);
  }
  byStep.forEach((note, step) => {
    out[step] = pitchToScaleDegree(note.pitch, keyRoot, scale, 23);
  });
  return out;
}

function guitarPatternForChunk(chunk: ChunkAnalysis, timeSig: number): string[] {
  const stepCount = 4 * timeSig * 4;
  const pattern = new Array<string>(stepCount).fill("off");
  const preset = guitarPresetForChunk(chunk, timeSig);
  const resolution = 4;
  const beat = resolution;
  const barSteps = timeSig * resolution;
  for (let step = 0; step < stepCount; step += 1) {
    const pos = step % Math.max(1, barSteps);
    if (preset === "doom_slow") {
      if (pos === 0 || pos === beat * 2) pattern[step] = "accent";
      else if (pos > 0) pattern[step] = "hold";
    } else if (preset === "gallop") {
      const unit = 1;
      const slot = Math.floor(pos / unit) % 4;
      if (slot === 0 || slot === 1 || slot === 3) pattern[step] = slot === 0 ? "accent" : "chug";
    } else {
      pattern[step] = pos % beat === 0 ? "accent" : "chug";
    }
  }
  return pattern;
}

function styleProjectAsHeavyMetal(project: PocketDawProject): PocketDawProject {
  const trackByRole = new Map(project.tracks.map((track) => [track.role, track]));
  const drums = trackByRole.get("drums");
  const bass = trackByRole.get("bass");
  const chords = trackByRole.get("chords");
  const guitar = trackByRole.get("guitar");
  const melodyTracks = project.tracks.filter((track) => track.role === "melody");
  const master = trackByRole.get("master");
  const fxReturn = trackByRole.get("fx-return");
  if (drums) {
    drums.name = "Metal Drums";
    drums.volume = 0.9;
    drums.mute = false;
    drums.metadata = { ...(drums.metadata || {}), drumKit: "classic", drumGroovePreset: "metal" };
  }
  if (bass) {
    bass.name = "Picked Root Bass";
    bass.volume = 0.72;
    bass.mute = false;
  }
  if (chords) {
    chords.name = "Low Power Chord Bed";
    chords.volume = 0.34;
    chords.mute = false;
  }
  if (guitar) {
    guitar.name = "Metal Rhythm Guitar";
    guitar.volume = 0.78;
    guitar.pan = -0.08;
    guitar.mute = false;
    guitar.active = true;
    guitar.metadata = { ...(guitar.metadata || {}), chordsmithTone: "metal", chordsmithRegister: "low", chordsmithStrumMode: "down" };
  }
  melodyTracks.forEach((track, index) => {
    track.name = index === 0 ? "Distorted Lead Melody" : track.name;
    track.volume = index === 0 ? 0.58 : 0.42;
    track.pan = index === 0 ? 0.16 : track.pan;
    track.mute = false;
    track.metadata = { ...(track.metadata || {}), chordsmithInstrument: "distorted_lead_guitar" };
  });
  if (fxReturn) {
    fxReturn.name = "Dark Plate Return";
    fxReturn.volume = 0.32;
  }
  if (master) {
    master.name = "Metal Master";
    master.volume = 0.94;
  }
  addHeavyMetalFx(project);
  return project;
}

function addHeavyMetalFx(project: PocketDawProject) {
  addSlots(project, "guitar", [
    proEqSlot("metal_guitar_eq", "Metal Guitar EQ", "drum-punch"),
    { id: "metal_guitar_saturation", type: "saturation", name: "Tight Amp Drive", enabled: true, parameters: { drive: 2.4, mix: 0.62 } },
    { id: "metal_guitar_gate", type: "noise-gate", name: "Palm-Mute Gate", enabled: true, parameters: { threshold: -38, release: 0.045 } }
  ]);
  addSlots(project, "drums", [
    proEqSlot("metal_drums_eq", "Metal Drum Punch EQ", "drum-punch"),
    { id: "metal_drums_compressor", type: "compressor", name: "Drum Smash", enabled: true, parameters: { threshold: -18, ratio: 4.2, attack: 0.004, release: 0.11 } }
  ]);
  addSlots(project, "bass", [
    proEqSlot("metal_bass_eq", "Metal Bass Pocket EQ", "warm-bass-pocket"),
    { id: "metal_bass_saturation", type: "saturation", name: "Bass Grit", enabled: true, parameters: { drive: 1.65, mix: 0.42 } }
  ]);
  addSlots(project, "master", [
    proEqSlot("metal_master_eq", "Metal Master EQ", "flat"),
    { id: "metal_master_saturation", type: "saturation", name: "Master Edge", enabled: true, parameters: { drive: 1.28, mix: 0.22 } },
    { id: "metal_master_compressor", type: "compressor", name: "Glue Compressor", enabled: true, parameters: { threshold: -16, ratio: 3.4, attack: 0.008, release: 0.14 } },
    { id: "metal_master_limiter", type: "limiter", name: "Final Limiter", enabled: true, parameters: { threshold: -3.2, ratio: 18, attack: 0.002, release: 0.08 } }
  ]);
}

function addSlots(project: PocketDawProject, ownerTrackId: string, slots: FxPluginInstance[]) {
  const track = project.tracks.find((item) => item.id === ownerTrackId);
  const chain = project.fx.chains.find((item) => item.ownerTrackId === ownerTrackId || item.id === track?.fxChainId);
  if (!chain) return;
  const existing = new Set(chain.slots.map((slot) => slot.id));
  for (const slot of slots) {
    if (!existing.has(slot.id)) chain.slots.push(slot);
  }
}

function proEqSlot(id: string, name: string, presetId: string): FxPluginInstance {
  return {
    id,
    type: POCKET_PRO_EQ_TYPE,
    name,
    enabled: true,
    presetId,
    parameters: pocketProEqPresetParameters(presetId)
  };
}

function drumPresetForChunk(chunk: ChunkAnalysis, timeSig: number): string {
  if (timeSig !== 4) return "rock";
  if (chunk.density >= 5.5) return "blast";
  if (chunk.density >= 3.25) return "metal";
  if (chunk.density >= 1.25) return "punk_double";
  return "half_time";
}

function guitarPresetForChunk(chunk: ChunkAnalysis, timeSig: number): string {
  if (timeSig !== 4) return "metal_chug";
  if (chunk.density < 0.65) return "doom_slow";
  if (chunk.density >= 3.25) return "gallop";
  return "metal_chug";
}

function chordDegreeForBar(notes: ParsedMidiNote[], bar: number, ppq: number, timeSig: number, keyRoot: number, scale: "major" | "minor"): number {
  const start = (bar - 1) * timeSig * ppq;
  const end = bar * timeSig * ppq;
  const barNotes = notes.filter((note) => note.startTick < end && note.startTick + note.durationTicks > start);
  if (!barNotes.length) return 0;
  let bestDegree = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const intervals = SCALE_INTERVALS[scale];
  for (let degree = 0; degree < intervals.length; degree += 1) {
    const root = (keyRoot + intervals[degree]) % 12;
    const third = (root + (scale === "minor" && [0, 3, 4].includes(degree) ? 3 : 4)) % 12;
    const fifth = (root + 7) % 12;
    const chord = new Set([root, third, fifth]);
    const score = barNotes.reduce((sum, note) => sum + (chord.has(note.pitch % 12) ? note.durationTicks * Math.max(1, note.velocity) : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestDegree = degree;
    }
  }
  return bestDegree;
}

function inferKeyRoot(notes: ParsedMidiNote[]): number {
  const histogram = new Array<number>(12).fill(0);
  for (const note of notes) histogram[note.pitch % 12] += Math.max(1, note.durationTicks) * Math.max(1, note.velocity);
  let bestRoot = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let root = 0; root < 12; root += 1) {
    const scale = new Set(SCALE_INTERVALS.minor.map((interval) => (root + interval) % 12));
    const score = histogram.reduce((sum, value, pitch) => sum + (scale.has(pitch) ? value : -value * 0.18), 0) + histogram[root] * 0.18;
    if (score > bestScore) {
      bestScore = score;
      bestRoot = root;
    }
  }
  return bestRoot;
}

function keyRootFromProject(project: PocketDawProject | null): number | null {
  if (!project) return null;
  const index = NOTE_NAMES.indexOf(project.project.key);
  return index >= 0 ? index : null;
}

function pitchToScaleDegree(pitch: number, keyRoot: number, scale: "major" | "minor", max: number): number {
  const intervals = SCALE_INTERVALS[scale];
  const octaveOffset = Math.max(0, Math.floor((pitch - (keyRoot + 60)) / 12));
  const pitchClass = ((pitch % 12) + 12) % 12;
  let bestDegree = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  intervals.forEach((interval, degree) => {
    const scalePitch = (keyRoot + interval) % 12;
    const distance = Math.min(Math.abs(scalePitch - pitchClass), 12 - Math.abs(scalePitch - pitchClass));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDegree = degree;
    }
  });
  return clampInt(bestDegree + octaveOffset * 7, 0, max);
}

function scaleDegreeToApproxPitch(degree: number, keyRoot: number, scale: "major" | "minor"): number {
  const intervals = SCALE_INTERVALS[scale];
  return 48 + keyRoot + intervals[degree % 7] + Math.floor(degree / 7) * 12;
}

function isDrumNote(note: ParsedMidiNote): boolean {
  return note.channel === 9;
}

function drumLaneForPitch(pitch: number): DrumLane | null {
  if ([35, 36].includes(pitch)) return "kick";
  if ([38, 40, 37, 39].includes(pitch)) return "snare";
  if ([42, 44, 46, 49, 51, 52, 55, 57, 59].includes(pitch)) return "hat";
  return null;
}

function tickToChunkStep(tick: number, ppq: number, timeSig: number, startBar: number): number {
  const chunkStartTick = (startBar - 1) * timeSig * ppq;
  const stepTicks = ppq / 4;
  return Math.round((tick - chunkStartTick) / Math.max(1, stepTicks));
}

function emptyGrid(stepCount: number): Record<DrumLane | "bass", number[]> {
  return {
    kick: new Array<number>(stepCount).fill(0),
    snare: new Array<number>(stepCount).fill(0),
    hat: new Array<number>(stepCount).fill(0),
    bass: new Array<number>(stepCount).fill(0)
  };
}

function emptyGridTuplets(stepCount: number): Record<DrumLane | "bass", boolean[]> {
  return {
    kick: new Array<boolean>(stepCount).fill(false),
    snare: new Array<boolean>(stepCount).fill(false),
    hat: new Array<boolean>(stepCount).fill(false),
    bass: new Array<boolean>(stepCount).fill(false)
  };
}

function accentGrid(stepCount: number, timeSig: number, resolution: number): boolean[] {
  return Array.from({ length: stepCount }, (_value, step) => step % (timeSig * resolution) === 0);
}

function maxTick(notes: ParsedMidiNote[]): number {
  return notes.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), 0);
}

function titleFromFileName(fileName: string | undefined): string | null {
  if (!fileName) return null;
  const base = fileName.split(/[\\/]/).pop()?.replace(/\.(mid|midi)$/i, "").replace(/[-_.]+/g, " ").trim();
  return base ? `${base} - Heavy Metal Arrangement` : null;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
