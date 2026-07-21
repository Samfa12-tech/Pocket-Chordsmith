import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import packageJson from "../package.json" with { type: "json" };

export function validateInstalledPunchTakeSummary(summary, expectations = {}) {
  const failures = [];
  const expectedVersion = expectations.version || packageJson.version;
  const expectedInstallerPath = expectations.installerPath || expectations.installer;
  const expectedInstallerFile = expectations.installerFile || (expectedInstallerPath ? basename(expectedInstallerPath) : "");
  const expectedInstallerSha256 = expectations.installerSha256 || (expectedInstallerPath && existsSync(expectedInstallerPath) ? sha256File(expectedInstallerPath) : "");
  const requireMidiInput = expectations.requireMidiInput === true || expectations.requireMidiInput === "true" || expectations.requireMidiInput === "1";
  const requireAudibleAudio = expectations.requireAudibleAudio === true || expectations.requireAudibleAudio === "true" || expectations.requireAudibleAudio === "1";
  const requireExportFiles = expectations.requireExportFiles === true || expectations.requireExportFiles === "true" || expectations.requireExportFiles === "1";
  const minAudioDurationSeconds = numericExpectation(expectations.minAudioDurationSeconds, requireAudibleAudio ? 3 : 0.2);
  const minAudioPeak = numericExpectation(expectations.minAudioPeak, requireAudibleAudio ? 0.005 : 0);
  const minAudioRms = numericExpectation(expectations.minAudioRms, requireAudibleAudio ? 0.001 : 0);

  if (!isPlainObject(summary)) {
    return { ok: false, failures: ["summary must be a JSON object"] };
  }
  if (summary.ok !== true) failures.push("summary.ok must be true");
  if (summary.runningVersion !== expectedVersion) failures.push(`runningVersion ${JSON.stringify(summary.runningVersion)} does not match expected ${JSON.stringify(expectedVersion)}`);
  requireIsoTimestamp(summary.testedAt, "testedAt", failures);

  if (!isPlainObject(summary.installer)) {
    failures.push("installer must be a JSON object");
  } else {
    if (expectedInstallerFile && !sameInstallerFile(summary.installer.file, expectedInstallerFile)) {
      failures.push(`installer.file ${JSON.stringify(summary.installer.file)} does not match expected ${JSON.stringify(expectedInstallerFile)}`);
    }
    if (expectedInstallerSha256 && String(summary.installer.sha256 || "").toLowerCase() !== expectedInstallerSha256.toLowerCase()) {
      failures.push(`installer.sha256 ${JSON.stringify(summary.installer.sha256)} does not match current installer hash ${JSON.stringify(expectedInstallerSha256)}`);
    }
  }

  if (!Number.isInteger(summary.clipCount) || summary.clipCount < 8) failures.push("clipCount must prove the post-smoke project has recorded and edited clips");
  if (!Number.isInteger(summary.groupedClipCount) || summary.groupedClipCount < 8) failures.push("groupedClipCount must prove take-lane coverage");
  if (!Number.isInteger(summary.groupCount) || summary.groupCount < 4) failures.push("groupCount must include audio, manual MIDI and MIDI recording take groups");
  if (!Number.isInteger(summary.activeCount) || summary.activeCount < 4) failures.push("activeCount must include active audio and MIDI takes");
  if (!Number.isInteger(summary.mutedCount) || summary.mutedCount < 2) failures.push("mutedCount must include inactive take-lane material");

  validateAudioRecordingControl(summary.audioRecordingControl, failures, { requireAudibleAudio, minAudioDurationSeconds, minAudioPeak, minAudioRms });
  validateMidiInputRecordingControl(summary.midiInputRecordingControl, failures, { requireMidiInput });
  validateMidiDevicePreflight(summary.midiDevicePreflight, summary.midiInputRecordingControl, failures, { requireMidiInput });
  validateMidiExport(summary, failures);
  validateExportFiles(summary, failures, { requireExportFiles });

  return { ok: failures.length === 0, failures };
}

export function verifyInstalledPunchTakeSummaryFile(options = {}) {
  const summaryPath = options.summaryPath || options.summary;
  if (!summaryPath) throw new Error("Missing required summary path.");
  if (!existsSync(summaryPath)) throw new Error(`Summary file does not exist: ${summaryPath}`);
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  return validateInstalledPunchTakeSummary(summary, options);
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validateAudioRecordingControl(control, failures, options = {}) {
  if (!isPlainObject(control)) {
    failures.push("audioRecordingControl must be a JSON object");
    return;
  }
  if (control.outcome !== "started-and-stopped") {
    failures.push(`audioRecordingControl.outcome must be started-and-stopped for release evidence, received ${JSON.stringify(control.outcome)}`);
  }
  const delta = control.placement?.delta;
  if (!isPlainObject(delta)) {
    failures.push("audioRecordingControl.placement.delta is required");
  } else {
    for (const field of ["clipCount", "groupedClipCount", "groupCount", "activeCount"]) {
      if (!Number.isInteger(delta[field]) || delta[field] < 1) {
        failures.push(`audioRecordingControl.placement.delta.${field} must be at least 1`);
      }
    }
  }
  const media = control.media;
  if (!isPlainObject(media)) {
    failures.push("audioRecordingControl.media is required");
    return;
  }
  requireString(media.mediaPoolItemId, "audioRecordingControl.media.mediaPoolItemId", failures);
  requireString(media.clipId, "audioRecordingControl.media.clipId", failures);
  requireString(media.file, "audioRecordingControl.media.file", failures);
  requireString(media.projectRelativePath, "audioRecordingControl.media.projectRelativePath", failures);
  if (typeof media.projectRelativePath === "string" && !media.projectRelativePath.startsWith("project-media/recordings/")) {
    failures.push("audioRecordingControl.media.projectRelativePath must be under project-media/recordings/");
  }
  if (typeof media.file === "string" && typeof media.projectRelativePath === "string" && !media.projectRelativePath.endsWith(media.file)) {
    failures.push("audioRecordingControl.media.file must match the projectRelativePath basename");
  }
  if (typeof media.sizeBytes !== "number" || media.sizeBytes <= 44) failures.push("audioRecordingControl.media.sizeBytes must be larger than a WAV header");
  if (typeof media.durationSeconds !== "number" || media.durationSeconds < 0.2) failures.push("audioRecordingControl.media.durationSeconds must show a non-trivial capture");
  if (typeof media.nativeCapturedFrameCount !== "number" || media.nativeCapturedFrameCount <= 0) failures.push("audioRecordingControl.media.nativeCapturedFrameCount must be positive");
  if (typeof media.nativeCaptureSampleRate !== "number" || media.nativeCaptureSampleRate <= 0) failures.push("audioRecordingControl.media.nativeCaptureSampleRate must be positive");
  if (typeof media.peak !== "number" || media.peak < 0) failures.push("audioRecordingControl.media.peak must be a non-negative number");
  if (media.filePeak !== undefined && (typeof media.filePeak !== "number" || media.filePeak < 0)) failures.push("audioRecordingControl.media.filePeak must be a non-negative number");
  if (media.fileRms !== undefined && (typeof media.fileRms !== "number" || media.fileRms < 0)) failures.push("audioRecordingControl.media.fileRms must be a non-negative number");
  if (media.fileSampleRate !== undefined && (typeof media.fileSampleRate !== "number" || media.fileSampleRate <= 0)) failures.push("audioRecordingControl.media.fileSampleRate must be positive");
  if (media.fileChannels !== undefined && (!Number.isInteger(media.fileChannels) || media.fileChannels <= 0)) failures.push("audioRecordingControl.media.fileChannels must be a positive integer");
  if (media.fileFrameCount !== undefined && (!Number.isInteger(media.fileFrameCount) || media.fileFrameCount <= 0)) failures.push("audioRecordingControl.media.fileFrameCount must be a positive integer");
  if (options.requireAudibleAudio) {
    if (typeof media.durationSeconds !== "number" || media.durationSeconds < options.minAudioDurationSeconds) {
      failures.push(`audioRecordingControl.media.durationSeconds must be at least ${options.minAudioDurationSeconds} when audible audio evidence is required`);
    }
    if (typeof media.filePeak !== "number") {
      failures.push("audioRecordingControl.media.filePeak is required when audible audio evidence is required");
    } else if (media.filePeak < options.minAudioPeak) {
      failures.push(`audioRecordingControl.media.filePeak must be at least ${options.minAudioPeak} when audible audio evidence is required`);
    }
    if (typeof media.fileRms !== "number") {
      failures.push("audioRecordingControl.media.fileRms is required when audible audio evidence is required");
    } else if (media.fileRms < options.minAudioRms) {
      failures.push(`audioRecordingControl.media.fileRms must be at least ${options.minAudioRms} when audible audio evidence is required`);
    }
  }
}

function validateMidiInputRecordingControl(control, failures, options = {}) {
  if (!isPlainObject(control)) {
    failures.push("midiInputRecordingControl must be a JSON object");
    return;
  }
  if (control.outcome === "started-and-stopped") {
    if (options.requireMidiInput) validateMidiInputCaptureEvidence(control, failures);
    return;
  }
  if (options.requireMidiInput) {
    failures.push(`midiInputRecordingControl.outcome must be started-and-stopped when connected MIDI input evidence is required, received ${JSON.stringify(control.outcome)}`);
    return;
  }
  if (control.outcome !== "guarded-unavailable") {
    failures.push(`midiInputRecordingControl.outcome must be started-and-stopped or guarded-unavailable, received ${JSON.stringify(control.outcome)}`);
    return;
  }
  const message = String(control.message || "");
  if (![
    "Web MIDI input is not available",
    "No MIDI input devices are available",
    "Web MIDI input request timed out",
    "Permission to use Web MIDI API was not granted"
  ].some((expected) => message.includes(expected))) {
    failures.push(`midiInputRecordingControl guarded message was unexpected: ${JSON.stringify(message)}`);
  }
}

function validateMidiInputCaptureEvidence(control, failures) {
  const delta = control.placement?.delta;
  if (!isPlainObject(delta)) {
    failures.push("midiInputRecordingControl.placement.delta is required when connected MIDI input evidence is required");
  } else {
    for (const field of ["clipCount", "groupedClipCount", "groupCount", "activeCount"]) {
      if (!Number.isInteger(delta[field]) || delta[field] < 1) {
        failures.push(`midiInputRecordingControl.placement.delta.${field} must be at least 1 when connected MIDI input evidence is required`);
      }
    }
  }
  const take = control.take;
  if (!isPlainObject(take)) {
    failures.push("midiInputRecordingControl.take is required when connected MIDI input evidence is required");
    return;
  }
  if (take.captured !== true) failures.push("midiInputRecordingControl.take.captured must be true when connected MIDI input evidence is required");
  requireString(take.clipId, "midiInputRecordingControl.take.clipId", failures);
  requireString(take.trackId, "midiInputRecordingControl.take.trackId", failures);
  requireString(take.takeGroupId, "midiInputRecordingControl.take.takeGroupId", failures);
  if (!Number.isInteger(take.takeLaneIndex) || take.takeLaneIndex < 1) failures.push("midiInputRecordingControl.take.takeLaneIndex must be a positive integer");
  if (take.takeStatus !== "active") failures.push("midiInputRecordingControl.take.takeStatus must be active");
  if (take.muted !== false) failures.push("midiInputRecordingControl.take.muted must be false");
  if (control.punchEnabled !== true) failures.push("midiInputRecordingControl.punchEnabled must be true when connected MIDI input evidence is required");
  if (typeof control.captureStartBar !== "number" || typeof control.punchStartBar !== "number" || typeof control.punchEndBar !== "number") {
    failures.push("midiInputRecordingControl captureStartBar, punchStartBar and punchEndBar are required when connected MIDI input evidence is required");
  } else if (control.captureStartBar > control.punchStartBar || control.punchEndBar <= control.punchStartBar) {
    failures.push("midiInputRecordingControl punch range must start after captureStartBar and end after punchStartBar");
  }
  if (control.requestedCaptureStartBar !== undefined) {
    if (typeof control.requestedCaptureStartBar !== "number") {
      failures.push("midiInputRecordingControl.requestedCaptureStartBar must be numeric when present");
    } else if (typeof control.captureStartBar === "number" && control.captureStartBar + 0.125 < control.requestedCaptureStartBar) {
      failures.push("midiInputRecordingControl.captureStartBar must not precede requestedCaptureStartBar");
    }
  }
  if (!barsApproximatelyEqual(take.punchStartBar, control.punchStartBar)) failures.push("midiInputRecordingControl.take.punchStartBar must match the requested punchStartBar");
  if (!barsApproximatelyEqual(take.punchEndBar, control.punchEndBar)) failures.push("midiInputRecordingControl.take.punchEndBar must match the requested punchEndBar");
  if (!barsApproximatelyEqual(take.captureStartBar, control.captureStartBar)) failures.push("midiInputRecordingControl.take.captureStartBar must match the recorded captureStartBar");
  if (take.punchMode !== "create-new-midi-take-lane") failures.push("midiInputRecordingControl.take.punchMode must be create-new-midi-take-lane");
  if (!Number.isInteger(take.noteCount) || take.noteCount < 1) failures.push("midiInputRecordingControl.take.noteCount must be at least 1");
  if (!Array.isArray(take.pitches) || !take.pitches.every((pitch) => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127)) {
    failures.push("midiInputRecordingControl.take.pitches must be MIDI note numbers");
  }
}

function validateMidiDevicePreflight(preflight, control, failures, options = {}) {
  if (!isPlainObject(preflight)) return;
  if (preflight.checked !== true) return;
  const inputCount = Number(preflight.inputCount);
  const outputCount = Number(preflight.outputCount);
  if (!Number.isInteger(inputCount) || inputCount < 0) failures.push("midiDevicePreflight.inputCount must be a non-negative integer");
  if (!Number.isInteger(outputCount) || outputCount < 0) failures.push("midiDevicePreflight.outputCount must be a non-negative integer");
  if (!Array.isArray(preflight.inputs)) failures.push("midiDevicePreflight.inputs must be an array when present");
  if (!Array.isArray(preflight.outputs)) failures.push("midiDevicePreflight.outputs must be an array when present");
  if (
    options.requireMidiInput
    && isPlainObject(control)
    && control.outcome !== "started-and-stopped"
    && Number.isInteger(inputCount)
    && inputCount < 1
  ) {
    failures.push("midiDevicePreflight.inputCount must be at least 1 when connected MIDI input evidence is required; install/connect a MIDI input or virtual MIDI loopback before running strict MIDI smoke");
  }
}

function validateMidiExport(summary, failures) {
  if (!Array.isArray(summary.exportedMidiPitches)) {
    failures.push("exportedMidiPitches must be an array");
    return;
  }
  const pitches = new Set(summary.exportedMidiPitches);
  for (const inactive of [82, 85]) {
    if (pitches.has(inactive)) failures.push(`exportedMidiPitches must exclude inactive sentinel pitch ${inactive}`);
  }
  for (const active of [83, 84, 86]) {
    if (!pitches.has(active)) failures.push(`exportedMidiPitches must include active sentinel pitch ${active}`);
  }
  if (summary.midiTakeGroupCount !== 1) failures.push("midiTakeGroupCount must be 1");
  if (summary.midiRecordingTakeGroupCount !== 1) failures.push("midiRecordingTakeGroupCount must be 1");
}

function barsApproximatelyEqual(actual, expected) {
  return typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) <= 0.125;
}

function validateExportFiles(summary, failures, options = {}) {
  validateExportFile(summary.wavPath, "wavPath", failures, {
    requireFile: options.requireExportFiles,
    label: "RIFF/WAVE audio export with sample data",
    sizeBytes: summary.wavSizeBytes,
    sizeField: "wavSizeBytes",
    sha256: summary.wavSha256,
    sha256Field: "wavSha256",
    isValid: isWavFile
  });
  validateExportFile(summary.midiPath, "midiPath", failures, {
    requireFile: options.requireExportFiles,
    label: "MThd MIDI export",
    sizeBytes: summary.midiSizeBytes,
    sizeField: "midiSizeBytes",
    sha256: summary.midiSha256,
    sha256Field: "midiSha256",
    isValid: isMidiFile,
    onBytes: validateMidiExportFile
  });
}

function validateExportFile(path, field, failures, options) {
  if (typeof path !== "string" || !path.trim()) {
    if (options.requireFile) failures.push(`${field} must be a non-empty string when export file evidence is required`);
    return;
  }
  if (!existsSync(path)) {
    if (options.requireFile) failures.push(`${field} does not exist: ${path}`);
    return;
  }
  const bytes = readFileSync(path);
  if (!options.isValid(bytes)) failures.push(`${field} must point to a ${options.label}`);
  if (options.onBytes) options.onBytes(bytes, field, failures);
  if (options.sizeBytes !== undefined) {
    if (typeof options.sizeBytes !== "number" || options.sizeBytes <= 0) {
      failures.push(`${options.sizeField} must be a positive number when present`);
    } else if (bytes.length !== options.sizeBytes) {
      failures.push(`${options.sizeField} ${options.sizeBytes} does not match ${field} size ${bytes.length}`);
    }
  }
  if (options.sha256 !== undefined) {
    const expectedHash = String(options.sha256 || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      failures.push(`${options.sha256Field} must be a SHA-256 hex digest when present`);
    } else {
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== expectedHash) failures.push(`${options.sha256Field} does not match ${field} SHA-256 ${actualHash}`);
    }
  }
}

function isWavFile(bytes) {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (dataStart + size > bytes.length) return false;
    if (id === "data") return size > 0;
    offset = dataStart + size + (size % 2);
  }
  return false;
}

function isMidiFile(bytes) {
  return bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "MThd";
}

function validateMidiExportFile(bytes, field, failures) {
  try {
    const pitches = new Set(parseMidiNotePitches(bytes));
    for (const inactive of [82, 85]) {
      if (pitches.has(inactive)) failures.push(`${field} must exclude inactive sentinel pitch ${inactive}`);
    }
    for (const active of [83, 84, 86]) {
      if (!pitches.has(active)) failures.push(`${field} must include active sentinel pitch ${active}`);
    }
  } catch (error) {
    failures.push(`${field} could not be parsed as a Standard MIDI file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseMidiNotePitches(bytes) {
  if (!isMidiFile(bytes)) throw new Error("missing MThd header");
  const headerLength = bytes.readUInt32BE(4);
  if (headerLength < 6 || bytes.length < 8 + headerLength) throw new Error("invalid MThd chunk length");
  const trackCount = bytes.readUInt16BE(10);
  const pitches = [];
  let offset = 8 + headerLength;
  for (let trackIndex = 0; trackIndex < trackCount && offset + 8 <= bytes.length; trackIndex += 1) {
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkLength = bytes.readUInt32BE(offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + chunkLength;
    if (trackEnd > bytes.length) throw new Error("truncated track chunk");
    if (chunkId === "MTrk") pitches.push(...parseMidiTrackPitches(bytes, trackStart, trackEnd));
    offset = trackEnd;
  }
  return pitches;
}

function parseMidiTrackPitches(bytes, start, end) {
  const pitches = [];
  let offset = start;
  let runningStatus = 0;
  while (offset < end) {
    const delta = readVariableLengthQuantity(bytes, offset, end);
    offset = delta.nextOffset;
    if (offset >= end) break;
    let status = bytes[offset];
    if (status & 0x80) {
      offset += 1;
      if (status < 0xf0) runningStatus = status;
    } else if (runningStatus) {
      status = runningStatus;
    } else {
      throw new Error("MIDI event missing running status");
    }

    if (status === 0xff) {
      if (offset >= end) throw new Error("truncated MIDI meta event");
      offset += 1;
      const length = readVariableLengthQuantity(bytes, offset, end);
      offset = length.nextOffset + length.value;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      const length = readVariableLengthQuantity(bytes, offset, end);
      offset = length.nextOffset + length.value;
      continue;
    }
    const eventType = status & 0xf0;
    const dataLength = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
    if (offset + dataLength > end) throw new Error("truncated MIDI channel event");
    const data1 = bytes[offset];
    const data2 = dataLength > 1 ? bytes[offset + 1] : 0;
    if (eventType === 0x90 && data2 > 0) pitches.push(data1);
    offset += dataLength;
  }
  return pitches;
}

function readVariableLengthQuantity(bytes, offset, end) {
  let value = 0;
  for (let count = 0; count < 4; count += 1) {
    if (offset >= end) throw new Error("truncated variable-length quantity");
    const byte = bytes[offset];
    offset += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, nextOffset: offset };
  }
  throw new Error("variable-length quantity is too long");
}

function requireString(value, label, failures) {
  if (typeof value !== "string" || !value.trim()) failures.push(`${label} must be a non-empty string`);
}

function requireIsoTimestamp(value, label, failures) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    failures.push(`${label} must be a UTC ISO timestamp`);
  }
}

function numericExpectation(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sameInstallerFile(actual, expected) {
  if (actual === expected) return true;
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  return normalizeInstallerFile(actual) === normalizeInstallerFile(expected);
}

function normalizeInstallerFile(value) {
  return value.replace(/^Pocket[ .]DAW_/, "Pocket DAW_");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    if (arg === "--require-midi-input") {
      parsed.requireMidiInput = true;
      continue;
    }
    if (arg === "--require-audible-audio") {
      parsed.requireAudibleAudio = true;
      continue;
    }
    if (arg === "--require-export-files") {
      parsed.requireExportFiles = true;
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && process.argv[1].endsWith("verify-installed-punch-take-summary.mjs")) {
  try {
    const result = verifyInstalledPunchTakeSummaryFile(parseArgs(process.argv.slice(2)));
    if (!result.ok) {
      for (const failure of result.failures) console.error(failure);
      process.exit(1);
    }
    console.log("Installed punch/take smoke summary verification OK");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
