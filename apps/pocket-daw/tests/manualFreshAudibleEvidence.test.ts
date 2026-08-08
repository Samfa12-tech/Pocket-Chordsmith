import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeNativeCaptureFingerprint } from "../scripts/native-capture-fingerprint.mjs";
import {
  analyzePcm16Wav,
  createManualFreshAudibleEvidenceForTests,
  verifyManualFreshAudibleEvidenceForTests
} from "../scripts/manual-fresh-audible-evidence.mjs";
import { verifyNativeCaptureEvidenceForTests } from "../scripts/verify-native-capture-evidence.mjs";

const LEGACY_COMMIT = "e650be444207cb81c7b91035be5eb4e62fafc326";
const UNRELATED_COMMIT = "32f6be33cc14916fe75432f802735550f2c5e61d";
const CAPTURED_AT_MS = 1786226911491;
const E650_SEMANTIC_FINGERPRINT = snapshotFingerprint(
  "pocket-daw-native-pcm-capture-v2",
  "e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770",
  "e650be44-semantic-pcm-v2"
);
const E650_CAPTURE_RUN_FINGERPRINT = snapshotFingerprint(
  "pocket-daw-native-capture-v1",
  "89db764e8ddce248597275b729bde0966b770991ebd2030f2d02a0715ed1d709",
  "e650be44-original-capture-run-v1"
);
const TEST_FINGERPRINT_DEPENDENCIES = {
  computeNativeCaptureFingerprintAtCommit: (_root: string, commit: string) => commit === LEGACY_COMMIT
    ? structuredClone(E650_SEMANTIC_FINGERPRINT)
    : snapshotFingerprint("pocket-daw-native-pcm-capture-v2", sha256(`semantic:${commit}`), `semantic-${commit}`),
  computeLegacyNativeCaptureFingerprintAtCommit: (_root: string, commit: string) => commit === LEGACY_COMMIT
    ? structuredClone(E650_CAPTURE_RUN_FINGERPRINT)
    : snapshotFingerprint("pocket-daw-native-capture-v1", sha256(`legacy:${commit}`), `legacy-${commit}`)
};
const createManualFreshAudibleEvidence = (options: Record<string, unknown>) =>
  createManualFreshAudibleEvidenceForTests(options, TEST_FINGERPRINT_DEPENDENCIES);
const verifyManualFreshAudibleEvidence = (options: Record<string, unknown>) =>
  verifyManualFreshAudibleEvidenceForTests(options, TEST_FINGERPRINT_DEPENDENCIES);
const verifyNativeCaptureEvidence = (options: Record<string, unknown>) =>
  verifyNativeCaptureEvidenceForTests(options, TEST_FINGERPRINT_DEPENDENCIES);

describe("manual fresh-audible evidence", () => {
  it("keeps PCM capture reuse semantic while retaining the exact legacy run fingerprint", () => {
    const currentSemantic = computeNativeCaptureFingerprint();
    expect(currentSemantic.schema).toBe(E650_SEMANTIC_FINGERPRINT.schema);
    expect(currentSemantic.value).toBe(E650_SEMANTIC_FINGERPRINT.value);
    expect(E650_CAPTURE_RUN_FINGERPRINT.schema).toBe("pocket-daw-native-capture-v1");
    expect(E650_CAPTURE_RUN_FINGERPRINT.value).toBe("89db764e8ddce248597275b729bde0966b770991ebd2030f2d02a0715ed1d709");
  });

  it("admits only the exact legacy Mono Ch2 metadata bug with pre/post project corroboration", () => {
    const fixture = createFixture({ storedChannelMap: [0], inputChannelIndex: 1, commit: LEGACY_COMMIT });
    const report = createManualFreshAudibleEvidence(fixture.options);

    expect(report.input).toEqual({
      deviceId: "wasapi:input:microphone-array",
      mode: "mono",
      channelIndex: 1,
      channelMap: [1],
      provenance: "known-bug-corroborated",
      knownBugId: "pocket-daw-0.6.46-mono-take-metadata-hardcoded-ch1"
    });
    expect(report.fingerprint).toEqual(E650_SEMANTIC_FINGERPRINT);
    expect(report.captureRunFingerprint.value).toBe("89db764e8ddce248597275b729bde0966b770991ebd2030f2d02a0715ed1d709");
    expect(verifyManualFreshAudibleEvidence({
      reportPath: fixture.reportPath,
      installerPath: fixture.installerPath,
      version: "0.6.46",
      commit: LEGACY_COMMIT,
      expectedFingerprint: fixture.fingerprint
    })).toMatchObject({ ok: true, failures: [] });
  });

  it("uses exact take metadata for fixed mono channels and preserves PCM thresholds", () => {
    const commit = LEGACY_COMMIT;
    const fixture = createFixture({ storedChannelMap: [1], inputChannelIndex: 1, commit, captureRunSchema: "v2" });
    const report = createManualFreshAudibleEvidence(fixture.options);
    expect(report.input).toMatchObject({ provenance: "exact-take-metadata", channelMap: [1] });
    expect(report.captureRunFingerprint.schema).toBe("pocket-daw-native-pcm-capture-v2");
    expect(report.audio.analysis.peak).toBeGreaterThan(0.2);
    expect(report.audio.analysis.rms).toBeGreaterThan(0.1);
    expect(report.audio.format.durationSeconds).toBe(4);
  });

  it("rejects unrelated commits, project drift, altered WAV bytes, and quiet audio", () => {
    const unrelated = createFixture({ storedChannelMap: [0], inputChannelIndex: 1, commit: UNRELATED_COMMIT });
    expect(() => createManualFreshAudibleEvidence(unrelated.options)).toThrow(/not the exact admitted 0\.6\.46 metadata bug/i);

    const drifted = createFixture({ storedChannelMap: [1], inputChannelIndex: 1, commit: LEGACY_COMMIT, preCaptureChannelIndex: 0 });
    expect(() => createManualFreshAudibleEvidence(drifted.options)).toThrow(/pre-capture project input device|pre-capture track channel index/i);

    const altered = createFixture({ storedChannelMap: [1], inputChannelIndex: 1, commit: LEGACY_COMMIT });
    createManualFreshAudibleEvidence(altered.options);
    const bytes = readFileSync(altered.wavPath);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(altered.wavPath, bytes);
    expect(verifyManualFreshAudibleEvidence({
      reportPath: altered.reportPath,
      installerPath: altered.installerPath,
      version: "0.6.46",
      commit: LEGACY_COMMIT,
      expectedFingerprint: altered.fingerprint
    }).failures.join("\n")).toContain("Manual WAV SHA-256");

    const chainedReport = JSON.parse(readFileSync(altered.reportPath, "utf8"));
    chainedReport.input.sourceAttestation = "prior.json";
    writeFileSync(altered.reportPath, JSON.stringify(chainedReport));
    expect(verifyManualFreshAudibleEvidence({
      reportPath: altered.reportPath,
      installerPath: altered.installerPath,
      version: "0.6.46",
      commit: LEGACY_COMMIT,
      expectedFingerprint: altered.fingerprint
    }).failures.join("\n")).toContain("Manual report input contains unexpected fields: sourceAttestation");

    const quiet = createFixture({ storedChannelMap: [1], inputChannelIndex: 1, commit: LEGACY_COMMIT, amplitude: 0.0005 });
    expect(() => createManualFreshAudibleEvidence(quiet.options)).toThrow(/peak must be at least 0\.005|RMS must be at least 0\.001/i);
  });

  it("requires a later exact-installer MIDI/export companion without claiming same-run audio", () => {
    const fixture = createFixture({ storedChannelMap: [0], inputChannelIndex: 1, commit: LEGACY_COMMIT });
    createManualFreshAudibleEvidence(fixture.options);
    const companionPath = join(fixture.dir, "automated-companion-summary.json");
    const companion = companionSummary(fixture.dir, fixture.installerPath);
    writeFileSync(companionPath, JSON.stringify(companion));
    const attestationPath = join(fixture.dir, "attestation.json");
    const attestation = {
      commit: LEGACY_COMMIT,
      testedAt: "2026-08-09T00:20:00.000Z",
      audioCaptureEvidence: {
        mode: "manual-fresh-audible",
        fingerprint: fixture.fingerprint,
        manual: { evidenceFile: basename(fixture.reportPath), evidenceSha256: sha256(readFileSync(fixture.reportPath)) },
        companion: { summaryFile: basename(companionPath), summarySha256: sha256(readFileSync(companionPath)) }
      }
    };
    writeFileSync(attestationPath, JSON.stringify(attestation));

    expect(verifyNativeCaptureEvidence({
      attestationPath,
      punchTakeSummaryPath: companionPath,
      manualFreshAudibleEvidencePath: fixture.reportPath,
      installerPath: fixture.installerPath,
      version: "0.6.46",
      root: process.cwd(),
      audioCaptureFingerprint: fixture.fingerprint
    })).toMatchObject({ ok: true, mode: "manual-fresh-audible", failures: [] });

    const mediaSummaryPath = join(fixture.dir, "media-summary.json");
    const gamePackPath = join(fixture.dir, "game-pack.zip");
    const godotImportPath = join(fixture.dir, "godot-import.json");
    writeFileSync(mediaSummaryPath, "media evidence");
    writeFileSync(gamePackPath, "game pack evidence");
    writeFileSync(godotImportPath, "godot evidence");
    const baselineAttestation = completeManualAttestation({
      installerPath: fixture.installerPath,
      manualReportPath: fixture.reportPath,
      companionPath,
      fingerprint: fixture.fingerprint,
      mediaSummaryPath,
      gamePackPath,
      godotImportPath
    });
    writeFileSync(attestationPath, JSON.stringify(baselineAttestation));

    const currentInstallerPath = join(fixture.dir, "Pocket.DAW_0.6.47_x64-setup.exe");
    const currentCompanionPath = join(fixture.dir, "current-automated-companion-summary.json");
    const currentAttestationPath = join(fixture.dir, "current-attestation.json");
    writeFileSync(currentInstallerPath, "next exact installer bytes");
    writeFileSync(currentCompanionPath, JSON.stringify(companionSummary(
      fixture.dir,
      currentInstallerPath,
      "0.6.47",
      "2026-08-09T00:30:00.000Z"
    )));
    writeFileSync(currentAttestationPath, JSON.stringify({
      commit: "f".repeat(40),
      testedAt: "2026-08-09T00:40:00.000Z",
      audioCaptureEvidence: {
        mode: "baseline-reuse",
        fingerprint: fixture.fingerprint,
        baseline: {
          attestationFile: basename(attestationPath),
          attestationSha256: sha256(readFileSync(attestationPath)),
          installerFile: basename(fixture.installerPath),
          installerSha256: sha256(readFileSync(fixture.installerPath))
        }
      }
    }));
    expect(verifyNativeCaptureEvidence({
      attestationPath: currentAttestationPath,
      punchTakeSummaryPath: currentCompanionPath,
      installerPath: currentInstallerPath,
      version: "0.6.47",
      baselineAttestationPath: attestationPath,
      baselineInstallerPath: fixture.installerPath,
      root: process.cwd(),
      audioCaptureFingerprint: fixture.fingerprint
    })).toMatchObject({ ok: true, mode: "baseline-reuse", failures: [] });

    const relabeled = verifyNativeCaptureEvidence({
      attestationPath,
      punchTakeSummaryPath: companionPath,
      manualFreshAudibleEvidencePath: fixture.reportPath,
      installerPath: fixture.installerPath,
      version: "0.6.46",
      requireAudibleAudio: true,
      root: process.cwd(),
      audioCaptureFingerprint: fixture.fingerprint
    });
    expect(relabeled.failures.join("\n")).toContain("must not relabel the automated companion run as audible");

    writeFileSync(companionPath, JSON.stringify({ ...companion, testedAt: "2026-08-08T20:00:00.000Z" }));
    const stale = verifyNativeCaptureEvidence({
      attestationPath,
      punchTakeSummaryPath: companionPath,
      manualFreshAudibleEvidencePath: fixture.reportPath,
      installerPath: fixture.installerPath,
      version: "0.6.46",
      root: process.cwd(),
      audioCaptureFingerprint: fixture.fingerprint
    });
    expect(stale.failures.join("\n")).toContain("Automated companion summary SHA-256");
    expect(stale.failures.join("\n")).toContain("prior summaries cannot be reused");
  });
});

function createFixture(input: {
  storedChannelMap: number[];
  inputChannelIndex: number;
  commit: string;
  preCaptureChannelIndex?: number;
  amplitude?: number;
  captureRunSchema?: "v1" | "v2";
}) {
  const dir = mkdtempSync(join(tmpdir(), "pocket-daw-manual-audible-"));
  const wavName = `manual-live-vocals-${CAPTURED_AT_MS}.wav`;
  const wavPath = join(dir, "project-media", "recordings", wavName);
  const projectPath = join(dir, "manual.pocketdaw");
  const preCaptureProjectPath = join(dir, "manual.pocketdaw.bak");
  const installerPath = join(dir, "Pocket.DAW_0.6.46_x64-setup.exe");
  const fingerprintPath = join(dir, "native-capture-fingerprint.json");
  const reportPath = join(dir, "manual-fresh-audible-evidence.json");
  writeFileSync(installerPath, "exact installer bytes");
  mkdirSync(dirname(wavPath), { recursive: true });
  writeFileSync(wavPath, pcm16Wav({ seconds: 4, amplitude: input.amplitude ?? 0.25 }), { flag: "wx" });
  const analysis = analyzePcm16Wav(wavPath);
  const assignment = (channelIndex: number) => ({
    inputDeviceId: "wasapi:input:microphone-array",
    recordingChannelMode: "mono",
    recordingInput: { deviceId: "wasapi:input:microphone-array", mode: "mono", channelIndex, allowDuplicateChannels: false }
  });
  const preCaptureProject = {
    tracks: [{ id: "live-vocals", ...assignment(input.preCaptureChannelIndex ?? input.inputChannelIndex) }],
    timeline: { clips: [] },
    mediaPool: []
  };
  const project = {
    tracks: [{ id: "live-vocals", ...assignment(input.inputChannelIndex) }],
    timeline: {
      clips: [{
        id: "clip_manual",
        type: "audio",
        trackId: "live-vocals",
        mediaPoolItemId: "media_manual",
        name: wavName,
        metadata: { durationSeconds: analysis.durationSeconds, inputMode: "mono", channelMap: input.storedChannelMap }
      }]
    },
    mediaPool: [{
      id: "media_manual",
      kind: "audio",
      name: wavName,
      uri: `project-media/recordings/${wavName}`,
      durationSeconds: analysis.durationSeconds,
      sizeBytes: analysis.sizeBytes,
      metadata: {
        projectRelativePath: `project-media/recordings/${wavName}`,
        recordedAt: "2026-08-08T22:08:36.000Z",
        nativeCaptureStartedAtUnixMs: CAPTURED_AT_MS,
        nativeCapturedFrameCount: analysis.frameCount,
        nativeCaptureSampleRate: analysis.sampleRate,
        inputMode: "mono",
        channelMap: input.storedChannelMap
      }
    }]
  };
  writeFileSync(preCaptureProjectPath, JSON.stringify(preCaptureProject));
  writeFileSync(projectPath, JSON.stringify(project));
  const fingerprint = TEST_FINGERPRINT_DEPENDENCIES.computeNativeCaptureFingerprintAtCommit(process.cwd(), input.commit);
  const captureRunFingerprint = input.captureRunSchema === "v2"
    ? fingerprint
    : TEST_FINGERPRINT_DEPENDENCIES.computeLegacyNativeCaptureFingerprintAtCommit(process.cwd(), input.commit);
  writeFileSync(fingerprintPath, JSON.stringify(captureRunFingerprint));
  return {
    dir,
    reportPath,
    wavPath,
    installerPath,
    fingerprint,
    options: {
      outPath: reportPath,
      projectPath,
      preCaptureProjectPath,
      wavPath,
      installerPath,
      fingerprintPath,
      version: "0.6.46",
      commit: input.commit,
      clipId: "clip_manual",
      trackId: "live-vocals",
      analyzedAt: "2026-08-09T00:00:00.000Z"
    }
  };
}

function companionSummary(dir: string, installerPath: string, version = "0.6.46", testedAt = "2026-08-09T00:10:00.000Z") {
  const wavPath = join(dir, "companion-export.wav");
  const midiPath = join(dir, "companion-export.mid");
  const wav = pcm16Wav({ seconds: 1, amplitude: 0.05 });
  const midi = midiWithPitches([83, 84, 86]);
  writeFileSync(wavPath, wav);
  writeFileSync(midiPath, midi);
  return {
    ok: true,
    testedAt,
    runningVersion: version,
    installer: { file: basename(installerPath), sha256: sha256(readFileSync(installerPath)) },
    clipCount: 11,
    groupedClipCount: 10,
    groupCount: 5,
    activeCount: 6,
    mutedCount: 4,
    exportedMidiPitches: [50, 83, 84, 86],
    midiTakeGroupCount: 1,
    midiRecordingTakeGroupCount: 1,
    audioInput: {
      deviceId: "wasapi:input:test-microphone",
      deviceName: "Test Microphone",
      channelIndex: 0,
      channelCount: 2
    },
    audioRecordingControl: {
      outcome: "started-and-stopped",
      inputMeterPreflight: {
        inputDeviceId: "wasapi:input:test-microphone",
        inputChannelIndex: 0,
        inputChannelMap: [0]
      },
      placement: { delta: { clipCount: 1, groupedClipCount: 1, groupCount: 1, activeCount: 1 } },
      media: {
        mediaPoolItemId: "media_companion",
        clipId: "clip_companion",
        file: "companion-take.wav",
        projectRelativePath: "project-media/recordings/companion-take.wav",
        sizeBytes: 51884,
        durationSeconds: 0.54,
        nativeCapturedFrameCount: 25920,
        nativeCaptureSampleRate: 48000,
        peak: 0.00001,
        filePeak: 0.00001,
        fileRms: 0.000002,
        fileSampleRate: 48000,
        fileChannels: 1,
        fileFrameCount: 25920,
        inputMode: "mono",
        channelMap: [0],
        clipInputMode: "mono",
        clipChannelMap: [0]
      }
    },
    midiInputRecordingControl: connectedMidiInputControl(),
    wavPath,
    wavSizeBytes: wav.length,
    wavSha256: sha256(wav),
    midiPath,
    midiSizeBytes: midi.length,
    midiSha256: sha256(midi)
  };
}

function completeManualAttestation(options: {
  installerPath: string;
  manualReportPath: string;
  companionPath: string;
  fingerprint: any;
  mediaSummaryPath: string;
  gamePackPath: string;
  godotImportPath: string;
}) {
  const evidence = (id: string) => {
    if (id === "native-media-reliability") return [{ kind: "installed-media-portability-summary", result: "pass", file: basename(options.mediaSummaryPath), sha256: sha256(readFileSync(options.mediaSummaryPath)) }];
    if (id === "punch-take-lane-recording") return [{ kind: "installed-punch-take-summary", result: "pass", file: basename(options.companionPath), sha256: sha256(readFileSync(options.companionPath)) }];
    if (id === "game-pack-target-smoke") return [
      { kind: "game-pack-zip", result: "pass", file: basename(options.gamePackPath), sha256: sha256(readFileSync(options.gamePackPath)) },
      { kind: "godot-target-import", result: "pass", file: basename(options.godotImportPath), details: "Godot target import passed." }
    ];
    return [];
  };
  const checkIds = ["install-launch", "about-diagnostics", "basic-audio", "chordsmith-import", "project-workflow", "native-media-reliability", "punch-take-lane-recording", "game-pack-target-smoke", "updater-check"];
  return {
    version: "0.6.46",
    commit: LEGACY_COMMIT,
    installerFile: basename(options.installerPath),
    installerSha256: sha256(readFileSync(options.installerPath)),
    audioCaptureEvidence: {
      mode: "manual-fresh-audible",
      fingerprint: options.fingerprint,
      manual: { evidenceFile: basename(options.manualReportPath), evidenceSha256: sha256(readFileSync(options.manualReportPath)) },
      companion: { summaryFile: basename(options.companionPath), summarySha256: sha256(readFileSync(options.companionPath)) }
    },
    testedAt: "2026-08-09T00:20:00.000Z",
    result: "pass",
    machine: { windowsVersion: "Windows 11", architecture: "x64", audioInput: "Microphone Array", audioOutput: "Speakers" },
    checks: checkIds.map((id) => ({ id, result: "pass", notes: `${id} completed`, evidence: evidence(id) })),
    knownFailures: []
  };
}

function connectedMidiInputControl() {
  return {
    outcome: "started-and-stopped",
    punchEnabled: true,
    requestedCaptureStartBar: 6,
    captureStartBar: 6.25,
    punchStartBar: 7,
    punchEndBar: 9,
    placement: { delta: { clipCount: 1, groupedClipCount: 1, groupCount: 1, activeCount: 1 } },
    take: {
      captured: true,
      clipId: "clip_midi",
      trackId: "midi",
      takeGroupId: "midi-recording-session-1",
      takeLaneIndex: 1,
      takeStatus: "active",
      muted: false,
      punchStartBar: 7,
      punchEndBar: 9,
      captureStartBar: 6.25,
      punchMode: "create-new-midi-take-lane",
      noteCount: 3,
      pitches: [60, 64, 67]
    }
  };
}

function midiWithPitches(pitches: number[]) {
  const track: number[] = [0x00, 0xff, 0x03, 0x04, 0x54, 0x61, 0x6b, 0x65];
  for (const pitch of pitches) track.push(0x00, 0x90, pitch, 0x64, 0x81, 0x00, 0x80, pitch, 0x00);
  track.push(0x00, 0xff, 0x2f, 0x00);
  return Buffer.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >>> 24) & 0xff, (track.length >>> 16) & 0xff, (track.length >>> 8) & 0xff, track.length & 0xff,
    ...track
  ]);
}

function sha256(value: string | NodeJS.ArrayBufferView) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotFingerprint(schema: string, value: string, id: string) {
  return {
    schema,
    algorithm: "sha256",
    value,
    inputs: [{ id, sha256: sha256(`input:${id}`) }]
  };
}

function pcm16Wav({ seconds, amplitude }: { seconds: number; amplitude: number }) {
  const sampleRate = 48000;
  const frameCount = sampleRate * seconds;
  const dataSize = frameCount * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataSize, 40);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.round(Math.sin((frame / sampleRate) * Math.PI * 2 * 220) * amplitude * 32767);
    bytes.writeInt16LE(sample, 44 + frame * 2);
  }
  return bytes;
}
