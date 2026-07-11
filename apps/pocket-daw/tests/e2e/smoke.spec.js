import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

async function gotoApp(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-transport-status="true"]')).toBeVisible({ timeout: 15_000 });
}

async function openImportPanel(page) {
  await page.getByRole("button", { name: "Import Chordsmith", exact: true }).click();
  await expect(page.locator("#file-window-title")).toContainText("File");
}

async function openTimelineTools(page) {
  const toggle = page.locator('[data-action="toggle-ui-section"][data-ui-section="timeline-tools"]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.locator("#loopEnabled")).toBeVisible();
}

test("starts the browser fallback and exposes core DAW controls", async ({ page }) => {
  await gotoApp(page);

  await expect(page.locator("body")).toContainText("Pocket DAW");
  await expect(page.locator('[data-transport-status="true"]')).toBeVisible();
  await expect(page.locator('[data-transport-toggle="true"]')).toBeVisible();

  await openImportPanel(page);
  await expect(page.locator("#importText")).toBeFocused();
  await expect(page.locator('[data-action="import-text"]')).toBeVisible();
  await expect(page.locator('[data-action="open-file"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Diagnostics JSON" })).toBeVisible();
});

test("creates a new project from the browser fallback file panel", async ({ page }) => {
  await gotoApp(page);
  await openImportPanel(page);
  await page.locator(".file-panel").locator('[data-action="new-project"]').click();

  await expect(page.locator("#file-window-title")).toContainText("File");
  await expect(page.locator('[data-transport-status="true"]')).toContainText("New project created");
  await page.locator('[data-action="file-window-close"]').click();
  await expect(page.locator('[data-file-backdrop="true"]')).toHaveCount(0);
  await openTimelineTools(page);
  await expect(page.locator("#songSectionToAdd")).toBeVisible();
});

test("saves and exports diagnostics through browser fallback downloads", async ({ page }) => {
  await gotoApp(page);
  await openImportPanel(page);

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

  await openImportPanel(page);
  await page.locator(".file-panel").locator('[data-action="audio-settings-open"]').click();
  await expect(page.locator('[data-audio-settings-backdrop="true"]')).toBeVisible();
  await expect(page.locator("#audio-settings-title")).toContainText("Audio Settings");
  await expect(page.locator('[data-action="audio-refresh"]')).toBeVisible();
  await expect(page.locator('[data-audio-settings-backdrop="true"]')).toContainText("No devices listed yet.");
});

test("toggles loop state and adds a live track through browser controls", async ({ page }) => {
  await gotoApp(page);

  await openTimelineTools(page);
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

test("contains modal focus, closes on Escape, and restores the trigger", async ({ page }) => {
  await gotoApp(page);

  const trigger = page.getByRole("button", { name: "Add Track" }).last();
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Library / Add Track" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement))).toBe(true);
  await expect.poll(() => page.locator(".transport").evaluate((node) => node.inert)).toBe(true);

  const dialogButtons = dialog.getByRole("button");
  await dialogButtons.last().focus();
  await page.keyboard.press("Tab");
  await expect(dialogButtons.first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.locator(".transport").evaluate((node) => node.inert)).toBe(false);
});

test("adjusts generated clip repeats from the keyboard and preserves undo", async ({ page }) => {
  await gotoApp(page);

  const handle = page.getByRole("slider", { name: /Repeat .+ end/ }).first();
  await expect(handle).toBeVisible();
  const clipId = await handle.getAttribute("data-clip-loop-handle");
  expect(clipId).toBeTruthy();
  const handleSelector = `[data-clip-loop-handle="${clipId}"]`;
  await expect(handle).toHaveAttribute("role", "slider");
  await expect(handle).toHaveAttribute("aria-describedby", "clip-repeat-instructions");
  const minimum = Number(await handle.getAttribute("aria-valuemin"));
  const maximum = Number(await handle.getAttribute("aria-valuemax"));
  const initial = Number(await handle.getAttribute("aria-valuenow"));
  expect(initial).toBe(minimum);

  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await page.locator(handleSelector).first().getAttribute("aria-valuenow"))).toBeGreaterThan(initial);
  await expect(page.locator(handleSelector).first()).toBeFocused();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Repeated");

  await page.keyboard.press("Control+z");
  await expect.poll(async () => Number(await page.locator(handleSelector).first().getAttribute("aria-valuenow"))).toBe(initial);

  await page.locator(handleSelector).first().focus();
  await page.keyboard.press("End");
  await expect.poll(async () => Number(await page.locator(handleSelector).first().getAttribute("aria-valuenow"))).toBe(maximum);
  await page.locator(handleSelector).first().focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => Number(await page.locator(handleSelector).first().getAttribute("aria-valuenow"))).toBe(minimum);
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Cleared repeats");
});

test("associates import validation errors with the editable field and clears them on input", async ({ page }) => {
  await gotoApp(page);
  const trigger = page.getByRole("button", { name: "Import Chordsmith", exact: true });
  await trigger.focus();
  await trigger.click();
  await expect(page.locator("#file-window-title")).toContainText("File");

  const input = page.locator("#importText");
  await input.fill("{");
  await page.locator('[data-action="import-text"]').click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-describedby", "importTextHelp importTextError");
  await expect(page.locator("#importTextError")).toHaveAttribute("role", "alert");
  await expect(page.locator("#importTextError")).toBeVisible();

  await input.fill('{"app":"PocketDAW"}');
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(input).toHaveAttribute("aria-describedby", "importTextHelp");
  await expect(page.locator("#importTextError")).toHaveCount(0);

  await input.fill("{");
  await page.locator('[data-action="import-text"]').click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("{}");
  await page.locator('[data-action="import-text"]').click();
  const importedInput = page.locator("#importText");
  await expect(importedInput).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator("#importTextError")).toHaveCount(0);
  await expect(importedInput).toBeFocused();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Imported raw Pocket Chordsmith JSON");

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-file-backdrop="true"]')).toHaveCount(0);
  await expect(page.locator('[data-action="import-focus"]')).toBeFocused();
});

test("uses stateful sequencer names and roving arrow-key focus", async ({ page }) => {
  await gotoApp(page);

  const grid = page.locator("[data-step-grid]").first();
  const cells = grid.locator("[data-step-cell]");
  await expect(cells.first()).toHaveAttribute("aria-label", /section .+, step \d+, (off|on|accent|auto|R|\d+)/i);
  await expect(cells.first()).toHaveAttribute("aria-pressed", /true|false/);
  await expect(grid.locator('[data-step-cell][tabindex="0"]')).toHaveCount(1);

  const first = grid.locator('[data-step-cell][data-step-row="0"][data-step-column="0"]');
  const second = grid.locator('[data-step-cell][data-step-row="0"][data-step-column="1"]');
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("tabindex", "0");
  await expect(first).toHaveAttribute("tabindex", "-1");

  const ruler = page.locator('[data-seek-ruler="true"]');
  await ruler.focus();
  const before = Number(await ruler.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await ruler.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
});

test("keeps the supported narrow window and modal inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await gotoApp(page);

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  await expect(page.getByRole("heading", { name: "Pocket DAW" })).toBeVisible();
  await expect(page.locator('[data-transport-toggle="true"]')).toBeVisible();

  await page.getByRole("button", { name: "Add Track", exact: true }).last().click();
  const dialog = page.getByRole("dialog", { name: "Library / Add Track" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(800);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
});

test("honors reduced motion for repeating busy feedback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoApp(page);
  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "transport-busy";
    probe.dataset.reducedMotionProbe = "true";
    probe.innerHTML = "<i></i>";
    document.body.appendChild(probe);
  });

  const motion = await page.locator('[data-reduced-motion-probe="true"] i').evaluate((node) => {
    const style = getComputedStyle(node, "::after");
    const duration = style.animationDuration;
    const durationMs = duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    return { durationMs, iterations: style.animationIterationCount };
  });
  expect(motion.durationMs).toBeLessThanOrEqual(0.01);
  expect(motion.iterations).toBe("1");
});

test("keeps keyboard focus visible in forced-colors mode", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await gotoApp(page);

  const play = page.locator('[data-transport-toggle="true"]');
  await play.focus();
  await expect(play).toBeFocused();
  const focus = await play.evaluate((node) => {
    const style = getComputedStyle(node);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focus.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
});

test("duplicates a selected clip and supports undo and redo", async ({ page }) => {
  await gotoApp(page);
  const clips = page.locator("[data-clip-id]");
  const initialCount = await clips.count();

  await openTimelineTools(page);
  await page.locator('[data-action="clip-duplicate"]:visible').click();
  await expect.poll(() => page.locator("[data-clip-id]").count()).toBeGreaterThan(initialCount);
  const duplicatedCount = await page.locator("[data-clip-id]").count();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Duplicated selected clip");

  await page.locator('[data-action="clip-copy"]:visible').click();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Copied");
  await page.locator('[data-action="clip-paste"]:visible').click();
  await expect.poll(() => page.locator("[data-clip-id]").count()).toBeGreaterThan(duplicatedCount);
  const pastedCount = await page.locator("[data-clip-id]").count();
  await expect(page.locator('[data-transport-status="true"]')).toContainText("Pasted clip at playhead");

  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(page.locator("[data-clip-id]")).toHaveCount(duplicatedCount);
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(page.locator("[data-clip-id]")).toHaveCount(initialCount);

  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(page.locator("[data-clip-id]")).toHaveCount(duplicatedCount);
  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(page.locator("[data-clip-id]")).toHaveCount(pastedCount);
});

test("keeps malicious pasted project text inert in the browser fallback", async ({ page }) => {
  await gotoApp(page);
  await openImportPanel(page);

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
