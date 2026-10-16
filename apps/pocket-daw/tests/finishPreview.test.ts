import { describe, expect, it } from "vitest";
import { NativeFinishPreview } from "../src/native/finishPreview";
import type { NativeAudioStartPayload } from "../src/native/audioPlayback";
import type { NativeMediaApi } from "../src/native/mediaBridge";

const payload = {} as NativeAudioStartPayload;
const file = { sourcePath: "owned-cache/preview.wav", sampleRate: 48000, channels: 2, durationSeconds: 2, sizeBytes: 768044 };

describe("owned native Finish preview lifecycle", () => {
  it("discards a reservation that arrives after cancellation and never starts rendering", async () => {
    let release!: (id: string) => void;
    const reservation = new Promise<string>(resolve => { release = resolve; });
    const calls: string[] = [];
    const api = { isAvailable: () => true, invoke: async (command: string) => { calls.push(command); return command === "native_finish_preview_begin" ? reservation : undefined; } } as NativeMediaApi;
    const preview = new NativeFinishPreview(api);
    const pending = preview.prepare(payload, 2);
    await preview.dispose(); release("owned-id");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual(["native_finish_preview_begin", "native_finish_preview_discard"]);
  });
  it("cancels an in-flight render, rejects its late file and uses only owned IDs for cleanup", async () => {
    let release!: (value: typeof file) => void;
    const rendered = new Promise<typeof file>(resolve => { release = resolve; });
    const calls: Array<[string, unknown]> = [];
    const api = { isAvailable: () => true, invoke: async (command: string, args: unknown) => { calls.push([command, args]); return command === "native_finish_preview_begin" ? "owned-id" : command === "native_finish_preview_prepare" ? rendered : undefined; } } as NativeMediaApi;
    const preview = new NativeFinishPreview(api);
    const pending = preview.prepare(payload, 2);
    await Promise.resolve(); await Promise.resolve();
    await preview.dispose(); release(file);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.filter(([command]) => command === "native_finish_preview_discard").every(([, args]) => JSON.stringify(args) === '{"id":"owned-id"}')).toBe(true);
    await expect(preview.read("owned-id")).rejects.toMatchObject({ name: "AbortError" });
  });
  it("uses binary transport and releases both files without changing project media", async () => {
    let next = 0;
    const discarded: unknown[] = [];
    const bytes = new ArrayBuffer(44);
    const api = { isAvailable: () => true, invoke: async (command: string, args: unknown) => {
      if (command === "native_finish_preview_begin") return `owned-${++next}`;
      if (command === "native_finish_preview_prepare") return file;
      if (command === "native_finish_preview_read") return bytes;
      if (command === "native_finish_preview_discard") discarded.push(args);
    } } as NativeMediaApi;
    const preview = new NativeFinishPreview(api);
    const a = await preview.prepare(payload, 2), b = await preview.prepare(payload, 2);
    expect(await preview.read(a.id)).toBe(bytes);
    expect(a.file).toEqual(b.file);
    await preview.dispose();
    expect(discarded).toEqual([{ id: "owned-1" }, { id: "owned-2" }]);
  });
});
