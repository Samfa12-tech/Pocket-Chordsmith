export type RecordingStartupStep =
  | "prepare-timeline-audio"
  | "open-input-preview"
  | "count-in"
  | "start-backing-playback"
  | "start-native-capture";

export interface RecordingStartupPlanInput {
  transportAlreadyPlaying: boolean;
  countInSeconds: number;
}

export interface RecordingStartFailureCleanupInput {
  nativeCaptureStarted: boolean;
  backingPlaybackStarted: boolean;
}

export interface NativeRecordingDiagnosticsSource {
  recordingSessionId?: number | null;
  requestedStartBar?: number | null;
  requestedStartSeconds?: number | null;
  requestedSampleRate?: number;
  captureSampleRate?: number;
  captureStartedAtUnixMs?: number | null;
  inputFrameCount?: number;
  capturedFrameCount?: number;
  captureStartInputFrame?: number | null;
  firstInputFrame?: number | null;
  droppedInputFrameCount?: number;
  monitorBufferedFrameCount?: number;
  monitorUnderrunCount?: number;
  monitorOverrunCount?: number;
  playbackCaptureAnchor?: NativePlaybackRecordingAnchor | null;
  playbackStopAnchor?: NativePlaybackRecordingAnchor | null;
}

export interface RecordingCompletionMessageInput {
  baseMessage: string;
  droppedInputFrameCount?: number | null;
}

export interface NativePlaybackRecordingAnchor {
  source?: string | null;
  snapshotMonotonicMs?: number | null;
  active?: boolean | null;
  playing?: boolean | null;
  positionSeconds?: number | null;
  renderedFrameCount?: number | null;
  startedGeneration?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
}

export interface LoopbackCalibrationTake {
  detectedOffsetSeconds?: number | null;
  droppedInputFrameCount?: number | null;
  monitorUnderrunCount?: number | null;
  monitorOverrunCount?: number | null;
}

export interface LoopbackCalibrationReport {
  takeCount: number;
  validTakeCount: number;
  readyForCompensationReview: boolean;
  minOffsetSeconds: number | null;
  medianOffsetSeconds: number | null;
  p95OffsetSeconds: number | null;
  maxOffsetSeconds: number | null;
  averageOffsetSeconds: number | null;
  standardDeviationSeconds: number | null;
  droppedInputFrameCount: number;
  monitorUnderrunCount: number;
  monitorOverrunCount: number;
  compensationApplied: false;
  appliedCompensationSeconds: 0;
}

export function buildRecordingStartupPlan(input: RecordingStartupPlanInput): RecordingStartupStep[] {
  const steps: RecordingStartupStep[] = ["prepare-timeline-audio", "open-input-preview"];
  if (input.countInSeconds > 0) steps.push("count-in");
  if (!input.transportAlreadyPlaying) steps.push("start-backing-playback");
  steps.push("start-native-capture");
  return steps;
}

export function recordingStartFailureCleanupPlan(input: RecordingStartFailureCleanupInput) {
  return {
    stopNativeCapture: input.nativeCaptureStarted,
    stopBackingPlayback: input.backingPlaybackStarted
  };
}

export function buildNativeRecordingDiagnosticsMetadata(source: NativeRecordingDiagnosticsSource) {
  return {
    nativeRecordingSessionId: nullableFinite(source.recordingSessionId),
    nativeRequestedStartBar: nullableNumber(source.requestedStartBar),
    nativeRequestedStartSeconds: nullableNumber(source.requestedStartSeconds),
    nativeRequestedSampleRate: finiteCount(source.requestedSampleRate),
    nativeCaptureSampleRate: finiteCount(source.captureSampleRate),
    nativeCaptureStartedAtUnixMs: nullableFinite(source.captureStartedAtUnixMs),
    nativeInputFrameCount: finiteCount(source.inputFrameCount),
    nativeCapturedFrameCount: finiteCount(source.capturedFrameCount),
    nativeCaptureStartInputFrame: nullableFinite(source.captureStartInputFrame),
    nativeFirstInputFrame: nullableFinite(source.firstInputFrame),
    nativeDroppedInputFrameCount: finiteCount(source.droppedInputFrameCount),
    nativeMonitorBufferedFrameCount: finiteCount(source.monitorBufferedFrameCount),
    nativeMonitorUnderrunCount: finiteCount(source.monitorUnderrunCount),
    nativeMonitorOverrunCount: finiteCount(source.monitorOverrunCount),
    ...buildNativePlaybackAnchorMetadata("Capture", source.playbackCaptureAnchor),
    ...buildNativePlaybackAnchorMetadata("Stop", source.playbackStopAnchor)
  };
}

export function buildRecordingCompletionMessage(input: RecordingCompletionMessageInput) {
  const dropped = finiteCount(input.droppedInputFrameCount);
  if (dropped <= 0) return input.baseMessage;
  const noun = dropped === 1 ? "frame was" : "frames were";
  return `${input.baseMessage} Warning: ${dropped} native input ${noun} dropped before the WAV was finalized.`;
}

export function buildLoopbackCalibrationReport(takes: LoopbackCalibrationTake[]): LoopbackCalibrationReport {
  const validTakes = takes.filter((take) => Number.isFinite(Number(take.detectedOffsetSeconds)));
  const offsets = validTakes
    .map((take) => Number(take.detectedOffsetSeconds))
    .sort((a, b) => a - b);
  const average = offsets.length
    ? offsets.reduce((sum, value) => sum + value, 0) / offsets.length
    : null;
  const variance = average === null
    ? null
    : offsets.reduce((sum, value) => sum + (value - average) ** 2, 0) / offsets.length;
  return {
    takeCount: takes.length,
    validTakeCount: offsets.length,
    readyForCompensationReview: offsets.length >= 10,
    minOffsetSeconds: offsets[0] ?? null,
    medianOffsetSeconds: median(offsets),
    p95OffsetSeconds: percentile(offsets, 0.95),
    maxOffsetSeconds: offsets[offsets.length - 1] ?? null,
    averageOffsetSeconds: average,
    standardDeviationSeconds: variance === null ? null : Math.sqrt(variance),
    droppedInputFrameCount: validTakes.reduce((sum, take) => sum + finiteCount(take.droppedInputFrameCount), 0),
    monitorUnderrunCount: validTakes.reduce((sum, take) => sum + finiteCount(take.monitorUnderrunCount), 0),
    monitorOverrunCount: validTakes.reduce((sum, take) => sum + finiteCount(take.monitorOverrunCount), 0),
    compensationApplied: false,
    appliedCompensationSeconds: 0
  };
}

function buildNativePlaybackAnchorMetadata(prefix: "Capture" | "Stop", anchor: NativePlaybackRecordingAnchor | null | undefined) {
  if (!anchor) return {};
  return {
    [`nativePlayback${prefix}AnchorSource`]: nullableText(anchor?.source),
    [`nativePlayback${prefix}AnchorMonotonicMs`]: nullableFinite(anchor?.snapshotMonotonicMs),
    [`nativePlayback${prefix}Active`]: Boolean(anchor?.active),
    [`nativePlayback${prefix}Playing`]: Boolean(anchor?.playing),
    [`nativePlayback${prefix}PositionSeconds`]: nullableNumber(anchor?.positionSeconds),
    [`nativePlayback${prefix}RenderedFrameCount`]: nullableFinite(anchor?.renderedFrameCount),
    [`nativePlayback${prefix}StartedGeneration`]: nullableFinite(anchor?.startedGeneration),
    [`nativePlayback${prefix}SampleRate`]: finiteCount(anchor?.sampleRate),
    [`nativePlayback${prefix}Channels`]: finiteCount(anchor?.channels)
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index];
}

function finiteCount(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
}

function nullableFinite(value: number | null | undefined): number | null {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : null;
}

function nullableNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : null;
}

function nullableText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
