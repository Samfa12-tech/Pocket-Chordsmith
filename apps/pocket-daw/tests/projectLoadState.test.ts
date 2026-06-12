import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { createInitialState, currentProject, loadProjectIntoState } from "../src/app/state";
import { createDemoProject } from "../src/demo/demoProject";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";

describe("project load state hydration", () => {
  it("syncs recovered autosave state and engine diagnostics before any edit", () => {
    const initialState = createInitialState();
    const engine = new AudioEngine(currentProject(initialState));
    const initialDiagnostics = engine.getDiagnostics();
    const recoveredProject = parsePocketDawProjectFile(buildPocketDawProjectFile(createDemoProject()));
    recoveredProject.project.title = "Recovered Different Song";
    recoveredProject.timeline.clips = recoveredProject.timeline.clips.slice(0, 1);
    recoveredProject.timeline.markers = recoveredProject.timeline.markers.slice(0, 1);
    recoveredProject.timeline.bars = recoveredProject.timeline.clips[0]?.barLength || 1;

    const recoveredState = loadProjectIntoState(initialState, recoveredProject, {
      status: "Recovered autosaved Pocket DAW project.",
      currentFile: { path: null, label: "Recovered autosave: Recovered Different Song" }
    });
    engine.setProject(currentProject(recoveredState));
    const recoveredDiagnostics = engine.getDiagnostics();

    expect(recoveredState.status).toBe("Recovered autosaved Pocket DAW project.");
    expect(recoveredState.currentFile).toEqual({ path: null, label: "Recovered autosave: Recovered Different Song" });
    expect(recoveredState.selectedClipId).toBe(recoveredProject.timeline.clips[0].id);
    expect(recoveredState.selectedTrackId).toBe("drums");
    expect(recoveredState.playheadBar).toBe(1);
    expect(recoveredState.cursorBar).toBe(1);
    expect(recoveredState.meterLevels).toEqual({});
    expect(recoveredState.chordsmithStepSelection).toBeNull();
    expect(recoveredDiagnostics.eventCount).toBe(renderTimelineEvents(recoveredProject).length);
    expect(recoveredDiagnostics.eventCount).not.toBe(initialDiagnostics.eventCount);
  });
});
