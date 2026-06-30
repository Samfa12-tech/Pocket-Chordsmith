import type { PocketDawProject, Track } from "../daw/schema";
import { trackIsAudible } from "../daw/tracks";
import { barsToSeconds } from "../daw/timeline";
import { renderTimelineEvents } from "./eventRenderer";
import { audioBufferForRegionPlayback, audioRegionPlaybackWindow, renderTimelineAudioRegions, scheduleAudioRegionEnvelope } from "./audioRegions";
import { getCachedAudioBuffer } from "./audioBufferCache";
import { getTrackFxChain } from "../daw/fx";
import { DRUM_LANE_DEFS, generatedDrumBranchLane, getDrumLaneFxChain, isDrumEventKind } from "../daw/drumLanes";
import { connectFxChain } from "./fxProcessor";
import { scheduleInstrumentEvent } from "./instruments";
import { chordsmithSidechainSettings, isChordsmithSidechainTrigger, scheduleChordsmithSidechainDuck } from "./sidechain";
import { activeAutomationLaneCount, getAutomatedTrackControls } from "../daw/automation";
import { activeTrackSendRoutes } from "../daw/routing";
import {
  CHORDSMITH_LOFI_TEXTURE_OFFLINE,
  chordsmithLofiTextureOfflineCrackleWindow,
  chordsmithLofiTextureOfflineSample
} from "../../../../packages/pocket-audio-core/src/performance/lofi-texture.js";
import { CHORDSMITH_OFFLINE_STEM_GAIN } from "../../../../packages/pocket-audio-core/src/performance/stem-mix.js";

const CHORDSMITH_GENERATED_EXPORT_ROLES = new Set(["drums", "bass", "chords", "melody", "guitar"]);

export interface OfflineRenderOptions {
  channelMode?: WavChannelMode;
  includeChordsmithOfflineLofiTexture?: boolean;
  normalizePeak?: boolean;
}

export type WavChannelMode = "stereo" | "mono";
const WAV_PEAK_NORMALIZE_TARGET = 0.95;

export async function renderProjectToWavBlob(project: PocketDawProject, options: OfflineRenderOptions = {}): Promise<Blob> {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error("Offline WAV rendering is not supported in this browser.");
  const tailSeconds = Number(project.exportProfiles.find((p) => p.id === "full-song-wav")?.settings.tailSeconds ?? 1.2);
  const duration = barsToSeconds(project.timeline.bars, project.project.bpm, project.project.timeSig) + tailSeconds;
  const sampleRate = fullSongWavSampleRate(project);
  const ctx = new OfflineCtx(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.1;
  const masterTrack = project.tracks.find((track) => track.role === "master");
  const masterDestination = project.mixer.masterLimiter ? compressor : ctx.destination;
  connectFxChain(ctx, master, masterDestination, getTrackFxChain(project, masterTrack));
  if (project.mixer.masterLimiter) compressor.connect(ctx.destination);
  const offlineLofiTexture = options.includeChordsmithOfflineLofiTexture === false ? null : chordsmithOfflineLofiTextureForProject(project);
  if (offlineLofiTexture) scheduleChordsmithOfflineLofiTexture(ctx, master, duration, offlineLofiTexture);

  const inputs = new Map<string, GainNode>();
  const outputs = new Map<string, GainNode>();
  const sendGains = new Map<string, GainNode>();
  const sidechainOutputs = new Map<string, GainNode>();
  const panners = new Map<string, StereoPannerNode>();
  const drumLaneOutputs = new Map<string, GainNode>();
  const sidechain = chordsmithSidechainSettings(project);
  project.tracks.forEach((track) => {
    if (track.role === "master") {
      master.gain.value = track.volume;
      return;
    }
    const input = ctx.createGain();
    const gain = ctx.createGain();
    const duck = sidechain?.targetTrackId === track.id ? ctx.createGain() : null;
    const pan = "createStereoPanner" in ctx ? ctx.createStereoPanner() : null;
    const controls = getAutomatedTrackControls(project, track, 1);
    const audibleVolume = trackIsAudible(track, project.tracks) ? controls.volume : 0;
    gain.gain.value = chordsmithOfflineTrackExportGain(project, track, audibleVolume);
    if (duck) {
      duck.gain.value = 1;
      sidechainOutputs.set(track.id, duck);
    }
    if (pan) {
      pan.pan.value = controls.pan;
      panners.set(track.id, pan);
    }
    inputs.set(track.id, input);
    outputs.set(track.id, gain);
  });
  project.tracks.forEach((track) => {
    if (track.role === "master") return;
    const input = inputs.get(track.id);
    const gain = outputs.get(track.id);
    if (!input || !gain) return;
    const pan = panners.get(track.id);
    const destination = outputDestination(project, inputs, track, master);
    const duck = sidechainOutputs.get(track.id);
    const postFx = ctx.createGain();
    input.connect(gain);
    connectFxChain(ctx, gain, postFx, getTrackFxChain(project, track));
    if (duck) {
      postFx.connect(duck);
      duck.connect(pan || destination);
    } else {
      postFx.connect(pan || destination);
    }
    connectOfflineTrackSends(project, inputs, sendGains, input, duck || postFx, track);
    if (pan) pan.connect(destination);
  });
  const drumsOutput = inputs.get("drums");
  if (drumsOutput) {
    DRUM_LANE_DEFS.forEach((lane) => {
      const input = ctx.createGain();
      connectFxChain(ctx, input, drumsOutput, getDrumLaneFxChain(project, lane.id));
      drumLaneOutputs.set(lane.id, input);
    });
  }

  if (activeAutomationLaneCount(project)) {
    applyOfflineAutomation(project, outputs, panners, sendGains, duration);
  }

  const events = renderTimelineEvents(project);
  if (sidechain?.enabled) {
    const duck = sidechainOutputs.get(sidechain.targetTrackId);
    if (duck) {
      events.filter(isChordsmithSidechainTrigger).forEach((event) => {
        const track = project.tracks.find((item) => item.id === event.trackId) as Track | undefined;
        if (track && trackIsAudible(track, project.tracks)) scheduleChordsmithSidechainDuck(duck.gain, event.time + 0.001, sidechain.amount);
      });
    }
  }

  events.forEach((event) => {
    if (offlineLofiTexture && event.kind === "texture") return;
    const track = project.tracks.find((item) => item.id === event.trackId) as Track | undefined;
    if (!track || !trackIsAudible(track, project.tracks)) return;
    const output = inputs.get(event.trackId);
    if (output) scheduleInstrumentEvent(ctx, offlineEventDestination(project, event, output, drumLaneOutputs), event);
  });

  renderTimelineAudioRegions(project).audioRegions.forEach((region) => {
    const cached = getCachedAudioBuffer(region.mediaPoolItemId);
    const output = inputs.get(region.trackId);
    if (!cached || !output) return;
    const playbackWindow = audioRegionPlaybackWindow(region, cached.buffer.duration, 0);
    if (!playbackWindow) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = audioBufferForRegionPlayback(ctx, cached.buffer, region);
    source.connect(gain);
    gain.connect(output);
    scheduleAudioRegionEnvelope(gain.gain, region, region.startTimeSeconds, 0, playbackWindow.durationSeconds);
    source.start(region.startTimeSeconds, playbackWindow.sourceOffsetSeconds, playbackWindow.durationSeconds);
  });

  const rendered = await ctx.startRendering();
  return encodeWav(rendered, {
    channelMode: options.channelMode || fullSongWavChannelMode(project),
    normalizePeak: options.normalizePeak ?? fullSongWavPeakNormalize(project)
  });
}

export function fullSongWavSampleRate(project: PocketDawProject): number {
  const profileRate = Number(project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.sampleRate);
  if (Number.isFinite(profileRate) && profileRate >= 22050 && profileRate <= 192000) return Math.round(profileRate);
  return project.project.sampleRate || 44100;
}

export function fullSongWavChannelMode(project: PocketDawProject): WavChannelMode {
  const mode = project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings?.channelMode;
  return mode === "mono" ? "mono" : "stereo";
}

export function fullSongWavPeakNormalize(project: PocketDawProject): boolean {
  const normalize = project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings?.normalize;
  return normalize === true || normalize === "peak";
}

function offlineEventDestination(project: PocketDawProject, event: ReturnType<typeof renderTimelineEvents>[number], output: GainNode, drumLaneOutputs: Map<string, GainNode>): AudioNode {
  if (event.role === "drums" && isDrumEventKind(event.kind)) {
    const track = project.tracks.find((item) => item.id === event.trackId);
    if (generatedDrumBranchLane(track)) return output;
    return drumLaneOutputs.get(event.drumLane || event.kind) || output;
  }
  return output;
}

function connectOfflineTrackSends(project: PocketDawProject, inputs: Map<string, GainNode>, sendGains: Map<string, GainNode>, preFaderSource: AudioNode, postFaderSource: AudioNode, track: Track) {
  activeTrackSendRoutes(project, track, 1).forEach((send) => {
    const target = inputs.get(send.returnTrackId);
    const source = send.mode === "pre-fader" ? preFaderSource : postFaderSource;
    if (!target || target === source) return;
    const sendGain = source.context.createGain();
    sendGain.gain.value = send.level;
    source.connect(sendGain);
    sendGain.connect(target);
    sendGains.set(`${track.id}:${send.returnTrackId}`, sendGain);
  });
}

export function chordsmithOfflineLofiTextureForProject(project: PocketDawProject): Record<string, number | boolean> | null {
  for (const sourceRef of project.sourceRefs || []) {
    const normalized = sourceRef.normalized;
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) continue;
    const source = normalized as Record<string, unknown>;
    if (source.audioProfile !== "lofi_chill") continue;
    const texture = source.lofiTexture;
    if (!texture || typeof texture !== "object" || Array.isArray(texture)) continue;
    const record = texture as Record<string, unknown>;
    if (!record.enabled) continue;
    return {
      enabled: true,
      vinylCrackle: clamp01(record.vinylCrackle ?? 0.08),
      tapeHiss: clamp01(record.tapeHiss ?? 0.05),
      wowFlutter: clamp01(record.wowFlutter ?? 0.03),
      warmth: clamp01(record.warmth ?? 0.16),
      lowPassAge: clamp01(record.lowPassAge ?? 0.22),
      bitCrush: clamp01(record.bitCrush ?? 0.01)
    };
  }
  return null;
}

function scheduleChordsmithOfflineLofiTexture(ctx: OfflineAudioContext, destination: AudioNode, totalDuration: number, texture: Record<string, number | boolean>) {
  const hiss = Number(texture.tapeHiss) || 0;
  const crackle = Number(texture.vinylCrackle) || 0;
  if (hiss <= 0.005 && crackle <= 0.005) return;
  const length = Math.max(1, Math.ceil(totalDuration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const crackleWindow = chordsmithLofiTextureOfflineCrackleWindow(ctx.sampleRate);
  for (let index = 0; index < length; index += 1) {
    data[index] = chordsmithLofiTextureOfflineSample(index, texture, crackleWindow);
  }

  const source = ctx.createBufferSource();
  const highpass = ctx.createBiquadFilter();
  const lowpass = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(CHORDSMITH_LOFI_TEXTURE_OFFLINE.highpassHz, 0);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(
    CHORDSMITH_LOFI_TEXTURE_OFFLINE.lowpassBaseHz - Number(texture.lowPassAge) * CHORDSMITH_LOFI_TEXTURE_OFFLINE.lowpassAgeHz,
    0
  );
  gain.gain.setValueAtTime(
    CHORDSMITH_LOFI_TEXTURE_OFFLINE.warmthGainBase + Number(texture.warmth) * CHORDSMITH_LOFI_TEXTURE_OFFLINE.warmthGainRange,
    0
  );
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(destination);
  source.start(0);
  source.stop(totalDuration);
}

function applyOfflineAutomation(project: PocketDawProject, outputs: Map<string, GainNode>, panners: Map<string, StereoPannerNode>, sendGains: Map<string, GainNode>, duration: number) {
  const steps = Math.max(8, Math.ceil(duration / 0.125));
  for (let i = 0; i <= steps; i += 1) {
    const seconds = (duration * i) / steps;
    const bar = seconds / (60 / project.project.bpm * project.project.timeSig) + 1;
    project.tracks.forEach((track) => {
      if (track.role === "master") return;
      const output = outputs.get(track.id);
      if (!output) return;
      const controls = getAutomatedTrackControls(project, track, bar);
      const audibleVolume = trackIsAudible(track, project.tracks) ? controls.volume : 0;
      output.gain.setValueAtTime(chordsmithOfflineTrackExportGain(project, track, audibleVolume), seconds);
      const pan = panners.get(track.id);
      if (pan) pan.pan.setValueAtTime(controls.pan, seconds);
      activeTrackSendRoutes(project, track, bar).forEach((send) => {
        const sendGain = sendGains.get(`${track.id}:${send.returnTrackId}`);
        if (sendGain) sendGain.gain.setValueAtTime(send.level, seconds);
      });
    });
  }
}

export function chordsmithOfflineTrackExportGain(project: PocketDawProject, track: Track, volume: number): number {
  const safeVolume = clamp(volume, 0, 1.2);
  if (!isChordsmithGeneratedExportTrack(project, track)) return safeVolume;
  return safeVolume * chordsmithStemGain(track.role);
}

function isChordsmithGeneratedExportTrack(project: PocketDawProject, track: Track): boolean {
  if (track.trackType !== "generated" || !CHORDSMITH_GENERATED_EXPORT_ROLES.has(track.role)) return false;
  return project.sourceRefs.some((ref) => ref.sourceType === "pocket-chordsmith");
}

function chordsmithStemGain(role: Track["role"]): number {
  return (CHORDSMITH_OFFLINE_STEM_GAIN as Record<string, number>)[role] ?? 1;
}

function outputDestination(project: PocketDawProject, outputs: Map<string, GainNode>, track: Track, master: GainNode): AudioNode {
    const outputId = track.routing.outputId || "master";
  if (outputId !== "master") {
    const bus = project.tracks.find((item) => item.id === outputId && item.trackType === "bus");
    const busOutput = bus ? outputs.get(bus.id) : null;
    if (bus && busOutput && bus.id !== track.id) return busOutput;
  }
  return master;
}

export function encodeWav(buffer: AudioBuffer, options: { channelMode?: WavChannelMode; normalizePeak?: boolean } = {}): Blob {
  const channels = options.channelMode === "mono" ? 1 : buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * channels * 2;
  const out = new ArrayBuffer(44 + length);
  const view = new DataView(out);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, length, true);
  let offset = 44;
  const data = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const gain = options.normalizePeak ? peakNormalizeGainForFloatChannels(data, buffer.length, channels, WAV_PEAK_NORMALIZE_TARGET) : 1;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, (channels === 1 ? monoSampleAt(data, i) : data[ch][i]) * gain));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

export async function wavBlobWithChannelMode(blob: Blob, channelMode: WavChannelMode, options: { normalizePeak?: boolean } = {}): Promise<Blob> {
  if (channelMode !== "mono" && !options.normalizePeak) return blob;
  const source = new Uint8Array(await blob.arrayBuffer());
  const channelAdjusted = channelMode === "mono" ? downmixPcm16WavToMono(source) : source;
  if (!channelAdjusted) throw new Error("Native WAV export returned a format that cannot be downmixed to mono.");
  const converted = options.normalizePeak ? peakNormalizePcm16Wav(channelAdjusted) : channelAdjusted;
  if (!converted) throw new Error("Native WAV export returned a PCM format that cannot be peak-normalized.");
  const out = new ArrayBuffer(converted.byteLength);
  new Uint8Array(out).set(converted);
  return new Blob([out], { type: "audio/wav" });
}

export function downmixPcm16WavToMono(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") return null;
  let offset = 12;
  let fmtOffset = -1;
  let fmtSize = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    if (payloadOffset + size > bytes.byteLength) return null;
    if (id === "fmt ") {
      fmtOffset = payloadOffset;
      fmtSize = size;
    } else if (id === "data") {
      dataOffset = payloadOffset;
      dataSize = size;
      break;
    }
    offset = payloadOffset + size + (size % 2);
  }
  if (fmtOffset < 0 || fmtSize < 16 || dataOffset < 0) return null;
  const audioFormat = view.getUint16(fmtOffset, true);
  const channels = view.getUint16(fmtOffset + 2, true);
  const sampleRate = view.getUint32(fmtOffset + 4, true);
  const bitsPerSample = view.getUint16(fmtOffset + 14, true);
  if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1) return null;
  if (channels === 1) return bytes;
  const frameCount = Math.floor(dataSize / (channels * 2));
  const monoDataSize = frameCount * 2;
  const out = new ArrayBuffer(44 + monoDataSize);
  const outView = new DataView(out);
  writeAscii(outView, 0, "RIFF");
  outView.setUint32(4, 36 + monoDataSize, true);
  writeAscii(outView, 8, "WAVE");
  writeAscii(outView, 12, "fmt ");
  outView.setUint32(16, 16, true);
  outView.setUint16(20, 1, true);
  outView.setUint16(22, 1, true);
  outView.setUint32(24, sampleRate, true);
  outView.setUint32(28, sampleRate * 2, true);
  outView.setUint16(32, 2, true);
  outView.setUint16(34, 16, true);
  writeAscii(outView, 36, "data");
  outView.setUint32(40, monoDataSize, true);
  let outOffset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16(dataOffset + (frame * channels + channel) * 2, true);
    }
    outView.setInt16(outOffset, Math.max(-32768, Math.min(32767, Math.round(sum / channels))), true);
    outOffset += 2;
  }
  return new Uint8Array(out);
}

export function peakNormalizePcm16Wav(bytes: Uint8Array, targetPeak = WAV_PEAK_NORMALIZE_TARGET): Uint8Array | null {
  const parsed = parsePcm16Wav(bytes);
  if (!parsed) return null;
  const peak = pcm16Peak(parsed.view, parsed.dataOffset, parsed.dataSize);
  if (peak <= 0) return bytes;
  const gain = targetPeak * 32767 / peak;
  if (!Number.isFinite(gain) || gain <= 0 || Math.abs(gain - 1) < 0.000001) return bytes;
  const out = new Uint8Array(bytes);
  const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (let offset = parsed.dataOffset; offset + 1 < parsed.dataOffset + parsed.dataSize; offset += 2) {
    const sample = parsed.view.getInt16(offset, true);
    outView.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample * gain))), true);
  }
  return out;
}

function peakNormalizeGainForFloatChannels(channels: Float32Array[], length: number, outputChannels: number, targetPeak: number): number {
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < outputChannels; ch += 1) {
      const sample = outputChannels === 1 ? monoSampleAt(channels, i) : channels[ch][i];
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  if (peak <= 0) return 1;
  const gain = targetPeak / peak;
  return Number.isFinite(gain) && gain > 0 ? gain : 1;
}

function pcm16Peak(view: DataView, dataOffset: number, dataSize: number): number {
  let peak = 0;
  for (let offset = dataOffset; offset + 1 < dataOffset + dataSize; offset += 2) {
    peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
  }
  return peak;
}

function parsePcm16Wav(bytes: Uint8Array): { view: DataView; dataOffset: number; dataSize: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") return null;
  let offset = 12;
  let fmtOffset = -1;
  let fmtSize = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    if (payloadOffset + size > bytes.byteLength) return null;
    if (id === "fmt ") {
      fmtOffset = payloadOffset;
      fmtSize = size;
    } else if (id === "data") {
      dataOffset = payloadOffset;
      dataSize = size;
      break;
    }
    offset = payloadOffset + size + (size % 2);
  }
  if (fmtOffset < 0 || fmtSize < 16 || dataOffset < 0) return null;
  const audioFormat = view.getUint16(fmtOffset, true);
  const bitsPerSample = view.getUint16(fmtOffset + 14, true);
  if (audioFormat !== 1 || bitsPerSample !== 16) return null;
  return { view, dataOffset, dataSize };
}

function monoSampleAt(channels: Float32Array[], index: number): number {
  if (!channels.length) return 0;
  return channels.reduce((sum, channel) => sum + channel[index], 0) / channels.length;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function clamp01(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

declare global {
  interface Window {
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
}
