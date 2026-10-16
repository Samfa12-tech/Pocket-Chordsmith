import { analyseAudioChannels } from "../../../../packages/pocket-audio-core/src/export/audio-metrics.js";
import { decodePcmWavBytes } from "../../../../packages/pocket-audio-core/src/export/wav.js";

export interface FinishAnalysisRange { startSeconds: number; endSeconds: number }
export type FinishMeasurements = ReturnType<typeof analyseAudioChannels>;
export const MAX_DELIVERY_ANALYSIS_BYTES = 128 * 1024 * 1024;
export interface DeliveryAnalysis {
  measurements: FinishMeasurements;
  bitDepth: number;
  frameCount: number;
  byteLength: number;
  byteSha256: string | null;
}

/** Measures the complete final WAV, after channel/depth/dither/normalization. */
export function analyseDeliveryWav(buffer: ArrayBuffer): DeliveryAnalysis {
  if (buffer.byteLength < 44 || buffer.byteLength > MAX_DELIVERY_ANALYSIS_BYTES) throw new Error("WAV check supports files up to 128 MiB.");
  const decoded = decodePcmWavBytes(new Uint8Array(buffer));
  if (![1, 2].includes(decoded.channels.length) || decoded.sampleRate < 8000 || decoded.sampleRate > 192000 || decoded.duration <= 0 || decoded.duration > 600) throw new Error("WAV check supports mono/stereo, 8–192 kHz and up to 600 seconds.");
  return { measurements: analyseAudioChannels(decoded), bitDepth: decoded.bitDepth, frameCount: decoded.channels[0].length, byteLength: buffer.byteLength, byteSha256: null };
}

/** Decode the canonical float WAV written by our native preview renderer only. */
export function analyseFinishWav(buffer: ArrayBuffer, range: FinishAnalysisRange): FinishMeasurements {
  if (buffer.byteLength < 44 || buffer.byteLength > 128 * 1024 * 1024) throw new Error("Finish preview WAV is missing or exceeds 128 MiB.");
  const view = new DataView(buffer);
  const ascii = (at: number, text: string) => [...text].every((character, index) => view.getUint8(at + index) === character.charCodeAt(0));
  const channels = view.getUint16(22, true), rate = view.getUint32(24, true), dataSize = view.getUint32(40, true);
  if (!ascii(0, "RIFF") || !ascii(8, "WAVE") || !ascii(12, "fmt ") || !ascii(36, "data") || view.getUint32(16, true) !== 16
    || view.getUint32(4, true) + 8 !== buffer.byteLength || dataSize + 44 !== buffer.byteLength
    || view.getUint16(20, true) !== 3 || view.getUint16(34, true) !== 32 || ![1, 2].includes(channels)
    || rate < 8000 || rate > 192000 || view.getUint16(32, true) !== channels * 4 || view.getUint32(28, true) !== rate * channels * 4
    || dataSize % (channels * 4)) throw new Error("Finish needs the exact native float32 preview WAV.");
  const frames = dataSize / (channels * 4);
  if (!Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds) || range.startSeconds < 0 || range.endSeconds <= range.startSeconds || range.endSeconds > frames / rate + 1 / rate) throw new Error("Finish analysis passage is outside the rendered WAV.");
  const start = Math.round(range.startSeconds * rate), end = Math.min(frames, Math.round(range.endSeconds * rate));
  if (end <= start) throw new Error("Finish analysis needs at least one audio frame.");
  const decoded = Array.from({ length: channels }, (_, channel) => Float32Array.from({ length: end - start }, (_, frame) => view.getFloat32(44 + ((start + frame) * channels + channel) * 4, true)));
  return analyseAudioChannels({ channels: decoded, sampleRate: rate, duration: (end - start) / rate });
}

export function finishAudioWarnings(measurements: FinishMeasurements): string[] {
  const warnings: string[] = [];
  if (measurements.nonFiniteSamples) warnings.push("Non-finite samples: fix source audio or effects before export.");
  if (measurements.clippedSamples) warnings.push(`${measurements.clippedSamples} samples reach full scale; check the source and master processing.`);
  if (measurements.truePeakDbtp !== null && measurements.truePeakDbtp > -1) warnings.push("Estimated true peak exceeds -1 dBTP; allow headroom for encoded delivery.");
  if (Math.max(Math.abs(measurements.dcOffsetL), Math.abs(measurements.dcOffsetR)) > 0.01) warnings.push("Measured DC offset exceeds 1%; inspect the source or effects.");
  if (measurements.stereoCorrelation < -0.2) warnings.push("Negative stereo correlation: check the mix in mono for cancellation.");
  if (measurements.integratedLufs === null) warnings.push("No usable integrated loudness reading: choose a longer audible passage.");
  return warnings;
}
