import type { FxChain, JsonValue, PocketDawProject } from "../daw/schema";
import type { RenderedEvent } from "../audio/eventRenderer";
import { chordsmithSidechainSettings } from "../audio/sidechain";

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
}

export interface NativeAudioTrack {
  id: string;
  fxChainId?: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export interface NativeAudioEvent {
  id: string;
  kind: RenderedEvent["kind"];
  trackId: string;
  time: number;
  duration: number;
  midi?: number;
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
  accent?: boolean;
  articulation?: string;
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
  pan: number;
}

export interface NativeAudioStartPayload {
  projectTitle: string;
  sampleRate: number;
  startSeconds: number;
  outputDeviceId: string | null;
  sidechain?: NativeAudioSidechain | null;
  tracks: NativeAudioTrack[];
  events: NativeAudioEvent[];
  fxChains: NativeAudioFxChain[];
  assets?: NativeAudioAsset[];
  regions?: NativeAudioRegion[];
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
}

type NativeAudioApiFactory = () => Promise<NativeAudioInvokeApi | null>;

export class NativeAudioPlaybackBridge {
  private readonly knownNativeAssetIds = new Set<string>();

  constructor(private readonly apiFactory: NativeAudioApiFactory = defaultNativeAudioApi) {}

  async start(payload: NativeAudioStartPayload): Promise<NativeAudioStartResult> {
    const api = await this.apiFactory();
    if (!api?.isAvailable()) {
      return { started: false, status: null, error: "Native Tauri audio runtime is unavailable." };
    }
    try {
      const status = await api.invoke<NativeAudioStatus>("native_audio_start", { payload: this.withCachedAssetHints(payload) });
      payload.assets?.forEach((asset) => this.knownNativeAssetIds.add(asset.id));
      return { started: true, status, error: null };
    } catch (error) {
      return { started: false, status: null, error: errorMessage(error) };
    }
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
  return {
    projectTitle: project.project.title,
    sampleRate: project.project.sampleRate,
    startSeconds: Math.max(0, startSeconds),
    outputDeviceId: project.audioDeviceSettings.outputDeviceId,
    sidechain: nativeSidechain(project),
    tracks: project.tracks.map((track) => ({
      id: track.id,
      fxChainId: track.fxChainId,
      volume: clamp(track.volume, 0, 1.2),
      pan: clamp(track.pan, -1, 1),
      mute: track.mute,
      solo: track.solo
    })),
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      trackId: event.trackId,
      time: event.time,
      duration: Math.max(0.01, event.duration),
      midi: event.midi,
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
      accent: event.accent,
      articulation: event.articulation,
      drumLane: event.drumLane
    })),
    fxChains: nativeFxChains(project.fx?.chains || []),
    assets: cache?.assets || [],
    regions: cache?.regions || []
  };
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
