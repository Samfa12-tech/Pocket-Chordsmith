import { POCKET_GUITAR_ARTICULATIONS, POCKET_GUITAR_PATTERN_PRESETS } from "../sounds/guitar.js";

export const GUITAR_PRESETS = Object.freeze([
  { id: "rock_eighths", label: "Rock 8ths", tip: "Eighth-note rock strums with accents on bar starts." },
  { id: "punk_downstrokes", label: "Punk", tip: "Tight palm-muted downstrokes with beat accents." },
  { id: "metal_chug", label: "Metal chug", tip: "Fast chug rhythm with accents on each beat." },
  { id: "gallop", label: "Gallop", tip: "Three-note metal gallop grouped across sixteenth subdivisions." },
  { id: "doom_slow", label: "Doom", tip: "Slow sustained power chords on strong beats." },
  { id: "verse_chorus", label: "Verse/chorus", tip: "Open verse strums followed by a tighter chug section." },
  { id: "boom_chick", label: "Boom-chick", tip: "Western boom-chick accents with percussive scratches." },
  { id: "train_chop", label: "Train chop", tip: "Driving chop pattern with alternating chugs and open strums." },
  { id: "western_waltz", label: "Western waltz", tip: "Waltz-friendly accent and scratch pattern." }
]);

export function findGuitarPreset(presetId) {
  return GUITAR_PRESETS.find((preset) => preset.id === presetId) || null;
}

export function guitarPresetLabel(preset) {
  return preset?.label || String(preset?.id || "Guitar preset").replace(/_/g, " ");
}

export function guitarPresetVisibleForProject(preset) {
  return !!preset;
}

export function visibleGuitarPresetsForProject() {
  return GUITAR_PRESETS.slice();
}

export function normalizeGuitarArticulation(value) {
  const safe = String(value || "off").toLowerCase();
  if (safe === "mute" || safe === "palm" || safe === "pm") return "chug";
  if (safe === "sustain") return "hold";
  if (safe === "dead" || safe === "dead_mute") return "scratch";
  return POCKET_GUITAR_ARTICULATIONS.includes(safe) ? safe : "off";
}

export function guitarPresetPatternForProject(presetId, pcs, section) {
  const preset = findGuitarPreset(presetId) || findGuitarPreset("metal_chug");
  const timeSig = safePositiveInt(pcs?.timeSig, 4);
  const resolution = safePositiveInt(pcs?.resolution, 4);
  const bars = safePositiveInt(section?.bars, 4);
  const stepCount = Math.max(1, bars * timeSig * resolution);
  const pattern = new Array(stepCount).fill("off");
  const eighth = Math.max(1, Math.round(resolution / 2));
  const beat = Math.max(1, resolution);
  const barSteps = Math.max(1, timeSig * resolution);

  for (let step = 0; step < stepCount; step += 1) {
    const pos = step % barSteps;
    if (preset.id === "rock_eighths") {
      if (step % eighth === 0) pattern[step] = pos === 0 ? "accent" : "open";
    } else if (preset.id === "punk_downstrokes") {
      if (step % eighth === 0) pattern[step] = "chug";
      if (pos === 0 || pos === beat * 2) pattern[step] = "accent";
    } else if (preset.id === "metal_chug") {
      if (step % Math.max(1, Math.round(resolution / 4)) === 0) {
        pattern[step] = pos % beat === 0 ? "accent" : "chug";
      }
    } else if (preset.id === "gallop") {
      const unit = Math.max(1, Math.round(resolution / 4));
      const slot = Math.floor(pos / unit) % 4;
      if (slot === 0 || slot === 1 || slot === 3) pattern[step] = slot === 0 ? "accent" : "chug";
    } else if (preset.id === "doom_slow") {
      if (pos === 0 || pos === beat * 2) pattern[step] = "accent";
      else if (pos > 0) pattern[step] = "hold";
    } else if (preset.id === "verse_chorus") {
      const bar = Math.floor(step / barSteps);
      if (bar < 2) {
        if (step % beat === 0) pattern[step] = pos === 0 ? "accent" : "open";
        else if (pos % beat !== 0) pattern[step] = "hold";
      } else if (step % eighth === 0) {
        pattern[step] = pos === 0 || pos === beat * 2 ? "accent" : "chug";
      }
    } else if (preset.id === "boom_chick") {
      if (pos === 0 || pos === beat * 2) pattern[step] = "accent";
      else if (pos === beat || pos === beat * 3) pattern[step] = "scratch";
    } else if (preset.id === "train_chop") {
      const unit = Math.max(1, Math.round(resolution / 4));
      if (step % unit === 0) {
        const slot = Math.floor(pos / unit) % 4;
        pattern[step] = slot === 0 ? "accent" : slot === 2 ? "open" : "chug";
      }
    } else if (preset.id === "western_waltz") {
      if (pos === 0) pattern[step] = "accent";
      else if (pos === beat || pos === beat * 2) pattern[step] = "scratch";
    }
  }

  return { preset, pattern: pattern.map(normalizeGuitarArticulation) };
}

export function guitarPatternPresetIds() {
  return POCKET_GUITAR_PATTERN_PRESETS.slice();
}

function safePositiveInt(value, fallback) {
  const rounded = Math.round(Number(value));
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
}
