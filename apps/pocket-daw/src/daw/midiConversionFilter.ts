import type { JsonObject } from "./schema";

export type MidiConversionSourceMode = "all" | "source-track" | "channel";

export interface MidiConversionSourceFilter {
  mode: MidiConversionSourceMode;
  value: number | null;
}

export interface MidiConversionSourceOption {
  mode: MidiConversionSourceMode;
  value: number | null;
  label: string;
}

export const DEFAULT_MIDI_CONVERSION_SOURCE_FILTER: MidiConversionSourceFilter = {
  mode: "all",
  value: null
};

export function normalizeMidiConversionSourceFilter(mode: unknown, value: unknown): MidiConversionSourceFilter {
  const sourceMode = mode === "source-track" || mode === "channel" ? mode : "all";
  if (sourceMode === "all") return DEFAULT_MIDI_CONVERSION_SOURCE_FILTER;
  const numeric = Math.max(0, Math.round(Number(value)));
  return {
    mode: sourceMode,
    value: Number.isFinite(numeric) ? numeric : 0
  };
}

export function midiNoteMatchesConversionSource(note: { channel?: number; trackIndex?: number }, filter?: MidiConversionSourceFilter): boolean {
  const source = filter || DEFAULT_MIDI_CONVERSION_SOURCE_FILTER;
  if (source.mode === "all") return true;
  if (source.value === null) return false;
  if (source.mode === "source-track") return note.trackIndex === source.value;
  return note.channel === source.value;
}

export function midiConversionSourceLabel(filter?: MidiConversionSourceFilter): string {
  const source = filter || DEFAULT_MIDI_CONVERSION_SOURCE_FILTER;
  if (source.mode === "source-track") return `source track ${Number(source.value ?? 0) + 1}`;
  if (source.mode === "channel") return `MIDI channel ${Number(source.value ?? 0) + 1}`;
  return "all MIDI notes";
}

export function midiConversionSourceOptions(
  notes: Array<{ channel?: number; trackIndex?: number }>,
  metadata?: JsonObject
): MidiConversionSourceOption[] {
  const options: MidiConversionSourceOption[] = [{ mode: "all", value: null, label: "All MIDI notes" }];
  const trackIndices = uniqueSorted(notes.map((note) => note.trackIndex));
  const channels = uniqueSorted(notes.map((note) => note.channel));
  trackIndices.forEach((trackIndex) => {
    options.push({
      mode: "source-track",
      value: trackIndex,
      label: sourceTrackLabel(metadata, trackIndex)
    });
  });
  channels.forEach((channel) => {
    options.push({
      mode: "channel",
      value: channel,
      label: `Channel ${channel + 1}`
    });
  });
  return options;
}

function sourceTrackLabel(metadata: JsonObject | undefined, trackIndex: number): string {
  const summaries = Array.isArray(metadata?.trackSummaries) ? metadata.trackSummaries : [];
  const summary = summaries.find((item) => !!item && typeof item === "object" && !Array.isArray(item) && Number((item as Record<string, unknown>).trackIndex) === trackIndex) as Record<string, unknown> | undefined;
  const name = typeof summary?.name === "string" && summary.name.trim() ? summary.name.trim() : "";
  return name ? `Track ${trackIndex + 1}: ${name}` : `Track ${trackIndex + 1}`;
}

function uniqueSorted(values: Array<number | undefined>): number[] {
  return Array.from(new Set(values.filter((value): value is number => Number.isFinite(value)).map((value) => Math.max(0, Math.round(value))))).sort((a, b) => a - b);
}
