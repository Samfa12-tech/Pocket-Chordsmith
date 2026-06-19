import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };
import { ITCH_CHANNEL, ITCH_SLUG, packageItchRelease } from "./package-itch.mjs";
import { makeUpdaterManifest } from "./make-updater-manifest.mjs";

const ROOT = process.cwd();
const VERSION = packageJson.version;
const REPO = "Samfa12-tech/Pocket-Chordsmith";
const RELEASE_TAG = `pocket-daw-v${VERSION}`;
const GITHUB_RELEASE_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}`;
const LATEST_MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/pocket-daw-latest.json`;
const RELEASES_DIR = join(ROOT, "releases", "itch");
const INSTALLERS_DIR = join(RELEASES_DIR, "installers");
const UPDATER_DIR = join(ROOT, "releases", "updater");

const options = parseArgs(process.argv.slice(2));

if (options.fast && options.full) fail("Use either --fast or --full, not both.");
if (options.fast && options.publish) fail("--fast --publish is blocked. Publish builds must rebuild installers in the same run.");
if (options.publish && process.env.PUBLISH !== "1") {
  fail("Refusing to publish. Set PUBLISH=1 only after deciding this version should go public.");
}

if (options.full) {
  run("npm", ["run", "verify:versions"]);
  run("npm", ["run", "verify:native-sound-recipes"]);
  run("npm", ["test"]);
  run("cargo", ["test"], { cwd: join(ROOT, "src-tauri") });
} else {
  run("npm", ["run", "verify:versions"]);
  run("npm", ["run", "verify:native-sound-recipes"]);
}

await packageItchRelease({ buildNative: !options.fast });
run("npm", ["run", "verify:artifacts"]);
const staged = stageUpdaterFiles();
const updaterManifest = makeUpdaterManifest({
  artifact: staged.setupExe,
  signature: staged.setupSig,
  url: `${GITHUB_RELEASE_URL}/${basename(staged.setupExe)}`,
  notes: staged.releaseNotes
});

console.log(`Staged updater manifest: ${updaterManifest.out}`);
console.log(`Staged updater setup: ${staged.setupExe}`);
console.log(`Setup SHA-256: ${sha256File(staged.setupExe)}`);

if (options.publish) {
  assertGithubReleaseMissing();
  run("butler", [
    "push",
    "releases/itch/installers",
    `${ITCH_SLUG}:${ITCH_CHANNEL}`,
    "--userversion",
    VERSION
  ]);
  createGithubRelease(staged);
  await verifyPublishedRelease(staged);
}

console.log(options.publish
  ? `Pocket DAW ${VERSION} updater package was staged and published.`
  : `Pocket DAW ${VERSION} updater package was staged locally. Add --publish with PUBLISH=1 only for an intentional public release.`);

function stageUpdaterFiles() {
  mkdirSync(UPDATER_DIR, { recursive: true });
  const setupSource = requiredInstaller(/setup\.exe$/i, "setup EXE");
  const setupSigSource = requiredFile(`${setupSource}.sig`, "setup EXE updater signature");
  const msiSource = requiredInstaller(/\.msi$/i, "MSI");
  const msiSigSource = requiredFile(`${msiSource}.sig`, "MSI updater signature");
  const releaseNotesSource = requiredFile(join(RELEASES_DIR, `RELEASE_NOTES_v${VERSION}.md`), "release notes");
  const checksumsSource = requiredFile(join(RELEASES_DIR, `CHECKSUMS_SHA256_v${VERSION}.txt`), "release checksums");
  const verdictSource = requiredFile(join(RELEASES_DIR, `FINAL_RELEASE_VERDICT_v${VERSION}.md`), "final release verdict");
  const manifestSource = requiredFile(join(RELEASES_DIR, `pocket-daw-release-manifest-v${VERSION}.json`), "release manifest");

  const setupExe = join(UPDATER_DIR, `Pocket.DAW_${VERSION}_x64-setup.exe`);
  const setupSig = `${setupExe}.sig`;
  const msi = join(UPDATER_DIR, `Pocket.DAW_${VERSION}_x64_en-US.msi`);
  const msiSig = `${msi}.sig`;
  const releaseNotes = join(UPDATER_DIR, `RELEASE_NOTES_v${VERSION}.md`);
  const checksums = join(UPDATER_DIR, `CHECKSUMS_SHA256_v${VERSION}.txt`);
  const verdict = join(UPDATER_DIR, `FINAL_RELEASE_VERDICT_v${VERSION}.md`);
  const manifest = join(UPDATER_DIR, `pocket-daw-release-manifest-v${VERSION}.json`);

  [
    setupExe,
    setupSig,
    msi,
    msiSig,
    releaseNotes,
    checksums,
    verdict,
    manifest
  ].forEach((path) => rmSync(path, { force: true }));

  copyFileSync(setupSource, setupExe);
  copyFileSync(setupSigSource, setupSig);
  copyFileSync(msiSource, msi);
  copyFileSync(msiSigSource, msiSig);
  copyFileSync(releaseNotesSource, releaseNotes);
  copyFileSync(checksumsSource, checksums);
  copyFileSync(verdictSource, verdict);
  copyFileSync(manifestSource, manifest);

  return {
    setupExe,
    setupSig,
    msi,
    msiSig,
    releaseNotes,
    checksums,
    verdict,
    manifest
  };
}

function requiredInstaller(pattern, label) {
  const entries = [
    join(INSTALLERS_DIR, `Pocket DAW_${VERSION}_x64-setup.exe`),
    join(INSTALLERS_DIR, `Pocket DAW_${VERSION}_x64_en-US.msi`)
  ];
  const match = entries.find((path) => pattern.test(basename(path)) && existsSync(path));
  if (!match) fail(`Missing ${label} in ${INSTALLERS_DIR}. Run this script without --fast to rebuild installers.`);
  return match;
}

function requiredFile(path, label) {
  if (!existsSync(path)) fail(`Missing ${label}: ${path}`);
  return path;
}

function createGithubRelease(staged) {
  run("gh", [
    "release",
    "create",
    RELEASE_TAG,
    staged.setupExe,
    staged.setupSig,
    staged.msi,
    staged.msiSig,
    join(UPDATER_DIR, "pocket-daw-latest.json"),
    join(UPDATER_DIR, "SHA256SUMS.txt"),
    staged.checksums,
    staged.manifest,
    staged.verdict,
    "--repo",
    REPO,
    "--title",
    `Pocket DAW v${VERSION}`,
    "--notes-file",
    staged.releaseNotes,
    "--latest"
  ]);
}

async function verifyPublishedRelease(staged) {
  run("gh", ["release", "view", RELEASE_TAG, "--repo", REPO, "--json", "tagName,url,publishedAt,assets"]);
  run("butler", ["status", `${ITCH_SLUG}:${ITCH_CHANNEL}`]);

  const manifestResponse = await fetch(LATEST_MANIFEST_URL);
  if (!manifestResponse.ok) fail(`Updater manifest fetch failed: ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (manifest.version !== VERSION) fail(`Live updater manifest version ${manifest.version} did not match ${VERSION}.`);
  const platform = manifest.platforms?.["windows-x86_64"];
  if (!platform?.url?.includes(`${RELEASE_TAG}/Pocket.DAW_${VERSION}_x64-setup.exe`)) {
    fail(`Live updater manifest URL does not point at ${RELEASE_TAG}: ${platform?.url || "[missing]"}`);
  }

  const expectedHash = sha256File(staged.setupExe);
  const actualHash = await sha256Url(platform.url);
  if (actualHash !== expectedHash) fail(`Remote setup hash mismatch: expected ${expectedHash}, got ${actualHash}`);
  console.log(`Remote setup SHA-256 verified: ${actualHash}`);
}

function assertGithubReleaseMissing() {
  const result = spawn("gh", ["release", "view", RELEASE_TAG, "--repo", REPO], { quiet: true });
  if (result.status === 0) {
    fail(`GitHub release ${RELEASE_TAG} already exists. Bump the DAW version or delete the draft/release deliberately before publishing.`);
  }
}

function run(command, args, options = {}) {
  const result = spawn(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function spawn(command, args, options = {}) {
  const executable = process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
  const cwd = options.cwd || ROOT;
  if (!options.quiet) console.log(`\n> ${executable} ${args.join(" ")}`);
  return process.platform === "win32" && ["npm", "npx"].includes(command)
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(executable, args)], {
        cwd,
        stdio: options.quiet ? "ignore" : "inherit",
        shell: false
      })
    : spawnSync(executable, args, {
        cwd,
        stdio: options.quiet ? "ignore" : "inherit",
        shell: false
      });
}

function parseArgs(argv) {
  return {
    full: argv.includes("--full"),
    fast: argv.includes("--fast"),
    publish: argv.includes("--publish")
  };
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function sha256Url(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`Remote setup download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
