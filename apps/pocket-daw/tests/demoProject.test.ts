import { describe, expect, it } from "vitest";
import { SECTION_IDS, sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDemoChordsmithProject } from "../src/demo/demoProject";

describe("Pocket DAW demo project template", () => {
  it("sizes every section-scoped demo array to that section length", () => {
    const raw = createDemoChordsmithProject() as Record<string, any>;
    const sanitized = sanitizePocketChordsmithProject(raw);
    const timeSig = Number(raw.timeSig);
    const resolution = Number(raw.resolution);

    SECTION_IDS.forEach((id) => {
      const expectedSteps = raw.sectionBars[id] * timeSig * resolution;
      const grid = raw[`grid${id}`];
      const tuplets = raw[`gridTuplets${id}`];

      (["kick", "snare", "hat", "bass"] as const).forEach((lane) => {
        expect(grid[lane], `${id} grid ${lane}`).toHaveLength(expectedSteps);
        expect(tuplets[lane], `${id} tuplet ${lane}`).toHaveLength(expectedSteps);
        expect(sanitized.sections[id].grid[lane], `${id} normalized grid ${lane}`).toHaveLength(expectedSteps);
        expect(sanitized.sections[id].gridTuplets[lane], `${id} normalized tuplet ${lane}`).toHaveLength(expectedSteps);
      });

      expect(raw[`melodyTracks${id}`][0], `${id} melody`).toHaveLength(expectedSteps);
      expect(raw[`melodyHold${id}`][0], `${id} melody hold`).toHaveLength(expectedSteps);
      expect(raw[`melodySlide${id}`][0], `${id} melody slide`).toHaveLength(expectedSteps);
      expect(raw[`melodyTuplets${id}`][0], `${id} melody tuplet`).toHaveLength(expectedSteps);
      expect(raw[`bassNotes${id}`], `${id} bass`).toHaveLength(expectedSteps);
      expect(raw[`bassHold${id}`], `${id} bass hold`).toHaveLength(expectedSteps);
      expect(raw[`bassSlide${id}`], `${id} bass slide`).toHaveLength(expectedSteps);
      expect(raw[`bassAccent${id}`], `${id} bass accent`).toHaveLength(expectedSteps);
      expect(raw[`guitarPattern${id}`], `${id} guitar`).toHaveLength(expectedSteps);

      const normalized = sanitized.sections[id];
      expect(normalized.melodyTracks[0], `${id} normalized melody`).toHaveLength(expectedSteps);
      expect(normalized.melodyHold[0], `${id} normalized melody hold`).toHaveLength(expectedSteps);
      expect(normalized.melodySlide[0], `${id} normalized melody slide`).toHaveLength(expectedSteps);
      expect(normalized.melodyTuplets[0], `${id} normalized melody tuplet`).toHaveLength(expectedSteps);
      expect(normalized.bassNotes, `${id} normalized bass`).toHaveLength(expectedSteps);
      expect(normalized.bassHold, `${id} normalized bass hold`).toHaveLength(expectedSteps);
      expect(normalized.bassSlide, `${id} normalized bass slide`).toHaveLength(expectedSteps);
      expect(normalized.bassAccent, `${id} normalized bass accent`).toHaveLength(expectedSteps);
      expect(normalized.guitarPattern, `${id} normalized guitar`).toHaveLength(expectedSteps);
    });
  });
});
