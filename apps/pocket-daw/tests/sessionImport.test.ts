import { describe, expect, it } from "vitest";
import { getProjectAutomationLane } from "../src/daw/automation";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { buildSessionImportProject, recordSessionImportHydrationFailures, type SessionImportAudioAsset, type SessionImportBundle, type SessionImportMidiAsset, type SessionImportNoteTrack, type SessionSourceFormat } from "../src/daw/sessionImport";
import { murekaStyleTempoMapMidiBytes, multiTrackChannelMidiBytes } from "./midiFixtures";

const ROLES = ["bass", "drums", "guitar", "other", "synth", "vocal"];
const FORMATS: SessionSourceFormat[] = ["stems", "midi", "ableton-live", "dawproject", "aaf"];

describe("DAW session import", () => {
  it("deduplicates cross-format audio, prefers companion MIDI and builds a safe editable session", () => {
    const audioAssets = ["stems", "dawproject", "ableton-live", "aaf"].flatMap((format) =>
      ROLES.map((role) => audioAsset(role, format as SessionSourceFormat))
    );
    const midiAssets = ROLES.map((role) => midiAsset(role));
    midiAssets[0] = { ...midiAssets[0]!, bytes: multiTrackChannelMidiBytes() };
    const noteTracks = ["dawproject", "ableton-live"].flatMap((format) =>
      ROLES.map((role) => noteTrack(role, format as SessionSourceFormat))
    );
    const result = buildSessionImportProject(bundle({ audioAssets, midiAssets, noteTracks }));
    const audioTracks = result.project.tracks.filter((track) => track.trackType === "audio");
    const midiTracks = result.project.tracks.filter((track) => track.trackType === "midi");
    const tempoLane = getProjectAutomationLane(result.project, "tempo")!;
    const reloaded = migratePocketDawProject(JSON.parse(JSON.stringify(result.project)));
    const reloadedTempoLane = getProjectAutomationLane(reloaded, "tempo")!;

    expect(result.report).toMatchObject({
      audioTrackCount: 6,
      midiTrackCount: 6,
      tempoEventCount: 2,
      duplicateAudioCount: 18,
      discardedMidiCount: 12
    });
    expect(result.project.tracks).toHaveLength(14);
    expect(result.project.tracks.some((track) => track.trackType === "generated")).toBe(false);
    expect(audioTracks.map((track) => track.name)).toEqual(["Bass", "Drums", "Guitar", "Other", "Synth", "Vocal"]);
    expect(audioTracks.every((track) => track.volume === 0.82 && !track.mute)).toBe(true);
    expect(midiTracks).toHaveLength(6);
    expect(midiTracks.every((track) => track.mute && track.metadata?.sessionImportReferenceMuted === true)).toBe(true);
    expect(result.project.timeline.clips.filter((clip) => clip.type === "audio")).toHaveLength(6);
    expect(result.project.timeline.clips.filter((clip) => clip.type === "midi")).toHaveLength(6);
    expect(result.project.sourceRefs[0]).toMatchObject({ sourceType: "daw-session", title: "Billions of Years" });
    expect(result.project.importHistory[0]).toMatchObject({ importKind: "daw-session" });
    expect(result.project.project.timeSig).toBe(4);
    expect(result.project.project.meterMap).toEqual([]);
    expect(result.project.project.bpm).toBe(600);
    expect(tempoLane.max).toBe(999);
    expect(tempoLane.points).toEqual([
      expect.objectContaining({ bar: 1, value: 600, curve: "hold" }),
      expect.objectContaining({ bar: 1.25, value: 176.470588, curve: "hold" })
    ]);
    expect(reloaded.project.bpm).toBe(600);
    expect(reloadedTempoLane).toMatchObject({ min: 40, max: 999 });
    expect(reloadedTempoLane.points).toEqual(tempoLane.points);
    expect(result.audioBindings.every((binding) => binding.asset.sourceFormat === "stems")).toBe(true);
    expect(result.midiBindings.every((binding) => binding.asset.sourceFormat === "midi")).toBe(true);
  });

  it("imports a standalone DAWproject with audible audio and muted embedded notes, and reports timing mismatch", () => {
    const result = buildSessionImportProject(bundle({
      formats: ["dawproject"],
      audioAssets: ROLES.map((role) => audioAsset(role, "dawproject", 207.87)),
      midiAssets: [],
      noteTracks: ROLES.map((role) => noteTrack(role, "dawproject", 300)),
      fixedTempoBpm: 120
    }));

    expect(result.report.audioTrackCount).toBe(6);
    expect(result.report.midiTrackCount).toBe(6);
    expect(result.report.tempoEventCount).toBe(0);
    expect(result.project.project.bpm).toBe(120);
    expect(result.project.tracks.filter((track) => track.trackType === "audio").every((track) => !track.mute)).toBe(true);
    expect(result.project.tracks.filter((track) => track.trackType === "midi").every((track) => track.mute)).toBe(true);
    expect(result.report.warnings).toEqual(expect.arrayContaining([expect.stringContaining("companion tempo-map MIDI")]));
  });

  it("imports an AAF-only audio session without inventing editable MIDI", () => {
    const result = buildSessionImportProject(bundle({
      formats: ["aaf"],
      audioAssets: ROLES.map((role) => audioAsset(role, "aaf")),
      midiAssets: [{ ...midiAsset("tempo"), sourceFormat: "aaf", bytes: emptyMidiBytes() }],
      noteTracks: []
    }));

    expect(result.report.audioTrackCount).toBe(6);
    expect(result.report.midiTrackCount).toBe(0);
    expect(result.project.tracks.filter((track) => track.trackType === "midi")).toHaveLength(0);
    expect(result.report.warnings).toContain("tempo.mid contains no MIDI notes; Pocket DAW kept any valid tempo or meter metadata but did not create an editable reference track.");
  });

  it("keeps delayed tempo-only conductor data without applying it before its source tick", () => {
    const result = buildSessionImportProject(bundle({
      formats: ["midi"],
      fixedTempoBpm: 120,
      midiAssets: [{ ...midiAsset("conductor"), bytes: delayedTempoOnlyMidiBytes() }]
    }));
    const tempoLane = getProjectAutomationLane(result.project, "tempo")!;

    expect(result.report).toMatchObject({ midiTrackCount: 0, tempoEventCount: 1 });
    expect(result.project.project.bpm).toBe(120);
    expect(tempoLane.points).toEqual([
      expect.objectContaining({ bar: 1, value: 120, curve: "hold" }),
      expect.objectContaining({ bar: 1.25, value: 60, curve: "hold" })
    ]);
    expect(result.report.warnings).toContain("conductor.mid contains no MIDI notes; Pocket DAW kept any valid tempo or meter metadata but did not create an editable reference track.");
    expect(result.report.warnings).toContain("conductor.mid's first tempo event occurs after the song starts; Pocket DAW used 120 BPM before that event.");
  });

  it("preserves distinct layered tracks that share a role while reconciling duplicate representations", () => {
    const rhythmAudio = {
      ...audioAsset("guitar", "stems"),
      name: "Rhythm Guitar.wav",
      uri: "C:/cache/stems/rhythm-guitar.wav",
      checksum: "stems-rhythm-guitar",
      pcmChecksum: "pcm-rhythm-guitar"
    };
    const leadAudio = {
      ...audioAsset("guitar", "stems"),
      name: "Lead Guitar.wav",
      uri: "C:/cache/stems/lead-guitar.wav",
      checksum: "stems-lead-guitar",
      pcmChecksum: "pcm-lead-guitar"
    };
    const rhythmNotes = {
      ...noteTrack("guitar", "dawproject"),
      name: "Rhythm Guitar",
      notes: [{ pitch: 52, startBeat: 0, durationBeats: 2, velocity: 100, channel: 0 }]
    };
    const leadNotes = {
      ...noteTrack("guitar", "dawproject"),
      name: "Lead Guitar",
      notes: [{ pitch: 64, startBeat: 0, durationBeats: 1, velocity: 100, channel: 0 }]
    };
    const conflictingRhythmRepresentation = {
      ...rhythmNotes,
      sourceFormat: "ableton-live" as const,
      notes: [{ pitch: 55, startBeat: 0, durationBeats: 2, velocity: 100, channel: 0 }]
    };
    const result = buildSessionImportProject(bundle({
      formats: ["stems", "dawproject", "ableton-live"],
      audioAssets: [rhythmAudio, leadAudio, { ...rhythmAudio, sourceFormat: "dawproject", uri: "C:/cache/dawproject/rhythm-guitar.wav" }],
      noteTracks: [rhythmNotes, leadNotes, conflictingRhythmRepresentation]
    }));

    expect(result.report).toMatchObject({
      audioTrackCount: 2,
      midiTrackCount: 2,
      duplicateAudioCount: 1,
      discardedMidiCount: 1
    });
    expect(result.project.tracks.filter((track) => track.trackType === "audio").map((track) => track.name)).toEqual([
      "Guitar 1 — Lead Guitar",
      "Guitar 2 — Rhythm Guitar"
    ]);
    expect(result.project.tracks.filter((track) => track.trackType === "midi").map((track) => track.name)).toEqual([
      "Guitar 1 — Lead Guitar MIDI (reference)",
      "Guitar 2 — Rhythm Guitar MIDI (reference)"
    ]);
    expect(result.report.warnings).toContain("Conflicting representations of Rhythm Guitar were found; Pocket DAW preferred the highest-priority session source.");
  });

  it("records failed stem hydration in media state and durable import provenance", () => {
    const built = buildSessionImportProject(bundle({ audioAssets: [audioAsset("bass", "stems")] }));
    const failed = recordSessionImportHydrationFailures(built.project, [{
      mediaPoolItemId: built.audioBindings[0]!.mediaPoolItemId,
      assetName: "bass.wav",
      message: "source file disappeared"
    }]);

    expect(failed.mediaPool[0]?.metadata).toMatchObject({
      missing: true,
      unresolved: true,
      missingReason: "source file disappeared",
      sessionImportHydrationFailed: true
    });
    expect(failed.sourceRefs[0]?.notes).toContain("bass.wav: source file disappeared");
    expect(failed.sourceRefs[0]?.normalized).toMatchObject({ partialAudioLoad: true });
    expect(failed.importHistory[0]?.conversion).toMatchObject({ partialAudioLoad: true });
  });
});

function bundle(overrides: Partial<SessionImportBundle> = {}): SessionImportBundle {
  return {
    title: "Billions of Years",
    sourcePaths: ["C:/Music/Billions of Years files"],
    formats: FORMATS,
    audioAssets: [],
    midiAssets: [],
    noteTracks: [],
    importedAt: "2026-07-17T00:00:00.000Z",
    ...overrides
  };
}

function audioAsset(role: string, sourceFormat: SessionSourceFormat, durationSeconds = 207.870023): SessionImportAudioAsset {
  return {
    name: `${role}.wav`,
    role,
    uri: `C:/cache/${sourceFormat}/${role}.wav`,
    mimeType: "audio/wav",
    durationSeconds,
    sampleRate: 44100,
    channels: 2,
    sizeBytes: 36_668_316,
    checksum: `${sourceFormat}-${role}`,
    pcmChecksum: `pcm-${role}`,
    sourceFormat,
    sourcePath: `C:/Music/${sourceFormat}`,
    sourceEntry: `${role}.wav`
  };
}

function midiAsset(role: string): SessionImportMidiAsset {
  return {
    name: `${role}.mid`,
    role,
    bytes: murekaStyleTempoMapMidiBytes(),
    sizeBytes: 128,
    checksum: `midi-${role}`,
    sourceFormat: "midi",
    sourcePath: "C:/Music/midis.zip",
    sourceEntry: `${role}.mid`
  };
}

function noteTrack(role: string, sourceFormat: SessionSourceFormat, endBeat = 2): SessionImportNoteTrack {
  return {
    name: role,
    role,
    sourceFormat,
    ppq: 960,
    notes: [{ pitch: role === "drums" ? 36 : 60, startBeat: 0, durationBeats: endBeat, velocity: 100, channel: role === "drums" ? 9 : 0 }]
  };
}

function emptyMidiBytes(): Uint8Array {
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x04,
    0x00, 0xff, 0x2f, 0x00
  ]);
}

function delayedTempoOnlyMidiBytes(): Uint8Array {
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x0c,
    0x83, 0x60, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
    0x00, 0xff, 0x2f, 0x00
  ]);
}
