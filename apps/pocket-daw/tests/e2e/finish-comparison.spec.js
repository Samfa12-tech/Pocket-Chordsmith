import { expect, test } from "@playwright/test";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { serveBuiltUi } from "./staticUiTransport.js";

test.beforeEach(async ({ page }) => serveBuiltUi(page));

async function fixture(page, pending = false) {
  // Command/control fixture with generated PCM. This is never evidence of
  // installed native DSP, physical output or human listening.
  await page.addInitScript(({ pending }) => {
    let next = 0;
    const files = new Map();
    window.__finishCalls = [];
    window.__finishRenderInputs = [];
    let status = { monitorComparisonVersion: 2, backend: "native-cpal", available: true, active: true, playing: false, positionSeconds: 0, eventCount: 0, sampleRate: 48000, channels: 2, renderedFrameCount: 0, startedGeneration: 1, projectTitle: "Control fixture", deviceName: null, hostName: null, lastError: null };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
      transformCallback(callback) { const id = ++next; window[`_${id}`] = callback; return id; }, unregisterCallback(id) { delete window[`_${id}`]; },
      async invoke(command, args = {}) {
        window.__finishCalls.push([command, args]);
        if (command === "native_finish_preview_begin") return `fixture-${++next}`;
        if (command === "native_finish_preview_prepare") {
          window.__finishRenderInputs.push(args.payload);
          const file = { sourcePath: `fixture/${args.id}.wav`, sampleRate: args.payload.sampleRate, channels: 2, durationSeconds: Math.ceil(args.durationSeconds * args.payload.sampleRate) / args.payload.sampleRate, sizeBytes: Math.ceil(args.durationSeconds * args.payload.sampleRate) * 8 + 44 };
          files.set(args.id, file);
          if (pending) return new Promise(resolve => { window.__finishRelease = () => resolve(file); });
          return file;
        }
        if (command === "native_finish_preview_read") {
          const file = files.get(args.id), frames = Math.round(file.durationSeconds * file.sampleRate), buffer = new ArrayBuffer(44 + frames * 8), view = new DataView(buffer);
          const ascii = (at, text) => [...text].forEach((character, index) => view.setUint8(at + index, character.charCodeAt(0)));
          ascii(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, file.sampleRate, true); view.setUint32(28, file.sampleRate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true); ascii(36, "data"); view.setUint32(40, frames * 8, true);
          for (let i = 0; i < frames; i++) { const value = 0.2 * Math.sin(i * 2 * Math.PI * 440 / file.sampleRate); view.setFloat32(44 + i * 8, value, true); view.setFloat32(48 + i * 8, value, true); }
          return buffer;
        }
        if (command === "native_finish_preview_discard") { files.delete(args.id); return; }
        if (command === "native_audio_start") { status = { ...status, playing: true, positionSeconds: args.payload.startSeconds, startedGeneration: status.startedGeneration + 1 }; return { ...status }; }
        if (command === "native_audio_compare_monitor") {
          if (window.__finishHoldCompare) return new Promise(resolve => { window.__finishReleaseCompare = () => resolve({ ...status }); });
          return { ...status };
        }
        if (command === "native_audio_stop") { status.playing = false; return { ...status }; }
        if (command === "native_audio_status" || command === "native_audio_preload_asset") return { ...status };
        if (command === "native_audio_render_wav") throw new Error("Control fixture does not render native DSP");
        if (command.includes("listen")) return 1;
        return null;
      }
    };
  }, { pending });
}

async function openFinish(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="lower-dock-export-details"]').first().click();
  await expect(page.getByRole("heading", { name: "Finish & Compare" })).toBeVisible();
}

test("prepared measured comparison has no autoplay; A/B shares one start and Apply has one Undo", async ({ page }, testInfo) => {
  await fixture(page); await openFinish(page);
  await page.locator('[data-action="finish-prepare"]').click();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("Ready.", { timeout: 20000 });
  await expect(page.locator('[data-action="finish-a"]')).toBeFocused();
  await expect(page.locator('[data-action="finish-a"]')).toBeInViewport();
  expect(await page.evaluate(() => window.__finishCalls.filter(([command]) => command === "native_audio_start").length)).toBe(0);
  await expect(page.locator(".finish-comparison")).toContainText("LUFS");
  await page.locator('[data-action="finish-a"]').click();
  await page.locator('[data-action="finish-b"]').click();
  expect(await page.evaluate(() => window.__finishCalls.filter(([command]) => command === "native_audio_start").length)).toBe(1);
  expect(await page.evaluate(() => window.__finishCalls.filter(([command]) => command === "native_audio_compare_monitor").at(-1)[1].side)).toBe("b");
  await page.locator('[data-action="finish-stop"]').click();
  await expect(page.locator('[data-action="finish-apply"]')).toBeEnabled();
  await expect(page.locator('[data-action="finish-apply"]')).toBeInViewport();
  await expect(page.locator('[data-action="finish-discard"]')).toBeInViewport();
  await expect(page.locator('[data-finish-focus="undo"]')).toBeInViewport();
  await expect(page.locator(".finish-comparison li").first()).toBeInViewport();
  await page.locator(".finish-comparison").screenshot({ path: testInfo.outputPath("finish-ready.png") });
  await page.locator('[data-action="finish-apply"]').click();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("applied");
  await page.locator('[data-finish-focus="undo"]').click();
  await expect(page.locator('[data-finish-focus="undo"]')).toBeDisabled();
});

test("Stop cancels native preparation and a late file cannot become an applicable proposal", async ({ page }) => {
  await fixture(page, true); await openFinish(page);
  await page.locator('[data-action="finish-prepare"]').click();
  await page.waitForFunction(() => !!window.__finishRelease);
  await page.locator('[data-action="finish-stop"]').click();
  await page.evaluate(() => window.__finishRelease());
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("cancelled");
  await expect(page.locator('[data-action="finish-apply"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__finishCalls.some(([command]) => command === "native_audio_start"))).toBe(false);
});

test("a changed selection rejects the prepared proposal without applying or playing it", async ({ page }) => {
  await fixture(page); await openFinish(page);
  await page.locator('[data-action="finish-prepare"]').click();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("Ready.", { timeout: 20000 });
  await page.locator('.timeline-track-header[data-track-id="bass"]').click({ position: { x: 4, y: 8 } });
  await expect(page.locator('[data-action="finish-apply"]')).toBeDisabled();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("changed");
  expect(await page.evaluate(() => window.__finishCalls.some(([command]) => command === "native_audio_start"))).toBe(false);
});

test("a late side-change reply after Stop does not discard the ready proposal", async ({ page }) => {
  await fixture(page); await openFinish(page);
  await page.locator('[data-action="finish-prepare"]').click();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("Ready.", { timeout: 20000 });
  await page.locator('[data-action="finish-a"]').click();
  await page.evaluate(() => { window.__finishHoldCompare = true; });
  await page.locator('[data-action="finish-b"]').click();
  await page.waitForFunction(() => !!window.__finishReleaseCompare);
  await page.locator('[data-action="finish-stop"]').click();
  await page.evaluate(() => window.__finishReleaseCompare());
  await expect(page.locator('[data-action="finish-apply"]')).toBeEnabled();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("stopped");
});

for (const size of [{ width: 1100, height: 720 }, { width: 800, height: 600 }]) {
  test(`Finish controls and measured readings remain reachable at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size); await fixture(page); await openFinish(page);
    await page.locator('[data-action="finish-prepare"]').click();
    await expect(page.locator(".finish-comparison [role=status]")).toContainText("Ready.", { timeout: 20000 });
    for (const key of ["a", "b", "apply", "discard", "undo"]) {
      const control = page.locator(`[data-finish-focus="${key}"]`);
      await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport();
    }
    const reading = page.locator(".finish-comparison li").last();
    await reading.scrollIntoViewIfNeeded(); await expect(reading).toBeInViewport();
    expect(await page.locator(".lower-dock-export").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test("real analysis worker keeps long-song CPU work off the UI and terminates promptly", async ({ page }, testInfo) => {
  test.skip(!process.env.POCKET_DAW_UI_STATIC_DIR, "Requires the production worker bundle for this offline responsiveness check.");
  const workerName = (await readdir(resolve(process.env.POCKET_DAW_UI_STATIC_DIR, "assets"))).find(name => /^finishAnalysis\.worker-.*\.js$/.test(name));
  await page.goto("/");
  const report = await page.evaluate(async workerName => {
    const rate = 48000, frames = rate * 300, buffer = new ArrayBuffer(44 + frames * 8), view = new DataView(buffer);
    const ascii = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    ascii(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true); ascii(36, "data"); view.setUint32(40, frames * 8, true);
    new Float32Array(buffer, 44).fill(0.125);
    let beats = 0, maxGap = 0, last = performance.now(), completed = false, workerError = null;
    const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; beats++; }, 10);
    const worker = new Worker(`/assets/${workerName}`, { type: "module" });
    let markStarted;
    const analysing = new Promise(resolve => { markStarted = resolve; });
    worker.onmessage = ({ data }) => { if (data.phase === "analysing") markStarted(); else completed = true; };
    worker.onerror = event => { workerError = event.message; markStarted(); };
    const started = performance.now(); worker.postMessage({ buffer, range: { startSeconds: 0, endSeconds: 300 } }, [buffer]);
    await Promise.race([analysing, new Promise((_, reject) => setTimeout(() => reject(new Error("Analysis worker did not start")), 5000))]);
    await new Promise(resolve => setTimeout(resolve, 150));
    const cancelledAt = performance.now(); worker.terminate();
    await new Promise(resolve => setTimeout(resolve, 100)); clearInterval(timer);
    return { durationSeconds: 300, bytes: 44 + frames * 8, transferred: buffer.byteLength === 0, beats, maxGapMs: maxGap, workerError, completedBeforeCancel: completed, elapsedMs: performance.now() - started, cancelAndSettleMs: performance.now() - cancelledAt };
  }, workerName);
  expect(report.workerError).toBeNull(); expect(report.transferred).toBe(true); expect(report.completedBeforeCancel).toBe(false); expect(report.beats).toBeGreaterThan(8); expect(report.maxGapMs).toBeLessThan(150); expect(report.cancelAndSettleMs).toBeLessThan(250);
  await testInfo.attach("long-song-worker-responsiveness", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
});

test("real worker completes five-minute decoded output analysis while the UI remains responsive", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  test.skip(!process.env.POCKET_DAW_UI_STATIC_DIR, "Requires the production worker bundle.");
  const workerName = (await readdir(resolve(process.env.POCKET_DAW_UI_STATIC_DIR, "assets"))).find(name => /^finishAnalysis\.worker-.*\.js$/.test(name));
  await page.goto("/");
  const report = await page.evaluate(async workerName => {
    const rate = 48000, frames = rate * 300, buffer = new ArrayBuffer(44 + frames * 8), view = new DataView(buffer);
    const ascii = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    ascii(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true); ascii(36, "data"); view.setUint32(40, frames * 8, true);
    const pcm = new Float32Array(buffer, 44), cycle = Float32Array.from({ length: 96 }, (_, i) => 0.2 * Math.sin(i * 2 * Math.PI / 96));
    for (let i = 0; i < frames; i++) { pcm[i * 2] = cycle[i % 96]; pcm[i * 2 + 1] = cycle[i % 96]; }
    let beats = 0, maxGap = 0, last = performance.now();
    const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; beats++; }, 10);
    const worker = new Worker(`/assets/${workerName}`, { type: "module" });
    const started = performance.now();
    try {
      const metrics = await new Promise((resolve, reject) => {
        worker.onerror = event => reject(new Error(event.message));
        worker.onmessage = ({ data }) => { if (data.phase === "analysing") return; if (data.ok) resolve(data.measurements); else reject(new Error(data.error)); };
        worker.postMessage({ buffer, range: { startSeconds: 0, endSeconds: 300 } }, [buffer]);
      });
      return { seconds: 300, sampleRate: rate, bytes: 44 + frames * 8, elapsedMs: performance.now() - started, beats, maxGapMs: maxGap, metrics };
    } finally { clearInterval(timer); worker.terminate(); }
  }, workerName);
  expect(report.metrics.durationSeconds).toBe(300); expect(report.metrics.nonFiniteSamples).toBe(0); expect(report.metrics.integratedLufs).not.toBeNull(); expect(report.metrics.truePeakDbtp).toBeCloseTo(-13.9794, 2); expect(report.beats).toBeGreaterThan(10); expect(report.maxGapMs).toBeLessThan(150);
  await testInfo.attach("completed-long-song-worker-analysis", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
});
