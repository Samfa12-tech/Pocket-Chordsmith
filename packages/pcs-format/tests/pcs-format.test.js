import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Buffer } from "node:buffer";
import {
  PCS_FIXTURE_ROLES,
  PCS_FORMAT_SCOPE,
  PCS_FORMAT_STATUS,
  PCS_FORMAT_FEATURES,
  PCS_ARTICULATIONS,
  PCS_LEGACY_SCHEMA_VERSION,
  PCS_PREFIX,
  PCS_PROFILE_IDS,
  PCS_SCHEMA_VERSION,
  PCS_DRUM_LANES,
  encodePcsProject,
  migratePcsProject,
  negotiatePcsCapabilities,
  parsePcsProject,
  projectToSchema16,
  projectToSchema17,
  schema16SectionSummary,
  schema16SongSequence,
  validatePcsProject,
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
const rich = JSON.parse(
  readFileSync(
    new URL("../fixtures/schema17-funk-rich-events.json", import.meta.url),
    "utf8",
  ),
);
const invalidRich = JSON.parse(
  readFileSync(
    new URL("../fixtures/schema17-invalid.json", import.meta.url),
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

test("exports stable PCS1, schema, profile, feature, and drum metadata", () => {
  assert.equal(PCS_PREFIX, "PCS1:");
  assert.equal(PCS_SCHEMA_VERSION, 17);
  assert.equal(PCS_LEGACY_SCHEMA_VERSION, 16);
  assert.equal(PCS_FORMAT_STATUS, "0.2.0-schema17");
  assert.ok(PCS_PROFILE_IDS.includes("funk_groove"));
  assert.ok(PCS_FORMAT_FEATURES.includes("rich-events-v1"));
  for (const articulation of [
    "finger", "slap", "pop", "mute", "ghost", "hammer", "pull", "slide",
    "hold", "staccato", "legato", "bend", "vibrato", "tremolo", "open",
    "chug", "scratch", "palm_mute", "accent", "flam", "drag", "roll", "choke",
    "note", "strum_up", "strum_down",
  ]) assert.ok(PCS_ARTICULATIONS.includes(articulation));
  for (const lane of ["hat_closed", "hat_open", "china", "percussion", "hat", "open_hat", "perc"]) {
    assert.ok(PCS_DRUM_LANES.includes(lane));
  }
});

test("documents package scope without claiming app-runtime ownership", () => {
  assert.ok(PCS_FORMAT_SCOPE.owns.includes("PCS1 prefix metadata"));
  assert.ok(PCS_FORMAT_SCOPE.owns.includes("rich event normalization"));
  assert.ok(
    PCS_FORMAT_SCOPE.doesNotOwn.includes("full app runtime normalization"),
  );
  assert.ok(
    PCS_FORMAT_SCOPE.doesNotOwn.includes(
      "audio rendering, scheduling, or sound recipes",
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
  assert.equal(valid.schemaVersion, PCS_LEGACY_SCHEMA_VERSION);
  assert.equal(result.ok, true);
  assert.equal(parsed.ok, true);
});

test("accepts current app exports using canonical projectVersion", () => {
  const result = validateSchema16Project(currentAppDemo);

  assert.equal(currentAppDemo.projectVersion, PCS_LEGACY_SCHEMA_VERSION);
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
  assert.equal(rawResult.project.projectVersion, PCS_LEGACY_SCHEMA_VERSION);
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
    projectVersion: PCS_LEGACY_SCHEMA_VERSION,
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

test("validates schema 17 rich intent and retains all unknown data", () => {
  const withTickDuration = structuredClone(rich);
  withTickDuration.sections.A.tracks.bass.events[0].durationTicks = 240;
  const result = validatePcsProject(withTickDuration);
  const parsed = parsePcsProject(encodePcsProject(withTickDuration));

  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, PCS_SCHEMA_VERSION);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.project.unknownFutureField.keep, true);
  assert.equal(parsed.project.sections.A.unknownSectionField.keep, true);
  assert.equal(parsed.project.sections.A.tracks.bass.events[0].unknownEventField, true);
  assert.equal(
    parsed.project.sections.A.tracks.bass.events[0].technique.funk.vendorUnknown.keep[1].deep,
    true,
  );
  assert.equal(parsed.project.soundProfile.unknownProfileField, "keep");
  assert.equal(parsed.project.sections.A.tracks.bass.events[0].durationTicks, 240);
});

test("rejects invalid schema 17 sound profiles and rich events", () => {
  const result = validatePcsProject(invalidRich);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /soundProfile.preset/);
  assert.match(result.errors.join("\n"), /duration must be a positive/);
  assert.match(result.errors.join("\n"), /technique must be namespace:name or a namespaced object/);
});

test("migrates schema 16 deterministically into normalized schema 17 tracks", () => {
  const first = migratePcsProject(valid);
  const second = projectToSchema17(valid);

  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(first.project.projectVersion, PCS_SCHEMA_VERSION);
  assert.equal(first.project.soundProfile.id, "standard");
  assert.equal(first.project.sections.A.tracks.bass.events[0].note, 36);
  assert.equal(first.project.sections.A.drumLanes.kick[0].sound, "kick");
  assert.equal(first.project.unknownFutureField.keep, true);
});

test("migrates Chordsmith compact pitch indexes to schema 17 MIDI notes", () => {
  const result = migratePcsProject(currentAppDemo);

  assert.equal(result.ok, true);
  assert.equal(result.project.sections.A.tracks.melody_1.events[0].note, 81);
  assert.equal(result.project.sections.A.tracks.bass.events[0].note, 45);
  assert.equal(validatePcsProject(result.project).ok, true);
});

test("projects rich schema 17 to schema 16 with explicit semantic loss", () => {
  const result = projectToSchema16(rich);
  const restored = migratePcsProject(result.project);

  assert.equal(result.ok, true);
  assert.equal(result.project.projectVersion, PCS_LEGACY_SCHEMA_VERSION);
  assert.equal(validateSchema16Project(result.project).ok, true);
  assert.equal(result.lossReport.lossy, true);
  assert.equal(result.lossReport.richSourceRetained, true);
  assert.ok(result.lossReport.losses.some((loss) => loss.code === "sound-profile"));
  assert.ok(result.lossReport.losses.some((loss) => loss.code === "drum-lane"));
  assert.equal(result.project.unknownFutureField.keep, true);
  assert.equal(result.project.sections.A.unknownSectionField.keep, true);
  assert.equal(
    result.project.compatibility.richSource.sections.A.tracks.bass.events[0].technique.funk.vendorUnknown.keep[1].deep,
    true,
  );
  assert.equal(restored.ok, true);
  assert.equal(restored.project.soundProfile.unknownProfileField, "keep");
  assert.equal(
    restored.project.sections.A.tracks.bass.events[0].unknownEventField,
    true,
  );
});

test("negotiates target capability gaps without mutating source intent", () => {
  const result = negotiatePcsCapabilities(rich, {
    formatFeatures: ["rich-events", "sound-profile"],
    soundProfiles: ["standard"],
    articulations: ["note"],
    drumLanes: ["kick", "snare"],
  });

  assert.equal(result.ok, false);
  assert.ok(result.unsupported.some((loss) => loss.kind === "soundProfile"));
  assert.ok(result.unsupported.some((loss) => loss.kind === "drumLane"));
  assert.ok(result.unsupported.some((loss) => loss.kind === "techniqueNamespace" && loss.value === "funk"));
  assert.ok(result.lossReport.lossy);
  assert.equal(rich.soundProfile.id, "funk_groove");
});

test("accepts namespaced technique objects when a target advertises the namespace", () => {
  const result = negotiatePcsCapabilities(rich, {
    formatFeatures: rich.formatFeatures,
    soundProfiles: ["funk_groove"],
    articulations: ["slap", "pop", "mute", "staccato"],
    drumLanes: ["kick", "snare", "hat_open"],
    techniqueNamespaces: ["funk"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.required.techniqueNamespaces, ["funk"]);
  assert.equal(result.lossReport.lossy, false);
});

test("detects drum capabilities in combined rich drum tracks", () => {
  const project = structuredClone(rich);
  project.sections.A.tracks.drums = {
    events: [{ step: 0, duration: 1, lane: "crash", sound: "crash", velocity: 110, articulation: "accent" }],
  };
  const result = negotiatePcsCapabilities(project, {
    formatFeatures: project.formatFeatures,
    soundProfiles: ["funk_groove"],
    articulations: PCS_ARTICULATIONS,
    drumLanes: ["kick"],
    techniqueNamespaces: ["funk"],
  });

  assert.ok(result.unsupported.some((loss) => loss.kind === "drumLane" && loss.value === "crash"));
});
