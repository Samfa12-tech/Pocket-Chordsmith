import type { PocketDawProject, Track } from "../daw/schema";
import { cloneProject } from "../daw/dawProject";
import { trackIsAudible } from "../daw/tracks";
import { barsToSeconds, secondsToBars } from "../daw/timeline";
import { renderTimelineEvents, type RenderedEvent } from "./eventRenderer";
import { renderTimelineAudioRegions, scheduleAudioRegionEnvelope, type AudioRegion } from "./audioRegions";
import { getCachedAudioBuffer } from "./audioBufferCache";
import { getTrackFxChain } from "../daw/fx";
import { DRUM_LANE_DEFS, getDrumLaneFxChain, isDrumEventKind } from "../daw/drumLanes";
import { connectFxChain } from "./fxProcessor";
import { scheduleInstrumentEvent } from "./instruments";
import { chordsmithSidechainSettings, isChordsmithSidechainTrigger, scheduleChordsmithSidechainDuck } from "./sidechain";
import { activeAutomationLaneCount, getAutomatedTrackControls } from "../daw/automation";
import { activeTrackSendRoutes } from "../daw/routing";
import { buildNativeAudioStartPayload, NativeAudioPlaybackBridge, type NativeAudioStartResult, type NativeAudioStatus } from "../native/audioPlayback";
import type { RecordingNativePlaybackAnchor } from "../app/state";
import {
  buildNativeRenderCache,
  buildNativeRuntimeAudioCache,
  filterNativeRenderCacheForProject,
  hydrateNativeRenderCacheAssets,
  nativeRenderCacheSignature,
  nativeRuntimeAudioCacheSignature,
  persistNativeRenderCacheAssets,
  type NativeRenderCachePersistOptions,
  type NativeRenderCache,
  type NativeRenderCacheHydrationResult,
  type NativeRenderCachePersistResult
} from "./nativeRenderCache";
import type { NativeMediaApi } from "../native/mediaBridge";

interface TrackOutput {
  gain: GainNode;
  analyser: AnalyserNode;
  sidechain: GainNode | null;
  pan: StereoPannerNode | null;
  meterData: Uint8Array<ArrayBuffer>;
  cleanup: () => void;
}

interface DrumLaneOutput {
  input: GainNode;
  cleanup: () => void;
}

interface NativePlaybackBridgeLike {
  start(payload: ReturnType<typeof buildNativeAudioStartPayload>): Promise<NativeAudioStartResult>;
  pause(): Promise<NativeAudioStatus | null>;
  resume(): Promise<NativeAudioStatus | null>;
  stop(): Promise<NativeAudioStatus | null>;
  seek(seconds: number): Promise<NativeAudioStatus | null>;
  updateTrack(patch: TrackMixerControlPatch & { trackId: string }): Promise<NativeAudioStatus | null>;
  status(): Promise<NativeAudioStatus | null>;
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

type PlaybackBackend = "native-cpal" | "native-cpal-paused" | "web-audio" | "idle";
type NativeStartOutcome = "started" | "unavailable" | "failed";
type AudioDropCause = "seek" | "stop" | "project-load" | "graph-rebuild" | "loop" | "late-scheduler" | null;
const safeSyncLeadSeconds = 0.2;

interface NativeRestartRequest {
  token: number;
  seconds: number;
  options: {
    useRenderCache?: boolean;
    reason?: string;
  };
}

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
  private drumLaneOutputs = new Map<string, DrumLaneOutput>();
  private master: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterMeterData: Uint8Array<ArrayBuffer> | null = null;
  private schedulerTimer: number | null = null;
  private nativeTickTimer: number | null = null;
  private nativePlayback: NativePlaybackBridgeLike;
  private nativeRenderCache: NativeRenderCache | null = null;
  private nativeRenderCacheBuildPromise: Promise<NativeRenderCache | null> | null = null;
  private nativeRenderCacheBuildSignature: string | null = null;
  private nativeRuntimeAudioCache: NativeRenderCache | null = null;
  private nativeRuntimeAudioCacheBuildPromise: Promise<NativeRenderCache | null> | null = null;
  private nativeRuntimeAudioCacheBuildSignature: string | null = null;
  private nativeRuntimeAudioCachePrewarmHandle: number | null = null;
  private nativeRuntimeAudioCachePrewarmUsesIdleCallback = false;
  private nativeRenderCacheError: string | null = null;
  private nativeRenderCacheBypassedForLiveEdits = false;
  private nativeRenderCacheStaleForLiveEdits = false;
  private nativeRenderCacheBuildCount = 0;
  private nativeRenderCacheDiscardedBuildCount = 0;
  private nativeRenderCacheLastBuildMs = 0;
  private nativeRenderCacheLastBuildReason: string | null = null;
  private nativeRenderCacheHydratedCount = 0;
  private nativeRenderCacheHydrationFailureCount = 0;
  private nativeRenderCacheStaleSourceHashCount = 0;
  private nativeRenderCacheSkippedInvalidPathCount = 0;
  private nativeRenderCacheHydratedReadByteCount = 0;
  private nativeRenderCachePrewarmHandle: number | null = null;
  private nativeRenderCachePrewarmUsesIdleCallback = false;
  private nativeRenderCachePrewarmScheduled = false;
  private nativeRenderCachePendingReason: string | null = null;
  private playbackBackend: PlaybackBackend = "idle";
  private nativeStartedAtMs = 0;
  private nativePlaybackStartedWithRenderCache = false;
  private nativeStatus: NativeAudioStatus | null = null;
  private nativeLastError: string | null = null;
  private nativeRestartToken = 0;
  private pendingNativeRestart: NativeRestartRequest | null = null;
  private nativeRestartFlush: Promise<void> | null = null;
  private nativeStatusRefreshInFlight = false;
  private nativeLastStatusRefreshAtMs = 0;
  private nativeLiveCompositionCacheToken = 0;
  private nativeMeterEventIndex = 0;
  private nativeRegionMeterLastTapAt = 0;
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

  constructor(project: PocketDawProject, nativePlayback: NativePlaybackBridgeLike = new NativeAudioPlaybackBridge()) {
    this.nativePlayback = nativePlayback;
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

  prewarmNativeRenderCache(reason = "prewarm"): boolean {
    return this.scheduleNativeRenderCachePrewarm(reason);
  }

  async rebuildNativeRenderCache(reason = "manual-cache-build"): Promise<NativeRenderCache | null> {
    this.cancelNativeRenderCachePrewarm();
    const cache = await this.ensureNativeRenderCache(reason);
    if (cache) await this.activateNativeRenderCacheForCurrentPlayback(reason);
    return cache;
  }

  async persistNativeRenderCache(projectFilePath: string, reason = "persist-native-cache", options?: NativeRenderCachePersistOptions): Promise<NativeRenderCachePersistResult | null> {
    this.cancelNativeRenderCachePrewarm();
    const cache = await this.ensureNativeRenderCache(reason);
    if (!cache) return null;
    const result = await persistNativeRenderCacheAssets(projectFilePath, cache, undefined, options);
    if (result.cache.assets.length || result.cache.regions.length) await this.activateNativeRenderCacheForCurrentPlayback(reason);
    return result;
  }

  async hydrateNativeRenderCache(projectFilePath: string, reason = "project-open-hydrate-native-cache", api?: NativeMediaApi): Promise<NativeRenderCacheHydrationResult> {
    this.cancelNativeRenderCachePrewarm();
    const result = await hydrateNativeRenderCacheAssets(projectFilePath, this.project, api);
    this.nativeRenderCacheHydratedCount = result.hydratedCacheItemCount;
    this.nativeRenderCacheHydrationFailureCount = result.hydrationFailureCount;
    this.nativeRenderCacheStaleSourceHashCount = result.staleSourceHashCount;
    this.nativeRenderCacheSkippedInvalidPathCount = result.skippedInvalidPathCount;
    this.nativeRenderCacheHydratedReadByteCount = result.hydratedCacheReadByteCount;
    this.nativeRenderCacheLastBuildReason = reason;
    this.nativeRenderCacheError = result.errors[0] || null;
    if (result.cache && result.cache.signature === nativeRenderCacheSignature(this.project)) {
      this.nativeRenderCache = result.cache;
    }
    return result;
  }

  getNativeRuntimeAudioPreparationState(): {
    audioRegionCount: number;
    cachedAudioRegionCount: number;
    preparedAudioRegionCount: number;
    needsPreparation: boolean;
  } {
    const cachedAudioRegionCount = this.audioRegions.filter((region) => {
      const cached = getCachedAudioBuffer(region.mediaPoolItemId);
      return !!cached && cached.channels >= 1 && cached.channels <= 2 && cached.buffer.duration > region.sourceOffsetSeconds;
    }).length;
    const preparedAudioRegionCount = Math.max(this.readyNativeRenderCache()?.runtimeAudioRegionCount || 0, this.readyNativeRuntimeAudioCache()?.runtimeAudioRegionCount || 0);

    return {
      audioRegionCount: this.audioRegions.length,
      cachedAudioRegionCount,
      preparedAudioRegionCount: Math.min(preparedAudioRegionCount, cachedAudioRegionCount),
      needsPreparation: cachedAudioRegionCount > 0 && preparedAudioRegionCount < cachedAudioRegionCount
    };
  }

  async prepareNativeRuntimeAudioForPlayback(reason = "prepare-native-runtime-audio"): Promise<void> {
    if (!this.audioRegions.length) return;
    this.nativeRenderCacheLastBuildReason = reason;
    await this.ensureNativeRuntimeAudioCache();
  }

  syncProject(project: PocketDawProject, mode: AudioProjectSyncMode, reason: string = mode) {
    const current = this.currentSeconds();
    const previousNativeRenderCache = this.nativeRenderCache;
    this.project = cloneProject(project);
    this.projectSyncCount += 1;
    this.lastProjectSyncMode = mode;
    this.lastProjectSyncReason = reason;

    const liveNativeCompositionEdit = mode === "composition-events" && this.playbackBackend === "native-cpal" && this.playing;

    if (mode !== "mixer-controls") {
      this.events = renderTimelineEvents(this.project);
      this.audioRegions = renderTimelineAudioRegions(this.project).audioRegions;
      const renderCacheSignature = nativeRenderCacheSignature(this.project);
      const keepPreviousNativeRenderCache = !!previousNativeRenderCache
        && (previousNativeRenderCache.signature === renderCacheSignature || liveNativeCompositionEdit);
      this.nativeRenderCache = keepPreviousNativeRenderCache ? previousNativeRenderCache : null;
      this.nativeRenderCacheStaleForLiveEdits = !!previousNativeRenderCache
        && liveNativeCompositionEdit
        && previousNativeRenderCache.signature !== renderCacheSignature;
      this.cancelNativeRenderCachePrewarm();
      this.cancelNativeRuntimeAudioCachePrewarm();
      if (!this.runtimeAudioCacheStillValidFor(project)) this.nativeRuntimeAudioCache = null;
      if (this.playbackBackend === "native-cpal-paused") {
        this.playbackBackend = "idle";
        void this.nativePlayback.stop().then((status) => {
          if (status) this.nativeStatus = status;
        });
      }
      if (mode === "project-load" || mode === "timeline-structure" || !this.playing) {
        this.nativeRenderCacheBypassedForLiveEdits = false;
        this.nativeRenderCacheStaleForLiveEdits = false;
      }
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
        this.nativeRenderCacheBypassedForLiveEdits = false;
        const stalePlaybackCache = this.playableNativeRenderCache();
        void this.restartNativePlayback(current, { reason: `${reason}-stale-cache`, useRenderCache: !!stalePlaybackCache });
        this.deferNativeRenderCacheRefresh(reason);
      } else if (this.readyNativeRenderCache()) {
        void this.restartNativePlayback(current, { reason });
      } else {
        void this.restartNativePlaybackAfterFreshRenderCache(reason);
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

    if (mode !== "mixer-controls" && !this.playing && !this.nativeRenderCacheBypassedForLiveEdits) {
      if (!this.scheduleNativeRuntimeAudioCachePrewarm(reason)) this.scheduleNativeRenderCachePrewarm(reason);
    }
  }

  updateTrackMixerControl(trackId: string, patch: TrackMixerControlPatch): boolean {
    const track = this.project.tracks.find((item) => item.id === trackId);
    if (!track) return false;

    if (patch.volume !== undefined) track.volume = clampNumber(patch.volume, 0, 1.2);
    if (patch.pan !== undefined) track.pan = clampNumber(patch.pan, -1, 1);
    if (patch.mute !== undefined) track.mute = patch.mute;
    if (patch.solo !== undefined) track.solo = patch.solo;

    if (this.playbackBackend === "native-cpal" || this.playbackBackend === "native-cpal-paused") {
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
    if (this.canResumePausedNativePlayback()) {
      const resumed = await this.resumeNativePlayback();
      if (resumed) return;
    }

    const nativeStart = await this.tryStartNativePlayback();
    if (nativeStart === "started") {
      this.playing = true;
      this.playbackBackend = "native-cpal";
      this.nativeStartedAtMs = performance.now() - this.offsetSeconds * 1000;
      this.nativeMeterEventIndex = this.findEventIndex(this.offsetSeconds);
      this.nextEventIndex = this.nativeMeterEventIndex;
      this.nextAudioRegionIndex = this.findAudioRegionIndex(this.offsetSeconds);
      this.primeMeters(this.offsetSeconds);
      this.startNativeTicker();
      this.activateReadyNativeRenderCacheAfterFallback("play-cache-ready");
      this.emitTick(true);
      return;
    }
    if (nativeStart === "failed" || (nativeStart === "unavailable" && this.nativeRuntimeShouldOwnPlayback())) {
      this.playing = false;
      this.playbackBackend = "idle";
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
    this.cancelPendingNativeRestarts();
    this.playing = false;
    this.playbackBackend = "idle";
    this.nativePlaybackStartedWithRenderCache = false;
    this.nativeRenderCacheBypassedForLiveEdits = false;
    this.nativeRenderCacheStaleForLiveEdits = false;
    this.scheduleNativeRenderCachePrewarm(this.nativeRenderCachePendingReason || "stop-idle");
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
    if (this.ctx && this.master) this.configureMixer("stop");
    this.emitTick(true);
  }

  pause() {
    this.cancelPendingNativeRestarts();
    const wasNative = this.playbackBackend === "native-cpal";
    this.offsetSeconds = this.currentSeconds();
    this.playing = false;
    this.playbackBackend = wasNative ? "native-cpal-paused" : "idle";
    this.stopNativeTicker();
    if (wasNative) {
      void this.nativePlayback.pause().then((status) => {
        if (status) this.nativeStatus = status;
      });
    }
    if (this.schedulerTimer !== null) window.clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
    if (this.ctx && this.master) this.configureMixer("stop");
    this.emitTick(true);
  }

  restart() {
    this.nativeRenderCacheBypassedForLiveEdits = false;
    this.nativeRenderCacheStaleForLiveEdits = false;
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
    if ((this.playbackBackend === "native-cpal" && this.playing) || this.playbackBackend === "native-cpal-paused") {
      if (this.playing) this.nativeStartedAtMs = performance.now() - this.offsetSeconds * 1000;
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

  isNativePlaybackActive(): boolean {
    return this.playbackBackend === "native-cpal" || this.playbackBackend === "native-cpal-paused";
  }

  canResumePausedNativePlayback(): boolean {
    return this.playbackBackend === "native-cpal-paused" && !this.playing && !this.nativeRenderCacheBypassedForLiveEdits;
  }

  async nativePlaybackRecordingAnchor(source: string, snapshotMonotonicMs: number = performance.now()): Promise<RecordingNativePlaybackAnchor> {
    let status = this.nativeStatus;
    if (this.isNativePlaybackActive()) {
      const refreshed = await this.nativePlayback.status();
      if (refreshed) {
        status = refreshed;
        this.nativeStatus = refreshed;
      }
    }
    return {
      source,
      snapshotMonotonicMs,
      active: !!status?.active,
      playing: !!status?.playing,
      positionSeconds: finiteOrNull(status?.positionSeconds),
      renderedFrameCount: finiteOrNull(status?.renderedFrameCount),
      startedGeneration: finiteOrNull(status?.startedGeneration),
      sampleRate: finiteOrNull(status?.sampleRate),
      channels: finiteOrNull(status?.channels)
    };
  }

  getDiagnostics() {
    const activeNativeRenderCache = this.activeNativeRenderCache();
    const nativePlaybackActive = this.playbackBackend === "native-cpal" || this.playbackBackend === "native-cpal-paused";
    const proceduralFallbackEventCount = activeNativeRenderCache && nativePlaybackActive
      ? this.nativePlaybackEvents(activeNativeRenderCache).proceduralFallbackEventCount
      : activeNativeRenderCache?.proceduralFallbackEventCount ?? this.events.length;
    return {
      playbackBackend: this.playbackBackend,
      nativeAudio: {
        requested: true,
        active: this.playbackBackend === "native-cpal" || this.playbackBackend === "native-cpal-paused",
        status: this.nativeStatus,
        lastError: this.nativeLastError,
        fallback: this.playbackBackend === "web-audio" ? "web-audio" : null,
        supportedMaterial: activeNativeRenderCache?.runtimeAudioRegionCount ? "generated-midi-events-and-loaded-audio-regions" : "generated-and-midi-events",
        unsupportedMaterial: this.audioRegions.length && !activeNativeRenderCache?.runtimeAudioRegionCount ? "audio-regions-need-runtime-buffer-or-native-cache" : null
      },
      nativeRenderCache: {
        assetCount: activeNativeRenderCache?.assets.length || 0,
        assetRegionCount: activeNativeRenderCache?.regions.length || 0,
        cachedClipCount: activeNativeRenderCache?.cachedClipIds.size || 0,
        renderCacheMetadataCount: activeNativeRenderCache?.renderCacheItems.length || 0,
        renderCacheHitCount: activeNativeRenderCache?.renderCacheHitCount || 0,
        renderCacheMissCount: activeNativeRenderCache?.renderCacheMissCount || 0,
        proceduralFallbackEventCount,
        generatedRegionCount: activeNativeRenderCache?.generatedRegionCount || 0,
        runtimeAudioRegionCount: activeNativeRenderCache?.runtimeAudioRegionCount || 0,
        missingRuntimeAudioRegionCount: activeNativeRenderCache?.missingRuntimeAudioRegionCount || 0,
        cachedAssetByteCount: activeNativeRenderCache?.cachedAssetByteCount || 0,
        buildPending: this.nativeRenderCacheBuildPromise !== null,
        prewarmScheduled: this.nativeRenderCachePrewarmScheduled,
        pendingReason: this.nativeRenderCachePendingReason,
        nativeRenderCacheBypassedForLiveEdits: this.nativeRenderCacheBypassedForLiveEdits,
        nativeRenderCacheStaleForLiveEdits: this.nativeRenderCacheStaleForLiveEdits,
        buildCount: this.nativeRenderCacheBuildCount,
        discardedBuildCount: this.nativeRenderCacheDiscardedBuildCount,
        lastBuildMs: this.nativeRenderCacheLastBuildMs,
        lastBuildReason: this.nativeRenderCacheLastBuildReason,
        lastError: this.nativeRenderCacheError,
        hydratedCacheItemCount: this.nativeRenderCacheHydratedCount,
        hydrationFailureCount: this.nativeRenderCacheHydrationFailureCount,
        staleSourceHashCount: this.nativeRenderCacheStaleSourceHashCount,
        skippedInvalidPathCount: this.nativeRenderCacheSkippedInvalidPathCount,
        hydratedCacheReadByteCount: this.nativeRenderCacheHydratedReadByteCount
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

  private async resumeNativePlayback(): Promise<boolean> {
    const status = await this.nativePlayback.resume();
    if (!status?.active || !status.playing) {
      this.playbackBackend = "idle";
      this.nativeStatus = status;
      return false;
    }
    this.nativeStatus = status;
    this.nativeLastError = null;
    this.offsetSeconds = Math.max(0, status.positionSeconds || this.offsetSeconds);
    this.playing = true;
    this.playbackBackend = "native-cpal";
    this.nativeStartedAtMs = performance.now() - this.offsetSeconds * 1000;
    this.nativeMeterEventIndex = this.findEventIndex(this.offsetSeconds);
    this.nextEventIndex = this.nativeMeterEventIndex;
    this.nextAudioRegionIndex = this.findAudioRegionIndex(this.offsetSeconds);
    this.primeMeters(this.offsetSeconds);
    this.startNativeTicker();
    this.emitTick(true);
    return true;
  }

  private async tryStartNativePlayback(options: { useRenderCache?: boolean; reason?: string } = {}): Promise<NativeStartOutcome> {
    this.cancelPendingNativeRestarts();
    const useRenderCache = options.useRenderCache !== false;
    const cache = useRenderCache && !this.nativeRenderCacheBypassedForLiveEdits ? this.playableNativeRenderCache() : null;
    if (useRenderCache && !cache) this.deferNativeRenderCacheRefresh(options.reason || "play-fallback-cache-build", { scheduleWhenIdle: false });
    const playbackCache = useRenderCache ? await this.nativePlaybackCacheWithRuntimeAudio(cache) : cache;
    const playbackEvents = this.nativePlaybackEvents(playbackCache);
    const events = playbackEvents.events;
    if (playbackCache) playbackCache.proceduralFallbackEventCount = playbackEvents.proceduralFallbackEventCount;
    if (!events.length && !(playbackCache?.regions.length)) return "unavailable";
    const payload = buildNativeAudioStartPayload(this.project, events, this.offsetSeconds, playbackCache || undefined);
    const result = await this.nativePlayback.start(payload);
    if (!result.started) {
      this.nativeLastError = result.error;
      this.nativePlaybackStartedWithRenderCache = false;
      return result.unavailable ? "unavailable" : "failed";
    }
    this.nativePlaybackStartedWithRenderCache = !!playbackCache?.regions.length;
    this.nativeStatus = result.status;
    this.nativeLastError = null;
    return "started";
  }

  private restartNativePlayback(seconds: number, options: { useRenderCache?: boolean; reason?: string } = {}): Promise<void> {
    const request: NativeRestartRequest = {
      token: this.nativeRestartToken + 1,
      seconds: Math.max(0, seconds),
      options
    };
    this.nativeRestartToken = request.token;
    this.pendingNativeRestart = request;
    if (!this.nativeRestartFlush) {
      this.nativeRestartFlush = Promise.resolve()
        .then(() => this.flushNativeRestarts())
        .finally(() => {
          this.nativeRestartFlush = null;
        });
    }
    return this.nativeRestartFlush;
  }

  private async flushNativeRestarts(): Promise<void> {
    while (this.pendingNativeRestart) {
      const request = this.pendingNativeRestart;
      this.pendingNativeRestart = null;
      await this.performNativeRestart(request);
    }
  }

  private async performNativeRestart(request: NativeRestartRequest): Promise<void> {
    if (request.token !== this.nativeRestartToken || this.playbackBackend !== "native-cpal" || !this.playing) return;
    this.offsetSeconds = request.seconds;
    this.nativeStartedAtMs = performance.now() - this.offsetSeconds * 1000;
    this.nativeMeterEventIndex = this.findEventIndex(this.offsetSeconds);
    const useRenderCache = request.options.useRenderCache !== false;
    const cache = useRenderCache && !this.nativeRenderCacheBypassedForLiveEdits ? this.playableNativeRenderCache() : null;
    if (useRenderCache && !cache) this.deferNativeRenderCacheRefresh(request.options.reason || this.lastProjectSyncReason || "restart-fallback-cache-build");
    const playbackCache = useRenderCache ? await this.nativePlaybackCacheWithRuntimeAudio(cache) : cache;
    if (request.token !== this.nativeRestartToken || this.playbackBackend !== "native-cpal" || !this.playing) return;
    const playbackEvents = this.nativePlaybackEvents(playbackCache);
    const events = playbackEvents.events;
    if (playbackCache) playbackCache.proceduralFallbackEventCount = playbackEvents.proceduralFallbackEventCount;
    const payload = buildNativeAudioStartPayload(this.project, events, this.offsetSeconds, playbackCache || undefined);
    const result = await this.nativePlayback.start(payload);
    if (request.token !== this.nativeRestartToken) return;
    if (result.started) {
      this.nativePlaybackStartedWithRenderCache = !!playbackCache?.regions.length;
      this.nativeStatus = result.status;
      this.nativeLastError = null;
    } else {
      this.nativePlaybackStartedWithRenderCache = false;
      this.nativeLastError = result.error;
    }
  }

  private cancelPendingNativeRestarts() {
    this.nativeRestartToken += 1;
    this.pendingNativeRestart = null;
  }

  private async restartNativePlaybackAfterFreshRenderCache(reason: string): Promise<void> {
    const token = this.nativeLiveCompositionCacheToken + 1;
    this.nativeLiveCompositionCacheToken = token;
    const cache = await this.ensureNativeRenderCache(reason);
    if (token !== this.nativeLiveCompositionCacheToken || this.playbackBackend !== "native-cpal" || !this.playing) return;
    if (cache) {
      this.nativeRenderCacheBypassedForLiveEdits = false;
      this.nativeRenderCacheStaleForLiveEdits = false;
      await this.restartNativePlayback(this.currentSeconds(), { reason, useRenderCache: true });
      return;
    }
    if (this.playableNativeRenderCache()) return;
    if (this.activeNativePlaybackLooksProceduralFallback()) return;
    await this.restartNativePlayback(this.currentSeconds(), { reason, useRenderCache: false });
  }

  private activeNativeRenderCache(): NativeRenderCache | null {
    const cache = this.playableNativeRenderCache();
    const runtimeCache = this.readyNativeRuntimeAudioCache();
    if (this.nativeRenderCacheBypassedForLiveEdits) return runtimeCache;
    if (!cache) return runtimeCache;
    if (runtimeCache && cache.runtimeAudioRegionCount < this.audioRegions.length) return mergeNativePlaybackCaches(cache, runtimeCache);
    return cache;
  }

  private async nativePlaybackCacheWithRuntimeAudio(cache: NativeRenderCache | null): Promise<NativeRenderCache | null> {
    if (!this.audioRegions.length) return cache;
    if (cache && cache.runtimeAudioRegionCount >= this.audioRegions.length) return cache;
    const runtimeCache = await this.ensureNativeRuntimeAudioCache();
    if (!runtimeCache) return cache;
    if (!runtimeCache.regions.length) return cache;
    if (!cache) return runtimeCache;
    return mergeNativePlaybackCaches(cache, runtimeCache);
  }

  private nativePlaybackEvents(cache: NativeRenderCache | null): { events: RenderedEvent[]; proceduralFallbackEventCount: number } {
    if (!cache) return { events: this.events, proceduralFallbackEventCount: this.events.length };
    const sidechain = chordsmithSidechainSettings(this.project);
    const events: RenderedEvent[] = [];
    let proceduralFallbackEventCount = 0;
    for (const event of this.events) {
      if (!this.nativeCacheCoversEvent(cache, event)) {
        events.push(event);
        proceduralFallbackEventCount += 1;
      } else if (sidechain?.enabled && isChordsmithSidechainTrigger(event)) {
        events.push({
          ...event,
          id: `${event.id}_cached_sidechain_trigger`,
          velocity: 0
        });
      }
    }
    return { events, proceduralFallbackEventCount };
  }

  private readyNativeRuntimeAudioCache(): NativeRenderCache | null {
    if (!this.nativeRuntimeAudioCache) return null;
    return this.nativeRuntimeAudioCache.signature === nativeRuntimeAudioCacheSignature(this.project) ? this.nativeRuntimeAudioCache : null;
  }

  private runtimeAudioCacheStillValidFor(project: PocketDawProject): boolean {
    return !!this.nativeRuntimeAudioCache && this.nativeRuntimeAudioCache.signature === nativeRuntimeAudioCacheSignature(project);
  }

  private async ensureNativeRuntimeAudioCache(): Promise<NativeRenderCache | null> {
    const signature = nativeRuntimeAudioCacheSignature(this.project);
    if (this.nativeRuntimeAudioCache?.signature === signature) return this.nativeRuntimeAudioCache;
    if (this.nativeRuntimeAudioCacheBuildPromise && this.nativeRuntimeAudioCacheBuildSignature === signature) return this.nativeRuntimeAudioCacheBuildPromise;
    const projectSnapshot = cloneProject(this.project);
    this.nativeRuntimeAudioCacheBuildSignature = signature;
    this.nativeRuntimeAudioCacheBuildPromise = (async () => {
      try {
        const cache = await buildNativeRuntimeAudioCache(projectSnapshot, signature);
        if (nativeRuntimeAudioCacheSignature(this.project) !== signature) return null;
        this.nativeRuntimeAudioCache = cache;
        return this.nativeRuntimeAudioCache;
      } catch {
        this.nativeRuntimeAudioCache = null;
        return null;
      } finally {
        if (this.nativeRuntimeAudioCacheBuildSignature === signature) {
          this.nativeRuntimeAudioCacheBuildSignature = null;
          this.nativeRuntimeAudioCacheBuildPromise = null;
        }
      }
    })();
    return this.nativeRuntimeAudioCacheBuildPromise;
  }

  private readyNativeRenderCache(): NativeRenderCache | null {
    if (!this.nativeRenderCache) return null;
    return this.nativeRenderCache.signature === nativeRenderCacheSignature(this.project) ? this.nativeRenderCache : null;
  }

  private playableNativeRenderCache(): NativeRenderCache | null {
    const cache = this.readyNativeRenderCache();
    if (cache) return cache;
    if (this.nativeRenderCacheStaleForLiveEdits && this.playbackBackend === "native-cpal" && this.playing) {
      return this.nativeRenderCache
        ? filterNativeRenderCacheForProject(this.project, this.nativeRenderCache, nativeRenderCacheSignature(this.project))
        : null;
    }
    return null;
  }

  private async ensureNativeRenderCache(reason: string): Promise<NativeRenderCache | null> {
    const signature = nativeRenderCacheSignature(this.project);
    if (this.nativeRenderCache?.signature === signature) return this.nativeRenderCache;
    if (this.nativeRenderCacheBuildPromise && this.nativeRenderCacheBuildSignature === signature) return this.nativeRenderCacheBuildPromise;
    const projectSnapshot = cloneProject(this.project);
    this.nativeRenderCacheBuildSignature = signature;
    const reusableCache = this.nativeRenderCache;
    this.nativeRenderCacheBuildPromise = (async () => {
      try {
        const started = nowMs();
        const cache = await buildNativeRenderCache(projectSnapshot, signature, reusableCache);
        this.nativeRenderCacheBuildCount += 1;
        this.nativeRenderCacheLastBuildMs = Math.max(0, nowMs() - started);
        this.nativeRenderCacheLastBuildReason = reason;
        this.nativeRenderCacheError = null;
        if (nativeRenderCacheSignature(this.project) !== signature) {
          this.nativeRenderCacheDiscardedBuildCount += 1;
          return null;
        }
        this.nativeRenderCache = cache;
        this.nativeRenderCacheStaleForLiveEdits = false;
        return this.nativeRenderCache;
      } catch (error) {
        if (!this.nativeRenderCacheStaleForLiveEdits) this.nativeRenderCache = null;
        this.nativeRenderCacheError = error instanceof Error ? error.message : "Native render cache failed.";
        return null;
      } finally {
        if (this.nativeRenderCacheBuildSignature === signature) {
          this.nativeRenderCacheBuildSignature = null;
          this.nativeRenderCacheBuildPromise = null;
        }
      }
    })();
    return this.nativeRenderCacheBuildPromise;
  }

  private async activateNativeRenderCacheForCurrentPlayback(reason: string, options: { onlyIfProceduralFallback?: boolean } = {}): Promise<void> {
    this.nativeRenderCacheBypassedForLiveEdits = false;
    if (this.playbackBackend !== "native-cpal" || !this.playing) return;
    const cache = this.playableNativeRenderCache();
    if (!cache?.regions.length) return;
    if (options.onlyIfProceduralFallback && !this.activeNativePlaybackLooksProceduralFallback()) return;
    await this.restartNativePlayback(this.currentSeconds(), { reason, useRenderCache: true });
  }

  private deferNativeRenderCacheRefresh(reason: string, options: { scheduleWhenIdle?: boolean } = {}): void {
    this.nativeRenderCachePendingReason = reason;
    if (options.scheduleWhenIdle !== false && !this.playing) this.scheduleNativeRenderCachePrewarm(reason);
  }

  private activateReadyNativeRenderCacheAfterFallback(reason: string) {
    if (!this.readyNativeRenderCache()) return;
    void this.activateNativeRenderCacheForCurrentPlayback(reason, { onlyIfProceduralFallback: true });
  }

  private activeNativePlaybackLooksProceduralFallback(): boolean {
    if (!this.nativeStatus?.active || !this.nativeStatus.playing) return false;
    if (this.nativePlaybackStartedWithRenderCache) return false;
    const assetCount = Number(this.nativeStatus.assetCount || 0);
    const assetRegionCount = Number(this.nativeStatus.assetRegionCount || 0);
    const proceduralEventCount = Number(this.nativeStatus.proceduralEventCount ?? this.nativeStatus.eventCount ?? 0);
    return assetCount <= 0 && assetRegionCount <= 0 && proceduralEventCount > 0;
  }

  private scheduleNativeRenderCachePrewarm(reason: string): boolean {
    if (!this.shouldPrewarmNativeRenderCache()) return false;
    const signature = nativeRenderCacheSignature(this.project);
    if (this.nativeRenderCache?.signature === signature || (this.nativeRenderCacheBuildPromise && this.nativeRenderCacheBuildSignature === signature)) {
      return true;
    }
    this.cancelNativeRenderCachePrewarm();
    this.nativeRenderCachePrewarmScheduled = true;
    this.nativeRenderCachePendingReason = reason;
    const callback = () => {
      this.nativeRenderCachePrewarmHandle = null;
      this.nativeRenderCachePrewarmScheduled = false;
      const buildReason = this.nativeRenderCachePendingReason || reason;
      this.nativeRenderCachePendingReason = null;
      if (this.playing || this.nativeRenderCacheBypassedForLiveEdits) return;
      void this.ensureNativeRenderCache(buildReason);
    };
    const idleWindow = typeof window !== "undefined" ? window as IdleCallbackWindow : null;
    if (idleWindow?.requestIdleCallback) {
      this.nativeRenderCachePrewarmUsesIdleCallback = true;
      this.nativeRenderCachePrewarmHandle = idleWindow.requestIdleCallback(callback, { timeout: 1200 });
    } else if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      this.nativeRenderCachePrewarmUsesIdleCallback = false;
      this.nativeRenderCachePrewarmHandle = window.setTimeout(callback, 220);
    } else {
      this.nativeRenderCachePrewarmScheduled = false;
      this.nativeRenderCachePendingReason = null;
      return false;
    }
    return true;
  }

  private scheduleNativeRuntimeAudioCachePrewarm(reason: string): boolean {
    if (!this.shouldPrewarmNativeRuntimeAudioCache()) return false;
    const signature = nativeRuntimeAudioCacheSignature(this.project);
    if (this.nativeRuntimeAudioCache?.signature === signature || (this.nativeRuntimeAudioCacheBuildPromise && this.nativeRuntimeAudioCacheBuildSignature === signature)) {
      return true;
    }
    this.cancelNativeRuntimeAudioCachePrewarm();
    const callback = () => {
      this.nativeRuntimeAudioCachePrewarmHandle = null;
      if (this.playing || this.nativeRenderCacheBypassedForLiveEdits) return;
      void this.ensureNativeRuntimeAudioCache();
      void reason;
    };
    const idleWindow = typeof window !== "undefined" ? window as IdleCallbackWindow : null;
    if (idleWindow?.requestIdleCallback) {
      this.nativeRuntimeAudioCachePrewarmUsesIdleCallback = true;
      this.nativeRuntimeAudioCachePrewarmHandle = idleWindow.requestIdleCallback(callback, { timeout: 700 });
    } else if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      this.nativeRuntimeAudioCachePrewarmUsesIdleCallback = false;
      this.nativeRuntimeAudioCachePrewarmHandle = window.setTimeout(callback, 80);
    } else {
      return false;
    }
    return true;
  }

  private cancelNativeRenderCachePrewarm() {
    if (this.nativeRenderCachePrewarmHandle !== null && typeof window !== "undefined") {
      const idleWindow = window as IdleCallbackWindow;
      if (this.nativeRenderCachePrewarmUsesIdleCallback && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(this.nativeRenderCachePrewarmHandle);
      else window.clearTimeout(this.nativeRenderCachePrewarmHandle);
    }
    this.nativeRenderCachePrewarmHandle = null;
    this.nativeRenderCachePrewarmScheduled = false;
    this.nativeRenderCachePendingReason = null;
  }

  private cancelNativeRuntimeAudioCachePrewarm() {
    if (this.nativeRuntimeAudioCachePrewarmHandle !== null && typeof window !== "undefined") {
      const idleWindow = window as IdleCallbackWindow;
      if (this.nativeRuntimeAudioCachePrewarmUsesIdleCallback && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(this.nativeRuntimeAudioCachePrewarmHandle);
      else window.clearTimeout(this.nativeRuntimeAudioCachePrewarmHandle);
    }
    this.nativeRuntimeAudioCachePrewarmHandle = null;
  }

  private shouldPrewarmNativeRenderCache(): boolean {
    if (this.playing || this.nativeRenderCacheBypassedForLiveEdits) return false;
    if (typeof window === "undefined") return false;
    const globalWindow = window as unknown as Record<string, unknown>;
    return "__TAURI_INTERNALS__" in globalWindow || "__TAURI__" in globalWindow;
  }

  private shouldPrewarmNativeRuntimeAudioCache(): boolean {
    if (this.playing || this.nativeRenderCacheBypassedForLiveEdits) return false;
    if (!this.audioRegions.some((region) => getCachedAudioBuffer(region.mediaPoolItemId))) return false;
    if (typeof window === "undefined") return false;
    const globalWindow = window as unknown as Record<string, unknown>;
    return "__TAURI_INTERNALS__" in globalWindow || "__TAURI__" in globalWindow;
  }

  private nativeRuntimeShouldOwnPlayback(): boolean {
    if (typeof window === "undefined") return false;
    const globalWindow = window as unknown as Record<string, unknown>;
    return "__TAURI_INTERNALS__" in globalWindow || "__TAURI__" in globalWindow;
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
    this.refreshNativePositionEstimate(current);
    this.handleNativeLoop(current);
    this.tapNativeMeters(current);
    this.tapNativeRegionMeters(current);
    const songEnd = barsToSeconds(this.project.timeline.bars, this.project.project.bpm, this.project.project.timeSig) + 0.4;
    if (!this.project.timeline.loop.enabled && current > songEnd) this.stop();
    else this.emitTick();
  }

  private refreshNativePositionEstimate(estimatedSeconds: number) {
    const now = performance.now();
    if (this.nativeStatusRefreshInFlight || now - this.nativeLastStatusRefreshAtMs < 750) return;
    this.nativeStatusRefreshInFlight = true;
    this.nativeLastStatusRefreshAtMs = now;
    void this.nativePlayback.status()
      .then((status) => {
        if (!status) return;
        this.nativeStatus = status;
        if (this.playbackBackend !== "native-cpal" || !this.playing || !status.active || !status.playing) return;
        const nativeSeconds = Math.max(0, status.positionSeconds || 0);
        if (Math.abs(nativeSeconds - estimatedSeconds) < 0.08) return;
        this.offsetSeconds = nativeSeconds;
        this.nativeStartedAtMs = performance.now() - nativeSeconds * 1000;
        this.repositionPlaybackIndexes(nativeSeconds + safeSyncLeadSeconds);
        this.emitTick(true);
      })
      .finally(() => {
        this.nativeStatusRefreshInFlight = false;
      });
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
      this.nativeRegionMeterLastTapAt = 0;
      this.emitTick(true);
    }
  }

  private tapNativeMeters(current: number) {
    const horizon = current + 0.08;
    while (this.nativeMeterEventIndex < this.events.length && this.events[this.nativeMeterEventIndex].time <= horizon) {
      const event = this.events[this.nativeMeterEventIndex];
      if (event.time >= current - 0.04 && this.eventShouldTapMeter(event)) this.tapMeter(event.trackId, event.velocity);
      this.nativeMeterEventIndex += 1;
    }
  }

  private tapNativeRegionMeters(current: number) {
    const cache = this.activeNativeRenderCache();
    if (!cache?.regions.length) return;
    if (current < this.nativeRegionMeterLastTapAt) this.nativeRegionMeterLastTapAt = 0;
    if (current - this.nativeRegionMeterLastTapAt < 0.12) return;
    this.nativeRegionMeterLastTapAt = current;
    cache.regions.forEach((region) => {
      if (this.nativeRegionIsGeneratedStem(cache, region)) return;
      if (region.startTime > current || region.startTime + region.duration < current) return;
      const track = this.project.tracks.find((item) => item.id === region.trackId);
      if (!track || !trackIsAudible(track, this.project.tracks)) return;
      this.tapMeter(region.trackId, Math.max(0.12, Math.min(0.55, region.gain * 0.32)));
    });
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
    this.drumLaneOutputs.clear();
    const currentBar = secondsToBars(this.currentSeconds(), this.project.project.bpm, this.project.project.timeSig) + 1;
    this.project.tracks.forEach((track) => {
      if (track.role === "master") {
        this.master!.gain.setTargetAtTime(track.volume, this.ctx!.currentTime, 0.02);
        return;
      }
      const gain = this.ctx!.createGain();
      const analyser = this.ctx!.createAnalyser();
      const sidechain = chordsmithSidechainSettings(this.project)?.targetTrackId === track.id ? this.ctx!.createGain() : null;
      const pan = "createStereoPanner" in this.ctx! ? this.ctx!.createStereoPanner() : null;
      const controls = getAutomatedTrackControls(this.project, track, currentBar);
      analyser.fftSize = 512;
      gain.gain.value = trackIsAudible(track, this.project.tracks) ? controls.volume : 0;
      if (sidechain) sidechain.gain.value = 1;
      if (pan) pan.pan.value = controls.pan;
      this.trackOutputs.set(track.id, {
        gain,
        analyser,
        sidechain,
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
      const postFxOutput: AudioNode = output.sidechain || output.analyser;
      if (output.sidechain) output.analyser.connect(output.sidechain);
      const sendCleanup = this.connectTrackSends(postFxOutput, track);
      if (output.pan) {
        postFxOutput.connect(output.pan);
        output.pan.connect(destination);
      } else {
        postFxOutput.connect(destination);
      }
      output.cleanup = () => {
        sendCleanup.forEach((fn) => fn());
        fx.cleanup();
        safelyDisconnect(output.gain);
        safelyDisconnect(output.analyser);
        if (output.sidechain) safelyDisconnect(output.sidechain);
        if (output.pan) safelyDisconnect(output.pan);
      };
    });
    this.configureDrumLaneOutputs();
  }

  private connectTrackSends(source: AudioNode, track: Track): Array<() => void> {
    if (!this.ctx) return [];
    return activeTrackSendRoutes(this.project, track).flatMap((send) => {
      const target = this.trackOutputs.get(send.returnTrackId);
      if (!target || target.gain === source) return [];
      const sendGain = this.ctx!.createGain();
      sendGain.gain.value = send.level;
      source.connect(sendGain);
      sendGain.connect(target.gain);
      return [() => safelyDisconnect(sendGain)];
    });
  }

  private configureDrumLaneOutputs() {
    const drumsOutput = this.trackOutputs.get("drums");
    if (!this.ctx || !drumsOutput) return;
    DRUM_LANE_DEFS.forEach((lane) => {
      const input = this.ctx!.createGain();
      const fx = connectFxChain(this.ctx!, input, drumsOutput.gain, getDrumLaneFxChain(this.project, lane.id));
      this.drumLaneOutputs.set(lane.id, {
        input,
        cleanup: () => {
          fx.cleanup();
          safelyDisconnect(input);
        }
      });
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
    this.drumLaneOutputs.forEach((output) => output.cleanup());
    this.drumLaneOutputs.clear();
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
    this.scheduleChordsmithSidechain(event);
    const output = this.trackOutputs.get(event.trackId);
    if (!output) return;
    if (this.eventShouldTapMeter(event)) this.tapMeter(event.trackId, event.velocity);
    const destination = this.eventDestination(event, output);
    const scheduled = scheduleInstrumentEvent(this.ctx, destination, {
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

  private eventDestination(event: RenderedEvent, trackOutput: TrackOutput): AudioNode {
    if (event.role === "drums" && isDrumEventKind(event.kind)) {
      return this.drumLaneOutputs.get(event.drumLane || event.kind)?.input || trackOutput.gain;
    }
    return trackOutput.gain;
  }

  private scheduleChordsmithSidechain(event: RenderedEvent) {
    if (!this.ctx || !isChordsmithSidechainTrigger(event)) return;
    const settings = chordsmithSidechainSettings(this.project);
    if (!settings?.enabled) return;
    const output = this.trackOutputs.get(settings.targetTrackId);
    if (!output?.sidechain) return;
    scheduleChordsmithSidechainDuck(output.sidechain.gain, this.startedAt + event.time + 0.001, settings.amount);
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
    source.connect(gain);
    gain.connect(output.gain);
    const when = this.startedAt + Math.max(region.startTimeSeconds, currentSeconds);
    scheduleAudioRegionEnvelope(gain.gain, region, Math.max(this.ctx.currentTime, when), sourceElapsed, duration);
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
      if (this.eventShouldTapMeter(event)) this.tapMeter(event.trackId, event.velocity);
    }
  }

  private nativeRegionIsGeneratedStem(cache: NativeRenderCache, region: { assetId: string }): boolean {
    const item = cache.renderCacheItems.find((entry) => String(entry.metadata?.assetId || entry.id) === region.assetId);
    return String(item?.metadata?.cacheKind || "") === "native-generated-stem";
  }

  private nativeCacheCoversEvent(cache: NativeRenderCache | null, event: RenderedEvent): boolean {
    if (!cache?.cachedClipIds.has(event.clipId)) return false;
    const matchingItems = cache.renderCacheItems.filter((item) => item.sourceClipId === event.clipId);
    const generatedTrackIds = new Set(matchingItems
      .filter((item) => String(item.metadata?.cacheKind || "") === "native-generated-stem")
      .map((item) => String(item.metadata?.trackId || ""))
      .filter(Boolean));
    if (generatedTrackIds.size > 0) return generatedTrackIds.has(event.trackId);
    return true;
  }

  private eventShouldTapMeter(event: RenderedEvent) {
    if (event.kind === "texture") return false;
    return this.eventIsAudible(event);
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

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

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

function mergeNativePlaybackCaches(base: NativeRenderCache, runtime: NativeRenderCache): NativeRenderCache {
  const assets = new Map(base.assets.map((asset) => [asset.id, asset]));
  runtime.assets.forEach((asset) => assets.set(asset.id, asset));
  const regionIds = new Set(base.regions.map((region) => region.id));
  const regions = base.regions.concat(runtime.regions.filter((region) => !regionIds.has(region.id)));
  const cachedClipIds = new Set([...base.cachedClipIds, ...runtime.cachedClipIds]);
  return {
    ...base,
    assets: Array.from(assets.values()),
    regions,
    cachedClipIds,
    renderCacheItems: base.renderCacheItems.concat(runtime.renderCacheItems.filter((item) => !base.renderCacheItems.some((existing) => existing.id === item.id))),
    renderCacheHitCount: base.renderCacheHitCount + runtime.renderCacheHitCount,
    renderCacheMissCount: base.renderCacheMissCount + runtime.renderCacheMissCount,
    runtimeAudioRegionCount: Math.max(base.runtimeAudioRegionCount, runtime.runtimeAudioRegionCount),
    missingRuntimeAudioRegionCount: runtime.missingRuntimeAudioRegionCount,
    cachedAssetByteCount: Array.from(assets.values()).reduce((total, asset) => total + (asset.sizeBytes || asset.bytes?.length || 0), 0)
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function finiteOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : null;
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
