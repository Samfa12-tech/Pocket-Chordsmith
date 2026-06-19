import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildPocketAudioTimeline,
  normalisePocketChordsmithProject
} from "../src/index.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const repoRoot = resolve(packageRoot, "../..");
const fixturesDir = join(packageRoot, "tests", "fixtures");
const strictRaw = process.argv.includes("--strict-raw");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(pathToFileURL(join(repoRoot, "apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html")).href, {
    waitUntil: "load"
  });
  await page.waitForFunction(
    () => window.PocketChordsmithParityTrace && typeof window.PocketChordsmithParityTrace.fromProject === "function"
  );

  const fixtureIndex = JSON.parse(await readFile(join(fixturesDir, "index.json"), "utf8"));
  const rows = [];
  const failures = [];
  for (const fixture of fixtureIndex) {
    const rawProject = JSON.parse(await readFile(join(fixturesDir, fixture.raw), "utf8"));
    const browserTrace = await page.evaluate(
      (project) => window.PocketChordsmithParityTrace.fromProject(project),
      rawProject
    );
    const rawCoreTimeline = buildPocketAudioTimeline(toCoreProject(normalisePocketChordsmithProject(rawProject)));
    const browserCoreTimeline = buildPocketAudioTimeline(toCoreProject(normalisePocketChordsmithProject(browserTrace.project)));
    const browserEvents = comparableEvents(browserTrace.events);
    const rawCoreEvents = comparableEvents(rawCoreTimeline.events);
    const browserCoreEvents = comparableEvents(browserCoreTimeline.events);
    const normalisedDiff = firstDiff(browserEvents, browserCoreEvents);
    const rawDiff = firstDiff(browserEvents, rawCoreEvents);
    rows.push({
      fixture: fixture.name,
      browserEvents: browserEvents.length,
      coreAfterChordsmithImportEvents: browserCoreEvents.length,
      rawCoreEvents: rawCoreEvents.length,
      browserTypes: countTypes(browserEvents),
      coreAfterChordsmithImportTypes: countTypes(browserCoreEvents),
      rawCoreTypes: countTypes(rawCoreEvents),
      normalisedMatch: !normalisedDiff,
      rawMatch: !rawDiff,
      firstNormalisedDiff: normalisedDiff,
      firstRawDiff: rawDiff
    });
    if (normalisedDiff) failures.push(`${fixture.name}: Chordsmith browser trace differs from core after Chordsmith import/export`);
    if (strictRaw && rawDiff) failures.push(`${fixture.name}: raw fixture interpretation differs from Chordsmith browser import`);
  }

  if (pageErrors.length) {
    failures.push(`Chordsmith browser page errors: ${pageErrors.join(" | ")}`);
  }

  printReport(rows);
  if (failures.length) {
    console.error(`\nChordsmith browser trace comparison failed:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

function toCoreProject(value) {
  if (value?.app === "PocketAudioProject") return value;
  if (value?.project?.app === "PocketAudioProject") return value.project;
  throw new Error("normalisePocketChordsmithProject did not return a PocketAudioProject");
}

function comparableEvents(events) {
  return events.map((event) => compactEvent(event)).sort(compareEvents);
}

function compactEvent(event) {
  const out = {
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

function copyOptional(target, source, key) {
  if (source[key] !== undefined && source[key] !== null) target[key] = source[key];
}

function copyOptionalNumber(target, source, key) {
  if (source[key] !== undefined && source[key] !== null) target[key] = round(source[key]);
}

function compareEvents(a, b) {
  return (a.time - b.time)
    || roleOrder(a.type) - roleOrder(b.type)
    || (a.step ?? -1) - (b.step ?? -1)
    || JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function roleOrder(type) {
  return ["kick", "snare", "hat", "bass", "chord", "guitar", "melody", "texture", "fx"].indexOf(type) + 1 || 99;
}

function firstDiff(left, right) {
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const actual = left[index] || null;
    const expected = right[index] || null;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return { index, browser: actual, core: expected };
  }
  return null;
}

function countTypes(events) {
  return events.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] || 0) + 1;
    return counts;
  }, {});
}

function numberOrNull(value) {
  return value === undefined || value === null ? null : Number(value);
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000000) / 1000000;
}

function printReport(rows) {
  console.log("Chordsmith browser trace comparison");
  rows.forEach((row) => {
    const normalised = row.normalisedMatch ? "ok" : "DRIFT";
    const raw = row.rawMatch ? "ok" : "drift";
    console.log(
      `- ${row.fixture}: browser=${row.browserEvents}, core-after-import=${row.coreAfterChordsmithImportEvents} (${normalised}), raw-core=${row.rawCoreEvents} (${raw})`
    );
    if (!row.rawMatch) {
      console.log(`  raw first diff: ${JSON.stringify(row.firstRawDiff)}`);
    }
    if (!row.normalisedMatch) {
      console.log(`  normalised first diff: ${JSON.stringify(row.firstNormalisedDiff)}`);
    }
  });
}
