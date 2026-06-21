import { describe, expect, it } from "vitest";
import { audioRegionEnvelopeGainAt, normalizeAudioClipProperties, renderTimelineAudioRegions } from "../src/audio/audioRegions";
import { createDemoProject } from "../src/demo/demoProject";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "../src/daw/audioClips";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";

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
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Room Loop.ogg",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 1,
      metadata: { runtimeOnly: true, waveformPeaks: [0.2, 0.7] }
    });

    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 5);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(placed.project));

    expect(placed.trackId).toBe("audio");
    expect(clip).toMatchObject({ type: "audio", mediaPoolItemId: imported.item.id, startBar: 5, trackId: "audio" });
    expect(parsed.mediaPool[0].metadata).toMatchObject({ runtimeOnly: true, waveformPeaks: [0.2, 0.7] });
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
