import { expect, test } from "@playwright/test";

const FIXTURE_CASES = [
  {
    path: "/apps/chordsmith-web/demos/lofi_study_room_loop.json",
    title: "Study Room Loop",
    audioProfile: "lofi_chill",
    presetField: "lofiPreset",
    preset: "lofi_study_room",
  },
  {
    path: "/apps/chordsmith-web/demos/chip_arcade_start_loop.json",
    title: "Arcade Start Glow Loop",
    audioProfile: "chip_arcade",
    presetField: "chipPreset",
    preset: "chip_arcade_start",
  },
];

const CORE_WAV_AB_FIXTURE =
  "/packages/pocket-audio-core/tests/fixtures/manual-bass.pcs.json";

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

async function fetchJsonFixture(page, fixturePath) {
  const response = await page.request.get(fixturePath);
  expect(response.ok(), `fixture exists: ${fixturePath}`).toBe(true);
  return response.json();
}

async function importFixtureThroughSettings(page, fixturePath) {
  const fixture = await fetchJsonFixture(page, fixturePath);
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator("#projectBox").fill(JSON.stringify(fixture));
  await page.locator("#importJsonBtn").click();
  await expect(page.locator("#statusText")).toContainText("Project imported");
  return fixture;
}

function vlq(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function asciiBytes(text) {
  return Array.from(text).map((char) => char.charCodeAt(0));
}

function buildMidi(events, { ppq = 480, format = 0 } = {}) {
  const sorted = events.slice().sort((a, b) => a.tick - b.tick);
  const track = [];
  let lastTick = 0;
  for (const event of sorted) {
    track.push(...vlq(event.tick - lastTick), ...event.bytes);
    lastTick = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const header = [
    ...asciiBytes("MThd"),
    0x00,
    0x00,
    0x00,
    0x06,
    0x00,
    format,
    0x00,
    0x01,
    (ppq >> 8) & 0xff,
    ppq & 0xff,
  ];
  return new Uint8Array([
    ...header,
    ...asciiBytes("MTrk"),
    (track.length >> 24) & 0xff,
    (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff,
    track.length & 0xff,
    ...track,
  ]);
}

function noteEvents(tick, channel, note, velocity, duration = 120) {
  return [
    { tick, bytes: [0x90 | channel, note, velocity] },
    { tick: tick + duration, bytes: [0x80 | channel, note, 0] },
  ];
}

test("loads the main app controls", async ({ page }) => {
  await expect(page).toHaveURL(/pocket_chordsmith_v68_core_bridge\.html/);
  await expect(
    page.getByRole("heading", { name: "Pocket Chordsmith" }),
  ).toBeVisible();
  await expect(page.getByText("Pocket Audio Core bridge build")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator("#progressionSlots .slot")).toHaveCount(4);
});

test("sequencer exposes names and state with one roving keyboard stop", async ({ page }) => {
  const cells = page.locator("#seqRows .cell[data-step]");
  await expect(cells.first()).toHaveAttribute("aria-label", "Kick, step 1, on");
  await expect(cells.first()).toHaveAttribute("aria-pressed", "true");
  await expect(cells.first()).toHaveRole("button");
  await expect(page.getByRole("gridcell", { name: "Kick, step 1, on" })).toHaveCount(0);
  await expect(cells.filter({ has: page.locator('[tabindex="0"]') })).toHaveCount(0);
  await expect(page.locator('#seqRows .cell[data-step][tabindex="0"]')).toHaveCount(1);

  await cells.first().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(cells.nth(4)).toBeFocused();
  await expect(cells.nth(4)).toHaveAttribute("aria-label", "Kick, step 5, off");
  await page.keyboard.press("Space");
  await expect(page.locator('#seqRows .cell[aria-label="Kick, step 5, on"]')).toBeFocused();
  await expect(page.locator('#seqRows .cell[aria-label="Kick, step 5, on"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('#seqRows .cell[aria-label^="Snare, step 5,"]')).toBeFocused();

  const laneLabelHeight = await page.locator("#seqRows button.track-name").first().evaluate((node) => node.getBoundingClientRect().height);
  expect(laneLabelHeight).toBeGreaterThanOrEqual(24);
});

test("advanced beat and bass gestures have keyboard equivalents", async ({ page }) => {
  const firstKick = page.locator('#seqRows .cell[aria-label^="Kick, step 1,"]');
  await firstKick.focus();
  await page.keyboard.press("t");
  await expect(page.locator('#seqRows .cell[aria-label="Kick, step 1, on, triplet start"]')).toBeFocused();

  await page.evaluate(() => {
    state.uiMode = "advanced";
    state.bassMode = "manual";
    state.bassNotes.fill(null);
    state.bassAccent.fill(false);
    state.bassNotes[0] = 0;
    renderSeq();
  });
  const bassStart = page.locator('#seqRows .cell[aria-label^="Bass, step 1,"]');
  await bassStart.focus();
  await page.keyboard.press("h");
  await expect(page.locator('#seqRows .cell[aria-label="Bass, step 2, hold"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("a");
  await expect(page.locator('#seqRows .cell[aria-label*="Bass, step 1,"][aria-label*="accent"]')).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.locator('#seqRows .cell[aria-label="Bass, step 1, off"]')).toBeFocused();
});

test("melody and guitar advanced gestures expose keyboard commands and state", async ({ page }) => {
  await page.locator("#uiModeSelect").selectOption("advanced");
  await page.evaluate(() => {
    state.melodyTracks[0].fill(null);
    state.melodyTracks[0][0] = 0;
    state.melodyTracks[0][1] = 1;
    state.melodyTuplets[0].fill(false);
    state.guitarPattern.fill("off");
    renderMelodyRows();
    renderGuitarPanel();
  });
  const melodyStart = page.locator('#melodyRows .cell[aria-label^="Melody track 1, step 1,"]');
  await melodyStart.focus();
  await page.keyboard.press("t");
  await expect(page.locator('#melodyRows .cell[aria-label*="step 1"][aria-label*="triplet start"]')).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.locator('#melodyRows .cell[aria-label="Melody track 1, step 1, off"]')).toBeFocused();

  const guitarStart = page.locator('#guitarRow .cell[aria-label="Guitar, step 1, off"]');
  await guitarStart.focus();
  await page.keyboard.press("3");
  await expect(page.locator('#guitarRow .cell[aria-label="Guitar, step 1, accent"]')).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.locator('#guitarRow .cell[aria-label="Guitar, step 1, off"]')).toBeFocused();
});

test("genre tabs follow the keyboard tab pattern", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator("#genreDrawerBtn").click();
  await expect(page.locator("#genreTabClean")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#genreTabLofi")).toBeFocused();
  await expect(page.locator("#genreTabLofi")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#genrePanelLofi")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.locator("#genreTabFunk")).toBeFocused();
});

test("X-Y melody pad exposes state and supports complete keyboard operation", async ({ page }) => {
  await page.locator("#uiModeSelect").selectOption("advanced");
  await page.locator("#melodyInputModeSelect").selectOption("xy");

  const pad = page.locator("#xyPad");
  await expect(pad).toBeVisible();
  await expect(pad).toHaveAttribute("role", "slider");
  await expect(pad).toHaveAttribute("tabindex", "0");
  await expect(pad).toHaveAttribute("aria-describedby", "xyPadInstructions");
  await expect(page.locator("#xyPadInstructions")).toContainText("Left and Right Arrow");

  await pad.focus();
  await page.keyboard.press("Home");
  await expect(pad).toHaveAttribute("aria-valuenow", "1");
  await expect(pad).toHaveAttribute("aria-valuetext", /Sustain/);
  await expect(pad).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(pad).toHaveAttribute("aria-valuenow", "2");
  const beforeY = await pad.getAttribute("aria-valuetext");
  await page.keyboard.press("ArrowUp");
  await expect(pad).not.toHaveAttribute("aria-valuetext", beforeY);
  await expect(page.locator("#statusText")).toContainText("X-Y pad:");
  await expect(pad).toBeFocused();

  await page.keyboard.press("End");
  await expect(pad).toHaveAttribute("aria-valuenow", "14");
  await page.keyboard.press("Escape");
  await expect(page.locator("#statusText")).toContainText("X-Y pad stopped");
  await expect(pad).toBeFocused();
});

test("core form controls and live feedback have accessible semantics", async ({ page }) => {
  await expect(page.getByRole("main", { name: "Pocket Chordsmith composer" })).toBeVisible();
  await expect(page.getByLabel("Key", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Scale", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Time signature", { exact: true })).toBeVisible();
  await expect(page.locator("#statusText")).toHaveAttribute("role", "status");
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.getByLabel("Theme")).toBeVisible();
  await expect(page.getByLabel("Project JSON or share code")).toBeVisible();
  const unnamedFormControls = await page.locator('select, textarea, input:not([type="hidden"])').evaluateAll((controls) =>
    controls
      .filter((control) => !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby") && !(control.labels && control.labels.length))
      .map((control) => control.id || control.outerHTML.slice(0, 80)),
  );
  expect(unnamedFormControls).toEqual([]);
});

test("critical import errors and exports announce without moving focus", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator("#projectBox").fill("not valid project JSON");

  const importButton = page.locator("#importJsonBtn");
  await importButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#statusText")).toContainText(/Unexpected|Invalid|Could not|valid/i);
  await expect(page.locator("#projectBox")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#projectBox")).toHaveAttribute("aria-describedby", /projectBoxError/);
  await expect(page.locator("#projectBoxError")).toBeVisible();
  await expect(importButton).toBeFocused();

  await page.locator("#projectBox").pressSequentially(" ");
  await expect(page.locator("#projectBox")).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator("#projectBoxError")).toBeHidden();

  const exportButton = page.locator("#exportJsonBtn");
  await exportButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#statusText")).toContainText("Compact project JSON exported");
  await expect(page.locator("#projectBox")).toHaveAttribute("aria-invalid", "false");
  await expect(exportButton).toBeFocused();

  await importButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#statusText")).toContainText("Project imported");
  await expect(page.locator("#projectBox")).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator("#projectBoxError")).toBeHidden();
  await expect(importButton).toBeFocused();
});

test("settings modal makes background inert and restores it for every close path", async ({ page }) => {
  const background = page.locator(".app");
  const miniTransport = page.locator(".mini-transport");
  const settingsButton = page.locator("#settingsBtn");

  await settingsButton.click();
  await expect.poll(() => background.evaluate((node) => node.inert)).toBe(true);
  await expect.poll(() => miniTransport.evaluate((node) => node.closest("[inert]") !== null)).toBe(true);
  await page.locator("#closeSettingsBtn").click();
  await expect.poll(() => background.evaluate((node) => node.inert)).toBe(false);
  await expect.poll(() => miniTransport.evaluate((node) => node.closest("[inert]") !== null)).toBe(false);
  await expect(settingsButton).toBeFocused();

  const miniSettings = page.locator("#miniSettingsBtn");
  await miniSettings.click();
  await expect.poll(() => background.evaluate((node) => node.inert)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(() => background.evaluate((node) => node.inert)).toBe(false);
  await expect(miniSettings).toBeFocused();

  await settingsButton.click();
  await expect.poll(() => background.evaluate((node) => node.inert)).toBe(true);
  await page.locator("#settingsModal").click({ position: { x: 2, y: 2 } });
  await expect.poll(() => background.evaluate((node) => node.inert)).toBe(false);
  await expect.poll(() => miniTransport.evaluate((node) => node.closest("[inert]") !== null)).toBe(false);
  await expect(settingsButton).toBeFocused();
});

test("composer reflows at a 320 CSS pixel viewport without page-level horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator("#uiModeSelect").selectOption("advanced");

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const app = document.querySelector(".app");
    const sequencers = Array.from(document.querySelectorAll(".sequencer-wrap"));
    const escapedControls = Array.from(document.querySelectorAll("button, input, select, textarea"))
      .filter((element) => element.getClientRects().length && !element.closest(".sequencer-wrap"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.id, left: rect.left, right: rect.right };
      })
      .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1);
    return {
      viewport: window.innerWidth,
      rootScrollWidth: root.scrollWidth,
      appRight: app?.getBoundingClientRect().right,
      escapedControls,
      internallyScrollableSequencers: sequencers.filter((element) => element.scrollWidth > element.clientWidth + 1).length,
    };
  });

  expect(layout.viewport).toBe(320);
  expect(layout.rootScrollWidth).toBeLessThanOrEqual(321);
  expect(layout.appRight).toBeLessThanOrEqual(321);
  expect(layout.escapedControls).toEqual([]);
  expect(layout.internallyScrollableSequencers).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Settings" }).first().click();
  const modalBounds = await page.locator("#settingsModal .modal-window").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: window.innerWidth };
  });
  expect(modalBounds.left).toBeGreaterThanOrEqual(-1);
  expect(modalBounds.right).toBeLessThanOrEqual(modalBounds.viewport + 1);
});

test("reduced motion removes meaningful transition and animation timing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const motion = await page.evaluate(() => {
    const element = document.createElement("button");
    element.className = "drum-pad";
    document.body.appendChild(element);
    const style = getComputedStyle(element);
    const before = getComputedStyle(element, "::before");
    const result = {
      transition: style.transitionDuration,
      animation: style.animationDuration,
      beforeTransition: before.transitionDuration,
    };
    element.remove();
    return result;
  });
  expect(parseFloat(motion.transition)).toBeLessThanOrEqual(0.00001);
  expect(parseFloat(motion.animation)).toBeLessThanOrEqual(0.00001);
  expect(parseFloat(motion.beforeTransition)).toBeLessThanOrEqual(0.00001);
});

test("forced colors retains a strong visible keyboard focus indicator", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await expect.poll(() => page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await page.locator("#playBtn").focus();
  const focus = await page.locator("#playBtn").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      outlineOffset: parseFloat(style.outlineOffset),
    };
  });
  expect(focus.focusVisible).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(3);
  expect(focus.outlineOffset).toBeGreaterThanOrEqual(2);
});

test("demo button loads the bundled starter song", async ({ page }) => {
  await page.getByRole("button", { name: "Demo" }).click();
  await expect(page.locator("#statusText")).toContainText(
    "Loaded Pocket Chordsmith v68 demo",
  );
  await expect(page.locator("#progressionSlots .slot").first()).toContainText(
    /C|Am|F|G/,
  );
});

test("settings modal opens import and handoff tools", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.locator("#settingsModal")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Export Compact JSON" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to DJ" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send to Pocket DAW" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Push to Godot" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mobile transfer" }),
  ).toBeVisible();
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "same-device/localhost",
  );
  await expect(page.locator("#pocketAudioCoreStatus")).toContainText(
    "Pocket Audio Core",
  );
  await expect(page.locator("#genreDrawerBtn")).toBeVisible();
  await expect(page.locator("#lofiPresetSelect")).toBeHidden();
  await expect(page.locator("#chipPresetSelect")).toBeHidden();
});

test("settings genre drawer switches genre panels and keeps simple controls light", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator("#genreDrawerBtn").click();
  await expect(page.locator("#genreDrawer")).toHaveAttribute(
    "aria-hidden",
    "false",
  );

  await page.locator("#genreTabLofi").click();
  await expect(page.locator("#genrePanelLofi")).toBeVisible();
  await expect(page.locator("#lofiPresetSelect")).toBeVisible();
  await expect(page.locator("#drumKitSelect")).toBeHidden();

  await page.locator("#uiModeSelect").selectOption("advanced");
  await expect(page.locator("#drumKitSelect")).toBeVisible();

  await page.locator("#genreTabChip").click();
  await expect(page.locator("#genrePanelChip")).toBeVisible();
  await expect(page.locator("#chipPresetSelect")).toBeVisible();
  await expect(page.locator("#lofiPresetSelect")).toBeHidden();

  await page.locator("#genreTabWestern").click();
  await expect(page.locator("#genrePanelWestern")).toBeVisible();
  await page.locator("#westernPresetSelect").selectOption("western_train_chase");

  const result = await page.evaluate(() => {
    const exported = exportProject();
    importProject(exported);
    return {
      projectVersion: exported.projectVersion,
      chordInstrument: exported.chordInstrument,
      guitarTone: exported.guitarTone,
      guitarEnabled: exported.guitarEnabled,
      songSequence: exported.songSequence,
      melodyInstrumentsA: exported.melodyInstrumentsA,
      roundTripChordInstrument: state.chordInstrument,
      roundTripGuitarTone: state.guitarTone,
    };
  });

  expect(result.projectVersion).toBe(17);
  expect(result.chordInstrument).toBe("saloon_piano");
  expect(result.guitarTone).toBe("western_twang");
  expect(result.guitarEnabled).toBe(true);
  expect(result.songSequence[0]).toBe("A");
  expect(result.melodyInstrumentsA).toContain("banjo");
  expect(result.roundTripChordInstrument).toBe("saloon_piano");
  expect(result.roundTripGuitarTone).toBe("western_twang");
});

test("MIDI import trims one-bar pre-roll, auto-selects resolution, maps drums, and ignores guide notes", async ({
  page,
}) => {
  const midi = buildMidi([
    { tick: 0, bytes: [0xff, 0x51, 0x03, 0x08, 0xcd, 0x9b] },
    { tick: 0, bytes: [0xff, 0x03, 0x08, ...asciiBytes("KATARINA")] },
    { tick: 0, bytes: [0xc0, 0x00] },
    { tick: 0, bytes: [0xb0, 0x0a, 0x20] },
    { tick: 0, bytes: [0xe0, 0x00, 0x40] },
    { tick: 0, bytes: [0xff, 0x05, 0x02, ...asciiBytes("la")] },
    ...noteEvents(1920, 9, 36, 105, 60),
    ...noteEvents(1920, 9, 51, 96, 60),
    ...noteEvents(2040, 9, 54, 72, 60),
    ...noteEvents(2160, 9, 49, 112, 60),
    ...noteEvents(2000, 15, 76, 1, 120),
    ...noteEvents(3840, 0, 60, 86, 960),
    ...noteEvents(3840, 0, 64, 82, 960),
    ...noteEvents(3840, 0, 67, 80, 960),
  ]);

  const result = await page.evaluate((bytes) => {
    state.uiMode = "advanced";
    state.resolution = 1;
    state.lastAdvancedResolution = 1;
    if (els.uiModeSelect) els.uiModeSelect.value = "advanced";
    if (els.resolutionSelect) els.resolutionSelect.value = "1";
    const input = new Uint8Array(bytes);
    const parsed = parseStandardMidi(input.buffer);
    const timing = detectMidiImportTiming(parsed, state);
    importParsedMidiToProject(parsed, "synthetic-pre-roll.mid");
    return {
      timing,
      resolution: state.resolution,
      sectionBarsA: state.sectionBars.A,
      kick0: state.gridA.kick[0],
      hat0: state.gridA.hat[0],
      hat1: state.gridA.hat[1],
      hat2: state.gridA.hat[2],
      firstMelodyTrack: state.melodyTracksA[0].slice(0, 16),
      summary: els.midiImportSummary.textContent,
      progressionNames: state.progressionA.map((ch) => ch && ch.name),
      exportedProgressionA: exportProject().progressionA,
    };
  }, Array.from(midi));

  expect(result.timing.sourceStartTick).toBe(1920);
  expect(result.timing.leadingTrimBars).toBe(1);
  expect(result.resolution).toBe(4);
  expect(result.sectionBarsA).toBe(2);
  expect(result.kick0).toBe(1);
  expect(result.hat0).toBe(2);
  expect(result.hat1).toBe(1);
  expect(result.hat2).toBe(2);
  expect(result.firstMelodyTrack.every((note) => note === null)).toBe(true);
  expect(result.summary).toContain("Trimmed 1 pre-roll bar");
  expect(result.summary).toContain("Resolution auto-set to 4×");
  expect(result.summary).toContain("Time signature: not found in MIDI; using 4/4");
  expect(result.summary).toContain("Approx source bars after trim: 2");
  expect(result.summary).toContain("Source note pairs analysed: 8");
  expect(result.summary).toContain("Drum MIDI hits mapped: 4");
  expect(result.summary).toContain("Drum MIDI hits skipped: 0");
  expect(result.summary).toContain("Drum grid cells written: 4");
  expect(result.summary).toContain("Drum hits merged by same lane/step: 0");
  expect(result.summary).toContain("Ignored 1 guide/near-silent notes");
  expect(result.summary).toContain("lyrics 1");
  expect(result.summary).toContain("program changes 1");
  expect(result.summary).toContain("pitch bends 1 ignored");
  expect(result.summary).toContain("CCs 1");
  expect(result.summary).toContain("chord bars detected 1");
  expect(result.summary).toContain("chord bars blank due no harmonic material 1");
  expect(result.progressionNames[0]).toBeNull();
  expect(result.exportedProgressionA[0]).toBeNull();
});

test("MIDI timing normalization does not trim pickups or old tick-zero files", async ({
  page,
}) => {
  const pickupMidi = buildMidi([
    { tick: 0, bytes: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] },
    ...noteEvents(960, 0, 64, 84, 120),
    ...noteEvents(1920, 9, 36, 96, 60),
  ]);
  const simpleMidi = buildMidi([
    { tick: 0, bytes: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] },
    ...noteEvents(0, 0, 60, 84, 240),
    ...noteEvents(480, 9, 38, 96, 60),
  ]);

  const result = await page.evaluate(
    ({ pickupBytes, simpleBytes }) => {
      state.uiMode = "advanced";
      state.timeSig = 4;
      const pickupParsed = parseStandardMidi(
        new Uint8Array(pickupBytes).buffer,
      );
      const simpleParsed = parseStandardMidi(
        new Uint8Array(simpleBytes).buffer,
      );
      return {
        pickup: detectMidiImportTiming(pickupParsed, state),
        simple: detectMidiImportTiming(simpleParsed, state),
      };
    },
    { pickupBytes: Array.from(pickupMidi), simpleBytes: Array.from(simpleMidi) },
  );

  expect(result.pickup.sourceStartTick).toBe(0);
  expect(result.pickup.leadingTrimBars).toBe(0);
  expect(result.simple.sourceStartTick).toBe(0);
  expect(result.simple.leadingTrimBars).toBe(0);
});

test("MIDI import remains gated to Advanced mode", async ({ page }) => {
  const midi = buildMidi([...noteEvents(0, 0, 60, 90, 240)]);

  const result = await page.evaluate((bytes) => {
    state.uiMode = "simple";
    if (els.uiModeSelect) els.uiModeSelect.value = "simple";
    const parsed = parseStandardMidi(new Uint8Array(bytes).buffer);
    importParsedMidiToProject(parsed, "simple-mode.mid");
    return {
      summary: els.midiImportSummary.textContent,
      status: els.statusText.textContent,
    };
  }, Array.from(midi));

  expect(result.summary).toContain("Advanced mode only");
  expect(result.status).toContain("Switch to Advanced mode");
});

test("settings export scope exposes A-H and maps to matching core scopes", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.locator("#settingsModal")).toHaveAttribute(
    "aria-hidden",
    "false",
  );

  const options = await page
    .locator("#exportScopeSelect option")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        value: node.value,
        label: node.textContent?.trim(),
      })),
    );
  expect(options).toEqual([
    { value: "A", label: "Export Section A" },
    { value: "B", label: "Export Section B" },
    { value: "C", label: "Export Section C" },
    { value: "D", label: "Export Section D" },
    { value: "E", label: "Export Section E" },
    { value: "F", label: "Export Section F" },
    { value: "G", label: "Export Section G" },
    { value: "H", label: "Export Section H" },
    { value: "ALL", label: "Export All Sections" },
    { value: "SEQUENCE", label: "Export Song Sequence" },
  ]);

  await page.locator("#exportScopeSelect").selectOption("E");
  await expect
    .poll(() =>
      page.evaluate(() =>
        coreTimelineOptionsForExportScope(getSelectedExportScope()),
      ),
    )
    .toEqual({ scope: "section", sectionId: "E" });

  await page.locator("#exportScopeSelect").selectOption("ALL");
  await expect
    .poll(() =>
      page.evaluate(() =>
        coreTimelineOptionsForExportScope(getSelectedExportScope()),
      ),
    )
    .toEqual({ scope: "all" });

  await page.locator("#exportScopeSelect").selectOption("SEQUENCE");
  await expect
    .poll(() =>
      page.evaluate(() =>
        coreTimelineOptionsForExportScope(getSelectedExportScope()),
      ),
    )
    .toEqual({ scope: "sequence" });
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
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to DJ" }).click();

  await expect(
    page.getByRole("button", { name: "Play", exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator("#statusText")).toContainText(
    "Song sent to Pocket DJ",
  );
  await expect
    .poll(() => page.evaluate(() => window.__pocketChordsmithOpenedUrls.length))
    .toBeGreaterThan(0);
});

test("DJ handoff distinguishes blocked popup and blocked clipboard fallback", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.open = () => null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard blocked");
        },
      },
    });
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to DJ" }).click();

  await expect(page.locator("#statusText")).toContainText(
    "Pocket DJ pop-up and clipboard were blocked",
  );
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "Copy the PCS1 code from the project box",
  );
  await expect(page.locator("#projectBox")).toHaveValue(/^PCS1:/);
});

test("Pocket DAW handoff targets the installed app protocol", async ({
  page,
}) => {
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
      return {
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => "ok",
      };
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
  const protocolLaunches = await page.evaluate(
    () => window.__pocketChordsmithProtocolLaunches,
  );
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
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "Pocket DAW received the song",
  );
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
      return {
        ok: false,
        json: async () => ({ ok: false }),
        text: async () => "offline",
      };
    };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("pocket-daw://")) {
        window.__pocketChordsmithProtocolLaunches.push(this.href);
        return;
      }
      if (this.download) {
        window.__pocketChordsmithDownloads.push({
          fileName: this.download,
          href: this.href,
        });
        return;
      }
      return originalClick.call(this);
    };
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to Pocket DAW" }).click();

  const fetches = await page.evaluate(() => window.__pocketChordsmithFetches);
  const protocolLaunches = await page.evaluate(
    () => window.__pocketChordsmithProtocolLaunches,
  );
  const downloads = await page.evaluate(
    () => window.__pocketChordsmithDownloads,
  );
  expect(fetches.length).toBe(1);
  expect(downloads).toHaveLength(1);
  expect(downloads[0].fileName).toMatch(
    /^pocket-chordsmith-to-pocket-daw-.+\.pcs1\.txt$/,
  );
  expect(protocolLaunches).toHaveLength(1);
  expect(protocolLaunches[0]).toContain(
    "pocket-daw://handoff?source=download&file=",
  );
  expect(protocolLaunches[0]).not.toContain("pocketHandoff=");
  expect(decodeURIComponent(protocolLaunches[0])).toContain(
    downloads[0].fileName,
  );
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "downloaded handoff file",
  );
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
        window.__pocketChordsmithDownloads.push({
          fileName: this.download,
          href: this.href,
        });
        return;
      }
      return originalClick.call(this);
    };
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to Pocket DAW" }).click();

  await expect
    .poll(
      () =>
        page.evaluate(() => window.__pocketChordsmithProtocolLaunches.length),
      { timeout: 8000 },
    )
    .toBe(1);

  const fetches = await page.evaluate(() => window.__pocketChordsmithFetches);
  const protocolLaunches = await page.evaluate(
    () => window.__pocketChordsmithProtocolLaunches,
  );
  const downloads = await page.evaluate(
    () => window.__pocketChordsmithDownloads,
  );
  expect(fetches.length).toBe(1);
  expect(protocolLaunches[0]).toContain("source=download");
  expect(downloads).toHaveLength(1);
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "should import the downloaded handoff file",
  );
});

test("Pocket DAW handoff distinguishes blocked protocol, clipboard, and downloaded fallback", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pocketChordsmithDownloads = [];
    window.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard blocked");
        },
      },
    });
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("pocket-daw://")) {
        throw new Error("protocol blocked");
      }
      if (this.download) {
        window.__pocketChordsmithDownloads.push({
          fileName: this.download,
          href: this.href,
        });
        return;
      }
      return originalClick.call(this);
    };
  });

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Send to Pocket DAW" }).click();

  const downloads = await page.evaluate(
    () => window.__pocketChordsmithDownloads,
  );
  expect(downloads.length).toBeGreaterThanOrEqual(1);
  await expect(page.locator("#statusText")).toContainText(
    "Pocket DAW song code is ready in the project box; clipboard was blocked",
  );
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "Pocket DAW did not open and clipboard was blocked",
  );
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "PCS1 handoff file was downloaded",
  );
  await expect(page.locator("#projectBox")).toHaveValue(/^PCS1:/);
});

for (const fixtureCase of FIXTURE_CASES) {
  test(`imports and exports ${fixtureCase.title} fixture JSON`, async ({
    page,
  }) => {
    const fixture = await importFixtureThroughSettings(page, fixtureCase.path);

    await page.locator("#exportJsonBtn").click();
    await expect(page.locator("#statusText")).toContainText(
      "Compact project JSON exported",
    );

    const exported = JSON.parse(await page.locator("#projectBox").inputValue());
    expect(exported.projectVersion).toBe(17);
    expect(exported.audioProfile).toBe(fixtureCase.audioProfile);
    expect(exported[fixtureCase.presetField]).toBe(fixtureCase.preset);
    expect(exported.key).toBe(fixture.key);
    expect(exported.bpm).toBe(fixture.bpm);
    expect(exported.songSequence).toEqual(fixture.songSequence);
  });
}

test("exports a fixture WAV through Chordsmith using the same Core WAV plumbing as direct Core output", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await importFixtureThroughSettings(page, CORE_WAV_AB_FIXTURE);
  await page.locator("#exportScopeSelect").selectOption("SEQUENCE");

  await page.locator("#exportWavBtn").click();
  await expect(page.locator("#wavProgressText")).toContainText(
    "WAV ready via Pocket Audio Core",
    { timeout: 30_000 },
  );
  await expect(page.locator("#statusText")).toContainText(
    "WAV ready via Pocket Audio Core",
  );

  const comparison = await page.evaluate(async () => {
    function hashBytes(bytes) {
      let hash = 0x811c9dc5;
      for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    }

    function wavHeader(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const ascii = (offset, length) =>
        Array.from(bytes.slice(offset, offset + length))
          .map((byte) => String.fromCharCode(byte))
          .join("");
      return {
        riff: ascii(0, 4),
        wave: ascii(8, 4),
        channels: view.getUint16(22, true),
        sampleRate: view.getUint32(24, true),
        bitsPerSample: view.getUint16(34, true),
        dataLength: view.getUint32(40, true),
      };
    }

    const exportedBlob = state.wavBlob;
    if (!exportedBlob) throw new Error("Chordsmith did not keep a WAV blob");
    const options = coreTimelineOptionsForExportScope(getSelectedExportScope());
    await loadPocketAudioCoreModule();
    await pocketAudioCore.loadProject(exportProject());
    const directBlob = await pocketAudioCore.renderWav({
      sampleRate: 44100,
      ...options,
    });
    const exportedBytes = new Uint8Array(await exportedBlob.arrayBuffer());
    const directBytes = new Uint8Array(await directBlob.arrayBuffer());
    return {
      exportedSize: exportedBlob.size,
      directSize: directBlob.size,
      exportedHash: hashBytes(exportedBytes),
      directHash: hashBytes(directBytes),
      header: wavHeader(exportedBytes),
      status: pocketAudioCoreStatus,
    };
  });

  expect(comparison.exportedSize).toBeGreaterThan(44);
  expect(comparison.exportedSize).toBe(comparison.directSize);
  expect(comparison.exportedHash).toBe(comparison.directHash);
  expect(comparison.header).toMatchObject({
    riff: "RIFF",
    wave: "WAVE",
    channels: 2,
    sampleRate: 44100,
    bitsPerSample: 16,
  });
  expect(comparison.header.dataLength).toBeGreaterThan(0);
  expect(comparison.status).toContain("WAV render song sequence");
});

test("PCS1 share code round-trips through the settings text box", async ({
  page,
}) => {
  await importFixtureThroughSettings(page, FIXTURE_CASES[0].path);

  await page.locator("#copyShareCodeBtn").click();
  const shareCode = await page.locator("#projectBox").inputValue();
  expect(shareCode).toMatch(/^PCS1:/);

  await page.locator("#importShareCodeBtn").click();
  await expect(page.locator("#statusText")).toContainText("Project imported");

  const roundTrip = await page.evaluate(() => exportProject());
  expect(roundTrip.projectVersion).toBe(17);
  expect(roundTrip.audioProfile).toBe(FIXTURE_CASES[0].audioProfile);
  expect(roundTrip.lofiPreset).toBe(FIXTURE_CASES[0].preset);
});

test("schema 17 Funk projects preserve rich intent, unknown namespaces, and reversible schema 16 compatibility", async ({ page }) => {
  const result = await page.evaluate(() => {
    applyFunkPresetToProject("funk_slap_party", { fullLoop: false });
    const authored = exportProject({ targetSchema: 17 });
    authored.vendorFuture = { keep: ["root", 17] };
    const bassEvent = authored.sections.A.tracks.bass.events.find(
      (event) => event.articulation === "slap",
    );
    bassEvent.unknownEventField = "keep-event";
    bassEvent.technique.vendorFuture = { keep: { nested: true } };

    importProject(authored);
    const roundTrip = exportProject({ targetSchema: 17 });
    const roundTripBass = roundTrip.sections.A.tracks.bass.events.find(
      (event) => event.articulation === "slap",
    );
    const legacy = projectToSchema16(roundTrip);
    importProject(legacy.project);
    const restored = exportProject({ targetSchema: 17 });
    const restoredBass = restored.sections.A.tracks.bass.events.find(
      (event) => event.articulation === "slap",
    );

    return {
      roundTrip,
      roundTripBass,
      legacyVersion: legacy.project.projectVersion,
      legacyCompatibility: legacy.project.compatibility,
      report: legacy.lossReport,
      restored,
      restoredBass,
    };
  });

  expect(result.roundTrip.projectVersion).toBe(17);
  expect(result.roundTrip.soundProfile).toMatchObject({
    id: "funk_groove",
    preset: "funk_slap_party",
    recipeVersion: 1,
  });
  expect(result.roundTrip.formatFeatures).toEqual(
    expect.arrayContaining([
      "sound-profile-v1",
      "rich-events-v1",
      "articulations-v1",
      "expanded-drums-v1",
      "capability-report-v1",
    ]),
  );
  expect(result.roundTrip.vendorFuture).toEqual({ keep: ["root", 17] });
  expect(result.roundTripBass.unknownEventField).toBe("keep-event");
  expect(result.roundTripBass.technique.vendorFuture.keep.nested).toBe(true);
  expect(result.legacyVersion).toBe(16);
  expect(result.report).toMatchObject({
    lossy: true,
    sourceSchemaVersion: 17,
    targetSchemaVersion: 16,
    richSourceRetained: true,
  });
  expect(result.report.losses.length).toBeGreaterThan(0);
  expect(result.legacyCompatibility.richSource.projectVersion).toBe(17);
  expect(result.restored.projectVersion).toBe(17);
  expect(result.restored.soundProfile.id).toBe("funk_groove");
  expect(result.restoredBass.technique.vendorFuture.keep.nested).toBe(true);
});

test("all Metal and Funk profile parameters produce distinct renderer recipes", async ({ page }) => {
  const traces = await page.evaluate(() => {
    const vary = (profile, defaults, keys) =>
      Object.fromEntries(
        keys.map((key) => [
          key,
          {
            low: buildSoundProfileParameterTrace(profile, { ...defaults, [key]: 0 }),
            high: buildSoundProfileParameterTrace(profile, { ...defaults, [key]: 1 }),
          },
        ]),
      );
    return {
      metal: vary("heavy_metal", DEFAULT_METAL_TEXTURE, [
        "drive",
        "palmMute",
        "lowTightness",
        "presence",
        "roomSize",
        "pickAttack",
      ]),
      funk: vary("funk_groove", DEFAULT_FUNK_PARAMETERS, [
        "pocket",
        "ghostNotes",
        "slapAmount",
        "popBrightness",
        "muteDepth",
        "stabTightness",
      ]),
    };
  });

  for (const profile of Object.values(traces)) {
    for (const { low, high } of Object.values(profile)) {
      expect(high).not.toEqual(low);
    }
  }
});

test("Funk is a first-class genre with six presets and the full bass articulation vocabulary", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator("#genreDrawerBtn").click();
  await page.locator("#genreTabFunk").click();

  await expect(page.locator("#genrePanelFunk")).toBeVisible();
  await expect(page.locator("#funkPresetSelect option")).toHaveCount(6);
  const articulations = await page.locator("#bassArticulationSelect option").evaluateAll(
    (options) => options.map((option) => option.value),
  );
  expect(articulations).toEqual([
    "finger",
    "slap",
    "pop",
    "mute",
    "hammer",
    "pull",
    "slide",
    "hold",
  ]);
});

test("Godot direct push sends a schema 17 PCS1 payload to the local receiver", async ({
  page,
}) => {
  await importFixtureThroughSettings(page, FIXTURE_CASES[1].path);
  await page.evaluate(() => {
    window.__pocketChordsmithFetches = [];
    window.fetch = async (url, options = {}) => {
      window.__pocketChordsmithFetches.push({
        url: String(url),
        method: options.method || "GET",
        headers: options.headers || {},
        body: String(options.body || ""),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, event_count: 42 }),
        text: async () => "ok",
      };
    };
  });

  await page.locator("#pushToGodotBtn").click();

  const fetches = await page.evaluate(() => window.__pocketChordsmithFetches);
  expect(fetches).toHaveLength(1);
  expect(fetches[0].url).toBe(
    "http://127.0.0.1:9087/pocket-chordsmith/push-to-godot",
  );
  expect(fetches[0].method).toBe("POST");
  const body = JSON.parse(fetches[0].body);
  expect(body).toMatchObject({
    type: "pocket-chordsmith.push-to-godot",
    format: "PCS1",
    source: "Pocket Chordsmith",
    schema: 17,
  });
  expect(body.code).toMatch(/^PCS1:/);
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "Song pushed to Godot",
  );
});

test("Godot push reports browser loopback permission blocks without claiming fallback success", async ({
  page,
}) => {
  await importFixtureThroughSettings(page, FIXTURE_CASES[1].path);
  await page.evaluate(() => {
    window.__pocketChordsmithFetches = [];
    window.__pocketChordsmithFormSubmits = 0;
    window.__pocketChordsmithDownloads = [];
    const blockedPolicy = {
      allowsFeature: (name) =>
        name !== "loopback-network" && name !== "local-network-access",
    };
    try {
      Object.defineProperty(document, "permissionsPolicy", {
        configurable: true,
        value: blockedPolicy,
      });
    } catch (error) {
      window.__pocketChordsmithPolicyError = String(error);
    }
    try {
      Object.defineProperty(document, "featurePolicy", {
        configurable: true,
        value: blockedPolicy,
      });
    } catch (error) {
      window.__pocketChordsmithPolicyError = String(error);
    }
    window.fetch = async (url, options = {}) => {
      window.__pocketChordsmithFetches.push({
        url: String(url),
        method: options.method || "GET",
        targetAddressSpace: options.targetAddressSpace || "",
      });
      throw new TypeError("Failed to fetch");
    };
    HTMLFormElement.prototype.submit = function submit() {
      window.__pocketChordsmithFormSubmits += 1;
    };
    HTMLAnchorElement.prototype.click = function click() {
      window.__pocketChordsmithDownloads.push(this.download || "");
    };
  });

  await page.locator("#pushToGodotBtn").click();

  const result = await page.evaluate(() => ({
    fetches: window.__pocketChordsmithFetches,
    formSubmits: window.__pocketChordsmithFormSubmits,
    downloads: window.__pocketChordsmithDownloads,
  }));
  expect(result.fetches).toHaveLength(2);
  expect(result.fetches[0].targetAddressSpace).toBe("loopback");
  expect(result.formSubmits).toBe(0);
  expect(result.downloads).toHaveLength(1);
  expect(result.downloads[0]).toMatch(/^pocket-chordsmith-to-godot-.+\.pcs1\.txt$/);
  await expect(page.locator("#statusText")).toContainText(
    "Godot push blocked by browser local-network permissions",
  );
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "Chrome blocked hosted Pocket Chordsmith from reaching localhost. (Godot receiver unavailable) Open a local/standalone Chordsmith build",
  );
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "Clipboard was blocked by itch, so a PCS1 handoff text file was downloaded",
  );
  await expect(page.locator("#projectBox")).toHaveValue(/^PCS1:/);
});

test("mobile transfer opens the static handoff page with a short code", async ({
  page,
}) => {
  let releaseRelay;
  const relayReady = new Promise((resolve) => {
    releaseRelay = resolve;
  });
  await page.route("**/api/pocket-audio-handoff/transfers", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.code).toMatch(/^PCS1:/);
    await relayReady;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "SAM-TEST42",
        shortCode: "SAM-TEST42",
        url: `${new URL(route.request().url()).origin}/apps/pocket-audio-handoff/index.html#code=SAM-TEST42`,
        expiresAt: "2026-07-03T01:00:00.000Z",
        ttlSeconds: 1800,
      }),
    });
  });
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

  await page.getByRole("button", { name: "Settings" }).first().click();
  const transferClick = page.getByRole("button", { name: "Mobile transfer" }).click();

  await expect(page.locator("#mobileTransferPanel")).toBeVisible();
  await expect(page.locator("#projectBox")).toHaveValue(/^PCS1:/);
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "same-device",
  );

  await expect
    .poll(() =>
      page.evaluate(() => window.__pocketChordsmithOpenedUrls.length),
    )
    .toBe(1);
  const waitingUrl = await page.evaluate(
    () => window.__pocketChordsmithOpenedUrls[0].location.href,
  );
  expect(waitingUrl).toBe("about:blank");

  releaseRelay();
  await transferClick;

  const openedUrls = await page.evaluate(() =>
    window.__pocketChordsmithOpenedUrls.map((item) => item.location.href),
  );
  expect(openedUrls).toHaveLength(1);
  expect(openedUrls[0]).toContain("/apps/pocket-audio-handoff/index.html");
  expect(openedUrls[0]).toContain("#code=SAM-TEST42");
  await expect(page.locator("#mobileTransferStatus")).toContainText(
    "short code SAM-TEST42",
  );
});

test("static handoff page imports hash payload and builds desktop fallbacks", async ({
  page,
}) => {
  const handoff = {
    app: "PocketHandoff",
    handoffVersion: 1,
    kind: "chordsmith-mobile-transfer",
    code: "PCS1:mobile-test",
    createdAt: "2026-07-03T00:00:00.000Z",
    sourceApp: "Pocket Chordsmith",
    targetApp: "Pocket Audio Handoff",
  };
  const encoded = await page.evaluate((payload) => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }, handoff);

  await page.route("**/api/pocket-audio-handoff/transfers", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.code).toBe("PCS1:mobile-test");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "SAM-MOBILE",
        shortCode: "SAM-MOBILE",
        url: `${new URL(route.request().url()).origin}/apps/pocket-audio-handoff/index.html#code=SAM-MOBILE`,
        expiresAt: "2026-07-03T01:00:00.000Z",
      }),
    });
  });
  await page.goto(`/apps/pocket-audio-handoff/#pocketHandoff=${encoded}`);
  await expect(page.locator("#handoffText")).toHaveValue("PCS1:mobile-test");
  await expect(page.locator("#payloadSummary")).toContainText("handoff link");
  await expect(page.locator("#relayCode")).toContainText("SAM-MOBILE");

  await page.evaluate(() => {
    window.__handoffCopied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__handoffCopied.push(text);
        },
      },
    });
    window.__handoffProtocolUrls = [];
    window.__handoffDownloads = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("pocket-daw://")) {
        window.__handoffProtocolUrls.push(this.href);
        return;
      }
      if (this.download) {
        window.__handoffDownloads.push({
          fileName: this.download,
          href: this.href,
        });
        return;
      }
      return originalClick.call(this);
    };
  });

  await page.getByRole("button", { name: "Copy for Pocket DAW" }).click();
  await page.getByRole("button", { name: "Copy for Godot Paste JSON/Code" }).click();
  await page.getByRole("button", { name: "Open Pocket DAW" }).click();

  const result = await page.evaluate(() => ({
    copied: window.__handoffCopied,
    protocolUrls: window.__handoffProtocolUrls,
    downloads: window.__handoffDownloads,
  }));
  expect(result.copied).toEqual(["PCS1:mobile-test", "PCS1:mobile-test"]);
  expect(result.downloads).toHaveLength(1);
  expect(result.downloads[0].fileName).toMatch(/^pocket-chordsmith-to-pocket-daw-.+\.pcs1\.txt$/);
  expect(result.protocolUrls).toHaveLength(1);
  expect(result.protocolUrls[0]).toContain("pocket-daw://handoff?");
  expect(result.protocolUrls[0]).toContain("source=download");
  expect(result.protocolUrls[0]).toContain(`file=${encodeURIComponent(result.downloads[0].fileName)}`);
  expect(result.protocolUrls[0]).not.toContain("pocketHandoff=");
});

test("static handoff page redeems a short code for desktop DAW and Godot import", async ({
  page,
}) => {
  await page.route("**/api/pocket-audio-handoff/transfers/SAM-DESK42", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "SAM-DESK42",
        shortCode: "SAM-DESK42",
        code: "PCS1:redeemed-desktop-test",
        source: "Pocket Chordsmith",
        metadata: { bpm: "96" },
        createdAt: "2026-07-03T00:00:00.000Z",
        expiresAt: "2026-07-03T01:00:00.000Z",
      }),
    });
  });

  await page.goto("/apps/pocket-audio-handoff/#code=SAM-DESK42");
  await expect(page.locator("#handoffText")).toHaveValue("PCS1:redeemed-desktop-test");
  await expect(page.locator("#relayStatus")).toContainText(
    "SAM-DESK42 loaded",
  );
  await expect(page.getByRole("button", { name: "Copy for Pocket DAW" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Copy for Godot Paste JSON/Code" })).toBeEnabled();
});

test("static handoff page accepts pasted PCS1 text and downloads exact payload", async ({
  page,
}) => {
  await page.goto("/apps/pocket-audio-handoff/");
  await page.locator("#handoffText").fill("PCS1:pasted-mobile-test");

  await page.evaluate(() => {
    window.__handoffDownloads = [];
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__handoffDownloads.push({
          fileName: this.download,
          href: this.href,
        });
      }
    };
  });

  await page.getByRole("button", { name: "Load pasted code" }).click();
  await expect(page.locator("#payloadSummary")).toContainText("PCS1");
  await page.getByRole("button", { name: "Download .pcs1.txt" }).click();

  const downloads = await page.evaluate(() => window.__handoffDownloads);
  expect(downloads).toHaveLength(1);
  expect(downloads[0].fileName).toMatch(/^pocket-chordsmith-to-pocket-daw-.+\.pcs1\.txt$/);
});

test("static handoff page keeps copy and download available when transfer URL is large", async ({
  page,
}) => {
  await page.goto("/apps/pocket-audio-handoff/");
  await page.locator("#handoffText").fill(`PCS1:${"x".repeat(3200)}`);
  await page.getByRole("button", { name: "Load pasted code" }).click();

  await expect(page.locator("#sourceStatus")).toContainText(
    "Transfer link ready",
  );
  await expect(page.locator("#qrStatus")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy for Pocket DAW" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download .pcs1.txt" })).toBeEnabled();
});

test("settings import and handoff controls stay within the viewport", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.locator("#settingsModal")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await page.locator("#genreDrawerBtn").click();
  await page.locator("#genreTabWestern").click();

  const overflow = await page.evaluate(() => {
    const ids = [
      "genreDrawer",
      "westernPresetSelect",
      "westernApplyLoopBtn",
      "projectBox",
      "exportScopeSelect",
      "exportJsonBtn",
      "importJsonBtn",
      "pushToGodotBtn",
      "importMidiBtn",
    ];
    return ids
      .map((id) => {
        const node = document.getElementById(id);
        if (!node) return { id, missing: true };
        const rect = node.getBoundingClientRect();
        return {
          id,
          missing: false,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          viewportWidth: window.innerWidth,
        };
      })
      .filter(
        (item) =>
          item.missing || item.left < -1 || item.right > item.viewportWidth + 1,
      );
  });

  const pageWidths = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(
    pageWidths.viewportWidth + 1,
  );
  expect(overflow).toEqual([]);
});
