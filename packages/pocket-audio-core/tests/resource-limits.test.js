import test from "node:test";
import assert from "node:assert/strict";
import {
  POCKET_AUDIO_RESOURCE_LIMITS,
  PocketAudio,
  buildPocketAudioTimeline,
  buildSectionEvents,
  normalisePocketChordsmithProject
} from "../src/index.js";

function richProject(events) {
  return {
    projectVersion: 17,
    title: "Resource limit fixture",
    key: "C",
    scale: "major",
    bpm: 120,
    timeSig: 4,
    resolution: 4,
    songSequence: ["A"],
    sectionBars: { A: 1 },
    soundProfile: { id: "standard" },
    sections: {
      A: {
        active: true,
        bars: 1,
        tracks: {
          melody1: {
            compatibility: { compactMirror: true, liveMirror: true },
            events
          }
        }
      }
    }
  };
}

function melodyEvents(count) {
  return Array.from({ length: count }, (_, index) => ({
    step: 0,
    duration: 1,
    note: 60 + (index % 12),
    velocity: 100
  }));
}

function fakeAudioContext(nowRef) {
  const starts = [];
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), Q: param() });
  return {
    state: "running",
    get currentTime() { return nowRef.value; },
    destination: node(),
    starts,
    createGain: node,
    createBiquadFilter: node,
    createPeriodicWave() { return {}; },
    createOscillator() {
      return { ...node(), type: "sine", setPeriodicWave() {}, start(time) { starts.push(time); }, stop() {} };
    }
  };
}

test("rich event limits accept the boundary and reject one event above it before cloning", () => {
  const atLimit = richProject(melodyEvents(POCKET_AUDIO_RESOURCE_LIMITS.maxRichEventsPerTrack));
  assert.equal(
    normalisePocketChordsmithProject(atLimit).sections.A.richTracks.melody1.events.length,
    POCKET_AUDIO_RESOURCE_LIMITS.maxRichEventsPerTrack
  );

  const aboveLimit = richProject(melodyEvents(POCKET_AUDIO_RESOURCE_LIMITS.maxRichEventsPerTrack + 1));
  assert.throws(
    () => normalisePocketChordsmithProject(aboveLimit),
    (error) => error?.code === "POCKET_AUDIO_PROJECT_LIMIT_EXCEEDED"
      && error?.path === "sections.A.tracks.melody1.events"
      && error?.actual === POCKET_AUDIO_RESOURCE_LIMITS.maxRichEventsPerTrack + 1
  );
});

test("normalised PocketAudioProject inputs cannot bypass the rich event limit", () => {
  const project = normalisePocketChordsmithProject(richProject(melodyEvents(1)));
  project.sections.A.richTracks.melody1.events = melodyEvents(POCKET_AUDIO_RESOURCE_LIMITS.maxRichEventsPerTrack + 1);
  assert.throws(
    () => buildPocketAudioTimeline(project, { scope: "section", sectionId: "A" }),
    (error) => error?.code === "POCKET_AUDIO_PROJECT_LIMIT_EXCEEDED"
  );
  assert.throws(
    () => buildSectionEvents(project, project.sections.A),
    (error) => error?.code === "POCKET_AUDIO_PROJECT_LIMIT_EXCEEDED"
  );
});

test("live scheduler caps same-tick dispatch and reports every skipped event", async () => {
  const now = { value: 10 };
  const context = fakeAudioContext(now);
  const audio = new PocketAudio({
    audioContext: context,
    now: () => now.value,
    setInterval: () => 1,
    clearInterval: () => {}
  });
  await audio.loadProject(richProject(melodyEvents(300)));
  await audio.play({ scope: "section", sectionId: "A" });

  const diagnostics = audio.getDiagnostics();
  assert.equal(diagnostics.scheduledEventCount, POCKET_AUDIO_RESOURCE_LIMITS.maxEventsPerSchedulerTick);
  assert.equal(context.starts.length, POCKET_AUDIO_RESOURCE_LIMITS.maxEventsPerSchedulerTick);
  assert.ok(diagnostics.skippedOverBudgetEventCount > 0);
  assert.equal(diagnostics.maxEventsPerSchedulerTick, POCKET_AUDIO_RESOURCE_LIMITS.maxEventsPerSchedulerTick);
});

test("invalid scheduler budget options fail closed to the supported maximum", async () => {
  const now = { value: 10 };
  const context = fakeAudioContext(now);
  const audio = new PocketAudio({
    audioContext: context,
    maxEventsPerSchedulerTick: Number.NaN,
    now: () => now.value,
    setInterval: () => 1,
    clearInterval: () => {}
  });
  await audio.loadProject(richProject(melodyEvents(300)));
  await audio.play({ scope: "section", sectionId: "A" });

  const diagnostics = audio.getDiagnostics();
  assert.equal(diagnostics.scheduledEventCount, POCKET_AUDIO_RESOURCE_LIMITS.maxEventsPerSchedulerTick);
  assert.equal(context.starts.length, POCKET_AUDIO_RESOURCE_LIMITS.maxEventsPerSchedulerTick);
  assert.equal(diagnostics.maxEventsPerSchedulerTick, POCKET_AUDIO_RESOURCE_LIMITS.maxEventsPerSchedulerTick);
});
