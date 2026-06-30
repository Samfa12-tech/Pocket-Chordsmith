import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "../src/daw/audioClips";
import { addMediaPoolItem, createMediaPoolItem } from "../src/daw/mediaPool";
import { validateProjectInvariants } from "../src/daw/projectInvariants";

describe("project invariant validation", () => {
  it("accepts the demo project without blocking errors", () => {
    const report = validateProjectInvariants(createDemoProject());

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("reports duplicate ids and dangling audio references", () => {
    const project = createDemoProject();
    project.timeline.markers.push({ ...project.timeline.markers[0] });
    project.timeline.clips.push({
      ...project.timeline.clips[0],
      id: "bad_audio",
      type: "audio",
      trackId: "missing-track",
      mediaPoolItemId: "missing-media",
      metadata: { durationSeconds: -1, sourceOffsetSeconds: Number.NaN }
    });

    const report = validateProjectInvariants(project);
    const codes = report.errors.map((issue) => issue.code);

    expect(report.ok).toBe(false);
    expect(codes).toEqual(expect.arrayContaining(["duplicate-id", "missing-clip-track", "missing-clip-media", "invalid-audio-clip-metadata"]));
  });

  it("warns when schema-valid control clip types are present", () => {
    const project = createDemoProject();
    project.timeline.clips.push({
      ...project.timeline.clips[0],
      id: "marker_clip",
      type: "marker"
    });

    const report = validateProjectInvariants(project);

    expect(report.warnings.map((issue) => issue.code)).toContain("control-only-clip-type");
  });

  it("warns when audio clips rely on missing or stale waveform analysis", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Relinked.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 2,
      metadata: {
        waveformPeaks: [],
        analysisInvalidated: true,
        waveformNeedsRefresh: true
      }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);

    const report = validateProjectInvariants(placed.project);

    expect(report.ok).toBe(true);
    expect(report.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "stale-audio-waveform-analysis",
      "missing-audio-waveform-analysis"
    ]));
    expect(report.warnings.map((issue) => issue.message).join("\n")).toContain("stale waveform analysis");
  });

  it("warns when stored project-relative media paths are unsafe", () => {
    const unsafe = createMediaPoolItem({
      kind: "audio",
      name: "Unsafe.wav",
      uri: "project-media/../Unsafe.wav",
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/../Unsafe.wav",
        nativeDecodedCacheRelativePath: "project-cache/../decoded.wav"
      }
    });
    const project = addMediaPoolItem(createDemoProject(), unsafe);

    const report = validateProjectInvariants(project);

    expect(report.ok).toBe(true);
    expect(report.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "unsafe-project-media-path",
      "unsafe-decoded-cache-path",
      "unsafe-project-media-uri"
    ]));
  });

  it("warns when audio take status metadata is unknown", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Odd take.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [0.5] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), takeStatus: "future-take-status" };

    const report = validateProjectInvariants(placed.project);

    expect(report.ok).toBe(true);
    expect(report.warnings.map((issue) => issue.code)).toContain("invalid-audio-take-status");
  });
});
