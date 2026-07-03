import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import schema from "../releases/smoke-attestation.schema.json" with { type: "json" };
import { REQUIRED_SMOKE_CHECK_IDS, validateSmokeAttestation } from "../scripts/verify-smoke-attestation.mjs";

function sha256(value: string | NodeJS.ArrayBufferView) {
  return createHash("sha256").update(value).digest("hex");
}

function buildAttestation(overrides: Record<string, any> = {}) {
  const version = overrides.version || "0.6.20";
  const commit = overrides.commit || "e".repeat(40);
  const installerFile = overrides.installerFile || "Pocket.DAW_0.6.20_x64-setup.exe";
  const installerSha256 = overrides.installerSha256 || sha256("installer bytes");
  return {
    version,
    commit,
    installerFile,
    installerSha256,
    testedAt: "2026-06-21",
    result: "pass",
    machine: {
      windowsVersion: "Windows 11 24H2",
      architecture: "x64",
      audioInput: "Focusrite USB Audio",
      audioOutput: "Speakers (Realtek)"
    },
    checks: REQUIRED_SMOKE_CHECK_IDS.map((id) => ({ id, result: "pass", notes: `${id} covered` })),
    knownFailures: [],
    ...overrides
  };
}

describe("smoke attestation schema", () => {
  it("requires the exact-artifact smoke attestation fields", () => {
    expect(schema.required).toEqual([
      "version",
      "commit",
      "installerFile",
      "installerSha256",
      "testedAt",
      "result",
      "machine",
      "checks",
      "knownFailures"
    ]);
    expect(schema.properties.result.const).toBe("pass");
    expect(schema.properties.machine.required).toEqual([
      "windowsVersion",
      "architecture",
      "audioInput",
      "audioOutput"
    ]);
    expect(schema.properties.checks.items.required).toEqual(["id", "result"]);
  });
});

describe("smoke attestation verifier", () => {
  it("accepts an exact pass attestation", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-smoke-"));
    const installer = join(dir, "Pocket.DAW_0.6.20_x64-setup.exe");
    writeFileSync(installer, "installer bytes");
    const attestation = buildAttestation({
      installerFile: basename(installer),
      installerSha256: sha256(readFileSync(installer))
    });

    expect(validateSmokeAttestation(attestation, {
      version: "0.6.20",
      commit: attestation.commit,
      installerFile: basename(installer),
      installerSha256: attestation.installerSha256
    })).toEqual({ ok: true, failures: [] });
  });

  it("rejects wrong version, commit, filename, hash, result, and missing checks", () => {
    const base = buildAttestation();
    const cases: Array<[Record<string, any>, string]> = [
      [{ version: "0.6.19" }, "version"],
      [{ commit: "a".repeat(40) }, "commit"],
      [{ installerFile: "wrong.exe" }, "installerFile"],
      [{ installerSha256: sha256("rebuilt bytes") }, "installerSha256"],
      [{ result: "partial" }, "result must be pass"],
      [{ checks: base.checks.filter((check) => check.id !== REQUIRED_SMOKE_CHECK_IDS[0]) }, "missing required checks"]
    ];

    for (const [overrides, expectedMessage] of cases) {
      const validation = validateSmokeAttestation(buildAttestation(overrides), {
        version: "0.6.20",
        commit: "e".repeat(40),
        installerFile: "Pocket.DAW_0.6.20_x64-setup.exe",
        installerSha256: sha256("installer bytes")
      });
      expect(validation.ok).toBe(false);
      expect(validation.failures.join("\n")).toContain(expectedMessage);
    }
  });

  it("requires native media reliability, punch take-lane and game-pack target smoke checks", () => {
    expect(REQUIRED_SMOKE_CHECK_IDS).toEqual(expect.arrayContaining([
      "native-media-reliability",
      "punch-take-lane-recording",
      "game-pack-target-smoke"
    ]));

    const validation = validateSmokeAttestation(buildAttestation({
      checks: REQUIRED_SMOKE_CHECK_IDS
        .filter((id) => id !== "native-media-reliability" && id !== "punch-take-lane-recording" && id !== "game-pack-target-smoke")
        .map((id) => ({ id, result: "pass" }))
    }), {
      version: "0.6.20",
      commit: "e".repeat(40),
      installerFile: "Pocket.DAW_0.6.20_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("native-media-reliability");
    expect(validation.failures.join("\n")).toContain("punch-take-lane-recording");
    expect(validation.failures.join("\n")).toContain("game-pack-target-smoke");
  });

  it("rejects a rebuilt installer when the attestation hash is stale", () => {
    const original = sha256("installer bytes v1");
    const rebuilt = sha256("installer bytes v2");
    const attestation = buildAttestation({
      installerSha256: original
    });

    const validation = validateSmokeAttestation(attestation, {
      version: "0.6.20",
      commit: attestation.commit,
      installerFile: attestation.installerFile,
      installerSha256: rebuilt
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("installerSha256");
    expect(validation.failures.join("\n")).toContain("current installer hash");
  });

  it("rejects missing machine details and non-pass check entries", () => {
    const attestation = buildAttestation({
      machine: {
        windowsVersion: "Windows 11 24H2",
        architecture: "x64",
        audioInput: "Focusrite USB Audio"
      },
      checks: [
        ...REQUIRED_SMOKE_CHECK_IDS.slice(0, -1).map((id) => ({ id, result: "pass" })),
        { id: REQUIRED_SMOKE_CHECK_IDS.at(-1), result: "fail" }
      ]
    });

    const validation = validateSmokeAttestation(attestation, {
      version: "0.6.20",
      commit: attestation.commit,
      installerFile: attestation.installerFile,
      installerSha256: attestation.installerSha256
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("machine.audioOutput");
    expect(validation.failures.join("\n")).toContain("checks must all pass");
  });
});
