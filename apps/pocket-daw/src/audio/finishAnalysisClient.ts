import type { DeliveryAnalysis, FinishAnalysisRange, FinishMeasurements } from "./finishAnalysis";

export function analyseFinishWavOffThread(buffer: ArrayBuffer, range: FinishAnalysisRange, signal: AbortSignal): Promise<FinishMeasurements> {
  return analyseInWorker(buffer, { range }, "measurements", signal);
}

export function analyseDeliveryWavOffThread(buffer: ArrayBuffer, signal: AbortSignal): Promise<DeliveryAnalysis> {
  return analyseInWorker(buffer, { mode: "delivery" }, "delivery", signal);
}

function analyseInWorker<T>(buffer: ArrayBuffer, request: Record<string, unknown>, resultField: string, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Finish analysis cancelled.", "AbortError")); return; }
    const worker = new Worker(new URL("./finishAnalysis.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Finish analysis cancelled.", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => { cleanup(); reject(new Error("Finish analysis worker failed.")); };
    worker.onmessage = ({ data }) => {
      if (data.phase === "analysing") return;
      cleanup();
      if (data.ok) resolve(data[resultField] as T);
      else reject(new Error(data.error || "Finish analysis failed."));
    };
    try { worker.postMessage({ buffer, ...request }, [buffer]); }
    catch (error) { cleanup(); reject(error); }
  });
}
