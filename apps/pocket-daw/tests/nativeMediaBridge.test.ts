import { describe, expect, it } from "vitest";
import {
  collectProjectMediaNative,
  importAudioMediaNative,
  loadAudioMediaNative,
  readNativeCacheAsset,
  relinkAudioMediaNative,
  renderNativeAudioWav,
  writeNativeCacheAsset,
  type NativeMediaApi
} from "../src/native/mediaBridge";
import type { NativeAudioStartPayload } from "../src/native/audioPlayback";

describe("native media bridge", () => {
  it("reads native audio payloads for import, reload and relink", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return { path: "C:\\Audio\\Loop.wav", label: "Loop.wav", mimeType: "audio/wav", sizeBytes: 4, bytes: [1, 2, 3, 4] } as never;
      }
    };

    await expect(importAudioMediaNative(api)).resolves.toMatchObject({ name: "Loop.wav", uri: "C:\\Audio\\Loop.wav", mode: "native" });
    await expect(relinkAudioMediaNative(api)).resolves.toMatchObject({ name: "Loop.wav", uri: "C:\\Audio\\Loop.wav", mode: "native" });
    await expect(loadAudioMediaNative("project-media/Loop.wav", "C:\\Songs\\Song.pocketdaw", api)).resolves.toMatchObject({ name: "Loop.wav", mode: "native" });

    expect(calls.map((call) => call.command)).toEqual(["open_audio_media_file", "open_audio_media_file", "read_audio_media_file"]);
    expect(calls[2].args).toMatchObject({ path: "project-media/Loop.wav", projectFilePath: "C:\\Songs\\Song.pocketdaw" });
  });

  it("sends collect-media requests to the native runtime", async () => {
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        expect(command).toBe("collect_project_media");
        expect(args).toMatchObject({
          projectFilePath: "C:\\Songs\\Song.pocketdaw",
          items: [{ id: "media_001", sourceUri: "C:\\Audio\\Loop.wav", targetRelativePath: "project-media/Loop.wav" }]
        });
        return [{
          id: "media_001",
          sourceUri: "C:\\Audio\\Loop.wav",
          targetPath: "C:\\Songs\\project-media\\Loop.wav",
          targetRelativePath: "project-media/Loop.wav",
          sizeBytes: 1234
        }] as never;
      }
    };

    await expect(collectProjectMediaNative("C:\\Songs\\Song.pocketdaw", [{
      id: "media_001",
      sourceUri: "C:\\Audio\\Loop.wav",
      targetRelativePath: "project-media/Loop.wav"
    }], api)).resolves.toEqual([{
      id: "media_001",
      sourceUri: "C:\\Audio\\Loop.wav",
      targetPath: "C:\\Songs\\project-media\\Loop.wav",
      targetRelativePath: "project-media/Loop.wav",
      sizeBytes: 1234
    }]);
  });

  it("writes and reads durable native cache assets through project-relative paths", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        if (command === "write_native_cache_asset") {
          return {
            assetId: "native-cache-a",
            path: "C:\\Songs\\project-cache\\native-audio\\native-cache-a.wav",
            relativePath: "project-cache/native-audio/native-cache-a.wav",
            sizeBytes: 4
          } as never;
        }
        return {
          assetId: "native-cache-a",
          path: "C:\\Songs\\project-cache\\native-audio\\native-cache-a.wav",
          relativePath: "project-cache/native-audio/native-cache-a.wav",
          sizeBytes: 4,
          bytes: [1, 2, 3, 4]
        } as never;
      }
    };

    await expect(writeNativeCacheAsset("C:\\Songs\\Song.pocketdaw", {
      assetId: "native-cache-a",
      relativePath: "project-cache/native-audio/native-cache-a.wav",
      bytes: new Uint8Array([1, 2, 3, 4])
    }, api)).resolves.toMatchObject({ assetId: "native-cache-a", sizeBytes: 4 });
    await expect(readNativeCacheAsset("C:\\Songs\\Song.pocketdaw", "native-cache-a", "project-cache/native-audio/native-cache-a.wav", api)).resolves.toMatchObject({
      assetId: "native-cache-a",
      relativePath: "project-cache/native-audio/native-cache-a.wav"
    });

    expect(calls.map((call) => call.command)).toEqual(["write_native_cache_asset", "read_native_cache_asset"]);
    expect(calls[0].args).toMatchObject({
      projectFilePath: "C:\\Songs\\Song.pocketdaw",
      assetId: "native-cache-a",
      relativePath: "project-cache/native-audio/native-cache-a.wav",
      bytes: [1, 2, 3, 4]
    });
  });

  it("requests native offline WAV rendering with the native audio payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const payload: NativeAudioStartPayload = {
      projectTitle: "Render Test",
      sampleRate: 48_000,
      startSeconds: 0,
      outputDeviceId: null,
      loop: null,
      metronome: null,
      sidechain: null,
      tracks: [],
      events: [],
      fxChains: [],
      assets: [],
      regions: []
    };
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return {
          sampleRate: 48_000,
          channels: 2,
          durationSeconds: 0.5,
          sizeBytes: 48,
          bytes: [82, 73, 70, 70]
        } as never;
      }
    };

    await expect(renderNativeAudioWav(payload, 0.5, api)).resolves.toMatchObject({
      sampleRate: 48_000,
      channels: 2,
      bytes: [82, 73, 70, 70]
    });
    expect(calls).toEqual([{
      command: "native_audio_render_wav",
      args: { payload, durationSeconds: 0.5 }
    }]);
  });

  it("returns null outside the native runtime", async () => {
    const api: NativeMediaApi = { isAvailable: () => false, invoke: async () => null as never };

    await expect(importAudioMediaNative(api)).resolves.toBeNull();
    await expect(loadAudioMediaNative("project-media/Loop.wav", null, api)).resolves.toBeNull();
    await expect(collectProjectMediaNative("C:\\Songs\\Song.pocketdaw", [], api)).resolves.toBeNull();
    await expect(writeNativeCacheAsset("C:\\Songs\\Song.pocketdaw", { assetId: "asset", relativePath: "project-cache/native-audio/asset.wav", bytes: [] }, api)).resolves.toBeNull();
    await expect(readNativeCacheAsset("C:\\Songs\\Song.pocketdaw", "asset", "project-cache/native-audio/asset.wav", api)).resolves.toBeNull();
    await expect(renderNativeAudioWav({
      projectTitle: "Unavailable",
      sampleRate: 48_000,
      startSeconds: 0,
      outputDeviceId: null,
      tracks: [],
      events: [],
      fxChains: []
    }, 1, api)).resolves.toBeNull();
  });
});
