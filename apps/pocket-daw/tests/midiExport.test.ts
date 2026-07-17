import { describe, expect, it } from "vitest";
import { exportProjectToMidiBlob } from "../src/audio/midiExport";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { activateAudioTakeLane, setClipTransform } from "../src/daw/clips";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { addMidiAftertouch, addMidiController, addMidiNote, addMidiPitchBend, addMidiProgramChange, deleteMidiClipRange, duplicateMidiController, duplicateMidiNote, importMidiFileToProject, importMidiFileToProjectWithPlacement, midiDataFromClip, setMidiAftertouchField, setMidiControllerField, setMidiNoteField, setMidiPitchBendField, setMidiProgramChangeField } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createDemoChordsmithProject, createDemoProject } from "../src/demo/demoProject";
import { createAutomationLane } from "../src/daw/automation";
import { aftertouchMidiBytes, controllerOnlyMidiBytes, metalArrangementMidiBytes, multiTrackChannelMidiBytes, pitchBendMidiBytes, programChangeMidiBytes, shortNoteLateControllerMidiBytes, simpleMidiBytes } from "./midiFixtures";
import { toggleTrackMute } from "../src/daw/mixer";
import { addTrackToProject, setTrackFolder } from "../src/daw/tracks";

describe("MIDI export", () => {
  it("writes format 1 when exporting multiple tracks and preserves project tempo", async () => {
    const source = createDemoChordsmithProject();
    source.bpm = 136;
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source));
    const bytes = new Uint8Array(await exportProjectToMidiBlob(project).arrayBuffer());
    const parsed = parseStandardMidiFile(bytes);

    expect(readText(bytes, 0, 4)).toBe("MThd");
    expect(readU16(bytes, 8)).toBe(1);
    expect(readU16(bytes, 10)).toBeGreaterThan(1);
    expect(parsed.format).toBe(1);
    expect(parsed.tempoBpm).toBe(136.000145);
    expect(parsed.metadata.parsedTrackCount).toBe(readU16(bytes, 10));
    expect(parsed.notes.length).toBeGreaterThan(0);
  });

  it("exports project meter-map points as MIDI time-signature meta events", async () => {
    const project = createDemoProject();
    project.project.timeSig = 4;
    project.project.ppq = 480;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
      { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
    ];

    const bytes = new Uint8Array(await exportProjectToMidiBlob(project).arrayBuffer());
    const parsed = parseStandardMidiFile(bytes);

    expect(parsed.metadata.timeSignatureEvents).toEqual([
      expect.objectContaining({ tick: 0, trackIndex: 0, numerator: 4, denominator: 4 }),
      expect.objectContaining({ tick: 1920, trackIndex: 0, numerator: 7, denominator: 8 }),
      expect.objectContaining({ tick: 3600, trackIndex: 0, numerator: 3, denominator: 4 })
    ]);
  });

  it("can export only the selected clip's rendered MIDI events", async () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const expectedNoteOns = renderTimelineEvents(project)
      .filter((event) => event.clipId === clip.id)
      .reduce((total, event) => total + (event.midiNotes?.length || (event.midi !== undefined || ["kick", "snare", "hat"].includes(event.kind) ? 1 : 0)), 0);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(project, { clipIds: [clip.id] }).arrayBuffer());
    const parsed = parseStandardMidiFile(bytes);

    expect(expectedNoteOns).toBeGreaterThan(0);
    expect(parsed.notes).toHaveLength(expectedNoteOns);
  });

  it("exports grouped MIDI imports as separate musical tracks", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Grouped MIDI Export" }));
    const imported = importMidiFileToProjectWithPlacement(project, parseStandardMidiFile(multiTrackChannelMidiBytes()), "band.mid", {
      placementMode: "per-channel"
    });

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: imported.clipIds, trackIds: imported.trackIds }).arrayBuffer());
    const parsed = parseStandardMidiFile(bytes);

    expect(readU16(bytes, 10)).toBe(4);
    expect(parsed.trackNames).toEqual(["Grouped MIDI Export", "Channel 1", "Channel 2", "Channel 10"]);
    expect(parsed.notes.map((note) => note.channel).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1, 9]);
    expect(parsed.controllers).toEqual([expect.objectContaining({ controller: 7, channel: 0 })]);
    expect(parsed.programChanges).toEqual([
      expect.objectContaining({ program: 0, channel: 0 }),
      expect.objectContaining({ program: 32, channel: 1 })
    ]);
    expect(parsed.pitchBends).toEqual([expect.objectContaining({ value: 10240, channel: 1 })]);
    expect(parsed.aftertouch).toEqual([expect.objectContaining({ kind: "channel", value: 64, channel: 9 })]);
  });

  it("exports raw drum-channel split MIDI without losing drum notes", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Drum Split Export" }));
    const imported = importMidiFileToProjectWithPlacement(project, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid", {
      placementMode: "drum-channel-split"
    });

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: imported.clipIds, trackIds: imported.trackIds }).arrayBuffer());
    const parsed = parseStandardMidiFile(bytes);

    expect(readU16(bytes, 10)).toBe(5);
    expect(parsed.trackNames).toEqual(["Drum Split Export", "Kick (Ch 10)", "Snare (Ch 10)", "Closed Hat (Ch 10)", "Other MIDI Channels"]);
    expect(parsed.notes.filter((note) => note.channel === 9).map((note) => note.pitch)).toEqual([36, 38, 42]);
    expect(parsed.notes.filter((note) => note.channel !== 9)).toHaveLength(6);
  });

  it("applies clip transpose and gain before scoped MIDI export", async () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const changed = setClipTransform(setClipTransform(project, clip.id, "transpose", 12), clip.id, "gain", 0.5);
    const original = parseStandardMidiFile(new Uint8Array(await exportProjectToMidiBlob(project, { clipIds: [clip.id], trackIds: ["bass"] }).arrayBuffer()));
    const transposed = parseStandardMidiFile(new Uint8Array(await exportProjectToMidiBlob(changed, { clipIds: [clip.id], trackIds: ["bass"] }).arrayBuffer()));

    expect(original.notes.length).toBeGreaterThan(0);
    expect(transposed.notes[0].pitch).toBe(original.notes[0].pitch + 12);
    expect(transposed.notes[0].velocity).toBeLessThan(original.notes[0].velocity);
  });

  it("exports rendered note ticks through the project timeline clock", async () => {
    let project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.ppq = 480;
    project = createAutomationLane(project, "project.tempo", {
      min: 40,
      max: 240,
      points: [{ bar: 1, value: 60, curve: "hold" }]
    }).project;
    const clip = project.timeline.clips[0];
    clip.startBar = 2;

    const bytes = new Uint8Array(await exportProjectToMidiBlob(project, { clipIds: [clip.id], trackIds: ["bass"] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes.length).toBeGreaterThan(0);
    expect(exported.notes[0].startTick).toBe(1920);
  });

  it("exports hold tempo automation as a standard MIDI tempo map", async () => {
    let project = createDemoProject();
    project.project.bpm = 600;
    project.project.ppq = 480;
    project = createAutomationLane(project, "project.tempo", {
      min: 40,
      max: 999,
      points: [
        { bar: 1, value: 600, curve: "hold" },
        { bar: 1.25, value: 176.470588, curve: "hold" }
      ]
    }).project;

    const bytes = new Uint8Array(await exportProjectToMidiBlob(project).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);
    const tempoEvents = exported.metadata.tempoEvents as Array<{ tick: number; bpm: number }>;

    expect(tempoEvents).toEqual([
      expect.objectContaining({ tick: 0, bpm: 600 }),
      expect.objectContaining({ tick: 480, bpm: 176.470588 })
    ]);
  });

  it("preserves editable MIDI controller events in scoped MIDI export", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Controller Export" }));
    const parsedSource = parseStandardMidiFile(simpleMidiBytes(true));
    const imported = importMidiFileToProject(project, parsedSource, "lead-with-cc.mid");
    const controllerId = parsedSource.controllers[0].id;
    const edited = setMidiControllerField(
      setMidiControllerField(imported.project, imported.clipId, controllerId, "controller", 74),
      imported.clipId,
      controllerId,
      "value",
      91
    );
    const atNoteStart = setMidiControllerField(setMidiControllerField(edited, imported.clipId, controllerId, "tick", 0), imported.clipId, controllerId, "channel", 2);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(atNoteStart, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toHaveLength(1);
    expect(exported.notes[0].channel).toBe(0);
    expect(exported.controllers).toEqual([
      expect.objectContaining({ controller: 74, value: 91, tick: 0, channel: 2 })
    ]);
    expect(firstStatusIndex(bytes, 0xb2)).toBeLessThan(firstStatusIndex(bytes, 0x90));
  });

  it("places MIDI controller exports at meter-map-aware musical ticks", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Controller Meter Export" }));
    project.project.timeSig = 4;
    project.project.ppq = 480;
    project.project.meterMap = [{ id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" }];
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes(true)), "lead-with-cc.mid");
    const controllerId = midiDataFromClip(imported.project.timeline.clips.find((clip) => clip.id === imported.clipId)!).controllers[0].id;
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.startBar = 3;
    const edited = setMidiControllerField(imported.project, imported.clipId, controllerId, "tick", 0);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.controllers).toEqual([
      expect.objectContaining({ tick: 3600, controller: 1, value: 64 })
    ]);
  });

  it("keeps late or controller-only MIDI controller events inside imported clip exports", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Late CC Export" }));
    const late = importMidiFileToProject(project, parseStandardMidiFile(shortNoteLateControllerMidiBytes()), "late-cc.mid");
    const lateBytes = new Uint8Array(await exportProjectToMidiBlob(late.project, { clipIds: [late.clipId], trackIds: [late.trackId] }).arrayBuffer());
    const lateExport = parseStandardMidiFile(lateBytes);
    expect(late.project.timeline.clips.find((clip) => clip.id === late.clipId)?.barLength).toBeGreaterThan(1);
    expect(lateExport.controllers).toEqual([
      expect.objectContaining({ controller: 74, value: 91, tick: 2400 })
    ]);

    const controllerOnly = importMidiFileToProject(project, parseStandardMidiFile(controllerOnlyMidiBytes()), "controller-only.mid");
    const controllerOnlyBytes = new Uint8Array(await exportProjectToMidiBlob(controllerOnly.project, { clipIds: [controllerOnly.clipId], trackIds: [controllerOnly.trackId] }).arrayBuffer());
    const controllerOnlyExport = parseStandardMidiFile(controllerOnlyBytes);
    expect(controllerOnly.project.timeline.clips.find((clip) => clip.id === controllerOnly.clipId)?.barLength).toBeGreaterThan(1);
    expect(controllerOnlyExport.notes).toEqual([]);
    expect(controllerOnlyExport.controllers).toEqual([
      expect.objectContaining({ controller: 74, value: 91, tick: 2400 })
    ]);
  });

  it("does not export controller messages from muted MIDI clips", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Muted CC Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(controllerOnlyMidiBytes()), "muted-controller-only.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.muted = true;

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toEqual([]);
    expect(exported.controllers).toEqual([]);
  });

  it("keeps archived MIDI take lanes out of event rendering and MIDI export even if mute is stale", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Archived MIDI Take Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "archived-midi-take.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.muted = false;
    clip.metadata = {
      ...(clip.metadata || {}),
      takeGroupId: "archived-midi-takes",
      recordingTakeGroupId: "archived-midi-takes",
      takeLaneId: "archived-midi-takes-lane-1",
      takeLaneIndex: 1,
      takeStatus: "archived-take",
      takeActive: false
    };

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(renderTimelineEvents(imported.project).filter((event) => event.clipId === imported.clipId)).toEqual([]);
    expect(exported.notes).toEqual([]);
  });

  it("exports the active MIDI take lane after lane activation", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Take Lane Export" }));
    const first = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "midi-take-1.mid");
    const second = importMidiFileToProject(first.project, parseStandardMidiFile(simpleMidiBytes()), "midi-take-2.mid");
    const secondClip = second.project.timeline.clips.find((item) => item.id === second.clipId)!;
    const secondNoteId = midiDataFromClip(secondClip).notes[0].id;
    let grouped = setMidiNoteField(second.project, second.clipId, secondNoteId, "pitch", 64);
    const groupedFirst = grouped.timeline.clips.find((item) => item.id === first.clipId)!;
    const groupedSecond = grouped.timeline.clips.find((item) => item.id === second.clipId)!;
    groupedFirst.metadata = {
      ...(groupedFirst.metadata || {}),
      takeGroupId: "midi-lane-group",
      recordingTakeGroupId: "midi-lane-group",
      takeLaneId: "midi-lane-group-lane-1",
      takeLaneIndex: 1,
      takeStatus: "active",
      takeActive: true
    };
    groupedSecond.metadata = {
      ...(groupedSecond.metadata || {}),
      takeGroupId: "midi-lane-group",
      recordingTakeGroupId: "midi-lane-group",
      takeLaneId: "midi-lane-group-lane-2",
      takeLaneIndex: 2,
      takeStatus: "muted-take",
      takeActive: false
    };
    groupedSecond.muted = true;

    const activated = activateAudioTakeLane(grouped, second.clipId).project;
    const bytes = new Uint8Array(await exportProjectToMidiBlob(activated, { trackIds: [second.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(activated.timeline.clips.find((clip) => clip.id === first.clipId)?.muted).toBe(true);
    expect(activated.timeline.clips.find((clip) => clip.id === second.clipId)?.muted).toBe(false);
    expect(renderTimelineEvents(activated).filter((event) => event.clipId === second.clipId)).toHaveLength(1);
    expect(exported.notes.map((note) => note.pitch)).toEqual([64]);
  });

  it("exports timeline-edited MIDI take lanes after save reopen and lane activation", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Edited MIDI Take Lane Export" }));
    const first = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "midi-take-1.mid");
    const second = importMidiFileToProject(first.project, parseStandardMidiFile(simpleMidiBytes()), "midi-take-2.mid");
    const secondClip = second.project.timeline.clips.find((item) => item.id === second.clipId)!;
    const firstNoteId = midiDataFromClip(secondClip).notes[0].id;
    let edited = setMidiNoteField(second.project, second.clipId, firstNoteId, "pitch", 64);
    edited = addMidiNote(edited, second.clipId, 3840);
    const addedNoteId = midiDataFromClip(edited.timeline.clips.find((item) => item.id === second.clipId)!).notes.at(-1)!.id;
    edited = setMidiNoteField(edited, second.clipId, addedNoteId, "pitch", 67);

    const groupedFirst = edited.timeline.clips.find((item) => item.id === first.clipId)!;
    const groupedSecond = edited.timeline.clips.find((item) => item.id === second.clipId)!;
    groupedFirst.metadata = {
      ...(groupedFirst.metadata || {}),
      takeGroupId: "edited-midi-lane-group",
      recordingTakeGroupId: "edited-midi-lane-group",
      takeLaneId: "edited-midi-lane-group-lane-1",
      takeLaneIndex: 1,
      takeStatus: "active",
      takeActive: true
    };
    groupedFirst.muted = false;
    groupedSecond.metadata = {
      ...(groupedSecond.metadata || {}),
      takeGroupId: "edited-midi-lane-group",
      recordingTakeGroupId: "edited-midi-lane-group",
      takeLaneId: "edited-midi-lane-group-lane-2",
      takeLaneIndex: 2,
      takeStatus: "muted-take",
      takeActive: false
    };
    groupedSecond.muted = true;

    const deleted = deleteMidiClipRange(edited, second.clipId, 2, 3);
    expect(deleted.changed).toBe(true);
    expect(deleted.rightClipId).toBeTruthy();

    const reopened = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(deleted.project)));
    const activated = activateAudioTakeLane(reopened, deleted.rightClipId!).project;
    const activeEditedClips = activated.timeline.clips
      .filter((clip) => clip.metadata?.takeLaneId === "edited-midi-lane-group-lane-2")
      .sort((a, b) => a.startBar - b.startBar);
    const bytes = new Uint8Array(await exportProjectToMidiBlob(activated, { trackIds: [second.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(activeEditedClips.map((clip) => [clip.startBar, clip.barLength, clip.muted, clip.metadata?.takeStatus])).toEqual([
      [1, 1, false, "active"],
      [3, 0.25, false, "active"]
    ]);
    expect(activated.timeline.clips.find((clip) => clip.id === first.clipId)?.muted).toBe(true);
    expect(renderTimelineEvents(activated).filter((event) => activeEditedClips.some((clip) => clip.id === event.clipId)).map((event) => event.midi)).toEqual([64, 67]);
    expect(exported.notes.map((note) => note.pitch)).toEqual([64, 67]);
    expect(exported.notes.map((note) => note.startTick)).toEqual([0, 3840]);
  });

  it("does not export MIDI note or controller data from folder-muted tracks", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Folder Muted MIDI Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes(true)), "folder-muted.mid");
    const withFolder = addTrackToProject(imported.project, "folder");
    const assigned = setTrackFolder(withFolder.project, imported.trackId, withFolder.trackId);
    const folderMuted = toggleTrackMute(assigned, withFolder.trackId);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(folderMuted, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toEqual([]);
    expect(exported.controllers).toEqual([]);
  });

  it("exports CC7 state without double-applying it to MIDI note velocity", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "CC7 Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "lead.mid");
    let edited = addMidiController(imported.project, imported.clipId, 0);
    const controllerId = midiDataFromClip(edited.timeline.clips.find((item) => item.id === imported.clipId)!).controllers[0].id;
    edited = setMidiControllerField(edited, imported.clipId, controllerId, "controller", 7);
    edited = setMidiControllerField(edited, imported.clipId, controllerId, "value", 64);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes[0].velocity).toBe(87);
    expect(exported.controllers).toEqual([
      expect.objectContaining({ controller: 7, value: 64, tick: 0 })
    ]);
  });

  it("exports precise MIDI note field edits", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Note Field Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "lead.mid");
    const noteId = midiDataFromClip(imported.project.timeline.clips.find((item) => item.id === imported.clipId)!).notes[0].id;
    let edited = setMidiNoteField(imported.project, imported.clipId, noteId, "pitch", 72);
    edited = setMidiNoteField(edited, imported.clipId, noteId, "startTick", 240);
    edited = setMidiNoteField(edited, imported.clipId, noteId, "durationTicks", 960);
    edited = setMidiNoteField(edited, imported.clipId, noteId, "velocity", 81);
    edited = setMidiNoteField(edited, imported.clipId, noteId, "channel", 2);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toEqual([
      expect.objectContaining({ pitch: 72, startTick: 240, durationTicks: 960, velocity: 70, channel: 2 })
    ]);
  });

  it("exports duplicated MIDI notes and controller points as ordinary MIDI events", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Duplicated MIDI Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes(true)), "lead-with-cc.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const noteId = midiDataFromClip(clip).notes[0].id;
    const controllerId = midiDataFromClip(clip).controllers[0].id;
    const edited = duplicateMidiController(duplicateMidiNote(imported.project, imported.clipId, noteId), imported.clipId, controllerId);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes.map((note) => note.startTick)).toEqual([0, 480]);
    expect(exported.controllers.map((point) => point.tick)).toEqual([480, 960]);
  });

  it("preserves imported MIDI program changes in scoped MIDI export", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Program Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(programChangeMidiBytes()), "program-change.mid");

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toEqual([
      expect.objectContaining({ channel: 2 })
    ]);
    expect(exported.programChanges).toEqual([
      expect.objectContaining({ program: 24, tick: 0, channel: 2 }),
      expect.objectContaining({ program: 40, tick: 720, channel: 2 })
    ]);
  });

  it("exports authored MIDI program changes from editable clip metadata", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Authored Program Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "program.mid");
    const added = addMidiProgramChange(imported.project, imported.clipId, 480);
    const programId = midiDataFromClip(added.timeline.clips.find((item) => item.id === imported.clipId)!).programChanges[0].id;
    const edited = setMidiProgramChangeField(
      setMidiProgramChangeField(added, imported.clipId, programId, "program", 48),
      imported.clipId,
      programId,
      "channel",
      4
    );

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.programChanges).toEqual([
      expect.objectContaining({ program: 48, tick: 480, channel: 4 })
    ]);
  });

  it("seeds trimmed MIDI exports with active pre-roll program changes", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Trimmed Program Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(programChangeMidiBytes()), "program-change.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 240 };

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes[0].startTick).toBe(0);
    expect(exported.programChanges).toEqual([
      expect.objectContaining({ program: 24, tick: 0, channel: 2 }),
      expect.objectContaining({ program: 40, tick: 480, channel: 2 })
    ]);
  });

  it("preserves imported MIDI pitch bends in scoped MIDI export", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Pitch Bend Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(pitchBendMidiBytes()), "pitch-bend.mid");

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toEqual([
      expect.objectContaining({ channel: 1 })
    ]);
    expect(exported.pitchBends).toEqual([
      expect.objectContaining({ value: 8192, tick: 0, channel: 1 }),
      expect.objectContaining({ value: 12288, tick: 720, channel: 1 })
    ]);
  });

  it("exports authored MIDI pitch bends from editable clip metadata", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Authored Bend Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "bend.mid");
    const added = addMidiPitchBend(imported.project, imported.clipId, 480);
    const bendId = midiDataFromClip(added.timeline.clips.find((item) => item.id === imported.clipId)!).pitchBends[0].id;
    const edited = setMidiPitchBendField(
      setMidiPitchBendField(added, imported.clipId, bendId, "value", 10240),
      imported.clipId,
      bendId,
      "channel",
      3
    );

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.pitchBends).toEqual([
      expect.objectContaining({ value: 10240, tick: 480, channel: 3 })
    ]);
  });

  it("seeds trimmed MIDI exports with active pre-roll pitch bend state", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Trimmed Pitch Bend Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(pitchBendMidiBytes()), "pitch-bend.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 240 };

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes[0].startTick).toBe(0);
    expect(exported.pitchBends).toEqual([
      expect.objectContaining({ value: 8192, tick: 0, channel: 1 }),
      expect.objectContaining({ value: 12288, tick: 480, channel: 1 })
    ]);
  });

  it("preserves imported MIDI aftertouch in scoped MIDI export", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Aftertouch Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(aftertouchMidiBytes()), "aftertouch.mid");

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toEqual([
      expect.objectContaining({ channel: 3 })
    ]);
    expect(exported.aftertouch).toEqual([
      expect.objectContaining({ kind: "poly", note: 60, value: 50, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 64, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "poly", note: 60, value: 32, tick: 720, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 48, tick: 720, channel: 3 })
    ]);
    expect(firstStatusIndex(bytes, 0xa3)).toBeLessThan(firstStatusIndex(bytes, 0x93));
    expect(firstStatusIndex(bytes, 0xd3)).toBeLessThan(firstStatusIndex(bytes, 0x93));
  });

  it("exports authored MIDI aftertouch from editable clip metadata", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Authored Aftertouch Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "touch.mid");
    const added = addMidiAftertouch(imported.project, imported.clipId, 480);
    const aftertouchId = midiDataFromClip(added.timeline.clips.find((item) => item.id === imported.clipId)!).aftertouch[0].id;
    const edited = setMidiAftertouchField(
      setMidiAftertouchField(added, imported.clipId, aftertouchId, "value", 96),
      imported.clipId,
      aftertouchId,
      "channel",
      4
    );

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.aftertouch).toEqual([
      expect.objectContaining({ kind: "channel", value: 96, tick: 480, channel: 4 })
    ]);
  });

  it("seeds trimmed MIDI exports with active pre-roll aftertouch state", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Trimmed Aftertouch Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(aftertouchMidiBytes()), "aftertouch.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 240 };

    const bytes = new Uint8Array(await exportProjectToMidiBlob(imported.project, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes[0].startTick).toBe(0);
    expect(exported.aftertouch).toEqual([
      expect.objectContaining({ kind: "poly", note: 60, value: 50, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 64, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "poly", note: 60, value: 32, tick: 480, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 48, tick: 480, channel: 3 })
    ]);
  });

  it("seeds trimmed MIDI exports with active pre-roll controller state", async () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Trimmed CC Export" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "lead.mid");
    let edited = addMidiController(imported.project, imported.clipId, 0);
    const controllerId = midiDataFromClip(edited.timeline.clips.find((item) => item.id === imported.clipId)!).controllers[0].id;
    edited = setMidiControllerField(edited, imported.clipId, controllerId, "controller", 10);
    edited = setMidiControllerField(edited, imported.clipId, controllerId, "value", 96);
    const clip = edited.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 240 };

    const bytes = new Uint8Array(await exportProjectToMidiBlob(edited, { clipIds: [imported.clipId], trackIds: [imported.trackId] }).arrayBuffer());
    const exported = parseStandardMidiFile(bytes);

    expect(exported.notes).toHaveLength(1);
    expect(exported.notes[0].startTick).toBe(0);
    expect(exported.controllers).toEqual([
      expect.objectContaining({ controller: 10, value: 96, tick: 0 })
    ]);
  });
});

function readText(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length)).map((byte) => String.fromCharCode(byte)).join("");
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function firstStatusIndex(bytes: Uint8Array, status: number): number {
  const index = Array.from(bytes).findIndex((byte) => byte === status);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}
