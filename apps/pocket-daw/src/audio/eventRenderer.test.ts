import { describe, expect, it } from "vitest";
import { createDemoProject } from "../demo/demoProject";
import { buildNativeAudioStartPayload } from "../native/audioPlayback";
import { renderTimelineEvents } from "./eventRenderer";

describe("Pocket DAW render event timing", () => {
  it("keeps beat-zero events in the live event list", () => {
    const events = renderTimelineEvents(createDemoProject());
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.time).toBe(0);
    expect(events.some((event) => event.step === 0 && event.time === 0)).toBe(true);
  });

  it("preserves the same event timing when building the native playback payload", () => {
    const project = createDemoProject();
    const events = renderTimelineEvents(project);
    const payload = buildNativeAudioStartPayload(project, events, 0);

    expect(payload.events).toHaveLength(events.length);
    expect(payload.events[0]?.time).toBe(events[0]?.time);
    expect(payload.events[0]?.duration).toBeCloseTo(Math.max(0.01, events[0]?.duration || 0), 6);
  });
});
