export const BASS_PRESETS = Object.freeze([
  { id: "copy_kick", label: "Copy kick", tip: "Places bass roots on the section kick hits." },
  { id: "four_floor_roots", label: "Four floor", tip: "Root notes on every beat." },
  { id: "offbeat_pulse", label: "Offbeat pulse", tip: "Eighth-note offbeat root pulse." },
  { id: "funky_groove", label: "Funky groove", tip: "Syncopated roots, fifths and octave pops." },
  { id: "walking_octaves", label: "Walking octaves", tip: "Steady roots with fifth and octave movement." }
]);

export function findBassPreset(presetId) {
  return BASS_PRESETS.find((preset) => preset.id === presetId) || null;
}

export function bassPresetLabel(preset) {
  return preset?.label || String(preset?.id || "Bass preset").replace(/_/g, " ");
}

export function bassPresetVisibleForProject(preset) {
  return !!preset;
}

export function visibleBassPresetsForProject() {
  return BASS_PRESETS.slice();
}

export function bassPresetPatternForProject(presetId, pcs, section) {
  const preset = findBassPreset(presetId) || findBassPreset("copy_kick");
  const timeSig = safePositiveInt(pcs?.timeSig, 4);
  const resolution = safePositiveInt(pcs?.resolution, 4);
  const bars = safePositiveInt(section?.bars, 4);
  const stepCount = Math.max(1, bars * timeSig * resolution);
  const barSteps = Math.max(1, timeSig * resolution);
  const beat = Math.max(1, resolution);
  const eighth = Math.max(1, Math.round(resolution / 2));
  const sixteenth = Math.max(1, Math.round(resolution / 4));
  const notes = new Array(stepCount).fill(null);
  const accent = new Array(stepCount).fill(false);
  const hold = new Array(stepCount).fill(false);
  const slide = new Array(stepCount).fill(false);
  const tuplets = new Array(stepCount).fill(false);

  const place = (step, note = 0, isAccent = false) => {
    if (step < 0 || step >= stepCount) return;
    notes[step] = clampBassNote(note);
    accent[step] = accent[step] || !!isAccent;
  };

  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * barSteps;
    if (preset.id === "copy_kick") {
      for (let pos = 0; pos < barSteps; pos += 1) {
        const step = barStart + pos;
        const level = Number(section?.grid?.kick?.[step] || 0);
        if (level > 0) place(step, 0, level > 1 || pos === 0);
      }
    } else if (preset.id === "four_floor_roots") {
      for (let beatIndex = 0; beatIndex < timeSig; beatIndex += 1) {
        place(barStart + beatIndex * beat, 0, beatIndex === 0);
      }
    } else if (preset.id === "offbeat_pulse") {
      for (let beatIndex = 0; beatIndex < timeSig; beatIndex += 1) {
        place(barStart + beatIndex * beat + eighth, beatIndex % 2 ? 4 : 0, beatIndex === 1);
      }
    } else if (preset.id === "funky_groove") {
      place(barStart, 0, true);
      place(barStart + beat + eighth, 4, false);
      place(barStart + beat * 2, 0, true);
      place(barStart + beat * 2 + eighth, 7, false);
      place(barStart + beat * 3 - sixteenth, 11, false);
      place(barStart + beat * 3 + eighth, 7, false);
    } else if (preset.id === "walking_octaves") {
      for (let beatIndex = 0; beatIndex < timeSig; beatIndex += 1) {
        const cycle = [0, 4, 7, 11][beatIndex % 4];
        place(barStart + beatIndex * beat, cycle, beatIndex === 0);
        if (eighth < beat) place(barStart + beatIndex * beat + eighth, beatIndex % 2 ? 4 : 7, false);
      }
    }
  }

  return { preset, notes, accent, hold, slide, tuplets };
}

function clampBassNote(value) {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return 0;
  return Math.max(0, Math.min(13, rounded));
}

function safePositiveInt(value, fallback) {
  const rounded = Math.round(Number(value));
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
}
