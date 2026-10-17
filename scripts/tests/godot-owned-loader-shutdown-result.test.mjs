import assert from "node:assert/strict";
import test from "node:test";
import { assertGodotOwnedLoaderShutdownResult as validate } from "../godot-owned-loader-shutdown-result.mjs";

const started = { test: "owned-loader-shutdown", worker_live_at_quit: true, actual_resource_loaded: true, created_jobs: 1 };
const completed = { test: "owned-loader-shutdown-result", cancelled: true, ok: false, created_jobs: 1 };
const output = (...records) => records.map(record => JSON.stringify(record)).join("\n");

test("requires the successful live-worker and completed-waiter markers", () => {
  assert.deepEqual(validate(`Godot 4.6.3\n${output(started, completed)}\n`), completed);
});
test("rejects a silent or unresumed waiter despite a live-worker marker", () => {
  assert.throws(() => validate(output(started)), /owned-loader-shutdown-result marker, found 0/);
  assert.throws(() => validate(""), /marker, found 0/);
});
test("rejects missing or duplicate lifecycle markers", () => {
  for (const records of [[completed], [started, started, completed], [started, completed, completed]]) {
    assert.throws(() => validate(output(...records)), /marker, found [02]/);
  }
});
test("rejects invalid completed result fields including the count1-to2 mutant", () => {
  for (const mutation of [{ cancelled: false }, { ok: true }, { created_jobs: 2 }, { cancelled: "true" }, { ok: 0 }, { created_jobs: "1" }]) {
    assert.throws(() => validate(output(started, { ...completed, ...mutation })), /waiter must complete/);
  }
});
test("rejects absent completed result fields", () => {
  for (const key of ["cancelled", "ok", "created_jobs"]) {
    const record = { ...completed }; delete record[key];
    assert.throws(() => validate(output(started, record)), /waiter must complete/);
  }
});
test("requires actual loading and a worker still live when quit starts", () => {
  for (const mutation of [{ worker_live_at_quit: false }, { actual_resource_loaded: false }, { created_jobs: 2 }]) {
    assert.throws(() => validate(output({ ...started, ...mutation }, completed)), /actual loaded worker/);
  }
});
