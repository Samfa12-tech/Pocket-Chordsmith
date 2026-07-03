export const POCKET_DAW_APP = "PocketDAW" as const;
export const POCKET_DAW_SCHEMA_VERSION = 2;
export const POCKET_DAW_VERSION = "0.6.36";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type ClipType =
  | "generated-section"
  | "generated-pattern"
  | "midi"
  | "audio"
  | "automation"
  | "marker";

export type TrackType =
  | "generated"
  | "midi"
  | "audio"
  | "folder"
  | "bus"
  | "return"
  | "master";

export type TrackRole =
  | "arrangement"
  | "drums"
  | "bass"
  | "chords"
  | "melody"
  | "guitar"
  | "fx-return"
  | "master"
  | "bus"
  | "folder"
  | "media"
  | "automation";

export const RECORDING_CHANNEL_MODES = ["mono", "stereo"] as const;
export type RecordingChannelMode = typeof RECORDING_CHANNEL_MODES[number];
export const RECORDING_INPUT_MODES = ["mono", "stereo", "split-mono"] as const;
export type RecordingInputMode = typeof RECORDING_INPUT_MODES[number];

export interface TrackRecordingInput {
  deviceId: string | null;
  mode: RecordingInputMode;
  channelIndex?: number;
  channelPair?: [number, number];
  allowDuplicateChannels?: boolean;
}

export interface SourceRef {
  id: string;
  sourceType: "pocket-chordsmith" | "pocket-dj" | "manual" | "unknown";
  sourcePrefix?: "PCS1" | "PDJ1" | string;
  schemaVersion?: number;
  importedAt: string;
  title?: string;
  checksum?: string;
  original: JsonValue;
  normalized?: JsonValue;
  notes?: string[];
}

export interface ProjectMeta {
  id: string;
  title: string;
  bpm: number;
  key: string;
  scale: string;
  timeSig: number;
  meterMap?: ProjectMeterMapPoint[];
  swing: number;
  resolution: number;
  sampleRate: number;
  ppq: number;
  metronome?: MetronomeSettings;
}

export interface ProjectMeterMapPoint {
  id: string;
  bar: number;
  numerator: number;
  denominator: number;
  source?: "manual" | "midi-import";
  sourceClipId?: string;
  sourceTick?: number;
  seconds?: number;
}

export interface MetronomeSettings {
  enabled: boolean;
  countInBars: number;
  volume: number;
}

export interface TimelinePosition {
  bar: number;
  beat: number;
  tick: number;
}

export interface TimelineLoop {
  enabled: boolean;
  startBar: number;
  endBar: number;
}

export interface TimelineSelection {
  startBar: number;
  endBar: number;
  source: "manual" | "loop" | "clip" | "punch";
}

export const GAME_STATE_MARKERS = ["calm", "danger", "combat", "win", "lose", "menu"] as const;
export type GameStateMarkerId = (typeof GAME_STATE_MARKERS)[number];

export interface TimelineMarker {
  id: string;
  bar: number;
  name: string;
  color?: string;
  markerType?: "section" | "cue" | "loop" | "export" | "game-state";
  gameState?: GameStateMarkerId;
}

export interface ClipTransforms {
  transpose: number;
  octave: number;
  gain: number;
  stemMutes: Record<string, boolean>;
  variationId?: string;
  freezeRenderId?: string;
  convertToMidiHint?: boolean;
}

export interface Clip {
  id: string;
  type: ClipType;
  trackId: string;
  sourceRefId?: string;
  sectionId?: string;
  startBar: number;
  barLength: number;
  name: string;
  muted: boolean;
  color: string;
  linked: boolean;
  transforms: ClipTransforms;
  lane?: number;
  noteEventIds?: string[];
  mediaPoolItemId?: string;
  automationLaneId?: string;
  metadata?: JsonObject;
}

export interface Timeline {
  bars: number;
  cursor: TimelinePosition;
  loop: TimelineLoop;
  selection?: TimelineSelection | null;
  markers: TimelineMarker[];
  clips: Clip[];
}

export interface TrackRouting {
  inputIds: string[];
  outputId: string | null;
  sendIds: string[];
  busId?: string | null;
}

export interface Track {
  id: string;
  name: string;
  trackType: TrackType;
  role: TrackRole;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  colour: string;
  routing: TrackRouting;
  automationLaneIds: string[];
  fxChainId?: string;
  folderId?: string | null;
  recordKind?: "none" | "live-vocals" | "live-instrument";
  inputDeviceId?: string | null;
  recordingInput?: TrackRecordingInput;
  monitorEnabled?: boolean;
  recordingChannelMode?: RecordingChannelMode;
  active?: boolean;
  meter?: {
    peak: number;
    rms?: number;
  };
  metadata?: JsonObject;
}

export type FxPluginType =
  | "utility-gain"
  | "high-pass"
  | "low-pass"
  | "three-band-eq"
  | "parametric-eq"
  | "compressor"
  | "limiter"
  | "noise-gate"
  | "saturation"
  | "bitcrusher"
  | "delay"
  | "ping-pong-delay"
  | "reverb"
  | "chorus"
  | "phaser"
  | "tremolo-autopan";

export interface FxPluginInstance {
  id: string;
  type: FxPluginType | string;
  name: string;
  enabled: boolean;
  presetId?: string;
  parameters: JsonObject;
}

export interface FxChain {
  id: string;
  name: string;
  ownerTrackId?: string;
  slots: FxPluginInstance[];
  metadata?: JsonObject;
}

export interface FxState {
  chains: FxChain[];
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  host?: string;
  kind: "input" | "output" | "duplex" | "unknown";
  isDefaultInput?: boolean;
  isDefaultOutput?: boolean;
  supportedSampleRates?: number[];
  supportedBufferSizes?: number[];
  supportedChannels?: number[];
}

export interface AudioDeviceSettings {
  host: "browser" | "wasapi" | "asio" | "unknown" | string;
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  sampleRate: number;
  bufferSize: number;
  inputChannels: number;
  outputChannels: number;
  lastProbeAt?: string;
  devices?: AudioDeviceInfo[];
  notes?: string[];
}

export interface AutomationPoint {
  bar: number;
  beat?: number;
  tick?: number;
  value: number;
  curve?: "linear" | "hold" | "ease-in" | "ease-out";
}

export interface AutomationLane {
  id: string;
  trackId?: string;
  targetPath: string;
  unit?: "linear" | "db" | "hz" | "percent" | "boolean";
  min?: number;
  max?: number;
  points: AutomationPoint[];
  enabled: boolean;
}

export interface AutomationState {
  lanes: AutomationLane[];
}

export interface RoutingGraph {
  masterTrackId: string;
  buses: Array<{
    id: string;
    name: string;
    trackIds: string[];
    outputId: string;
  }>;
  returns: Array<{
    id: string;
    name: string;
    outputId: string;
    effectChainIds?: string[];
  }>;
}

export interface MediaPoolItem {
  id: string;
  kind: "audio" | "midi" | "render" | "image" | "unknown";
  name: string;
  uri?: string;
  mimeType?: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  sizeBytes?: number;
  checksum?: string;
  metadata?: JsonObject;
}

export interface RenderCacheItem {
  id: string;
  sourceClipId?: string;
  mediaPoolItemId?: string;
  profileId?: string;
  createdAt: string;
  invalidated: boolean;
  metadata?: JsonObject;
}

export type ExportProfileKind =
  | "full-song-wav"
  | "full-song-midi"
  | "full-song-flac"
  | "stem-flacs"
  | "full-song-mp3"
  | "aiff-interchange"
  | "stem-wavs"
  | "section-loops"
  | "godot-adaptive-pack"
  | "web-game-pack"
  | "godot-ogg-pack"
  | "web-ogg-pack"
  | "pocket-dj-session";

export type ExportProfileFormat =
  | "wav"
  | "midi"
  | "zip"
  | "json"
  | "flac"
  | "ogg-vorbis"
  | "mp3"
  | "aiff"
  | "aif"
  | "mpg";

export interface ExportProfile {
  id: ExportProfileKind | string;
  name: string;
  format: ExportProfileFormat;
  enabled: boolean;
  scope: "full-song" | "selection" | "sections" | "stems" | "game-pack";
  sampleRate?: number;
  bitDepth?: 16 | 24 | 32;
  includeMuted?: boolean;
  includeMetadata?: boolean;
  future?: boolean;
  settings: JsonObject;
}

export interface ImportHistoryItem {
  id: string;
  sourceRefId: string;
  importedAt: string;
  importKind: "PCS1" | "PDJ1" | "raw-json" | "pocketdaw" | "demo" | "unknown";
  message: string;
}

export interface MixerState {
  masterLimiter: boolean;
  meterMode: "peak" | "rms" | "lufs";
}

export interface PocketDawProject {
  app: typeof POCKET_DAW_APP;
  schemaVersion: number;
  dawVersion: string;
  sourceRefs: SourceRef[];
  project: ProjectMeta;
  timeline: Timeline;
  tracks: Track[];
  automation: AutomationState;
  routing: RoutingGraph;
  mediaPool: MediaPoolItem[];
  renderCache: RenderCacheItem[];
  fx: FxState;
  audioDeviceSettings: AudioDeviceSettings;
  mixer: MixerState;
  exportProfiles: ExportProfile[];
  importHistory: ImportHistoryItem[];
  unknownFields?: JsonObject;
}
