import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/apps/chordsmith-web/");
  await page.waitForLoadState("networkidle");

  expect(pageErrors, "page runtime errors").toEqual([]);
  expect(
    consoleMessages.filter((message) => !message.includes("AudioContext")),
    "console warnings/errors",
  ).toEqual([]);
});

test("loads the main app controls", async ({ page }) => {
  await expect(page).toHaveURL(/pocket_chordsmith_v68_core_bridge\.html/);
  await expect(page.getByRole("heading", { name: "Pocket Chordsmith" })).toBeVisible();
  await expect(page.getByText("Pocket Audio Core bridge build")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true }).first()).toBeVisible();
  await expect(page.locator("#progressionSlots .slot")).toHaveCount(4);
});

test("demo button loads the bundled starter song", async ({ page }) => {
  await page.getByRole("button", { name: "Demo" }).click();
  await expect(page.locator("#statusText")).toContainText("Loaded Pocket Chordsmith v68 demo");
  await expect(page.locator("#progressionSlots .slot").first()).toContainText(/C|Am|F|G/);
});

test("settings modal opens import and handoff tools", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.locator("#settingsModal")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("button", { name: "Export Compact JSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to DJ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to Pocket DAW" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Push to Godot" })).toBeVisible();
  await expect(page.locator("#pocketAudioCoreStatus")).toContainText("Pocket Audio Core");
});

test("handoff buttons stop live playback before pushing", async ({ page }) => {
  await page.evaluate(() => {
    window.__pocketChordsmithOpenedUrls = [];
    window.open = (url, name) => {
      const opened = {
        closed: false,
        name: name || "",
        opener: null,
        location: { href: url },
      };
      window.__pocketChordsmithOpenedUrls.push(opened);
      return opened;
    };
  });

  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to DJ" }).click();

  await expect(page.getByRole("button", { name: "Play", exact: true }).first()).toBeVisible();
  await expect(page.locator("#statusText")).toContainText("Song sent to Pocket DJ");
  await expect
    .poll(() => page.evaluate(() => window.__pocketChordsmithOpenedUrls.length))
    .toBeGreaterThan(0);
});

test("Pocket DAW handoff targets the installed app protocol", async ({ page }) => {
  await page.evaluate(() => {
    window.__pocketChordsmithOpenedUrls = [];
    window.__pocketChordsmithProtocolLaunches = [];
    window.open = (url, name) => {
      const opened = {
        closed: false,
        name: name || "",
        opener: null,
        location: { href: url },
      };
      window.__pocketChordsmithOpenedUrls.push(opened);
      return opened;
    };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("pocket-daw://")) {
        window.__pocketChordsmithProtocolLaunches.push(this.href);
        return;
      }
      return originalClick.call(this);
    };
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to Pocket DAW" }).click();

  const protocolLaunches = await page.evaluate(() => window.__pocketChordsmithProtocolLaunches);
  const openedUrls = await page.evaluate(() =>
    window.__pocketChordsmithOpenedUrls.map((item) => item.location.href),
  );
  expect(protocolLaunches).toContainEqual(expect.stringMatching(/^pocket-daw:\/\/handoff\?pocketHandoff=/));
  expect(openedUrls).not.toContain("about:blank");
  expect(openedUrls).toEqual([]);
  await expect(page.locator("#pushHandoffStatus")).toContainText("paste the copied PCS1 code");
});
