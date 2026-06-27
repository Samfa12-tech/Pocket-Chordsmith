import { describe, expect, it } from "vitest";
import type { TesterDiagnosticsPayload } from "./diagnostics";
import { buildFeedbackEmailDraft, FEEDBACK_EMAIL, MORE_BY_SAMFA12_URL } from "./feedback";

describe("feedback email drafts", () => {
  it("builds a mailto draft with feedback and diagnostics JSON when the payload fits", () => {
    const diagnostics = sampleDiagnostics();
    const diagnosticsJson = JSON.stringify(diagnostics, null, 2);
    const draft = buildFeedbackEmailDraft({
      feedback: "Playback jumped when I selected another track.",
      diagnostics,
      diagnosticsJson
    });

    expect(draft.mailtoUrl.startsWith(`mailto:${FEEDBACK_EMAIL}?`)).toBe(true);
    expect(draft.subject).toContain("Pocket DAW feedback");
    expect(draft.body).toContain("Playback jumped");
    expect(draft.body).toContain("Diagnostics JSON");
    expect(draft.body).toContain(diagnosticsJson);
    expect(draft.diagnosticsIncludedInBody).toBe(true);
  });

  it("falls back to a diagnostics summary for oversized mailto bodies", () => {
    const diagnostics = sampleDiagnostics();
    const diagnosticsJson = JSON.stringify({ ...diagnostics, huge: "x".repeat(14000) }, null, 2);
    const draft = buildFeedbackEmailDraft({
      feedback: "",
      diagnostics,
      diagnosticsJson
    });

    expect(draft.diagnosticsIncludedInBody).toBe(false);
    expect(draft.body).toContain("Diagnostics summary");
    expect(draft.body).toContain("Full diagnostics JSON was copied");
    expect(draft.body).not.toContain("x".repeat(1000));
  });

  it("uses the public Samfa12 site URL", () => {
    expect(MORE_BY_SAMFA12_URL).toBe("https://samfa12.com");
  });
});

function sampleDiagnostics(): TesterDiagnosticsPayload {
  return {
    capturedAt: "2026-06-14T08:00:00.000Z",
    app: {
      name: "Pocket DAW",
      version: "0.6.0",
      buildId: "test-build",
      commit: "abc123",
      runtime: "Installed/Tauri",
      platform: "Win32",
      installerOnly: true
    },
    project: {
      id: "project_001",
      title: "Ocarina of Time Medley",
      fileLabel: "Ocarina of Time Medley.pocketdaw",
      filePath: "C:\\Users\\sam_s\\Music\\Ocarina of Time Medley.pocketdaw",
      dawVersion: "0.6.0",
      schemaVersion: 2,
      bpm: 110,
      timeSig: 3,
      bars: 32,
      clipCount: 8,
      trackCount: 11,
      sourceRefCount: 1,
      invariantErrorCount: 0,
      invariantWarningCount: 0,
      invariantErrors: [],
      invariantWarnings: []
    },
    audio: {
      playbackBackend: "native",
      nativeStatus: "ready",
      nativeLastError: null,
      nativeCallbackCount: null,
      nativeLastCallbackMicros: null,
      nativeMaxCallbackMicros: null,
      nativeSlowCallbackCount: null,
      deviceHost: "wasapi",
      deviceCount: 2,
      defaultInputId: "input",
      defaultOutputId: "output"
    },
    recording: {
      status: "idle",
      trackId: null,
      armedTrackIds: [],
      monitorTrackIds: [],
      metronomeEnabled: true,
      countInBars: 1,
      metronomeVolume: 0.55,
      elapsedSeconds: 0,
      inputPeak: 0,
      inputDeviceName: null,
      outputDeviceName: null,
      monitoring: false,
      message: "Ready",
      timingConfidence: "none",
      appliedOffsetSeconds: 0,
      playbackCaptureRenderedFrameCount: null,
      playbackStopRenderedFrameCount: null,
      playbackSampleRate: null,
      timingNotes: []
    },
    updater: {
      status: "not-available",
      message: "Current",
      currentVersion: "0.6.0",
      availableVersion: null,
      autoCheckOnStartup: true,
      endpoint: "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json"
    },
    handoff: {
      source: "download-file",
      result: "imported",
      kind: "chordsmith-to-daw",
      receivedAt: "2026-06-14T07:00:00.000Z",
      message: "Imported."
    },
    media: {
      poolCount: 0,
      projectMediaCount: 0,
      externalReferenceCount: 0,
      runtimeOnlyCount: 0,
      missingCount: 0,
      runtimeAvailableCount: 0,
      renderCacheCount: 0,
      nativeRenderCache: {
        coverage: null,
        requestedClipCount: 0,
        assetCount: 0,
        assetRegionCount: 0,
        cachedClipCount: 0,
        renderCacheMetadataCount: 0,
        renderCacheHitCount: 0,
        renderCacheMissCount: 0,
        proceduralFallbackEventCount: 0,
        generatedRegionCount: 0,
        runtimeAudioRegionCount: 0,
        missingRuntimeAudioRegionCount: 0,
        cachedAssetByteCount: 0,
        generatedStemRenderFailureCount: 0,
        lastGeneratedStemRenderError: null,
        preloadPending: false,
        preloadedAssetCount: 0,
        payloadWindowStartSeconds: 0,
        payloadWindowEndSeconds: 0,
        preparedCoverage: null,
        payloadCoverage: null,
        windowAdvanceCount: 0,
        windowAdvanceFailureCount: 0,
        lastWindowAdvanceError: null,
        preloadWindowEndSeconds: 0,
        preloadError: null,
        buildPending: false,
        prewarmScheduled: false,
        pendingReason: null,
        nativeRenderCacheBypassedForLiveEdits: false,
        nativeRenderCacheStaleForLiveEdits: false,
        buildCount: 0,
        discardedBuildCount: 0,
        lastBuildMs: 0,
        lastBuildReason: null,
        lastError: null,
        hydratedCacheItemCount: 0,
        hydrationFailureCount: 0,
        staleSourceHashCount: 0,
        skippedInvalidPathCount: 0,
        hydratedCacheReadByteCount: 0
      }
    },
    storage: {
      projectPath: "C:\\Users\\sam_s\\Music\\Ocarina of Time Medley.pocketdaw",
      userDataPath: "Project-adjacent media/cache folders are relative to the saved .pocketdaw file."
    },
    performance: null
  };
}
