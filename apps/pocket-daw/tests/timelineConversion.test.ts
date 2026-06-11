import { describe, expect, it } from "vitest";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { createDemoChordsmithProject } from "../src/demo/demoProject";

describe("timeline conversion", () => {
  it("creates generated-section clips from songSequence", () => {
    const pcs = sanitizePocketChordsmithProject(createDemoChordsmithProject());
    const daw = createDawProjectFromChordsmithProject(pcs);
    expect(daw.timeline.clips).toHaveLength(pcs.songSequence.length);
    expect(daw.timeline.clips[0]).toMatchObject({
      type: "generated-section",
      trackId: "arrangement",
      sectionId: "A",
      startBar: 1,
      barLength: 4
    });
    expect(daw.timeline.clips[2].sectionId).toBe("B");
  });

  it("respects section lengths", () => {
    const source = createDemoChordsmithProject();
    (source.sectionBars as Record<string, number>).A = 2;
    (source.sectionBars as Record<string, number>).B = 3;
    source.songSequence = ["A", "B"];
    const daw = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source));
    expect(daw.timeline.clips[0].barLength).toBe(2);
    expect(daw.timeline.clips[1].startBar).toBe(3);
    expect(daw.timeline.clips[1].barLength).toBe(3);
  });
});
