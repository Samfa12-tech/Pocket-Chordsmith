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
    audioProfile: "chip_tune",
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
  await expect(page.locator("#pocketAudioCoreStatus")).toContainText(
    "Pocket Audio Core",
  );
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
    expect(exported.projectVersion).toBe(16);
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
  expect(roundTrip.projectVersion).toBe(16);
  expect(roundTrip.audioProfile).toBe(FIXTURE_CASES[0].audioProfile);
  expect(roundTrip.lofiPreset).toBe(FIXTURE_CASES[0].preset);
});

test("Godot direct push sends a schema 16 PCS1 payload to the local receiver", async ({
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
    schema: 16,
  });
  expect(body.code).toMatch(/^PCS1:/);
  await expect(page.locator("#pushHandoffStatus")).toContainText(
    "Song pushed to Godot",
  );
});

test("settings import and handoff controls stay within the viewport", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.locator("#settingsModal")).toHaveAttribute(
    "aria-hidden",
    "false",
  );

  const overflow = await page.evaluate(() => {
    const ids = [
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
