import test from "node:test";
import assert from "node:assert/strict";
import { compareCapturedStereoPcm } from "../scripts/lib/pcm-parity.mjs";

const rate = 48000;
function fixture() {
  let seed = 123;
  const left = Float32Array.from({ length: 9600 }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0x100000000 - 0.5) * 0.06 + (i > 9000 ? 0.02 : 0);
  });
  return [left, Float32Array.from(left, (value) => value * 0.7)];
}
function delayed(reference, lag = 128, padding = 512) {
  return reference.map((channel) => { const out = new Float32Array(channel.length + lag + padding); out.set(channel, lag); return out; });
}

test("PCM acceptance aligns bounded output latency and compares every reference frame including the ending", () => {
  const reference = fixture();
  const report = compareCapturedStereoPcm(delayed(reference), reference, rate);
  assert.equal(report.alignedLatencyFrames, 128);
  assert.equal(report.coverageComplete, true);
  assert.equal(report.missingReferenceFrames, 0);
  assert.equal(report.tail.passed, true);
  assert.equal(report.passed, true);
});

for (const removed of [1, 480]) test(`PCM acceptance rejects a capture missing the final ${removed} reference frames`, () => {
  const reference = fixture();
  const short = delayed(reference, 128, 0).map((channel) => channel.slice(0, -removed));
  const report = compareCapturedStereoPcm(short, reference, rate);
  assert.equal(report.alignedLatencyFrames, 128);
  assert.equal(report.missingReferenceFrames, removed);
  assert.equal(report.coverageComplete, false);
  assert.equal(report.tail.passed, false);
  assert.equal(report.passed, false);
});

test("PCM acceptance rejects an early audio ending even when the recorder pads it with silence", () => {
  const reference = fixture();
  const captured = delayed(reference);
  captured.forEach((channel) => channel.fill(0, 128 + 9120));
  const report = compareCapturedStereoPcm(captured, reference, rate);
  assert.equal(report.coverageComplete, true);
  assert.equal(report.tail.passed, false);
  assert.equal(report.passed, false);
});

test("PCM acceptance keeps latency, gain and invalid-sample failures independent of coverage", () => {
  const reference = fixture();
  assert.equal(compareCapturedStereoPcm(delayed(reference, 24001), reference, rate).passed, false);
  const quieter = delayed(reference).map((channel) => Float32Array.from(channel, (value) => value * 0.5));
  assert.equal(compareCapturedStereoPcm(quieter, reference, rate).passed, false);
  const invalid = delayed(reference); invalid[1][500] = NaN;
  assert.equal(compareCapturedStereoPcm(invalid, reference, rate).passed, false);
});
