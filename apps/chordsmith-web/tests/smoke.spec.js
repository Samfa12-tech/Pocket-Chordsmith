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
    window.__pocketChordsmithFetches = [];
    window.fetch = async (url, options = {}) => {
      window.__pocketChordsmithFetches.push({
        url: String(url),
        method: options.method || "GET",
        body: String(options.body || ""),
      });
      return { ok: true, json: async () => ({ ok: true }), text: async () => "ok" };
    };
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

  const fetches = await page.evaluate(() => window.__pocketChordsmithFetches);
  const protocolLaunches = await page.evaluate(() => window.__pocketChordsmithProtocolLaunches);
  const openedUrls = await page.evaluate(() =>
    window.__pocketChordsmithOpenedUrls.map((item) => item.location.href),
  );
  expect(fetches).toHaveLength(1);
  expect(fetches[0].url).toBe("http://127.0.0.1:47858/pocket-daw/handoff");
  expect(fetches[0].method).toBe("POST");
  expect(fetches[0].body.length).toBeGreaterThan(100);
  expect(protocolLaunches).toEqual([]);
  expect(openedUrls).not.toContain("about:blank");
  expect(openedUrls).toEqual([]);
  await expect(page.locator("#pushHandoffStatus")).toContainText("Pocket DAW received the song");
});

test("Pocket DAW handoff wakes the installed app with a downloaded handoff file when local handoff is offline", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pocketChordsmithProtocolLaunches = [];
    window.__pocketChordsmithFetches = [];
    window.__pocketChordsmithDownloads = [];
    let calls = 0;
    window.fetch = async (url, options = {}) => {
      calls += 1;
      window.__pocketChordsmithFetches.push({
        url: String(url),
        method: options.method || "GET",
        body: String(options.body || ""),
      });
      return { ok: false, json: async () => ({ ok: false }), text: async () => "offline" };
    };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("pocket-daw://")) {
        window.__pocketChordsmithProtocolLaunches.push(this.href);
        return;
      }
      if (this.download) {
        window.__pocketChordsmithDownloads.push({ fileName: this.download, href: this.href });
        return;
      }
      return originalClick.call(this);
    };
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to Pocket DAW" }).click();

  const fetches = await page.evaluate(() => window.__pocketChordsmithFetches);
  const protocolLaunches = await page.evaluate(() => window.__pocketChordsmithProtocolLaunches);
  const downloads = await page.evaluate(() => window.__pocketChordsmithDownloads);
  expect(fetches.length).toBe(1);
  expect(downloads).toHaveLength(1);
  expect(downloads[0].fileName).toMatch(/^pocket-chordsmith-to-pocket-daw-.+\.pcs1\.txt$/);
  expect(protocolLaunches).toHaveLength(1);
  expect(protocolLaunches[0]).toContain("pocket-daw://handoff?source=download&file=");
  expect(protocolLaunches[0]).not.toContain("pocketHandoff=");
  expect(decodeURIComponent(protocolLaunches[0])).toContain(downloads[0].fileName);
  await expect(page.locator("#pushHandoffStatus")).toContainText("downloaded handoff file");
});

test("Pocket DAW handoff does not claim success when it falls back to a downloaded handoff file", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pocketChordsmithProtocolLaunches = [];
    window.__pocketChordsmithFetches = [];
    window.__pocketChordsmithDownloads = [];
    window.fetch = async (url, options = {}) => {
      window.__pocketChordsmithFetches.push({
        url: String(url),
        method: options.method || "GET",
        body: String(options.body || ""),
      });
      throw new TypeError("Failed to fetch");
    };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("pocket-daw://")) {
        window.__pocketChordsmithProtocolLaunches.push(this.href);
        return;
      }
      if (this.download) {
        window.__pocketChordsmithDownloads.push({ fileName: this.download, href: this.href });
        return;
      }
      return originalClick.call(this);
    };
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to Pocket DAW" }).click();

  await expect
    .poll(() => page.evaluate(() => window.__pocketChordsmithProtocolLaunches.length), { timeout: 8000 })
    .toBe(1);

  const fetches = await page.evaluate(() => window.__pocketChordsmithFetches);
  const protocolLaunches = await page.evaluate(() => window.__pocketChordsmithProtocolLaunches);
  const downloads = await page.evaluate(() => window.__pocketChordsmithDownloads);
  expect(fetches.length).toBe(1);
  expect(protocolLaunches[0]).toContain("source=download");
  expect(downloads).toHaveLength(1);
  await expect(page.locator("#pushHandoffStatus")).toContainText("should import the downloaded handoff file");
});
