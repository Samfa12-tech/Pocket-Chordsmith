import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The action version is deliberately data, not something inferred from the
 * beginning of a SHA.  In particular, a SHA beginning with "7" is not v7.
 */
export const ACTION_ALLOWLIST = Object.freeze({
  "actions/checkout": { version: "v6", sha: "d23441a48e516b6c34aea4fa41551a30e30af803" },
  "actions/setup-node": { version: "v6", sha: "249970729cb0ef3589644e2896645e5dc5ba9c38" },
  "actions/upload-artifact": { version: "v7", sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" },
  "actions/dependency-review-action": { version: "v4.9.0", sha: "2031cfc080254a8a887f58cffee85186f0e49e48" },
  "github/codeql-action/init": { version: "v4.37.6", sha: "9e3211c9a3b9311dfe05da2ed48eea3386f042dd" },
  "github/codeql-action/analyze": { version: "v4.37.6", sha: "9e3211c9a3b9311dfe05da2ed48eea3386f042dd" }
});

const SHA = /^[a-f0-9]{40}$/i;
const LOCAL_ACTION = /^\.\/\.github\/actions\/[A-Za-z0-9._/-]+$/;

export function parseWorkflowUses(workflowText, workflowName = "workflow") {
  const entries = [];
  const errors = [];
  for (const [offset, rawLine] of workflowText.split(/\r?\n/).entries()) {
    const lineNumber = offset + 1;
    if (!/^\s*(?:-\s*)?uses\s*:/.test(rawLine)) continue;
    const match = rawLine.match(/^\s*(?:-\s*)?uses\s*:\s*([^\s#]+)(?:\s+#\s*(.*?)\s*)?\s*$/);
    if (!match) {
      errors.push(`${workflowName}:${lineNumber}: malformed uses: reference`);
      continue;
    }
    const [, reference, comment = ""] = match;
    entries.push({ workflowName, lineNumber, reference, comment: comment.trim() });
  }
  return { entries, errors };
}

export function verifyWorkflowText(workflowText, workflowName = "workflow", allowlist = ACTION_ALLOWLIST) {
  const { entries, errors } = parseWorkflowUses(workflowText, workflowName);
  for (const entry of entries) {
    if (LOCAL_ACTION.test(entry.reference)) continue;
    const action = entry.reference.match(/^([^@\s]+)@([^@\s]+)$/);
    if (!action) {
      errors.push(`${workflowName}:${entry.lineNumber}: malformed uses: ${entry.reference}`);
      continue;
    }
    const [, actionName, ref] = action;
    const approved = allowlist[actionName];
    if (!approved) {
      errors.push(`${workflowName}:${entry.lineNumber}: action ${actionName} is not in the immutable-action allowlist`);
      continue;
    }
    if (!SHA.test(ref)) {
      errors.push(`${workflowName}:${entry.lineNumber}: ${actionName} must use a complete 40-character commit SHA, not ${ref}`);
      continue;
    }
    if (ref.toLowerCase() !== approved.sha.toLowerCase()) {
      errors.push(`${workflowName}:${entry.lineNumber}: ${actionName} SHA is not the approved ${approved.version} pin`);
    }
    const expectedComment = approved.version;
    if (entry.comment !== expectedComment) {
      errors.push(`${workflowName}:${entry.lineNumber}: ${actionName} must carry inline comment # ${expectedComment}, found ${entry.comment ? `# ${entry.comment}` : "none"}`);
    }
  }
  return errors;
}

export function verifyWorkflowPins({ workflowsDir, allowlist = ACTION_ALLOWLIST } = {}) {
  if (!workflowsDir || !fs.existsSync(workflowsDir)) {
    return [`workflow directory does not exist: ${workflowsDir ?? "(missing)"}`];
  }
  const workflowFiles = fs.readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  if (workflowFiles.length === 0) return [`no workflow files found in ${workflowsDir}`];
  return workflowFiles.flatMap((name) => verifyWorkflowText(
    fs.readFileSync(path.join(workflowsDir, name), "utf8"),
    `.github/workflows/${name}`,
    allowlist
  ));
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const errors = verifyWorkflowPins({ workflowsDir: path.join(repoRoot, ".github", "workflows") });
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Immutable workflow action pins OK");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
