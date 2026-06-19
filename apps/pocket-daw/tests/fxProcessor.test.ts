import { describe, expect, it } from "vitest";
import { connectFxChain } from "../src/audio/fxProcessor";
import type { FxChain } from "../src/daw/schema";

class FakeAudioParam {
  value = 0;
}

class FakeNode {
  connections: FakeNode[] = [];

  connect(node: FakeNode) {
    this.connections.push(node);
    return node;
  }

  disconnect() {
    this.connections = [];
  }
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = "lowpass";
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  gain = new FakeAudioParam();
}

class FakeContext {
  filters: FakeFilter[] = [];

  createBiquadFilter() {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }
}

describe("FX processor", () => {
  it("connects Pocket Pro EQ bands with editable frequency, gain and Q settings", () => {
    const ctx = new FakeContext() as unknown as BaseAudioContext;
    const source = new FakeNode() as unknown as AudioNode;
    const destination = new FakeNode() as unknown as AudioNode;
    const chain: FxChain = {
      id: "fx_master",
      name: "Master FX",
      ownerTrackId: "master",
      slots: [{
        id: "slot_eq",
        type: "parametric-eq",
        name: "Pocket Pro EQ",
        enabled: true,
        parameters: {
          hpEnabled: true,
          hpFrequency: 90,
          hpQ: 0.8,
          lowShelfEnabled: true,
          lowShelfFrequency: 140,
          lowShelfGain: -2,
          lowMidEnabled: true,
          lowMidFrequency: 420,
          lowMidGain: 1.5,
          lowMidQ: 1.4,
          highMidEnabled: false,
          highShelfEnabled: true,
          highShelfFrequency: 7800,
          highShelfGain: 2.2,
          lpEnabled: true,
          lpFrequency: 16000,
          lpQ: 0.7
        }
      }]
    };

    connectFxChain(ctx, source, destination, chain);

    expect((ctx as unknown as FakeContext).filters.map((filter) => filter.type)).toEqual(["highpass", "lowshelf", "peaking", "highshelf", "lowpass"]);
    expect((ctx as unknown as FakeContext).filters.map((filter) => filter.frequency.value)).toEqual([90, 140, 420, 7800, 16000]);
    expect((ctx as unknown as FakeContext).filters.map((filter) => filter.gain.value)).toEqual([0, -2, 1.5, 2.2, 0]);
    expect((ctx as unknown as FakeContext).filters[2].Q.value).toBe(1.4);
  });
});
