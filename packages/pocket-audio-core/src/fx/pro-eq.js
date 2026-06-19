export const POCKET_PRO_EQ_TYPE = "parametric-eq";

export const POCKET_PRO_EQ_BANDS = Object.freeze([
  Object.freeze({
    id: "hp",
    label: "High Pass",
    nodeType: "highpass",
    frequencyParam: "hpFrequency",
    qParam: "hpQ",
    enabledParam: "hpEnabled",
    defaultEnabled: false,
    defaultFrequency: 35,
    minFrequency: 20,
    maxFrequency: 1000,
    defaultQ: 0.7,
    minQ: 0.1,
    maxQ: 4
  }),
  Object.freeze({
    id: "lowShelf",
    label: "Low Shelf",
    nodeType: "lowshelf",
    frequencyParam: "lowShelfFrequency",
    gainParam: "lowShelfGain",
    enabledParam: "lowShelfEnabled",
    defaultEnabled: true,
    defaultFrequency: 120,
    minFrequency: 40,
    maxFrequency: 500,
    defaultGain: 0,
    minGain: -12,
    maxGain: 12
  }),
  Object.freeze({
    id: "lowMid",
    label: "Low Mid",
    nodeType: "peaking",
    frequencyParam: "lowMidFrequency",
    gainParam: "lowMidGain",
    qParam: "lowMidQ",
    enabledParam: "lowMidEnabled",
    defaultEnabled: true,
    defaultFrequency: 420,
    minFrequency: 120,
    maxFrequency: 2200,
    defaultGain: 0,
    minGain: -12,
    maxGain: 12,
    defaultQ: 1,
    minQ: 0.2,
    maxQ: 8
  }),
  Object.freeze({
    id: "highMid",
    label: "High Mid",
    nodeType: "peaking",
    frequencyParam: "highMidFrequency",
    gainParam: "highMidGain",
    qParam: "highMidQ",
    enabledParam: "highMidEnabled",
    defaultEnabled: true,
    defaultFrequency: 2400,
    minFrequency: 700,
    maxFrequency: 8000,
    defaultGain: 0,
    minGain: -12,
    maxGain: 12,
    defaultQ: 1,
    minQ: 0.2,
    maxQ: 8
  }),
  Object.freeze({
    id: "highShelf",
    label: "High Shelf",
    nodeType: "highshelf",
    frequencyParam: "highShelfFrequency",
    gainParam: "highShelfGain",
    enabledParam: "highShelfEnabled",
    defaultEnabled: true,
    defaultFrequency: 8200,
    minFrequency: 2200,
    maxFrequency: 18000,
    defaultGain: 0,
    minGain: -12,
    maxGain: 12
  }),
  Object.freeze({
    id: "lp",
    label: "Low Pass",
    nodeType: "lowpass",
    frequencyParam: "lpFrequency",
    qParam: "lpQ",
    enabledParam: "lpEnabled",
    defaultEnabled: false,
    defaultFrequency: 16000,
    minFrequency: 1200,
    maxFrequency: 20000,
    defaultQ: 0.7,
    minQ: 0.1,
    maxQ: 4
  })
]);

export const POCKET_PRO_EQ_DEFAULT_PARAMETERS = Object.freeze(defaultPocketProEqParameters());

export const POCKET_PRO_EQ_PRESETS = Object.freeze([
  Object.freeze({
    id: "flat",
    name: "Flat",
    parameters: POCKET_PRO_EQ_DEFAULT_PARAMETERS
  }),
  Object.freeze({
    id: "lofi-soft-rolloff",
    name: "Lofi Soft Rolloff",
    parameters: Object.freeze({
      ...defaultPocketProEqParameters(),
      hpEnabled: true,
      hpFrequency: 38,
      lowShelfGain: -1.5,
      lowMidGain: 1.2,
      highShelfGain: -2.8,
      lpEnabled: true,
      lpFrequency: 11800
    })
  }),
  Object.freeze({
    id: "vocal-cleanup",
    name: "Vocal Cleanup",
    parameters: Object.freeze({
      ...defaultPocketProEqParameters(),
      hpEnabled: true,
      hpFrequency: 95,
      lowMidGain: -2.2,
      lowMidFrequency: 360,
      lowMidQ: 1.2,
      highMidGain: 1.4,
      highMidFrequency: 3200,
      highMidQ: 0.9,
      highShelfGain: 1.1
    })
  }),
  Object.freeze({
    id: "drum-punch",
    name: "Drum Punch",
    parameters: Object.freeze({
      ...defaultPocketProEqParameters(),
      lowShelfGain: 1.8,
      lowShelfFrequency: 90,
      lowMidGain: -1.6,
      lowMidFrequency: 520,
      highMidGain: 1.8,
      highMidFrequency: 4200,
      highShelfGain: 1
    })
  }),
  Object.freeze({
    id: "lofi-drum-softener",
    name: "Lofi Drum Softener",
    parameters: Object.freeze({
      ...defaultPocketProEqParameters(),
      hpEnabled: true,
      hpFrequency: 42,
      lowShelfGain: 0.8,
      lowShelfFrequency: 95,
      lowMidGain: -1.1,
      lowMidFrequency: 480,
      highMidGain: -1.4,
      highMidFrequency: 3600,
      highShelfGain: -2.2,
      lpEnabled: true,
      lpFrequency: 12400
    })
  }),
  Object.freeze({
    id: "warm-bass-pocket",
    name: "Warm Bass Pocket",
    parameters: Object.freeze({
      ...defaultPocketProEqParameters(),
      hpEnabled: true,
      hpFrequency: 28,
      lowShelfGain: 1.2,
      lowShelfFrequency: 82,
      lowMidGain: -1.4,
      lowMidFrequency: 320,
      lowMidQ: 1.2,
      highMidGain: -1.8,
      highMidFrequency: 2200,
      highShelfGain: -1.5
    })
  }),
  Object.freeze({
    id: "soft-chord-bed",
    name: "Soft Chord Bed",
    parameters: Object.freeze({
      ...defaultPocketProEqParameters(),
      hpEnabled: true,
      hpFrequency: 72,
      lowShelfGain: -1.2,
      lowMidGain: -1.8,
      lowMidFrequency: 520,
      lowMidQ: 1.3,
      highMidGain: 0.8,
      highMidFrequency: 2400,
      highShelfGain: -2.4,
      lpEnabled: true,
      lpFrequency: 13200
    })
  }),
  Object.freeze({
    id: "gentle-lead-presence",
    name: "Gentle Lead Presence",
    parameters: Object.freeze({
      ...defaultPocketProEqParameters(),
      hpEnabled: true,
      hpFrequency: 110,
      lowMidGain: -1.4,
      lowMidFrequency: 430,
      highMidGain: 1.3,
      highMidFrequency: 2900,
      highMidQ: 0.85,
      highShelfGain: 0.6,
      lpEnabled: true,
      lpFrequency: 15600
    })
  })
]);

export function defaultPocketProEqParameters() {
  const out = {};
  for (const band of POCKET_PRO_EQ_BANDS) {
    out[band.enabledParam] = band.defaultEnabled;
    out[band.frequencyParam] = band.defaultFrequency;
    if (band.gainParam) out[band.gainParam] = band.defaultGain;
    if (band.qParam) out[band.qParam] = band.defaultQ;
  }
  return out;
}

export function getPocketProEqPreset(id = "flat") {
  return POCKET_PRO_EQ_PRESETS.find((preset) => preset.id === id) || POCKET_PRO_EQ_PRESETS[0];
}

export function pocketProEqPresetParameters(id = "flat") {
  return { ...getPocketProEqPreset(id).parameters };
}
