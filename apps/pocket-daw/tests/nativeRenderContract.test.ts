import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NATIVE_AUDIO_RENDERER_CONTRACT_VERSION } from "../src/audio/nativeRenderCache";

describe("native audio renderer cache contract", () => {
  it("changes when native cached/procedural parity-sensitive renderer code changes", () => {
    const nativeAudio = readFileSync(join(process.cwd(), "src-tauri", "src", "native_audio.rs"), "utf8");
    const hash = hashString([
      sourceLine(nativeAudio, /^const NATIVE_ACTIVE_SOURCE_LIMIT_PER_TRACK:.*$/m),
      sourceSection(nativeAudio, "fn render_generated_event_source", "fn sanitize_loop_region"),
      sourceSection(nativeAudio, "fn render_region_sample", "fn validate_asset"),
      sourceSection(nativeAudio, "fn render_event_sample", "impl EventSeed for NativeRenderedEvent")
    ].join("\n---native-render-contract---\n"));

    expect(NATIVE_AUDIO_RENDERER_CONTRACT_VERSION).toContain(hash);
  });
});

function sourceLine(source: string, pattern: RegExp): string {
  const match = source.match(pattern);
  if (!match) throw new Error(`Missing native renderer contract line: ${pattern}`);
  return match[0];
}

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Missing native renderer contract section: ${start}..${end}`);
  return source.slice(startIndex, endIndex);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
