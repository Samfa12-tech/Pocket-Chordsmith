import { describe, expect, it } from "vitest";
import { activateAudioTakeCommand, activateAudioTakeLaneCommand, addClipAutomationPointCommand, applySelectedAudioClipActionCommand, compAudioTakeFromPlayheadCommand, compAudioTakeRangeCommand, cropSelectedClipToTimelineSelectionCommand, deleteSelectedClipRangeCommand, ensureClipAutomationLaneCommand, recordClipAutomationPointCommand, rippleDeleteSelectedClipRangeCommand, rippleDeleteTimelineSelectionCommand, setAudioTakeArchivedCommand, setSelectedAudioClipPropertyCommand, setTimelineSelectionRangeCommand, setTimelineSelectionToLoopCommand, splitTimelineSelectionCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { renderTimelineAudioRegions } from "../src/audio/audioRegions";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { splitClipAtBar } from "../src/daw/clips";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import { createUndoStack } from "../src/daw/undo";
import { addTrackToProject } from "../src/daw/tracks";

describe("audio clip edit commands", () => {
  it("splits the active edit range through the undoable command path", () => {
    const state = createInitialState();
    const empty = createEmptyPocketDawProject();
    empty.project.bpm = 120;
    empty.project.timeSig = 4;
    empty.timeline.clips = [];
    state.undoStack = createUndoStack(empty);
    const imported = addImportedAudioMedia(empty, {
      name: "Narration.wav",
      uri: "C:\\Audio\\Narration.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 3, 5);
    const edited = splitTimelineSelectionCommand(ranged);
    const segments = edited.undoStack.present.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === imported.item.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(segments.map((clip) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [3, 2], [5, 1]]);
    expect(segments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 2, 6]);
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.status).toBe("Split 2 clip boundaries at edit range.");
    expect(edited.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
  });

  it("uses meter-map seconds for audio range edit source offsets", () => {
    const setup = () => {
      const state = createInitialState();
      const empty = createEmptyPocketDawProject();
      empty.project.bpm = 120;
      empty.project.timeSig = 4;
      empty.project.meterMap = [
        { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
        { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
      ];
      empty.timeline.clips = [];
      state.undoStack = createUndoStack(empty);
      const imported = addImportedAudioMedia(empty, {
        name: "Meter range.wav",
        uri: "C:\\Audio\\Meter range.wav",
        mimeType: "audio/wav",
        durationSeconds: 8,
        sampleRate: 48000,
        channels: 1
      });
      const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
      state.undoStack = createUndoStack(placed.project);
      state.selectedClipId = placed.clipId;
      state.selectedTrackId = placed.trackId;
      return { state, imported };
    };

    const splitSetup = setup();
    const split = splitTimelineSelectionCommand(setTimelineSelectionRangeCommand(splitSetup.state, 3, 5));
    const splitSegments = split.undoStack.present.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === splitSetup.imported.item.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    expect(splitSegments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 1.75, 4.75]);

    const cropSetup = setup();
    const cropped = cropSelectedClipToTimelineSelectionCommand(setTimelineSelectionRangeCommand(cropSetup.state, 3, 5));
    expect(cropped.undoStack.present.timeline.clips.find((clip) => clip.id === cropSetup.state.selectedClipId)?.metadata?.sourceOffsetSeconds).toBe(1.75);

    const deleteSetup = setup();
    const deleted = deleteSelectedClipRangeCommand(setTimelineSelectionRangeCommand(deleteSetup.state, 3, 5));
    const deleteSegments = deleted.undoStack.present.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === deleteSetup.imported.item.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    expect(deleteSegments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 4.75]);
  });

  it("can copy the loop into the edit range before range splitting", () => {
    const state = createInitialState();
    const clip = state.undoStack.present.timeline.clips[0];
    state.undoStack.present.timeline.loop = { enabled: true, startBar: clip.startBar + 1, endBar: clip.startBar + 3 };

    const ranged = setTimelineSelectionToLoopCommand(state);

    expect(ranged.undoStack.present.timeline.selection).toMatchObject({
      startBar: clip.startBar + 1,
      endBar: clip.startBar + 3,
      source: "loop"
    });
    expect(ranged.status).toBe("Edit range set to loop.");
  });

  it("crops the selected audio clip to the active edit range through the undoable command path", () => {
    const state = createInitialState();
    const empty = createEmptyPocketDawProject();
    empty.project.bpm = 120;
    empty.project.timeSig = 4;
    empty.timeline.clips = [];
    state.undoStack = createUndoStack(empty);
    const imported = addImportedAudioMedia(empty, {
      name: "Crop me.wav",
      uri: "C:\\Audio\\Crop me.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 3, 5);
    const cropped = cropSelectedClipToTimelineSelectionCommand(ranged);
    const clip = cropped.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;

    expect(clip.startBar).toBe(3);
    expect(clip.barLength).toBe(2);
    expect(clip.metadata?.sourceOffsetSeconds).toBe(2);
    expect(cropped.selectedClipId).toBe(placed.clipId);
    expect(cropped.undoStack.past).toHaveLength(2);
    expect(cropped.status).toBe("Cropped Crop me.wav to edit range.");
  });

  it("deletes the selected audio clip range through the undoable command path", () => {
    const state = createInitialState();
    const empty = createEmptyPocketDawProject();
    empty.project.bpm = 120;
    empty.project.timeSig = 4;
    empty.timeline.clips = [];
    state.undoStack = createUndoStack(empty);
    const imported = addImportedAudioMedia(empty, {
      name: "Remove middle.wav",
      uri: "C:\\Audio\\Remove middle.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 3, 5);
    const edited = deleteSelectedClipRangeCommand(ranged);
    const segments = edited.undoStack.present.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === imported.item.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(segments.map((clip) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [5, 1]]);
    expect(segments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 6]);
    expect(edited.selectedClipId).toBe(segments[1].id);
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.status).toBe("Deleted range from Remove middle.wav.");
  });

  it("ripple deletes the selected audio clip range through the undoable command path", () => {
    const state = createInitialState();
    const empty = createEmptyPocketDawProject();
    empty.project.bpm = 120;
    empty.project.timeSig = 4;
    empty.timeline.clips = [];
    state.undoStack = createUndoStack(empty);
    const imported = addImportedAudioMedia(empty, {
      name: "Ripple command.wav",
      uri: "C:\\Audio\\Ripple command.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const firstPlaced = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const secondPlaced = placeAudioClipOnTrack(firstPlaced.project, imported.item.id, firstPlaced.trackId, 7);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = firstPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 3, 5);
    const edited = rippleDeleteSelectedClipRangeCommand(ranged);
    const segments = edited.undoStack.present.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === imported.item.id && clip.trackId === firstPlaced.trackId)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(segments.map((clip) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [3, 1], [5, 4]]);
    expect(segments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 6, 0]);
    expect(edited.selectedClipId).toBe(segments[1].id);
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.status).toBe("Ripple deleted range from Ripple command.wav; moved 2 clips.");
    expect(edited.undoStack.present.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)?.startBar).toBe(5);
  });

  it("ripple deletes the active edit range across all tracks through the undoable command path", () => {
    const state = createInitialState();
    const empty = createEmptyPocketDawProject();
    empty.project.bpm = 120;
    empty.project.timeSig = 4;
    empty.timeline.clips = [];
    state.undoStack = createUndoStack(empty);
    const imported = addImportedAudioMedia(empty, {
      name: "Ripple all command.wav",
      uri: "C:\\Audio\\Ripple all command.wav",
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
    state.undoStack = createUndoStack(secondLater.project);
    state.selectedClipId = firstTrack.clipId;
    state.selectedTrackId = firstTrack.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 3, 5);
    const edited = rippleDeleteTimelineSelectionCommand(ranged);

    expect(edited.undoStack.present.timeline.clips.find((clip) => clip.id === firstLater.clipId)?.startBar).toBe(5);
    expect(edited.undoStack.present.timeline.clips.find((clip) => clip.id === secondLater.clipId)?.startBar).toBe(6);
    expect(edited.undoStack.present.timeline.clips.find((clip) => clip.id === secondEarly.clipId)?.metadata?.sourceOffsetSeconds).toBe(4);
    expect(edited.selectedClipId).toBe(firstTrack.clipId);
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.status).toBe("Ripple deleted edit range across all tracks; edited 2 clips and moved 2 later clips.");
  });

  it("edits selected audio clip metadata through the undoable command path", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Voice.wav",
      uri: "C:\\Audio\\Voice.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const faded = setSelectedAudioClipPropertyCommand(state, placed.clipId, "fadeInSeconds", 1.5);
    const edited = setSelectedAudioClipPropertyCommand(faded, placed.clipId, "durationSeconds", 2.25);
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const region = renderTimelineAudioRegions(edited.undoStack.present, { includeMutedTracks: true }).audioRegions[0];

    expect(clip.metadata?.fadeInSeconds).toBe(1.5);
    expect(clip.metadata?.durationSeconds).toBe(2.25);
    expect(region.durationSeconds).toBe(2.25);
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.selectedClipId).toBe(placed.clipId);
    expect(edited.selectedTrackId).toBe(placed.trackId);
    expect(edited.status).toContain("Set Voice.wav duration");
  });

  it("edits audio clip varispeed rate and pitch through the undoable command path", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Varispeed Voice.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);
    state.undoStack = createUndoStack(placed.project);

    const rated = setSelectedAudioClipPropertyCommand(state, placed.clipId, "playbackRate", 1.5);
    const pitched = setSelectedAudioClipPropertyCommand(rated, placed.clipId, "pitchSemitones", -12);
    const clip = pitched.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const region = renderTimelineAudioRegions(pitched.undoStack.present, { includeMutedTracks: true }).audioRegions[0];

    expect(clip.metadata?.playbackRate).toBe(1.5);
    expect(clip.metadata?.pitchSemitones).toBe(-12);
    expect(region.playbackRate).toBeCloseTo(0.75, 5);
    expect(pitched.status).toContain("varispeed pitch");
  });

  it("activates grouped audio takes on the same track without muting parallel track takes", () => {
    const state = createInitialState();
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "Vocal take 1.wav",
      uri: "project-media/recordings/vocal-take-1.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "vocal-comp-a", inputMode: "mono", channelMap: [0] }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Vocal take 2.wav",
      uri: "project-media/recordings/vocal-take-2.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "vocal-comp-a", inputMode: "mono", channelMap: [0] }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2);
    const parallelImport = addImportedAudioMedia(secondPlaced.project, {
      name: "Guitar take 1.wav",
      uri: "project-media/recordings/guitar-take-1.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "vocal-comp-a", inputMode: "mono", channelMap: [0] }
    });
    const parallelPlaced = placeAudioClipOnTimeline(parallelImport.project, parallelImport.item.id, 2);
    state.undoStack = createUndoStack(parallelPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = secondPlaced.trackId;

    const edited = activateAudioTakeCommand(state, secondPlaced.clipId);
    const first = edited.undoStack.present.timeline.clips.find((clip) => clip.id === firstPlaced.clipId)!;
    const second = edited.undoStack.present.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;
    const parallel = edited.undoStack.present.timeline.clips.find((clip) => clip.id === parallelPlaced.clipId)!;

    expect(first.muted).toBe(true);
    expect(first.metadata?.takeActive).toBe(false);
    expect(first.metadata?.takeStatus).toBe("muted-take");
    expect(second.muted).toBe(false);
    expect(second.metadata).toMatchObject({ takeActive: true, takeStatus: "active", takeGroupId: "vocal-comp-a", takeIndex: 2 });
    expect(parallel.muted).toBe(false);
    expect(parallel.metadata?.takeActive).toBe(true);
    expect(parallel.metadata?.takeStatus).toBe("active");
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.status).toContain("Activated Take 2");
  });

  it("activates grouped audio take lanes through the undoable command path", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "Lane command A.wav",
      uri: "project-media/recordings/lane-command-a.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lane-command-group" }
    });
    const firstLeft = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const firstRight = placeAudioClipOnTrack(firstLeft.project, firstImport.item.id, firstLeft.trackId, 4);
    const secondImport = addImportedAudioMedia(firstRight.project, {
      name: "Lane command B.wav",
      uri: "project-media/recordings/lane-command-b.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lane-command-group" }
    });
    const secondLeft = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstLeft.trackId, 2);
    const secondRight = placeAudioClipOnTrack(secondLeft.project, secondImport.item.id, firstLeft.trackId, 4);
    state.undoStack = createUndoStack({
      ...secondRight.project,
      timeline: {
        ...secondRight.project.timeline,
        clips: secondRight.project.timeline.clips.map((clip) => {
          if (clip.id === firstLeft.clipId || clip.id === firstRight.clipId) {
            return { ...clip, muted: false, metadata: { ...(clip.metadata || {}), takeLaneId: "lane-command-a", takeLaneIndex: 1, takeStatus: "active", takeActive: true } };
          }
          if (clip.id === secondLeft.clipId || clip.id === secondRight.clipId) {
            return { ...clip, muted: true, metadata: { ...(clip.metadata || {}), takeLaneId: "lane-command-b", takeLaneIndex: 2, takeStatus: "muted-take", takeActive: false } };
          }
          return clip;
        })
      }
    });
    state.selectedClipId = secondLeft.clipId;
    state.selectedTrackId = secondLeft.trackId;

    const edited = activateAudioTakeLaneCommand(state, secondLeft.clipId);
    const audibleClipIds = renderTimelineAudioRegions(edited.undoStack.present).audioRegions.map((region) => region.clipId).sort();

    expect(audibleClipIds).toEqual([secondLeft.clipId, secondRight.clipId].sort());
    expect(edited.selectedClipId).toBe(secondLeft.clipId);
    expect(edited.selectedTrackId).toBe(secondLeft.trackId);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.status).toBe("Activated take lane lane-command-b for Lane command B.wav.");
  });

  it("archives and restores grouped audio takes without deleting clips or media", () => {
    const state = createInitialState();
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "Keep take.wav",
      uri: "project-media/recordings/keep-take.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "archive-comp-a", inputMode: "mono", channelMap: [0] }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Maybe take.wav",
      uri: "project-media/recordings/maybe-take.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "archive-comp-a", inputMode: "mono", channelMap: [0] }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = secondPlaced.trackId;

    const archived = setAudioTakeArchivedCommand(state, secondPlaced.clipId, true);
    const archivedClip = archived.undoStack.present.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;
    expect(archivedClip.muted).toBe(true);
    expect(archivedClip.metadata).toMatchObject({ takeActive: false, takeStatus: "archived-take" });
    expect(archived.undoStack.present.mediaPool.find((item) => item.id === secondImport.item.id)).toBeTruthy();
    expect(archived.undoStack.present.timeline.clips.filter((clip) => clip.metadata?.takeGroupId === "archive-comp-a")).toHaveLength(2);
    expect(archived.undoStack.past).toHaveLength(1);

    const restored = setAudioTakeArchivedCommand(archived, secondPlaced.clipId, false);
    const restoredClip = restored.undoStack.present.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;
    expect(restoredClip.muted).toBe(true);
    expect(restoredClip.metadata).toMatchObject({ takeActive: false, takeStatus: "muted-take" });
    expect(restored.undoStack.present.mediaPool.find((item) => item.id === secondImport.item.id)).toBeTruthy();
    expect(restored.undoStack.past).toHaveLength(2);
    expect(restored.status).toContain("Restored Maybe take.wav");
  });

  it("comps a grouped audio take from the playhead without muting earlier comp segments", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "Vocal take 1.wav",
      uri: "project-media/recordings/vocal-take-1.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "vocal-comp-b", inputMode: "mono", channelMap: [0] }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Vocal take 2.wav",
      uri: "project-media/recordings/vocal-take-2.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "vocal-comp-b", inputMode: "mono", channelMap: [0] }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = firstPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;
    const firstActive = activateAudioTakeCommand(state, firstPlaced.clipId);
    const ready = {
      ...firstActive,
      selectedClipId: secondPlaced.clipId,
      selectedTrackId: secondPlaced.trackId,
      playheadBar: 4
    };

    const edited = compAudioTakeFromPlayheadCommand(ready, secondPlaced.clipId);
    const clips = edited.undoStack.present.timeline.clips
      .filter((clip) => clip.metadata?.takeGroupId === "vocal-comp-b")
      .sort((a, b) => a.startBar - b.startBar || String(a.metadata?.takeIndex || "").localeCompare(String(b.metadata?.takeIndex || "")) || a.id.localeCompare(b.id));
    const firstLeft = edited.undoStack.present.timeline.clips.find((clip) => clip.id === firstPlaced.clipId)!;
    const secondLeft = edited.undoStack.present.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;
    const firstRight = clips.find((clip) => clip.name === "Vocal take 1.wav split")!;
    const secondRight = clips.find((clip) => clip.name === "Vocal take 2.wav split")!;

    expect(clips).toHaveLength(4);
    expect(firstLeft).toMatchObject({ startBar: 2, barLength: 2, muted: false });
    expect(firstLeft.metadata).toMatchObject({ takeActive: true, takeStatus: "active", takeIndex: 1 });
    expect(secondLeft).toMatchObject({ startBar: 2, barLength: 2, muted: true });
    expect(secondLeft.metadata).toMatchObject({ takeActive: false, takeStatus: "muted-take", takeIndex: 2 });
    expect(firstRight).toMatchObject({ startBar: 4, barLength: 2, muted: true });
    expect(firstRight.metadata).toMatchObject({ takeActive: false, takeStatus: "muted-take", takeIndex: 1, sourceOffsetSeconds: 4 });
    expect(secondRight).toMatchObject({ startBar: 4, barLength: 2, muted: false });
    expect(secondRight.metadata).toMatchObject({ takeActive: true, takeStatus: "active", takeIndex: 2, sourceOffsetSeconds: 4 });
    expect(edited.selectedClipId).toBe(secondRight.id);
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.status).toContain("Comped Vocal take 2.wav split from bar 4");
  });

  it("comps a grouped audio take only over the active edit range", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "Vocal range take 1.wav",
      uri: "project-media/recordings/vocal-range-take-1.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "vocal-range-comp", inputMode: "mono", channelMap: [0] }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Vocal range take 2.wav",
      uri: "project-media/recordings/vocal-range-take-2.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "vocal-range-comp", inputMode: "mono", channelMap: [0] }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = firstPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;
    const firstActive = activateAudioTakeCommand(state, firstPlaced.clipId);
    const ranged = setTimelineSelectionRangeCommand({
      ...firstActive,
      selectedClipId: secondPlaced.clipId,
      selectedTrackId: secondPlaced.trackId
    }, 3, 5);

    const edited = compAudioTakeRangeCommand(ranged, secondPlaced.clipId);
    const clips = edited.undoStack.present.timeline.clips
      .filter((clip) => clip.metadata?.takeGroupId === "vocal-range-comp")
      .sort((a, b) => Number(a.metadata?.takeIndex || 0) - Number(b.metadata?.takeIndex || 0) || a.startBar - b.startBar);
    const takeOne = clips.filter((clip) => clip.metadata?.takeIndex === 1);
    const takeTwo = clips.filter((clip) => clip.metadata?.takeIndex === 2);
    const activeSegments = clips
      .filter((clip) => clip.metadata?.takeStatus === "active" && !clip.muted)
      .sort((a, b) => a.startBar - b.startBar || Number(a.metadata?.takeIndex || 0) - Number(b.metadata?.takeIndex || 0));

    expect(takeOne.map((clip) => [clip.startBar, clip.barLength, clip.metadata?.takeStatus, clip.metadata?.sourceOffsetSeconds])).toEqual([
      [2, 1, "active", 0],
      [3, 2, "muted-take", 2],
      [5, 1, "active", 6]
    ]);
    expect(takeTwo.map((clip) => [clip.startBar, clip.barLength, clip.metadata?.takeStatus, clip.metadata?.sourceOffsetSeconds])).toEqual([
      [2, 1, "muted-take", 0],
      [3, 2, "active", 2],
      [5, 1, "muted-take", 6]
    ]);
    expect(activeSegments.map((clip) => [clip.metadata?.takeIndex, clip.startBar, clip.barLength])).toEqual([[1, 2, 1], [2, 3, 2], [1, 5, 1]]);
    expect(edited.selectedClipId).toBe(takeTwo.find((clip) => clip.startBar === 3)?.id);
    expect(edited.undoStack.past).toHaveLength(3);
    expect(edited.status).toBe("Comped Vocal range take 2.wav over edit range 3 to 5.");
  });

  it("creates selected audio clip gain and fade automation through the undoable command path", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Voice.wav",
      uri: "C:\\Audio\\Voice.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    let edited = ensureClipAutomationLaneCommand(state, placed.clipId, "gain");
    edited.playheadBar = 3;
    edited = addClipAutomationPointCommand(edited, placed.clipId, "gain");
    edited = ensureClipAutomationLaneCommand(edited, placed.clipId, "fadeInSeconds");
    edited.playheadBar = 3.5;
    edited = addClipAutomationPointCommand(edited, placed.clipId, "fadeInSeconds");
    const gainLane = edited.undoStack.present.automation.lanes.find((item) => item.targetPath === `clips.${placed.clipId}.gain`)!;
    const fadeLane = edited.undoStack.present.automation.lanes.find((item) => item.targetPath === `clips.${placed.clipId}.fadeInSeconds`)!;

    expect(gainLane.points.map((point) => point.bar)).toEqual([2, 3]);
    expect(fadeLane.points.map((point) => point.bar)).toEqual([2, 3.5]);
    expect(edited.undoStack.past).toHaveLength(4);
    expect(edited.selectedClipId).toBe(placed.clipId);
    expect(edited.status).toContain("fade in automation point");
  });

  it("records audio clip gain, fade and source-offset automation only into prepared lanes", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Voice.wav",
      uri: "C:\\Audio\\Voice.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;
    state.playheadBar = 3.5;

    expect(recordClipAutomationPointCommand(state, placed.clipId, "gain", 0.42)).toBe(state);
    expect(recordClipAutomationPointCommand(state, placed.clipId, "fadeOutSeconds", 1.5)).toBe(state);

    let prepared = ensureClipAutomationLaneCommand(state, placed.clipId, "gain");
    prepared = ensureClipAutomationLaneCommand(prepared, placed.clipId, "fadeOutSeconds");
    prepared = ensureClipAutomationLaneCommand(prepared, placed.clipId, "sourceOffsetSeconds");
    let recorded = recordClipAutomationPointCommand(prepared, placed.clipId, "gain", 0.42, 3.5);
    recorded = recordClipAutomationPointCommand(recorded, placed.clipId, "fadeOutSeconds", 1.5, 3.75);
    recorded = recordClipAutomationPointCommand(recorded, placed.clipId, "sourceOffsetSeconds", 2.25, 4);
    const gainLane = recorded.undoStack.present.automation.lanes.find((item) => item.targetPath === `clips.${placed.clipId}.gain`)!;
    const fadeLane = recorded.undoStack.present.automation.lanes.find((item) => item.targetPath === `clips.${placed.clipId}.fadeOutSeconds`)!;
    const offsetLane = recorded.undoStack.present.automation.lanes.find((item) => item.targetPath === `clips.${placed.clipId}.sourceOffsetSeconds`)!;

    expect(gainLane.points).toContainEqual(expect.objectContaining({ bar: 3.5, value: 0.42, curve: "linear" }));
    expect(fadeLane.points).toContainEqual(expect.objectContaining({ bar: 3.75, value: 1.5, curve: "linear" }));
    expect(offsetLane.points).toContainEqual(expect.objectContaining({ bar: 4, value: 2.25, curve: "linear" }));
    expect(recorded.selectedClipId).toBe(placed.clipId);
    expect(recorded.status).toContain("Recorded Voice.wav source offset automation point");
  });

  it("normalizes selected audio clip gain from linked waveform peaks without changing source media", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Voice.wav",
      uri: "C:\\Audio\\Voice.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [0.1, 0.5, 0.25] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const edited = applySelectedAudioClipActionCommand(state, placed.clipId, "normalize-gain");
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const media = edited.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)!;

    expect(clip.metadata?.gain).toBeCloseTo(1.9, 5);
    expect(clip.metadata?.normalizedPeakTarget).toBe(0.95);
    expect(media.metadata?.waveformPeaks).toEqual([0.1, 0.5, 0.25]);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(placed.clipId);
    expect(edited.selectedTrackId).toBe(placed.trackId);
    expect(edited.status).toContain("Normalized Voice.wav");
  });

  it("detects selected audio clip transients through the undoable command path without changing source media", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Drum Loop.wav",
      uri: "C:\\Audio\\Drum Loop.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.05, 0.72, 0.2, 0.15, 0.86, 0.3] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const edited = applySelectedAudioClipActionCommand(state, placed.clipId, "analyze-transients");
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const media = edited.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)!;

    expect(media.uri).toBe(imported.item.uri);
    expect(media.metadata?.waveformPeaks).toEqual([0.05, 0.72, 0.2, 0.15, 0.86, 0.3]);
    expect(media.metadata?.audioTransientMarkersSeconds).toEqual([1.5, 4.5]);
    expect(media.metadata?.audioTransientThreshold).toBe(0.473);
    expect(media.metadata?.audioTransientPeakCount).toBe(6);
    expect(clip.metadata).toMatchObject({
      transientSourceMediaId: imported.item.id,
      transientMarkerCount: 2,
      transientAnalysisReady: true
    });
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(placed.clipId);
    expect(edited.status).toContain("Detected 2 transient markers");
  });

  it("creates and clears source-safe warp markers from analyzed transients", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Warp Loop.wav",
      uri: "C:\\Audio\\Warp Loop.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.05, 0.72, 0.2, 0.15, 0.86, 0.3] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const analyzed = applySelectedAudioClipActionCommand(state, placed.clipId, "analyze-transients");
    const warped = applySelectedAudioClipActionCommand(analyzed, placed.clipId, "create-warp-markers");
    const clip = warped.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const media = warped.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)!;

    expect(media.uri).toBe(imported.item.uri);
    expect(clip.metadata?.audioWarpMarkerCount).toBe(2);
    expect(clip.metadata?.audioWarpReady).toBe(true);
    expect(clip.metadata?.audioWarpPlaybackMode).toBe("metadata-only");
    expect(clip.metadata?.audioWarpEngine).toBe("pending-time-stretch-engine");
    expect(clip.metadata?.audioWarpMarkers).toEqual([
      expect.objectContaining({ id: "warp_1", sourceSeconds: 1.5, targetBar: 2.75, targetSeconds: 3.5, source: "transient", locked: true }),
      expect.objectContaining({ id: "warp_2", sourceSeconds: 4.5, targetBar: 4.25, targetSeconds: 6.5, source: "transient", locked: true })
    ]);
    expect(warped.undoStack.past).toHaveLength(2);
    expect(warped.status).toContain("Created 2 source-safe warp markers");
    expect(warped.status).toContain("playback stretching is not enabled yet");

    const cleared = applySelectedAudioClipActionCommand(warped, placed.clipId, "clear-warp-markers");
    const clearedClip = cleared.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    expect(clearedClip.metadata?.audioWarpMarkers).toEqual([]);
    expect(clearedClip.metadata?.audioWarpMarkerCount).toBe(0);
    expect(clearedClip.metadata?.audioWarpReady).toBe(false);
    expect(cleared.undoStack.past).toHaveLength(3);
    expect(cleared.status).toContain("Cleared 2 warp markers");
  });

  it("quantizes source-safe warp marker targets without changing source audio anchors", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Loose Drums.wav",
      uri: "C:\\Audio\\Loose Drums.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const project = {
      ...placed.project,
      timeline: {
        ...placed.project.timeline,
        clips: placed.project.timeline.clips.map((clip) => clip.id === placed.clipId ? {
          ...clip,
          metadata: {
            ...(clip.metadata || {}),
            audioWarpMarkers: [
              { id: "warp_1", sourceSeconds: 0.37, targetBar: 2.18, targetSeconds: 2.36, source: "transient", locked: true },
              { id: "warp_2", sourceSeconds: 1.12, targetBar: 2.59, targetSeconds: 3.18, source: "transient", locked: true },
              { id: "warp_3", sourceSeconds: 2.01, targetBar: 3.03, targetSeconds: 4.06, source: "transient", locked: true }
            ],
            audioWarpMarkerCount: 3,
            audioWarpReady: true,
            audioWarpPlaybackMode: "metadata-only"
          }
        } : clip)
      }
    };
    state.undoStack = createUndoStack(project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const quantized = applySelectedAudioClipActionCommand(state, placed.clipId, "quantize-warp-markers");
    const clip = quantized.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;

    expect(clip.metadata?.audioWarpMarkers).toEqual([
      expect.objectContaining({ id: "warp_1", sourceSeconds: 0.37, targetBar: 2.188, targetSeconds: 2.376 }),
      expect.objectContaining({ id: "warp_2", sourceSeconds: 1.12, targetBar: 2.563, targetSeconds: 3.126 }),
      expect.objectContaining({ id: "warp_3", sourceSeconds: 2.01, targetBar: 3, targetSeconds: 4 })
    ]);
    expect(clip.metadata?.audioWarpMarkerCount).toBe(3);
    expect(clip.metadata?.audioWarpReady).toBe(true);
    expect(clip.metadata?.audioWarpQuantizeGrid).toBe("1/16");
    expect(clip.metadata?.audioWarpPlaybackMode).toBe("metadata-only");
    expect(clip.metadata?.audioWarpEngine).toBe("pending-time-stretch-engine");
    expect(quantized.undoStack.past).toHaveLength(1);
    expect(quantized.selectedClipId).toBe(placed.clipId);
    expect(quantized.selectedTrackId).toBe(placed.trackId);
    expect(quantized.status).toContain("Quantized 3 warp marker targets");
    expect(quantized.status).toContain("playback stretching is not enabled yet");
  });

  it("keeps warp marker creation unavailable until transients are analyzed", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Raw Loop.wav",
      uri: "C:\\Audio\\Raw Loop.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.7, 0.1, 0.8] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const edited = applySelectedAudioClipActionCommand(state, placed.clipId, "create-warp-markers");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.undoStack.past).toHaveLength(0);
    expect(edited.status).toContain("Analyze transients");
  });

  it("retargets source-safe warp markers when audio clips are split and cropped", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Warp Edit.wav",
      uri: "C:\\Audio\\Warp Edit.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.05, 0.72, 0.2, 0.15, 0.86, 0.3] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    const analyzed = applySelectedAudioClipActionCommand(state, placed.clipId, "analyze-transients");
    const warped = applySelectedAudioClipActionCommand(analyzed, placed.clipId, "create-warp-markers");

    const split = splitClipAtBar(warped.undoStack.present, placed.clipId, 3);
    const left = split.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    const right = split.project.timeline.clips.find((item) => item.id === split.rightClipId)!;

    expect(left.metadata?.audioWarpMarkers).toEqual([
      expect.objectContaining({ sourceSeconds: 1.5, targetBar: 2.75, targetSeconds: 3.5 })
    ]);
    expect(right.metadata?.audioWarpMarkers).toEqual([
      expect.objectContaining({ sourceSeconds: 4.5, targetBar: 4.25, targetSeconds: 6.5 })
    ]);
    expect(right.metadata?.audioWarpMarkerCount).toBe(1);

    const cropState = {
      ...state,
      undoStack: createUndoStack(warped.undoStack.present),
      selectedClipId: placed.clipId,
      selectedTrackId: placed.trackId
    };
    const ranged = setTimelineSelectionRangeCommand(cropState, 3, 5);
    const cropped = cropSelectedClipToTimelineSelectionCommand(ranged);
    const croppedClip = cropped.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;

    expect(croppedClip.startBar).toBe(3);
    expect(croppedClip.metadata?.sourceOffsetSeconds).toBe(2);
    expect(croppedClip.metadata?.audioWarpMarkers).toEqual([
      expect.objectContaining({ sourceSeconds: 4.5, targetBar: 4.25, targetSeconds: 6.5 })
    ]);
    expect(croppedClip.metadata?.audioWarpMarkerCount).toBe(1);
  });

  it("keeps normalize unavailable until an audio clip has waveform peak data", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Silent.wav",
      uri: "C:\\Audio\\Silent.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const edited = applySelectedAudioClipActionCommand(state, placed.clipId, "normalize-gain");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.undoStack.past).toHaveLength(0);
    expect(edited.status).toContain("Analyze or reload Silent.wav");
  });

  it("applies short fades and resets fades through the undoable command path", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Loop.wav",
      uri: "C:\\Audio\\Loop.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.25] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const faded = applySelectedAudioClipActionCommand(state, placed.clipId, "quick-fade");
    const fadedClip = faded.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    expect(fadedClip.metadata?.fadeInSeconds).toBe(0.05);
    expect(fadedClip.metadata?.fadeOutSeconds).toBe(0.05);
    expect(faded.status).toContain("Applied short fades");

    const reset = applySelectedAudioClipActionCommand(faded, placed.clipId, "reset-fades");
    const resetClip = reset.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    expect(resetClip.metadata?.fadeInSeconds).toBe(0);
    expect(resetClip.metadata?.fadeOutSeconds).toBe(0);
    expect(reset.undoStack.past).toHaveLength(2);
    expect(reset.status).toContain("Reset fades");
  });

  it("toggles selected audio clip phase inversion without changing source media", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Snare Top.wav",
      uri: "C:\\Audio\\Snare Top.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [0.35] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const inverted = applySelectedAudioClipActionCommand(state, placed.clipId, "invert-phase");
    const invertedClip = inverted.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const invertedRegion = renderTimelineAudioRegions(inverted.undoStack.present, { includeMutedTracks: true }).audioRegions[0];

    expect(invertedClip.metadata?.invertPhase).toBe(true);
    expect(invertedRegion.phaseMultiplier).toBe(-1);
    expect(inverted.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
    expect(inverted.undoStack.past).toHaveLength(1);
    expect(inverted.status).toContain("Inverted phase");

    const restored = applySelectedAudioClipActionCommand(inverted, placed.clipId, "invert-phase");
    const restoredClip = restored.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const restoredRegion = renderTimelineAudioRegions(restored.undoStack.present, { includeMutedTracks: true }).audioRegions[0];

    expect(restoredClip.metadata?.invertPhase).toBe(false);
    expect(restoredRegion.phaseMultiplier).toBe(1);
    expect(restored.undoStack.past).toHaveLength(2);
    expect(restored.status).toContain("Restored phase");
  });

  it("toggles selected audio clip reverse playback without changing source media", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Reverse Me.wav",
      uri: "C:\\Audio\\Reverse Me.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [0.35] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const reversed = applySelectedAudioClipActionCommand(state, placed.clipId, "reverse");
    const reversedClip = reversed.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const reversedRegion = renderTimelineAudioRegions(reversed.undoStack.present, { includeMutedTracks: true }).audioRegions[0];

    expect(reversedClip.metadata?.reversed).toBe(true);
    expect(reversedRegion.reversed).toBe(true);
    expect(reversed.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
    expect(reversed.undoStack.past).toHaveLength(1);
    expect(reversed.status).toContain("Reversed");

    const restored = applySelectedAudioClipActionCommand(reversed, placed.clipId, "reverse");
    const restoredClip = restored.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const restoredRegion = renderTimelineAudioRegions(restored.undoStack.present, { includeMutedTracks: true }).audioRegions[0];

    expect(restoredClip.metadata?.reversed).toBe(false);
    expect(restoredRegion.reversed).toBe(false);
    expect(restored.undoStack.past).toHaveLength(2);
    expect(restored.status).toContain("Restored forward playback");
  });

  it("creates a source-safe crossfade across overlapping audio clips", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "First.wav",
      uri: "C:\\Audio\\First.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.4] }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Second.wav",
      uri: "C:\\Audio\\Second.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.35] }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 5);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;

    const edited = applySelectedAudioClipActionCommand(state, secondPlaced.clipId, "crossfade-overlap");
    const first = edited.undoStack.present.timeline.clips.find((item) => item.id === firstPlaced.clipId)!;
    const second = edited.undoStack.present.timeline.clips.find((item) => item.id === secondPlaced.clipId)!;
    const regions = renderTimelineAudioRegions(edited.undoStack.present, { includeMutedTracks: true }).audioRegions;

    expect(first.metadata?.fadeOutSeconds).toBe(2);
    expect(first.metadata?.crossfadeOutClipId).toBe(second.id);
    expect(second.metadata?.fadeInSeconds).toBe(2);
    expect(second.metadata?.crossfadeInClipId).toBe(first.id);
    expect(regions.find((region) => region.clipId === first.id)?.fadeOutSeconds).toBe(2);
    expect(regions.find((region) => region.clipId === second.id)?.fadeInSeconds).toBe(2);
    expect(edited.undoStack.present.mediaPool.find((item) => item.id === firstImport.item.id)?.uri).toBe(firstImport.item.uri);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(secondPlaced.clipId);
    expect(edited.status).toContain("Applied 2s crossfade");
  });

  it("creates a source-safe overlap crossfade from the right half of a split audio clip", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Take.wav",
      uri: "C:\\Audio\\Take.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.4] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const split = splitClipAtBar(placed.project, placed.clipId, 4);
    expect(split.rightClipId).toBeTruthy();
    state.undoStack = createUndoStack(split.project);
    state.selectedClipId = split.rightClipId;
    state.selectedTrackId = placed.trackId;

    const edited = applySelectedAudioClipActionCommand(state, split.rightClipId!, "create-crossfade-left");
    const left = edited.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;
    const right = edited.undoStack.present.timeline.clips.find((item) => item.id === split.rightClipId)!;
    const regions = renderTimelineAudioRegions(edited.undoStack.present, { includeMutedTracks: true }).audioRegions;

    expect(right.startBar).toBeCloseTo(3.75, 5);
    expect(right.barLength).toBeCloseTo(2.25, 5);
    expect(right.metadata?.sourceOffsetSeconds).toBeCloseTo(3.5, 5);
    expect(left.metadata?.fadeOutSeconds).toBeCloseTo(0.5, 5);
    expect(left.metadata?.crossfadeOutClipId).toBe(right.id);
    expect(right.metadata?.fadeInSeconds).toBeCloseTo(0.5, 5);
    expect(right.metadata?.crossfadeInClipId).toBe(left.id);
    expect(regions.find((region) => region.clipId === left.id)?.fadeOutSeconds).toBeCloseTo(0.5, 5);
    expect(regions.find((region) => region.clipId === right.id)?.fadeInSeconds).toBeCloseTo(0.5, 5);
    expect(edited.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)?.uri).toBe(imported.item.uri);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(split.rightClipId);
    expect(edited.status).toContain("Created 0.5s overlap crossfade");
  });

  it("uses active meter-map seconds for overlap crossfade durations", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    state.undoStack.present.project.meterMap = [{ id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" }];
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "First Meter.wav",
      uri: "C:\\Audio\\First Meter.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const first = firstPlaced.project.timeline.clips.find((item) => item.id === firstPlaced.clipId)!;
    first.barLength = 1;
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Second Meter.wav",
      uri: "C:\\Audio\\Second Meter.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2.5);
    const second = secondPlaced.project.timeline.clips.find((item) => item.id === secondPlaced.clipId)!;
    second.barLength = 1;
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;

    const edited = applySelectedAudioClipActionCommand(state, secondPlaced.clipId, "crossfade-overlap");
    const updatedFirst = edited.undoStack.present.timeline.clips.find((item) => item.id === firstPlaced.clipId)!;
    const updatedSecond = edited.undoStack.present.timeline.clips.find((item) => item.id === secondPlaced.clipId)!;

    expect(updatedFirst.metadata?.fadeOutSeconds).toBeCloseTo(0.875, 5);
    expect(updatedSecond.metadata?.fadeInSeconds).toBeCloseTo(0.875, 5);
    expect(edited.status).toContain("Applied 0.875s crossfade");
  });

  it("does not create a crossfade when the selected audio clip has no overlap", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "First.wav",
      uri: "C:\\Audio\\First.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 2
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Second.wav",
      uri: "C:\\Audio\\Second.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 2
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 6);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;

    const edited = applySelectedAudioClipActionCommand(state, secondPlaced.clipId, "crossfade-overlap");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.undoStack.past).toHaveLength(0);
    expect(edited.status).toContain("Overlap audio clips");
  });

  it("does not create an overlap crossfade without earlier source material", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "First.wav",
      uri: "C:\\Audio\\First.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 2
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Second.wav",
      uri: "C:\\Audio\\Second.wav",
      mimeType: "audio/wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 2
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 4);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;

    const edited = applySelectedAudioClipActionCommand(state, secondPlaced.clipId, "create-crossfade-left");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.undoStack.past).toHaveLength(0);
    expect(edited.status).toContain("earlier source material");
  });
});
