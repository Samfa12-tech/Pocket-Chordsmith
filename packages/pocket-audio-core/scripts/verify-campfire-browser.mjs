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
    for (const sampleRate of [44100, 48000]) for (const direction of ["down", "up"]) for (const mix of [{ volume: 0 }, { volume: 0.2 }, { volume: 0.66 }, { volume: 0.9 }, { volume: 0.66, mute: true }]) {
      const context = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
      const engine = new core.PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
      await engine.loadProject({ schemaVersion: 17, bpm: 76, guitarVolume: mix.volume, songSequence: ["A"], sectionBars: { A: 1 }, sections: { A: { tracks: { guitar: { events: [
        { tick: 0, durationTicks: 120, notes: [50, 57, 62, 66], sound: "campfire_acoustic", velocity: 100, direction, technique: { campfire: { seed: 123 } } }
      ] } } } } });
      for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
      if (mix.mute) engine.setStemMute("guitar", true);
      await engine.play();
      const expected = core.renderPocketAudioBuffer(engine.project, { sampleRate, tailSeconds: 0 });
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
      const silenceExpected = mix.volume === 0 || mix.mute;
      if ((silenceExpected ? signalPeak !== 0 : signalPeak < 0.001) || maxError > 1e-7 || rmsError > 1e-8) throw new Error(`Live/offline Campfire mismatch ${sampleRate}/${direction}/volume=${mix.volume}/mute=${!!mix.mute}: ${maxError}/${rmsError}`);
      if (engine.getDiagnostics().campfirePrepared.activeVoices !== 0) throw new Error("Natural browser completion leaked Campfire voices");
      liveResults.push({ sampleRate, direction, volume: mix.volume, mute: !!mix.mute, maxError, rmsError, signalPeak, passed: true });
      engine.dispose();
    }
    const liveMixerChanges = [];
    for (const sampleRate of [44100, 48000]) for (const muteTime of [0.01, 0.026, 0.25]) {
      const context = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
      const engine = new core.PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
      await engine.loadProject({ schemaVersion: 17, bpm: 76, guitarVolume: 0.66, songSequence: ["A"], sectionBars: { A: 1 }, sections: { A: { tracks: { guitar: { events: [
        { tick: 0, durationTicks: 120, notes: [50, 57, 62, 66], sound: "campfire_acoustic", velocity: 100, technique: { campfire: { seed: 123 } } }
      ] } } } } });
      for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
      await engine.play();
      const referenceProject = structuredClone(engine.project);
      referenceProject.mixer.stems.guitar.volume = 1;
      const reference = core.renderPocketAudioBuffer(referenceProject, { sampleRate, tailSeconds: 0 });
      const changes = [];
      const muted = context.suspend(muteTime);
      const rendering = context.startRendering();
      await muted;
      changes.push({ time: context.currentTime, from: 0.66, to: 0 });
      engine.setStemMute("guitar", true);
      const unmuted = context.suspend(0.5);
      await context.resume();
      await unmuted;
      changes.push({ time: context.currentTime, from: 0, to: 0.2 });
      // Two controls at the same audio time must hold the actual current gain,
      // rather than jump to the first ramp's target before the second ramp.
      engine.setStemMute("guitar", false);
      engine.setStemVolume("guitar", 0.2);
      const louder = context.suspend(0.75);
      await context.resume();
      await louder;
      changes.push({ time: context.currentTime, from: 0.2, to: 0.8 });
      engine.setStemVolume("guitar", 0.8);
      await context.resume();
      const rendered = await rendering;
      let maxError = 0, squaredError = 0, mutedPeak = 0, resumedPeak = 0, maxErrorFrame = 0;
      for (let frame = 0; frame < rendered.length; frame += 1) {
        const time = frame / sampleRate;
        let volume = 0.66;
        for (const change of changes) if (time >= change.time) volume = time < change.time + 0.005 ? change.from + (change.to - change.from) * (time - change.time) / 0.005 : change.to;
        for (let channel = 0; channel < 2; channel += 1) {
          const actual = rendered.getChannelData(channel)[frame];
          const error = Math.abs(actual - reference.channels[channel][frame] * volume);
          if (error > maxError) { maxError = error; maxErrorFrame = frame; }
          squaredError += error * error;
          if (time >= 0.3 && time < 0.45) mutedPeak = Math.max(mutedPeak, Math.abs(actual));
          if (time >= 0.8 && time < 1.1) resumedPeak = Math.max(resumedPeak, Math.abs(actual));
        }
      }
      const rmsError = Math.sqrt(squaredError / (rendered.length * 2));
      if (maxError > 1e-7 || rmsError > 1e-8 || mutedPeak !== 0 || resumedPeak < 0.0001) throw new Error(`Live Campfire mixer failed ${sampleRate}: ${maxError}/${rmsError}/muted=${mutedPeak}/resumed=${resumedPeak}/frame=${maxErrorFrame}/changes=${JSON.stringify(changes)}`);
      liveMixerChanges.push({ sampleRate, muteTime, changes, maxError, rmsError, mutedPeak, resumedPeak, passed: true });
      engine.dispose();
    }
    const queuedControls = [];
    for (const sampleRate of [44100, 48000]) for (const leadFrames of [1, 2]) for (const action of ["mute", "volume", "stop"]) {
      const controlFrame = 2048;
      const startFrame = controlFrame + leadFrames - Math.round(0.027 * sampleRate);
      const startTime = (startFrame + 0.25) / sampleRate;
      const event = { midiNotes: [50, 57, 62, 66], velocity: 1, seed: 123 };
      const context = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
      const referenceContext = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
      const bank = await core.prepareCampfireAcousticNoteBank(context, [event]);
      const referenceBank = await core.prepareCampfireAcousticNoteBank(referenceContext, [event]);
      bank.setOutputGain(0.66, 0);
      bank.schedule(event, startTime);
      referenceBank.schedule(event, startTime);
      // Stop must cancel queued strings, while releasing the already sounding one.
      if (action === "stop") referenceBank.cancelScheduledFrom(controlFrame / sampleRate);
      const baselineRendering = referenceContext.startRendering();
      // OfflineAudioContext suspension rounds to a render quantum. Measure it;
      // do not mistake the requested suspension time for the actual control time.
      const suspended = context.suspend((controlFrame - 0.25) / sampleRate);
      const rendering = context.startRendering();
      await suspended;
      const actualControlFrame = Math.round(context.currentTime * sampleRate);
      const actualLead = Math.floor(startTime * sampleRate) + Math.round(0.027 * sampleRate) - actualControlFrame;
      if (actualControlFrame !== controlFrame || actualLead !== leadFrames) throw new Error(`Queued control missed its ${leadFrames}-frame window: ${actualControlFrame}/${actualLead}`);
      const before = bank.getDiagnostics();
      const target = action === "volume" ? 0.2 : 0;
      if (action === "stop") bank.stopAll(0.005);
      else bank.setOutputGain(target, 0.005);
      const after = bank.getDiagnostics();
      if (before.entries !== after.entries || before.bytes !== after.bytes || before.activeVoices !== after.activeVoices) throw new Error("Queued control rebuilt or retriggered prepared voices");
      await context.resume();
      const [rendered, baseline] = await Promise.all([rendering, baselineRendering]);
      let maxError = 0, squaredError = 0;
      for (let frame = 0; frame < rendered.length; frame += 1) {
        const elapsed = (frame - actualControlFrame) / sampleRate;
        const gain = elapsed < 0 ? 0.66 : elapsed < 0.005 ? 0.66 + (target - 0.66) * elapsed / 0.005 : target;
        for (let channel = 0; channel < 2; channel += 1) {
          const error = Math.abs(rendered.getChannelData(channel)[frame] - baseline.getChannelData(channel)[frame] * gain);
          maxError = Math.max(maxError, error);
          squaredError += error * error;
        }
      }
      const rmsError = Math.sqrt(squaredError / (rendered.length * 2));
      if (maxError > 1e-7 || rmsError > 1e-8) throw new Error(`Queued ${action} failed ${sampleRate}/${leadFrames}: ${maxError}/${rmsError}`);
      queuedControls.push({ sampleRate, action, leadFrames, actualControlFrame, maxError, rmsError, passed: true });
      bank.dispose();
      referenceBank.dispose();
    }
    const frameGrid = [];
    for (const sampleRate of [44100, 48000]) for (const scenario of [0.4, 0.6, 0.999999, "reference-76-bpm"]) {
      const events = scenario === "reference-76-bpm" ? core.campfireAcousticReferenceEvents() : [{ time: (sampleRate / 10 + scenario) / sampleRate, midiNotes: [50, 57, 62, 66], velocity: 1 }];
      const frames = Math.ceil((Math.max(...events.map(event => event.time)) + 1.7) * sampleRate);
      const context = new OfflineAudioContext(2, frames, sampleRate);
      const bank = await core.prepareCampfireAcousticNoteBank(context, events);
      bank.setOutputGain(0.1, 0);
      const expected = new Float32Array(frames);
      for (const event of events) {
        bank.schedule(event, event.time);
        const pcm = core.renderCampfireAcousticEvent(event, { sampleRate });
        const onset = Math.floor(event.time * sampleRate);
        for (let frame = 0; frame < pcm.length; frame += 1) expected[onset + frame] += pcm[frame] * 0.1 * Math.SQRT1_2;
      }
      const rendered = await context.startRendering();
      let maxError = 0, squaredError = 0;
      for (let frame = 0; frame < frames; frame += 1) for (let channel = 0; channel < 2; channel += 1) {
        const error = Math.abs(rendered.getChannelData(channel)[frame] - expected[frame]);
        maxError = Math.max(maxError, error); squaredError += error * error;
      }
      const rmsError = Math.sqrt(squaredError / (frames * 2));
      if (maxError > 1e-7 || rmsError > 1e-8) throw new Error(`Prepared frame-grid mismatch ${sampleRate}/${scenario}: ${maxError}/${rmsError}`);
      frameGrid.push({ sampleRate, scenario, frames, maxError, rmsError, passed: true });
      bank.dispose();
    }
    const preparedStarts = [];
    for (const sampleRate of [44100, 48000]) for (const fraction of [0.4, 0.6, 0.999999]) {
      const event = { midiNotes: [50, 57, 62, 66], velocity: 1 };
      const when = (sampleRate / 10 + fraction) / sampleRate;
      const context = new OfflineAudioContext(1, sampleRate * 2, sampleRate);
      const prepared = core.prepareCampfireAcousticPlayback(context, event);
      prepared.start(when);
      const rendered = await context.startRendering();
      const pcm = core.renderCampfireAcousticEvent(event, { sampleRate });
      const onset = Math.floor(when * sampleRate);
      let maxError = 0;
      for (let frame = 0; frame < rendered.length; frame += 1) maxError = Math.max(maxError, Math.abs(rendered.getChannelData(0)[frame] - (pcm[frame - onset] || 0)));
      if (maxError > 1e-7) throw new Error(`Prepared playback fractional mismatch ${sampleRate}/${fraction}: ${maxError}`);
      preparedStarts.push({ sampleRate, fraction, maxError, passed: true });
    }
    const preparedStops = [];
    for (const sampleRate of [44100, 48000]) for (const leadFrames of [1, 2]) {
      const context = new OfflineAudioContext(1, sampleRate, sampleRate);
      const prepared = core.prepareCampfireAcousticPlayback(context, { midi: 50 });
      const voice = prepared.start((2048 + leadFrames + 0.25) / sampleRate);
      const suspended = context.suspend((2048 - 0.25) / sampleRate);
      const rendering = context.startRendering();
      await suspended;
      if (Math.round(context.currentTime * sampleRate) !== 2048) throw new Error("Prepared Stop missed its asserted audio frame");
      voice.stop(0.005);
      await context.resume();
      const rendered = await rendering;
      let peak = 0;
      for (const sample of rendered.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
      if (peak !== 0) throw new Error(`Stopped queued prepared playback sounded ${sampleRate}/${leadFrames}: ${peak}`);
      preparedStops.push({ sampleRate, leadFrames, peak, passed: true });
    }
    const compactParity = [];
    for (const sampleRate of [44100, 48000]) for (const direction of ["down", "up"]) for (const mode of [0, 0.2, 0.9, "muted-start"]) {
      const frames = Math.ceil((16 * 60 / 76 + 2) * sampleRate);
      const context = new OfflineAudioContext(2, frames, sampleRate);
      const engine = new core.PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
      await engine.loadProject({ projectVersion: 17, key: "D", scale: "major", bpm: 76, timeSig: 4, resolution: 1,
        chordsOn: false, bassOn: false, guitarEnabled: true, guitarTone: "campfire_acoustic", guitarRegister: "low",
        guitarVolume: mode === "muted-start" ? 0.66 : mode, guitarStrumMode: direction,
        songSequence: ["A"], sectionBars: { A: 4 }, progressionA: [0, 3, 5, 4],
        guitarPatternA: Array.from({ length: 16 }, (_, step) => step % 4 === 0 ? "open" : "off") });
      for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
      if (mode === "muted-start") engine.setStemMute("guitar", true);
      await engine.play();
      const events = engine.timeline.events.filter(event => event.type === "guitar");
      if (events.length !== 4 || events.some(event => event.instrument !== "campfire_acoustic" || event.midiNotes.length !== 4)) throw new Error(`Compact Campfire lost its authored notes under ${mode}`);
      const referenceProject = structuredClone(engine.project);
      referenceProject.mixer.stems.guitar.mute = false;
      const reference = core.renderPocketAudioBuffer(referenceProject, { sampleRate, tailSeconds: 2 });
      const controls = events.slice(1).map(event => ({ time: event.time - 0.05, scheduler: true }));
      if (mode === "muted-start") controls.unshift({ time: 0.25, unmute: true });
      let suspended = context.suspend(controls[0].time);
      const rendering = context.startRendering();
      let unmuteTime = null;
      for (let index = 0; index < controls.length; index += 1) {
        await suspended;
        if (controls[index].unmute) { unmuteTime = context.currentTime; engine.setStemMute("guitar", false); }
        if (controls[index].scheduler) engine.schedulerTick();
        if (index + 1 < controls.length) suspended = context.suspend(controls[index + 1].time);
        await context.resume();
      }
      const rendered = await rendering;
      let maxError = 0, squaredError = 0;
      for (let frame = 0; frame < frames; frame += 1) {
        const time = frame / sampleRate;
        const gain = unmuteTime === null ? 1 : Math.max(0, Math.min(1, (time - unmuteTime) / 0.005));
        for (let channel = 0; channel < 2; channel += 1) {
          const error = Math.abs(rendered.getChannelData(channel)[frame] - reference.channels[channel][frame] * gain);
          maxError = Math.max(maxError, error); squaredError += error * error;
        }
      }
      const rmsError = Math.sqrt(squaredError / (frames * 2));
      if (maxError > 1e-7 || rmsError > 1e-8) throw new Error(`Compact Campfire live/offline mismatch ${sampleRate}/${direction}/${mode}: ${maxError}/${rmsError}`);
      compactParity.push({ sampleRate, direction, mode, frames, unmuteTime, maxError, rmsError, passed: true });
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
    return { renderer: "Chromium OfflineAudioContext", physicalOutput: "not tested", records: results, liveOfflineParity: liveResults, liveMixerChanges, queuedControls, frameGrid, preparedStarts, preparedStops, compactParity, cancelledFutureVoice: "passed", preservedTailAndCancelledLookahead: "passed", preparationAutoplay: "none" };
  }, fixtures.records);
  console.log(JSON.stringify({ browserVersion: browser.version(), ...result }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
