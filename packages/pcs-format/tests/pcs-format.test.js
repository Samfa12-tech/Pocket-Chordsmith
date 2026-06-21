import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Buffer } from "node:buffer";
import { PCS_PREFIX, PCS_SCHEMA_VERSION, parsePcsProject, schema16SectionSummary, schema16SongSequence, validateSchema16Project } from "../src/index.js";

const valid = JSON.parse(readFileSync(new URL("../fixtures/schema16-valid.json", import.meta.url), "utf8"));
const invalid = JSON.parse(readFileSync(new URL("../fixtures/schema16-invalid.json", import.meta.url), "utf8"));
const traceSmoke = JSON.parse(readFileSync(new URL("../fixtures/schema16-trace-smoke.json", import.meta.url), "utf8"));

test("exports PCS1 and schema-16 metadata", () => {
  assert.equal(PCS_PREFIX, "PCS1:");
  assert.equal(PCS_SCHEMA_VERSION, 16);
});

test("validates required schema-16 section fields and preserves unknown fields", () => {
  const result = validateSchema16Project(valid);

  assert.equal(result.ok, true);
  assert.equal(valid.unknownFutureField.keep, true);
});

test("returns structured errors for invalid fixtures", () => {
  const result = validateSchema16Project(invalid);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schemaVersion/);
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

test("summarizes playable Section A and song sequence fixture units", () => {
  const sequence = schema16SongSequence(traceSmoke);
  const sectionA = schema16SectionSummary(traceSmoke, "A");

  assert.deepEqual(sequence, ["A", "B", "A"]);
  assert.equal(sectionA.ok, true);
  assert.equal(sectionA.bars, 1);
  assert.deepEqual(sectionA.melodyTracks[0], [62, 65, 69, 74]);
  assert.deepEqual(sectionA.bassNotes, [38]);
});
