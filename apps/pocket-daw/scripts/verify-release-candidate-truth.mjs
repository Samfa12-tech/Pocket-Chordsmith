import { spawnSync } from "node:child_process";
import {
  loadReleaseStatus,
  loadReleaseStatusContext,
  validateReleaseCandidateTruth
} from "./release-status-lib.mjs";

export function assertReleaseCandidateTruth(root = process.cwd()) {
  const currentCommit = currentGitCommit(root);
  const releaseStatus = loadReleaseStatus(root);
  const context = loadReleaseStatusContext(root);
  const validation = validateReleaseCandidateTruth(releaseStatus, context, { currentCommit });
  if (!validation.ok) {
    throw new Error(validation.failures.join("\n"));
  }
  return { currentCommit };
}

function currentGitCommit(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });
  if (result.error || result.status !== 0) {
    throw new Error("Could not resolve current git commit for release-candidate truth guard.");
  }
  return result.stdout.trim();
}

if (process.argv[1] && process.argv[1].endsWith("verify-release-candidate-truth.mjs")) {
  try {
    const { currentCommit } = assertReleaseCandidateTruth();
    console.log(`Release-candidate truth OK for ${currentCommit}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Refusing candidate packaging/publishing: bump the next Pocket DAW checkpoint version before packaging/publishing source-only changes, or refresh release-status.json for an exact published checkpoint.");
    process.exit(1);
  }
}
