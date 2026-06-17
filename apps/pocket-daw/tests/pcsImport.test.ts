import { describe, expect, it } from "vitest";
import { buildPocketChordsmithShareCode, parseAnyImportText, parsePocketChordsmithShareCode } from "../src/compatibility/pcsParser";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { createDemoChordsmithProject, createLofiChordsmithTemplateProject } from "../src/demo/demoProject";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { importTextToProject } from "../src/app/commands";

describe("Pocket Chordsmith import", () => {
  it("decodes PCS1 share codes", () => {
    const source = createDemoChordsmithProject();
    const code = buildPocketChordsmithShareCode(source);
    const parsed = parsePocketChordsmithShareCode(code) as Record<string, unknown>;
    expect(parsed.title).toBe("Pocket DAW Demo - Neon Roads");
  });

  it("imports raw JSON", () => {
    const source = createDemoChordsmithProject();
    const parsed = parseAnyImportText(JSON.stringify(source));
    expect(parsed.kind).toBe("pcs");
    expect(parsed.kind === "pcs" ? parsed.importKind : "").toBe("raw-json");
  });

  it("preserves source BPM when importing PCS1 share codes or raw Chordsmith JSON", () => {
    const source = { ...createCompactExportRegressionProject(), bpm: 136 };
    const fromCode = importTextToProject(buildPocketChordsmithShareCode(source)).project;
    const fromJson = importTextToProject(JSON.stringify(source)).project;

    expect(fromCode.project.bpm).toBe(136);
    expect(fromJson.project.bpm).toBe(136);
    expect(fromCode.sourceRefs[0]?.normalized).toMatchObject({ bpm: 136 });
    expect(fromJson.sourceRefs[0]?.normalized).toMatchObject({ bpm: 136 });
  });

  it("applies lofi track presets and master chain when importing lofi Chordsmith projects", () => {
    const sanitized = sanitizePocketChordsmithProject(createLofiChordsmithTemplateProject());
    const project = createDawProjectFromChordsmithProject(sanitized);
    const byRole = new Map(project.tracks.map((track) => [track.role, track]));
    const masterChain = project.fx.chains.find((chain) => chain.ownerTrackId === "master" || chain.id === "fx_master");

    expect(sanitized.audioProfile).toBe("lofi_chill");
    expect(sanitized.lofiPreset).toBe("lofi_study_room");
    expect(project.sourceRefs[0]?.notes?.some((note) => note.includes("Lofi profile detected"))).toBe(true);
    expect(byRole.get("drums")?.name).toBe("Lofi Drums");
    expect(byRole.get("drums")?.metadata).toMatchObject({ audioProfile: "lofi_chill", drumKit: "lofi_dusty" });
    expect(byRole.get("bass")?.name).toBe("Warm Sub Bass");
    expect(byRole.get("bass")?.metadata).toMatchObject({ bassTone: "warm_sub" });
    expect(masterChain?.slots.some((slot) => slot.id === "lofi_lowpass_master")).toBe(true);
    expect(masterChain?.slots.some((slot) => slot.id === "lofi_saturation_master")).toBe(true);
  });

  it("normalises missing fields and preserves unknown source fields", () => {
    const sanitized = sanitizePocketChordsmithProject({
      title: "Sparse",
      key: "A",
      scale: "minor",
      unknownChordsmithField: "keep me"
    });
    expect(sanitized.projectVersion).toBe(1);
    expect(sanitized.sections.A.active).toBe(true);
    expect((sanitized.original as Record<string, unknown>).unknownChordsmithField).toBe("keep me");
  });

  it("preserves compact section grid timing from v16 exports and share codes", () => {
    const compact = createCompactExportRegressionProject();
    const code = buildPocketChordsmithShareCode(compact);
    const imported = parseAnyImportText(code);
    const raw = imported.kind === "pcs" ? imported.data : {};
    const sanitized = sanitizePocketChordsmithProject(raw);

    expect(sanitized.sections.A.grid.kick[16]).toBe(2);
    expect(sanitized.sections.A.bassNotes[24]).toBe(4);
    expect(sanitized.sections.A.melodyTracks[0][20]).toBe(7);
    expect(sanitized.sections.A.guitarPattern[28]).toBe("accent");

    const events = renderTimelineEvents(createDawProjectFromChordsmithProject(sanitized));
    expect(events.some((event) => event.kind === "kick" && event.step === 16)).toBe(true);
    expect(events.some((event) => event.kind === "bass" && event.step === 24)).toBe(true);
    expect(events.some((event) => event.kind === "melody" && event.step === 20)).toBe(true);
    expect(events.some((event) => event.kind === "guitar" && event.step === 28)).toBe(true);
    expect(events.some((event) => event.kind === "melody" && event.step === 22)).toBe(false);
  });

  it("starts imported tracks from Chordsmith bus settings", () => {
    const sanitized = sanitizePocketChordsmithProject({
      ...createCompactExportRegressionProject(),
      masterVolume: 0.81,
      chordVolume: 0.51,
      beatVolume: 0.77,
      leadVolume: 0.43,
      chordsOn: false,
      bassOn: false,
      guitarVolume: 0.38
    });
    const project = createDawProjectFromChordsmithProject(sanitized);
    const byId = new Map(project.tracks.map((track) => [track.id, track]));

    expect(byId.get("master")?.volume).toBe(0.81);
    expect(byId.get("chords")?.volume).toBe(0.51);
    expect(byId.get("chords")?.mute).toBe(true);
    expect(byId.get("bass")?.volume).toBe(0.77);
    expect(byId.get("bass")?.active).toBe(false);
    expect(byId.get("melody")?.volume).toBe(0.43);
    expect(byId.get("guitar")?.volume).toBe(0.38);
    expect(project.fx.chains.find((chain) => chain.id === "fx_chords")?.slots.some((slot) => slot.presetId === "pocket-chordsmith")).toBe(true);
  });

  it("creates a generated DAW melody track for every imported Chordsmith melody lane", () => {
    const source = createCompactExportRegressionProject();
    const steps = 64;
    const melodies = Array.from({ length: 6 }, (_, trackIndex) => {
      const track = new Array<number | null>(steps).fill(null);
      track[trackIndex * 2] = trackIndex + 1;
      return track;
    });
    const sanitized = sanitizePocketChordsmithProject({
      ...source,
      melodyTracksA: melodies,
      melodyInstrumentsA: ["banjo", "harmonica", "lead_guitar", "bell", "flute", "pulse"],
      melodyOctavesA: [0, 0, 1, 0, -1, 0],
      melodyMuteA: [false, false, false, false, false, false],
      melodySoloA: [false, false, false, false, false, false],
      melodyPanA: [-0.5, -0.25, 0, 0.15, 0.35, 0.5],
      melodyHoldA: melodies.map(() => new Array<boolean>(steps).fill(false)),
      melodySlideA: melodies.map(() => new Array<boolean>(steps).fill(false)),
      melodyTupletsA: melodies.map(() => new Array<boolean>(steps).fill(false))
    });

    const project = createDawProjectFromChordsmithProject(sanitized);
    const melodyTracks = project.tracks.filter((track) => track.role === "melody");
    const events = renderTimelineEvents(project).filter((event) => event.kind === "melody");

    expect(melodyTracks.map((track) => track.id)).toEqual(["melody", "melody-2", "melody-3", "melody-4", "melody-5", "melody-6"]);
    expect(melodyTracks.map((track) => track.metadata?.chordsmithMelodyTrackIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(melodyTracks[1].name).toContain("Harmonica");
    expect(melodyTracks[5].pan).toBe(0.5);
    expect(project.fx.chains.some((chain) => chain.ownerTrackId === "melody-6")).toBe(true);
    expect(new Set(events.map((event) => event.trackId))).toEqual(new Set(["melody", "melody-2", "melody-3", "melody-4", "melody-5", "melody-6"]));
  });
});

function createCompactExportRegressionProject() {
  const steps = 64;
  const grid = {
    kick: new Array(steps).fill(0),
    snare: new Array(steps).fill(0),
    hat: new Array(steps).fill(0),
    bass: new Array(steps).fill(0)
  };
  grid.kick[16] = 2;
  grid.snare[20] = 1;
  grid.hat[24] = 1;
  const melodyA = new Array<number | null>(steps).fill(null);
  const mutedMelody = new Array<number | null>(steps).fill(null);
  melodyA[20] = 7;
  mutedMelody[22] = 9;
  const bassNotes = new Array<number | null>(steps).fill(null);
  bassNotes[24] = 4;
  const guitarPattern = new Array<string>(steps).fill("off");
  guitarPattern[28] = "accent";
  const blankBool = new Array<boolean>(steps).fill(false);
  return {
    projectVersion: 16,
    title: "Compact Regression",
    key: "G",
    scale: "major",
    timeSig: 4,
    bpm: 136,
    swing: 0.05,
    resolution: 4,
    chordType: "seventh",
    chordInstrument: "saloon_piano",
    chordRhythmMode: "quarter",
    melodyPitchMode: "chromatic",
    bassMode: "manual",
    guitarEnabled: true,
    guitarTone: "western_twang",
    guitarRegister: "mid",
    guitarVolume: 1,
    sectionBars: { A: 2 },
    songSequence: ["A"],
    progressionA: [0, 3, 4, 0],
    gridA: grid,
    melodyTracksA: [melodyA, mutedMelody],
    melodyInstrumentsA: ["banjo", "harmonica"],
    melodyOctavesA: [0, 0],
    melodyMuteA: [false, true],
    melodySoloA: [false, false],
    melodyPanA: [0, 0],
    melodyHoldA: [blankBool, blankBool],
    melodySlideA: [blankBool, blankBool],
    melodyTupletsA: [blankBool, blankBool],
    bassNotesA: bassNotes,
    bassHoldA: blankBool,
    bassSlideA: blankBool,
    bassAccentA: blankBool,
    guitarPatternA: guitarPattern
  };
}
