export const WAV_EXPORT_LIMITS = Object.freeze({
  desktopWorkingBytes: 1024 * 1024 * 1024,
  mobileWorkingBytes: 384 * 1024 * 1024,
  constrainedMobileWorkingBytes: 256 * 1024 * 1024,
  desktopDurationSeconds: 20 * 60,
  mobileDurationSeconds: 6 * 60,
  workingBufferMultiplier: 5,
});

export function chooseWavExportBudget({
  userAgent = "",
  deviceMemory = null,
} = {}) {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(String(userAgent));
  const memoryGiB = Number(deviceMemory);
  const constrained =
    isMobile && Number.isFinite(memoryGiB) && memoryGiB > 0 && memoryGiB <= 4;
  return {
    isMobile,
    constrained,
    maximumWorkingBytes: constrained
      ? WAV_EXPORT_LIMITS.constrainedMobileWorkingBytes
      : isMobile
        ? WAV_EXPORT_LIMITS.mobileWorkingBytes
        : WAV_EXPORT_LIMITS.desktopWorkingBytes,
    maximumDurationSeconds: isMobile
      ? WAV_EXPORT_LIMITS.mobileDurationSeconds
      : WAV_EXPORT_LIMITS.desktopDurationSeconds,
  };
}

export function estimateWavExportResources({
  durationSeconds = Number.NaN,
  sampleRate = 44100,
  channels = 2,
  maximumWorkingBytes = WAV_EXPORT_LIMITS.desktopWorkingBytes,
  maximumDurationSeconds = WAV_EXPORT_LIMITS.desktopDurationSeconds,
  workingBufferMultiplier = WAV_EXPORT_LIMITS.workingBufferMultiplier,
} = {}) {
  const duration = Number(durationSeconds);
  const rate = Math.floor(Number(sampleRate));
  const channelCount = Math.floor(Number(channels));
  if (!Number.isFinite(duration) || duration <= 0)
    throw new TypeError("WAV duration must be a positive finite number.");
  if (!Number.isSafeInteger(rate) || rate < 8000 || rate > 192000)
    throw new TypeError("WAV sample rate is outside the supported range.");
  if (
    !Number.isSafeInteger(channelCount) ||
    channelCount < 1 ||
    channelCount > 8
  )
    throw new TypeError("WAV channel count is outside the supported range.");

  const frameCount = Math.ceil(duration * rate);
  if (!Number.isSafeInteger(frameCount))
    throw new RangeError("WAV frame count is too large.");
  const renderedBufferBytes =
    frameCount * channelCount * Float32Array.BYTES_PER_ELEMENT;
  const encodedPcmBytes =
    frameCount * channelCount * Int16Array.BYTES_PER_ELEMENT;
  const estimatedWorkingBytes =
    renderedBufferBytes * workingBufferMultiplier + encodedPcmBytes;
  const durationWithinLimit = duration <= maximumDurationSeconds;
  const memoryWithinLimit = estimatedWorkingBytes <= maximumWorkingBytes;
  return {
    ok: durationWithinLimit && memoryWithinLimit,
    durationSeconds: duration,
    sampleRate: rate,
    channels: channelCount,
    frameCount,
    renderedBufferBytes,
    encodedPcmBytes,
    estimatedWorkingBytes,
    maximumWorkingBytes,
    maximumDurationSeconds,
    durationWithinLimit,
    memoryWithinLimit,
  };
}

export function formatWavExportPreflightFailure(estimate) {
  const minutes = Math.ceil(estimate.durationSeconds / 6) / 10;
  const workingMiB = Math.ceil(estimate.estimatedWorkingBytes / 1024 / 1024);
  const limitMiB = Math.floor(estimate.maximumWorkingBytes / 1024 / 1024);
  return `This ${minutes}-minute WAV needs about ${workingMiB} MB of working memory (safe limit ${limitMiB} MB). Choose Current section in Export range, shorten the song, or export on a device with more memory.`;
}

globalThis.PocketChordsmithWavExportPreflight = Object.freeze({
  WAV_EXPORT_LIMITS,
  chooseWavExportBudget,
  estimateWavExportResources,
  formatWavExportPreflightFailure,
});
