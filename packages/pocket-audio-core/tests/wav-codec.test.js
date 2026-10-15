import test from "node:test";
import assert from "node:assert/strict";
import { decodePcmWavBytes, encodePcmWavBytes } from "../src/export/wav.js";

function floatWav(channels, sampleRate = 48000) {
  const frames = channels[0].length, bytes = new Uint8Array(44 + frames * channels.length * 4), view = new DataView(bytes.buffer);
  const ascii = (at, text) => [...text].forEach((character, i) => view.setUint8(at + i, character.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, channels.length, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels.length * 4, true); view.setUint16(32, channels.length * 4, true); view.setUint16(34, 32, true); ascii(36, "data"); view.setUint32(40, bytes.length - 44, true);
  for (let frame = 0; frame < frames; frame++) channels.forEach((channel, index) => view.setFloat32(44 + (frame * channels.length + index) * 4, channel[frame], true));
  return bytes;
}

test("shared decoder retains native float32 precision, stereo and over-full-scale samples", () => {
  const channels = [Float32Array.from([0, 0.0000001, 0.25, 1.25]), Float32Array.from([-0.5, -0.0000001, -0.25, -1.25])];
  const bytes = floatWav(channels), before = bytes.slice();
  const decoded = decodePcmWavBytes(bytes);
  assert.deepEqual(decoded.channels, channels);
  assert.equal(decoded.bitDepth, 32); assert.equal(decoded.sampleRate, 48000); assert.equal(decoded.duration, 4 / 48000);
  assert.deepEqual(bytes, before);
});
test("float WAV decoding respects input byte offsets and preserves non-finite diagnostics", () => {
  const bytes = floatWav([Float32Array.from([NaN, Infinity, -Infinity, -0, 0.125])], 44100);
  const padded = new Uint8Array(bytes.length + 11); padded.set(bytes, 7);
  const decoded = decodePcmWavBytes(padded.subarray(7, 7 + bytes.length));
  assert.equal(Number.isNaN(decoded.channels[0][0]), true);
  assert.equal(decoded.channels[0][1], Infinity); assert.equal(decoded.channels[0][2], -Infinity);
  assert.equal(Object.is(decoded.channels[0][3], -0), true); assert.equal(decoded.channels[0][4], 0.125);
});
test("existing PCM16/24 decoded values and metadata remain unchanged", () => {
  for (const bitDepth of [16, 24]) {
    const decoded = decodePcmWavBytes(encodePcmWavBytes({ channels: [Float32Array.from([-1, 0, 1])], sampleRate: 48000, bitDepth }));
    assert.deepEqual(decoded.channels[0], Float32Array.from([-1, 0, 1]));
    assert.equal(decoded.bitDepth, bitDepth); assert.equal(decoded.duration, 3 / 48000);
  }
});
test("float support rejects unsupported formats, incomplete chunks and short fmt declarations", () => {
  const format = floatWav([new Float32Array(3)]); new DataView(format.buffer).setUint16(20, 65534, true);
  assert.throws(() => decodePcmWavBytes(format), /Unsupported WAV format/);
  assert.throws(() => decodePcmWavBytes(floatWav([new Float32Array(3)]).subarray(0, 49)), /chunk size/);
  const short = floatWav([new Float32Array(3)]); new DataView(short.buffer).setUint32(16, 2, true);
  assert.throws(() => decodePcmWavBytes(short), /fmt chunk size/);
});
