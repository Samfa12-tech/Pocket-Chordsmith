#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
export const packageRoots = [
  "apps/chordsmith-web",
  "apps/pocket-dj",
  "apps/pocket-daw",
  "packages/pocket-audio-core",
  "packages/pcs-format",
];

function redactDiagnostic(value) {
  return String(value || "")
    .replace(/(["']?(?:_authToken|_auth|password|token|access_token|refresh_token)["']?\s*:\s*["']?)([^"'\s,}]+)(["']?)/gi, "$1[redacted]$3")
    .replace(/((?:_authToken|_auth|password|token)\s*=\s*)([^\s"'<>]+)/gi, "$1[redacted]")
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/)[^/:\s@]+:[^/@\s]+@/gi, "$1[redacted]@")
    .trim();
}

function excerpt(value, limit = 4000) {
  const safe = redactDiagnostic(value);
  if (!safe) return "";
  return safe.length <= limit ? safe : `${safe.slice(-limit)}\n[earlier diagnostic output truncated]`;
}

function auditSummary(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { kind: "malformed", reason: "response root must be a JSON object" };
  }
  const hasErrors = Array.isArray(report.errors) ? report.errors.length > 0 : Boolean(report.errors);
  if (report.error || hasErrors) {
    const errors = Array.isArray(report.errors) ? report.errors : report.errors ? [report.errors] : [report.error];
    const messages = errors.map((error) => {
      if (typeof error === "string") return error;
      if (error && typeof error === "object") return [error.code, error.summary, error.detail].filter(Boolean).join(": ");
      return String(error);
    }).filter(Boolean);
    return { kind: "service-error", reason: messages.join("; ") || "npm audit returned an error" };
  }

  const counts = report.metadata?.vulnerabilities;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    if (report.advisories && typeof report.advisories === "object" && !Array.isArray(report.advisories)) {
      const advisories = Object.values(report.advisories);
      const allowedSeverities = new Set(["info", "low", "moderate", "high", "critical"]);
      if (!advisories.every((advisory) => advisory && typeof advisory === "object" && allowedSeverities.has(advisory.severity))) {
        return { kind: "malformed", reason: "advisories contains an invalid entry or severity" };
      }
      const critical = advisories.filter((advisory) => advisory.severity === "critical");
      const high = advisories.filter((advisory) => advisory.severity === "high");
      return { kind: high.length + critical.length ? "vulnerabilities" : "clean", high: high.length, critical: critical.length, total: advisories.length, names: [...high, ...critical].map((advisory) => advisory.module_name || advisory.title).filter(Boolean) };
    }
    return { kind: "malformed", reason: "metadata.vulnerabilities is missing or invalid" };
  }

  if (!["high", "critical"].every((key) => Number.isInteger(counts[key]) && counts[key] >= 0)) {
    return { kind: "malformed", reason: "metadata.vulnerabilities must provide nonnegative high and critical counts" };
  }
  const severities = ["critical", "high", "moderate", "low", "info", "total"];
  if (severities.some((key) => counts[key] !== undefined && (!Number.isInteger(counts[key]) || counts[key] < 0))) {
    return { kind: "malformed", reason: "metadata.vulnerabilities contains invalid counts" };
  }
  if (!report.vulnerabilities || typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)) {
    return { kind: "malformed", reason: "vulnerabilities must be a JSON object" };
  }
  const vulnerabilities = Object.entries(report.vulnerabilities);
  const allowedSeverities = new Set(["info", "low", "moderate", "high", "critical"]);
  if (!vulnerabilities.every(([, vulnerability]) => vulnerability && typeof vulnerability === "object" && allowedSeverities.has(vulnerability.severity))) {
    return { kind: "malformed", reason: "vulnerabilities contains an invalid entry or severity" };
  }
  const highVulnerabilities = vulnerabilities.filter(([, vulnerability]) => ["high", "critical"].includes(vulnerability.severity));
  const critical = Math.max(counts.critical || 0, highVulnerabilities.filter(([, vulnerability]) => vulnerability.severity === "critical").length);
  const high = Math.max(counts.high || 0, highVulnerabilities.filter(([, vulnerability]) => vulnerability.severity === "high").length);
  const names = highVulnerabilities.map(([name]) => name);
  return {
    kind: high + critical ? "vulnerabilities" : "clean",
    high,
    critical,
    total: counts.total || 0,
    names,
  };
}

export function auditNodeDependencies({
  repositoryRoot = root,
  packages = packageRoots,
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  spawn = spawnSync,
  stdout = (line) => process.stdout.write(`${line}\n`),
  stderr = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  const failed = [];

  for (const packageRoot of packages) {
    const directory = resolve(repositoryRoot, packageRoot);
    const lockfile = resolve(directory, "package-lock.json");
    if (!exists(lockfile)) {
      failed.push(packageRoot);
      stderr(`${packageRoot}: dependency audit cannot run; package-lock.json is missing`);
      continue;
    }

    const windows = platform === "win32";
    const command = windows ? env.ComSpec || "C:\\Windows\\System32\\cmd.exe" : "npm";
    const commandArgs = windows ? ["/d", "/s", "/c", "npm audit --json --audit-level=high"] : ["audit", "--json", "--audit-level=high"];
    const result = spawn(command, commandArgs, {
      cwd: directory,
      encoding: "utf8",
      shell: false,
      maxBuffer: 25 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const details = excerpt(result.stderr);
    const output = excerpt(result.stdout);
    if (result.error || result.status === null) {
      failed.push(packageRoot);
      const cause = result.error?.message || (result.signal ? `terminated by ${result.signal}` : "did not exit normally");
      stderr(`${packageRoot}: npm audit process failure: ${cause}${details ? `\nstderr:\n${details}` : ""}`);
      continue;
    }

    let report;
    try {
      report = JSON.parse(result.stdout || "");
    } catch (error) {
      failed.push(packageRoot);
      stderr(`${packageRoot}: malformed npm audit JSON response: ${error.message}${output ? `\nstdout:\n${output}` : ""}${details ? `\nstderr:\n${details}` : ""}`);
      continue;
    }

    const summary = auditSummary(report);
    if (summary.kind === "malformed") {
      failed.push(packageRoot);
      stderr(`${packageRoot}: malformed npm audit response: ${summary.reason}${output ? `\nstdout:\n${output}` : ""}${details ? `\nstderr:\n${details}` : ""}`);
    } else if (summary.kind === "service-error") {
      failed.push(packageRoot);
      stderr(`${packageRoot}: npm registry/audit service failure: ${excerpt(summary.reason, 1000)}${details ? `\nstderr:\n${details}` : ""}`);
    } else if (summary.kind === "vulnerabilities") {
      failed.push(packageRoot);
      const names = summary.names.length ? `; packages: ${excerpt(summary.names.join(", "), 1000)}` : "";
      stderr(`${packageRoot}: high/critical dependency advisories: ${summary.critical} critical, ${summary.high} high${names}`);
    } else if (result.status !== 0) {
      failed.push(packageRoot);
      stderr(`${packageRoot}: npm audit failed with exit code ${result.status} without a classified advisory${details ? `\nstderr:\n${details}` : ""}${output ? `\nstdout:\n${output}` : ""}`);
    } else {
      stdout(`${packageRoot}: dependency audit passed (${summary.total} total advisories; none high or critical)`);
    }
  }

  if (failed.length) stderr(`Dependency audit failed for: ${failed.join(", ")}`);
  return { exitCode: failed.length ? 1 : 0, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = auditNodeDependencies().exitCode;
}
