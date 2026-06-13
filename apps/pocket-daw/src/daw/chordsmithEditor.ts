import type { Clip, PocketDawProject, SourceRef } from "./schema";
import { cloneProject } from "./dawProject";
import { SECTION_IDS, type SanitizedPcsProject, type SanitizedPcsSection, type SectionId } from "../compatibility/pcsSanitizer";

export type DrumLane = "kick" | "snare" | "hat";
export interface ChordsmithGlobalPatch {
  key?: string;
  scale?: string;
  bpm?: number;
  swing?: number;
  timeSig?: number;
  resolution?: number;
}
export type GuitarSettingsPatch = Partial<Pick<SanitizedPcsProject, "guitarEnabled" | "guitarTone" | "guitarRegister" | "guitarStrumMode" | "guitarVolume">>;

const SECTION_COLORS: Record<string, string> = {
  A: "#40d8ff",
  B: "#7cff9b",
  C: "#b88cff",
  D: "#ff68c8",
  E: "#ffc857",
  F: "#5cf1d6",
  G: "#ff7a7a",
  H: "#9db2ff"
};

const BASS_CYCLE: Array<number | null> = [null, 0, 4, 7, 11];
const MELODY_CYCLE: Array<number | null> = [null, 0, 2, 4, 7, 9, 12];
const GUITAR_CYCLE = ["off", "chug", "accent", "hold", "scratch"];
const GUITAR_TONES = ["clean", "crunch", "high_gain", "muted", "wide"];
const GUITAR_REGISTERS = ["low", "mid", "high"];
const GUITAR_STRUM_MODES = ["down", "up", "alternate"];

export function getPrimaryChordsmithSource(project: PocketDawProject): SanitizedPcsProject | null {
  const ref = getPrimaryChordsmithSourceRef(project);
  return (ref?.normalized as unknown as SanitizedPcsProject) || null;
}

export function setSectionBars(project: PocketDawProject, sectionId: SectionId, bars: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (pcs, section) => {
    const safeBars = clamp(Math.round(bars), 1, 16);
    section.bars = safeBars;
    pcs.sectionBars[sectionId] = safeBars;
  });
}

export function appendChordsmithSection(project: PocketDawProject, sectionId: SectionId): PocketDawProject {
  return editChordsmithProject(project, (pcs, next) => {
    const section = pcs.sections[sectionId];
    if (!section) return;
    section.active = true;
    pcs.songSequence.push(sectionId);
    const clip: Clip = {
      id: nextGeneratedSectionClipId(next),
      type: "generated-section",
      trackId: "arrangement",
      sourceRefId: getPrimaryChordsmithSourceRef(next)?.id,
      sectionId,
      startBar: next.timeline.clips.reduce((bar, item) => Math.max(bar, item.startBar + item.barLength), 1),
      barLength: section.bars,
      name: `Section ${sectionId}`,
      muted: false,
      color: SECTION_COLORS[sectionId] || "#40d8ff",
      linked: true,
      transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} },
      lane: 0,
      metadata: { sourceIndex: pcs.songSequence.length - 1, sectionBars: section.bars }
    };
    next.timeline.clips.push(clip);
  });
}

export function setSectionChord(project: PocketDawProject, sectionId: SectionId, barIndex: number, degree: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    section.progression[barIndex] = clamp(Math.round(degree), 0, 6);
  });
}

export function setChordsmithGlobals(project: PocketDawProject, patch: ChordsmithGlobalPatch): PocketDawProject {
  return editChordsmithProject(project, (pcs, next) => {
    if (patch.key !== undefined) pcs.key = safeText(patch.key, "C");
    if (patch.scale !== undefined) pcs.scale = safeScale(patch.scale);
    if (patch.bpm !== undefined) pcs.bpm = clamp(Math.round(patch.bpm), 40, 240);
    if (patch.swing !== undefined) pcs.swing = clamp(Number(patch.swing), 0, 0.35);
    if (patch.timeSig !== undefined) pcs.timeSig = safeTimeSig(patch.timeSig);
    if (patch.resolution !== undefined) pcs.resolution = safeResolution(patch.resolution);
    next.project.key = pcs.key;
    next.project.scale = pcs.scale;
    next.project.bpm = pcs.bpm;
    next.project.swing = pcs.swing;
    next.project.timeSig = pcs.timeSig;
    next.project.resolution = pcs.resolution;
  });
}

export function cycleDrumStep(project: PocketDawProject, sectionId: SectionId, lane: DrumLane, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    section.grid[lane][step] = ((section.grid[lane][step] || 0) + 1) % 3;
  });
}

export function cycleDrumTuplet(project: PocketDawProject, sectionId: SectionId, lane: DrumLane, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureStep(section.gridTuplets[lane], step, false);
    section.gridTuplets[lane][step] = !section.gridTuplets[lane][step];
  });
}

export function cycleBassStep(project: PocketDawProject, sectionId: SectionId, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (pcs, section) => {
    const current = section.bassNotes[step] ?? null;
    section.bassNotes[step] = nextCycleValue(BASS_CYCLE, current);
    section.bassAccent[step] = section.bassNotes[step] !== null && step % Math.max(1, pcs.resolution * pcs.timeSig) === 0;
    pcs.bassMode = section.bassNotes.some((note) => note !== null) ? "manual" : pcs.bassMode;
  });
}

export function setBassMode(project: PocketDawProject, mode: string): PocketDawProject {
  return editChordsmithProject(project, (pcs) => {
    pcs.bassMode = mode === "manual" ? "manual" : "auto";
  });
}

export function toggleBassHold(project: PocketDawProject, sectionId: SectionId, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureStep(section.bassHold, step, false);
    section.bassHold[step] = !section.bassHold[step];
  });
}

export function toggleBassSlide(project: PocketDawProject, sectionId: SectionId, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureStep(section.bassSlide, step, false);
    section.bassSlide[step] = !section.bassSlide[step];
  });
}

export function toggleBassTuplet(project: PocketDawProject, sectionId: SectionId, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureStep(section.gridTuplets.bass, step, false);
    section.gridTuplets.bass[step] = !section.gridTuplets.bass[step];
  });
}

export function toggleBassAccent(project: PocketDawProject, sectionId: SectionId, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (pcs, section) => {
    ensureStep(section.bassAccent, step, false);
    section.bassAccent[step] = !section.bassAccent[step];
    pcs.bassMode = "manual";
  });
}

export function cycleMelodyStep(project: PocketDawProject, sectionId: SectionId, trackIndex: number, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    const current = section.melodyTracks[trackIndex][step] ?? null;
    section.melodyTracks[trackIndex][step] = nextCycleValue(MELODY_CYCLE, current);
  });
}

export function setMelodyInstrument(project: PocketDawProject, sectionId: SectionId, trackIndex: number, instrument: string): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    section.melodyInstruments[trackIndex] = safeInstrumentName(instrument);
  }, (next) => {
    const track = next.tracks.find((item) => item.role === "melody" && item.metadata?.chordsmithMelodyTrackIndex === trackIndex);
    if (track) {
      track.metadata = { ...(track.metadata || {}), chordsmithInstrument: safeInstrumentName(instrument) };
      track.name = `Melody ${trackIndex + 1} - ${titleCase(safeInstrumentName(instrument).replace(/_/g, " "))}`;
    }
  });
}

export function setMelodyOctave(project: PocketDawProject, sectionId: SectionId, trackIndex: number, octave: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    section.melodyOctaves[trackIndex] = clamp(Math.round(octave), -3, 3);
  });
}

export function setMelodyPan(project: PocketDawProject, sectionId: SectionId, trackIndex: number, pan: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    section.melodyPan[trackIndex] = clamp(Number(pan), -1, 1);
  });
}

export function setMelodyMute(project: PocketDawProject, sectionId: SectionId, trackIndex: number, muted: boolean): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    section.melodyMute[trackIndex] = muted;
  });
}

export function setMelodySolo(project: PocketDawProject, sectionId: SectionId, trackIndex: number, solo: boolean): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    section.melodySolo[trackIndex] = solo;
  });
}

export function toggleMelodyHold(project: PocketDawProject, sectionId: SectionId, trackIndex: number, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    ensureStep(section.melodyHold[trackIndex], step, false);
    section.melodyHold[trackIndex][step] = !section.melodyHold[trackIndex][step];
  });
}

export function toggleMelodySlide(project: PocketDawProject, sectionId: SectionId, trackIndex: number, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    ensureStep(section.melodySlide[trackIndex], step, false);
    section.melodySlide[trackIndex][step] = !section.melodySlide[trackIndex][step];
  });
}

export function toggleMelodyTuplet(project: PocketDawProject, sectionId: SectionId, trackIndex: number, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (_pcs, section) => {
    ensureMelodyTrack(section, trackIndex);
    ensureStep(section.melodyTuplets[trackIndex], step, false);
    section.melodyTuplets[trackIndex][step] = !section.melodyTuplets[trackIndex][step];
  });
}

export function cycleGuitarStep(project: PocketDawProject, sectionId: SectionId, step: number): PocketDawProject {
  return editChordsmithSection(project, sectionId, (pcs, section) => {
    const current = section.guitarPattern[step] || "off";
    section.guitarPattern[step] = nextCycleValue(GUITAR_CYCLE, current);
    if (section.guitarPattern[step] !== "off") pcs.guitarEnabled = true;
  });
}

export function setGuitarSettings(project: PocketDawProject, patch: GuitarSettingsPatch): PocketDawProject {
  return editChordsmithProject(project, (pcs, next) => {
    if (patch.guitarEnabled !== undefined) pcs.guitarEnabled = !!patch.guitarEnabled;
    if (patch.guitarTone !== undefined) pcs.guitarTone = safeChoiceText(patch.guitarTone, GUITAR_TONES, pcs.guitarTone || "high_gain");
    if (patch.guitarRegister !== undefined) pcs.guitarRegister = safeChoiceText(patch.guitarRegister, GUITAR_REGISTERS, pcs.guitarRegister || "low");
    if (patch.guitarStrumMode !== undefined) pcs.guitarStrumMode = safeChoiceText(patch.guitarStrumMode, GUITAR_STRUM_MODES, pcs.guitarStrumMode || "down");
    if (patch.guitarVolume !== undefined) pcs.guitarVolume = clamp(Number(patch.guitarVolume), 0, 1);
    const guitar = next.tracks.find((track) => track.role === "guitar");
    if (guitar) {
      guitar.active = pcs.guitarEnabled;
      guitar.volume = pcs.guitarVolume;
      guitar.metadata = {
        ...(guitar.metadata || {}),
        chordsmithTone: pcs.guitarTone,
        chordsmithRegister: pcs.guitarRegister,
        chordsmithStrumMode: pcs.guitarStrumMode
      };
    }
  });
}

function editChordsmithProject(
  project: PocketDawProject,
  updater: (pcs: SanitizedPcsProject, project: PocketDawProject) => void
): PocketDawProject {
  const next = cloneProject(project);
  const ref = getPrimaryChordsmithSourceRef(next);
  const pcs = (ref?.normalized as unknown as SanitizedPcsProject) || null;
  if (!ref || !pcs) return project;
  updater(pcs, next);
  syncChordsmithOriginalGlobals(ref, pcs);
  ref.normalized = pcs as unknown as SourceRef["normalized"];
  syncGeneratedSectionTimeline(next, pcs);
  return next;
}

function editChordsmithSection(
  project: PocketDawProject,
  sectionId: SectionId,
  updater: (pcs: SanitizedPcsProject, section: SanitizedPcsSection) => void,
  afterSync?: (project: PocketDawProject, pcs: SanitizedPcsProject) => void
): PocketDawProject {
  const next = cloneProject(project);
  const ref = getPrimaryChordsmithSourceRef(next);
  const pcs = (ref?.normalized as unknown as SanitizedPcsProject) || null;
  const section = pcs?.sections?.[sectionId];
  if (!ref || !pcs || !section) return project;
  updater(pcs, section);
  section.active = true;
  syncChordsmithOriginalShadow(ref, pcs, sectionId);
  ref.normalized = pcs as unknown as SourceRef["normalized"];
  syncGeneratedSectionTimeline(next, pcs);
  afterSync?.(next, pcs);
  return next;
}

function getPrimaryChordsmithSourceRef(project: PocketDawProject): SourceRef | null {
  return project.sourceRefs.find((ref) => ref.sourceType === "pocket-chordsmith") || null;
}

function syncGeneratedSectionTimeline(project: PocketDawProject, pcs: SanitizedPcsProject) {
  let bar = 1;
  const sorted = project.timeline.clips
    .filter((clip) => clip.type === "generated-section")
    .slice()
    .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
  sorted.forEach((clip) => {
    if (!clip.sectionId || !pcs.sections[clip.sectionId as SectionId]) return;
    const section = pcs.sections[clip.sectionId as SectionId];
    clip.startBar = bar;
    clip.barLength = section.bars;
    clip.name = `Section ${section.id}`;
    clip.color = SECTION_COLORS[section.id] || clip.color;
    clip.metadata = { ...(clip.metadata || {}), sectionBars: section.bars };
    bar += section.bars;
  });
  const byId = new Map(sorted.map((clip) => [clip.id, clip]));
  project.timeline.clips = project.timeline.clips.map((clip) => byId.get(clip.id) || clip);
  project.timeline.bars = Math.max(1, bar - 1);
  project.timeline.loop.endBar = Math.min(Math.max(project.timeline.loop.endBar, project.timeline.loop.startBar + 1), project.timeline.bars + 1);
  project.timeline.markers = sorted.map((clip) => ({
    id: `marker_${clip.id}`,
    bar: clip.startBar,
    name: clip.sectionId ? `Section ${clip.sectionId}` : clip.name,
    color: clip.color,
    markerType: "section"
  }));
}

function syncChordsmithOriginalShadow(ref: SourceRef, pcs: SanitizedPcsProject, sectionId: SectionId) {
  const original = ref.original;
  if (!original || typeof original !== "object" || Array.isArray(original)) return;
  const target = original as Record<string, unknown>;
  syncChordsmithOriginalGlobals(ref, pcs);
  const section = pcs.sections[sectionId];
  target.sectionBars = { ...((target.sectionBars as Record<string, unknown>) || {}), [sectionId]: section.bars };
  target[`progression${sectionId}`] = section.progression.slice();
  target[`grid${sectionId}`] = {
    kick: section.grid.kick.slice(),
    snare: section.grid.snare.slice(),
    hat: section.grid.hat.slice(),
    bass: section.grid.bass.slice()
  };
  target[`gridTuplets${sectionId}`] = {
    kick: section.gridTuplets.kick.slice(),
    snare: section.gridTuplets.snare.slice(),
    hat: section.gridTuplets.hat.slice(),
    bass: section.gridTuplets.bass.slice()
  };
  target[`bassNotes${sectionId}`] = section.bassNotes.slice();
  target[`bassHold${sectionId}`] = section.bassHold.slice();
  target[`bassSlide${sectionId}`] = section.bassSlide.slice();
  target[`bassAccent${sectionId}`] = section.bassAccent.slice();
  target[`melodyTracks${sectionId}`] = section.melodyTracks.map((track) => track.slice());
  target[`melodyInstruments${sectionId}`] = section.melodyInstruments.slice();
  target[`melodyOctaves${sectionId}`] = section.melodyOctaves.slice();
  target[`melodyMute${sectionId}`] = section.melodyMute.slice();
  target[`melodySolo${sectionId}`] = section.melodySolo.slice();
  target[`melodyPan${sectionId}`] = section.melodyPan.slice();
  target[`melodyHold${sectionId}`] = section.melodyHold.map((track) => track.slice());
  target[`melodySlide${sectionId}`] = section.melodySlide.map((track) => track.slice());
  target[`melodyTuplets${sectionId}`] = section.melodyTuplets.map((track) => track.slice());
  target[`guitarPattern${sectionId}`] = section.guitarPattern.slice();
}

function syncChordsmithOriginalGlobals(ref: SourceRef, pcs: SanitizedPcsProject) {
  const original = ref.original;
  if (!original || typeof original !== "object" || Array.isArray(original)) return;
  const target = original as Record<string, unknown>;
  target.key = pcs.key;
  target.scale = pcs.scale;
  target.bpm = pcs.bpm;
  target.swing = pcs.swing;
  target.timeSig = pcs.timeSig;
  target.resolution = pcs.resolution;
  target.songSequence = pcs.songSequence.slice();
  target.sectionSequence = pcs.songSequence.slice();
  target.bassMode = pcs.bassMode;
  target.guitarEnabled = pcs.guitarEnabled;
  target.guitarTone = pcs.guitarTone;
  target.guitarRegister = pcs.guitarRegister;
  target.guitarStrumMode = pcs.guitarStrumMode;
  target.guitarVolume = pcs.guitarVolume;
}

function ensureMelodyTrack(section: SanitizedPcsSection, trackIndex: number) {
  const len = section.melodyTracks[0]?.length || section.guitarPattern.length;
  while (section.melodyTracks.length <= trackIndex) {
    section.melodyTracks.push(new Array<number | null>(len).fill(null));
    section.melodyInstruments.push("synth");
    section.melodyOctaves.push(0);
    section.melodyMute.push(false);
    section.melodySolo.push(false);
    section.melodyPan.push(0);
    section.melodyHold.push(new Array<boolean>(len).fill(false));
    section.melodySlide.push(new Array<boolean>(len).fill(false));
    section.melodyTuplets.push(new Array<boolean>(len).fill(false));
  }
}

function nextCycleValue<T>(values: T[], current: T): T {
  const index = values.findIndex((value) => value === current);
  return values[(index + 1) % values.length];
}

function ensureStep<T>(values: T[], step: number, fallback: T) {
  while (values.length <= step) values.push(fallback);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function safeTimeSig(value: number) {
  const rounded = Math.round(Number(value));
  return [3, 4, 5, 6, 7].includes(rounded) ? rounded : 4;
}

function safeResolution(value: number) {
  const rounded = Math.round(Number(value));
  return [1, 2, 4, 8, 16].includes(rounded) ? rounded : 4;
}

function nextGeneratedSectionClipId(project: PocketDawProject): string {
  const max = project.timeline.clips.reduce((found, clip) => {
    const match = /^clip_(\d+)$/.exec(clip.id);
    return Math.max(found, match ? Number(match[1]) : 0);
  }, 0);
  let next = max + 1;
  let id = `clip_${String(next).padStart(3, "0")}`;
  const used = new Set(project.timeline.clips.map((clip) => clip.id));
  while (used.has(id)) {
    next += 1;
    id = `clip_${String(next).padStart(3, "0")}`;
  }
  return id;
}

function safeInstrumentName(value: string) {
  return String(value || "synth").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
}

function safeText(value: string, fallback: string) {
  const safe = String(value || fallback).replace(/[^a-z0-9_# -]+/gi, "").trim();
  return safe || fallback;
}

function safeScale(value: string): SanitizedPcsProject["scale"] {
  return String(value).toLowerCase() === "minor" ? "minor" : "major";
}

function safeChoiceText(value: string, choices: string[], fallback: string) {
  const safe = safeText(value, fallback).replace(/\s+/g, "_").toLowerCase();
  return choices.includes(safe) ? safe : fallback;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isSectionId(value: string | undefined): value is SectionId {
  return !!value && (SECTION_IDS as readonly string[]).includes(value);
}

export function visibleEditorSteps(project: SanitizedPcsProject) {
  return Math.min(16, project.timeSig * project.resolution);
}

export function totalEditorSteps(project: SanitizedPcsProject, section: SanitizedPcsSection) {
  return Math.max(1, section.bars * project.timeSig * project.resolution);
}
