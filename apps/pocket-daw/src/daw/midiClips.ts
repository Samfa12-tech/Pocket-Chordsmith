import { addMediaPoolItem, createMediaPoolItem } from "./mediaPool";
import { cloneProject } from "./dawProject";
import { createEmptyFxChain } from "./fx";
import { recomputeTimelineBars } from "./timeline";
import type { Clip, JsonObject, MediaPoolItem, PocketDawProject, Track } from "./schema";
import type { ParsedMidiAftertouch, ParsedMidiController, ParsedMidiFile, ParsedMidiNote, ParsedMidiPitchBend, ParsedMidiProgramChange } from "./midiParser";

export interface MidiClipData {
  ppq: number;
  notes: ParsedMidiNote[];
  controllers: ParsedMidiController[];
  programChanges: ParsedMidiProgramChange[];
  pitchBends: ParsedMidiPitchBend[];
  aftertouch: ParsedMidiAftertouch[];
  sourceName?: string;
  metadata?: JsonObject;
}

export type MidiQuantizeGrid = "1/4" | "1/8" | "1/16" | "1/32";
export type MidiSwingPercent = 50 | 55 | 60 | 65;
export type MidiGrooveTemplateId = "straight-16" | "pocket-16" | "shuffle-8";
export type MidiPitchTransform = "semitone-down" | "semitone-up" | "octave-down" | "octave-up";
export type MidiVelocityTransform = "level-96" | "humanize-12";
export type MidiNoteField = "pitch" | "startTick" | "durationTicks" | "velocity" | "channel";
export type MidiProgramChangeField = "program" | "tick" | "channel";
export type MidiPitchBendField = "value" | "tick" | "channel";
export type MidiAftertouchField = "value" | "tick" | "channel" | "note";
export type MidiImportPlacementMode = "single-clip" | "per-source-track" | "per-channel" | "drum-channel-split";

export interface MidiGrooveTemplate {
  id: MidiGrooveTemplateId;
  name: string;
  grid: MidiQuantizeGrid;
  swingPercent: MidiSwingPercent;
  velocityAccent: number;
  humanizeTicks: number;
}

export interface MidiRangeEditResult {
  project: PocketDawProject;
  changed: boolean;
  status: string;
}

export interface MidiRangeSplitResult {
  project: PocketDawProject;
  splitCount: number;
  rightClipIds: string[];
}

export interface MidiRangeDeleteResult extends MidiRangeEditResult {
  deletedClipId: string | null;
  rightClipId: string | null;
}

export interface MidiRangeRippleDeleteResult extends MidiRangeDeleteResult {
  rippleBars: number;
  movedClipIds: string[];
}

export interface MidiImportPlacementOptions {
  uri?: string;
  sizeBytes?: number;
  placementMode?: MidiImportPlacementMode;
}

export interface MidiImportPlacementResult {
  project: PocketDawProject;
  item: MediaPoolItem;
  clipIds: string[];
  trackIds: string[];
  primaryClipId: string | null;
  primaryTrackId: string | null;
  placementMode: MidiImportPlacementMode;
}

export interface MidiTimelineRippleDeleteResult {
  project: PocketDawProject;
  changed: boolean;
  status: string;
  rippleBars: number;
  affectedClipIds: string[];
  movedClipIds: string[];
  rightClipIds: string[];
}

export const MIDI_GROOVE_TEMPLATES: readonly MidiGrooveTemplate[] = [
  { id: "straight-16", name: "Straight 16", grid: "1/16", swingPercent: 50, velocityAccent: 0, humanizeTicks: 0 },
  { id: "pocket-16", name: "Pocket 16", grid: "1/16", swingPercent: 50, velocityAccent: 6, humanizeTicks: 10 },
  { id: "shuffle-8", name: "Shuffle 8", grid: "1/8", swingPercent: 60, velocityAccent: 4, humanizeTicks: 0 }
];

export const MIDI_IMPORT_PLACEMENT_MODES: readonly { id: MidiImportPlacementMode; name: string; description: string }[] = [
  { id: "single-clip", name: "Single clip", description: "Import all MIDI events into one editable clip." },
  { id: "per-source-track", name: "Source tracks", description: "Create one DAW MIDI clip and track for each MIDI source track with events." },
  { id: "per-channel", name: "Channels", description: "Create one DAW MIDI clip and track for each MIDI channel with events." },
  { id: "drum-channel-split", name: "Drum channel split", description: "Split General MIDI channel 10 drum notes by pitch while preserving other MIDI channels." }
];

export function midiDataFromClip(clip: Clip): MidiClipData {
  const raw = (clip.metadata?.midi || {}) as Record<string, unknown>;
  return {
    ppq: cleanNumber(raw.ppq, 480),
    sourceName: typeof raw.sourceName === "string" ? raw.sourceName : undefined,
    notes: Array.isArray(raw.notes) ? raw.notes.map(cleanNote).filter(Boolean) as ParsedMidiNote[] : [],
    controllers: Array.isArray(raw.controllers) ? raw.controllers.map(cleanController).filter(Boolean) as ParsedMidiController[] : [],
    programChanges: Array.isArray(raw.programChanges) ? raw.programChanges.map(cleanProgramChange).filter(Boolean) as ParsedMidiProgramChange[] : [],
    pitchBends: Array.isArray(raw.pitchBends) ? raw.pitchBends.map(cleanPitchBend).filter(Boolean) as ParsedMidiPitchBend[] : [],
    aftertouch: Array.isArray(raw.aftertouch) ? raw.aftertouch.map(cleanAftertouch).filter(Boolean) as ParsedMidiAftertouch[] : [],
    metadata: typeof raw.metadata === "object" && raw.metadata && !Array.isArray(raw.metadata) ? raw.metadata as JsonObject : {}
  };
}

export function importMidiFileToProject(project: PocketDawProject, parsed: ParsedMidiFile, name: string, uri?: string, sizeBytes?: number): { project: PocketDawProject; item: MediaPoolItem; clipId: string; trackId: string } {
  const result = importMidiFileToProjectWithPlacement(project, parsed, name, { uri, sizeBytes, placementMode: "single-clip" });
  return {
    project: result.project,
    item: result.item,
    clipId: result.primaryClipId || "",
    trackId: result.primaryTrackId || ""
  };
}

export function importMidiFileToProjectWithPlacement(project: PocketDawProject, parsed: ParsedMidiFile, name: string, options: MidiImportPlacementOptions = {}): MidiImportPlacementResult {
  const placementMode = validMidiPlacementMode(options.placementMode);
  const item = createMediaPoolItem({
    kind: "midi",
    name,
    uri: options.uri,
    mimeType: "audio/midi",
    sizeBytes: options.sizeBytes,
    metadata: {
      ppq: parsed.ppq,
      format: parsed.format,
      tempoBpm: parsed.tempoBpm || null,
      timeSig: parsed.timeSig || null,
      trackNames: parsed.trackNames,
      noteCount: parsed.notes.length,
      controllerCount: parsed.controllers.length,
      programChangeCount: parsed.programChanges.length,
      pitchBendCount: parsed.pitchBends.length,
      aftertouchCount: parsed.aftertouch.length,
      parsedTrackCount: parsed.metadata.parsedTrackCount || null,
      importPlacementMode: placementMode,
      availablePlacementModes: MIDI_IMPORT_PLACEMENT_MODES.map((mode) => mode.id),
      importWarnings: midiImportWarnings(parsed),
      ...(parsed.metadata || {})
    }
  }, project.mediaPool);
  const next = addMediaPoolItem(project, item);
  const groups = midiImportGroups(parsed, name, placementMode);
  let placedProject = next;
  const clipIds: string[] = [];
  const trackIds: string[] = [];
  groups.forEach((group) => {
    const placed = createMidiClip(placedProject, item.id, group.clipName, group.parsed, {
      trackName: group.trackName,
      reuseExistingMidiTrack: placementMode === "single-clip"
    });
    placedProject = placed.project;
    clipIds.push(placed.clipId);
    trackIds.push(placed.trackId);
  });
  return {
    project: placedProject,
    item,
    clipIds,
    trackIds,
    primaryClipId: clipIds[0] || null,
    primaryTrackId: trackIds[0] || null,
    placementMode
  };
}

export function createMidiClip(project: PocketDawProject, mediaPoolItemId: string | undefined, name: string, parsed: Pick<ParsedMidiFile, "ppq" | "notes" | "metadata"> & Partial<Pick<ParsedMidiFile, "controllers" | "programChanges" | "pitchBends" | "aftertouch">>, options: { trackId?: string; trackName?: string; reuseExistingMidiTrack?: boolean } = {}): { project: PocketDawProject; clipId: string; trackId: string } {
  const next = cloneProject(project);
  const track = options.trackId
    ? next.tracks.find((item) => item.id === options.trackId && item.trackType === "midi") || ensureMidiTrack(next, options)
    : ensureMidiTrack(next, options);
  const clipId = nextClipId(next);
  const maxNoteTick = parsed.notes.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), parsed.ppq);
  const maxControllerTick = (parsed.controllers || []).reduce((max, point) => Math.max(max, point.tick + 1), 0);
  const maxProgramTick = (parsed.programChanges || []).reduce((max, point) => Math.max(max, point.tick + 1), 0);
  const maxPitchBendTick = (parsed.pitchBends || []).reduce((max, point) => Math.max(max, point.tick + 1), 0);
  const maxAftertouchTick = (parsed.aftertouch || []).reduce((max, point) => Math.max(max, point.tick + 1), 0);
  const maxTick = Math.max(maxNoteTick, maxControllerTick, maxProgramTick, maxPitchBendTick, maxAftertouchTick);
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
        controllers: parsed.controllers || [],
        programChanges: parsed.programChanges || [],
        pitchBends: parsed.pitchBends || [],
        aftertouch: parsed.aftertouch || [],
        metadata: parsed.metadata || {}
      } as unknown as JsonObject
    }
  });
  recomputeTimelineBars(next);
  return { project: next, clipId, trackId: track.id };
}

export function createEmptyMidiClip(project: PocketDawProject, trackId: string, startBar = 1, name = "MIDI Clip"): { project: PocketDawProject; clipId: string; trackId: string } {
  const track = project.tracks.find((item) => item.id === trackId && item.trackType === "midi");
  if (!track) return { project, clipId: "", trackId: "" };
  const placed = createMidiClip(project, undefined, name, {
    ppq: project.project.ppq || 480,
    notes: [],
    controllers: [],
    programChanges: [],
    pitchBends: [],
    aftertouch: [],
    metadata: {
      source: "empty-midi-clip",
      createdInPocketDaw: true
    }
  }, {
    trackId: track.id,
    trackName: track.name,
    reuseExistingMidiTrack: false
  });
  const next = cloneProject(placed.project);
  const clip = next.timeline.clips.find((item) => item.id === placed.clipId);
  if (clip) {
    clip.startBar = Math.max(1, Number.isFinite(startBar) ? startBar : 1);
    clip.name = name;
  }
  recomputeTimelineBars(next);
  return { project: next, clipId: placed.clipId, trackId: placed.trackId };
}

export function setMidiClipBarLength(project: PocketDawProject, clipId: string, barLength: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return project;
  const cleaned = Math.max(0.25, Math.min(4096, Number.isFinite(barLength) ? Math.round(barLength * 4) / 4 : clip.barLength));
  clip.barLength = cleaned;
  recomputeTimelineBars(next);
  return next;
}

export function addMidiNote(project: PocketDawProject, clipId: string, atTick = 0): PocketDawProject {
  const tick = Math.max(0, Math.round(atTick));
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    data.notes.push({ id: nextNoteId(data.notes), pitch: 60, startTick: tick, durationTicks: data.ppq, velocity: 88, channel: 0 });
  });
  return extendMidiClipToTick(next, clipId, tick + ppq, ppq);
}

export function duplicateMidiNote(project: PocketDawProject, clipId: string, noteId: string): PocketDawProject {
  let endTick = 0;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const source = data.notes.find((note) => note.id === noteId);
    if (!source) return;
    const startTick = Math.max(0, source.startTick + Math.max(1, source.durationTicks));
    endTick = startTick + Math.max(1, source.durationTicks);
    data.notes.push({
      ...source,
      id: nextNoteId(data.notes),
      startTick
    });
  });
  return endTick ? extendMidiClipToTick(next, clipId, endTick, ppq) : next;
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
  return setMidiNoteField(project, clipId, noteId, "velocity", velocity);
}

export function setMidiNoteField(project: PocketDawProject, clipId: string, noteId: string, field: MidiNoteField, value: number): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    const note = data.notes.find((item) => item.id === noteId);
    if (!note) return;
    if (field === "startTick") note.startTick = Math.max(0, Math.round(value));
    else if (field === "durationTicks") note.durationTicks = Math.max(1, Math.round(value));
    else if (field === "pitch") note.pitch = clampMidiPitch(value);
    else if (field === "velocity") note.velocity = clampMidiVelocity(value);
    else note.channel = Math.max(0, Math.min(15, Math.round(value)));
  });
}

export function addMidiController(project: PocketDawProject, clipId: string, atTick = 0): PocketDawProject {
  const tick = Math.max(0, Math.round(atTick));
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    data.controllers.push({
      id: nextControllerId(data.controllers),
      controller: 1,
      value: 64,
      tick,
      channel: 0
    });
  });
  return extendMidiClipToTick(next, clipId, tick + 1, ppq);
}

export type MidiControllerField = "controller" | "value" | "tick" | "channel";

export function duplicateMidiController(project: PocketDawProject, clipId: string, controllerId: string): PocketDawProject {
  let tick = 0;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const source = data.controllers.find((point) => point.id === controllerId);
    if (!source) return;
    tick = Math.max(0, source.tick + Math.max(1, data.ppq));
    data.controllers.push({
      ...source,
      id: nextControllerId(data.controllers),
      tick
    });
  });
  return tick ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function setMidiControllerField(project: PocketDawProject, clipId: string, controllerId: string, field: MidiControllerField, value: number): PocketDawProject {
  let tick: number | null = null;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const point = data.controllers.find((item) => item.id === controllerId);
    if (!point) return;
    if (field === "tick") {
      point.tick = Math.max(0, Math.round(value));
      tick = point.tick;
    }
    else if (field === "channel") point.channel = Math.max(0, Math.min(15, Math.round(value)));
    else point[field] = Math.max(0, Math.min(127, Math.round(value)));
  });
  return tick !== null ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function deleteMidiController(project: PocketDawProject, clipId: string, controllerId: string): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    data.controllers = data.controllers.filter((item) => item.id !== controllerId);
  });
}

export function addMidiProgramChange(project: PocketDawProject, clipId: string, atTick = 0): PocketDawProject {
  const tick = Math.max(0, Math.round(atTick));
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    data.programChanges.push({
      id: nextProgramChangeId(data.programChanges),
      program: 0,
      tick,
      channel: 0
    });
    data.programChanges = data.programChanges.sort((a, b) => a.tick - b.tick || a.program - b.program || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return extendMidiClipToTick(next, clipId, tick + 1, ppq);
}

export function duplicateMidiProgramChange(project: PocketDawProject, clipId: string, programId: string): PocketDawProject {
  let tick = 0;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const source = data.programChanges.find((point) => point.id === programId);
    if (!source) return;
    tick = Math.max(0, source.tick + Math.max(1, data.ppq));
    data.programChanges.push({
      ...source,
      id: nextProgramChangeId(data.programChanges),
      tick
    });
    data.programChanges = data.programChanges.sort((a, b) => a.tick - b.tick || a.program - b.program || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return tick ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function setMidiProgramChangeField(project: PocketDawProject, clipId: string, programId: string, field: MidiProgramChangeField, value: number): PocketDawProject {
  let tick: number | null = null;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const point = data.programChanges.find((item) => item.id === programId);
    if (!point) return;
    if (field === "tick") {
      point.tick = Math.max(0, Math.round(value));
      tick = point.tick;
    }
    else if (field === "channel") point.channel = Math.max(0, Math.min(15, Math.round(value)));
    else point.program = Math.max(0, Math.min(127, Math.round(value)));
    data.programChanges = data.programChanges.sort((a, b) => a.tick - b.tick || a.program - b.program || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return tick !== null ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function deleteMidiProgramChange(project: PocketDawProject, clipId: string, programId: string): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    data.programChanges = data.programChanges.filter((item) => item.id !== programId);
  });
}

export function addMidiPitchBend(project: PocketDawProject, clipId: string, atTick = 0): PocketDawProject {
  const tick = Math.max(0, Math.round(atTick));
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    data.pitchBends.push({
      id: nextPitchBendId(data.pitchBends),
      value: 8192,
      tick,
      channel: 0
    });
    data.pitchBends = data.pitchBends.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || a.value - b.value || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return extendMidiClipToTick(next, clipId, tick + 1, ppq);
}

export function duplicateMidiPitchBend(project: PocketDawProject, clipId: string, bendId: string): PocketDawProject {
  let tick = 0;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const source = data.pitchBends.find((point) => point.id === bendId);
    if (!source) return;
    tick = Math.max(0, source.tick + Math.max(1, data.ppq));
    data.pitchBends.push({
      ...source,
      id: nextPitchBendId(data.pitchBends),
      tick
    });
    data.pitchBends = data.pitchBends.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || a.value - b.value || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return tick ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function setMidiPitchBendField(project: PocketDawProject, clipId: string, bendId: string, field: MidiPitchBendField, value: number): PocketDawProject {
  let tick: number | null = null;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const point = data.pitchBends.find((item) => item.id === bendId);
    if (!point) return;
    if (field === "tick") {
      point.tick = Math.max(0, Math.round(value));
      tick = point.tick;
    }
    else if (field === "channel") point.channel = Math.max(0, Math.min(15, Math.round(value)));
    else point.value = Math.max(0, Math.min(16383, Math.round(value)));
    data.pitchBends = data.pitchBends.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || a.value - b.value || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return tick !== null ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function deleteMidiPitchBend(project: PocketDawProject, clipId: string, bendId: string): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    data.pitchBends = data.pitchBends.filter((item) => item.id !== bendId);
  });
}

export function addMidiAftertouch(project: PocketDawProject, clipId: string, atTick = 0): PocketDawProject {
  const tick = Math.max(0, Math.round(atTick));
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    data.aftertouch.push({
      id: nextAftertouchId(data.aftertouch),
      kind: "channel",
      value: 64,
      tick,
      channel: 0
    });
    data.aftertouch = data.aftertouch.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return extendMidiClipToTick(next, clipId, tick + 1, ppq);
}

export function duplicateMidiAftertouch(project: PocketDawProject, clipId: string, aftertouchId: string): PocketDawProject {
  let tick = 0;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const source = data.aftertouch.find((point) => point.id === aftertouchId);
    if (!source) return;
    tick = Math.max(0, source.tick + Math.max(1, data.ppq));
    data.aftertouch.push({
      ...source,
      id: nextAftertouchId(data.aftertouch),
      tick
    });
    data.aftertouch = data.aftertouch.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return tick ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function setMidiAftertouchField(project: PocketDawProject, clipId: string, aftertouchId: string, field: MidiAftertouchField, value: number): PocketDawProject {
  let tick: number | null = null;
  let ppq = project.project.ppq || 480;
  const next = editMidiClip(project, clipId, (data) => {
    ppq = data.ppq;
    const point = data.aftertouch.find((item) => item.id === aftertouchId);
    if (!point) return;
    if (field === "tick") {
      point.tick = Math.max(0, Math.round(value));
      tick = point.tick;
    } else if (field === "channel") point.channel = Math.max(0, Math.min(15, Math.round(value)));
    else if (field === "note" && point.kind === "poly") point.note = Math.max(0, Math.min(127, Math.round(value)));
    else if (field === "value") point.value = Math.max(0, Math.min(127, Math.round(value)));
    data.aftertouch = data.aftertouch.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  });
  return tick !== null ? extendMidiClipToTick(next, clipId, tick + 1, ppq) : next;
}

export function deleteMidiAftertouch(project: PocketDawProject, clipId: string, aftertouchId: string): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    data.aftertouch = data.aftertouch.filter((item) => item.id !== aftertouchId);
  });
}

export function quantizeMidiClip(project: PocketDawProject, clipId: string, grid: MidiQuantizeGrid): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    const stepTicks = midiQuantizeStepTicks(data.ppq, grid);
    data.notes = data.notes.map((note) => ({
      ...note,
      startTick: Math.max(0, Math.round(note.startTick / stepTicks) * stepTicks)
    }));
    data.metadata = {
      ...(data.metadata || {}),
      lastQuantizeGrid: grid
    };
  });
}

export function swingMidiClip(project: PocketDawProject, clipId: string, percent: MidiSwingPercent): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    data.notes = data.notes.map((note) => {
      return { ...note, startTick: midiSwingStartTick(data.ppq, note.startTick, percent) };
    });
    data.metadata = {
      ...(data.metadata || {}),
      lastSwingPercent: percent
    };
  });
}

export function midiGrooveTemplateById(id: MidiGrooveTemplateId): MidiGrooveTemplate {
  return MIDI_GROOVE_TEMPLATES.find((template) => template.id === id) || MIDI_GROOVE_TEMPLATES[0];
}

export function applyMidiGrooveTemplate(project: PocketDawProject, clipId: string, templateId: MidiGrooveTemplateId): PocketDawProject {
  const template = midiGrooveTemplateById(templateId);
  return editMidiClip(project, clipId, (data) => {
    const stepTicks = midiQuantizeStepTicks(data.ppq, template.grid);
    data.notes = data.notes.map((note) => {
      const quantizedStartTick = Math.max(0, Math.round(note.startTick / stepTicks) * stepTicks);
      const stepIndex = Math.max(0, Math.round(quantizedStartTick / stepTicks));
      const groovedStartTick = template.id === "shuffle-8"
        ? midiSwingStartTick(data.ppq, quantizedStartTick, template.swingPercent)
        : quantizedStartTick + midiGrooveHumanizeOffset(stepIndex, template);
      return {
        ...note,
        startTick: Math.max(0, groovedStartTick),
        velocity: clampMidiVelocity(note.velocity + midiGrooveVelocityOffset(stepIndex, template))
      };
    });
    data.metadata = {
      ...(data.metadata || {}),
      lastGrooveTemplate: template.id,
      lastGrooveTemplateName: template.name,
      lastQuantizeGrid: template.grid,
      lastSwingPercent: template.swingPercent
    };
  });
}

export function transformMidiClipVelocity(project: PocketDawProject, clipId: string, transform: MidiVelocityTransform): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    if (transform === "level-96") {
      data.notes = data.notes.map((note) => ({ ...note, velocity: 96 }));
    } else {
      data.notes = data.notes.map((note, index) => ({
        ...note,
        velocity: clampMidiVelocity(note.velocity + deterministicVelocityOffset(note, index, 12))
      }));
    }
    data.metadata = {
      ...(data.metadata || {}),
      lastVelocityTransform: transform
    };
  });
}

export function transformMidiClipPitch(project: PocketDawProject, clipId: string, transform: MidiPitchTransform): PocketDawProject {
  return editMidiClip(project, clipId, (data) => {
    const delta = midiPitchTransformDelta(transform);
    data.notes = data.notes.map((note) => ({
      ...note,
      pitch: clampMidiPitch(note.pitch + delta)
    }));
    data.metadata = {
      ...(data.metadata || {}),
      lastPitchTransform: transform
    };
  });
}

function midiPitchTransformDelta(transform: MidiPitchTransform): number {
  if (transform === "octave-up") return 12;
  if (transform === "octave-down") return -12;
  return transform === "semitone-up" ? 1 : -1;
}

export function cropMidiClipToRange(project: PocketDawProject, clipId: string, startBar: number, endBar: number): MidiRangeEditResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, status: "Set a valid edit range before cropping MIDI." };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (rangeEnd <= rangeStart) return { project, changed: false, status: "Set a longer edit range before cropping MIDI." };

  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip) return { project, changed: false, status: "Choose a MIDI clip before cropping to range." };
  const cropStartBar = Math.max(clip.startBar, rangeStart);
  const cropEndBar = Math.min(clip.startBar + clip.barLength, rangeEnd);
  if (cropEndBar - cropStartBar <= 0.0001) {
    return { project, changed: false, status: "The selected MIDI clip does not overlap the edit range." };
  }

  const data = midiDataFromClip(clip);
  const ticksPerBar = Math.max(1, data.ppq * Math.max(1, next.project.timeSig));
  const startTick = Math.max(0, Math.round((cropStartBar - clip.startBar) * ticksPerBar));
  const endTick = Math.max(startTick + 1, Math.round((cropEndBar - clip.startBar) * ticksPerBar));
  data.notes = data.notes
    .map((note) => cropMidiNote(note, startTick, endTick))
    .filter(Boolean) as ParsedMidiNote[];
  data.controllers = data.controllers
    .filter((point) => point.tick >= startTick && point.tick < endTick)
    .map((point) => ({ ...point, tick: point.tick - startTick }));
  data.programChanges = data.programChanges
    .filter((point) => point.tick >= startTick && point.tick < endTick)
    .map((point) => ({ ...point, tick: point.tick - startTick }));
  data.pitchBends = data.pitchBends
    .filter((point) => point.tick >= startTick && point.tick < endTick)
    .map((point) => ({ ...point, tick: point.tick - startTick }));
  data.aftertouch = data.aftertouch
    .filter((point) => point.tick >= startTick && point.tick < endTick)
    .map((point) => ({ ...point, tick: point.tick - startTick }));
  data.metadata = {
    ...(data.metadata || {}),
    lastRangeCropBars: { startBar: cropStartBar, endBar: cropEndBar }
  };
  data.notes = data.notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  data.controllers = data.controllers.sort((a, b) => a.tick - b.tick || a.controller - b.controller);
  data.programChanges = data.programChanges.sort((a, b) => a.tick - b.tick || a.program - b.program);
  data.pitchBends = data.pitchBends.sort((a, b) => a.tick - b.tick || a.value - b.value);
  data.aftertouch = data.aftertouch.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  clip.startBar = cropStartBar;
  clip.barLength = cropEndBar - cropStartBar;
  clip.metadata = { ...(clip.metadata || {}), midi: data as unknown as JsonObject };
  recomputeTimelineBars(next);
  return { project: next, changed: true, status: `Cropped ${clip.name} MIDI to edit range.` };
}

export function splitMidiClipsAtRange(project: PocketDawProject, startBar: number, endBar: number): MidiRangeSplitResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return { project, splitCount: 0, rightClipIds: [] };
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (rangeEnd <= rangeStart) return { project, splitCount: 0, rightClipIds: [] };

  let next = project;
  const rightClipIds: string[] = [];
  [rangeStart, rangeEnd].forEach((bar) => {
    const clipIds = next.timeline.clips
      .filter((clip) => clip.type === "midi" && bar > clip.startBar + 0.0001 && bar < clip.startBar + clip.barLength - 0.0001)
      .map((clip) => clip.id);
    clipIds.forEach((clipId) => {
      const split = splitMidiClipAtBar(next, clipId, bar);
      if (split.rightClipId) {
        rightClipIds.push(split.rightClipId);
        next = split.project;
      }
    });
  });

  return { project: next, splitCount: rightClipIds.length, rightClipIds };
}

export function deleteMidiClipRange(project: PocketDawProject, clipId: string, startBar: number, endBar: number): MidiRangeDeleteResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a valid edit range before deleting MIDI range." };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (rangeEnd <= rangeStart) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a longer edit range before deleting MIDI range." };
  }

  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip) return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Choose a MIDI clip before deleting range." };

  const clipStart = clip.startBar;
  const clipEnd = clip.startBar + clip.barLength;
  const removeStart = Math.max(clipStart, rangeStart);
  const removeEnd = Math.min(clipEnd, rangeEnd);
  if (removeEnd - removeStart <= 0.0001) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "The selected MIDI clip does not overlap the edit range." };
  }

  if (removeStart <= clipStart + 0.0001 && removeEnd >= clipEnd - 0.0001) {
    next.timeline.clips = next.timeline.clips.filter((item) => item.id !== clipId);
    recomputeTimelineBars(next);
    return { project: next, changed: true, deletedClipId: clipId, rightClipId: null, status: `Deleted ${clip.name} MIDI range.` };
  }

  const data = midiDataFromClip(clip);
  const ticksPerBar = midiTicksPerBar(next, data);
  const removeStartTick = Math.max(0, Math.round((removeStart - clipStart) * ticksPerBar));
  const removeEndTick = Math.max(removeStartTick + 1, Math.round((removeEnd - clipStart) * ticksPerBar));
  const clipEndTick = Math.max(removeEndTick, Math.round(clip.barLength * ticksPerBar));

  if (removeStart <= clipStart + 0.0001) {
    const rightData = cropMidiDataToTicks(data, removeEndTick, clipEndTick);
    rightData.metadata = {
      ...(rightData.metadata || {}),
      lastRangeDeleteBars: { startBar: removeStart, endBar: removeEnd }
    };
    clip.startBar = removeEnd;
    clip.barLength = clipEnd - removeEnd;
    clip.metadata = { ...(clip.metadata || {}), midi: rightData as unknown as JsonObject };
    recomputeTimelineBars(next);
    return { project: next, changed: true, deletedClipId: null, rightClipId: clip.id, status: `Deleted MIDI range from ${clip.name}.` };
  }

  if (removeEnd >= clipEnd - 0.0001) {
    const leftData = cropMidiDataToTicks(data, 0, removeStartTick);
    leftData.metadata = {
      ...(leftData.metadata || {}),
      lastRangeDeleteBars: { startBar: removeStart, endBar: removeEnd }
    };
    clip.barLength = removeStart - clipStart;
    clip.metadata = { ...(clip.metadata || {}), midi: leftData as unknown as JsonObject };
    recomputeTimelineBars(next);
    return { project: next, changed: true, deletedClipId: null, rightClipId: null, status: `Deleted MIDI range from ${clip.name}.` };
  }

  const leftData = cropMidiDataToTicks(data, 0, removeStartTick);
  const rightData = cropMidiDataToTicks(data, removeEndTick, clipEndTick);
  leftData.metadata = {
    ...(leftData.metadata || {}),
    lastRangeDeleteBars: { startBar: removeStart, endBar: removeEnd }
  };
  rightData.metadata = {
    ...(rightData.metadata || {}),
    lastRangeDeleteBars: { startBar: removeStart, endBar: removeEnd }
  };
  const rightClip: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: nextClipId(next),
    startBar: removeEnd,
    barLength: clipEnd - removeEnd,
    linked: clip.linked,
    name: `${clip.name} range`,
    metadata: { ...(clip.metadata || {}), midi: rightData as unknown as JsonObject }
  };
  clip.barLength = removeStart - clipStart;
  clip.metadata = { ...(clip.metadata || {}), midi: leftData as unknown as JsonObject };
  next.timeline.clips.push(rightClip);
  recomputeTimelineBars(next);
  return { project: next, changed: true, deletedClipId: null, rightClipId: rightClip.id, status: `Deleted MIDI range from ${clip.name}.` };
}

export function rippleDeleteMidiClipRange(project: PocketDawProject, clipId: string, startBar: number, endBar: number): MidiRangeRippleDeleteResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  const empty = { rippleBars: 0, movedClipIds: [] };
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a valid edit range before ripple deleting MIDI range.", ...empty };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (rangeEnd <= rangeStart) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a longer edit range before ripple deleting MIDI range.", ...empty };
  }
  const originalClip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!originalClip) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Choose a MIDI clip before ripple deleting range.", ...empty };
  }
  const removeStart = Math.max(originalClip.startBar, rangeStart);
  const removeEnd = Math.min(originalClip.startBar + originalClip.barLength, rangeEnd);
  const rippleBars = removeEnd - removeStart;
  if (rippleBars <= 0.0001) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "The selected MIDI clip does not overlap the edit range.", ...empty };
  }

  const deleted = deleteMidiClipRange(project, clipId, startBar, endBar);
  if (!deleted.changed) return { ...deleted, ...empty };
  const next = cloneProject(deleted.project);
  const movedClipIds: string[] = [];
  next.timeline.clips.forEach((clip) => {
    if (clip.trackId !== originalClip.trackId) return;
    if (clip.startBar < removeEnd - 0.0001) return;
    clip.startBar = Math.max(1, clip.startBar - rippleBars);
    movedClipIds.push(clip.id);
  });
  recomputeTimelineBars(next);
  const movedLabel = movedClipIds.length === 1 ? "clip" : "clips";
  return {
    project: next,
    changed: true,
    deletedClipId: deleted.deletedClipId,
    rightClipId: deleted.rightClipId,
    rippleBars,
    movedClipIds,
    status: `Ripple deleted MIDI range from ${originalClip.name}; moved ${movedClipIds.length} ${movedLabel}.`
  };
}

export function rippleDeleteMidiTimelineRange(project: PocketDawProject, startBar: number, endBar: number): MidiTimelineRippleDeleteResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  const empty = { rippleBars: 0, affectedClipIds: [], movedClipIds: [], rightClipIds: [] };
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, status: "Set a valid edit range before ripple deleting MIDI across all tracks.", ...empty };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  const rippleBars = rangeEnd - rangeStart;
  if (rippleBars <= 0.0001) {
    return { project, changed: false, status: "Set a longer edit range before ripple deleting MIDI across all tracks.", ...empty };
  }

  const next = cloneProject(project);
  const originalClips = new Map(next.timeline.clips.map((clip) => [clip.id, { startBar: clip.startBar, endBar: clip.startBar + clip.barLength }]));
  const usedClipIds = new Set(next.timeline.clips.map((clip) => clip.id));
  const nextClips: Clip[] = [];
  const affectedClipIds: string[] = [];
  const rightClipIds: string[] = [];

  next.timeline.clips.forEach((clip) => {
    if (clip.type !== "midi") {
      nextClips.push(clip);
      return;
    }
    const clipStart = clip.startBar;
    const clipEnd = clip.startBar + clip.barLength;
    if (clipEnd <= rangeStart + 0.0001 || clipStart >= rangeEnd - 0.0001) {
      nextClips.push(clip);
      return;
    }

    affectedClipIds.push(clip.id);
    const data = midiDataFromClip(clip);
    const ticksPerBar = midiTicksPerBar(next, data);
    const removeStartTick = Math.max(0, Math.round((Math.max(rangeStart, clipStart) - clipStart) * ticksPerBar));
    const removeEndTick = Math.max(removeStartTick + 1, Math.round((Math.min(rangeEnd, clipEnd) - clipStart) * ticksPerBar));
    const clipEndTick = Math.max(removeEndTick, Math.round(clip.barLength * ticksPerBar));
    const leftLength = Math.max(0, rangeStart - clipStart);
    const rightLength = Math.max(0, clipEnd - rangeEnd);

    if (leftLength > 0.0001) {
      const leftData = cropMidiDataToTicks(data, 0, removeStartTick);
      leftData.metadata = {
        ...(leftData.metadata || {}),
        lastTimelineRippleDeleteBars: { startBar: rangeStart, endBar: rangeEnd }
      };
      clip.barLength = leftLength;
      clip.metadata = { ...(clip.metadata || {}), midi: leftData as unknown as JsonObject };
      nextClips.push(clip);
    }
    if (rightLength > 0.0001) {
      const rightId = leftLength > 0.0001 ? nextMidiClipIdFromSet(usedClipIds) : clip.id;
      const rightData = cropMidiDataToTicks(data, removeEndTick, clipEndTick);
      rightData.metadata = {
        ...(rightData.metadata || {}),
        lastTimelineRippleDeleteBars: { startBar: rangeStart, endBar: rangeEnd }
      };
      const rightClip: Clip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: rightId,
        startBar: rangeStart,
        barLength: rightLength,
        linked: clip.linked,
        name: leftLength > 0.0001 ? `${clip.name} ripple` : clip.name,
        metadata: { ...(clip.metadata || {}), midi: rightData as unknown as JsonObject }
      };
      nextClips.push(rightClip);
      if (rightId !== clip.id) rightClipIds.push(rightId);
    }
  });

  next.timeline.clips = nextClips;
  const movedClipIds: string[] = [];
  next.timeline.clips.forEach((clip) => {
    if (clip.type !== "midi") return;
    const original = originalClips.get(clip.id);
    if (!original) return;
    if (original.startBar < rangeEnd - 0.0001) return;
    clip.startBar = Math.max(1, clip.startBar - rippleBars);
    movedClipIds.push(clip.id);
  });
  recomputeTimelineBars(next);
  if (!affectedClipIds.length && !movedClipIds.length) {
    return { project, changed: false, status: "No MIDI clips were affected by the edit range.", ...empty };
  }
  const affectedLabel = affectedClipIds.length === 1 ? "clip" : "clips";
  const movedLabel = movedClipIds.length === 1 ? "later clip" : "later clips";
  return {
    project: next,
    changed: true,
    status: `Ripple deleted MIDI edit range across all tracks; edited ${affectedClipIds.length} ${affectedLabel} and moved ${movedClipIds.length} ${movedLabel}.`,
    rippleBars,
    affectedClipIds,
    movedClipIds,
    rightClipIds
  };
}

function editMidiClip(project: PocketDawProject, clipId: string, updater: (data: MidiClipData) => void): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip) return project;
  const data = midiDataFromClip(clip);
  updater(data);
  data.notes = data.notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  data.controllers = data.controllers.sort((a, b) => a.tick - b.tick || a.controller - b.controller);
  data.programChanges = data.programChanges.sort((a, b) => a.tick - b.tick || a.program - b.program);
  data.pitchBends = data.pitchBends.sort((a, b) => a.tick - b.tick || a.value - b.value);
  data.aftertouch = data.aftertouch.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  clip.metadata = { ...(clip.metadata || {}), midi: data as unknown as JsonObject };
  return next;
}

function extendMidiClipToTick(project: PocketDawProject, clipId: string, endTick: number, ppq: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip) return project;
  const ticksPerBar = Math.max(1, Math.round(ppq)) * Math.max(1, next.project.timeSig);
  const requiredBars = Math.max(0.25, Math.min(4096, Math.ceil((Math.max(1, endTick) / ticksPerBar) * 4) / 4));
  if (requiredBars <= clip.barLength + 0.0001) return project;
  clip.barLength = requiredBars;
  recomputeTimelineBars(next);
  return next;
}

function deterministicVelocityOffset(note: ParsedMidiNote, index: number, amount: number): number {
  const span = amount * 2 + 1;
  const seed = Math.abs(
    note.pitch * 31 +
    note.startTick * 17 +
    note.durationTicks * 13 +
    index * 7 +
    (note.channel ?? 0) * 5
  );
  return (seed % span) - amount;
}

function cropMidiNote(note: ParsedMidiNote, startTick: number, endTick: number): ParsedMidiNote | null {
  const noteStart = Math.max(0, note.startTick);
  const noteEnd = Math.max(noteStart + 1, note.startTick + note.durationTicks);
  const croppedStart = Math.max(noteStart, startTick);
  const croppedEnd = Math.min(noteEnd, endTick);
  if (croppedEnd <= croppedStart) return null;
  return {
    ...note,
    startTick: croppedStart - startTick,
    durationTicks: Math.max(1, croppedEnd - croppedStart)
  };
}

function splitMidiClipAtBar(project: PocketDawProject, clipId: string, bar: number): { project: PocketDawProject; rightClipId: string | null } {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip || bar <= clip.startBar + 0.0001 || bar >= clip.startBar + clip.barLength - 0.0001) {
    return { project, rightClipId: null };
  }

  const data = midiDataFromClip(clip);
  const ticksPerBar = midiTicksPerBar(next, data);
  const splitTick = Math.max(1, Math.round((bar - clip.startBar) * ticksPerBar));
  const clipEndTick = Math.max(splitTick + 1, Math.round(clip.barLength * ticksPerBar));
  const leftData = cropMidiDataToTicks(data, 0, splitTick);
  const rightData = cropMidiDataToTicks(data, splitTick, clipEndTick);
  leftData.metadata = {
    ...(leftData.metadata || {}),
    lastRangeSplitBar: bar
  };
  rightData.metadata = {
    ...(rightData.metadata || {}),
    lastRangeSplitBar: bar
  };

  const rightClip: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: nextClipId(next),
    startBar: bar,
    barLength: clip.startBar + clip.barLength - bar,
    linked: clip.linked,
    name: `${clip.name} split`,
    metadata: { ...(clip.metadata || {}), midi: rightData as unknown as JsonObject }
  };
  clip.barLength = bar - clip.startBar;
  clip.metadata = { ...(clip.metadata || {}), midi: leftData as unknown as JsonObject };
  next.timeline.clips.push(rightClip);
  recomputeTimelineBars(next);
  return { project: next, rightClipId: rightClip.id };
}

function midiTicksPerBar(project: PocketDawProject, data: MidiClipData): number {
  return Math.max(1, data.ppq * Math.max(1, project.project.timeSig));
}

function cropMidiDataToTicks(data: MidiClipData, startTick: number, endTick: number): MidiClipData {
  const cropped: MidiClipData = {
    ...data,
    notes: data.notes
      .map((note) => cropMidiNote(note, startTick, endTick))
      .filter(Boolean) as ParsedMidiNote[],
    controllers: data.controllers
      .filter((point) => point.tick >= startTick && point.tick < endTick)
      .map((point) => ({ ...point, tick: point.tick - startTick })),
    programChanges: data.programChanges
      .filter((point) => point.tick >= startTick && point.tick < endTick)
      .map((point) => ({ ...point, tick: point.tick - startTick })),
    pitchBends: data.pitchBends
      .filter((point) => point.tick >= startTick && point.tick < endTick)
      .map((point) => ({ ...point, tick: point.tick - startTick })),
    aftertouch: data.aftertouch
      .filter((point) => point.tick >= startTick && point.tick < endTick)
      .map((point) => ({ ...point, tick: point.tick - startTick })),
    metadata: { ...(data.metadata || {}) }
  };
  return sortMidiData(cropped);
}

function sortMidiData(data: MidiClipData): MidiClipData {
  data.notes = data.notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  data.controllers = data.controllers.sort((a, b) => a.tick - b.tick || a.controller - b.controller);
  data.programChanges = data.programChanges.sort((a, b) => a.tick - b.tick || a.program - b.program);
  data.pitchBends = data.pitchBends.sort((a, b) => a.tick - b.tick || a.value - b.value);
  data.aftertouch = data.aftertouch.sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || midiMetadataOrder(a.id) - midiMetadataOrder(b.id));
  return data;
}

function clampMidiVelocity(value: number): number {
  return Math.max(1, Math.min(127, Math.round(value)));
}

function clampMidiPitch(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function midiQuantizeStepTicks(ppq: number, grid: MidiQuantizeGrid): number {
  const denominator = Number(grid.split("/")[1]);
  const quarterNotesPerStep = 4 / (Number.isFinite(denominator) && denominator > 0 ? denominator : 16);
  return Math.max(1, Math.round(ppq * quarterNotesPerStep));
}

function midiSwingStartTick(ppq: number, startTick: number, percent: MidiSwingPercent): number {
  const straightEighthTicks = midiQuantizeStepTicks(ppq, "1/8");
  const pairTicks = straightEighthTicks * 2;
  const swingOffsetTicks = Math.round(pairTicks * (percent / 100));
  const eighthIndex = Math.max(0, Math.round(startTick / straightEighthTicks));
  const pairIndex = Math.floor(eighthIndex / 2);
  return eighthIndex % 2 === 0
    ? eighthIndex * straightEighthTicks
    : pairIndex * pairTicks + swingOffsetTicks;
}

function midiGrooveHumanizeOffset(stepIndex: number, template: MidiGrooveTemplate): number {
  if (!template.humanizeTicks) return 0;
  const half = Math.round(template.humanizeTicks / 2);
  const pattern = stepIndex % 4;
  if (pattern === 1) return template.humanizeTicks;
  if (pattern === 2) return -half;
  if (pattern === 3) return half;
  return 0;
}

function midiGrooveVelocityOffset(stepIndex: number, template: MidiGrooveTemplate): number {
  if (!template.velocityAccent) return 0;
  return stepIndex % 2 === 0 ? template.velocityAccent : -Math.round(template.velocityAccent / 2);
}

interface MidiImportGroup {
  key: string;
  clipName: string;
  trackName: string;
  parsed: ParsedMidiFile;
}

function midiImportGroups(parsed: ParsedMidiFile, name: string, placementMode: MidiImportPlacementMode): MidiImportGroup[] {
  if (placementMode === "single-clip") {
    return [{
      key: "all",
      clipName: name,
      trackName: "MIDI",
      parsed: midiSubset(parsed, "single-clip", "all", "All MIDI events")
    }];
  }
  const groupKeys = placementMode === "per-source-track"
    ? midiSourceTrackKeys(parsed)
    : placementMode === "per-channel"
      ? midiChannelKeys(parsed)
      : midiDrumChannelSplitKeys(parsed);
  if (!groupKeys.length) return midiImportGroups(parsed, name, "single-clip");
  return groupKeys.map((key) => {
    const label = midiImportGroupLabel(parsed, placementMode, String(key));
    return {
      key: String(key),
      clipName: `${name} - ${label}`,
      trackName: label,
      parsed: midiSubset(parsed, placementMode, String(key), label)
    };
  });
}

function midiSubset(parsed: ParsedMidiFile, placementMode: MidiImportPlacementMode, key: string, label: string): ParsedMidiFile {
  const filter = (event: { trackIndex?: number; channel?: number }) => {
    if (placementMode === "single-clip") return true;
    if (placementMode === "per-source-track") return String(event.trackIndex ?? 0) === key;
    if (placementMode === "per-channel") return String(event.channel ?? 0) === key;
    return drumSplitEventMatches(event, key);
  };
  const notes = parsed.notes.filter(filter).map((event) => ({ ...event }));
  const controllers = parsed.controllers.filter(filter).map((event) => ({ ...event }));
  const programChanges = parsed.programChanges.filter(filter).map((event) => ({ ...event }));
  const pitchBends = parsed.pitchBends.filter(filter).map((event) => ({ ...event }));
  const aftertouch = parsed.aftertouch.filter(filter).map((event) => ({ ...event }));
  return {
    ...parsed,
    notes,
    controllers,
    programChanges,
    pitchBends,
    aftertouch,
    metadata: {
      ...(parsed.metadata || {}),
      importPlacementMode: placementMode,
      importPlacementKey: key,
      importPlacementLabel: label,
      sourceNoteCount: parsed.notes.length,
      sourceControllerCount: parsed.controllers.length,
      sourceProgramChangeCount: parsed.programChanges.length,
      sourcePitchBendCount: parsed.pitchBends.length,
      sourceAftertouchCount: parsed.aftertouch.length,
      noteCount: notes.length,
      controllerCount: controllers.length,
      programChangeCount: programChanges.length,
      pitchBendCount: pitchBends.length,
      aftertouchCount: aftertouch.length
    }
  };
}

function midiSourceTrackKeys(parsed: ParsedMidiFile): number[] {
  const keys = new Set<number>();
  parsed.notes.forEach((event) => keys.add(event.trackIndex ?? 0));
  parsed.controllers.forEach((event) => keys.add(event.trackIndex ?? 0));
  parsed.programChanges.forEach((event) => keys.add(event.trackIndex ?? 0));
  parsed.pitchBends.forEach((event) => keys.add(event.trackIndex ?? 0));
  parsed.aftertouch.forEach((event) => keys.add(event.trackIndex ?? 0));
  return [...keys].sort((a, b) => a - b);
}

function midiChannelKeys(parsed: ParsedMidiFile): number[] {
  const keys = new Set<number>();
  parsed.notes.forEach((event) => keys.add(event.channel ?? 0));
  parsed.controllers.forEach((event) => keys.add(event.channel ?? 0));
  parsed.programChanges.forEach((event) => keys.add(event.channel ?? 0));
  parsed.pitchBends.forEach((event) => keys.add(event.channel ?? 0));
  parsed.aftertouch.forEach((event) => keys.add(event.channel ?? 0));
  return [...keys].sort((a, b) => a - b);
}

function midiDrumChannelSplitKeys(parsed: ParsedMidiFile): string[] {
  const drumPitches = new Set<number>();
  let hasOther = false;
  let hasDrumControls = false;
  parsed.notes.forEach((event) => {
    if (event.channel === 9) drumPitches.add(event.pitch);
    else hasOther = true;
  });
  parsed.controllers.forEach((event) => { if (event.channel === 9) hasDrumControls = true; else hasOther = true; });
  parsed.programChanges.forEach((event) => { if (event.channel === 9) hasDrumControls = true; else hasOther = true; });
  parsed.pitchBends.forEach((event) => { if (event.channel === 9) hasDrumControls = true; else hasOther = true; });
  parsed.aftertouch.forEach((event) => {
    if (event.channel !== 9) hasOther = true;
    else if (event.kind === "poly" && typeof event.note === "number") drumPitches.add(event.note);
    else hasDrumControls = true;
  });
  return [
    ...[...drumPitches].sort((a, b) => a - b).map((pitch) => `drum-${pitch}`),
    ...(hasDrumControls ? ["drum-controls"] : []),
    ...(hasOther ? ["other"] : [])
  ];
}

function midiImportGroupLabel(parsed: ParsedMidiFile, placementMode: MidiImportPlacementMode, key: string): string {
  if (placementMode === "per-source-track") return midiSourceTrackLabel(parsed, Number(key));
  if (placementMode === "per-channel") return `Channel ${Number(key) + 1}`;
  if (placementMode === "drum-channel-split") {
    if (key === "other") return "Other MIDI Channels";
    if (key === "drum-controls") return "Channel 10 Controls";
    const pitch = Number(key.replace("drum-", ""));
    return `${gmDrumLabel(pitch)} (Ch 10)`;
  }
  return "All MIDI events";
}

function drumSplitEventMatches(event: { channel?: number; pitch?: number; note?: number; kind?: string }, key: string): boolean {
  if (key === "other") return event.channel !== 9;
  if (key === "drum-controls") {
    if (event.channel !== 9) return false;
    if (typeof event.pitch === "number") return false;
    return !(event.kind === "poly" && typeof event.note === "number");
  }
  const pitch = Number(key.replace("drum-", ""));
  if (!Number.isFinite(pitch) || event.channel !== 9) return false;
  if (typeof event.pitch === "number") return event.pitch === pitch;
  return event.kind === "poly" && event.note === pitch;
}

function gmDrumLabel(pitch: number): string {
  const labels: Record<number, string> = {
    35: "Acoustic Bass Drum",
    36: "Kick",
    37: "Side Stick",
    38: "Snare",
    39: "Hand Clap",
    40: "Electric Snare",
    41: "Low Floor Tom",
    42: "Closed Hat",
    43: "High Floor Tom",
    44: "Pedal Hat",
    45: "Low Tom",
    46: "Open Hat",
    47: "Low-Mid Tom",
    48: "High-Mid Tom",
    49: "Crash",
    50: "High Tom",
    51: "Ride",
    57: "Crash 2",
    59: "Ride 2"
  };
  return labels[pitch] || `Drum ${pitch}`;
}

function midiSourceTrackLabel(parsed: ParsedMidiFile, trackIndex: number): string {
  const summary = Array.isArray(parsed.metadata?.trackSummaries)
    ? (parsed.metadata.trackSummaries as unknown[]).find((item) => typeof item === "object" && item && Number((item as Record<string, unknown>).trackIndex) === trackIndex)
    : null;
  const summaryName = summary && typeof (summary as Record<string, unknown>).name === "string" ? String((summary as Record<string, unknown>).name) : "";
  const trackName = parsed.trackNames[trackIndex] || summaryName;
  return trackName || `Track ${trackIndex + 1}`;
}

function validMidiPlacementMode(mode: MidiImportPlacementOptions["placementMode"]): MidiImportPlacementMode {
  return mode === "per-source-track" || mode === "per-channel" || mode === "drum-channel-split" ? mode : "single-clip";
}

function midiImportWarnings(parsed: ParsedMidiFile): string[] {
  const warnings: string[] = [];
  const tempoEvents = Array.isArray(parsed.metadata?.tempoEvents) ? parsed.metadata.tempoEvents : [];
  const uniqueTempos = new Set(tempoEvents.map((event) => typeof event === "object" && event ? Number((event as Record<string, unknown>).bpm) : NaN).filter(Number.isFinite));
  if (tempoEvents.length > 1) {
    warnings.push(uniqueTempos.size > 1
      ? `MIDI file contains ${tempoEvents.length} tempo events; Pocket DAW preserves the tempo map metadata but still renders this imported clip against the project tempo until tempo lanes exist.`
      : `MIDI file contains ${tempoEvents.length} tempo events with the same BPM; Pocket DAW preserves them as metadata.`);
  }
  const timeSignatureEvents = Array.isArray(parsed.metadata?.timeSignatureEvents) ? parsed.metadata.timeSignatureEvents : [];
  const uniqueTimeSigs = new Set(timeSignatureEvents.map((event) => {
    if (!event || typeof event !== "object") return "";
    const raw = event as Record<string, unknown>;
    return `${Number(raw.numerator) || 0}/${Number(raw.denominator) || 0}`;
  }).filter(Boolean));
  if (timeSignatureEvents.length > 1) {
    warnings.push(uniqueTimeSigs.size > 1
      ? `MIDI file contains ${timeSignatureEvents.length} time-signature events; Pocket DAW preserves the map metadata but uses the project time signature until meter lanes exist.`
      : `MIDI file contains ${timeSignatureEvents.length} time-signature events with the same meter; Pocket DAW preserves them as metadata.`);
  }
  return warnings;
}

function ensureMidiTrack(project: PocketDawProject, options: { trackName?: string; reuseExistingMidiTrack?: boolean } = {}): Track {
  const existing = options.reuseExistingMidiTrack !== false ? project.tracks.find((track) => track.trackType === "midi") : null;
  if (existing) return existing;
  const id = uniqueTrackId(project, midiTrackBaseId(options));
  const track: Track = {
    id,
    name: options.trackName || "MIDI",
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

function safeTrackBase(name: string): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return clean ? `midi-${clean}` : "midi";
}

function midiTrackBaseId(options: { trackName?: string; reuseExistingMidiTrack?: boolean }): string {
  if (options.reuseExistingMidiTrack !== false && (!options.trackName || options.trackName === "MIDI")) return "midi";
  return safeTrackBase(options.trackName || "midi");
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
    channel: raw.channel === undefined ? undefined : cleanNumber(raw.channel, 0, 0, 15),
    trackIndex: raw.trackIndex === undefined ? undefined : cleanNumber(raw.trackIndex, 0, 0)
  };
}

function cleanController(value: unknown): ParsedMidiController | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    id: String(raw.id || "cc"),
    controller: cleanNumber(raw.controller ?? raw.cc, 1, 0, 127),
    value: cleanNumber(raw.value, 64, 0, 127),
    tick: cleanNumber(raw.tick ?? raw.startTick, 0),
    channel: raw.channel === undefined ? undefined : cleanNumber(raw.channel, 0, 0, 15),
    trackIndex: raw.trackIndex === undefined ? undefined : cleanNumber(raw.trackIndex, 0, 0)
  };
}

function cleanProgramChange(value: unknown): ParsedMidiProgramChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    id: String(raw.id || "program"),
    program: cleanNumber(raw.program, 0, 0, 127),
    tick: cleanNumber(raw.tick ?? raw.startTick, 0),
    channel: raw.channel === undefined ? undefined : cleanNumber(raw.channel, 0, 0, 15),
    trackIndex: raw.trackIndex === undefined ? undefined : cleanNumber(raw.trackIndex, 0, 0)
  };
}

function cleanPitchBend(value: unknown): ParsedMidiPitchBend | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    id: String(raw.id || "pitchbend"),
    value: cleanNumber(raw.value, 8192, 0, 16383),
    tick: cleanNumber(raw.tick ?? raw.startTick, 0),
    channel: raw.channel === undefined ? undefined : cleanNumber(raw.channel, 0, 0, 15),
    trackIndex: raw.trackIndex === undefined ? undefined : cleanNumber(raw.trackIndex, 0, 0)
  };
}

function cleanAftertouch(value: unknown): ParsedMidiAftertouch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind === "poly" ? "poly" : "channel";
  return {
    id: String(raw.id || "aftertouch"),
    kind,
    value: cleanNumber(raw.value, 0, 0, 127),
    tick: cleanNumber(raw.tick ?? raw.startTick, 0),
    channel: raw.channel === undefined ? undefined : cleanNumber(raw.channel, 0, 0, 15),
    note: kind === "poly" ? cleanNumber(raw.note ?? raw.pitch, 60, 0, 127) : undefined,
    trackIndex: raw.trackIndex === undefined ? undefined : cleanNumber(raw.trackIndex, 0, 0)
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

function nextControllerId(controllers: ParsedMidiController[]): string {
  let i = controllers.length + 1;
  const ids = new Set(controllers.map((controller) => controller.id));
  while (ids.has(`cc_${i}`)) i += 1;
  return `cc_${i}`;
}

function nextProgramChangeId(programChanges: ParsedMidiProgramChange[]): string {
  let i = programChanges.length + 1;
  const ids = new Set(programChanges.map((program) => program.id));
  while (ids.has(`program_${i}`)) i += 1;
  return `program_${i}`;
}

function nextPitchBendId(pitchBends: ParsedMidiPitchBend[]): string {
  let i = pitchBends.length + 1;
  const ids = new Set(pitchBends.map((bend) => bend.id));
  while (ids.has(`pitchbend_${i}`)) i += 1;
  return `pitchbend_${i}`;
}

function nextAftertouchId(aftertouch: ParsedMidiAftertouch[]): string {
  let i = aftertouch.length + 1;
  const ids = new Set(aftertouch.map((point) => point.id));
  while (ids.has(`aftertouch_${i}`)) i += 1;
  return `aftertouch_${i}`;
}

function midiMetadataOrder(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function nextMidiClipIdFromSet(ids: Set<string>): string {
  let i = ids.size + 1;
  while (ids.has(`clip_${String(i).padStart(3, "0")}`)) i += 1;
  const id = `clip_${String(i).padStart(3, "0")}`;
  ids.add(id);
  return id;
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
