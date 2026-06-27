export type RenderSchedule = "none" | "live-dom" | "deferred" | "immediate";

export interface RenderOptions {
  preserveScroll?: boolean;
}

interface RenderSchedulerTimers {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

interface RenderSchedulerCallbacks {
  isPlaybackActive(): boolean;
  render(options: RenderOptions): void;
  updateLiveDom(): void;
}

export function shouldHoldDeferredRenderDuringPlayback(schedule: RenderSchedule, statePlaying: boolean, enginePlaying: boolean): boolean {
  return schedule === "deferred" && (statePlaying || enginePlaying);
}

export function mergePendingRenderOptions(current: RenderOptions | null, next: RenderOptions): RenderOptions {
  return {
    preserveScroll: Boolean(current?.preserveScroll || next.preserveScroll)
  };
}

export class PlaybackRenderScheduler {
  private deferredRenderTimer: number | null = null;
  private pendingDeferredRenderWhilePlaying: RenderOptions | null = null;

  request(schedule: RenderSchedule, options: RenderOptions, callbacks: RenderSchedulerCallbacks, timers: RenderSchedulerTimers, delayMs = 80): void {
    if (schedule === "none") return;
    if (schedule === "live-dom") {
      callbacks.updateLiveDom();
      return;
    }
    if (schedule === "deferred") {
      this.clearDeferredTimer(timers);
      this.deferredRenderTimer = timers.setTimeout(() => {
        this.deferredRenderTimer = null;
        if (callbacks.isPlaybackActive()) {
          this.pendingDeferredRenderWhilePlaying = mergePendingRenderOptions(this.pendingDeferredRenderWhilePlaying, options);
          callbacks.updateLiveDom();
          return;
        }
        callbacks.render(options);
      }, delayMs);
      return;
    }
    this.cancelPending(timers);
    callbacks.render(options);
  }

  renderNow(options: RenderOptions, callbacks: RenderSchedulerCallbacks, timers: RenderSchedulerTimers): void {
    this.cancelPending(timers);
    callbacks.render(options);
  }

  flushAfterPlaybackStops(options: RenderOptions, callbacks: RenderSchedulerCallbacks, timers: RenderSchedulerTimers): void {
    const pending = this.pendingDeferredRenderWhilePlaying;
    this.cancelPending(timers);
    callbacks.render(mergePendingRenderOptions(pending, options));
  }

  cancelPending(timers: RenderSchedulerTimers): void {
    this.clearDeferredTimer(timers);
    this.pendingDeferredRenderWhilePlaying = null;
  }

  private clearDeferredTimer(timers: RenderSchedulerTimers): void {
    if (this.deferredRenderTimer === null) return;
    timers.clearTimeout(this.deferredRenderTimer);
    this.deferredRenderTimer = null;
  }
}
