import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { expectedGithubReleaseArtifacts, verifyGithubReleaseSnapshot } from "../scripts/verify-published-release.mjs";

const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

describe("exact published release verification", () => {
  it("defines the exact eleven uploaded receipt-bound assets and excludes release notes", () => {
    const artifactHash = (name: string) => hash(name);
    const staged = {
      setupExe: "C:/out/setup.exe",
      setupSig: "C:/out/setup.exe.sig",
      msi: "C:/out/setup.msi",
      msiSig: "C:/out/setup.msi.sig",
      updaterManifest: "C:/out/pocket-daw-latest.json",
      bootstrapperManifest: "C:/out/pocket-daw-bootstrapper-latest.json",
      updaterChecksums: "C:/out/SHA256SUMS.txt",
      checksums: "C:/out/CHECKSUMS.txt",
      manifest: "C:/out/release-manifest.json",
      verdict: "C:/out/verdict.md",
      releaseNotes: "C:/out/notes.md"
    };
    const receipt = { artifacts: Object.fromEntries([
      ["setupExe", "setupExe"], ["setupSignature", "setupSignature"], ["msi", "msi"], ["msiSignature", "msiSignature"],
      ["updaterManifest", "updaterManifest"], ["bootstrapperManifest", "bootstrapperManifest"], ["updaterChecksums", "updaterChecksums"],
      ["releaseChecksums", "releaseChecksums"], ["releaseManifest", "releaseManifest"], ["releaseVerdict", "releaseVerdict"]
    ].map(([key, value]) => [key, { sha256: artifactHash(value) }])) };
    const artifacts = expectedGithubReleaseArtifacts({ staged, receiptPath: "C:/out/receipt.json", receipt, receiptSha256: hash("receipt") });
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      staged.setupExe, staged.setupSig, staged.msi, staged.msiSig,
      staged.updaterManifest, staged.bootstrapperManifest, staged.updaterChecksums,
      staged.checksums, staged.manifest, staged.verdict, "C:/out/receipt.json"
    ]);
    expect(artifacts.map((artifact) => artifact.path)).not.toContain(staged.releaseNotes);
  });

  it("accepts only the expected target and complete receipt-bound asset set", async () => {
    const bodies = new Map([
      ["https://example.test/setup", "setup"],
      ["https://example.test/sig", "signature"]
    ]);
    const result = await verifyGithubReleaseSnapshot({
      releaseView: {
        tagName: "pocket-daw-v0.6.47",
        targetCommitish: "a".repeat(40),
        assets: [
          { name: "Pocket.DAW_0.6.47_x64-setup.exe", url: "https://example.test/setup" },
          { name: "Pocket.DAW_0.6.47_x64-setup.exe.sig", url: "https://example.test/sig" }
        ]
      },
      expectedTag: "pocket-daw-v0.6.47",
      expectedTargetCommit: "a".repeat(40),
      expectedArtifacts: [
        { path: "C:/candidate/Pocket DAW_0.6.47_x64-setup.exe", sha256: hash("setup") },
        { path: "C:/candidate/Pocket DAW_0.6.47_x64-setup.exe.sig", sha256: hash("signature") }
      ],
      fetchImpl: async (url: string) => new Response(bodies.get(url), { status: 200 })
    });
    expect(result.ok, result.failures.join("\n")).toBe(true);
  });

  it("fails closed on target, missing, extra, or changed uploaded bytes", async () => {
    const result = await verifyGithubReleaseSnapshot({
      releaseView: {
        tagName: "pocket-daw-v0.6.47",
        targetCommitish: "b".repeat(40),
        assets: [
          { name: "setup.exe", url: "https://example.test/setup" },
          { name: "unexpected.txt", url: "https://example.test/extra" }
        ]
      },
      expectedTag: "pocket-daw-v0.6.47",
      expectedTargetCommit: "a".repeat(40),
      expectedArtifacts: [
        { path: "C:/candidate/setup.exe", sha256: hash("expected") },
        { path: "C:/candidate/setup.exe.sig", sha256: hash("signature") }
      ],
      fetchImpl: async () => new Response("changed", { status: 200 })
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/target .* does not match/);
    expect(result.failures.join("\n")).toContain("missing receipt-bound asset setup.exe.sig");
    expect(result.failures.join("\n")).toContain("unexpected asset unexpected.txt");
  });

  it("downloads and rejects a hash mismatch after the asset set matches", async () => {
    const result = await verifyGithubReleaseSnapshot({
      releaseView: {
        tagName: "pocket-daw-v0.6.47",
        targetCommitish: "a".repeat(40),
        assets: [{ name: "setup.exe", url: "https://example.test/setup" }]
      },
      expectedTag: "pocket-daw-v0.6.47",
      expectedTargetCommit: "a".repeat(40),
      expectedArtifacts: [{ path: "C:/candidate/setup.exe", sha256: hash("expected") }],
      fetchImpl: async () => new Response("changed", { status: 200 })
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("GitHub asset hash mismatch for setup.exe");
  });
});
