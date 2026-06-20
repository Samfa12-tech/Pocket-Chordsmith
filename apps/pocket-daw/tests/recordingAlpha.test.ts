import { describe, expect, it } from "vitest";
import { buildMetronomeClicks, buildTransportMetronomeSchedule, countInSeconds } from "../src/audio/metronome";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { addImportedAudioMedia, placeAudioClipOnTrack, placeRecordingClipOnTrack } from "../src/daw/audioClips";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { addTrackToProject } from "../src/daw/tracks";
import { createDemoProject } from "../src/demo/demoProject";

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
});
