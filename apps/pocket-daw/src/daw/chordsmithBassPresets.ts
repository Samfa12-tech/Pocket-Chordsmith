import {
  BASS_PRESETS as CORE_BASS_PRESETS,
  bassPresetLabel as coreBassPresetLabel,
  bassPresetPatternForProject as coreBassPresetPatternForProject,
  bassPresetVisibleForProject as coreBassPresetVisibleForProject,
  findBassPreset as coreFindBassPreset,
  visibleBassPresetsForProject as coreVisibleBassPresetsForProject
} from "../../../../packages/pocket-audio-core/src/patterns/bass-presets.js";
import type { SanitizedPcsProject, SanitizedPcsSection } from "../compatibility/pcsSanitizer";

export interface BassPreset {
  id: string;
  label: string;
  tip: string;
}

export interface BassPresetPattern {
  preset: BassPreset;
  notes: Array<number | null>;
  accent: boolean[];
  hold: boolean[];
  slide: boolean[];
  tuplets: boolean[];
}

export const BASS_PRESETS = CORE_BASS_PRESETS as BassPreset[];

export function bassPresetVisibleForProject(preset: BassPreset, pcs: Pick<SanitizedPcsProject, "timeSig">): boolean {
  void pcs;
  return coreBassPresetVisibleForProject(preset);
}

export function visibleBassPresetsForProject(pcs: Pick<SanitizedPcsProject, "timeSig">): BassPreset[] {
  void pcs;
  return coreVisibleBassPresetsForProject() as BassPreset[];
}

export function bassPresetLabel(preset: BassPreset): string {
  return coreBassPresetLabel(preset);
}

export function findBassPreset(presetId: string): BassPreset | null {
  return coreFindBassPreset(presetId) as BassPreset | null;
}

export function bassPresetPatternForProject(
  presetId: string,
  pcs: Pick<SanitizedPcsProject, "timeSig" | "resolution">,
  section: Pick<SanitizedPcsSection, "bars" | "grid">
): BassPresetPattern {
  return coreBassPresetPatternForProject(presetId, pcs, section) as BassPresetPattern;
}
