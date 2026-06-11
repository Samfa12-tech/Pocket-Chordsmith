import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyseRenderedBuffer,
  buildPocketAudioTimeline,
  buildPocketChordsmithShareCode,
  normalisePocketChordsmithProject,
  renderPocketAudioBuffer
} from "../src/index.js";
import { fixtures } from "../tests/fixtures/fixture-projects.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const fixturesDir = join(root, "tests", "fixtures");
const goldenDir = join(root, "tests", "golden");

await mkdir(fixturesDir, { recursive: true });
await mkdir(goldenDir, { recursive: true });

const index = [];
for (const fixture of fixtures) {
  const normalised = normalisePocketChordsmithProject(fixture.project);
  const timeline = buildPocketAudioTimeline(normalised);
  const rendered = renderPocketAudioBuffer(normalised, { sampleRate: 16000 });
  const metrics = analyseRenderedBuffer(rendered);
  index.push({
    name: fixture.name,
    description: fixture.description,
    raw: `${fixture.name}.pcs.json`,
    shareCode: `${fixture.name}.pcs1.txt`,
    normalised: `${fixture.name}.normalised.json`,
    events: `../golden/${fixture.name}.events.json`,
    audioMetrics: `../golden/${fixture.name}.audio-metrics.json`
  });
  await writeJson(join(fixturesDir, `${fixture.name}.pcs.json`), fixture.project);
  await writeFile(join(fixturesDir, `${fixture.name}.pcs1.txt`), buildPocketChordsmithShareCode(fixture.project));
  await writeJson(join(fixturesDir, `${fixture.name}.normalised.json`), normalised);
  await writeJson(join(goldenDir, `${fixture.name}.events.json`), simplifyEvents(timeline.events));
  await writeJson(join(goldenDir, `${fixture.name}.audio-metrics.json`), metrics);
}
await writeJson(join(fixturesDir, "index.json"), index);
console.log(`Updated ${fixtures.length} Pocket Audio Core golden fixtures.`);

function simplifyEvents(events) {
  return events.map((event) => {
    const out = {
      sectionId: event.sectionId,
      arrangementIndex: event.arrangementIndex,
      bar: event.bar,
      beat: event.beat,
      step: event.step,
      time: round(event.time),
      duration: round(event.duration),
      tick: event.tick,
      stem: event.stem,
      type: event.type,
      velocity: round(event.velocity),
      accent: Boolean(event.accent),
      tuplet: Boolean(event.tuplet)
    };
    ["midi", "midiNotes", "instrument", "articulation", "pan", "slideMidi", "slideOffset", "direction"].forEach((key) => {
      if (event[key] !== undefined) out[key] = Array.isArray(event[key]) ? event[key].slice() : event[key];
    });
    return out;
  });
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
