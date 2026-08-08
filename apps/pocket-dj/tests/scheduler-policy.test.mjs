import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(
  new URL("../pocket_dj_v1g_core_bridge.html", import.meta.url),
  "utf8",
);
const source = html.match(
  /\/\* scheduler-policy:start \*\/([\s\S]*?)\/\* scheduler-policy:end \*\//,
)?.[1];
assert.ok(source, "Pocket DJ scheduler policy must remain directly testable");
const context = vm.createContext({});
vm.runInContext(
  `${source}; globalThis.policy = pocketDjSchedulerPolicy; globalThis.catchupDecision = pocketDjSchedulerCatchupDecision;`,
  context,
);
const policy = context.policy;
const catchupDecision = context.catchupDecision;

function resumeAfterStall(stallSeconds, stepSeconds = 0.125) {
  const lookahead = 0.22;
  const lateness = 0.08;
  const results = [];
  for (let time = 0; time < stallSeconds + lookahead; time += stepSeconds) {
    results.push(policy(time, stallSeconds, lookahead, lateness));
  }
  return results;
}

for (const stall of [0.25, 1, 5]) {
  test(`${stall}s stall drops stale steps without an audible burst`, () => {
    const results = resumeAfterStall(stall);
    const scheduled = results.filter((result) => result === "schedule").length;
    assert.ok(results.includes("drop"));
    assert.ok(
      scheduled <= 3,
      `scheduled ${scheduled} audible steps after ${stall}s stall`,
    );
  });
}

test("future steps wait outside the bounded lookahead", () => {
  assert.equal(policy(10.3, 10, 0.22, 0.08), "wait");
  assert.equal(policy(10.1, 10, 0.22, 0.08), "schedule");
  assert.equal(policy(9.8, 10, 0.22, 0.08), "drop");
});

test("tab and AudioContext interruptions stop rather than replaying stale steps", () => {
  assert.match(html, /document\.addEventListener\("visibilitychange"/);
  assert.match(html, /audioCtx\.addEventListener\?\.\("statechange"/);
  assert.match(html, /droppedStepCount\+\+/);
  assert.match(html, /missedTickCount\+\+/);
  assert.match(html, /getPocketDJSchedulerDiagnostics/);
  assert.match(html, /if\(lastDroppedStep !== null\)/);
});

test("pathological stalls reset after a bounded number of catch-up steps", () => {
  assert.equal(catchupDecision(255, 256), "continue");
  assert.equal(catchupDecision(256, 256), "reset");
  assert.match(html, /catchupResetCount\+\+/);
  assert.match(html, /nextEventTime = tickNow/);
});
