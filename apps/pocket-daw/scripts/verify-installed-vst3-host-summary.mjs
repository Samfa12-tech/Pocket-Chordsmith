import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import packageJson from "../package.json" with { type: "json" };

export function verifyInstalledVst3HostSummaryFile({ summaryPath, installerPath, version = packageJson.version, candidateMetadataPath = "src-tauri/target/release/bundle/pocket-daw-plugin-host-build.json" }) {
  const failures = [];
  let summary;
  let candidate;
  try { summary = JSON.parse(readFileSync(resolve(summaryPath), "utf8")); } catch { return { ok: false, failures: ["Installed VST3 host summary is missing or invalid JSON."] }; }
  try { candidate = JSON.parse(readFileSync(resolve(candidateMetadataPath), "utf8")); } catch { return { ok: false, failures: ["Candidate plug-in host metadata is missing or invalid JSON."] }; }
  const installerBytes = readFileSync(resolve(installerPath));
  const installerSha256 = createHash("sha256").update(installerBytes).digest("hex");
  if (summary.schema !== 1 || summary.result !== "pass") failures.push("Installed VST3 host summary must be schema 1 with result pass.");
  if (summary.appVersion !== version) failures.push(`Installed VST3 host app version must be ${version}.`);
  if (summary.installer?.fileName !== basename(installerPath) || summary.installer?.sha256 !== installerSha256) failures.push("Installed VST3 host summary installer identity does not match the candidate installer.");
  const host = summary.pluginHostSidecar || {};
  if (host.sha256 !== candidate.sha256 || host.sizeBytes !== candidate.sizeBytes) failures.push("Installed sidecar hash/size do not match candidate metadata.");
  for (const field of ["protocolVersion", "audioBlockFrames", "vst3SdkTag", "vst3SdkCommit", "vst3SdkVendoredTreeSha256"]) if (host[field] !== candidate[field]) failures.push(`Installed sidecar ${field} does not match candidate metadata.`);
  for (const field of ["vst3SdkLinked", "scannerAvailable", "audioHostingAvailable"]) if (host[field] !== true || candidate[field] !== true) failures.push(`Installed sidecar ${field} must be true.`);
  const fixture = summary.deterministicFixture || {};
  for (const field of ["scanner", "instrument", "effect", "stateRoundTrip", "parameterAutomation", "factoryPrograms", "latencyAndTail", "editorLifecycle", "unloadReloadRecovery"]) if (fixture[field] !== true) failures.push(`Installed VST3 fixture evidence ${field} must be true.`);
  if (!Number.isFinite(Date.parse(summary.startedAt)) || !Number.isFinite(Date.parse(summary.completedAt))) failures.push("Installed VST3 host timestamps are invalid.");
  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.endsWith("verify-installed-vst3-host-summary.mjs")) {
  const [summaryPath, installerPath, candidateMetadataPath] = process.argv.slice(2);
  if (!summaryPath || !installerPath) {
    console.error("Usage: node scripts/verify-installed-vst3-host-summary.mjs <summary.json> <setup.exe> [candidate-metadata.json]");
    process.exit(2);
  }
  const result = verifyInstalledVst3HostSummaryFile({ summaryPath, installerPath, ...(candidateMetadataPath ? { candidateMetadataPath } : {}) });
  if (!result.ok) { result.failures.forEach((failure) => console.error(failure)); process.exit(1); }
  console.log("Installed VST3 host summary verification OK");
}
