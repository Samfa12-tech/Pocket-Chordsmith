import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { serveBuiltUi } from "./staticUiTransport.js";
import { createDemoProject } from "../../src/demo/demoProject.ts";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "../../src/daw/audioClips.ts";
import { buildPocketDawProjectFile } from "../../src/daw/dawProject.ts";
import { decodePcmWavBytes } from "../../../../packages/pocket-audio-core/src/export/wav.js";
import { analyseAudioChannels } from "../../../../packages/pocket-audio-core/src/export/audio-metrics.js";

test.beforeEach(async ({ page }) => serveBuiltUi(page));

async function fixture(page, pending = false, { cold = false, holdCold = false, downloadAudio = false, holdDelivery = false } = {}) {
  let savedProject = null;
  if (cold) {
    const imported = addImportedAudioMedia(createDemoProject(), { name: "Saved guitar.wav", uri: "C:\\fixture\\saved-guitar.wav", mimeType: "audio/wav", durationSeconds: 1, sampleRate: 48000, channels: 1, sizeBytes: 96044, metadata: { mediaRefKind: "external" } });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    placed.project.project.title = "Cold saved audio fixture";
    savedProject = buildPocketDawProjectFile(placed.project);
  }
  // Command/control fixture with generated PCM. This is never evidence of
  // installed native DSP, physical output or human listening.
  await page.addInitScript(({ pending, savedProject, holdCold, downloadAudio, holdDelivery }) => {
    let next = 0;
    const files = new Map();
    window.__finishCalls = [];
    window.__finishRenderInputs = [];
    window.__coldHydrationReads = 0;
    window.__coldOpenCount = 0;
    if (holdDelivery) {
      const ActualWorker = window.Worker;
      window.Worker = class extends ActualWorker {
        set onmessage(handler) {
          super.onmessage = event => {
            if (event.data.delivery && !window.__deliveryReleased) window.__releaseDelivery = () => { window.__deliveryReleased = true; handler(event); };
            else handler(event);
          };
        }
        get onmessage() { return super.onmessage; }
      };
    }
    let status = { monitorComparisonVersion: 2, backend: "native-cpal", available: true, active: true, playing: false, positionSeconds: 0, eventCount: 0, sampleRate: 48000, channels: 2, renderedFrameCount: 0, startedGeneration: 1, projectTitle: "Control fixture", deviceName: null, hostName: null, lastError: null };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
      transformCallback(callback) { const id = ++next; window[`_${id}`] = callback; return id; }, unregisterCallback(id) { delete window[`_${id}`]; },
      async invoke(command, args = {}) {
        window.__finishCalls.push([command, args]);
        if (command === "open_project_file" && savedProject) { window.__coldOpenCount++; return { contents: savedProject, path: "C:\\fixture\\cold-saved.pocketdaw", label: "cold-saved.pocketdaw" }; }
        if (command === "read_audio_media_file" && savedProject) {
          window.__coldHydrationReads++;
          const buffer = new ArrayBuffer(96044), view = new DataView(buffer);
          const ascii = (at, text) => [...text].forEach((character, index) => view.setUint8(at + index, character.charCodeAt(0)));
          ascii(0, "RIFF"); view.setUint32(4, 96036, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, 96000, true);
          for (let frame = 0; frame < 48000; frame++) view.setInt16(44 + frame * 2, Math.round(4000 * Math.sin(frame * Math.PI * 2 * 220 / 48000)), true);
          const media = { path: "C:\\fixture\\saved-guitar.wav", label: "Saved guitar.wav", mimeType: "audio/wav", sizeBytes: buffer.byteLength, bytes: Array.from(new Uint8Array(buffer)), sampleRate: 48000, channels: 1, durationSeconds: 1 };
          if (holdCold && !window.__coldReleased) return new Promise(resolve => { window.__releaseColdHydration = () => { window.__coldReleased = true; resolve(media); }; });
          return media;
        }
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
        if (command === "native_audio_render_wav") {
          if (!downloadAudio || args.renderMode === "cache-stem") throw new Error("Control fixture does not render native DSP");
          // Generated one-second transport output, deliberately independent
          // from project metadata. QC must measure final bytes, not that metadata.
          const rate = args.payload.sampleRate, depth = args.bitDepth || 16, bytesPerSample = depth / 8;
          const buffer = new ArrayBuffer(44 + rate * 2 * bytesPerSample), view = new DataView(buffer);
          const ascii = (at, text) => [...text].forEach((character, index) => view.setUint8(at + index, character.charCodeAt(0)));
          ascii(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, depth === 32 ? 3 : 1, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2 * bytesPerSample, true); view.setUint16(32, 2 * bytesPerSample, true); view.setUint16(34, depth, true); ascii(36, "data"); view.setUint32(40, buffer.byteLength - 44, true);
          for (let frame = 0; frame < rate; frame++) for (let channel = 0; channel < 2; channel++) {
            const value = 0.1 * Math.sin(frame * Math.PI / 2 + Math.PI / 4), offset = 44 + (frame * 2 + channel) * bytesPerSample;
            if (depth === 32) view.setFloat32(offset, value, true);
            else if (depth === 16) view.setInt16(offset, Math.round(value * 32767), true);
            else { const integer = Math.round(value * 8388607); view.setUint8(offset, integer & 255); view.setUint8(offset + 1, (integer >> 8) & 255); view.setUint8(offset + 2, (integer >> 16) & 255); }
          }
          return { sampleRate: rate, channels: 2, durationSeconds: 1, sizeBytes: buffer.byteLength, bytes: Array.from(new Uint8Array(buffer)) };
        }
        if (command.includes("listen")) return 1;
        return null;
      }
    };
  }, { pending, savedProject, holdCold, downloadAudio, holdDelivery });
}

async function openFinish(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="lower-dock-export-details"]').first().click();
  await expect(page.getByRole("heading", { name: "Finish & Compare" })).toBeVisible();
}

async function openColdSavedProject(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open .pocketdaw", exact: true }).first().click();
  await page.waitForFunction(() => window.__coldOpenCount === 1);
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Opened cold-saved.pocketdaw");
}

test("cold saved audio and reopen reach Finish Ready, retain one Apply Undo and never autoplay", async ({ page }) => {
  await fixture(page, false, { cold: true }); await openColdSavedProject(page);
  await page.locator('[data-action="lower-dock-export-details"]').first().click();
  expect(await page.evaluate(() => window.__coldHydrationReads)).toBe(0);
  await page.locator('[data-action="finish-prepare"]').click();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("Ready.", { timeout: 10000 });
  expect(await page.evaluate(() => window.__coldHydrationReads)).toBe(1);
  expect(await page.evaluate(() => window.__finishRenderInputs[0].regions.length)).toBeGreaterThan(0);
  await expect(page.locator('[data-finish-focus="undo"]')).toBeDisabled();
  await page.locator('[data-action="finish-apply"]').click();
  await expect(page.locator('[data-finish-focus="undo"]')).toBeEnabled();
  await page.locator('[data-finish-focus="undo"]').click();
  await expect(page.locator('[data-finish-focus="undo"]')).toBeDisabled();
  await page.keyboard.press("Control+o");
  await page.waitForFunction(() => window.__coldOpenCount === 2);
  await page.locator('[data-action="lower-dock-export-details"]').first().click();
  await page.locator('[data-action="finish-prepare"]').click();
  await expect(page.locator(".finish-comparison [role=status]")).toContainText("Ready.", { timeout: 10000 });
  expect(await page.evaluate(() => window.__coldHydrationReads)).toBe(2);
  expect(await page.evaluate(() => window.__finishCalls.some(([command]) => command === "native_audio_start"))).toBe(false);
});

test("cold saved audio reaches contextual audition playing on the first request", async ({ page }) => {
  await fixture(page, false, { cold: true }); await openColdSavedProject(page);
  await page.locator('.timeline-compact-tools [data-audition-control="hear"]').click();
  await expect(page.locator('[data-transport-toggle="true"]')).toContainText("Pause", { timeout: 10000 });
  expect(await page.evaluate(() => window.__coldHydrationReads)).toBe(1);
  expect(await page.evaluate(() => window.__finishCalls.filter(([command]) => command === "native_audio_start").length)).toBe(1);
  await page.locator('.timeline-compact-tools [data-audition-control="stop"]').click();
});

test("delivery QC measures the downloaded normalized file without replacing unfinished input", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await fixture(page, false, { downloadAudio: true, holdDelivery: true }); await openFinish(page);
  await page.locator('[data-export-profile-setting="full-song-wav:bitDepth"]').selectOption("32");
  await page.locator('[data-export-profile-setting="full-song-wav:normalize"]').selectOption("peak");
  const downloadPromise = page.waitForEvent("download");
  await page.locator('.lower-dock-export [data-action="export-wav"]').click();
  const download = await downloadPromise;
  await page.waitForFunction(() => !!window.__releaseDelivery);
  await page.evaluate(() => {
    window.__qcInput = document.querySelector('[data-export-profile-setting="full-song-wav:tailSeconds"]');
    window.__qcInput.value = "0.25"; window.__qcInput.focus();
    window.__qcRenderCount = document.querySelector("#app").dataset.renderCount;
    window.__releaseDelivery();
  });
  const qc = page.locator('[data-delivery-qc-host="dock"]');
  await expect(qc).toContainText("Check complete");
  await expect(qc).toContainText("1.000 s");
  await expect(qc).toContainText("32-bit float");
  await expect(qc).toContainText("true peak exceeds -1");
  expect(await page.evaluate(() => window.__qcInput.isConnected && document.activeElement === window.__qcInput && window.__qcInput.value === "0.25" && document.querySelector("#app").dataset.renderCount === window.__qcRenderCount)).toBe(true);
  expect(download.suggestedFilename()).toMatch(/\.wav$/);
  const downloaded = await readFile(await download.path());
  const decoded = decodePcmWavBytes(downloaded), measured = analyseAudioChannels(decoded);
  const reportPromise = page.waitForEvent("download");
  await qc.locator('[data-action="delivery-qc-report"]').click();
  const reportDownload = await reportPromise;
  const report = JSON.parse(await readFile(await reportDownload.path(), "utf8"));
  expect(report.fileName).toBe(download.suggestedFilename());
  expect(report.analysis.byteLength).toBe(downloaded.length);
  expect(report.analysis.frameCount).toBe(decoded.channels[0].length);
  expect(report.analysis.measurements.truePeakDbtp).toBeCloseTo(measured.truePeakDbtp, 5);
  expect(report.analysis.measurements.integratedLufs).toBeCloseTo(measured.integratedLufs, 5);
  if (report.analysis.byteSha256) expect(report.analysis.byteSha256).toBe(createHash("sha256").update(downloaded).digest("hex"));
  await testInfo.attach("decoded-delivery.wav", { body: downloaded, contentType: "audio/wav" });
  await testInfo.attach("delivery-report.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  for (const element of [qc.getByRole("heading", { name: "Last WAV check" }), qc.locator('[role="status"]'), qc.locator(".finish-warnings"), qc.locator('[data-action="delivery-qc-report"]')]) {
    await element.scrollIntoViewIfNeeded(); await expect(element).toBeInViewport();
  }
  expect(await page.locator(".lower-dock-export").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await qc.screenshot({ path: testInfo.outputPath("delivery-qc-normalized.png") });
});

test("cancelled delivery QC rejects its late result and keeps the requested download", async ({ page }) => {
  await fixture(page, false, { downloadAudio: true, holdDelivery: true }); await openFinish(page);
  const downloadPromise = page.waitForEvent("download");
  await page.locator('.lower-dock-export [data-action="export-wav"]').click(); await downloadPromise;
  await page.waitForFunction(() => !!window.__releaseDelivery);
  const qc = page.locator('[data-delivery-qc-host="dock"]');
  await qc.locator('[data-action="delivery-qc-cancel"]').click();
  await page.evaluate(() => window.__releaseDelivery());
  await expect(qc).toContainText("Check cancelled");
  await expect(qc.locator('[data-action="delivery-qc-report"]')).toBeDisabled();
  await qc.locator('[data-action="delivery-qc-start"]').click();
  await expect(qc).toContainText("Check complete");
});

test("delivery checking defers while audio plays and can start after Stop", async ({ page }) => {
  await fixture(page, false, { downloadAudio: true }); await openFinish(page);
  await page.locator('[data-transport-toggle="true"]').click();
  await expect(page.locator('[data-transport-toggle="true"]')).toContainText("Pause");
  const downloadPromise = page.waitForEvent("download");
  await page.locator('.lower-dock-export [data-action="export-wav"]').click(); await downloadPromise;
  const qc = page.locator('[data-delivery-qc-host="dock"]');
  await expect(qc).toContainText("Stop playback/recording");
  await expect(qc.locator('[data-action="delivery-qc-start"]')).toBeDisabled();
  await page.locator('[data-action="stop"]:visible').first().click();
  await expect(qc.locator('[data-action="delivery-qc-start"]')).toBeEnabled();
  await qc.locator('[data-action="delivery-qc-start"]').click();
  await expect(qc).toContainText("Check complete");
});

test("a late ordinary-export hydration cannot replace concurrent project edits", async ({ page }) => {
  await fixture(page, false, { cold: true, holdCold: true, downloadAudio: true }); await openColdSavedProject(page);
  await page.locator('[data-action="lower-dock-export-details"]').first().click();
  await page.locator('.lower-dock-export [data-action="export-wav"]').click();
  await page.waitForFunction(() => !!window.__releaseColdHydration);
  const before = await page.locator("[data-clip-id]").count();
  await page.keyboard.press("d");
  await expect.poll(() => page.locator("[data-clip-id]").count()).toBeGreaterThan(before);
  const count = await page.locator("[data-clip-id]").count();
  await page.evaluate(() => window.__releaseColdHydration());
  await expect(page.locator('[data-transport-status="true"]')).toContainText("project changed");
  await expect(page.locator("[data-clip-id]")).toHaveCount(count);
  const downloadPromise = page.waitForEvent("download");
  await page.locator('.lower-dock-export [data-action="export-wav"]').click(); await downloadPromise;
  await expect(page.locator('[data-delivery-qc-host="dock"]')).toContainText("Check complete");
  expect(await page.evaluate(() => window.__coldHydrationReads)).toBe(2);
  await expect(page.locator("[data-clip-id]")).toHaveCount(count);
});

for (const flow of ["Finish", "audition"]) for (const cancellation of ["Stop", "edit"]) {
  test(`cold ${flow} hydration rejects a late load after concurrent ${cancellation}`, async ({ page }) => {
    await fixture(page, false, { cold: true, holdCold: true }); await openColdSavedProject(page);
    if (flow === "Finish") await page.locator('[data-action="lower-dock-export-details"]').first().click();
    const prepare = flow === "Finish" ? '[data-action="finish-prepare"]' : '.timeline-compact-tools [data-audition-control="hear"]';
    await page.locator(prepare).click();
    await page.waitForFunction(() => !!window.__releaseColdHydration);
    const before = await page.locator("[data-clip-id]").count();
    if (cancellation === "Stop") await page.locator(flow === "Finish" ? '[data-action="finish-stop"]' : '.timeline-compact-tools [data-audition-control="stop"]').click();
    else { await page.keyboard.press("d"); await expect.poll(() => page.locator("[data-clip-id]").count()).toBeGreaterThan(before); }
    const count = await page.locator("[data-clip-id]").count();
    await page.evaluate(() => window.__releaseColdHydration());
    expect(await page.evaluate(() => window.__finishCalls.some(([command]) => command === "native_audio_start" || command === "native_finish_preview_prepare"))).toBe(false);
    await page.locator(prepare).click();
    if (flow === "Finish") await expect(page.locator(".finish-comparison [role=status]")).toContainText("Ready.", { timeout: 10000 });
    else await expect(page.locator('[data-transport-toggle="true"]')).toContainText("Pause", { timeout: 10000 });
    expect(await page.evaluate(() => window.__coldHydrationReads)).toBe(2);
    await expect(page.locator("[data-clip-id]")).toHaveCount(count);
  });
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
