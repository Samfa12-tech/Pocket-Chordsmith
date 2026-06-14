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
import { verifyWindowsSignature } from "./verify-windows-signature.mjs";

export const ITCH_CHANNEL = "windows-installer";
export const ITCH_SLUG = "samfa12/pocket-daw";
export const RELEASE_TITLE = "Pocket DAW v0.5.10 - Direct Pocket Chordsmith Handoff Fix";
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
  if (buildNative) run("npm", ["run", "tauri:build"]);

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
  const copied = [];
  for (const source of candidates) {
    const target = join(INSTALLERS_DIR, basename(source));
    copyFileSync(source, target);
    copied.push(target);
  }
  return copied;
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
  const hiddenPushCommand = butlerHiddenPushCommand();
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
    "RELEASE_NOTES.md": `# Pocket DAW v${VERSION} - Direct Pocket Chordsmith Handoff Fix

Pocket DAW is a free Windows alpha for arranging, editing and exporting Pocket Chordsmith projects. It is distributed as an installed Windows app only.

## Installer Artifacts

${artifactTable}

## Highlights

- Pocket Chordsmith Send to Pocket DAW deep links are now forwarded into the running installed app when Windows reuses an existing Pocket DAW process.
- About/Diagnostics now reports the last handoff source and result so testers can tell whether Windows delivered the protocol URL.
- Timeline workspace can now be resized by dragging the splitter below the timeline, pushing mixer/channel controls lower.
- Inspector can be hidden from the timeline toolbar to give the arrangement full width.
- Inspector width can be resized by dragging the vertical splitter.
- Generated section clips now have a cyan drag rail for snap-aware horizontal moves.
- Generated section clips now have a green right rail for GarageBand-style repeat/extend dragging.
- Timeline zoom supports the visible controls plus Ctrl/Meta + mouse wheel and touch/pinch gestures.
- Installed/native shells reserve top spacing so the File/Edit/View/Track/Transport/Help menu remains visible under the Windows titlebar.
- Timeline inline sequencer boxes now start exactly at the section/bar edge with no label-column offset.
- Inline drum, bass, melody and guitar grids use the song time signature and resolution for the exact number of boxes per bar.
- Lane text moved into the sticky track header area so labels no longer push step boxes off the beat grid.
- Added direct timeline song settings for BPM, key, scale, time signature and sequencer resolution.
- Added a direct Add Section control that appends real Pocket Chordsmith section clips and markers.
- Default timeline zoom now opens much closer at 240 px/bar, with fluid zoom controls still available.
- Timeline markers remain anchored to exact vertical rails at their bar positions, matching the Pocket Chordsmith-style grid alignment.
- Release manifest and SHA-256 checksums are generated from actual installer artifacts.
- Untrusted .pocketdaw/JSON rendering is hardened for names, IDs, data attributes and colors.
- Browser/dev and native import paths now reject oversized project, MIDI and audio files with friendly errors.
- Persisted native cache metadata can hydrate valid project-cache/native-audio WAV files when source hashes still match.

## Signing

Windows Authenticode signing is not claimed unless the release manifest reports signed installers. Unsigned Windows installers may trigger SmartScreen warnings. Tauri updater .sig files are separate updater-validation signatures and do not replace Authenticode signing.

## Butler

Preview:
\`${previewCommand}\`

Hidden push:
\`${hiddenPushCommand}\`
`,
    "KNOWN_LIMITATIONS.md": limitationsMarkdown(limitations),
    "LICENSE_OR_FREEWARE_NOTICE.txt": `Pocket DAW is free to download and use.

Copyright remains with the author.
Redistribution or modification of the app/source is not granted unless separately licensed.
No warranty is provided.
`,
    "WINDOWS_SMOKE_CHECKLIST.md": smokeChecklist,
    "ITCH_PAGE_COPY.md": itchPageCopy(previewCommand, hiddenPushCommand, limitations, artifactTable)
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
    "No live recording yet; live vocal/instrument tracks are guarded placeholders.",
    "No ASIO backend yet; native audio currently targets WASAPI/CPAL.",
    "Imported audio decode/streaming is still limited and large files are rejected before whole-file reads.",
    "Full send/return processing and advanced pro DAW features are future work.",
    "Game/Godot/web exports are manifest previews unless full asset-pack assembly is implemented later.",
    "Stem export is sequential and not yet a single bundled stem ZIP.",
    "Native cache hydration reads valid project-cache/native-audio WAV entries when source hashes match; stale, invalid or partial generated-stem cache groups are skipped.",
    "Automation is limited to first-pass track volume and pan lanes.",
    "Pocket DAW is not claimed to be a professional DAW replacement."
  ];
}

function limitationsMarkdown(limitations) {
  return `# Known Limitations - Pocket DAW v${VERSION}

${limitations.map((item) => `- ${item}`).join("\n")}
`;
}

function itchPageCopy(previewCommand, hiddenPushCommand, limitations, artifactTable) {
  return `# Pocket DAW

Free Windows alpha for arranging, editing and exporting Pocket Chordsmith projects.

Pocket DAW is installed-app only. It is not a professional DAW replacement yet.

## Installer Artifacts

${artifactTable}

## Short Description

Pocket DAW lets you import Pocket Chordsmith songs, arrange sections on a desktop timeline, play back generated parts, import audio/MIDI, and export WAV, MIDI, stem WAVs and manifest previews.

## Features

- Import PCS1 codes, raw Pocket Chordsmith JSON, PocketHandoff payloads and .pocketdaw projects.
- Arrange clips on a DAW-style timeline with markers, loop controls, split/trim/copy/paste/duplicate/delete.
- Edit Chordsmith drums, bass, melody, guitar, section bars and chords.
- Import audio and MIDI into a visible media pool.
- Export full WAV, MIDI, stem WAVs, section manifests, Godot manifest previews and web-game manifest previews.
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

Live recording, ASIO, full send/return processing, full bundled game export packs and advanced pro DAW features are future work unless a later release explicitly says otherwise.

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

First hidden installer upload:
\`${hiddenPushCommand}\`

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
    ["Chordsmith import", "Import PocketHandoff if supported by the public build.", "Handoff imports once and does not repeat after reload."],
    ["Chordsmith import", "Save, close, reopen, and inspect imported source data.", "Source Chordsmith data remains preserved after saving/reopening."],
    ["Project workflow", "Create/open a project, save a .pocketdaw file, close app, reopen app, reopen saved .pocketdaw.", "Timeline and imported source data remain intact."],
    ["Editing", "Move/trim/split/duplicate/delete a basic timeline clip.", "Clip edits apply to the selected clip only and survive save/reopen."],
    ["Editing", "Edit a generated section and repeat several inspector edits.", "Generated-section edits are audible and inspector does not jump unexpectedly."],
    ["Editing", "Edit drum sequencer steps while playing or after playback.", "Drum edits produce audible changes."],
    ["Editing", "Change one track/section, then inspect demo and unrelated sections.", "Unrelated demo/sections do not mutate unexpectedly."],
    ["Mixer/audio state", "Adjust track volume, mute, solo if present, and pan.", "Audio/state changes match the control without corrupting other tracks."],
    ["Mixer/audio state", "Adjust FX controls, routing/bus controls and automation if exposed.", "Controls persist, export safely, and guarded scaffolds stay honest where incomplete."],
    ["Import/export", "Import an audio clip if exposed and place it on the timeline.", "Media appears with clear embedded/collected/referenced/cached/missing state; audible if loaded."],
    ["Import/export", "Import MIDI if exposed.", "MIDI item/clip appears and is readable/editable."],
    ["Import/export", "Export WAV and open the file in a player.", "WAV file is created and playable."],
    ["Import/export", "Export MIDI and open it in a MIDI-capable tool.", "MIDI file is created and readable."],
    ["Import/export", "Export stems if exposed.", "Stem files are created and playable/readable."],
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
      hiddenPush: butlerHiddenPushCommand()
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

Hidden installer upload:
\`${butlerHiddenPushCommand()}\`

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

function butlerHiddenPushCommand() {
  return `butler push releases/itch/installers ${ITCH_SLUG}:${ITCH_CHANNEL} --userversion ${VERSION} --hidden`;
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
