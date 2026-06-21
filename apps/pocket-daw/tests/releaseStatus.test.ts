import { describe, expect, it } from "vitest";
import {
  renderReleaseStatusMarkdown,
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

  it("renders a Markdown status block from the machine-readable source", () => {
    const markdown = renderReleaseStatusMarkdown(baseStatus);

    expect(markdown).toContain("Source version | `0.6.20`");
    expect(markdown).toContain("Latest published version | `0.6.19`");
    expect(markdown).toContain("Last installed-smoke version | `0.6.10`");
    expect(markdown).toContain("must not be described as public or installed-smoked");
  });
});
