import { setCachedAudioBuffer, type CachedAudioBuffer } from "./audioBufferCache";
import type { ImportedAudioBytes } from "../native/mediaBridge";

export interface DecodedAudioImport {
  source: ImportedAudioBytes;
  cached: CachedAudioBuffer;
}

export async function decodeImportedAudio(ctx: BaseAudioContext, mediaPoolItemId: string, source: ImportedAudioBytes): Promise<DecodedAudioImport> {
  try {
    const copy = source.bytes.slice(0);
    const buffer = await ctx.decodeAudioData(copy);
    return { source, cached: setCachedAudioBuffer(mediaPoolItemId, buffer) };
  } catch {
    throw new Error(`Could not decode ${source.name}. This format may not be supported by this Web Audio runtime.`);
  }
}
