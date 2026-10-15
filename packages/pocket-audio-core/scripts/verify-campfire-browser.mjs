import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const fixtures = JSON.parse(await readFile(new URL("tests/fixtures/campfire-reference-hashes.json", root), "utf8"));
const bundle = await readFile(new URL("dist/pocket-audio-core.browser.esm.js", root));
const server = createServer((request, response) => {
  response.setHeader("content-type", request.url === "/core.js" ? "text/javascript" : "text/html");
  response.end(request.url === "/core.js" ? bundle : "<!doctype html><title>Campfire audio contract</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async (records) => {
    const core = await import("/core.js");
    const results = [];
    for (const record of records) {
      const offsetFrames = Math.round(record.sampleRate * 0.1);
      const context = new OfflineAudioContext(1, record.frames + offsetFrames + 100, record.sampleRate);
      const prepared = core.prepareCampfireAcousticPlayback(context, { midi: record.midi, velocity: 1 }, { noteGain: 1 });
      if (prepared.getActiveVoiceCount() !== 0) throw new Error("Preparing audio started a voice");
      prepared.start(offsetFrames / record.sampleRate);
      const rendered = await context.startRendering();
      const pcm = rendered.getChannelData(0);
      if (!pcm.subarray(0, offsetFrames).every((value) => value === 0)) throw new Error("Audio started before the requested sample position");
      const dry = pcm.slice(offsetFrames, offsetFrames + record.frames);
      const bytes = new ArrayBuffer(dry.length * 4);
      const view = new DataView(bytes);
      dry.forEach((sample, index) => view.setFloat32(index * 4, sample, true));
      const actualHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
      if (actualHash !== record.sha256) throw new Error(`Browser PCM mismatch for ${record.sampleRate}/${record.midi}`);
      results.push({ sampleRate: record.sampleRate, midi: record.midi, frames: dry.length, sha256: actualHash, passed: true });
    }
    const cancelledContext = new OfflineAudioContext(1, 48000, 48000);
    const cancelled = core.prepareCampfireAcousticPlayback(cancelledContext, { midi: 50 });
    const voice = cancelled.start(0.5);
    voice.stop();
    voice.stop();
    cancelled.stopAll();
    const silent = await cancelledContext.startRendering();
    if (!silent.getChannelData(0).every((value) => value === 0)) throw new Error("Cancelled future voice became audible");
    return { renderer: "Chromium OfflineAudioContext", physicalOutput: "not tested", records: results, cancelledFutureVoice: "passed", preparationAutoplay: "none" };
  }, fixtures.records);
  console.log(JSON.stringify({ browserVersion: browser.version(), ...result }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
