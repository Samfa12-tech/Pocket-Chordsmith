import { totalEditorSteps, getPrimaryChordsmithSource } from "./chordsmithEditor";
import { cloneProject } from "./dawProject";
import type { JsonObject, PocketDawProject, Track } from "./schema";

export interface ChordOverlayWrite {
  sectionId: string;
  step: number;
  midiNotes: number[];
  velocity: number;
  durationSteps?: number;
  sourceClipId?: string;
  sourceNoteIds?: string[];
}

export interface ChordOverlayEvent {
  step: number;
  midiNotes: number[];
  velocity: number;
  durationSteps: number;
  sourceClipId?: string;
  sourceNoteIds?: string[];
}

export function writeChordOverlayEvents(project: PocketDawProject, writes: readonly ChordOverlayWrite[]): PocketDawProject {
  const valid = writes.map(sanitizeWrite).filter((write): write is ChordOverlayWrite & { durationSteps: number } => !!write);
  if (!valid.length) return project;
  const next = cloneProject(project);
  const track = chordTrack(next);
  if (!track) return project;
  const overlays = chordOverlayMap(track);
  valid.forEach((write) => {
    const section = [...(overlays[write.sectionId] || [])];
    const event = {
      step: write.step,
      midiNotes: write.midiNotes,
      velocity: write.velocity,
      durationSteps: write.durationSteps,
      ...(write.sourceClipId ? { sourceClipId: write.sourceClipId } : {}),
      ...(write.sourceNoteIds?.length ? { sourceNoteIds: write.sourceNoteIds } : {})
    };
    const existingIndex = section.findIndex((item) => Number(item.step) === write.step && midiSignature(item.midiNotes) === midiSignature(write.midiNotes));
    if (existingIndex >= 0) {
      const existing = section[existingIndex];
      section[existingIndex] = {
        ...existing,
        ...event,
        velocity: Math.max(Number(existing.velocity) || 0, write.velocity),
        durationSteps: Math.max(Number(existing.durationSteps) || 1, write.durationSteps)
      };
    } else {
      section.push(event);
    }
    section.sort((a, b) => Number(a.step) - Number(b.step) || midiSignature(a.midiNotes).localeCompare(midiSignature(b.midiNotes)));
    overlays[write.sectionId] = section;
  });
  track.metadata = { ...(track.metadata || {}), chordOverlayEvents: overlays };
  return next;
}

export function getChordOverlayEvents(project: PocketDawProject, sectionId: string, step: number): ChordOverlayEvent[] {
  const track = chordTrack(project);
  if (!track) return [];
  const source = chordOverlayMap(track)[safeSectionId(sectionId)];
  if (!Array.isArray(source)) return [];
  const safeStep = Math.max(0, Math.round(step));
  return source
    .map(sanitizeOverlayEvent)
    .filter((event): event is ChordOverlayEvent => !!event && event.step === safeStep);
}

export function chordOverlayCount(project: PocketDawProject, sectionId: string): number {
  const track = chordTrack(project);
  if (!track) return 0;
  const source = chordOverlayMap(track)[safeSectionId(sectionId)];
  return Array.isArray(source) ? source.map(sanitizeOverlayEvent).filter(Boolean).length : 0;
}

export function chordSectionStepLimit(project: PocketDawProject, sectionId: string): number {
  const pcs = getPrimaryChordsmithSource(project);
  const section = pcs?.sections[safeSectionId(sectionId) as keyof typeof pcs.sections];
  return pcs && section ? totalEditorSteps(pcs, section) : 0;
}

function chordTrack(project: PocketDawProject): Track | null {
  return project.tracks.find((track) => track.role === "chords") || null;
}

function sanitizeWrite(write: ChordOverlayWrite): ChordOverlayWrite & { durationSteps: number } | null {
  const step = Math.max(0, Math.round(Number(write.step)));
  const midiNotes = uniqueMidiNotes(write.midiNotes);
  const velocity = Math.max(0.05, Math.min(1, Number(write.velocity)));
  const durationSteps = Math.max(1, Math.min(256, Math.round(Number(write.durationSteps || 1))));
  if (!Number.isFinite(step) || midiNotes.length < 2 || !Number.isFinite(velocity)) return null;
  return {
    sectionId: safeSectionId(write.sectionId),
    step,
    midiNotes,
    velocity,
    durationSteps,
    ...(write.sourceClipId ? { sourceClipId: String(write.sourceClipId) } : {}),
    ...(write.sourceNoteIds?.length ? { sourceNoteIds: write.sourceNoteIds.map(String) } : {})
  };
}

function sanitizeOverlayEvent(value: unknown): ChordOverlayEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as JsonObject;
  const step = Math.max(0, Math.round(Number(source.step)));
  const midiNotes = uniqueMidiNotes(Array.isArray(source.midiNotes) ? source.midiNotes : []);
  const velocity = Math.max(0.05, Math.min(1, Number(source.velocity)));
  const durationSteps = Math.max(1, Math.min(256, Math.round(Number(source.durationSteps || 1))));
  if (!Number.isFinite(step) || midiNotes.length < 2 || !Number.isFinite(velocity)) return null;
  return {
    step,
    midiNotes,
    velocity,
    durationSteps,
    ...(typeof source.sourceClipId === "string" ? { sourceClipId: source.sourceClipId } : {}),
    ...(Array.isArray(source.sourceNoteIds) ? { sourceNoteIds: source.sourceNoteIds.map(String) } : {})
  };
}

function chordOverlayMap(track: Track): Record<string, JsonObject[]> {
  const source = track.metadata?.chordOverlayEvents;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out: Record<string, JsonObject[]> = {};
  Object.entries(source as Record<string, unknown>).forEach(([sectionId, events]) => {
    if (!Array.isArray(events)) return;
    out[safeSectionId(sectionId)] = events.filter((event): event is JsonObject => !!event && typeof event === "object" && !Array.isArray(event));
  });
  return out;
}

function uniqueMidiNotes(values: unknown[]): number[] {
  return Array.from(new Set(values.map((value) => Math.max(0, Math.min(127, Math.round(Number(value))))).filter(Number.isFinite))).sort((a, b) => a - b);
}

function midiSignature(value: unknown): string {
  return uniqueMidiNotes(Array.isArray(value) ? value : []).join(".");
}

function safeSectionId(value: string): string {
  return String(value || "A").replace(/[^a-z0-9_-]+/gi, "").slice(0, 8).toUpperCase() || "A";
}
