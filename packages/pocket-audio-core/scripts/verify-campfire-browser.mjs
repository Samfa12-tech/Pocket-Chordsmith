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
    const liveResults = [];
    for (const sampleRate of [44100, 48000]) for (const direction of ["down", "up"]) {
      const context = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
      const engine = new core.PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
      await engine.loadProject({ schemaVersion: 17, bpm: 76, songSequence: ["A"], sectionBars: { A: 1 }, sections: { A: { tracks: { guitar: { events: [
        { tick: 0, durationTicks: 120, notes: [50, 57, 62, 66], sound: "campfire_acoustic", velocity: 100, direction, technique: { campfire: { seed: 123 } } }
      ] } } } } });
      for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
      await engine.play();
      const event = engine.timeline.events.find((item) => item.instrument === "campfire_acoustic");
      const expected = core.renderPocketAudioEventBuffer([event], { sampleRate, durationSeconds: 2, tailSeconds: 0 });
      const rendered = await context.startRendering();
      let maxError = 0;
      let squaredError = 0;
      let signalPeak = 0;
      for (let channel = 0; channel < 2; channel += 1) for (let frame = 0; frame < rendered.length; frame += 1) {
        const actual = rendered.getChannelData(channel)[frame];
        const error = Math.abs(actual - expected.channels[channel][frame]);
        maxError = Math.max(maxError, error);
        squaredError += error * error;
        signalPeak = Math.max(signalPeak, Math.abs(actual));
      }
      const rmsError = Math.sqrt(squaredError / (rendered.length * 2));
      if (signalPeak < 0.001 || maxError > 1e-7 || rmsError > 1e-8) throw new Error(`Live/offline Campfire mismatch ${sampleRate}/${direction}: ${maxError}/${rmsError}`);
      if (engine.getDiagnostics().campfirePrepared.activeVoices !== 0) throw new Error("Natural browser completion leaked Campfire voices");
      liveResults.push({ sampleRate, direction, maxError, rmsError, signalPeak, passed: true });
      engine.dispose();
    }
    const lookaheadContext = new OfflineAudioContext(2, 48000 * 2, 48000);
    const first = { midi: 50, velocity: 1 };
    const future = { midi: 69, velocity: 1 };
    const bank = await core.prepareCampfireAcousticNoteBank(lookaheadContext, [first, future]);
    bank.schedule(first, 0, { pan: -1 });
    bank.schedule(future, 0.4, { pan: -1 });
    bank.cancelScheduledFrom(0.3);
    const lookahead = await lookaheadContext.startRendering();
    const firstPcm = core.renderCampfireAcousticEvent(first, { sampleRate: 48000 });
    const actual = lookahead.getChannelData(0);
    for (let frame = 0; frame < actual.length; frame += 1) if (Math.abs(actual[frame] - (firstPcm[frame] || 0)) > 1e-7) throw new Error("Section transition cut an existing tail or leaked cancelled lookahead");
    if (!lookahead.getChannelData(1).every((value) => value === 0)) throw new Error("Hard-left prepared Campfire leaked into the right channel");
    bank.dispose();
    return { renderer: "Chromium OfflineAudioContext", physicalOutput: "not tested", records: results, liveOfflineParity: liveResults, cancelledFutureVoice: "passed", preservedTailAndCancelledLookahead: "passed", preparationAutoplay: "none" };
  }, fixtures.records);
  console.log(JSON.stringify({ browserVersion: browser.version(), ...result }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
