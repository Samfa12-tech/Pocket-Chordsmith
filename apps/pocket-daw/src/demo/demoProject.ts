import { sanitizePocketChordsmithProject } from "../compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../compatibility/pcsToDaw";
import type { PocketDawProject } from "../daw/schema";

export function createDemoProject(): PocketDawProject {
  return createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(createDemoChordsmithProject()));
}

export function createDemoChordsmithProject() {
  const sectionIds = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const timeSig = 4;
  const resolution = 4;
  const sectionBars: Record<string, number> = { A: 4, B: 4, C: 4, D: 4, E: 2, F: 2, G: 2, H: 2 };
  const project: Record<string, unknown> = {
    projectVersion: 16,
    title: "Pocket DAW Demo - Neon Roads",
    key: "A",
    scale: "minor",
    timeSig,
    bpm: 118,
    swing: 0.04,
    resolution,
    chordType: "seventh",
    chordInstrument: "warm_pad",
    chordPlayMode: "strum_up",
    chordRhythmMode: "sustain",
    chordOctave: 0,
    melodyPitchMode: "scale",
    bassMode: "auto",
    guitarEnabled: true,
    guitarTone: "crunch",
    guitarRegister: "low",
    guitarStrumMode: "alternate",
    guitarVolume: 0.62,
    fxDelay: 0.08,
    fxReverb: 0.12,
    fxMix: 0.65,
    sidechainOn: true,
    sidechainAmount: 0.35,
    unknownFutureChordsmithField: {
      preservedByPocketDaw: true
    },
    sectionBars,
    songSequence: ["A", "A", "B", "C", "D", "B", "A"]
  };

  sectionIds.forEach((id) => {
    const steps = sectionBars[id] * timeSig * resolution;
    project[`progression${id}`] = progressionFor(id);
    project[`grid${id}`] = drumGrid(steps, id);
    project[`gridTuplets${id}`] = blankTuplets(steps);
    project[`melodyTracks${id}`] = [melodyLine(steps, id)];
    project[`melodyInstruments${id}`] = [id === "D" ? "lead_guitar" : "synth"];
    project[`melodyOctaves${id}`] = [id === "C" || id === "D" ? 1 : 0];
    project[`melodyMute${id}`] = [false];
    project[`melodySolo${id}`] = [false];
    project[`melodyPan${id}`] = [0.08];
    project[`melodyHold${id}`] = [blankBool(steps)];
    project[`melodySlide${id}`] = [blankBool(steps)];
    project[`melodyTuplets${id}`] = [blankBool(steps)];
    project[`bassHold${id}`] = blankBool(steps);
    project[`bassSlide${id}`] = blankBool(steps);
    project[`bassNotes${id}`] = new Array(steps).fill(null);
    project[`bassAccent${id}`] = accentEvery(steps, 16);
    project[`guitarPattern${id}`] = guitarPattern(steps, id);
  });
  return project;
}

function progressionFor(id: string) {
  const progressions: Record<string, number[]> = {
    A: [0, 5, 3, 4],
    B: [3, 4, 0, 6],
    C: [5, 3, 4, 0],
    D: [0, 0, 6, 4]
  };
  return progressions[id] || [0, 4, 5, 3];
}

function drumGrid(steps: number, id: string) {
  const grid = {
    kick: new Array(steps).fill(0),
    snare: new Array(steps).fill(0),
    hat: new Array(steps).fill(0),
    bass: new Array(steps).fill(0)
  };
  for (let i = 0; i < steps; i += 4) grid.hat[i] = i % 16 === 0 ? 2 : 1;
  for (let i = 0; i < steps; i += 16) {
    grid.kick[i] = 2;
    grid.kick[i + 8] = id === "C" ? 1 : 0;
    grid.snare[i + 4] = 2;
    grid.snare[i + 12] = 2;
    grid.bass[i] = 1;
    grid.bass[i + 6] = id === "B" || id === "D" ? 1 : 0;
    grid.bass[i + 10] = 1;
  }
  return grid;
}

function melodyLine(steps: number, id: string) {
  const line = new Array<number | null>(steps).fill(null);
  const motifs: Record<string, number[]> = {
    A: [0, 2, 4, 2, 7, 6, 4, 2],
    B: [4, 5, 7, 9, 7, 5, 4, 2],
    C: [7, 9, 11, 12, 11, 9, 7, 4],
    D: [12, 11, 9, 7, 9, 7, 4, 2]
  };
  const motif = motifs[id] || [0, 2, 4, 5];
  for (let i = 0; i < motif.length; i += 1) line[i * 8] = motif[i];
  return line;
}

function guitarPattern(steps: number, id: string) {
  const pattern = new Array<string>(steps).fill("off");
  if (id === "E" || id === "F" || id === "G" || id === "H") return pattern;
  for (let i = 0; i < steps; i += 4) pattern[i] = i % 16 === 0 ? "accent" : "chug";
  return pattern;
}

function blankBool(steps: number) {
  return new Array<boolean>(steps).fill(false);
}

function blankTuplets(steps: number) {
  return {
    kick: blankBool(steps),
    snare: blankBool(steps),
    hat: blankBool(steps),
    bass: blankBool(steps)
  };
}

function accentEvery(steps: number, stride: number) {
  return new Array<boolean>(steps).fill(false).map((_, i) => i % stride === 0);
}
