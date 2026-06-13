import type { PocketDawProject, Track } from "../daw/schema";
import { cloneProject } from "../daw/dawProject";
import { trackIsAudible } from "../daw/tracks";
import { barsToSeconds, secondsToBars } from "../daw/timeline";
import { renderTimelineEvents, type RenderedEvent } from "./eventRenderer";
import { renderTimelineAudioRegions, type AudioRegion } from "./audioRegions";
import { getCachedAudioBuffer } from "./audioBufferCache";
import { getTrackFxChain } from "../daw/fx";
import { connectFxChain } from "./fxProcessor";
import { scheduleInstrumentEvent } from "./instruments";
import { activeAutomationLaneCount, getAutomatedTrackControls } from "../daw/automation";
import { buildNativeAudioStartPayload, NativeAudioPlaybackBridge, type NativeAudioStatus } from "../native/audioPlayback";
import { buildNativeRenderCache, nativeRenderCacheSignature, type NativeRenderCache } from "./nativeRenderCache";

interface TrackOutput {
  gain: GainNode;
  analyser: AnalyserNode;
  pan: StereoPannerNode | null;
  meterData: Uint8Array<ArrayBuffer>;
  cleanup: () => void;
}

export interface TrackMixerControlPatch {
  volume?: number;
  pan?: number;
  mute?: boolean;
  solo?: boolean;
}

export interface TransportSnapshot {
  playing: boolean;
  bar: number;
  seconds: number;
}

export type AudioProjectSyncMode =
  | "mixer-controls"
  | "composition-events"
  | "mixer-graph"
  | "timeline-structure"
  | "project-load";

type PlaybackBackend = "native-cpal" | "web-audio" | "idle";
type AudioDropCause = "seek" | "stop" | "project-load" | "graph-rebuild" | "loop" | "late-scheduler" | null;
const safeSyncLeadSeconds = 0.2;

export function calculateLoopSeekSeconds(project: PocketDawProject, currentSeconds: number): number | null {
  if (!project.timeline.loop.enabled) return null;
  const loop = project.timeline.loop;
  const start = barsToSeconds(loop.startBar - 1, project.project.bpm, project.project.timeSig);
  const end = barsToSeconds(loop.endBar - 1, project.project.bpm, project.project.timeSig);
  if (end <= start || currentSeconds < end) return null;
  return start;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private project: PocketDawProject;
  private events: RenderedEvent[] = [];
  private audioRegions: AudioRegion[] = [];
  private trackOutputs = new Map<string, TrackOutput>();
  private master: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterMeterData: Uint8Array<ArrayBuffer> | null = null;
  private schedulerTimer: number | null = null;
  private nativeTickTimer: number | null = null;
  private nativePlayback = new NativeAudioPlaybackBridge();
  private nativeRenderCache: NativeRenderCache | null = null;
  private nativeRenderCacheError: string | null = null;
  private nativeRenderCacheBypassedForLiveEdits = false;
  private nativeRenderCacheBuildCount = 0;
  private nativeRenderCacheLastBuildMs = 0;
  private nativeRenderCacheLastBuildReason: string | null = null;
  private playbackBackend: PlaybackBackend = "idle";
  private nativeStartedAtMs = 0;
  private nativeStatus: NativeAudioStatus | null = null;
  private nativeLastError: string | null = null;
  private nativeMeterEventIndex = 0;
  private nextEventIndex = 0;
  private nextAudioRegionIndex = 0;
  private activeAudioSources: AudioBufferSourceNode[] = [];
  private startedAt = 0;
  private offsetSeconds = 0;
  private playing = false;
  private meterPeaks: Record<string, number> = {};
  private lastMeterRead = 0;
  private lastTickEmit = 0;
  private scheduledEventCount = 0;
  private skippedLateEventCount = 0;
  private lateEventCount = 0;
  private schedulerTickCount = 0;
  private missedSchedulerTickCount = 0;
  private maxSchedulerGapMs = 0;
  private lastSchedulerTickAt = 0;
  private audioGraphReconfigureCount = 0;
  private activeAudioSourcesStoppedByGraphReconfigureCount = 0;
  private projectSyncCount = 0;
  private lastProjectSyncMode: AudioProjectSyncMode | "none" = "none";
  private lastProjectSyncReason = "initial-load";
  private lastAudioDropCause: AudioDropCause = null;
  private schedulerLookaheadSeconds = 0.52;
  private schedulerIntervalMs = 35;
  private onTick: (snapshot: TransportSnapshot) => void = () => {};

  constructor(project: PocketDawProject) {
    this.project = cloneProject(project);
    this.events = renderTimelineEvents(this.project);
    this.audioRegions = renderTimelineAudioRegions(this.project).audioRegions;
  }

  setOnTick(callback: (snapshot: TransportSnapshot) => void) {
    this.onTick = callback;
  }

  setProject(project: PocketDawProject) {
    this.syncProject(project, "project-load", "set-project");
  }

  syncProject(project: PocketDawProject, mode: AudioProjectSyncMode, reason: string = mode) {
    const current = this.currentSeconds();
    this.project = cloneProject(project);
    this.projectSyncCount += 1;
    this.lastProjectSyncMode = mode;
    this.lastProjectSyncReason = reason;

    const liveNativeCompositionEdit = mode === "composition-events" && this.playbackBackend === "native-cpal" && this.playing;

    if (mode !== "mixer-controls") {
      this.events = renderTimelineEvents(this.project);
      this.audioRegions = renderTimelineAudioRegions(this.project).audioRegions;
      this.nativeRenderCache = null;
      if (liveNativeCompositionEdit) this.nativeRenderCacheBypassedForLiveEdits = true;
      else if (mode === "project-load" || mode === "timeline-structure" || !this.playing) this.nativeRenderCacheBypassedForLiveEdits = false;
    }

    if (mode === "project-load") {
      this.scheduledEventCount = 0;
      this.skippedLateEventCount = 0;
      this.lateEventCount = 0;
      if (this.playing) this.lastAudioDropCause = "project-load";
    }

    if (this.ctx && this.master) {
      if (mode === "mixer-controls") this.updateTrackOutputControls(this.ctx.currentTime);
      else if (mode === "composition-events" || mode === "timeline-structure") this.repositionWebScheduler(current + safeSyncLeadSeconds);
      else this.configureMixer(mode === "mixer-graph" ? "graph-rebuild" : "project-load");
    }

    if (this.playbackBackend === "native-cpal" && this.playing) {
      if (mode === "mixer-controls") {
        this.syncNativeMixerControls();
      } else if (mode === "composition-events") {
        this.nativeRenderCacheBypassedForLiveEdits = true;
        void this.restartNativePlayback(current, { useRenderCache: false });
      } else {
        void this.restartNativePlayback(current);
      }
    }

    if (this.playing) {
      if (this.ctx && this.playbackBackend === "web-audio" && mode === "project-load") {
        this.startedAt = this.ctx.currentTime - current;
        this.seek(current);
      } else if (mode !== "project-load") {
        this.repositionPlaybackIndexes(current + safeSyncLeadSeconds);
      }
    }
  }

  updateTrackMixerControl(trackId: string, patch: TrackMixerControlPatch): boolean {
    const track = this.project.tracks.find((item) => item.id === trackId);
    if (!track) return false;

    if (patch.volume !== undefined) track.volume = clampNumber(patch.volume, 0, 1.2);
    if (patch.pan !== undefined) track.pan = clampNumber(patch.pan, -1, 1);
    if (patch.mute !== undefined) track.mute = patch.mute;
    if (patch.solo !== undefined) track.solo = patch.solo;

    if (this.playbackBackend === "native-cpal") {
      void this.nativePlayback.updateTrack({ trackId, ...patch }).then((status) => {
        if (status) this.nativeStatus = status;
      });
    }

    if (!this.ctx) return true;
    const now = this.ctx.currentTime;
    if (track.role === "master") {
      if (this.master && patch.volume !== undefined) this.master.gain.setTargetAtTime(track.volume, now, 0.018);
      return true;
    }

    if (patch.mute !== undefined || patch.solo !== undefined) {
      this.updateTrackOutputControls(now);
      return true;
    }

    const output = this.trackOutputs.get(track.id);
    if (!output) return true;
    const currentBar = secondsToBars(this.currentSeconds(), this.project.project.bpm, this.project.project.timeSig) + 1;
    const controls = getAutomatedTrackControls(this.project, track, currentBar);
    output.gain.gain.setTargetAtTime(trackIsAudible(track, this.project.tracks) ? controls.volume : 0, now, 0.018);
    if (output.pan) output.pan.pan.setTargetAtTime(controls.pan, now, 0.018);
    return true;
  }

  async play() {
    const nativeStarted = await this.tryStartNativePlayback();
    if (nativeStarted) {
      this.playing = true;
      this.playbackBackend = "native-cpal";
      this.nativeStartedAtMs = performance.now() - this.offsetSeconds * 1000;
      this.nativeMeterEventIndex = this.findEventIndex(this.offsetSeconds);
      this.nextEventIndex = this.nativeMeterEventIndex;
      this.nextAudioRegionIndex = this.findAudioRegionIndex(this.offsetSeconds);
      this.primeMeters(this.offsetSeconds);
      this.startNativeTicker();
      this.emitTick(true);
      return;
    }

    await this.ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      const resume = this.ctx.resume().catch(() => undefined);
      await Promise.race([resume, new Promise((resolve) => window.setTimeout(resolve, 500))]);
    }
    if (this.ctx.state !== "running") {
      this.playing = false;
      this.emitTick(true);
      return;
    }
    this.playing = true;
    this.playbackBackend = "web-audio";
    this.startedAt = this.ctx.currentTime - this.offsetSeconds;
    this.nextEventIndex = this.findEventIndex(this.offsetSeconds);
    this.nextAudioRegionIndex = this.findAudioRegionIndex(this.offsetSeconds);
    this.primeMeters(this.offsetSeconds);
    this.startScheduler();
    this.emitTick(true);
  }

  stop() {
    this.playing = false;
    this.playbackBackend = "idle";
    this.nativeRenderCacheBypassedForLiveEdits = false;
    this.lastAudioDropCause = "stop";
    this.offsetSeconds = 0;
    this.nextEventIndex = 0;
    this.nextAudioRegionIndex = 0;
    this.nativeMeterEventIndex = 0;
    this.meterPeaks = {};
    this.stopNativeTicker();
    void this.nativePlayback.stop().then((status) => {
      if (status) this.nativeStatus = status;
    });
    this.stopActiveAudioSources();
    if (this.schedulerTimer !== null) window.clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
    this.stopActiveAudioSources();
    if (this.ctx && this.master) this.configureMixer("stop");
    this.emitTick(true);
  }

  pause() {
    this.offsetSeconds = this.currentSeconds();
    this.playing = false;
    this.playbackBackend = "idle";
    this.stopNativeTicker();
    void this.nativePlayback.pause().then((status) => {
      if (status) this.nativeStatus = status;
    });
    if (this.schedulerTimer !== null) window.clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
    if (this.ctx && this.master) this.configureMixer("stop");
    this.emitTick(true);
  }

  restart() {
    this.nativeRenderCacheBypassedForLiveEdits = false;
    this.seekToBar(1);
    return this.play();
  }

  seekToBar(bar: number) {
    const seconds = barsToSeconds(Math.max(0, bar - 1), this.project.project.bpm, this.project.project.timeSig);
    this.seek(seconds);
  }

  seek(seconds: number) {
    this.offsetSeconds = Math.max(0, seconds);
    this.lastAudioDropCause = "seek";
    if (this.playbackBackend === "native-cpal" && this.playing) {
      this.nativeStartedAtMs = performance.now() - this.offsetSeconds * 1000;
      this.nativeMeterEventIndex = this.findEventIndex(this.offsetSeconds);
      void this.nativePlayback.seek(this.offsetSeconds).then((status) => {
        if (status) this.nativeStatus = status;
      });
    }
    if (this.ctx && this.playing) {
      this.startedAt = this.ctx.currentTime - this.offsetSeconds;
      this.configureMixer("seek");
    }
    this.nextEventIndex = this.findEventIndex(this.offsetSeconds);
    this.nextAudioRegionIndex = this.findAudioRegionIndex(this.offsetSeconds);
    this.emitTick(true);
  }

  currentSeconds(): number {
    if (this.playbackBackend === "native-cpal" && this.playing) {
      return Math.max(0, (performance.now() - this.nativeStartedAtMs) / 1000);
    }
    if (!this.ctx || !this.playing) return this.offsetSeconds;
    if (this.ctx.state !== "running") return this.offsetSeconds;
    return Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  isPlaying() {
    return this.playing;
  }

  getDiagnostics() {
    return {
      playbackBackend: this.playbackBackend,
      nativeAudio: {
        requested: true,
        active: this.playbackBackend === "native-cpal",
        status: this.nativeStatus,
        lastError: this.nativeLastError,
        fallback: this.playbackBackend === "web-audio" ? "web-audio" : null,
        supportedMaterial: "generated-and-midi-events",
        unsupportedMaterial: this.audioRegions.length ? "decoded-audio-regions-still-use-web-audio-cache" : null
      },
      nativeRenderCache: {
        assetCount: this.activeNativeRenderCache()?.assets.length || 0,
        assetRegionCount: this.activeNativeRenderCache()?.regions.length || 0,
        cachedClipCount: this.activeNativeRenderCache()?.cachedClipIds.size || 0,
        renderCacheHitCount: this.activeNativeRenderCache()?.renderCacheHitCount || 0,
        renderCacheMissCount: this.activeNativeRenderCache()?.renderCacheMissCount || 0,
        proceduralFallbackEventCount: this.activeNativeRenderCache()?.proceduralFallbackEventCount ?? this.events.length,
        nativeRenderCacheBypassedForLiveEdits: this.nativeRenderCacheBypassedForLiveEdits,
        buildCount: this.nativeRenderCacheBuildCount,
        lastBuildMs: this.nativeRenderCacheLastBuildMs,
        lastBuildReason: this.nativeRenderCacheLastBuildReason,
        lastError: this.nativeRenderCacheError
      },
      audioContextState: this.ctx?.state || "not-created",
      currentSeconds: this.currentSeconds(),
      eventCount: this.events.length,
      nextEventIndex: this.nextEventIndex,
      scheduledEventCount: this.scheduledEventCount,
      schedulerTickCount: this.schedulerTickCount,
      missedSchedulerTickCount: this.missedSchedulerTickCount,
      maxSchedulerGapMs: this.maxSchedulerGapMs,
      lateEventCount: this.lateEventCount,
      skippedLateEventCount: this.skippedLateEventCount,
      schedulerActive: this.schedulerTimer !== null,
      audioGraphReconfigureCount: this.audioGraphReconfigureCount,
      activeAudioSourcesStoppedByGraphReconfigureCount: this.activeAudioSourcesStoppedByGraphReconfigureCount,
      projectSyncCount: this.projectSyncCount,
      lastProjectSyncMode: this.lastProjectSyncMode,
      lastProjectSyncReason: this.lastProjectSyncReason,
      lastAudioDropCause: this.lastAudioDropCause,
      projectTitle: this.project.project.title,
      timelineClipCount: this.project.timeline.clips.length,
      importHistoryCount: this.project.importHistory.length,
      trackOutputIds: Array.from(this.trackOutputs.keys()),
      eventCountsByTrack: countEventsBy(this.events, "trackId"),
      eventCountsByKind: countEventsBy(this.events, "kind"),
      audioRegionCount: this.audioRegions.length,
      missingAudioRegionCount: this.audioRegions.filter((region) => !getCachedAudioBuffer(region.mediaPoolItemId)).length,
      activeAutomationLaneCount: activeAutomationLaneCount(this.project),
      mixerControls: this.project.tracks.map((track) => ({ id: track.id, volume: track.volume, pan: track.pan, mute: track.mute, solo: track.solo })),
      sourceRefCount: this.project.sourceRefs.length,
      sourceRefTitles: this.project.sourceRefs.map((ref) => ref.title || ""),
      chordsmithSectionCount: chordsmithSectionCount(this.project),
      fxChainCount: this.project.fx?.chains.length || 0,
      schedulerLookaheadSeconds: this.schedulerLookaheadSeconds,
      schedulerIntervalMs: this.schedulerIntervalMs,
      audioDeviceSettings: this.project.audioDeviceSettings
    };
  }

  getMeterLevels(): Record<string, number> {
    const now = this.ctx?.state === "running" ? this.ctx.currentTime : performance.now() / 1000;
    const elapsed = Math.max(0, now - this.lastMeterRead);
    this.lastMeterRead = now;
    const levels: Record<string, number> = {};
    this.project.tracks.forEach((track) => {
      const output = this.trackOutputs.get(track.id);
      const analyserPeak = output ? readAnalyserPeak(output.analyser, output.meterData) : 0;
      const tappedPeak = Math.max(0, (this.meterPeaks[track.id] || 0) - elapsed * 1.9);
      this.meterPeaks[track.id] = tappedPeak;
      levels[track.id] = Math.max(analyserPeak, tappedPeak);
    });
    this.trackOutputs.forEach((output, id) => {
      if (levels[id] !== undefined) return;
      const analyserPeak = readAnalyserPeak(output.analyser, output.meterData);
      const tappedPeak = Math.max(0, (this.meterPeaks[id] || 0) - elapsed * 1.9);
      this.meterPeaks[id] = tappedPeak;
      levels[id] = Math.max(analyserPeak, tappedPeak);
    });
    if (this.masterAnalyser && this.masterMeterData) {
      const analyserPeak = readAnalyserPeak(this.masterAnalyser, this.masterMeterData);
      const tappedPeak = Math.max(0, (this.meterPeaks.master || 0) - elapsed * 1.9);
      this.meterPeaks.master = tappedPeak;
      levels.master = Math.max(analyserPeak, tappedPeak);
    }
    const audibleChildPeak = this.project.tracks.reduce((peak, track) => {
      if (track.role === "master" || track.role === "fx-return" || !trackIsAudible(track, this.project.tracks)) return peak;
      return Math.max(peak, levels[track.id] || 0);
    }, 0);
    if (audibleChildPeak > 0) levels.master = Math.max(levels.master || 0, audibleChildPeak * 0.9);
    return levels;
  }

  private async tryStartNativePlayback(options: { useRenderCache?: boolean; reason?: string } = {}): Promise<boolean> {
    const useRenderCache = options.useRenderCache !== false && !this.nativeRenderCacheBypassedForLiveEdits;
    const cache = useRenderCache ? await this.ensureNativeRenderCache(options.reason || "play") : null;
    const events = cache ? this.events.filter((event) => !cache.cachedClipIds.has(event.clipId)) : this.events;
    if (cache) cache.proceduralFallbackEventCount = events.length;
    if (!events.length && !(cache?.regions.length)) return false;
    const payload = buildNativeAudioStartPayload(this.project, events, this.offsetSeconds, cache || undefined);
    const result = await this.nativePlayback.start(payload);
    if (!result.started) {
      this.nativeLastError = result.error;
      return false;
    }
    this.nativeStatus = result.status;
    this.nativeLastError = null;
    return true;
  }

  private async restartNativePlayback(seconds: number, options: { useRenderCache?: boolean; reason?: string } = {}) {
    if (this.playbackBackend !== "native-cpal") return;
    this.offsetSeconds = Math.max(0, seconds);
    this.nativeStartedAtMs = performance.now() - this.offsetSeconds * 1000;
    this.nativeMeterEventIndex = this.findEventIndex(this.offsetSeconds);
    const useRenderCache = options.useRenderCache !== false && !this.nativeRenderCacheBypassedForLiveEdits;
    const cache = useRenderCache ? await this.ensureNativeRenderCache(options.reason || this.lastProjectSyncReason || "restart") : null;
    const events = cache ? this.events.filter((event) => !cache.cachedClipIds.has(event.clipId)) : this.events;
    if (cache) cache.proceduralFallbackEventCount = events.length;
    const payload = buildNativeAudioStartPayload(this.project, events, this.offsetSeconds, cache || undefined);
    const result = await this.nativePlayback.start(payload);
    if (result.started) {
      this.nativeStatus = result.status;
      this.nativeLastError = null;
    } else {
      this.nativeLastError = result.error;
    }
  }

  private activeNativeRenderCache(): NativeRenderCache | null {
    return this.nativeRenderCacheBypassedForLiveEdits ? null : this.nativeRenderCache;
  }

  private async ensureNativeRenderCache(reason: string): Promise<NativeRenderCache | null> {
    const signature = nativeRenderCacheSignature(this.project);
    if (this.nativeRenderCache?.signature === signature) return this.nativeRenderCache;
    try {
      const started = nowMs();
      this.nativeRenderCache = await buildNativeRenderCache(this.project, signature);
      this.nativeRenderCacheBuildCount += 1;
      this.nativeRenderCacheLastBuildMs = Math.max(0, nowMs() - started);
      this.nativeRenderCacheLastBuildReason = reason;
      this.nativeRenderCacheError = null;
      return this.nativeRenderCache;
    } catch (error) {
      this.nativeRenderCache = null;
      this.nativeRenderCacheError = error instanceof Error ? error.message : "Native render cache failed.";
      return null;
    }
  }

  private syncNativeMixerControls() {
    if (this.playbackBackend !== "native-cpal") return;
    this.project.tracks.forEach((track) => {
      void this.nativePlayback.updateTrack({
        trackId: track.id,
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo
      }).then((status) => {
        if (status) this.nativeStatus = status;
      });
    });
  }

  private startNativeTicker() {
    this.stopNativeTicker();
    this.nativeTickTimer = window.setInterval(() => this.tickNativePlayback(), 35);
  }

  private stopNativeTicker() {
    if (this.nativeTickTimer !== null) window.clearInterval(this.nativeTickTimer);
    this.nativeTickTimer = null;
  }

  private tickNativePlayback() {
    if (this.playbackBackend !== "native-cpal" || !this.playing) return;
    const current = this.currentSeconds();
    this.handleNativeLoop(current);
    this.tapNativeMeters(current);
    const songEnd = barsToSeconds(this.project.timeline.bars, this.project.project.bpm, this.project.project.timeSig) + 0.4;
    if (!this.project.timeline.loop.enabled && current > songEnd) this.stop();
    else this.emitTick();
  }

  private handleNativeLoop(current: number) {
    if (!this.project.timeline.loop.enabled) return;
    const next = calculateLoopSeekSeconds(this.project, current);
    if (next !== null) {
      this.lastAudioDropCause = "loop";
      this.offsetSeconds = next;
      this.nativeStartedAtMs = performance.now() - next * 1000;
      this.repositionPlaybackIndexes(next);
      this.meterPeaks = {};
      void this.nativePlayback.seek(next).then((status) => {
        if (status) this.nativeStatus = status;
      });
      this.emitTick(true);
    }
  }

  private tapNativeMeters(current: number) {
    const horizon = current + 0.08;
    while (this.nativeMeterEventIndex < this.events.length && this.events[this.nativeMeterEventIndex].time <= horizon) {
      const event = this.events[this.nativeMeterEventIndex];
      if (event.time >= current - 0.04 && this.eventIsAudible(event)) this.tapMeter(event.trackId, event.velocity);
      this.nativeMeterEventIndex += 1;
    }
  }

  private repositionPlaybackIndexes(seconds: number) {
    this.nextEventIndex = this.findEventIndex(seconds);
    this.nextAudioRegionIndex = this.findAudioRegionIndex(seconds);
    this.nativeMeterEventIndex = this.nextEventIndex;
  }

  private repositionWebScheduler(seconds: number) {
    if (!this.ctx || !this.playing) return;
    this.repositionPlaybackIndexes(seconds);
  }

  private async ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ sampleRate: this.project.project.sampleRate });
    this.master = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterMeterData = new Uint8Array(this.masterAnalyser.fftSize);
    this.master.gain.value = 0.9;
    this.master.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.configureMixer("project-load");
  }

  private configureMixer(cause: AudioDropCause = "graph-rebuild") {
    if (!this.ctx || !this.master) return;
    this.audioGraphReconfigureCount += 1;
    if (this.playing && cause) this.lastAudioDropCause = cause;
    this.disposeMixer();
    this.trackOutputs.clear();
    const currentBar = secondsToBars(this.currentSeconds(), this.project.project.bpm, this.project.project.timeSig) + 1;
    this.project.tracks.forEach((track) => {
      if (track.role === "master") {
        this.master!.gain.setTargetAtTime(track.volume, this.ctx!.currentTime, 0.02);
        return;
      }
      const gain = this.ctx!.createGain();
      const analyser = this.ctx!.createAnalyser();
      const pan = "createStereoPanner" in this.ctx! ? this.ctx!.createStereoPanner() : null;
      const controls = getAutomatedTrackControls(this.project, track, currentBar);
      analyser.fftSize = 512;
      gain.gain.value = trackIsAudible(track, this.project.tracks) ? controls.volume : 0;
      if (pan) pan.pan.value = controls.pan;
      this.trackOutputs.set(track.id, {
        gain,
        analyser,
        pan,
        meterData: new Uint8Array(analyser.fftSize),
        cleanup: () => {}
      });
    });
    this.project.tracks.forEach((track) => {
      if (track.role === "master") return;
      const output = this.trackOutputs.get(track.id);
      if (!output) return;
      const fx = connectFxChain(this.ctx!, output.gain, output.analyser, getTrackFxChain(this.project, track));
      const destination = this.outputDestination(track);
      if (output.pan) {
        output.analyser.connect(output.pan);
        output.pan.connect(destination);
      } else {
        output.analyser.connect(destination);
      }
      output.cleanup = () => {
        fx.cleanup();
        safelyDisconnect(output.gain);
        safelyDisconnect(output.analyser);
        if (output.pan) safelyDisconnect(output.pan);
      };
    });
  }

  private updateTrackOutputControls(now: number) {
    const currentBar = secondsToBars(this.currentSeconds(), this.project.project.bpm, this.project.project.timeSig) + 1;
    this.project.tracks.forEach((track) => {
      if (track.role === "master") return;
      const output = this.trackOutputs.get(track.id);
      if (!output) return;
      const controls = getAutomatedTrackControls(this.project, track, currentBar);
      output.gain.gain.setTargetAtTime(trackIsAudible(track, this.project.tracks) ? controls.volume : 0, now, 0.018);
      if (output.pan) output.pan.pan.setTargetAtTime(controls.pan, now, 0.018);
    });
  }

  private disposeMixer() {
    this.trackOutputs.forEach((output) => output.cleanup());
    this.activeAudioSourcesStoppedByGraphReconfigureCount += this.activeAudioSources.length;
    this.stopActiveAudioSources();
  }

  private startScheduler() {
    if (this.schedulerTimer !== null) window.clearInterval(this.schedulerTimer);
    this.lastSchedulerTickAt = performance.now();
    this.schedulerTimer = window.setInterval(() => this.scheduleAhead(), this.schedulerIntervalMs);
    this.scheduleAhead();
  }

  private recordSchedulerTick() {
    const now = performance.now();
    const gap = this.lastSchedulerTickAt > 0 ? now - this.lastSchedulerTickAt : 0;
    if (gap > 0) {
      this.maxSchedulerGapMs = Math.max(this.maxSchedulerGapMs, gap);
      if (gap > this.schedulerIntervalMs * 2.5) this.missedSchedulerTickCount += 1;
    }
    this.lastSchedulerTickAt = now;
    this.schedulerTickCount += 1;
  }

  private scheduleAhead() {
    if (!this.ctx || !this.playing) return;
    this.recordSchedulerTick();
    const current = this.currentSeconds();
    this.updateAutomationControls(current);
    this.handleLoop(current);
    const horizon = this.currentSeconds() + this.schedulerLookaheadSeconds;
    while (this.nextEventIndex < this.events.length && this.events[this.nextEventIndex].time <= horizon) {
      const event = this.events[this.nextEventIndex];
      if (event.time >= this.currentSeconds() - 0.045) this.scheduleEvent(event);
      else {
        this.lateEventCount += 1;
        this.skippedLateEventCount += 1;
        this.lastAudioDropCause = "late-scheduler";
      }
      this.nextEventIndex += 1;
    }
    while (this.nextAudioRegionIndex < this.audioRegions.length && this.audioRegions[this.nextAudioRegionIndex].startTimeSeconds <= horizon) {
      const region = this.audioRegions[this.nextAudioRegionIndex];
      if (region.startTimeSeconds + region.durationSeconds >= this.currentSeconds() - 0.045) this.scheduleAudioRegion(region, this.currentSeconds());
      this.nextAudioRegionIndex += 1;
    }
    const songEnd = barsToSeconds(this.project.timeline.bars, this.project.project.bpm, this.project.project.timeSig) + 0.4;
    if (!this.project.timeline.loop.enabled && current > songEnd) this.stop();
    else this.emitTick();
  }

  private handleLoop(current: number) {
    if (!this.ctx || !this.project.timeline.loop.enabled) return;
    const next = calculateLoopSeekSeconds(this.project, current);
    if (next !== null) {
      this.offsetSeconds = next;
      this.startedAt = this.ctx.currentTime - next;
      this.nextEventIndex = this.findEventIndex(next);
      this.nextAudioRegionIndex = this.findAudioRegionIndex(next);
      this.stopActiveAudioSources();
      this.meterPeaks = {};
      this.emitTick(true);
    }
  }

  private scheduleEvent(event: RenderedEvent) {
    if (!this.ctx) return;
    if (!this.eventIsAudible(event)) return;
    const output = this.trackOutputs.get(event.trackId);
    if (!output) return;
    this.tapMeter(event.trackId, event.velocity);
    const scheduled = scheduleInstrumentEvent(this.ctx, output.gain, {
      ...event,
      time: this.startedAt + event.time
    }, {
      onLate: () => {
        this.lateEventCount += 1;
        this.lastAudioDropCause = "late-scheduler";
      },
      onSkippedLate: () => {
        this.skippedLateEventCount += 1;
        this.lastAudioDropCause = "late-scheduler";
      }
    });
    if (scheduled) this.scheduledEventCount += 1;
  }

  private scheduleAudioRegion(region: AudioRegion, currentSeconds: number) {
    if (!this.ctx) return;
    const cached = getCachedAudioBuffer(region.mediaPoolItemId);
    if (!cached) {
      this.skippedLateEventCount += 1;
      return;
    }
    const output = this.trackOutputs.get(region.trackId);
    if (!output) return;
    const sourceElapsed = Math.max(0, currentSeconds - region.startTimeSeconds);
    const offset = Math.max(0, region.sourceOffsetSeconds + sourceElapsed);
    if (offset >= cached.buffer.duration) return;
    const remainingRegion = Math.max(0, region.durationSeconds - sourceElapsed);
    const duration = Math.min(remainingRegion, cached.buffer.duration - offset);
    if (duration <= 0) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = cached.buffer;
    gain.gain.value = Math.max(0, region.gain);
    source.connect(gain);
    gain.connect(output.gain);
    const when = this.startedAt + Math.max(region.startTimeSeconds, currentSeconds);
    source.start(Math.max(this.ctx.currentTime, when), offset, duration);
    source.onended = () => {
      safelyDisconnect(source);
      safelyDisconnect(gain);
      this.activeAudioSources = this.activeAudioSources.filter((item) => item !== source);
    };
    this.activeAudioSources.push(source);
    this.tapMeter(region.trackId, Math.min(1, Math.max(0.18, region.gain)));
    this.scheduledEventCount += 1;
  }

  private primeMeters(seconds: number) {
    const horizon = seconds + 0.28;
    for (let index = this.findEventIndex(seconds); index < this.events.length && this.events[index].time <= horizon; index += 1) {
      const event = this.events[index];
      if (this.eventIsAudible(event)) this.tapMeter(event.trackId, event.velocity);
    }
  }

  private eventIsAudible(event: RenderedEvent) {
    const track = this.project.tracks.find((item) => item.id === event.trackId);
    return !!track && trackIsAudible(track, this.project.tracks);
  }

  private updateAutomationControls(seconds: number) {
    if (!this.ctx || !activeAutomationLaneCount(this.project)) return;
    const bar = secondsToBars(seconds, this.project.project.bpm, this.project.project.timeSig) + 1;
    this.project.tracks.forEach((track) => {
      if (track.role === "master") return;
      const output = this.trackOutputs.get(track.id);
      if (!output) return;
      const controls = getAutomatedTrackControls(this.project, track, bar);
      output.gain.gain.setTargetAtTime(trackIsAudible(track, this.project.tracks) ? controls.volume : 0, this.ctx!.currentTime, 0.035);
      if (output.pan) output.pan.pan.setTargetAtTime(controls.pan, this.ctx!.currentTime, 0.035);
    });
  }

  private outputDestination(track: Track): AudioNode {
    if (!this.master) throw new Error("Master output is not configured.");
    const outputId = track.routing.outputId || "master";
    if (outputId !== "master") {
      const bus = this.project.tracks.find((item) => item.id === outputId && item.trackType === "bus");
      const busOutput = bus ? this.trackOutputs.get(bus.id) : null;
      if (bus && busOutput && bus.id !== track.id) return busOutput.gain;
    }
    return this.master;
  }

  private tapMeter(trackId: string, velocity: number) {
    const value = Math.max(0.12, Math.min(1, velocity));
    this.meterPeaks[trackId] = Math.max(this.meterPeaks[trackId] || 0, value);
    this.meterPeaks.master = Math.max(this.meterPeaks.master || 0, value * 0.9);
  }

  private findEventIndex(seconds: number) {
    const index = this.events.findIndex((event) => event.time >= seconds);
    return index === -1 ? this.events.length : index;
  }

  private findAudioRegionIndex(seconds: number) {
    const index = this.audioRegions.findIndex((region) => region.startTimeSeconds + region.durationSeconds >= seconds);
    return index === -1 ? this.audioRegions.length : index;
  }

  private stopActiveAudioSources() {
    this.activeAudioSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      safelyDisconnect(source);
    });
    this.activeAudioSources = [];
  }

  private emitTick(force = false) {
    const now = performance.now();
    if (!force && now - this.lastTickEmit < 66) return;
    this.lastTickEmit = now;
    const seconds = this.currentSeconds();
    this.onTick({
      playing: this.playing,
      seconds,
      bar: secondsToBars(seconds, this.project.project.bpm, this.project.project.timeSig) + 1
    });
  }
}

function safelyDisconnect(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function readAnalyserPeak(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(data);
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) {
    peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
  }
  return Math.max(0, Math.min(1, peak * 1.8));
}

function countEventsBy(events: RenderedEvent[], field: "trackId" | "kind"): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event[field]] = (counts[event[field]] || 0) + 1;
    return counts;
  }, {});
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function chordsmithSectionCount(project: PocketDawProject): number {
  return project.sourceRefs.reduce((count, ref) => {
    if (!isRecord(ref.normalized) || !isRecord(ref.normalized.sections)) return count;
    return count + Object.keys(ref.normalized.sections).length;
  }, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
