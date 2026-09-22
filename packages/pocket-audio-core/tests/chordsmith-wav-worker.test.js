import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderChordsmithWavWorkerJob } from "../src/export/chordsmith-wav-worker.js";
import { PocketAudio } from "../src/browser.js";

test("Chordsmith worker renders a project payload to transferable WAV bytes", async () => {
  const project = JSON.parse(await readFile(new URL("./fixtures/manual-bass.pcs.json", import.meta.url), "utf8"));
  const result = await renderChordsmithWavWorkerJob({
    project,
    options: { scope: "section", sectionId: "A", sampleRate: 8000, tailSeconds: 0 }
  });
  const direct = new PocketAudio({ audio: false });
  await direct.loadProject(project);
  const directBlob = await direct.renderWav({ scope: "section", sectionId: "A", sampleRate: 8000, tailSeconds: 0 });
  const directBytes = Buffer.from(await directBlob.arrayBuffer());

  assert.equal(result.type, "audio/wav");
  assert.ok(result.bytes instanceof ArrayBuffer);
  const view = new DataView(result.bytes);
  assert.equal(String.fromCharCode(...new Uint8Array(result.bytes, 0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...new Uint8Array(result.bytes, 8, 4)), "WAVE");
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 8000);
  assert.ok(view.getUint32(40, true) > 0);
  assert.deepEqual(Buffer.from(result.bytes), directBytes, "worker output must preserve the direct Core WAV bytes");
});
