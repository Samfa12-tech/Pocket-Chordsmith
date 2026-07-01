import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { buildTesterDiagnosticsPayload, diagnosticsJson } from "../src/app/diagnostics";
import { PerformanceDiagnosticsRecorder } from "../src/app/performanceDiagnostics";
import { createInitialState, currentProject } from "../src/app/state";
import { createUndoStack } from "../src/daw/undo";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { activateAudioTake, setAudioTakeArchived } from "../src/daw/clips";
import { addMediaPoolItem, createMediaPoolItem, linkFreezeRenderCacheItem, markMediaPoolItemMissing } from "../src/daw/mediaPool";
import { addReturnTrack, setTrackSendLevel, setTrackSendMode } from "../src/daw/routing";

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
      missingCount: 1,
      portability: {
        copyableExternalCount: 1,
        runtimeOnlyCount: 1,
        missingOrUnresolvedCount: 1,
        needsCollectionOrRelinkCount: 3
      },
      sharedPortability: {
        localReferenceFieldCount: 2,
        localReferenceItemCount: 2,
        portableForSharing: false
      }
    });
    expect(JSON.stringify(payload.media.portability)).not.toContain("file://");
    expect(JSON.stringify(payload.media.sharedPortability)).not.toContain("file://");
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

  it("includes routing export diagnostics for support and game-pack smoke review", () => {
    let state = createInitialState();
    const ret = addReturnTrack(currentProject(state), "Delay Return");
    const sent = setTrackSendLevel(ret.project, "bass", ret.trackId, 0.35);
    const pre = setTrackSendMode(sent, "bass", ret.trackId, "pre-fader");
    state = { ...state, undoStack: createUndoStack(pre) };
    const engine = new AudioEngine(currentProject(state));

    const payload = buildTesterDiagnosticsPayload(state, engine.getDiagnostics());

    expect(payload.routing).toMatchObject({
      returnCount: expect.any(Number),
      sendCount: expect.any(Number),
      preFaderSendCount: 1
    });
    expect(payload.routing.warnings.join("\n")).not.toContain("pre-fader send");
    expect(diagnosticsJson(payload)).toContain('"routing"');
  });

  it("includes grouped audio take diagnostics for comping smoke review", () => {
    let state = createInitialState();
    let project = currentProject(state);
    const firstImport = addImportedAudioMedia(project, {
      name: "Diagnostic take 1.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "diagnostic-takes-a" }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 1);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Diagnostic take 2.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "diagnostic-takes-a" }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 1);
    project = setAudioTakeArchived(activateAudioTake(secondPlaced.project, secondPlaced.clipId).project, firstPlaced.clipId, true).project;
    state = { ...state, undoStack: createUndoStack(project) };
    const engine = new AudioEngine(currentProject(state));

    const payload = buildTesterDiagnosticsPayload(state, engine.getDiagnostics());

    expect(payload.project.audioTakes).toMatchObject({
      groupedClipCount: 2,
      groupCount: 1,
      activeCount: 1,
      archivedCount: 1,
      groups: [{ groupId: "diagnostic-takes-a", clipCount: 2, activeCount: 1, archivedCount: 1 }]
    });
    expect(diagnosticsJson(payload)).toContain('"audioTakes"');
  });

  it("includes render cache summaries for freeze and native-cache smoke review", () => {
    let state = createInitialState();
    const source = currentProject(state).timeline.clips[0];
    const frozen = createMediaPoolItem({ kind: "audio", name: "Frozen Intro.wav", durationSeconds: 8, sampleRate: 48000, channels: 2 });
    let project = addMediaPoolItem(currentProject(state), frozen);
    project = linkFreezeRenderCacheItem(project, {
      sourceClipId: source.id,
      mediaPoolItemId: frozen.id,
      createdAt: "2026-06-29T00:00:00.000Z"
    });
    project.renderCache.push({ id: "native_stem", createdAt: "2026-06-29T00:01:00.000Z", invalidated: false, metadata: { cacheKind: "native-generated-stem" } });
    state = { ...state, undoStack: createUndoStack(project) };
    const engine = new AudioEngine(currentProject(state));

    const payload = buildTesterDiagnosticsPayload(state, engine.getDiagnostics());

    expect(payload.media.renderCache).toMatchObject({
      totalCount: 2,
      freezeRenderCount: 1,
      nativeGeneratedStemCount: 1,
      linkedMediaCount: 1,
      latestCreatedAt: "2026-06-29T00:01:00.000Z",
      byKind: {
        "freeze-render": 1,
        "native-generated-stem": 1
      }
    });
    expect(diagnosticsJson(payload)).toContain('"renderCache"');
  });

  it("exports live-edit native cache diagnostics for stale-cache smoke review", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));
    const audioDiagnostics = engine.getDiagnostics();
    audioDiagnostics.nativeRenderCache = {
      ...audioDiagnostics.nativeRenderCache,
      nativeRenderCacheStaleForLiveEdits: true,
      pendingReason: "live-bass-edit",
      discardedBuildCount: 2
    };

    const payload = buildTesterDiagnosticsPayload(state, audioDiagnostics);

    expect(payload.media.nativeRenderCache).toMatchObject({
      nativeRenderCacheStaleForLiveEdits: true,
      pendingReason: "live-bass-edit",
      discardedBuildCount: 2
    });
    expect(diagnosticsJson(payload)).toContain('"nativeRenderCacheStaleForLiveEdits": true');
  });

  it("includes audio media analysis readiness for waveform and normalize smoke review", () => {
    let state = createInitialState();
    const imported = addImportedAudioMedia(currentProject(state), {
      name: "Vocal Take.wav",
      durationSeconds: 5,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [0.2, 0.7, 0.4], audioTransientMarkersSeconds: [0.5, 1.75] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    state = { ...state, undoStack: createUndoStack(placed.project) };
    const engine = new AudioEngine(currentProject(state));

    const payload = buildTesterDiagnosticsPayload(state, engine.getDiagnostics());

    expect(payload.media.analysis).toMatchObject({
      audioMediaCount: 1,
      audioClipCount: 1,
      waveformReadyCount: 1,
      waveformMissingCount: 0,
      waveformPeakPointCount: 3,
      maxPeak: 0.7,
      normalizeReadyClipCount: 1,
      clipsMissingWaveformCount: 0,
      transientReadyCount: 1,
      transientMarkerCount: 2
    });
    expect(diagnosticsJson(payload)).toContain('"analysis"');
  });
});
