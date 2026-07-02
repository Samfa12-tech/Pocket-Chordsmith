import { describe, expect, it } from "vitest";
import { buildPocketChordsmithShareCode, parseAnyImportText, parsePocketChordsmithShareCode, utf8ToBase64Url } from "../src/compatibility/pcsParser";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { createDemoChordsmithProject, createLofiChordsmithTemplateProject } from "../src/demo/demoProject";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { importTextToProject } from "../src/app/commands";
import { DEFAULT_FX } from "../../../packages/pocket-audio-core/src/constants.js";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { createPocketDjImportFixture } from "./pocketDjFixtures";

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

  it("imports PDJ1 sessions while preserving DJ-owned performance metadata", () => {
    const session = createPocketDjImportFixture();
    const code = `PDJ1:${utf8ToBase64Url(JSON.stringify(session))}`;
    const parsed = parseAnyImportText(code);
    const { project, message } = importTextToProject(code);
    const chordsmithRef = project.sourceRefs.find((ref) => ref.sourceType === "pocket-chordsmith");
    const djRef = project.sourceRefs.find((ref) => ref.sourceType === "pocket-dj");

    expect(parsed.kind).toBe("pdj");
    expect(parsed.kind === "pdj" ? parsed.importKind : "").toBe("PDJ1");
    expect(message).toBe("Imported Pocket DJ session and preserved performance metadata.");
    expect(chordsmithRef?.sourcePrefix).toBe("PCS1");
    expect(chordsmithRef?.normalized).toMatchObject({ rawTitle: "DJ Source Tune", bpm: 132 });
    expect(chordsmithRef?.notes?.some((note) => note.includes("Pocket DJ PDJ1 share code"))).toBe(true);
    expect(djRef).toMatchObject({
      sourceType: "pocket-dj",
      sourcePrefix: "PDJ1",
      schemaVersion: 1,
      title: "Late Night Deck"
    });
    expect(djRef?.original).toMatchObject({
      app: "PocketDJ",
      performance: {
        currentSection: "B",
        stemVolumes: { drums: 0.42 },
        fx: { filter: 0.31 }
      }
    });
    expect(djRef?.normalized).toMatchObject({
      app: "PocketDJ",
      djVersion: 1,
      deck: { name: "Late Night Deck", bpm: 132, lofiPreset: "lofi_rainy_window" },
      performance: {
        currentSection: "B",
        queuedSection: "D",
        launchQuantize: "bar",
        sequence: ["A", "B", "D"],
        sequencePlaying: true,
        masterVolume: 0.72,
        stemMutes: { melody: true },
        stemVolumes: { drums: 0.42, bass: 0.8 },
        fx: { filter: 0.31, reverb: 0.44 }
      }
    });
    expect(project.importHistory).toEqual([
      expect.objectContaining({
        sourceRefId: djRef?.id,
        importKind: "PDJ1",
        message: "Imported Pocket DJ session and preserved DJ performance metadata."
      })
    ]);
    expect(project.timeline.clips.every((clip) => clip.sourceRefId === chordsmithRef?.id)).toBe(true);

    const reopened = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(project)));
    const reopenedDjRef = reopened.sourceRefs.find((ref) => ref.sourceType === "pocket-dj");
    expect(reopenedDjRef?.normalized).toMatchObject({
      performance: {
        currentSection: "B",
        sequence: ["A", "B", "D"],
        stemMutes: { melody: true },
        fx: { filter: 0.31, reverb: 0.44 }
      }
    });
    expect(reopened.importHistory[0]).toMatchObject({ importKind: "PDJ1", sourceRefId: reopenedDjRef?.id });
  });

  it("unwraps PocketHandoff envelopes that carry PDJ1 sessions", () => {
    const session = createPocketDjImportFixture();
    const code = `PDJ1:${utf8ToBase64Url(JSON.stringify(session))}`;
    const handoff = {
      app: "PocketHandoff",
      handoffVersion: 1,
      kind: "dj-to-daw",
      code,
      createdAt: "2026-07-03T00:00:00.000Z",
      sourceApp: "Pocket DJ",
      targetApp: "PocketDAW"
    };
    const fromJson = importTextToProject(JSON.stringify(handoff)).project;
    const fromEncoded = parseAnyImportText(`PocketHandoff:${utf8ToBase64Url(JSON.stringify(handoff))}`);
    const djRef = fromJson.sourceRefs.find((ref) => ref.sourceType === "pocket-dj");

    expect(fromEncoded.kind).toBe("pdj");
    expect(fromEncoded.kind === "pdj" ? fromEncoded.importKind : "").toBe("PDJ1");
    expect(djRef?.sourcePrefix).toBe("PDJ1");
    expect(djRef?.normalized).toMatchObject({
      deck: { name: "Late Night Deck" },
      performance: { currentSection: "B", sequence: ["A", "B", "D"], fx: { filter: 0.31 } }
    });
    expect(fromJson.importHistory[0]).toMatchObject({ importKind: "PDJ1", sourceRefId: djRef?.id });
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
    const drumsChain = project.fx.chains.find((chain) => chain.ownerTrackId === "drums");
    const bassChain = project.fx.chains.find((chain) => chain.ownerTrackId === "bass");
    const chordChain = project.fx.chains.find((chain) => chain.ownerTrackId === "chords");
    const melodyChain = project.fx.chains.find((chain) => chain.ownerTrackId === "melody");

    expect(sanitized.audioProfile).toBe("lofi_chill");
    expect(sanitized.lofiPreset).toBe("lofi_study_room");
    expect(project.sourceRefs[0]?.notes?.some((note) => note.includes("Lofi profile detected"))).toBe(true);
    expect(project.sourceRefs[0]?.notes?.some((note) => note.includes("Pocket Pro EQ"))).toBe(true);
    expect(byRole.get("drums")?.name).toBe("Lofi Drums");
    expect(byRole.get("drums")?.metadata).toMatchObject({ audioProfile: "lofi_chill", drumKit: "lofi_dusty" });
    expect(byRole.get("bass")?.name).toBe("Warm Sub Bass");
    expect(byRole.get("bass")?.metadata).toMatchObject({ bassTone: "warm_sub" });
    expect(drumsChain?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "lofi-drum-softener" });
    expect(bassChain?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "warm-bass-pocket" });
    expect(chordChain?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "soft-chord-bed" });
    expect(melodyChain?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "gentle-lead-presence" });
    expect(masterChain?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "lofi-soft-rolloff" });
    expect(masterChain?.slots.some((slot) => slot.id === "lofi_lowpass_master")).toBe(true);
    expect(masterChain?.slots.some((slot) => slot.id === "lofi_saturation_master")).toBe(true);
  });

  it("normalises lofi drum groove presets through the shared Pocket Audio registry", () => {
    const valid = sanitizePocketChordsmithProject({
      title: "Valid Lofi Groove",
      audioProfile: "lofi_chill",
      lofiPreset: "lofi_koi_pond",
      drumGroovePreset: "lofi_sparse_clicks"
    });
    const invalid = sanitizePocketChordsmithProject({
      title: "Preset Fallback Groove",
      audioProfile: "lofi_chill",
      lofiPreset: "lofi_koi_pond",
      drumGroovePreset: "definitely_not_a_groove"
    });
    const standard = sanitizePocketChordsmithProject({
      title: "Standard Groove",
      drumGroovePreset: "lofi_sparse_clicks",
      lofiPreset: "definitely_not_a_preset"
    });
    const project = createDawProjectFromChordsmithProject(invalid);
    const drumTrack = project.tracks.find((track) => track.role === "drums");

    expect(valid.drumGroovePreset).toBe("lofi_sparse_clicks");
    expect(invalid.lofiPreset).toBe("lofi_koi_pond");
    expect(invalid.drumGroovePreset).toBe("lofi_sparse_clicks");
    expect(standard.audioProfile).toBe("standard");
    expect(standard.lofiPreset).toBe("");
    expect(standard.drumGroovePreset).toBe("");
    expect(drumTrack?.metadata).toMatchObject({ audioProfile: "lofi_chill", drumGroovePreset: "lofi_sparse_clicks" });
    expect(project.sourceRefs[0]?.normalized).toMatchObject({ lofiPreset: "lofi_koi_pond", drumGroovePreset: "lofi_sparse_clicks" });
  });

  it("uses Chordsmith lofi preset texture defaults when imports omit explicit texture values", () => {
    const sanitized = sanitizePocketChordsmithProject({
      title: "Preset Texture Defaults",
      audioProfile: "lofi_chill",
      lofiPreset: "lofi_rainy_window"
    });
    const project = createDawProjectFromChordsmithProject(sanitized);
    const events = renderTimelineEvents(project);
    const textureEvent = events.find((event) => event.kind === "texture");

    expect(sanitized.lofiTexture).toMatchObject({
      enabled: true,
      vinylCrackle: 0.04,
      tapeHiss: 0.1,
      wowFlutter: 0.025,
      warmth: 0.14,
      lowPassAge: 0.2,
      bitCrush: 0
    });
    expect(textureEvent?.lofiTexture).toMatchObject({ enabled: true, tapeHiss: 0.1, vinylCrackle: 0.04 });
    expect(project.sourceRefs[0]?.normalized).toMatchObject({ lofiTexture: { enabled: true, tapeHiss: 0.1 } });
  });

  it("applies heavy-metal preset defaults when importing sparse metal Chordsmith projects", () => {
    const melodyA = new Array<number | null>(64).fill(null);
    const bassNotesA = new Array<number | null>(64).fill(null);
    const guitarPatternA = new Array<string>(64).fill("off");
    const gridA = {
      kick: new Array(64).fill(0),
      snare: new Array(64).fill(0),
      hat: new Array(64).fill(0),
      bass: new Array(64).fill(0)
    };
    gridA.kick[0] = 2;
    bassNotesA[0] = 0;
    guitarPatternA[0] = "chug";
    melodyA[0] = 5;
    const sanitized = sanitizePocketChordsmithProject({
      title: "Sparse Metal Import",
      audioProfile: "heavy_metal",
      metalPreset: "metal_thrashing_gallop",
      bassMode: "manual",
      gridA,
      bassNotesA,
      guitarPatternA,
      melodyTracksA: [melodyA]
    });
    const project = createDawProjectFromChordsmithProject(sanitized);
    const byRole = new Map(project.tracks.map((track) => [track.role, track]));
    const events = renderTimelineEvents(project);
    const masterChain = project.fx.chains.find((chain) => chain.ownerTrackId === "master" || chain.id === "fx_master");

    expect(sanitized.audioProfile).toBe("heavy_metal");
    expect(sanitized.scale).toBe("minor");
    expect(sanitized.bpm).toBe(168);
    expect(sanitized.metalPreset).toBe("metal_thrashing_gallop");
    expect(sanitized.drumKit).toBe("metal_tight");
    expect(sanitized.drumGroovePreset).toBe("metal_gallop_160");
    expect(sanitized.bassTone).toBe("metal_grind_bass");
    expect(sanitized.chordInstrument).toBe("metal_power_stack");
    expect(sanitized.sections.A.melodyInstruments).toEqual(["twin_harmony_lead"]);
    expect(sanitized.guitarEnabled).toBe(true);
    expect(sanitized.guitarTone).toBe("tight_metal");
    expect(sanitized.guitarPatternPreset).toBe("thrash_gallop");
    expect(sanitized.metalTexture).toMatchObject({ enabled: true, palmMute: 0.84, pickAttack: 0.82 });
    expect(project.sourceRefs[0]?.notes?.some((note) => note.includes("Heavy metal profile detected"))).toBe(true);
    expect(project.sourceRefs[0]?.normalized).toMatchObject({
      audioProfile: "heavy_metal",
      metalPreset: "metal_thrashing_gallop",
      drumKit: "metal_tight",
      drumGroovePreset: "metal_gallop_160",
      bassTone: "metal_grind_bass"
    });
    expect(byRole.get("drums")?.metadata).toMatchObject({ audioProfile: "heavy_metal", metalPreset: "metal_thrashing_gallop", drumKit: "metal_tight" });
    expect(byRole.get("bass")?.metadata).toMatchObject({ bassTone: "metal_grind_bass" });
    expect(byRole.get("guitar")?.active).toBe(true);
    expect(project.fx.chains.find((chain) => chain.ownerTrackId === "drums")?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "drum-punch" });
    expect(masterChain?.slots.some((slot) => slot.id === "metal_saturation_master")).toBe(true);
    expect(events.some((event) => event.kind === "kick" && event.audioProfile === "heavy_metal" && event.drumKit === "metal_tight")).toBe(true);
    expect(events.some((event) => event.kind === "bass" && event.bassTone === "metal_grind_bass")).toBe(true);
    expect(events.some((event) => event.kind === "chord" && event.instrument === "metal_power_stack")).toBe(true);
    expect(events.some((event) => event.kind === "melody" && event.instrument === "twin_harmony_lead" && event.metalPreset === "metal_thrashing_gallop")).toBe(true);
    expect(events.some((event) => event.kind === "guitar" && event.instrument === "tight_metal")).toBe(true);
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
    expect(sanitized.fxDelay).toBe(DEFAULT_FX.delay);
    expect(sanitized.fxChorus).toBe(DEFAULT_FX.chorus);
    expect(sanitized.fxFlanger).toBe(DEFAULT_FX.flanger);
    expect(sanitized.fxReverb).toBe(DEFAULT_FX.reverb);
    expect(sanitized.fxMix).toBe(DEFAULT_FX.mix);
    expect(sanitized.sidechainAmount).toBe(DEFAULT_FX.sidechain.amount);
    expect((sanitized.original as Record<string, unknown>).unknownChordsmithField).toBe("keep me");
  });

  it("normalises Chordsmith instrument IDs through the shared Pocket Audio registry", () => {
    const melodyA = new Array<number | null>(64).fill(null);
    const melodyB = new Array<number | null>(64).fill(null);
    melodyA[0] = 4;
    melodyB[8] = 7;

    const shared = sanitizePocketChordsmithProject({
      title: "Shared Instruments",
      chordInstrument: "dusty_rhodes",
      chordPlayMode: "arp_down",
      chordRhythmMode: "half",
      melodyTracksA: [melodyA, melodyB],
      melodyInstrumentsA: ["tape_bell", "definitely_not_a_voice"]
    });
    const invalid = sanitizePocketChordsmithProject({
      title: "Invalid Instruments",
      chordInstrument: "definitely_not_a_chord_voice",
      chordPlayMode: "sideways_strum",
      chordRhythmMode: "everywhere_all_at_once",
      melodyTracksA: [melodyA],
      melodyInstrumentsA: ["definitely_not_a_voice"]
    });

    expect(shared.chordInstrument).toBe("dusty_rhodes");
    expect(shared.chordPlayMode).toBe("arp_down");
    expect(shared.chordRhythmMode).toBe("half");
    expect(shared.sections.A.melodyInstruments).toEqual(["tape_bell", "pulse"]);
    expect(invalid.chordInstrument).toBe("pocket");
    expect(invalid.chordPlayMode).toBe("block");
    expect(invalid.chordRhythmMode).toBe("sustain");
    expect(invalid.sections.A.melodyInstruments).toEqual(["pulse"]);
  });

  it("preserves explicit Chordsmith FX and pump settings for DAW playback chains", () => {
    const sanitized = sanitizePocketChordsmithProject({
      title: "FX Import",
      fxDelay: 0.31,
      fxChorus: 0.22,
      fxFlanger: 0.11,
      fxReverb: 0.27,
      fxMix: 0.58,
      humanizeOn: true,
      sidechainOn: true,
      sidechainAmount: 0.49
    });
    const project = createDawProjectFromChordsmithProject(sanitized);
    const chordFxSlots = project.fx.chains.find((chain) => chain.id === "fx_chords")?.slots || [];

    expect(sanitized.fxDelay).toBe(0.31);
    expect(sanitized.fxReverb).toBe(0.27);
    expect(sanitized.humanizeOn).toBe(true);
    expect(project.sourceRefs[0]?.normalized).toMatchObject({ humanizeOn: true });
    expect(sanitized.sidechainOn).toBe(true);
    expect(sanitized.sidechainAmount).toBe(0.49);
    expect(chordFxSlots.some((slot) => slot.id.startsWith("pcs_delay"))).toBe(true);
    expect(chordFxSlots.some((slot) => slot.id.startsWith("pcs_chorus"))).toBe(true);
    expect(chordFxSlots.some((slot) => slot.id.startsWith("pcs_reverb"))).toBe(true);
    expect(chordFxSlots.some((slot) => slot.id.startsWith("pcs_tone") && slot.type === "parametric-eq")).toBe(true);
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
