import type { AudioEngineDiagnostics } from "./diagnostics";
import { currentProject, type AppState } from "./state";
import { activeAutomationLaneCount } from "../daw/automation";
import { getTrackFxChain } from "../daw/fx";
import { activeTrackSendRoutes } from "../daw/routing";

export interface UiPerformanceCounters {
  renderCount: number;
  renderCountDuringPlayback: number;
  liveUpdateCount: number;
}

export interface PerformanceFeatureSummary {
  trackCount: number;
  clipCount: number;
  mediaPoolCount: number;
  renderCacheCount: number;
  eventCount: number;
  audioRegionCount: number;
  missingAudioRegionCount: number;
  fxChainCount: number;
  activeFxSlotCount: number;
  bypassedFxSlotCount: number;
  activeSendRouteCount: number;
  activeAutomationLaneCount: number;
  sourceRefCount: number;
}

export interface PerformanceCounterDeltas {
  renderCount: number;
  renderCountDuringPlayback: number;
  liveUpdateCount: number;
  schedulerTickCount: number;
  missedSchedulerTickCount: number;
  scheduledEventCount: number;
  lateEventCount: number;
  skippedLateEventCount: number;
  audioGraphReconfigureCount: number;
  activeAudioSourcesStoppedByGraphReconfigureCount: number;
  projectSyncCount: number;
}

export interface PerformanceDiagnosticsSample {
  sequence: number;
  capturedAt: string;
  elapsedMs: number;
  playing: boolean;
  transportBar: number;
  ui: UiPerformanceCounters;
  audio: {
    playbackBackend: string;
    audioContextState: string;
    currentSeconds: number;
    schedulerActive: boolean;
    schedulerIntervalMs: number;
    schedulerLookaheadSeconds: number;
    schedulerTickCount: number;
    missedSchedulerTickCount: number;
    maxSchedulerGapMs: number;
    scheduledEventCount: number;
    lateEventCount: number;
    skippedLateEventCount: number;
    audioGraphReconfigureCount: number;
    activeAudioSourcesStoppedByGraphReconfigureCount: number;
    projectSyncCount: number;
    lastProjectSyncMode: string;
    lastProjectSyncReason: string;
    lastAudioDropCause: string | null;
    nativeRenderCache: AudioEngineDiagnostics["nativeRenderCache"];
  };
  features: PerformanceFeatureSummary;
  deltas: PerformanceCounterDeltas;
  hotspotSignals: string[];
}

export interface PerformanceDiagnosticsReport {
  enabled: boolean;
  sessionId: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  maxSamples: number;
  sampleCount: number;
  droppedSampleCount: number;
  lastSampleAt: string | null;
  baseline: PerformanceDiagnosticsSample | null;
  current: PerformanceDiagnosticsSample;
  recentSamples: PerformanceDiagnosticsSample[];
  summary: {
    elapsedMs: number;
    maxSchedulerGapMs: number;
    missedSchedulerTickCountDelta: number;
    lateEventCountDelta: number;
    skippedLateEventCountDelta: number;
    audioGraphReconfigureCountDelta: number;
    activeAudioSourcesStoppedByGraphReconfigureCountDelta: number;
    projectSyncCountDelta: number;
    renderCountDelta: number;
    renderCountDuringPlaybackDelta: number;
    liveUpdateCountDelta: number;
    observedAudioDropCauses: string[];
    hotspotSignals: string[];
  };
}

interface AbsoluteCounters extends PerformanceCounterDeltas {
  maxSchedulerGapMs: number;
}

const DEFAULT_MAX_SAMPLES = 120;
const MIN_MAX_SAMPLES = 5;
const MAX_MAX_SAMPLES = 1200;

export class PerformanceDiagnosticsRecorder {
  private enabled = false;
  private sessionId: string | null = null;
  private startedAt: string | null = null;
  private stoppedAt: string | null = null;
  private startedAtMs = 0;
  private maxSamples = DEFAULT_MAX_SAMPLES;
  private droppedSampleCount = 0;
  private sequence = 0;
  private baselineCounters: AbsoluteCounters | null = null;
  private baselineSample: PerformanceDiagnosticsSample | null = null;
  private recentSamples: PerformanceDiagnosticsSample[] = [];

  start(maxSamples?: number): void {
    this.reset(maxSamples);
    this.enabled = true;
    this.sessionId = `perf-${Date.now().toString(36)}`;
    this.startedAt = new Date().toISOString();
    this.startedAtMs = nowMs();
  }

  stop(): void {
    this.enabled = false;
    this.stoppedAt = new Date().toISOString();
  }

  reset(maxSamples?: number): void {
    if (maxSamples !== undefined) this.maxSamples = clampSampleLimit(maxSamples);
    this.enabled = false;
    this.sessionId = null;
    this.startedAt = null;
    this.stoppedAt = null;
    this.startedAtMs = 0;
    this.droppedSampleCount = 0;
    this.sequence = 0;
    this.baselineCounters = null;
    this.baselineSample = null;
    this.recentSamples = [];
  }

  report(
    state: AppState,
    audio: AudioEngineDiagnostics,
    ui: UiPerformanceCounters,
    options: { recordSample?: boolean; maxSamples?: number } = {}
  ): PerformanceDiagnosticsReport {
    if (options.maxSamples !== undefined) this.maxSamples = clampSampleLimit(options.maxSamples);
    const shouldRecord = !!options.recordSample && this.enabled;
    const sample = this.buildSample(state, audio, ui);
    if (shouldRecord) this.recordSample(sample);
    return this.buildReport(shouldRecord ? sample : this.recentSamples.at(-1) || sample);
  }

  private buildSample(state: AppState, audio: AudioEngineDiagnostics, ui: UiPerformanceCounters): PerformanceDiagnosticsSample {
    const absolute = absoluteCounters(audio, ui);
    const baseline = this.baselineCounters || absolute;
    const elapsedMs = this.startedAtMs > 0 ? Math.max(0, nowMs() - this.startedAtMs) : 0;
    const deltas = counterDeltas(absolute, baseline);
    const features = featureSummary(state, audio);
    const sample: PerformanceDiagnosticsSample = {
      sequence: this.sequence + 1,
      capturedAt: new Date().toISOString(),
      elapsedMs,
      playing: state.playing || audio.playbackBackend === "native-cpal" || audio.playbackBackend === "web-audio",
      transportBar: state.playheadBar,
      ui: { ...ui },
      audio: {
        playbackBackend: String(audio.playbackBackend),
        audioContextState: audio.audioContextState,
        currentSeconds: audio.currentSeconds,
        schedulerActive: audio.schedulerActive,
        schedulerIntervalMs: audio.schedulerIntervalMs,
        schedulerLookaheadSeconds: audio.schedulerLookaheadSeconds,
        schedulerTickCount: audio.schedulerTickCount,
        missedSchedulerTickCount: audio.missedSchedulerTickCount,
        maxSchedulerGapMs: audio.maxSchedulerGapMs,
        scheduledEventCount: audio.scheduledEventCount,
        lateEventCount: audio.lateEventCount,
        skippedLateEventCount: audio.skippedLateEventCount,
        audioGraphReconfigureCount: audio.audioGraphReconfigureCount,
        activeAudioSourcesStoppedByGraphReconfigureCount: audio.activeAudioSourcesStoppedByGraphReconfigureCount,
        projectSyncCount: audio.projectSyncCount,
        lastProjectSyncMode: audio.lastProjectSyncMode,
        lastProjectSyncReason: audio.lastProjectSyncReason,
        lastAudioDropCause: audio.lastAudioDropCause,
        nativeRenderCache: audio.nativeRenderCache
      },
      features,
      deltas,
      hotspotSignals: hotspotSignals(audio, deltas, features, state.playing)
    };
    if (!this.baselineCounters) {
      this.baselineCounters = absolute;
      this.baselineSample = { ...sample, deltas: counterDeltas(absolute, absolute), hotspotSignals: [] };
    }
    return sample;
  }

  private recordSample(sample: PerformanceDiagnosticsSample): void {
    this.sequence += 1;
    const recorded = { ...sample, sequence: this.sequence };
    this.recentSamples.push(recorded);
    while (this.recentSamples.length > this.maxSamples) {
      this.recentSamples.shift();
      this.droppedSampleCount += 1;
    }
  }

  private buildReport(current: PerformanceDiagnosticsSample): PerformanceDiagnosticsReport {
    const samples = this.recentSamples;
    const hotspotSet = new Set<string>(current.hotspotSignals);
    samples.forEach((sample) => sample.hotspotSignals.forEach((signal) => hotspotSet.add(signal)));
    return {
      enabled: this.enabled,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      maxSamples: this.maxSamples,
      sampleCount: samples.length,
      droppedSampleCount: this.droppedSampleCount,
      lastSampleAt: samples.at(-1)?.capturedAt || null,
      baseline: this.baselineSample,
      current,
      recentSamples: samples,
      summary: {
        elapsedMs: current.elapsedMs,
        maxSchedulerGapMs: Math.max(current.audio.maxSchedulerGapMs, ...samples.map((sample) => sample.audio.maxSchedulerGapMs)),
        missedSchedulerTickCountDelta: current.deltas.missedSchedulerTickCount,
        lateEventCountDelta: current.deltas.lateEventCount,
        skippedLateEventCountDelta: current.deltas.skippedLateEventCount,
        audioGraphReconfigureCountDelta: current.deltas.audioGraphReconfigureCount,
        activeAudioSourcesStoppedByGraphReconfigureCountDelta: current.deltas.activeAudioSourcesStoppedByGraphReconfigureCount,
        projectSyncCountDelta: current.deltas.projectSyncCount,
        renderCountDelta: current.deltas.renderCount,
        renderCountDuringPlaybackDelta: current.deltas.renderCountDuringPlayback,
        liveUpdateCountDelta: current.deltas.liveUpdateCount,
        observedAudioDropCauses: Array.from(new Set(samples.map((sample) => sample.audio.lastAudioDropCause).filter((cause): cause is string => !!cause))),
        hotspotSignals: Array.from(hotspotSet)
      }
    };
  }
}

function absoluteCounters(audio: AudioEngineDiagnostics, ui: UiPerformanceCounters): AbsoluteCounters {
  return {
    renderCount: ui.renderCount,
    renderCountDuringPlayback: ui.renderCountDuringPlayback,
    liveUpdateCount: ui.liveUpdateCount,
    schedulerTickCount: audio.schedulerTickCount,
    missedSchedulerTickCount: audio.missedSchedulerTickCount,
    scheduledEventCount: audio.scheduledEventCount,
    lateEventCount: audio.lateEventCount,
    skippedLateEventCount: audio.skippedLateEventCount,
    audioGraphReconfigureCount: audio.audioGraphReconfigureCount,
    activeAudioSourcesStoppedByGraphReconfigureCount: audio.activeAudioSourcesStoppedByGraphReconfigureCount,
    projectSyncCount: audio.projectSyncCount,
    maxSchedulerGapMs: audio.maxSchedulerGapMs
  };
}

function counterDeltas(current: AbsoluteCounters, baseline: AbsoluteCounters): PerformanceCounterDeltas {
  return {
    renderCount: current.renderCount - baseline.renderCount,
    renderCountDuringPlayback: current.renderCountDuringPlayback - baseline.renderCountDuringPlayback,
    liveUpdateCount: current.liveUpdateCount - baseline.liveUpdateCount,
    schedulerTickCount: current.schedulerTickCount - baseline.schedulerTickCount,
    missedSchedulerTickCount: current.missedSchedulerTickCount - baseline.missedSchedulerTickCount,
    scheduledEventCount: current.scheduledEventCount - baseline.scheduledEventCount,
    lateEventCount: current.lateEventCount - baseline.lateEventCount,
    skippedLateEventCount: current.skippedLateEventCount - baseline.skippedLateEventCount,
    audioGraphReconfigureCount: current.audioGraphReconfigureCount - baseline.audioGraphReconfigureCount,
    activeAudioSourcesStoppedByGraphReconfigureCount: current.activeAudioSourcesStoppedByGraphReconfigureCount - baseline.activeAudioSourcesStoppedByGraphReconfigureCount,
    projectSyncCount: current.projectSyncCount - baseline.projectSyncCount
  };
}

function featureSummary(state: AppState, audio: AudioEngineDiagnostics): PerformanceFeatureSummary {
  const project = currentProject(state);
  const fxChains = project.fx?.chains || [];
  return {
    trackCount: project.tracks.length,
    clipCount: project.timeline.clips.length,
    mediaPoolCount: project.mediaPool.length,
    renderCacheCount: project.renderCache.length,
    eventCount: audio.eventCount,
    audioRegionCount: audio.audioRegionCount,
    missingAudioRegionCount: audio.missingAudioRegionCount,
    fxChainCount: fxChains.length,
    activeFxSlotCount: project.tracks.reduce((count, track) => count + (getTrackFxChain(project, track)?.slots.filter((slot) => slot.enabled).length || 0), 0),
    bypassedFxSlotCount: fxChains.reduce((count, chain) => count + chain.slots.filter((slot) => !slot.enabled).length, 0),
    activeSendRouteCount: project.tracks.reduce((count, track) => count + activeTrackSendRoutes(project, track).length, 0),
    activeAutomationLaneCount: activeAutomationLaneCount(project),
    sourceRefCount: project.sourceRefs.length
  };
}

function hotspotSignals(
  audio: AudioEngineDiagnostics,
  deltas: PerformanceCounterDeltas,
  features: PerformanceFeatureSummary,
  playing: boolean
): string[] {
  const signals: string[] = [];
  if (audio.maxSchedulerGapMs > Math.max(120, audio.schedulerIntervalMs * 3)) signals.push("scheduler-gap");
  if (deltas.missedSchedulerTickCount > 0) signals.push("missed-scheduler-ticks");
  if (deltas.lateEventCount > 0 || deltas.skippedLateEventCount > 0) signals.push("late-or-skipped-events");
  if (playing && deltas.audioGraphReconfigureCount > 0) signals.push("graph-rebuild-during-playback");
  if (deltas.activeAudioSourcesStoppedByGraphReconfigureCount > 0) signals.push("active-sources-stopped-by-graph-rebuild");
  if (playing && deltas.renderCountDuringPlayback > 12) signals.push("frequent-full-renders-during-playback");
  if (features.missingAudioRegionCount > 0) signals.push("missing-audio-regions");
  if (audio.nativeRenderCache.nativeRenderCacheBypassedForLiveEdits) signals.push("native-cache-bypassed-for-live-edits");
  if (audio.nativeRenderCache.buildPending) signals.push("native-cache-build-pending");
  return signals;
}

function clampSampleLimit(value: number): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return DEFAULT_MAX_SAMPLES;
  return Math.max(MIN_MAX_SAMPLES, Math.min(MAX_MAX_SAMPLES, number));
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
