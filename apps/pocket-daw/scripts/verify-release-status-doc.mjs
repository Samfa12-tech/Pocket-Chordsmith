import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadReleaseStatus,
  loadReleaseStatusContext,
  renderReleaseStatusMarkdown,
  validateReleaseStatus
} from "./release-status-lib.mjs";

const root = process.cwd();
const docPath = join(root, "docs", "CURRENT_RELEASE_STATUS.md");
const releaseStatus = loadReleaseStatus(root);
const context = loadReleaseStatusContext(root);
const validation = validateReleaseStatus(releaseStatus, context);

if (!validation.ok) {
  for (const failure of validation.failures) console.error(failure);
  process.exit(1);
}

const expected = renderReleaseStatusMarkdown(releaseStatus);
const actual = readFileSync(docPath, "utf8");

if (actual !== expected) {
  console.error(`${docPath} is stale. Run npm run status:release from apps/pocket-daw.`);
  process.exit(1);
}

console.log("Release status doc is current.");
