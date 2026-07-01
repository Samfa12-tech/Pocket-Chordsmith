import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPocketDawProjectFile, createEmptyPocketDawProject } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";
import { callPocketDawMcpTool, pocketDawMcpToolList } from "../src/mcp/pocketDawMcp";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { addFxSlot } from "../src/daw/fx";
import { addMidiNote, importMidiFileToProject, midiDataFromClip } from "../src/daw/midiClips";
import { bassOverlayCount } from "../src/daw/bassOverlays";
import { chordOverlayCount } from "../src/daw/chordOverlays";
import { melodyOverlayCount } from "../src/daw/melodyOverlays";
import { parseStandardMidiFile } from "../src/daw/midiParser";
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
      "pocket_daw_apply_commands",
      "pocket_daw_export_plan",
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
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("set_timeline_selection");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("delete_clip_range");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("ripple_delete_clip_range");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("ripple_delete_timeline_selection");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("apply_audio_clip_action");
    expect(JSON.stringify(applySchema?.properties.commands)).toContain("create-warp-markers");
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
  });

  it("reads and summarizes a project without writing", async () => {
    const project = createDemoProject();
    project.timeline.selection = { startBar: 2, endBar: 6, source: "manual" };
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_read_project", {
      raw: buildPocketDawProjectFile(project)
    }));

    expect(result.ok).toBe(true);
    expect(result.summary.title).toBe(project.project.title);
    expect(result.summary.trackCount).toBe(project.tracks.length);
    expect(result.summary.timelineSelection).toEqual({ startBar: 2, endBar: 6, source: "manual" });
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
        { type: "apply_audio_clip_action", clipId: placed.clipId, action: "create-warp-markers" }
      ]
    }));
    const clip = result.project.timeline.clips.find((item: { id: string }) => item.id === placed.clipId);
    const summaryClip = result.summary.clips.find((item: { id: string }) => item.id === placed.clipId);

    expect(result.statuses[0]).toContain("Detected 2 transient markers");
    expect(result.statuses[1]).toContain("Created 2 source-safe warp markers");
    expect(clip.metadata.audioWarpMarkerCount).toBe(2);
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
