import { expect, test } from "@playwright/test";
import { serveBuiltUi } from "./staticUiTransport.js";

test.beforeEach(async ({ page }) => serveBuiltUi(page));

async function openStudio(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-transport-status="true"]')).toBeVisible();
}

test("audition context and settings stay visible, retain focus and never autoplay", async ({ page }, testInfo) => {
  await openStudio(page);
  const hear = page.locator('.timeline-compact-tools [data-audition-control="hear"]');
  await expect(hear).toContainText("0.5s before / 1s after");
  await expect(hear).toContainText(/Bars \d/);
  await expect(hear).toHaveAttribute("aria-label", /bars .*current mix/);
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  const tail = page.locator("#auditionTail");
  await tail.focus();
  await tail.selectOption("2");
  await expect(tail).toBeFocused();
  await expect(hear).toContainText("2s after");
  await expect(page.locator('[data-audition-control="stop"]')).toHaveCount(0);
  await expect(page.locator('[data-transport-toggle="true"]')).toContainText("Play");
  await page.screenshot({ path: testInfo.outputPath("selection-audition-context.png") });
});

test("browser capability failure is visible and never creates live Web Audio", async ({ page }) => {
  await page.addInitScript(() => {
    window.__auditionContexts = 0;
    window.AudioContext = class { constructor() { window.__auditionContexts += 1; throw new Error("Native audition must not create live Web Audio"); } };
  });
  await openStudio(page);
  const count = await page.locator("[data-clip-id]").count();
  const hear = page.locator('.timeline-compact-tools [data-audition-control="hear"]');
  await hear.click();
  await expect(page.locator('[data-transport-status="true"]')).toContainText(/native.*(unavailable|requires)|requires.*native/i);
  await expect(hear).toBeEnabled();
  await expect(hear).toBeFocused();
  expect(await page.evaluate(() => window.__auditionContexts)).toBe(0);
  await expect(page.locator("[data-clip-id]")).toHaveCount(count);
  await expect(page.locator('[data-transport-toggle="true"]')).toContainText("Play");
});

async function installPendingNativeControlFixture(page) {
  // UI/control sequencing only. This mock is never native/device/PCM evidence.
  await page.addInitScript(() => {
    window.__auditionCalls = [];
    const status = { backend: "native-cpal", available: true, active: true, playing: false, positionSeconds: 0, eventCount: 0, sampleRate: 48000, channels: 2, renderedFrameCount: 0, startedGeneration: 1, projectTitle: "Control fixture", deviceName: null, hostName: null, lastError: null };
    let callbackId = 0;
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
      transformCallback(callback) { const id = ++callbackId; window[`_${id}`] = callback; return id; },
      unregisterCallback(id) { delete window[`_${id}`]; },
      async invoke(command, args = {}) {
        window.__auditionCalls.push(command);
        if (command === "native_audio_start") {
          window.__auditionPayload = args.payload;
          return new Promise(resolve => { window.__releaseAuditionStart = () => resolve({ ...status, playing: true, positionSeconds: args.payload.startSeconds }); });
        }
        if (command === "native_audio_status" || command === "native_audio_stop" || command === "native_audio_preload_asset") return { ...status };
        if (command === "native_audio_render_wav") throw new Error("Control fixture does not render or claim audio");
        if (command.includes("listen")) return 1;
        return null;
      }
    };
  });
}

test("Stop cancels pending native start and rejects its later completion", async ({ page }) => {
  await installPendingNativeControlFixture(page);
  await openStudio(page);
  const hear = page.locator('.timeline-compact-tools [data-audition-control="hear"]');
  const count = await page.locator("[data-clip-id]").count();
  await hear.click();
  await page.waitForFunction(() => !!window.__releaseAuditionStart);
  const stop = page.locator('.timeline-compact-tools [data-audition-control="stop"]');
  await expect(stop).toBeVisible();
  expect(await page.evaluate(() => window.__auditionPayload.audition.endSeconds)).toBeGreaterThan(0);
  await stop.click();
  await page.evaluate(() => window.__releaseAuditionStart());
  await expect(hear).toBeEnabled();
  await expect(page.locator('[data-transport-toggle="true"]')).toContainText("Play");
  await expect(page.locator("[data-clip-id]")).toHaveCount(count);
});

test("changing selection cancels pending audition without promoting the stale start", async ({ page }) => {
  await installPendingNativeControlFixture(page);
  await openStudio(page);
  await page.locator('.timeline-compact-tools [data-audition-control="hear"]').click();
  await page.waitForFunction(() => !!window.__releaseAuditionStart);
  await page.locator('.timeline-track-header[data-track-id="bass"]').click({ position: { x: 4, y: 8 } });
  await page.evaluate(() => window.__releaseAuditionStart());
  await expect(page.locator('[data-audition-control="stop"]')).toHaveCount(0);
  await expect(page.locator('[data-transport-toggle="true"]')).toContainText("Play");
});
