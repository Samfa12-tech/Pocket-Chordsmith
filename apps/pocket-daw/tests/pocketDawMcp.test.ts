import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPocketDawProjectFile, createEmptyPocketDawProject } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";
import { callPocketDawMcpTool, pocketDawMcpToolList } from "../src/mcp/pocketDawMcp";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { addFxSlot } from "../src/daw/fx";
import { addMidiNote, importMidiFileToProject, midiDataFromClip } from "../src/daw/midiClips";
import { bassOverlayCount } from "../src/daw/bassOverlays";
import { chordOverlayCount } from "../src/daw/chordOverlays";
import { createGamePackZipBlob } from "../src/daw/exportJobs";
import { melodyOverlayCount } from "../src/daw/melodyOverlays";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { setTrackRecordingInputAssignment } from "../src/daw/recordingInputs";
import { addTrackToProject } from "../src/daw/tracks";
import { metalArrangementMidiBytes, simpleMidiBytes, tempoMapMidiBytes } from "./midiFixtures";

function parseToolResult(result: Awaited<ReturnType<typeof callPocketDawMcpTool>>) {
  return JSON.parse(result.content[0].text);
}

describe("Pocket DAW MCP tools", () => {
  it("lists the structured Pocket DAW tools", () => {
    const toolList = pocketDawMcpToolList();
    const tools = toolList.map((tool) => tool.name);

    expect(tools).toEqual(expect.arrayContaining([
      "pocket_daw_read_project",
      "pocket_daw_validate_project",
      "pocket_daw_create_from_chordsmith",
      "pocket_daw_arrange_midi",
      "pocket_daw_release_master",
      "pocket_daw_apply_commands",
      "pocket_daw_export_plan",
      "pocket_daw_verify_game_pack",
      "pocket_daw_live_status",
      "pocket_daw_live_control",
      "pocket_daw_live_performance",
      "pocket_daw_live_apply_commands"
    ]));
    expect(toolList.every((tool) => tool.inputSchema.type === "object")).toBe(true);
    expect(toolList.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    const applySchema = toolList.find((tool) => tool.name === "pocket_daw_apply_commands")?.inputSchema as { properties: Record<string, unknown> } | undefined;
    expect(applySchema?.properties.commands).toMatchObject({
      type: "array",
      items: {
        type: "object",
        required: ["type"]
      }
    });
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("cycle_drum_branch_step");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("set_drum_lane_gate");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("add_game_state_marker");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("comp_audio_take_from_bar");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("place_punch_recording_clip");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("place_punch_recording_clip_from_range");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("set_timeline_selection");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("set_punch_range");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("set_track_folder");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("toggle_folder_expanded");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("toggle_track_solo");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("set_recording_input_channel");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("split-mono");
    const liveApplySchema = toolList.find((tool) => tool.name === "pocket_daw_live_apply_commands")?.inputSchema as { properties: Record<string, unknown> } | undefined;
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("set_track_armed");
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("set_track_monitor");
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("set_track_input");
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("set_recording_input_channel");
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("split-mono");
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("set_punch_range");
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("place_punch_recording_clip_from_range");
    expect(JSON.stringify(liveApplySchema?.properties.commands)).toContain("activate_audio_take_lane");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("delete_clip_range");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("ripple_delete_clip_range");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("ripple_delete_timeline_selection");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("apply_audio_clip_action");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("create-warp-markers");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("activate_audio_take_lane");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("convert_midi_drums");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("convert_midi_bass");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("convert_midi_chords");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("convert_midi_melody");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("adopt_midi_tempo");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("ensure_project_automation");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("add_project_automation_point");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("update_automation_point");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("ease-out");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("ensure_fx_automation");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("add_fx_automation_point");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("tomlow");
    expect(toolList.find((tool) => tool.name === "pocket_daw_release_master")?.inputSchema).toMatchObject({
      required: ["outputPath"]
    });
    expect(toolList.find((tool) => tool.name === "pocket_daw_verify_game_pack")?.inputSchema).toMatchObject({
      required: ["zipPath"]
    });
  });

  it("reads and summarizes a project without writing", async () => {
    let project = createDemoProject();
    project.timeline.selection = { startBar: 2, endBar: 6, source: "manual" };
    project = addTrackToProject(project, "live-vocals").project;
    project.tracks.find((track) => track.id === "live-vocals")!.armed = true;
    project = setTrackRecordingInputAssignment(project, "live-vocals", {
      deviceId: "small-interface",
      mode: "stereo",
      channelPair: [0, 1]
    });
    project.audioDeviceSettings.devices = [{
      id: "small-interface",
      name: "Small Interface",
      kind: "input",
      supportedChannels: [1]
    }];
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_read_project", {
      raw: buildPocketDawProjectFile(project)
    }));

    expect(result.ok).toBe(true);
    expect(result.summary.title).toBe(project.project.title);
    expect(result.summary.trackCount).toBe(project.tracks.length);
    expect(result.summary.timelineSelection).toEqual({ startBar: 2, endBar: 6, source: "manual" });
    expect(result.summary.recordingInputPreflight).toMatchObject({
      ok: false,
      armedTrackCount: 1,
      selectedTrackId: "live-vocals",
      capturePlan: []
    });
    expect(result.summary.recordingInputPreflight.errors.join("\n")).toContain("needs channels 1-2");
    expect(result.project).toBeUndefined();
  });

  it("summarizes grouped future recording capture plans for MCP smoke", async () => {
    let project = addTrackToProject(createDemoProject(), "live-vocals").project;
    project = addTrackToProject(project, "live-instrument").project;
    const liveVocals = project.tracks.find((track) => track.id === "live-vocals")!;
    const liveInstrument = project.tracks.find((track) => track.id === "live-instrument")!;
    liveVocals.armed = true;
    liveInstrument.armed = true;
    project.audioDeviceSettings.devices = [{
      id: "interface-4",
      name: "Four Channel Interface",
      kind: "input",
      supportedChannels: [1, 2, 4]
    }];
    project = setTrackRecordingInputAssignment(project, "live-vocals", {
      deviceId: "interface-4",
      mode: "split-mono",
      channelIndex: 0
    });
    project = setTrackRecordingInputAssignment(project, "live-instrument", {
      deviceId: "interface-4",
      mode: "stereo",
      channelPair: [1, 2]
    });

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_read_project", {
      raw: buildPocketDawProjectFile(project)
    }));

    expect(result.ok).toBe(true);
    expect(result.summary.recordingFutureCapturePlan).toMatchObject({
      ok: true,
      recordingSessionId: "mcp-preview",
      takeGroupId: "mcp-preview-take-group",
      requestedStartBar: 1
    });
    expect(result.summary.recordingFutureCapturePlan.items.map((item: {
      trackId: string;
      mode: string;
      channelMap: number[];
      outputChannels: number;
      projectRelativePath: string;
    }) => ({
      trackId: item.trackId,
      mode: item.mode,
      channelMap: item.channelMap,
      outputChannels: item.outputChannels,
      projectRelativePath: item.projectRelativePath
    }))).toEqual([
      {
        trackId: "live-vocals",
        mode: "split-mono",
        channelMap: [0],
        outputChannels: 1,
        projectRelativePath: "project-media/recordings/mcp-preview-live-vocals-split-ch1.wav"
      },
      {
        trackId: "live-instrument",
        mode: "stereo",
        channelMap: [1, 2],
        outputChannels: 2,
        projectRelativePath: "project-media/recordings/mcp-preview-live-instrument-ch2-3.wav"
      }
    ]);
    expect(result.summary.recordingFutureCapturePlan.items[0].takeMetadata).toMatchObject({
      importMode: "native-recording",
      recordingSessionId: "mcp-preview",
      takeGroupId: "mcp-preview-take-group",
      inputMode: "split-mono",
      channelMap: [0],
      latencyCompensationAppliedSeconds: 0
    });
    expect(result.project).toBeUndefined();
  });

  it("applies typed edit commands and writes only when outputPath is explicit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-"));
    const outputPath = join(dir, "edited.pocketdaw");
    const project = createDemoProject();

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(project),
      outputPath,
      commands: [
        { type: "set_track_volume", trackId: "bass", volume: 0.42 },
        { type: "add_marker", bar: 3 },
        { type: "add_game_state_marker", bar: 5, gameState: "combat" }
      ]
    }));
    const edited = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.written).toBe(outputPath);
    expect(result.project).toBeUndefined();
    expect(edited.tracks.find((track: { id: string }) => track.id === "bass").volume).toBe(0.42);
    expect(edited.timeline.markers.some((marker: { bar: number }) => marker.bar === 3)).toBe(true);
    expect(edited.timeline.markers.find((marker: { gameState?: string }) => marker.gameState === "combat")).toMatchObject({
      bar: 5,
      name: "Combat",
      markerType: "game-state"
    });
  });

  it("applies folder group commands through the file-first command path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-folder-"));
    const outputPath = join(dir, "folder-group.pocketdaw");
    const withFolder = addTrackToProject(createDemoProject(), "folder");

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(withFolder.project),
      outputPath,
      commands: [
        { type: "set_track_folder", trackId: "bass", folderId: withFolder.trackId },
        { type: "toggle_folder_expanded", folderId: withFolder.trackId },
        { type: "toggle_track_mute", trackId: withFolder.trackId },
        { type: "toggle_track_solo", trackId: withFolder.trackId }
      ]
    }));
    const edited = JSON.parse(readFileSync(outputPath, "utf8"));
    const folder = edited.tracks.find((track: { id: string }) => track.id === withFolder.trackId);
    const bass = edited.tracks.find((track: { id: string }) => track.id === "bass");
    const summaryFolder = result.summary.tracks.find((track: { id: string }) => track.id === withFolder.trackId);
    const summaryBass = result.summary.tracks.find((track: { id: string }) => track.id === "bass");

    expect(result.written).toBe(outputPath);
    expect(result.statuses).toEqual([
      "Moved Bass into Folder.",
      "Folder collapsed.",
      "Toggled track mute.",
      "Toggled track solo."
    ]);
    expect(folder).toMatchObject({
      mute: true,
      solo: true,
      metadata: { folderExpanded: false, folderMode: "organizational" }
    });
    expect(bass.folderId).toBe(withFolder.trackId);
    expect(summaryFolder).toMatchObject({
      type: "folder",
      folderId: null,
      folderExpanded: false,
      mute: true,
      solo: true
    });
    expect(summaryBass).toMatchObject({
      id: "bass",
      folderId: withFolder.trackId
    });
  });

  it("applies explicit recording input channel assignment through the file-first command path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-recording-input-"));
    const outputPath = join(dir, "recording-input.pocketdaw");
    const withLiveTrack = addTrackToProject(createDemoProject(), "live-vocals");
    withLiveTrack.project.audioDeviceSettings.devices = [{
      id: "interface-4",
      name: "Four Channel Interface",
      kind: "input",
      supportedChannels: [1, 2, 4]
    }];
    withLiveTrack.project.tracks.find((track) => track.id === withLiveTrack.trackId)!.armed = true;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(withLiveTrack.project),
      outputPath,
      commands: [
        { type: "set_recording_input_channel", trackId: withLiveTrack.trackId, deviceId: "interface-4", mode: "stereo", channelPair: [2, 3] }
      ]
    }));
    const edited = JSON.parse(readFileSync(outputPath, "utf8"));
    const liveTrack = edited.tracks.find((track: { id: string }) => track.id === withLiveTrack.trackId);

    expect(result.written).toBe(outputPath);
    expect(result.statuses).toEqual(["Live Vocals recording input set to Stereo Ch 3-4."]);
    expect(liveTrack.recordingInput).toMatchObject({
      deviceId: "interface-4",
      mode: "stereo",
      channelPair: [2, 3]
    });
    expect(result.summary.recordingInputPreflight.errors.join("\n")).toContain("native recording alpha currently captures Stereo Ch 1-2 only");
  });

  it("applies split-mono recording input assignments through the file-first command path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-split-mono-"));
    const outputPath = join(dir, "split-mono-input.pocketdaw");
    const withLiveTrack = addTrackToProject(createDemoProject(), "live-vocals");
    withLiveTrack.project.audioDeviceSettings.devices = [{
      id: "interface-4",
      name: "Four Channel Interface",
      kind: "input",
      supportedChannels: [1, 2, 4]
    }];
    withLiveTrack.project.tracks.find((track) => track.id === withLiveTrack.trackId)!.armed = true;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(withLiveTrack.project),
      outputPath,
      commands: [
        { type: "set_recording_input_channel", trackId: withLiveTrack.trackId, deviceId: "interface-4", mode: "split-mono", channelIndex: 1 }
      ]
    }));
    const edited = JSON.parse(readFileSync(outputPath, "utf8"));
    const liveTrack = edited.tracks.find((track: { id: string }) => track.id === withLiveTrack.trackId);

    expect(result.written).toBe(outputPath);
    expect(result.statuses).toEqual(["Live Vocals recording input set to Split Mono Ch 2."]);
    expect(liveTrack.recordingInput).toMatchObject({
      deviceId: "interface-4",
      mode: "split-mono",
      channelIndex: 1
    });
    expect(result.summary.recordingFutureCapturePlan.items[0]).toMatchObject({
      mode: "split-mono",
      channelMap: [1],
      outputChannels: 1,
      projectRelativePath: "project-media/recordings/mcp-preview-live-vocals-split-ch2.wav"
    });
    expect(result.summary.recordingInputPreflight.errors.join("\n")).toContain("native recording alpha currently captures Mono Ch 1 only");
  });

  it("applies generated drum branch overlay edits through the file-first command path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-drum-branch-"));
    const outputPath = join(dir, "branch-overlay.pocketdaw");

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(createDemoProject()),
      outputPath,
      commands: [
        { type: "branch_generated_drums" },
        { type: "cycle_drum_branch_step", sectionId: "A", lane: "tomlow", step: 2 },
        { type: "cycle_drum_branch_step", sectionId: "A", lane: "crash", step: 4 },
        { type: "cycle_drum_branch_step", sectionId: "A", lane: "crash", step: 4 },
        { type: "set_drum_lane_gate", lane: "crash", gate: 0.45 }
      ]
    }));
    const edited = JSON.parse(readFileSync(outputPath, "utf8"));
    const drums = edited.tracks.find((track: { id: string }) => track.id === "drums");

    expect(result.written).toBe(outputPath);
    expect(edited.tracks.some((track: { id: string }) => track.id === "drums-tomlow")).toBe(true);
    expect(edited.tracks.some((track: { id: string }) => track.id === "drums-crash")).toBe(true);
    expect(drums.metadata.drumBranching).toMatchObject({ enabled: true, mode: "generated-source-view" });
    expect(drums.metadata.drumBranchEvents.A.tomlow[2]).toBe(1);
    expect(drums.metadata.drumBranchEvents.A.crash[4]).toBe(2);
    expect(drums.metadata.drumLanes.crash.gate).toBe(0.45);
  });

  it("applies grouped audio take edits through the file-first command path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-takes-"));
    const outputPath = join(dir, "take-comp.pocketdaw");
    let project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(project, {
      name: "MCP take 1.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "mcp-take-comp-a" }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "MCP take 2.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "mcp-take-comp-a" }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2);

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(secondPlaced.project),
      outputPath,
      commands: [
        { type: "activate_audio_take", clipId: firstPlaced.clipId },
        { type: "comp_audio_take_from_bar", clipId: secondPlaced.clipId, bar: 4 },
        { type: "set_audio_take_archived", clipId: secondPlaced.clipId, archived: true }
      ]
    }));
    const edited = JSON.parse(readFileSync(outputPath, "utf8"));
    const takeClips = edited.timeline.clips.filter((clip: { metadata?: { takeGroupId?: string } }) => clip.metadata?.takeGroupId === "mcp-take-comp-a");
    const archivedLeft = takeClips.find((clip: { id: string }) => clip.id === secondPlaced.clipId);
    const activeRight = takeClips.find((clip: { name: string; metadata?: { takeStatus?: string; sourceOffsetSeconds?: number } }) => (
      clip.name === "MCP take 2.wav split" && clip.metadata?.takeStatus === "active"
    ));

    expect(result.written).toBe(outputPath);
    expect(result.summary.audioTakeSummary).toMatchObject({
      groupedClipCount: 4,
      groupCount: 1,
      groups: [{ groupId: "mcp-take-comp-a", clipCount: 4, activeCount: 2, archivedCount: 1 }]
    });
    expect(takeClips).toHaveLength(4);
    expect(archivedLeft).toMatchObject({ muted: true, metadata: { takeStatus: "archived-take" } });
    expect(activeRight).toMatchObject({ startBar: 4, muted: false, metadata: { sourceOffsetSeconds: 4 } });
  });

  it("activates grouped audio take lanes through the file-first command path", async () => {
    let project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(project, {
      name: "MCP lane A.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "mcp-take-lane-a" }
    });
    const firstLeft = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const firstRight = placeAudioClipOnTrack(firstLeft.project, firstImport.item.id, firstLeft.trackId, 4);
    const secondImport = addImportedAudioMedia(firstRight.project, {
      name: "MCP lane B.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "mcp-take-lane-a" }
    });
    const secondLeft = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstLeft.trackId, 2);
    const secondRight = placeAudioClipOnTrack(secondLeft.project, secondImport.item.id, firstLeft.trackId, 4);
    project = {
      ...secondRight.project,
      timeline: {
        ...secondRight.project.timeline,
        clips: secondRight.project.timeline.clips.map((clip) => {
          if (clip.id === firstLeft.clipId || clip.id === firstRight.clipId) {
            return { ...clip, muted: false, metadata: { ...(clip.metadata || {}), takeLaneId: "mcp-lane-a", takeLaneIndex: 1, takeStatus: "active", takeActive: true } };
          }
          if (clip.id === secondLeft.clipId || clip.id === secondRight.clipId) {
            return { ...clip, muted: true, metadata: { ...(clip.metadata || {}), takeLaneId: "mcp-lane-b", takeLaneIndex: 2, takeStatus: "muted-take", takeActive: false } };
          }
          return clip;
        })
      }
    };

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(project),
      commands: [{ type: "activate_audio_take_lane", clipId: secondLeft.clipId }]
    }));
    const editedById = new Map(result.project.timeline.clips.map((clip: { id: string }) => [clip.id, clip]));

    expect(result.statuses).toEqual(["Activated take lane mcp-lane-b for MCP lane B.wav."]);
    expect(result.summary.audioTakeSummary.groups).toEqual([{
      groupId: "mcp-take-lane-a",
      clipCount: 4,
      activeCount: 2,
      mutedCount: 2,
      archivedCount: 0,
      lanes: [
        {
          laneId: "mcp-lane-a",
          laneIndex: 1,
          clipCount: 2,
          activeCount: 0,
          mutedCount: 2,
          archivedCount: 0,
          clipIds: [firstLeft.clipId, firstRight.clipId],
          clipNames: ["MCP lane A.wav", "MCP lane A.wav"],
          activeClipIds: []
        },
        {
          laneId: "mcp-lane-b",
          laneIndex: 2,
          clipCount: 2,
          activeCount: 2,
          mutedCount: 0,
          archivedCount: 0,
          clipIds: [secondLeft.clipId, secondRight.clipId],
          clipNames: ["MCP lane B.wav", "MCP lane B.wav"],
          activeClipIds: [secondLeft.clipId, secondRight.clipId]
        }
      ]
    }]);
    expect(editedById.get(firstLeft.clipId)).toMatchObject({ muted: true, metadata: { takeStatus: "muted-take" } });
    expect(editedById.get(firstRight.clipId)).toMatchObject({ muted: true, metadata: { takeStatus: "muted-take" } });
    expect(editedById.get(secondLeft.clipId)).toMatchObject({ muted: false, metadata: { takeStatus: "active" } });
    expect(editedById.get(secondRight.clipId)).toMatchObject({ muted: false, metadata: { takeStatus: "active" } });
  });

  it("places punch recording windows through the file-first command path", async () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const imported = addImportedAudioMedia(withTrack.project, {
      name: "MCP punch.wav",
      uri: "project-media/recordings/mcp-punch.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        recordingTakeId: "mcp-punch-take-1",
        recordingTakeGroupId: "mcp-punch-group",
        takeLaneId: "mcp-punch-group-lane-1"
      }
    });

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "place_punch_recording_clip", mediaPoolItemId: imported.item.id, trackId: withTrack.trackId, captureStartBar: 6, punchStartBar: 7, punchEndBar: 9 }
      ]
    }));
    const punchClip = result.project.timeline.clips.find((clip: { name: string }) => clip.name === "MCP punch.wav");
    const summaryClip = result.summary.clips.find((clip: { id: string }) => clip.id === punchClip.id);

    expect(result.statuses[0]).toContain("Placed punch take MCP punch.wav from bar 7 to 9");
    expect(punchClip).toMatchObject({ trackId: withTrack.trackId, startBar: 7, barLength: 2 });
    expect(punchClip.metadata).toMatchObject({
      recordingTakeId: "mcp-punch-take-1",
      recordingTakeGroupId: "mcp-punch-group",
      sourceOffsetSeconds: Math.round(secondsPerBar * 1000) / 1000,
      sourceDurationSeconds: Math.round(secondsPerBar * 2 * 1000) / 1000,
      punchStartBar: 7,
      punchEndBar: 9,
      captureStartBar: 6
    });
    expect(summaryClip).toMatchObject({ punchStartBar: 7, punchEndBar: 9, captureStartBar: 6 });
  });

  it("places punch recording windows from the active punch range through the file-first command path", async () => {
    const withTrack = addTrackToProject(createDemoProject(), "live-vocals");
    const secondsPerBar = withTrack.project.project.timeSig * (60 / withTrack.project.project.bpm);
    const imported = addImportedAudioMedia(withTrack.project, {
      name: "MCP range punch.wav",
      uri: "project-media/recordings/mcp-range-punch.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        recordingTakeId: "mcp-range-punch-take-1",
        recordingTakeGroupId: "mcp-range-punch-group",
        takeLaneId: "mcp-range-punch-group-lane-1"
      }
    });

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "set_punch_range", startBar: 7, endBar: 9 },
        { type: "place_punch_recording_clip_from_range", mediaPoolItemId: imported.item.id, trackId: withTrack.trackId, captureStartBar: 6 }
      ]
    }));
    const punchClip = result.project.timeline.clips.find((clip: { name: string }) => clip.name === "MCP range punch.wav");
    const summaryClip = result.summary.clips.find((clip: { id: string }) => clip.id === punchClip.id);

    expect(result.statuses).toEqual([
      "Punch range set from bar 7 to 9.",
      "Placed punch take MCP range punch.wav from active punch range 7 to 9."
    ]);
    expect(result.summary.timelineSelection).toEqual({ startBar: 7, endBar: 9, source: "punch" });
    expect(punchClip).toMatchObject({ trackId: withTrack.trackId, startBar: 7, barLength: 2 });
    expect(punchClip.metadata).toMatchObject({
      recordingTakeId: "mcp-range-punch-take-1",
      recordingTakeGroupId: "mcp-range-punch-group",
      punchStartBar: 7,
      punchEndBar: 9,
      captureStartBar: 6
    });
    expect(summaryClip).toMatchObject({ punchStartBar: 7, punchEndBar: 9, captureStartBar: 6 });
  });

  it("applies audio transient and warp-marker actions through the file-first command path", async () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "MCP Warp.wav",
      uri: "C:\\Audio\\MCP Warp.wav",
      mimeType: "audio/wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.05, 0.72, 0.2, 0.15, 0.86, 0.3] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(placed.project),
      commands: [
        { type: "apply_audio_clip_action", clipId: placed.clipId, action: "analyze-transients" },
        { type: "apply_audio_clip_action", clipId: placed.clipId, action: "create-warp-markers" },
        { type: "apply_audio_clip_action", clipId: placed.clipId, action: "quantize-warp-markers" }
      ]
    }));
    const clip = result.project.timeline.clips.find((item: { id: string }) => item.id === placed.clipId);
    const summaryClip = result.summary.clips.find((item: { id: string }) => item.id === placed.clipId);

    expect(result.statuses[0]).toContain("Detected 2 transient markers");
    expect(result.statuses[1]).toContain("Created 2 source-safe warp markers");
    expect(result.statuses[2]).toContain("Quantized 2 warp marker targets");
    expect(clip.metadata.audioWarpMarkerCount).toBe(2);
    expect(clip.metadata.audioWarpQuantizeGrid).toBe("1/16");
    expect(clip.metadata.audioWarpPlaybackMode).toBe("metadata-only");
    expect(summaryClip.audioWarpMarkerCount).toBe(2);
  });

  it("applies timeline range edits through the file-first command path", async () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "MCP range.wav",
      uri: "C:\\Audio\\MCP range.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(placed.project),
      commands: [
        { type: "set_timeline_selection", startBar: 3, endBar: 5 },
        { type: "delete_clip_range", clipId: placed.clipId }
      ]
    }));
    const segments = result.project.timeline.clips
      .filter((clip: { mediaPoolItemId?: string }) => clip.mediaPoolItemId === imported.item.id)
      .sort((a: { startBar: number }, b: { startBar: number }) => a.startBar - b.startBar);

    expect(result.written).toBeNull();
    expect(result.statuses).toEqual(["Updated edit range.", "Deleted range from MCP range.wav."]);
    expect(result.summary.timelineSelection).toEqual({ startBar: 3, endBar: 5, source: "manual" });
    expect(segments.map((clip: { startBar: number; barLength: number }) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [5, 1]]);
    expect(segments.map((clip: { metadata?: { sourceOffsetSeconds?: number } }) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 6]);
  });

  it("marks explicit punch ranges through the file-first command path", async () => {
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(createDemoProject()),
      commands: [
        { type: "set_punch_range", startBar: 7, endBar: 9 }
      ]
    }));

    expect(result.written).toBeNull();
    expect(result.statuses).toEqual(["Punch range set from bar 7 to 9."]);
    expect(result.project.timeline.selection).toEqual({ startBar: 7, endBar: 9, source: "punch" });
    expect(result.summary.timelineSelection).toEqual({ startBar: 7, endBar: 9, source: "punch" });
  });

  it("applies MIDI timeline crop edits through the file-first command path", async () => {
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(createEmptyPocketDawProject(), parsed, "MCP lead.mid");
    const withLaterNote = addMidiNote(imported.project, imported.clipId, 1920);
    withLaterNote.timeline.clips.find((clip) => clip.id === imported.clipId)!.barLength = 3;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(withLaterNote),
      commands: [
        { type: "set_timeline_selection", startBar: 2, endBar: 3 },
        { type: "crop_clip_to_timeline_selection", clipId: imported.clipId }
      ]
    }));
    const clip = result.project.timeline.clips.find((item: { id: string }) => item.id === imported.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.written).toBeNull();
    expect(result.statuses).toEqual(["Updated edit range.", "Cropped MCP lead.mid MIDI to edit range."]);
    expect(clip.startBar).toBe(2);
    expect(clip.barLength).toBe(1);
    expect(data.notes).toEqual([expect.objectContaining({ startTick: 0, durationTicks: 480 })]);
    expect(data.metadata?.lastRangeCropBars).toEqual({ startBar: 2, endBar: 3 });
  });

  it("applies MIDI timeline delete and ripple edits through the file-first command path", async () => {
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const project = createEmptyPocketDawProject();
    project.timeline.clips = [];
    const imported = importMidiFileToProject(project, parsed, "MCP lead.mid");
    const withLaterNote = addMidiNote(imported.project, imported.clipId, 1920);
    withLaterNote.timeline.clips.find((clip) => clip.id === imported.clipId)!.barLength = 3;
    const laterImported = importMidiFileToProject(withLaterNote, parsed, "MCP later.mid");
    laterImported.project.timeline.clips.find((clip) => clip.id === laterImported.clipId)!.startBar = 5;

    const deleted = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(withLaterNote),
      commands: [
        { type: "set_timeline_selection", startBar: 2, endBar: 3 },
        { type: "delete_clip_range", clipId: imported.clipId }
      ]
    }));
    const deletedClips = deleted.project.timeline.clips
      .filter((item: { type: string }) => item.type === "midi")
      .sort((a: { startBar: number }, b: { startBar: number }) => a.startBar - b.startBar);

    expect(deleted.statuses).toEqual(["Updated edit range.", "Deleted MIDI range from MCP lead.mid."]);
    expect(deletedClips.map((clip: { startBar: number; barLength: number }) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [3, 1]]);

    const rippled = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(withLaterNote),
      commands: [
        { type: "set_timeline_selection", startBar: 2, endBar: 3 },
        { type: "ripple_delete_clip_range", clipId: imported.clipId }
      ]
    }));
    const rippledClips = rippled.project.timeline.clips
      .filter((item: { type: string }) => item.type === "midi")
      .sort((a: { startBar: number }, b: { startBar: number }) => a.startBar - b.startBar);

    expect(rippled.statuses).toEqual(["Updated edit range.", "Ripple deleted MIDI range from MCP lead.mid; moved 1 clip."]);
    expect(rippledClips.map((clip: { startBar: number; barLength: number }) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [2, 1]]);

    const rippleAll = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(laterImported.project),
      commands: [
        { type: "set_timeline_selection", startBar: 2, endBar: 3 },
        { type: "ripple_delete_timeline_selection" }
      ]
    }));
    const rippleAllClips = rippleAll.project.timeline.clips
      .filter((item: { type: string }) => item.type === "midi")
      .sort((a: { startBar: number; name: string }, b: { startBar: number; name: string }) => a.startBar - b.startBar || a.name.localeCompare(b.name));

    expect(rippleAll.statuses).toEqual(["Updated edit range.", "Ripple deleted edit range across all tracks; edited 1 clip and moved 1 later clip."]);
    expect(rippleAllClips.map((clip: { name: string; startBar: number; barLength: number }) => [clip.name, clip.startBar, clip.barLength])).toEqual([
      ["MCP lead.mid", 1, 1],
      ["MCP lead.mid ripple", 2, 1],
      ["MCP later.mid", 4, 1]
    ]);
  });

  it("applies timeline ripple range edits through the file-first command path", async () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "MCP ripple.wav",
      uri: "C:\\Audio\\MCP ripple.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const firstPlaced = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const secondPlaced = placeAudioClipOnTrack(firstPlaced.project, imported.item.id, firstPlaced.trackId, 7);

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(secondPlaced.project),
      commands: [
        { type: "set_timeline_selection", startBar: 3, endBar: 5 },
        { type: "ripple_delete_clip_range", clipId: firstPlaced.clipId }
      ]
    }));
    const segments = result.project.timeline.clips
      .filter((clip: { mediaPoolItemId?: string; trackId?: string }) => clip.mediaPoolItemId === imported.item.id && clip.trackId === firstPlaced.trackId)
      .sort((a: { startBar: number }, b: { startBar: number }) => a.startBar - b.startBar);

    expect(result.written).toBeNull();
    expect(result.statuses).toEqual(["Updated edit range.", "Ripple deleted range from MCP ripple.wav; moved 2 clips."]);
    expect(segments.map((clip: { startBar: number; barLength: number }) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [3, 1], [5, 4]]);
    expect(segments.map((clip: { metadata?: { sourceOffsetSeconds?: number } }) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 6, 0]);
  });

  it("applies all-track timeline ripple edits through the file-first command path", async () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "MCP ripple all.wav",
      uri: "C:\\Audio\\MCP ripple all.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const firstTrack = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const firstLater = placeAudioClipOnTrack(firstTrack.project, imported.item.id, firstTrack.trackId, 7);
    const secondTrack = addTrackToProject(firstLater.project, "live-instrument");
    const secondEarly = placeAudioClipOnTrack(secondTrack.project, imported.item.id, secondTrack.trackId, 3);
    const secondLater = placeAudioClipOnTrack(secondEarly.project, imported.item.id, secondTrack.trackId, 8);

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(secondLater.project),
      commands: [
        { type: "set_timeline_selection", startBar: 3, endBar: 5 },
        { type: "ripple_delete_timeline_selection" }
      ]
    }));

    expect(result.written).toBeNull();
    expect(result.statuses).toEqual([
      "Updated edit range.",
      "Ripple deleted edit range across all tracks; edited 2 clips and moved 2 later clips."
    ]);
    expect(result.project.timeline.clips.find((clip: { id: string }) => clip.id === firstLater.clipId)?.startBar).toBe(5);
    expect(result.project.timeline.clips.find((clip: { id: string }) => clip.id === secondLater.clipId)?.startBar).toBe(6);
    expect(result.project.timeline.clips.find((clip: { id: string }) => clip.id === secondEarly.clipId)?.metadata?.sourceOffsetSeconds).toBe(4);
  });

  it("arranges MIDI into a heavy-metal Chordsmith-style project without writing by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-arrange-midi-"));
    const midiPath = join(dir, "fixture.mid");
    writeFileSync(midiPath, metalArrangementMidiBytes());

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_arrange_midi", {
      midiPath,
      title: "Fixture Metal"
    }));

    expect(result.ok).toBe(true);
    expect(result.written).toBeNull();
    expect(result.extraction.style).toBe("heavy_metal");
    expect(result.extraction.rawMidiClip).toBe("muted-reference");
    expect(result.project).toBeTruthy();
    expect(result.project.tracks.find((track: { id: string }) => track.id === "guitar")).toMatchObject({
      name: "Metal Rhythm Guitar",
      mute: false
    });
    expect(result.project.tracks.find((track: { id: string }) => track.id === "drums")).toMatchObject({
      name: "Metal Drums",
      mute: false
    });
    expect(result.project.tracks.find((track: { id: string }) => track.id === "midi")).toMatchObject({
      name: "Raw MIDI Reference",
      mute: true
    });
  });

  it("maps MIDI drum clips into generated branch overlays through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "convert_midi_drums", clipId: imported.clipId, sectionId: "A" }
      ]
    }));
    const drums = result.project.tracks.find((track: { id: string }) => track.id === "drums");
    const overlays = drums.metadata.drumBranchEvents.A;

    expect(result.statuses[0]).toContain("Mapped");
    expect(result.project.tracks.some((track: { id: string }) => track.id === "drums-kick")).toBe(true);
    expect(overlays.kick[0]).toBeGreaterThan(0);
    expect(overlays.snare[4]).toBeGreaterThan(0);
    expect(overlays.hat[8]).toBeGreaterThan(0);
  });

  it("maps MIDI melody clips into generated melody overlays through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "convert_midi_melody", clipId: imported.clipId, sectionId: "A", trackIndex: 0 }
      ]
    }));

    expect(result.statuses[0]).toContain("Mapped");
    expect(melodyOverlayCount(result.project, "A", 0)).toBeGreaterThanOrEqual(3);
    expect(result.project.tracks.find((track: { id: string }) => track.id === "melody").metadata.melodyOverlayEvents.A["0"][0]).toMatchObject({
      step: 0,
      sourceClipId: imported.clipId
    });
  });

  it("maps MIDI bass clips into generated bass overlays through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "convert_midi_bass", clipId: imported.clipId, sectionId: "A" }
      ]
    }));

    expect(result.statuses[0]).toContain("Mapped");
    expect(bassOverlayCount(result.project, "A")).toBe(2);
    expect(result.project.tracks.find((track: { id: string }) => track.id === "bass").metadata.bassOverlayEvents.A[0]).toMatchObject({
      step: 0,
      midi: 48,
      sourceClipId: imported.clipId
    });
  });

  it("maps MIDI chord groups into generated chord overlays through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "convert_midi_chords", clipId: imported.clipId, sectionId: "A" }
      ]
    }));

    expect(result.statuses[0]).toContain("Mapped");
    expect(chordOverlayCount(result.project, "A")).toBe(2);
    expect(result.project.tracks.find((track: { id: string }) => track.id === "chords").metadata.chordOverlayEvents.A[0]).toMatchObject({
      step: 0,
      midiNotes: [48, 55, 60],
      sourceClipId: imported.clipId
    });
  });

  it("maps MIDI clips into generated arrangements through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "convert_midi_arrangement", clipId: imported.clipId, sectionId: "A", trackIndex: 0 }
      ]
    }));
    const sourceClip = result.project.timeline.clips.find((clip: { id: string }) => clip.id === imported.clipId);

    expect(result.statuses[0]).toContain("Mapped MIDI arrangement");
    expect(result.project.tracks.some((track: { id: string }) => track.id === "drums-kick")).toBe(true);
    expect(bassOverlayCount(result.project, "A")).toBe(2);
    expect(chordOverlayCount(result.project, "A")).toBe(2);
    expect(melodyOverlayCount(result.project, "A", 0)).toBeGreaterThanOrEqual(3);
    expect(sourceClip).toMatchObject({ type: "midi", mediaPoolItemId: imported.item.id });
  });

  it("adopts imported MIDI tempo through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(tempoMapMidiBytes()), "tempo-map.mid");
    imported.project.project.bpm = 100;
    imported.project.project.timeSig = 5;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "adopt_midi_tempo", clipId: imported.clipId }
      ]
    }));

    expect(result.statuses[0]).toContain("Adopted MIDI start 120 BPM and 4/4");
    expect(result.project.project.bpm).toBe(120);
    expect(result.project.project.timeSig).toBe(4);
  });

  it("converts imported MIDI tempo maps into project automation through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(tempoMapMidiBytes()), "tempo-map.mid");
    imported.project.project.bpm = 100;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "adopt_midi_tempo_map", clipId: imported.clipId }
      ]
    }));
    const lane = result.project.automation.lanes.find((item: { targetPath: string }) => item.targetPath === "project.tempo");

    expect(result.statuses[0]).toContain("Converted 2 MIDI tempo events");
    expect(result.project.project.bpm).toBe(120);
    expect(lane.points).toEqual([
      { bar: 1, value: 120, curve: "hold" },
      { bar: 1.25, value: 140, curve: "hold" }
    ]);
  });

  it("converts imported MIDI meter maps through the file-first command path", async () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(tempoMapMidiBytes()), "tempo-map.mid");
    imported.project.project.timeSig = 5;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(imported.project),
      commands: [
        { type: "adopt_midi_meter_map", clipId: imported.clipId }
      ]
    }));

    expect(result.statuses[0]).toContain("Converted 2 MIDI meter events");
    expect(result.project.project.timeSig).toBe(4);
    expect(result.project.project.meterMap).toEqual([
      expect.objectContaining({ bar: 1, numerator: 4, denominator: 4, sourceClipId: imported.clipId }),
      expect.objectContaining({ bar: 1.25, numerator: 3, denominator: 4, sourceClipId: imported.clipId })
    ]);
    expect(result.summary.meterMapPointCount).toBe(2);
  });

  it("edits project meter-map points through the file-first command path", async () => {
    const project = createDemoProject();
    project.project.timeSig = 6;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(project),
      commands: [
        { type: "add_project_meter_map_point", bar: 3 },
        { type: "update_project_meter_map_point", pointId: "meter_manual", bar: 4, numerator: 7, denominator: 8 },
        { type: "delete_project_meter_map_point", pointId: "meter_manual" },
        { type: "add_project_meter_map_point", bar: 5, numerator: 3, denominator: 4 }
      ]
    }));

    expect(result.statuses[0]).toContain("Added project meter 6/4 at Bar 3");
    expect(result.statuses[1]).toContain("Updated project meter 7/8 at Bar 4");
    expect(result.statuses[2]).toContain("Deleted project meter 7/8 at Bar 4");
    expect(result.statuses[3]).toContain("Added project meter 3/4 at Bar 5");
    expect(result.project.project.meterMap).toEqual([
      expect.objectContaining({ id: "meter_manual", bar: 5, numerator: 3, denominator: 4, source: "manual" })
    ]);
    expect(result.summary.meterMapPointCount).toBe(1);
  });

  it("creates project tempo automation through the file-first command path", async () => {
    const project = createDemoProject();
    project.project.bpm = 126;

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(project),
      commands: [
        { type: "ensure_project_automation", field: "tempo" },
        { type: "add_project_automation_point", field: "tempo", bar: 8 },
        { type: "update_automation_point", laneId: "auto_project_tempo", pointIndex: 1, bar: 9, value: 112, curve: "ease-out" }
      ]
    }));
    const lane = result.project.automation.lanes.find((item: { targetPath: string }) => item.targetPath === "project.tempo");

    expect(result.statuses[0]).toContain("project tempo automation lane");
    expect(result.statuses[1]).toContain("project tempo automation point");
    expect(result.statuses[2]).toContain("Updated automation point");
    expect(lane.points).toEqual([
      expect.objectContaining({ bar: 1, value: 126 }),
      expect.objectContaining({ bar: 9, value: 112, curve: "ease-out" })
    ]);
  });

  it("creates FX parameter automation through the file-first command path", async () => {
    const project = addFxSlot(createDemoProject(), "master", "delay");
    const chain = project.fx.chains.find((item) => item.ownerTrackId === "master")!;
    const slot = chain.slots[0];

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(project),
      commands: [
        { type: "ensure_fx_automation", chainId: chain.id, slotId: slot.id, parameter: "feedback" },
        { type: "add_fx_automation_point", chainId: chain.id, slotId: slot.id, parameter: "feedback", bar: 6 },
        { type: "update_automation_point", laneId: `auto_fx_${chain.id}_slots_${slot.id}_parameters_feedback`, pointIndex: 1, bar: 6, value: 0.5, curve: "ease-in" }
      ]
    }));
    const lane = result.project.automation.lanes.find((item: { targetPath: string }) => item.targetPath === `fx.${chain.id}.slots.${slot.id}.parameters.feedback`);

    expect(result.statuses[0]).toContain("Enabled FX parameter automation");
    expect(result.statuses[1]).toContain("FX automation point");
    expect(lane.points[1]).toMatchObject({ bar: 6, value: 0.5, curve: "ease-in" });
  });

  it("writes arranged MIDI only when outputPath is explicit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-arrange-midi-write-"));
    const midiPath = join(dir, "fixture.mid");
    const outputPath = join(dir, "fixture-metal.pocketdaw");
    writeFileSync(midiPath, metalArrangementMidiBytes());

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_arrange_midi", {
      midiPath,
      outputPath,
      keepRawMidiClip: false
    }));
    const written = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.written).toBe(outputPath);
    expect(result.project).toBeUndefined();
    expect(result.extraction.rawMidiClip).toBe("omitted");
    expect(written.tracks.some((track: { id: string; mute?: boolean }) => track.id === "guitar" && track.mute === false)).toBe(true);
    expect(written.tracks.some((track: { trackType: string }) => track.trackType === "midi")).toBe(false);
  });

  it("masters an embedded schema-16 Chordsmith source from a Pocket DAW project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-release-master-mcp-"));
    const sourcePath = fileURLToPath(new URL("../../../packages/pocket-audio-core/tests/fixtures/section-sequence.pcs.json", import.meta.url));
    const dawPath = join(dir, "section-sequence.pocketdaw");
    const outDir = join(dir, "release");
    await callPocketDawMcpTool("pocket_daw_create_from_chordsmith", {
      inputPath: sourcePath,
      outputPath: dawPath
    });

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_release_master", {
      projectPath: dawPath,
      outputPath: outDir,
      profile: "spotify_lofi_chill",
      scope: "sequence",
      export: "wav24,report",
      force: true,
      albumConsistency: true
    }));

    expect(result.ok).toBe(true);
    expect(["PASS", "WARN"]).toContain(result.status);
    expect(result.reports[0].title).toBe("Section Sequence");
    expect(result.reports[0].outputs.masterWav).toContain("masters_wav24");
    expect(existsSync(result.reports[0].outputs.masterWav)).toBe(true);
    expect(result.reports[0].clippedSamples).toBe(0);
    expect(result.reports[0].nonFiniteSamples).toBe(0);
    expect(result.reports[0].truePeakDbtp).toBeLessThanOrEqual(-0.95);
  });

  it("passes schema-16 input globs through the release-master MCP tool", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-release-master-glob-mcp-"));
    const inputGlob = join(fileURLToPath(new URL("../../../packages/pocket-audio-core/tests/fixtures/", import.meta.url)), "section-sequence*.pcs.json");
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_release_master", {
      inputPath: inputGlob,
      outputPath: join(dir, "release"),
      profile: "spotify_lofi_chill",
      analyzeOnly: true,
      force: true
    }));

    expect(result.ok).toBe(true);
    expect(result.manifest.inputCount).toBe(1);
    expect(result.manifest.analyzeOnly).toBe(true);
  });

  it("rejects missing MIDI paths for arrangement", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-arrange-midi-missing-"));

    await expect(callPocketDawMcpTool("pocket_daw_arrange_midi", {
      midiPath: join(dir, "missing.mid")
    })).rejects.toThrow("File does not exist");
  });

  it("returns export plans without rendering audio", async () => {
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_export_plan", {
      raw: buildPocketDawProjectFile(createDemoProject())
    }));

    expect(result.stems.length).toBeGreaterThan(0);
    expect(result.sectionLoops.length).toBeGreaterThan(0);
    expect(result.gamePacks.godot.manifestFile).toContain("godot");
    expect(result.gamePacks.web.manifestFile).toContain("web");
    expect(result.gamePackDeliveryTargets.map((target: { id: string }) => target.id)).toEqual(["godot-local-loopback", "godot-zip", "web-zip"]);
    expect(result.gamePackDeliveryTargets[0]).toMatchObject({
      action: "push-godot-pack",
      delivery: "local-loopback-with-zip-fallback",
      targetRuntimeSmoke: "manual-required-before-release-claim"
    });
  });

  it("verifies an existing game-pack ZIP through the file-first MCP tool", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-game-pack-"));
    const project = createDemoProject();
    const pack = await createGamePackZipBlob(project, "web-game-pack", {
      sourceProjectContents: JSON.stringify(project),
      renderWav: async (renderProject) => new Blob([`bars:${renderProject.timeline.bars}`], { type: "audio/wav" })
    });
    const zipPath = join(dir, "web-game-pack.zip");
    writeFileSync(zipPath, Buffer.from(await pack.blob.arrayBuffer()));

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_verify_game_pack", {
      zipPath,
      kind: "web-game-pack"
    }));

    expect(result.ok).toBe(true);
    expect(result.zipPath).toBe(zipPath);
    expect(result.kind).toBe("web-game-pack");
    expect(result.manifestPath).toBe("manifests/web-game-manifest.json");
    expect(result.entryCount).toBeGreaterThan(0);
    expect(result.warnings.join("\n")).toContain("Manual target-runtime smoke");
  });

  it("requires an explicit game-pack ZIP path for MCP verification", async () => {
    await expect(callPocketDawMcpTool("pocket_daw_verify_game_pack", {
      kind: "godot-adaptive-pack"
    })).rejects.toThrow("A file path is required");
  });

  it("rejects unknown command types", async () => {
    await expect(callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(createDemoProject()),
      commands: [{ type: "delete_everything" }]
    })).rejects.toThrow("Unsupported Pocket DAW MCP command");
  });

  it("reports live bridge unavailable when the app session file is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-missing-"));
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_status", {
      sessionPath: join(dir, "missing-session.json")
    }));

    expect(result.ok).toBe(false);
    expect(result.code).toBe("app_not_running");
  });

  it("sends live control through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    let auth = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      auth = String(init?.headers instanceof Headers ? init.headers.get("Authorization") : (init?.headers as Record<string, string>)?.Authorization || "");
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({ ok: true, transport: { playing: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_control", {
        sessionPath,
        action: "play"
      }));

      expect(result.ok).toBe(true);
      expect(auth).toBe("Bearer test-token");
      expect(JSON.parse(requestBody)).toMatchObject({ action: "play" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends live MIDI panic through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-panic-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    let auth = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      auth = String(init?.headers instanceof Headers ? init.headers.get("Authorization") : (init?.headers as Record<string, string>)?.Authorization || "");
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({ ok: true, status: "midi-panic", transport: { playing: false } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_control", {
        sessionPath,
        action: "midi_panic"
      }));

      expect(result.ok).toBe(true);
      expect(result.status).toBe("midi-panic");
      expect(auth).toBe("Bearer test-token");
      expect(JSON.parse(requestBody)).toMatchObject({ action: "midi_panic" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends live open_project through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-open-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    const projectPath = join(dir, "fixture-metal.pocketdaw");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({ ok: true, action: "open_project" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_control", {
        sessionPath,
        action: "open_project",
        projectPath
      }));

      expect(result.ok).toBe(true);
      expect(JSON.parse(requestBody)).toMatchObject({ action: "open_project", projectPath });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends live performance diagnostic controls through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-performance-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({
        ok: true,
        action: "performance_diagnostics",
        diagnostics: { enabled: true, sampleCount: 1 }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_performance", {
        sessionPath,
        action: "start",
        maxSamples: 240
      }));

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toMatchObject({ enabled: true, sampleCount: 1 });
      expect(JSON.parse(requestBody)).toMatchObject({
        action: "performance_diagnostics",
        mode: "start",
        maxSamples: 240
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends live recording input channel commands through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-recording-input-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({
        ok: true,
        action: "apply_commands",
        statuses: ["Live Vocals recording input set to Stereo Ch 3-4."]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_apply_commands", {
        sessionPath,
        commands: [{ type: "set_recording_input_channel", trackId: "live-vocals", deviceId: "interface-4", mode: "stereo", channelPair: [2, 3] }]
      }));

      expect(result.ok).toBe(true);
      expect(JSON.parse(requestBody)).toMatchObject({
        action: "apply_commands",
        commands: [{ type: "set_recording_input_channel", trackId: "live-vocals", deviceId: "interface-4", mode: "stereo", channelPair: [2, 3] }]
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends live arm and monitor commands through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-arm-monitor-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({
        ok: true,
        action: "apply_commands",
        statuses: ["Armed Live Vocals.", "Live Vocals monitor on."]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_apply_commands", {
        sessionPath,
        commands: [
          { type: "set_track_armed", trackId: "live-vocals", armed: true },
          { type: "set_track_monitor", trackId: "live-vocals", monitorEnabled: true }
        ]
      }));

      expect(result.ok).toBe(true);
      expect(JSON.parse(requestBody)).toMatchObject({
        action: "apply_commands",
        commands: [
          { type: "set_track_armed", trackId: "live-vocals", armed: true },
          { type: "set_track_monitor", trackId: "live-vocals", monitorEnabled: true }
        ]
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends live track input commands through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-track-input-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({
        ok: true,
        action: "apply_commands",
        statuses: ["Updated track input."]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_apply_commands", {
        sessionPath,
        commands: [{ type: "set_track_input", trackId: "live-vocals", inputDeviceId: "interface-4" }]
      }));

      expect(result.ok).toBe(true);
      expect(JSON.parse(requestBody)).toMatchObject({
        action: "apply_commands",
        commands: [{ type: "set_track_input", trackId: "live-vocals", inputDeviceId: "interface-4" }]
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Pocket DAW MCP server handshake", () => {
  it("reports a stable Codex-safe server identity", async () => {
    const { spawn } = await import("node:child_process");
    const serverPath = join(process.cwd(), "src", "mcp", "pocketDawMcpServer.ts");

    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", serverPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("serverInfo")) child.kill();
    });

    const message = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "0" }
      }
    });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Timed out waiting for MCP initialize response."));
      }, 30000);
      child.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    expect(output).toContain('"protocolVersion":"2025-06-18"');
    expect(output).toContain('"name":"pocket_daw"');
    expect(output).toContain('"listChanged":false');
    expect(output).not.toContain("Content-Length:");
  }, 30000);
});
