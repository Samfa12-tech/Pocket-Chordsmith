import { describe, expect, it } from "vitest";
import { buildMetronomeClicks, countInSeconds } from "../src/audio/metronome";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { addImportedAudioMedia, placeAudioClipOnTrack } from "../src/daw/audioClips";
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
});
