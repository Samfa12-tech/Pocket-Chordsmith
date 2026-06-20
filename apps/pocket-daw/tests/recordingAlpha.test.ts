import { describe, expect, it } from "vitest";
import { buildMetronomeClicks, buildTransportMetronomeSchedule, countInSeconds } from "../src/audio/metronome";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { addImportedAudioMedia, placeAudioClipOnTrack, placeRecordingClipOnTrack } from "../src/daw/audioClips";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { addTrackToProject } from "../src/daw/tracks";
import { createDemoProject } from "../src/demo/demoProject";
import {
  buildLoopbackCalibrationReport,
  buildNativeRecordingDiagnosticsMetadata,
  buildRecordingCompletionMessage,
  buildRecordingStartupPlan,
  recordingStartFailureCleanupPlan
} from "../src/app/recordingOrchestration";
import { createRecordingUiState, recordingSessionMatches } from "../src/app/state";
import { nativeRecordingStatus } from "../src/native/recordingBridge";

describe("recording alpha foundations", () => {
  it("migrates metronome and monitor defaults without changing old save compatibility", () => {
    const oldProject = JSON.parse(buildPocketDawProjectFile(createDemoProject()));
    delete oldProject.project.metronome;
    oldProject.tracks.forEach((track: Record<string, unknown>) => delete track.monitorEnabled);

    const migrated = migratePocketDawProject(oldProject);

    expect(migrated.project.metronome).toMatchObject({ enabled: false, countInBars: 1, volume: 0.55 });
    expect(migrated.tracks.every((track) => track.monitorEnabled === false)).toBe(true);
  });

  it("generates metronome click timing from project BPM and time signature", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;

    const clicks = buildMetronomeClicks(project, 0, 2);

    expect(clicks.map((click) => click.timeSeconds)).toEqual([0, 0.5, 1, 1.5]);
    expect(clicks[0].accented).toBe(true);
    expect(clicks[1].accented).toBe(false);
    expect(countInSeconds(project)).toBe(2);
  });

  it("locks live metronome scheduling to transport seeks and loops", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;

    const first = buildTransportMetronomeSchedule(project, 0, null, 0.55);
    const afterLoop = buildTransportMetronomeSchedule(project, 0.02, 7, 0.55);

    expect(first.clicks.map((click) => click.beatIndex)).toEqual([0, 1]);
    expect(afterLoop.clicks.map((click) => click.beatIndex)).toEqual([0, 1]);
    expect(afterLoop.clicks[0]).toMatchObject({ bar: 1, beat: 1, accented: true });
  });

  it("places recorded project-media audio on the armed live track", () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const imported = addImportedAudioMedia(withTrack.project, {
      name: "take.wav",
      uri: "project-media/recordings/take.wav",
      mimeType: "audio/wav",
      durationSeconds: 3,
      sampleRate: 48000,
      channels: 1,
      sizeBytes: 96000,
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/recordings/take.wav",
        importMode: "native-recording"
      }
    });

    const placed = placeAudioClipOnTrack(imported.project, imported.item.id, withTrack.trackId, 5);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId);

    expect(placed.trackId).toBe(withTrack.trackId);
    expect(clip).toMatchObject({
      type: "audio",
      trackId: withTrack.trackId,
      mediaPoolItemId: imported.item.id,
      startBar: 5
    });
    expect(imported.item.metadata).toMatchObject({ mediaRefKind: "project", importMode: "native-recording" });
  });

  it("preserves fractional recording placement at beat-level starts", () => {
    const starts = [1.25, 2.5, 7.75];
    for (const startBar of starts) {
      const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
      const imported = addImportedAudioMedia(withTrack.project, {
        name: `take-${startBar}.wav`,
        uri: `project-media/recordings/take-${startBar}.wav`,
        mimeType: "audio/wav",
        durationSeconds: 2,
        sampleRate: 48000,
        channels: 1,
        metadata: { mediaRefKind: "project", projectRelativePath: `project-media/recordings/take-${startBar}.wav` }
      });

      const placed = placeRecordingClipOnTrack(imported.project, imported.item.id, withTrack.trackId, startBar);
      const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId);

      expect(clip?.startBar).toBeCloseTo(startBar, 5);
    }
  });

  it("records over same-track audio while preserving material before and after the take", () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const bedMedia = addImportedAudioMedia(withTrack.project, {
      name: "old-take.wav",
      uri: "project-media/recordings/old-take.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 6,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/recordings/old-take.wav" }
    });
    const bedPlaced = placeAudioClipOnTrack(bedMedia.project, bedMedia.item.id, withTrack.trackId, 5);
    const oldClip = bedPlaced.project.timeline.clips.find((clip) => clip.id === bedPlaced.clipId)!;
    oldClip.barLength = 6;
    oldClip.metadata = { ...(oldClip.metadata || {}), sourceOffsetSeconds: 0 };
    const punchMedia = addImportedAudioMedia(bedPlaced.project, {
      name: "new-take.wav",
      uri: "project-media/recordings/new-take.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 2,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/recordings/new-take.wav" }
    });

    const punched = placeRecordingClipOnTrack(punchMedia.project, punchMedia.item.id, withTrack.trackId, 7);
    const audioClips = punched.project.timeline.clips
      .filter((clip) => clip.trackId === withTrack.trackId && clip.type === "audio")
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(audioClips).toHaveLength(3);
    expect(audioClips.map((clip) => ({ name: clip.name, startBar: clip.startBar, barLength: clip.barLength }))).toEqual([
      { name: "old-take.wav", startBar: 5, barLength: 2 },
      { name: "new-take.wav", startBar: 7, barLength: 2 },
      { name: "old-take.wav", startBar: 9, barLength: 2 }
    ]);
    expect(audioClips[2].metadata?.sourceOffsetSeconds).toBeCloseTo(secondsPerBar * 4, 5);
  });

  it("splits fractional recording overwrites and preserves the right-hand source offset", () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const existingOffset = secondsPerBar * 1.25;
    const bedMedia = addImportedAudioMedia(withTrack.project, {
      name: "fractional-bed.wav",
      uri: "project-media/recordings/fractional-bed.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 6,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/recordings/fractional-bed.wav" }
    });
    const bedPlaced = placeAudioClipOnTrack(bedMedia.project, bedMedia.item.id, withTrack.trackId, 2.25);
    const oldClip = bedPlaced.project.timeline.clips.find((clip) => clip.id === bedPlaced.clipId)!;
    oldClip.barLength = 6;
    oldClip.metadata = { ...(oldClip.metadata || {}), sourceOffsetSeconds: existingOffset };
    const punchMedia = addImportedAudioMedia(bedPlaced.project, {
      name: "fractional-punch.wav",
      uri: "project-media/recordings/fractional-punch.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 2,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/recordings/fractional-punch.wav" }
    });

    const punched = placeRecordingClipOnTrack(punchMedia.project, punchMedia.item.id, withTrack.trackId, 4.5);
    const audioClips = punched.project.timeline.clips
      .filter((clip) => clip.trackId === withTrack.trackId && clip.type === "audio")
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(audioClips.map((clip) => ({ name: clip.name, startBar: clip.startBar, barLength: clip.barLength }))).toEqual([
      { name: "fractional-bed.wav", startBar: 2.25, barLength: 2.25 },
      { name: "fractional-punch.wav", startBar: 4.5, barLength: 2 },
      { name: "fractional-bed.wav", startBar: 6.5, barLength: 1.75 }
    ]);
    expect(audioClips[2].metadata?.sourceOffsetSeconds).toBeCloseTo(existingOffset + secondsPerBar * 4.25, 5);
  });

  it("keeps preparation and input preview before count-in and capture for stopped transport", () => {
    const plan = buildRecordingStartupPlan({ transportAlreadyPlaying: false, countInSeconds: 2 });

    expect(plan).toEqual([
      "prepare-timeline-audio",
      "open-input-preview",
      "count-in",
      "start-backing-playback",
      "start-native-capture"
    ]);
    expect(plan.indexOf("prepare-timeline-audio")).toBeLessThan(plan.indexOf("count-in"));
    expect(plan.indexOf("open-input-preview")).toBeLessThan(plan.indexOf("start-native-capture"));
  });

  it("does not restart backing playback when recording starts during active transport", () => {
    const plan = buildRecordingStartupPlan({ transportAlreadyPlaying: true, countInSeconds: 0 });

    expect(plan).toEqual(["prepare-timeline-audio", "open-input-preview", "start-native-capture"]);
  });

  it("invalidates stale recording session completion after count-in cancellation", () => {
    const countingIn = createRecordingUiState({ status: "count-in", sessionId: 12, trackId: "live-vocals", startBar: 2.5 });
    const cancelled = createRecordingUiState({ message: "Recording count-in cancelled." });

    expect(recordingSessionMatches(countingIn, 12, ["count-in"])).toBe(true);
    expect(recordingSessionMatches(cancelled, 12, ["count-in", "recording", "stopping"])).toBe(false);
  });

  it("plans recording start failure cleanup for capture and backing playback independently", () => {
    expect(recordingStartFailureCleanupPlan({ nativeCaptureStarted: false, backingPlaybackStarted: true })).toEqual({
      stopNativeCapture: false,
      stopBackingPlayback: true
    });
    expect(recordingStartFailureCleanupPlan({ nativeCaptureStarted: true, backingPlaybackStarted: false })).toEqual({
      stopNativeCapture: true,
      stopBackingPlayback: false
    });
  });

  it("maps native recording counters into diagnostic media metadata", () => {
    expect(buildNativeRecordingDiagnosticsMetadata({
      recordingSessionId: 42,
      requestedStartBar: 2.5,
      requestedStartSeconds: 6,
      requestedSampleRate: 44100,
      captureSampleRate: 48000,
      captureStartedAtUnixMs: 123456,
      inputFrameCount: 512,
      capturedFrameCount: 384,
      captureStartInputFrame: 128,
      firstInputFrame: 130,
      droppedInputFrameCount: 2,
      monitorBufferedFrameCount: 8,
      monitorUnderrunCount: 3,
      monitorOverrunCount: 4
    })).toEqual({
      nativeRecordingSessionId: 42,
      nativeRequestedStartBar: 2.5,
      nativeRequestedStartSeconds: 6,
      nativeRequestedSampleRate: 44100,
      nativeCaptureSampleRate: 48000,
      nativeCaptureStartedAtUnixMs: 123456,
      nativeInputFrameCount: 512,
      nativeCapturedFrameCount: 384,
      nativeCaptureStartInputFrame: 128,
      nativeFirstInputFrame: 130,
      nativeDroppedInputFrameCount: 2,
      nativeMonitorBufferedFrameCount: 8,
      nativeMonitorUnderrunCount: 3,
      nativeMonitorOverrunCount: 4
    });
  });

  it("keeps native recording browser fallback diagnostics explicit", async () => {
    const status = await nativeRecordingStatus();

    expect(status).toMatchObject({
      backend: "browser",
      available: false,
      recordingSessionId: null,
      requestedStartBar: null,
      requestedStartSeconds: null,
      requestedSampleRate: 0,
      captureSampleRate: 0
    });
  });

  it("maps native playback capture anchors into diagnostic media metadata", () => {
    expect(buildNativeRecordingDiagnosticsMetadata({
      playbackCaptureAnchor: {
        source: "capture-request",
        snapshotMonotonicMs: 1200.25,
        active: true,
        playing: true,
        positionSeconds: 8.5,
        renderedFrameCount: 408000,
        startedGeneration: 7,
        sampleRate: 48000,
        channels: 2
      },
      playbackStopAnchor: {
        source: "stop-request",
        snapshotMonotonicMs: 3400.75,
        active: true,
        playing: true,
        positionSeconds: 10.75,
        renderedFrameCount: 516000,
        startedGeneration: 7,
        sampleRate: 48000,
        channels: 2
      }
    })).toMatchObject({
      nativePlaybackCaptureAnchorSource: "capture-request",
      nativePlaybackCaptureAnchorMonotonicMs: 1200,
      nativePlaybackCaptureActive: true,
      nativePlaybackCapturePlaying: true,
      nativePlaybackCapturePositionSeconds: 8.5,
      nativePlaybackCaptureRenderedFrameCount: 408000,
      nativePlaybackCaptureStartedGeneration: 7,
      nativePlaybackCaptureSampleRate: 48000,
      nativePlaybackCaptureChannels: 2,
      nativePlaybackStopAnchorSource: "stop-request",
      nativePlaybackStopAnchorMonotonicMs: 3400,
      nativePlaybackStopActive: true,
      nativePlaybackStopPlaying: true,
      nativePlaybackStopPositionSeconds: 10.75,
      nativePlaybackStopRenderedFrameCount: 516000,
      nativePlaybackStopStartedGeneration: 7,
      nativePlaybackStopSampleRate: 48000,
      nativePlaybackStopChannels: 2
    });
  });

  it("summarizes loopback calibration measurements without applying compensation", () => {
    const report = buildLoopbackCalibrationReport([
      { detectedOffsetSeconds: 0.011, droppedInputFrameCount: 0, monitorUnderrunCount: 1 },
      { detectedOffsetSeconds: 0.014, droppedInputFrameCount: 2 },
      { detectedOffsetSeconds: 0.009 },
      { detectedOffsetSeconds: 0.013 },
      { detectedOffsetSeconds: 0.012 },
      { detectedOffsetSeconds: 0.015 },
      { detectedOffsetSeconds: 0.010 },
      { detectedOffsetSeconds: 0.016, monitorOverrunCount: 1 },
      { detectedOffsetSeconds: 0.012 },
      { detectedOffsetSeconds: 0.018 },
      { detectedOffsetSeconds: Number.NaN, droppedInputFrameCount: 99 }
    ]);

    expect(report).toMatchObject({
      takeCount: 11,
      validTakeCount: 10,
      readyForCompensationReview: true,
      minOffsetSeconds: 0.009,
      medianOffsetSeconds: 0.0125,
      p95OffsetSeconds: 0.018,
      maxOffsetSeconds: 0.018,
      droppedInputFrameCount: 2,
      monitorUnderrunCount: 1,
      monitorOverrunCount: 1,
      compensationApplied: false,
      appliedCompensationSeconds: 0
    });
    expect(report.averageOffsetSeconds).toBeCloseTo(0.013, 5);
    expect(report.standardDeviationSeconds).toBeGreaterThan(0);
  });

  it("adds a visible warning when a recorded take dropped native input frames", () => {
    expect(buildRecordingCompletionMessage({
      baseMessage: "Recorded take.wav to project-media/recordings/take.wav.",
      droppedInputFrameCount: 128
    })).toBe("Recorded take.wav to project-media/recordings/take.wav. Warning: 128 native input frames were dropped before the WAV was finalized.");

    expect(buildRecordingCompletionMessage({
      baseMessage: "Recorded take.wav to project-media/recordings/take.wav.",
      droppedInputFrameCount: 0
    })).toBe("Recorded take.wav to project-media/recordings/take.wav.");
  });
});
