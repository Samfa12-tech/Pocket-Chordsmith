import { DEFAULT_STEM_MIX, STEM_IDS } from "../constants.js";

export function createMixerState(overrides = {}) {
  const stems = JSON.parse(JSON.stringify(DEFAULT_STEM_MIX));
  STEM_IDS.forEach((id) => {
    stems[id] = { ...stems[id], ...(overrides.stems?.[id] || {}) };
  });
  return {
    masterVolume: overrides.masterVolume ?? 0.82,
    stems,
    fx: overrides.fx || {}
  };
}

export function setStemValue(mixer, stem, patch) {
  if (!mixer?.stems?.[stem]) throw new Error(`Unknown stem: ${stem}`);
  mixer.stems[stem] = { ...mixer.stems[stem], ...patch };
  return mixer;
}
