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

test("Pocket DAW handoff wakes the installed app with a short protocol URL when local handoff is offline", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pocketChordsmithProtocolLaunches = [];
    window.__pocketChordsmithFetches = [];
    let calls = 0;
    window.fetch = async (url, options = {}) => {
      calls += 1;
      window.__pocketChordsmithFetches.push({
        url: String(url),
        method: options.method || "GET",
        body: String(options.body || ""),
      });
      return { ok: calls > 1, json: async () => ({ ok: calls > 1 }), text: async () => "ok" };
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
  expect(fetches.length).toBeGreaterThanOrEqual(2);
  expect(protocolLaunches).toEqual(["pocket-daw://handoff?source=loopback"]);
  expect(protocolLaunches[0]).not.toContain("pocketHandoff=");
  await expect(page.locator("#pushHandoffStatus")).toContainText("Pocket DAW received the song");
});

test("Pocket DAW handoff falls back to a local form post when fetch cannot confirm", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pocketChordsmithProtocolLaunches = [];
    window.__pocketChordsmithFetches = [];
    window.__pocketChordsmithFormPosts = [];
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
      return originalClick.call(this);
    };
    HTMLFormElement.prototype.submit = function () {
      const data = new FormData(this);
      window.__pocketChordsmithFormPosts.push({
        action: this.action,
        method: this.method,
        target: this.target,
        encodedHandoffLength: String(data.get("encodedHandoff") || "").length,
      });
    };
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to Pocket DAW" }).click();

  await expect
    .poll(() => page.evaluate(() => window.__pocketChordsmithFormPosts.length), { timeout: 8000 })
    .toBe(1);

  const fetches = await page.evaluate(() => window.__pocketChordsmithFetches);
  const protocolLaunches = await page.evaluate(() => window.__pocketChordsmithProtocolLaunches);
  const formPosts = await page.evaluate(() => window.__pocketChordsmithFormPosts);
  expect(fetches.length).toBeGreaterThanOrEqual(2);
  expect(protocolLaunches).toEqual(["pocket-daw://handoff?source=loopback"]);
  expect(formPosts).toHaveLength(1);
  expect(formPosts[0].action).toBe("http://127.0.0.1:47858/pocket-daw/handoff");
  expect(formPosts[0].method).toBe("post");
  expect(formPosts[0].encodedHandoffLength).toBeGreaterThan(100);
  await expect(page.locator("#pushHandoffStatus")).toContainText("Pocket DAW was given the song");
});
