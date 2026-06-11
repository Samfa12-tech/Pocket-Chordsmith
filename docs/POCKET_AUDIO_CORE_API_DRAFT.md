# Pocket Audio Core API Draft

Date: 2026-06-11

This draft describes the first usable API shape for Pocket Audio Core. Names are provisional, but the boundaries are intentional: core owns parsing, normalization, deterministic events, live playback, offline render, stems, MIDI, and adaptive music primitives. Apps own UI, handoff navigation, DAW-only editing, and Godot editor/runtime integration.

## Package Entry Points

```js
import {
  PocketAudio,
  parseProject,
  parseShareCode,
  buildShareCode,
  normaliseProject,
  renderEvents,
  renderWav,
  renderStems,
  exportMidi
} from "pocket-audio-core";
```

Browser global/IIFE:

```html
<script src="dist/pocket-audio-core.iife.js"></script>
<script>
  const audio = new PocketAudioCore.PocketAudio();
</script>
```

## Core Concepts

### Core Version

```ts
type PocketAudioCoreVersion = string;
```

The core version is not the same as the Pocket Chordsmith project schema.

### Accepted Inputs

```ts
type ProjectInput =
  | string
  | unknown
  | PocketAudioProject;
```

Input string may be:

- `PCS1:` share code
- raw Pocket Chordsmith JSON text
- future core project JSON text

### Normalized Project

```ts
interface PocketAudioProject {
  app: "PocketAudioProject";
  coreProjectVersion: 1;
  source: ProjectSource;
  meta: ProjectMeta;
  transport: TransportDefaults;
  mixer: MixerDefaults;
  sections: Record<SectionId, PocketAudioSection>;
  sequence: SectionId[];
  markers: PocketAudioMarker[];
  compatibility: CompatibilityInfo;
}
```

The normalized project is runtime-facing. It should preserve source metadata but should not mirror every Pocket Chordsmith UI field as top-level runtime state.

```ts
interface ProjectSource {
  sourceType: "pocket-chordsmith" | "pocket-audio" | "unknown";
  sourcePrefix?: "PCS1" | string;
  sourceSchemaVersion?: number;
  original?: unknown;
  normalizedAt: string;
}

interface ProjectMeta {
  title: string;
  key: string;
  scale: "major" | "minor";
  bpm: number;
  timeSig: 3 | 4 | number;
  resolution: number;
  swing: number;
  ppq: number;
}
```

### Sections

```ts
type SectionId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

interface PocketAudioSection {
  id: SectionId;
  bars: number;
  active: boolean;
  progression: number[];
  drums: DrumLaneSet;
  bass: BassLane;
  chords: ChordLane;
  melody: MelodyLane[];
  guitar: GuitarLane;
}
```

### Mixer

```ts
type StemId = "drums" | "bass" | "chords" | "melody" | "guitar";

interface MixerDefaults {
  masterVolume: number;
  stems: Record<StemId, StemSettings>;
  fx: CoreFxSettings;
}

interface StemSettings {
  volume: number;
  pan?: number;
  mute: boolean;
  solo?: boolean;
}

interface CoreFxSettings {
  filter?: number;
  delay?: number;
  echo?: number;
  chorus?: number;
  flanger?: number;
  reverb?: number;
  mix?: number;
  sidechain?: {
    enabled: boolean;
    amount: number;
  };
}
```

## Parser And Normalizer API

```ts
function parseProject(input: ProjectInput, options?: ParseOptions): PocketAudioProject;
function parseShareCode(code: string, options?: ParseOptions): PocketAudioProject;
function normaliseProject(raw: unknown, options?: NormaliseOptions): PocketAudioProject;
function buildShareCode(project: unknown, options?: ShareCodeOptions): string;
function inspectProject(input: ProjectInput): ProjectInspection;
```

```ts
interface ParseOptions {
  preserveOriginal?: boolean;
  strict?: boolean;
  target?: "core" | "pocket-chordsmith" | "pocket-dj" | "pocket-daw" | "godot";
}

interface NormaliseOptions extends ParseOptions {
  schemaFallback?: number;
}

interface ShareCodeOptions {
  prefix?: "PCS1";
  compact?: boolean;
}

interface ProjectInspection {
  inputKind: "PCS1" | "raw-json" | "core-project" | "unknown";
  sourceSchemaVersion?: number;
  warnings: string[];
  errors: string[];
}
```

Important behavior:

- `parseProject` should accept both text and objects.
- `buildShareCode` should retain `PCS1:` compatibility for Pocket Chordsmith project exports.
- Unknown fields should be preservable for DAW source refs.

## Event Rendering API

```ts
function renderEvents(project: ProjectInput, options?: RenderEventOptions): PocketAudioEvent[];
function renderSectionEvents(project: ProjectInput, sectionId: SectionId, options?: RenderEventOptions): PocketAudioEvent[];
function getProjectDuration(project: ProjectInput, options?: DurationOptions): DurationInfo;
```

```ts
interface RenderEventOptions {
  scope?: "sequence" | "section";
  sectionId?: SectionId;
  includeMuted?: boolean;
  humanize?: boolean;
  humanizeSeed?: number;
  startAtSeconds?: number;
  startAtTick?: number;
  ppq?: number;
}

type EventRole = "drums" | "bass" | "chords" | "melody" | "guitar" | "marker";

type EventKind =
  | "kick"
  | "snare"
  | "hat"
  | "bass"
  | "chord"
  | "melody"
  | "guitar"
  | "marker"
  | "stinger";

interface PocketAudioEvent {
  id: string;
  role: EventRole;
  kind: EventKind;
  sectionId: SectionId;
  arrangementIndex: number;
  sourceStep: number;
  bar: number;
  beat: number;
  time: number;
  tick: number;
  duration: number;
  durationTicks: number;
  midi?: number;
  midiNotes?: number[];
  velocity: number;
  accent?: boolean;
  instrument?: string;
  articulation?: string;
  pan?: number;
  slideMidi?: number;
  slideOffset?: number;
  tuplet?: boolean;
  metadata?: Record<string, unknown>;
}
```

Rules:

- Event rendering is deterministic.
- Event trace parity is stricter than audio-render parity.
- Live playback, MIDI export, WAV export, stems, and Godot manifests should consume this same event stream.

## Live Engine API

```ts
const audio = new PocketAudio({
  latencyMode: "interactive",
  diagnostics: true
});

await audio.loadProject(projectOrShareCode);
await audio.resume();
audio.play();
audio.pause();
audio.stop();
audio.restart();
audio.seek({ bar: 5 });
```

Constructor:

```ts
interface PocketAudioOptions {
  audioContext?: AudioContext;
  latencyMode?: "interactive" | "balanced" | "playback";
  diagnostics?: boolean;
  quality?: "low" | "balanced" | "high";
  sampleRate?: number;
  scheduler?: Partial<SchedulerOptions>;
}

interface SchedulerOptions {
  lookaheadSeconds: number;
  intervalMs: number;
  lateEventGraceSeconds: number;
}
```

Transport:

```ts
class PocketAudio {
  loadProject(input: ProjectInput, options?: ParseOptions): Promise<PocketAudioProject>;
  resume(): Promise<void>;
  play(options?: PlayOptions): void;
  pause(): void;
  stop(): void;
  restart(): void;
  seek(position: TransportPosition): void;
  getTransport(): TransportSnapshot;
  dispose(): void;
}

interface PlayOptions {
  scope?: "sequence" | "section";
  sectionId?: SectionId;
}

interface TransportPosition {
  seconds?: number;
  bar?: number;
  tick?: number;
}

interface TransportSnapshot {
  playing: boolean;
  scope: "sequence" | "section";
  sectionId: SectionId;
  arrangementIndex: number;
  bar: number;
  beat: number;
  step: number;
  seconds: number;
  tick: number;
}
```

Section and sequence control:

```ts
audio.setSection("A", { immediate: true });
audio.queueSection("B", { quantize: "bar" });
audio.setSequence(["A", "B", "C", "A"]);
audio.queueSequence(["C", "D", "A"], { quantize: "section" });
audio.setLoop({ enabled: true, sectionId: "C" });
```

```ts
interface QueueOptions {
  quantize?: "instant" | "beat" | "bar" | "section";
}

interface LoopOptions {
  enabled: boolean;
  sectionId?: SectionId;
  startBar?: number;
  endBar?: number;
}
```

Mixer and FX:

```ts
audio.setMasterVolume(0.85);
audio.setStemVolume("drums", 0.9);
audio.setStemMute("melody", true);
audio.setStemPan("guitar", -0.1);
audio.setFx({ filter: 0.8, echo: 0.12, reverb: 0.2 });
audio.setSidechain({ enabled: true, amount: 0.45 });
```

Build/drop and performance helpers:

```ts
audio.triggerBuild({ bars: 2 });
audio.triggerDrop({ targetSection: "D", quantize: "bar" });
audio.resetPerformanceFx();
```

These helpers can be optional. Pocket DJ may keep its own macro layer and call lower-level mixer/queue APIs instead.

Events:

```ts
audio.on("beat", event => {});
audio.on("bar", event => {});
audio.on("section", event => {});
audio.on("marker", event => {});
audio.on("event", event => {});
audio.on("diagnostics", metrics => {});
audio.off("beat", callback);
```

## Offline Render API

```ts
const wav = await renderWav(projectOrShareCode, {
  scope: "sequence",
  sampleRate: 44100,
  tailSeconds: 1.2
});

const stems = await renderStems(projectOrShareCode, {
  scope: "sequence",
  stems: ["drums", "bass", "chords", "melody", "guitar"]
});
```

```ts
interface RenderAudioOptions {
  scope?: "sequence" | "section" | "loop";
  sectionId?: SectionId;
  sampleRate?: number;
  channels?: 1 | 2;
  tailSeconds?: number;
  normalize?: boolean;
  limiter?: boolean;
  format?: "wav";
}

interface RenderedAudio {
  blob: Blob;
  buffer?: AudioBuffer;
  duration: number;
  sampleRate: number;
  channels: number;
  eventCount: number;
}

interface RenderStemsOptions extends RenderAudioOptions {
  stems?: StemId[];
}

type RenderedStems = Record<StemId, RenderedAudio>;
```

Rule: offline render must use the same normalized project, event renderer, instrument definitions, and FX modules as live playback wherever the Web Audio APIs allow it.

## MIDI Export API

```ts
const midi = exportMidi(projectOrShareCode, {
  scope: "sequence",
  timing: "quantized",
  exactDurations: true
});
```

```ts
interface MidiExportOptions {
  scope?: "sequence" | "section";
  sectionId?: SectionId;
  ppq?: number;
  timing?: "quantized" | "performance";
  chordExport?: "played" | "block" | "none";
  exactDurations?: boolean;
}

interface MidiExportResult {
  blob: Blob;
  bytes?: Uint8Array;
  trackCount: number;
  noteCount: number;
  ppq: number;
}
```

MIDI import is not required in the first core milestone. It may remain Pocket Chordsmith or Pocket DAW app logic until core parity is stable.

## Game/Adaptive API

```ts
audio.defineMusicStates({
  menu: { sequence: ["A"], loop: true, stems: { melody: { mute: true } } },
  calm: { sequence: ["A", "B"], loop: true },
  danger: { sequence: ["C", "D"], fx: { filter: 0.9, reverb: 0.12 } },
  victory: { sequence: ["E"], loop: false, stinger: "win" }
});

audio.setMusicState("danger", { quantize: "bar" });
audio.triggerStinger("hit");
```

```ts
interface MusicStateDefinition {
  section?: SectionId;
  sequence?: SectionId[];
  loop?: boolean;
  stems?: Partial<Record<StemId, Partial<StemSettings>>>;
  fx?: Partial<CoreFxSettings>;
  stinger?: string;
}

interface GameMusicOptions {
  quantize?: "instant" | "beat" | "bar" | "section";
}
```

Diagnostics for games:

```ts
const metrics = audio.getDiagnostics();
```

```ts
interface PocketAudioDiagnostics {
  audioContextState: string;
  activeVoices: number;
  activeVoicesByRole: Record<EventRole, number>;
  peakVoices: number;
  scheduledEventCount: number;
  skippedLateEventCount: number;
  droppedSchedulerWindows: number;
  schedulerLookaheadSeconds: number;
  schedulerIntervalMs: number;
  currentSection: SectionId;
}
```

## Godot Export API

Core should not try to control the Godot editor directly. It should generate parity assets and manifests that the existing addon can import or package.

```ts
const pack = await exportGodotAudioPack(projectOrShareCode, {
  renderStems: true,
  renderLoops: true,
  renderStingers: true,
  includeEventManifest: true
});
```

```ts
interface GodotAudioPackOptions {
  sampleRate?: number;
  renderStems?: boolean;
  renderLoops?: boolean;
  renderStingers?: boolean;
  includeEventManifest?: boolean;
  format?: "wav";
}

interface GodotAudioPack {
  manifest: GodotAudioManifest;
  files: Array<{ path: string; blob: Blob }>;
}
```

Godot direct browser POST remains Pocket Chordsmith UI/addon integration. Core's role is the asset/event truth.

## Error Model

```ts
class PocketAudioError extends Error {
  code: PocketAudioErrorCode;
  details?: unknown;
}

type PocketAudioErrorCode =
  | "ERR_EMPTY_INPUT"
  | "ERR_INVALID_SHARE_CODE"
  | "ERR_INVALID_JSON"
  | "ERR_UNSUPPORTED_SCHEMA"
  | "ERR_AUDIO_UNAVAILABLE"
  | "ERR_OFFLINE_RENDER_UNAVAILABLE"
  | "ERR_RENDER_FAILED";
```

Errors should be app-friendly and safe to show to users.

## Minimal First Consumer Example

```js
import { PocketAudio } from "./dist/pocket-audio-core.esm.js";

const audio = new PocketAudio({ diagnostics: true });
await audio.loadProject(pcs1Code);

playButton.addEventListener("click", async () => {
  await audio.resume();
  audio.play({ scope: "sequence" });
});

dangerButton.addEventListener("click", () => {
  audio.queueSection("C", { quantize: "bar" });
  audio.setFx({ filter: 0.9, reverb: 0.18 });
});
```

## Open Design Questions

1. Should the first package be TypeScript-first, or plain JavaScript with generated `.d.ts`? TypeScript is cleaner because Pocket DAW already uses it.
2. Should `humanizeOn` be represented as event-level variation, synth-level variation, or both?
3. Should DJ build/drop macros live in core or remain a Pocket DJ adapter layer?
4. How much of Chordsmith's XY pad live behavior belongs in core v0 versus later?
5. How should core preserve unknown original source fields while still returning a compact runtime model for games?
6. Should stem render include wet FX per stem, dry stems plus FX return, or both?
7. What is the first Godot manifest shape the addon should consume for parity packs?

## Suggested API Stability Rule

Until `1.0.0`, app integrations should pin exact core versions. Any change to event timing, instrument sound, offline rendering, or normalization defaults requires:

- changelog entry
- compatibility matrix update
- fixture regeneration only when intentional
- Pocket Chordsmith smoke check
- Pocket DJ smoke check
- Pocket DAW import/render smoke check once wired
- Godot asset/manifest smoke check once wired
