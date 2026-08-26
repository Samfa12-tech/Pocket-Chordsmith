import assert from "node:assert/strict";
import test from "node:test";
import { JOB_IDS } from "../plan-ci.mjs";
import { verifyFamilyGate } from "../verify-family-gate.mjs";

function fixtures(planned = []) {
  const wanted = new Set(planned);
  return {
    plan: { jobs: Object.fromEntries(JOB_IDS.map((job) => [job, wanted.has(job)])) },
    results: Object.fromEntries(JOB_IDS.map((job) => [job, { result: wanted.has(job) ? "success" : "skipped" }]))
  };
}

test("accepts successful planned jobs and planner-authorized skips", () => {
  const { plan, results } = fixtures(["governance", "handoff"]);
  assert.deepEqual(verifyFamilyGate(plan, results), []);
});

test("rejects a planned job that is skipped, cancelled, or failed", () => {
  for (const result of ["skipped", "cancelled", "failure"]) {
    const { plan, results } = fixtures(["governance"]);
    results.governance.result = result;
    assert.match(verifyFamilyGate(plan, results).join("\n"), /planned by CI planner/);
  }
});

test("rejects an unplanned skip override or unexpected execution", () => {
  const { plan, results } = fixtures(["governance"]);
  results.handoff.result = "success";
  assert.match(verifyFamilyGate(plan, results).join("\n"), /not planned by CI planner/);
});
