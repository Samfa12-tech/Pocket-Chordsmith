import type { NativeAudioStartPayload } from "./audioPlayback";
import type { NativeMediaApi } from "./mediaBridge";

export interface FinishPreviewFile {
  sourcePath: string;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  sizeBytes: number;
}

export class NativeFinishPreview {
  private ids = new Set<string>();
  private disposed = false;
  constructor(private api: NativeMediaApi = {
    isAvailable: () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,
    invoke: async <T>(command: string, args?: Record<string, unknown>) => (await import("@tauri-apps/api/core")).invoke<T>(command, args)
  }) {}

  async prepare(payload: NativeAudioStartPayload, durationSeconds: number): Promise<{ id: string; file: FinishPreviewFile }> {
    if (this.disposed) throw new DOMException("Finish preparation cancelled.", "AbortError");
    if (!this.api.isAvailable()) throw new Error("Finish comparison requires the native Windows app.");
    const id = await this.api.invoke<string>("native_finish_preview_begin");
    this.ids.add(id);
    if (this.disposed) { await this.discardId(id); throw new DOMException("Finish preparation cancelled.", "AbortError"); }
    try {
      const file = await this.api.invoke<FinishPreviewFile>("native_finish_preview_prepare", { id, payload, durationSeconds });
      if (this.disposed) { await this.discardId(id); throw new DOMException("Finish preparation cancelled.", "AbortError"); }
      return { id, file };
    } catch (error) { await this.discardId(id); throw error; }
  }

  async read(id: string): Promise<ArrayBuffer> {
    if (this.disposed || !this.ids.has(id)) throw new DOMException("Finish preparation cancelled.", "AbortError");
    const bytes = await this.api.invoke<ArrayBuffer>("native_finish_preview_read", { id });
    if (!(bytes instanceof ArrayBuffer)) throw new Error("Finish binary transport did not return a WAV buffer.");
    if (this.disposed) throw new DOMException("Finish preparation cancelled.", "AbortError");
    return bytes;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const results = await Promise.allSettled([...this.ids].map(id => this.discardId(id)));
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }

  private async discardId(id: string): Promise<void> {
    await this.api.invoke<void>("native_finish_preview_discard", { id });
    this.ids.delete(id);
  }
}
