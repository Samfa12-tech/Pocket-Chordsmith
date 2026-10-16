import { expect, test } from "@playwright/test";
import { serveBuiltUi } from "./staticUiTransport.js";

// Optional production-build transport for socket-restricted test environments.
test.beforeEach(async ({ page }) => serveBuiltUi(page));

async function openStudio(page, size = { width: 800, height: 600 }) {
  await page.setViewportSize(size);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-transport-status="true"]')).toBeVisible();
  // Browser shell geometry only. Actual installed Windows acceptance is separate.
  await page.evaluate(() => document.documentElement.classList.add("native-desktop-shell"));
}

test("long Edit commands stay reachable in constrained shell geometry", async ({ page }, testInfo) => {
  await openStudio(page);
  const edit = page.locator(".menu-root").filter({ hasText: /^Edit$/ });
  await edit.click();
  const menu = edit.locator("..").locator(".menu-popover");
  const last = menu.locator('[data-action="clip-mute"]');
  await last.focus();
  const box = await last.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
  expect(await last.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("edit-menu-constrained.png") });
});

test("Escape dismisses a focused menu and returns to its command root", async ({ page }) => {
  await openStudio(page);
  const edit = page.locator(".menu-root").filter({ hasText: /^Edit$/ });
  await edit.click();
  const menu = edit.locator("..").locator(".menu-popover");
  await menu.locator('[data-action="undo"]').focus();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(edit).toBeFocused();
  await expect(edit).toHaveAttribute("aria-expanded", "false");
});

test("menu navigation owns arrow, Home, End and letter keys without editing the selected clip", async ({ page }) => {
  await openStudio(page, { width: 1100, height: 720 });
  const clips = page.locator("[data-clip-id]");
  const count = await clips.count();
  expect(count).toBeGreaterThan(0);
  const edit = page.locator("#desktop-menu-edit");
  await edit.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('#desktop-menu-edit-popup [data-action="undo"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.locator('#desktop-menu-edit-popup [data-action="clip-mute"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator('#desktop-menu-edit-popup [data-action="undo"]')).toBeFocused();
  await page.keyboard.press("d");
  await expect(page.locator('#desktop-menu-edit-popup [data-action="clip-duplicate"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('#desktop-menu-view-popup [data-action="zoom-in"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#desktop-menu-view")).toBeFocused();
  await expect(clips).toHaveCount(count);
});

test("a menu command dialog returns focus to a visible trigger and Tab leaves the menu", async ({ page }) => {
  await openStudio(page, { width: 1100, height: 720 });
  const file = page.locator("#desktop-menu-file");
  await file.click();
  await page.locator('#desktop-menu-file-popup [data-action="file-window-open"]').click();
  await expect(page.locator("#file-window-title")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(file).toBeFocused();
  await expect(page.locator("#desktop-menu-file-popup")).toBeHidden();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(page.locator("#desktop-menu-edit")).toBeFocused();
  await expect(page.locator("#desktop-menu-file-popup")).toBeHidden();
});

test("background startup status refresh preserves an open scrolled menu and its focus", async ({ page }) => {
  await page.clock.install();
  await openStudio(page);
  const edit = page.locator("#desktop-menu-edit");
  await edit.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  const last = page.locator('#desktop-menu-edit-popup [data-action="clip-mute"]');
  await expect(last).toBeFocused();
  const renders = Number(await page.locator("#app").getAttribute("data-render-count"));
  await page.clock.runFor(4000);
  await expect.poll(async () => Number(await page.locator("#app").getAttribute("data-render-count"))).toBeGreaterThan(renders);
  await expect(page.locator("#desktop-menu-edit-popup")).toBeVisible();
  await expect(last).toBeFocused();
});

test("every menu stays bounded through resize, outside dismissal and repeated opening", async ({ page }) => {
  await openStudio(page, { width: 1440, height: 920 });
  for (const size of [{ width: 1440, height: 920 }, { width: 1100, height: 720 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(size);
    for (const root of await page.locator(".menu-root").all()) {
      await root.click();
      const menu = page.locator(`#${await root.getAttribute("aria-controls")}`);
      await expect(menu).toBeVisible();
      // Read atomically across a possible asynchronous startup shell refresh.
      await expect.poll(() => menu.evaluate(element => {
        const box = element.getBoundingClientRect();
        return { visible: box.width > 0 && box.height > 0, bounded: box.x >= 0 && box.y >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight };
      })).toEqual({ visible: true, bounded: true });
      await page.keyboard.press("Escape");
      await expect(root).toBeFocused();
    }
  }
  await page.locator("#desktop-menu-edit").click();
  const transport = await page.locator(".transport").boundingBox();
  await page.mouse.click(transport.x + transport.width - 5, transport.y + 5);
  await expect(page.locator("#desktop-menu-edit-popup")).toBeHidden();
});
