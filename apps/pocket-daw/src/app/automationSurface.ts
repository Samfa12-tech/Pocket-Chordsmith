import type { AudioProjectSyncMode } from "../audio/audioEngine";

export interface AutomationSurfaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function automationSurfacePointFromClient(
  rect: AutomationSurfaceRect,
  minBar: number,
  maxBar: number,
  minValue: number,
  maxValue: number,
  clientX: number,
  clientY: number
): { bar: number; value: number } {
  const x = rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0;
  const y = rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0;
  return {
    bar: roundAutomationSurfaceValue(minBar + x * Math.max(0.001, maxBar - minBar), 3),
    value: roundAutomationSurfaceValue(maxValue - y * Math.max(0.001, maxValue - minValue), 3)
  };
}

export function automationSurfaceAudioSyncMode(targetPath: string | null | undefined): AudioProjectSyncMode {
  return targetPath?.startsWith("fx.") ? "mixer-graph" : "composition-events";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundAutomationSurfaceValue(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** Math.max(0, places);
  return Math.round(value * scale) / scale;
}
