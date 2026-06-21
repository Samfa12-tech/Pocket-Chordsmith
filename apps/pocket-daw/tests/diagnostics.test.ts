import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { buildTesterDiagnosticsPayload, diagnosticsJson } from "../src/app/diagnostics";
import { PerformanceDiagnosticsRecorder } from "../src/app/performanceDiagnostics";
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
      outputDeviceName: null,
      timingConfidence: "none",
      appliedOffsetSeconds: 0
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
    expect(payload.performance).toBeNull();
    expect(diagnosticsJson(payload)).toContain('"installerOnly": true');
    expect(diagnosticsJson(payload)).toContain('"handoff"');
  });

  it("reports recording timing anchors as diagnostics without applying offset", () => {
    const state = {
      ...createInitialState(),
      recording: {
        ...createInitialState().recording,
        status: "recording" as const,
        playbackCaptureAnchor: {
          source: "native",
          snapshotMonotonicMs: 10,
          active: true,
          playing: true,
          positionSeconds: 1.5,
          renderedFrameCount: 48000,
          startedGeneration: 3,
          sampleRate: 48000,
          channels: 2
        }
      }
    };
    const engine = new AudioEngine(currentProject(state));

    const payload = buildTesterDiagnosticsPayload(state, engine.getDiagnostics());

    expect(payload.recording).toMatchObject({
      timingConfidence: "diagnostic",
      appliedOffsetSeconds: 0,
      playbackCaptureRenderedFrameCount: 48000,
      playbackSampleRate: 48000
    });
    expect(payload.recording.timingNotes.join("\n")).toContain("No automatic latency compensation");
  });

  it("captures bounded live performance samples for MCP stress-test analysis", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));
    const recorder = new PerformanceDiagnosticsRecorder();
    recorder.start(5);

    const first = recorder.report(state, engine.getDiagnostics(), {
      renderCount: 1,
      renderCountDuringPlayback: 0,
      liveUpdateCount: 0
    }, { recordSample: true });
    const second = recorder.report({ ...state, playing: true, playheadBar: 2 }, engine.getDiagnostics(), {
      renderCount: 7,
      renderCountDuringPlayback: 3,
      liveUpdateCount: 11
    }, { recordSample: true });
    const third = recorder.report({ ...state, playing: true, playheadBar: 3 }, engine.getDiagnostics(), {
      renderCount: 9,
      renderCountDuringPlayback: 5,
      liveUpdateCount: 17
    }, { recordSample: true });
    recorder.report({ ...state, playing: true, playheadBar: 4 }, engine.getDiagnostics(), {
      renderCount: 10,
      renderCountDuringPlayback: 6,
      liveUpdateCount: 18
    }, { recordSample: true });
    recorder.report({ ...state, playing: true, playheadBar: 5 }, engine.getDiagnostics(), {
      renderCount: 11,
      renderCountDuringPlayback: 7,
      liveUpdateCount: 19
    }, { recordSample: true });
    const bounded = recorder.report({ ...state, playing: true, playheadBar: 6 }, engine.getDiagnostics(), {
      renderCount: 12,
      renderCountDuringPlayback: 8,
      liveUpdateCount: 20
    }, { recordSample: true });

    expect(first.enabled).toBe(true);
    expect(first.baseline).toBeTruthy();
    expect(bounded.sampleCount).toBe(5);
    expect(bounded.droppedSampleCount).toBe(1);
    expect(third.summary.renderCountDelta).toBe(8);
    expect(third.summary.renderCountDuringPlaybackDelta).toBe(5);
    expect(third.summary.liveUpdateCountDelta).toBe(17);
    expect(third.current.features.trackCount).toBe(currentProject(state).tracks.length);
    expect(second.recentSamples.at(-1)?.playing).toBe(true);

    const payload = buildTesterDiagnosticsPayload(state, engine.getDiagnostics(), {
      performance: bounded
    });

    expect(payload.performance?.sessionId).toMatch(/^perf-/);
    expect(diagnosticsJson(payload)).toContain('"recentSamples"');
  });
});
