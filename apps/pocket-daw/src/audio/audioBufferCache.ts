export interface CachedAudioBuffer {
  id: string;
  buffer: AudioBuffer;
  durationSeconds: number;
  channels: number;
  sampleRate: number;
  peaks: number[];
  loadedAt: string;
  sourceBytes?: ArrayBuffer;
  sourceByteLength?: number;
  sourceByteHash?: string;
  sourceMimeType?: string;
  sourceUri?: string;
  sourceName?: string;
}

export interface CachedAudioBufferOptions {
  sourceBytes?: ArrayBuffer | Uint8Array | number[];
  sourceMimeType?: string;
  sourceUri?: string;
  sourceName?: string;
}

const cache = new Map<string, CachedAudioBuffer>();

export function setCachedAudioBuffer(id: string, buffer: AudioBuffer, options: CachedAudioBufferOptions = {}): CachedAudioBuffer {
  const sourceBytes = copySourceBytes(options.sourceBytes);
  const cached = {
    id,
    buffer,
    durationSeconds: buffer.duration,
    channels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    peaks: audioBufferPeaks(buffer),
    loadedAt: new Date().toISOString(),
    ...(sourceBytes ? {
      sourceBytes,
      sourceByteLength: sourceBytes.byteLength,
      sourceByteHash: hashBytes(sourceBytes),
      sourceMimeType: options.sourceMimeType,
      sourceUri: options.sourceUri,
      sourceName: options.sourceName
    } : {})
  };
  cache.set(id, cached);
  return cached;
}

export function getCachedAudioBuffer(id: string): CachedAudioBuffer | null {
  return cache.get(id) || null;
}

export function clearCachedAudioBuffer(id: string): void {
  cache.delete(id);
}

export function clearAudioBufferCache(): void {
  cache.clear();
}

export function audioBufferPeaks(buffer: AudioBuffer, buckets = 256): number[] {
  const out: number[] = [];
  const length = buffer.length;
  if (length === 0 || !Number.isFinite(buckets) || buckets <= 0) return out;
  const count = Math.min(length, Math.floor(buckets));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (let bucket = 0; bucket < count; bucket += 1) {
    let peak = 0;
    const start = Math.floor(bucket * length / count);
    const end = Math.floor((bucket + 1) * length / count);
    for (let i = start; i < end; i += 1) {
      channels.forEach((channel) => {
        peak = Math.max(peak, Math.abs(channel[i] || 0));
      });
    }
    out.push(Number(Math.min(1, peak).toFixed(3)));
  }
  return out;
}

function copySourceBytes(bytes: CachedAudioBufferOptions["sourceBytes"]): ArrayBuffer | undefined {
  if (!bytes) return undefined;
  const view = Array.isArray(bytes)
    ? Uint8Array.from(bytes)
    : bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes);
  return view.slice().buffer;
}

function hashBytes(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let hash = 2166136261;
  for (let index = 0; index < view.length; index += 1) {
    hash ^= view[index];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
