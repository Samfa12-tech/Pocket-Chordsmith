import type { ExportProfile, ExportProfileFormat } from "./schema";

const READY_EXPORT_FORMATS = new Set<ExportProfileFormat>(["wav", "midi", "zip", "json"]);
const PLANNED_AUDIO_CODECS = new Set(["flac", "ogg-vorbis", "mp3", "aiff", "aif"]);
const REJECTED_AUDIO_CODECS = new Set(["mpg"]);
const CODEC_LABELS: Record<string, string> = {
  flac: "FLAC",
  "ogg-vorbis": "Ogg Vorbis",
  mp3: "MP3",
  aiff: "AIFF",
  aif: "AIF",
  mpg: "MPG"
};

export interface ExportProfileValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function createDefaultExportProfiles(): ExportProfile[] {
  return [
    {
      id: "full-song-wav",
      name: "Full Song WAV",
      format: "wav",
      enabled: true,
      scope: "full-song",
      sampleRate: 44100,
      bitDepth: 16,
      includeMuted: false,
      includeMetadata: true,
      settings: {
        channelMode: "stereo",
        normalize: false,
        tailSeconds: 1.2
      }
    },
    {
      id: "full-song-flac",
      name: "Full Song FLAC",
      format: "flac",
      enabled: false,
      scope: "full-song",
      sampleRate: 44100,
      bitDepth: 24,
      includeMuted: false,
      includeMetadata: true,
      future: true,
      settings: {
        audioCodec: "flac",
        encoderStatus: "planned",
        fallbackFormat: "wav",
        priority: 1,
        compressionLevel: 5,
        notes: "Lossless smaller full-song export is planned after native encoder selection and installed smoke tests."
      }
    },
    {
      id: "full-song-mp3",
      name: "Full Song MP3",
      format: "mp3",
      enabled: false,
      scope: "full-song",
      sampleRate: 44100,
      includeMuted: false,
      includeMetadata: true,
      future: true,
      settings: {
        audioCodec: "mp3",
        encoderStatus: "planned",
        fallbackFormat: "wav",
        priority: 3,
        bitrateKbps: 192,
        notes: "Compatibility MP3 export is planned after dependency and licensing review."
      }
    },
    {
      id: "full-song-midi",
      name: "Full Song MIDI",
      format: "midi",
      enabled: true,
      scope: "full-song",
      includeMuted: false,
      includeMetadata: true,
      settings: {
        tracks: ["drums", "bass", "chords", "melody", "guitar"],
        ppq: 480
      }
    },
    {
      id: "stem-flacs",
      name: "Stem FLACs",
      format: "flac",
      enabled: false,
      scope: "stems",
      sampleRate: 44100,
      bitDepth: 24,
      includeMuted: false,
      includeMetadata: true,
      future: true,
      settings: {
        audioCodec: "flac",
        encoderStatus: "planned",
        fallbackFormat: "wav",
        priority: 1,
        notes: "Lossless stem export is planned after WAV stem ZIP/export reliability is solid."
      }
    },
    {
      id: "stem-wavs",
      name: "Stem WAVs",
      format: "wav",
      enabled: true,
      scope: "stems",
      sampleRate: 44100,
      bitDepth: 16,
      includeMuted: false,
      includeMetadata: true,
      settings: {
        channelMode: "stereo",
        normalize: false,
        mode: "zip-archive",
        manifest: true
      }
    },
    {
      id: "section-loops",
      name: "Section Loops",
      format: "wav",
      enabled: true,
      scope: "sections",
      sampleRate: 44100,
      bitDepth: 16,
      includeMetadata: true,
      settings: {
        channelMode: "stereo",
        normalize: false,
        renderWavs: true,
        manifest: true,
        mode: "zip-archive"
      }
    },
    {
      id: "godot-adaptive-pack",
      name: "Godot Adaptive Pack",
      format: "json",
      enabled: true,
      scope: "game-pack",
      includeMetadata: true,
      settings: {
        renderAudio: true,
        includeFullMix: true,
        includeStems: true,
        includeSectionLoops: true,
        includeSourceProject: true
      }
    },
    {
      id: "godot-ogg-pack",
      name: "Godot Ogg Pack",
      format: "json",
      enabled: false,
      scope: "game-pack",
      includeMetadata: true,
      future: true,
      settings: {
        audioCodec: "ogg-vorbis",
        encoderStatus: "planned",
        fallbackFormat: "wav",
        priority: 2,
        target: "godot",
        quality: 5,
        renderAudio: true,
        includeFullMix: true,
        includeStems: true,
        includeSectionLoops: true,
        includeSourceProject: true,
        notes: "Compressed Godot game packs need encoder support plus loop/gapless import smoke before release claims."
      }
    },
    {
      id: "web-game-pack",
      name: "Web Game Pack",
      format: "json",
      enabled: true,
      scope: "game-pack",
      includeMetadata: true,
      settings: {
        renderAudio: true,
        includeFullMix: true,
        includeStems: true,
        includeSectionLoops: true,
        includeSourceProject: true
      }
    },
    {
      id: "web-ogg-pack",
      name: "Web Ogg Pack",
      format: "json",
      enabled: false,
      scope: "game-pack",
      includeMetadata: true,
      future: true,
      settings: {
        audioCodec: "ogg-vorbis",
        encoderStatus: "planned",
        fallbackFormat: "wav",
        priority: 2,
        target: "web",
        quality: 5,
        renderAudio: true,
        includeFullMix: true,
        includeStems: true,
        includeSectionLoops: true,
        includeSourceProject: true,
        notes: "Compressed web game packs need browser runtime smoke before release claims."
      }
    },
    {
      id: "aiff-interchange",
      name: "AIFF Interchange",
      format: "aiff",
      enabled: false,
      scope: "full-song",
      sampleRate: 44100,
      bitDepth: 24,
      includeMuted: false,
      includeMetadata: true,
      future: true,
      settings: {
        audioCodec: "aiff",
        encoderStatus: "planned",
        fallbackFormat: "wav",
        priority: 4,
        notes: "AIFF/AIF is useful for interchange but is not a game-pack priority."
      }
    },
    {
      id: "pocket-dj-session",
      name: "Pocket DJ Session",
      format: "json",
      enabled: false,
      scope: "full-song",
      future: true,
      settings: {}
    }
  ];
}

export function validateExportProfile(profile: ExportProfile, context = profile.name): ExportProfileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const formatCodec = normalizeCodec(profile.format);

  if (!READY_EXPORT_FORMATS.has(profile.format)) {
    errors.push(unsupportedCodecMessage(formatCodec || profile.format));
  }

  for (const key of ["audioCodec", "audioFormat", "codec", "container", "extension"]) {
    const codec = normalizeCodec(profile.settings?.[key]);
    if (!codec || codec === "wav") continue;
    if (codec === "json" || codec === "zip" || codec === "midi") continue;
    errors.push(unsupportedCodecMessage(codec, key));
  }

  if (profile.future && profile.enabled) {
    warnings.push(`${context} is marked as a future profile but is enabled.`);
  }
  if (profile.format === "wav") {
    const bitDepth = Number(profile.bitDepth ?? 16);
    if (Number.isFinite(bitDepth) && bitDepth !== 16) {
      errors.push(`WAV bitDepth=${bitDepth} is planned, but the current WAV encoder writes 16-bit PCM. Use 16-bit WAV export for now.`);
    }
    const sampleRate = Number(profile.sampleRate ?? 44100);
    if (Number.isFinite(sampleRate) && (sampleRate < 22050 || sampleRate > 192000)) {
      errors.push(`WAV sampleRate=${sampleRate} is outside the supported 22050-192000 Hz range.`);
    }
    const channelMode = typeof profile.settings?.channelMode === "string" ? profile.settings.channelMode : "stereo";
    if (channelMode !== "stereo" && channelMode !== "mono") {
      errors.push(`WAV channelMode=${channelMode} is not supported. Use mono or stereo WAV export for now.`);
    }
    const normalize = profile.settings?.normalize;
    if (normalize !== undefined && normalize !== false && normalize !== true && normalize !== "peak" && normalize !== "off") {
      errors.push(`WAV normalize=${String(normalize)} is not supported. Use off or peak WAV normalization for now.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings
  };
}

export function assertExportProfileSupported(profile: ExportProfile, action = "Export"): void {
  const result = validateExportProfile(profile);
  if (result.ok) return;
  throw new Error(`${action} profile "${profile.name}" is not supported yet. ${result.errors.join(" ")}`);
}

function normalizeCodec(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^\./, "");
  if (!normalized) return null;
  if (normalized === "ogg" || normalized === "vorbis") return "ogg-vorbis";
  if (normalized === "aif") return "aif";
  if (normalized === "aiff") return "aiff";
  if (normalized === "mpeg3") return "mp3";
  return normalized;
}

function unsupportedCodecMessage(codec: string, settingKey?: string): string {
  const label = CODEC_LABELS[codec] || codec.toUpperCase();
  const prefix = settingKey ? `${settingKey}=${label}` : label;
  if (PLANNED_AUDIO_CODECS.has(codec)) {
    return `${prefix} export is planned, but no ${label} encoder is wired yet. Use WAV export for now.`;
  }
  if (REJECTED_AUDIO_CODECS.has(codec)) {
    return `${prefix} is not a Pocket DAW audio export target. Use MP3 after encoder support lands if you meant compressed MPEG audio.`;
  }
  return `${prefix} export is not supported by Pocket DAW. Use WAV export for now.`;
}
