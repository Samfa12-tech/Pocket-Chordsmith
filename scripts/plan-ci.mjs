import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const JOB_IDS = Object.freeze([
  "governance",
  "core-format",
  "chordsmith",
  "pocket-dj",
  "handoff",
  "pocket-daw-linux",
  "pocket-daw-browser-e2e",
  "pocket-daw-release-contract",
  "pocket-daw-windows-native",
  "godot",
  "security"
]);

const FULL_EVENTS = new Set(["push-main", "schedule", "workflow-dispatch-full"]);
const ROOT_GOVERNANCE = new Set([
  "AGENTS.md", "FAMILY_MANIFEST.json", "package.json", "package-lock.json", ".gitignore", "CODEOWNERS"
]);
const DOC_ONLY = /^(docs\/|README(?:\.md)?$|PROJECT_MEMORY\.md$|apps\/[^/]+\/docs\/)/;
const NATIVE_DAW = /^apps\/pocket-daw\/(?:src-tauri\/|src\/native\/|Cargo\.|tauri\.|.*(?:signing|installer|vst3|sidecar))/i;
const DAW_RELEASE = /^apps\/pocket-daw\/(?:scripts\/|release-status\.json$|releases\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig)/;
const DAW_UI = /^apps\/pocket-daw\/src\/(?:app\/|App|components\/|ui\/|styles?\/|main\.)/;
const DAW_PATH = /^apps\/pocket-daw\//;
const DAW_RELEASE_DOC = /^apps\/pocket-daw\/docs\/(?:CURRENT_RELEASE_STATUS\.md|RELEASE_TESTING_FAST_PATH\.md)/;

function allJobs(value = true) {
  return Object.fromEntries(JOB_IDS.map((job) => [job, value]));
}

function mark(jobs, ...ids) {
  for (const id of ids) jobs[id] = true;
}

function normaliseChangedPath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

export function parseNameStatus(output) {
  const fields = output.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;
    // Renames/copies have both old and new names. Either can affect scope.
    const count = /^[RC]/.test(status) ? 2 : 1;
    if (index + count > fields.length) throw new Error(`incomplete git name-status record for ${status}`);
    for (let pathIndex = 0; pathIndex < count; pathIndex++) paths.push(normaliseChangedPath(fields[index++]));
  }
  return paths;
}

export function planChangedFiles(changedFiles, { event = "pull_request", explicitFull = false } = {}) {
  const files = [...new Set(changedFiles.map(normaliseChangedPath).filter(Boolean))].sort();
  if (explicitFull || FULL_EVENTS.has(event) || files.length === 0) {
    return { mode: "full", reason: explicitFull ? "explicit-full-dispatch" : (FULL_EVENTS.has(event) ? event : "no-changed-files"), files, jobs: allJobs() };
  }
  const jobs = allJobs(false);
  let recognised = true;
  for (const file of files) {
    if (ROOT_GOVERNANCE.has(file) || file.startsWith(".github/") || file.startsWith("scripts/") || file.startsWith("packages/")) {
      return { mode: "full", reason: `governance-or-shared-path:${file}`, files, jobs: allJobs() };
    }
    if (file.startsWith("apps/pocket-audio-handoff/")) {
      mark(jobs, "governance", "handoff", "security");
    } else if (file.startsWith("apps/chordsmith-web/")) {
      mark(jobs, "governance", "chordsmith", "security");
    } else if (file.startsWith("apps/pocket-dj/")) {
      mark(jobs, "governance", "pocket-dj", "security");
    } else if (file.startsWith("addons/pocket_chordsmith/")) {
      mark(jobs, "governance", "godot", "security");
    } else if (DAW_PATH.test(file)) {
      if (DAW_RELEASE_DOC.test(file)) {
        mark(jobs, "governance", "pocket-daw-release-contract");
      } else if (DOC_ONLY.test(file)) {
        mark(jobs, "governance");
      } else if (NATIVE_DAW.test(file)) {
        mark(jobs, "governance", "pocket-daw-windows-native", "security");
      } else if (DAW_RELEASE.test(file)) {
        mark(jobs, "governance", "pocket-daw-linux", "pocket-daw-release-contract", "pocket-daw-windows-native", "security");
      } else {
        mark(jobs, "governance", "pocket-daw-linux", "security");
        if (DAW_UI.test(file)) mark(jobs, "pocket-daw-browser-e2e");
      }
    } else if (DOC_ONLY.test(file)) {
      mark(jobs, "governance");
    } else {
      recognised = false;
      break;
    }
  }
  if (!recognised) return { mode: "full", reason: "unknown-path", files, jobs: allJobs() };
  return { mode: "changed", reason: "component-paths", files, jobs };
}

function git(cwd, args) {
  return childProcess.execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function changedFilesFromGit({ cwd, base, head = "HEAD" }) {
  if (!base) throw new Error("missing comparison base");
  try {
    // Require both endpoints locally; a shallow/missing base means full scope.
    git(cwd, ["rev-parse", "--verify", `${base}^{commit}`]);
    git(cwd, ["rev-parse", "--verify", `${head}^{commit}`]);
    return parseNameStatus(git(cwd, ["diff", "--name-status", "-z", `${base}...${head}`]));
  } catch (error) {
    throw new Error(`could not establish a complete git comparison: ${error.message}`);
  }
}

export function toGithubOutputs(plan) {
  const lines = [`plan=${JSON.stringify(plan)}`];
  for (const job of JOB_IDS) lines.push(`${job.replaceAll("-", "_")}=${plan.jobs[job] ? "true" : "false"}`);
  return `${lines.join("\n")}\n`;
}

function readArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    args.set(value.slice(2), argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true");
  }
  return args;
}

function main() {
  const args = readArgs(process.argv.slice(2));
  const cwd = args.get("cwd") ?? process.cwd();
  const event = args.get("event") ?? process.env.GITHUB_EVENT_NAME ?? "pull_request";
  const explicitFull = args.get("full") === "true" || args.get("workflow-dispatch-full") === "true";
  let plan;
  try {
    const normalizedEvent = event === "push" ? "push-main" : event;
    if (explicitFull || FULL_EVENTS.has(normalizedEvent)) {
      plan = planChangedFiles([], { event: normalizedEvent, explicitFull });
    } else if (args.has("files")) {
      plan = planChangedFiles(fs.readFileSync(path.resolve(cwd, args.get("files")), "utf8").split(/\r?\n/), { event, explicitFull });
    } else {
      const base = args.get("base") ?? process.env.CI_BASE_SHA;
      plan = planChangedFiles(changedFilesFromGit({ cwd, base, head: args.get("head") ?? "HEAD" }), { event: normalizedEvent, explicitFull });
    }
  } catch (error) {
    plan = { mode: "full", reason: `planner-error:${error.message}`, files: [], jobs: allJobs() };
  }
  const output = `${JSON.stringify(plan)}\n`;
  process.stdout.write(output);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, toGithubOutputs(plan));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
