import { analyseDeliveryWav, analyseFinishWav, type FinishAnalysisRange } from "./finishAnalysis";

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ buffer: ArrayBuffer; range: FinishAnalysisRange; mode?: "delivery" }>) => void) | null;
  postMessage: (value: unknown) => void;
};
worker.onmessage = async ({ data }) => {
  worker.postMessage({ phase: "analysing" });
  try {
    if (data.mode === "delivery") {
      const delivery = analyseDeliveryWav(data.buffer);
      if (globalThis.crypto?.subtle) {
        try {
          const digest = await globalThis.crypto.subtle.digest("SHA-256", data.buffer);
          delivery.byteSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        } catch { delivery.byteSha256 = null; }
      }
      worker.postMessage({ ok: true, delivery });
    } else worker.postMessage({ ok: true, measurements: analyseFinishWav(data.buffer, data.range) });
  }
  catch (error) { worker.postMessage({ ok: false, error: error instanceof Error ? error.message : "Finish analysis failed." }); }
};
