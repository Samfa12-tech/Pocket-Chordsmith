import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import schema from "../releases/smoke-attestation.schema.json" with { type: "json" };
import { validateInstalledPunchTakeSummary } from "../scripts/verify-installed-punch-take-summary.mjs";
import { REQUIRED_SMOKE_CHECK_IDS, validateSmokeAttestation } from "../scripts/verify-smoke-attestation.mjs";

function sha256(value: string | NodeJS.ArrayBufferView) {
  return createHash("sha256").update(value).digest("hex");
}

function buildAttestation(overrides: Record<string, any> = {}) {
  const version = overrides.version || "0.6.20";
  const commit = overrides.commit || "e".repeat(40);
  const installerFile = overrides.installerFile || "Pocket.DAW_0.6.20_x64-setup.exe";
  const installerSha256 = overrides.installerSha256 || sha256("installer bytes");
  return {
    version,
    commit,
    installerFile,
    installerSha256,
    testedAt: "2026-06-21",
    result: "pass",
    machine: {
      windowsVersion: "Windows 11 24H2",
      architecture: "x64",
      audioInput: "Focusrite USB Audio",
      audioOutput: "Speakers (Realtek)"
    },
    checks: REQUIRED_SMOKE_CHECK_IDS.map((id) => ({ id, result: "pass", notes: `${id} covered` })),
    knownFailures: [],
    ...overrides
  };
}

function buildPunchTakeSummary(overrides: Record<string, any> = {}) {
  return {
    ok: true,
    testedAt: "2026-07-04T00:30:24.634Z",
    runningVersion: "0.6.38",
    installer: {
      file: "Pocket DAW_0.6.38_x64-setup.exe",
      sha256: sha256("installer bytes")
    },
    clipCount: 11,
    groupedClipCount: 10,
    groupCount: 4,
    activeCount: 6,
    mutedCount: 4,
    exportedMidiPitches: [50, 83, 84, 86],
    midiTakeGroupCount: 1,
    midiRecordingTakeGroupCount: 1,
    audioRecordingControl: {
      outcome: "started-and-stopped",
      placement: {
        delta: {
          clipCount: 1,
          groupedClipCount: 1,
          groupCount: 1,
          activeCount: 1
        }
      },
      media: {
        mediaPoolItemId: "media_005",
        clipId: "clip_005",
        file: "take.wav",
        projectRelativePath: "project-media/recordings/take.wav",
        sizeBytes: 51884,
        durationSeconds: 0.54,
        nativeCapturedFrameCount: 25920,
        nativeCaptureSampleRate: 48000,
        peak: 0.00001,
        filePeak: 0.00001,
        fileRms: 0.000002,
        fileSampleRate: 48000,
        fileChannels: 1,
        fileFrameCount: 25920
      }
    },
    midiInputRecordingControl: {
      outcome: "guarded-unavailable",
      message: "Permission to use Web MIDI API was not granted."
    },
    ...overrides
  };
}

function writeExportEvidenceFiles(dir: string) {
  const wavPath = join(dir, "punch-take-export.wav");
  const midiPath = join(dir, "punch-take-export.mid");
  const wavBytes = minimalWavBytes();
  const midiBytes = midiBytesWithPitches([83, 84, 86]);
  writeFileSync(wavPath, wavBytes);
  writeFileSync(midiPath, midiBytes);
  return {
    wavPath,
    wavSizeBytes: wavBytes.length,
    wavSha256: sha256(wavBytes),
    midiPath,
    midiSizeBytes: midiBytes.length,
    midiSha256: sha256(midiBytes)
  };
}

function minimalWavBytes() {
  const dataBytes = Buffer.from([0, 0, 1, 0]);
  const bytes = Buffer.alloc(44 + dataBytes.length);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + dataBytes.length, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(96000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataBytes.length, 40);
  dataBytes.copy(bytes, 44);
  return bytes;
}

function midiBytesWithPitches(pitches: number[]) {
  const track: number[] = [
    0x00, 0xff, 0x03, 0x04, 0x54, 0x61, 0x6b, 0x65
  ];
  for (const pitch of pitches) {
    track.push(
      0x00, 0x90, pitch, 0x64,
      0x81, 0x00, 0x80, pitch, 0x00
    );
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const trackLength = track.length;
  return Buffer.from([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    (trackLength >>> 24) & 0xff,
    (trackLength >>> 16) & 0xff,
    (trackLength >>> 8) & 0xff,
    trackLength & 0xff,
    ...track
  ]);
}

describe("smoke attestation schema", () => {
  it("requires the exact-artifact smoke attestation fields", () => {
    expect(schema.required).toEqual([
      "version",
      "commit",
      "installerFile",
      "installerSha256",
      "testedAt",
      "result",
      "machine",
      "checks",
      "knownFailures"
    ]);
    expect(schema.properties.result.const).toBe("pass");
    expect(schema.properties.machine.required).toEqual([
      "windowsVersion",
      "architecture",
      "audioInput",
      "audioOutput"
    ]);
    expect(schema.properties.checks.items.required).toEqual(["id", "result"]);
  });
});

describe("smoke attestation verifier", () => {
  it("accepts an exact pass attestation", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-smoke-"));
    const installer = join(dir, "Pocket.DAW_0.6.20_x64-setup.exe");
    writeFileSync(installer, "installer bytes");
    const attestation = buildAttestation({
      installerFile: basename(installer),
      installerSha256: sha256(readFileSync(installer))
    });

    expect(validateSmokeAttestation(attestation, {
      version: "0.6.20",
      commit: attestation.commit,
      installerFile: basename(installer),
      installerSha256: attestation.installerSha256
    })).toEqual({ ok: true, failures: [] });
  });

  it("rejects wrong version, commit, filename, hash, result, and missing checks", () => {
    const base = buildAttestation();
    const cases: Array<[Record<string, any>, string]> = [
      [{ version: "0.6.19" }, "version"],
      [{ commit: "a".repeat(40) }, "commit"],
      [{ installerFile: "wrong.exe" }, "installerFile"],
      [{ installerSha256: sha256("rebuilt bytes") }, "installerSha256"],
      [{ result: "partial" }, "result must be pass"],
      [{ checks: base.checks.filter((check) => check.id !== REQUIRED_SMOKE_CHECK_IDS[0]) }, "missing required checks"]
    ];

    for (const [overrides, expectedMessage] of cases) {
      const validation = validateSmokeAttestation(buildAttestation(overrides), {
        version: "0.6.20",
        commit: "e".repeat(40),
        installerFile: "Pocket.DAW_0.6.20_x64-setup.exe",
        installerSha256: sha256("installer bytes")
      });
      expect(validation.ok).toBe(false);
      expect(validation.failures.join("\n")).toContain(expectedMessage);
    }
  });

  it("requires native media reliability, punch take-lane and game-pack target smoke checks", () => {
    expect(REQUIRED_SMOKE_CHECK_IDS).toEqual(expect.arrayContaining([
      "native-media-reliability",
      "punch-take-lane-recording",
      "game-pack-target-smoke"
    ]));

    const validation = validateSmokeAttestation(buildAttestation({
      checks: REQUIRED_SMOKE_CHECK_IDS
        .filter((id) => id !== "native-media-reliability" && id !== "punch-take-lane-recording" && id !== "game-pack-target-smoke")
        .map((id) => ({ id, result: "pass" }))
    }), {
      version: "0.6.20",
      commit: "e".repeat(40),
      installerFile: "Pocket.DAW_0.6.20_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("native-media-reliability");
    expect(validation.failures.join("\n")).toContain("punch-take-lane-recording");
    expect(validation.failures.join("\n")).toContain("game-pack-target-smoke");
  });

  it("rejects a rebuilt installer when the attestation hash is stale", () => {
    const original = sha256("installer bytes v1");
    const rebuilt = sha256("installer bytes v2");
    const attestation = buildAttestation({
      installerSha256: original
    });

    const validation = validateSmokeAttestation(attestation, {
      version: "0.6.20",
      commit: attestation.commit,
      installerFile: attestation.installerFile,
      installerSha256: rebuilt
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("installerSha256");
    expect(validation.failures.join("\n")).toContain("current installer hash");
  });

  it("rejects missing machine details and non-pass check entries", () => {
    const attestation = buildAttestation({
      machine: {
        windowsVersion: "Windows 11 24H2",
        architecture: "x64",
        audioInput: "Focusrite USB Audio"
      },
      checks: [
        ...REQUIRED_SMOKE_CHECK_IDS.slice(0, -1).map((id) => ({ id, result: "pass" })),
        { id: REQUIRED_SMOKE_CHECK_IDS.at(-1), result: "fail" }
      ]
    });

    const validation = validateSmokeAttestation(attestation, {
      version: "0.6.20",
      commit: attestation.commit,
      installerFile: attestation.installerFile,
      installerSha256: attestation.installerSha256
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("machine.audioOutput");
    expect(validation.failures.join("\n")).toContain("checks must all pass");
  });
});

describe("installed punch/take smoke summary verifier", () => {
  it("accepts media-backed exact installed punch/take evidence", () => {
    const summary = buildPunchTakeSummary();
    expect(validateInstalledPunchTakeSummary(summary, {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    })).toEqual({ ok: true, failures: [] });
  });

  it("accepts archived summary export paths by default", () => {
    expect(validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      wavPath: "C:\\Temp\\deleted-export.wav",
      midiPath: "C:\\Temp\\deleted-export.mid"
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    })).toEqual({ ok: true, failures: [] });
  });

  it("accepts the same setup hash when the release asset filename uses dots", () => {
    const summary = buildPunchTakeSummary({
      installer: {
        file: "Pocket DAW_0.6.38_x64-setup.exe",
        sha256: sha256("installer bytes")
      }
    });
    expect(validateInstalledPunchTakeSummary(summary, {
      version: "0.6.38",
      installerFile: "Pocket.DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    })).toEqual({ ok: true, failures: [] });
  });

  it("rejects stale installer evidence and guard-only audio recording summaries", () => {
    const validation = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      installer: {
        file: "Pocket DAW_0.6.38_x64-setup.exe",
        sha256: sha256("old installer")
      },
      audioRecordingControl: {
        outcome: "guarded-unavailable",
        message: "No audio input device is available for recording."
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("installer.sha256");
    expect(validation.failures.join("\n")).toContain("started-and-stopped");
    expect(validation.failures.join("\n")).toContain("audioRecordingControl.placement.delta");
    expect(validation.failures.join("\n")).toContain("audioRecordingControl.media");
  });

  it("rejects unrelated installer filenames even when the hash matches", () => {
    const validation = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      installer: {
        file: "Pocket DAW_0.6.38_x64-setup.exe",
        sha256: sha256("installer bytes")
      }
    }), {
      version: "0.6.38",
      installerFile: "OtherApp_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    });
    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("installer.file");
  });

  it("can require real connected MIDI input evidence", () => {
    const guarded = validateInstalledPunchTakeSummary(buildPunchTakeSummary(), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireMidiInput: true
    });
    expect(guarded.ok).toBe(false);
    expect(guarded.failures.join("\n")).toContain("connected MIDI input evidence is required");

    const noOsMidiInput = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      midiDevicePreflight: {
        platform: "win32",
        checked: true,
        inputCount: 0,
        outputCount: 1,
        inputs: [],
        outputs: [{ index: 0, name: "Microsoft GS Wavetable Synth" }]
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireMidiInput: true
    });
    expect(noOsMidiInput.ok).toBe(false);
    expect(noOsMidiInput.failures.join("\n")).toContain("midiDevicePreflight.inputCount must be at least 1");

    const captured = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      midiInputRecordingControl: {
        outcome: "started-and-stopped",
        startMessage: "Recording MIDI input.",
        stopMessage: "Recorded MIDI take.",
        punchEnabled: true,
        captureStartBar: 6,
        punchStartBar: 7,
        punchEndBar: 9,
        placement: {
          before: { clipCount: 10, groupedClipCount: 9, groupCount: 4, activeCount: 5 },
          after: { clipCount: 11, groupedClipCount: 10, groupCount: 5, activeCount: 6 },
          delta: { clipCount: 1, groupedClipCount: 1, groupCount: 1, activeCount: 1 }
        },
        take: {
          captured: true,
          clipId: "clip_midi_input_1",
          trackId: "track_midi_1",
          name: "MIDI Input Take",
          muted: false,
          takeGroupId: "midi-recording-session-midi-input-123",
          takeLaneIndex: 1,
          takeStatus: "active",
          punchStartBar: 7,
          punchEndBar: 9,
          captureStartBar: 6.036,
          punchMode: "create-new-midi-take-lane",
          noteCount: 2,
          pitches: [60, 67]
        }
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireMidiInput: true
    });
    expect(captured).toEqual({ ok: true, failures: [] });

    const noNotes = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      midiInputRecordingControl: {
        outcome: "started-and-stopped",
        startMessage: "Recording MIDI input.",
        stopMessage: "Stopped MIDI input recording; no notes were captured.",
        punchEnabled: true,
        captureStartBar: 6,
        punchStartBar: 7,
        punchEndBar: 9,
        placement: {
          before: { clipCount: 10, groupedClipCount: 9, groupCount: 4, activeCount: 5 },
          after: { clipCount: 10, groupedClipCount: 9, groupCount: 4, activeCount: 5 },
          delta: { clipCount: 0, groupedClipCount: 0, groupCount: 0, activeCount: 0 }
        },
        take: {
          captured: false,
          noteCount: 0,
          pitches: []
        }
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireMidiInput: true
    });
    expect(noNotes.ok).toBe(false);
    expect(noNotes.failures.join("\n")).toContain("midiInputRecordingControl.placement.delta.clipCount");
    expect(noNotes.failures.join("\n")).toContain("midiInputRecordingControl.take.captured");
    expect(noNotes.failures.join("\n")).toContain("midiInputRecordingControl.take.noteCount");

    const unpunched = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      midiInputRecordingControl: {
        outcome: "started-and-stopped",
        startMessage: "Recording MIDI input.",
        stopMessage: "Recorded MIDI take.",
        punchEnabled: false,
        placement: {
          before: { clipCount: 10, groupedClipCount: 9, groupCount: 4, activeCount: 5 },
          after: { clipCount: 11, groupedClipCount: 10, groupCount: 5, activeCount: 6 },
          delta: { clipCount: 1, groupedClipCount: 1, groupCount: 1, activeCount: 1 }
        },
        take: {
          captured: true,
          clipId: "clip_midi_input_2",
          trackId: "track_midi_1",
          muted: false,
          takeGroupId: "midi-recording-session-midi-input-124",
          takeLaneIndex: 1,
          takeStatus: "active",
          noteCount: 1,
          pitches: [64]
        }
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireMidiInput: true
    });
    expect(unpunched.ok).toBe(false);
    expect(unpunched.failures.join("\n")).toContain("midiInputRecordingControl.punchEnabled");
    expect(unpunched.failures.join("\n")).toContain("midiInputRecordingControl captureStartBar");
    expect(unpunched.failures.join("\n")).toContain("midiInputRecordingControl.take.punchMode");
  });

  it("can require audible audio capture evidence", () => {
    const quiet = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      audioRecordingControl: {
        ...buildPunchTakeSummary().audioRecordingControl,
        media: {
          ...buildPunchTakeSummary().audioRecordingControl.media,
          durationSeconds: 0.54,
          peak: 0.00001,
          filePeak: 0.00001,
          fileRms: 0.000002
        }
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireAudibleAudio: true
    });
    expect(quiet.ok).toBe(false);
    expect(quiet.failures.join("\n")).toContain("durationSeconds must be at least 3");
    expect(quiet.failures.join("\n")).toContain("filePeak must be at least 0.005");
    expect(quiet.failures.join("\n")).toContain("fileRms must be at least 0.001");

    const audible = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      audioRecordingControl: {
        ...buildPunchTakeSummary().audioRecordingControl,
        media: {
          ...buildPunchTakeSummary().audioRecordingControl.media,
          durationSeconds: 5.2,
          peak: 0.12,
          filePeak: 0.12,
          fileRms: 0.03,
          fileFrameCount: 249600
        }
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireAudibleAudio: true
    });
    expect(audible).toEqual({ ok: true, failures: [] });
  });

  it("can require exported WAV and MIDI files to still exist on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-exports-"));
    const exportPaths = writeExportEvidenceFiles(dir);

    expect(validateInstalledPunchTakeSummary(buildPunchTakeSummary(exportPaths), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireExportFiles: true
    })).toEqual({ ok: true, failures: [] });

    const missing = validateInstalledPunchTakeSummary(buildPunchTakeSummary(), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireExportFiles: true
    });
    expect(missing.ok).toBe(false);
    expect(missing.failures.join("\n")).toContain("wavPath must be a non-empty string");
    expect(missing.failures.join("\n")).toContain("midiPath must be a non-empty string");

    const nonexistent = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      wavPath: join(dir, "deleted.wav"),
      midiPath: join(dir, "deleted.mid")
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireExportFiles: true
    });
    expect(nonexistent.ok).toBe(false);
    expect(nonexistent.failures.join("\n")).toContain("wavPath does not exist");
    expect(nonexistent.failures.join("\n")).toContain("midiPath does not exist");

    const badWavPath = join(dir, "bad.wav");
    const badMidiPath = join(dir, "bad.mid");
    writeFileSync(badWavPath, "not a wav");
    writeFileSync(badMidiPath, "not a midi");
    const corrupt = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      wavPath: badWavPath,
      midiPath: badMidiPath
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireExportFiles: true
    });
    expect(corrupt.ok).toBe(false);
    expect(corrupt.failures.join("\n")).toContain("RIFF/WAVE audio export with sample data");
    expect(corrupt.failures.join("\n")).toContain("MThd MIDI export");

    const staleEvidence = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      ...exportPaths,
      wavSizeBytes: exportPaths.wavSizeBytes + 1,
      midiSha256: sha256("old midi export")
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireExportFiles: true
    });
    expect(staleEvidence.ok).toBe(false);
    expect(staleEvidence.failures.join("\n")).toContain("wavSizeBytes");
    expect(staleEvidence.failures.join("\n")).toContain("midiSha256");

    const leakyMidiPath = join(dir, "leaky.mid");
    const missingMidiPath = join(dir, "missing-active.mid");
    writeFileSync(leakyMidiPath, midiBytesWithPitches([82, 83, 84, 86]));
    writeFileSync(missingMidiPath, midiBytesWithPitches([83, 84]));
    const leakyMidi = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      ...exportPaths,
      midiPath: leakyMidiPath,
      midiSizeBytes: undefined,
      midiSha256: undefined
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireExportFiles: true
    });
    expect(leakyMidi.ok).toBe(false);
    expect(leakyMidi.failures.join("\n")).toContain("midiPath must exclude inactive sentinel pitch 82");

    const missingActiveMidi = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      ...exportPaths,
      midiPath: missingMidiPath,
      midiSizeBytes: undefined,
      midiSha256: undefined
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes"),
      requireExportFiles: true
    });
    expect(missingActiveMidi.ok).toBe(false);
    expect(missingActiveMidi.failures.join("\n")).toContain("midiPath must include active sentinel pitch 86");
  });

  it("rejects inactive MIDI export leakage and weak recorded-media evidence", () => {
    const validation = validateInstalledPunchTakeSummary(buildPunchTakeSummary({
      exportedMidiPitches: [82, 83, 85],
      audioRecordingControl: {
        ...buildPunchTakeSummary().audioRecordingControl,
        media: {
          ...buildPunchTakeSummary().audioRecordingControl.media,
          projectRelativePath: "take.wav",
          sizeBytes: 44,
          durationSeconds: 0.01,
          nativeCapturedFrameCount: 0,
          filePeak: -1,
          fileRms: -1,
          fileSampleRate: 0,
          fileChannels: 0,
          fileFrameCount: 0
        }
      }
    }), {
      version: "0.6.38",
      installerFile: "Pocket DAW_0.6.38_x64-setup.exe",
      installerSha256: sha256("installer bytes")
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures.join("\n")).toContain("project-media/recordings");
    expect(validation.failures.join("\n")).toContain("sizeBytes");
    expect(validation.failures.join("\n")).toContain("durationSeconds");
    expect(validation.failures.join("\n")).toContain("nativeCapturedFrameCount");
    expect(validation.failures.join("\n")).toContain("filePeak");
    expect(validation.failures.join("\n")).toContain("fileRms");
    expect(validation.failures.join("\n")).toContain("fileSampleRate");
    expect(validation.failures.join("\n")).toContain("fileChannels");
    expect(validation.failures.join("\n")).toContain("fileFrameCount");
    expect(validation.failures.join("\n")).toContain("inactive sentinel pitch 82");
    expect(validation.failures.join("\n")).toContain("inactive sentinel pitch 85");
    expect(validation.failures.join("\n")).toContain("active sentinel pitch 84");
    expect(validation.failures.join("\n")).toContain("active sentinel pitch 86");
  });
});
