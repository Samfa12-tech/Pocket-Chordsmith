export interface CachedAudioBuffer {
  id: string;
  buffer: AudioBuffer;
  durationSeconds: number;
  channels: number;
  sampleRate: number;
  peaks: number[];
  loadedAt: string;
}

const cache = new Map<string, CachedAudioBuffer>();

export function setCachedAudioBuffer(id: string, buffer: AudioBuffer): CachedAudioBuffer {
  const cached = {
    id,
    buffer,
    durationSeconds: buffer.duration,
    channels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    peaks: audioBufferPeaks(buffer),
    loadedAt: new Date().toISOString()
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
  const length = Math.max(1, buffer.length);
  const bucketSize = Math.max(1, Math.floor(length / buckets));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (let start = 0; start < length; start += bucketSize) {
    let peak = 0;
    const end = Math.min(length, start + bucketSize);
    for (let i = start; i < end; i += 1) {
      channels.forEach((channel) => {
        peak = Math.max(peak, Math.abs(channel[i] || 0));
      });
    }
    out.push(Number(Math.min(1, peak).toFixed(3)));
  }
  return out.slice(0, buckets);
}
