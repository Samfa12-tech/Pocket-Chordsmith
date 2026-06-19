import { DEFAULT_MASTER_VOLUME, DEFAULT_STEM_MIX, STEM_IDS } from "../constants.js";

export function createMixerState(overrides = {}) {
  const stems = JSON.parse(JSON.stringify(DEFAULT_STEM_MIX));
  STEM_IDS.forEach((id) => {
    stems[id] = { ...stems[id], ...(overrides.stems?.[id] || {}) };
  });
  return {
    masterVolume: overrides.masterVolume ?? DEFAULT_MASTER_VOLUME,
    stems,
    fx: overrides.fx || {}
  };
}

export function setStemValue(mixer, stem, patch) {
  if (!mixer?.stems?.[stem]) throw new Error(`Unknown stem: ${stem}`);
  mixer.stems[stem] = { ...mixer.stems[stem], ...patch };
  return mixer;
}
