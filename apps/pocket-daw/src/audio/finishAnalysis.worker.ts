import { analyseFinishWav, type FinishAnalysisRange } from "./finishAnalysis";

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ buffer: ArrayBuffer; range: FinishAnalysisRange }>) => void) | null;
  postMessage: (value: unknown) => void;
};
worker.onmessage = ({ data }) => {
  worker.postMessage({ phase: "analysing" });
  try { worker.postMessage({ ok: true, measurements: analyseFinishWav(data.buffer, data.range) }); }
  catch (error) { worker.postMessage({ ok: false, error: error instanceof Error ? error.message : "Finish analysis failed." }); }
};
