import { totalEditorSteps, getPrimaryChordsmithSource } from "./chordsmithEditor";
import { cloneProject } from "./dawProject";
import type { JsonObject, PocketDawProject, Track } from "./schema";

export interface BassOverlayWrite {
  sectionId: string;
  step: number;
  midi: number;
  velocity: number;
  durationSteps?: number;
  sourceClipId?: string;
  sourceNoteId?: string;
}

export interface BassOverlayEvent {
  step: number;
  midi: number;
  velocity: number;
  durationSteps: number;
  sourceClipId?: string;
  sourceNoteId?: string;
}

export function writeBassOverlayEvents(project: PocketDawProject, writes: readonly BassOverlayWrite[]): PocketDawProject {
  const valid = writes.map(sanitizeWrite).filter((write): write is BassOverlayWrite & { durationSteps: number } => !!write);
  if (!valid.length) return project;
  const next = cloneProject(project);
  const track = bassTrack(next);
  if (!track) return project;
  const overlays = bassOverlayMap(track);
  valid.forEach((write) => {
    const section = [...(overlays[write.sectionId] || [])];
    const event = {
      step: write.step,
      midi: write.midi,
      velocity: write.velocity,
      durationSteps: write.durationSteps,
      ...(write.sourceClipId ? { sourceClipId: write.sourceClipId } : {}),
      ...(write.sourceNoteId ? { sourceNoteId: write.sourceNoteId } : {})
    };
    const existingIndex = section.findIndex((item) => Number(item.step) === write.step && Number(item.midi) === write.midi);
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
    section.sort((a, b) => Number(a.step) - Number(b.step) || Number(a.midi) - Number(b.midi));
    overlays[write.sectionId] = section;
  });
  track.metadata = { ...(track.metadata || {}), bassOverlayEvents: overlays };
  return next;
}

export function getBassOverlayEvents(project: PocketDawProject, sectionId: string, step: number): BassOverlayEvent[] {
  const track = bassTrack(project);
  if (!track) return [];
  const source = bassOverlayMap(track)[safeSectionId(sectionId)];
  if (!Array.isArray(source)) return [];
  const safeStep = Math.max(0, Math.round(step));
  return source
    .map(sanitizeOverlayEvent)
    .filter((event): event is BassOverlayEvent => !!event && event.step === safeStep);
}

export function bassOverlayCount(project: PocketDawProject, sectionId: string): number {
  const track = bassTrack(project);
  if (!track) return 0;
  const source = bassOverlayMap(track)[safeSectionId(sectionId)];
  return Array.isArray(source) ? source.map(sanitizeOverlayEvent).filter(Boolean).length : 0;
}

export function bassSectionStepLimit(project: PocketDawProject, sectionId: string): number {
  const pcs = getPrimaryChordsmithSource(project);
  const section = pcs?.sections[safeSectionId(sectionId) as keyof typeof pcs.sections];
  return pcs && section ? totalEditorSteps(pcs, section) : 0;
}

function bassTrack(project: PocketDawProject): Track | null {
  return project.tracks.find((track) => track.role === "bass") || null;
}

function sanitizeWrite(write: BassOverlayWrite): BassOverlayWrite & { durationSteps: number } | null {
  const step = Math.max(0, Math.round(Number(write.step)));
  const midi = Math.max(0, Math.min(127, Math.round(Number(write.midi))));
  const velocity = Math.max(0.05, Math.min(1, Number(write.velocity)));
  const durationSteps = Math.max(1, Math.min(256, Math.round(Number(write.durationSteps || 1))));
  if (!Number.isFinite(step) || !Number.isFinite(midi) || !Number.isFinite(velocity)) return null;
  return {
    sectionId: safeSectionId(write.sectionId),
    step,
    midi,
    velocity,
    durationSteps,
    ...(write.sourceClipId ? { sourceClipId: String(write.sourceClipId) } : {}),
    ...(write.sourceNoteId ? { sourceNoteId: String(write.sourceNoteId) } : {})
  };
}

function sanitizeOverlayEvent(value: unknown): BassOverlayEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as JsonObject;
  const step = Math.max(0, Math.round(Number(source.step)));
  const midi = Math.max(0, Math.min(127, Math.round(Number(source.midi))));
  const velocity = Math.max(0.05, Math.min(1, Number(source.velocity)));
  const durationSteps = Math.max(1, Math.min(256, Math.round(Number(source.durationSteps || 1))));
  if (!Number.isFinite(step) || !Number.isFinite(midi) || !Number.isFinite(velocity)) return null;
  return {
    step,
    midi,
    velocity,
    durationSteps,
    ...(typeof source.sourceClipId === "string" ? { sourceClipId: source.sourceClipId } : {}),
    ...(typeof source.sourceNoteId === "string" ? { sourceNoteId: source.sourceNoteId } : {})
  };
}

function bassOverlayMap(track: Track): Record<string, JsonObject[]> {
  const source = track.metadata?.bassOverlayEvents;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out: Record<string, JsonObject[]> = {};
  Object.entries(source as Record<string, unknown>).forEach(([sectionId, events]) => {
    if (!Array.isArray(events)) return;
    out[safeSectionId(sectionId)] = events.filter((event): event is JsonObject => !!event && typeof event === "object" && !Array.isArray(event));
  });
  return out;
}

function safeSectionId(value: string): string {
  return String(value || "A").replace(/[^a-z0-9_-]+/gi, "").slice(0, 8).toUpperCase() || "A";
}
