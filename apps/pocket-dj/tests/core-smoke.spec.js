import { expect, test } from "@playwright/test";

const PCS_FIXTURES = [
  {
    path: "/apps/chordsmith-web/demos/lofi_koi_pond_loop.json",
    title: "Koi Pond Garden Loop",
    profile: "Koi Pond",
  },
  {
    path: "/apps/chordsmith-web/demos/chip_bug_maze_pulse_loop.json",
    title: "Chip Bug Maze Pulse Loop",
    profile: "Bug Maze Pulse",
  },
];

test.beforeEach(async ({ page }) => {
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/apps/pocket-dj/");
  await page.waitForLoadState("networkidle");

  expect(pageErrors, "page runtime errors").toEqual([]);
  expect(consoleMessages, "console warnings/errors").toEqual([]);
});

async function fetchFixture(page, fixturePath) {
  const response = await page.request.get(fixturePath);
  expect(response.ok(), `fixture exists: ${fixturePath}`).toBe(true);
  return response.text();
}

async function buildPocketHandoffParam(page, code, kind = "pcs-to-dj") {
  return page.evaluate(
    ({ handoffCode, handoffKind }) => {
      const payload = {
        app: "PocketHandoff",
        handoffVersion: 1,
        kind: handoffKind,
        code: handoffCode,
        createdAt: Date.now(),
      };
      return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    },
    { handoffCode: code, handoffKind: kind },
  );
}

async function buildPocketChordsmithShareCode(page, fixturePath) {
  const fixtureText = await fetchFixture(page, fixturePath);
  return page.evaluate((text) => {
    const parsed = JSON.parse(text);
    return `PCS1:${btoa(unescape(encodeURIComponent(JSON.stringify(parsed))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")}`;
  }, fixtureText);
}

async function readSavedDjSession(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("pocket_dj_v1_last_session") || "null"),
  );
}

async function setRangeValue(locator, value) {
  await locator.evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("loads demo deck through Pocket Audio Core", async ({ page }) => {
  await expect(page.locator(".logo").first()).toHaveText("Pocket DJ");

  await page.getByRole("button", { name: "Load Demo" }).click();
  await expect(page.locator("#statusText")).toContainText("Demo deck loaded");

  const audioCoreCard = page.locator(".meta-card", { hasText: "Audio Core" });
  await expect(audioCoreCard).toContainText("0.1.0-scaffold");
  await expect(audioCoreCard).toContainText(/events|ready/);
  await expect(audioCoreCard).not.toContainText(/legacy audio active/i);
});

for (const fixture of PCS_FIXTURES) {
  test(`imports ${fixture.title} from Chordsmith JSON`, async ({ page }) => {
    await page
      .locator("#importText")
      .fill(await fetchFixture(page, fixture.path));
    await page.locator("#importBtn").click();

    await expect(page.locator("#statusText")).toContainText(
      "Pocket Chordsmith project imported",
    );
    await expect(page.locator("#deckName")).toContainText(fixture.title);
    await expect(
      page.locator(".meta-card", { hasText: "Profile" }),
    ).toContainText(fixture.profile);
    await expect(
      page.locator(".meta-card", { hasText: "Song from" }),
    ).toContainText("Pocket Chordsmith");
  });
}

test("consumes URL handoff and clears the launch hash", async ({ page }) => {
  const code = await buildPocketChordsmithShareCode(page, PCS_FIXTURES[0].path);
  const packedHandoff = await buildPocketHandoffParam(page, code);

  await page.goto(`/apps/pocket-dj/#pocketHandoff=${packedHandoff}`);
  await page.waitForLoadState("networkidle");

  await expect(page.locator("#statusText")).toContainText(
    "Song received from Pocket Chordsmith",
  );
  await expect(page.locator("#importText")).toHaveValue(/^PCS1:/);
  await expect(page.locator("#deckName")).toContainText(PCS_FIXTURES[0].title);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
});

test("edit source song exposes a Chordsmith handoff fallback", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pocketDjOpenedUrls = [];
    window.open = (url, name) => {
      window.__pocketDjOpenedUrls.push({ url, name });
      return null;
    };
  });

  await page.getByRole("button", { name: "Load Demo" }).click();
  await page.locator("#editSourceBtn").click();

  await expect(page.locator("#handoffBox")).toBeVisible();
  await expect(page.locator("#handoffText")).toHaveValue(/^PCS1:/);
  await expect(page.locator("#statusText")).toContainText(
    /Source song (copied|ready)/,
  );

  const storedHandoff = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("pocket_dj_to_chordsmith_handoff_v1") || "null",
    ),
  );
  expect(storedHandoff).toMatchObject({
    app: "PocketHandoff",
    handoffVersion: 1,
    kind: "dj-to-chordsmith",
  });
  expect(storedHandoff.code).toMatch(/^PCS1:/);
});

test("lofi macros update performance state and reset cleanly", async ({
  page,
}) => {
  await page.locator("#lofiDemoBtn").click();
  await expect(page.locator("#statusText")).toContainText(
    "Lofi DJ Demo loaded",
  );
  await expect(page.locator("#deckName")).toContainText("Lofi DJ Demo");

  await page.locator("#rainyDropBtn").click();
  await expect(page.locator("#statusText")).toContainText("Rainy Drop");
  await expect(page.locator("#buildStateText")).toContainText("Build active");

  await page.locator("#filteredStudyBtn").click();
  await expect(page.locator("#statusText")).toContainText(
    "Filtered Study Mode",
  );
  await expect(page.locator("#buildStateText")).toContainText("Build active");

  await page.locator("#resetFxBtn").click();
  await expect(page.locator("#statusText")).toContainText("FX and build reset");
  await expect(page.locator("#buildStateText")).toContainText("Neutral");
});

test("deck controls queue, loop, mix, filter, build and drop cleanly", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Load Demo" }).click();
  await expect(page.locator("#currentSectionText")).toHaveText("A");

  await page.locator('[data-section-pad="B"]').click();
  await expect(page.locator("#queuedSectionText")).toHaveText("B");
  await expect(page.locator('[data-section-pad="B"] .state')).toHaveText(
    "queued",
  );
  await expect(page.locator("#statusText")).toContainText("Section B queued");

  let saved = await readSavedDjSession(page);
  expect(saved.performance.queuedSection).toBe("B");

  await page.locator("#loopBtn").click();
  await expect(page.locator("#loopBtn")).toHaveText("Release Hold");
  await expect(page.locator("#loopText")).toContainText("Hold on");
  saved = await readSavedDjSession(page);
  expect(saved.performance.loopCurrentSection).toBe(true);

  await page.locator('[data-mute="bass"]').click();
  await expect(page.locator('[data-mute="bass"]')).toHaveClass(/on/);
  await setRangeValue(page.locator('[data-stem-volume="melody"]'), "0.33");
  saved = await readSavedDjSession(page);
  expect(saved.performance.stemMutes.bass).toBe(true);
  expect(saved.performance.stemVolumes.melody).toBeCloseTo(0.33, 2);

  await setRangeValue(page.locator('[data-fx="filter"]'), "0.42");
  await expect(page.locator("#fxv-filter")).toHaveText("42");
  saved = await readSavedDjSession(page);
  expect(saved.performance.fx.filter).toBeCloseTo(0.42, 2);

  await page.locator("#buildBtn").click();
  await expect(page.locator("#buildStateText")).toContainText("Build active");
  await expect(page.locator("#statusText")).toContainText("Building");

  await page.locator("#dropBtn").click();
  await expect(page.locator("#currentSectionText")).toHaveText("B");
  await expect(page.locator("#queuedSectionText")).toHaveText("—");
  await expect(page.locator("#statusText")).toContainText(
    "Drop target loaded: section B",
  );
  saved = await readSavedDjSession(page);
  expect(saved.performance.currentSection).toBe("B");
  expect(saved.performance.queuedSection).toBeNull();
  expect(saved.performance.buildActive).toBe(false);
});
