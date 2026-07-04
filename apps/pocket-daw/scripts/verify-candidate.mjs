import { spawnSync } from "node:child_process";
import path from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { verifyGamePackZip } from "./verify-game-pack.mjs";
import { verifyInstalledPunchTakeSummaryFile } from "./verify-installed-punch-take-summary.mjs";
import { assertReleaseCandidateTruth } from "./verify-release-candidate-truth.mjs";
import { verifySmokeAttestationFile } from "./verify-smoke-attestation.mjs";

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const cargoCmd = isWindows ? "cargo.exe" : "cargo";

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = isWindows
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(command, args)], { stdio: "inherit", shell: false, ...options })
    : spawnSync(command, args, { stdio: "inherit", shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function parseArgs(argv) {
  const parsed = {
    attestation: "",
    installer: "",
    punchTakeSummary: "",
    commit: "",
    version: packageJson.version,
    requireAudibleAudio: false,
    requireExportFiles: false,
    requireMidiInput: false,
    gamePacks: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--attestation") {
      parsed.attestation = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--installer") {
      parsed.installer = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--punch-take-summary") {
      parsed.punchTakeSummary = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--commit") {
      parsed.commit = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--version") {
      parsed.version = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--require-audible-audio") {
      parsed.requireAudibleAudio = true;
    } else if (arg === "--require-export-files") {
      parsed.requireExportFiles = true;
    } else if (arg === "--require-midi-input") {
      parsed.requireMidiInput = true;
    } else if (arg === "--game-pack") {
      parsed.gamePacks.push({ zipPath: requiredValue(arg, value), kind: "" });
      index += 1;
    } else if (arg === "--kind") {
      if (!parsed.gamePacks.length) throw new Error("--kind must follow --game-pack.");
      parsed.gamePacks[parsed.gamePacks.length - 1].kind = requiredValue(arg, value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(arg, value) {
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
  return value;
}

function assertRequiredEvidence(options) {
  const missing = [];
  if (!options.attestation) missing.push("--attestation <smoke-attestation.json>");
  if (!options.installer) missing.push("--installer <setup.exe>");
  if (!options.punchTakeSummary) missing.push("--punch-take-summary <punch-take-lane-installed-smoke-summary.json>");
  if (!options.commit) missing.push("--commit <full-git-sha>");
  if (!options.gamePacks.length) missing.push("--game-pack <pack.zip> --kind <godot-adaptive-pack|web-game-pack>");
  if (missing.length) {
    throw new Error(`Missing candidate evidence: ${missing.join(", ")}.`);
  }
}

function verifyInstalledSmokeEvidence(options) {
  const result = verifySmokeAttestationFile({
    attestationPath: options.attestation,
    installerPath: options.installer,
    commit: options.commit,
    version: options.version
  });
  if (!result.ok) {
    result.failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
  console.log("Smoke attestation verification OK");
}

function verifyInstalledPunchTakeEvidence(options) {
  const result = verifyInstalledPunchTakeSummaryFile({
    summaryPath: options.punchTakeSummary,
    installerPath: options.installer,
    version: options.version,
    requireAudibleAudio: options.requireAudibleAudio,
    requireExportFiles: options.requireExportFiles,
    requireMidiInput: options.requireMidiInput
  });
  if (!result.ok) {
    result.failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
  console.log("Installed punch/take smoke summary verification OK");
}

function verifyGamePackEvidence(options) {
  for (const gamePack of options.gamePacks) {
    const result = verifyGamePackZip(path.resolve(gamePack.zipPath), { kind: gamePack.kind });
    if (!result.ok) {
      console.error(`Game pack verification failed: ${path.resolve(gamePack.zipPath)}`);
      result.errors.forEach((error) => console.error(`- ${error}`));
      result.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
      process.exit(1);
    }
    console.log(`Game pack OK: ${path.resolve(gamePack.zipPath)}`);
    result.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assertRequiredEvidence(options);
  assertReleaseCandidateTruth(process.cwd());

  run(npmCmd, ["run", "verify:versions"]);
  run(npmCmd, ["run", "verify:native-sound-recipes"]);
  run(npmCmd, ["run", "verify:release"]);
  run(cargoCmd, ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
  run(npmCmd, ["run", "test:e2e"]);
  verifyInstalledSmokeEvidence(options);
  verifyInstalledPunchTakeEvidence(options);
  verifyGamePackEvidence(options);
  console.log("Pocket DAW candidate verification OK");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Usage: node scripts/verify-candidate.mjs --attestation <smoke-attestation.json> --installer <setup.exe> --punch-take-summary <punch-take-lane-installed-smoke-summary.json> [--require-audible-audio] [--require-export-files] [--require-midi-input] --commit <full-git-sha> --game-pack <pack.zip> --kind <godot-adaptive-pack|web-game-pack>");
  process.exit(2);
}
