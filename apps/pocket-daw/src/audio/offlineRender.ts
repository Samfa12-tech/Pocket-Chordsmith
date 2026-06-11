import type { PocketDawProject, Track } from "../daw/schema";
import { trackIsAudible } from "../daw/tracks";
import { barsToSeconds } from "../daw/timeline";
import { renderTimelineEvents } from "./eventRenderer";
import { renderTimelineAudioRegions } from "./audioRegions";
import { getCachedAudioBuffer } from "./audioBufferCache";
import { getTrackFxChain } from "../daw/fx";
import { connectFxChain } from "./fxProcessor";
import { scheduleInstrumentEvent } from "./instruments";
import { activeAutomationLaneCount, getAutomatedTrackControls } from "../daw/automation";

export async function renderProjectToWavBlob(project: PocketDawProject): Promise<Blob> {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error("Offline WAV rendering is not supported in this browser.");
  const tailSeconds = Number(project.exportProfiles.find((p) => p.id === "full-song-wav")?.settings.tailSeconds || 1.2);
  const duration = barsToSeconds(project.timeline.bars, project.project.bpm, project.project.timeSig) + tailSeconds;
  const sampleRate = project.project.sampleRate || 44100;
  const ctx = new OfflineCtx(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.1;
  master.connect(project.mixer.masterLimiter ? compressor : ctx.destination);
  if (project.mixer.masterLimiter) compressor.connect(ctx.destination);

  const outputs = new Map<string, GainNode>();
  const panners = new Map<string, StereoPannerNode>();
  project.tracks.forEach((track) => {
    if (track.role === "master") {
      master.gain.value = track.volume;
      return;
    }
    const gain = ctx.createGain();
    const pan = "createStereoPanner" in ctx ? ctx.createStereoPanner() : null;
    const controls = getAutomatedTrackControls(project, track, 1);
    gain.gain.value = trackIsAudible(track, project.tracks) ? controls.volume : 0;
    if (pan) {
      pan.pan.value = controls.pan;
      panners.set(track.id, pan);
    }
    outputs.set(track.id, gain);
  });
  project.tracks.forEach((track) => {
    if (track.role === "master") return;
    const gain = outputs.get(track.id);
    if (!gain) return;
    const pan = panners.get(track.id);
    const destination = outputDestination(project, outputs, track, master);
    connectFxChain(ctx, gain, pan || destination, getTrackFxChain(project, track));
    if (pan) pan.connect(destination);
  });

  if (activeAutomationLaneCount(project)) {
    applyOfflineAutomation(project, outputs, panners, duration);
  }

  renderTimelineEvents(project).forEach((event) => {
    const track = project.tracks.find((item) => item.id === event.trackId) as Track | undefined;
    if (!track || !trackIsAudible(track, project.tracks)) return;
    const output = outputs.get(event.trackId);
    if (output) scheduleInstrumentEvent(ctx, output, event);
  });

  renderTimelineAudioRegions(project).audioRegions.forEach((region) => {
    const cached = getCachedAudioBuffer(region.mediaPoolItemId);
    const output = outputs.get(region.trackId);
    if (!cached || !output) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = cached.buffer;
    gain.gain.value = Math.max(0, region.gain);
    source.connect(gain);
    gain.connect(output);
    const duration = Math.min(region.durationSeconds, Math.max(0, cached.buffer.duration - region.sourceOffsetSeconds));
    if (duration > 0) source.start(region.startTimeSeconds, region.sourceOffsetSeconds, duration);
  });

  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

function applyOfflineAutomation(project: PocketDawProject, outputs: Map<string, GainNode>, panners: Map<string, StereoPannerNode>, duration: number) {
  const steps = Math.max(8, Math.ceil(duration / 0.125));
  for (let i = 0; i <= steps; i += 1) {
    const seconds = (duration * i) / steps;
    const bar = seconds / (60 / project.project.bpm * project.project.timeSig) + 1;
    project.tracks.forEach((track) => {
      if (track.role === "master") return;
      const output = outputs.get(track.id);
      if (!output) return;
      const controls = getAutomatedTrackControls(project, track, bar);
      output.gain.setValueAtTime(trackIsAudible(track, project.tracks) ? controls.volume : 0, seconds);
      const pan = panners.get(track.id);
      if (pan) pan.pan.setValueAtTime(controls.pan, seconds);
    });
  }
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

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
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
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < buffer.length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, data[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

declare global {
  interface Window {
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
}
