import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { normalizeRenderedEventsForPocketAudioCore } from "../src/audio/pocketAudioCoreAdapter";
import { PCS_PARITY_FIXTURES } from "./pcsParityFixtures";
import {
  analyseRenderedBuffer,
  buildPocketAudioTimeline,
  normalisePocketChordsmithProject,
  renderPocketAudioBuffer,
  renderPocketAudioEventBuffer
} from "../../../packages/pocket-audio-core/src/index.js";

interface CoreFixtureIndexEntry {
  name: string;
  raw: string;
}

const CORE_FIXTURE_INDEX = JSON.parse(
  readFileSync(new URL("../../../packages/pocket-audio-core/tests/fixtures/index.json", import.meta.url), "utf8")
) as CoreFixtureIndexEntry[];

describe("Pocket Chordsmith/Core/DAW parity fixtures", () => {
  it.each(PCS_PARITY_FIXTURES)("$name imports and renders deterministically", ({ raw, expected }) => {
    const pcs = sanitizePocketChordsmithProject(raw);
    const daw = createDawProjectFromChordsmithProject(pcs);
    const events = renderTimelineEvents(daw);
    const coreEvents = normalizeRenderedEventsForPocketAudioCore(events);
    const canonicalEvents = buildPocketAudioTimeline(normalisePocketChordsmithProject(raw)).events;

    expect(daw.sourceRefs[0].original).toMatchObject(raw);
    expect(daw.timeline.clips.map((clip) => clip.sectionId)).toEqual(expected.sequence);
    expect(daw.timeline.clips.map((clip) => clip.barLength)).toEqual(expected.bars);
    expect(events.filter((event) => event.kind !== "texture").map(dawSkeleton)).toEqual(canonicalEvents.map(coreSkeleton));
    expected.eventKinds.forEach((kind) => {
      expect(events.some((event) => event.kind === kind)).toBe(true);
    });
    expect(coreEvents.length).toBe(events.length);
    expect(coreEvents.every((event) => event.startSeconds >= 0 && event.durationSeconds > 0)).toBe(true);

    if (expected.melodyTrackCount) {
      expect(daw.tracks.filter((track) => track.role === "melody")).toHaveLength(expected.melodyTrackCount);
    }
    if (expected.guitarTone) {
      expect(events.find((event) => event.kind === "guitar")?.instrument).toBe(expected.guitarTone);
    }
    if (expected.audioProfile) {
      expect(pcs.audioProfile).toBe(expected.audioProfile);
      expect(daw.sourceRefs[0].normalized).toMatchObject({ audioProfile: expected.audioProfile });
      expect(events.some((event) => event.audioProfile === expected.audioProfile)).toBe(true);
    }
    if (expected.lofiPreset) {
      expect(pcs.lofiPreset).toBe(expected.lofiPreset);
      expect(daw.sourceRefs[0].normalized).toMatchObject({ lofiPreset: expected.lofiPreset });
      expect(events.some((event) => event.lofiPreset === expected.lofiPreset)).toBe(true);
    }
    if (expected.lofiTexture) {
      expect(pcs.lofiTexture).toMatchObject(expected.lofiTexture);
      expect(events.find((event) => event.kind === "texture")?.lofiTexture).toMatchObject(expected.lofiTexture);
    }
    if (expected.drumKit) {
      expect(events.find((event) => event.kind === "kick")?.drumKit).toBe(expected.drumKit);
      expect(daw.tracks.find((track) => track.role === "drums")?.metadata).toMatchObject({ drumKit: expected.drumKit });
    }
    if (expected.bassTone) {
      expect(events.find((event) => event.kind === "bass")?.bassTone).toBe(expected.bassTone);
      expect(daw.tracks.find((track) => track.role === "bass")?.metadata).toMatchObject({ bassTone: expected.bassTone });
    }
    if (expected.chordInstrument) {
      expect(events.find((event) => event.kind === "chord")?.instrument).toBe(expected.chordInstrument);
      expect(daw.tracks.find((track) => track.role === "chords")?.metadata).toMatchObject({ chordsmithInstrument: expected.chordInstrument });
    }
    if (expected.melodyInstruments) {
      expect(new Set(events.filter((event) => event.kind === "melody").map((event) => event.instrument))).toEqual(new Set(expected.melodyInstruments));
      expect(daw.tracks.filter((track) => track.role === "melody").map((track) => track.metadata?.chordsmithInstrument)).toEqual(expected.melodyInstruments);
    }
    if (expected.hasSlide) {
      expect(events.some((event) => typeof event.slideMidi === "number")).toBe(true);
    }
    if (expected.hasTuplet) {
      expect(events.some((event) => event.id.includes("tuplet") || event.time % 0.001 !== 0)).toBe(true);
    }
  });

  it.each(CORE_FIXTURE_INDEX)("core golden fixture $name imports into DAW with the same generated event surface", ({ raw }) => {
    const source = readCoreFixture(raw);
    const pcs = sanitizePocketChordsmithProject(source);
    const daw = createDawProjectFromChordsmithProject(pcs);
    const dawEvents = renderTimelineEvents(daw).filter((event) => event.kind !== "texture");
    const coreEvents = buildPocketAudioTimeline(normalisePocketChordsmithProject(source)).events;

    expect(dawEvents.map(dawSkeleton)).toEqual(coreEvents.map(coreSkeleton));
  });

  it("Glass Tank Afternoon DAW import renders the same lofi audio metrics as Chordsmith/Core", () => {
    const fixture = PCS_PARITY_FIXTURES.find((entry) => entry.name === "Glass Tank Afternoon lofi import");
    expect(fixture).toBeTruthy();

    const canonicalProject = normalisePocketChordsmithProject(fixture!.raw);
    const canonicalRender = renderPocketAudioBuffer(canonicalProject, { sampleRate: 8000 });
    const canonicalMetrics = analyseRenderedBuffer(canonicalRender);

    const pcs = sanitizePocketChordsmithProject(fixture!.raw);
    const daw = createDawProjectFromChordsmithProject(pcs);
    const stemVolumes = ((canonicalProject as { mixer?: { stems?: CoreStemVolumes } }).mixer?.stems) || {};
    const dawEvents = renderTimelineEvents(daw)
      .filter((event) => event.kind !== "texture")
      .map((event) => coreAudioEventFromDaw(event, stemVolumes));
    expect(firstAudioEventDiff(dawEvents, canonicalRender.timeline.events.map(coreAudioEventFromCore))).toBeNull();
    expect(firstRenderFrameDiff(dawEvents, canonicalRender.timeline.events.map(coreAudioEventFromCore), canonicalMetrics.sampleRate)).toBeNull();
    const dawRender = renderPocketAudioEventBuffer(dawEvents, {
      sampleRate: canonicalMetrics.sampleRate,
      durationSeconds: canonicalRender.timeline.duration,
      lofiTexture: (canonicalProject as { lofi?: { texture?: Record<string, unknown> } }).lofi?.texture
    });

    expect(analyseRenderedBuffer(dawRender)).toEqual(canonicalMetrics);
  });
});

function readCoreFixture(raw: string) {
  return JSON.parse(
    readFileSync(new URL(`../../../packages/pocket-audio-core/tests/fixtures/${raw}`, import.meta.url), "utf8")
  ) as Record<string, unknown>;
}

function dawSkeleton(event: ReturnType<typeof renderTimelineEvents>[number]) {
  return cleanSkeleton({
    role: event.role,
    type: event.kind,
    step: event.step,
    time: event.time,
    duration: event.kind === "kick" || event.kind === "snare" || event.kind === "hat" ? undefined : event.duration,
    midi: event.midi,
    midiNotes: event.midiNotes,
    instrument: event.instrument,
    articulation: event.articulation,
    accent: event.accent,
    tuplet: event.kind === "kick" || event.kind === "snare" || event.kind === "hat" ? undefined : event.tuplet,
    slideMidi: event.slideMidi,
    slideOffset: event.slideOffset,
    direction: event.direction,
    drumKit: event.drumKit,
    bassTone: event.bassTone,
    pan: event.role === "drums" ? undefined : event.pan,
    audioProfile: event.audioProfile,
    lofiPreset: event.lofiPreset
  });
}

function coreSkeleton(event: Record<string, unknown>) {
  return cleanSkeleton({
    role: event.stem,
    type: event.type,
    step: event.step,
    time: event.time,
    duration: event.type === "kick" || event.type === "snare" || event.type === "hat" ? undefined : event.duration,
    midi: event.midi,
    midiNotes: event.midiNotes,
    instrument: event.instrument,
    articulation: event.articulation,
    accent: event.accent,
    tuplet: event.type === "kick" || event.type === "snare" || event.type === "hat" ? undefined : event.tuplet,
    slideMidi: event.slideMidi,
    slideOffset: event.slideOffset,
    direction: event.direction,
    drumKit: event.drumKit,
    bassTone: event.bassTone,
    pan: event.stem === "drums" ? undefined : event.pan,
    audioProfile: event.audioProfile,
    lofiPreset: event.lofiPreset
  });
}

type CoreStemVolumes = Record<string, { volume?: number }>;

function coreAudioEventFromDaw(event: ReturnType<typeof renderTimelineEvents>[number], stemVolumes: CoreStemVolumes) {
  return cleanAudioEvent({
    stem: event.role,
    type: event.kind,
    time: event.time,
    duration: event.duration,
    velocity: coreAudioVelocity(event, stemVolumes),
    pan: event.pan,
    midi: event.midi,
    midiNotes: event.midiNotes,
    instrument: event.instrument,
    articulation: event.articulation,
    accent: event.accent,
    tuplet: event.tuplet,
    slideMidi: event.slideMidi,
    slideOffset: event.slideOffset,
    direction: event.direction,
    drumKit: event.drumKit,
    bassTone: event.bassTone,
    audioProfile: event.audioProfile,
    lofiPreset: event.lofiPreset
  });
}

function coreAudioEventFromCore(event: Record<string, unknown>) {
  return cleanAudioEvent({
    stem: event.stem,
    type: event.type,
    time: event.time,
    duration: event.duration,
    velocity: event.velocity,
    pan: event.pan,
    midi: event.midi,
    midiNotes: event.midiNotes,
    instrument: event.instrument,
    articulation: event.articulation,
    accent: event.accent,
    tuplet: event.tuplet,
    slideMidi: event.slideMidi,
    slideOffset: event.slideOffset,
    direction: event.direction,
    drumKit: event.drumKit,
    bassTone: event.bassTone,
    audioProfile: event.audioProfile,
    lofiPreset: event.lofiPreset
  });
}

function firstAudioEventDiff(received: Record<string, unknown>[], expected: Record<string, unknown>[]) {
  if (received.length !== expected.length) return { length: { received: received.length, expected: expected.length } };
  for (let index = 0; index < expected.length; index += 1) {
    if (!audioEventsEqual(received[index], expected[index])) {
      return { index, received: received[index], expected: expected[index] };
    }
  }
  return null;
}

function audioEventsEqual(received: Record<string, unknown>, expected: Record<string, unknown>) {
  const keys = new Set([...Object.keys(received), ...Object.keys(expected)]);
  for (const key of keys) {
    const a = received[key];
    const b = expected[key];
    if (typeof a === "number" && typeof b === "number") {
      if (Math.abs(a - b) > 1e-9) return false;
    } else if (Array.isArray(a) || Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) return false;
    } else if (a !== b) {
      return false;
    }
  }
  return true;
}

function firstRenderFrameDiff(received: Record<string, unknown>[], expected: Record<string, unknown>[], sampleRate: number) {
  for (let index = 0; index < expected.length; index += 1) {
    const a = renderFrameShape(received[index], sampleRate);
    const b = renderFrameShape(expected[index], sampleRate);
    if (JSON.stringify(a) !== JSON.stringify(b)) return { index, received: a, expected: b };
  }
  return null;
}

function renderFrameShape(event: Record<string, unknown>, sampleRate: number) {
  const time = Number(event.time || 0);
  const duration = Number(event.duration || 0.08);
  return {
    start: Math.max(0, Math.floor(time * sampleRate)),
    length: Math.max(1, Math.floor(Math.max(0.02, duration) * sampleRate))
  };
}

function coreAudioVelocity(event: ReturnType<typeof renderTimelineEvents>[number], stemVolumes: CoreStemVolumes) {
  const sourceVolume = event.role === "chords" || event.role === "melody" || event.role === "guitar"
    ? Number(stemVolumes[event.role]?.volume ?? 1)
    : 1;
  return event.velocity * (Number.isFinite(sourceVolume) ? sourceVolume : 1);
}

function cleanAudioEvent(source: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false || value === "") return;
    if (key === "pan" && value === 0) return;
    out[key] = Array.isArray(value) ? value.slice() : value;
  });
  return out;
}

function cleanSkeleton(source: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false || value === "") return;
    out[key] = typeof value === "number" ? round(value) : value;
  });
  return out;
}

function round(value: number) {
  return Math.round(value * 1000000) / 1000000;
}
