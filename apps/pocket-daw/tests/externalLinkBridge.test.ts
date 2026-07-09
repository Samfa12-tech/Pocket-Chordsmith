import { describe, expect, it } from "vitest";
import { normalizeExternalUrl, openExternalUrlNative, type NativeExternalLinkApi } from "../src/native/externalLinkBridge";

describe("external link bridge", () => {
  it("normalizes only expected external URL schemes", () => {
    expect(normalizeExternalUrl(" https://samfa12.com ")).toBe("https://samfa12.com");
    expect(normalizeExternalUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
    expect(normalizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalUrl("")).toBeNull();
  });

  it("uses the native app command when Tauri is available", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeExternalLinkApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return true as never;
      }
    };

    await expect(openExternalUrlNative("https://samfa12.com", api)).resolves.toBe(true);
    expect(calls).toEqual([{ command: "open_external_url", args: { url: "https://samfa12.com" } }]);
  });

  it("does not route unsafe or unavailable URLs through native commands", async () => {
    const calls: string[] = [];
    const unavailable: NativeExternalLinkApi = {
      isAvailable: () => false,
      async invoke(command) {
        calls.push(command);
        return true as never;
      }
    };
    const available: NativeExternalLinkApi = {
      isAvailable: () => true,
      async invoke(command) {
        calls.push(command);
        return true as never;
      }
    };

    await expect(openExternalUrlNative("https://samfa12.com", unavailable)).resolves.toBe(false);
    await expect(openExternalUrlNative("file:///C:/secret.txt", available)).resolves.toBe(false);
    expect(calls).toEqual([]);
  });
});
