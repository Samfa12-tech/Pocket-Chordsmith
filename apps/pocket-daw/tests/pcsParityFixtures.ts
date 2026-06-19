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
    audioProfile?: string;
    lofiPreset?: string;
    lofiTexture?: Record<string, unknown>;
    drumKit?: string;
    bassTone?: string;
    chordInstrument?: string;
    melodyInstruments?: string[];
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
  },
  {
    name: "Glass Tank Afternoon lofi import",
    raw: makeGlassTankAfternoonProject(),
    expected: {
      sequence: ["A", "B", "A", "C", "E", "B", "G", "H"],
      bars: [4, 4, 4, 4, 4, 4, 4, 4],
      eventKinds: ["texture", "kick", "snare", "hat", "bass", "chord", "melody"],
      melodyTrackCount: 2,
      audioProfile: "lofi_chill",
      lofiPreset: "lofi_koi_pond",
      lofiTexture: {
        enabled: true,
        vinylCrackle: 0.023,
        tapeHiss: 0.045,
        wowFlutter: 0.02,
        warmth: 0.1832,
        lowPassAge: 0.14,
        bitCrush: 0
      },
      drumKit: "lofi_tape_soft",
      bassTone: "rounded_triangle_bass",
      chordInstrument: "dusty_rhodes",
      melodyInstruments: ["tape_bell", "mellow_vibes"],
      hasSlide: true,
      hasTuplet: true
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

function makeGlassTankAfternoonProject() {
  const sections = {
    A: {
      progression: [0, 5, 1, 4],
      melodyA: [4, 7, 9, 11, 12, 11, 9, 7],
      melodyB: [11, 9, 7, 4, 2, 4, 7, 9],
      bass: [0, 0, 5, 5, 1, 1, 4, 4]
    },
    B: {
      progression: [1, 4, 0, 5],
      melodyA: [7, 9, 11, 14, 12, 11, 9, 7],
      melodyB: [2, 4, 7, 9, 11, 9, 7, 4],
      bass: [1, 1, 4, 4, 0, 0, 5, 5]
    },
    C: {
      progression: [5, 4, 1, 0],
      melodyA: [12, 11, 9, 7, 9, 11, 12, 14],
      melodyB: [7, 4, 2, 0, 2, 4, 7, 9],
      bass: [5, 5, 4, 4, 1, 1, 0, 0]
    },
    E: {
      progression: [0, 1, 5, 4],
      melodyA: [4, 7, 11, 12, 14, 12, 11, 7],
      melodyB: [0, 2, 4, 7, 9, 7, 4, 2],
      bass: [0, 0, 1, 1, 5, 5, 4, 4]
    },
    G: {
      progression: [4, 5, 0, 1],
      melodyA: [11, 12, 14, 16, 14, 12, 11, 9],
      melodyB: [4, 7, 9, 11, 9, 7, 4, 2],
      bass: [4, 4, 5, 5, 0, 0, 1, 1]
    },
    H: {
      progression: [0, 5, 4, 0],
      melodyA: [7, 9, 11, 12, 11, 9, 7, 4],
      melodyB: [12, 11, 9, 7, 4, 2, 0, 2],
      bass: [0, 0, 5, 5, 4, 4, 0, 0]
    }
  } as const;

  const patch: Record<string, unknown> = {
    format: "pocket-chordsmith-project-json",
    projectVersion: 16,
    schemaVersion: 16,
    bpm: 72,
    swing: 0.11,
    audioProfile: "lofi_chill",
    lofiPreset: "lofi_koi_pond",
    lofiTexture: {
      enabled: true,
      vinylCrackle: 0.023,
      tapeHiss: 0.045,
      wowFlutter: 0.02,
      warmth: 0.1832,
      lowPassAge: 0.14,
      bitCrush: 0
    },
    drumKit: "lofi_tape_soft",
    drumGroovePreset: "lofi_sparse_clicks",
    bassTone: "rounded_triangle_bass",
    chordInstrument: "dusty_rhodes",
    chordType: "seventh",
    chordPlayMode: "block",
    chordRhythmMode: "half",
    bassMode: "manual",
    humanizeOn: true,
    sidechainOn: true,
    sidechainAmount: 0.14,
    songSequence: ["A", "B", "A", "C", "E", "B", "G", "H"],
    defaultSceneIds: ["fish-tank", "koi-pond"],
    mixNotes: "Sparse tape-soft drums, rounded triangle bass, dusty Rhodes, tape bell and mellow vibes."
  };

  Object.entries(sections).forEach(([id, section], sectionIndex) => {
    patch[`progression${id}`] = section.progression;
    patch[`grid${id}`] = sparseLofiGrid(64, sectionIndex);
    patch[`gridTuplets${id}`] = sparseLofiTuplets(64, sectionIndex);
    patch[`bassNotes${id}`] = lofiBassLine(64, section.bass);
    patch[`bassHold${id}`] = boolEvery(64, [1, 2, 9, 10, 17, 18, 25, 26, 33, 34, 41, 42, 49, 50, 57, 58]);
    patch[`bassSlide${id}`] = boolEvery(64, sectionIndex % 2 === 0 ? [3, 24] : [3, 40]);
    patch[`bassAccent${id}`] = boolEvery(64, [0, 16, 32, 48]);
    patch[`melodyTracks${id}`] = [
      lofiLeadLine(64, section.melodyA),
      repeatedPhrase(64, section.melodyB, 8, 4)
    ];
    patch[`melodyInstruments${id}`] = ["tape_bell", "mellow_vibes"];
    patch[`melodyOctaves${id}`] = [0, -1];
    patch[`melodyPan${id}`] = [-0.22, 0.24];
    patch[`melodyHold${id}`] = [boolEvery(64, [1, 2, 17, 33, 49]), boolEvery(64, [13, 29, 45, 61])];
    patch[`melodySlide${id}`] = [boolEvery(64, sectionIndex % 2 === 0 ? [3, 8] : [3, 24]), boolEvery(64, sectionIndex % 2 === 0 ? [36] : [52])];
    patch[`melodyTuplets${id}`] = [boolEvery(64, sectionIndex === 0 ? [32] : []), boolEvery(64, sectionIndex === 1 ? [16] : [])];
  });

  return makeProject("Glass Tank Afternoon", patch);
}

function sparseLofiGrid(steps: number, variant: number) {
  const grid = emptyGrid(steps);
  for (let step = 0; step < steps; step += 8) grid.hat[step] = variant % 2 === 0 ? 1 : 2;
  for (let step = 0; step < steps; step += 16) {
    grid.kick[step] = 2;
    grid.bass[step] = 1;
  }
  [12, 28, 44, 60].forEach((step) => {
    grid.snare[step] = 1;
  });
  if (variant % 2 === 1) grid.kick[24] = 1;
  return grid;
}

function sparseLofiTuplets(steps: number, variant: number) {
  const tuplets = emptyTuplets(steps);
  if (variant % 2 === 0) tuplets.hat[6] = true;
  if (variant % 3 === 0) tuplets.snare[46] = true;
  return tuplets;
}

function repeatedPhrase(steps: number, phrase: readonly number[], spacing: number, offset = 0) {
  const out = new Array<number | null>(steps).fill(null);
  phrase.forEach((note, index) => {
    const step = offset + index * spacing;
    if (step < steps) out[step] = note;
  });
  return out;
}

function lofiBassLine(steps: number, phrase: readonly number[]) {
  const out = repeatedPhrase(steps, phrase, 8);
  if (steps > 3) out[3] = phrase[1] ?? phrase[0] ?? 0;
  return out;
}

function lofiLeadLine(steps: number, phrase: readonly number[]) {
  const out = repeatedPhrase(steps, phrase, 8);
  if (steps > 3) out[3] = phrase[1] ?? phrase[0] ?? 0;
  return out;
}

function boolEvery(steps: number, enabledSteps: number[]) {
  return boolArray(steps, enabledSteps.filter((step) => step < steps));
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
