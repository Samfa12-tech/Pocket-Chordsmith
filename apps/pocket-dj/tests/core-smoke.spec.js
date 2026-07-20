import { expect, test } from "@playwright/test";

test("Pocket DJ exposes accessible import, live status, mixer, shortcut help, and modal focus", async ({ page }) => {
  await page.goto("/apps/pocket-dj/");
  await expect(page.getByRole("heading", { level: 1, name: "Pocket DJ" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByLabel("Pocket Chordsmith song export")).toBeVisible();
  await expect(page.locator("#importStatus")).toHaveAttribute("aria-live", "polite");

  const opener = page.locator("#importHelpBtn");
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#helpCloseBtn")).toBeFocused();
  await expect(page.getByRole("dialog")).toContainText("press D");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  await page.locator("#demoBtn").click();
  const drumsMute = page.getByRole("button", { name: "Mute Drums" });
  await expect(drumsMute).toHaveAttribute("aria-pressed", "false");
  await drumsMute.click();
  await expect(drumsMute).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Drums volume")).toBeVisible();
});

test("Pocket DJ associates import errors with the field and clears them without stealing focus", async ({ page }) => {
  await page.goto("/apps/pocket-dj/");
  const field = page.locator("#importText");
  const button = page.locator("#importBtn");
  const error = page.locator("#importError");

  await expect(field).toHaveAttribute("aria-describedby", "importHelp importError");
  await field.fill("not a Pocket Chordsmith export");
  await button.click();
  await expect(button).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(error).not.toHaveText("");
  await expect(page.locator("#importStatus")).not.toHaveText("Ready");

  await field.fill("correcting the export");
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await expect(error).toHaveText("");

  await field.fill(JSON.stringify(makeMetalFixture()));
  await button.click();
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await expect(error).toHaveText("");
  await expect(page.locator("#statusText")).toContainText("Pocket Chordsmith project imported");
});

test("Pocket Audio Handoff labels fields and explains the short-lived relay", async ({ page }) => {
  await page.goto("/apps/pocket-audio-handoff/");
  await expect(page.getByRole("heading", { level: 1, name: "Pocket Audio Handoff" })).toBeVisible();
  await expect(page.getByLabel("Pocket Chordsmith song or transfer code")).toBeVisible();
  await expect(page.getByLabel("Desktop transfer code")).toBeVisible();
  await expect(page.locator("#sourceStatus")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#relayStatus")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByText(/expire automatically/)).toBeVisible();
  const shortTargets = await page.locator("button, .file-label, .code-input").evaluateAll(nodes => nodes.filter(node => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.height < 44;
  }).length);
  expect(shortTargets).toBe(0);
});

test("Pocket Audio Handoff associates transfer and short-code errors and clears them on edit or success", async ({ page }) => {
  await page.route("**/api/pocket-audio-handoff/transfers/**", async route => {
    if(route.request().url().endsWith("/SAM-200")){
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({code: "PCS1:phone-success", expiresAt: "2030-01-01T00:00:00.000Z"}),
      });
    }else{
      await route.fulfill({status: 404, contentType: "application/json", body: JSON.stringify({error: "Not found"})});
    }
  });
  await page.goto("/apps/pocket-audio-handoff/");

  const transfer = page.locator("#handoffText");
  const transferButton = page.locator("#loadTextBtn");
  await expect(transfer).toHaveAttribute("aria-describedby", "sourceHelp sourceFieldError");
  await transfer.fill("not a transfer");
  await transferButton.click();
  await expect(transferButton).toBeFocused();
  await expect(transfer).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#sourceFieldError")).toContainText("does not look like");
  await expect(page.locator("#sourceStatus")).toContainText("does not look like");

  await transfer.fill("PCS1:valid-transfer");
  await expect(transfer).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#sourceFieldError")).toHaveText("");
  await transferButton.click();
  await expect(transfer).not.toHaveAttribute("aria-invalid", "true");

  const shortCode = page.locator("#redeemCodeInput");
  await expect(shortCode).toHaveAttribute("aria-describedby", "redeemCodeHelp redeemCodeError");
  await shortCode.focus();
  await shortCode.press("Enter");
  await expect(shortCode).toBeFocused();
  await expect(shortCode).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#redeemCodeError")).toHaveText("Enter the short code from your phone.");
  await shortCode.fill("SAM-404");
  await expect(shortCode).not.toHaveAttribute("aria-invalid", "true");
  await shortCode.press("Enter");
  await expect(shortCode).toBeFocused();
  await expect(shortCode).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#redeemCodeError")).toContainText("could not be loaded");
  await expect(page.locator("#relayStatus")).toContainText("could not be loaded");

  await shortCode.fill("SAM-200");
  await expect(shortCode).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#redeemCodeError")).toHaveText("");
  await shortCode.press("Enter");
  await expect(shortCode).toBeFocused();
  await expect(shortCode).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#redeemCodeError")).toHaveText("");
  await expect(page.locator("#relayStatus")).toContainText("SAM-200 loaded");
});

test("Pocket DJ reflows at 320 CSS pixels without page-level horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/apps/pocket-dj/");
  await page.locator("#demoBtn").click();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.locator("#transportBar")).toBeVisible();
  await expect(page.getByLabel("Drums volume")).toBeVisible();
});

test("Pocket Audio Handoff reflows at 320 CSS pixels with labelled controls intact", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/apps/pocket-audio-handoff/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByLabel("Pocket Chordsmith song or transfer code")).toBeVisible();
  await expect(page.getByLabel("Desktop transfer code")).toBeVisible();
});

test("Pocket DJ honors reduced motion and preserves forced-colors focus visibility", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/apps/pocket-dj/");
  const opener = page.locator("#importHelpBtn");
  await opener.focus();
  const styles = await opener.evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      outlineStyle: computed.outlineStyle,
      outlineWidth: parseFloat(computed.outlineWidth),
      transitionDuration: parseFloat(computed.transitionDuration),
      animationDuration: parseFloat(computed.animationDuration),
    };
  });
  expect(styles.outlineStyle).not.toBe("none");
  expect(styles.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(styles.transitionDuration).toBeLessThanOrEqual(0.001);
  expect(styles.animationDuration).toBeLessThanOrEqual(0.001);
});

test("Pocket Audio Handoff keeps keyboard focus visible in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/apps/pocket-audio-handoff/");
  const field = page.getByLabel("Desktop transfer code");
  await field.focus();
  const outline = await field.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { style: computed.outlineStyle, width: parseFloat(computed.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);

  const fileInput = page.locator("#fileInput");
  await fileInput.focus();
  const fileLabel = page.locator("label[for=fileInput]");
  const labelOutline = await fileLabel.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(labelOutline).not.toBe("none");
});

test("Pocket DJ help dialog traps focus and restores it after every close path", async ({ page }) => {
  await page.goto("/apps/pocket-dj/");
  const opener = page.locator("#importHelpBtn");

  await opener.click();
  await expect(page.locator("#helpCloseBtn")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#helpCloseBtn")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#helpCloseBtn")).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.locator("#helpCloseBtn").click();
  await expect(opener).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

  await opener.click();
  await page.locator("#helpOverlay").click({ position: { x: 2, y: 2 } });
  await expect(page.locator("#helpOverlay")).toBeHidden();
  await expect(opener).toBeFocused();
});

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

function makeMetalFixture() {
  const len = 16;
  const grid = {
    kick: Array(len).fill(0),
    snare: Array(len).fill(0),
    hat: Array(len).fill(0),
    bass: Array(len).fill(0),
  };
  [0, 4, 8, 12].forEach((step) => {
    grid.kick[step] = 1;
  });
  [4, 12].forEach((step) => {
    grid.snare[step] = 2;
  });
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((step) => {
    grid.hat[step] = 1;
    grid.bass[step] = step % 4 === 2 ? 1 : 0;
  });
  const guitarPattern = Array(len).fill("off");
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((step, index) => {
    guitarPattern[step] = index % 4 === 3 ? "accent" : "chug";
  });
  const melody = Array(len).fill(null);
  [0, 3, 6, 8, 12].forEach((step, index) => {
    melody[step] = [0, 1, 3, 5, 6][index];
  });
  return {
    projectVersion: 16,
    title: "Metal Chug Import Test",
    key: "E",
    scale: "minor",
    timeSig: 4,
    bpm: 128,
    swing: 0,
    resolution: 4,
    audioProfile: "heavy_metal",
    stylePreset: "metal_classic_chug",
    metalPreset: "metal_classic_chug",
    metalTexture: {
      enabled: true,
      drive: 0.52,
      palmMute: 0.82,
      lowTightness: 0.88,
      presence: 0.6,
      roomSize: 0.12,
      pickAttack: 0.76,
    },
    drumKit: "metal_tight",
    drumGroovePreset: "metal_backbeat_chug",
    bassTone: "metal_pick_bass",
    chordInstrument: "metal_power_stack",
    melodyInstrumentsA: ["shred_lead_guitar"],
    melodyTracksA: [melody],
    melodyOctavesA: [0],
    melodyMuteA: [false],
    melodySoloA: [false],
    melodyPanA: [0],
    melodyHoldA: [Array(len).fill(false)],
    melodySlideA: [Array(len).fill(false)],
    melodyTupletsA: [Array(len).fill(false)],
    progressionA: [0, 5, 6, 4],
    gridA: grid,
    gridTupletsA: {
      kick: Array(len).fill(false),
      snare: Array(len).fill(false),
      hat: Array(len).fill(false),
      bass: Array(len).fill(false),
    },
    bassNotesA: Array(len).fill(null),
    bassHoldA: Array(len).fill(false),
    bassSlideA: Array(len).fill(false),
    bassAccentA: Array(len).fill(false),
    guitarEnabled: true,
    guitarTone: "tight_metal",
    guitarRegister: "low",
    guitarStrumMode: "alternate",
    guitarPatternPreset: "metal_chug",
    guitarPatternA: guitarPattern,
    sectionBars: { A: 1 },
    songSequence: ["A"],
  };
}

function makeRichFunkFixture() {
  return {
    projectVersion: 17,
    title: "Rich Funk Pocket",
    key: "D",
    scale: "minor",
    timeSig: 4,
    bpm: 98,
    resolution: 4,
    formatFeatures: [
      "sound-profile-v1",
      "rich-events-v1",
      "articulations-v1",
      "expanded-drums-v1",
      "capability-report-v1",
      "future-expression-v1",
    ],
    soundProfile: {
      id: "funk_groove",
      preset: "funk_classic_pocket",
      recipeVersion: 7,
      parameters: { pocket: 0.78, ghostNotes: 0.42 },
      futureRecipeField: { preserve: true },
    },
    unknownFutureField: { keep: "exactly" },
    sections: {
      A: {
        bars: 1,
        unknownSectionField: { keep: 17 },
        tracks: {
          bass: {
            unknownTrackField: "bass-kept",
            events: [
              {
                step: 0,
                duration: 1,
                note: 0,
                velocity: 112,
                articulation: "slap",
                sound: "funk_slap_pop",
                role: "anchor",
                expression: { pocket: 0.8 },
                technique: { funk: { hand: "thumb" }, future: { keep: true } },
                unknownEventField: { keep: true },
              },
              { tick: 24, duration: 0.5, note: 7, velocity: 76, articulation: "pop" },
            ],
          },
          drums: {
            events: [
              { step: 0, sound: "kick", velocity: 112 },
              { step: 4, sound: "snare", velocity: 105 },
              { step: 6, sound: "ride", velocity: 70 },
            ],
          },
        },
      },
    },
  };
}

function makeWesternProfileFixture() {
  return {
    projectVersion: 17,
    title: "Western Trail Handoff",
    audioProfile: "western_frontier",
    soundProfile: {
      id: "western_frontier",
      preset: "western_trail",
      recipeVersion: 1,
      parameters: { swing: 0.05 },
    },
    sections: { A: { bars: 1, tracks: { guitar: { events: [{ step: 0, note: 36, articulation: "open", sound: "western_twang" }] } } } },
  };
}

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

async function decodePocketChordsmithShareCode(page, code) {
  return page.evaluate((shareCode) => {
    const payload = shareCode.replace(/^PCS1:/, "");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  }, code);
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
  await expect(audioCoreCard).toContainText("0.2.0");
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

test("loads the Heavy Metal demo with metal deck metadata", async ({ page }) => {
  await page.locator("#metalDemoBtn").click();

  await expect(page.locator("#statusText")).toContainText(
    "Heavy Metal DJ Demo loaded",
  );
  await expect(page.locator("#deckName")).toContainText(
    "Heavy Metal DJ Demo",
  );
  await expect(page.locator(".meta-card", { hasText: "Profile" })).toContainText(
    "Classic Chug",
  );

  const saved = await readSavedDjSession(page);
  expect(saved.deck).toMatchObject({
    audioProfile: "heavy_metal",
    metalPreset: "metal_classic_chug",
    drumKit: "metal_tight",
    bassTone: "metal_pick_bass",
    chordInstrument: "metal_power_stack",
    guitarTone: "tight_metal",
  });
  expect(saved.deck.metalTexture).toMatchObject({
    enabled: true,
    palmMute: expect.any(Number),
    lowTightness: expect.any(Number),
  });
});

test("imports Heavy Metal Chordsmith JSON and preserves it for source handoff", async ({
  page,
}) => {
  await page.locator("#importText").fill(JSON.stringify(makeMetalFixture()));
  await page.locator("#importBtn").click();

  await expect(page.locator("#statusText")).toContainText(
    "Pocket Chordsmith project imported",
  );
  await expect(page.locator("#deckName")).toContainText(
    "Metal Chug Import Test",
  );
  await expect(page.locator(".meta-card", { hasText: "Profile" })).toContainText(
    "Classic Chug",
  );

  const saved = await readSavedDjSession(page);
  expect(saved.deck.audioProfile).toBe("heavy_metal");
  expect(saved.deck.metalPreset).toBe("metal_classic_chug");
  expect(saved.deck.metalTexture.enabled).toBe(true);
  expect(saved.source.project).toMatchObject({
    audioProfile: "heavy_metal",
    metalPreset: "metal_classic_chug",
    drumKit: "metal_tight",
    bassTone: "metal_pick_bass",
    chordInstrument: "metal_power_stack",
    guitarTone: "tight_metal",
  });

  await page.locator("#editSourceBtn").click();
  await expect(page.locator("#handoffBox")).toBeVisible();
  const handoffProject = await decodePocketChordsmithShareCode(
    page,
    await page.locator("#handoffText").inputValue(),
  );
  expect(handoffProject).toMatchObject({
    audioProfile: "heavy_metal",
    metalPreset: "metal_classic_chug",
    drumKit: "metal_tight",
    bassTone: "metal_pick_bass",
  });
  expect(handoffProject.metalTexture.enabled).toBe(true);
});

test("imports schema-17 Funk, preserves rich unknown data through save and handoff, and reports playback loss", async ({ page }) => {
  const fixture = makeRichFunkFixture();
  await page.locator("#importText").fill(JSON.stringify(fixture));
  await page.locator("#importBtn").click();

  await expect(page.locator("#statusText")).toContainText("Pocket Chordsmith project imported");
  await expect(page.locator("#deckName")).toContainText("Rich Funk Pocket");
  await expect(page.locator(".meta-card", { hasText: "Profile" })).toContainText("Classic Pocket");

  const saved = await readSavedDjSession(page);
  expect(saved.schemaVersion).toBe(17);
  expect(saved.deck).toMatchObject({
    audioProfile: "funk_groove",
    soundProfile: { id: "funk_groove", preset: "funk_classic_pocket", recipeVersion: 7 },
  });
  expect(saved.source.originalProject).toEqual(fixture);
  expect(saved.source.project.sections.A.tracks.bass.events[0]).toMatchObject({
    expression: { pocket: 0.8 },
    technique: { funk: { hand: "thumb" }, future: { keep: true } },
    unknownEventField: { keep: true },
  });
  expect(saved.compatibility.requestedFeatures).toContain("future-expression-v1");
  expect(saved.compatibility.lossReport).toEqual(expect.arrayContaining([
    expect.objectContaining({ feature: "drum-lane:ride", action: "approximated" }),
    expect.objectContaining({ feature: "technique:future", action: "preserved" }),
  ]));

  await page.locator("#editSourceBtn").click();
  const handoffProject = await decodePocketChordsmithShareCode(page, await page.locator("#handoffText").inputValue());
  expect(handoffProject).toEqual(fixture);
});

test("supports Western and Funk profile negotiation plus non-composition Funk performance macros", async ({ page }) => {
  const capability = await page.evaluate(() => window.negotiatePocketDjCapabilities({
    features: ["rich-events-v1", "future-feature-v1"],
    articulations: ["slap", "future-articulation"],
  }));
  expect(capability.schemaVersions).toEqual([16, 17]);
  expect(capability.unsupportedFeatures).toEqual(["future-feature-v1"]);
  expect(capability.unsupportedArticulations).toEqual(["future-articulation"]);

  await page.locator("#importText").fill(JSON.stringify(makeWesternProfileFixture()));
  await page.locator("#importBtn").click();
  let saved = await readSavedDjSession(page);
  expect(saved.deck.soundProfile).toMatchObject({ id: "western_frontier", preset: "western_trail" });

  const fixture = makeRichFunkFixture();
  await page.reload();
  await expect(page.locator("#importText")).toBeVisible();
  await page.locator("#importText").fill(JSON.stringify(fixture));
  await page.locator("#importBtn").click();
  await page.locator("#funkOneDropBtn").click();
  await page.locator("#funkBassMuteBtn").click();
  await page.locator("#funkSlapPopBtn").click();
  await page.locator("#funkGhostLiftBtn").click();
  await page.locator("#funkPhraseFillBtn").click();
  saved = await readSavedDjSession(page);
  expect(saved.performance.funkMacros).toEqual({
    oneDrop: true,
    bassMute: true,
    slapPopEmphasis: true,
    ghostLift: true,
    phraseFill: true,
  });
  expect(saved.source.originalProject).toEqual(fixture);
});

test("metal and chip recipe parameters change the DJ playback recipe", async ({ page }) => {
  const recipes = await page.evaluate(() => ({
    metalQuiet: window.pocketDjPlaybackRecipeProbe("heavy_metal", { drive: 0.1, palmMute: 0.1, presence: 0.1, pickAttack: 0.1 }),
    metalHot: window.pocketDjPlaybackRecipeProbe("heavy_metal", { drive: 0.9, palmMute: 0.9, presence: 0.9, pickAttack: 0.9 }),
    chipSoft: window.pocketDjPlaybackRecipeProbe("chip_arcade", { pitchDrift: 0.01, saturation: 0.01, sampleRateCrush: 0.01 }),
    chipHard: window.pocketDjPlaybackRecipeProbe("chip_arcade", { pitchDrift: 0.9, saturation: 0.9, sampleRateCrush: 0.9 }),
  }));
  expect(recipes.metalHot.drive).toBeGreaterThan(recipes.metalQuiet.drive);
  expect(recipes.metalHot.palmMuteLength).toBeLessThan(recipes.metalQuiet.palmMuteLength);
  expect(recipes.metalHot.presenceGain).toBeGreaterThan(recipes.metalQuiet.presenceGain);
  expect(recipes.chipHard.driftCents).toBeGreaterThan(recipes.chipSoft.driftCents);
  expect(recipes.chipHard.crushFilterMul).toBeGreaterThan(recipes.chipSoft.crushFilterMul);
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
