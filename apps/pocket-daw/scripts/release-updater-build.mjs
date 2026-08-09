import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };
import { packageItchRelease } from "./package-itch.mjs";
import { makeUpdaterManifest } from "./make-updater-manifest.mjs";
import { DEFAULT_BOOTSTRAPPER_MANIFEST, makeBootstrapperManifest } from "./make-bootstrapper-manifest.mjs";
import {
  SOURCE_GATE_IDS,
  createCandidateReceipt,
  receiptArtifactPath,
  verifyCandidateReceipt,
  verifyCandidateVerificationReport
} from "./release-candidate-receipt.mjs";
import { assertReleaseCandidateTruth } from "./verify-release-candidate-truth.mjs";

const ROOT = process.cwd();
const VERSION = packageJson.version;
const REPO = "Samfa12-tech/Pocket-Chordsmith";
const RELEASE_TAG = `pocket-daw-v${VERSION}`;
const GITHUB_RELEASE_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}`;
const LATEST_MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/pocket-daw-latest.json`;
const RELEASES_DIR = join(ROOT, "releases", "itch");
const INSTALLERS_DIR = join(RELEASES_DIR, "installers");
const UPDATER_DIR = join(ROOT, "releases", "updater");
const DEFAULT_RECEIPT = join(UPDATER_DIR, `pocket-daw-candidate-receipt-v${VERSION}.json`);
const POCKET_AUDIO_CORE_DIR = resolve(ROOT, "..", "..", "packages", "pocket-audio-core");

const options = parseArgs(process.argv.slice(2));

try {
  assertReleaseCandidateTruth(ROOT);
  if (options.publishExact) await publishExact(options);
  else await prepareCandidate(options);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

async function prepareCandidate(options) {
  if (options.fast) {
    throw new Error("release:update:fast is deprecated and intentionally does nothing. Use release:prepare once from a clean committed checkpoint.");
  }
  if (options.receipt !== DEFAULT_RECEIPT && options.receipt) {
    throw new Error("--receipt is only valid with --publish-exact; prepare writes the canonical versioned receipt.");
  }
  if (existsSync(DEFAULT_RECEIPT)) {
    throw new Error(`Immutable candidate receipt already exists: ${DEFAULT_RECEIPT}. Verify or publish that exact candidate; bump the version before preparing another package-producing checkpoint.`);
  }
  const commit = currentCommit();
  assertCleanTrackedWorktree();

  run("npm", ["run", "verify:versions"]);
  run("npm", ["run", "verify:native-sound-recipes"]);
  run("npm", ["run", "verify:ci-workflow"]);
  run("npm", ["run", "verify:family-parity"], { cwd: POCKET_AUDIO_CORE_DIR });
  run("npm", ["test"]);
  run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
  run("npm", ["run", "test:e2e"]);

  const packaged = await packageItchRelease({ buildNative: true });
  run("npm", ["run", "verify:artifacts"]);
  const staged = stageUpdaterFiles();
  makeUpdaterManifest({
    artifact: staged.setupExe,
    signature: staged.setupSig,
    url: `${GITHUB_RELEASE_URL}/${basename(staged.setupExe)}`,
    notes: staged.releaseNotes
  });
  makeBootstrapperManifest({
    artifact: staged.setupExe,
    url: `${GITHUB_RELEASE_URL}/${basename(staged.setupExe)}`,
    out: staged.bootstrapperManifest
  });

  const releaseManifest = JSON.parse(readFileSync(packaged.manifestPath, "utf8"));
  const receipt = createCandidateReceipt({
    root: ROOT,
    outPath: DEFAULT_RECEIPT,
    version: VERSION,
    commit,
    sourceGateIds: SOURCE_GATE_IDS,
    pluginHostSidecar: releaseManifest.pluginHostSidecar,
    artifacts: {
      ...staged,
      updaterManifest: join(UPDATER_DIR, "pocket-daw-latest.json"),
      bootstrapperManifest: staged.bootstrapperManifest,
      updaterChecksums: join(UPDATER_DIR, "SHA256SUMS.txt")
    }
  });
  const checked = verifyCandidateReceipt({ root: ROOT, receiptPath: DEFAULT_RECEIPT, expectedVersion: VERSION, expectedCommit: commit });
  if (!checked.ok) throw new Error(`Prepared candidate receipt failed verification:\n${checked.failures.join("\n")}`);

  console.log(`Pocket DAW ${VERSION} candidate prepared exactly once.`);
  console.log(`Candidate receipt: ${DEFAULT_RECEIPT}`);
  console.log(`Commit: ${receipt.commit}`);
  console.log(`Setup: ${staged.setupExe}`);
  console.log(`Setup SHA-256: ${receipt.artifacts.setupExe.sha256}`);
  console.log("No installed evidence or publication was performed.");
}

async function publishExact(options) {
  if (process.env.PUBLISH !== "1") throw new Error("Refusing to publish. Set PUBLISH=1 only after deciding this exact verified candidate should go public.");
  if (!options.receipt) throw new Error("--publish-exact requires --receipt <candidate-receipt.json>.");
  if (!options.verificationReport) throw new Error("--publish-exact requires --verification-report <candidate-verification.json>.");
  const commit = currentCommit();
  const checked = verifyCandidateReceipt({ root: ROOT, receiptPath: options.receipt, expectedVersion: VERSION, expectedCommit: commit });
  if (!checked.ok) throw new Error(`Candidate receipt verification failed:\n${checked.failures.join("\n")}`);
  const verified = verifyCandidateVerificationReport({
    receiptPath: checked.receiptPath,
    reportPath: resolve(options.verificationReport),
    receipt: checked.receipt
  });
  if (!verified.ok) throw new Error(`Candidate verification report failed:\n${verified.failures.join("\n")}`);
  assertGithubReleaseMissing();
  const staged = stagedFromReceipt(checked.receipt);
  createGithubRelease(staged, checked.receiptPath, checked.receipt.commit);
  await verifyPublishedRelease(staged);
  console.log(`Pocket DAW ${VERSION} exact frozen candidate was published without a build or restage.`);
}

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

  const staged = {
    setupExe: join(UPDATER_DIR, `Pocket.DAW_${VERSION}_x64-setup.exe`),
    setupSignature: join(UPDATER_DIR, `Pocket.DAW_${VERSION}_x64-setup.exe.sig`),
    msi: join(UPDATER_DIR, `Pocket.DAW_${VERSION}_x64_en-US.msi`),
    msiSignature: join(UPDATER_DIR, `Pocket.DAW_${VERSION}_x64_en-US.msi.sig`),
    releaseNotes: join(UPDATER_DIR, `RELEASE_NOTES_v${VERSION}.md`),
    releaseChecksums: join(UPDATER_DIR, `CHECKSUMS_SHA256_v${VERSION}.txt`),
    releaseVerdict: join(UPDATER_DIR, `FINAL_RELEASE_VERDICT_v${VERSION}.md`),
    releaseManifest: join(UPDATER_DIR, `pocket-daw-release-manifest-v${VERSION}.json`),
    bootstrapperManifest: join(UPDATER_DIR, DEFAULT_BOOTSTRAPPER_MANIFEST)
  };
  Object.values(staged).forEach((filePath) => rmSync(filePath, { force: true }));
  copyFileSync(setupSource, staged.setupExe);
  copyFileSync(setupSigSource, staged.setupSignature);
  copyFileSync(msiSource, staged.msi);
  copyFileSync(msiSigSource, staged.msiSignature);
  copyFileSync(releaseNotesSource, staged.releaseNotes);
  copyFileSync(checksumsSource, staged.releaseChecksums);
  copyFileSync(verdictSource, staged.releaseVerdict);
  copyFileSync(manifestSource, staged.releaseManifest);
  return { ...staged, setupSig: staged.setupSignature, msiSig: staged.msiSignature, checksums: staged.releaseChecksums, verdict: staged.releaseVerdict, manifest: staged.releaseManifest };
}

function stagedFromReceipt(receipt) {
  return {
    setupExe: receiptArtifactPath(ROOT, receipt, "setupExe"),
    setupSig: receiptArtifactPath(ROOT, receipt, "setupSignature"),
    msi: receiptArtifactPath(ROOT, receipt, "msi"),
    msiSig: receiptArtifactPath(ROOT, receipt, "msiSignature"),
    releaseNotes: receiptArtifactPath(ROOT, receipt, "releaseNotes"),
    checksums: receiptArtifactPath(ROOT, receipt, "releaseChecksums"),
    verdict: receiptArtifactPath(ROOT, receipt, "releaseVerdict"),
    manifest: receiptArtifactPath(ROOT, receipt, "releaseManifest"),
    updaterManifest: receiptArtifactPath(ROOT, receipt, "updaterManifest"),
    bootstrapperManifest: receiptArtifactPath(ROOT, receipt, "bootstrapperManifest"),
    updaterChecksums: receiptArtifactPath(ROOT, receipt, "updaterChecksums")
  };
}

function requiredInstaller(pattern, label) {
  const entries = [join(INSTALLERS_DIR, `Pocket DAW_${VERSION}_x64-setup.exe`), join(INSTALLERS_DIR, `Pocket DAW_${VERSION}_x64_en-US.msi`)];
  const match = entries.find((filePath) => pattern.test(basename(filePath)) && existsSync(filePath));
  if (!match) throw new Error(`Missing ${label} in ${INSTALLERS_DIR}. Run release:prepare to build one fresh candidate.`);
  return match;
}

function requiredFile(filePath, label) {
  if (!existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
  return filePath;
}

function createGithubRelease(staged, receiptPath, targetCommit) {
  run("gh", [
    "release", "create", RELEASE_TAG,
    staged.setupExe, staged.setupSig, staged.msi, staged.msiSig,
    staged.updaterManifest, staged.bootstrapperManifest, staged.updaterChecksums,
    staged.checksums, staged.manifest, staged.verdict, receiptPath,
    "--repo", REPO,
    "--target", targetCommit,
    "--title", `Pocket DAW v${VERSION}`,
    "--notes-file", staged.releaseNotes,
    "--latest"
  ]);
}

async function verifyPublishedRelease(staged) {
  run("gh", ["release", "view", RELEASE_TAG, "--repo", REPO, "--json", "tagName,targetCommitish,url,publishedAt,assets"]);
  const manifestResponse = await fetch(LATEST_MANIFEST_URL);
  if (!manifestResponse.ok) throw new Error(`Updater manifest fetch failed: ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (manifest.version !== VERSION) throw new Error(`Live updater manifest version ${manifest.version} did not match ${VERSION}.`);
  const platform = manifest.platforms?.["windows-x86_64"];
  if (!platform?.url?.includes(`${RELEASE_TAG}/Pocket.DAW_${VERSION}_x64-setup.exe`)) throw new Error(`Live updater manifest URL does not point at ${RELEASE_TAG}: ${platform?.url || "[missing]"}`);
  const expectedHash = sha256File(staged.setupExe);
  const actualHash = await sha256Url(platform.url);
  if (actualHash !== expectedHash) throw new Error(`Remote setup hash mismatch: expected ${expectedHash}, got ${actualHash}`);
  console.log(`Remote setup SHA-256 verified: ${actualHash}`);
  const bootstrapperResponse = await fetch(`https://github.com/${REPO}/releases/latest/download/${DEFAULT_BOOTSTRAPPER_MANIFEST}`);
  if (!bootstrapperResponse.ok) throw new Error(`Bootstrapper manifest fetch failed: ${bootstrapperResponse.status}`);
  const bootstrapper = await bootstrapperResponse.json();
  if (bootstrapper.version !== VERSION || bootstrapper.installer?.sha256 !== expectedHash) throw new Error("Live bootstrapper manifest does not match the exact setup EXE.");
}

function assertGithubReleaseMissing() {
  const result = spawn("gh", ["release", "view", RELEASE_TAG, "--repo", REPO], { quiet: true });
  if (result.status === 0) throw new Error(`GitHub release ${RELEASE_TAG} already exists.`);
}

function currentCommit() {
  const result = spawn("git", ["rev-parse", "HEAD"], { quiet: true });
  const commit = String(result.stdout || "").trim();
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Could not resolve a full candidate Git commit.");
  return commit;
}

function assertCleanTrackedWorktree() {
  const result = spawn("git", ["status", "--short"], { quiet: true });
  if (result.status !== 0) throw new Error("Could not inspect the candidate working tree.");
  const status = String(result.stdout || "").trim();
  if (status) throw new Error(`release:prepare requires a clean committed tracked worktree:\n${status}`);
}

function run(command, args, options = {}) {
  const result = spawn(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function spawn(command, args, options = {}) {
  const executable = process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
  const cwd = options.cwd || ROOT;
  if (!options.quiet) console.log(`\n> ${executable} ${args.join(" ")}`);
  return process.platform === "win32" && ["npm", "npx"].includes(command)
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(executable, args)], { cwd, stdio: options.quiet ? "pipe" : "inherit", encoding: options.quiet ? "utf8" : undefined, shell: false })
    : spawnSync(executable, args, { cwd, stdio: options.quiet ? "pipe" : "inherit", encoding: options.quiet ? "utf8" : undefined, shell: false });
}

function parseArgs(argv) {
  const parsed = { fast: false, publishExact: false, receipt: "", verificationReport: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--prepare", "--full"].includes(arg)) continue;
    if (arg === "--fast") parsed.fast = true;
    else if (["--publish-exact", "--publish"].includes(arg)) parsed.publishExact = true;
    else if (arg === "--receipt") parsed.receipt = requiredValue(arg, argv[++index]);
    else if (arg === "--verification-report") parsed.verificationReport = requiredValue(arg, argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function requiredValue(arg, value) {
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
  return resolve(value);
}

function commandLine(command, args) { return [command, ...args].join(" "); }
function sha256File(filePath) { return createHash("sha256").update(readFileSync(filePath)).digest("hex"); }

async function sha256Url(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Remote setup download failed: ${response.status}`);
  return createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
}

function fail(message) {
  console.error(message);
  console.error("Usage: node scripts/release-updater-build.mjs [--prepare|--full] | --publish-exact --receipt <receipt.json> --verification-report <verification.json>");
  process.exit(1);
}
