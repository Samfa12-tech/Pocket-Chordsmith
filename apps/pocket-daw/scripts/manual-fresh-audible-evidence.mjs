import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  computeLegacyNativeCaptureFingerprintAtCommit,
  computeNativeCaptureFingerprintAtCommit,
  LEGACY_NATIVE_CAPTURE_FINGERPRINT_SCHEMA,
  NATIVE_CAPTURE_FINGERPRINT_SCHEMA,
  sameNativeCaptureFingerprint
} from "./native-capture-fingerprint.mjs";

export const MANUAL_FRESH_AUDIBLE_SCHEMA = "pocket-daw-manual-fresh-audible-v1";
export const MANUAL_AUDIO_THRESHOLDS = Object.freeze({
  minDurationSeconds: 3,
  minPeak: 0.005,
  minRms: 0.001
});

const LEGACY_MONO_CHANNEL_MAP_BUG = Object.freeze({
  id: "pocket-daw-0.6.46-mono-take-metadata-hardcoded-ch1",
  version: "0.6.46",
  commit: "e650be444207cb81c7b91035be5eb4e62fafc326"
});

export function createManualFreshAudibleEvidence(options = {}) {
  return createManualFreshAudibleEvidenceImpl(options, DEFAULT_FINGERPRINT_DEPENDENCIES);
}

export function createManualFreshAudibleEvidenceForTests(options = {}, testDependencies) {
  return createManualFreshAudibleEvidenceImpl(options, validateTestFingerprintDependencies(testDependencies));
}

function createManualFreshAudibleEvidenceImpl(options, fingerprintDependencies) {
  const outPath = requiredPath(options.outPath, "outPath");
  const projectPath = requiredPath(options.projectPath, "projectPath");
  const preCaptureProjectPath = requiredPath(options.preCaptureProjectPath, "preCaptureProjectPath");
  const wavPath = requiredPath(options.wavPath, "wavPath");
  const installerPath = requiredPath(options.installerPath, "installerPath");
  const fingerprintPath = requiredPath(options.fingerprintPath, "fingerprintPath");
  const version = requiredText(options.version, "version");
  const commit = requiredCommit(options.commit, "commit");
  const clipId = requiredText(options.clipId, "clipId");
  const trackId = requiredText(options.trackId, "trackId");
  for (const path of [projectPath, preCaptureProjectPath, wavPath, installerPath, fingerprintPath]) {
    if (!existsSync(path)) throw new Error(`Evidence input does not exist: ${path}`);
  }

  const captureRunFingerprint = readJson(fingerprintPath, "Native capture run fingerprint");
  const expectedCaptureRunFingerprint = deterministicCaptureRunFingerprint(process.cwd(), commit, captureRunFingerprint?.schema, fingerprintDependencies);
  if (!sameNativeCaptureFingerprint(captureRunFingerprint, expectedCaptureRunFingerprint)) {
    throw new Error("Retained native capture run fingerprint does not match the exact candidate commit's deterministic fingerprint.");
  }
  const fingerprint = fingerprintDependencies.computeNativeCaptureFingerprintAtCommit(process.cwd(), commit);
  const project = readJson(projectPath, "Manual recording project");
  const preCaptureProject = readJson(preCaptureProjectPath, "Pre-capture project");
  const projectEvidence = resolveProjectEvidence(project, preCaptureProject, clipId, trackId);
  const audio = analyzePcm16Wav(wavPath);
  const capturedAt = isoFromUnixMilliseconds(projectEvidence.media.metadata?.nativeCaptureStartedAtUnixMs, "nativeCaptureStartedAtUnixMs");
  const recordedAt = requiredUtcTimestamp(projectEvidence.media.metadata?.recordedAt, "media.metadata.recordedAt");
  const analyzedAt = options.analyzedAt ? requiredUtcTimestamp(options.analyzedAt, "analyzedAt") : new Date().toISOString();
  const input = projectInputEvidence(projectEvidence, version, commit);
  const baseDir = dirname(resolve(outPath));

  const report = {
    schema: MANUAL_FRESH_AUDIBLE_SCHEMA,
    result: "pass",
    version,
    commit,
    installer: {
      file: basename(installerPath),
      sha256: sha256File(installerPath)
    },
    fingerprint,
    captureRunFingerprint,
    capturedAt,
    recordedAt,
    analyzedAt,
    project: {
      file: containedRelativePath(baseDir, projectPath, "projectPath"),
      sha256: sha256File(projectPath),
      preCaptureFile: containedRelativePath(baseDir, preCaptureProjectPath, "preCaptureProjectPath"),
      preCaptureSha256: sha256File(preCaptureProjectPath),
      clipId,
      mediaPoolItemId: projectEvidence.media.id,
      trackId
    },
    audio: {
      file: containedRelativePath(baseDir, wavPath, "wavPath"),
      sha256: sha256File(wavPath),
      sizeBytes: audio.sizeBytes,
      format: {
        container: "RIFF/WAVE",
        encoding: "PCM signed integer",
        bitsPerSample: audio.bitsPerSample,
        channels: audio.channels,
        sampleRate: audio.sampleRate,
        frameCount: audio.frameCount,
        durationSeconds: audio.durationSeconds
      },
      analysis: {
        sampleCount: audio.sampleCount,
        nonzeroSampleCount: audio.nonzeroSampleCount,
        peak: audio.peak,
        rms: audio.rms
      },
      thresholds: { ...MANUAL_AUDIO_THRESHOLDS }
    },
    input
  };

  const verified = verifyManualFreshAudibleEvidenceImpl({
    report,
    reportPath: outPath,
    installerPath,
    version,
    commit,
    expectedFingerprint: fingerprint,
    expectedCaptureRunFingerprint
  }, fingerprintDependencies);
  if (!verified.ok) throw new Error(`Manual fresh-audible evidence could not be created:\n${verified.failures.join("\n")}`);
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return report;
}

export function verifyManualFreshAudibleEvidence(options = {}) {
  return verifyManualFreshAudibleEvidenceImpl(options, DEFAULT_FINGERPRINT_DEPENDENCIES);
}

export function verifyManualFreshAudibleEvidenceForTests(options = {}, testDependencies) {
  return verifyManualFreshAudibleEvidenceImpl(options, validateTestFingerprintDependencies(testDependencies));
}

function verifyManualFreshAudibleEvidenceImpl(options, fingerprintDependencies) {
  const failures = [];
  const reportPath = options.reportPath ? resolve(options.reportPath) : null;
  const report = options.report || (reportPath && existsSync(reportPath) ? readJson(reportPath, "Manual fresh-audible report") : null);
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    failures.push("Manual fresh-audible report must be a JSON object.");
    return { ok: false, failures, analysis: null };
  }
  validateReportShape(report, failures);
  if (!reportPath) failures.push("Manual fresh-audible reportPath is required for file binding.");
  if (report.schema !== MANUAL_FRESH_AUDIBLE_SCHEMA) failures.push(`Manual report schema must be ${MANUAL_FRESH_AUDIBLE_SCHEMA}.`);
  if (report.result !== "pass") failures.push("Manual report result must be pass.");
  if (report.baseline !== undefined || report.priorAttestation !== undefined || report.sourceAttestation !== undefined) {
    failures.push("Manual fresh-audible evidence must be direct; baseline or attestation chains are forbidden.");
  }
  compare(report.version, options.version, "Manual report version", failures);
  compareLower(report.commit, options.commit, "Manual report commit", failures);
  compare(report.installer?.file, basename(options.installerPath || ""), "Manual report installer filename", failures);
  if (!options.installerPath || !existsSync(options.installerPath)) {
    failures.push(`Manual report exact installer does not exist: ${options.installerPath || "missing"}`);
  } else {
    compareHash(report.installer?.sha256, sha256File(options.installerPath), "Manual report installer SHA-256", failures);
  }
  if (!sameNativeCaptureFingerprint(report.fingerprint, options.expectedFingerprint)) {
    failures.push("Manual report fingerprint does not match the exact candidate capture fingerprint.");
  }
  let deterministicRunFingerprint = null;
  try {
    deterministicRunFingerprint = options.commit
      ? deterministicCaptureRunFingerprint(process.cwd(), options.commit, report.captureRunFingerprint?.schema, fingerprintDependencies)
      : null;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (!sameNativeCaptureFingerprint(report.captureRunFingerprint, deterministicRunFingerprint)) {
    failures.push("Manual report capture-run fingerprint does not match the exact candidate's retained run fingerprint.");
  }
  if (options.expectedCaptureRunFingerprint && !sameNativeCaptureFingerprint(options.expectedCaptureRunFingerprint, deterministicRunFingerprint)) {
    failures.push("Provided retained capture-run fingerprint does not match the exact candidate's deterministic fingerprint.");
  }

  const capturedAt = timestamp(report.capturedAt, "capturedAt", failures);
  const recordedAt = timestamp(report.recordedAt, "recordedAt", failures);
  const analyzedAt = timestamp(report.analyzedAt, "analyzedAt", failures);
  if (capturedAt !== null && recordedAt !== null && recordedAt < capturedAt) failures.push("Manual report recordedAt must not precede capturedAt.");
  if (recordedAt !== null && analyzedAt !== null && analyzedAt < recordedAt) failures.push("Manual report analyzedAt must not precede recordedAt.");

  const baseDir = reportPath ? dirname(reportPath) : process.cwd();
  const projectPath = resolveBoundFile(baseDir, report.project?.file, "project.file", failures);
  const preCaptureProjectPath = resolveBoundFile(baseDir, report.project?.preCaptureFile, "project.preCaptureFile", failures);
  const wavPath = resolveBoundFile(baseDir, report.audio?.file, "audio.file", failures);
  let analysis = null;
  if (projectPath) compareHash(report.project?.sha256, sha256File(projectPath), "Manual project SHA-256", failures);
  if (preCaptureProjectPath) compareHash(report.project?.preCaptureSha256, sha256File(preCaptureProjectPath), "Pre-capture project SHA-256", failures);
  if (wavPath) {
    compareHash(report.audio?.sha256, sha256File(wavPath), "Manual WAV SHA-256", failures);
    try {
      analysis = analyzePcm16Wav(wavPath);
      validateAudioAnalysis(report.audio, analysis, failures);
    } catch (error) {
      failures.push(`Manual WAV analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (projectPath && preCaptureProjectPath && wavPath) {
    try {
      validateProjectBinding({
        report,
        projectPath,
        preCaptureProjectPath,
        wavPath,
        analysis,
        capturedAt,
        recordedAt
      }, failures);
    } catch (error) {
      failures.push(`Manual project binding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: failures.length === 0, failures, analysis };
}

export function analyzePcm16Wav(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("file is not RIFF/WAVE audio");
  }
  let format = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.length) throw new Error(`truncated ${id} chunk`);
    if (id === "fmt ") format = { start, size };
    if (id === "data") data = { start, size };
    offset = end + (size % 2);
  }
  if (!format || format.size < 16) throw new Error("fmt chunk is missing or invalid");
  if (!data || data.size < 1) throw new Error("data chunk is missing or empty");
  const audioFormat = bytes.readUInt16LE(format.start);
  const channels = bytes.readUInt16LE(format.start + 2);
  const sampleRate = bytes.readUInt32LE(format.start + 4);
  const blockAlign = bytes.readUInt16LE(format.start + 12);
  const bitsPerSample = bytes.readUInt16LE(format.start + 14);
  if (audioFormat !== 1 || bitsPerSample !== 16) throw new Error("native manual evidence requires PCM16 WAV audio");
  if (!channels || !sampleRate || blockAlign !== channels * 2 || data.size % blockAlign !== 0) throw new Error("PCM16 WAV format fields are inconsistent");
  let peak = 0;
  let sumSquares = 0;
  let nonzeroSampleCount = 0;
  const sampleCount = data.size / 2;
  for (let index = data.start; index < data.start + data.size; index += 2) {
    const sample = bytes.readInt16LE(index) / 32768;
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    sumSquares += sample * sample;
    if (sample !== 0) nonzeroSampleCount += 1;
  }
  const frameCount = data.size / blockAlign;
  return {
    sizeBytes: bytes.length,
    bitsPerSample,
    channels,
    sampleRate,
    frameCount,
    durationSeconds: frameCount / sampleRate,
    sampleCount,
    nonzeroSampleCount,
    peak,
    rms: Math.sqrt(sumSquares / sampleCount)
  };
}

function validateProjectBinding(options, failures) {
  const project = readJson(options.projectPath, "Manual recording project");
  const preCaptureProject = readJson(options.preCaptureProjectPath, "Pre-capture project");
  const binding = resolveProjectEvidence(project, preCaptureProject, options.report.project?.clipId, options.report.project?.trackId);
  compare(binding.media.id, options.report.project?.mediaPoolItemId, "Manual project mediaPoolItemId", failures);
  compare(basename(options.wavPath), binding.clip.name, "Manual WAV/clip filename", failures);
  const mediaUri = String(binding.media.metadata?.projectRelativePath || binding.media.uri || "").replace(/\\/g, "/");
  const expectedWavPath = resolve(dirname(options.projectPath), ...mediaUri.split("/"));
  if (resolve(expectedWavPath).toLowerCase() !== resolve(options.wavPath).toLowerCase()) failures.push("Manual project media URI does not resolve to the bound WAV file.");
  compareNumber(binding.media.sizeBytes, options.analysis?.sizeBytes, "Manual project media size", failures);
  compareNumber(binding.media.metadata?.nativeCapturedFrameCount, options.analysis?.frameCount, "Manual project native frame count", failures);
  compareNumber(binding.media.metadata?.nativeCaptureSampleRate, options.analysis?.sampleRate, "Manual project native sample rate", failures);
  compareNear(binding.media.durationSeconds, options.analysis?.durationSeconds, 0.02, "Manual project media duration", failures);
  compareNear(binding.clip.metadata?.durationSeconds, options.analysis?.durationSeconds, 0.02, "Manual project clip duration", failures);
  compare(binding.media.metadata?.recordedAt, options.report.recordedAt, "Manual project recordedAt", failures);
  compare(isoFromUnixMilliseconds(binding.media.metadata?.nativeCaptureStartedAtUnixMs, "nativeCaptureStartedAtUnixMs"), options.report.capturedAt, "Manual project capturedAt", failures);

  const filenameEpoch = Number(basename(options.wavPath).match(/-(\d{13})\.wav$/i)?.[1]);
  if (!Number.isFinite(filenameEpoch) || Math.abs(filenameEpoch - Number(binding.media.metadata?.nativeCaptureStartedAtUnixMs)) > 1000) {
    failures.push("Manual WAV filename timestamp does not match native capture start.");
  }
  if (options.capturedAt !== null && options.recordedAt !== null && options.analysis) {
    const finalizationSeconds = (options.recordedAt - options.capturedAt) / 1000;
    if (finalizationSeconds < options.analysis.durationSeconds - 0.25 || finalizationSeconds > options.analysis.durationSeconds + 10) {
      failures.push("Manual capture/finalization timestamps do not match the WAV duration.");
    }
  }
  validateInputBinding(binding, options.report, failures);
}

function validateInputBinding(binding, report, failures) {
  const input = report.input;
  if (!input || typeof input !== "object") {
    failures.push("Manual report input evidence is required.");
    return;
  }
  if (input.mode !== "mono") failures.push("Manual fresh-audible input mode must be mono.");
  if (!Number.isInteger(input.channelIndex) || input.channelIndex < 0) failures.push("Manual input channelIndex must be a non-negative integer.");
  if (!Array.isArray(input.channelMap) || input.channelMap.length !== 1 || input.channelMap[0] !== input.channelIndex) failures.push("Manual input channelMap must contain the selected channelIndex.");
  for (const [label, track] of [["pre-capture", binding.preCaptureTrack], ["recorded", binding.track]]) {
    compare(track.inputDeviceId, input.deviceId, `Manual ${label} project input device`, failures);
    compare(track.recordingInput?.deviceId, input.deviceId, `Manual ${label} track recording input device`, failures);
    compare(track.recordingInput?.mode, "mono", `Manual ${label} track recording mode`, failures);
    compareNumber(track.recordingInput?.channelIndex, input.channelIndex, `Manual ${label} track channel index`, failures);
  }
  const clipMap = binding.clip.metadata?.channelMap;
  const mediaMap = binding.media.metadata?.channelMap;
  const exact = sameNumberArray(clipMap, input.channelMap) && sameNumberArray(mediaMap, input.channelMap);
  if (input.provenance === "exact-take-metadata") {
    if (!exact) failures.push("Manual exact-take-metadata provenance does not match the clip/media channel maps.");
    if (input.knownBugId !== undefined) failures.push("knownBugId must be omitted for exact take metadata.");
    return;
  }
  if (input.provenance !== "known-bug-corroborated") {
    failures.push("Manual input provenance must be exact-take-metadata or known-bug-corroborated.");
    return;
  }
  if (report.version !== LEGACY_MONO_CHANNEL_MAP_BUG.version || String(report.commit).toLowerCase() !== LEGACY_MONO_CHANNEL_MAP_BUG.commit) {
    failures.push("Known-bug channel corroboration is allowed only for the exact affected 0.6.46 candidate commit.");
  }
  if (input.knownBugId !== LEGACY_MONO_CHANNEL_MAP_BUG.id) failures.push("Manual knownBugId does not identify the narrow 0.6.46 mono metadata bug.");
  if (input.channelIndex === 0 || !sameNumberArray(clipMap, [0]) || !sameNumberArray(mediaMap, [0])) {
    failures.push("Known-bug corroboration requires a non-Ch1 selected channel and the exact legacy [0] clip/media metadata defect.");
  }
}

function validateAudioAnalysis(audio, actual, failures) {
  compareNumber(audio?.sizeBytes, actual.sizeBytes, "Manual WAV size", failures);
  compare(audio?.format?.container, "RIFF/WAVE", "Manual WAV container", failures);
  compare(audio?.format?.encoding, "PCM signed integer", "Manual WAV encoding", failures);
  for (const field of ["bitsPerSample", "channels", "sampleRate", "frameCount"]) compareNumber(audio?.format?.[field], actual[field], `Manual WAV ${field}`, failures);
  compareNear(audio?.format?.durationSeconds, actual.durationSeconds, 1e-9, "Manual WAV duration", failures);
  compareNumber(audio?.analysis?.sampleCount, actual.sampleCount, "Manual WAV sample count", failures);
  compareNumber(audio?.analysis?.nonzeroSampleCount, actual.nonzeroSampleCount, "Manual WAV nonzero sample count", failures);
  compareNear(audio?.analysis?.peak, actual.peak, 1e-12, "Manual WAV peak", failures);
  compareNear(audio?.analysis?.rms, actual.rms, 1e-12, "Manual WAV RMS", failures);
  for (const [field, expected] of Object.entries(MANUAL_AUDIO_THRESHOLDS)) compareNumber(audio?.thresholds?.[field], expected, `Manual threshold ${field}`, failures);
  if (actual.durationSeconds < MANUAL_AUDIO_THRESHOLDS.minDurationSeconds) failures.push(`Manual WAV duration must be at least ${MANUAL_AUDIO_THRESHOLDS.minDurationSeconds} seconds.`);
  if (actual.peak < MANUAL_AUDIO_THRESHOLDS.minPeak) failures.push(`Manual WAV peak must be at least ${MANUAL_AUDIO_THRESHOLDS.minPeak}.`);
  if (actual.rms < MANUAL_AUDIO_THRESHOLDS.minRms) failures.push(`Manual WAV RMS must be at least ${MANUAL_AUDIO_THRESHOLDS.minRms}.`);
  if (actual.nonzeroSampleCount < 1) failures.push("Manual WAV must contain nonzero PCM samples.");
}

function validateReportShape(report, failures) {
  exactKeys(report, [
    "schema", "result", "version", "commit", "installer", "fingerprint", "captureRunFingerprint", "capturedAt", "recordedAt", "analyzedAt", "project", "audio", "input"
  ], "Manual report", failures);
  exactKeys(report.installer, ["file", "sha256"], "Manual report installer", failures);
  exactKeys(report.fingerprint, ["schema", "algorithm", "value", "inputs"], "Manual report fingerprint", failures);
  validateFingerprint(report.fingerprint, NATIVE_CAPTURE_FINGERPRINT_SCHEMA, "Manual report semantic PCM fingerprint", failures);
  if (Array.isArray(report.fingerprint?.inputs)) {
    report.fingerprint.inputs.forEach((entry, index) => exactKeys(entry, ["id", "sha256"], `Manual report fingerprint input ${index}`, failures));
  }
  exactKeys(report.captureRunFingerprint, ["schema", "algorithm", "value", "inputs"], "Manual report capture-run fingerprint", failures);
  const captureRunSchema = report.captureRunFingerprint?.schema;
  if (![LEGACY_NATIVE_CAPTURE_FINGERPRINT_SCHEMA, NATIVE_CAPTURE_FINGERPRINT_SCHEMA].includes(captureRunSchema)) {
    failures.push(`Manual report capture-run fingerprint schema must be ${LEGACY_NATIVE_CAPTURE_FINGERPRINT_SCHEMA} or ${NATIVE_CAPTURE_FINGERPRINT_SCHEMA}.`);
  } else {
    validateFingerprint(report.captureRunFingerprint, captureRunSchema, "Manual report capture-run fingerprint", failures);
  }
  if (Array.isArray(report.captureRunFingerprint?.inputs)) {
    report.captureRunFingerprint.inputs.forEach((entry, index) => exactKeys(entry, ["id", "sha256"], `Manual report capture-run fingerprint input ${index}`, failures));
  }
  exactKeys(report.project, ["file", "sha256", "preCaptureFile", "preCaptureSha256", "clipId", "mediaPoolItemId", "trackId"], "Manual report project", failures);
  exactKeys(report.audio, ["file", "sha256", "sizeBytes", "format", "analysis", "thresholds"], "Manual report audio", failures);
  exactKeys(report.audio?.format, ["container", "encoding", "bitsPerSample", "channels", "sampleRate", "frameCount", "durationSeconds"], "Manual report audio format", failures);
  exactKeys(report.audio?.analysis, ["sampleCount", "nonzeroSampleCount", "peak", "rms"], "Manual report audio analysis", failures);
  exactKeys(report.audio?.thresholds, ["minDurationSeconds", "minPeak", "minRms"], "Manual report audio thresholds", failures);
  exactKeys(report.input, ["deviceId", "mode", "channelIndex", "channelMap", "provenance", "knownBugId"], "Manual report input", failures, ["knownBugId"]);
}

function validateFingerprint(value, expectedSchema, label, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  if (value.schema !== expectedSchema) failures.push(`${label} schema must be ${expectedSchema}.`);
  if (value.algorithm !== "sha256") failures.push(`${label} algorithm must be sha256.`);
  if (!isSha256(value.value)) failures.push(`${label} value must be a SHA-256 hash.`);
  if (!Array.isArray(value.inputs) || !value.inputs.length) {
    failures.push(`${label} inputs must be a non-empty array.`);
    return;
  }
  const ids = new Set();
  value.inputs.forEach((entry, index) => {
    if (typeof entry?.id !== "string" || !entry.id) failures.push(`${label} input ${index} id is required.`);
    if (!isSha256(entry?.sha256)) failures.push(`${label} input ${index} sha256 must be a SHA-256 hash.`);
    if (ids.has(entry?.id)) failures.push(`${label} input id is duplicated: ${entry?.id}.`);
    ids.add(entry?.id);
  });
}

function exactKeys(value, allowed, label, failures, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label} must be a JSON object.`);
    return;
  }
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length) failures.push(`${label} contains unexpected fields: ${unexpected.join(", ")}.`);
  const optionalSet = new Set(optional);
  const missing = allowed.filter((key) => !optionalSet.has(key) && !Object.hasOwn(value, key));
  if (missing.length) failures.push(`${label} is missing required fields: ${missing.join(", ")}.`);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function deterministicCaptureRunFingerprint(root, commit, schema, dependencies) {
  if (schema === LEGACY_NATIVE_CAPTURE_FINGERPRINT_SCHEMA) return dependencies.computeLegacyNativeCaptureFingerprintAtCommit(root, commit);
  if (schema === NATIVE_CAPTURE_FINGERPRINT_SCHEMA) return dependencies.computeNativeCaptureFingerprintAtCommit(root, commit);
  throw new Error(`Unsupported retained native capture run fingerprint schema: ${schema || "missing"}.`);
}

const DEFAULT_FINGERPRINT_DEPENDENCIES = Object.freeze({
  computeNativeCaptureFingerprintAtCommit,
  computeLegacyNativeCaptureFingerprintAtCommit
});

function validateTestFingerprintDependencies(testDependencies) {
  if (
    !testDependencies
    || typeof testDependencies !== "object"
    || typeof testDependencies.computeNativeCaptureFingerprintAtCommit !== "function"
    || typeof testDependencies.computeLegacyNativeCaptureFingerprintAtCommit !== "function"
  ) {
    throw new Error("Test fingerprint dependencies must provide both historical fingerprint readers.");
  }
  return testDependencies;
}

function resolveProjectEvidence(project, preCaptureProject, clipId, trackId) {
  const clips = Array.isArray(project?.timeline?.clips) ? project.timeline.clips : [];
  const preClips = Array.isArray(preCaptureProject?.timeline?.clips) ? preCaptureProject.timeline.clips : [];
  const clip = clips.find((entry) => entry?.id === clipId);
  if (!clip || clip.type !== "audio" || clip.trackId !== trackId) throw new Error(`Project does not contain audio clip ${clipId} on ${trackId}.`);
  const mediaItems = Array.isArray(project.mediaPool) ? project.mediaPool : project.mediaPool?.items;
  const preMediaItems = Array.isArray(preCaptureProject.mediaPool) ? preCaptureProject.mediaPool : preCaptureProject.mediaPool?.items;
  const media = Array.isArray(mediaItems) ? mediaItems.find((entry) => entry?.id === clip.mediaPoolItemId) : null;
  if (!media || media.kind !== "audio") throw new Error(`Project does not contain referenced audio media ${clip.mediaPoolItemId}.`);
  const track = Array.isArray(project.tracks) ? project.tracks.find((entry) => entry?.id === trackId) : null;
  const preCaptureTrack = Array.isArray(preCaptureProject.tracks) ? preCaptureProject.tracks.find((entry) => entry?.id === trackId) : null;
  if (!track || !preCaptureTrack) throw new Error(`Current and pre-capture projects must both contain track ${trackId}.`);
  if (preClips.some((entry) => entry?.id === clipId || entry?.name === clip.name)) throw new Error("Pre-capture project already contains the claimed manual clip.");
  if (Array.isArray(preMediaItems) && preMediaItems.some((entry) => entry?.id === media.id || entry?.name === media.name)) throw new Error("Pre-capture project already contains the claimed manual media.");
  return { clip, media, track, preCaptureTrack };
}

function projectInputEvidence(binding, version, commit) {
  const assignment = binding.track.recordingInput;
  if (!assignment || assignment.mode !== "mono" || !Number.isInteger(assignment.channelIndex) || assignment.channelIndex < 0 || typeof assignment.deviceId !== "string" || !assignment.deviceId) {
    throw new Error("Manual project track does not contain an explicit valid mono input assignment.");
  }
  const channelMap = [assignment.channelIndex];
  const exact = sameNumberArray(binding.clip.metadata?.channelMap, channelMap) && sameNumberArray(binding.media.metadata?.channelMap, channelMap);
  if (exact) return { deviceId: assignment.deviceId, mode: "mono", channelIndex: assignment.channelIndex, channelMap, provenance: "exact-take-metadata" };
  const legacy = version === LEGACY_MONO_CHANNEL_MAP_BUG.version
    && commit.toLowerCase() === LEGACY_MONO_CHANNEL_MAP_BUG.commit
    && assignment.channelIndex !== 0
    && sameNumberArray(binding.clip.metadata?.channelMap, [0])
    && sameNumberArray(binding.media.metadata?.channelMap, [0]);
  if (!legacy) throw new Error("Manual take channel metadata does not match the project input assignment and is not the exact admitted 0.6.46 metadata bug.");
  return {
    deviceId: assignment.deviceId,
    mode: "mono",
    channelIndex: assignment.channelIndex,
    channelMap,
    provenance: "known-bug-corroborated",
    knownBugId: LEGACY_MONO_CHANNEL_MAP_BUG.id
  };
}

function resolveBoundFile(baseDir, value, label, failures) {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
    failures.push(`${label} must be a contained relative path.`);
    return null;
  }
  const path = resolve(baseDir, value);
  if (!isContained(baseDir, path) || !existsSync(path)) {
    failures.push(`${label} does not resolve to a retained evidence file: ${value}`);
    return null;
  }
  return path;
}

function containedRelativePath(baseDir, path, label) {
  const value = relative(baseDir, resolve(path)).replace(/\\/g, "/");
  if (!value || value === "." || value.startsWith("../") || isAbsolute(value)) throw new Error(`${label} must be inside the report evidence folder.`);
  return value;
}

function isContained(baseDir, path) {
  const rel = relative(resolve(baseDir), resolve(path));
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

function isoFromUnixMilliseconds(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive Unix millisecond timestamp.`);
  return new Date(number).toISOString();
}

function requiredUtcTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be a UTC ISO timestamp.`);
  return value;
}

function timestamp(value, label, failures) {
  try {
    return Date.parse(requiredUtcTimestamp(value, label));
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requiredPath(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return resolve(value);
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function requiredCommit(value, label) {
  const commit = requiredText(value, label);
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error(`${label} must be a 40-character git SHA.`);
  return commit.toLowerCase();
}

function compare(actual, expected, label, failures) {
  if (actual !== expected) failures.push(`${label} ${JSON.stringify(actual)} does not match ${JSON.stringify(expected)}.`);
}

function compareLower(actual, expected, label, failures) {
  if (String(actual || "").toLowerCase() !== String(expected || "").toLowerCase()) failures.push(`${label} does not match.`);
}

function compareHash(actual, expected, label, failures) {
  if (!/^[a-f0-9]{64}$/i.test(String(actual || "")) || String(actual).toLowerCase() !== String(expected || "").toLowerCase()) failures.push(`${label} does not match exact file bytes.`);
}

function compareNumber(actual, expected, label, failures) {
  if (!Number.isFinite(Number(actual)) || Number(actual) !== Number(expected)) failures.push(`${label} ${JSON.stringify(actual)} does not match ${JSON.stringify(expected)}.`);
}

function compareNear(actual, expected, tolerance, label, failures) {
  if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(expected)) || Math.abs(Number(actual) - Number(expected)) > tolerance) failures.push(`${label} ${JSON.stringify(actual)} does not match ${JSON.stringify(expected)}.`);
}

function sameNumberArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => Number(value) === expected[index]);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "create" || arg === "verify") {
      parsed.command = arg;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    parsed[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && process.argv[1].endsWith("manual-fresh-audible-evidence.mjs")) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "create") {
      createManualFreshAudibleEvidence(args);
      console.log(`Manual fresh-audible evidence written: ${resolve(args.outPath)}`);
    } else if (args.command === "verify") {
      const captureRunFingerprint = readJson(requiredPath(args.fingerprintPath, "fingerprintPath"), "Native capture run fingerprint");
      const fingerprint = computeNativeCaptureFingerprintAtCommit(process.cwd(), requiredCommit(args.commit, "commit"));
      const result = verifyManualFreshAudibleEvidence({
        reportPath: args.reportPath,
        installerPath: args.installerPath,
        version: args.version,
        commit: args.commit,
        expectedFingerprint: fingerprint,
        expectedCaptureRunFingerprint: captureRunFingerprint
      });
      if (!result.ok) {
        result.failures.forEach((failure) => console.error(failure));
        process.exit(1);
      }
      console.log("Manual fresh-audible evidence verification OK");
    } else {
      throw new Error("Specify create or verify.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Usage: node scripts/manual-fresh-audible-evidence.mjs create --out-path <report.json> --project-path <recorded.pocketdaw> --pre-capture-project-path <pre-capture.pocketdaw> --wav-path <take.wav> --installer-path <setup.exe> --fingerprint-path <fingerprint.json> --version <x.y.z> --commit <sha> --clip-id <id> --track-id <id>");
    process.exit(2);
  }
}
