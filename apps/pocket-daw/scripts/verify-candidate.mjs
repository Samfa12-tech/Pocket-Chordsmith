import path from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { verifyGamePackZip } from "./verify-game-pack.mjs";
import { verifyInstalledMediaPortabilitySummaryFile } from "./verify-installed-media-portability-summary.mjs";
import { verifyInstalledVst3HostSummaryFile } from "./verify-installed-vst3-host-summary.mjs";
import { verifyNativeCaptureEvidence } from "./verify-native-capture-evidence.mjs";
import { assertReleaseCandidateTruth } from "./verify-release-candidate-truth.mjs";
import { verifySmokeAttestationFile } from "./verify-smoke-attestation.mjs";
import {
  assertCleanCandidateWorktree,
  evidenceRecord,
  receiptArtifactPath,
  verifyCandidateReceipt,
  writeCandidateVerification
} from "./release-candidate-receipt.mjs";

function parseArgs(argv) {
  const parsed = {
    receipt: "",
    verificationReport: "",
    attestation: "",
    installer: "",
    punchTakeSummary: "",
    mediaPortabilitySummary: "",
    vst3HostSummary: "",
    commit: "",
    version: packageJson.version,
    requireAudibleAudio: false,
    requireExportFiles: false,
    requireMidiInput: false,
    audioCaptureBaselineAttestation: "",
    audioCaptureBaselineInstaller: "",
    manualFreshAudibleEvidence: "",
    gamePacks: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--receipt") {
      parsed.receipt = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--verification-report") {
      parsed.verificationReport = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--attestation") {
      parsed.attestation = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--installer") {
      parsed.installer = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--punch-take-summary") {
      parsed.punchTakeSummary = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--media-portability-summary") {
      parsed.mediaPortabilitySummary = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--vst3-host-summary") {
      parsed.vst3HostSummary = requiredValue(arg, value);
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
    } else if (arg === "--audio-capture-baseline-attestation") {
      parsed.audioCaptureBaselineAttestation = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--audio-capture-baseline-installer") {
      parsed.audioCaptureBaselineInstaller = requiredValue(arg, value);
      index += 1;
    } else if (arg === "--manual-fresh-audible-evidence") {
      parsed.manualFreshAudibleEvidence = requiredValue(arg, value);
      index += 1;
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
  if (!options.receipt) missing.push("--receipt <candidate-receipt.json>");
  if (!options.attestation) missing.push("--attestation <smoke-attestation.json>");
  if (!options.punchTakeSummary) missing.push("--punch-take-summary <punch-take-lane-installed-smoke-summary.json>");
  if (!options.mediaPortabilitySummary) missing.push("--media-portability-summary <installed-media-portability-smoke-summary.json>");
  if (!options.vst3HostSummary) missing.push("--vst3-host-summary <installed-vst3-host-smoke-summary.json>");
  if (!options.gamePacks.length) missing.push("--game-pack <pack.zip> --kind <godot-adaptive-pack|web-game-pack>");
  if (!options.requireExportFiles) missing.push("--require-export-files");
  if (!options.requireMidiInput) missing.push("--require-midi-input");
  const hasBaselineAttestation = !!options.audioCaptureBaselineAttestation;
  const hasBaselineInstaller = !!options.audioCaptureBaselineInstaller;
  if (hasBaselineAttestation !== hasBaselineInstaller) missing.push("both baseline reuse paths");
  const audioModeCount = (options.requireAudibleAudio ? 1 : 0)
    + (hasBaselineAttestation && hasBaselineInstaller ? 1 : 0)
    + (options.manualFreshAudibleEvidence ? 1 : 0);
  if (audioModeCount === 0) missing.push("one audio mode: --require-audible-audio, baseline reuse paths, or --manual-fresh-audible-evidence");
  if (audioModeCount > 1) missing.push("exactly one audio evidence mode");
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
  const result = verifyNativeCaptureEvidence({
    attestationPath: options.attestation,
    punchTakeSummaryPath: options.punchTakeSummary,
    installerPath: options.installer,
    version: options.version,
    requireAudibleAudio: options.requireAudibleAudio,
    baselineAttestationPath: options.audioCaptureBaselineAttestation,
    baselineInstallerPath: options.audioCaptureBaselineInstaller,
    manualFreshAudibleEvidencePath: options.manualFreshAudibleEvidence,
    root: process.cwd()
  });
  if (!result.ok) {
    result.failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
  console.log(`Installed punch/take smoke and ${result.mode} audio evidence verification OK`);
}

function verifyInstalledMediaPortabilityEvidence(options) {
  const result = verifyInstalledMediaPortabilitySummaryFile({
    summaryPath: options.mediaPortabilitySummary,
    installerPath: options.installer,
    version: options.version,
    requireInstaller: true,
    requireExportFiles: true
  });
  if (!result.ok) {
    result.failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
  console.log("Installed media portability smoke summary verification OK");
}

function verifyInstalledVst3HostEvidence(options) {
  const result = verifyInstalledVst3HostSummaryFile({
    summaryPath: options.vst3HostSummary,
    installerPath: options.installer,
    version: options.version
  });
  if (!result.ok) {
    result.failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
  console.log("Installed VST3 host smoke summary verification OK");
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
  const headCommit = assertCleanCandidateWorktree({ root: process.cwd() });
  assertReleaseCandidateTruth(process.cwd());
  const checked = verifyCandidateReceipt({
    root: process.cwd(),
    receiptPath: options.receipt,
    expectedVersion: options.version === packageJson.version ? packageJson.version : options.version,
    expectedCommit: headCommit
  });
  if (!checked.ok) throw new Error(`Candidate receipt verification failed:\n${checked.failures.join("\n")}`);
  const receipt = checked.receipt;
  const receiptInstaller = receiptArtifactPath(process.cwd(), receipt, "setupExe");
  if (options.installer && path.resolve(options.installer) !== receiptInstaller) {
    throw new Error("--installer does not match the immutable candidate receipt setup EXE.");
  }
  if (options.commit && options.commit !== receipt.commit) throw new Error("--commit does not match the immutable candidate receipt.");
  options.installer = receiptInstaller;
  options.commit = receipt.commit;
  options.version = receipt.version;
  verifyInstalledSmokeEvidence(options);
  verifyInstalledPunchTakeEvidence(options);
  verifyInstalledMediaPortabilityEvidence(options);
  verifyInstalledVst3HostEvidence(options);
  verifyGamePackEvidence(options);
  const evidence = [
    evidenceRecord(options.attestation, "smoke-attestation"),
    evidenceRecord(options.punchTakeSummary, "punch-take-summary"),
    evidenceRecord(options.mediaPortabilitySummary, "media-portability-summary"),
    evidenceRecord(options.vst3HostSummary, "vst3-host-summary"),
    ...options.gamePacks.map((gamePack) => evidenceRecord(gamePack.zipPath, `game-pack:${gamePack.kind}`))
  ];
  if (options.audioCaptureBaselineAttestation) evidence.push(evidenceRecord(options.audioCaptureBaselineAttestation, "audio-baseline-attestation"));
  if (options.audioCaptureBaselineInstaller) evidence.push(evidenceRecord(options.audioCaptureBaselineInstaller, "audio-baseline-installer"));
  if (options.manualFreshAudibleEvidence) evidence.push(evidenceRecord(options.manualFreshAudibleEvidence, "manual-fresh-audible"));
  const verificationReport = path.resolve(options.verificationReport || path.join(path.dirname(checked.receiptPath), `pocket-daw-candidate-verification-v${receipt.version}.json`));
  const audioMode = options.requireAudibleAudio ? "fresh-audible" : options.manualFreshAudibleEvidence ? "manual-fresh-audible" : "baseline-reuse";
  writeCandidateVerification({ outPath: verificationReport, receiptPath: checked.receiptPath, receipt, evidence, audioMode });
  console.log(`Pocket DAW candidate evidence verification OK: ${verificationReport}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Usage: node scripts/verify-candidate.mjs --receipt <candidate-receipt.json> --attestation <smoke-attestation.json> --punch-take-summary <punch-take-lane-installed-smoke-summary.json> --media-portability-summary <installed-media-portability-smoke-summary.json> --vst3-host-summary <installed-vst3-host-smoke-summary.json> (--require-audible-audio | --manual-fresh-audible-evidence <manual-report.json> | --audio-capture-baseline-attestation <prior.json> --audio-capture-baseline-installer <prior-setup.exe>) --require-export-files --require-midi-input --game-pack <pack.zip> --kind <godot-adaptive-pack|web-game-pack>");
  process.exit(2);
}
