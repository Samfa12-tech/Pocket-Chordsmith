import { describe, expect, it } from "vitest";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { addFxSlot } from "../src/daw/fx";
import { createAutomationLane } from "../src/daw/automation";
import { addBusTrack, addReturnTrack, routeTrackToOutput, setTrackSendLevel, setTrackSendMode } from "../src/daw/routing";
import { POCKET_DAW_VERSION } from "../src/daw/schema";
import { activateAudioTakeCommand, addMidiControllerCommand, adoptMidiMeterMapCommand, applySelectedAudioClipActionCommand, duplicateMidiControllerCommand, duplicateMidiNoteCommand, quantizeMidiClipCommand, setMidiControllerFieldCommand, setMidiNoteFieldCommand, setSelectedAudioClipPropertyCommand, swingMidiClipCommand, transformMidiPitchCommand, transformMidiVelocityCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { splitClipAtBar } from "../src/daw/clips";
import { addMidiAftertouch, addMidiNote, addMidiPitchBend, addMidiProgramChange, importMidiFileToProject, midiDataFromClip, setMidiAftertouchField, setMidiPitchBendField, setMidiProgramChangeField } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createUndoStack } from "../src/daw/undo";
import { aftertouchMidiBytes, pitchBendMidiBytes, programChangeMidiBytes, simpleMidiBytes, tempoMapMidiBytes } from "./midiFixtures";
import { branchGeneratedDrumsToTracks, cycleDrumBranchStep, drumBranchGroupCollapsed, generatedDrumBranchLane, getDrumBranchStepLevel, setDrumBranchGroupCollapsed } from "../src/daw/drumLanes";
import { addTrackToProject, setTrackFolder, toggleFolderExpanded } from "../src/daw/tracks";
import { toggleTrackSolo } from "../src/daw/mixer";

describe("project roundtrip", () => {
  it("saves and opens .pocketdaw JSON", () => {
    let project = addFxSlot(createDemoProject(), "bass", "compressor");
    const bus = addBusTrack(project, "Music Bus");
    project = routeTrackToOutput(bus.project, "bass", bus.trackId);
    const ret = addReturnTrack(project, "Verb Return");
    project = setTrackSendLevel(ret.project, "bass", ret.trackId, 0.25);
    project = setTrackSendMode(project, "bass", ret.trackId, "post-fader");
    const folder = addTrackToProject(project, "folder");
    project = toggleFolderExpanded(setTrackFolder(folder.project, "bass", folder.trackId), folder.trackId);
    project = toggleTrackSolo(project, folder.trackId);
    project = createAutomationLane(project, "tracks.bass.volume", { points: [{ bar: 1, value: 0.5 }, { bar: 2, value: 1 }] }).project;
    project = createAutomationLane(project, `tracks.bass.sends.${ret.trackId}.level`, { points: [{ bar: 1, value: 0.2 }, { bar: 3, value: 0.7 }] }).project;
    project.audioDeviceSettings.devices = [
      { id: "wasapi_input_1", name: "Test Interface Input", kind: "input", host: "wasapi", isDefaultInput: true, isDefaultOutput: false }
    ];
    const raw = buildPocketDawProjectFile(project);
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(raw));
    expect(parsed.app).toBe("PocketDAW");
    expect(parsed.dawVersion).toBe(POCKET_DAW_VERSION);
    expect(parsed.timeline.clips.length).toBe(project.timeline.clips.length);
    expect(parsed.sourceRefs[0].original).toBeTruthy();
    expect(parsed.fx.chains.find((chain) => chain.ownerTrackId === "bass")?.slots[0]?.type).toBe("compressor");
    expect(parsed.audioDeviceSettings.devices?.[0]?.name).toBe("Test Interface Input");
    expect(parsed.automation.lanes.find((lane) => lane.targetPath === "tracks.bass.volume")?.points).toHaveLength(2);
    expect(parsed.automation.lanes.find((lane) => lane.targetPath === `tracks.bass.sends.${ret.trackId}.level`)?.points).toHaveLength(2);
    expect(parsed.tracks.find((track) => track.id === "bass")?.routing.outputId).toBe(bus.trackId);
    expect(parsed.tracks.find((track) => track.id === "bass")?.metadata?.sendLevels).toMatchObject({ [ret.trackId]: 0.25 });
    expect(parsed.tracks.find((track) => track.id === "bass")?.metadata?.sendModes).toMatchObject({ [ret.trackId]: "post-fader" });
    expect(parsed.tracks.find((track) => track.id === folder.trackId)).toMatchObject({
      trackType: "folder",
      role: "folder",
      solo: true,
      routing: { inputIds: [], outputId: null, sendIds: [] },
      metadata: { folderExpanded: false, folderMode: "organizational" }
    });
    expect(parsed.tracks.find((track) => track.id === folder.trackId)?.fxChainId).toBeUndefined();
    expect(parsed.tracks.find((track) => track.id === "bass")?.folderId).toBe(folder.trackId);
    expect(parsed.routing.buses.find((item) => item.id === bus.trackId)?.trackIds).toContain("bass");
    expect(parsed.exportProfiles.find((profile) => profile.id === "stem-wavs")?.enabled).toBe(true);
  });

  it("preserves generated drum branch group collapse metadata through save and reopen", () => {
    const project = setDrumBranchGroupCollapsed(branchGeneratedDrumsToTracks(createDemoProject()), true);
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(project)));

    expect(parsed.tracks.filter((track) => generatedDrumBranchLane(track))).toHaveLength(project.tracks.filter((track) => generatedDrumBranchLane(track)).length);
    expect(drumBranchGroupCollapsed(parsed)).toBe(true);
  });

  it("preserves DAW-only drum branch overlay steps through save and reopen", () => {
    let project = branchGeneratedDrumsToTracks(createDemoProject());
    project = cycleDrumBranchStep(project, "A", "ride", 5);
    project = cycleDrumBranchStep(project, "A", "ride", 5);

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(project)));

    expect(getDrumBranchStepLevel(parsed, "A", "ride", 5)).toBe(2);
    expect(parsed.sourceRefs[0].normalized).toMatchObject({
      sections: {
        A: {
          grid: expect.objectContaining({
            kick: expect.any(Array),
            snare: expect.any(Array),
            hat: expect.any(Array)
          })
        }
      }
    });
  });

  it("preserves command-edited audio clip properties through save and reopen", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Vocal Take.wav",
      uri: "C:\\Audio\\Vocal Take.wav",
      mimeType: "audio/wav",
      durationSeconds: 12,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [0.25, 0.5] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    let edited = setSelectedAudioClipPropertyCommand(state, placed.clipId, "gain", 0.7);
    edited = setSelectedAudioClipPropertyCommand(edited, placed.clipId, "fadeInSeconds", 0.5);
    edited = setSelectedAudioClipPropertyCommand(edited, placed.clipId, "fadeOutSeconds", 0.75);
    edited = setSelectedAudioClipPropertyCommand(edited, placed.clipId, "sourceOffsetSeconds", 1.25);
    edited = setSelectedAudioClipPropertyCommand(edited, placed.clipId, "playbackRate", 1.25);
    edited = setSelectedAudioClipPropertyCommand(edited, placed.clipId, "pitchSemitones", -7);
    edited = applySelectedAudioClipActionCommand(edited, placed.clipId, "normalize-gain");
    edited = applySelectedAudioClipActionCommand(edited, placed.clipId, "reset-fades");
    edited = applySelectedAudioClipActionCommand(edited, placed.clipId, "quick-fade");
    edited = applySelectedAudioClipActionCommand(edited, placed.clipId, "invert-phase");
    const automated = createAutomationLane(edited.undoStack.present, `clips.${placed.clipId}.gain`, {
      min: 0,
      max: 4,
      points: [{ bar: 2, value: 0.5 }, { bar: 3, value: 1.1 }]
    });
    edited.undoStack = createUndoStack(automated.project);

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited.undoStack.present)));
    const clip = parsed.timeline.clips.find((item) => item.id === placed.clipId)!;

    expect(clip.metadata).toMatchObject({
      gain: 1.9,
      normalizedPeakTarget: 0.95,
      normalizedFromPeak: 0.5,
      fadeInSeconds: 0.05,
      fadeOutSeconds: 0.05,
      sourceOffsetSeconds: 1.25,
      playbackRate: 1.25,
      pitchSemitones: -7,
      invertPhase: true
    });
    expect(clip.automationLaneId).toBeTruthy();
    expect(parsed.automation.lanes.find((lane) => lane.targetPath === `clips.${placed.clipId}.gain`)?.points).toEqual([
      expect.objectContaining({ bar: 2, value: 0.5 }),
      expect.objectContaining({ bar: 3, value: 1.1 })
    ]);
  });

  it("preserves active grouped audio take choices through save and reopen", () => {
    const state = createInitialState();
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "Lead take 1.wav",
      uri: "project-media/recordings/lead-take-1.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lead-comp-roundtrip", inputMode: "mono", channelMap: [0] }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 3);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Lead take 2.wav",
      uri: "project-media/recordings/lead-take-2.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lead-comp-roundtrip", inputMode: "mono", channelMap: [0] }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 3);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = secondPlaced.trackId;

    const edited = activateAudioTakeCommand(state, secondPlaced.clipId);
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited.undoStack.present)));
    const first = parsed.timeline.clips.find((clip) => clip.id === firstPlaced.clipId)!;
    const second = parsed.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;

    expect(first.muted).toBe(true);
    expect(first.metadata).toMatchObject({
      takeGroupId: "lead-comp-roundtrip",
      recordingTakeGroupId: "lead-comp-roundtrip",
      takeIndex: 1,
      takeLaneIndex: 1,
      takeLaneId: "lead-comp-roundtrip-lane-1",
      recordingTakeId: "lead-comp-roundtrip-take-1",
      takeActive: false,
      takeStatus: "muted-take",
      inputMode: "mono",
      channelMap: [0]
    });
    expect(second.muted).toBe(false);
    expect(second.metadata).toMatchObject({
      takeGroupId: "lead-comp-roundtrip",
      recordingTakeGroupId: "lead-comp-roundtrip",
      takeIndex: 2,
      takeLaneIndex: 2,
      takeLaneId: "lead-comp-roundtrip-lane-2",
      recordingTakeId: "lead-comp-roundtrip-take-2",
      takeActive: true,
      takeStatus: "active",
      inputMode: "mono",
      channelMap: [0]
    });
  });

  it("preserves audio crossfade metadata through save and reopen", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "First.wav",
      uri: "C:\\Audio\\First.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Second.wav",
      uri: "C:\\Audio\\Second.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 5);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = firstPlaced.trackId;

    const edited = applySelectedAudioClipActionCommand(state, secondPlaced.clipId, "crossfade-overlap");
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited.undoStack.present)));
    const first = parsed.timeline.clips.find((item) => item.id === firstPlaced.clipId)!;
    const second = parsed.timeline.clips.find((item) => item.id === secondPlaced.clipId)!;

    expect(first.metadata).toMatchObject({ fadeOutSeconds: 2, crossfadeOutClipId: second.id, crossfadeSeconds: 2 });
    expect(second.metadata).toMatchObject({ fadeInSeconds: 2, crossfadeInClipId: first.id, crossfadeSeconds: 2 });
  });

  it("preserves split-clip overlap fade metadata through save and reopen", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Take.wav",
      uri: "C:\\Audio\\Take.wav",
      mimeType: "audio/wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const split = splitClipAtBar(placed.project, placed.clipId, 4);
    state.undoStack = createUndoStack(split.project);
    state.selectedClipId = split.rightClipId;
    state.selectedTrackId = placed.trackId;

    const edited = applySelectedAudioClipActionCommand(state, split.rightClipId!, "create-crossfade-left");
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited.undoStack.present)));
    const left = parsed.timeline.clips.find((item) => item.id === placed.clipId)!;
    const right = parsed.timeline.clips.find((item) => item.id === split.rightClipId)!;

    expect(right.startBar).toBeCloseTo(3.75, 5);
    expect(right.barLength).toBeCloseTo(2.25, 5);
    expect(right.metadata).toMatchObject({ sourceOffsetSeconds: 3.5, fadeInSeconds: 0.5, crossfadeInClipId: left.id, crossfadeSeconds: 0.5 });
    expect(left.metadata).toMatchObject({ fadeOutSeconds: 0.5, crossfadeOutClipId: right.id, crossfadeSeconds: 0.5 });
  });

  it("preserves command-quantized and swung MIDI notes through save and reopen", () => {
    const state = createInitialState();
    const parsedMidi = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsedMidi, "lead.mid");
    const withLooseNote = addMidiNote(imported.project, imported.clipId, 181);
    state.undoStack = createUndoStack(withLooseNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    let edited = quantizeMidiClipCommand(state, imported.clipId, "1/16");
    edited = swingMidiClipCommand(edited, imported.clipId, 60);
    edited = transformMidiVelocityCommand(edited, imported.clipId, "level-96");
    edited = transformMidiVelocityCommand(edited, imported.clipId, "humanize-12");
    edited = transformMidiPitchCommand(edited, imported.clipId, "octave-up");
    const noteId = midiDataFromClip(edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!).notes.at(-1)!.id;
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "pitch", 74);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "startTick", 360);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "durationTicks", 720);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "velocity", 82);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "channel", 3);
    edited = duplicateMidiNoteCommand(edited, imported.clipId, noteId);
    edited.playheadBar = 2;
    edited = addMidiControllerCommand(edited, imported.clipId);
    const controllerId = midiDataFromClip(edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!).controllers[0].id;
    edited = setMidiControllerFieldCommand(edited, imported.clipId, controllerId, "controller", 74);
    edited = setMidiControllerFieldCommand(edited, imported.clipId, controllerId, "value", 91);
    edited = setMidiControllerFieldCommand(edited, imported.clipId, controllerId, "channel", 2);
    edited = duplicateMidiControllerCommand(edited, imported.clipId, controllerId);
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited.undoStack.present)));
    const clip = parsed.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).notes.some((note) => note.startTick === 360)).toBe(true);
    expect(midiDataFromClip(clip).notes.some((note) => note.startTick === 1080 && note.pitch === 74)).toBe(true);
    expect(midiDataFromClip(clip).notes.map((note) => note.velocity)).toContain(84);
    expect(midiDataFromClip(clip).notes.map((note) => note.pitch)).toContain(72);
    expect(midiDataFromClip(clip).notes.find((note) => note.id === noteId)).toMatchObject({ pitch: 74, startTick: 360, durationTicks: 720, velocity: 82, channel: 3 });
    expect(midiDataFromClip(clip).metadata?.lastQuantizeGrid).toBe("1/16");
    expect(midiDataFromClip(clip).metadata?.lastSwingPercent).toBe(60);
    expect(midiDataFromClip(clip).metadata?.lastVelocityTransform).toBe("humanize-12");
    expect(midiDataFromClip(clip).metadata?.lastPitchTransform).toBe("octave-up");
    expect(midiDataFromClip(clip).controllers[0]).toMatchObject({ controller: 74, value: 91, channel: 2 });
    expect(midiDataFromClip(clip).controllers[1]).toMatchObject({ controller: 74, value: 91, tick: 2400, channel: 2 });
  });

  it("preserves adopted imported MIDI meter maps through save and reopen", () => {
    const state = createInitialState();
    state.undoStack.present.project.timeSig = 5;
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(tempoMapMidiBytes()), "tempo-map.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = adoptMidiMeterMapCommand(state, imported.clipId);
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited.undoStack.present)));

    expect(parsed.project.timeSig).toBe(4);
    expect(parsed.project.meterMap).toEqual([
      expect.objectContaining({ bar: 1, numerator: 4, denominator: 4, source: "midi-import", sourceClipId: imported.clipId }),
      expect.objectContaining({ bar: 1.25, numerator: 3, denominator: 4, source: "midi-import", sourceClipId: imported.clipId })
    ]);
  });

  it("preserves imported MIDI program changes through save and reopen", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(programChangeMidiBytes()), "program-change.mid");

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(imported.project)));
    const clip = parsed.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).programChanges).toEqual([
      expect.objectContaining({ program: 24, tick: 0, channel: 2 }),
      expect.objectContaining({ program: 40, tick: 720, channel: 2 })
    ]);
  });

  it("preserves authored MIDI program changes through save and reopen", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(simpleMidiBytes()), "program.mid");
    const added = addMidiProgramChange(imported.project, imported.clipId, 240);
    const programId = midiDataFromClip(added.timeline.clips.find((item) => item.id === imported.clipId)!).programChanges[0].id;
    const edited = setMidiProgramChangeField(
      setMidiProgramChangeField(added, imported.clipId, programId, "program", 33),
      imported.clipId,
      programId,
      "channel",
      1
    );

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited)));
    const clip = parsed.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).programChanges).toEqual([
      expect.objectContaining({ program: 33, tick: 240, channel: 1 })
    ]);
  });

  it("preserves imported MIDI pitch bends through save and reopen", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(pitchBendMidiBytes()), "pitch-bend.mid");

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(imported.project)));
    const clip = parsed.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).pitchBends).toEqual([
      expect.objectContaining({ value: 8192, tick: 0, channel: 1 }),
      expect.objectContaining({ value: 12288, tick: 720, channel: 1 })
    ]);
  });

  it("preserves authored MIDI pitch bends through save and reopen", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(simpleMidiBytes()), "bend.mid");
    const added = addMidiPitchBend(imported.project, imported.clipId, 480);
    const bendId = midiDataFromClip(added.timeline.clips.find((item) => item.id === imported.clipId)!).pitchBends[0].id;
    const edited = setMidiPitchBendField(
      setMidiPitchBendField(added, imported.clipId, bendId, "value", 10240),
      imported.clipId,
      bendId,
      "channel",
      2
    );

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited)));
    const clip = parsed.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).pitchBends).toEqual([
      expect.objectContaining({ value: 10240, tick: 480, channel: 2 })
    ]);
  });

  it("preserves imported MIDI aftertouch through save and reopen", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(aftertouchMidiBytes()), "aftertouch.mid");

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(imported.project)));
    const clip = parsed.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).aftertouch).toEqual([
      expect.objectContaining({ kind: "poly", note: 60, value: 50, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 64, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "poly", note: 60, value: 32, tick: 720, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 48, tick: 720, channel: 3 })
    ]);
  });

  it("preserves authored MIDI aftertouch through save and reopen", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(simpleMidiBytes()), "touch.mid");
    const added = addMidiAftertouch(imported.project, imported.clipId, 480);
    const aftertouchId = midiDataFromClip(added.timeline.clips.find((item) => item.id === imported.clipId)!).aftertouch[0].id;
    const edited = setMidiAftertouchField(
      setMidiAftertouchField(added, imported.clipId, aftertouchId, "value", 96),
      imported.clipId,
      aftertouchId,
      "channel",
      7
    );

    const parsed = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(edited)));
    const clip = parsed.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).aftertouch).toEqual([
      expect.objectContaining({ kind: "channel", value: 96, tick: 480, channel: 7 })
    ]);
  });
});
