import type { FinishAnalysisRange, FinishMeasurements } from "./finishAnalysis";

export function analyseFinishWavOffThread(buffer: ArrayBuffer, range: FinishAnalysisRange, signal: AbortSignal): Promise<FinishMeasurements> {
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
      if (data.ok) resolve(data.measurements as FinishMeasurements);
      else reject(new Error(data.error || "Finish analysis failed."));
    };
    try { worker.postMessage({ buffer, range }, [buffer]); }
    catch (error) { cleanup(); reject(error); }
  });
}
