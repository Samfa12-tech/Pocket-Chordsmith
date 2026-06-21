import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

async function gotoApp(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-transport-status="true"]')).toBeVisible({ timeout: 15_000 });
}

test("starts the browser fallback and exposes core DAW controls", async ({ page }) => {
  await gotoApp(page);

  await expect(page.locator("body")).toContainText("Pocket DAW");
  await expect(page.locator('[data-transport-status="true"]')).toBeVisible();
  await expect(page.locator('[data-transport-toggle="true"]')).toBeVisible();

  await page.locator('[data-action="import-focus"]').click();
  await expect(page.locator("#file-window-title")).toContainText("File");
  await expect(page.locator("#importText")).toBeFocused();
  await expect(page.locator('[data-action="import-text"]')).toBeVisible();
  await expect(page.locator('[data-action="open-file"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Diagnostics JSON" })).toBeVisible();
});

test("creates a new project from the browser fallback file panel", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-action="import-focus"]').click();
  await page.locator(".file-panel").locator('[data-action="new-project"]').click();

  await expect(page.locator("#file-window-title")).toContainText("File");
  await expect(page.locator("#songSectionToAdd")).toBeVisible();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("New project created");
});

test("saves and exports diagnostics through browser fallback downloads", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-action="import-focus"]').click();

  const projectDownload = page.waitForEvent("download");
  await page.locator(".file-panel").locator('[data-action="save-project"]').click();
  const projectFile = await projectDownload;
  expect(projectFile.suggestedFilename()).toMatch(/\.pocketdaw$/);
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Downloaded browser fallback .pocketdaw file");

  const diagnosticsDownload = page.waitForEvent("download");
  await page.locator(".file-panel").locator('[data-action="export-diagnostics"]').click();
  const diagnosticsFile = await diagnosticsDownload;
  expect(diagnosticsFile.suggestedFilename()).toMatch(/diagnostics\.json$/);
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Exported diagnostics JSON");
});

test("opens diagnostics and audio settings panels without native APIs", async ({ page }) => {
  await gotoApp(page);

  await page.locator(".menu-group").filter({ hasText: "Help" }).hover();
  await page.locator(".menu-group").filter({ hasText: "Help" }).locator('[data-action="controls-open"]').first().click();
  await expect(page.locator('[data-controls-backdrop="true"]')).toBeVisible();
  await expect(page.locator("#controls-title")).toContainText("About / Diagnostics");
  await expect(page.locator('[data-controls-backdrop="true"]').locator('[data-action="copy-diagnostics"]')).toBeVisible();
  await expect(page.locator('[data-controls-backdrop="true"]').locator('[data-action="export-diagnostics"]')).toBeVisible();
  await expect(page.locator('[data-controls-backdrop="true"]')).toContainText("Pocket DAW v");
  await page.locator('[data-action="controls-close"]').click();
  await expect(page.locator('[data-controls-backdrop="true"]')).toHaveCount(0);

  await page.locator('[data-action="import-focus"]').click();
  await page.locator(".file-panel").locator('[data-action="audio-settings-open"]').click();
  await expect(page.locator('[data-audio-settings-backdrop="true"]')).toBeVisible();
  await expect(page.locator("#audio-settings-title")).toContainText("Audio Settings");
  await expect(page.locator('[data-action="audio-refresh"]')).toBeVisible();
  await expect(page.locator('[data-audio-settings-backdrop="true"]')).toContainText("No devices listed yet.");
});

test("toggles loop state and adds a live track through browser controls", async ({ page }) => {
  await gotoApp(page);

  await page.locator("#loopEnabled").check();
  await expect(page.locator("#loopEnabled")).toBeChecked();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Loop enabled");

  await page.getByRole("button", { name: "Add Track" }).last().click();
  await expect(page.locator('[data-add-track-backdrop="true"]')).toBeVisible();
  await page.locator('[data-add-track-kind="live-vocals"]').click();
  await expect(page.locator('[data-add-track-backdrop="true"]')).toHaveCount(0);
  await expect(page.locator('[data-arm-track="live-vocals"]').first()).toBeVisible();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Added track");
});

test("duplicates a selected clip and supports undo and redo", async ({ page }) => {
  await gotoApp(page);
  const clips = page.locator("[data-clip-id]");
  const initialCount = await clips.count();

  await page.locator('[data-action="clip-duplicate"]').last().click();
  await expect.poll(() => page.locator("[data-clip-id]").count()).toBeGreaterThan(initialCount);
  const duplicatedCount = await page.locator("[data-clip-id]").count();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Duplicated selected clip");

  await page.locator('[data-action="undo"]').last().click();
  await expect(page.locator("[data-clip-id]")).toHaveCount(initialCount);

  await page.locator('[data-action="redo"]').last().click();
  await expect(page.locator("[data-clip-id]")).toHaveCount(duplicatedCount);

  await page.locator('[data-action="clip-copy"]').last().click();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Copied");
  await page.locator('[data-action="clip-paste"]').last().click();
  await expect.poll(() => page.locator("[data-clip-id]").count()).toBeGreaterThan(duplicatedCount);
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Pasted clip at playhead");
});

test("keeps malicious pasted project text inert in the browser fallback", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-action="import-focus"]').click();

  const dialogCount = await page.evaluate(() => {
    window.__pocketDawE2eDialogCount = 0;
    window.alert = () => { window.__pocketDawE2eDialogCount += 1; };
    return window.__pocketDawE2eDialogCount;
  });
  expect(dialogCount).toBe(0);

  await page.locator("textarea").fill('{"app":"PocketDAW","project":{"title":"<img src=x onerror=alert(1)>"},"timeline":{"clips":[]}}');
  await page.locator('[data-action="import-text"]').click();

  await expect(page.locator('[role="status"]').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__pocketDawE2eDialogCount)).toBe(0);
});
