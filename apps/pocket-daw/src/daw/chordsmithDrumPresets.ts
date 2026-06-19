import {
  DRUM_PATTERN_DEFS as CORE_DRUM_PATTERN_DEFS,
  DRUM_PRESETS as CORE_DRUM_PRESETS,
  drumPresetEventsForProject as coreDrumPresetEventsForProject,
  drumPresetLabel as coreDrumPresetLabel,
  drumPresetVisibleForProject as coreDrumPresetVisibleForProject,
  findDrumPreset as coreFindDrumPreset,
  pos16ToStep as corePos16ToStep,
  shouldUsePresetEvent as coreShouldUsePresetEvent,
  visibleDrumPresetsForProject as coreVisibleDrumPresetsForProject
} from "../../../../packages/pocket-audio-core/src/patterns/drum-presets.js";
import type { SanitizedPcsProject } from "../compatibility/pcsSanitizer";

export type DrumPresetLane = "kick" | "snare" | "hat";

export interface DrumPreset {
  id: string;
  label: string;
  label3?: string;
  simple4: boolean;
  simple3: boolean;
  timeSigs: number[];
  tip: string;
}

export interface DrumPresetEvent {
  track: DrumPresetLane;
  pos16: number;
  level: number;
  minRes?: number;
  maxRes?: number;
}

export interface DrumPresetPattern {
  res1?: DrumPresetEvent[];
  res1Note?: string;
  res2?: DrumPresetEvent[];
  res2Note?: string;
  res4?: DrumPresetEvent[];
  res4Note?: string;
}

export const DRUM_PRESETS = CORE_DRUM_PRESETS as DrumPreset[];
export const DRUM_PATTERN_DEFS = CORE_DRUM_PATTERN_DEFS as Record<number, Record<string, DrumPresetPattern>>;

export function drumPresetVisibleForProject(preset: DrumPreset, pcs: Pick<SanitizedPcsProject, "timeSig">): boolean {
  return coreDrumPresetVisibleForProject(preset, pcs);
}

export function visibleDrumPresetsForProject(pcs: Pick<SanitizedPcsProject, "timeSig">): DrumPreset[] {
  return coreVisibleDrumPresetsForProject(pcs) as DrumPreset[];
}

export function drumPresetLabel(preset: DrumPreset, pcs: Pick<SanitizedPcsProject, "timeSig">): string {
  return coreDrumPresetLabel(preset, pcs);
}

export function findDrumPreset(presetId: string): DrumPreset | null {
  return coreFindDrumPreset(presetId) as DrumPreset | null;
}

export function drumPresetEventsForProject(
  presetId: string,
  pcs: Pick<SanitizedPcsProject, "timeSig" | "resolution">
): { events: DrumPresetEvent[]; note: string } {
  return coreDrumPresetEventsForProject(presetId, pcs) as { events: DrumPresetEvent[]; note: string };
}

export function shouldUsePresetEvent(event: DrumPresetEvent, resolution: number): boolean {
  return coreShouldUsePresetEvent(event, resolution);
}

export function pos16ToStep(bar: number, pos16: number, pcs: Pick<SanitizedPcsProject, "timeSig" | "resolution">, totalSteps: number): number {
  return corePos16ToStep(bar, pos16, pcs, totalSteps);
}
