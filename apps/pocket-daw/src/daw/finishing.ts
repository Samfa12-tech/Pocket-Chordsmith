import type { PocketDawProject } from "./schema";
import { cloneProject } from "./dawProject";
import { addFxSlot, setFxSlotParameter } from "./fx";
import { setTrackVolume } from "./mixer";

export type FinishPresetId = "original" | "tidy" | "glue" | "bypass" | "track_quieter";
const FINISH_PREFIX = "pocket-finish:";

export const FINISH_PRESETS = [
  { id: "track_quieter", name: "Selected track −3 dB", cue: "Listen for this track leaving room for the rest of the arrangement. The full mix is monitor-matched; a solo track can therefore sound unchanged. Select a non-master track first.", effects: [] },
  { id: "original", name: "Original mix", cue: "Your current mix, with no proposed changes.", effects: [] },
  { id: "tidy", name: "Low-end tidy", cue: "Listen for less rumble below 30 Hz. Other master effects stay in place.", effects: [{ type: "high-pass", parameters: { frequency: 30, q: 0.7 } }] },
  { id: "glue", name: "Gentle glue", cue: "Listen for softer level jumps: 25 Hz cleanup and gentle 1.3:1 compression. No loudness boost or limiter is added.", effects: [{ type: "high-pass", parameters: { frequency: 25, q: 0.7 } }, { type: "compressor", parameters: { threshold: -18, ratio: 1.3, attack: 0.025, release: 0.18 } }] },
  { id: "bypass", name: "Bypass Finish effects", cue: "Remove only effects previously applied by Finish. Keep the rest of your mix.", effects: [] }
] as const;

export function projectWithFinishPreset(project: PocketDawProject, id: FinishPresetId, trackId?: string): PocketDawProject {
  if (id === "original") return project;
  if (id === "track_quieter") {
    const track = project.tracks.find(item => item.id === trackId);
    if (!track || track.trackType === "master" || !(track.volume > 0)) throw new Error("Select an audible non-master track for the −3 dB proposal.");
    return setTrackVolume(project, track.id, track.volume * 10 ** (-3 / 20));
  }
  const preset = FINISH_PRESETS.find(item => item.id === id);
  if (!preset) throw new Error("Choose a supported Finish starting preset.");
  const master = project.tracks.find(track => track.trackType === "master");
  if (!master) throw new Error("Finish needs the project's existing Master track.");
  let next = cloneProject(project);
  const chain = next.fx.chains.find(item => item.ownerTrackId === master.id);
  if (chain) {
    const removed = chain.slots.filter(slot => slot.presetId?.startsWith(FINISH_PREFIX));
    chain.slots = chain.slots.filter(slot => !slot.presetId?.startsWith(FINISH_PREFIX));
    // User-authored automation for a removed Finish slot cannot follow a new
    // proposal through a reused slot ID. Undo restores slots and lanes together.
    next.automation.lanes = next.automation.lanes.filter(lane => !removed.some(slot => lane.targetPath.startsWith(`fx.${chain.id}.slots.${slot.id}.parameters.`)));
  }
  for (const effect of preset.effects) {
    next = addFxSlot(next, master.id, effect.type);
    const addedChain = next.fx.chains.find(item => item.ownerTrackId === master.id)!;
    const slot = addedChain.slots.at(-1)!;
    slot.presetId = FINISH_PREFIX + id;
    for (const [parameter, value] of Object.entries(effect.parameters)) next = setFxSlotParameter(next, addedChain.id, slot.id, parameter, value);
  }
  return next;
}

export interface FinishAudioMeasurements {
  integratedLufs: number | null;
  truePeakDbtp: number | null;
  nonFiniteSamples: number;
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
}

/** Attenuation is confined to monitoring; callers never put it in a project. */
export function finishMonitorGains(a: FinishAudioMeasurements, b: FinishAudioMeasurements) {
  if (a.nonFiniteSamples || b.nonFiniteSamples) throw new Error("Preview contains non-finite audio. Fix the source or effects before comparing.");
  if (a.sampleRate !== b.sampleRate || !Number.isInteger(a.sampleRate) || a.sampleRate <= 0 || a.channelCount !== b.channelCount || ![1, 2].includes(a.channelCount)) throw new Error("Compare needs the same sample rate and channel path for both versions.");
  if (!Number.isFinite(a.durationSeconds) || !Number.isFinite(b.durationSeconds) || a.durationSeconds <= 0 || b.durationSeconds <= 0 || Math.abs(a.durationSeconds - b.durationSeconds) > 1 / a.sampleRate + 0.000001) throw new Error("Compare measurements must cover the same passage and tail.");
  if (!Number.isFinite(a.integratedLufs) || !Number.isFinite(b.integratedLufs)) throw new Error("Loudness matching is unavailable for silence or audio shorter than 400 ms. Use a longer audible passage.");
  if (a.truePeakDbtp === null || b.truePeakDbtp === null || !Number.isFinite(a.truePeakDbtp) || !Number.isFinite(b.truePeakDbtp)) throw new Error("Compare needs valid measured peaks for both audible versions.");
  const target = Math.min(a.integratedLufs!, b.integratedLufs!);
  let aDb = target - a.integratedLufs!;
  let bDb = target - b.integratedLufs!;
  const peaks = [a.truePeakDbtp === null ? null : a.truePeakDbtp + aDb, b.truePeakDbtp === null ? null : b.truePeakDbtp + bDb].filter((value): value is number => Number.isFinite(value));
  const headroomDb = peaks.length ? Math.min(0, -1 - Math.max(...peaks)) : 0;
  aDb += headroomDb;
  bDb += headroomDb;
  return { aGain: 10 ** (aDb / 20), bGain: 10 ** (bDb / 20), aDb, bDb, headroomDb, targetLufs: target + headroomDb, status: "matched-estimate" as const };
}
