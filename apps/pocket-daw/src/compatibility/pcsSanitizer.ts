import type { JsonObject, JsonValue } from "../daw/schema";
import { DEFAULT_FX, DEFAULT_MASTER_VOLUME, DEFAULT_STEM_MIX } from "../../../../packages/pocket-audio-core/src/constants.js";
import { CHORDSMITH_CHORD_PLAY_MODES, CHORDSMITH_CHORD_RHYTHM_MODES } from "../../../../packages/pocket-audio-core/src/performance/chord-rhythm.js";
import {
  DEFAULT_LOFI_TEXTURE,
  getLofiStylePreset,
  LOFI_AUDIO_PROFILE_ID,
  LOFI_BASS_TONES,
  LOFI_DRUM_GROOVE_PRESETS,
  LOFI_DRUM_KITS,
  LOFI_STYLE_PRESET_IDS,
  normaliseLofiTexture
} from "../../../../packages/pocket-audio-core/src/presets/lofi.js";
import {
  CHIP_AUDIO_PROFILE_ID,
  CHIP_BASS_TONES,
  CHIP_DRUM_GROOVE_PRESETS,
  CHIP_DRUM_KITS,
  CHIP_STYLE_PRESET_IDS,
  DEFAULT_CHIP_PRESET_ID,
  normaliseChipTexture
} from "../../../../packages/pocket-audio-core/src/presets/chip.js";
import {
  DEFAULT_METAL_PRESET_ID,
  getMetalStylePreset,
  HEAVY_METAL_AUDIO_PROFILE_ID,
  METAL_BASS_TONES,
  METAL_DRUM_GROOVE_PRESETS,
  METAL_DRUM_KITS,
  METAL_STYLE_PRESET_IDS,
  normaliseMetalTexture
} from "../../../../packages/pocket-audio-core/src/presets/metal.js";
import { DEFAULT_CHORD_INSTRUMENT, DEFAULT_MELODY_INSTRUMENT, POCKET_CHORD_INSTRUMENTS, POCKET_MELODY_INSTRUMENTS } from "../../../../packages/pocket-audio-core/src/sounds/instruments.js";
import { DEFAULT_GUITAR_REGISTER, DEFAULT_GUITAR_STRUM_MODE, DEFAULT_GUITAR_TONE, POCKET_GUITAR_PATTERN_PRESETS, POCKET_GUITAR_REGISTERS, POCKET_GUITAR_STRUM_MODES, POCKET_GUITAR_TONES } from "../../../../packages/pocket-audio-core/src/sounds/guitar.js";

export const SECTION_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface SanitizedPcsSection {
  id: SectionId;
  bars: number;
  active: boolean;
  progression: number[];
  grid: Record<"kick" | "snare" | "hat" | "bass", number[]>;
  gridTuplets: Record<"kick" | "snare" | "hat" | "bass", boolean[]>;
  melodyTracks: Array<Array<number | null>>;
  melodyInstruments: string[];
  melodyOctaves: number[];
  melodyMute: boolean[];
  melodySolo: boolean[];
  melodyPan: number[];
  melodyHold: boolean[][];
  melodySlide: boolean[][];
  melodyTuplets: boolean[][];
  bassNotes: Array<number | null>;
  bassHold: boolean[];
  bassSlide: boolean[];
  bassAccent: boolean[];
  guitarPattern: string[];
}

export interface SanitizedPcsProject {
  projectVersion: number;
  key: string;
  scale: "major" | "minor";
  timeSig: number;
  bpm: number;
  swing: number;
  audioProfile: "standard" | "lofi_chill" | "chip_tune" | "heavy_metal";
  lofiPreset: string;
  lofiTexture: JsonObject;
  chipPreset: string;
  chipTexture: JsonObject;
  metalPreset: string;
  metalTexture: JsonObject;
  drumKit: string;
  drumGroovePreset: string;
  bassTone: string;
  resolution: number;
  chordType: "triad" | "seventh" | "sus2" | "sus4";
  chordInstrument: string;
  chordPlayMode: string;
  chordRhythmMode: string;
  chordOctave: number;
  melodyPitchMode: "scale" | "chromatic";
  masterVolume: number;
  chordVolume: number;
  beatVolume: number;
  leadVolume: number;
  chordsOn: boolean;
  bassOn: boolean;
  bassMode: "auto" | "manual";
  guitarEnabled: boolean;
  guitarTone: string;
  guitarRegister: string;
  guitarStrumMode: string;
  guitarPatternPreset: string;
  guitarVolume: number;
  fxDelay: number;
  fxChorus: number;
  fxFlanger: number;
  fxReverb: number;
  fxMix: number;
  humanizeOn: boolean;
  sidechainOn: boolean;
  sidechainAmount: number;
  sectionBars: Record<SectionId, number>;
  songSequence: SectionId[];
  rawTitle: string;
  sections: Record<SectionId, SanitizedPcsSection>;
  original: JsonValue;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DRUM_TRACKS = ["kick", "snare", "hat", "bass"] as const;
const MAX_BARS = 16;
const DEFAULT_PROGRESSION = [0, 4, 5, 3];
const PCS_DRUM_KITS = ["classic", ...LOFI_DRUM_KITS, ...CHIP_DRUM_KITS, ...METAL_DRUM_KITS] as const;
const PCS_BASS_TONES = ["classic", ...LOFI_BASS_TONES, ...CHIP_BASS_TONES, ...METAL_BASS_TONES] as const;

export function sanitizePocketChordsmithProject(raw: unknown): SanitizedPcsProject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("That project is not a valid Pocket Chordsmith JSON object.");
  }
  const obj = raw as JsonObject;
  const requestedChipPreset = obj.chipPreset || (String(obj.stylePreset || "").startsWith("chip_") ? obj.stylePreset : "");
  const requestedMetalPreset = obj.metalPreset || (String(obj.stylePreset || "").startsWith("metal_") ? obj.stylePreset : "");
  const requestedLofiPreset = obj.lofiPreset || (String(obj.stylePreset || "").startsWith("lofi_") ? obj.stylePreset : "");
  const sanitizedChipPreset = sanitizeChipPresetId(requestedChipPreset);
  const sanitizedMetalPreset = sanitizeMetalPresetId(requestedMetalPreset);
  const sanitizedLofiPreset = sanitizeLofiPresetId(requestedLofiPreset);
  const audioProfile = (obj.audioProfile === CHIP_AUDIO_PROFILE_ID || sanitizedChipPreset
    ? CHIP_AUDIO_PROFILE_ID
    : obj.audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID || sanitizedMetalPreset
      ? HEAVY_METAL_AUDIO_PROFILE_ID
      : obj.audioProfile === LOFI_AUDIO_PROFILE_ID || sanitizedLofiPreset
        ? LOFI_AUDIO_PROFILE_ID
        : "standard") as SanitizedPcsProject["audioProfile"];
  const lofiPreset = audioProfile === LOFI_AUDIO_PROFILE_ID ? getLofiStylePreset(sanitizedLofiPreset || undefined).id : "";
  const chipPreset = audioProfile === CHIP_AUDIO_PROFILE_ID ? sanitizedChipPreset || DEFAULT_CHIP_PRESET_ID : "";
  const metalPreset = audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID ? sanitizedMetalPreset || DEFAULT_METAL_PRESET_ID : "";
  const metalStylePreset = metalPreset ? getMetalStylePreset(metalPreset) : null;
  const defaultScale = audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID ? "minor" : "major";
  const projectBase = {
    projectVersion: asInt(obj.projectVersion ?? obj.schemaVersion, 1),
    key: safeChoice(obj.key, NOTES, "C"),
    scale: safeChoice(obj.scale, ["major", "minor"], defaultScale) as "major" | "minor",
    timeSig: safeChoice(asInt(obj.timeSig, 4), [3, 4, 5, 6, 7], 4),
    bpm: clamp(asInt(obj.bpm, metalStylePreset?.bpm.default ?? 96), 40, 240),
    swing: clamp(asNum(obj.swing, 0), 0, 0.35),
    audioProfile,
    lofiPreset,
    lofiTexture: sanitizeLofiTexture(obj.lofiTexture, lofiPreset, audioProfile),
    chipPreset,
    chipTexture: sanitizeChipTexture(obj.chipTexture, chipPreset, audioProfile),
    metalPreset,
    metalTexture: sanitizeMetalTexture(obj.metalTexture, metalPreset, audioProfile),
    drumKit: safeChoice(obj.drumKit, PCS_DRUM_KITS, metalStylePreset?.drumKit ?? "classic"),
    drumGroovePreset: sanitizeDrumGroovePreset(obj.drumGroovePreset, lofiPreset, chipPreset, metalPreset, audioProfile),
    bassTone: safeChoice(obj.bassTone, PCS_BASS_TONES, metalStylePreset?.bassTone ?? "classic"),
    resolution: sanitizeResolution(obj.resolution ?? obj.lastAdvancedResolution ?? 4),
    chordType: safeChoice(obj.chordType, ["triad", "seventh", "sus2", "sus4"], "triad") as SanitizedPcsProject["chordType"],
    chordInstrument: safeChoice(obj.chordInstrument, POCKET_CHORD_INSTRUMENTS, metalStylePreset?.chordInstrument ?? DEFAULT_CHORD_INSTRUMENT),
    chordPlayMode: safeChoice(obj.chordPlayMode, CHORDSMITH_CHORD_PLAY_MODES, "block"),
    chordRhythmMode: safeChoice(obj.chordRhythmMode, CHORDSMITH_CHORD_RHYTHM_MODES, "sustain"),
    chordOctave: clamp(asInt(obj.chordOctave, 0), -2, 2),
    melodyPitchMode: safeChoice(obj.melodyPitchMode, ["scale", "chromatic"], "scale") as "scale" | "chromatic",
    masterVolume: clamp(asNum(obj.masterVolume ?? obj.masterVol, DEFAULT_MASTER_VOLUME), 0, 1),
    chordVolume: clamp(asNum(obj.chordVolume ?? obj.chordVol, DEFAULT_STEM_MIX.chords.volume), 0, 1),
    beatVolume: clamp(asNum(obj.beatVolume ?? obj.beatVol, DEFAULT_STEM_MIX.drums.volume), 0, 1),
    leadVolume: clamp(asNum(obj.leadVolume ?? obj.leadVol, DEFAULT_STEM_MIX.melody.volume), 0, 1),
    chordsOn: obj.chordsOn !== false,
    bassOn: obj.bassOn !== false,
    bassMode: safeChoice(obj.bassMode, ["auto", "manual"], "auto") as "auto" | "manual",
    guitarEnabled: Boolean(obj.guitarEnabled ?? (audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID)),
    guitarTone: safeChoice(obj.guitarTone, POCKET_GUITAR_TONES, metalStylePreset?.guitarTone ?? DEFAULT_GUITAR_TONE),
    guitarRegister: safeChoice(obj.guitarRegister, POCKET_GUITAR_REGISTERS, DEFAULT_GUITAR_REGISTER),
    guitarStrumMode: safeChoice(obj.guitarStrumMode, POCKET_GUITAR_STRUM_MODES, DEFAULT_GUITAR_STRUM_MODE),
    guitarPatternPreset: safeChoice(obj.guitarPatternPreset, POCKET_GUITAR_PATTERN_PRESETS, metalStylePreset?.guitarPatternPreset ?? "metal_chug"),
    guitarVolume: clamp(asNum(obj.guitarVolume, DEFAULT_STEM_MIX.guitar.volume), 0, 1),
    fxDelay: clamp(asNum(obj.fxDelay, DEFAULT_FX.delay), 0, 1),
    fxChorus: clamp(asNum(obj.fxChorus, DEFAULT_FX.chorus), 0, 1),
    fxFlanger: clamp(asNum(obj.fxFlanger, DEFAULT_FX.flanger), 0, 1),
    fxReverb: clamp(asNum(obj.fxReverb, DEFAULT_FX.reverb), 0, 1),
    fxMix: clamp(asNum(obj.fxMix, DEFAULT_FX.mix), 0, 1),
    humanizeOn: !!obj.humanizeOn,
    sidechainOn: !!(obj.sidechainOn ?? obj.pumpChordsEnabled),
    sidechainAmount: clamp(asNum(obj.sidechainAmount ?? obj.pumpAmount, DEFAULT_FX.sidechain.amount), 0, 1),
    sectionBars: sanitizeSectionBars((obj.sectionBars || obj.sectionLengths) as Record<string, unknown> | undefined),
    songSequence: sanitizeSequence(obj.songSequence || obj.sectionSequence),
    rawTitle: String(obj.title || obj.name || "Imported Chordsmith Project")
  };

  const sections = {} as Record<SectionId, SanitizedPcsSection>;
  SECTION_IDS.forEach((id) => {
    sections[id] = sanitizeSection(obj, { ...projectBase, sections } as SanitizedPcsProject, id);
  });

  return {
    ...projectBase,
    sections,
    original: JSON.parse(JSON.stringify(raw)) as JsonValue
  };
}

function sanitizeLofiPresetId(value: unknown): string {
  const id = String(value || "");
  return (LOFI_STYLE_PRESET_IDS as readonly string[]).includes(id) ? id : "";
}

function sanitizeChipPresetId(value: unknown): string {
  const id = String(value || "");
  return (CHIP_STYLE_PRESET_IDS as readonly string[]).includes(id) ? id : "";
}

function sanitizeMetalPresetId(value: unknown): string {
  const id = String(value || "");
  return (METAL_STYLE_PRESET_IDS as readonly string[]).includes(id) ? id : "";
}

function sanitizeDrumGroovePreset(value: unknown, lofiPreset: string, chipPreset: string, metalPreset: string, audioProfile: SanitizedPcsProject["audioProfile"]): string {
  const id = String(value || "");
  if (audioProfile === CHIP_AUDIO_PROFILE_ID) {
    if ((CHIP_DRUM_GROOVE_PRESETS as readonly string[]).includes(id)) return id;
    return chipPreset ? "chip_run_128" : "";
  }
  if (audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID) {
    if ((METAL_DRUM_GROOVE_PRESETS as readonly string[]).includes(id)) return id;
    return metalPreset ? getMetalStylePreset(metalPreset).drumGroovePreset : "";
  }
  if (audioProfile === LOFI_AUDIO_PROFILE_ID) {
    if ((LOFI_DRUM_GROOVE_PRESETS as readonly string[]).includes(id)) return id;
    return getLofiStylePreset(lofiPreset || undefined).drumGroovePreset || "";
  }
  return "";
}

function sanitizeLofiTexture(raw: unknown, lofiPreset: string, audioProfile: SanitizedPcsProject["audioProfile"]): JsonObject {
  if (audioProfile !== LOFI_AUDIO_PROFILE_ID) {
    return { ...DEFAULT_LOFI_TEXTURE, enabled: false } as JsonObject;
  }
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as JsonObject) : {};
  return normaliseLofiTexture(source, getLofiStylePreset(lofiPreset || undefined)) as JsonObject;
}

function sanitizeChipTexture(raw: unknown, chipPreset: string, audioProfile: SanitizedPcsProject["audioProfile"]): JsonObject {
  if (audioProfile !== CHIP_AUDIO_PROFILE_ID) {
    return normaliseChipTexture({ enabled: false }, chipPreset) as JsonObject;
  }
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as JsonObject) : {};
  return normaliseChipTexture(source, chipPreset) as JsonObject;
}

function sanitizeMetalTexture(raw: unknown, metalPreset: string, audioProfile: SanitizedPcsProject["audioProfile"]): JsonObject {
  if (audioProfile !== HEAVY_METAL_AUDIO_PROFILE_ID) {
    return normaliseMetalTexture({ enabled: false }, getMetalStylePreset(metalPreset || undefined)) as JsonObject;
  }
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as JsonObject) : {};
  return normaliseMetalTexture(source, getMetalStylePreset(metalPreset || undefined)) as JsonObject;
}

function sanitizeSection(raw: JsonObject, project: SanitizedPcsProject, id: SectionId): SanitizedPcsSection {
  const bars = clamp(asInt(project.sectionBars[id], 4), 1, MAX_BARS);
  const len = expectedSectionSteps(raw, project, id, bars);
  const progressionRaw = raw[sectionKey("progression", id)];
  const grid = sanitizeGrid(raw[sectionKey("grid", id)], len);
  const gridTuplets = sanitizeGridTuplets(raw[sectionKey("gridTuplets", id)], len);
  const melodyTracks = sanitizeMelodyTracks(raw[sectionKey("melodyTracks", id)] || raw[sectionKey("melody", id)], len);
  const trackCount = melodyTracks.length;
  const defaultMelodyInstrument =
    project.audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID && project.metalPreset
      ? getMetalStylePreset(project.metalPreset).melodyInstrument
      : DEFAULT_MELODY_INSTRUMENT;
  const guitarPattern = fitArray(raw[sectionKey("guitarPattern", id)] || raw[sectionKey("rockGuitar", id)], len, "off", normalizeGuitarArt);
  const bassNotes = fitArray(raw[sectionKey("bassNotes", id)], len, null, (v) => normalizeMaybeNote(v, 13));
  const sequenceHas = project.songSequence.includes(id);
  const active =
    id === "A" ||
    sequenceHas ||
    gridHasHits(grid) ||
    tracksHaveNotes(melodyTracks) ||
    bassNotes.some((v) => v !== null) ||
    (project.guitarEnabled && guitarHasPattern(guitarPattern)) ||
    progressionDiffers(progressionRaw);

  return {
    id,
    bars,
    active,
    progression: sanitizeProgression(progressionRaw),
    grid,
    gridTuplets,
    melodyTracks,
    melodyInstruments: ensureTrackArray(raw[sectionKey("melodyInstruments", id)], trackCount, defaultMelodyInstrument, (v) => safeChoice(v, POCKET_MELODY_INSTRUMENTS, defaultMelodyInstrument)),
    melodyOctaves: ensureTrackArray(raw[sectionKey("melodyOctaves", id)], trackCount, 0, (v) => clamp(asInt(v, 0), -2, 2)),
    melodyMute: ensureTrackArray(raw[sectionKey("melodyMute", id)], trackCount, false, Boolean),
    melodySolo: ensureTrackArray(raw[sectionKey("melodySolo", id)], trackCount, false, Boolean),
    melodyPan: ensureTrackArray(raw[sectionKey("melodyPan", id)], trackCount, 0, (v) => clamp(asNum(v, 0), -1, 1)),
    melodyHold: ensureTrackGrid(raw[sectionKey("melodyHold", id)], trackCount, len, false, Boolean),
    melodySlide: ensureTrackGrid(raw[sectionKey("melodySlide", id)], trackCount, len, false, Boolean),
    melodyTuplets: ensureTrackGrid(raw[sectionKey("melodyTuplets", id)], trackCount, len, false, Boolean),
    bassNotes,
    bassHold: fitArray(raw[sectionKey("bassHold", id)], len, false, Boolean),
    bassSlide: fitArray(raw[sectionKey("bassSlide", id)], len, false, Boolean),
    bassAccent: fitArray(raw[sectionKey("bassAccent", id)], len, false, Boolean),
    guitarPattern
  };
}

function sectionKey(base: string, id: SectionId) {
  return `${base}${id}`;
}

function sanitizeSectionBars(raw?: Record<string, unknown>) {
  const out = {} as Record<SectionId, number>;
  SECTION_IDS.forEach((id) => {
    out[id] = clamp(asInt(raw?.[id], 4), 1, MAX_BARS);
  });
  return out;
}

function sanitizeSequence(raw: unknown): SectionId[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x || "A").toUpperCase())
    .filter((x): x is SectionId => (SECTION_IDS as readonly string[]).includes(x))
    .slice(0, 128);
}

function sanitizeResolution(v: unknown): number {
  const n = asInt(v, 4);
  return [1, 2, 4, 8, 16].includes(n) ? n : 4;
}

function expectedSectionSteps(raw: JsonObject, project: Pick<SanitizedPcsProject, "timeSig" | "resolution">, id: SectionId, bars: number) {
  const minimum = bars * project.timeSig * project.resolution;
  const observed = [
    ...observedGridLengths(raw[sectionKey("grid", id)]),
    ...observedGridLengths(raw[sectionKey("gridTuplets", id)]),
    observedLength(raw[sectionKey("bassNotes", id)]),
    observedLength(raw[sectionKey("bassHold", id)]),
    observedLength(raw[sectionKey("bassSlide", id)]),
    observedLength(raw[sectionKey("bassAccent", id)]),
    observedLength(raw[sectionKey("guitarPattern", id)]),
    observedTrackLength(raw[sectionKey("melodyTracks", id)] || raw[sectionKey("melody", id)]),
    observedTrackLength(raw[sectionKey("melodyHold", id)]),
    observedTrackLength(raw[sectionKey("melodySlide", id)]),
    observedTrackLength(raw[sectionKey("melodyTuplets", id)])
  ];
  return Math.max(minimum, ...observed.filter((len) => len > 0));
}

function observedGridLengths(raw: unknown): number[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return DRUM_TRACKS.map((track) => observedLength((raw as Record<string, unknown>)[track]));
}

function observedTrackLength(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return raw.reduce((max, track) => Math.max(max, observedLength(track)), 0);
}

function observedLength(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

function sanitizeProgression(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : DEFAULT_PROGRESSION;
  const out: number[] = [];
  for (let i = 0; i < MAX_BARS; i += 1) out.push(degreeFromAny(arr[i], DEFAULT_PROGRESSION[i] ?? 0));
  return out;
}

function sanitizeGrid(raw: unknown, len: number) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<(typeof DRUM_TRACKS)[number], number[]>;
  DRUM_TRACKS.forEach((track) => {
    out[track] = fitArray(obj[track], len, 0, normalizeBeat);
  });
  return out;
}

function sanitizeGridTuplets(raw: unknown, len: number) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<(typeof DRUM_TRACKS)[number], boolean[]>;
  DRUM_TRACKS.forEach((track) => {
    out[track] = fitArray(obj[track], len, false, Boolean);
  });
  return out;
}

function sanitizeMelodyTracks(raw: unknown, len: number) {
  const source = Array.isArray(raw) && raw.length ? raw : [];
  const tracks = source.slice(0, 8).map((t) => fitArray(t, len, null, (v) => normalizeMaybeNote(v, 23)));
  return tracks.length ? tracks : [new Array<number | null>(len).fill(null)];
}

function ensureTrackArray<T>(raw: unknown, count: number, fallback: T, normalizer: (v: unknown) => T): T[] {
  const arr = Array.isArray(raw) ? raw.slice(0, count) : [];
  while (arr.length < count) arr.push(fallback);
  return arr.map((v) => normalizer(v));
}

function ensureTrackGrid<T>(raw: unknown, count: number, len: number, fill: T, normalizer: (v: unknown) => T): T[][] {
  const arr = Array.isArray(raw) ? raw.slice(0, count) : [];
  while (arr.length < count) arr.push([]);
  return arr.map((track) => fitArray(track, len, fill, normalizer));
}

function fitArray<T>(source: unknown, len: number, fill: T, normalizer: (v: unknown) => T): T[] {
  const out = new Array<T>(len).fill(fill);
  const arr = Array.isArray(source) ? source : [];
  if (!arr.length) return out;
  if (arr.length === len) return arr.map((v) => normalizer(v));
  arr.slice(0, len).forEach((value, i) => {
    out[i] = normalizer(value);
  });
  return out;
}

function gridHasHits(grid: SanitizedPcsSection["grid"]) {
  return DRUM_TRACKS.some((track) => grid[track].some((v) => normalizeBeat(v) > 0));
}

function tracksHaveNotes(tracks: SanitizedPcsSection["melodyTracks"]) {
  return tracks.some((track) => track.some((v) => v !== null && v !== undefined));
}

function guitarHasPattern(pattern: string[]) {
  return pattern.some((v) => normalizeGuitarArt(v) !== "off");
}

function progressionDiffers(raw: unknown) {
  if (!Array.isArray(raw)) return false;
  return raw.some((v, i) => degreeFromAny(v, DEFAULT_PROGRESSION[i] ?? 0) !== (DEFAULT_PROGRESSION[i] ?? 0));
}

function degreeFromAny(value: unknown, fallback = 0) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return clamp(asInt((value as Record<string, unknown>).degree, fallback), 0, 6);
  }
  return clamp(asInt(value, fallback), 0, 6);
}

function normalizeBeat(value: unknown) {
  if (value === true) return 1;
  if (value === false || value === null || value === undefined) return 0;
  return clamp(asInt(value, 0), 0, 2);
}

function normalizeMaybeNote(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  return clamp(asInt(value, 0), 0, max);
}

function normalizeGuitarArt(value: unknown): string {
  const v = String(value || "off").toLowerCase();
  if (["open", "chug", "accent", "hold", "scratch"].includes(v)) return v;
  if (["mute", "palm", "pm"].includes(v)) return "chug";
  if (v === "sustain") return "hold";
  return "off";
}

function safeChoice<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asInt(v: unknown, fallback: number): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
