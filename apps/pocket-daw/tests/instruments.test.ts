import { describe, expect, it } from "vitest";
import { scheduleInstrumentEvent } from "../src/audio/instruments";
import type { RenderedEvent } from "../src/audio/eventRenderer";

class FakeParam {
  values: Array<{ method: string; value: number; time: number }> = [];

  setValueAtTime(value: number, time: number) {
    this.values.push({ method: "set", value, time });
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.values.push({ method: "linear", value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number) {
    this.values.push({ method: "exponential", value, time });
  }

  cancelScheduledValues(time: number) {
    this.values.push({ method: "cancel", value: 0, time });
  }
}

class FakeNode {
  connections: FakeNode[] = [];

  connect(node: FakeNode) {
    this.connections.push(node);
  }
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = "sine";
  frequency = new FakeParam();
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  start(time: number) {
    this.startedAt = time;
  }

  stop(time: number) {
    this.stoppedAt = time;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = "lowpass";
  frequency = new FakeParam();
}

class FakeAudioContext {
  currentTime = 0;
  oscillators: FakeOscillator[] = [];
  filters: FakeFilter[] = [];

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    return new FakeGain();
  }

  createBiquadFilter() {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }
}

function bassEvent(accent = false): RenderedEvent {
  return {
    id: accent ? "accent-bass" : "bass",
    clipId: "clip-test",
    kind: "bass",
    trackId: "bass",
    role: "bass",
    time: 0.1,
    duration: 0.25,
    bar: 1,
    step: 0,
    midi: 36,
    velocity: accent ? 0.42 : 0.34,
    accent
  };
}

describe("Pocket DAW instruments", () => {
  it("uses the darker Chordsmith-style bass voice for normal bass hits", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, bassEvent());

    expect(scheduled).toBe(true);
    expect(ctx.oscillators.map((oscillator) => oscillator.type)).toEqual(["sawtooth", "sine"]);
    expect(ctx.filters.map((filter) => filter.frequency.values.find((entry) => entry.method === "set")?.value)).toEqual([260, 120]);
  });

  it("keeps accented bass darker than the old bright DAW fallback", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, bassEvent(true));

    expect(scheduled).toBe(true);
    expect(ctx.filters.map((filter) => filter.frequency.values.find((entry) => entry.method === "set")?.value)).toEqual([320, 120]);
  });
});
