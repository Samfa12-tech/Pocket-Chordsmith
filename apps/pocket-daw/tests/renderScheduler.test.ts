import { describe, expect, it } from "vitest";
import { PlaybackRenderScheduler, mergePendingRenderOptions, shouldHoldDeferredRenderDuringPlayback, type RenderOptions } from "../src/app/renderScheduler";

function createSchedulerHarness() {
  let playbackActive = false;
  let nextTimerId = 1;
  const timers = new Map<number, () => void>();
  const renders: RenderOptions[] = [];
  let liveDomUpdates = 0;
  const scheduler = new PlaybackRenderScheduler();
  const callbacks = {
    isPlaybackActive: () => playbackActive,
    render: (options: RenderOptions) => renders.push(options),
    updateLiveDom: () => {
      liveDomUpdates += 1;
    }
  };
  const timerApi = {
    setTimeout: (callback: () => void) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (handle: number) => {
      timers.delete(handle);
    }
  };
  const fireTimers = () => {
    const callbacksToRun = Array.from(timers.values());
    timers.clear();
    callbacksToRun.forEach((callback) => callback());
  };
  return {
    scheduler,
    callbacks,
    timerApi,
    fireTimers,
    renders,
    get liveDomUpdates() {
      return liveDomUpdates;
    },
    get pendingTimerCount() {
      return timers.size;
    },
    setPlaybackActive(value: boolean) {
      playbackActive = value;
    }
  };
}

describe("render scheduler", () => {
  it("holds deferred full renders while playback is active", () => {
    expect(shouldHoldDeferredRenderDuringPlayback("deferred", true, false)).toBe(true);
    expect(shouldHoldDeferredRenderDuringPlayback("deferred", false, true)).toBe(true);
    expect(shouldHoldDeferredRenderDuringPlayback("deferred", false, false)).toBe(false);
    expect(shouldHoldDeferredRenderDuringPlayback("immediate", true, true)).toBe(false);
    expect(shouldHoldDeferredRenderDuringPlayback("live-dom", true, true)).toBe(false);
  });

  it("preserves the strongest pending render options across coalesced playback edits", () => {
    expect(mergePendingRenderOptions(null, {})).toEqual({ preserveScroll: false });
    expect(mergePendingRenderOptions({ preserveScroll: true }, {})).toEqual({ preserveScroll: true });
    expect(mergePendingRenderOptions({ preserveScroll: false }, { preserveScroll: true })).toEqual({ preserveScroll: true });
  });

  it("coalesces deferred edits into live DOM updates while playback remains active", () => {
    const harness = createSchedulerHarness();
    harness.setPlaybackActive(true);

    harness.scheduler.request("deferred", {}, harness.callbacks, harness.timerApi);
    harness.fireTimers();
    harness.scheduler.request("deferred", { preserveScroll: true }, harness.callbacks, harness.timerApi);
    harness.fireTimers();

    expect(harness.renders).toHaveLength(0);
    expect(harness.liveDomUpdates).toBe(2);

    harness.setPlaybackActive(false);
    harness.scheduler.flushAfterPlaybackStops({}, harness.callbacks, harness.timerApi);

    expect(harness.renders).toEqual([{ preserveScroll: true }]);
  });

  it("cancels outstanding deferred timers when playback stop flushes the pending render", () => {
    const harness = createSchedulerHarness();
    harness.setPlaybackActive(true);

    harness.scheduler.request("deferred", { preserveScroll: true }, harness.callbacks, harness.timerApi);
    expect(harness.pendingTimerCount).toBe(1);

    harness.setPlaybackActive(false);
    harness.scheduler.flushAfterPlaybackStops({ preserveScroll: true }, harness.callbacks, harness.timerApi);
    harness.fireTimers();

    expect(harness.renders).toEqual([{ preserveScroll: true }]);
    expect(harness.pendingTimerCount).toBe(0);
  });
});
