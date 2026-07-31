import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const source = fs.readFileSync(path.join(appRoot, "src", "genre-composer.js"), "utf8");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(appRoot, "tests", "fixtures", "genre-composer-seeds.json"), "utf8"),
);
const context = { globalThis: {}, Uint32Array, Date };
vm.createContext(context);
vm.runInContext(source, context, { filename: "genre-composer.js" });
const composer = context.globalThis.PocketChordsmithGenreComposer;

if (!composer || composer.VERSION !== fixtures.generatorVersion) {
  throw new Error("Fixture generator version does not match the loaded composer.");
}

const metalByArchetype = new Map();
const archetypeCoverage = new Map();
let totalMilliseconds = 0;
let maximumMilliseconds = 0;
for (const fixture of fixtures.fixtures) {
  const startedAt = performance.now();
  const plan = composer.composeSong(fixture);
  const elapsedMilliseconds = performance.now() - startedAt;
  totalMilliseconds += elapsedMilliseconds;
  maximumMilliseconds = Math.max(maximumMilliseconds, elapsedMilliseconds);
  const repeat = composer.composeSong(fixture);
  const errors = composer.validatePlan(plan);
  if (errors.length) throw new Error(`${fixture.seed}: ${errors.join(", ")}`);
  if (JSON.stringify(plan) !== JSON.stringify(repeat)) {
    throw new Error(`${fixture.seed}: deterministic plan mismatch`);
  }
  if (plan.sections.length < 2 || !plan.sequence.length) {
    throw new Error(`${fixture.seed}: not a full-song plan`);
  }
  archetypeCoverage.set(`${fixture.genre}:${fixture.archetype}`, (archetypeCoverage.get(`${fixture.genre}:${fixture.archetype}`) || 0) + 1);
  if (fixture.genre === "metal") {
    metalByArchetype.set(fixture.archetype, (metalByArchetype.get(fixture.archetype) || 0) + 1);
  }
}

for (const archetype of Object.keys(composer.GENRES.metal.archetypes)) {
  if (metalByArchetype.get(archetype) !== 3) {
    throw new Error(`${archetype}: expected exactly three review seeds`);
  }
}
for (const [genreId, genre] of Object.entries(composer.GENRES)) {
  for (const archetype of Object.keys(genre.archetypes)) {
    if (!archetypeCoverage.has(`${genreId}:${archetype}`)) {
      throw new Error(`${genreId}:${archetype}: missing review seed`);
    }
  }
}

console.log(`genre-composer fixtures: ${fixtures.fixtures.length} deterministic plans verified; ${totalMilliseconds.toFixed(2)} ms total, ${maximumMilliseconds.toFixed(2)} ms max`);
