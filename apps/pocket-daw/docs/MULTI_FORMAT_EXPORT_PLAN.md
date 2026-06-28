# Multi-Format Export Plan

This is the design anchor for export formats beyond the current WAV, MIDI and ZIP pack paths. It does not change the current shipped behavior: Pocket DAW exports full-song WAV, full-song MIDI, stem WAVs, section-loop WAVs, Godot adaptive ZIP packs and web-game ZIP packs.

## Current Baseline

- `src/audio/offlineRender.ts` renders the audible project into a stereo `AudioBuffer` and encodes 16-bit PCM WAV in `encodeWav`.
- `src/audio/midiExport.ts` owns Standard MIDI File export for generated events.
- `src/daw/exportProfiles.ts` defines current default profiles for full-song WAV, full-song MIDI, stem WAVs, section loops, Godot adaptive pack, web-game pack and a future Pocket DJ session.
- `src/daw/schema.ts` already gives `ExportProfile` optional `sampleRate`, `bitDepth`, `includeMuted`, `includeMetadata` and flexible `settings`.
- `src/daw/exportJobs.ts` builds stem, section-loop and game-pack jobs. Game packs currently render WAV files plus manifests and source project JSON.
- `package.json` and `src-tauri/Cargo.toml` do not include MP3, FLAC, Opus, Vorbis or AAC encoder dependencies.

## Design Goals

- Keep WAV as the trusted master render path. Lossy and compressed formats should encode from the same audible render users can already verify.
- Add export settings in visible profiles instead of hidden defaults: format, container, sample rate, bit depth, normalization, dither, bitrate or quality, channel mode and game-pack layout.
- Preserve existing exports and manifests. Current game importers should keep accepting WAV packs until compressed pack support is proven in the target runtime.
- Make unsupported encoders explicit. The UI should show an unavailable format as unavailable with a reason, not silently fall back to WAV under a misleading file extension.
- Keep Core as the long-term export contract owner for shared manifests, paths, profile vocabulary and deterministic render metadata, while DAW/Tauri can own native codec execution.

## Proposed Export Profile Shape

Keep schema `2` initially and expand profile settings in place.

```ts
type AudioExportFormat = "wav" | "flac" | "mp3" | "ogg-vorbis" | "opus";

interface AudioExportSettings {
  format: AudioExportFormat;
  sampleRate: 44100 | 48000 | 96000;
  channelMode: "stereo" | "mono-sum";
  bitDepth?: 16 | 24 | 32;
  normalize: false | "peak" | "lufs";
  targetPeakDb?: number;
  targetLufs?: number;
  dither?: "none" | "triangular";
  bitrateKbps?: number;
  quality?: number;
  tailSeconds: number;
  includeSourceWav?: boolean;
}
```

Existing `ExportProfile.format` is currently `"wav" | "midi" | "zip" | "json"`. The first implementation can keep that field as a broad category and place codec detail in `settings.format`, or add new string variants after tests prove migration behavior.

## Format Matrix

| Target | First useful settings | Use case | Notes |
| --- | --- | --- | --- |
| WAV PCM | 44.1/48 kHz, 16/24-bit, optional dither | Master, stems, archival game import | Already implemented as 16-bit WAV; 24-bit needs encoder work. |
| FLAC | 44.1/48 kHz, 16/24-bit, compression level | Lossless sharing and smaller source packs | Good first native codec after WAV because it preserves audio. |
| MP3 | 128/192/256/320 kbps, stereo | Broad playback compatibility | Patent risk is low in modern practice, but dependency licensing must still be recorded before bundling. |
| Ogg Vorbis | quality 3-8 | Browser/game-friendly compressed loops | Useful for web packs when target importers support it. |
| Opus | 96/128/160 kbps | Modern game/web adaptive music | Best for quality at low bitrate, but runtime support varies. |

AAC/M4A should stay out of the first pass unless the native platform encoder path is proven and redistribution/licensing is documented.

## Renderer-To-Encoder Boundary

Add an internal boundary that takes rendered PCM plus profile settings and returns one or more encoded artifacts:

```ts
interface RenderedPcmArtifact {
  sampleRate: number;
  channels: 1 | 2;
  durationSeconds: number;
  peakDb: number;
  lufsIntegrated?: number;
  wavBlob?: Blob;
}

interface EncodedAudioArtifact {
  path: string;
  mimeType: string;
  format: AudioExportFormat;
  sizeBytes: number;
  settings: AudioExportSettings;
  warnings: string[];
}
```

The browser renderer can keep producing WAV/PCM for now. Installed builds can hand PCM or WAV bytes to native encoders when a codec dependency is added. Game packs should use the same `EncodedAudioArtifact` summary in manifests so Godot/web importers know exactly what they received.

## Normalization, Bit Depth And Dither

- `normalize: false` remains the default.
- Peak normalization should scan the rendered buffer before encoding and apply a visible gain value stored in export metadata.
- LUFS normalization should wait until a measured loudness implementation exists; do not approximate it with peak.
- Dither only matters when reducing to fixed-point PCM bit depths. Apply it at the final bit-depth conversion stage, not before lossy encoding.
- Store `normalizationGainDb`, measured peak, target peak/LUFS, dither mode, encoder name and encoder version in export manifests or sidecar metadata.

## Game-Pack Compression Flow

- Keep current WAV game packs as the default because the Godot addon and web importer paths already understand those files.
- Add a separate game-pack profile such as `godot-compressed-pack` or `web-compressed-pack` only after target importers can decode the format.
- For compressed packs, preserve the existing manifest fields and add:
  - `audioFormat`
  - `mimeType`
  - `bitrateKbps` or `quality`
  - `sampleRate`
  - `sourceWavIncluded`
  - `encoder`
- For loops, verify gapless behavior in the real target runtime before claiming loop-safe compressed exports.

## UI And Safety

- Export dialogs should show format presets instead of exposing every codec knob at once.
- Advanced settings can reveal sample rate, bit depth, normalization, dither and bitrate/quality.
- The app should validate impossible combinations before rendering, for example MP3 plus `bitDepth: 24`.
- Failed encodes should leave the master WAV available when `includeSourceWav` is true, and should report the exact encoder failure.
- Release notes should distinguish "export profile exists" from "installed encoder smoke passed".

## Core Boundary

Pocket Audio Core should eventually own:

- shared export-profile vocabulary;
- game-pack path and manifest evolution;
- deterministic event/render metadata used by all apps;
- fixture manifests for WAV and compressed packs.

Pocket DAW should own:

- the current project renderer;
- installed native encoder invocation;
- file dialogs, progress, cancellation and artifact writing;
- exact installed smoke evidence for codec output.

## Verification Targets

- Existing WAV, MIDI, stem, section-loop and game-pack tests continue to pass unchanged.
- Project migration and roundtrip preserve future export profile settings without dropping unknown fields.
- A profile validation test rejects unsupported codec/settings combinations before rendering.
- A PCM normalization test proves peak gain calculation without clipping.
- A WAV 24-bit or FLAC fixture validates file headers and decoded duration/sample rate before release.
- MP3/Ogg/Opus fixtures verify duration, sample rate, channel count, bitrate/quality metadata and target-runtime decode.
- Godot/web compressed game-pack smoke imports a real ZIP in the target runtime and proves loop/stem playback before release notes claim support.

## Release Boundary

Until codec dependencies, UI controls, validators, manifests and installed smoke exist, release notes should continue to say that multi-format exports are planned. The implemented export set remains WAV, MIDI, stem/section WAVs and WAV-based Godot/web game packs.
