import assert from "node:assert/strict";
import test from "node:test";
import { assertGodotProcessSucceeded } from "../godot-run-result.mjs";

const success = { status: 0, stdout: 'Godot 4.6.3\n{"checks":19,"failures":[]}\n', stderr: "" };
test("accepts a clean successful Godot result", () => assert.doesNotThrow(() => assertGodotProcessSucceeded(success)));
test("rejects the hosted exit-zero freed-instance exception despite the green summary", () => {
  const stderr = "SCRIPT ERROR: Cannot call method 'set_process' on a previously freed instance.\n at: _free_subject (test.gd:122)";
  assert.throws(() => assertGodotProcessSucceeded({ ...success, stderr }), /unexpected runtime errors despite exit 0/);
});
test("rejects colored or indented script exceptions on stdout", () => assert.throws(() => assertGodotProcessSucceeded({ ...success, stdout: "  \x1b[31mSCRIPT ERROR: Parse Error: invalid type\x1b[0m\n" }), /SCRIPT ERROR/));
test("rejects leaked objects and resources", () => {
  for (const stderr of ["WARNING: ObjectDB instances leaked at exit.", "ERROR: 1 resources still in use at exit."]) {
    assert.throws(() => assertGodotProcessSucceeded({ ...success, stderr }), /unexpected runtime errors/);
  }
});
test("ordinary warnings and quoted diagnostic data are not script exceptions", () => assert.doesNotThrow(() => assertGodotProcessSucceeded({ ...success, stderr: 'WARNING: Skipped .uid metadata\n{"example":"SCRIPT ERROR: explanation"}\n' })));
test("rejects process failures and preserves spawn errors", () => {
  assert.throws(() => assertGodotProcessSucceeded({ ...success, status: 1 }), /failed with status 1/);
  const error = new Error("timeout");
  assert.throws(() => assertGodotProcessSucceeded({ ...success, error }), actual => actual === error);
});
