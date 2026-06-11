const baseGrid = () => ({
  kick: new Array(16).fill(0),
  snare: new Array(16).fill(0),
  hat: new Array(16).fill(0),
  bass: new Array(16).fill(0)
});

const project = (name, patch = {}) => ({
  projectVersion: 16,
  title: name,
  key: "C",
  scale: "major",
  bpm: 96,
  timeSig: 4,
  resolution: 4,
  swing: 0,
  songSequence: ["A"],
  sectionBars: { A: 1, B: 1, C: 1, D: 1 },
  progressionA: [0, 4, 5, 3],
  gridA: {
    ...baseGrid(),
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: new Array(16).fill(1),
    bass: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
  },
  ...patch
});

export const fixtures = [
  {
    name: "basic-4-4-major",
    description: "Basic 4/4 major progression, no swing.",
    project: project("Basic 4/4 Major")
  },
  {
    name: "three-four",
    description: "3/4 time signature.",
    project: project("Three Four", {
      timeSig: 3,
      gridA: {
        ...baseGrid(),
        kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
        snare: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
        hat: new Array(12).fill(1),
        bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
      }
    })
  },
  {
    name: "swing-groove",
    description: "Swing groove.",
    project: project("Swing Groove", {
      swing: 0.18,
      gridA: {
        ...baseGrid(),
        kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        hat: new Array(16).fill(1),
        bass: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0]
      }
    })
  },
  {
    name: "drum-tuplets",
    description: "Triplets/tuplets in drums.",
    project: project("Drum Tuplets", {
      gridA: {
        ...baseGrid(),
        kick: [1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0],
        snare: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        hat: new Array(16).fill(1),
        bass: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
      },
      gridTupletsA: {
        kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        snare: [false, false, false, false, true, false, false, false, false, false, false, false, false, false, false, false]
      }
    })
  },
  {
    name: "melody-holds",
    description: "Melody holds.",
    project: project("Melody Holds", {
      bpm: 72,
      melodyTracksA: [[0, null, null, 2, null, null, 4, null, null, null, 5, null, null, null, null, null]],
      melodyHoldA: [[false, true, true, false, true, false, false, true, true, false, false, true, true, true, false, false]]
    })
  },
  {
    name: "melody-slides",
    description: "Melody slides.",
    project: project("Melody Slides", {
      melodyTracksA: [[0, null, 3, null, 4, null, 6, null, 7, null, 5, null, 4, null, 2, null]],
      melodySlideA: [[false, false, true, false, false, false, true, false, false, false, true, false, false, false, false, false]]
    })
  },
  {
    name: "manual-bass",
    description: "Bass manual notes, holds, slides and accents.",
    project: project("Manual Bass", {
      bassMode: "manual",
      bassNotesA: [0, null, null, 4, null, null, 5, null, 7, null, null, 5, null, null, 4, null],
      bassHoldA: [false, true, false, false, true, false, false, true, false, true, false, false, false, false, false, false],
      bassSlideA: [false, false, true, false, false, true, false, false, true, false, false, false, false, false, false, false],
      bassAccentA: [true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, false]
    })
  },
  {
    name: "guitar-patterns",
    description: "Guitar enabled with at least two pattern styles.",
    project: project("Guitar Patterns", {
      guitarEnabled: true,
      guitarTone: "high_gain",
      guitarRegister: "low",
      guitarStrumMode: "alternate",
      guitarVolume: 0.72,
      guitarPatternA: ["open", "hold", "chug", "off", "accent", "hold", "scratch", "off", "open", "hold", "chug", "off", "accent", "hold", "scratch", "off"]
    })
  },
  {
    name: "multi-melody",
    description: "Multiple melody tracks with mute/solo/pan.",
    project: project("Multi Melody", {
      melodyTracksA: [
        [0, null, 2, null, 4, null, 5, null, 7, null, 5, null, 4, null, 2, null],
        [7, null, null, null, 5, null, null, null, 4, null, null, null, 2, null, null, null]
      ],
      melodyInstrumentsA: ["pulse", "bell"],
      melodyPanA: [-0.35, 0.35],
      melodyMuteA: [false, false],
      melodySoloA: [false, true]
    })
  },
  {
    name: "section-sequence",
    description: "Section sequence A-B-C-D-A.",
    project: project("Section Sequence", {
      songSequence: ["A", "B", "C", "D", "A"],
      progressionB: [5, 3, 4, 0],
      progressionC: [3, 0, 4, 5],
      progressionD: [4, 4, 5, 5],
      gridB: { ...baseGrid(), kick: [1, 0, 1, 0], snare: [0, 0, 1, 0], hat: [1, 1, 1, 1], bass: [1, 0, 1, 0] },
      gridC: { ...baseGrid(), kick: [1, 0, 0, 0], snare: [0, 1, 0, 1], hat: [1, 1, 1, 1], bass: [1, 0, 0, 1] },
      gridD: { ...baseGrid(), kick: [1, 1, 0, 0], snare: [0, 0, 1, 0], hat: [1, 1, 1, 1], bass: [1, 0, 1, 0] }
    })
  },
  {
    name: "build-drop-fx",
    description: "Build/drop/FX state fixture.",
    project: project("Build Drop FX", {
      fxDelay: 0.28,
      fxChorus: 0.22,
      fxFlanger: 0.11,
      fxReverb: 0.24,
      fxMix: 0.72,
      sidechainOn: true,
      sidechainAmount: 0.5
    })
  },
  {
    name: "legacy-minimal",
    description: "Legacy/minimal project with missing fields.",
    project: {
      schemaVersion: 1,
      key: "A",
      scale: "minor",
      bpm: 90,
      progressionA: [0, 3, 4, 6],
      gridA: { kick: [1], snare: [0], hat: [1], bass: [1] }
    }
  }
];
