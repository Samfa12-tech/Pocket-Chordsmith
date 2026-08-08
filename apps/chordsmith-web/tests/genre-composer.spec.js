import { expect, test } from "@playwright/test";

const GENRES = [
  { id: "lofi", archetype: "lofi_study_room", profile: "lofi_chill", button: "#lofiChillBtn" },
  { id: "chip", archetype: "chip_arcade_start", profile: "chip_arcade", button: "#chipTuneBtn" },
  { id: "metal", archetype: "metal_classic_chug", profile: "heavy_metal", button: "#metalChugBtn" },
  { id: "western", archetype: "western_frontier_ride", profile: "western_frontier", button: "#westernTrailBtn" },
  { id: "funk", archetype: "funk_classic_pocket", profile: "funk_groove", button: "#funkGrooveBtn" },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/apps/chordsmith-web/");
  await page.waitForLoadState("networkidle");
});

test("primary genre buttons compose complete songs instead of current-section ideas", async ({ page }) => {
  for (const genre of GENRES) {
    await page.locator(genre.button).click();
    const summary = await page.evaluate(() => {
      const project = exportProject();
      const plan = state.genreComposition;
      const sequenceSections = [...new Set(project.songSequence)];
      return {
        projectVersion: project.projectVersion,
        profile: project.soundProfile.id,
        sequence: project.songSequence,
        plan,
        populated: sequenceSections.map((id) => ({
          id,
          bars: project.sectionBars[id],
          progression: project[`progression${id}`],
          melodicNotes: project[`melodyTracks${id}`].flat().filter((note) => note !== null).length,
          hits: ["kick", "snare", "hat", "bass"].reduce((count, lane) => count + project[`grid${id}`][lane].filter(Boolean).length, 0),
        })),
      };
    });

    expect(summary.projectVersion).toBe(17);
    expect(summary.profile).toBe(genre.profile);
    expect(summary.plan.identity.genre).toBe(genre.id);
    expect(summary.plan.sections.length).toBeGreaterThanOrEqual(6);
    expect(summary.sequence.length).toBeGreaterThanOrEqual(7);
    expect(summary.populated.length).toBeGreaterThanOrEqual(5);
    for (const section of summary.populated) {
      expect(section.bars).toBeGreaterThan(0);
      expect(section.progression.some((degree) => degree !== null)).toBe(true);
      expect(section.hits).toBeGreaterThan(0);
    }
  }
});

test("fixed seeds are deterministic, round-trip through schema 17, and remain editable", async ({ page }) => {
  for (const genre of GENRES) {
    const result = await page.evaluate(({ id, archetype }) => {
      composeGenreSong(id, { archetype, seed: `review-${id}-20260731` });
      const first = exportProject({ targetSchema: 17 });
      const firstPlan = JSON.stringify(state.genreComposition);
      composeGenreSong(id, { archetype, seed: `review-${id}-20260731` });
      const second = exportProject({ targetSchema: 17 });
      const secondPlan = JSON.stringify(state.genreComposition);
      importProject(second);
      const restored = exportProject({ targetSchema: 17 });
      return {
        firstPlan,
        secondPlan,
        first: { bpm: first.bpm, sectionBars: first.sectionBars, songSequence: first.songSequence },
        second: { bpm: second.bpm, sectionBars: second.sectionBars, songSequence: second.songSequence },
        restored: { bpm: restored.bpm, sectionBars: restored.sectionBars, songSequence: restored.songSequence, genreComposition: restored.genreComposition },
      };
    }, genre);

    expect(result.firstPlan).toBe(result.secondPlan);
    expect(result.first).toEqual(result.second);
    expect(result.restored.bpm).toBe(result.second.bpm);
    expect(result.restored.sectionBars).toEqual(result.second.sectionBars);
    expect(result.restored.songSequence).toEqual(result.second.songSequence);
    expect(result.restored.genreComposition.identity.seed).toBe(`review-${genre.id}-20260731`);
  }
});

test("metal coordinates its rhythm section and keeps lead out of verse and breakdown roles", async ({ page }) => {
  const result = await page.evaluate(() => {
    composeGenreSong("metal", { archetype: "metal_thrashing_gallop", seed: "metal-rhythm-review" });
    const project = exportProject();
    const sections = state.genreComposition.sections.map((section) => {
      const grid = project[`grid${section.id}`];
      const guitar = project[`guitarPattern${section.id}`];
      const bass = project[`bassNotes${section.id}`];
      const attacks = guitar.reduce((count, articulation, step) => count + (articulation !== "off" && grid.kick[step] && bass[step] !== null ? 1 : 0), 0);
      const guitarAttacks = guitar.filter((articulation) => articulation !== "off").length;
      const leadNotes = project[`melodyTracks${section.id}`].flat().filter((note) => note !== null).length;
      return { role: section.role, lead: section.lead, attacks, guitarAttacks, leadNotes, energy: section.energy };
    });
    return {
      sections,
      profile: project.soundProfile,
      sequence: project.songSequence,
      mix: {
        guitarVolume: project.guitarVolume,
        bassTone: project.bassTone,
        bassConfig: bassToneConfig(project.bassTone),
      },
    };
  });

  expect(result.profile).toMatchObject({ id: "heavy_metal", preset: "metal_thrashing_gallop", recipeVersion: 1 });
  expect(result.mix.guitarVolume).toBe(0.76);
  expect(result.mix.bassTone).toBe("metal_grind_bass");
  expect(result.sequence.length).toBeGreaterThan(7);
  expect(result.sections.some((section) => section.energy < 0.5)).toBe(true);
  for (const section of result.sections) {
    if (section.guitarAttacks) expect(section.attacks / section.guitarAttacks).toBeGreaterThanOrEqual(0.9);
    if (["verse", "breakdown"].includes(section.role)) expect(section.leadNotes).toBe(0);
  }
});

test("classic metal uses the approved softer bass voicing and louder guitar balance", async ({ page }) => {
  const mix = await page.evaluate(() => {
    composeGenreSong("metal", { archetype: "metal_classic_chug", seed: "audio-review-metal-v1" });
    const project = exportProject();
    return {
      guitarVolume: project.guitarVolume,
      bassTone: project.bassTone,
      bassConfig: bassToneConfig(project.bassTone),
    };
  });

  expect(mix.guitarVolume).toBe(0.76);
  expect(mix.bassTone).toBe("metal_pick_bass");
  expect(mix.bassConfig).toMatchObject({
    mainWave: "triangle",
    subWave: "sine",
    mainPeak: 0.64,
    cutoff: 430,
  });
});

test("genre policies keep inappropriate automatic lead instruments out", async ({ page }) => {
  const result = await page.evaluate(() => {
    const output = {};
    for (const { id, archetype } of [
      { id: "metal", archetype: "metal_power_anthem" },
      { id: "western", archetype: "western_frontier_ride" },
      { id: "chip", archetype: "chip_bug_maze_pulse" },
      { id: "funk", archetype: "funk_classic_pocket" },
    ]) {
      composeGenreSong(id, { archetype, seed: `policy-${id}` });
      const project = exportProject();
      output[id] = state.genreComposition.sections.map((section) => ({
        role: section.role,
        instruments: project[`melodyInstruments${section.id}`],
        bassArticulations: project[`bassArticulation${section.id}`].filter(Boolean),
      }));
    }
    return output;
  });

  expect(result.metal.flatMap((section) => section.instruments)).not.toContain("banjo");
  expect(result.metal.flatMap((section) => section.instruments)).not.toContain("cowboy_whistle");
  expect(result.western.flatMap((section) => section.instruments)).not.toContain("shred_lead_guitar");
  expect(result.chip.flatMap((section) => section.instruments)).not.toContain("banjo");
  expect(result.funk.flatMap((section) => section.bassArticulations)).toEqual(expect.arrayContaining(["slap", "pop", "mute", "hammer", "pull"]));
});
test("the existing Western current-section action preserves its sound profile on export", async ({ page }) => {
  const soundProfile = await page.evaluate(() => {
    applyWesternPresetToProject("western_frontier_ride", { fullLoop: false });
    return exportProject().soundProfile;
  });
  expect(soundProfile).toMatchObject({ id: "western_frontier", preset: "western_frontier_ride", recipeVersion: 1 });
});

test("supported composer archetypes preserve their tempo and active profile through schema 17", async ({ page }) => {
  const result = await page.evaluate(() => {
    const bossPlan = PocketChordsmithGenreComposer.composeSong({ genre: "metal", archetype: "metal_boss_blast", seed: "boss-tempo-round-trip" });
    composeGenreSong("metal", { archetype: "metal_boss_blast", seed: "boss-tempo-round-trip" });
    const beforeImport = exportProject({ targetSchema: 17 });
    importProject(beforeImport);
    const restored = exportProject({ targetSchema: 17 });
    composeGenreSong("western", { archetype: "western_duel", seed: "high-noon-profile" });
    const duel = exportProject({ targetSchema: 17 });
    return {
      bossPlanBpm: bossPlan.identity.bpm,
      bossBeforeImportBpm: beforeImport.bpm,
      bossRestoredBpm: restored.bpm,
      bossProfile: restored.soundProfile,
      duelPlan: state.genreComposition.identity,
      duelProfile: duel.soundProfile,
    };
  });

  expect(result.bossPlanBpm).toBeGreaterThan(180);
  expect(result.bossBeforeImportBpm).toBe(result.bossPlanBpm);
  expect(result.bossRestoredBpm).toBe(result.bossPlanBpm);
  expect(result.bossProfile).toMatchObject({ id: "heavy_metal", preset: "metal_boss_blast" });
  await page.evaluate(() => composeGenreSong("metal", { archetype: "metal_boss_blast", seed: "boss-tempo-round-trip" }));
  await page.locator("#playBtn").click();
  await expect.poll(() => page.evaluate(() => state.bpm)).toBe(result.bossPlanBpm);
  await page.locator("#stopBtn").click();
  await expect.poll(() => page.evaluate(() => state.isPlaying)).toBe(false);
  expect(result.duelPlan).toMatchObject({ genre: "western", archetype: "western_duel" });
  expect(result.duelProfile).toMatchObject({ id: "western_frontier", preset: "western_duel" });
});
test("a composed metal song drives section/song transport and exports WAV", async ({ page }) => {
  test.setTimeout(90_000);
  await page.evaluate(() => composeGenreSong("metal", { archetype: "metal_classic_chug", seed: "metal-wav-transport" }));

  await page.locator("#playBtn").click();
  await expect.poll(() => page.evaluate(() => state.isPlaying)).toBe(true);
  await page.locator("#stopBtn").click();
  await expect.poll(() => page.evaluate(() => state.isPlaying)).toBe(false);

  await page.locator("#uiModeSelect").selectOption("advanced");
  await page.locator("#playSequenceBtn").click();
  await expect.poll(() => page.evaluate(() => state.isPlaying && state.playbackMode)).toBe("sequence");
  await page.locator("#stopBtn").click();
  await expect.poll(() => page.evaluate(() => state.isPlaying)).toBe(false);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator("#exportWavBtn").click();
  await expect(page.locator("#wavProgressText")).toContainText("WAV ready", { timeout: 80_000 });
  const wav = await page.evaluate(async () => {
    const bytes = new Uint8Array(await state.wavBlob.arrayBuffer());
    return { size: state.wavBlob.size, header: String.fromCharCode(...bytes.slice(0, 4)), finite: state.wavBlob.size > 44 };
  });
  expect(wav).toMatchObject({ header: "RIFF", finite: true });
});
