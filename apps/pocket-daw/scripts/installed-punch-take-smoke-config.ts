import { tmpdir } from "node:os";
import { join } from "node:path";

export interface InstalledPunchTakeSmokeArgs {
  sessionPath: string;
  outputDir: string | null;
  installerPath: string | null;
  recordMs: number;
  midiRecordMs: number;
  requireAudibleAudio: boolean;
  requireMidiInput: boolean;
  requireExportFiles: boolean;
  minAudioDurationSeconds: number;
  minAudioPeak: number;
  minAudioRms: number;
  audioInputDeviceId: string | null;
  audioInputChannelIndex: number;
}

export function parseInstalledPunchTakeSmokeArgs(
  argv: string[],
  localAppData = process.env.LOCALAPPDATA || tmpdir()
): InstalledPunchTakeSmokeArgs {
  const parsed: InstalledPunchTakeSmokeArgs = {
    sessionPath: join(localAppData, "Pocket DAW", "ai-bridge-session.json"),
    outputDir: null,
    installerPath: null,
    recordMs: 500,
    midiRecordMs: 500,
    requireAudibleAudio: false,
    requireMidiInput: false,
    requireExportFiles: false,
    minAudioDurationSeconds: 3,
    minAudioPeak: 0.005,
    minAudioRms: 0.001,
    audioInputDeviceId: null,
    audioInputChannelIndex: 0
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--session") parsed.sessionPath = requiredValue(argv[++index], arg);
    else if (arg === "--out") parsed.outputDir = requiredValue(argv[++index], arg);
    else if (arg === "--installer") parsed.installerPath = requiredValue(argv[++index], arg);
    else if (arg === "--record-ms") parsed.recordMs = parsePositiveInteger(requiredValue(argv[++index], arg), arg);
    else if (arg === "--midi-record-ms") parsed.midiRecordMs = parsePositiveInteger(requiredValue(argv[++index], arg), arg);
    else if (arg === "--require-audible-audio") parsed.requireAudibleAudio = true;
    else if (arg === "--require-midi-input") parsed.requireMidiInput = true;
    else if (arg === "--require-export-files") parsed.requireExportFiles = true;
    else if (arg === "--min-audio-duration-seconds") parsed.minAudioDurationSeconds = parsePositiveNumber(requiredValue(argv[++index], arg), arg);
    else if (arg === "--min-audio-peak") parsed.minAudioPeak = parsePositiveNumber(requiredValue(argv[++index], arg), arg);
    else if (arg === "--min-audio-rms") parsed.minAudioRms = parsePositiveNumber(requiredValue(argv[++index], arg), arg);
    else if (arg === "--audio-input-device-id") parsed.audioInputDeviceId = requiredValue(argv[++index], arg).trim();
    else if (arg === "--audio-input-channel-index") parsed.audioInputChannelIndex = parseNonNegativeInteger(requiredValue(argv[++index], arg), arg);
    else if (arg === "--help") {
      console.log(installedPunchTakeSmokeUsage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

export function installedPunchTakeSmokeUsage(): string {
  return "Usage: tsx scripts/smoke-installed-punch-take-lanes.ts [--session <ai-bridge-session.json>] [--out <folder>] [--installer <setup.exe>] [--record-ms <milliseconds>] [--midi-record-ms <milliseconds>] [--require-audible-audio] [--require-midi-input] [--require-export-files] [--min-audio-duration-seconds <seconds>] [--min-audio-peak <peak>] [--min-audio-rms <rms>] [--audio-input-device-id <probed-device-id>] [--audio-input-channel-index <zero-based-index>]";
}

function requiredValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a zero-based non-negative integer.`);
  return parsed;
}

function parsePositiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number.`);
  return parsed;
}
