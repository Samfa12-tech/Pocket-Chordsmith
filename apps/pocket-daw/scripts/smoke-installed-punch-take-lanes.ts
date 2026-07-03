import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addImportedAudioMedia, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { buildPocketDawProjectFile, createEmptyPocketDawProject, loadPocketDawRaw } from "../src/daw/dawProject";
import { importMidiFileToProject, midiDataFromClip, setMidiNoteField } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { validateProjectInvariants } from "../src/daw/projectInvariants";
import { addTrackToProject } from "../src/daw/tracks";

interface AiBridgeSession {
  statusUrl: string;
  controlUrl: string;
  token: string;
}

interface SmokeArgs {
  sessionPath: string;
  outputDir: string | null;
}

const args = parseArgs(process.argv.slice(2));
const root = args.outputDir || await mkdtemp(join(tmpdir(), "pocket-daw-punch-take-installed-smoke-"));
const session = await readSession(args.sessionPath);
const projectPath = join(root, "punch-take-lane-installed-smoke.pocketdaw");
const wavPath = join(root, "punch-take-lane-installed-smoke.wav");
const midiPath = join(root, "punch-take-lane-installed-smoke.mid");

await mkdir(join(root, "project-media", "recordings"), { recursive: true });
await writeFile(join(root, "project-media", "recordings", "take-lane-bed.wav"), createPcmWav({ frequency: 220, seconds: 4 }));
await writeFile(join(root, "project-media", "recordings", "take-lane-punch.wav"), createPcmWav({ frequency: 440, seconds: 2 }));
await writeFile(projectPath, buildPocketDawProjectFile(await createSmokeProject(root)));

const initialStatus = await liveStatus(session);
assertCapability(initialStatus, "export_project");

await liveControl(session, { action: "open_project", projectPath });
const opened = await liveStatus(session);
const trackId = opened.tracks.find((track: { id: string; name: string }) => track.id === "live-vocals" || track.name === "Live Vocals")?.id;
const punchMediaId = "media_002";
if (!trackId) throw new Error("Smoke project did not expose live-vocals track after open.");
if (!punchMediaId) throw new Error("Smoke project did not expose punch media after open.");

await liveControl(session, {
  action: "apply_commands",
  commands: [
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

await liveControl(session, { action: "save_current" });
await liveControl(session, { action: "open_project", projectPath });
status = await liveStatus(session);
assertTakeLaneSummary(status, "after save/reopen");

await liveControl(session, { action: "export_project", format: "wav", outputPath: wavPath });
await liveControl(session, { action: "export_project", format: "midi", outputPath: midiPath });
await assertFileMagic(wavPath, "RIFF", "WAVE");
await assertFileMagic(midiPath, "MThd");

const reopenedProject = loadPocketDawRaw(await readFile(projectPath, "utf8"));
const invariants = validateProjectInvariants(reopenedProject);
if (invariants.errors.length) {
  throw new Error(`Saved smoke project has invariant errors: ${invariants.errors[0].message}`);
}

const summary = {
  ok: true,
  projectPath,
  wavPath,
  midiPath,
  clipCount: status.project.clipCount,
  groupedClipCount: status.media.audioTakes.groupedClipCount,
  groupCount: status.media.audioTakes.groupCount,
  activeCount: status.media.audioTakes.activeCount,
  mutedCount: status.media.audioTakes.mutedCount
};
await writeFile(join(root, "punch-take-lane-installed-smoke-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
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
  const secondNoteId = midiDataFromClip(secondClip).notes[0]?.id;
  if (secondNoteId) project = setMidiNoteField(project, secondMidi.clipId, secondNoteId, "pitch", 64);
  const groupedFirst = project.timeline.clips.find((clip) => clip.id === firstMidi.clipId);
  const groupedSecond = project.timeline.clips.find((clip) => clip.id === secondMidi.clipId);
  if (groupedFirst) {
    groupedFirst.metadata = {
      ...(groupedFirst.metadata || {}),
      takeGroupId: "installed-midi-group",
      recordingTakeGroupId: "installed-midi-group",
      takeLaneId: "installed-midi-group-lane-1",
      takeLaneIndex: 1,
      takeStatus: "muted-take",
      takeActive: false
    };
    groupedFirst.muted = true;
  }
  if (groupedSecond) {
    groupedSecond.metadata = {
      ...(groupedSecond.metadata || {}),
      takeGroupId: "installed-midi-group",
      recordingTakeGroupId: "installed-midi-group",
      takeLaneId: "installed-midi-group-lane-2",
      takeLaneIndex: 2,
      takeStatus: "active",
      takeActive: true
    };
    groupedSecond.muted = false;
  }
  return project;
}

function parseArgs(argv: string[]): SmokeArgs {
  const localAppData = process.env.LOCALAPPDATA || tmpdir();
  const parsed: SmokeArgs = {
    sessionPath: join(localAppData, "Pocket DAW", "ai-bridge-session.json"),
    outputDir: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--session") parsed.sessionPath = requiredValue(argv[++index], arg);
    else if (arg === "--out") parsed.outputDir = requiredValue(argv[++index], arg);
    else if (arg === "--help") {
      console.log("Usage: tsx scripts/smoke-installed-punch-take-lanes.ts [--session <ai-bridge-session.json>] [--out <folder>]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
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
  const response = await fetch(session.controlUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`Live control ${body.action} failed: ${payload.message || response.status}`);
  return payload;
}

function assertCapability(status: { capabilities?: { control?: string[] } }, capability: string) {
  if (!status.capabilities?.control?.includes(capability)) {
    throw new Error(`Running app does not advertise live control capability ${capability}. Install a candidate build that includes the punch/take export smoke bridge.`);
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

async function assertFileMagic(path: string, prefix: string, contains?: string) {
  const bytes = await readFile(path);
  const head = bytes.subarray(0, Math.max(16, prefix.length + 8)).toString("latin1");
  if (!head.startsWith(prefix) || (contains && !head.includes(contains))) {
    throw new Error(`Export ${path} did not have expected ${prefix}${contains ? `/${contains}` : ""} header.`);
  }
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
