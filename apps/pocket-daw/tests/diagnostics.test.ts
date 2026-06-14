import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { buildTesterDiagnosticsPayload, diagnosticsJson } from "../src/app/diagnostics";
import { createInitialState, currentProject } from "../src/app/state";
import { createUndoStack } from "../src/daw/undo";
import { addMediaPoolItem, createMediaPoolItem, markMediaPoolItemMissing } from "../src/daw/mediaPool";

describe("tester diagnostics", () => {
  it("builds an installed-alpha payload with project, updater, audio and media state", () => {
    let state = createInitialState();
    let project = currentProject(state);
    const external = createMediaPoolItem({ kind: "audio", name: "External.wav", uri: "file:///music/External.wav" });
    const runtimeOnly = createMediaPoolItem({ kind: "audio", name: "Runtime.wav", metadata: { runtimeOnly: true } }, [external]);
    const missing = createMediaPoolItem({ kind: "audio", name: "Missing.wav", uri: "file:///missing/Missing.wav" }, [external, runtimeOnly]);
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), runtimeOnly), missing);
    project = markMediaPoolItemMissing(project, missing.id, true, "Drive missing");
    state = {
      ...state,
      undoStack: createUndoStack(project),
      currentFile: { label: "Song.pocketdaw", path: "C:\\Songs\\Song.pocketdaw" },
      updaterStatus: "available",
      updaterAvailableVersion: "0.5.10",
      updaterMessage: "Pocket DAW 0.5.10 is available.",
      lastHandoff: {
        source: "deep-link",
        result: "imported",
        kind: "chordsmith-to-daw",
        receivedAt: "2026-06-14T00:01:00.000Z",
        message: "Pocket Chordsmith handoff imported from deep-link."
      }
    };

    const engine = new AudioEngine(project);
    const payload = buildTesterDiagnosticsPayload(state, engine.getDiagnostics(), {
      capturedAt: "2026-06-14T00:00:00.000Z",
      runtime: "Installed/Tauri",
      platform: "Windows test"
    });

    expect(payload.app).toMatchObject({
      name: "Pocket DAW",
      installerOnly: true,
      runtime: "Installed/Tauri",
      platform: "Windows test"
    });
    expect(payload.project).toMatchObject({
      title: project.project.title,
      filePath: "C:\\Songs\\Song.pocketdaw",
      sourceRefCount: project.sourceRefs.length
    });
    expect(payload.audio.playbackBackend).toBe("idle");
    expect(payload.recording).toMatchObject({
      monitoring: false,
      outputDeviceName: null
    });
    expect(payload.updater).toMatchObject({
      status: "available",
      availableVersion: "0.5.10"
    });
    expect(payload.updater.endpoint).toContain("pocket-daw-latest.json");
    expect(payload.handoff).toMatchObject({
      source: "deep-link",
      result: "imported",
      kind: "chordsmith-to-daw"
    });
    expect(payload.media).toMatchObject({
      poolCount: 3,
      externalReferenceCount: 2,
      runtimeOnlyCount: 1,
      missingCount: 1
    });
    expect(diagnosticsJson(payload)).toContain('"installerOnly": true');
    expect(diagnosticsJson(payload)).toContain('"handoff"');
  });
});
