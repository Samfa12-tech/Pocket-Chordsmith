import { describe, expect, it, vi } from "vitest";
import { openExternalUrlWithFallback, selectTrackHeader } from "../src/app/interactionContracts";

describe("App interaction contracts", () => {
  it("clears stale clip selection when a plain track header is selected", () => {
    expect(selectTrackHeader({ selectedTrackId: "drums", selectedClipId: "clip-1", selectedClipIds: ["clip-1", "clip-2"], untouched: true }, "bass")).toEqual({
      selectedTrackId: "bass", selectedClipId: null, selectedClipIds: [], untouched: true
    });
  });

  it("uses the native external-link bridge when available", async () => {
    const openNative = vi.fn(async () => true);
    const openBrowser = vi.fn(() => true);
    const replaceLocation = vi.fn();
    await expect(openExternalUrlWithFallback("https://samfa12.com", { openNative, nativeBridgeAvailable: () => true, openBrowser, replaceLocation })).resolves.toBe("native-opened");
    expect(openNative).toHaveBeenCalledWith("https://samfa12.com");
    expect(openBrowser).not.toHaveBeenCalled();
    expect(replaceLocation).not.toHaveBeenCalled();
  });

  it("uses browser fallback only when the native bridge is unavailable", async () => {
    const openBrowser = vi.fn(() => true);
    const replaceLocation = vi.fn();
    await expect(openExternalUrlWithFallback("mailto:sam@example.test", { openNative: async () => false, nativeBridgeAvailable: () => false, openBrowser, replaceLocation })).resolves.toBe("location-fallback");
    expect(openBrowser).not.toHaveBeenCalled();
    expect(replaceLocation).toHaveBeenCalledWith("mailto:sam@example.test");
    await expect(openExternalUrlWithFallback("https://samfa12.com", { openNative: async () => false, nativeBridgeAvailable: () => false, openBrowser, replaceLocation })).resolves.toBe("browser-opened");
    expect(openBrowser).toHaveBeenCalledWith("https://samfa12.com");
  });

  it("does not leak a failed native-link action into a browser fallback", async () => {
    const openBrowser = vi.fn(() => true);
    const replaceLocation = vi.fn();
    await expect(openExternalUrlWithFallback("https://samfa12.com", { openNative: async () => false, nativeBridgeAvailable: () => true, openBrowser, replaceLocation })).resolves.toBe("native-failed");
    expect(openBrowser).not.toHaveBeenCalled();
    expect(replaceLocation).not.toHaveBeenCalled();
  });
});
