import { totalEditorSteps, getPrimaryChordsmithSource } from "./chordsmithEditor";
import { cloneProject } from "./dawProject";
import type { JsonObject, PocketDawProject, Track } from "./schema";

export interface MelodyOverlayWrite {
  sectionId: string;
  trackIndex: number;
  step: number;
  midi: number;
  velocity: number;
  durationSteps?: number;
  sourceClipId?: string;
  sourceNoteId?: string;
}

export interface MelodyOverlayEvent {
  step: number;
  midi: number;
  velocity: number;
  durationSteps: number;
  sourceClipId?: string;
  sourceNoteId?: string;
}

export function writeMelodyOverlayEvents(project: PocketDawProject, writes: readonly MelodyOverlayWrite[]): PocketDawProject {
  const valid = writes
    .map((write) => sanitizeWrite(write))
    .filter((write): write is Required<Pick<MelodyOverlayWrite, "sectionId" | "trackIndex" | "step" | "midi" | "velocity" | "durationSteps">> & MelodyOverlayWrite => !!write);
  if (!valid.length) return project;
  const next = cloneProject(project);
  valid.forEach((write) => {
    const track = melodyTrackForIndex(next, write.trackIndex);
    if (!track) return;
    const overlays = melodyOverlayMap(track);
    const section = { ...(overlays[write.sectionId] || {}) };
    const trackKey = String(write.trackIndex);
    const events = Array.isArray(section[trackKey]) ? [...(section[trackKey] as JsonObject[])] : [];
    const event = {
      step: write.step,
      midi: write.midi,
      velocity: write.velocity,
      durationSteps: write.durationSteps,
      ...(write.sourceClipId ? { sourceClipId: write.sourceClipId } : {}),
      ...(write.sourceNoteId ? { sourceNoteId: write.sourceNoteId } : {})
    };
    const existingIndex = events.findIndex((item) => Number(item.step) === write.step && Number(item.midi) === write.midi);
    if (existingIndex >= 0) {
      const existing = events[existingIndex];
      events[existingIndex] = {
        ...existing,
        ...event,
        velocity: Math.max(Number(existing.velocity) || 0, write.velocity),
        durationSteps: Math.max(Number(existing.durationSteps) || 1, write.durationSteps)
      };
    } else {
      events.push(event);
    }
    events.sort((a, b) => Number(a.step) - Number(b.step) || Number(a.midi) - Number(b.midi));
    section[trackKey] = events;
    overlays[write.sectionId] = section;
    track.metadata = { ...(track.metadata || {}), melodyOverlayEvents: overlays };
  });
  return next;
}

export function getMelodyOverlayEvents(project: PocketDawProject, sectionId: string, trackIndex: number, step: number): MelodyOverlayEvent[] {
  const track = melodyTrackForIndex(project, trackIndex);
  if (!track) return [];
  const section = melodyOverlayMap(track)[safeSectionId(sectionId)];
  const source = section?.[String(Math.max(0, Math.round(trackIndex)))];
  if (!Array.isArray(source)) return [];
  const safeStep = Math.max(0, Math.round(step));
  return source
    .map(sanitizeOverlayEvent)
    .filter((event): event is MelodyOverlayEvent => !!event && event.step === safeStep);
}

export function melodyOverlayCount(project: PocketDawProject, sectionId: string, trackIndex: number): number {
  const track = melodyTrackForIndex(project, trackIndex);
  if (!track) return 0;
  const section = melodyOverlayMap(track)[safeSectionId(sectionId)];
  const source = section?.[String(Math.max(0, Math.round(trackIndex)))];
  return Array.isArray(source) ? source.map(sanitizeOverlayEvent).filter(Boolean).length : 0;
}

export function melodyTrackForIndex(project: PocketDawProject, trackIndex: number): Track | null {
  const safeIndex = Math.max(0, Math.round(trackIndex));
  const byMetadata = project.tracks.find((track) => track.role === "melody" && track.metadata?.chordsmithMelodyTrackIndex === safeIndex);
  if (byMetadata) return byMetadata;
  if (safeIndex === 0) return project.tracks.find((track) => track.id === "melody" && track.role === "melody") || null;
  const conventional = `melody-${safeIndex + 1}`;
  return project.tracks.find((track) => track.id === conventional && track.role === "melody") || null;
}

export function sectionStepLimit(project: PocketDawProject, sectionId: string): number {
  const pcs = getPrimaryChordsmithSource(project);
  const section = pcs?.sections[safeSectionId(sectionId) as keyof typeof pcs.sections];
  return pcs && section ? totalEditorSteps(pcs, section) : 0;
}

function sanitizeWrite(write: MelodyOverlayWrite): MelodyOverlayWrite | null {
  const step = Math.max(0, Math.round(Number(write.step)));
  const trackIndex = Math.max(0, Math.round(Number(write.trackIndex)));
  const midi = Math.max(0, Math.min(127, Math.round(Number(write.midi))));
  const velocity = Math.max(0.05, Math.min(1, Number(write.velocity)));
  const durationSteps = Math.max(1, Math.min(256, Math.round(Number(write.durationSteps || 1))));
  if (!Number.isFinite(step) || !Number.isFinite(trackIndex) || !Number.isFinite(midi) || !Number.isFinite(velocity)) return null;
  return {
    sectionId: safeSectionId(write.sectionId),
    trackIndex,
    step,
    midi,
    velocity,
    durationSteps,
    ...(write.sourceClipId ? { sourceClipId: String(write.sourceClipId) } : {}),
    ...(write.sourceNoteId ? { sourceNoteId: String(write.sourceNoteId) } : {})
  };
}

function sanitizeOverlayEvent(value: unknown): MelodyOverlayEvent | null {
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

function melodyOverlayMap(track: Track): Record<string, Record<string, JsonObject[]>> {
  const source = track.metadata?.melodyOverlayEvents;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out: Record<string, Record<string, JsonObject[]>> = {};
  Object.entries(source as Record<string, unknown>).forEach(([sectionId, section]) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) return;
    const lanes: Record<string, JsonObject[]> = {};
    Object.entries(section as Record<string, unknown>).forEach(([trackIndex, events]) => {
      if (!Array.isArray(events)) return;
      lanes[String(Math.max(0, Math.round(Number(trackIndex))))] = events.filter((event): event is JsonObject => !!event && typeof event === "object" && !Array.isArray(event));
    });
    if (Object.keys(lanes).length) out[safeSectionId(sectionId)] = lanes;
  });
  return out;
}

function safeSectionId(value: string): string {
  return String(value || "A").replace(/[^a-z0-9_-]+/gi, "").slice(0, 8).toUpperCase() || "A";
}
