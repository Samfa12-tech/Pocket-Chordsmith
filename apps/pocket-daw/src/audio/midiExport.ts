import type { PocketDawProject } from "../daw/schema";
import { renderTimelineEvents, type RenderedEvent } from "./eventRenderer";

interface MidiMessage {
  tick: number;
  data: number[];
}

const DRUM_NOTES: Record<string, number> = {
  kick: 36,
  snare: 38,
  hat: 42
};

export function exportProjectToMidiBlob(project: PocketDawProject): Blob {
  const ppq = project.project.ppq || 480;
  const tracks = buildMidiTracks(project, ppq);
  const header = chunk("MThd", [...u16(1), ...u16(tracks.length), ...u16(ppq)]);
  const body = tracks.map((messages) => chunk("MTrk", encodeTrack(messages))).flat();
  return new Blob([new Uint8Array([...header, ...body])], { type: "audio/midi" });
}

function buildMidiTracks(project: PocketDawProject, ppq: number): MidiMessage[][] {
  const meta: MidiMessage[] = [
    { tick: 0, data: [0xff, 0x51, 0x03, ...u24(Math.round(60000000 / project.project.bpm))] },
    { tick: 0, data: [0xff, 0x58, 0x04, project.project.timeSig, 2, 24, 8] },
    { tick: 0, data: [0xff, 0x03, project.project.title.length, ...ascii(project.project.title)] }
  ];
  const eventTrackIds = Array.from(new Set(renderTimelineEvents(project).map((event) => event.trackId)));
  const musicalTracks = project.tracks.filter((track) => eventTrackIds.includes(track.id));
  const byTrack = new Map(musicalTracks.map((track) => [track.id, [] as MidiMessage[]]));
  renderTimelineEvents(project).forEach((event) => {
    const messages = byTrack.get(event.trackId);
    if (!messages) return;
    addEventMessages(messages, event, project, ppq);
  });
  return [meta, ...musicalTracks.map((track) => byTrack.get(track.id) || [])];
}

function addEventMessages(messages: MidiMessage[], event: RenderedEvent, project: PocketDawProject, ppq: number) {
  const startTick = secondsToTicks(event.time, project.project.bpm, ppq);
  const endTick = Math.max(startTick + 12, secondsToTicks(event.time + event.duration, project.project.bpm, ppq));
  const channel = midiChannelForEvent(event, project);
  const notes = event.midiNotes || (event.midi !== undefined ? [event.midi] : event.kind in DRUM_NOTES ? [DRUM_NOTES[event.kind]] : []);
  notes.forEach((note) => {
    const velocity = Math.max(1, Math.min(127, Math.round(event.velocity * 110)));
    messages.push({ tick: startTick, data: [0x90 + channel, note, velocity] });
    messages.push({ tick: endTick, data: [0x80 + channel, note, 0] });
  });
}

function midiChannelForEvent(event: RenderedEvent, project: PocketDawProject) {
  if (event.trackId === "drums") return 9;
  if (event.trackId === "bass") return 1;
  if (event.trackId === "chords") return 2;
  if (event.role === "melody") {
    const melodyIndex = project.tracks
      .filter((track) => track.role === "melody")
      .findIndex((track) => track.id === event.trackId);
    return Math.max(0, Math.min(15, 3 + Math.max(0, melodyIndex)));
  }
  if (event.trackId === "guitar") return 8;
  return 4;
}

function encodeTrack(messages: MidiMessage[]) {
  const sorted = messages.slice().sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0]);
  const bytes: number[] = [];
  let lastTick = 0;
  sorted.forEach((message) => {
    bytes.push(...varLen(Math.max(0, message.tick - lastTick)), ...message.data);
    lastTick = message.tick;
  });
  bytes.push(0x00, 0xff, 0x2f, 0x00);
  return bytes;
}

function secondsToTicks(seconds: number, bpm: number, ppq: number) {
  return Math.round(seconds / (60 / bpm) * ppq);
}

function chunk(name: string, data: number[]): number[] {
  return [...ascii(name), ...u32(data.length), ...data];
}

function ascii(text: string) {
  return Array.from(text).map((char) => char.charCodeAt(0) & 0x7f);
}

function u16(n: number) {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u24(n: number) {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function u32(n: number) {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function varLen(value: number) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}
