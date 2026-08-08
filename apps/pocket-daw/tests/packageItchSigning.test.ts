import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  signUpdaterArtifact,
  updaterSignerChildEnvironment,
  updaterSigningKeyPath
} from "../scripts/package-itch.mjs";

describe("Pocket DAW updater artifact signing", () => {
  it("uses one explicit key path without forwarding an inherited inline key", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-signing-env-"));
    const keyPath = join(dir, "tauri-updater.key");
    writeFileSync(keyPath, "test-key-placeholder");
    const sourceEnv: NodeJS.ProcessEnv = {
      USERPROFILE: dir,
      TAURI_SIGNING_PRIVATE_KEY: keyPath,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "test-passphrase",
      RELEASE_SENTINEL: "retained"
    };

    let invocation: { command: string; args: string[]; env: NodeJS.ProcessEnv } | null = null;
    signUpdaterArtifact(join(dir, "Pocket DAW_setup.exe"), {
      sourceEnv,
      run(command, args, options) {
        if (!options?.env) throw new Error("Signer child environment was not supplied.");
        invocation = { command, args, env: options.env };
      }
    });

    expect(invocation).not.toBeNull();
    expect(invocation!.args).toContain("--private-key-path");
    expect(invocation!.args[invocation!.args.indexOf("--private-key-path") + 1]).toBe(keyPath);
    expect(invocation!.args).not.toContain("test-passphrase");
    expect(invocation!.env.TAURI_SIGNING_PRIVATE_KEY).toBeUndefined();
    expect(invocation!.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD).toBe("test-passphrase");
    expect(invocation!.env.RELEASE_SENTINEL).toBe("retained");
  });

  it("keeps non-interactive empty-password behavior without mutating the parent environment", () => {
    const sourceEnv: NodeJS.ProcessEnv = { TAURI_SIGNING_PRIVATE_KEY: "inline-key", RELEASE_SENTINEL: "retained" };

    const childEnv = updaterSignerChildEnvironment(sourceEnv) as NodeJS.ProcessEnv;

    expect(childEnv.TAURI_SIGNING_PRIVATE_KEY).toBeUndefined();
    expect(childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD).toBe("");
    expect(childEnv.RELEASE_SENTINEL).toBe("retained");
    expect(sourceEnv.TAURI_SIGNING_PRIVATE_KEY).toBe("inline-key");
    expect(sourceEnv).not.toHaveProperty("TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
  });

  it("fails closed when no configured or fallback signing key file exists", () => {
    const emptyProfile = mkdtempSync(join(tmpdir(), "pocket-daw-missing-signing-key-"));

    expect(() => updaterSigningKeyPath({ USERPROFILE: emptyProfile })).toThrow(
      "Missing Tauri updater signing key file"
    );
  });
});
