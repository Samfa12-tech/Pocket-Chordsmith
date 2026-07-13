import { describe, expect, it } from "vitest";
import { validateInstalledMediaPortabilitySummary } from "../scripts/verify-installed-media-portability-summary.mjs";

const hash = "a".repeat(64);

function fileEvidence() {
  return { path: "C:/evidence/file.bin", sizeBytes: 128, sha256: hash, artifact: {} };
}

function portablePhase() {
  return {
    externalReferenceCount: 0,
    runtimeOnlyCount: 0,
    missingCount: 0,
    portability: { embeddedSourceProjectPortable: true, needsCollectionOrRelinkCount: 0 }
  };
}

function validSummary() {
  return {
    ok: true,
    testedAt: "2026-07-13T04:00:00.000Z",
    runningVersion: "0.6.40",
    installer: null,
    originalProjectPath: "C:/smoke/original/project.pocketdaw",
    projectPath: "C:/smoke/moved/project.pocketdaw",
    projectFolderMoved: true,
    originalSourcesDeleted: true,
    replacementSourceDeleted: true,
    phases: {
      initial: { externalReferenceCount: 2, portability: {} },
      collected: {
        ...portablePhase(),
        files: { mediaA: fileEvidence(), mediaB: fileEvidence(), decodedCacheB: fileEvidence() }
      },
      movedReopen: portablePhase(),
      cacheFallback: {
        missingCount: 1,
        portability: { cacheOnlyCount: 1 },
        item: { lastReloadSourceKind: "decoded-cache", restoredFromNativeDecodedCache: true, missing: true, unresolved: true }
      },
      final: portablePhase()
    },
    exports: {
      wav: fileEvidence(),
      "stem-zip": fileEvidence(),
      "section-loop-zip": fileEvidence(),
      "godot-adaptive-pack": fileEvidence(),
      "web-game-pack": fileEvidence()
    },
    gamePacks: {
      godot: { ok: true, errors: [] },
      web: { ok: true, errors: [] }
    },
    invariants: { errorCount: 0, warningCount: 0 }
  };
}

describe("installed media portability smoke verifier", () => {
  it("accepts moved-project, cache recovery, relink and export evidence", () => {
    const result = validateInstalledMediaPortabilitySummary(validSummary(), {
      version: "0.6.40",
      requireExportFiles: false
    });
    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("rejects a cache fallback that hides the missing source state", () => {
    const summary = validSummary();
    summary.phases.cacheFallback.item.missing = false;
    const result = validateInstalledMediaPortabilitySummary(summary, {
      version: "0.6.40",
      requireExportFiles: false
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("cache fallback must remain honestly missing and unresolved");
  });

  it("rejects a final project that still depends on external media", () => {
    const summary = validSummary();
    summary.phases.final.externalReferenceCount = 1;
    const result = validateInstalledMediaPortabilitySummary(summary, {
      version: "0.6.40",
      requireExportFiles: false
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("phases.final.externalReferenceCount must be 0");
  });
});
