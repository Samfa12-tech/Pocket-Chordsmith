import type { RenderedEvent, RenderedEventKind } from "./eventRenderer";
import type { JsonObject, TrackRole } from "../daw/schema";

export interface PocketAudioCoreEvent {
  id: string;
  clipId: string;
  trackId: string;
  role: TrackRole;
  kind: RenderedEventKind;
  bar: number;
  step: number;
  startSeconds: number;
  durationSeconds: number;
  midi?: number;
  midiNotes: number[];
  velocity: number;
  pan: number;
  instrument: string;
  articulation: string;
  accent: boolean;
  tuplet?: boolean;
  drumLane?: string;
  drumKit?: string;
  bassTone?: string;
  audioProfile?: string;
  lofiPreset?: string;
  lofiTexture?: JsonObject;
  chipPreset?: string;
  chipTexture?: JsonObject;
  slideMidi?: number;
  slideOffset?: number;
  direction?: "down" | "up";
}

export function normalizeRenderedEventForPocketAudioCore(event: RenderedEvent): PocketAudioCoreEvent {
  const out: PocketAudioCoreEvent = {
    id: event.id,
    clipId: event.clipId,
    trackId: event.trackId,
    role: event.role,
    kind: event.kind,
    bar: Math.max(1, Math.round(event.bar)),
    step: Math.max(0, Math.round(event.step)),
    startSeconds: roundAudioTime(event.time),
    durationSeconds: roundAudioTime(Math.max(0, event.duration)),
    midiNotes: event.midiNotes?.length ? event.midiNotes.map(clampMidiNote) : typeof event.midi === "number" ? [clampMidiNote(event.midi)] : [],
    velocity: clampUnit(event.velocity),
    pan: Math.max(-1, Math.min(1, event.pan ?? 0)),
    instrument: event.instrument || defaultInstrumentForKind(event.kind),
    articulation: event.articulation || "note",
    accent: event.accent === true
  };

  if (typeof event.midi === "number") out.midi = clampMidiNote(event.midi);
  if (event.tuplet === true) out.tuplet = true;
  if (event.drumLane) out.drumLane = event.drumLane;
  if (event.drumKit) out.drumKit = event.drumKit;
  if (event.bassTone) out.bassTone = event.bassTone;
  if (event.audioProfile) out.audioProfile = event.audioProfile;
  if (event.lofiPreset) out.lofiPreset = event.lofiPreset;
  if (event.lofiTexture) out.lofiTexture = cloneJsonObject(event.lofiTexture);
  if (event.chipPreset) out.chipPreset = event.chipPreset;
  if (event.chipTexture) out.chipTexture = cloneJsonObject(event.chipTexture);
  if (typeof event.slideMidi === "number") out.slideMidi = clampMidiNote(event.slideMidi);
  if (typeof event.slideOffset === "number") out.slideOffset = roundAudioTime(event.slideOffset);
  if (event.direction) out.direction = event.direction;

  return out;
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

function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}
