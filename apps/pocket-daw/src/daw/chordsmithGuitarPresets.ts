import {
  GUITAR_PRESETS as CORE_GUITAR_PRESETS,
  findGuitarPreset as coreFindGuitarPreset,
  guitarPresetLabel as coreGuitarPresetLabel,
  guitarPresetPatternForProject as coreGuitarPresetPatternForProject,
  guitarPresetVisibleForProject as coreGuitarPresetVisibleForProject,
  visibleGuitarPresetsForProject as coreVisibleGuitarPresetsForProject
} from "../../../../packages/pocket-audio-core/src/patterns/guitar-presets.js";
import type { SanitizedPcsProject, SanitizedPcsSection } from "../compatibility/pcsSanitizer";

export interface GuitarPreset {
  id: string;
  label: string;
  tip: string;
}

export const GUITAR_PRESETS = CORE_GUITAR_PRESETS as GuitarPreset[];

export function guitarPresetVisibleForProject(preset: GuitarPreset, pcs: Pick<SanitizedPcsProject, "timeSig">): boolean {
  void pcs;
  return coreGuitarPresetVisibleForProject(preset);
}

export function visibleGuitarPresetsForProject(pcs: Pick<SanitizedPcsProject, "timeSig">): GuitarPreset[] {
  void pcs;
  return coreVisibleGuitarPresetsForProject() as GuitarPreset[];
}

export function guitarPresetLabel(preset: GuitarPreset): string {
  return coreGuitarPresetLabel(preset);
}

export function findGuitarPreset(presetId: string): GuitarPreset | null {
  return coreFindGuitarPreset(presetId) as GuitarPreset | null;
}

export function guitarPresetPatternForProject(
  presetId: string,
  pcs: Pick<SanitizedPcsProject, "timeSig" | "resolution">,
  section: Pick<SanitizedPcsSection, "bars">
): { preset: GuitarPreset; pattern: string[] } {
  return coreGuitarPresetPatternForProject(presetId, pcs, section) as { preset: GuitarPreset; pattern: string[] };
}
