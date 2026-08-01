import type { DrumRackDevice, FxChain, HostedPluginIdentity, HostedPluginProjectMetadata, HostedPluginStateSnapshot, JsonObject, JsonValue, PocketDawProject, SamplerDevice } from "../daw/schema";
import type { RenderedEvent } from "../audio/eventRenderer";
import { buildMetronomeClicks } from "../audio/metronome";
import { chordsmithSidechainSettings } from "../audio/sidechain";
import { activeTrackSendRoutes } from "../daw/routing";
import { getAutomatedFxChains, getAutomatedTrackControls, getProjectAutomationLane } from "../daw/automation";
import { timelineBarAtSeconds, timelineDurationSeconds, timelineMetricsAtSortedBars, timelineSecondsAtBar } from "../daw/timeline";
import { trackIsAudible } from "../daw/tracks";
import { validHostedStateSnapshot } from "../daw/hostedPlugins";

export interface NativeAudioStatus {
  backend: "native-cpal" | string;
  available: boolean;
  active: boolean;
  playing: boolean;
  positionSeconds: number;
  eventCount: number;
  sampleRate: number;
  channels: number;
  renderedFrameCount: number;
  startedGeneration: number;
  projectTitle: string | null;
  deviceName: string | null;
  hostName: string | null;
  lastError: string | null;
  assetCount?: number;
  assetRegionCount?: number;
  proceduralEventCount?: number;
  callbackCount?: number;
  lastCallbackMicros?: number;
  maxCallbackMicros?: number;
  slowCallbackCount?: number;
}

export interface NativeAudioTrack {
  id: string;
  fxChainId?: string;
  isReturn: boolean;
  sends: NativeAudioTrackSend[];
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export interface NativeAudioTrackSend {
  returnTrackId: string;
  level: number;
  mode?: "post-fader" | "pre-fader";
}

export interface NativeAudioEvent {
  id: string;
  kind: RenderedEvent["kind"];
  trackId: string;
  time: number;
  duration: number;
  midi?: number;
  slideMidi?: number;
  slideOffset?: number;
  detuneCents?: number;
  midiNotes: number[];
  velocity: number;
  step?: number;
  pan?: number;
  instrument?: string;
  drumKit?: string;
  bassTone?: string;
  audioProfile?: string;
  lofiPreset?: string;
  lofiTexture?: JsonValue;
  chipPreset?: string;
  chipTexture?: JsonValue;
  metalPreset?: string;
  metalTexture?: JsonValue;
  soundProfile?: JsonValue;
  sound?: string;
  performanceRole?: string;
  expression?: JsonValue;
  technique?: JsonValue;
  accent?: boolean;
  articulation?: string;
  direction?: "down" | "up";
  drumLane?: string;
}

export interface NativeAudioFxSlot {
  id: string;
  type: string;
  enabled: boolean;
  presetId?: string;
  parameters: Record<string, JsonValue>;
  hostedPlugin?: NativeHostedPluginInstance;
}

export interface NativeAudioFxChain {
  id: string;
  ownerTrackId?: string;
  metadata?: Record<string, JsonValue>;
  slots: NativeAudioFxSlot[];
}

export interface NativeAudioAsset {
  id: string;
  name: string;
  relativePath?: string;
  sourcePath?: string;
  mimeType?: string;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  sizeBytes?: number;
  sourceHash?: string;
  bytes?: number[];
  mediaPoolItemId?: string;
  sampleLibraryOnly?: boolean;
}

export interface NativeSamplerEnvelope {
  attackSeconds: number;
  decaySeconds: number;
  sustainLevel: number;
  releaseSeconds: number;
}

export interface NativeSamplerPad {
  midiNote: number;
  assetId: string;
  gain: number;
  pan: number;
  coarseTune: number;
  fineTuneCents: number;
  startPosition: number;
  endPosition: number;
  reverse: boolean;
  playbackMode: "one-shot" | "gate";
  mute: boolean;
  solo: boolean;
  chokeGroup: string | null;
}

export interface NativeSamplerDevice {
  id: string;
  trackId: string;
  type: "quick-sampler" | "drum-rack";
  enabled: boolean;
  assetId?: string;
  rootNote?: number;
  keyTracking?: boolean;
  coarseTune?: number;
  fineTuneCents?: number;
  gain?: number;
  pan?: number;
  startPosition?: number;
  endPosition?: number;
  reverse?: boolean;
  playbackMode?: "one-shot" | "gate" | "loop";
  loopStartPosition?: number;
  loopEndPosition?: number;
  envelope?: NativeSamplerEnvelope;
  pads?: NativeSamplerPad[];
}

export interface NativeHostedPluginIdentity {
  format: "vst3";
  classId: string;
  binaryFingerprint: string;
  moduleFilename: string;
  vendor: string;
  name: string;
  version: string;
  category: string;
}

export interface NativeHostedPluginAutomationPoint {
  timeSeconds: number;
  value: number;
  curve: "linear" | "hold" | "ease-in" | "ease-out";
}

export interface NativeHostedPluginParameterAutomation {
  parameterId: string;
  points: NativeHostedPluginAutomationPoint[];
}

export interface NativeHostedPluginInstance {
  instanceId: string;
  role: "instrument" | "effect";
  trackId: string;
  chainId?: string;
  enabled: boolean;
  identity: NativeHostedPluginIdentity;
  state?: HostedPluginStateSnapshot;
  parameters: Record<string, number>;
  automation: NativeHostedPluginParameterAutomation[];
}

export interface NativeAudioRegion {
  id: string;
  assetId: string;
  trackId: string;
  startTime: number;
  sourceOffset: number;
  duration: number;
  gain: number;
  phaseMultiplier?: number;
  reversed?: boolean;
  playbackRate?: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
  gainAutomation?: Array<{ localSeconds: number; value: number; curve?: "linear" | "hold" | "ease-in" | "ease-out" }>;
}

export interface NativeAudioStartPayload {
  projectTitle: string;
  sampleRate: number;
  startSeconds: number;
  bpm: number;
  timeSig: number;
  transportMap?: NativeAudioTransportPoint[];
  outputDeviceId: string | null;
  loop?: NativeAudioLoop | null;
  metronome?: NativeAudioMetronome | null;
  sidechain?: NativeAudioSidechain | null;
  tracks: NativeAudioTrack[];
  events: NativeAudioEvent[];
  fxChains: NativeAudioFxChain[];
  assets?: NativeAudioAsset[];
  regions?: NativeAudioRegion[];
  samplers?: NativeSamplerDevice[];
  hostedInstruments?: NativeHostedPluginInstance[];
}

export interface NativeAudioTransportPoint {
  timeSeconds: number;
  projectPpq: number;
  barPositionPpq: number;
  tempo: number;
  numerator: number;
  denominator: number;
  curve: "linear" | "hold" | "ease-in" | "ease-out";
}

export interface NativeAudioLoop {
  enabled: boolean;
  startSeconds: number;
  endSeconds: number;
}

export interface NativeAudioMetronome {
  enabled: boolean;
  beatSeconds: number;
  timeSig: number;
  volume: number;
  clickSchedule?: NativeAudioMetronomeClick[];
}

export interface NativeAudioMetronomeClick {
  timeSeconds: number;
  accented: boolean;
}

export interface NativeAudioSidechain {
  enabled: boolean;
  amount: number;
  targetTrackId: string;
  triggerKind: string;
}

export interface NativeAudioTrackPatch {
  trackId: string;
  volume?: number;
  pan?: number;
  mute?: boolean;
  solo?: boolean;
}

export interface NativeAudioInvokeApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export interface NativeAudioStartResult {
  started: boolean;
  status: NativeAudioStatus | null;
  error: string | null;
  unavailable?: boolean;
}

type NativeAudioApiFactory = () => Promise<NativeAudioInvokeApi | null>;

export class NativeAudioPlaybackBridge {
  private readonly knownNativeAssetIds = new Set<string>();

  constructor(private readonly apiFactory: NativeAudioApiFactory = defaultNativeAudioApi) {}

  async start(payload: NativeAudioStartPayload): Promise<NativeAudioStartResult> {
    const api = await this.apiFactory();
    if (!api?.isAvailable()) {
      return { started: false, status: null, error: "Native Tauri audio runtime is unavailable.", unavailable: true };
    }
    try {
      const status = await api.invoke<NativeAudioStatus>("native_audio_start", { payload: this.withCachedAssetHints(payload) });
      payload.assets?.forEach((asset) => this.knownNativeAssetIds.add(asset.id));
      return { started: true, status, error: null };
    } catch (error) {
      return { started: false, status: null, error: errorMessage(error) };
    }
  }

  async preloadAssets(assets: NativeAudioAsset[]): Promise<number> {
    const api = await this.apiFactory();
    if (!api?.isAvailable()) return 0;
    let loaded = 0;
    for (const asset of assets) {
      if (this.knownNativeAssetIds.has(asset.id)) {
        loaded += 1;
        continue;
      }
      if (!asset.bytes?.length && !asset.sourcePath) continue;
      try {
        await api.invoke<NativeAudioStatus>("native_audio_preload_asset", { asset });
        this.knownNativeAssetIds.add(asset.id);
        loaded += 1;
      } catch {
        // Playback can still send bytes for assets that fail to preload.
      }
    }
    return loaded;
  }

  async pause(): Promise<NativeAudioStatus | null> {
    return this.invokeIfAvailable("native_audio_pause");
  }

  async resume(): Promise<NativeAudioStatus | null> {
    return this.invokeIfAvailable("native_audio_resume");
  }

  async stop(): Promise<NativeAudioStatus | null> {
    return this.invokeIfAvailable("native_audio_stop");
  }

  async seek(seconds: number): Promise<NativeAudioStatus | null> {
    return this.invokeIfAvailable("native_audio_seek", { seconds });
  }

  async updateTrack(patch: NativeAudioTrackPatch): Promise<NativeAudioStatus | null> {
    return this.invokeIfAvailable("native_audio_update_track", { patch });
  }

  async status(): Promise<NativeAudioStatus | null> {
    return this.invokeIfAvailable("native_audio_status");
  }

  private async invokeIfAvailable(command: string, args?: Record<string, unknown>): Promise<NativeAudioStatus | null> {
    const api = await this.apiFactory();
    if (!api?.isAvailable()) return null;
    try {
      return await api.invoke<NativeAudioStatus>(command, args);
    } catch {
      return null;
    }
  }

  private withCachedAssetHints(payload: NativeAudioStartPayload): NativeAudioStartPayload {
    if (!payload.assets?.length) return payload;
    return {
      ...payload,
      assets: payload.assets.map((asset) => {
        if (!this.knownNativeAssetIds.has(asset.id)) return asset;
        const { bytes: _bytes, ...metadataOnly } = asset;
        return metadataOnly;
      })
    };
  }
}

export function buildNativeAudioStartPayload(
  project: PocketDawProject,
  events: RenderedEvent[],
  startSeconds: number,
  cache?: { assets: NativeAudioAsset[]; regions: NativeAudioRegion[] }
): NativeAudioStartPayload {
  const startBar = timelineBarAtSeconds(project, Math.max(0, startSeconds));
  return {
    projectTitle: project.project.title,
    sampleRate: project.project.sampleRate,
    startSeconds: Math.max(0, startSeconds),
    bpm: Math.max(1, project.project.bpm || 120),
    timeSig: Math.max(1, Math.round(project.project.timeSig || 4)),
    transportMap: nativeTransportMap(project),
    outputDeviceId: project.audioDeviceSettings.outputDeviceId,
    loop: nativeLoop(project),
    metronome: nativeMetronome(project),
    sidechain: nativeSidechain(project),
    tracks: project.tracks.map((track) => {
      const controls = getAutomatedTrackControls(project, track, startBar);
      const audible = trackIsAudible(track, project.tracks);
      return {
        id: track.id,
        fxChainId: track.fxChainId,
        isReturn: track.trackType === "return" || track.role === "fx-return",
        sends: activeTrackSendRoutes(project, track, startBar),
        volume: controls.volume,
        pan: controls.pan,
        mute: !audible,
        solo: false
      };
    }),
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      trackId: event.trackId,
      time: event.time,
      duration: Math.max(0.01, event.duration),
      midi: event.midi,
      slideMidi: event.slideMidi,
      slideOffset: event.slideOffset,
      detuneCents: event.detuneCents,
      midiNotes: event.midiNotes || [],
      velocity: clamp(event.velocity, 0, 1.4),
      step: event.step,
      pan: event.pan,
      instrument: event.instrument,
      drumKit: event.drumKit,
      bassTone: event.bassTone,
      audioProfile: event.audioProfile,
      lofiPreset: event.lofiPreset,
      lofiTexture: event.lofiTexture,
      chipPreset: event.chipPreset,
      chipTexture: event.chipTexture,
      metalPreset: event.metalPreset,
      metalTexture: event.metalTexture,
      soundProfile: event.soundProfile,
      sound: event.sound,
      performanceRole: event.performanceRole,
      expression: event.expression,
      technique: event.technique,
      accent: event.accent,
      articulation: event.articulation,
      direction: event.direction,
      drumLane: event.drumLane
    })),
    fxChains: nativeFxChains(project, getAutomatedFxChains(project, startBar)),
    assets: cache?.assets || [],
    regions: cache?.regions || [],
    samplers: nativeSamplerDevices(project, cache?.assets || []),
    hostedInstruments: nativeHostedInstruments(project)
  };
}

function nativeTransportMap(project: PocketDawProject): NativeAudioTransportPoint[] {
  const endBar = Math.max(2, project.timeline.bars + 2);
  const step = Math.max(0.25, (endBar - 1) / 16_000);
  const bars = new Set<number>([1, endBar]);
  for (let bar = 1; bar < endBar; bar += step) bars.add(Math.min(endBar, Math.round(bar * 1_000_000) / 1_000_000));
  const tempoLane = getProjectAutomationLane(project, "tempo");
  tempoLane?.points.forEach((point) => Number.isFinite(point.bar) && bars.add(Math.max(1, point.bar)));
  project.project.meterMap?.forEach((point) => Number.isFinite(point.bar) && bars.add(Math.max(1, point.bar)));
  const sortedBars = [...bars].sort((a, b) => a - b);
  const metricBars = [...new Set(sortedBars.flatMap((bar) => [bar, Math.max(1, Math.floor(bar + 0.000001))]))].sort((a, b) => a - b);
  const metrics = new Map(timelineMetricsAtSortedBars(project, metricBars).map((metric) => [metric.bar, metric]));
  return sortedBars.map((bar) => {
    const metric = metrics.get(bar)!;
    const barStart = metrics.get(Math.max(1, Math.floor(bar + 0.000001)))!;
    return {
      timeSeconds: metric.timeSeconds,
      projectPpq: metric.projectPpq,
      barPositionPpq: barStart.projectPpq,
      tempo: metric.tempo,
      numerator: metric.meter.numerator,
      denominator: metric.meter.denominator,
      curve: metric.curve
    };
  }).filter((point, index, points) => index === 0 || point.timeSeconds > points[index - 1]!.timeSeconds + 0.0000001);
}

function nativeSamplerDevices(project: PocketDawProject, assets: NativeAudioAsset[]): NativeSamplerDevice[] {
  const assetByMediaId = new Map(assets.filter((asset) => asset.mediaPoolItemId).map((asset) => [asset.mediaPoolItemId!, asset.id]));
  return project.tracks.flatMap((track) => {
    const device = track.instrumentDeviceId ? project.devices.find((item) => item.id === track.instrumentDeviceId) : null;
    if (!device || !device.enabled) return [];
    if (device.type === "quick-sampler") {
      const assetId = assetByMediaId.get(device.mediaPoolItemId);
      return assetId ? [nativeQuickSampler(track.id, device, assetId)] : [];
    }
    if (device.type === "drum-rack") return [nativeDrumRack(track.id, device, assetByMediaId)];
    return [];
  });
}

function nativeQuickSampler(trackId: string, device: SamplerDevice, assetId: string): NativeSamplerDevice {
  return {
    id: device.id,
    trackId,
    type: "quick-sampler",
    enabled: device.enabled,
    assetId,
    rootNote: device.rootNote,
    keyTracking: device.keyTracking,
    coarseTune: device.coarseTune,
    fineTuneCents: device.fineTuneCents,
    gain: device.gain,
    pan: device.pan,
    startPosition: device.startPosition,
    endPosition: device.endPosition,
    reverse: device.reverse,
    playbackMode: device.playbackMode,
    loopStartPosition: device.loopStartPosition,
    loopEndPosition: device.loopEndPosition,
    envelope: device.envelope
  };
}

function nativeDrumRack(trackId: string, device: DrumRackDevice, assetByMediaId: Map<string, string>): NativeSamplerDevice {
  return {
    id: device.id,
    trackId,
    type: "drum-rack",
    enabled: device.enabled,
    pads: device.pads.flatMap((pad) => {
      const assetId = pad.mediaPoolItemId ? assetByMediaId.get(pad.mediaPoolItemId) : null;
      return assetId ? [{ ...pad, assetId }] : [];
    })
  };
}

function nativeMetronome(project: PocketDawProject): NativeAudioMetronome | null {
  const settings = project.project.metronome;
  if (!settings?.enabled) return null;
  const lane = getProjectAutomationLane(project, "tempo");
  const needsExplicitSchedule = Boolean((lane?.enabled && lane.points.length) || project.project.meterMap?.length);
  const clickSchedule = needsExplicitSchedule
    ? buildMetronomeClicks(project, 0, timelineDurationSeconds(project) + 4)
      .slice(0, 20000)
      .map((click) => ({ timeSeconds: click.timeSeconds, accented: click.accented }))
    : [];
  return {
    enabled: true,
    beatSeconds: 60 / Math.max(1, project.project.bpm || 120),
    timeSig: Math.max(1, Math.round(project.project.timeSig || 4)),
    volume: clamp(settings.volume, 0, 1),
    ...(clickSchedule.length ? { clickSchedule } : {})
  };
}

function nativeLoop(project: PocketDawProject): NativeAudioLoop | null {
  const loop = project.timeline.loop;
  if (!loop?.enabled) return null;
  const startSeconds = timelineSecondsAtBar(project, loop.startBar);
  const endSeconds = Math.max(startSeconds, timelineSecondsAtBar(project, loop.endBar));
  if (endSeconds <= startSeconds) return null;
  return { enabled: true, startSeconds, endSeconds };
}

function nativeSidechain(project: PocketDawProject): NativeAudioSidechain | null {
  const settings = chordsmithSidechainSettings(project);
  if (!settings?.enabled) return null;
  return {
    enabled: true,
    amount: clamp(settings.amount, 0, 1),
    targetTrackId: settings.targetTrackId,
    triggerKind: "kick"
  };
}

function nativeHostedInstruments(project: PocketDawProject): NativeHostedPluginInstance[] {
  return project.tracks.flatMap((track) => {
    const device = track.instrumentDeviceId ? project.devices.find((item) => item.id === track.instrumentDeviceId) : null;
    if (!device || device.type !== "vst3-instrument") return [];
    return [nativeHostedPluginInstance(
      project,
      device.id,
      "instrument",
      track.id,
      undefined,
      device.enabled,
      device.hostedPlugin,
      device.hostedPluginState,
      device.parameters,
      device.hostedPluginMetadata
    )];
  });
}

function nativeFxChains(project: PocketDawProject, chains: FxChain[]): NativeAudioFxChain[] {
  return chains.map((chain) => ({
    id: chain.id,
    ownerTrackId: chain.ownerTrackId,
    metadata: chain.metadata,
    slots: chain.slots.map((slot) => {
      const trackId = chain.ownerTrackId || (typeof chain.metadata?.parentTrackId === "string" ? chain.metadata.parentTrackId : "");
      return {
        id: slot.id,
        type: String(slot.type),
        enabled: slot.enabled,
        presetId: slot.presetId,
        parameters: slot.parameters || {},
        ...(slot.hostedPlugin && trackId ? {
          hostedPlugin: nativeHostedPluginInstance(
            project,
            slot.id,
            "effect",
            trackId,
            chain.id,
            slot.enabled,
            slot.hostedPlugin,
            slot.hostedPluginState,
            slot.parameters,
            slot.hostedPluginMetadata
          )
        } : {})
      };
    })
  }));
}

function nativeHostedPluginInstance(
  project: PocketDawProject,
  instanceId: string,
  role: NativeHostedPluginInstance["role"],
  trackId: string,
  chainId: string | undefined,
  enabled: boolean,
  identity: HostedPluginIdentity,
  state: HostedPluginStateSnapshot | undefined,
  parameters: JsonObject,
  metadata: HostedPluginProjectMetadata | undefined
): NativeHostedPluginInstance {
  return {
    instanceId,
    role,
    trackId,
    ...(chainId ? { chainId } : {}),
    enabled,
    identity: nativeHostedIdentity(identity),
    ...(state && validHostedStateSnapshot(state) ? { state: { ...state } } : {}),
    parameters: nativeHostedParameters(parameters, metadata),
    automation: nativeHostedAutomation(project, instanceId, chainId, metadata)
  };
}

function nativeHostedIdentity(identity: HostedPluginIdentity): NativeHostedPluginIdentity {
  return {
    format: "vst3",
    classId: String(identity.classId || "").slice(0, 128),
    binaryFingerprint: String(identity.binaryFingerprint || "").replace(/[^a-f0-9]/gi, "").slice(0, 128),
    moduleFilename: String(identity.moduleFilename || "Unknown.vst3").split(/[\\/]/).pop()!.slice(0, 160),
    vendor: String(identity.vendor || "Unknown vendor").slice(0, 96),
    name: String(identity.name || "Unknown plug-in").slice(0, 96),
    version: String(identity.version || "Unknown").slice(0, 64),
    category: String(identity.category || "Unknown").slice(0, 64)
  };
}

function nativeHostedParameters(parameters: JsonObject, metadata: HostedPluginProjectMetadata | undefined): Record<string, number> {
  return Object.fromEntries(nativeVstParameterDescriptors(metadata).filter((descriptor) => !descriptor.readOnly).flatMap((descriptor) => {
    const value = parameters[descriptor.stableId];
    return typeof value === "number" && Number.isFinite(value)
      ? [[descriptor.stableId, normalizeVstParameter(value, descriptor.min, descriptor.max)]]
      : [];
  }));
}

function nativeHostedAutomation(
  project: PocketDawProject,
  instanceId: string,
  chainId: string | undefined,
  metadata: HostedPluginProjectMetadata | undefined
): NativeHostedPluginParameterAutomation[] {
  const descriptors = new Map(nativeVstParameterDescriptors(metadata).map((descriptor) => [descriptor.stableId, descriptor]));
  return project.automation.lanes.flatMap((lane) => {
    if (!lane.enabled) return [];
    const match = chainId
      ? lane.targetPath.match(/^fx\.([^.]+)\.slots\.([^.]+)\.parameters\.([^.]+)$/)
      : lane.targetPath.match(/^device:([^:]+):parameter:([^:]+)$/);
    if (!match) return [];
    const matchesInstance = chainId ? match[1] === chainId && match[2] === instanceId : match[1] === instanceId;
    const parameterId = chainId ? match[3] : match[2];
    const descriptor = matchesInstance ? descriptors.get(parameterId) : undefined;
    if (!descriptor?.automatable || descriptor.readOnly) return [];
    const points = lane.points
      .filter((point) => Number.isFinite(point.bar) && Number.isFinite(point.value))
      .map((point) => ({
        timeSeconds: Math.max(0, timelineSecondsAtBar(project, point.bar)),
        value: normalizeVstParameter(point.value, descriptor.min, descriptor.max),
        curve: point.curve || "linear" as const
      }))
      .sort((left, right) => left.timeSeconds - right.timeSeconds);
    return points.length ? [{ parameterId, points }] : [];
  }).sort((left, right) => left.parameterId.localeCompare(right.parameterId, undefined, { numeric: true }));
}

function nativeVstParameterDescriptors(metadata: HostedPluginProjectMetadata | undefined) {
  return (Array.isArray(metadata?.parameterDescriptors) ? metadata.parameterDescriptors : [])
    .filter((descriptor) => descriptor !== null && typeof descriptor === "object")
    .filter((descriptor) => /^\d+$/.test(descriptor.stableId) && Number.isFinite(descriptor.min) && Number.isFinite(descriptor.max) && descriptor.max >= descriptor.min)
    .sort((left, right) => left.stableId.localeCompare(right.stableId, undefined, { numeric: true }));
}

function normalizeVstParameter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

let defaultApiPromise: Promise<NativeAudioInvokeApi | null> | null = null;

async function defaultNativeAudioApi(): Promise<NativeAudioInvokeApi | null> {
  if (defaultApiPromise) return defaultApiPromise;
  defaultApiPromise = (async () => {
    if (!hasTauriRuntime()) return null;
    try {
      const api = await import("@tauri-apps/api/core");
      return {
        isAvailable: hasTauriRuntime,
        invoke: api.invoke
      };
    } catch {
      return null;
    }
  })();
  return defaultApiPromise;
}

function hasTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const globalWindow = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in globalWindow || "__TAURI__" in globalWindow;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Native audio command failed.");
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
