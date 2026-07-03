import { describe, expect, it } from "vitest";
import { buildMetronomeClicks, buildTransportMetronomeSchedule, countInSeconds } from "../src/audio/metronome";
import { renderTimelineAudioRegions } from "../src/audio/audioRegions";
import { placePunchRecordingClipCommand, placePunchRecordingClipFromRangeCommand, setPunchRangeCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { addImportedAudioMedia, placeAudioClipOnTrack, placePunchRecordingClipOnTrack, placeRecordingClipOnTrack, placeTakeLaneRecordingClipOnTrack } from "../src/daw/audioClips";
import { audioClipTakeSummary } from "../src/daw/clips";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { addTrackToProject, setTrackRecordingLatencyOffset } from "../src/daw/tracks";
import { buildGroupedRecordingCapturePlan, buildRecordingInputPreflight, nativeRecordingAlphaChannelCompatibilityError, setTrackRecordingInputAssignment } from "../src/daw/recordingInputs";
import { timelineBarAtSeconds, timelineSecondsAtBar } from "../src/daw/timeline";
import { createAutomationLane } from "../src/daw/automation";
import { createDemoProject } from "../src/demo/demoProject";
import {
  buildLoopbackCalibrationReport,
  buildNativeRecordingDiagnosticsMetadata,
  buildNativeRecordingTakeMetadata,
  buildRecordingCompletionMessage,
  buildRecordingStartupPlan,
  beginRecordingSession,
  cancelRecordingSession,
  transitionRecordingSession,
  recordingStartFailureCleanupPlan
} from "../src/app/recordingOrchestration";
import { createRecordingUiState, recordingSessionMatches } from "../src/app/state";
import { nativeRecordingStatus } from "../src/native/recordingBridge";
import { createUndoStack } from "../src/daw/undo";

describe("recording alpha foundations", () => {
  it("migrates metronome and monitor defaults without changing old save compatibility", () => {
    const oldProject = JSON.parse(buildPocketDawProjectFile(createDemoProject()));
    delete oldProject.project.metronome;
    oldProject.tracks.forEach((track: Record<string, unknown>) => delete track.monitorEnabled);

    const migrated = migratePocketDawProject(oldProject);

    expect(migrated.project.metronome).toMatchObject({ enabled: false, countInBars: 1, volume: 0.55 });
    expect(migrated.tracks.every((track) => track.monitorEnabled === false)).toBe(true);
    expect(migrated.tracks.every((track) => track.recordingChannelMode === "mono")).toBe(true);
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

  it("generates metronome timing through project tempo automation", () => {
    let project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.metronome = { enabled: true, countInBars: 1, volume: 0.55 };
    project = createAutomationLane(project, "project.tempo", {
      min: 40,
      max: 240,
      points: [{ bar: 1, value: 60, curve: "hold" }]
    }).project;

    const clicks = buildMetronomeClicks(project, 4, 4);
    const schedule = buildTransportMetronomeSchedule(project, 4.02, null, 2.2);

    expect(countInSeconds(project)).toBeCloseTo(4, 5);
    expect(clicks.map((click) => click.timeSeconds)).toEqual([4, 5, 6, 7]);
    expect(clicks[0]).toMatchObject({ beatIndex: 4, bar: 2, beat: 1, accented: true });
    expect(schedule.clicks.map((click) => click.timeSeconds)).toEqual([4, 5, 6]);
  });

  it("generates metronome beat counts and accents from project meter-map points", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_2", bar: 2, numerator: 7, denominator: 8, source: "manual" }
    ];

    const clicks = buildMetronomeClicks(project, 0, 4);
    const schedule = buildTransportMetronomeSchedule(project, 2.08, null, 0.35);

    expect(clicks.map((click) => `${click.bar}.${click.beat}${click.accented ? "*" : ""}`)).toEqual([
      "1.1*",
      "1.2",
      "1.3",
      "1.4",
      "2.1*",
      "2.2",
      "2.3",
      "2.4",
      "2.5",
      "2.6",
      "2.7",
      "3.1*"
    ]);
    expect(clicks[5].timeSeconds).toBeCloseTo(2.25, 5);
    expect(schedule.clicks.map((click) => click.beatIndex)).toEqual([5]);
    expect(schedule.clicks[0]).toMatchObject({ bar: 2, beat: 2, accented: false });
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
        importMode: "native-recording",
        takeGroupId: "recording-session-99",
        inputMode: "mono",
        channelMap: [0],
        latencyCompensationAppliedSeconds: 0
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
    expect(clip?.metadata).toMatchObject({
      takeGroupId: "recording-session-99",
      takeIndex: 1,
      takeActive: true,
      inputMode: "mono",
      channelMap: [0],
      latencyCompensationAppliedSeconds: 0
    });
  });

  it("builds explicit mono and stereo recording input preflight plans without enabling multitrack", () => {
    let project = addTrackToProject(createDemoProject(), "live-instrument").project;
    project.tracks.find((track) => track.id === "live-instrument")!.armed = true;
    project = setTrackRecordingInputAssignment(project, "live-instrument", {
      deviceId: "usb-interface",
      mode: "stereo",
      channelPair: [2, 3]
    });

    const plan = buildRecordingInputPreflight(project, {
      availableInputDevices: [{ id: "usb-interface", name: "USB Interface", channelCount: 4 }]
    });

    expect(plan.ok).toBe(true);
    expect(plan.mode).toBe("single-track");
    expect(plan.errors).toEqual([]);
    expect(plan.capturePlan).toEqual([{
      trackId: "live-instrument",
      trackName: "Live Instrument",
      deviceId: "usb-interface",
      mode: "stereo",
      channelMap: [2, 3],
      label: "Live Instrument: Stereo Ch 3-4"
    }]);
    expect(nativeRecordingAlphaChannelCompatibilityError(plan.capturePlan[0])).toContain("native recording alpha currently captures Stereo Ch 1-2");
  });

  it("allows current native recording alpha default mono and stereo channel maps", () => {
    let project = addTrackToProject(createDemoProject(), "live-instrument").project;
    project.tracks.find((track) => track.id === "live-instrument")!.armed = true;
    const mono = buildRecordingInputPreflight(project, {
      availableInputDevices: [{ id: "default-input", name: "Default input", channelCount: 2 }]
    });
    project = setTrackRecordingInputAssignment(project, "live-instrument", {
      deviceId: "default-input",
      mode: "stereo",
      channelPair: [0, 1]
    });
    const stereo = buildRecordingInputPreflight(project, {
      availableInputDevices: [{ id: "default-input", name: "Default input", channelCount: 2 }]
    });

    expect(nativeRecordingAlphaChannelCompatibilityError(mono.capturePlan[0])).toBeNull();
    expect(nativeRecordingAlphaChannelCompatibilityError(stereo.capturePlan[0])).toBeNull();
  });

  it("rejects unavailable recording channel assignments before native capture starts", () => {
    let project = addTrackToProject(createDemoProject(), "live-vocals").project;
    project.tracks.find((track) => track.id === "live-vocals")!.armed = true;
    project = setTrackRecordingInputAssignment(project, "live-vocals", {
      deviceId: "small-interface",
      mode: "stereo",
      channelPair: [0, 1]
    });

    const plan = buildRecordingInputPreflight(project, {
      availableInputDevices: [{ id: "small-interface", name: "Small Interface", channelCount: 1 }]
    });

    expect(plan.ok).toBe(false);
    expect(plan.capturePlan).toEqual([]);
    expect(plan.errors.join("\n")).toContain("needs channels 1-2 but Small Interface exposes 1 input channel");
  });

  it("keeps multitrack recording gated behind a valid future preflight mode", () => {
    let project = addTrackToProject(createDemoProject(), "live-vocals").project;
    project = addTrackToProject(project, "live-instrument").project;
    project.tracks.find((track) => track.id === "live-vocals")!.armed = true;
    project.tracks.find((track) => track.id === "live-instrument")!.armed = true;

    const alphaPlan = buildRecordingInputPreflight(project, {
      availableInputDevices: [{ id: "default-input", name: "Default input", channelCount: 2 }]
    });
    const futurePlan = buildRecordingInputPreflight(project, {
      allowMultipleArmedTracks: true,
      availableInputDevices: [{ id: "default-input", name: "Default input", channelCount: 2 }]
    });

    expect(alphaPlan.ok).toBe(false);
    expect(alphaPlan.errors.join("\n")).toContain("Only one live audio track can be armed");
    expect(futurePlan.ok).toBe(false);
    expect(futurePlan.errors.join("\n")).toContain("Recording channel 1 is assigned to both Live Vocals and Live Instrument");
  });

  it("builds a grouped future capture plan with shared take metadata for mono stereo and split-mono assignments", () => {
    let project = addTrackToProject(createDemoProject(), "live-vocals").project;
    project = addTrackToProject(project, "live-instrument").project;
    project = addTrackToProject(project, "live-instrument").project;
    const tracks = project.tracks.filter((track) => track.recordKind && track.recordKind !== "none");
    tracks[0].id = "live-vocals-a";
    tracks[0].name = "Live Vocals";
    tracks[1].id = "live-guitar-a";
    tracks[1].name = "Live Guitar";
    tracks[2].id = "live-room-a";
    tracks[2].name = "Live Room";
    tracks.forEach((track) => {
      track.armed = true;
    });
    project = setTrackRecordingInputAssignment(project, "live-vocals-a", {
      deviceId: "interface-8",
      mode: "mono",
      channelIndex: 0
    });
    project = setTrackRecordingInputAssignment(project, "live-guitar-a", {
      deviceId: "interface-8",
      mode: "split-mono",
      channelIndex: 1
    });
    project = setTrackRecordingInputAssignment(project, "live-room-a", {
      deviceId: "interface-8",
      mode: "stereo",
      channelPair: [2, 3]
    });

    const plan = buildGroupedRecordingCapturePlan(project, {
      availableInputDevices: [{ id: "interface-8", name: "8ch Interface", channelCount: 8 }],
      requestedStartBar: 9.5,
      recordingSessionId: 77,
      takeGroupId: "take-group-77",
      projectRelativeRecordingDir: "project-media/recordings/session-77"
    });

    expect(plan.ok).toBe(true);
    expect(plan.recordingSessionId).toBe(77);
    expect(plan.takeGroupId).toBe("take-group-77");
    expect(plan.requestedStartBar).toBe(9.5);
    expect(plan.items.map((item) => ({
      trackId: item.trackId,
      mode: item.mode,
      channelMap: item.channelMap,
      outputChannels: item.outputChannels,
      fileName: item.fileName,
      projectRelativePath: item.projectRelativePath
    }))).toEqual([
      {
        trackId: "live-vocals-a",
        mode: "mono",
        channelMap: [0],
        outputChannels: 1,
        fileName: "077-live-vocals-ch1.wav",
        projectRelativePath: "project-media/recordings/session-77/077-live-vocals-ch1.wav"
      },
      {
        trackId: "live-guitar-a",
        mode: "split-mono",
        channelMap: [1],
        outputChannels: 1,
        fileName: "077-live-guitar-split-ch2.wav",
        projectRelativePath: "project-media/recordings/session-77/077-live-guitar-split-ch2.wav"
      },
      {
        trackId: "live-room-a",
        mode: "stereo",
        channelMap: [2, 3],
        outputChannels: 2,
        fileName: "077-live-room-ch3-4.wav",
        projectRelativePath: "project-media/recordings/session-77/077-live-room-ch3-4.wav"
      }
    ]);
    expect(plan.items[1].takeMetadata).toMatchObject({
      importMode: "native-recording",
      recordingSessionId: 77,
      takeGroupId: "take-group-77",
      trackId: "live-guitar-a",
      deviceId: "interface-8",
      inputMode: "split-mono",
      channelMap: [1],
      requestedStartBar: 9.5,
      latencyCompensationAppliedSeconds: 0
    });
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

  it("applies visible manual recording latency offsets when placing new takes", () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const project = setTrackRecordingLatencyOffset(withTrack.project, withTrack.trackId, 0.012);
    const imported = addImportedAudioMedia(project, {
      name: "late-vocal-take.wav",
      uri: "project-media/recordings/late-vocal-take.wav",
      mimeType: "audio/wav",
      durationSeconds: 2,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/recordings/late-vocal-take.wav" }
    });

    const placed = placeRecordingClipOnTrack(imported.project, imported.item.id, withTrack.trackId, 5);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId);
    const expectedStartSeconds = timelineSecondsAtBar(project, 5) - 0.012;
    const expectedStoredStartBar = Math.round(timelineBarAtSeconds(project, expectedStartSeconds) * 1000) / 1000;

    expect(clip?.startBar).toBe(expectedStoredStartBar);
    expect(clip?.metadata).toMatchObject({
      latencyCompensationRequestedSeconds: 0.012,
      latencyCompensationAppliedSeconds: 0.012,
      latencyCompensationMode: "manual-track-offset",
      originalRequestedStartBar: 5
    });
    expect(imported.item.metadata?.latencyCompensationAppliedSeconds).toBeUndefined();
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

  it("places a punch recording window from a longer raw take with durable take metadata", () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const bedMedia = addImportedAudioMedia(withTrack.project, {
      name: "punch-bed.wav",
      uri: "project-media/recordings/punch-bed.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 6,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/recordings/punch-bed.wav" }
    });
    const bedPlaced = placeAudioClipOnTrack(bedMedia.project, bedMedia.item.id, withTrack.trackId, 5);
    const oldClip = bedPlaced.project.timeline.clips.find((clip) => clip.id === bedPlaced.clipId)!;
    oldClip.barLength = 6;
    oldClip.metadata = { ...(oldClip.metadata || {}), sourceOffsetSeconds: 0 };
    const rawPunchMedia = addImportedAudioMedia(bedPlaced.project, {
      name: "raw-punch-capture.wav",
      uri: "project-media/recordings/raw-punch-capture.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/recordings/raw-punch-capture.wav",
        importMode: "native-recording",
        recordingTakeId: "punch-take-1",
        recordingTakeGroupId: "punch-group-a",
        takeLaneId: "punch-group-a-lane-1",
        takeLaneIndex: 1,
        nativeRecordingSessionId: 42,
        latencyCompensationAppliedSeconds: 0,
        punchStartBar: 7,
        punchEndBar: 9
      }
    });

    const punched = placePunchRecordingClipOnTrack(rawPunchMedia.project, rawPunchMedia.item.id, withTrack.trackId, {
      captureStartBar: 6,
      punchStartBar: 7,
      punchEndBar: 9
    });
    const audioClips = punched.project.timeline.clips
      .filter((clip) => clip.trackId === withTrack.trackId && clip.type === "audio")
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    const punchClip = audioClips.find((clip) => clip.id === punched.clipId)!;
    const rawMedia = punched.project.mediaPool.find((item) => item.id === rawPunchMedia.item.id)!;
    const reopened = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(punched.project)));
    const reopenedPunch = reopened.timeline.clips.find((clip) => clip.id === punched.clipId)!;
    const roundedPunchOffset = Math.round(secondsPerBar * 1000) / 1000;
    const roundedPunchDuration = Math.round(secondsPerBar * 2 * 1000) / 1000;

    expect(audioClips.map((clip) => ({ name: clip.name, startBar: clip.startBar, barLength: clip.barLength }))).toEqual([
      { name: "punch-bed.wav", startBar: 5, barLength: 2 },
      { name: "raw-punch-capture.wav", startBar: 7, barLength: 2 },
      { name: "punch-bed.wav", startBar: 9, barLength: 2 }
    ]);
    expect(punchClip.metadata).toMatchObject({
      recordingTakeId: "punch-take-1",
      recordingTakeGroupId: "punch-group-a",
      takeLaneId: "punch-group-a-lane-1",
      takeLaneIndex: 1,
      takeStatus: "active",
      sourceOffsetSeconds: roundedPunchOffset,
      sourceDurationSeconds: roundedPunchDuration,
      punchStartBar: 7,
      punchEndBar: 9,
      captureStartBar: 6,
      latencyCompensationAppliedSeconds: 0
    });
    expect(rawMedia.durationSeconds).toBe(secondsPerBar * 4);
    expect(rawMedia.metadata?.punchStartBar).toBe(7);
    expect(rawMedia.metadata?.punchEndBar).toBe(9);
    expect(reopenedPunch.metadata).toMatchObject({
      recordingTakeId: "punch-take-1",
      recordingTakeGroupId: "punch-group-a",
      takeLaneId: "punch-group-a-lane-1",
      sourceOffsetSeconds: roundedPunchOffset,
      sourceDurationSeconds: roundedPunchDuration,
      punchStartBar: 7,
      punchEndBar: 9
    });
  });

  it("places punch recordings through the undoable command path", () => {
    const state = createInitialState();
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const rawPunchMedia = addImportedAudioMedia(withTrack.project, {
      name: "command-punch.wav",
      uri: "project-media/recordings/command-punch.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        recordingTakeId: "command-punch-take-1",
        recordingTakeGroupId: "command-punch-group",
        takeLaneId: "command-punch-group-lane-1"
      }
    });
    state.undoStack = createUndoStack(rawPunchMedia.project);

    const punched = placePunchRecordingClipCommand(state, rawPunchMedia.item.id, withTrack.trackId, 6, 7, 9);
    const punchClip = punched.undoStack.present.timeline.clips.find((clip) => clip.id === punched.selectedClipId)!;

    expect(punchClip).toMatchObject({ trackId: withTrack.trackId, startBar: 7, barLength: 2 });
    expect(punchClip.metadata).toMatchObject({
      recordingTakeId: "command-punch-take-1",
      recordingTakeGroupId: "command-punch-group",
      takeLaneId: "command-punch-group-lane-1",
      sourceOffsetSeconds: Math.round(secondsPerBar * 1000) / 1000,
      sourceDurationSeconds: Math.round(secondsPerBar * 2 * 1000) / 1000,
      punchStartBar: 7,
      punchEndBar: 9,
      captureStartBar: 6
    });
    expect(punched.selectedTrackId).toBe(withTrack.trackId);
    expect(punched.undoStack.past).toHaveLength(1);
    expect(punched.status).toContain("Placed punch take command-punch.wav from bar 7 to 9");
  });

  it("places punch recordings as non-destructive active take lanes", () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const bedMedia = addImportedAudioMedia(withTrack.project, {
      name: "lane-bed.wav",
      uri: "project-media/recordings/lane-bed.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project" }
    });
    const bedPlaced = placeAudioClipOnTrack(bedMedia.project, bedMedia.item.id, withTrack.trackId, 7);
    const rawTake = addImportedAudioMedia(bedPlaced.project, {
      name: "lane-punch.wav",
      uri: "project-media/recordings/lane-punch.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", importMode: "native-recording" }
    });

    const placed = placePunchRecordingClipOnTrack(rawTake.project, rawTake.item.id, withTrack.trackId, {
      captureStartBar: 6,
      punchStartBar: 7,
      punchEndBar: 9,
      createTakeLane: true
    });
    const project = placed.project;
    const bed = project.timeline.clips.find((clip) => clip.id === bedPlaced.clipId)!;
    const punch = project.timeline.clips.find((clip) => clip.id === placed.clipId)!;
    const summary = audioClipTakeSummary(project, placed.clipId);
    const regions = renderTimelineAudioRegions(project).audioRegions;
    const reopened = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(project)));
    const reopenedPunch = reopened.timeline.clips.find((clip) => clip.id === placed.clipId)!;

    expect(bed).toMatchObject({ muted: true, startBar: 7, barLength: 4 });
    expect(punch).toMatchObject({ muted: false, startBar: 7, barLength: 2 });
    expect(bed.metadata).toMatchObject({ takeStatus: "muted-take", takeActive: false, takeLaneIndex: 1 });
    expect(punch.metadata).toMatchObject({
      takeStatus: "active",
      takeActive: true,
      takeLaneIndex: 2,
      punchStartBar: 7,
      punchEndBar: 9,
      punchMode: "create-new-take-lane"
    });
    expect(summary?.takeCount).toBe(2);
    expect(regions.map((region) => region.clipId)).toEqual([placed.clipId]);
    expect(reopenedPunch.metadata).toMatchObject({ takeStatus: "active", takeLaneIndex: 2, punchStartBar: 7, punchEndBar: 9 });
  });

  it("places full recordings as new take lanes without overwriting older material", () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const firstMedia = addImportedAudioMedia(withTrack.project, {
      name: "first-full-take.wav",
      uri: "project-media/recordings/first-full-take.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 2,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project" }
    });
    const firstPlaced = placeAudioClipOnTrack(firstMedia.project, firstMedia.item.id, withTrack.trackId, 3);
    const secondMedia = addImportedAudioMedia(firstPlaced.project, {
      name: "second-full-take.wav",
      uri: "project-media/recordings/second-full-take.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 2,
      sampleRate: 48000,
      channels: 1,
      metadata: { mediaRefKind: "project", importMode: "native-recording" }
    });

    const secondPlaced = placeTakeLaneRecordingClipOnTrack(secondMedia.project, secondMedia.item.id, withTrack.trackId, 3);
    const clips = secondPlaced.project.timeline.clips
      .filter((clip) => clip.trackId === withTrack.trackId && clip.type === "audio")
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(clips).toHaveLength(2);
    expect(clips.map((clip) => [clip.name, clip.muted, clip.metadata?.takeLaneIndex, clip.metadata?.takeStatus])).toEqual([
      ["first-full-take.wav", true, 1, "muted-take"],
      ["second-full-take.wav", false, 2, "active"]
    ]);
    expect(renderTimelineAudioRegions(secondPlaced.project).audioRegions.map((region) => region.clipId)).toEqual([secondPlaced.clipId]);
  });

  it("places punch recordings from the active punch range through the undoable command path", () => {
    let state = createInitialState();
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const rawPunchMedia = addImportedAudioMedia(withTrack.project, {
      name: "range-command-punch.wav",
      uri: "project-media/recordings/range-command-punch.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        recordingTakeId: "range-command-punch-take-1",
        recordingTakeGroupId: "range-command-punch-group",
        takeLaneId: "range-command-punch-group-lane-1"
      }
    });
    state.undoStack = createUndoStack(rawPunchMedia.project);
    state = setPunchRangeCommand(state, 7, 9);

    const punched = placePunchRecordingClipFromRangeCommand(state, rawPunchMedia.item.id, withTrack.trackId, 6);
    const punchClip = punched.undoStack.present.timeline.clips.find((clip) => clip.id === punched.selectedClipId)!;

    expect(punchClip).toMatchObject({ trackId: withTrack.trackId, startBar: 7, barLength: 2 });
    expect(punchClip.metadata).toMatchObject({
      recordingTakeId: "range-command-punch-take-1",
      recordingTakeGroupId: "range-command-punch-group",
      sourceOffsetSeconds: Math.round(secondsPerBar * 1000) / 1000,
      sourceDurationSeconds: Math.round(secondsPerBar * 2 * 1000) / 1000,
      punchStartBar: 7,
      punchEndBar: 9,
      captureStartBar: 6
    });
    expect(punched.undoStack.present.timeline.selection).toEqual({ startBar: 7, endBar: 9, source: "punch" });
    expect(punched.status).toContain("Placed punch take range-command-punch.wav from active punch range 7 to 9");
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

  it("centralizes recording session transitions and rejects stale async completions", () => {
    const preparing = beginRecordingSession({
      sessionId: 77,
      trackId: "live-vocals",
      startBar: 3.5,
      captureStartTransportSeconds: 5,
      timingSource: "prepared-stopped-transport-estimate",
      message: "Preparing Live Vocals recording..."
    });

    const countingIn = transitionRecordingSession({
      recording: preparing,
      sessionId: 77,
      allowedStatuses: ["preparing"],
      patch: { status: "count-in", message: "Count-in 2s." }
    });
    expect(countingIn).toMatchObject({
      status: "count-in",
      sessionId: 77,
      trackId: "live-vocals",
      startBar: 3.5,
      captureStartTransportSeconds: 5,
      livePeaks: []
    });

    const cancelled = cancelRecordingSession("Recording count-in cancelled.");
    expect(transitionRecordingSession({
      recording: cancelled,
      sessionId: 77,
      allowedStatuses: ["count-in"],
      patch: { status: "recording", message: "Stale capture completion." }
    })).toBeNull();
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

  it("builds durable take grouping and channel metadata for native recordings", () => {
    expect(buildNativeRecordingTakeMetadata({
      recordingSessionId: 42,
      trackId: "live-vocals",
      channelMode: "mono"
    })).toEqual({
      takeGroupId: "recording-session-42",
      recordingTakeGroupId: "recording-session-42",
      takeStatus: "active",
      inputMode: "mono",
      channelMap: [0],
      latencyCompensationAppliedSeconds: 0
    });

    expect(buildNativeRecordingTakeMetadata({
      recordingSessionId: 43,
      trackId: "live-instrument",
      channelMode: "stereo"
    })).toMatchObject({
      takeGroupId: "recording-session-43",
      recordingTakeGroupId: "recording-session-43",
      takeStatus: "active",
      inputMode: "stereo",
      channelMap: [0, 1]
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
