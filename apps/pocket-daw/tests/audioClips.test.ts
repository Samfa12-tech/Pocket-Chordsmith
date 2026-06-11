import { describe, expect, it } from "vitest";
import { renderTimelineAudioRegions } from "../src/audio/audioRegions";
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
});
