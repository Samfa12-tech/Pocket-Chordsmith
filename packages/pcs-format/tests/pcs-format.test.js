import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Buffer } from "node:buffer";
import {
  PCS_FIXTURE_ROLES,
  PCS_FORMAT_SCOPE,
  PCS_FORMAT_STATUS,
  PCS_PREFIX,
  PCS_SCHEMA_VERSION,
  parsePcsProject,
  schema16SectionSummary,
  schema16SongSequence,
  validateSchema16Project,
} from "../src/index.js";

const valid = JSON.parse(
  readFileSync(
    new URL("../fixtures/schema16-valid.json", import.meta.url),
    "utf8",
  ),
);
const invalid = JSON.parse(
  readFileSync(
    new URL("../fixtures/schema16-invalid.json", import.meta.url),
    "utf8",
  ),
);
const traceSmoke = JSON.parse(
  readFileSync(
    new URL("../fixtures/schema16-trace-smoke.json", import.meta.url),
    "utf8",
  ),
);
const currentAppDemo = JSON.parse(
  readFileSync(
    new URL(
      "../../../apps/chordsmith-web/demos/lofi_study_room_loop.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const fixtureIndex = JSON.parse(
  readFileSync(new URL("../fixtures/index.json", import.meta.url), "utf8"),
);

test("exports PCS1 and schema-16 metadata", () => {
  assert.equal(PCS_PREFIX, "PCS1:");
  assert.equal(PCS_SCHEMA_VERSION, 16);
  assert.equal(PCS_FORMAT_STATUS, "0.1.0-scaffold");
});

test("documents package scope without claiming app-runtime ownership", () => {
  assert.ok(PCS_FORMAT_SCOPE.owns.includes("PCS1 prefix metadata"));
  assert.ok(PCS_FORMAT_SCOPE.owns.includes("schema-16 projectVersion metadata"));
  assert.ok(
    PCS_FORMAT_SCOPE.owns.includes("schemaVersion compatibility alias metadata"),
  );
  assert.ok(PCS_FORMAT_SCOPE.owns.includes("compatibility fixture metadata"));
  assert.ok(
    PCS_FORMAT_SCOPE.doesNotOwn.includes("full app runtime normalization"),
  );
  assert.ok(
    PCS_FORMAT_SCOPE.doesNotOwn.includes(
      "audio rendering or scheduling behavior",
    ),
  );
});

test("indexes fixture roles and expected high-level assertions", () => {
  assert.equal(fixtureIndex.package, "pcs-format");
  assert.equal(fixtureIndex.status, PCS_FORMAT_STATUS);
  assert.equal(fixtureIndex.schemaVersion, PCS_SCHEMA_VERSION);
  assert.equal(fixtureIndex.prefix, PCS_PREFIX);

  for (const fixture of fixtureIndex.fixtures) {
    assert.equal(PCS_FIXTURE_ROLES[fixture.file], fixture.role);
  }

  const validMetadata = fixtureIndex.fixtures.find(
    (fixture) => fixture.file === "schema16-valid.json",
  );
  const invalidMetadata = fixtureIndex.fixtures.find(
    (fixture) => fixture.file === "schema16-invalid.json",
  );
  const traceMetadata = fixtureIndex.fixtures.find(
    (fixture) => fixture.file === "schema16-trace-smoke.json",
  );

  assert.deepEqual(schema16SongSequence(valid), validMetadata.expectedSequence);
  assert.deepEqual(
    schema16SongSequence(traceSmoke),
    traceMetadata.expectedSequence,
  );
  assert.equal(validateSchema16Project(valid).ok, validMetadata.expectedValid);
  assert.equal(
    validateSchema16Project(traceSmoke).ok,
    traceMetadata.expectedValid,
  );
  assert.equal(
    validateSchema16Project(invalid).ok,
    invalidMetadata.expectedValid,
  );
  assert.match(
    validateSchema16Project(invalid).errors.join("\n"),
    /progressionA/,
  );
  assert.equal(
    schema16SectionSummary(traceSmoke, traceMetadata.summarySection).bars,
    traceMetadata.expectedSectionBars,
  );
});

test("validates required schema-16 section fields and preserves unknown fields", () => {
  const result = validateSchema16Project(valid);

  assert.equal(result.ok, true);
  assert.equal(valid.unknownFutureField.keep, true);
});

test("accepts legacy schemaVersion-only schema-16 fixtures", () => {
  const result = validateSchema16Project(valid);
  const parsed = parsePcsProject(JSON.stringify(valid));

  assert.equal(valid.projectVersion, undefined);
  assert.equal(valid.schemaVersion, PCS_SCHEMA_VERSION);
  assert.equal(result.ok, true);
  assert.equal(parsed.ok, true);
});

test("accepts current app exports using canonical projectVersion", () => {
  const result = validateSchema16Project(currentAppDemo);

  assert.equal(currentAppDemo.projectVersion, PCS_SCHEMA_VERSION);
  assert.equal(currentAppDemo.schemaVersion, undefined);
  assert.equal(result.ok, true);
  assert.deepEqual(schema16SongSequence(currentAppDemo), [
    "A",
    "A",
    "B",
    "A",
    "C",
    "B",
    "D",
    "A",
  ]);

  const sectionB = schema16SectionSummary(currentAppDemo, "B");
  assert.equal(sectionB.ok, true);
  assert.equal(sectionB.bars, 4);
  assert.deepEqual(sectionB.progression, [0, 5, 3, 6]);
  assert.deepEqual(sectionB.melodyTracks[0].slice(0, 4), [4, null, null, null]);
  assert.deepEqual(sectionB.bassNotes.slice(0, 9), [
    0,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    4,
  ]);
});

test("returns structured errors for invalid fixtures", () => {
  const result = validateSchema16Project(invalid);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /projectVersion/);
  assert.match(result.errors.join("\n"), /progressionA/);
});

test("parses raw JSON and PCS1 base64 JSON without mutating melody note values", () => {
  const raw = JSON.stringify(valid);
  const encoded = `${PCS_PREFIX}${Buffer.from(raw, "utf8").toString("base64url")}`;

  const rawResult = parsePcsProject(raw);
  const encodedResult = parsePcsProject(encoded);

  assert.equal(rawResult.ok, true);
  assert.equal(encodedResult.ok, true);
  assert.deepEqual(rawResult.project.melodyTracksA[0], [60, 62, 64, 67]);
  assert.deepEqual(encodedResult.project.melodyTracksA[0], [60, 62, 64, 67]);
  assert.equal(encodedResult.project.unknownFutureField.keep, true);
});

test("parses current app raw JSON and PCS1 payloads", () => {
  const raw = JSON.stringify(currentAppDemo);
  const encoded = `${PCS_PREFIX}${Buffer.from(raw, "utf8").toString("base64url")}`;

  const rawResult = parsePcsProject(raw);
  const encodedResult = parsePcsProject(encoded);

  assert.equal(rawResult.ok, true);
  assert.equal(encodedResult.ok, true);
  assert.equal(rawResult.project.projectVersion, PCS_SCHEMA_VERSION);
  assert.deepEqual(
    encodedResult.project.songSequence,
    currentAppDemo.songSequence,
  );
});

test("summarizes playable Section A and song sequence fixture units", () => {
  const sequence = schema16SongSequence(traceSmoke);
  const sectionA = schema16SectionSummary(traceSmoke, "A");

  assert.deepEqual(sequence, ["A", "B", "A"]);
  assert.equal(sectionA.ok, true);
  assert.equal(sectionA.bars, 1);
  assert.deepEqual(sectionA.melodyTracks[0], [62, 65, 69, 74]);
  assert.deepEqual(sectionA.bassNotes, [38]);
});

test("summarizes sections object shape when present", () => {
  const objectShape = {
    projectVersion: PCS_SCHEMA_VERSION,
    bpm: 96,
    songSequence: ["a", "b"],
    sections: {
      A: {
        bars: 2,
        progression: [0, 4],
        grid: { kick: [1, 0], snare: [0, 1] },
        melodyTracks: [[0, 2]],
        melodyInstruments: ["lead"],
        melodyHold: [[false, true]],
        bassNotes: [0, 4],
      },
      B: {
        bars: 1,
        progression: [5],
        grid: { kick: [1] },
        melodyTracks: [[4]],
        melodyInstruments: ["lead"],
        bassNotes: [5],
      },
    },
  };

  const result = validateSchema16Project(objectShape);
  const sectionA = schema16SectionSummary(objectShape, "A");

  assert.equal(result.ok, true);
  assert.deepEqual(schema16SongSequence(objectShape), ["A", "B"]);
  assert.equal(sectionA.ok, true);
  assert.equal(sectionA.bars, 2);
  assert.deepEqual(sectionA.melodyHold, [[false, true]]);
});
