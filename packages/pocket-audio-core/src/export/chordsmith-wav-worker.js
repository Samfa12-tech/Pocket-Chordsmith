import { renderPocketAudioWavBytes } from "../engine/offline-renderer.js";
import { PocketAudio } from "../engine/live-engine.js";

export async function renderChordsmithWavWorkerJob({ project, options }) {
  const engine = new PocketAudio({ audio: false, host: "Pocket Chordsmith WAV export" });
  await engine.loadProject(project);
  const wavBytes = renderPocketAudioWavBytes(engine.project, options);
  return {
    bytes: wavBytes.byteOffset === 0 && wavBytes.byteLength === wavBytes.buffer.byteLength
      ? wavBytes.buffer
      : wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength),
    type: "audio/wav",
  };
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("message", async (event) => {
    const { id, project, options } = event.data || {};
    if (typeof id !== "string" || !project || !options) return;
    self.postMessage({ id, state: "rendering" });
    try {
      const result = await renderChordsmithWavWorkerJob({ project, options });
      self.postMessage({ id, ok: true, ...result }, [result.bytes]);
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
