import type { JsonObject } from "./schema";

export interface ParsedMidiNote {
  id: string;
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  channel?: number;
}

export interface ParsedMidiFile {
  format: number;
  ppq: number;
  tempoBpm?: number;
  timeSig?: number;
  trackNames: string[];
  notes: ParsedMidiNote[];
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
  if (reader.readText(4) !== "MThd") throw new Error("MIDI file is missing an MThd header.");
  const headerLength = reader.readU32();
  const format = reader.readU16();
  const trackCount = reader.readU16();
  const division = reader.readU16();
  if (division & 0x8000) throw new Error("SMPTE-timed MIDI files are not supported yet.");
  const ppq = division;
  reader.skip(Math.max(0, headerLength - 6));

  const notes: ParsedMidiNote[] = [];
  const trackNames: string[] = [];
  const metadata: JsonObject = { ignoredEvents: 0, trackCount, format };
  let tempoBpm: number | undefined;
  let timeSig: number | undefined;

  for (let trackIndex = 0; trackIndex < trackCount && !reader.done(); trackIndex += 1) {
    if (reader.readText(4) !== "MTrk") throw new Error("MIDI track chunk is missing an MTrk header.");
    const trackEnd = reader.position + reader.readU32();
    let tick = 0;
    let runningStatus = 0;
    const active = new Map<string, ActiveNote>();
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
        if (type === 0x03) trackNames.push(ascii(payload));
        else if (type === 0x51 && payload.length === 3) tempoBpm = Math.round(60000000 / ((payload[0] << 16) | (payload[1] << 8) | payload[2]));
        else if (type === 0x58 && payload.length >= 1) timeSig = payload[0];
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        reader.skip(reader.readVarLen());
        metadata.ignoredEvents = Number(metadata.ignoredEvents || 0) + 1;
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      if (command === 0x80 || command === 0x90) {
        const pitch = reader.readU8();
        const velocity = reader.readU8();
        const key = `${channel}:${pitch}`;
        if (command === 0x90 && velocity > 0) {
          active.set(key, { pitch, channel, startTick: tick, velocity });
        } else {
          const start = active.get(key);
          if (start) {
            notes.push({
              id: `note_${trackIndex}_${notes.length + 1}`,
              pitch: start.pitch,
              startTick: start.startTick,
              durationTicks: Math.max(1, tick - start.startTick),
              velocity: start.velocity,
              channel: start.channel
            });
            active.delete(key);
          }
        }
      } else if (command === 0xa0 || command === 0xb0 || command === 0xe0) {
        reader.skip(2);
        metadata.ignoredEvents = Number(metadata.ignoredEvents || 0) + 1;
      } else if (command === 0xc0 || command === 0xd0) {
        reader.skip(1);
        metadata.ignoredEvents = Number(metadata.ignoredEvents || 0) + 1;
      } else {
        metadata.ignoredEvents = Number(metadata.ignoredEvents || 0) + 1;
      }
    }
    reader.position = trackEnd;
  }

  return {
    format,
    ppq,
    tempoBpm,
    timeSig,
    trackNames,
    notes: notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch),
    metadata
  };
}

class MidiReader {
  position = 0;
  constructor(private data: Uint8Array) {}
  done() {
    return this.position >= this.data.length;
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
