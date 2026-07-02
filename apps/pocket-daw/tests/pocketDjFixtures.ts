import { createDemoChordsmithProject } from "../src/demo/demoProject";

export function createPocketDjImportFixture() {
  const source = {
    ...createDemoChordsmithProject(),
    title: "DJ Source Tune",
    bpm: 132,
    audioProfile: "lofi_chill",
    lofiPreset: "lofi_rainy_window"
  };
  return {
    app: "PocketDJ",
    djVersion: 1,
    source: {
      app: "PocketChordsmith",
      sourcePrefix: "PCS1",
      projectVersion: 16,
      sourceTitle: "DJ Source Tune",
      project: source
    },
    deck: {
      name: "Late Night Deck",
      bpm: 132,
      key: "C",
      scale: "minor",
      audioProfile: "lofi_chill",
      lofiPreset: "lofi_rainy_window"
    },
    sections: {
      A: { active: true, bars: 4 },
      B: { active: true, bars: 4 },
      D: { active: true, bars: 8 }
    },
    performance: {
      currentSection: "B",
      queuedSection: "D",
      launchQuantize: "bar",
      dropTarget: "D",
      loopCurrentSection: true,
      sequence: ["A", "B", "D"],
      sequencePlaying: true,
      sequenceRepeat: true,
      sequenceIndex: 1,
      buildActive: true,
      masterVolume: 0.72,
      stemVolumes: { drums: 0.42, bass: 0.8, chords: 0.66, melody: 0.55, guitar: 0.2 },
      stemMutes: { drums: false, bass: false, chords: false, melody: true, guitar: false },
      fx: { filter: 0.31, echo: 0.12, chorus: 0.1, flanger: 0.04, reverb: 0.44, mix: 0.52 }
    }
  };
}
