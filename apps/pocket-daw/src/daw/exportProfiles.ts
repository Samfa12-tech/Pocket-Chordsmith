import type { ExportProfile } from "./schema";

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
        normalize: false,
        tailSeconds: 1.2
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
        mode: "sequential-downloads"
      }
    },
    {
      id: "section-loops",
      name: "Section Loops",
      format: "json",
      enabled: true,
      scope: "sections",
      sampleRate: 44100,
      bitDepth: 16,
      includeMetadata: true,
      settings: {
        renderWavs: false
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
        manifestOnly: true
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
        manifestOnly: true
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
