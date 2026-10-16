import { analyseDeliveryWavOffThread } from "./finishAnalysisClient";
import { finishAudioWarnings, MAX_DELIVERY_ANALYSIS_BYTES, type DeliveryAnalysis } from "./finishAnalysis";

export interface DeliveryQcState {
  phase: "idle" | "deferred" | "analysing" | "ready" | "cancelled" | "failed" | "unavailable";
  fileName: string;
  bytes: number;
  projectTitle: string;
  requestedAt: string;
  message: string;
  analysis: DeliveryAnalysis | null;
  warnings: string[];
  canRetry: boolean;
  projectChanged: boolean;
}

export const initialDeliveryQcState = (): DeliveryQcState => ({ phase: "idle", fileName: "", bytes: 0, projectTitle: "", requestedAt: "", message: "Export Full WAV to check its final bytes after normalization, dither and channel conversion.", analysis: null, warnings: [], canRetry: false, projectChanged: false });

/** Owns only immutable download bytes. It never writes a project or transport. */
export class DeliveryQcJob {
  private generation = 0;
  private controller: AbortController | null = null;
  private blob: Blob | null = null;
  private state = initialDeliveryQcState();
  constructor(private changed: (state: DeliveryQcState) => void, private analyse = analyseDeliveryWavOffThread) {}

  queue(blob: Blob, fileName: string, projectTitle: string, defer: boolean) {
    this.generation++;
    this.controller?.abort(); this.controller = null; this.blob = null;
    this.state = { ...initialDeliveryQcState(), fileName, bytes: blob.size, projectTitle, requestedAt: new Date().toISOString() };
    if (blob.size > MAX_DELIVERY_ANALYSIS_BYTES) {
      this.publish({ phase: "unavailable", message: "Download requested. Check not run: this WAV exceeds the 128 MiB analysis limit." }); return;
    }
    this.blob = blob;
    if (defer) this.publish({ phase: "deferred", canRetry: true, message: "Download requested. Stop playback/recording, then choose Check WAV. No check has run." });
    else void this.start();
  }

  async start() {
    if (!this.blob) return;
    const blob = this.blob, generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController(); this.controller = controller;
    this.publish({ phase: "analysing", canRetry: false, message: "Checking the downloaded WAV. Cancel check leaves your download intact.", analysis: null, warnings: [] });
    try {
      const bytes = await blob.arrayBuffer();
      if (generation !== this.generation) return;
      const analysis = await this.analyse(bytes, controller.signal);
      if (generation !== this.generation) return;
      if (analysis.byteLength !== blob.size) throw new Error("WAV check response does not match the downloaded file size.");
      const warnings = finishAudioWarnings(analysis.measurements).map(warning => warning.replace("before export", "before using this file").replace("No usable integrated loudness reading: choose a longer audible passage.", "Integrated loudness is unavailable for this file (silence or too short)."));
      this.blob = null; this.controller = null;
      this.publish({ phase: "ready", analysis, warnings, canRetry: false, message: "Check complete: decoded from the exact WAV bytes handed to download. Values are estimates." });
    } catch (error) {
      if (generation !== this.generation) return;
      this.controller = null;
      this.publish({ phase: "failed", canRetry: true, message: `Check failed; the download is unchanged. ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  cancel(message = "Check cancelled. Your download is unchanged; no completed check is claimed.") {
    if (this.state.phase !== "analysing" && this.state.phase !== "deferred") return;
    this.generation++; this.controller?.abort(); this.controller = null;
    this.publish({ phase: "cancelled", canRetry: !!this.blob, message });
  }

  private publish(patch: Partial<DeliveryQcState>) { this.state = { ...this.state, ...patch }; this.changed(this.state); }
}
