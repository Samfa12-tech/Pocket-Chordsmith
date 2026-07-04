import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { ITCH_CHANNEL, ITCH_SLUG } from "./package-itch.mjs";
import { assertReleaseCandidateTruth } from "./verify-release-candidate-truth.mjs";
import { verifyInstalledPunchTakeSummaryFile } from "./verify-installed-punch-take-summary.mjs";
import { verifySmokeAttestationFile } from "./verify-smoke-attestation.mjs";

if (process.env.PUBLISH !== "1") {
  console.error("Refusing to upload. Set PUBLISH=1 only after manual approval and smoke-check review.");
  process.exit(1);
}
try {
  assertReleaseCandidateTruth(process.cwd());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const version = packageJson.version;
const folder = "releases/itch/installers";
const setupInstaller = findSetupInstaller(folder, version);
const commit = gitCommit();
const smokeAttestation = process.env.SMOKE_ATTESTATION;
if (!smokeAttestation) {
  console.error("Refusing to upload. Set SMOKE_ATTESTATION to a matching exact-artifact smoke attestation JSON.");
  process.exit(1);
}
const punchTakeSummary = process.env.PUNCH_TAKE_SUMMARY;
if (!punchTakeSummary) {
  console.error("Refusing to upload. Set PUNCH_TAKE_SUMMARY to a matching installed punch/take-lane smoke summary JSON.");
  process.exit(1);
}
const smoke = verifySmokeAttestationFile({
  attestationPath: smokeAttestation,
  installerPath: setupInstaller,
  version,
  commit
});
if (!smoke.ok) {
  for (const failure of smoke.failures) console.error(failure);
  process.exit(1);
}
const punchTake = verifyInstalledPunchTakeSummaryFile({
  summaryPath: punchTakeSummary,
  installerPath: setupInstaller,
  version,
  requireAudibleAudio: envFlag("PUNCH_TAKE_REQUIRE_AUDIBLE_AUDIO"),
  requireExportFiles: envFlag("PUNCH_TAKE_REQUIRE_EXPORT_FILES"),
  requireMidiInput: envFlag("PUNCH_TAKE_REQUIRE_MIDI_INPUT")
});
if (!punchTake.ok) {
  for (const failure of punchTake.failures) console.error(failure);
  process.exit(1);
}

const args = ["push", folder, `${ITCH_SLUG}:${ITCH_CHANNEL}`, "--userversion", version];
console.log(`> butler ${args.join(" ")}`);
const result = spawnSync("butler", args, { stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exit(result.status || 0);

function findSetupInstaller(folder, version) {
  const match = readdirSync(folder).find((name) => name.includes(version) && /setup\.exe$/i.test(name));
  if (!match) {
    console.error(`Refusing to upload. Could not find setup EXE for ${version} under ${folder}.`);
    process.exit(1);
  }
  return join(folder, match);
}

function gitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", shell: false });
  if (result.status !== 0) {
    console.error("Refusing to upload. Could not resolve current git commit for smoke attestation.");
    process.exit(1);
  }
  return result.stdout.trim();
}

function envFlag(name) {
  return process.env[name] === "1" || process.env[name] === "true";
}
