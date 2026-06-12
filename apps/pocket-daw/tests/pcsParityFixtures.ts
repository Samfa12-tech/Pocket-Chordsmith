const SECTION_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export interface PcsParityFixture {
  name: string;
  raw: Record<string, unknown>;
  expected: {
    sequence: string[];
    bars: number[];
    eventKinds: string[];
    melodyTrackCount?: number;
    guitarTone?: string;
    hasSlide?: boolean;
    hasTuplet?: boolean;
  };
}

export const PCS_PARITY_FIXTURES: PcsParityFixture[] = [
  {
    name: "simple 4-bar loop",
    raw: makeProject("Simple Loop", {
      songSequence: ["A"],
      gridA: drumGrid(64),
      melodyTracksA: [melodyLine(64, [0, 2, 4, 7])],
      unknownParityField: { keep: true }
    }),
    expected: {
      sequence: ["A"],
      bars: [4],
      eventKinds: ["kick", "snare", "hat", "bass", "chord", "melody"]
    }
  },
  {
    name: "multi-section songSequence",
    raw: makeProject("Multi Section", {
      bpm: 132,
      key: "D",
      scale: "minor",
      sectionBars: { A: 2, B: 3, C: 1, D: 4, E: 4, F: 4, G: 4, H: 4 },
      songSequence: ["A", "B", "C", "B"],
      gridA: drumGrid(32),
      gridB: drumGrid(48),
      gridC: drumGrid(16),
      melodyTracksB: [melodyLine(48, [4, 5, 7, 9])]
    }),
    expected: {
      sequence: ["A", "B", "C", "B"],
      bars: [2, 3, 1, 3],
      eventKinds: ["kick", "snare", "hat", "chord", "melody"]
    }
  },
  {
    name: "manual bass with holds and slides",
    raw: makeProject("Manual Bass", {
      bassMode: "manual",
      songSequence: ["A"],
      bassNotesA: stepArray(64, null, { 0: 0, 3: 4, 16: 7 }),
      bassHoldA: boolArray(64, [1, 2]),
      bassSlideA: boolArray(64, [3]),
      bassAccentA: boolArray(64, [0, 16]),
      gridA: drumGrid(64)
    }),
    expected: {
      sequence: ["A"],
      bars: [4],
      eventKinds: ["bass", "kick", "snare", "hat"],
      hasSlide: true
    }
  },
  {
    name: "multiple melody tracks with tuplets",
    raw: makeProject("Tuplet Melody", {
      songSequence: ["A"],
      melodyTracksA: [stepArray(64, null, { 0: 0, 2: 4, 16: 7, 24: 11 }), melodyLine(64, [7, 9, 11, 12])],
      melodyInstrumentsA: ["bell", "lead_guitar"],
      melodyOctavesA: [0, 1],
      melodyPanA: [-0.35, 0.42],
      melodyHoldA: [boolArray(64, [1]), boolArray(64, [9])],
      melodySlideA: [boolArray(64, [2]), boolArray(64, [16])],
      melodyTupletsA: [boolArray(64, []), boolArray(64, [8])]
    }),
    expected: {
      sequence: ["A"],
      bars: [4],
      eventKinds: ["melody", "chord"],
      melodyTrackCount: 2,
      hasTuplet: true,
      hasSlide: true
    }
  },
  {
    name: "guitar-enabled non-default globals",
    raw: makeProject("Guitar Globals", {
      bpm: 104,
      key: "F#",
      scale: "minor",
      swing: 0.12,
      timeSig: 3,
      sectionBars: { A: 2, B: 4, C: 4, D: 4, E: 4, F: 4, G: 4, H: 4 },
      songSequence: ["A"],
      guitarEnabled: true,
      guitarTone: "metal",
      guitarRegister: "high",
      guitarStrumMode: "alternate",
      guitarPatternA: stepArray(24, "off", { 0: "accent", 2: "chug", 4: "hold", 6: "scratch" }),
      progressionA: [0, 5]
    }),
    expected: {
      sequence: ["A"],
      bars: [2],
      eventKinds: ["guitar", "chord"],
      guitarTone: "metal"
    }
  }
];

function makeProject(title: string, patch: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    projectVersion: 16,
    title,
    key: "C",
    scale: "major",
    timeSig: 4,
    bpm: 118,
    swing: 0,
    resolution: 4,
    chordType: "triad",
    chordInstrument: "pocket",
    chordPlayMode: "block",
    chordRhythmMode: "sustain",
    bassMode: "auto",
    guitarEnabled: false,
    sectionBars: Object.fromEntries(SECTION_IDS.map((id) => [id, 4])),
    songSequence: ["A"],
    progressionA: [0, 4, 5, 3]
  };
  SECTION_IDS.forEach((id) => {
    base[`grid${id}`] = emptyGrid(64);
    base[`gridTuplets${id}`] = emptyTuplets(64);
    base[`melodyTracks${id}`] = [new Array(64).fill(null)];
    base[`melodyHold${id}`] = [new Array(64).fill(false)];
    base[`melodySlide${id}`] = [new Array(64).fill(false)];
    base[`melodyTuplets${id}`] = [new Array(64).fill(false)];
    base[`bassNotes${id}`] = new Array(64).fill(null);
    base[`bassHold${id}`] = new Array(64).fill(false);
    base[`bassSlide${id}`] = new Array(64).fill(false);
    base[`bassAccent${id}`] = new Array(64).fill(false);
    base[`guitarPattern${id}`] = new Array(64).fill("off");
  });
  return { ...base, ...patch };
}

function drumGrid(steps: number) {
  const grid = emptyGrid(steps);
  for (let step = 0; step < steps; step += 4) grid.hat[step] = 1;
  for (let step = 0; step < steps; step += 16) {
    grid.kick[step] = 2;
    grid.snare[step + 4] = 2;
    grid.snare[step + 12] = 2;
    grid.bass[step] = 1;
  }
  return grid;
}

function emptyGrid(steps: number) {
  return {
    kick: new Array(steps).fill(0),
    snare: new Array(steps).fill(0),
    hat: new Array(steps).fill(0),
    bass: new Array(steps).fill(0)
  };
}

function emptyTuplets(steps: number) {
  return {
    kick: new Array(steps).fill(false),
    snare: new Array(steps).fill(false),
    hat: new Array(steps).fill(false),
    bass: new Array(steps).fill(false)
  };
}

function melodyLine(steps: number, notes: number[]) {
  const line = new Array<number | null>(steps).fill(null);
  notes.forEach((note, index) => {
    line[index * 8] = note;
  });
  return line;
}

function stepArray<T>(steps: number, fill: T, values: Record<number, T>) {
  const out = new Array<T>(steps).fill(fill);
  Object.entries(values).forEach(([step, value]) => {
    out[Number(step)] = value;
  });
  return out;
}

function boolArray(steps: number, enabledSteps: number[]) {
  const out = new Array<boolean>(steps).fill(false);
  enabledSteps.forEach((step) => {
    out[step] = true;
  });
  return out;
}
