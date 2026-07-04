import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { buildPocketDawProjectFile, createEmptyPocketDawProject, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { activateAudioTake, audioClipTakeSummary, clipSourceStartBar, compGroupedAudioTakeRange, createTakeLaneGroupFromClips, cropClipToRange, deleteClipRange, moveClipToBar, repeatGeneratedSectionClipToEnd, rippleDeleteClipRange, rippleDeleteTimelineRange, setAudioClipProperty, setClipTransform, setGeneratedClipStemMute, splitClipAtBar, splitClipsAtRange, trimClipEnd, trimClipStart } from "../src/daw/clips";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { addMidiNote, createEmptyMidiClip, midiDataFromClip, placeMidiRecordingClipOnTrack, setMidiNoteField } from "../src/daw/midiClips";
import { addGameStateMarkerAtBar, addMarkerAtBar, clearLoop, clearTimelineSelection, deleteMarker, setLoopToClip, setTimelineSelectionRange, setTimelineSelectionToClip, setTimelineSelectionToLoop, snapBarValue, snapProjectBarValue } from "../src/daw/timeline";
import { createDemoProject } from "../src/demo/demoProject";
import { addTrackToProject } from "../src/daw/tracks";
import type { Clip, PocketDawProject } from "../src/daw/schema";

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

  it("stores edit ranges from bars, clips and loops", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const manual = setTimelineSelectionRange(project, 5, 2, "manual");
    const fromClip = setTimelineSelectionToClip(manual, clip.id);
    const looped = setLoopToClip(fromClip, clip.id);
    const fromLoop = setTimelineSelectionToLoop(looped);
    const cleared = clearTimelineSelection(fromLoop);

    expect(manual.timeline.selection).toMatchObject({ startBar: 2, endBar: 5, source: "manual" });
    expect(fromClip.timeline.selection).toMatchObject({ startBar: clip.startBar, endBar: clip.startBar + clip.barLength, source: "clip" });
    expect(fromLoop.timeline.selection).toMatchObject({ startBar: clip.startBar, endBar: clip.startBar + clip.barLength, source: "loop" });
    expect(cleared.timeline.selection).toBeNull();
  });

  it("splits generated clips at edit range boundaries while preserving source windows", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const result = splitClipsAtRange(project, clip.startBar + 1, clip.startBar + 3);
    const segments = result.project.timeline.clips
      .filter((item) => item.id === clip.id || item.name.startsWith(`${clip.name} split`))
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(result.splitCount).toBe(2);
    expect(segments.map((item) => [item.startBar, item.barLength, clipSourceStartBar(item)])).toEqual([
      [clip.startBar, 1, 0],
      [clip.startBar + 1, 2, 1],
      [clip.startBar + 3, clip.barLength - 3, 3]
    ]);
  });

  it("crops generated clips to an edit range while preserving the source window", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const result = cropClipToRange(project, clip.id, clip.startBar + 1, clip.startBar + 3);
    const cropped = result.project.timeline.clips.find((item) => item.id === clip.id)!;

    expect(result.changed).toBe(true);
    expect(cropped.startBar).toBe(clip.startBar + 1);
    expect(cropped.barLength).toBe(2);
    expect(clipSourceStartBar(cropped)).toBe(1);
    expect(project.timeline.clips.find((item) => item.id === clip.id)?.barLength).toBe(clip.barLength);
  });

  it("deletes a generated clip range while preserving outside source windows", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const result = deleteClipRange(project, clip.id, clip.startBar + 1, clip.startBar + 3);
    const left = result.project.timeline.clips.find((item) => item.id === clip.id)!;
    const right = result.project.timeline.clips.find((item) => item.id === result.rightClipId)!;

    expect(result.changed).toBe(true);
    expect(left.startBar).toBe(clip.startBar);
    expect(left.barLength).toBe(1);
    expect(clipSourceStartBar(left)).toBe(0);
    expect(right.startBar).toBe(clip.startBar + 3);
    expect(right.barLength).toBe(clip.barLength - 3);
    expect(clipSourceStartBar(right)).toBe(3);
  });

  it("splits, crops and deletes generated-pattern ranges while preserving source windows", () => {
    const { project, clip } = createGeneratedPatternRangeProject();
    const split = splitClipsAtRange(project, 3, 5);
    const segments = split.project.timeline.clips
      .filter((item) => item.id === clip.id || item.name.startsWith(`${clip.name} split`))
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(split.splitCount).toBe(2);
    expect(segments.map((item) => [item.type, item.startBar, item.barLength, clipSourceStartBar(item), item.metadata?.patternId])).toEqual([
      ["generated-pattern", 2, 1, 8, "beat-a"],
      ["generated-pattern", 3, 2, 9, "beat-a"],
      ["generated-pattern", 5, 1, 11, "beat-a"]
    ]);

    const cropped = cropClipToRange(project, clip.id, 3, 5).project.timeline.clips.find((item) => item.id === clip.id)!;
    expect([cropped.startBar, cropped.barLength, clipSourceStartBar(cropped), cropped.metadata?.patternId]).toEqual([3, 2, 9, "beat-a"]);

    const deleted = deleteClipRange(project, clip.id, 3, 5);
    const left = deleted.project.timeline.clips.find((item) => item.id === clip.id)!;
    const right = deleted.project.timeline.clips.find((item) => item.id === deleted.rightClipId)!;
    expect([left.startBar, left.barLength, clipSourceStartBar(left), left.metadata?.patternId]).toEqual([2, 1, 8, "beat-a"]);
    expect([right.startBar, right.barLength, clipSourceStartBar(right), right.metadata?.patternId]).toEqual([5, 1, 11, "beat-a"]);
  });

  it("ripple deletes generated-pattern ranges on one track and across the timeline", () => {
    const { project, clip, later } = createGeneratedPatternRangeProject();
    const sameTrack = rippleDeleteClipRange(project, clip.id, 3, 5);
    const sameTrackSegments = sameTrack.project.timeline.clips
      .filter((item) => item.trackId === clip.trackId)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(sameTrack.changed).toBe(true);
    expect(sameTrack.rippleBars).toBe(2);
    expect(sameTrack.movedClipIds).toEqual(expect.arrayContaining([sameTrack.rightClipId, later.id]));
    expect(sameTrackSegments.map((item) => [item.id === clip.id ? "left" : item.id === sameTrack.rightClipId ? "right" : "later", item.startBar, item.barLength, clipSourceStartBar(item)])).toEqual([
      ["left", 2, 1, 8],
      ["right", 3, 1, 11],
      ["later", 5, 2, 20]
    ]);

    const allTracks = rippleDeleteTimelineRange(project, 3, 5);
    const allTrackSegments = allTracks.project.timeline.clips
      .filter((item) => item.trackId === clip.trackId)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    expect(allTracks.changed).toBe(true);
    expect(allTracks.affectedClipIds).toContain(clip.id);
    expect(allTracks.movedClipIds).toContain(later.id);
    expect(allTrackSegments.map((item) => [item.startBar, item.barLength, clipSourceStartBar(item)])).toEqual([
      [2, 1, 8],
      [3, 1, 11],
      [5, 2, 20]
    ]);
  });

  it("splits audio clips at edit range boundaries without changing source media", () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "Dialogue.wav",
      uri: "C:\\Audio\\Dialogue.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    project = placeAudioClipOnTimeline(imported.project, imported.item.id, 2).project;
    const clip = project.timeline.clips.find((item) => item.type === "audio")!;

    const result = splitClipsAtRange(project, 3, 5);
    const segments = result.project.timeline.clips
      .filter((item) => item.mediaPoolItemId === imported.item.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(result.splitCount).toBe(2);
    expect(segments.map((item) => [item.startBar, item.barLength])).toEqual([[2, 1], [3, 2], [5, 1]]);
    expect(segments.map((item) => item.metadata?.sourceOffsetSeconds)).toEqual([0, 2, 6]);
    expect(result.project.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
    expect(project.timeline.clips.find((item) => item.id === clip.id)?.barLength).toBe(4);
  });

  it("crops audio clips to an edit range without changing source media", () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "Phrase.wav",
      uri: "C:\\Audio\\Phrase.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    project = placeAudioClipOnTimeline(imported.project, imported.item.id, 2).project;
    const clip = project.timeline.clips.find((item) => item.type === "audio")!;

    const result = cropClipToRange(project, clip.id, 3, 5);
    const cropped = result.project.timeline.clips.find((item) => item.id === clip.id)!;

    expect(result.changed).toBe(true);
    expect(cropped.startBar).toBe(3);
    expect(cropped.barLength).toBe(2);
    expect(cropped.metadata?.sourceOffsetSeconds).toBe(2);
    expect(result.project.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
  });

  it("deletes an audio clip range without changing source media", () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "Gap.wav",
      uri: "C:\\Audio\\Gap.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    project = placeAudioClipOnTimeline(imported.project, imported.item.id, 2).project;
    const clip = project.timeline.clips.find((item) => item.type === "audio")!;

    const result = deleteClipRange(project, clip.id, 3, 5);
    const segments = result.project.timeline.clips
      .filter((item) => item.mediaPoolItemId === imported.item.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(result.changed).toBe(true);
    expect(segments.map((item) => [item.startBar, item.barLength])).toEqual([[2, 1], [5, 1]]);
    expect(segments.map((item) => item.metadata?.sourceOffsetSeconds)).toEqual([0, 6]);
    expect(result.project.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
  });

  it("ripple deletes an audio clip range and moves later clips on the same track", () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "Ripple.wav",
      uri: "C:\\Audio\\Ripple.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const firstPlaced = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const secondPlaced = placeAudioClipOnTrack(firstPlaced.project, imported.item.id, firstPlaced.trackId, 7);

    const result = rippleDeleteClipRange(secondPlaced.project, firstPlaced.clipId, 3, 5);
    const segments = result.project.timeline.clips
      .filter((item) => item.mediaPoolItemId === imported.item.id && item.trackId === firstPlaced.trackId)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(result.changed).toBe(true);
    expect(result.rippleBars).toBe(2);
    expect(result.movedClipIds).toHaveLength(2);
    expect(result.movedClipIds).toEqual(expect.arrayContaining([result.rightClipId, secondPlaced.clipId]));
    expect(segments.map((item) => [item.startBar, item.barLength])).toEqual([[2, 1], [3, 1], [5, 4]]);
    expect(segments.map((item) => item.metadata?.sourceOffsetSeconds)).toEqual([0, 6, 0]);
  });

  it("ripple deletes a timeline range across all tracks", () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "Ripple all.wav",
      uri: "C:\\Audio\\Ripple all.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const firstTrack = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const firstLater = placeAudioClipOnTrack(firstTrack.project, imported.item.id, firstTrack.trackId, 7);
    const secondTrack = addTrackToProject(firstLater.project, "live-instrument");
    const secondEarly = placeAudioClipOnTrack(secondTrack.project, imported.item.id, secondTrack.trackId, 3);
    const secondLater = placeAudioClipOnTrack(secondEarly.project, imported.item.id, secondTrack.trackId, 8);

    const result = rippleDeleteTimelineRange(secondLater.project, 3, 5);
    const firstTrackSegments = result.project.timeline.clips
      .filter((item) => item.mediaPoolItemId === imported.item.id && item.trackId === firstTrack.trackId)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    const secondTrackSegments = result.project.timeline.clips
      .filter((item) => item.mediaPoolItemId === imported.item.id && item.trackId === secondTrack.trackId)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(result.changed).toBe(true);
    expect(result.rippleBars).toBe(2);
    expect(result.affectedClipIds).toEqual(expect.arrayContaining([firstTrack.clipId, secondEarly.clipId]));
    expect(result.movedClipIds).toEqual(expect.arrayContaining([firstLater.clipId, secondLater.clipId]));
    expect(firstTrackSegments.map((item) => [item.startBar, item.barLength])).toEqual([[2, 1], [3, 1], [5, 4]]);
    expect(firstTrackSegments.map((item) => item.metadata?.sourceOffsetSeconds)).toEqual([0, 6, 0]);
    expect(secondTrackSegments.map((item) => [item.startBar, item.barLength])).toEqual([[3, 2], [6, 4]]);
    expect(secondTrackSegments.map((item) => item.metadata?.sourceOffsetSeconds)).toEqual([4, 0]);
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

  it("adds game-state markers that survive project roundtrip", () => {
    const withMarker = addGameStateMarkerAtBar(createDemoProject(), 9, "combat");
    const raw = buildPocketDawProjectFile(withMarker);
    const parsed = parsePocketDawProjectFile(raw);
    const marker = parsed.timeline.markers.find((item) => item.gameState === "combat")!;

    expect(marker).toMatchObject({ bar: 9, name: "Combat", markerType: "game-state", gameState: "combat" });
  });

  it("calculates bar and beat snap values", () => {
    expect(snapBarValue(3.49, "bar", 4)).toBe(3);
    expect(snapBarValue(3.51, "bar", 4)).toBe(4);
    expect(snapBarValue(2.37, "beat", 4)).toBe(2.25);
    expect(snapBarValue(2.376, "off", 4)).toBe(2.38);
  });

  it("calculates project beat snap values from meter-map points", () => {
    const project = createDemoProject();
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_2", bar: 2, numerator: 7, denominator: 8, source: "manual" }
    ];

    expect(snapProjectBarValue(project, 1.37, "beat")).toBe(1.25);
    expect(snapProjectBarValue(project, 2.37, "beat")).toBeCloseTo(2 + 3 / 7, 6);
    expect(snapProjectBarValue(project, 2.99, "beat")).toBe(3);
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

  it("edits generated clip stem mutes without changing source data", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips.find((item) => item.type === "generated-section")!;
    const edited = setGeneratedClipStemMute(project, clip.id, "bass", true);
    const updated = edited.timeline.clips.find((item) => item.id === clip.id)!;
    const events = renderTimelineEvents(edited).filter((event) => event.clipId === clip.id);

    expect(updated.transforms.stemMutes.bass).toBe(true);
    expect(project.timeline.clips.find((item) => item.id === clip.id)?.transforms.stemMutes.bass).toBeUndefined();
    expect(events.some((event) => event.role === "bass")).toBe(false);
    expect(events.some((event) => event.role === "drums")).toBe(true);
  });

  it("edits audio clip gain, fades and source offsets as non-destructive metadata", () => {
    let project = createDemoProject();
    const imported = addImportedAudioMedia(project, {
      name: "Vocal Take.wav",
      uri: "C:\\Audio\\Vocal Take.wav",
      mimeType: "audio/wav",
      durationSeconds: 12,
      sampleRate: 48000,
      channels: 1
    });
    project = placeAudioClipOnTimeline(imported.project, imported.item.id, 3).project;
    const clip = project.timeline.clips.find((item) => item.type === "audio")!;

    let edited = setAudioClipProperty(project, clip.id, "gain", 0.65);
    edited = setAudioClipProperty(edited, clip.id, "fadeInSeconds", 1.25);
    edited = setAudioClipProperty(edited, clip.id, "fadeOutSeconds", 2.5);
    edited = setAudioClipProperty(edited, clip.id, "sourceOffsetSeconds", 4);
    const updated = edited.timeline.clips.find((item) => item.id === clip.id)!;

    expect(updated.metadata).toMatchObject({
      gain: 0.65,
      fadeInSeconds: 1.25,
      fadeOutSeconds: 2.5,
      sourceOffsetSeconds: 4
    });
    expect(project.timeline.clips.find((item) => item.id === clip.id)?.metadata?.sourceOffsetSeconds).toBe(0);
  });

  it("summarizes split take-lane segments for comp organization", () => {
    const project = createEmptyPocketDawProject();
    const firstImport = addImportedAudioMedia(project, {
      name: "Lead take 1.wav",
      durationSeconds: 16,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lane-summary-a" }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Lead take 2.wav",
      durationSeconds: 16,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lane-summary-a" }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2);
    const firstActive = activateAudioTake(secondPlaced.project, firstPlaced.clipId).project;
    const comped = compGroupedAudioTakeRange(firstActive, secondPlaced.clipId, 4, 6);
    const summary = audioClipTakeSummary(comped.project, comped.activeClipId || secondPlaced.clipId);

    expect(comped.changed).toBe(true);
    expect(summary?.lanes).toHaveLength(2);
    expect(summary?.lanes.map((lane) => ({
      takeLaneId: lane.takeLaneId,
      clipCount: lane.clipCount,
      activeClipCount: lane.activeClipCount,
      mutedClipCount: lane.mutedClipCount,
      startBar: lane.startBar,
      endBar: Number(lane.endBar.toFixed(6))
    }))).toEqual([
      {
        takeLaneId: "lane-summary-a-lane-1",
        clipCount: 3,
        activeClipCount: 2,
        mutedClipCount: 1,
        startBar: 2,
        endBar: 9.866667
      },
      {
        takeLaneId: "lane-summary-a-lane-2",
        clipCount: 3,
        activeClipCount: 1,
        mutedClipCount: 2,
        startBar: 2,
        endBar: 9.866667
      }
    ]);
  });

  it("groups overlapping MIDI clips into user-created take lanes", () => {
    let project = createEmptyPocketDawProject();
    const track = addTrackToProject(project, "midi-instrument");
    project = track.project;
    let first = createEmptyMidiClip(project, track.trackId, 1, "MIDI take 1");
    let edited = addMidiNote(first.project, first.clipId, 0);
    let firstClipWithNote = edited.timeline.clips.find((clip) => clip.id === first.clipId)!;
    edited = setMidiNoteField(edited, first.clipId, midiDataFromClip(firstClipWithNote).notes[0].id, "pitch", 81);
    const second = createEmptyMidiClip(edited, track.trackId, 1, "MIDI take 2");
    edited = addMidiNote(second.project, second.clipId, 0);
    const secondClipWithNote = edited.timeline.clips.find((clip) => clip.id === second.clipId)!;
    edited = setMidiNoteField(edited, second.clipId, midiDataFromClip(secondClipWithNote).notes[0].id, "pitch", 82);

    const grouped = createTakeLaneGroupFromClips(edited, [first.clipId, second.clipId], second.clipId);
    const firstClip = grouped.project.timeline.clips.find((clip) => clip.id === first.clipId);
    const secondClip = grouped.project.timeline.clips.find((clip) => clip.id === second.clipId);
    const summary = audioClipTakeSummary(grouped.project, second.clipId);
    const events = renderTimelineEvents(grouped.project);

    expect(grouped.changed).toBe(true);
    expect(grouped.status).toBe("Grouped 2 MIDI clips as take lanes.");
    expect(grouped.groupId).toBe("manual-midi-take-group-1");
    expect(firstClip).toMatchObject({
      muted: true,
      metadata: expect.objectContaining({
        recordingTakeGroupId: "manual-midi-take-group-1",
        takeLaneId: "manual-midi-take-group-1-lane-1",
        takeLaneIndex: 1,
        takeActive: false,
        takeStatus: "muted-take",
        takeSource: "manual-clip-group"
      })
    });
    expect(secondClip).toMatchObject({
      muted: false,
      metadata: expect.objectContaining({
        recordingTakeGroupId: "manual-midi-take-group-1",
        takeLaneId: "manual-midi-take-group-1-lane-2",
        takeLaneIndex: 2,
        takeActive: true,
        takeStatus: "active",
        takeSource: "manual-clip-group"
      })
    });
    expect(summary?.takeCount).toBe(2);
    expect(summary?.lanes.map((lane) => lane.takeLaneId)).toEqual(["manual-midi-take-group-1-lane-1", "manual-midi-take-group-1-lane-2"]);
    expect(events.some((event) => event.clipId === first.clipId)).toBe(false);
    expect(events.map((event) => event.midi)).toContain(82);
    expect(events.map((event) => event.midi)).not.toContain(81);
  });

  it("places punched MIDI recordings as active take lanes with durable metadata", () => {
    let project = createEmptyPocketDawProject();
    const track = addTrackToProject(project, "midi-instrument");
    project = track.project;
    const first = placeMidiRecordingClipOnTrack(project, track.trackId, [{
      pitch: 81,
      startBar: 7.25,
      endBar: 8,
      velocity: 90
    }], {
      captureStartBar: 6,
      punchStartBar: 7,
      punchEndBar: 9,
      createTakeLane: true,
      name: "MIDI punch take 1",
      recordingSessionId: 91
    });
    const second = placeMidiRecordingClipOnTrack(first.project, track.trackId, [{
      pitch: 82,
      startBar: 6.5,
      endBar: 7.5,
      velocity: 96
    }, {
      pitch: 83,
      startBar: 8.25,
      durationBars: 0.5,
      velocity: 100
    }], {
      captureStartBar: 6,
      punchStartBar: 7,
      punchEndBar: 9,
      createTakeLane: true,
      name: "MIDI punch take 2",
      recordingSessionId: 92
    });
    const reopened = parsePocketDawProjectFile(buildPocketDawProjectFile(second.project));
    const firstClip = reopened.timeline.clips.find((clip) => clip.id === first.clipId)!;
    const secondClip = reopened.timeline.clips.find((clip) => clip.id === second.clipId)!;
    const secondNotes = midiDataFromClip(secondClip).notes;
    const events = renderTimelineEvents(reopened);

    expect(first.clipId).toBeTruthy();
    expect(second.noteCount).toBe(2);
    expect(firstClip).toMatchObject({
      muted: true,
      startBar: 7,
      barLength: 2,
      metadata: expect.objectContaining({
        recordingTakeGroupId: "midi-recording-session-91",
        takeLaneIndex: 1,
        takeStatus: "muted-take",
        punchStartBar: 7,
        punchEndBar: 9
      })
    });
    expect(secondClip).toMatchObject({
      muted: false,
      startBar: 7,
      barLength: 2,
      metadata: expect.objectContaining({
        recordingTakeGroupId: "midi-recording-session-91",
        takeLaneIndex: 2,
        takeStatus: "active",
        midiRecording: true,
        punchMode: "create-new-midi-take-lane"
      })
    });
    expect(secondNotes.map((note) => [note.pitch, note.startTick, note.durationTicks])).toEqual([
      [82, 0, 960],
      [83, 2400, 960]
    ]);
    expect(events.map((event) => event.midi).filter((pitch): pitch is number => typeof pitch === "number")).toEqual([82, 83]);
  });

  it("trims audio clip starts by moving source offsets instead of changing source media", () => {
    let project = createDemoProject();
    const imported = addImportedAudioMedia(project, {
      name: "Loop.wav",
      uri: "C:\\Audio\\Loop.wav",
      mimeType: "audio/wav",
      durationSeconds: 16,
      sampleRate: 48000,
      channels: 2
    });
    project = placeAudioClipOnTimeline(imported.project, imported.item.id, 2).project;
    const clip = project.timeline.clips.find((item) => item.type === "audio")!;
    const secondsPerBar = project.project.timeSig * (60 / project.project.bpm);

    const trimmed = trimClipStart(project, clip.id, 1);
    const updated = trimmed.timeline.clips.find((item) => item.id === clip.id)!;

    expect(updated.startBar).toBe(clip.startBar + 1);
    expect(updated.barLength).toBe(clip.barLength - 1);
    expect(updated.metadata?.sourceOffsetSeconds).toBeCloseTo(secondsPerBar, 5);
    expect(project.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
  });

  it("trims audio clip starts using active meter-map seconds", () => {
    let project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [{ id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" }];
    const imported = addImportedAudioMedia(project, {
      name: "Meter Trim.wav",
      uri: "C:\\Audio\\Meter Trim.wav",
      mimeType: "audio/wav",
      durationSeconds: 12,
      sampleRate: 48000,
      channels: 2
    });
    project = placeAudioClipOnTimeline(imported.project, imported.item.id, 2).project;
    const clip = project.timeline.clips.find((item) => item.type === "audio")!;

    const trimmed = trimClipStart(project, clip.id, 1);
    const updated = trimmed.timeline.clips.find((item) => item.id === clip.id)!;

    expect(updated.startBar).toBe(3);
    expect(updated.metadata?.sourceOffsetSeconds).toBeCloseTo(1.75, 5);
  });

  it("splits audio clips with source offsets on the right-hand clip", () => {
    let project = createDemoProject();
    const imported = addImportedAudioMedia(project, {
      name: "Ambience.wav",
      uri: "C:\\Audio\\Ambience.wav",
      mimeType: "audio/wav",
      durationSeconds: 20,
      sampleRate: 48000,
      channels: 2
    });
    project = placeAudioClipOnTimeline(imported.project, imported.item.id, 1).project;
    const clip = project.timeline.clips.find((item) => item.type === "audio")!;
    const secondsPerBar = project.project.timeSig * (60 / project.project.bpm);

    const split = splitClipAtBar(project, clip.id, clip.startBar + 2);
    const right = split.project.timeline.clips.find((item) => item.id === split.rightClipId)!;

    expect(right.type).toBe("audio");
    expect(right.startBar).toBe(clip.startBar + 2);
    expect(right.metadata?.sourceOffsetSeconds).toBeCloseTo(secondsPerBar * 2, 5);
    expect(right.metadata?.sourceStartBar).toBeUndefined();
  });
});

function createGeneratedPatternRangeProject(): { project: PocketDawProject; clip: Clip; later: Clip } {
  const project = createDemoProject();
  const track = project.tracks.find((item) => item.id === "drums") || project.tracks.find((item) => item.trackType === "generated")!;
  const clip: Clip = {
    id: "pattern_clip",
    type: "generated-pattern",
    trackId: track.id,
    startBar: 2,
    barLength: 4,
    name: "Beat Pattern",
    muted: false,
    color: track.colour,
    linked: true,
    transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} },
    metadata: { sourceStartBar: 8, patternId: "beat-a" }
  };
  const later: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: "pattern_later",
    startBar: 7,
    barLength: 2,
    name: "Later Pattern",
    metadata: { sourceStartBar: 20, patternId: "beat-b" }
  };
  project.timeline.clips = [clip, later];
  project.timeline.bars = 10;
  return { project, clip, later };
}
