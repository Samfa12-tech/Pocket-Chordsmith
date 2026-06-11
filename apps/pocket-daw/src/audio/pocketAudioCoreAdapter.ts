import type { RenderedEvent, RenderedEventKind } from "./eventRenderer";
import type { TrackRole } from "../daw/schema";

export interface PocketAudioCoreEvent {
  id: string;
  clipId: string;
  trackId: string;
  role: TrackRole;
  kind: RenderedEventKind;
  startSeconds: number;
  durationSeconds: number;
  midiNotes: number[];
  velocity: number;
  pan: number;
  instrument: string;
  articulation: string;
  accent: boolean;
}

export function normalizeRenderedEventForPocketAudioCore(event: RenderedEvent): PocketAudioCoreEvent {
  return {
    id: event.id,
    clipId: event.clipId,
    trackId: event.trackId,
    role: event.role,
    kind: event.kind,
    startSeconds: roundAudioTime(event.time),
    durationSeconds: roundAudioTime(Math.max(0, event.duration)),
    midiNotes: event.midiNotes?.length ? event.midiNotes.map(clampMidiNote) : typeof event.midi === "number" ? [clampMidiNote(event.midi)] : [],
    velocity: clampUnit(event.velocity),
    pan: Math.max(-1, Math.min(1, event.pan ?? 0)),
    instrument: event.instrument || defaultInstrumentForKind(event.kind),
    articulation: event.articulation || "note",
    accent: event.accent === true
  };
}

export function normalizeRenderedEventsForPocketAudioCore(events: RenderedEvent[]): PocketAudioCoreEvent[] {
  return events.map(normalizeRenderedEventForPocketAudioCore);
}

function roundAudioTime(value: number): number {
  return Number(Math.max(0, value).toFixed(6));
}

function clampMidiNote(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function defaultInstrumentForKind(kind: RenderedEventKind): string {
  if (kind === "kick" || kind === "snare" || kind === "hat") return "drum_preview";
  if (kind === "midi") return "midi_preview";
  return `${kind}_preview`;
}
