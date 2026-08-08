import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as SourceApi from "../src/browser.js";

const project = {
  projectVersion: 16,
  title: "Runtime timing fixture",
  key: "C",
  scale: "major",
  bpm: 120,
  timeSig: 4,
  resolution: 4,
  songSequence: ["A", "B"],
  sectionBars: { A: 1, B: 1 },
  progressionA: [0, 4, 5, 3],
  progressionB: [5, 3, 0, 4],
  gridA: { kick: [1, 0, 0, 0], snare: [0, 0, 1, 0], hat: [1, 1, 1, 1], bass: [1, 0, 0, 0] },
  gridB: { kick: [1, 0, 1, 0], snare: [0, 1, 0, 1], hat: [1, 1, 1, 1], bass: [1, 0, 0, 0] },
};

function fakeAudioContext(nowRef) {
  const starts = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), detune: param(), delayTime: param(), pan: param(), Q: param() });
  return {
    state: "running",
    get currentTime() { return nowRef.value; },
    destination: node(),
    starts,
    createGain: node,
    createBiquadFilter: node,
    createDelay: node,
    createWaveShaper: node,
    createStereoPanner: node,
    createPeriodicWave() { return {}; },
    createOscillator() {
      return { ...node(), type: "sine", setPeriodicWave() {}, start(time) { starts.push(time); }, stop() {} };
    },
  };
}

test("stable audio epoch skips stale notes after a 500ms scheduler stall", async () => {
  const now = { value: 20 };
  const context = fakeAudioContext(now);
  const audio = new SourceApi.PocketAudio({
    audioContext: context,
    now: () => now.value,
    setInterval: () => 1,
    clearInterval: () => {},
    lookaheadSeconds: 0.12,
    lateEventThresholdSeconds: 0.08,
  });
  await audio.loadProject(project);
  await audio.play({ scope: "sequence" });
  context.starts.length = 0;
  now.value += 0.5;
  audio.schedulerTick();

  assert.equal(audio.getDiagnostics().audioStartTime, 20);
  assert.ok(audio.getDiagnostics().skippedLateEventCount > 0);
  assert.ok(context.starts.length < 12, "stale notes must not be replayed as a burst");
  assert.ok(context.starts.every((time) => time >= now.value + 0.005));
});

test("bar-quantized section and music-state transitions wait for the next bar", async () => {
  const now = { value: 40 };
  const context = fakeAudioContext(now);
  const audio = new SourceApi.PocketAudio({
    audioContext: context,
    now: () => now.value,
    setInterval: () => 1,
    clearInterval: () => {},
    musicStates: { danger: { section: "B", intensity: 0.8 } },
  });
  const sections = [];
  const states = [];
  audio.on("section", (event) => sections.push(event));
  audio.on("musicState", (event) => states.push(event));
  await audio.loadProject(project);
  await audio.play({ scope: "section", sectionId: "A" });

  const queued = audio.queueMusicState("danger", { quantize: "bar" });
  assert.equal(queued.transitionTime, 2);
  assert.equal(audio.currentMusicState, null);
  now.value = 41.99;
  audio.schedulerTick();
  assert.equal(audio.currentMusicState, null);
  now.value = 42.01;
  audio.schedulerTick();
  assert.equal(audio.currentMusicState, "danger");
  assert.equal(audio.getTransport().sectionId, "B");
  assert.equal(states.at(-1).transitionTime, 2);
  assert.equal(sections.find((event) => event.sectionId === "B" && event.transitionTime !== undefined)?.transitionTime, 2);
  assert.ok(audio.getTransport().seconds >= 2);
});

test("generated ESM and IIFE share the real browser API and render audible WAV PCM", async () => {
  const builtEsm = await import(`../dist/pocket-audio-core.browser.esm.js?test=${Date.now()}`);
  const iifeSource = await readFile(new URL("../dist/pocket-audio-core.iife.js", import.meta.url), "utf8");
  const sandbox = {
    Blob, TextEncoder, TextDecoder, Uint8Array, Float32Array, ArrayBuffer,
    structuredClone, setInterval, clearInterval, setTimeout, clearTimeout,
    performance, console, atob, btoa,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(iifeSource, sandbox, { filename: "pocket-audio-core.iife.js" });
  const iife = sandbox.PocketAudioCore;

  for (const name of ["PocketAudio", "parsePocketChordsmithInput", "renderPocketAudioWav"]) {
    assert.equal(typeof SourceApi[name], "function");
    assert.equal(typeof builtEsm[name], "function");
    assert.equal(typeof iife[name], "function");
  }

  const runtime = new iife.PocketAudio({ audio: false, setInterval: () => 1, clearInterval: () => {} });
  await runtime.loadProject(project);
  const wav = await runtime.renderWav({ sampleRate: 8000 });
  const bytes = new Uint8Array(await wav.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "RIFF");
  assert.ok(bytes.length > 44);
  assert.ok(bytes.subarray(44).some((value) => value !== 0), "rendered PCM must be non-silent");
  assert.equal(runtime.getDiagnostics().coreStub, false);
});

test("dist artifacts are self-contained and publish a generated API manifest", async () => {
  for (const file of ["pocket-audio-core.esm.js", "pocket-audio-core.browser.esm.js", "pocket-audio-core.iife.js"]) {
    const source = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from|import\()\s*["']\.\.\/src\//);
  }
  const manifest = JSON.parse(await readFile(new URL("../dist/api-manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.generatedFrom, "src/index.js");
  assert.equal(manifest.sourcemaps, false);
  assert.ok(manifest.exports.includes("PocketAudio"));
});
