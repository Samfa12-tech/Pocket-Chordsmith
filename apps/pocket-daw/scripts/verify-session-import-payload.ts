import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getProjectAutomationLane } from "../src/daw/automation";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { buildSessionImportProject } from "../src/daw/sessionImport";
import { normalizeSessionPayload } from "../src/native/sessionBridge";

const payloadPath = process.argv[2];
if (!payloadPath) {
  throw new Error("Usage: npm run verify:session-import-payload -- <native-payload.json>");
}

const absolutePath = resolve(payloadPath);
const payload = JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
const bundle = normalizeSessionPayload(payload);
const result = buildSessionImportProject({
  ...bundle,
  importedAt: "2026-07-17T00:00:00.000Z"
});
const audioTracks = result.project.tracks.filter((track) => track.trackType === "audio");
const midiTracks = result.project.tracks.filter((track) => track.trackType === "midi");
const tempoLane = getProjectAutomationLane(result.project, "tempo");
const reloadedProject = migratePocketDawProject(JSON.parse(JSON.stringify(result.project)));
const reloadedTempoLane = getProjectAutomationLane(reloadedProject, "tempo");

assertEqual(result.report.audioTrackCount, 6, "audio stem count");
assertEqual(result.report.midiTrackCount, 6, "editable MIDI reference count");
assertEqual(result.report.tempoEventCount, 597, "source tempo-event count");
assertEqual(result.report.duplicateAudioCount, 18, "cross-format duplicate audio count");
assertEqual(result.report.discardedMidiCount, 12, "duplicate embedded MIDI count");
assertEqual(result.project.tracks.length, 14, "total project track count");
assertEqual(result.project.project.bpm, 600, "initial project tempo");
assertEqual(result.project.project.timeSig, 4, "project time signature");
assertEqual(result.project.project.meterMap.length, 0, "project meter-map event count");
assertEqual(tempoLane?.points.length, 597, "project tempo automation point count");
assertEqual(tempoLane?.points[0]?.value, 600, "first tempo automation value");
assertEqual(tempoLane?.points.at(-1)?.value, 176.470588, "last tempo automation value");
assertEqual(tempoLane?.max, 999, "tempo automation upper bound");
assertEqual(reloadedProject.project.bpm, 600, "reloaded initial project tempo");
assertEqual(reloadedTempoLane?.points.length, 597, "reloaded tempo automation point count");
assertEqual(reloadedTempoLane?.points[0]?.value, 600, "reloaded first tempo automation value");
assertEqual(reloadedTempoLane?.points.at(-1)?.value, 176.470588, "reloaded last tempo automation value");
assertEqual(reloadedTempoLane?.max, 999, "reloaded tempo automation upper bound");
assert(audioTracks.every((track) => track.volume === 0.82 && !track.mute), "audio stems must be audible at the safe default gain");
assert(midiTracks.every((track) => track.mute && track.metadata?.sessionImportReferenceMuted === true), "MIDI reference tracks must be muted by default");
assert(result.audioBindings.every((binding) => binding.asset.sourceFormat === "stems"), "the dedicated stems bundle must win audio-source priority");
assert(result.midiBindings.every((binding) => binding.asset.sourceFormat === "midi"), "the companion MIDI bundle must win note and tempo priority");

console.log(JSON.stringify({
  payloadPath: absolutePath,
  sourceFormats: result.report.formats,
  audioTracks: result.report.audioTrackCount,
  midiTracks: result.report.midiTrackCount,
  tempoEvents: result.report.tempoEventCount,
  duplicateAudioRepresentationsRemoved: result.report.duplicateAudioCount,
  duplicateMidiRepresentationsRemoved: result.report.discardedMidiCount,
  initialTempoBpm: result.project.project.bpm,
  finalTempoBpm: tempoLane?.points.at(-1)?.value,
  timeSignature: `${result.project.project.timeSig}/4`,
  safeAudioGain: audioTracks[0]?.volume,
  midiMutedByDefault: midiTracks.every((track) => track.mute),
  warnings: result.report.warnings
}, null, 2));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Session import verification failed: ${message}.`);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Session import verification failed for ${label}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}
