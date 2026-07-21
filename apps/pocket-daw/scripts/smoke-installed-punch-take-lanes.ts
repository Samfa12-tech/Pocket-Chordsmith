import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { loadPocketDawRaw } from "../src/app/commands";
import { addImportedAudioMedia, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { buildPocketDawProjectFile, createEmptyPocketDawProject } from "../src/daw/dawProject";
import { addMidiNote, importMidiFileToProject, midiDataFromClip, setMidiNoteField } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { validateProjectInvariants } from "../src/daw/projectInvariants";
import { POCKET_DAW_VERSION } from "../src/daw/schema";
import { addTrackToProject } from "../src/daw/tracks";
import { validateInstalledPunchTakeSummary } from "./verify-installed-punch-take-summary.mjs";

interface AiBridgeSession {
  statusUrl: string;
  controlUrl: string;
  token: string;
}

interface SmokeArgs {
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
}

interface AudioTakeSmokeCounts {
  clipCount: number;
  groupedClipCount: number;
  groupCount: number;
  activeCount: number;
}

interface RecordedAudioMediaEvidence {
  mediaPoolItemId: string;
  clipId: string;
  file: string;
  projectRelativePath: string;
  sizeBytes: number;
  durationSeconds: number;
  nativeCapturedFrameCount: number | null;
  nativeCaptureSampleRate: number | null;
  peak: number | null;
  filePeak: number;
  fileRms: number;
  fileSampleRate: number;
  fileChannels: number;
  fileFrameCount: number;
}

const args = parseArgs(process.argv.slice(2));
const root = args.outputDir ? resolve(args.outputDir) : await mkdtemp(join(tmpdir(), "pocket-daw-punch-take-installed-smoke-"));
const session = await readSession(args.sessionPath);
const projectPath = join(root, "punch-take-lane-installed-smoke.pocketdaw");
const wavPath = join(root, "punch-take-lane-installed-smoke.wav");
const midiPath = join(root, "punch-take-lane-installed-smoke.mid");
const installerEvidence = args.installerPath ? await installerSmokeEvidence(resolve(args.installerPath)) : null;
const midiDevicePreflight = midiDevicePreflightEvidence();
const midiTakeGroupId = "manual-midi-take-group-1";
const fixtureMidiRecordingTakeGroupId = "midi-recording-session-installed-midi-recording";

await mkdir(join(root, "project-media", "recordings"), { recursive: true });
await writeFile(join(root, "project-media", "recordings", "take-lane-bed.wav"), createPcmWav({ frequency: 220, seconds: 4 }));
await writeFile(join(root, "project-media", "recordings", "take-lane-punch.wav"), createPcmWav({ frequency: 440, seconds: 2 }));
const smokeProject = await createSmokeProject(root);
const midiTakeClipIds = ["midi-take-1.mid", "midi-take-2.mid"]
  .map((name) => smokeProject.timeline.clips.find((clip) => clip.name === name)?.id)
  .filter((id): id is string => !!id);
if (midiTakeClipIds.length !== 2) throw new Error(`Could not locate MIDI take fixture clips: ${midiTakeClipIds.join(", ")}`);
const midiTrackId = smokeProject.timeline.clips.find((clip) => clip.id === midiTakeClipIds[0])?.trackId;
if (!midiTrackId) throw new Error("Could not locate the MIDI track for recording-take smoke.");
await writeFile(projectPath, buildPocketDawProjectFile(smokeProject));

const initialStatus = await liveStatus(session);
assertCapability(initialStatus, "export_project");

await liveControl(session, { action: "open_project", projectPath });
const opened = await liveStatus(session);
assertRunningVersion(opened);
assertCapability(opened, "set_recording_options");
assertCapability(opened, "record_start");
assertCapability(opened, "record_stop");
assertCapability(opened, "record_toggle");
assertCapability(opened, "midi_record_start");
assertCapability(opened, "midi_record_stop");
assertCapability(opened, "midi_record_toggle");
assertLiveCommand(opened, "create_take_lane_group");
assertLiveCommand(opened, "place_midi_recording_take");
const trackId = opened.tracks.find((track: { id: string; name: string }) => track.id === "live-vocals" || track.name === "Live Vocals")?.id;
const punchMediaId = "media_002";
if (!trackId) throw new Error("Smoke project did not expose live-vocals track after open.");
if (!punchMediaId) throw new Error("Smoke project did not expose punch media after open.");

const audioRecordingControl = await exerciseAudioRecordingControl(session, trackId, projectPath, args.recordMs);
await liveControl(session, { action: "set_recording_options", punchEnabled: true, takeMode: "take-lane" });
const midiInputRecordingControl = await exerciseMidiInputRecordingControl(session, midiTrackId, projectPath, args.midiRecordMs);
const midiRecordingTakeGroupId = typeof midiInputRecordingControl.take?.takeGroupId === "string" && midiInputRecordingControl.take.takeGroupId
  ? midiInputRecordingControl.take.takeGroupId
  : fixtureMidiRecordingTakeGroupId;
await liveControl(session, { action: "set_recording_options", punchEnabled: true, takeMode: "take-lane" });
await liveControl(session, {
  action: "apply_commands",
  commands: [
    { type: "create_take_lane_group", clipIds: midiTakeClipIds, activeClipId: midiTakeClipIds[1] },
    { type: "place_midi_recording_take", trackId: midiTrackId, captureStartBar: 6, punchStartBar: 7, punchEndBar: 9, createTakeLane: true, name: "installed-midi-recording-take-1", recordingSessionId: "installed-midi-recording", notes: [{ pitch: 85, startBar: 7.25, endBar: 7.75, velocity: 92 }] },
    { type: "place_midi_recording_take", trackId: midiTrackId, captureStartBar: 6, punchStartBar: 7, punchEndBar: 9, createTakeLane: true, name: "installed-midi-recording-take-2", recordingSessionId: "installed-midi-recording-2", notes: [{ pitch: 86, startBar: 8, durationBars: 0.5, velocity: 104 }] },
    { type: "set_punch_range", startBar: 7, endBar: 9 },
    { type: "place_punch_recording_clip_from_range", mediaPoolItemId: punchMediaId, trackId, captureStartBar: 6, createTakeLane: true }
  ]
});
let status = await liveStatus(session);
assertTakeLaneSummary(status, "after punch placement");

const activePunchClipId = activeClipId(status, "installed-punch-group");
await liveControl(session, {
  action: "apply_commands",
  commands: [
    { type: "comp_audio_take_from_bar", clipId: activePunchClipId, bar: 8 },
    { type: "activate_audio_take_lane", clipId: activePunchClipId }
  ]
});
status = await liveStatus(session);
assertTakeLaneSummary(status, "after comp edit");

const activeMidiClipId = activeClipId(status, midiTakeGroupId);
await liveControl(session, {
  action: "apply_commands",
  commands: [
    { type: "set_timeline_selection", startBar: 2, endBar: 3 },
    { type: "delete_clip_range", clipId: activeMidiClipId },
    { type: "activate_audio_take_lane", clipId: activeMidiClipId }
  ]
});
status = await liveStatus(session);
assertTakeLaneSummary(status, "after MIDI take-lane edit");

await liveControl(session, { action: "save_current" });
await liveControl(session, { action: "open_project", projectPath });
status = await liveStatus(session);
assertTakeLaneSummary(status, "after save/reopen");

await liveControl(session, { action: "export_project", format: "wav", outputPath: wavPath });
await liveControl(session, { action: "export_project", format: "midi", outputPath: midiPath });
await assertFileMagic(wavPath, "RIFF", "WAVE");
await assertFileMagic(midiPath, "MThd");
const wavExportEvidence = await fileEvidence(wavPath);
const midiExportEvidence = await fileEvidence(midiPath);
const exportedMidi = parseStandardMidiFile(new Uint8Array(await readFile(midiPath)));
const exportedMidiPitches = exportedMidi.notes.map((note) => note.pitch).sort((a, b) => a - b);
if (exportedMidiPitches.includes(82) || exportedMidiPitches.includes(85) || !exportedMidiPitches.includes(83) || !exportedMidiPitches.includes(84) || !exportedMidiPitches.includes(86)) {
  throw new Error(`MIDI export leaked an inactive MIDI take lane or missed the active one: ${exportedMidiPitches.join(", ")}`);
}

const reopenedProject = loadPocketDawRaw(await readFile(projectPath, "utf8"));
const invariants = validateProjectInvariants(reopenedProject);
if (invariants.errors.length) {
  throw new Error(`Saved smoke project has invariant errors: ${invariants.errors[0].message}`);
}
assertReopenedTakeLaneMetadata(reopenedProject, midiTakeGroupId, midiRecordingTakeGroupId);

const summary = {
  ok: true,
  testedAt: new Date().toISOString(),
  runningVersion: status.project.version,
  strictRequirements: {
    requireAudibleAudio: args.requireAudibleAudio,
    requireMidiInput: args.requireMidiInput,
    requireExportFiles: args.requireExportFiles,
    minAudioDurationSeconds: args.minAudioDurationSeconds,
    minAudioPeak: args.minAudioPeak,
    minAudioRms: args.minAudioRms
  },
  installer: installerEvidence,
  projectPath,
  wavPath,
  wavSizeBytes: wavExportEvidence.sizeBytes,
  wavSha256: wavExportEvidence.sha256,
  midiPath,
  midiSizeBytes: midiExportEvidence.sizeBytes,
  midiSha256: midiExportEvidence.sha256,
  clipCount: status.project.clipCount,
  groupedClipCount: status.media.audioTakes.groupedClipCount,
  groupCount: status.media.audioTakes.groupCount,
  activeCount: status.media.audioTakes.activeCount,
  mutedCount: status.media.audioTakes.mutedCount,
  exportedMidiPitches,
  midiTakeGroupCount: status.media.audioTakes.groups.filter((group: { groupId: string }) => group.groupId === midiTakeGroupId).length,
  midiRecordingTakeGroupCount: status.media.audioTakes.groups.filter((group: { groupId: string }) => group.groupId === midiRecordingTakeGroupId).length,
  midiDevicePreflight,
  recordingConfidence: installedRecordingConfidence({
    audioRecordingControl,
    midiInputRecordingControl,
    midiDevicePreflight,
    minAudioDurationSeconds: args.minAudioDurationSeconds,
    minAudioPeak: args.minAudioPeak,
    minAudioRms: args.minAudioRms
  }),
  audioRecordingControl,
  midiInputRecordingControl
};
const summaryPath = join(root, "punch-take-lane-installed-smoke-summary.json");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
if (args.installerPath || args.requireAudibleAudio || args.requireMidiInput || args.requireExportFiles) {
  const strictValidation = validateInstalledPunchTakeSummary(summary, {
    version: POCKET_DAW_VERSION,
    installerPath: args.installerPath || undefined,
    requireAudibleAudio: args.requireAudibleAudio,
    requireMidiInput: args.requireMidiInput,
    requireExportFiles: args.requireExportFiles,
    minAudioDurationSeconds: args.minAudioDurationSeconds,
    minAudioPeak: args.minAudioPeak,
    minAudioRms: args.minAudioRms
  });
  if (!strictValidation.ok) {
    throw new Error(`Installed punch/take smoke strict verification failed. Summary was written to ${summaryPath}\n${strictValidation.failures.join("\n")}`);
  }
}
console.log(JSON.stringify(summary, null, 2));

async function createSmokeProject(rootDir: string) {
  let project = createEmptyPocketDawProject();
  project.project.title = "Punch Take Lane Installed Smoke";
  project.project.bpm = 120;
  project.project.timeSig = 4;
  const liveTrack = addTrackToProject(project, "live-vocals");
  project = liveTrack.project;

  const bedRelativePath = "project-media/recordings/take-lane-bed.wav";
  const punchRelativePath = "project-media/recordings/take-lane-punch.wav";
  const bed = addImportedAudioMedia(project, {
    name: "take-lane-bed.wav",
    uri: bedRelativePath,
    durationSeconds: 4,
    sampleRate: 44100,
    channels: 1,
    sizeBytes: (await stat(join(rootDir, bedRelativePath))).size,
    metadata: {
      mediaRefKind: "project",
      projectRelativePath: bedRelativePath,
      importMode: "native-recording"
    }
  });
  const bedClip = placeAudioClipOnTrack(bed.project, bed.item.id, liveTrack.trackId, 7, {
    extraMetadata: {
      takeGroupId: "installed-punch-group",
      recordingTakeGroupId: "installed-punch-group",
      takeLaneId: "installed-punch-group-lane-1",
      takeLaneIndex: 1,
      takeStatus: "active",
      takeActive: true
    }
  });
  project = bedClip.project;
  const punch = addImportedAudioMedia(project, {
    name: "take-lane-punch.wav",
    uri: punchRelativePath,
    durationSeconds: 2,
    sampleRate: 44100,
    channels: 1,
    sizeBytes: (await stat(join(rootDir, punchRelativePath))).size,
    metadata: {
      mediaRefKind: "project",
      projectRelativePath: punchRelativePath,
      importMode: "native-recording",
      takeGroupId: "installed-punch-group"
    }
  });
  project = punch.project;

  const firstMidi = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "midi-take-1.mid");
  const secondMidi = importMidiFileToProject(firstMidi.project, parseStandardMidiFile(simpleMidiBytes()), "midi-take-2.mid");
  project = secondMidi.project;
  const firstClip = project.timeline.clips.find((clip) => clip.id === firstMidi.clipId);
  const secondClip = project.timeline.clips.find((clip) => clip.id === secondMidi.clipId);
  if (!firstClip || !secondClip) throw new Error("Could not create MIDI take clips.");
  const firstNoteId = midiDataFromClip(firstClip).notes[0]?.id;
  const secondNoteId = midiDataFromClip(secondClip).notes[0]?.id;
  if (firstNoteId) project = setMidiNoteField(project, firstMidi.clipId, firstNoteId, "pitch", 82);
  if (secondNoteId) project = setMidiNoteField(project, secondMidi.clipId, secondNoteId, "pitch", 83);
  project = addMidiNote(project, secondMidi.clipId, 3840);
  const secondLaterNoteId = midiDataFromClip(project.timeline.clips.find((clip) => clip.id === secondMidi.clipId)!).notes.at(-1)?.id;
  if (secondLaterNoteId) project = setMidiNoteField(project, secondMidi.clipId, secondLaterNoteId, "pitch", 84);
  return project;
}

function parseArgs(argv: string[]): SmokeArgs {
  const localAppData = process.env.LOCALAPPDATA || tmpdir();
  const parsed: SmokeArgs = {
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
    minAudioRms: 0.001
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
    else if (arg === "--help") {
      console.log("Usage: tsx scripts/smoke-installed-punch-take-lanes.ts [--session <ai-bridge-session.json>] [--out <folder>] [--installer <setup.exe>] [--record-ms <milliseconds>] [--midi-record-ms <milliseconds>] [--require-audible-audio] [--require-midi-input] [--require-export-files] [--min-audio-duration-seconds <seconds>] [--min-audio-peak <peak>] [--min-audio-rms <rms>]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

async function installerSmokeEvidence(installerPath: string) {
  const bytes = await readFile(installerPath);
  return {
    path: installerPath,
    file: basename(installerPath),
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

async function fileEvidence(path: string) {
  const bytes = await readFile(path);
  return {
    sizeBytes: (await stat(path)).size,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
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

function parsePositiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number.`);
  return parsed;
}

function installedRecordingConfidence(input: {
  audioRecordingControl: any;
  midiInputRecordingControl: any;
  midiDevicePreflight: any;
  minAudioDurationSeconds: number;
  minAudioPeak: number;
  minAudioRms: number;
}) {
  const media = input.audioRecordingControl?.media || {};
  const audibleAudio = input.audioRecordingControl?.outcome === "started-and-stopped"
    && Number(media.durationSeconds) >= input.minAudioDurationSeconds
    && Number(media.filePeak) >= input.minAudioPeak
    && Number(media.fileRms) >= input.minAudioRms;
  const connectedMidi = input.midiInputRecordingControl?.outcome === "started-and-stopped"
    && input.midiInputRecordingControl?.take?.captured === true
    && Number(input.midiInputRecordingControl?.take?.noteCount) > 0;
  const blockers: string[] = [];
  if (!audibleAudio) {
    blockers.push(`Audible audio evidence needs duration >= ${input.minAudioDurationSeconds}s, filePeak >= ${input.minAudioPeak}, and fileRms >= ${input.minAudioRms}.`);
  }
  if (!connectedMidi) {
    const inputCount = Number(input.midiDevicePreflight?.inputCount);
    blockers.push(Number.isInteger(inputCount) && inputCount < 1
      ? "No OS MIDI input devices were detected for connected MIDI recording evidence."
      : "Connected MIDI recording did not capture a durable active take.");
  }
  return {
    audibleAudio,
    connectedMidi,
    audioDeviceEvidence: {
      projectRelativePath: typeof media.projectRelativePath === "string" ? media.projectRelativePath : null,
      durationSeconds: typeof media.durationSeconds === "number" ? media.durationSeconds : null,
      filePeak: typeof media.filePeak === "number" ? media.filePeak : null,
      fileRms: typeof media.fileRms === "number" ? media.fileRms : null,
      fileSampleRate: typeof media.fileSampleRate === "number" ? media.fileSampleRate : null,
      fileChannels: typeof media.fileChannels === "number" ? media.fileChannels : null
    },
    midiDeviceEvidence: {
      inputCount: Number.isInteger(Number(input.midiDevicePreflight?.inputCount)) ? Number(input.midiDevicePreflight.inputCount) : null,
      inputs: Array.isArray(input.midiDevicePreflight?.inputs) ? input.midiDevicePreflight.inputs : [],
      capturedNoteCount: typeof input.midiInputRecordingControl?.take?.noteCount === "number" ? input.midiInputRecordingControl.take.noteCount : 0,
      capturedPitches: Array.isArray(input.midiInputRecordingControl?.take?.pitches) ? input.midiInputRecordingControl.take.pitches : []
    },
    blockers
  };
}

function midiDevicePreflightEvidence() {
  if (process.platform !== "win32") {
    return {
      platform: process.platform,
      checked: false,
      message: "OS MIDI device preflight is currently implemented for Windows installed smoke only."
    };
  }
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinMmMidiSmoke {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MIDIINCAPS { public ushort wMid; public ushort wPid; public uint vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szPname; public uint dwSupport; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MIDIOUTCAPS { public ushort wMid; public ushort wPid; public uint vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szPname; public ushort wTechnology; public ushort wVoices; public ushort wNotes; public ushort wChannelMask; public uint dwSupport; }
  [DllImport("winmm.dll")] public static extern uint midiInGetNumDevs();
  [DllImport("winmm.dll", CharSet = CharSet.Auto)] public static extern uint midiInGetDevCaps(UIntPtr uDeviceID, out MIDIINCAPS caps, uint cbMidiInCaps);
  [DllImport("winmm.dll")] public static extern uint midiOutGetNumDevs();
  [DllImport("winmm.dll", CharSet = CharSet.Auto)] public static extern uint midiOutGetDevCaps(UIntPtr uDeviceID, out MIDIOUTCAPS caps, uint cbMidiOutCaps);
}
'@
$inputs = @()
$inputCount = [WinMmMidiSmoke]::midiInGetNumDevs()
for ($i = 0; $i -lt $inputCount; $i++) {
  $caps = New-Object WinMmMidiSmoke+MIDIINCAPS
  [void][WinMmMidiSmoke]::midiInGetDevCaps([UIntPtr]::new([uint64]$i), [ref]$caps, [System.Runtime.InteropServices.Marshal]::SizeOf([type][WinMmMidiSmoke+MIDIINCAPS]))
  $inputs += [pscustomobject]@{ index = $i; name = $caps.szPname }
}
$outputs = @()
$outputCount = [WinMmMidiSmoke]::midiOutGetNumDevs()
for ($i = 0; $i -lt $outputCount; $i++) {
  $caps = New-Object WinMmMidiSmoke+MIDIOUTCAPS
  [void][WinMmMidiSmoke]::midiOutGetDevCaps([UIntPtr]::new([uint64]$i), [ref]$caps, [System.Runtime.InteropServices.Marshal]::SizeOf([type][WinMmMidiSmoke+MIDIOUTCAPS]))
  $outputs += [pscustomobject]@{ index = $i; name = $caps.szPname }
}
[pscustomobject]@{ inputCount = $inputCount; outputCount = $outputCount; inputs = $inputs; outputs = $outputs } | ConvertTo-Json -Depth 4 -Compress
`;
  try {
    const json = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    const parsed = JSON.parse(json) as { inputCount?: number; outputCount?: number; inputs?: unknown[]; outputs?: unknown[] };
    return {
      platform: process.platform,
      checked: true,
      inputCount: Number(parsed.inputCount) || 0,
      outputCount: Number(parsed.outputCount) || 0,
      inputs: Array.isArray(parsed.inputs) ? parsed.inputs : [],
      outputs: Array.isArray(parsed.outputs) ? parsed.outputs : []
    };
  } catch (error) {
    return {
      platform: process.platform,
      checked: false,
      message: error instanceof Error ? error.message : "Could not enumerate Windows MIDI devices."
    };
  }
}

async function readSession(sessionPath: string): Promise<AiBridgeSession> {
  const session = JSON.parse(await readFile(sessionPath, "utf8")) as Partial<AiBridgeSession>;
  if (!session.statusUrl || !session.controlUrl || !session.token) {
    throw new Error(`Live bridge session is missing statusUrl, controlUrl, or token: ${sessionPath}`);
  }
  return session as AiBridgeSession;
}

async function liveStatus(session: AiBridgeSession) {
  const response = await fetch(session.statusUrl, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`Live status failed: ${payload.message || response.status}`);
  return payload;
}

async function liveControl(session: AiBridgeSession, body: Record<string, unknown>) {
  const payload = await liveControlResult(session, body);
  if (!payload.ok) throw new Error(`Live control ${body.action} failed: ${payload.message || payload.code || "unknown failure"}`);
  return payload;
}

async function liveControlResult(session: AiBridgeSession, body: Record<string, unknown>) {
  const response = await fetch(session.controlUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Live control ${body.action} failed: ${payload.message || response.status}`);
  return payload;
}

async function exerciseAudioRecordingControl(session: AiBridgeSession, trackId: string, projectPath: string, recordMs: number) {
  await liveControl(session, { action: "set_recording_options", punchEnabled: false, takeMode: "take-lane" });
  await liveControl(session, {
    action: "apply_commands",
    commands: [
      { type: "set_track_armed", trackId, armed: true },
      { type: "set_track_monitor", trackId, monitorEnabled: false }
    ]
  });
  await liveControl(session, { action: "select_track", trackId });
  const beforeProject = loadPocketDawRaw(await readFile(projectPath, "utf8"));
  const before = audioTakeSmokeCounts(await liveStatus(session));
  const start = await liveControlResult(session, { action: "record_start" });
  if (start.ok) {
    await new Promise((resolve) => setTimeout(resolve, recordMs));
    const stop = await liveControlResult(session, { action: "record_stop" });
    if (!stop.ok) throw new Error(`Live control record_stop failed after audio recording start: ${stop.message || stop.code || "unknown failure"}`);
    const after = audioTakeSmokeCounts(await liveStatus(session));
    const placement = assertAudioRecordingTakePlacement(before, after);
    const media = await assertRecordedAudioMediaFile(projectPath, beforeProject, trackId);
    return {
      outcome: "started-and-stopped",
      startMessage: start.message || "",
      stopMessage: stop.message || "",
      requestedRecordMs: recordMs,
      placement,
      media
    };
  }
  const message = String(start.message || "");
  if (!isExpectedAudioRecordingGuard(message)) {
    throw new Error(`Unexpected audio recording start failure: ${message || JSON.stringify(start)}`);
  }
  return {
    outcome: "guarded-unavailable",
    code: start.code || null,
    message
  };
}

function audioTakeSmokeCounts(status: {
  project?: { clipCount?: number };
  media?: { audioTakes?: { groupedClipCount?: number; groupCount?: number; activeCount?: number } };
}): AudioTakeSmokeCounts {
  return {
    clipCount: Number(status.project?.clipCount || 0),
    groupedClipCount: Number(status.media?.audioTakes?.groupedClipCount || 0),
    groupCount: Number(status.media?.audioTakes?.groupCount || 0),
    activeCount: Number(status.media?.audioTakes?.activeCount || 0)
  };
}

function assertAudioRecordingTakePlacement(before: AudioTakeSmokeCounts, after: AudioTakeSmokeCounts) {
  const delta = {
    clipCount: after.clipCount - before.clipCount,
    groupedClipCount: after.groupedClipCount - before.groupedClipCount,
    groupCount: after.groupCount - before.groupCount,
    activeCount: after.activeCount - before.activeCount
  };
  if (delta.clipCount < 1) {
    throw new Error(`Audio recording control did not add a durable timeline clip. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`);
  }
  if (delta.groupedClipCount < 1 || delta.groupCount < 1) {
    throw new Error(`Audio recording control did not add a take-lane grouped clip. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`);
  }
  if (delta.activeCount < 1) {
    throw new Error(`Audio recording control did not leave an active take-lane clip. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`);
  }
  return { before, after, delta };
}

async function assertRecordedAudioMediaFile(projectPath: string, beforeProject: ReturnType<typeof loadPocketDawRaw>, trackId: string): Promise<RecordedAudioMediaEvidence> {
  const afterProject = loadPocketDawRaw(await readFile(projectPath, "utf8"));
  const previousMediaIds = new Set(beforeProject.mediaPool.map((item) => item.id));
  const media = afterProject.mediaPool.find((item) => {
    const metadata = item.metadata as Record<string, unknown> | undefined;
    return !previousMediaIds.has(item.id)
      && item.kind === "audio"
      && metadata?.importMode === "native-recording"
      && metadata?.recordingTrackId === trackId
      && typeof metadata.projectRelativePath === "string";
  });
  if (!media) {
    throw new Error("Audio recording control did not save a new native-recording media pool item.");
  }
  const metadata = media.metadata as Record<string, unknown>;
  const projectRelativePath = String(metadata.projectRelativePath);
  if (!projectRelativePath.startsWith("project-media/recordings/")) {
    throw new Error(`Recorded media was not saved under project-media/recordings: ${projectRelativePath}`);
  }
  const filePath = join(dirname(projectPath), projectRelativePath);
  await assertFileMagic(filePath, "RIFF", "WAVE");
  const fileStat = await stat(filePath);
  const fileAnalysis = analyzePcmWav(await readFile(filePath), filePath);
  if (fileStat.size <= 44) {
    throw new Error(`Recorded media file is too small to contain captured PCM data: ${filePath} (${fileStat.size} bytes)`);
  }
  if (typeof media.sizeBytes === "number" && media.sizeBytes !== fileStat.size) {
    throw new Error(`Recorded media size metadata ${media.sizeBytes} did not match file size ${fileStat.size}: ${filePath}`);
  }
  if (typeof media.durationSeconds !== "number" || media.durationSeconds < 0.2) {
    throw new Error(`Recorded media duration is too short or missing: ${media.durationSeconds}`);
  }
  const nativeCapturedFrameCount = typeof metadata.nativeCapturedFrameCount === "number" ? metadata.nativeCapturedFrameCount : null;
  if (nativeCapturedFrameCount !== null && nativeCapturedFrameCount <= 0) {
    throw new Error(`Recorded media nativeCapturedFrameCount was not positive: ${nativeCapturedFrameCount}`);
  }
  const clip = afterProject.timeline.clips.find((item) => item.type === "audio" && item.mediaPoolItemId === media.id && item.trackId === trackId);
  if (!clip) {
    throw new Error(`Recorded media ${media.id} did not have a matching audio timeline clip on track ${trackId}.`);
  }
  if (clip.muted || clip.metadata?.takeStatus !== "active" || clip.metadata?.takeActive !== true || !clip.metadata?.recordingTakeGroupId) {
    throw new Error(`Recorded clip did not remain an active take-lane clip: ${JSON.stringify({ id: clip.id, muted: clip.muted, metadata: clip.metadata })}`);
  }
  return {
    mediaPoolItemId: media.id,
    clipId: clip.id,
    file: basename(filePath),
    projectRelativePath,
    sizeBytes: fileStat.size,
    durationSeconds: media.durationSeconds,
    nativeCapturedFrameCount,
    nativeCaptureSampleRate: typeof metadata.nativeCaptureSampleRate === "number" ? metadata.nativeCaptureSampleRate : null,
    peak: typeof metadata.peak === "number" ? metadata.peak : null,
    filePeak: fileAnalysis.peak,
    fileRms: fileAnalysis.rms,
    fileSampleRate: fileAnalysis.sampleRate,
    fileChannels: fileAnalysis.channels,
    fileFrameCount: fileAnalysis.frameCount
  };
}

async function exerciseMidiInputRecordingControl(session: AiBridgeSession, midiTrackId: string, projectPath: string, midiRecordMs: number) {
  await liveControl(session, { action: "set_recording_options", punchEnabled: true, takeMode: "take-lane" });
  await liveControl(session, {
    action: "apply_commands",
    commands: [
      { type: "set_punch_range", startBar: 7, endBar: 9 }
    ]
  });
  await liveControl(session, { action: "seek_bar", bar: 6 });
  await liveControl(session, { action: "select_track", trackId: midiTrackId });
  const beforeProject = loadPocketDawRaw(await readFile(projectPath, "utf8"));
  const before = audioTakeSmokeCounts(await liveStatus(session));
  const start = await liveControlResult(session, { action: "midi_record_start" });
  if (start.ok) {
    await new Promise((resolve) => setTimeout(resolve, midiRecordMs));
    const stop = await liveControlResult(session, { action: "midi_record_stop" });
    if (!stop.ok) throw new Error(`Live control midi_record_stop failed after MIDI input start: ${stop.message || stop.code || "unknown failure"}`);
    await liveControl(session, { action: "save_current" });
    const after = audioTakeSmokeCounts(await liveStatus(session));
    const placement = {
      before,
      after,
      delta: {
        clipCount: after.clipCount - before.clipCount,
        groupedClipCount: after.groupedClipCount - before.groupedClipCount,
        groupCount: after.groupCount - before.groupCount,
        activeCount: after.activeCount - before.activeCount
      }
    };
    const take = assertMidiInputRecordingTake(projectPath, beforeProject, midiTrackId);
    return {
      outcome: "started-and-stopped",
      startMessage: start.message || "",
      stopMessage: stop.message || "",
      requestedRecordMs: midiRecordMs,
      punchEnabled: true,
      punchStartBar: 7,
      punchEndBar: 9,
      requestedCaptureStartBar: 6,
      captureStartBar: typeof take.captureStartBar === "number" ? take.captureStartBar : 6,
      placement,
      take
    };
  }
  const message = String(start.message || "");
  if (!isExpectedMidiInputRecordingGuard(message)) {
    throw new Error(`Unexpected MIDI input recording start failure: ${message || JSON.stringify(start)}`);
  }
  return {
    outcome: "guarded-unavailable",
    code: start.code || null,
    message
  };
}

function assertMidiInputRecordingTake(projectPath: string, beforeProject: ReturnType<typeof loadPocketDawRaw>, trackId: string) {
  const afterProject = loadPocketDawRaw(readFileSyncUtf8(projectPath));
  const previousClipIds = new Set(beforeProject.timeline.clips.map((clip) => clip.id));
  const clip = afterProject.timeline.clips.find((item) => {
    const groupId = typeof item.metadata?.recordingTakeGroupId === "string" ? item.metadata.recordingTakeGroupId : "";
    return item.type === "midi"
      && item.trackId === trackId
      && !previousClipIds.has(item.id)
      && groupId.startsWith("midi-recording-session-midi-input-");
  });
  if (!clip) {
    return {
      captured: false,
      noteCount: 0,
      pitches: []
    };
  }
  const notes = midiDataFromClip(clip).notes;
  return {
    captured: notes.length > 0,
    clipId: clip.id,
    trackId: clip.trackId,
    name: clip.name,
    muted: Boolean(clip.muted),
    takeGroupId: typeof clip.metadata?.recordingTakeGroupId === "string" ? clip.metadata.recordingTakeGroupId : clip.metadata?.takeGroupId || null,
    takeLaneIndex: typeof clip.metadata?.takeLaneIndex === "number" ? clip.metadata.takeLaneIndex : null,
    takeStatus: typeof clip.metadata?.takeStatus === "string" ? clip.metadata.takeStatus : null,
    punchStartBar: typeof clip.metadata?.punchStartBar === "number" ? clip.metadata.punchStartBar : null,
    punchEndBar: typeof clip.metadata?.punchEndBar === "number" ? clip.metadata.punchEndBar : null,
    captureStartBar: typeof clip.metadata?.captureStartBar === "number" ? clip.metadata.captureStartBar : null,
    punchMode: typeof clip.metadata?.punchMode === "string" ? clip.metadata.punchMode : null,
    noteCount: notes.length,
    pitches: notes.map((note) => note.pitch).sort((a, b) => a - b)
  };
}

function readFileSyncUtf8(path: string) {
  return readFileSync(path, "utf8");
}

function isExpectedMidiInputRecordingGuard(message: string) {
  return [
    "Web MIDI input is not available",
    "No MIDI input devices are available",
    "Web MIDI input request timed out",
    "Permission to use Web MIDI API was not granted"
  ].some((expected) => message.includes(expected));
}

function isExpectedAudioRecordingGuard(message: string) {
  return [
    "Live recording is only available in the installed Pocket DAW app.",
    "Save the .pocketdaw project before recording",
    "Arm one live audio track before recording.",
    "Only one live audio track can be armed for this recording alpha.",
    "Select an audio input device before recording.",
    "No audio input device is available for recording.",
    "Could not start live recording.",
    "native recording alpha currently captures Stereo Ch 1-2 only"
  ].some((expected) => message.includes(expected));
}

function assertCapability(status: { capabilities?: { control?: string[] } }, capability: string) {
  if (!status.capabilities?.control?.includes(capability)) {
    throw new Error(`Running app does not advertise live control capability ${capability}. Install a candidate build that includes the punch/take export smoke bridge.`);
  }
}

function assertLiveCommand(status: { capabilities?: { liveCommands?: string[] } }, command: string) {
  if (!status.capabilities?.liveCommands?.includes(command)) {
    throw new Error(`Running app does not advertise live command ${command}. Install a candidate build that includes manual MIDI/audio take-lane grouping.`);
  }
}

function assertRunningVersion(status: { project?: { version?: string } }) {
  const runningVersion = status.project?.version;
  if (runningVersion !== POCKET_DAW_VERSION) {
    throw new Error(`Running app version ${runningVersion || "[unknown]"} does not match source candidate ${POCKET_DAW_VERSION}. Install the candidate build before running punch/take smoke.`);
  }
}

function assertTakeLaneSummary(status: any, label: string) {
  const takes = status.media?.audioTakes;
  if (!takes || takes.groupCount < 1 || takes.activeCount < 1 || takes.mutedCount < 1) {
    throw new Error(`Unexpected take lane summary ${label}: ${JSON.stringify(takes)}`);
  }
  const punchGroup = takes.groups.find((group: { groupId: string }) => group.groupId === "installed-punch-group");
  if (!punchGroup || punchGroup.lanes.length < 2) {
    throw new Error(`Missing installed punch take group ${label}: ${JSON.stringify(takes.groups)}`);
  }
}

function activeClipId(status: any, groupId: string): string {
  const group = status.media?.audioTakes?.groups?.find((item: { groupId: string }) => item.groupId === groupId);
  const activeId = group?.lanes?.flatMap((lane: { activeClipIds?: string[] }) => lane.activeClipIds || [])[0];
  if (!activeId) throw new Error(`Could not find active clip for take group ${groupId}.`);
  return activeId;
}

function assertReopenedTakeLaneMetadata(project: ReturnType<typeof loadPocketDawRaw>, midiTakeGroupId: string, midiRecordingTakeGroupId: string) {
  const punchClips = project.timeline.clips.filter((clip) => clip.metadata?.recordingTakeGroupId === "installed-punch-group" || clip.metadata?.takeGroupId === "installed-punch-group");
  const punchTake = punchClips.find((clip) => clip.name === "take-lane-punch.wav");
  if (!punchTake) throw new Error(`Reopened project is missing the punched take clip: ${JSON.stringify(punchClips.map((clip) => clip.name))}`);
  if (punchTake.metadata?.punchStartBar !== 7 || punchTake.metadata?.punchEndBar !== 9 || punchTake.metadata?.captureStartBar !== 6) {
    throw new Error(`Reopened punch take lost punch metadata: ${JSON.stringify(punchTake.metadata)}`);
  }
  if (punchClips.length < 3 || !punchClips.some((clip) => clip.metadata?.takeActive === false || clip.metadata?.takeStatus === "muted-take")) {
    throw new Error(`Reopened punch take group did not preserve comp/inactive segments: ${JSON.stringify(punchClips.map((clip) => clip.metadata))}`);
  }

  const midiClips = project.timeline.clips.filter((clip) => clip.metadata?.recordingTakeGroupId === midiTakeGroupId || clip.metadata?.takeGroupId === midiTakeGroupId);
  if (midiClips.length < 3) throw new Error(`Reopened project expected manual MIDI take lane segments, found ${midiClips.length}.`);
  const first = midiClips.find((clip) => clip.name === "midi-take-1.mid");
  const secondLaneClips = midiClips.filter((clip) => clip.metadata?.takeLaneId === `${midiTakeGroupId}-lane-2`);
  if (!first || secondLaneClips.length < 2) throw new Error(`Reopened MIDI take clips had unexpected lanes: ${JSON.stringify(midiClips.map((clip) => ({ name: clip.name, lane: clip.metadata?.takeLaneId })))}`);
  if (first.metadata?.takeSource !== "manual-clip-group" || first.metadata?.takeStatus !== "muted-take" || first.metadata?.takeActive !== false || !first.muted) {
    throw new Error(`Reopened inactive MIDI take metadata was wrong: ${JSON.stringify(first)}`);
  }
  if (secondLaneClips.some((clip) => clip.metadata?.takeSource !== "manual-clip-group" || clip.metadata?.takeStatus !== "active" || clip.metadata?.takeActive !== true || clip.muted)) {
    throw new Error(`Reopened active MIDI take lane metadata was wrong: ${JSON.stringify(secondLaneClips)}`);
  }

  const midiRecordingClips = project.timeline.clips.filter((clip) => clip.metadata?.recordingTakeGroupId === midiRecordingTakeGroupId || clip.metadata?.takeGroupId === midiRecordingTakeGroupId);
  if (midiRecordingClips.length < 2) throw new Error(`Reopened project expected at least 2 MIDI recording take clips, found ${midiRecordingClips.length}.`);
  const inactive = midiRecordingClips.find((clip) => clip.name === "installed-midi-recording-take-1");
  const active = midiRecordingClips.find((clip) => clip.name === "installed-midi-recording-take-2");
  if (!inactive || !active) throw new Error(`Reopened MIDI recording takes had unexpected names: ${JSON.stringify(midiRecordingClips.map((clip) => clip.name))}`);
  if (!inactive.muted || inactive.metadata?.takeStatus !== "muted-take" || inactive.metadata?.takeActive !== false || inactive.metadata?.punchStartBar !== 7 || inactive.metadata?.punchEndBar !== 9) {
    throw new Error(`Reopened inactive MIDI recording take metadata was wrong: ${JSON.stringify(inactive)}`);
  }
  if (active.muted || active.metadata?.takeStatus !== "active" || active.metadata?.takeActive !== true || Number(active.metadata?.takeLaneIndex) < 2 || active.metadata?.punchMode !== "create-new-midi-take-lane") {
    throw new Error(`Reopened active MIDI recording take metadata was wrong: ${JSON.stringify(active)}`);
  }
}

async function assertFileMagic(path: string, prefix: string, contains?: string) {
  const bytes = await readFile(path);
  const head = bytes.subarray(0, Math.max(16, prefix.length + 8)).toString("latin1");
  if (!head.startsWith(prefix) || (contains && !head.includes(contains))) {
    throw new Error(`Export ${path} did not have expected ${prefix}${contains ? `/${contains}` : ""} header.`);
  }
}

function analyzePcmWav(bytes: Buffer, label: string) {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Recorded media ${label} is not a RIFF/WAVE file.`);
  }
  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + size > bytes.length) break;
    if (id === "fmt ") {
      audioFormat = bytes.readUInt16LE(chunkStart);
      channels = bytes.readUInt16LE(chunkStart + 2);
      sampleRate = bytes.readUInt32LE(chunkStart + 4);
      bitsPerSample = bytes.readUInt16LE(chunkStart + 14);
    } else if (id === "data") {
      dataOffset = chunkStart;
      dataSize = size;
    }
    offset = chunkStart + size + (size % 2);
  }
  if (!channels || !sampleRate || dataOffset < 0 || dataSize <= 0) {
    throw new Error(`Recorded media ${label} is missing readable PCM format/data chunks.`);
  }
  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample < 2) {
    throw new Error(`Recorded media ${label} has unsupported bit depth ${bitsPerSample}.`);
  }
  const sampleCount = Math.floor(dataSize / bytesPerSample);
  if (sampleCount <= 0) {
    throw new Error(`Recorded media ${label} has no PCM samples.`);
  }
  let peak = 0;
  let sumSquares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sampleOffset = dataOffset + index * bytesPerSample;
    const sample = readNormalizedWavSample(bytes, sampleOffset, audioFormat, bitsPerSample);
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSquares += sample * sample;
  }
  return {
    channels,
    sampleRate,
    frameCount: Math.floor(sampleCount / channels),
    peak,
    rms: Math.sqrt(sumSquares / sampleCount)
  };
}

function readNormalizedWavSample(bytes: Buffer, offset: number, audioFormat: number, bitsPerSample: number): number {
  if (audioFormat === 3 && bitsPerSample === 32) return bytes.readFloatLE(offset);
  if (audioFormat !== 1) throw new Error(`Unsupported WAV audio format ${audioFormat}.`);
  if (bitsPerSample === 16) return bytes.readInt16LE(offset) / 32768;
  if (bitsPerSample === 24) {
    const unsigned = bytes.readUIntLE(offset, 3);
    const signed = unsigned & 0x800000 ? unsigned | 0xff000000 : unsigned;
    return signed / 8388608;
  }
  if (bitsPerSample === 32) return bytes.readInt32LE(offset) / 2147483648;
  throw new Error(`Unsupported WAV bit depth ${bitsPerSample}.`);
}

function createPcmWav(options: { frequency: number; seconds: number }): Buffer {
  const sampleRate = 44100;
  const samples = Math.floor(sampleRate * options.seconds);
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((i / sampleRate) * options.frequency * Math.PI * 2) * 0.18 * 32767);
    buffer.writeInt16LE(value, 44 + i * 2);
  }
  return buffer;
}

function simpleMidiBytes(): Uint8Array {
  const track = [
    0x00, 0xff, 0x03, 0x04, 0x4c, 0x65, 0x61, 0x64,
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
    0x00, 0x90, 0x3c, 0x64,
    0x83, 0x60, 0x80, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00
  ];
  const length = track.length;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...track
  ]);
}
