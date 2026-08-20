import assert from "node:assert/strict";
import test from "node:test";
import { JOB_IDS, parseNameStatus, planChangedFiles } from "../plan-ci.mjs";

const required = (files, options) => planChangedFiles(files, options).jobs;
const noneDaw = (jobs) => assert.equal(jobs["pocket-daw-linux"] || jobs["pocket-daw-browser-e2e"] || jobs["pocket-daw-release-contract"] || jobs["pocket-daw-windows-native"], false);

test("name-status parser includes both sides of renames and deletions", () => {
  assert.deepEqual(parseNameStatus("R100\0apps/pocket-dj/old.ts\0apps/pocket-dj/new.ts\0D\0apps/pocket-audio-handoff/a.js\0"), [
    "apps/pocket-dj/old.ts", "apps/pocket-dj/new.ts", "apps/pocket-audio-handoff/a.js"
  ]);
});

test("documentation, Handoff, and Chordsmith changes do not select DAW", () => {
  noneDaw(required(["docs/guide.md"]));
  noneDaw(required(["apps/pocket-audio-handoff/index.html"]));
  noneDaw(required(["apps/chordsmith-web/index.html"]));
});

test("DAW frontend, UI, native, and release paths select their conservative scopes", () => {
  let jobs = required(["apps/pocket-daw/src/daw/project.ts"]);
  assert.equal(jobs["pocket-daw-linux"], true);
  assert.equal(jobs["pocket-daw-browser-e2e"], false);
  jobs = required(["apps/pocket-daw/src/app/App.ts"]);
  assert.equal(jobs["pocket-daw-browser-e2e"], true);
  jobs = required(["apps/pocket-daw/src-tauri/src/lib.rs"]);
  assert.equal(jobs["pocket-daw-windows-native"], true);
  jobs = required(["apps/pocket-daw/scripts/release-updater-build.mjs"]);
  assert.equal(jobs["pocket-daw-release-contract"], true);
  assert.equal(jobs["pocket-daw-windows-native"], true);
});

test("multiple component changes select every affected component", () => {
  const jobs = required(["apps/pocket-dj/index.html", "apps/pocket-audio-handoff/index.html"]);
  assert.equal(jobs["pocket-dj"], true);
  assert.equal(jobs.handoff, true);
});

test("unknown paths and full events fail closed to all jobs", () => {
  for (const plan of [planChangedFiles(["unrecognised/new-file" ]), planChangedFiles(["docs/a.md"], { event: "schedule" }), planChangedFiles(["docs/a.md"], { explicitFull: true })]) {
    assert.deepEqual(plan.jobs, Object.fromEntries(JOB_IDS.map((job) => [job, true])));
  }
});
