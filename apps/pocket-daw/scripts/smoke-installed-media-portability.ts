import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { loadPocketDawRaw } from "../src/app/commands";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "../src/daw/audioClips";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { validateProjectInvariants } from "../src/daw/projectInvariants";
import { POCKET_DAW_VERSION } from "../src/daw/schema";
import { createDemoProject } from "../src/demo/demoProject";
import { validateInstalledMediaPortabilitySummary } from "./verify-installed-media-portability-summary.mjs";
import { verifyGamePackZip } from "./verify-game-pack.mjs";

interface AiBridgeSession {
  statusUrl: string;
  controlUrl: string;
  token: string;
}

interface SmokeArgs {
  sessionPath: string;
  outputDir: string | null;
  installerPath: string | null;
  requireInstaller: boolean;
}

const args = parseArgs(process.argv.slice(2));
const root = args.outputDir ? resolve(args.outputDir) : await mkdtemp(join(tmpdir(), "pocket-daw-media-portability-installed-smoke-"));
const sourceDir = join(root, "external-sources");
const originalProjectDir = join(root, "portable-project-original");
const movedProjectDir = join(root, "portable-project-moved");
const replacementDir = join(root, "replacement-source");
const exportDir = join(root, "exports");
const evidenceDir = join(root, "evidence");
const originalProjectPath = join(originalProjectDir, "media-portability-smoke.pocketdaw");
const movedProjectPath = join(movedProjectDir, "media-portability-smoke.pocketdaw");
const sourceAPath = join(sourceDir, "portable-loop-a.wav");
const sourceBPath = join(sourceDir, "portable-loop-b.wav");
const replacementPath = join(replacementDir, "portable-loop-b-relinked.wav");
const session = await readSession(args.sessionPath);
const installer = args.installerPath ? await fileEvidence(args.installerPath, true) : null;

await Promise.all([
  mkdir(sourceDir, { recursive: true }),
  mkdir(originalProjectDir, { recursive: true }),
  mkdir(replacementDir, { recursive: true }),
  mkdir(exportDir, { recursive: true }),
  mkdir(evidenceDir, { recursive: true })
]);
await writeFile(sourceAPath, createPcmWav({ frequency: 220, seconds: 1.25 }));
await writeFile(sourceBPath, createPcmWav({ frequency: 440, seconds: 1.5 }));
await writeFile(replacementPath, createPcmWav({ frequency: 660, seconds: 1.75 }));

const fixture = await createSmokeProject(sourceAPath, sourceBPath);
await writeFile(originalProjectPath, buildPocketDawProjectFile(fixture.project));

const initialLive = await liveStatus(session);
assertCapability(initialLive, "open_project");
assertCapability(initialLive, "collect_media");
assertCapability(initialLive, "reload_media");
assertCapability(initialLive, "relink_media");
assertCapability(initialLive, "export_project");

await liveControl(session, { action: "open_project", projectPath: originalProjectPath });
let status = await liveStatus(session);
assertRunningVersion(status);
const initial = mediaSnapshot(status);
if (initial.externalReferenceCount < 2) throw new Error(`Expected two external media references before collect, received ${initial.externalReferenceCount}.`);

const relinkPreparation = await liveControl(session, {
  action: "relink_media",
  mediaPoolItemId: fixture.mediaBId,
  sourcePath: sourceBPath
});
const preparedItem = mediaItem(relinkPreparation.media, fixture.mediaBId);
if (!preparedItem.nativeDecodedCacheRelativePath) throw new Error("Relink preparation did not create a project-relative decoded WAV cache.");
if (preparedItem.transientMarkerCount !== 0) throw new Error("Relink preparation retained stale transient analysis metadata.");

const collectedControl = await liveControl(session, { action: "collect_media" });
if (collectedControl.collectedCount !== 2 || collectedControl.blockedCount !== 0) {
  throw new Error(`Collect did not copy both external media items cleanly: ${JSON.stringify(collectedControl)}`);
}
status = await liveStatus(session);
const collected = mediaSnapshot(status);
assertPortable(collected, "after collect");
const collectedA = mediaItem(status.media, fixture.mediaAId);
const collectedB = mediaItem(status.media, fixture.mediaBId);
const collectedAPath = join(originalProjectDir, requiredRelativePath(collectedA, "media A"));
const collectedBPath = join(originalProjectDir, requiredRelativePath(collectedB, "media B"));
const decodedCacheBPath = join(originalProjectDir, requiredCachePath(collectedB, "media B"));
const collectedAEvidencePath = join(evidenceDir, "collected-media-a.wav");
const collectedBEvidencePath = join(evidenceDir, "collected-media-b.wav");
const decodedCacheBEvidencePath = join(evidenceDir, "decoded-cache-b.wav");
await Promise.all([
  copyFile(collectedAPath, collectedAEvidencePath),
  copyFile(collectedBPath, collectedBEvidencePath),
  copyFile(decodedCacheBPath, decodedCacheBEvidencePath)
]);
const collectedEvidence = {
  mediaA: await fileEvidence(collectedAEvidencePath),
  mediaB: await fileEvidence(collectedBEvidencePath),
  decodedCacheB: await fileEvidence(decodedCacheBEvidencePath)
};

await rm(sourceDir, { recursive: true, force: true });
await rename(originalProjectDir, movedProjectDir);
await liveControl(session, { action: "open_project", projectPath: movedProjectPath });
await liveControl(session, { action: "reload_media", mediaPoolItemId: fixture.mediaAId });
await liveControl(session, { action: "reload_media", mediaPoolItemId: fixture.mediaBId });
status = await liveStatus(session);
const movedReopen = mediaSnapshot(status);
assertPortable(movedReopen, "after moving the project folder and deleting original sources");

const movedCollectedBPath = join(movedProjectDir, requiredRelativePath(mediaItem(status.media, fixture.mediaBId), "moved media B"));
await rm(movedCollectedBPath, { force: true });
await liveControl(session, { action: "open_project", projectPath: movedProjectPath });
const cacheReload = await liveControl(session, { action: "reload_media", mediaPoolItemId: fixture.mediaBId });
const cacheFallbackItem = mediaItem(cacheReload.media, fixture.mediaBId);
if (cacheFallbackItem.lastReloadSourceKind !== "decoded-cache" || cacheFallbackItem.restoredFromNativeDecodedCache !== true) {
  throw new Error(`Missing project media did not recover from decoded cache: ${JSON.stringify(cacheFallbackItem)}`);
}
const cacheFallback = mediaSnapshot(await liveStatus(session));
if (cacheFallback.portability.cacheOnlyCount < 1 || cacheFallback.missingCount < 1) {
  throw new Error(`Decoded-cache recovery did not remain honestly cache-only: ${JSON.stringify(cacheFallback)}`);
}

const relinkControl = await liveControl(session, {
  action: "relink_media",
  mediaPoolItemId: fixture.mediaBId,
  sourcePath: replacementPath
});
const relinkedItem = mediaItem(relinkControl.media, fixture.mediaBId);
if (relinkedItem.lastReloadSourceKind === "decoded-cache" || relinkedItem.transientMarkerCount !== 0) {
  throw new Error(`Relink did not replace cache-only/source-derived state cleanly: ${JSON.stringify(relinkedItem)}`);
}
const recollectControl = await liveControl(session, { action: "collect_media" });
if (recollectControl.collectedCount !== 1 || recollectControl.blockedCount !== 0) {
  throw new Error(`Relinked media did not recollect cleanly: ${JSON.stringify(recollectControl)}`);
}
await rm(replacementDir, { recursive: true, force: true });

await liveControl(session, { action: "open_project", projectPath: movedProjectPath });
await liveControl(session, { action: "reload_media", mediaPoolItemId: fixture.mediaAId });
await liveControl(session, { action: "reload_media", mediaPoolItemId: fixture.mediaBId });
status = await liveStatus(session);
const finalMedia = mediaSnapshot(status);
assertPortable(finalMedia, "after relink, recollect, source deletion and final reopen");

const exportSpecs = [
  ["wav", "portable-project.wav"],
  ["stem-zip", "portable-project-stems.zip"],
  ["section-loop-zip", "portable-project-section-loops.zip"],
  ["godot-adaptive-pack", "portable-project-godot.zip"],
  ["web-game-pack", "portable-project-web.zip"]
] as const;
const exports: Record<string, unknown> = {};
for (const [format, file] of exportSpecs) {
  const outputPath = join(exportDir, file);
  console.error(`[media-portability-smoke] exporting ${format} -> ${outputPath}`);
  const result = await liveControl(session, { action: "export_project", format, outputPath });
  await assertFileMagic(outputPath, format === "wav" ? "RIFF" : "PK");
  exports[format] = { path: outputPath, ...(await fileEvidence(outputPath)), artifact: result.artifact || {} };
}

const godotPackPath = join(exportDir, "portable-project-godot.zip");
const webPackPath = join(exportDir, "portable-project-web.zip");
const godotVerification = verifyGamePackZip(godotPackPath, { kind: "godot-adaptive-pack" });
const webVerification = verifyGamePackZip(webPackPath, { kind: "web-game-pack" });
if (!godotVerification.ok) throw new Error(`Godot game-pack verification failed: ${godotVerification.errors.join(" | ")}`);
if (!webVerification.ok) throw new Error(`Web game-pack verification failed: ${webVerification.errors.join(" | ")}`);

const reopenedProject = loadPocketDawRaw(await readFile(movedProjectPath, "utf8"));
const invariants = validateProjectInvariants(reopenedProject);
if (invariants.errors.length) throw new Error(`Final portable project has invariant errors: ${invariants.errors[0].message}`);

const summary = {
  ok: true,
  testedAt: new Date().toISOString(),
  runningVersion: status.project.version,
  installer,
  root,
  originalProjectPath,
  projectPath: movedProjectPath,
  projectFolderMoved: originalProjectPath !== movedProjectPath,
  originalSourcesDeleted: true,
  replacementSourceDeleted: true,
  mediaPoolItemIds: [fixture.mediaAId, fixture.mediaBId],
  phases: {
    initial,
    collected: { ...collected, files: collectedEvidence },
    movedReopen,
    cacheFallback: { ...cacheFallback, item: cacheFallbackItem },
    final: finalMedia
  },
  exports,
  gamePacks: {
    godot: summarizeGamePackVerification(godotVerification),
    web: summarizeGamePackVerification(webVerification)
  },
  invariants: {
    errorCount: invariants.errors.length,
    warningCount: invariants.warnings.length
  }
};
const summaryPath = join(root, "installed-media-portability-smoke-summary.json");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
const strict = validateInstalledMediaPortabilitySummary(summary, {
  version: POCKET_DAW_VERSION,
  installerPath: args.installerPath || undefined,
  requireInstaller: args.requireInstaller
});
if (!strict.ok) throw new Error(`Installed media portability verification failed. Summary: ${summaryPath}\n${strict.failures.join("\n")}`);
console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));

async function createSmokeProject(sourceA: string, sourceB: string) {
  let project = createDemoProject();
  const sectionClip = project.timeline.clips.find((clip) => clip.type === "generated-section" && clip.sectionId);
  if (!sectionClip) throw new Error("Demo fixture did not include a generated section for section-loop export smoke.");
  project.timeline.clips = [{ ...sectionClip, startBar: 1, barLength: 0.25 }];
  project.timeline.bars = 4;
  project.timeline.markers = [];
  project.timeline.loop = { enabled: false, startBar: 1, endBar: 2 };
  project.tracks = project.tracks.map((track) => (
    ["drums", "bass", "chords", "melody", "guitar"].includes(track.role)
      ? { ...track, active: track.id === sectionClip.trackId }
      : track
  ));
  const mediaA = addImportedAudioMedia(project, {
    name: basename(sourceA),
    uri: sourceA,
    mimeType: "audio/wav",
    durationSeconds: 1.25,
    sampleRate: 44100,
    channels: 1,
    sizeBytes: (await stat(sourceA)).size,
    metadata: { importMode: "native", mediaRefKind: "external", external: true }
  });
  project = mediaA.project;
  project = placeAudioClipOnTimeline(project, mediaA.item.id, 1).project;
  const mediaB = addImportedAudioMedia(project, {
    name: basename(sourceB),
    uri: sourceB,
    mimeType: "audio/wav",
    durationSeconds: 1.5,
    sampleRate: 44100,
    channels: 1,
    sizeBytes: (await stat(sourceB)).size,
    metadata: {
      importMode: "native",
      mediaRefKind: "external",
      external: true,
      audioTransientMarkersSeconds: [0.2, 0.8],
      waveformNeedsRefresh: true,
      analysisInvalidated: true
    }
  });
  project = mediaB.project;
  project = placeAudioClipOnTimeline(project, mediaB.item.id, 3).project;
  return { project, mediaAId: mediaA.item.id, mediaBId: mediaB.item.id };
}

function mediaSnapshot(status: any) {
  return {
    poolCount: status.media.poolCount,
    projectMediaCount: status.media.projectMediaCount,
    externalReferenceCount: status.media.externalReferenceCount,
    runtimeOnlyCount: status.media.runtimeOnlyCount,
    missingCount: status.media.missingCount,
    portability: status.media.portability
  };
}

function mediaItem(media: any, id: string) {
  const item = media?.items?.find((candidate: any) => candidate.id === id);
  if (!item) throw new Error(`Live media status did not include ${id}.`);
  return item;
}

function requiredRelativePath(item: any, label: string): string {
  if (!item.projectRelativePath || !String(item.projectRelativePath).startsWith("project-media/")) {
    throw new Error(`${label} did not have a safe project-relative path.`);
  }
  return item.projectRelativePath;
}

function requiredCachePath(item: any, label: string): string {
  if (!item.nativeDecodedCacheRelativePath || !String(item.nativeDecodedCacheRelativePath).startsWith("project-cache/")) {
    throw new Error(`${label} did not have a safe decoded-cache path.`);
  }
  return item.nativeDecodedCacheRelativePath;
}

function assertPortable(snapshot: any, label: string) {
  if (snapshot.externalReferenceCount !== 0 || snapshot.runtimeOnlyCount !== 0 || snapshot.missingCount !== 0 || !snapshot.portability?.embeddedSourceProjectPortable || snapshot.portability?.needsCollectionOrRelinkCount !== 0) {
    throw new Error(`Media was not portable ${label}: ${JSON.stringify(snapshot)}`);
  }
}

function summarizeGamePackVerification(result: any) {
  return {
    ok: result.ok,
    kind: result.kind,
    fileCount: result.fileCount,
    stemCount: result.stemCount,
    sectionLoopCount: result.sectionLoopCount,
    errors: result.errors,
    warnings: result.warnings
  };
}

function assertCapability(status: any, capability: string) {
  if (!status.capabilities?.control?.includes(capability)) throw new Error(`Running app does not advertise ${capability}.`);
}

function assertRunningVersion(status: any) {
  if (status.project?.version !== POCKET_DAW_VERSION) {
    throw new Error(`Running Pocket DAW version ${status.project?.version || "unknown"} does not match source ${POCKET_DAW_VERSION}.`);
  }
}

async function readSession(sessionPath: string): Promise<AiBridgeSession> {
  const session = JSON.parse(await readFile(sessionPath, "utf8")) as Partial<AiBridgeSession>;
  if (!session.statusUrl || !session.controlUrl || !session.token) throw new Error(`Live bridge session is incomplete: ${sessionPath}`);
  return session as AiBridgeSession;
}

async function liveStatus(session: AiBridgeSession) {
  const response = await fetch(session.statusUrl, { headers: { Authorization: `Bearer ${session.token}` } });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`Live status failed: ${payload.message || response.status}`);
  return payload;
}

async function liveControl(session: AiBridgeSession, body: Record<string, unknown>) {
  const response = await fetch(session.controlUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`Live control ${body.action} failed: ${payload.message || payload.code || response.status}`);
  return payload;
}

async function fileEvidence(path: string, includePath = false) {
  const bytes = await readFile(path);
  return {
    ...(includePath ? { path, file: basename(path) } : { path }),
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

async function assertFileMagic(path: string, magic: string) {
  const bytes = await readFile(path);
  if (bytes.length < 16 || bytes.toString("latin1", 0, magic.length) !== magic) throw new Error(`${path} is missing ${magic} file magic.`);
}

function parseArgs(argv: string[]): SmokeArgs {
  const localAppData = process.env.LOCALAPPDATA || tmpdir();
  const parsed: SmokeArgs = {
    sessionPath: join(localAppData, "Pocket DAW", "ai-bridge-session.json"),
    outputDir: null,
    installerPath: null,
    requireInstaller: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--session") parsed.sessionPath = requiredValue(argv[++index], arg);
    else if (arg === "--out") parsed.outputDir = requiredValue(argv[++index], arg);
    else if (arg === "--installer") parsed.installerPath = requiredValue(argv[++index], arg);
    else if (arg === "--require-installer") parsed.requireInstaller = true;
    else if (arg === "--help") {
      console.log("Usage: tsx scripts/smoke-installed-media-portability.ts [--session <ai-bridge-session.json>] [--out <folder>] [--installer <setup.exe>] [--require-installer]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (parsed.requireInstaller && !parsed.installerPath) throw new Error("--require-installer requires --installer <setup.exe>.");
  return parsed;
}

function requiredValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
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
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin((index / sampleRate) * options.frequency * Math.PI * 2) * 0.18 * 32767);
    buffer.writeInt16LE(value, 44 + index * 2);
  }
  return buffer;
}
