import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_ALLOWLIST, verifyWorkflowText } from "../verify-workflow-pins.mjs";

const checkout = ACTION_ALLOWLIST["actions/checkout"];
const use = (reference, comment = "v6") => `steps:\n  - uses: ${reference} # ${comment}\n`;

test("accepts an approved full SHA and intended version comment", () => {
  assert.deepEqual(verifyWorkflowText(use(`actions/checkout@${checkout.sha}`)), []);
});

test("rejects wrong approved SHA", () => {
  assert.match(verifyWorkflowText(use(`actions/checkout@${"a".repeat(40)}`)).join("\n"), /not the approved/);
});

test("rejects tags, branches, and short SHAs", () => {
  for (const ref of ["actions/checkout@v7", "actions/checkout@main", "actions/checkout@d23441a"]) {
    assert.match(verifyWorkflowText(use(ref)).join("\n"), /complete 40-character/);
  }
});

test("rejects malformed and unapproved actions", () => {
  assert.match(verifyWorkflowText(use("actions/checkout")).join("\n"), /malformed uses/);
  assert.match(verifyWorkflowText(use(`example/action@${"a".repeat(40)}`)).join("\n"), /allowlist/);
});

test("rejects misleading comments without reading a SHA as a version", () => {
  assert.match(verifyWorkflowText(use(`actions/checkout@${checkout.sha}`, "v7")).join("\n"), /inline comment # v6/);
});

test("allows repository-local actions separately", () => {
  assert.deepEqual(verifyWorkflowText(use("./.github/actions/release-check", "local")), []);
});
