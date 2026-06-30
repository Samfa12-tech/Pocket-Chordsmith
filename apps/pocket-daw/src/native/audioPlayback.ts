import type { FxChain, JsonValue, PocketDawProject } from "../daw/schema";
import type { RenderedEvent } from "../audio/eventRenderer";
import { chordsmithSidechainSettings } from "../audio/sidechain";
import { activeTrackSendRoutes } from "../daw/routing";
import { getAutomatedTrackControls } from "../daw/automation";
import { secondsToBars } from "../daw/timeline";

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
  mimeType?: string;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  sizeBytes?: number;
  sourceHash?: string;
  bytes?: number[];
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
  pan: number;
  fadeIn: number;
  fadeOut: number;
  gainAutomation?: Array<{ localSeconds: number; value: number; curve?: "linear" | "hold" | "ease-in" | "ease-out" }>;
}

export interface NativeAudioStartPayload {
  projectTitle: string;
  sampleRate: number;
  startSeconds: number;
  outputDeviceId: string | null;
  loop?: NativeAudioLoop | null;
  metronome?: NativeAudioMetronome | null;
  sidechain?: NativeAudioSidechain | null;
  tracks: NativeAudioTrack[];
  events: NativeAudioEvent[];
  fxChains: NativeAudioFxChain[];
  assets?: NativeAudioAsset[];
  regions?: NativeAudioRegion[];
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
      if (!asset.bytes?.length) continue;
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
  const startBar = secondsToBars(Math.max(0, startSeconds), project.project.bpm, project.project.timeSig) + 1;
  return {
    projectTitle: project.project.title,
    sampleRate: project.project.sampleRate,
    startSeconds: Math.max(0, startSeconds),
    outputDeviceId: project.audioDeviceSettings.outputDeviceId,
    loop: nativeLoop(project),
    metronome: nativeMetronome(project),
    sidechain: nativeSidechain(project),
    tracks: project.tracks.map((track) => {
      const controls = getAutomatedTrackControls(project, track, startBar);
      return {
        id: track.id,
        fxChainId: track.fxChainId,
        isReturn: track.trackType === "return" || track.role === "fx-return",
        sends: activeTrackSendRoutes(project, track, startBar),
        volume: controls.volume,
        pan: controls.pan,
        mute: track.mute,
        solo: track.solo
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
      accent: event.accent,
      articulation: event.articulation,
      direction: event.direction,
      drumLane: event.drumLane
    })),
    fxChains: nativeFxChains(project.fx?.chains || []),
    assets: cache?.assets || [],
    regions: cache?.regions || []
  };
}

function nativeMetronome(project: PocketDawProject): NativeAudioMetronome | null {
  const settings = project.project.metronome;
  if (!settings?.enabled) return null;
  return {
    enabled: true,
    beatSeconds: 60 / Math.max(1, project.project.bpm || 120),
    timeSig: Math.max(1, Math.round(project.project.timeSig || 4)),
    volume: clamp(settings.volume, 0, 1)
  };
}

function nativeLoop(project: PocketDawProject): NativeAudioLoop | null {
  const loop = project.timeline.loop;
  if (!loop?.enabled) return null;
  const beatsPerBar = Math.max(1, project.project.timeSig || 4);
  const secondsPerBar = beatsPerBar * (60 / Math.max(1, project.project.bpm || 120));
  const startSeconds = Math.max(0, (loop.startBar - 1) * secondsPerBar);
  const endSeconds = Math.max(startSeconds, (loop.endBar - 1) * secondsPerBar);
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

function nativeFxChains(chains: FxChain[]): NativeAudioFxChain[] {
  return chains.map((chain) => ({
    id: chain.id,
    ownerTrackId: chain.ownerTrackId,
    metadata: chain.metadata,
    slots: chain.slots.map((slot) => ({
      id: slot.id,
      type: String(slot.type),
      enabled: slot.enabled,
      presetId: slot.presetId,
      parameters: slot.parameters || {}
    }))
  }));
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
