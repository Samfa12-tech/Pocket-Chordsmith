import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REQUIRED_ARTIFACT_KEYS,
  SOURCE_GATE_IDS,
  createCandidateReceipt,
  evidenceRecord,
  verifyCandidateReceipt,
  verifyCandidateVerificationReport,
  writeCandidateVerification
} from "../scripts/release-candidate-receipt.mjs";

const dirs: string[] = [];
const commit = "a".repeat(40);
const sidecar = {
  component: "pocket-daw-plugin-host",
  protocolVersion: 2,
  target: "x86_64-pc-windows-msvc",
  sha256: "b".repeat(64),
  sizeBytes: 20,
  preBundleSha256: "c".repeat(64),
  preBundleSizeBytes: 21
};

afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pocket-daw-receipt-"));
  dirs.push(root);
  const outDir = join(root, "releases", "updater");
  mkdirSync(outDir, { recursive: true });
  const artifacts: Record<string, string> = {};
  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const file = join(outDir, `${key}.bin`);
    writeFileSync(file, `${key}\n`);
    artifacts[key] = file;
  }
  writeFileSync(artifacts.releaseManifest, `${JSON.stringify({
    version: "0.6.47",
    gitCommitSha: commit,
    dirtyWorkingTree: false,
    pluginHostSidecar: sidecar
  })}\n`);
  const receiptPath = join(outDir, "candidate.json");
  const receipt = createCandidateReceipt({
    root,
    outPath: receiptPath,
    version: "0.6.47",
    commit,
    sourceGateIds: SOURCE_GATE_IDS,
    artifacts,
    pluginHostSidecar: sidecar
  });
  return { root, outDir, artifacts, receiptPath, receipt };
}

describe("immutable release candidate receipts", () => {
  it("binds every frozen artifact, source gate, manifest identity, and sidecar hash", () => {
    const built = fixture();
    const result = verifyCandidateReceipt({ root: built.root, receiptPath: built.receiptPath, expectedVersion: "0.6.47", expectedCommit: commit });
    expect(result.ok, result.failures.join("\n")).toBe(true);
    expect(Object.keys(built.receipt.artifacts).sort()).toEqual([...REQUIRED_ARTIFACT_KEYS].sort());
    expect(built.receipt.sourceGates.map((gate: { id: string }) => gate.id)).toEqual(SOURCE_GATE_IDS);
    expect(built.receipt.pluginHostSidecar.sha256).toBe(sidecar.sha256);
  });

  it("fails closed when an artifact changes and refuses receipt overwrite", () => {
    const built = fixture();
    writeFileSync(built.artifacts.setupExe, "changed\n");
    const result = verifyCandidateReceipt({ root: built.root, receiptPath: built.receiptPath });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/setupExe (size|hash) changed/);
    expect(() => createCandidateReceipt({
      root: built.root,
      outPath: built.receiptPath,
      version: "0.6.47",
      commit,
      sourceGateIds: SOURCE_GATE_IDS,
      artifacts: built.artifacts,
      pluginHostSidecar: sidecar
    })).toThrow(/immutable/);
  });

  it("binds evidence-only verification to exact receipt and evidence bytes", () => {
    const built = fixture();
    const labels = ["smoke-attestation", "punch-take-summary", "media-portability-summary", "vst3-host-summary", "game-pack:godot-adaptive-pack"];
    const evidenceFiles = labels.map((label, index) => {
      const file = join(built.outDir, `evidence-${index}.json`);
      writeFileSync(file, `{"index":${index}}\n`);
      return evidenceRecord(file, label);
    });
    const reportPath = join(built.outDir, "verification.json");
    writeCandidateVerification({ outPath: reportPath, receiptPath: built.receiptPath, receipt: built.receipt, evidence: evidenceFiles, audioMode: "fresh-audible" });
    expect(verifyCandidateVerificationReport({ receiptPath: built.receiptPath, reportPath, receipt: built.receipt }).ok).toBe(true);
    writeFileSync(evidenceFiles[0].path, "tampered\n");
    const changed = verifyCandidateVerificationReport({ receiptPath: built.receiptPath, reportPath, receipt: built.receipt });
    expect(changed.ok).toBe(false);
    expect(changed.failures.join("\n")).toMatch(/smoke-attestation (size|hash) changed/);
    expect(JSON.parse(readFileSync(reportPath, "utf8")).receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
