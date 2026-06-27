import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { clipSourceStartBar, moveClipToBar, repeatGeneratedSectionClipToEnd, setClipTransform, splitClipAtBar, trimClipEnd, trimClipStart } from "../src/daw/clips";
import { addMarkerAtBar, clearLoop, deleteMarker, setLoopToClip, snapBarValue } from "../src/daw/timeline";
import { createDemoProject } from "../src/demo/demoProject";

describe("timeline editing helpers", () => {
  it("splits selected clips at a whole-bar playhead", () => {
    const project = createDemoProject();
    const original = project.timeline.clips[0];
    const result = splitClipAtBar(project, original.id, original.startBar + 2);
    const left = result.project.timeline.clips.find((clip) => clip.id === original.id);
    const right = result.project.timeline.clips.find((clip) => clip.id === result.rightClipId);

    expect(result.rightClipId).toBeTruthy();
    expect(left?.barLength).toBe(2);
    expect(right?.startBar).toBe(original.startBar + 2);
    expect(right?.barLength).toBe(original.barLength - 2);
    expect(right ? clipSourceStartBar(right) : -1).toBe(2);
  });

  it("trim start and end preserve valid generated-section clips", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const trimmedStart = trimClipStart(project, clip.id, 1);
    const shifted = trimmedStart.timeline.clips.find((item) => item.id === clip.id)!;
    const trimmedEnd = trimClipEnd(trimmedStart, clip.id, -1);
    const shortened = trimmedEnd.timeline.clips.find((item) => item.id === clip.id)!;

    expect(shifted.startBar).toBe(clip.startBar + 1);
    expect(shifted.barLength).toBe(clip.barLength - 1);
    expect(clipSourceStartBar(shifted)).toBe(1);
    expect(shortened.barLength).toBe(clip.barLength - 2);
    expect(shortened.barLength).toBeGreaterThanOrEqual(1);
  });

  it("set loop to selected clip and clear loop update the timeline loop", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[1];
    const looped = setLoopToClip(project, clip.id);
    const cleared = clearLoop(looped);

    expect(looped.timeline.loop).toMatchObject({
      enabled: true,
      startBar: clip.startBar,
      endBar: clip.startBar + clip.barLength
    });
    expect(cleared.timeline.loop.enabled).toBe(false);
  });

  it("repeats generated sections as linked copies when loop-dragged longer", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const result = repeatGeneratedSectionClipToEnd(project, clip.id, clip.startBar + clip.barLength * 3);
    const repeats = result.project.timeline.clips.filter((item) => item.metadata?.loopParentId === clip.id);

    expect(result.repeatedCount).toBe(2);
    expect(repeats.map((item) => item.startBar)).toEqual([clip.startBar + clip.barLength, clip.startBar + clip.barLength * 2]);
    expect(repeats.every((item) => item.sectionId === clip.sectionId && item.linked)).toBe(true);
  });

  it("moves generated section repeats with their source clip", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const repeated = repeatGeneratedSectionClipToEnd(project, clip.id, clip.startBar + clip.barLength * 3).project;
    const moved = moveClipToBar(repeated, clip.id, 5);
    const movedSource = moved.timeline.clips.find((item) => item.id === clip.id)!;
    const repeats = moved.timeline.clips.filter((item) => item.metadata?.loopParentId === clip.id);

    expect(movedSource.startBar).toBe(5);
    expect(repeats.map((item) => item.startBar)).toEqual([5 + clip.barLength, 5 + clip.barLength * 2]);
  });

  it("moves a generated section loop group when dragging one repeat", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const repeated = repeatGeneratedSectionClipToEnd(project, clip.id, clip.startBar + clip.barLength * 3).project;
    const repeat = repeated.timeline.clips.find((item) => item.metadata?.loopParentId === clip.id)!;
    const moved = moveClipToBar(repeated, repeat.id, 9);
    const movedSource = moved.timeline.clips.find((item) => item.id === clip.id)!;
    const movedRepeat = moved.timeline.clips.find((item) => item.id === repeat.id)!;

    expect(movedRepeat.startBar).toBe(9);
    expect(movedSource.startBar).toBe(9 - clip.barLength);
  });

  it("adds and deletes markers that survive project roundtrip", () => {
    const withMarker = addMarkerAtBar(createDemoProject(), 5, "Chorus", "section");
    const raw = buildPocketDawProjectFile(withMarker);
    const parsed = parsePocketDawProjectFile(raw);
    const marker = parsed.timeline.markers.find((item) => item.name === "Chorus")!;
    const deleted = deleteMarker(parsed, marker.id);

    expect(marker).toMatchObject({ bar: 5, name: "Chorus", markerType: "section" });
    expect(deleted.timeline.markers.some((item) => item.id === marker.id)).toBe(false);
  });

  it("calculates bar and beat snap values", () => {
    expect(snapBarValue(3.49, "bar", 4)).toBe(3);
    expect(snapBarValue(3.51, "bar", 4)).toBe(4);
    expect(snapBarValue(2.37, "beat", 4)).toBe(2.25);
    expect(snapBarValue(2.376, "off", 4)).toBe(2.38);
  });

  it("renders split clip windows instead of full source sections", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const fullEvents = renderTimelineEvents(project).filter((event) => event.clipId === clip.id);
    const split = splitClipAtBar(project, clip.id, clip.startBar + 2).project;
    const leftEvents = renderTimelineEvents(split).filter((event) => event.clipId === clip.id);

    expect(leftEvents.length).toBeGreaterThan(0);
    expect(leftEvents.length).toBeLessThan(fullEvents.length);
    expect(Math.max(...leftEvents.map((event) => event.bar))).toBeLessThan(clip.startBar + clip.barLength - 1);
  });

  it("edits clip transform values with migration-compatible clamps", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const transposed = setClipTransform(project, clip.id, "transpose", 99);
    const gained = setClipTransform(transposed, clip.id, "gain", 8);
    const updated = gained.timeline.clips.find((item) => item.id === clip.id)!;

    expect(updated.transforms.transpose).toBe(48);
    expect(updated.transforms.gain).toBe(4);
    expect(project.timeline.clips.find((item) => item.id === clip.id)?.transforms.transpose).toBe(0);
  });
});
