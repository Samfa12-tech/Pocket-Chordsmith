import type { PocketDawProject, Track } from "../daw/schema";
import { trackIsAudible } from "../daw/tracks";
import { timelineBarAtSeconds, timelineRenderDurationSeconds } from "../daw/timeline";
import { renderTimelineEvents } from "./eventRenderer";
import { audioBufferForRegionPlayback, audioRegionPlaybackWindow, renderTimelineAudioRegions, scheduleAudioRegionEnvelope } from "./audioRegions";
import { getCachedAudioBuffer } from "./audioBufferCache";
import { getTrackFxChain } from "../daw/fx";
import { DRUM_LANE_DEFS, generatedDrumBranchLane, getDrumLaneFxChain, isDrumEventKind } from "../daw/drumLanes";
import { connectFxChain } from "./fxProcessor";
import { scheduleInstrumentEvent } from "./instruments";
import { chordsmithSidechainSettings, isChordsmithSidechainTrigger, scheduleChordsmithSidechainDuck } from "./sidechain";
import { activeAutomationLaneCount, getAutomatedFxChains, getAutomatedTrackControls } from "../daw/automation";
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
  bitDepth?: WavBitDepth;
  dither?: WavDitherMode;
  includeChordsmithOfflineLofiTexture?: boolean;
  normalizePeak?: boolean;
}

export type WavChannelMode = "stereo" | "mono";
export type WavBitDepth = 16 | 24 | 32;
export type WavDitherMode = "off" | "tpdf";
const WAV_PEAK_NORMALIZE_TARGET = 0.95;

export async function renderProjectToWavBlob(project: PocketDawProject, options: OfflineRenderOptions = {}): Promise<Blob> {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error("Offline WAV rendering is not supported in this browser.");
  const tailSeconds = Number(project.exportProfiles.find((p) => p.id === "full-song-wav")?.settings.tailSeconds ?? 1.2);
  const duration = timelineRenderDurationSeconds(project) + tailSeconds;
  const sampleRate = fullSongWavSampleRate(project);
  const ctx = new OfflineCtx(2, Math.ceil(duration * sampleRate), sampleRate);
  const automatedFxChains = getAutomatedFxChains(project, 1);
  const automatedTrackFxChain = (track: Track | null | undefined) => {
    const chain = getTrackFxChain(project, track);
    return chain ? automatedFxChains.find((item) => item.id === chain.id) || chain : null;
  };
  const automatedChainById = (chainId: string | null | undefined) => chainId ? automatedFxChains.find((item) => item.id === chainId) || null : null;
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.1;
  const masterTrack = project.tracks.find((track) => track.role === "master");
  const masterDestination = project.mixer.masterLimiter ? compressor : ctx.destination;
  const fxAutomation = { project, projectStartSeconds: 0 };
  connectFxChain(ctx, master, masterDestination, automatedTrackFxChain(masterTrack), fxAutomation);
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
    connectFxChain(ctx, gain, postFx, automatedTrackFxChain(track), fxAutomation);
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
      connectFxChain(ctx, input, drumsOutput, automatedChainById(getDrumLaneFxChain(project, lane.id)?.id), fxAutomation);
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
    source.playbackRate.value = region.playbackRate;
    source.connect(gain);
    gain.connect(output);
    scheduleAudioRegionEnvelope(gain.gain, region, region.startTimeSeconds, 0, playbackWindow.durationSeconds);
    source.start(region.startTimeSeconds, playbackWindow.sourceOffsetSeconds, playbackWindow.sourceDurationSeconds);
  });

  const rendered = await ctx.startRendering();
  return encodeWav(rendered, {
    channelMode: options.channelMode || fullSongWavChannelMode(project),
    bitDepth: options.bitDepth || fullSongWavBitDepth(project),
    dither: options.dither || fullSongWavDither(project),
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

export function fullSongWavBitDepth(project: PocketDawProject): WavBitDepth {
  const bitDepth = Number(project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.bitDepth ?? 16);
  return bitDepth === 32 ? 32 : bitDepth === 24 ? 24 : 16;
}

export function fullSongWavPeakNormalize(project: PocketDawProject): boolean {
  const normalize = project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings?.normalize;
  return normalize === true || normalize === "peak";
}

export function fullSongWavDither(project: PocketDawProject): WavDitherMode {
  const dither = project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings?.dither;
  return dither === "tpdf" ? "tpdf" : "off";
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
    const bar = timelineBarAtSeconds(project, seconds);
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

export function encodeWav(buffer: AudioBuffer, options: { channelMode?: WavChannelMode; bitDepth?: WavBitDepth; dither?: WavDitherMode; normalizePeak?: boolean } = {}): Blob {
  const channels = options.channelMode === "mono" ? 1 : buffer.numberOfChannels;
  const bitDepth = normalizeWavBitDepth(options.bitDepth);
  const bytesPerSample = bitDepth / 8;
  const audioFormat = bitDepth === 32 ? 3 : 1;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + length);
  const view = new DataView(out);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, length, true);
  let offset = 44;
  const data = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const gain = options.normalizePeak ? peakNormalizeGainForFloatChannels(data, buffer.length, channels, WAV_PEAK_NORMALIZE_TARGET) : 1;
  const dither = bitDepth === 32 ? "off" : normalizeWavDither(options.dither);
  const ditherNoise = dither === "tpdf" ? createTpdfDither(0x5eed_c0de) : null;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const rawSample = (channels === 1 ? monoSampleAt(data, i) : data[ch][i]) * gain;
      const sample = bitDepth === 32 ? rawSample : ditheredFixedPointSample(rawSample, bitDepth, ditherNoise);
      writeWavSample(view, offset, bitDepth, sample);
      offset += bytesPerSample;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

export async function wavBlobWithChannelMode(blob: Blob, channelMode: WavChannelMode, options: { bitDepth?: WavBitDepth; dither?: WavDitherMode; normalizePeak?: boolean } = {}): Promise<Blob> {
  const targetBitDepth = options.bitDepth;
  const dither = normalizeWavDither(options.dither);
  if (channelMode !== "mono" && !options.normalizePeak && dither === "off" && (!targetBitDepth || targetBitDepth === 16)) return blob;
  const source = new Uint8Array(await blob.arrayBuffer());
  const sourceInfo = parseWav(source);
  if (!sourceInfo) throw new Error("Native WAV export returned a format that cannot be processed.");
  if (channelMode !== "mono" && !options.normalizePeak && dither === "off" && (!targetBitDepth || targetBitDepth === sourceInfo.bitsPerSample)) return blob;
  const channelAdjusted = channelMode === "mono" ? downmixWavToMono(source) : source;
  if (!channelAdjusted) throw new Error("Native WAV export returned a format that cannot be downmixed to mono.");
  const normalized = options.normalizePeak ? peakNormalizeWav(channelAdjusted) : channelAdjusted;
  if (!normalized) throw new Error("Native WAV export returned a format that cannot be peak-normalized.");
  const converted = targetBitDepth ? convertWavBitDepth(normalized, targetBitDepth, { dither }) : normalized;
  if (!converted) throw new Error("Native WAV export returned a format that cannot be converted to the requested bit depth.");
  const out = new ArrayBuffer(converted.byteLength);
  new Uint8Array(out).set(converted);
  return new Blob([out], { type: "audio/wav" });
}

export function downmixPcm16WavToMono(bytes: Uint8Array): Uint8Array | null {
  return downmixWavToMono(bytes);
}

export function downmixPcmWavToMono(bytes: Uint8Array): Uint8Array | null {
  return downmixWavToMono(bytes);
}

export function downmixWavToMono(bytes: Uint8Array): Uint8Array | null {
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
  const bytesPerSample = bitsPerSample / 8;
  if (!isSupportedWavFormat(audioFormat, bitsPerSample) || channels < 1) return null;
  if (channels === 1) return bytes;
  const frameCount = Math.floor(dataSize / (channels * bytesPerSample));
  const monoDataSize = frameCount * bytesPerSample;
  const out = new ArrayBuffer(44 + monoDataSize);
  const outView = new DataView(out);
  writeAscii(outView, 0, "RIFF");
  outView.setUint32(4, 36 + monoDataSize, true);
  writeAscii(outView, 8, "WAVE");
  writeAscii(outView, 12, "fmt ");
  outView.setUint32(16, 16, true);
  outView.setUint16(20, audioFormat, true);
  outView.setUint16(22, 1, true);
  outView.setUint32(24, sampleRate, true);
  outView.setUint32(28, sampleRate * bytesPerSample, true);
  outView.setUint16(32, bytesPerSample, true);
  outView.setUint16(34, bitsPerSample, true);
  writeAscii(outView, 36, "data");
  outView.setUint32(40, monoDataSize, true);
  let outOffset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += readWavSample(view, dataOffset + (frame * channels + channel) * bytesPerSample, audioFormat, bitsPerSample);
    }
    if (audioFormat === 3) writeWavSample(outView, outOffset, bitsPerSample as WavBitDepth, sum / channels);
    else writePcmInteger(outView, outOffset, bitsPerSample, Math.round(sum / channels));
    outOffset += bytesPerSample;
  }
  return new Uint8Array(out);
}

export function peakNormalizePcm16Wav(bytes: Uint8Array, targetPeak = WAV_PEAK_NORMALIZE_TARGET): Uint8Array | null {
  return peakNormalizePcmWav(bytes, targetPeak);
}

export function peakNormalizePcmWav(bytes: Uint8Array, targetPeak = WAV_PEAK_NORMALIZE_TARGET): Uint8Array | null {
  return peakNormalizeWav(bytes, targetPeak);
}

export function peakNormalizeWav(bytes: Uint8Array, targetPeak = WAV_PEAK_NORMALIZE_TARGET): Uint8Array | null {
  const parsed = parseWav(bytes);
  if (!parsed) return null;
  const peak = wavPeak(parsed.view, parsed.dataOffset, parsed.dataSize, parsed.audioFormat, parsed.bitsPerSample);
  if (peak <= 0) return bytes;
  const gain = parsed.audioFormat === 3 ? targetPeak / peak : targetPeak * pcmMaxPositive(parsed.bitsPerSample) / peak;
  if (!Number.isFinite(gain) || gain <= 0 || Math.abs(gain - 1) < 0.000001) return bytes;
  const out = new Uint8Array(bytes);
  const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const bytesPerSample = parsed.bitsPerSample / 8;
  for (let offset = parsed.dataOffset; offset + bytesPerSample - 1 < parsed.dataOffset + parsed.dataSize; offset += bytesPerSample) {
    const sample = readWavSample(parsed.view, offset, parsed.audioFormat, parsed.bitsPerSample);
    if (parsed.audioFormat === 3) writeWavSample(outView, offset, parsed.bitsPerSample, sample * gain);
    else writePcmInteger(outView, offset, parsed.bitsPerSample, Math.round(sample * gain));
  }
  return out;
}

export function convertPcmWavBitDepth(bytes: Uint8Array, targetBitDepth: WavBitDepth): Uint8Array | null {
  return convertWavBitDepth(bytes, targetBitDepth);
}

export function convertWavBitDepth(bytes: Uint8Array, targetBitDepth: WavBitDepth, options: { dither?: WavDitherMode } = {}): Uint8Array | null {
  const parsed = parseWav(bytes);
  if (!parsed) return null;
  const dither = targetBitDepth === 32 ? "off" : normalizeWavDither(options.dither);
  if (parsed.bitsPerSample === targetBitDepth && dither === "off") return bytes;
  const sourceBytesPerSample = parsed.bitsPerSample / 8;
  const targetBytesPerSample = targetBitDepth / 8;
  const frameSamples = Math.floor(parsed.dataSize / sourceBytesPerSample);
  const dataSize = frameSamples * targetBytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const outView = new DataView(out);
  writeWavHeader(outView, parsed.sampleRate, parsed.channels, targetBitDepth, dataSize);
  let outOffset = 44;
  const ditherNoise = dither === "tpdf" ? createTpdfDither(0xdecaf_bad) : null;
  for (let offset = parsed.dataOffset; offset + sourceBytesPerSample - 1 < parsed.dataOffset + parsed.dataSize; offset += sourceBytesPerSample) {
    const sample = parsed.audioFormat === 3
      ? readWavSample(parsed.view, offset, parsed.audioFormat, parsed.bitsPerSample)
      : readPcmSample(parsed.view, offset, parsed.bitsPerSample) / pcmMaxPositive(parsed.bitsPerSample);
    writeWavSample(outView, outOffset, targetBitDepth, targetBitDepth === 32 ? sample : ditheredFixedPointSample(sample, targetBitDepth, ditherNoise));
    outOffset += targetBytesPerSample;
  }
  return new Uint8Array(out);
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

function wavPeak(view: DataView, dataOffset: number, dataSize: number, audioFormat: number, bitsPerSample: number): number {
  let peak = 0;
  const bytesPerSample = bitsPerSample / 8;
  for (let offset = dataOffset; offset + bytesPerSample - 1 < dataOffset + dataSize; offset += bytesPerSample) {
    peak = Math.max(peak, Math.abs(readWavSample(view, offset, audioFormat, bitsPerSample)));
  }
  return peak;
}

function parseWav(bytes: Uint8Array): { view: DataView; dataOffset: number; dataSize: number; sampleRate: number; channels: number; audioFormat: 1 | 3; bitsPerSample: WavBitDepth } | null {
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
  if (!isSupportedWavFormat(audioFormat, bitsPerSample) || channels < 1) return null;
  return { view, dataOffset, dataSize, sampleRate, channels, audioFormat: audioFormat as 1 | 3, bitsPerSample: bitsPerSample as WavBitDepth };
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

function writeWavHeader(view: DataView, sampleRate: number, channels: number, bitDepth: WavBitDepth, dataSize: number) {
  const bytesPerSample = bitDepth / 8;
  const audioFormat = bitDepth === 32 ? 3 : 1;
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
}

function isSupportedWavFormat(audioFormat: number, bitsPerSample: number): boolean {
  return (audioFormat === 1 && (bitsPerSample === 16 || bitsPerSample === 24)) || (audioFormat === 3 && bitsPerSample === 32);
}

function normalizeWavBitDepth(value: unknown): WavBitDepth {
  return Number(value) === 32 ? 32 : Number(value) === 24 ? 24 : 16;
}

function normalizeWavDither(value: unknown): WavDitherMode {
  return value === "tpdf" ? "tpdf" : "off";
}

function ditheredFixedPointSample(sample: number, bitDepth: WavBitDepth, ditherNoise: (() => number) | null): number {
  const unclipped = ditherNoise && bitDepth !== 32 ? sample + ditherNoise() / pcmMaxPositive(bitDepth) : sample;
  return Math.max(-1, Math.min(1, unclipped));
}

function createTpdfDither(seed: number): () => number {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  return () => next() - next();
}

function pcmMaxPositive(bitsPerSample: number): number {
  return bitsPerSample === 24 ? 0x7fffff : 0x7fff;
}

function pcmMinNegative(bitsPerSample: number): number {
  return bitsPerSample === 24 ? -0x800000 : -0x8000;
}

function readPcmSample(view: DataView, offset: number, bitsPerSample: number): number {
  if (bitsPerSample === 24) {
    const raw = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    return raw & 0x800000 ? raw - 0x1000000 : raw;
  }
  return view.getInt16(offset, true);
}

function readWavSample(view: DataView, offset: number, audioFormat: number, bitsPerSample: number): number {
  if (audioFormat === 3 && bitsPerSample === 32) return view.getFloat32(offset, true);
  return readPcmSample(view, offset, bitsPerSample);
}

function writeWavSample(view: DataView, offset: number, bitsPerSample: WavBitDepth, sample: number) {
  if (bitsPerSample === 32) {
    view.setFloat32(offset, sample, true);
    return;
  }
  const scaled = sample < 0 ? sample * Math.abs(pcmMinNegative(bitsPerSample)) : sample * pcmMaxPositive(bitsPerSample);
  writePcmInteger(view, offset, bitsPerSample, Math.round(scaled));
}

function writePcmInteger(view: DataView, offset: number, bitsPerSample: number, sample: number) {
  const value = Math.max(pcmMinNegative(bitsPerSample), Math.min(pcmMaxPositive(bitsPerSample), Math.round(sample)));
  if (bitsPerSample === 24) {
    const unsigned = value < 0 ? value + 0x1000000 : value;
    view.setUint8(offset, unsigned & 0xff);
    view.setUint8(offset + 1, (unsigned >> 8) & 0xff);
    view.setUint8(offset + 2, (unsigned >> 16) & 0xff);
    return;
  }
  view.setInt16(offset, value, true);
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
