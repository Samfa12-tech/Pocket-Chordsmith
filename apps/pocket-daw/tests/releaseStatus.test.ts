import { describe, expect, it } from "vitest";
import {
  renderReleaseStatusMarkdown,
  validateReleaseCandidateTruth,
  validateReleaseStatus
} from "../scripts/release-status-lib.mjs";

const baseContext = {
  packageJsonVersion: "0.6.20",
  packageLockRootVersion: "0.6.20",
  packageLockPackageVersion: "0.6.20",
  tauriConfigVersion: "0.6.20",
  cargoTomlVersion: "0.6.20",
  cargoLockVersion: "0.6.20",
  schemaVersion: "2",
  schemaAppVersion: "0.6.20"
};

const baseStatus = {
  schema: 1,
  sourceVersion: "0.6.20",
  projectSchemaVersion: 2,
  latestPublishedVersion: "0.6.19",
  latestPublishedTag: "pocket-daw-v0.6.19",
  latestPublishedCommit: "eee587c9afc39d89fa7893ea8a98e730c948a5e9",
  lastInstalledSmoke: {
    version: "0.6.10",
    commit: null,
    installerFile: "Pocket.DAW_0.6.10_x64-setup.exe",
    installerSha256: "c893ddcc545738c79fb72bd486b75cbe263534b466fcd4d2f593574d509fd00e",
    testedAt: "2026-06-19",
    result: "pass",
    notes: ["Bootstrapper install smoke evidence is recorded for 0.6.10."]
  }
};

describe("release status source", () => {
  it("allows source, public release, and smoke versions to differ when explicit", () => {
    const validation = validateReleaseStatus(baseStatus, baseContext);

    expect(validation).toEqual({ ok: true, failures: [] });
  });

  it("fails stale or inconsistent source metadata", () => {
    const validation = validateReleaseStatus({ ...baseStatus, sourceVersion: "0.6.19" }, baseContext);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("release-status.json sourceVersion is 0.6.19, expected 0.6.20");
  });

  it("fails malformed installed-smoke pass evidence", () => {
    const validation = validateReleaseStatus(
      {
        ...baseStatus,
        lastInstalledSmoke: {
          ...baseStatus.lastInstalledSmoke,
          installerSha256: "not-a-sha"
        }
      },
      baseContext
    );

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("release-status.json lastInstalledSmoke.installerSha256 must be a 64-character SHA-256 hex string");
  });

  it("allows optional unreleased source-only notes when they are an array", () => {
    expect(validateReleaseStatus({ ...baseStatus, unreleasedSourceNotes: ["Implemented in source, not installed-smoked yet."] }, baseContext).ok).toBe(true);
    const validation = validateReleaseStatus({ ...baseStatus, unreleasedSourceNotes: "not-array" }, baseContext);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("release-status.json unreleasedSourceNotes must be an array when present");
  });

  it("renders a Markdown status block from the machine-readable source", () => {
    const markdown = renderReleaseStatusMarkdown({ ...baseStatus, unreleasedSourceNotes: ["Stem ZIP source work is pending installed smoke."] });

    expect(markdown).toContain("Source version | `0.6.20`");
    expect(markdown).toContain("Latest published version | `0.6.19`");
    expect(markdown).toContain("Last installed-smoke version | `0.6.10`");
    expect(markdown).toContain("## Unreleased Source-Only Notes");
    expect(markdown).toContain("Stem ZIP source work is pending installed smoke.");
    expect(markdown).toContain("## Capability Claim Boundary");
    expect(markdown).toContain("Public release claims must be limited to");
    expect(markdown).toContain("Source-only notes describe current working-tree capability");
    expect(markdown).toContain("Candidate release claims require a fresh exact-artifact smoke attestation");
    expect(markdown).toContain("must not be described as public or installed-smoked");
  });

  it("blocks same-version release candidates when source has moved past the published commit", () => {
    const validation = validateReleaseCandidateTruth({
      ...baseStatus,
      latestPublishedVersion: baseStatus.sourceVersion,
      latestPublishedTag: `pocket-daw-v${baseStatus.sourceVersion}`
    }, baseContext, {
      currentCommit: "a".repeat(40)
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("sourceVersion matches latestPublishedVersion");
    expect(validation.failures.join("\n")).toContain("bump the next Pocket DAW checkpoint version before packaging/publishing source-only changes");
  });

  it("blocks same-version release candidates when source-only notes are present", () => {
    const validation = validateReleaseCandidateTruth({
      ...baseStatus,
      latestPublishedVersion: baseStatus.sourceVersion,
      latestPublishedTag: `pocket-daw-v${baseStatus.sourceVersion}`,
      latestPublishedCommit: baseStatus.lastInstalledSmoke.commit || baseStatus.latestPublishedCommit,
      unreleasedSourceNotes: ["Source-only after 0.6.20: a feature still needs installed smoke."]
    }, baseContext, {
      currentCommit: baseStatus.latestPublishedCommit
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("unreleasedSourceNotes must be empty when sourceVersion matches latestPublishedVersion");
  });

  it("allows a bumped source candidate with source-only notes", () => {
    const validation = validateReleaseCandidateTruth({
      ...baseStatus,
      sourceVersion: "0.6.21",
      unreleasedSourceNotes: ["Source-only after 0.6.20: next checkpoint feature."]
    }, {
      ...baseContext,
      packageJsonVersion: "0.6.21",
      packageLockRootVersion: "0.6.21",
      packageLockPackageVersion: "0.6.21",
      tauriConfigVersion: "0.6.21",
      cargoTomlVersion: "0.6.21",
      cargoLockVersion: "0.6.21",
      schemaAppVersion: "0.6.21"
    }, {
      currentCommit: "a".repeat(40)
    });

    expect(validation).toEqual({ ok: true, failures: [] });
  });

  it("allows an exact published checkpoint with no source-only notes", () => {
    const validation = validateReleaseCandidateTruth({
      ...baseStatus,
      latestPublishedVersion: baseStatus.sourceVersion,
      latestPublishedTag: `pocket-daw-v${baseStatus.sourceVersion}`,
      latestPublishedCommit: "a".repeat(40),
      unreleasedSourceNotes: []
    }, baseContext, {
      currentCommit: "a".repeat(40)
    });

    expect(validation).toEqual({ ok: true, failures: [] });
  });
});
