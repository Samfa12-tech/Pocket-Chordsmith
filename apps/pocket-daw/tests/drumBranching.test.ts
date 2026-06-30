import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { convertMidiClipToDrumBranchOverlays } from "../src/daw/midiDrumConversion";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import {
  branchGeneratedDrumsToTracks,
  collapseGeneratedDrumBranches,
  cycleDrumBranchStep,
  DRUM_LANE_DEFS,
  drumBranchGroupCollapsed,
  generatedDrumBranchLane,
  getDrumBranchStepLevel,
  getDrumLaneMix,
  setDrumBranchGroupCollapsed
} from "../src/daw/drumLanes";
import { setTrackPan, setTrackVolume, toggleTrackMute, toggleTrackSolo } from "../src/daw/mixer";
import { addBusTrack, addReturnTrack, routeTrackToOutput, setTrackSendLevel } from "../src/daw/routing";
import { createDemoProject } from "../src/demo/demoProject";
import { metalArrangementMidiBytes } from "./midiFixtures";

describe("generated drum branch tracks", () => {
  it("creates source-preserving branch views for the full shared drum kit", () => {
    const project = createDemoProject();
    const beforeEvents = renderTimelineEvents(project);
    const branched = branchGeneratedDrumsToTracks(project);
    const branches = branched.tracks.filter((track) => generatedDrumBranchLane(track));
    const expectedLanes = DRUM_LANE_DEFS.map((lane) => lane.id);

    expect(branches.map((track) => generatedDrumBranchLane(track))).toEqual(expectedLanes);
    expect(branches.map((track) => track.metadata?.parentGeneratedTrackId)).toEqual(expectedLanes.map(() => "drums"));
    expect(branches.every((track) => track.metadata?.branchMode === "generated-source-view")).toBe(true);
    expect(branched.tracks.findIndex((track) => track.id === "drums-kick")).toBe(branched.tracks.findIndex((track) => track.id === "drums") + 1);
    expect(branched.tracks.find((track) => track.id === "drums-openhat")).toMatchObject({ name: "Open Hat", role: "drums" });
    expect(branched.tracks.find((track) => track.id === "drums-crash")).toMatchObject({ name: "Crash", role: "drums" });
    expect(sourceDrumSignature(renderTimelineEvents(branched))).toEqual(sourceDrumSignature(beforeEvents));
    expect(renderTimelineEvents(branched).find((event) => event.kind === "kick")?.trackId).toBe("drums-kick");
    expect(project.tracks.some((track) => generatedDrumBranchLane(track))).toBe(false);
  });

  it("routes Chordsmith accent levels to accent branch lanes when branch views are visible", () => {
    const branched = branchGeneratedDrumsToTracks(createDemoProject());
    const events = renderTimelineEvents(branched);
    const clap = events.find((event) => event.kind === "clap" && event.step === 4);
    const openHat = events.find((event) => event.kind === "openhat" && event.step === 0);
    const collapsedEvents = renderTimelineEvents(collapseGeneratedDrumBranches(branched));

    expect(clap).toMatchObject({ drumLane: "clap", trackId: "drums-clap", accent: true });
    expect(openHat).toMatchObject({ drumLane: "openhat", trackId: "drums-openhat", accent: true });
    expect(collapsedEvents.some((event) => event.kind === "clap" || event.kind === "openhat")).toBe(false);
    expect(collapsedEvents.find((event) => event.kind === "snare" && event.step === 4)).toMatchObject({ drumLane: "snare", accent: true });
    expect(collapsedEvents.find((event) => event.kind === "hat" && event.step === 0)).toMatchObject({ drumLane: "hat", accent: true });
  });

  it("renders DAW-only live kit branch overlay events without mutating Chordsmith source lanes", () => {
    let project = branchGeneratedDrumsToTracks(createDemoProject());
    project = cycleDrumBranchStep(project, "A", "tomlow", 2);
    project = cycleDrumBranchStep(project, "A", "crash", 4);
    project = cycleDrumBranchStep(project, "A", "crash", 4);
    const events = renderTimelineEvents(project);

    expect(events.find((event) => event.kind === "tomlow" && event.step === 2)).toMatchObject({ drumLane: "tomlow", trackId: "drums-tomlow", accent: false });
    expect(events.find((event) => event.kind === "crash" && event.step === 4)).toMatchObject({ drumLane: "crash", trackId: "drums-crash", accent: true });
    expect(events.some((event) => event.kind === "snare" && event.step === 2)).toBe(false);
    expect(events.some((event) => event.kind === "hat" && event.step === 4 && event.trackId === "drums-crash")).toBe(false);
  });

  it("maps imported MIDI drum notes into generated branch overlays without mutating Chordsmith source grids", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    const beforeSource = JSON.stringify(imported.project.sourceRefs);
    const result = convertMidiClipToDrumBranchOverlays(imported.project, imported.clipId, "A");
    const events = renderTimelineEvents(result.project);

    expect(result.written).toBeGreaterThanOrEqual(3);
    expect(result.lanes).toMatchObject({ kick: 1, snare: 1, hat: 1 });
    expect(JSON.stringify(result.project.sourceRefs)).toBe(beforeSource);
    expect(getDrumBranchStepLevel(result.project, "A", "kick", 0)).toBeGreaterThan(0);
    expect(getDrumBranchStepLevel(result.project, "A", "snare", 4)).toBeGreaterThan(0);
    expect(getDrumBranchStepLevel(result.project, "A", "hat", 8)).toBeGreaterThan(0);
    expect(result.project.tracks.some((track) => track.id === "drums-kick")).toBe(true);
    expect(events.some((event) => event.kind === "kick" && event.trackId === "drums-kick" && event.clipId !== imported.clipId)).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it("maps only the visible source window of shortened MIDI drum clips", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal-window.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.barLength = 0.25;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 480 };
    const result = convertMidiClipToDrumBranchOverlays(imported.project, imported.clipId, "A");

    expect(result.written).toBe(1);
    expect(result.skipped).toBeGreaterThan(0);
    expect(getDrumBranchStepLevel(result.project, "A", "kick", 0)).toBe(0);
    expect(getDrumBranchStepLevel(result.project, "A", "snare", 0)).toBeGreaterThan(0);
    expect(getDrumBranchStepLevel(result.project, "A", "hat", 8)).toBe(0);
  });

  it("preserves branch UI state and DAW-only overlays when branch views are refreshed", () => {
    let project = branchGeneratedDrumsToTracks(createDemoProject());
    project = setDrumBranchGroupCollapsed(project, true);
    project = cycleDrumBranchStep(project, "A", "ride", 6);
    project = branchGeneratedDrumsToTracks(project);

    expect(drumBranchGroupCollapsed(project)).toBe(true);
    expect(getDrumBranchStepLevel(project, "A", "ride", 6)).toBe(1);
    expect(project.tracks.some((track) => track.id === "drums-ride")).toBe(true);
  });

  it("collapses branch views without deleting Chordsmith source grids", () => {
    const branched = branchGeneratedDrumsToTracks(createDemoProject());
    const collapsed = collapseGeneratedDrumBranches(branched);

    expect(collapsed.tracks.some((track) => generatedDrumBranchLane(track))).toBe(false);
    expect(collapsed.tracks.find((track) => track.id === "drums")?.metadata?.drumBranching).toMatchObject({
      enabled: false,
      parentTrackId: "drums"
    });
    expect(renderTimelineEvents(collapsed).some((event) => event.kind === "kick")).toBe(true);
  });

  it("proxies branch track volume, pan and mute to lane mix metadata", () => {
    let project = branchGeneratedDrumsToTracks(createDemoProject());
    project = setTrackVolume(project, "drums-snare", 0.42);
    project = setTrackPan(project, "drums-snare", -0.35);
    project = toggleTrackMute(project, "drums-snare");
    const branch = project.tracks.find((track) => track.id === "drums-snare")!;
    const mix = getDrumLaneMix(project, "snare");

    expect(mix.volume).toBeCloseTo(0.42);
    expect(mix.pan).toBeCloseTo(-0.35);
    expect(mix.mute).toBe(true);
    expect(branch.volume).toBeCloseTo(0.42);
    expect(branch.pan).toBeCloseTo(-0.35);
    expect(branch.mute).toBe(true);
    expect(branch.solo).toBe(false);
  });

  it("preserves branch-specific output routing and sends across lane mix sync", () => {
    let project = branchGeneratedDrumsToTracks(createDemoProject());
    const bus = addBusTrack(project, "Kick Bus");
    project = routeTrackToOutput(bus.project, "drums-kick", bus.trackId);
    const ret = addReturnTrack(project, "Kick Verb");
    project = setTrackSendLevel(ret.project, "drums-kick", ret.trackId, 0.35);
    project = setTrackVolume(project, "drums-kick", 0.65);

    const kick = project.tracks.find((track) => track.id === "drums-kick");

    expect(kick?.routing.outputId).toBe(bus.trackId);
    expect(kick?.routing.sendIds).toContain(ret.trackId);
    expect(kick?.metadata?.sendLevels).toMatchObject({ [ret.trackId]: 0.35 });
  });

  it("proxies branch track solo to lane mix metadata and filters rendered drum events", () => {
    const project = branchGeneratedDrumsToTracks(createDemoProject());
    const soloed = toggleTrackSolo(project, "drums-kick");
    const events = renderTimelineEvents(soloed);

    expect(soloed.tracks.find((track) => track.id === "drums-kick")?.solo).toBe(true);
    expect(getDrumLaneMix(soloed, "kick").solo).toBe(true);
    expect(events.some((event) => event.kind === "kick")).toBe(true);
    expect(events.some((event) => event.kind === "snare")).toBe(false);
    expect(events.some((event) => event.kind === "hat")).toBe(false);
    expect(project.tracks.find((track) => track.id === "drums-kick")?.solo).toBe(false);
  });
});

function sourceDrumSignature(events: ReturnType<typeof renderTimelineEvents>) {
  return events
    .filter((event) => event.role === "drums")
    .map((event) => `${sourceDrumKind(String(event.kind))}:${event.time.toFixed(5)}:${event.duration.toFixed(5)}:${event.step}`);
}

function sourceDrumKind(kind: string) {
  if (kind === "clap") return "snare";
  if (kind === "openhat") return "hat";
  return kind;
}
