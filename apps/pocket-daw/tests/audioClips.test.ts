import { describe, expect, it } from "vitest";
import { audioRegionEnvelopeGainAt, audioRegionPlaybackWindow, normalizeAudioClipProperties, renderTimelineAudioRegions } from "../src/audio/audioRegions";
import { createDemoProject } from "../src/demo/demoProject";
import { addImportedAudioMedia, detectAudioTransientsFromPeaks, placeAudioClipOnTimeline, placeAudioClipOnTrack, updateAudioMediaAnalysis, updateAudioMediaReloadAnalysis } from "../src/daw/audioClips";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { createAutomationLane } from "../src/daw/automation";
import { activateAudioTake, activateAudioTakeLane, setAudioClipProperty, setAudioTakeArchived } from "../src/daw/clips";
import { timelineSecondsAtBar } from "../src/daw/timeline";

describe("audio media and clips", () => {
  it("creates audio media pool items with lightweight waveform metadata", () => {
    const result = addImportedAudioMedia(createDemoProject(), {
      name: "Lead Vocal.wav",
      uri: "C:\\Sessions\\Lead Vocal.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2,
      sizeBytes: 2048,
      metadata: { waveformPeaks: [0.1, 0.5, 0.2] }
    });

    expect(result.item).toMatchObject({ kind: "audio", name: "Lead Vocal.wav", durationSeconds: 8, sampleRate: 48000, channels: 2 });
    expect(result.item.metadata).toMatchObject({ external: true, missing: false, unresolved: false, waveformPeaks: [0.1, 0.5, 0.2] });
    expect(result.project.mediaPool[0]).toEqual(result.item);
  });

  it("places imported audio on a media track and preserves metadata through project roundtrip", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    const imported = addImportedAudioMedia(project, {
      name: "Room Loop.ogg",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 1,
      metadata: {
        runtimeOnly: true,
        waveformPeaks: [0.2, 0.7],
        sourceEncoding: "ogg",
        decodedMimeType: "audio/wav",
        nativeDecoder: "symphonia-0.6",
        nativeDecoded: true
      }
    });

    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 5);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(placed.project));

    expect(placed.trackId).toBe("audio");
    expect(clip).toMatchObject({ type: "audio", mediaPoolItemId: imported.item.id, startBar: 5, trackId: "audio" });
    expect(parsed.mediaPool[0].metadata).toMatchObject({
      runtimeOnly: true,
      waveformPeaks: [0.2, 0.7],
      sourceEncoding: "ogg",
      decodedMimeType: "audio/wav",
      nativeDecoder: "symphonia-0.6",
      nativeDecoded: true
    });
  });

  it("clears stale waveform flags when fresh audio analysis is written", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Relinked Vocal.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 1,
      metadata: {
        waveformPeaks: [0.1],
        audioTransientMarkersSeconds: [0.4, 0.9],
        audioTransientThreshold: 0.42,
        audioTransientPeakCount: 12,
        audioTransientMaxPeak: 0.91,
        audioTransientUpdatedAt: "2026-01-01T00:00:00.000Z",
        analysisInvalidated: true,
        waveformNeedsRefresh: true
      }
    });

    const updated = updateAudioMediaAnalysis(imported.project, imported.item.id, {
      durationSeconds: 5,
      sampleRate: 48000,
      channels: 2,
      waveformPeaks: [0.2, 0.8]
    });

    const metadata = updated.mediaPool.find((item) => item.id === imported.item.id)?.metadata;
    expect(metadata).toMatchObject({
      waveformPeaks: [0.2, 0.8],
      analysisInvalidated: false,
      waveformNeedsRefresh: false,
      missing: false,
      unresolved: false
    });
    expect(metadata?.audioTransientMarkersSeconds).toBeUndefined();
    expect(metadata?.audioTransientThreshold).toBeUndefined();
    expect(metadata?.audioTransientPeakCount).toBeUndefined();
    expect(metadata?.audioTransientMaxPeak).toBeUndefined();
    expect(metadata?.audioTransientUpdatedAt).toBeUndefined();
    expect(updated.mediaPool.find((item) => item.id === imported.item.id)).toMatchObject({
      durationSeconds: 5,
      sampleRate: 48000,
      channels: 2
    });
  });

  it("records successful decoded-cache reload repairs without replacing source annotations", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Missing FLAC.flac",
      uri: "D:\\Lost\\Missing FLAC.flac",
      mimeType: "audio/flac",
      durationSeconds: 3,
      sampleRate: 44100,
      channels: 2,
      metadata: {
        external: true,
        missing: true,
        unresolved: true,
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/media-002-missing-flac.wav",
        userNote: "keep this annotation",
        waveformNeedsRefresh: true
      }
    });

    const updated = updateAudioMediaReloadAnalysis(imported.project, imported.item.id, {
      mimeType: "audio/wav",
      durationSeconds: 3.5,
      sampleRate: 48000,
      channels: 1,
      sizeBytes: 168000,
      waveformPeaks: [0.1, 0.6, 0.2],
      metadata: {
        sourceEncoding: "flac",
        decodedMimeType: "audio/wav",
        nativeDecoded: true
      }
    }, {
      kind: "decoded-cache",
      path: "project-cache/native-audio/imports/media-002-missing-flac.wav"
    });
    const item = updated.mediaPool.find((entry) => entry.id === imported.item.id)!;

    expect(item.uri).toBe("D:\\Lost\\Missing FLAC.flac");
    expect(item).toMatchObject({ mimeType: "audio/wav", durationSeconds: 3.5, sampleRate: 48000, channels: 1, sizeBytes: 168000 });
    expect(item.metadata).toMatchObject({
      userNote: "keep this annotation",
      waveformPeaks: [0.1, 0.6, 0.2],
      missing: false,
      unresolved: false,
      waveformNeedsRefresh: false,
      sourceEncoding: "flac",
      decodedMimeType: "audio/wav",
      nativeDecoded: true,
      lastReloadSourceKind: "decoded-cache",
      lastReloadSourcePath: "project-cache/native-audio/imports/media-002-missing-flac.wav",
      restoredFromNativeDecodedCache: true
    });
  });

  it("detects source-preserving transient candidates from waveform peaks", () => {
    const analysis = detectAudioTransientsFromPeaks([0.05, 0.72, 0.2, 0.15, 0.86, 0.3], 6);

    expect(analysis).toEqual({
      markersSeconds: [1.5, 4.5],
      threshold: 0.473,
      peakCount: 6,
      maxPeak: 0.86
    });
  });

  it("uses exact fractional bar lengths for imported audio clips", () => {
    const project = createDemoProject();
    const secondsPerBar = project.project.timeSig * (60 / project.project.bpm);
    for (const bars of [1.25, 2.5, 7.75]) {
      const imported = addImportedAudioMedia(project, {
        name: `${bars} Bars.wav`,
        durationSeconds: secondsPerBar * bars,
        sampleRate: 44100,
        channels: 2
      });

      const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
      const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;

      expect(clip.barLength).toBeCloseTo(bars, 5);
    }
  });

  it("uses active meter-map bar lengths when placing imported audio clips", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
      { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
    ];
    const imported = addImportedAudioMedia(project, {
      name: "Metered loop.wav",
      durationSeconds: 3.25,
      sampleRate: 48000,
      channels: 2
    });

    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;

    expect(clip.barLength).toBeCloseTo(2, 5);
  });

  it("uses active meter-map seconds for invalid audio duration fallback", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" }
    ];
    const imported = addImportedAudioMedia(project, {
      name: "Meter Fallback.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.barLength = 1;
    const expectedDuration = timelineSecondsAtBar(placed.project, 3) - timelineSecondsAtBar(placed.project, 2);

    const edited = setAudioClipProperty(placed.project, clip.id, "durationSeconds", Number.NaN);

    expect(edited.timeline.clips.find((item) => item.id === clip.id)?.metadata?.durationSeconds).toBeCloseTo(expectedDuration, 5);
  });

  it("uses active meter-map seconds when overwriting audio clip source windows", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
      { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
    ];
    const bed = addImportedAudioMedia(project, {
      name: "Bed.wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2
    });
    const bedPlaced = placeAudioClipOnTimeline(bed.project, bed.item.id, 2);
    const bedClip = bedPlaced.project.timeline.clips.find((item) => item.id === bedPlaced.clipId)!;
    bedClip.barLength = 3;
    const punch = addImportedAudioMedia(bedPlaced.project, {
      name: "Punch.wav",
      durationSeconds: 1.5,
      sampleRate: 48000,
      channels: 2
    });

    const overwritten = placeAudioClipOnTrack(punch.project, punch.item.id, bedPlaced.trackId, 3, { overwriteOverlaps: true });
    const bedSegments = overwritten.project.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === bed.item.id)
      .sort((a, b) => a.startBar - b.startBar);

    expect(bedSegments.map((clip) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [4, 1]]);
    expect(bedSegments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 3.25]);
  });

  it("places additional imported audio on a visible new media lane", () => {
    const first = addImportedAudioMedia(createDemoProject(), {
      name: "First Loop.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 2
    });
    const firstPlaced = placeAudioClipOnTimeline(first.project, first.item.id, 1);
    const second = addImportedAudioMedia(firstPlaced.project, {
      name: "Second Loop.mp3",
      durationSeconds: 8,
      sampleRate: 44100,
      channels: 2
    });

    const secondPlaced = placeAudioClipOnTimeline(second.project, second.item.id, 1);

    expect(secondPlaced.trackId).toBe("audio-2");
    expect(secondPlaced.project.tracks.find((track) => track.id === "audio-2")?.name).toContain("Second Loop");
    expect(secondPlaced.project.timeline.clips.filter((clip) => clip.type === "audio").map((clip) => clip.trackId)).toEqual(["audio", "audio-2"]);
  });

  it("calculates audio regions and reports missing media without crashing", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Hit.wav",
      durationSeconds: 2,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    placed.project.timeline.clips.push({
      ...placed.project.timeline.clips.find((clip) => clip.id === placed.clipId)!,
      id: "missing_audio",
      mediaPoolItemId: "not_found",
      name: "Missing audio"
    });

    const rendered = renderTimelineAudioRegions(placed.project);

    expect(rendered.audioRegions).toHaveLength(1);
    expect(rendered.audioRegions[0]).toMatchObject({ clipId: placed.clipId, trackId: "audio", mediaPoolItemId: imported.item.id });
    expect(rendered.audioRegions[0].startTimeSeconds).toBeGreaterThan(0);
    expect(rendered.warnings[0]).toContain("Missing audio");
  });

  it("places audio regions on the tempo-automated project timeline", () => {
    let project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project = createAutomationLane(project, "project.tempo", {
      min: 40,
      max: 240,
      points: [{ bar: 1, value: 60, curve: "hold" }]
    }).project;
    const imported = addImportedAudioMedia(project, {
      name: "Tempo Lane Audio.wav",
      durationSeconds: 12,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.barLength = 2;

    const rendered = renderTimelineAudioRegions(placed.project);

    expect(rendered.audioRegions[0]).toMatchObject({
      clipId: placed.clipId,
      startTimeSeconds: 4,
      durationSeconds: 8
    });
  });


  it("keeps archived grouped takes out of audible audio regions while preserving media", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(project, {
      name: "Lead keep.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "region-takes-a" }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 1);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Lead archive.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "region-takes-a" }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 1);
    const activeSecond = activateAudioTake(secondPlaced.project, secondPlaced.clipId).project;
    const archived = setAudioTakeArchived(activeSecond, secondPlaced.clipId, true).project;
    const restored = setAudioTakeArchived(archived, secondPlaced.clipId, false).project;
    const reactivated = activateAudioTake(restored, secondPlaced.clipId).project;

    expect(renderTimelineAudioRegions(archived).audioRegions.map((region) => region.clipId)).not.toContain(secondPlaced.clipId);
    expect(archived.mediaPool.find((item) => item.id === secondImport.item.id)).toBeTruthy();
    expect(renderTimelineAudioRegions(reactivated).audioRegions.map((region) => region.clipId)).toContain(secondPlaced.clipId);
  });

  it("activates every clip in a grouped take lane for lane auditioning", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(project, {
      name: "Lane A.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lane-audition-group" }
    });
    const firstLeft = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 1);
    const firstRight = placeAudioClipOnTrack(firstLeft.project, firstImport.item.id, firstLeft.trackId, 3);
    const secondImport = addImportedAudioMedia(firstRight.project, {
      name: "Lane B.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lane-audition-group" }
    });
    const secondLeft = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstLeft.trackId, 1);
    const secondRight = placeAudioClipOnTrack(secondLeft.project, secondImport.item.id, firstLeft.trackId, 3);
    const prepared = {
      ...secondRight.project,
      timeline: {
        ...secondRight.project.timeline,
        clips: secondRight.project.timeline.clips.map((clip) => {
          if (clip.id === firstLeft.clipId || clip.id === firstRight.clipId) {
            return { ...clip, muted: false, metadata: { ...(clip.metadata || {}), takeLaneId: "lane-a", takeLaneIndex: 1, takeStatus: "active", takeActive: true } };
          }
          if (clip.id === secondLeft.clipId || clip.id === secondRight.clipId) {
            return { ...clip, muted: true, metadata: { ...(clip.metadata || {}), takeLaneId: "lane-b", takeLaneIndex: 2, takeStatus: "muted-take", takeActive: false } };
          }
          return clip;
        })
      }
    };

    const auditioned = activateAudioTakeLane(prepared, secondLeft.clipId);
    const byId = new Map(auditioned.project.timeline.clips.map((clip) => [clip.id, clip]));

    expect(auditioned.status).toBe("Activated take lane lane-b for Lane B.wav.");
    expect([firstLeft.clipId, firstRight.clipId].map((id) => byId.get(id))).toEqual([
      expect.objectContaining({ muted: true, metadata: expect.objectContaining({ takeStatus: "muted-take", takeActive: false }) }),
      expect.objectContaining({ muted: true, metadata: expect.objectContaining({ takeStatus: "muted-take", takeActive: false }) })
    ]);
    expect([secondLeft.clipId, secondRight.clipId].map((id) => byId.get(id))).toEqual([
      expect.objectContaining({ muted: false, metadata: expect.objectContaining({ takeStatus: "active", takeActive: true }) }),
      expect.objectContaining({ muted: false, metadata: expect.objectContaining({ takeStatus: "active", takeActive: true }) })
    ]);
    expect(renderTimelineAudioRegions(auditioned.project).audioRegions.map((region) => region.clipId).sort()).toEqual([secondLeft.clipId, secondRight.clipId].sort());
  });

  it("normalizes and evaluates linear audio clip fades", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Fade.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), gain: 0.8, fadeInSeconds: 1, fadeOutSeconds: 1 };
    const region = renderTimelineAudioRegions(placed.project).audioRegions[0];

    expect(region.fadeInSeconds).toBe(1);
    expect(audioRegionEnvelopeGainAt(region, 0)).toBeCloseTo(0, 5);
    expect(audioRegionEnvelopeGainAt(region, 0.5)).toBeCloseTo(0.4, 5);
    expect(audioRegionEnvelopeGainAt(region, 2)).toBeCloseTo(0.8, 5);
    expect(audioRegionEnvelopeGainAt(region, 3.5)).toBeCloseTo(0.4, 5);
  });

  it("applies non-destructive phase inversion to audio region gain envelopes", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Phase.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), gain: 0.8, invertPhase: true };

    const region = renderTimelineAudioRegions(placed.project).audioRegions[0];

    expect(region.phaseMultiplier).toBe(-1);
    expect(audioRegionEnvelopeGainAt(region, 2)).toBeCloseTo(-0.8, 5);
  });

  it("maps reversed audio regions onto the selected source window", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const imported = addImportedAudioMedia(project, {
      name: "Reverse Window.wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.barLength = 1;
    clip.metadata = { ...(clip.metadata || {}), sourceOffsetSeconds: 2, reversed: true };

    const region = renderTimelineAudioRegions(placed.project).audioRegions[0];

    expect(region.reversed).toBe(true);
    expect(region.durationSeconds).toBe(2);
    expect(audioRegionPlaybackWindow(region, 10, 0)).toEqual({ sourceOffsetSeconds: 6, sourceDurationSeconds: 2, durationSeconds: 2 });
    expect(audioRegionPlaybackWindow(region, 10, 0.5)).toEqual({ sourceOffsetSeconds: 6.5, sourceDurationSeconds: 1.5, durationSeconds: 1.5 });
  });

  it("maps varispeed audio clips to faster source windows without changing source media", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const imported = addImportedAudioMedia(project, {
      name: "Varispeed.wav",
      durationSeconds: 12,
      sampleRate: 48000,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.barLength = 2;
    clip.metadata = { ...(clip.metadata || {}), sourceOffsetSeconds: 1, playbackRate: 2, pitchSemitones: 12 };

    const region = renderTimelineAudioRegions(placed.project).audioRegions[0];

    expect(region.playbackRate).toBe(4);
    expect(region.pitchSemitones).toBe(12);
    expect(region.durationSeconds).toBe(2.75);
    expect(audioRegionPlaybackWindow(region, 12, 1)).toEqual({ sourceOffsetSeconds: 5, sourceDurationSeconds: 7, durationSeconds: 1.75 });
  });

  it("applies clip gain automation to audio region envelopes", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const imported = addImportedAudioMedia(project, {
      name: "Automated.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 2
    });
    let placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    placed = {
      ...placed,
      project: createAutomationLane(placed.project, `clips.${placed.clipId}.gain`, {
        min: 0,
        max: 4,
        points: [
          { bar: 1, value: 0.5 },
          { bar: 2, value: 1 }
        ]
      }).project
    };

    const region = renderTimelineAudioRegions(placed.project).audioRegions[0];

    expect(region.gain).toBe(1);
    expect(region.gainAutomation).toEqual([
      expect.objectContaining({ localSeconds: 0, value: 0.5 }),
      expect.objectContaining({ localSeconds: 2, value: 1 }),
      expect.objectContaining({ localSeconds: 4, value: 1 })
    ]);
    expect(audioRegionEnvelopeGainAt(region, 0)).toBeCloseTo(0.5, 5);
    expect(audioRegionEnvelopeGainAt(region, 1)).toBeCloseTo(0.75, 5);
  });

  it("applies ease curves to clip gain automation envelopes", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const imported = addImportedAudioMedia(project, {
      name: "Curved.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 2
    });
    let placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    placed = {
      ...placed,
      project: createAutomationLane(placed.project, `clips.${placed.clipId}.gain`, {
        min: 0,
        max: 4,
        points: [
          { bar: 1, value: 0, curve: "ease-out" },
          { bar: 2, value: 1, curve: "linear" }
        ]
      }).project
    };

    const region = renderTimelineAudioRegions(placed.project).audioRegions[0];

    expect(audioRegionEnvelopeGainAt(region, 1)).toBeCloseTo(0.75, 5);
  });

  it("applies clip fade and source-offset automation to rendered audio regions", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const imported = addImportedAudioMedia(project, {
      name: "Fade automation.wav",
      durationSeconds: 12,
      sampleRate: 44100,
      channels: 2
    });
    let placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    placed = {
      ...placed,
      project: createAutomationLane(placed.project, `clips.${placed.clipId}.fadeInSeconds`, {
        min: 0,
        max: 86400,
        points: [{ bar: 1, value: 1.25 }]
      }).project
    };
    placed = {
      ...placed,
      project: createAutomationLane(placed.project, `clips.${placed.clipId}.fadeOutSeconds`, {
        min: 0,
        max: 86400,
        points: [{ bar: 1, value: 0.75 }]
      }).project
    };
    placed = {
      ...placed,
      project: createAutomationLane(placed.project, `clips.${placed.clipId}.sourceOffsetSeconds`, {
        min: 0,
        max: 86400,
        points: [{ bar: 1, value: 2.5 }]
      }).project
    };

    const region = renderTimelineAudioRegions(placed.project).audioRegions[0];

    expect(region.fadeInSeconds).toBe(1.25);
    expect(region.fadeOutSeconds).toBe(0.75);
    expect(region.sourceOffsetSeconds).toBe(2.5);
    expect(audioRegionEnvelopeGainAt(region, 0.625)).toBeCloseTo(0.5, 5);
    expect(audioRegionPlaybackWindow(region, 12, 0)).toMatchObject({ sourceOffsetSeconds: 2.5 });
  });

  it("reports repaired audio clip metadata without changing the serialized layout", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Repair.wav",
      durationSeconds: 2,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    const media = placed.project.mediaPool.find((item) => item.id === imported.item.id)!;
    clip.metadata = {
      ...(clip.metadata || {}),
      sourceOffsetSeconds: 10,
      durationSeconds: 10,
      gain: "loud",
      fadeInSeconds: 4,
      fadeOutSeconds: 4
    };

    const properties = normalizeAudioClipProperties(placed.project, clip, media);

    expect(properties.sourceOffsetSeconds).toBe(2);
    expect(properties.durationSeconds).toBe(0);
    expect(properties.gain).toBe(1);
    expect(properties.fadeInSeconds).toBe(0);
    expect(properties.fadeOutSeconds).toBe(0);
    expect(properties.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["capped", "invalid"]));
    expect(clip.metadata.durationSeconds).toBe(10);
  });

  it("scales overlong fades proportionally for non-zero audio regions", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Overlong Fade.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    const media = placed.project.mediaPool.find((item) => item.id === imported.item.id)!;
    clip.metadata = { ...(clip.metadata || {}), fadeInSeconds: 3, fadeOutSeconds: 3 };

    const properties = normalizeAudioClipProperties(placed.project, clip, media);

    expect(properties.fadeInSeconds).toBeCloseTo(2, 5);
    expect(properties.fadeOutSeconds).toBeCloseTo(2, 5);
    expect(properties.diagnostics).toContainEqual(expect.objectContaining({ field: "fadeInSeconds", code: "scaled" }));
  });
});
