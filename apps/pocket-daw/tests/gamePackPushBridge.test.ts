import { describe, expect, it, vi } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { createGameExportManifest } from "../src/daw/exportJobs";
import { GODOT_GAME_PACK_PUSH_DEFAULT_URL, isLoopbackHttpUrl, pushGamePackToGodot } from "../src/native/gamePackPushBridge";

describe("Godot game-pack push bridge", () => {
  it("accepts only http loopback push endpoints", () => {
    expect(isLoopbackHttpUrl(GODOT_GAME_PACK_PUSH_DEFAULT_URL)).toBe(true);
    expect(isLoopbackHttpUrl("http://localhost:47859/pocket-daw/godot/game-pack")).toBe(true);
    expect(isLoopbackHttpUrl("https://127.0.0.1:47859/pocket-daw/godot/game-pack")).toBe(false);
    expect(isLoopbackHttpUrl("http://192.168.1.10:47859/pocket-daw/godot/game-pack")).toBe(false);
    expect(isLoopbackHttpUrl("file:///tmp/pack.zip")).toBe(false);
  });

  it("posts a ZIP blob with manifest headers to the local Godot endpoint", async () => {
    const manifest = createGameExportManifest(createDemoProject(), "godot-adaptive-pack");
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(Blob);
      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/zip");
      expect(headers["X-Pocket-Daw-Pack-Kind"]).toBe("godot-adaptive-pack");
      expect(headers["X-Pocket-Daw-Manifest"]).toBe(manifest.manifestFile);
      expect(headers["X-Pocket-Daw-Filename"]).toBe("demo-godot.zip");
      return new Response("Imported Godot pack.", { status: 200 });
    });

    const result = await pushGamePackToGodot({
      blob: new Blob(["zip"], { type: "application/zip" }),
      fileName: "demo-godot.zip",
      manifest,
      fetchImpl
    });

    expect(result).toMatchObject({
      ok: true,
      pushed: true,
      fallbackRequired: false,
      status: 200,
      message: "Imported Godot pack.",
      manifestKind: "godot-adaptive-pack",
      manifestFile: manifest.manifestFile
    });
    expect(fetchImpl).toHaveBeenCalledWith(GODOT_GAME_PACK_PUSH_DEFAULT_URL, expect.any(Object));
  });

  it("returns a fallback-required result for unavailable or rejected endpoints", async () => {
    const manifest = createGameExportManifest(createDemoProject(), "godot-adaptive-pack");
    const rejected = await pushGamePackToGodot({
      blob: new Blob(["zip"], { type: "application/zip" }),
      fileName: "demo-godot.zip",
      manifest,
      fetchImpl: async () => new Response("No receiver", { status: 404 })
    });
    const unavailable = await pushGamePackToGodot({
      blob: new Blob(["zip"], { type: "application/zip" }),
      fileName: "demo-godot.zip",
      manifest,
      fetchImpl: async () => {
        throw new TypeError("connection refused");
      }
    });

    expect(rejected).toMatchObject({ ok: false, pushed: false, fallbackRequired: true, status: 404, message: "No receiver" });
    expect(unavailable).toMatchObject({ ok: false, pushed: false, fallbackRequired: true });
    expect(unavailable.message).toContain("unavailable");
  });

  it("rejects non-loopback endpoints without sending the pack", async () => {
    const manifest = createGameExportManifest(createDemoProject(), "godot-adaptive-pack");
    const fetchImpl = vi.fn();

    const result = await pushGamePackToGodot({
      blob: new Blob(["zip"], { type: "application/zip" }),
      fileName: "demo-godot.zip",
      manifest,
      endpointUrl: "https://example.com/import",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: false, pushed: false, fallbackRequired: true });
    expect(result.message).toContain("loopback");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
