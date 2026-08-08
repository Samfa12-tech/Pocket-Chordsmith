import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const metricRanges = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("./fixtures/genre-audio-metric-ranges.json", import.meta.url)), "utf8"),
);

const GENRES = [
  { id: "lofi", archetype: "lofi_study_room", seed: "audio-review-lofi-v1" },
  { id: "chip", archetype: "chip_arcade_start", seed: "audio-review-chip-v1" },
  { id: "metal", archetype: "metal_classic_chug", seed: "audio-review-metal-v1" },
  { id: "western", archetype: "western_frontier_ride", seed: "audio-review-western-v1" },
  { id: "funk", archetype: "funk_classic_pocket", seed: "audio-review-funk-v1" },
];

const EXPECTED_LIVE_RICH_COUNT_DIVERGENCES = {
  lofi: {},
  chip: {},
  metal: {},
  western: {},
  funk: {},
};

function expectInRange(value, [minimum, maximum], label) {
  expect(value, `${label} >= ${minimum}`).toBeGreaterThanOrEqual(minimum);
  expect(value, `${label} <= ${maximum}`).toBeLessThanOrEqual(maximum);
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Audio metric goldens run once in desktop Chromium; parser and transport smoke cover other engines.");
  await page.goto("/apps/chordsmith-web/");
  await page.waitForLoadState("networkidle");
});

for (const genre of GENRES) {
  test(`${genre.id} fixed seed has safe audio metrics and honest live/WAV correspondence evidence`, async ({ page }) => {
    test.setTimeout(120_000);
    const trace = await page.evaluate(async (input) => {
      composeGenreSong(input.id, input);
      document.getElementById("exportScopeSelect").value = "SEQUENCE";
      const chordsmith = window.PocketChordsmithParityTrace.current({ scope: "SEQUENCE" });
      const core = await loadPocketAudioCoreModule();
      const project = exportProject();
      const normalized = await pocketAudioCore.loadProject(project);
      const timeline = core.buildPocketAudioTimeline(normalized, { scope: "sequence" });
      const summarize = (events) => {
        const typeCounts = {};
        const structuralKeys = [];
        const keysByType = {};
        for (const event of events) {
          const sourceType = String(event.type || "");
          const type = sourceType === "hat_closed" || sourceType === "hat_open"
            ? "hat"
            : sourceType === "drum"
              ? `drum:${event.lane || "percussion"}`
              : ["ride", "crash", "china", "clap", "rim", "tom_high", "tom_mid", "tom_low", "percussion"].includes(sourceType)
                ? `drum:${sourceType}`
                : sourceType;
          if (!["kick", "snare", "hat", "bass", "chord", "guitar", "melody"].includes(type) && !type.startsWith("drum:")) continue;
          typeCounts[type] = (typeCounts[type] || 0) + 1;
          const key = `${type}|${event.sectionId || event.section || "A"}|${event.step}`;
          structuralKeys.push(key);
          (keysByType[type] ||= []).push(key);
        }
        structuralKeys.sort();
        Object.values(keysByType).forEach((keys) => keys.sort());
        return { typeCounts, structuralKeys, keysByType };
      };
      const sequenceDuration = project.songSequence.reduce((duration, sectionId) => {
        const bars = project.sectionBars?.[sectionId] || project.sections?.[sectionId]?.bars || 4;
        return duration + bars * project.timeSig * 60 / project.bpm;
      }, 0);
      return {
        chordsmith: summarize(chordsmith.events),
        core: summarize(timeline.events),
        sequenceDuration,
        coreDuration: timeline.duration,
      };
    }, genre);

    console.log(`GENRE_EVENT_TRACE ${genre.id} ${JSON.stringify({ chordsmith: trace.chordsmith.typeCounts, core: trace.core.typeCounts })}`);
    expect(trace.chordsmith.structuralKeys.length).toBeGreaterThan(20);
    expect(trace.core.structuralKeys.length).toBeGreaterThan(20);
    expect(trace.coreDuration).toBeCloseTo(trace.sequenceDuration, 6);

    const allTypes = [...new Set([...Object.keys(trace.chordsmith.typeCounts), ...Object.keys(trace.core.typeCounts)])].sort();
    const actualCountDivergences = Object.fromEntries(allTypes
      .filter((type) => (trace.chordsmith.typeCounts[type] || 0) !== (trace.core.typeCounts[type] || 0))
      .map((type) => [type, [trace.chordsmith.typeCounts[type] || 0, trace.core.typeCounts[type] || 0]]));
    expect(actualCountDivergences).toEqual(EXPECTED_LIVE_RICH_COUNT_DIVERGENCES[genre.id]);

    const exactPitchedTypes = ["bass", "guitar", "melody"];
    let nonemptySharedPitchedTypes = 0;
    for (const type of exactPitchedTypes) {
      const chordsmithKeys = trace.chordsmith.keysByType[type] || [];
      const coreKeys = trace.core.keysByType[type] || [];
      if (chordsmithKeys.length && coreKeys.length) nonemptySharedPitchedTypes += 1;
      expect(coreKeys, `${genre.id} ${type} structural correspondence`).toEqual(chordsmithKeys);
    }
    expect(nonemptySharedPitchedTypes).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { name: "Settings" }).first().click();
    await page.locator("#exportWavBtn").click();
    await expect(page.locator("#wavProgressText")).toContainText("WAV ready via Pocket Audio Core", { timeout: 100_000 });

    const metrics = await page.evaluate(async () => {
      const core = await loadPocketAudioCoreModule();
      const wav = await state.wavBlob.arrayBuffer();
      const encodedSampleRate = new DataView(wav).getUint32(24, true);
      const context = new OfflineAudioContext(2, 1, 44100);
      const decoded = await context.decodeAudioData(wav.slice(0));
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
      const base = core.analyseAudioChannels({ channels, sampleRate: decoded.sampleRate, duration: decoded.duration });
      const windowFrames = Math.max(1, Math.round(decoded.sampleRate * 0.05));
      let silentWindows = 0;
      let totalWindows = 0;
      for (let start = 0; start < decoded.length; start += windowFrames) {
        let sumSquares = 0;
        let count = 0;
        for (const channel of channels) {
          for (let index = start; index < Math.min(channel.length, start + windowFrames); index += 1) {
            sumSquares += channel[index] * channel[index];
            count += 1;
          }
        }
        if (Math.sqrt(sumSquares / Math.max(1, count)) < 0.0001) silentWindows += 1;
        totalWindows += 1;
      }
      if (typeof context.close === "function") await context.close();
      return { ...base, encodedSampleRate, silentWindowRatio: silentWindows / Math.max(1, totalWindows) };
    });

    console.log(`GENRE_AUDIO_METRICS ${genre.id} ${JSON.stringify(metrics)}`);
    const ranges = metricRanges.genres[genre.id];
    expect(metrics.encodedSampleRate).toBe(metricRanges.sampleRate);
    expect(metrics.channelCount).toBe(2);
    expect(metrics.clippedSamples).toBe(0);
    expect(metrics.nonFiniteSamples).toBe(0);
    expectInRange(metrics.durationSeconds, ranges.durationSeconds, `${genre.id} durationSeconds`);
    expectInRange(metrics.peak, ranges.peak, `${genre.id} peak`);
    expectInRange(metrics.rms, ranges.rms, `${genre.id} rms`);
    expectInRange(Math.max(Math.abs(metrics.dcOffsetL), Math.abs(metrics.dcOffsetR)), ranges.absoluteDcOffset, `${genre.id} absolute DC offset`);
    expectInRange(metrics.silentWindowRatio, ranges.silentWindowRatio, `${genre.id} silent window ratio`);
    expect(trace.core.structuralKeys).toEqual(trace.chordsmith.structuralKeys);
  });
}
