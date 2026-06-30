import type { PocketDawProject } from "../daw/schema";
import { midiDataFromClip } from "../daw/midiClips";
import { renderTimelineEvents, type RenderedEvent } from "./eventRenderer";

interface MidiMessage {
  tick: number;
  data: number[];
}

export interface MidiExportOptions {
  clipIds?: string[];
  trackIds?: string[];
  title?: string;
}

const DRUM_NOTES: Record<string, number> = {
  kick: 36,
  snare: 38,
  hat: 42
};

export function exportProjectToMidiBlob(project: PocketDawProject, options: MidiExportOptions = {}): Blob {
  const ppq = project.project.ppq || 480;
  const tracks = buildMidiTracks(project, ppq, options);
  const header = chunk("MThd", [...u16(1), ...u16(tracks.length), ...u16(ppq)]);
  const body = tracks.map((messages) => chunk("MTrk", encodeTrack(messages))).flat();
  return new Blob([new Uint8Array([...header, ...body])], { type: "audio/midi" });
}

function buildMidiTracks(project: PocketDawProject, ppq: number, options: MidiExportOptions): MidiMessage[][] {
  const title = options.title || project.project.title;
  const meta: MidiMessage[] = [
    { tick: 0, data: [0xff, 0x51, 0x03, ...u24(Math.round(60000000 / project.project.bpm))] },
    { tick: 0, data: [0xff, 0x58, 0x04, project.project.timeSig, 2, 24, 8] },
    { tick: 0, data: [0xff, 0x03, ascii(title).length, ...ascii(title)] }
  ];
  const clipIds = options.clipIds?.length ? new Set(options.clipIds) : null;
  const trackIds = options.trackIds?.length ? new Set(options.trackIds) : null;
  const events = renderTimelineEvents(project).filter((event) => (
    (!clipIds || clipIds.has(event.clipId)) &&
    (!trackIds || trackIds.has(event.trackId))
  ));
  const controllerClipTrackIds = project.timeline.clips
    .filter((clip) => clip.type === "midi" && !clip.muted && (!clipIds || clipIds.has(clip.id)) && (!trackIds || trackIds.has(clip.trackId)) && midiDataFromClip(clip).controllers.length)
    .map((clip) => clip.trackId);
  const programChangeClipTrackIds = project.timeline.clips
    .filter((clip) => clip.type === "midi" && !clip.muted && (!clipIds || clipIds.has(clip.id)) && (!trackIds || trackIds.has(clip.trackId)) && midiDataFromClip(clip).programChanges.length)
    .map((clip) => clip.trackId);
  const pitchBendClipTrackIds = project.timeline.clips
    .filter((clip) => clip.type === "midi" && !clip.muted && (!clipIds || clipIds.has(clip.id)) && (!trackIds || trackIds.has(clip.trackId)) && midiDataFromClip(clip).pitchBends.length)
    .map((clip) => clip.trackId);
  const aftertouchClipTrackIds = project.timeline.clips
    .filter((clip) => clip.type === "midi" && !clip.muted && (!clipIds || clipIds.has(clip.id)) && (!trackIds || trackIds.has(clip.trackId)) && midiDataFromClip(clip).aftertouch.length)
    .map((clip) => clip.trackId);
  const eventTrackIds = Array.from(new Set([...events.map((event) => event.trackId), ...controllerClipTrackIds, ...programChangeClipTrackIds, ...pitchBendClipTrackIds, ...aftertouchClipTrackIds]));
  const musicalTracks = project.tracks.filter((track) => eventTrackIds.includes(track.id));
  const byTrack = new Map(musicalTracks.map((track) => [track.id, [] as MidiMessage[]]));
  musicalTracks.forEach((track) => {
    byTrack.get(track.id)?.push(trackNameMessage(track.name));
  });
  events.forEach((event) => {
    const messages = byTrack.get(event.trackId);
    if (!messages) return;
    addEventMessages(messages, event, project, ppq);
  });
  addMidiControllerMessages(project, ppq, byTrack, clipIds, trackIds);
  addMidiProgramChangeMessages(project, ppq, byTrack, clipIds, trackIds);
  addMidiPitchBendMessages(project, ppq, byTrack, clipIds, trackIds);
  addMidiAftertouchMessages(project, ppq, byTrack, clipIds, trackIds);
  return [meta, ...musicalTracks.map((track) => byTrack.get(track.id) || [])];
}

function trackNameMessage(name: string): MidiMessage {
  const bytes = ascii(name || "MIDI Track").slice(0, 120);
  return { tick: 0, data: [0xff, 0x03, bytes.length, ...bytes] };
}

function addEventMessages(messages: MidiMessage[], event: RenderedEvent, project: PocketDawProject, ppq: number) {
  const startTick = secondsToTicks(event.time, project.project.bpm, ppq);
  const endTick = Math.max(startTick + 12, secondsToTicks(event.time + event.duration, project.project.bpm, ppq));
  const channel = midiChannelForEvent(event, project);
  const notes = event.midiNotes || (event.midi !== undefined ? [event.midi] : event.kind in DRUM_NOTES ? [DRUM_NOTES[event.kind]] : []);
  notes.forEach((note) => {
    const sourceVelocity = event.kind === "midi" && typeof event.midiExportVelocity === "number" ? event.midiExportVelocity : event.velocity;
    const velocity = Math.max(1, Math.min(127, Math.round(sourceVelocity * 110)));
    messages.push({ tick: startTick, data: [0x90 + channel, note, velocity] });
    messages.push({ tick: endTick, data: [0x80 + channel, note, 0] });
  });
}

function addMidiControllerMessages(project: PocketDawProject, ppq: number, byTrack: Map<string, MidiMessage[]>, clipIds: Set<string> | null, trackIds: Set<string> | null) {
  project.timeline.clips.forEach((clip) => {
    if (clip.type !== "midi") return;
    if (clip.muted) return;
    if (clipIds && !clipIds.has(clip.id)) return;
    if (trackIds && !trackIds.has(clip.trackId)) return;
    const messages = byTrack.get(clip.trackId);
    if (!messages) return;
    const data = midiDataFromClip(clip);
    const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
    const renderTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
    const clipStartTick = secondsToTicks(barStartSeconds(project, clip.startBar), project.project.bpm, ppq);
    activeControllerStateBefore(data.controllers, sourceStartTick).forEach((point) => {
      const channel = Math.max(0, Math.min(15, Math.round(point.channel ?? 0)));
      messages.push({
        tick: clipStartTick,
        data: [0xb0 + channel, Math.max(0, Math.min(127, Math.round(point.controller))), Math.max(0, Math.min(127, Math.round(point.value)))]
      });
    });
    data.controllers
      .filter((point) => point.tick >= sourceStartTick && point.tick < sourceStartTick + renderTicks)
      .forEach((point) => {
        const localTick = Math.max(0, point.tick - sourceStartTick);
        const exportTick = clipStartTick + Math.round((localTick / data.ppq) * ppq);
        const channel = Math.max(0, Math.min(15, Math.round(point.channel ?? 0)));
        messages.push({
          tick: exportTick,
          data: [0xb0 + channel, Math.max(0, Math.min(127, Math.round(point.controller))), Math.max(0, Math.min(127, Math.round(point.value)))]
        });
      });
  });
}

function activeControllerStateBefore(controllers: ReturnType<typeof midiDataFromClip>["controllers"], sourceStartTick: number) {
  if (sourceStartTick <= 0) return [];
  const latest = new Map<string, typeof controllers[number]>();
  controllers
    .filter((point) => point.tick < sourceStartTick)
    .forEach((point) => {
      const key = `${point.channel ?? 0}:${point.controller}`;
      const existing = latest.get(key);
      if (!existing || point.tick > existing.tick || (point.tick === existing.tick && midiControllerOrder(point.id) >= midiControllerOrder(existing.id))) latest.set(key, point);
    });
  return Array.from(latest.values()).sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0) || a.controller - b.controller);
}

function addMidiProgramChangeMessages(project: PocketDawProject, ppq: number, byTrack: Map<string, MidiMessage[]>, clipIds: Set<string> | null, trackIds: Set<string> | null) {
  project.timeline.clips.forEach((clip) => {
    if (clip.type !== "midi") return;
    if (clip.muted) return;
    if (clipIds && !clipIds.has(clip.id)) return;
    if (trackIds && !trackIds.has(clip.trackId)) return;
    const messages = byTrack.get(clip.trackId);
    if (!messages) return;
    const data = midiDataFromClip(clip);
    const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
    const renderTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
    const clipStartTick = secondsToTicks(barStartSeconds(project, clip.startBar), project.project.bpm, ppq);
    activeProgramStateBefore(data.programChanges, sourceStartTick).forEach((point) => {
      const channel = Math.max(0, Math.min(15, Math.round(point.channel ?? 0)));
      messages.push({
        tick: clipStartTick,
        data: [0xc0 + channel, Math.max(0, Math.min(127, Math.round(point.program)))]
      });
    });
    data.programChanges
      .filter((point) => point.tick >= sourceStartTick && point.tick < sourceStartTick + renderTicks)
      .forEach((point) => {
        const localTick = Math.max(0, point.tick - sourceStartTick);
        const exportTick = clipStartTick + Math.round((localTick / data.ppq) * ppq);
        const channel = Math.max(0, Math.min(15, Math.round(point.channel ?? 0)));
        messages.push({
          tick: exportTick,
          data: [0xc0 + channel, Math.max(0, Math.min(127, Math.round(point.program)))]
        });
      });
  });
}

function activeProgramStateBefore(programChanges: ReturnType<typeof midiDataFromClip>["programChanges"], sourceStartTick: number) {
  if (sourceStartTick <= 0) return [];
  const latest = new Map<number, typeof programChanges[number]>();
  programChanges
    .filter((point) => point.tick < sourceStartTick)
    .forEach((point) => {
      const channel = point.channel ?? 0;
      const existing = latest.get(channel);
      if (!existing || point.tick > existing.tick || (point.tick === existing.tick && midiControllerOrder(point.id) >= midiControllerOrder(existing.id))) latest.set(channel, point);
    });
  return Array.from(latest.values()).sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0));
}

function addMidiPitchBendMessages(project: PocketDawProject, ppq: number, byTrack: Map<string, MidiMessage[]>, clipIds: Set<string> | null, trackIds: Set<string> | null) {
  project.timeline.clips.forEach((clip) => {
    if (clip.type !== "midi") return;
    if (clip.muted) return;
    if (clipIds && !clipIds.has(clip.id)) return;
    if (trackIds && !trackIds.has(clip.trackId)) return;
    const messages = byTrack.get(clip.trackId);
    if (!messages) return;
    const data = midiDataFromClip(clip);
    const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
    const renderTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
    const clipStartTick = secondsToTicks(barStartSeconds(project, clip.startBar), project.project.bpm, ppq);
    activePitchBendStateBefore(data.pitchBends, sourceStartTick).forEach((point) => {
      messages.push({ tick: clipStartTick, data: pitchBendMessage(point.value, point.channel ?? 0) });
    });
    data.pitchBends
      .filter((point) => point.tick >= sourceStartTick && point.tick < sourceStartTick + renderTicks)
      .forEach((point) => {
        const localTick = Math.max(0, point.tick - sourceStartTick);
        const exportTick = clipStartTick + Math.round((localTick / data.ppq) * ppq);
        messages.push({ tick: exportTick, data: pitchBendMessage(point.value, point.channel ?? 0) });
      });
  });
}

function activePitchBendStateBefore(pitchBends: ReturnType<typeof midiDataFromClip>["pitchBends"], sourceStartTick: number) {
  if (sourceStartTick <= 0) return [];
  const latest = new Map<number, typeof pitchBends[number]>();
  pitchBends
    .filter((point) => point.tick < sourceStartTick)
    .forEach((point) => {
      const channel = point.channel ?? 0;
      const existing = latest.get(channel);
      if (!existing || point.tick > existing.tick || (point.tick === existing.tick && midiControllerOrder(point.id) >= midiControllerOrder(existing.id))) latest.set(channel, point);
    });
  return Array.from(latest.values()).sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0));
}

function pitchBendMessage(value: number, channel: number): number[] {
  const bend = Math.max(0, Math.min(16383, Math.round(value)));
  const safeChannel = Math.max(0, Math.min(15, Math.round(channel)));
  return [0xe0 + safeChannel, bend & 0x7f, (bend >> 7) & 0x7f];
}

function addMidiAftertouchMessages(project: PocketDawProject, ppq: number, byTrack: Map<string, MidiMessage[]>, clipIds: Set<string> | null, trackIds: Set<string> | null) {
  project.timeline.clips.forEach((clip) => {
    if (clip.type !== "midi") return;
    if (clip.muted) return;
    if (clipIds && !clipIds.has(clip.id)) return;
    if (trackIds && !trackIds.has(clip.trackId)) return;
    const messages = byTrack.get(clip.trackId);
    if (!messages) return;
    const data = midiDataFromClip(clip);
    const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
    const renderTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
    const clipStartTick = secondsToTicks(barStartSeconds(project, clip.startBar), project.project.bpm, ppq);
    activeAftertouchStateBefore(data.aftertouch, sourceStartTick).forEach((point) => {
      messages.push({ tick: clipStartTick, data: aftertouchMessage(point) });
    });
    data.aftertouch
      .filter((point) => point.tick >= sourceStartTick && point.tick < sourceStartTick + renderTicks)
      .forEach((point) => {
        const localTick = Math.max(0, point.tick - sourceStartTick);
        const exportTick = clipStartTick + Math.round((localTick / data.ppq) * ppq);
        messages.push({ tick: exportTick, data: aftertouchMessage(point) });
      });
  });
}

function activeAftertouchStateBefore(aftertouch: ReturnType<typeof midiDataFromClip>["aftertouch"], sourceStartTick: number) {
  if (sourceStartTick <= 0) return [];
  const latest = new Map<string, typeof aftertouch[number]>();
  aftertouch
    .filter((point) => point.tick < sourceStartTick)
    .forEach((point) => {
      const key = point.kind === "poly" ? `${point.channel ?? 0}:${point.note ?? 0}` : `${point.channel ?? 0}:channel`;
      const existing = latest.get(key);
      if (!existing || point.tick > existing.tick || (point.tick === existing.tick && midiControllerOrder(point.id) >= midiControllerOrder(existing.id))) latest.set(key, point);
    });
  return Array.from(latest.values()).sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0) || (a.note ?? -1) - (b.note ?? -1));
}

function aftertouchMessage(point: ReturnType<typeof midiDataFromClip>["aftertouch"][number]): number[] {
  const channel = Math.max(0, Math.min(15, Math.round(point.channel ?? 0)));
  const value = Math.max(0, Math.min(127, Math.round(point.value)));
  if (point.kind === "poly") {
    const note = Math.max(0, Math.min(127, Math.round(point.note ?? 60)));
    return [0xa0 + channel, note, value];
  }
  return [0xd0 + channel, value];
}

function midiControllerOrder(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function midiChannelForEvent(event: RenderedEvent, project: PocketDawProject) {
  if (event.kind === "midi" && typeof event.channel === "number") return Math.max(0, Math.min(15, Math.round(event.channel)));
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
  const sorted = messages.slice().sort((a, b) => a.tick - b.tick || midiMessageSortPriority(a) - midiMessageSortPriority(b) || a.data[0] - b.data[0]);
  const bytes: number[] = [];
  let lastTick = 0;
  sorted.forEach((message) => {
    bytes.push(...varLen(Math.max(0, message.tick - lastTick)), ...message.data);
    lastTick = message.tick;
  });
  bytes.push(0x00, 0xff, 0x2f, 0x00);
  return bytes;
}

function midiMessageSortPriority(message: MidiMessage): number {
  const status = message.data[0] & 0xf0;
  if (status === 0xc0) return 5;
  if (status === 0xb0) return 10;
  if (status === 0xe0) return 15;
  if (status === 0xa0 || status === 0xd0) return 16;
  if (status === 0x80) return 20;
  if (status === 0x90 && (message.data[2] || 0) === 0) return 20;
  if (status === 0x90) return 30;
  return 40;
}

function secondsToTicks(seconds: number, bpm: number, ppq: number) {
  return Math.round(seconds / (60 / bpm) * ppq);
}

function barStartSeconds(project: PocketDawProject, bar: number) {
  return Math.max(0, bar - 1) * project.project.timeSig * (60 / project.project.bpm);
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
