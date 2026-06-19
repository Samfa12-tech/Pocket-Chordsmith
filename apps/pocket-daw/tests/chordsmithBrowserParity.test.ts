import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderTimelineEvents, type RenderedEvent } from "../src/audio/eventRenderer";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";

interface CoreFixtureIndexEntry {
  name: string;
  raw: string;
}

interface BrowserTraceEvent {
  type: string;
  sectionId?: string;
  section?: string;
  step?: number;
  time?: number;
  duration?: number;
  dur?: number;
  accent?: boolean;
  tuplet?: boolean;
  midi?: number;
  slideMidi?: number;
  slideOffset?: number;
  instrument?: string;
  tone?: string;
  articulation?: string;
  pan?: number;
  direction?: string;
  midiNotes?: number[];
}

interface BrowserTrace {
  project: Record<string, unknown>;
  events: BrowserTraceEvent[];
}

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const chordsmithHtml = pathToFileURL(resolve(repoRoot, "apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html")).href;
const fixtureIndex = JSON.parse(
  readFileSync(new URL("../../../packages/pocket-audio-core/tests/fixtures/index.json", import.meta.url), "utf8")
) as CoreFixtureIndexEntry[];

let browser: Awaited<ReturnType<typeof chromium.launch>>;
let page: Awaited<ReturnType<typeof browser.newPage>>;
const pageErrors: string[] = [];

describe("Pocket DAW parity against the live Chordsmith browser trace", () => {
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    page.on("pageerror", (error: Error) => pageErrors.push(error.message));
    await page.goto(chordsmithHtml, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.PocketChordsmithParityTrace && typeof window.PocketChordsmithParityTrace.fromProject === "function"
    );
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  }, 60_000);

  it.each(fixtureIndex)("renders DAW events matching Chordsmith browser import trace for $name", async ({ raw }) => {
    const rawProject = JSON.parse(
      readFileSync(new URL(`../../../packages/pocket-audio-core/tests/fixtures/${raw}`, import.meta.url), "utf8")
    ) as Record<string, unknown>;

    const browserTrace = await page.evaluate(
      (project: Record<string, unknown>) => window.PocketChordsmithParityTrace.fromProject(project),
      rawProject
    ) as BrowserTrace;

    const pcs = sanitizePocketChordsmithProject(browserTrace.project);
    const daw = createDawProjectFromChordsmithProject(pcs);
    const sectionByClip = new Map(daw.timeline.clips.map((clip) => [clip.id, clip.sectionId || "A"]));
    const dawEvents = renderTimelineEvents(daw)
      .filter((event) => event.kind !== "texture")
      .map((event) => compactDawEvent(event, sectionByClip))
      .sort(compareEvents);
    const browserEvents = browserTrace.events.map(compactBrowserEvent).sort(compareEvents);

    expect(pageErrors).toEqual([]);
    expect(firstDiff(dawEvents, browserEvents)).toBeNull();
    expectDawSoundSettingsFromBrowserProject(daw, browserTrace.project);
  }, 60_000);

  it("preserves non-default Chordsmith browser mix slider values in DAW import", async () => {
    const browserTrace = await page.evaluate(() => {
      const values = {
        masterVol: "0.73",
        chordVol: "0.41",
        beatVol: "0.67",
        leadVol: "0.52",
        guitarVolume: "0.37"
      };
      Object.entries(values).forEach(([id, value]) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (!input) throw new Error(`Missing Chordsmith control: ${id}`);
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      return window.PocketChordsmithParityTrace.current();
    }) as BrowserTrace;
    const pcs = sanitizePocketChordsmithProject(browserTrace.project);
    const daw = createDawProjectFromChordsmithProject(pcs);

    expect(browserTrace.project).toMatchObject({
      masterVolume: 0.73,
      chordVolume: 0.41,
      beatVolume: 0.67,
      leadVolume: 0.52,
      guitarVolume: 0.37
    });
    expectDawSoundSettingsFromBrowserProject(daw, browserTrace.project);
  }, 60_000);
});

function compactBrowserEvent(event: BrowserTraceEvent) {
  const out: Record<string, unknown> = {
    type: event.type,
    sectionId: event.sectionId || event.section || "A",
    step: numberOrNull(event.step),
    time: round(event.time),
    duration: round(event.duration ?? event.dur),
    accent: Boolean(event.accent),
    tuplet: Boolean(event.tuplet)
  };
  copyOptional(out, event, "midi");
  copyOptional(out, event, "slideMidi");
  copyOptionalNumber(out, event, "slideOffset");
  if (event.instrument !== undefined && event.instrument !== null) out.instrument = event.instrument;
  else if (event.tone !== undefined && event.tone !== null) out.instrument = event.tone;
  copyOptional(out, event, "articulation");
  copyOptionalNumber(out, event, "pan");
  copyOptional(out, event, "direction");
  if (Array.isArray(event.midiNotes)) out.midiNotes = event.midiNotes.slice();
  return out;
}

function compactDawEvent(event: RenderedEvent, sectionByClip: Map<string, string | null | undefined>) {
  const out: Record<string, unknown> = {
    type: event.kind,
    sectionId: sectionByClip.get(event.clipId) || "A",
    step: numberOrNull(event.step),
    time: round(event.time),
    duration: round(event.duration),
    accent: Boolean(event.accent),
    tuplet: Boolean(event.tuplet)
  };
  copyOptional(out, event, "midi");
  copyOptional(out, event, "slideMidi");
  copyOptionalNumber(out, event, "slideOffset");
  copyOptional(out, event, "instrument");
  copyOptional(out, event, "articulation");
  copyOptionalNumber(out, event, "pan");
  copyOptional(out, event, "direction");
  if (Array.isArray(event.midiNotes)) out.midiNotes = event.midiNotes.slice();
  return out;
}

function copyOptional(target: Record<string, unknown>, source: object, key: string) {
  const value = (source as Record<string, unknown>)[key];
  if (value !== undefined && value !== null) target[key] = value;
}

function copyOptionalNumber(target: Record<string, unknown>, source: object, key: string) {
  const value = round((source as Record<string, unknown>)[key]);
  if (value === null || ((key === "pan" || key === "slideOffset") && value === 0)) return;
  target[key] = value;
}

function compareEvents(a: Record<string, unknown>, b: Record<string, unknown>) {
  return (Number(a.time) - Number(b.time))
    || roleOrder(String(a.type)) - roleOrder(String(b.type))
    || (Number(a.step ?? -1) - Number(b.step ?? -1))
    || JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function roleOrder(type: string) {
  return ["kick", "snare", "hat", "bass", "chord", "guitar", "melody", "texture", "fx"].indexOf(type) + 1 || 99;
}

function firstDiff(received: Record<string, unknown>[], expected: Record<string, unknown>[]) {
  const count = Math.max(received.length, expected.length);
  for (let index = 0; index < count; index += 1) {
    const actual = received[index] || null;
    const wanted = expected[index] || null;
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) return { index, received: actual, expected: wanted };
  }
  return null;
}

function expectDawSoundSettingsFromBrowserProject(daw: ReturnType<typeof createDawProjectFromChordsmithProject>, project: Record<string, unknown>) {
  const byId = new Map(daw.tracks.map((track) => [track.id, track]));
  const source = daw.sourceRefs[0]?.normalized as Record<string, unknown> | undefined;
  expect(source).toMatchObject({
    audioProfile: project.audioProfile,
    lofiPreset: project.lofiPreset,
    drumKit: project.drumKit,
    drumGroovePreset: project.drumGroovePreset,
    bassTone: project.bassTone,
    chordInstrument: project.chordInstrument,
    masterVolume: project.masterVolume,
    chordVolume: project.chordVolume,
    beatVolume: project.beatVolume,
    leadVolume: project.leadVolume,
    guitarVolume: project.guitarVolume
  });
  expect(byId.get("master")?.volume).toBe(project.masterVolume);
  expect(byId.get("chords")?.volume).toBe(project.chordVolume);
  expect(byId.get("drums")?.volume).toBe(project.beatVolume);
  expect(byId.get("bass")?.volume).toBe(project.beatVolume);
  expect(byId.get("melody")?.volume).toBe(project.leadVolume);
  expect(byId.get("guitar")?.volume).toBe(project.guitarVolume);
  expect(byId.get("drums")?.metadata).toMatchObject({ drumKit: project.drumKit });
  expect(byId.get("bass")?.metadata).toMatchObject({ bassTone: project.bassTone });
  expect(byId.get("chords")?.metadata).toMatchObject({ chordsmithInstrument: project.chordInstrument });
}

function numberOrNull(value: unknown) {
  return value === undefined || value === null ? null : Number(value);
}

function round(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1_000_000) / 1_000_000;
}

declare global {
  interface Window {
    PocketChordsmithParityTrace: {
      current(): BrowserTrace;
      fromProject(project: Record<string, unknown>): BrowserTrace;
    };
  }
}
