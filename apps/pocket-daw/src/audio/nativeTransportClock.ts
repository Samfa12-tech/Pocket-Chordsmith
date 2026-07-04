import type { NativeAudioStatus } from "../native/audioPlayback";
import { samplesToSeconds, secondsToSamples } from "../daw/timeline";

export interface NativeTransportClockSnapshot {
  playing: boolean;
  sampleRate: number;
  positionSamples: number;
  positionSeconds: number;
  anchorMonotonicMs: number;
}

export class NativeTransportClock {
  private sampleRate = 44_100;
  private positionSamples = 0;
  private anchorMonotonicMs = 0;
  private playing = false;

  updateFromStatus(status: NativeAudioStatus | null | undefined, nowMs = performance.now()): NativeTransportClockSnapshot {
    if (!status) return this.snapshot(nowMs);
    this.sampleRate = sanitizeSampleRate(status.sampleRate || this.sampleRate);
    this.positionSamples = secondsToSamples(Math.max(0, status.positionSeconds || 0), this.sampleRate);
    this.anchorMonotonicMs = nowMs;
    this.playing = !!status.active && !!status.playing;
    return this.snapshot(nowMs);
  }

  setPlayingAtSeconds(seconds: number, sampleRate = this.sampleRate, nowMs = performance.now()): NativeTransportClockSnapshot {
    this.sampleRate = sanitizeSampleRate(sampleRate || this.sampleRate);
    this.positionSamples = secondsToSamples(Math.max(0, seconds), this.sampleRate);
    this.anchorMonotonicMs = nowMs;
    this.playing = true;
    return this.snapshot(nowMs);
  }

  seekSeconds(seconds: number, sampleRate = this.sampleRate, nowMs = performance.now()): NativeTransportClockSnapshot {
    this.sampleRate = sanitizeSampleRate(sampleRate || this.sampleRate);
    this.positionSamples = secondsToSamples(Math.max(0, seconds), this.sampleRate);
    this.anchorMonotonicMs = nowMs;
    return this.snapshot(nowMs);
  }

  pause(nowMs = performance.now()): NativeTransportClockSnapshot {
    this.positionSamples = this.currentPositionSamples(nowMs);
    this.anchorMonotonicMs = nowMs;
    this.playing = false;
    return this.snapshot(nowMs);
  }

  stop(nowMs = performance.now()): NativeTransportClockSnapshot {
    this.positionSamples = 0;
    this.anchorMonotonicMs = nowMs;
    this.playing = false;
    return this.snapshot(nowMs);
  }

  currentPositionSamples(nowMs = performance.now()): number {
    if (!this.playing) return Math.max(0, this.positionSamples);
    const elapsedMs = Math.max(0, nowMs - this.anchorMonotonicMs);
    const elapsedSamples = secondsToSamples(elapsedMs / 1000, this.sampleRate);
    return Math.max(0, this.positionSamples + elapsedSamples);
  }

  currentPositionSeconds(nowMs = performance.now()): number {
    return samplesToSeconds(this.currentPositionSamples(nowMs), this.sampleRate);
  }

  snapshot(nowMs = performance.now()): NativeTransportClockSnapshot {
    const positionSamples = this.currentPositionSamples(nowMs);
    return {
      playing: this.playing,
      sampleRate: this.sampleRate,
      positionSamples,
      positionSeconds: samplesToSeconds(positionSamples, this.sampleRate),
      anchorMonotonicMs: this.anchorMonotonicMs
    };
  }
}

function sanitizeSampleRate(sampleRate: number): number {
  return Math.max(1, Math.round(Number(sampleRate) || 44_100));
}
