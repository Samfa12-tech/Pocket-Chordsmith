import { addMediaPoolItem, createMediaPoolItem } from "./mediaPool";
import { cloneProject } from "./dawProject";
import { createEmptyFxChain } from "./fx";
import { recomputeTimelineBars } from "./timeline";
import type { Clip, JsonObject, MediaPoolItem, PocketDawProject, Track } from "./schema";
import type { ParsedMidiFile, ParsedMidiNote } from "./midiParser";

export interface MidiClipData {
  ppq: number;
  notes: ParsedMidiNote[];
  sourceName?: string;
  metadata?: JsonObject;
}

export function midiDataFromClip(clip: Clip): MidiClipData {
  const raw = (clip.metadata?.midi || {}) as Record<string, unknown>;
  return {
    ppq: cleanNumber(raw.ppq, 480),
    sourceName: typeof raw.sourceName === "string" ? raw.sourceName : undefined,
    notes: Array.isArray(raw.notes) ? raw.notes.map(cleanNote).filter(Boolean) as ParsedMidiNote[] : [],
    metadata: typeof raw.metadata === "object" && raw.metadata && !Array.isArray(raw.metadata) ? raw.metadata as JsonObject : {}
  };
}

export function importMidiFileToProject(project: PocketDawProject, parsed: ParsedMidiFile, name: string, uri?: string, sizeBytes?: number): { project: PocketDawProject; item: MediaPoolItem; clipId: string; trackId: string } {
  const item = createMediaPoolItem({
    kind: "midi",
    name,
    uri,
    mimeType: "audio/midi",
    sizeBytes,
    metadata: {
      ppq: parsed.ppq,
      format: parsed.format,
      tempoBpm: parsed.tempoBpm || null,
      timeSig: parsed.timeSig || null,
      trackNames: parsed.trackNames,
      noteCount: parsed.notes.length,
      ...(parsed.metadata || {})
    }
  }, project.mediaPool);
  const next = addMediaPoolItem(project, item);
  const placed = createMidiClip(next, item.id, name, parsed);
  return { ...placed, item };
}

export function createMidiClip(project: PocketDawProject, mediaPoolItemId: string | undefined, name: string, parsed: Pick<ParsedMidiFile, "ppq" | "notes" | "metadata">): { project: PocketDawProject; clipId: string; trackId: string } {
  const next = cloneProject(project);
  const track = ensureMidiTrack(next);
  const clipId = nextClipId(next);
  const maxTick = parsed.notes.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), parsed.ppq);
  const beats = maxTick / Math.max(1, parsed.ppq);
  const barLength = Math.max(1, Math.ceil(beats / Math.max(1, next.project.timeSig)));
  next.timeline.clips.push({
    id: clipId,
    type: "midi",
    trackId: track.id,
    mediaPoolItemId,
    startBar: 1,
    barLength,
    name,
    muted: false,
    color: track.colour,
    linked: true,
    transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} },
    metadata: {
      midi: {
        ppq: parsed.ppq,
        sourceName: name,
        notes: parsed.notes,
        metadata: parsed.metadata || {}
      } as unknown as JsonObject
    }
  });
  recomputeTimelineBars(next);
  return { project: next, clipId, trackId: track.id };
}

export function addMidiNote(project: PocketDawProject, clipId: string, atTick = 0): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    data.notes.push({ id: nextNoteId(data.notes), pitch: 60, startTick: Math.max(0, atTick), durationTicks: data.ppq, velocity: 88, channel: 0 });
  });
}

export function deleteMidiNote(project: PocketDawProject, clipId: string, noteId: string): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    data.notes = data.notes.filter((note) => note.id !== noteId);
  });
}

export function moveMidiNote(project: PocketDawProject, clipId: string, noteId: string, deltaTicks: number): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    const note = data.notes.find((item) => item.id === noteId);
    if (note) note.startTick = Math.max(0, note.startTick + deltaTicks);
  });
}

export function transposeMidiNote(project: PocketDawProject, clipId: string, noteId: string, delta: number): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    const note = data.notes.find((item) => item.id === noteId);
    if (note) note.pitch = Math.max(0, Math.min(127, note.pitch + delta));
  });
}

export function resizeMidiNote(project: PocketDawProject, clipId: string, noteId: string, deltaTicks: number): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    const note = data.notes.find((item) => item.id === noteId);
    if (note) note.durationTicks = Math.max(1, note.durationTicks + deltaTicks);
  });
}

export function setMidiNoteVelocity(project: PocketDawProject, clipId: string, noteId: string, velocity: number): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    const note = data.notes.find((item) => item.id === noteId);
    if (note) note.velocity = Math.max(1, Math.min(127, Math.round(velocity)));
  });
}

function editMidiClip(project: PocketDawProject, clipId: string, updater: (data: MidiClipData) => void): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip) return project;
  const data = midiDataFromClip(clip);
  updater(data);
  data.notes = data.notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  clip.metadata = { ...(clip.metadata || {}), midi: data as unknown as JsonObject };
  return next;
}

function ensureMidiTrack(project: PocketDawProject): Track {
  const existing = project.tracks.find((track) => track.trackType === "midi");
  if (existing) return existing;
  const id = uniqueTrackId(project, "midi");
  const track: Track = {
    id,
    name: "MIDI",
    trackType: "midi",
    role: "media",
    volume: 0.82,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    colour: "#b88cff",
    routing: { inputIds: [], outputId: "master", sendIds: ["fx-return"] },
    automationLaneIds: [],
    fxChainId: `fx_${id}`,
    recordKind: "none",
    inputDeviceId: null,
    active: true
  };
  const masterIndex = project.tracks.findIndex((item) => item.role === "master");
  if (masterIndex === -1) project.tracks.push(track);
  else project.tracks.splice(masterIndex, 0, track);
  project.fx.chains.push(createEmptyFxChain(track.id, `${track.name} FX`));
  return track;
}

function cleanNote(value: unknown): ParsedMidiNote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    id: String(raw.id || "note"),
    pitch: cleanNumber(raw.pitch, 60, 0, 127),
    startTick: cleanNumber(raw.startTick ?? raw.startBeat, 0),
    durationTicks: cleanNumber(raw.durationTicks ?? raw.durationBeat, 480, 1),
    velocity: cleanNumber(raw.velocity, 90, 1, 127),
    channel: raw.channel === undefined ? undefined : cleanNumber(raw.channel, 0, 0, 15)
  };
}

function cleanNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function nextNoteId(notes: ParsedMidiNote[]): string {
  let i = notes.length + 1;
  const ids = new Set(notes.map((note) => note.id));
  while (ids.has(`note_${i}`)) i += 1;
  return `note_${i}`;
}

function nextClipId(project: PocketDawProject): string {
  let i = project.timeline.clips.length + 1;
  const ids = new Set(project.timeline.clips.map((clip) => clip.id));
  while (ids.has(`clip_${String(i).padStart(3, "0")}`)) i += 1;
  return `clip_${String(i).padStart(3, "0")}`;
}

function uniqueTrackId(project: PocketDawProject, base: string) {
  let id = base;
  let n = 2;
  while (project.tracks.some((track) => track.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}
