import type { JsonObject } from "./schema";

export interface ParsedMidiNote {
  id: string;
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  channel?: number;
  trackIndex?: number;
}

export interface ParsedMidiController {
  id: string;
  controller: number;
  value: number;
  tick: number;
  channel?: number;
  trackIndex?: number;
}

export interface ParsedMidiProgramChange {
  id: string;
  program: number;
  tick: number;
  channel?: number;
  trackIndex?: number;
}

export interface ParsedMidiPitchBend {
  id: string;
  value: number;
  tick: number;
  channel?: number;
  trackIndex?: number;
}

export interface ParsedMidiAftertouch {
  id: string;
  kind: "poly" | "channel";
  value: number;
  tick: number;
  channel?: number;
  note?: number;
  trackIndex?: number;
}

export interface ParsedMidiFile {
  format: number;
  ppq: number;
  tempoBpm?: number;
  timeSig?: number;
  trackNames: string[];
  notes: ParsedMidiNote[];
  controllers: ParsedMidiController[];
  programChanges: ParsedMidiProgramChange[];
  pitchBends: ParsedMidiPitchBend[];
  aftertouch: ParsedMidiAftertouch[];
  metadata: JsonObject;
}

interface ActiveNote {
  pitch: number;
  channel: number;
  startTick: number;
  velocity: number;
}

export function parseStandardMidiFile(bytes: ArrayBuffer | Uint8Array): ParsedMidiFile {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const reader = new MidiReader(data);
  if (data.length < 4) throw new Error("MIDI file is missing an MThd header.");
  if (reader.readText(4) !== "MThd") throw new Error("MIDI file is missing an MThd header.");
  const headerLength = reader.readU32();
  const format = reader.readU16();
  const trackCount = reader.readU16();
  const division = reader.readU16();
  if (division & 0x8000) throw new Error("SMPTE-timed MIDI files are not supported yet.");
  const ppq = division;
  reader.skip(Math.max(0, headerLength - 6));

  const notes: ParsedMidiNote[] = [];
  const controllers: ParsedMidiController[] = [];
  const programChanges: ParsedMidiProgramChange[] = [];
  const pitchBends: ParsedMidiPitchBend[] = [];
  const aftertouch: ParsedMidiAftertouch[] = [];
  const trackNames: string[] = [];
  const trackSummaries: JsonObject[] = [];
  const tempoEvents: JsonObject[] = [];
  const timeSignatureEvents: JsonObject[] = [];
  const keySignatures: JsonObject[] = [];
  const lyrics: JsonObject[] = [];
  const metadata: JsonObject = { ignoredEvents: 0, sysexCount: 0, trackCount, format, ppq, trackSummaries };
  let tempoBpm: number | undefined;
  let timeSig: number | undefined;

  for (let trackIndex = 0; trackIndex < trackCount && !reader.done(); trackIndex += 1) {
    const trackHeaderOffset = reader.position;
    if (reader.remaining() < 8) throw new Error(`MIDI track ${trackIndex + 1} is incomplete; expected an MTrk header at byte ${trackHeaderOffset}.`);
    const header = reader.readText(4);
    if (header !== "MTrk") throw new Error(`MIDI track ${trackIndex + 1} is missing an MTrk header at byte ${trackHeaderOffset}. Found "${printableChunkId(header)}".`);
    const trackLength = reader.readU32();
    const trackStart = reader.position;
    const trackEnd = trackStart + trackLength;
    if (trackEnd > data.length) throw new Error(`MIDI track ${trackIndex + 1} declares ${trackLength} bytes, which extends past the end of the file.`);
    let tick = 0;
    let runningStatus = 0;
    let trackName = "";
    const firstNoteIndex = notes.length;
    const firstControllerIndex = controllers.length;
    const firstProgramChangeIndex = programChanges.length;
    const firstPitchBendIndex = pitchBends.length;
    const firstAftertouchIndex = aftertouch.length;
    const active = new Map<string, ActiveNote[]>();
    while (reader.position < trackEnd) {
      tick += reader.readVarLen();
      let status = reader.readU8();
      if (status < 0x80) {
        if (!runningStatus) throw new Error("MIDI running status appeared before a status byte.");
        reader.unread();
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const type = reader.readU8();
        const length = reader.readVarLen();
        const payload = reader.readBytes(length);
        if (type === 0x03) {
          trackName = ascii(payload);
          trackNames.push(trackName);
        }
        else if (type === 0x51 && payload.length === 3) {
          const microsecondsPerQuarter = (payload[0] << 16) | (payload[1] << 8) | payload[2];
          const bpm = roundTempoBpm(60000000 / microsecondsPerQuarter);
          tempoBpm = bpm;
          tempoEvents.push({ tick, trackIndex, bpm, microsecondsPerQuarter });
        } else if (type === 0x58 && payload.length >= 2) {
          const numerator = payload[0];
          const denominator = 2 ** payload[1];
          timeSig = numerator;
          timeSignatureEvents.push({ tick, trackIndex, numerator, denominator });
        } else if (type === 0x59 && payload.length >= 2) {
          keySignatures.push({ tick, trackIndex, sharpsFlats: signedByte(payload[0]), minor: payload[1] === 1 });
        } else if (type === 0x05 && payload.length > 0) {
          const text = ascii(payload).replace(/\0/g, "").trim();
          if (text) lyrics.push({ tick, trackIndex, text });
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        reader.skip(reader.readVarLen());
        metadata.ignoredEvents = Number(metadata.ignoredEvents || 0) + 1;
        metadata.sysexCount = Number(metadata.sysexCount || 0) + 1;
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      if (command === 0x80 || command === 0x90) {
        const pitch = reader.readU8();
        const velocity = reader.readU8();
        const key = `${channel}:${pitch}`;
        if (command === 0x90 && velocity > 0) {
          const stacked = active.get(key) || [];
          stacked.push({ pitch, channel, startTick: tick, velocity });
          active.set(key, stacked);
        } else {
          const stacked = active.get(key) || [];
          const start = stacked.shift();
          if (start) {
            notes.push({
              id: `note_${trackIndex}_${notes.length + 1}`,
              pitch: start.pitch,
              startTick: start.startTick,
              durationTicks: Math.max(1, tick - start.startTick),
              velocity: start.velocity,
              channel: start.channel,
              trackIndex
            });
            if (stacked.length) active.set(key, stacked);
            else active.delete(key);
          }
        }
      } else if (command === 0xb0) {
        const controller = reader.readU8();
        const value = reader.readU8();
        controllers.push({
          id: `cc_${trackIndex}_${controllers.length + 1}`,
          controller,
          value,
          tick,
          channel,
          trackIndex
        });
      } else if (command === 0xc0) {
        const program = reader.readU8();
        programChanges.push({
          id: `program_${trackIndex}_${programChanges.length + 1}`,
          program,
          tick,
          channel,
          trackIndex
        });
      } else if (command === 0xa0) {
        const note = reader.readU8();
        const value = reader.readU8();
        aftertouch.push({
          id: `aftertouch_${trackIndex}_${aftertouch.length + 1}`,
          kind: "poly",
          note,
          value,
          tick,
          channel,
          trackIndex
        });
      } else if (command === 0xe0) {
        const lsb = reader.readU8();
        const msb = reader.readU8();
        pitchBends.push({
          id: `pitchbend_${trackIndex}_${pitchBends.length + 1}`,
          value: Math.max(0, Math.min(16383, (msb << 7) | lsb)),
          tick,
          channel,
          trackIndex
        });
      } else if (command === 0xd0) {
        const value = reader.readU8();
        aftertouch.push({
          id: `aftertouch_${trackIndex}_${aftertouch.length + 1}`,
          kind: "channel",
          value,
          tick,
          channel,
          trackIndex
        });
      } else {
        metadata.ignoredEvents = Number(metadata.ignoredEvents || 0) + 1;
      }
      if (reader.position > trackEnd) throw new Error(`MIDI track ${trackIndex + 1} event data overran its declared track length.`);
    }
    trackSummaries.push({
      trackIndex,
      name: trackName || `Track ${trackIndex + 1}`,
      lengthBytes: trackLength,
      noteCount: notes.length - firstNoteIndex,
      controllerCount: controllers.length - firstControllerIndex,
      programChangeCount: programChanges.length - firstProgramChangeIndex,
      pitchBendCount: pitchBends.length - firstPitchBendIndex,
      aftertouchCount: aftertouch.length - firstAftertouchIndex,
      startOffset: trackStart,
      endOffset: trackEnd
    });
    reader.position = trackEnd;
  }
  metadata.parsedTrackCount = trackSummaries.length;
  metadata.controllerCount = controllers.length;
  metadata.programChangeCount = programChanges.length;
  metadata.pitchBendCount = pitchBends.length;
  metadata.aftertouchCount = aftertouch.length;
  metadata.tempoEvents = tempoEvents;
  metadata.timeSignatureEvents = timeSignatureEvents;
  metadata.keySignatures = keySignatures;
  metadata.lyrics = lyrics;
  metadata.keySignatureCount = keySignatures.length;
  metadata.lyricCount = lyrics.length;

  return {
    format,
    ppq,
    tempoBpm,
    timeSig,
    trackNames,
    notes: notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch),
    controllers: controllers.sort((a, b) => a.tick - b.tick || a.controller - b.controller),
    programChanges: programChanges.sort((a, b) => a.tick - b.tick || a.program - b.program),
    pitchBends: pitchBends.sort((a, b) => a.tick - b.tick || a.value - b.value),
    aftertouch: aftertouch.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || midiEventOrder(a.id) - midiEventOrder(b.id)),
    metadata
  };
}

function roundTempoBpm(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function midiEventOrder(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

class MidiReader {
  position = 0;
  constructor(private data: Uint8Array) {}
  done() {
    return this.position >= this.data.length;
  }
  remaining() {
    return Math.max(0, this.data.length - this.position);
  }
  unread() {
    this.position = Math.max(0, this.position - 1);
  }
  skip(count: number) {
    this.position = Math.min(this.data.length, this.position + count);
  }
  readU8() {
    if (this.position >= this.data.length) throw new Error("Unexpected end of MIDI file.");
    return this.data[this.position++];
  }
  readU16() {
    return (this.readU8() << 8) | this.readU8();
  }
  readU32() {
    return ((this.readU8() << 24) | (this.readU8() << 16) | (this.readU8() << 8) | this.readU8()) >>> 0;
  }
  readText(length: number) {
    return ascii(this.readBytes(length));
  }
  readBytes(length: number) {
    if (length < 0 || this.position + length > this.data.length) throw new Error("Unexpected end of MIDI file.");
    const out = this.data.slice(this.position, this.position + length);
    this.position += length;
    return out;
  }
  readVarLen() {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const byte = this.readU8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    return value;
  }
}

function ascii(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
}

function signedByte(value: number): number {
  return value > 127 ? value - 256 : value;
}

function printableChunkId(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "?");
}
