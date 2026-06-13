import AdmZip from "adm-zip";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { hashArtifacts, relativeArtifactPath, sha256File, walkFiles, writeChecksumFile } from "./hash-release-artifacts.mjs";
import { verifyWindowsSignature } from "./verify-windows-signature.mjs";

export const ITCH_CHANNEL = "windows-x64";
export const ITCH_SLUG = "samfa12/pocket-daw";
export const RELEASE_TITLE = "Pocket DAW v0.5.9 - Resizable Timeline Workspace Test";
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
const PORTABLE_NAME = `pocket-daw-windows-x64-v${VERSION}`;
const PORTABLE_DIR = join(RELEASES_DIR, PORTABLE_NAME);
const ZIP_PATH = join(RELEASES_DIR, `${PORTABLE_NAME}.zip`);
const INSTALLERS_DIR = join(RELEASES_DIR, "installers");
const EXE_SOURCE = join(ROOT, "src-tauri", "target", "release", "pocket-daw.exe");
const EXE_TARGET = join(PORTABLE_DIR, "Pocket DAW.exe");

export async function packageItchRelease({ buildNative = process.env.POCKET_DAW_SKIP_NATIVE_BUILD !== "1" } = {}) {
  if (buildNative) run("npm", ["run", "tauri:build"]);
  if (!existsSync(EXE_SOURCE)) {
    throw new Error("Native release executable was not found. Run npm run tauri:build first.");
  }

  rmSync(PORTABLE_DIR, { recursive: true, force: true });
  mkdirSync(PORTABLE_DIR, { recursive: true });
  mkdirSync(INSTALLERS_DIR, { recursive: true });
  copyFileSync(EXE_SOURCE, EXE_TARGET);

  const releaseDocs = releaseTextFiles();
  for (const [name, contents] of Object.entries(releaseDocs.portable)) {
    writeFileSync(join(PORTABLE_DIR, name), contents);
  }
  writeFileSync(join(RELEASES_DIR, `README_FIRST_v${VERSION}.txt`), releaseDocs.portable["README_FIRST.txt"]);
  writeFileSync(join(RELEASES_DIR, `RELEASE_NOTES_v${VERSION}.md`), releaseDocs.portable["RELEASE_NOTES.md"]);
  writeFileSync(join(RELEASES_DIR, `KNOWN_LIMITATIONS_v${VERSION}.md`), releaseDocs.portable["KNOWN_LIMITATIONS.md"]);
  writeFileSync(join(RELEASES_DIR, `WINDOWS_SMOKE_CHECKLIST_v${VERSION}.md`), releaseDocs.portable["WINDOWS_SMOKE_CHECKLIST.md"]);
  writeFileSync(join(RELEASES_DIR, `LICENSE_OR_FREEWARE_NOTICE_v${VERSION}.txt`), releaseDocs.portable["LICENSE_OR_FREEWARE_NOTICE.txt"]);
  writeFileSync(join(RELEASES_DIR, `ITCH_PAGE_COPY_v${VERSION}.md`), releaseDocs.itchPageCopy);

  const folderChecksumArtifacts = await hashArtifacts(ROOT, walkFiles(PORTABLE_DIR).filter((path) => basename(path) !== "CHECKSUMS_SHA256.txt"));
  writeChecksumFile(join(PORTABLE_DIR, "CHECKSUMS_SHA256.txt"), folderChecksumArtifacts);

  const installerCopies = copyInstallerArtifacts();
  assertPortablePackageContents(PORTABLE_DIR);

  rmSync(ZIP_PATH, { force: true });
  const zip = new AdmZip();
  zip.addLocalFolder(PORTABLE_DIR);
  zip.writeZip(ZIP_PATH);
  assertZipIsPortable(ZIP_PATH);

  const signatureTargets = [EXE_TARGET, ...installerCopies.filter((path) => /\.(exe|msi)$/i.test(path))];
  const signatureByPath = new Map(signatureTargets.map((path) => [relativeArtifactPath(ROOT, path), verifyWindowsSignature(path)]));

  const rootArtifacts = [
    EXE_TARGET,
    ZIP_PATH,
    ...installerCopies,
    join(RELEASES_DIR, `README_FIRST_v${VERSION}.txt`),
    join(RELEASES_DIR, `RELEASE_NOTES_v${VERSION}.md`),
    join(RELEASES_DIR, `KNOWN_LIMITATIONS_v${VERSION}.md`),
    join(RELEASES_DIR, `ITCH_PAGE_COPY_v${VERSION}.md`),
    join(RELEASES_DIR, `WINDOWS_SMOKE_CHECKLIST_v${VERSION}.md`),
    join(RELEASES_DIR, `LICENSE_OR_FREEWARE_NOTICE_v${VERSION}.txt`)
  ];
  const artifactHashes = await hashArtifacts(ROOT, rootArtifacts);
  const artifacts = artifactHashes.map((artifact) => ({
    ...artifact,
    signatureStatus: signatureByPath.get(artifact.path)?.status || "not-applicable",
    signatureDetail: signatureByPath.get(artifact.path)?.detail || ""
  }));

  const manifestPath = join(RELEASES_DIR, `pocket-daw-release-manifest-v${VERSION}.json`);
  const manifest = await releaseManifest(artifacts);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const checksummed = await hashArtifacts(ROOT, [...rootArtifacts, manifestPath]);
  const checksumPath = join(RELEASES_DIR, `CHECKSUMS_SHA256_v${VERSION}.txt`);
  writeChecksumFile(checksumPath, checksummed);
  const finalArtifacts = await hashArtifacts(ROOT, [...rootArtifacts, manifestPath, checksumPath]);
  const verdictPath = join(RELEASES_DIR, `FINAL_RELEASE_VERDICT_v${VERSION}.md`);
  writeFileSync(verdictPath, finalVerdict(finalArtifacts, artifacts));

  return {
    version: VERSION,
    portableDir: PORTABLE_DIR,
    zipPath: ZIP_PATH,
    manifestPath,
    checksumPath,
    verdictPath,
    artifacts: finalArtifacts
  };
}

function copyInstallerArtifacts() {
  rmSync(INSTALLERS_DIR, { recursive: true, force: true });
  mkdirSync(INSTALLERS_DIR, { recursive: true });
  const bundleRoot = join(ROOT, "src-tauri", "target", "release", "bundle");
  if (!existsSync(bundleRoot)) return [];
  const candidates = walkFiles(bundleRoot).filter((path) => {
    const fileName = basename(path);
    return /\.(exe|msi|sig)$/i.test(fileName) && fileName.includes(`_${VERSION}_`);
  });
  const copied = [];
  for (const source of candidates) {
    const target = join(INSTALLERS_DIR, basename(source));
    copyFileSync(source, target);
    copied.push(target);
  }
  return copied;
}

function releaseTextFiles() {
  const previewCommand = butlerPreviewCommand();
  const hiddenPushCommand = butlerHiddenPushCommand();
  const installerCommand = `butler push releases/itch/installers/<installer-file-or-folder> ${ITCH_SLUG}:windows-installer --userversion ${VERSION} --hidden`;
  const limitations = knownLimitations();
  const smokeChecklist = windowsSmokeChecklist();
  return {
    portable: {
      "README_FIRST.txt": `Pocket DAW v${VERSION}

This is the free Windows desktop alpha-testing release for itch.io.

Install:
1. Extract this ZIP to a normal user folder.
2. Run Pocket DAW.exe.
3. If Windows SmartScreen appears on this unsigned build, only run it if you trust the download and verified the SHA-256 checksum.

This portable ZIP is the primary itch upload. Installers, when included, are optional secondary downloads.
Older Windows systems may require Microsoft Edge WebView2 Runtime.

Checksums are in CHECKSUMS_SHA256.txt. Manual Windows smoke testing status: NOT RUN in the generated checklist until a tester completes it against this exact artifact.
`,
      "RELEASE_NOTES.md": `# Pocket DAW v${VERSION} - Resizable Timeline Workspace Test

Pocket DAW is a free Windows desktop arrangement and production app for Pocket Chordsmith projects.

## Highlights

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
- Portable Windows ZIP prepared as the primary itch artifact.
- Optional NSIS/MSI installer artifacts are staged separately when Tauri builds them.
- Release manifest and SHA-256 checksums are generated from actual files.
- Untrusted .pocketdaw/JSON rendering is hardened for names, IDs, data attributes and colors.
- Browser/dev and native import paths now reject oversized project, MIDI and audio files with friendly errors.
- Persisted native cache metadata can hydrate valid project-cache/native-audio WAV files when source hashes still match.

## Signing

This build is unsigned unless FINAL_RELEASE_VERDICT and the manifest say otherwise. Unsigned Windows apps may trigger SmartScreen warnings.

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
      "CHECKSUMS_SHA256.txt": ""
    },
    itchPageCopy: itchPageCopy(previewCommand, hiddenPushCommand, installerCommand, limitations)
  };
}

function knownLimitations() {
  return [
    "No live recording yet; live vocal/instrument tracks are guarded placeholders.",
    "No ASIO backend yet; native audio currently targets WASAPI/CPAL.",
    "Imported audio decode/streaming is still limited and large files are rejected before whole-file reads.",
    "Game/Godot/web exports are manifest previews unless full asset-pack assembly is implemented later.",
    "Stem export is sequential and not yet a single bundled stem ZIP.",
    "Native cache hydration reads valid project-cache/native-audio WAV entries when source hashes match; stale, invalid or partial generated-stem cache groups are skipped.",
    "Automation is limited to first-pass track volume and pan lanes.",
    "Send/return processing is scaffolded and guarded rather than complete.",
    "Pocket DAW is not claimed to be a professional DAW replacement."
  ];
}

function limitationsMarkdown(limitations) {
  return `# Known Limitations - Pocket DAW v${VERSION}

${limitations.map((item) => `- ${item}`).join("\n")}
`;
}

function itchPageCopy(previewCommand, hiddenPushCommand, installerCommand, limitations) {
  return `# Pocket DAW

Free Windows desktop arrangement and production app for Pocket Chordsmith projects.

## Short Description

Pocket DAW lets you import Pocket Chordsmith songs, arrange sections on a desktop timeline, play back generated parts, import audio/MIDI, and export WAV, MIDI, stem WAVs and manifest previews.

## Features

- Import PCS1 codes, raw Pocket Chordsmith JSON, PocketHandoff payloads and .pocketdaw projects.
- Arrange clips on a DAW-style timeline with markers, loop controls, split/trim/copy/paste/duplicate/delete.
- Edit Chordsmith drums, bass, melody, guitar, section bars and chords.
- Import audio and MIDI into a visible media pool.
- Export full WAV, MIDI, stem WAVs, section manifests, Godot manifest previews and web-game manifest previews.
- Native Windows/Tauri shell with native audio playback and project file dialogs.

## How To Install

1. Download the Windows ZIP.
2. Extract the ZIP.
3. Run \`Pocket DAW.exe\`.
4. If Windows SmartScreen appears on an unsigned build, only run it if you trust the download and verified the checksum.

## How To Use

1. Import a Pocket Chordsmith PCS1 code or JSON.
2. Arrange sections on the timeline.
3. Press Play.
4. Edit sections and mixer controls.
5. Import audio or MIDI as needed.
6. Export WAV, MIDI, stems or manifest previews.

## Best For

Pocket Chordsmith users, song sketching, adaptive/game-audio planning, MIDI/WAV export prep and lightweight Windows desktop arrangement.

## Known Limitations

${limitations.map((item) => `- ${item}`).join("\n")}

## Feedback Request

Please report launch issues, import/export bugs, audio-device problems, project files that fail to open, and any difference between expected and actual smoke-checklist results.

## Credits

Pocket DAW by Samfa12 / Pocket Chordsmith.

## Suggested Itch Settings

- Pricing: Free, or Name Your Own Price with $0 minimum if preferred.
- Classification/category: Tool.
- Platform: Windows.
- Release status: Alpha testing unless manual QA justifies stronger wording.
- Tags: music, daw, midi, songwriting, music-production, game-audio, windows, tauri, tool.
- AI disclosure: TODO - creator must fill this honestly before publishing.
- Do not set the itch page to HTML unless intentionally uploading a separate browser preview build.

## Butler Commands

Preview:
\`${previewCommand}\`

First hidden upload:
\`${hiddenPushCommand}\`

Optional installer secondary channel:
\`${installerCommand}\`

Adjust \`${ITCH_SLUG}\` if the itch slug is different. Prefer pushing the portable folder with butler; the ZIP is for manual browser upload/download archives.
`;
}

function windowsSmokeChecklist() {
  const checks = [
    ["Clean Windows machine or clean Windows user profile.", "Tester starts from a clean profile or records installed-state caveats."],
    ["Download/extract the exact portable ZIP.", "ZIP extracts successfully."],
    ["Verify SHA-256 against CHECKSUMS_SHA256.txt.", "Hash matches."],
    ["Run Pocket DAW.exe.", "App launches."],
    ["Confirm app opens without installer.", "Portable EXE runs from extracted folder."],
    ["Confirm version shown in UI is correct.", `Transport shows v${VERSION}.`],
    ["Load demo project.", "Demo opens."],
    ["Press Play.", "Transport starts."],
    ["Confirm playback audible.", "Generated playback is audible."],
    ["Confirm diagnostics show expected native/backend status.", "Diagnostics are honest for native/browser fallback."],
    ["Paste valid PCS1 code.", "Project imports."],
    ["Import raw Pocket Chordsmith JSON.", "Project imports."],
    ["Test PocketHandoff import if applicable.", "Handoff imports once and clears."],
    ["Open .pocketdaw.", "Project opens."],
    ["Save .pocketdaw.", "Project saves."],
    ["Save As .pocketdaw.", "Project saves to new path."],
    ["Reopen saved project.", "Saved state persists."],
    ["Import audio file.", "Media item appears or friendly error shows."],
    ["Place audio on timeline.", "Audio clip appears."],
    ["Import MIDI file.", "MIDI media and clip appear."],
    ["Edit MIDI note.", "Note edit persists."],
    ["Export WAV.", "WAV is produced."],
    ["Export MIDI.", "MIDI is produced."],
    ["Export stems.", "Stem WAVs are produced sequentially."],
    ["Export section/Godot/web manifest previews.", "JSON manifests are produced with honest warnings."],
    ["Build Native Cache on saved project.", "project-cache/native-audio WAV files and renderCache metadata are written."],
    ["Close app.", "App exits cleanly."],
    ["Reopen project.", "Project opens."],
    ["Confirm cache hydration or documented fallback behaviour.", "Hydration counts are shown or fallback limitation is clear."],
    ["Move clip.", "Clip moves."],
    ["Duplicate clip.", "Duplicate appears."],
    ["Copy/paste clip.", "Pasted clip appears."],
    ["Split clip.", "Clip splits at playhead."],
    ["Trim clip.", "Clip trim updates."],
    ["Delete clip.", "Clip is removed."],
    ["Loop selected.", "Loop region matches selected clip."],
    ["Clear loop.", "Loop disabled/cleared."],
    ["Add/rename/delete marker.", "Marker operations work."],
    ["Drums step edit.", "Drum step changes and inspector does not jump."],
    ["Bass edit.", "Bass step changes."],
    ["Melody edit.", "Melody step changes."],
    ["Guitar edit.", "Guitar step changes."],
    ["Section bars.", "Section length updates."],
    ["Chord change.", "Chord change updates."],
    ["Confirm inspector scroll does not jump.", "Scroll position is stable."],
    ["Mixer mute.", "Mute changes audio/state."],
    ["Mixer solo.", "Solo changes audio/state."],
    ["Mixer volume.", "Volume changes audio/state."],
    ["Mixer pan.", "Pan changes audio/state."],
    ["Bus route.", "Routing updates without cycle."],
    ["Automation point add/edit/delete.", "Automation lane updates."],
    ["FX add/remove and export.", "FX changes persist/export."],
    ["Audio Settings device probe.", "Devices or honest error shown."],
    ["Large-file friendly error with oversized audio or MIDI.", "Friendly size-limit error shown."],
    ["Malicious .pocketdaw fixture does not execute/render unsafe HTML.", "No script/event/CSS injection appears."],
    ["Confirm no local dev URLs, debug windows, or console spam in normal usage.", "Normal user experience is clean."],
    ["Confirm app exits/restarts cleanly.", "Restart succeeds."]
  ];
  return `# Windows Smoke Checklist - Pocket DAW v${VERSION}

Manual smoke status: NOT RUN

| Check | Expected result | Actual result | Pass/Fail/Not Run | Notes | Tester | Date | Artifact hash tested |
| --- | --- | --- | --- | --- | --- | --- | --- |
${checks.map(([check, expected]) => `| ${check} | ${expected} |  | Not Run |  |  |  |`).join("\n")}
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
    artifacts,
    windowsSmokeTest: { status: "NOT RUN", run: false },
    manualItchUpload: { status: "NOT RUN", run: false },
    portableZip: {
      path: relativeArtifactPath(ROOT, ZIP_PATH),
      portable: true,
      notJustInstaller: true
    },
    installersIncluded: artifacts.some((artifact) => artifact.path.startsWith("releases/itch/installers/")),
    signingRequired: process.env.POCKET_DAW_REQUIRE_SIGNING === "1",
    knownLimitations: knownLimitations(),
    butlerCommands: {
      preview: butlerPreviewCommand(),
      hiddenPush: butlerHiddenPushCommand(),
      installerHiddenPush: `butler push releases/itch/installers/<installer-file-or-folder> ${ITCH_SLUG}:windows-installer --userversion ${VERSION} --hidden`
    }
  };
}

function finalVerdict(finalArtifacts, signatureArtifacts) {
  const zip = finalArtifacts.find((artifact) => artifact.path === `releases/itch/${PORTABLE_NAME}.zip`);
  const exe = finalArtifacts.find((artifact) => artifact.path === `releases/itch/${PORTABLE_NAME}/Pocket DAW.exe`);
  const signatures = signatureArtifacts.filter((artifact) => artifact.signatureStatus !== "not-applicable");
  const unsigned = signatures.filter((artifact) => artifact.signatureStatus !== "signed");
  return `# Final Release Verdict - Pocket DAW v${VERSION}

GO WITH CAVEATS - ready only if caveats are acceptable

## Evidence

- Version: ${VERSION}
- Commit SHA: ${commandOutput("git", ["rev-parse", "HEAD"])}
- Portable ZIP: ${zip?.path || "missing"}
- Portable ZIP SHA-256: ${zip?.sha256 || "missing"}
- Portable EXE: ${exe?.path || "missing"}
- Portable EXE SHA-256: ${exe?.sha256 || "missing"}
- ZIP is portable: YES, folder contains Pocket DAW.exe and release docs.
- ZIP is not just an installer: YES.
- Installers included: ${signatureArtifacts.some((artifact) => artifact.path.startsWith("releases/itch/installers/")) ? "YES, optional secondary artifacts staged under releases/itch/installers/" : "NO"}
- Signature status: ${unsigned.length ? unsigned.map((artifact) => `${artifact.path}: ${artifact.signatureStatus}`).join("; ") : "signed"}
- Windows smoke test status: NOT RUN.
- Manual itch upload status: NOT RUN.
- Release wording: free Windows desktop alpha-testing tooling. Use stronger wording only if the manual smoke checklist passes.

## Key Known Limitations

${knownLimitations().map((item) => `- ${item}`).join("\n")}

## Unsupported Or Not Run

- Full manual Windows smoke checklist has not been completed against this artifact.
- Authenticode signing is unavailable unless the manifest marks files as signed.
- No itch upload was run by this script.

## Butler Commands

Preview:
\`${butlerPreviewCommand()}\`

Hidden push:
\`${butlerHiddenPushCommand()}\`

Manual browser upload:
Upload \`${relativeArtifactPath(ROOT, ZIP_PATH)}\` as the primary Windows download. Upload installers from \`releases/itch/installers/\` only as optional secondary downloads.

Do not publish publicly until the manual Windows smoke checklist is filled in for the exact artifact hash above.
`;
}

function butlerPreviewCommand() {
  return `butler push-preview releases/itch/${PORTABLE_NAME} ${ITCH_SLUG}:${ITCH_CHANNEL}`;
}

function butlerHiddenPushCommand() {
  return `butler push releases/itch/${PORTABLE_NAME} ${ITCH_SLUG}:${ITCH_CHANNEL} --userversion ${VERSION} --hidden`;
}

function assertPortablePackageContents(dir) {
  const files = walkFiles(dir);
  if (!files.some((path) => basename(path).toLowerCase() === "pocket daw.exe")) {
    throw new Error("Portable package is missing Pocket DAW.exe.");
  }
  for (const file of files) {
    const rel = relative(dir, file).replace(/\\/g, "/").toLowerCase();
    if (FORBIDDEN_PACKAGE_PARTS.some((part) => rel.includes(part))) {
      throw new Error(`Forbidden release package file detected: ${rel}`);
    }
    const contents = /\.(txt|md|json)$/i.test(file) ? readFileSync(file, "utf8") : "";
    if (/C:\\Users\\|\/Users\/|\\Documents\\/i.test(contents)) {
      throw new Error(`Release text file contains a local machine path: ${rel}`);
    }
  }
}

function assertZipIsPortable(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory).map((entry) => entry.entryName);
  if (!entries.includes("Pocket DAW.exe")) throw new Error("Portable ZIP is missing Pocket DAW.exe at the root.");
  if (entries.length <= 2 && entries.every((entry) => /\.(exe|msi)$/i.test(entry))) {
    throw new Error("Portable ZIP appears to contain only installer binaries.");
  }
  for (const entry of entries) {
    const lower = entry.toLowerCase();
    if (FORBIDDEN_PACKAGE_PARTS.some((part) => lower.includes(part))) {
      throw new Error(`Forbidden ZIP entry detected: ${entry}`);
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

if (process.argv[1] && process.argv[1].endsWith("package-itch.mjs")) {
  const result = await packageItchRelease();
  console.log(`Wrote ${result.portableDir}`);
  console.log(`Wrote ${result.zipPath}`);
  console.log(`Wrote ${result.manifestPath}`);
  console.log(`Wrote ${result.checksumPath}`);
  console.log(`Wrote ${result.verdictPath}`);
}
