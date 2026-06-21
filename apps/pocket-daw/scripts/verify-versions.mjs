import {
  loadReleaseStatus,
  loadReleaseStatusContext,
  validateReleaseStatus
} from "./release-status-lib.mjs";

const context = loadReleaseStatusContext();
const releaseStatus = loadReleaseStatus();
const validation = validateReleaseStatus(releaseStatus, context);

if (!validation.ok) {
  for (const failure of validation.failures) console.error(failure);
  process.exit(1);
}

console.log(`Version sync OK: ${context.packageJsonVersion}, schema ${context.schemaVersion}`);
