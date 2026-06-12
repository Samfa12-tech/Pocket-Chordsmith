import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { createDemoProject } from "../src/demo/demoProject";
import { cycleBassStep } from "../src/daw/chordsmithEditor";
import { toggleTrackMute } from "../src/daw/mixer";

describe("performance hot-path safeguards", () => {
  it("syncs mixer controls without rebuilding the audio graph or timeline identity", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const before = engine.getDiagnostics();

    engine.syncProject(toggleTrackMute(project, "bass"), "mixer-controls");
    const after = engine.getDiagnostics();

    expect(after.lastProjectSyncMode).toBe("mixer-controls");
    expect(after.projectSyncCount).toBe(before.projectSyncCount + 1);
    expect(after.audioGraphReconfigureCount).toBe(before.audioGraphReconfigureCount);
    expect(after.eventCount).toBe(before.eventCount);
    expect(after.timelineClipCount).toBe(before.timelineClipCount);
    expect(after.sourceRefTitles).toEqual(before.sourceRefTitles);
  });

  it("syncs composition edits without a project-load reset", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const before = engine.getDiagnostics();

    engine.syncProject(cycleBassStep(project, "A", 0), "composition-events");
    const after = engine.getDiagnostics();

    expect(after.lastProjectSyncMode).toBe("composition-events");
    expect(after.projectSyncCount).toBe(before.projectSyncCount + 1);
    expect(after.audioGraphReconfigureCount).toBe(before.audioGraphReconfigureCount);
    expect(after.projectTitle).toBe(before.projectTitle);
    expect(after.timelineClipCount).toBe(before.timelineClipCount);
  });

  it("keeps full project-load sync available for open/import/new/demo paths", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);

    engine.setProject(project);
    const diagnostics = engine.getDiagnostics();

    expect(diagnostics.lastProjectSyncMode).toBe("project-load");
    expect(diagnostics.projectSyncCount).toBe(1);
    expect(diagnostics.eventCount).toBeGreaterThan(0);
  });
});
