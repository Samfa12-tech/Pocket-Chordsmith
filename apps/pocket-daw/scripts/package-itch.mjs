import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { hashArtifacts, relativeArtifactPath, walkFiles, writeChecksumFile } from "./hash-release-artifacts.mjs";
import { assertReleaseCandidateTruth } from "./verify-release-candidate-truth.mjs";
import { verifyWindowsSignature } from "./verify-windows-signature.mjs";

export const ITCH_CHANNEL = "windows-installer";
export const ITCH_SLUG = "samfa12/pocket-daw";
export const RELEASE_TITLE = `Pocket DAW v${packageJson.version} - Timeline-First UI + Hardened Pocket Audio Handoff`;
export const FORBIDDEN_PACKAGE_PARTS = [
  ".git",
  ".env",
  "node_modules",
  "target",
  "src",
  ".pfx",
  ".p12",
  ".pem",
  ".key",
  ".log",
  ".map"
];

const ROOT = process.cwd();
const VERSION = packageJson.version;
const RELEASES_DIR = join(ROOT, "releases", "itch");
const INSTALLERS_DIR = join(RELEASES_DIR, "installers");
const UPDATER_ENDPOINT = "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json";

export async function packageItchRelease({ buildNative = process.env.POCKET_DAW_SKIP_NATIVE_BUILD !== "1" } = {}) {
  assertReleaseCandidateTruth(ROOT);
  if (buildNative) run("npm", ["run", "tauri:build:installers"]);

  rmCurrentVersionReleaseFiles();
  mkdirSync(RELEASES_DIR, { recursive: true });

  const installerCopies = copyInstallerArtifacts();
  const installerSet = classifyInstallers(installerCopies);
  assertInstallerArtifacts(installerSet);

  const installerHashes = await releaseArtifactsWithSignatures(installerCopies);
  const releaseDocs = releaseTextFiles(installerHashes, installerSet);
  writeReleaseDocs(releaseDocs);
  writeInstallerUploadDocs(releaseDocs);

  const installerFolderArtifacts = await hashArtifacts(
    ROOT,
    walkFiles(INSTALLERS_DIR).filter((path) => basename(path) !== "CHECKSUMS_SHA256.txt")
  );
  writeChecksumFile(join(INSTALLERS_DIR, "CHECKSUMS_SHA256.txt"), installerFolderArtifacts);

  assertInstallerUploadContents(INSTALLERS_DIR);

  const rootArtifacts = [
    ...walkFiles(INSTALLERS_DIR),
    join(RELEASES_DIR, `README_FIRST_v${VERSION}.txt`),
    join(RELEASES_DIR, `RELEASE_NOTES_v${VERSION}.md`),
    join(RELEASES_DIR, `KNOWN_LIMITATIONS_v${VERSION}.md`),
    join(RELEASES_DIR, `ITCH_PAGE_COPY_v${VERSION}.md`),
    join(RELEASES_DIR, `WINDOWS_SMOKE_CHECKLIST_v${VERSION}.md`),
    join(RELEASES_DIR, `LICENSE_OR_FREEWARE_NOTICE_v${VERSION}.txt`)
  ];
  const artifacts = await releaseArtifactsWithSignatures(rootArtifacts);

  const manifestPath = join(RELEASES_DIR, `pocket-daw-release-manifest-v${VERSION}.json`);
  const manifest = await releaseManifest(artifacts);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const checksummed = await hashArtifacts(ROOT, [...rootArtifacts, manifestPath]);
  const checksumPath = join(RELEASES_DIR, `CHECKSUMS_SHA256_v${VERSION}.txt`);
  writeChecksumFile(checksumPath, checksummed);

  const finalArtifacts = await releaseArtifactsWithSignatures([...rootArtifacts, manifestPath, checksumPath]);
  const verdictPath = join(RELEASES_DIR, `FINAL_RELEASE_VERDICT_v${VERSION}.md`);
  writeFileSync(verdictPath, finalVerdict(finalArtifacts));

  return {
    version: VERSION,
    installerDir: INSTALLERS_DIR,
    manifestPath,
    checksumPath,
    verdictPath,
    artifacts: finalArtifacts
  };
}

function rmCurrentVersionReleaseFiles() {
  rmSync(INSTALLERS_DIR, { recursive: true, force: true });
  rmSync(join(RELEASES_DIR, `pocket-daw-windows-x64-v${VERSION}`), { recursive: true, force: true });
  rmSync(join(RELEASES_DIR, `pocket-daw-windows-x64-v${VERSION}.zip`), { force: true });
  [
    `README_FIRST_v${VERSION}.txt`,
    `RELEASE_NOTES_v${VERSION}.md`,
    `KNOWN_LIMITATIONS_v${VERSION}.md`,
    `ITCH_PAGE_COPY_v${VERSION}.md`,
    `WINDOWS_SMOKE_CHECKLIST_v${VERSION}.md`,
    `LICENSE_OR_FREEWARE_NOTICE_v${VERSION}.txt`,
    `pocket-daw-release-manifest-v${VERSION}.json`,
    `CHECKSUMS_SHA256_v${VERSION}.txt`,
    `FINAL_RELEASE_VERDICT_v${VERSION}.md`
  ].forEach((name) => rmSync(join(RELEASES_DIR, name), { force: true }));
}

function copyInstallerArtifacts() {
  mkdirSync(INSTALLERS_DIR, { recursive: true });
  const bundleRoot = join(ROOT, "src-tauri", "target", "release", "bundle");
  if (!existsSync(bundleRoot)) {
    throw new Error("Tauri bundle artifacts were not found. Run npm run tauri:build first.");
  }
  const candidates = walkFiles(bundleRoot).filter((path) => {
    const fileName = basename(path);
    return /\.(exe|msi|sig)$/i.test(fileName) && fileName.includes(`_${VERSION}_`);
  });
  if (!candidates.length) {
    throw new Error(`No Pocket DAW ${VERSION} installer artifacts were found under ${bundleRoot}.`);
  }
  ensureUpdaterSignatures(candidates);
  const copied = [];
  for (const source of candidates) {
    const target = join(INSTALLERS_DIR, basename(source));
    copyFileSync(source, target);
    copied.push(target);
  }
  return copied;
}

function ensureUpdaterSignatures(paths) {
  const installers = paths.filter((path) => /\.(exe|msi)$/i.test(path));
  for (const installer of installers) {
    const signature = `${installer}.sig`;
    if (!existsSync(signature) || statSync(signature).mtimeMs + 1000 < statSync(installer).mtimeMs) {
      signUpdaterArtifact(installer);
      if (!paths.includes(signature)) paths.push(signature);
    }
  }
}

function signUpdaterArtifact(installerPath) {
  const keyPath = updaterSigningKeyPath();
  const cliPath = join(ROOT, "node_modules", "@tauri-apps", "cli", "tauri.js");
  if (!existsSync(cliPath)) throw new Error(`Tauri CLI was not found at ${cliPath}. Run npm install before packaging.`);
  console.log(`Signing updater artifact ${basename(installerPath)}`);
  runDirect(process.execPath, [cliPath, "signer", "sign", "--private-key-path", keyPath, "--password=", installerPath]);
}

function updaterSigningKeyPath() {
  const configured = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || process.env.TAURI_SIGNING_PRIVATE_KEY_FILE;
  if (configured && existsSync(configured)) return configured;
  if (process.env.TAURI_SIGNING_PRIVATE_KEY && existsSync(process.env.TAURI_SIGNING_PRIVATE_KEY)) return process.env.TAURI_SIGNING_PRIVATE_KEY;
  const fallback = join(process.env.USERPROFILE || "", ".pocket-daw-secrets", "tauri-updater.key");
  if (existsSync(fallback)) return fallback;
  throw new Error("Missing Tauri updater signing key file. Set TAURI_SIGNING_PRIVATE_KEY_PATH or place tauri-updater.key under %USERPROFILE%\\.pocket-daw-secrets.");
}

function classifyInstallers(paths) {
  const setupExe = paths.find((path) => /setup\.exe$/i.test(basename(path))) || null;
  const setupSig = setupExe ? paths.find((path) => basename(path).toLowerCase() === `${basename(setupExe).toLowerCase()}.sig`) || null : null;
  const msi = paths.find((path) => /\.msi$/i.test(basename(path))) || null;
  const msiSig = msi ? paths.find((path) => basename(path).toLowerCase() === `${basename(msi).toLowerCase()}.sig`) || null : null;
  return { setupExe, setupSig, msi, msiSig };
}

function assertInstallerArtifacts(installers) {
  if (!installers.setupExe) throw new Error("Missing NSIS setup EXE installer artifact.");
  if (!installers.setupSig) throw new Error("Missing Tauri updater signature for the setup EXE.");
  if (!installers.msi) throw new Error("Missing MSI installer artifact.");
  if (!installers.msiSig) throw new Error("Missing Tauri updater signature for the MSI installer.");
  assertSignatureFreshness(installers.setupExe, installers.setupSig, "setup EXE");
  assertSignatureFreshness(installers.msi, installers.msiSig, "MSI");
}

function assertSignatureFreshness(installerPath, signaturePath, label) {
  const installerTime = statSync(installerPath).mtimeMs;
  const signatureTime = statSync(signaturePath).mtimeMs;
  if (signatureTime + 1000 < installerTime) {
    throw new Error(`Tauri updater signature for ${label} appears stale. Rebuild with TAURI_SIGNING_PRIVATE_KEY so ${basename(signaturePath)} is regenerated after ${basename(installerPath)}.`);
  }
}

async function releaseArtifactsWithSignatures(paths) {
  const hashes = await hashArtifacts(ROOT, paths);
  return hashes.map((artifact) => {
    const absolute = join(ROOT, artifact.path);
    const signature = /\.(exe|msi)$/i.test(artifact.path) ? verifyWindowsSignature(absolute) : { status: "not-applicable", detail: "" };
    return {
      ...artifact,
      signatureStatus: signature.status,
      signatureDetail: scrubLocalPaths(signature.detail || "")
    };
  });
}

function releaseTextFiles(installerArtifacts, installers) {
  const previewCommand = butlerPreviewCommand();
  const pushCommand = butlerPushCommand();
  const limitations = knownLimitations();
  const smokeChecklist = windowsSmokeChecklist(installerArtifacts);
  const artifactTable = installerArtifactTable(installerArtifacts);
  const setupName = installers.setupExe ? basename(installers.setupExe) : "missing setup EXE";
  const msiName = installers.msi ? basename(installers.msi) : "missing MSI";
  return {
    "README_FIRST.txt": `Pocket DAW v${VERSION}

Pocket DAW is a free Windows alpha for arranging, editing and exporting Pocket Chordsmith projects.

Install:
1. Download the Windows installer from itch.
2. Run ${setupName}. If MSI is preferred for your environment, use ${msiName}.
3. Launch Pocket DAW from the Start Menu or installed shortcut.
4. If Windows SmartScreen appears, only continue if you trust the itch/GitHub release and verified the SHA-256 checksum.

Pocket DAW is installed-app only. Do not run it as a public portable/extract-and-run app.

Checksums are in CHECKSUMS_SHA256.txt. Manual Windows smoke testing status: NOT RUN until a tester fills the installed-app checklist for this exact installer hash.
`,
    "RELEASE_NOTES.md": `# Pocket DAW v${VERSION} - Timeline-First UI + Hardened Pocket Audio Handoff

Pocket DAW is a free Windows alpha for arranging, editing and exporting Pocket Chordsmith projects. It is distributed as an installed Windows app only.

## Installer Artifacts

${artifactTable}

## Highlights

- Opens into a timeline-first workspace: the inspector starts hidden, lower dock/media detail are tucked away, and the timeline gets most of the screen.
- Simplified the timeline toolbar so core editing stays close to the timeline without flooding the first view with every range/edit command.
- Music and Game Music focus presets now change real layout defaults, helping music creation and game-export work feel less crowded.
- The Music focus preset tucks the lower dock by default, timeline tools stay collapsed on open, and panel toggles preserve scroll so the timeline does not jump while working.
- Pocket Audio handoff now uses the download/open path for installed DAW launch from samfa12.com, avoiding the old QR/local-network fallback.
- Hardened installed Pocket Audio handoff imports so downloaded/opened payloads from samfa12.com are accepted reliably and cleared after import instead of repeating unexpectedly.
- Sam manually smoke-tested save/load, Pocket Audio handoff push from samfa12.com, and audible playback/listening quality for this release checkpoint.
- The existing Chordsmith, DJ, MIDI, native decode, WAV export, stem, section-loop, Godot and web-game pack foundations remain part of this alpha line.
- Pocket DAW bass tone now matches Pocket Chordsmith much more closely in the installed/native path by applying Chordsmith-style harmonic low-pass filtering to generated bass waves.
- Accented generated bass notes now keep their Chordsmith release tail instead of being cut early in cached/native playback.
- The native audio render-cache contract was bumped so older harsh/distorted generated bass stems are treated as stale and rebuilt automatically.
- Disabled automatic hidden native render-cache builds on project load and during live playback, preventing runaway RAM/disk churn from stuck cache generation.
- Loop toggles and loop range edits now restart native playback with transport-only sync, keeping the playhead, loop marker and mixer visualiser aligned with the native audio clock.
- Imported auto-bass projects now show their audible auto bass in the bass timeline/editor instead of looking empty.
- The first manual bass edit now fills the existing auto bass into editable manual notes across all sections, so changing one note does not erase the rest of the line.
- Added a Bass inspector "Fill auto bass" button to intentionally copy the current auto-bass line into manual notes.
- Live native composition edits keep existing cached playback regions where possible and defer fresh cache generation instead of launching hidden rebuilds during playback.
- Hardened the installed-app live recording path for Windows smoke testing.
- Preserved fractional recording placement and same-track overwrite splitting around recorded takes.
- Added first punch and take-lane recording placement controls: Punch uses an explicit timeline range, Replace keeps visible-range overwrite behavior, and Take Lane preserves overlapping material as inactive grouped takes.
- Audio and MIDI take-lane activation, archive/restore, split/comp editing and export filtering now share durable take metadata so inactive lanes stay out of playback/export.
- Moved heavy recording preparation before count-in, guards stale recording sessions, and keeps stopped-transport count-in coherent.
- Reused the armed input preview stream when recording begins instead of rebuilding the input stream at the capture boundary.
- Streamed native capture through bounded lock-free rings and a writer thread to .wav.part before final WAV rename.
- Added native recording diagnostics for input/capture frame counters, dropped input frames, monitor underrun/overrun counters, playback anchors, requested start context, and actual capture sample rate.
- Replaced monitor queue/status callback mutex use with atomics and SPSC rings.
- Added explicit input-to-output sample-rate pacing for live input monitoring when devices use different default sample rates.
- Added loopback calibration reporting tooling without applying hidden latency compensation.
- Added native playback loop-region support so the installed native engine wraps active loop ranges on the audio clock.
- Added native metronome payload/rendering support so the installed native engine can click in sync with transport playback.
- Coalesced rapid live composition edits into latest-only native playback restarts, reducing restart overlap during drum, bass, guitar and section editing.
- Rebuilds and reuses fresh native render cache data after live composition edits instead of leaving playback permanently bypassed.
- Narrowed native render cache signatures to audio-affecting generated-stem fields so title, file and UI-only edits do not invalidate cache unnecessarily.
- Save As can adopt a useful project title from the chosen .pocketdaw filename, and untitled projects display the saved file title in the transport.
- Guitar editor changes now keep the DAW guitar track active/mute state and Chordsmith guitar metadata in sync.
- Track output, add-track and metronome interactions preserve timeline scroll while updating the relevant audio graph.
- Added Pocket Audio chip tune import compatibility for chip presets, chip texture metadata, chip drums, basses, chords, melody instruments and groove presets.
- Added chip-aware Chordsmith import metadata so DAW tracks preserve chip profile details for Chordsmith, DJ, Godot and game-export workflows.
- Updated generated native sound recipes so chip drum, bass, chord and melody IDs can render through the native audio path.
- Added a Chip Tune V1 family sound-pack path across Pocket Audio Core, Chordsmith, Pocket DJ, Pocket DAW and the Godot addon.
- Added file-first AI/MCP bridge improvements for arranging MIDI into Pocket DAW projects and opening explicit .pocketdaw paths.
- Improved performance diagnostics and routing/return-send groundwork for installed-app testing.
- Added lofi/chillhop Chordsmith import compatibility for dusty keys, warm basses, soft drum kits, swing, humanize and texture metadata.
- Added lofi project and track defaults so imported Pocket Chordsmith beds open with a warmer DAW master chain.
- Preserved Chordsmith master/chord/beat/lead/guitar mix-slider values as DAW master and track volumes during import.
- Added direct DAW-vs-Chordsmith browser event parity coverage so committed fixtures compare against the live Chordsmith browser importer.
- Preserved lofi metadata in imported projects for Chordsmith, DJ, Godot and game-export workflows.
- Added shared sound-surface freshness checks so Chordsmith, DJ, DAW native recipes and Godot preview metadata are updated from the same core registries.
- Added per-drum lane mixer/FX scaffolding while keeping drums on one DAW track for the normal workflow.
- Added Godot/web game-pack exports with shared path contracts, manifests, source project JSON and rendered audio assets for target-project import testing.
- Manual Build Native Cache now immediately swaps active native playback to cached WAV regions for generated tracks until their source hash changes.
- Added Native Playback and Native Cache readouts in the Media Pool and About/Diagnostics panels so testers can see cached regions, cached clips and procedural fallback events while A/B testing lofi projects.
- Lofi texture ticks no longer drive the Drums mixer meter, so cached/native playback visualises real drum hits without making quiet lofi bed sections look like constant drum activity.
- Native procedural warm_sub/lofi bass now uses Chordsmith-level bass output instead of an extra native-only pad, so soloed imported bass remains audible on low notes.
- Polished live-recording controls so armed input selectors, input activity and FX controls fit cleanly in mixer strips.
- Added armed-track input preview metering, so live vocal/input tracks show signal before recording starts.
- Monitor changes now apply to armed preview and active recording status, with clearer diagnostics for input/output/monitor state.
- Track mute, solo, arm, monitor, input and recording-preview interactions preserve timeline scroll instead of jumping back to the top.
- Pressing Record after the count-in starts the transport/backing tracks from the captured record-start bar.
- New recorded takes overwrite overlapping audio on the same armed track while preserving non-overlapping clip remainders.
- Transport readouts and mixer track titles were tightened to avoid clipped or spilling text in the installed app UI.
- Pocket DAW bass playback was darkened toward Pocket Chordsmith export parity for imported songs.
- Added the first installed-app live recording alpha: one armed mono live audio track at a time.
- Added Record transport controls, recording status/timer, metronome toggle and one-bar count-in support.
- Added live-track M/S/R/Monitor controls in the timeline and mixer.
- Recording requires a saved .pocketdaw file and writes PCM WAV takes under project-media/recordings beside the project.
- Stopping a take imports the WAV as project media and places an audio clip on the armed track according to the selected Replace, Take Lane or Punch mode.
- Added native CPAL recording start/stop/status commands with project-media path safety checks and friendly no-input errors.
- Added diagnostics fields for recording state, armed tracks, monitor-enabled tracks and metronome/count-in settings.
- Fixed Standard MIDI File import for real-world format 1 files with tempo/meta tracks and separate note tracks.
- Fixed full-song MIDI export structure so multi-track exports declare format 1 and preserve project tempo.
- Chordsmith/PCS1/raw JSON imports now preserve source BPM and open as a fresh imported project after saving a pre-import recovery snapshot.
- About/Diagnostics and updater dialogs are constrained below the installed-app menu/transport bars.
- Startup update checks now stay quiet when current and surface the updater panel when an update is available.
- Release manifest and SHA-256 checksums are generated from actual installer artifacts.
- Untrusted .pocketdaw/JSON rendering is hardened for names, IDs, data attributes and colors.
- Browser/dev and native import paths now reject oversized project, MIDI and audio files with friendly errors.
- Persisted native cache metadata can hydrate valid project-cache/native-audio WAV files when source hashes still match.

## Signing

Windows Authenticode signing is not claimed unless the release manifest reports signed installers. Unsigned Windows installers may trigger SmartScreen warnings. Tauri updater .sig files are separate updater-validation signatures and do not replace Authenticode signing.

## Butler

Preview:
\`${previewCommand}\`

Push:
\`${pushCommand}\`
`,
    "KNOWN_LIMITATIONS.md": limitationsMarkdown(limitations),
    "LICENSE_OR_FREEWARE_NOTICE.txt": `Pocket DAW is free to download and use.

Copyright remains with the author.
Redistribution or modification of the app/source is not granted unless separately licensed.
No warranty is provided.
`,
    "WINDOWS_SMOKE_CHECKLIST.md": smokeChecklist,
    "ITCH_PAGE_COPY.md": itchPageCopy(previewCommand, pushCommand, limitations, artifactTable)
  };
}

function writeReleaseDocs(docs) {
  writeFileSync(join(RELEASES_DIR, `README_FIRST_v${VERSION}.txt`), docs["README_FIRST.txt"]);
  writeFileSync(join(RELEASES_DIR, `RELEASE_NOTES_v${VERSION}.md`), docs["RELEASE_NOTES.md"]);
  writeFileSync(join(RELEASES_DIR, `KNOWN_LIMITATIONS_v${VERSION}.md`), docs["KNOWN_LIMITATIONS.md"]);
  writeFileSync(join(RELEASES_DIR, `WINDOWS_SMOKE_CHECKLIST_v${VERSION}.md`), docs["WINDOWS_SMOKE_CHECKLIST.md"]);
  writeFileSync(join(RELEASES_DIR, `LICENSE_OR_FREEWARE_NOTICE_v${VERSION}.txt`), docs["LICENSE_OR_FREEWARE_NOTICE.txt"]);
  writeFileSync(join(RELEASES_DIR, `ITCH_PAGE_COPY_v${VERSION}.md`), docs["ITCH_PAGE_COPY.md"]);
}

function writeInstallerUploadDocs(docs) {
  for (const [name, contents] of Object.entries(docs)) {
    const targetName = name === "ITCH_PAGE_COPY.md" ? "ITCH_PAGE_COPY_FOR_OPERATOR.md" : name;
    writeFileSync(join(INSTALLERS_DIR, targetName), contents);
  }
}

function knownLimitations() {
  return [
    "Live recording is a narrow installed-app alpha: one armed mono live track at a time.",
    "No ASIO backend yet; native audio currently targets WASAPI/CPAL.",
    "No simultaneous multitrack recording, stereo recording modes, dedicated lane subtracks/collapse/solo controls, full polished comping UI, live MIDI capture, FX-through-monitoring or latency compensation UI yet.",
    "Imported audio decode/streaming is still limited and large files are rejected before whole-file reads.",
    "Full send/return processing and advanced pro DAW features are future work.",
    "Godot/web game-pack exports build ZIPs with manifest metadata, source project JSON and rendered audio, but still need target-project smoke testing before calling them production pipeline exports.",
    "Godot editor sample preview is still an audition path, not exact DAW/Chordsmith/DJ synth parity; use DAW game-pack rendered audio for parity checks.",
    "Stem WAV ZIP export is a single manifest-backed ZIP in current source/current candidate, generated sequentially; treat it as release-smoked only after the exact installer checklist confirms playable/readable stems.",
    "Native cache hydration reads valid project-cache/native-audio WAV entries when source hashes match; stale, invalid or partial generated-stem cache groups are skipped.",
    "Manual native-cache builds are intended to override generated-track playback until a source-changing edit invalidates the source hash; treat any continued procedural generated-track playback after a successful cache build as a bug.",
    "Automation is limited to first-pass track volume and pan lanes.",
    "Pocket DAW is not claimed to be a professional DAW replacement."
  ];
}

function limitationsMarkdown(limitations) {
  return `# Known Limitations - Pocket DAW v${VERSION}

${limitations.map((item) => `- ${item}`).join("\n")}
`;
}

function itchPageCopy(previewCommand, pushCommand, limitations, artifactTable) {
  return `# Pocket DAW

Free Windows alpha for arranging, editing and exporting Pocket Chordsmith projects.

Pocket DAW is installed-app only. It is not a professional DAW replacement yet.

## Installer Artifacts

${artifactTable}

## Short Description

Pocket DAW lets you import Pocket Chordsmith songs, arrange sections on a desktop timeline, play back generated parts, import audio/MIDI, and export WAV/MIDI. Current source/current candidate also includes stem WAV, section-loop and Godot/web game-pack ZIP builders; call those release-smoked only after the exact installer checklist passes.

## Features

- Import PCS1 codes, raw Pocket Chordsmith JSON, PocketHandoff payloads and .pocketdaw projects.
- Arrange clips on a DAW-style timeline with markers, loop controls, split/trim/copy/paste/duplicate/delete.
- Edit Chordsmith drums, bass, melody, guitar, section bars and chords.
- Preserve imported Chordsmith mix volumes, lofi sound IDs and per-track source metadata for parity testing.
- Import audio and MIDI into a visible media pool.
- Record one armed mono live audio track in the installed app, with project-media WAV takes plus first punch and take-lane placement modes.
- Export full WAV, MIDI, stem WAVs, section-loop WAVs, Godot game-pack ZIPs and web-game ZIPs.
- Use per-drum lane mixer/FX controls for advanced drum balancing while keeping the normal Drums track compact.
- Native Windows/Tauri shell with native audio playback and project file dialogs.

## Install

1. Download the Windows installer.
2. Run the setup EXE, or use the MSI if that is better for your Windows environment.
3. Launch Pocket DAW from the Start Menu or installed shortcut.
4. If Windows SmartScreen appears, verify the SHA-256 checksum and only continue if you trust the release.

## Best For

Pocket Chordsmith users, song sketching, adaptive/game-audio planning, MIDI/WAV export prep and lightweight Windows desktop arrangement.

## Known Limitations

${limitations.map((item) => `- ${item}`).join("\n")}

ASIO, simultaneous multitrack recording, dedicated lane subtracks, full polished comping UI, live MIDI capture, full send/return processing, full bundled game export packs and advanced pro DAW features are future work unless a later release explicitly says otherwise.

## Signing

Windows SmartScreen may appear because this alpha is not currently claimed as Authenticode-signed. Tauri updater signatures are separate .sig files used by the updater and are not Windows code signing.

## Licensing Note

The repo has mixed licensing/source-available boundaries. Do not describe the whole repo as fully MIT/open-source unless the license files explicitly support that.

## Feedback Request

Please report launch issues, import/export bugs, audio-device problems, project files that fail to open, and any difference between expected and actual smoke-checklist results.

## Suggested Itch Settings

- Pricing: Free, or Name Your Own Price with $0 minimum if preferred.
- Classification/category: Tool.
- Platform: Windows.
- Release status: Alpha testing unless manual QA justifies stronger wording.
- Tags: music, daw, midi, songwriting, music-production, game-audio, windows, tauri, tool.
- AI disclosure: creator must fill this honestly before publishing.
- Do not set the itch page to HTML.

## Butler Commands

Preview:
\`${previewCommand}\`

Installer upload:
\`${pushCommand}\`

Adjust \`${ITCH_SLUG}\` if the itch slug is different. Upload the installer folder only after reviewing the generated checksums, updater signatures, release manifest and manual smoke status.
`;
}

function windowsSmokeChecklist(installerArtifacts = []) {
  const artifactRows = installerArtifacts.length
    ? installerArtifacts.map((artifact) => `- \`${artifact.path}\` SHA-256: \`${artifact.sha256}\` (${artifact.signatureStatus})`).join("\n")
    : "- Installer hashes are generated by `npm run package:itch`.";
  const rows = [
    ["Install / launch", "Clean install from the current public setup EXE or MSI.", "Installer completes and creates the expected installed app entries."],
    ["Install / launch", "Launch Pocket DAW from the Start Menu or installed shortcut.", "Installed app opens without needing an extracted app folder."],
    ["Install / launch", "Launch after reboot if practical.", "Installed app still launches normally after Windows restart."],
    ["Install / launch", "Open About/Diagnostics and confirm app version/build id.", `Version v${VERSION} and build/commit information are visible or explicitly unavailable.`],
    ["Install / launch", "Uninstall, reinstall, then open the app.", "Expected user data is preserved or loss/caveat is documented; reinstall does not corrupt projects."],
    ["Basic audio", "Load Demo, press Play, then Stop and Restart.", "Demo plays audibly, stops, and restarts from the expected position."],
    ["Basic audio", "Move/scroll the timeline and open/close the inspector while playing.", "No crackle/glitch, no major hitch, and playback remains usable during basic UI movement."],
    ["Chordsmith import", "Import a PCS1 share code if supported by the public build.", "Pocket Chordsmith project imports and timeline populates."],
    ["Chordsmith import", "Import raw Pocket Chordsmith JSON.", "Project imports without dropping source fields."],
    ["Chordsmith import", "Import a known lofi/chillhop Chordsmith project with non-default master/chord/beat/lead/guitar volumes.", "Lofi sound IDs, source notes and Chordsmith mix-slider values appear in DAW track/master volumes and metadata."],
    ["Chordsmith import", "A/B the same lofi project in current Chordsmith, Pocket DJ and Pocket DAW.", "Timing, notes, drum pattern and relative mix feel match closely enough for release; differences are recorded with repro files."],
    ["Chordsmith import", "Import PocketHandoff if supported by the public build.", "Handoff imports once and does not repeat after reload."],
    ["Chordsmith import", "Save, close, reopen, and inspect imported source data.", "Source Chordsmith data remains preserved after saving/reopening."],
    ["Project workflow", "Create/open a project, save a .pocketdaw file, close app, reopen app, reopen saved .pocketdaw.", "Timeline and imported source data remain intact."],
    ["Editing", "Move/trim/split/duplicate/delete a basic timeline clip.", "Clip edits apply to the selected clip only and survive save/reopen."],
    ["Editing", "Edit a generated section and repeat several inspector edits.", "Generated-section edits are audible and inspector does not jump unexpectedly."],
    ["Editing", "Edit drum sequencer steps while playing or after playback.", "Drum edits produce audible changes."],
    ["Editing", "Change one track/section, then inspect demo and unrelated sections.", "Unrelated demo/sections do not mutate unexpectedly."],
    ["Mixer/audio state", "Adjust track volume, mute, solo if present, and pan.", "Audio/state changes match the control without corrupting other tracks."],
    ["Mixer/audio state", "Open Drums advanced/lane controls and adjust kick, snare, hat and extra live-drum lane volume/pan/FX where exposed.", "Per-lane controls change only the intended drum lane and persist through save/reopen/export."],
    ["Mixer/audio state", "Adjust FX controls, routing/bus controls and automation if exposed.", "Controls persist, export safely, and guarded scaffolds stay honest where incomplete."],
    ["Native cache", "Open the imported lofi demo, press Build Native Cache, then play while watching About/Diagnostics.", "Generated tracks play from cached WAV regions with low or zero procedural fallback events until a source-changing edit invalidates the cache."],
    ["Native cache", "While native playback is running, press Build Native Cache again after a generated-section edit.", "Playback restarts cleanly at the current position using the fresh cached WAV regions without ongoing crackle/slowdown."],
    ["Native cache", "Inspect the Media Pool Native Playback line and About/Diagnostics Native Cache line before and after Build Native Cache.", "The readout changes from procedural or bypassed playback to cached regions/clips and reports low or zero procedural fallback events for generated tracks."],
    ["Mixer meters", "Play an imported lofi project with native cache active, including a sparse or no-drum section.", "The Drums meter follows drum hits and does not stay active only because lofi texture/noise events are present."],
    ["Mixer/audio state", "Solo the Bass track on the imported lofi demo and raise volume to 100-120%.", "Warm Sub Bass is audible and the Bass meter corresponds to audible low-end/body, not a silent procedural event."],
    ["Live recording", "Save a .pocketdaw project, add a Live Vocals or Live Instrument track, then arm it.", "Exactly one live audio track is armed and the project must be saved before recording."],
    ["Live recording", "Refresh Audio Settings, choose an input, toggle Monitor off/on, and keep speakers/headphones safe.", "Monitor state changes clearly and no feedback occurs when Monitor is off."],
    ["Live recording", "Enable metronome, press Record, wait for count-in, record 5-10 seconds, then Stop Rec.", "A mono WAV is written under project-media/recordings and a clip appears on the armed track."],
    ["Live recording", "Place existing audio on the armed track, set a visible punch range, enable Punch, choose Take Lane, start at or before punch-in, record briefly, then Stop Rec.", "The new WAV is saved under project-media/recordings; only the punch window is active, old overlapping material is preserved as an inactive take lane, and raw media remains in the Media Pool."],
    ["Live recording", "Repeat a punch over existing audio with Punch enabled and Replace selected.", "Only the punch window replaces/trims visible material on the armed track; non-overlapping remainders preserve source offsets."],
    ["Live recording", "Save, close, reopen the project, then play the recorded clip.", "Recorded project-media WAV reloads and plays."],
    ["Live recording", "After punch/take-lane recording, save, close, reopen, activate another lane, export WAV, and export MIDI from a project with grouped MIDI takes.", "Only active or comp-selected audio/MIDI lanes are audible/exported; archived or inactive lanes remain in the project."],
    ["Import/export", "Import an audio clip if exposed and place it on the timeline.", "Media appears with clear embedded/collected/referenced/cached/missing state; audible if loaded."],
    ["Import/export", "Import MIDI if exposed.", "MIDI item/clip appears and is readable/editable."],
    ["Import/export", "Export WAV and open the file in a player.", "WAV file is created and playable."],
    ["Import/export", "Export MIDI and open it in a MIDI-capable tool.", "MIDI file is created and readable."],
    ["Import/export", "Export stems if exposed.", "Stem files are created and playable/readable."],
    ["Import/export", "Export a Godot Adaptive/Game Pack ZIP and import it in the Godot addon.", "Godot addon accepts the DAW pack, creates project assets, and preview/rendered audio matches the DAW export path."],
    ["Safety", "Try an oversized import for project, audio or MIDI.", "Friendly rejection appears before whole-file read; app does not hang/crash."],
    ["Safety", "Open malicious/unsafe metadata fixture.", "Unsafe HTML/script/event/CSS is not executed or rendered raw."],
    ["Safety", "Open a corrupted project file.", "Friendly error is shown and the app remains open."],
    ["Updater", "Install the current public version, then stage/publish a newer signed updater release.", "Update manifest is reachable and points at the staged installer artifact."],
    ["Updater", "Open installed app and check for updates.", "Updater reports the staged newer version and release notes."],
    ["Updater", "Download/install update, relaunch, and verify version.", "Update installs/relaunches and version changes."],
    ["Updater", "Open a project saved before the update.", "Previous project still opens after update."]
  ];
  return `# Windows Installed-App Smoke Checklist - Pocket DAW v${VERSION}

Manual smoke status: NOT RUN

Run this against the exact installed Windows alpha from itch/GitHub release artifacts. Do not use an extracted portable app folder.

## Release Identity

- App: Pocket DAW
- Version: \`${VERSION}\`
- Itch channel: \`${ITCH_CHANNEL}\`
- Updater endpoint: \`${UPDATER_ENDPOINT}\`
- SmartScreen/code signing: Windows Authenticode signing is not claimed unless the manifest reports signed installers.
- Tauri updater signatures: separate \`.sig\` files used by the updater; these are not Windows code signing.

## Installer Hashes

${artifactRows}

| Test area | Steps | Expected result | Actual result | Pass/Fail | Tester/Date | Notes |
| --- | --- | --- | --- | --- | --- | --- |
${rows.map(([area, steps, expected]) => `| ${area} | ${steps} | ${expected} | Manual / Not run | Manual / Not run |  |  |`).join("\n")}
`;
}

async function releaseManifest(artifacts) {
  const gitCommit = commandOutput("git", ["rev-parse", "HEAD"]);
  const gitStatus = commandOutput("git", ["status", "--short"]);
  const schema = readFileSync(join(ROOT, "src", "daw", "schema.ts"), "utf8");
  const schemaVersion = Number(schema.match(/POCKET_DAW_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1] || 0);
  const rustVersion = commandOutput("rustc", ["--version"]) || null;
  const tauriVersion = commandOutput("npx", ["tauri", "--version"]) || null;
  return {
    appName: "Pocket DAW",
    releaseTitle: RELEASE_TITLE,
    version: VERSION,
    schemaVersion,
    gitCommitSha: gitCommit,
    dirtyWorkingTree: gitStatus.length > 0,
    dirtyWorkingTreeStatus: gitStatus,
    buildTimestampUtc: new Date().toISOString(),
    nodeVersion: process.version,
    npmVersion: commandOutput("npm", ["--version"]) || null,
    rustVersion,
    tauriCliVersion: tauriVersion,
    target: { os: "windows", arch: "x64", channel: ITCH_CHANNEL },
    distribution: {
      installerOnly: true,
      publicPortableApp: false,
      installerDirectory: relativeArtifactPath(ROOT, INSTALLERS_DIR),
      updaterEndpoint: UPDATER_ENDPOINT
    },
    artifacts,
    windowsSmokeTest: { status: "NOT RUN", run: false },
    manualItchUpload: { status: "NOT RUN", run: false },
    installersIncluded: artifacts.some((artifact) => artifact.path.startsWith("releases/itch/installers/") && /\.(exe|msi)$/i.test(artifact.path)),
    signingRequired: process.env.POCKET_DAW_REQUIRE_SIGNING === "1",
    knownLimitations: knownLimitations(),
    butlerCommands: {
      preview: butlerPreviewCommand(),
      push: butlerPushCommand()
    }
  };
}

function finalVerdict(finalArtifacts) {
  const installers = finalArtifacts.filter((artifact) => artifact.path.startsWith("releases/itch/installers/") && /\.(exe|msi)$/i.test(artifact.path));
  const signatures = finalArtifacts.filter((artifact) => artifact.path.startsWith("releases/itch/installers/") && /\.sig$/i.test(artifact.path));
  const unsigned = installers.filter((artifact) => artifact.signatureStatus !== "signed");
  return `# Final Release Verdict - Pocket DAW v${VERSION}

GO WITH CAVEATS - ready only if caveats are acceptable

## Evidence

- Version: ${VERSION}
- Commit SHA: ${commandOutput("git", ["rev-parse", "HEAD"])}
${installers.map((artifact) => `- Installer: ${artifact.path}\n  - SHA-256: ${artifact.sha256}\n  - Authenticode status: ${artifact.signatureStatus}`).join("\n")}
${signatures.map((artifact) => `- Tauri updater signature: ${artifact.path}\n  - SHA-256: ${artifact.sha256}`).join("\n")}
- Distribution mode: installed Windows app only.
- Public portable app: NO.
- Itch channel: ${ITCH_CHANNEL}.
- Windows smoke test status: NOT RUN.
- Manual itch upload status: NOT RUN.
- Release wording: free Windows alpha for arranging, editing and exporting Pocket Chordsmith projects.

## Signing

${unsigned.length ? `Unsigned installer artifacts: ${unsigned.map((artifact) => artifact.path).join(", ")}. Windows SmartScreen may appear.` : "All installer artifacts reported signed by Authenticode verification."}

Tauri updater .sig files are present for updater validation but do not replace Windows Authenticode signing.

## Key Known Limitations

${knownLimitations().map((item) => `- ${item}`).join("\n")}

## Unsupported Or Not Run

- Full manual Windows smoke checklist has not been completed against this installer artifact.
- Authenticode signing is unavailable unless the manifest marks installers as signed.
- No itch upload was run by this script.
- Updater rehearsal must be completed from an installed older build before calling updater production-ready.

## Butler Commands

Preview:
\`${butlerPreviewCommand()}\`

Installer upload:
\`${butlerPushCommand()}\`

Do not publish publicly until the manual Windows smoke checklist is filled in for the exact installer hash above.
`;
}

function installerArtifactTable(artifacts) {
  const installerRows = artifacts.filter((artifact) => artifact.path.startsWith("releases/itch/installers/"));
  if (!installerRows.length) return "- Installer hashes will be generated during packaging.";
  return installerRows
    .map((artifact) => `- \`${artifact.path}\` - SHA-256 \`${artifact.sha256}\`${artifact.signatureStatus !== "not-applicable" ? ` - Authenticode ${artifact.signatureStatus}` : ""}`)
    .join("\n");
}

function butlerPreviewCommand() {
  return `butler push-preview releases/itch/installers ${ITCH_SLUG}:${ITCH_CHANNEL}`;
}

function butlerPushCommand() {
  return `butler push releases/itch/installers ${ITCH_SLUG}:${ITCH_CHANNEL} --userversion ${VERSION}`;
}

function assertInstallerUploadContents(dir) {
  const files = walkFiles(dir);
  if (!files.some((path) => /setup\.exe$/i.test(basename(path)))) throw new Error("Installer upload folder is missing the setup EXE.");
  if (!files.some((path) => /\.msi$/i.test(basename(path)))) throw new Error("Installer upload folder is missing the MSI.");
  for (const file of files) {
    const rel = relative(dir, file).replace(/\\/g, "/").toLowerCase();
    if (basename(rel).toLowerCase() === "pocket daw.exe") {
      throw new Error("Standalone Pocket DAW.exe must not be packaged as a public portable app.");
    }
    if (/\.zip$/i.test(rel)) {
      throw new Error(`Public portable ZIPs are not part of the installed-app release: ${rel}`);
    }
    if (FORBIDDEN_PACKAGE_PARTS.some((part) => rel.includes(part))) {
      throw new Error(`Forbidden release package file detected: ${rel}`);
    }
    const contents = /\.(txt|md|json)$/i.test(file) ? readFileSync(file, "utf8") : "";
    if (/C:\\Users\\|\/Users\/|\\Documents\\/i.test(contents)) {
      throw new Error(`Release text file contains a local machine path: ${rel}`);
    }
  }
}

function run(command, args) {
  const executable = process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
  console.log(`\n> ${executable} ${args.join(" ")}`);
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(executable, args)], { cwd: ROOT, stdio: "inherit", shell: false })
    : spawnSync(executable, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function runDirect(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function commandOutput(command, args) {
  const executable = process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(executable, args)], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        shell: false
      })
    : spawnSync(executable, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: false });
  if (result.error || result.status !== 0) return "";
  return result.stdout.trim();
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function scrubLocalPaths(value) {
  return String(value)
    .replace(/[A-Z]:\\Users\\[^"]+/gi, "[local path]")
    .replace(/\/Users\/[^\s"]+/gi, "[local path]");
}

if (process.argv[1] && process.argv[1].endsWith("package-itch.mjs")) {
  const result = await packageItchRelease();
  console.log(`Wrote ${result.installerDir}`);
  console.log(`Wrote ${result.manifestPath}`);
  console.log(`Wrote ${result.checksumPath}`);
  console.log(`Wrote ${result.verdictPath}`);
}
