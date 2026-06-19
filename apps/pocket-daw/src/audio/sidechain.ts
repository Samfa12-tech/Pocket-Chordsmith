import type { PocketDawProject } from "../daw/schema";
import type { RenderedEvent } from "./eventRenderer";
import { CHORDSMITH_SIDECHAIN_ATTACK_SECONDS, CHORDSMITH_SIDECHAIN_RELEASE_SECONDS, chordsmithSidechainDuckGain } from "../../../../packages/pocket-audio-core/src/fx/sidechain.js";

export interface ChordsmithSidechainSettings {
  enabled: boolean;
  amount: number;
  targetTrackId: string;
}

export function chordsmithSidechainSettings(project: PocketDawProject): ChordsmithSidechainSettings | null {
  const ref = project.sourceRefs.find((item) => item.sourceType === "pocket-chordsmith" && item.normalized);
  const normalized = ref?.normalized as Record<string, unknown> | undefined;
  if (!normalized?.sidechainOn) return null;
  const amount = clamp(Number(normalized.sidechainAmount ?? 0.45), 0, 1);
  return {
    enabled: true,
    amount,
    targetTrackId: "chords"
  };
}

export function isChordsmithSidechainTrigger(event: RenderedEvent): boolean {
  return event.role === "drums" && event.kind === "kick";
}

export function scheduleChordsmithSidechainDuck(param: AudioParam, start: number, amount: number) {
  const safeStart = Math.max(0, Number(start) || 0);
  const duck = chordsmithSidechainDuckGain(amount, 1);
  param.cancelScheduledValues(safeStart);
  param.setValueAtTime(1, safeStart);
  param.linearRampToValueAtTime(duck, safeStart + CHORDSMITH_SIDECHAIN_ATTACK_SECONDS);
  param.exponentialRampToValueAtTime(1, safeStart + CHORDSMITH_SIDECHAIN_RELEASE_SECONDS);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
