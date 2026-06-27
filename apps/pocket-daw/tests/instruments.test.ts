import { describe, expect, it } from "vitest";
import { scheduleInstrumentEvent } from "../src/audio/instruments";
import type { RenderedEvent } from "../src/audio/eventRenderer";
import {
  LOFI_BASS_TONE_CONFIGS,
  LOFI_CHORD_INSTRUMENT_CONFIGS,
  LOFI_DRUM_KIT_CONFIGS,
  LOFI_LEAD_INSTRUMENT_CONFIGS,
  POCKET_BASS_TONE_CONFIGS,
  validateLofiSoundRegistry
} from "../../../packages/pocket-audio-core/src/sounds/lofi-registry.js";
import { CHIP_BASS_TONES } from "../../../packages/pocket-audio-core/src/presets/chip.js";

class FakeParam {
  values: Array<{ method: string; value: number; time: number }> = [];
  value = 0;

  setValueAtTime(value: number, time: number) {
    this.value = value;
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
  Q = new FakeParam();
}

class FakeAudioContext {
  currentTime = 0;
  oscillators: FakeOscillator[] = [];
  filters: FakeFilter[] = [];
  gains: FakeGain[] = [];

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
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

function kickEvent(patch: Partial<RenderedEvent> = {}): RenderedEvent {
  return {
    id: "kick",
    clipId: "clip-test",
    kind: "kick",
    trackId: "drums",
    role: "drums",
    time: 0.1,
    duration: 0.1,
    bar: 1,
    step: 0,
    velocity: 0.95,
    accent: false,
    ...patch
  };
}

describe("Pocket DAW instruments", () => {
  function scheduledLinearPeaks(ctx: FakeAudioContext) {
    return ctx.gains.map((gain) => gain.gain.values.find((entry) => entry.method === "linear")?.value);
  }

  function expectCloseArray(received: Array<number | undefined>, expected: number[]) {
    expect(received).toHaveLength(expected.length);
    expected.forEach((value, index) => expect(received[index]).toBeCloseTo(value, 6));
  }

  it("uses the shared Pocket Audio lofi sound registry as the DAW coverage contract", () => {
    expect(validateLofiSoundRegistry()).toEqual({
      missingDrumKits: [],
      missingBassTones: [],
      missingChordInstruments: [],
      missingLeadInstruments: []
    });
    expect(Object.keys(POCKET_BASS_TONE_CONFIGS)).toEqual(["classic", "warm_sub", "soft_upright", "rounded_triangle_bass", ...CHIP_BASS_TONES]);
    expect(POCKET_BASS_TONE_CONFIGS.classic).toMatchObject({ mainWave: "sawtooth", subWave: "sine", mainPeak: 1, subPeak: 0.42, cutoff: 420, subCutoff: 220 });
    expect(Object.keys(LOFI_DRUM_KIT_CONFIGS)).toEqual(["lofi_dusty", "lofi_brush", "lofi_tape_soft"]);
    expect(Object.keys(LOFI_BASS_TONE_CONFIGS)).toEqual(["warm_sub", "soft_upright", "rounded_triangle_bass"]);
    expect(Object.keys(LOFI_CHORD_INSTRUMENT_CONFIGS)).toContain("dusty_rhodes");
    expect(Object.keys(LOFI_LEAD_INSTRUMENT_CONFIGS)).toContain("tape_bell");
  });

  it("uses the Chordsmith classic bass voice for normal bass hits", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, bassEvent());

    expect(scheduled).toBe(true);
    expect(ctx.oscillators.map((oscillator) => oscillator.type)).toEqual(["sawtooth", "sine"]);
    expect(ctx.filters.map((filter) => filter.frequency.values.find((entry) => entry.method === "set")?.value)).toEqual([420, 220]);
    expectCloseArray(scheduledLinearPeaks(ctx), [0.34, 0.1428]);
  });

  it("keeps accented classic bass aligned with Chordsmith cutoff and peak scaling", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, bassEvent(true));

    expect(scheduled).toBe(true);
    expect(ctx.filters.map((filter) => filter.frequency.values.find((entry) => entry.method === "set")?.value)).toEqual([495.59999999999997, 220]);
    expectCloseArray(scheduledLinearPeaks(ctx), [0.4704, 0.1764]);
  });

  it("uses the lofi warm-sub bass voice when imported Chordsmith metadata asks for it", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, {
      ...bassEvent(),
      bassTone: "warm_sub",
      audioProfile: "lofi_chill"
    });

    expect(scheduled).toBe(true);
    expect(ctx.oscillators.map((oscillator) => oscillator.type).slice(0, 2)).toEqual(["sine", "sine"]);
    expect(ctx.filters.map((filter) => filter.frequency.values.find((entry) => entry.method === "set")?.value).slice(0, 2)).toEqual([210, 120]);
  });

  it("adds a quiet octave presence layer so low warm-sub roots remain monitorable", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, {
      ...bassEvent(),
      bassTone: "warm_sub"
    });

    expect(scheduled).toBe(true);
    expect(ctx.oscillators).toHaveLength(3);
    expect(ctx.oscillators[2].frequency.values.find((entry) => entry.method === "set")?.value).toBeCloseTo(130.8128, 3);
    expect(ctx.filters[2].frequency.values.find((entry) => entry.method === "set")?.value).toBe(420);
    expect(scheduledLinearPeaks(ctx)[2]).toBeGreaterThan(0.03);
    expect(scheduledLinearPeaks(ctx)[2]).toBeLessThan(0.08);
  });

  it("resolves missing imported lofi drum kits through the shared core fallback", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, kickEvent({
      drumKit: "missing_lofi_kit",
      audioProfile: "standard",
      lofiPreset: "lofi_koi_pond"
    }));

    expect(scheduled).toBe(true);
    expect(ctx.oscillators[0].frequency.values.find((entry) => entry.method === "set")?.value).toBe(132);
  });

  it("resolves missing non-lofi drum kits to the shared classic kit", () => {
    const ctx = new FakeAudioContext();

    const scheduled = scheduleInstrumentEvent(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode, kickEvent({
      drumKit: "missing_kit",
      audioProfile: "standard",
      lofiPreset: ""
    }));

    expect(scheduled).toBe(true);
    expect(ctx.oscillators[0].frequency.values.find((entry) => entry.method === "set")?.value).toBe(155);
  });
});
