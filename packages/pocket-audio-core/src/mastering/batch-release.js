import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { analyseRenderedBuffer } from "../export/audio-metrics.js";
import { decodePcmWavBytes, encodePcmWavBytes } from "../export/wav.js";
import { renderPocketAudioBuffer, renderPocketAudioStemBuffers } from "../engine/offline-renderer.js";
import { normalisePocketChordsmithProject } from "../schema/normalise-project.js";
import { getReleaseProfile } from "./release-profiles.js";
import { masterBuffer } from "./master-chain.js";
import { analyseStemBuffers, applyMixPatchToStemBuffers, suggestMixPatch } from "./mix-assistant.js";
import { buildQcReport } from "./qc.js";
import { releaseSummaryCsv, renderMarkdownReport } from "./reports.js";
import { round, sanitizeFileStem } from "./audio-buffer-utils.js";

const OUTPUT_FOLDERS = [
  "masters_wav24",
  "premaster_wav24",
  "stems",
  "reports_json",
  "reports_md",
  "mix-patches",
  "master-settings",
  "source-projects"
];

export async function batchMasterRelease(options) {
  const batchOptions = normalizeBatchOptions(options);
  const profile = getReleaseProfile(batchOptions.profile || "spotify_lofi_chill");
  const inputPaths = await resolveInputPaths(batchOptions.input || batchOptions.inputs || []);
  if (!inputPaths.length) throw new Error("No input project JSON files matched.");
  const outDir = resolve(batchOptions.out || "release/pocket-release");
  await prepareOutput(outDir);
  const reports = [];
  const failures = [];

  for (const [index, sourcePath] of inputPaths.entries()) {
    try {
      const report = await masterReleaseTrack(sourcePath, {
        ...batchOptions,
        index,
        outDir,
        profile
      });
      reports.push(report);
      if (report.qc.status === "FAIL") failures.push({ path: sourcePath, reasons: report.qc.failures });
    } catch (error) {
      const failed = await writeFailedTrackReport(sourcePath, { index, outDir, profile, error });
      reports.push(failed);
      failures.push({ path: sourcePath, reasons: [error.message] });
    }
  }

  const albumConsistency = (batchOptions.albumConsistency || profile.albumConsistency) ? buildAlbumConsistency(reports, profile) : null;
  const manifest = {
    schema: "pocket-release-manifest-v1",
    profile: profile.id,
    generatedAt: new Date().toISOString(),
    inputCount: inputPaths.length,
    analyzeOnly: batchOptions.analyzeOnly,
    exports: Array.from(batchOptions.exportSet),
    albumConsistency,
    status: failures.length ? "FAIL" : reports.some((report) => report.qc.status === "WARN") ? "WARN" : "PASS",
    failures,
    tracks: reports.map((report) => ({
      title: report.title,
      sourcePath: report.sourcePath,
      status: report.qc.status,
      resumed: Boolean(report.resumed),
      outputs: report.outputs,
      warnings: report.qc.warnings,
      failures: report.qc.failures
    }))
  };
  await writeFile(join(outDir, "release-summary.csv"), releaseSummaryCsv(reports));
  await writeFile(join(outDir, "release-manifest.json"), JSON.stringify(manifest, null, 2));
  return { manifest, reports, outDir };
}

export async function masterReleaseTrack(sourcePath, options) {
  const sourceText = await readFile(sourcePath, "utf8");
  const sourceHash = hashText(sourceText);
  const raw = JSON.parse(sourceText);
  const project = normalisePocketChordsmithProject(raw, { sourcePrefix: "PCS1" });
  validateNativeSchema(raw);
  const sampleRate = Number(options.sampleRate || options.profile.sampleRate || 44100);
  const title = project.meta.title || raw.title || `Track ${options.index + 1}`;
  const slug = `${String(options.index + 1).padStart(2, "0")}-${sanitizeFileStem(title)}`;
  const outputPaths = trackOutputPaths(options.outDir, slug);
  const resumed = await tryResumeReport(outputPaths.reportJson, {
    force: options.force,
    sourceHash,
    profile: options.profile,
    scope: options.scope || "sequence",
    analyzeOnly: options.analyzeOnly
  });
  if (resumed) return resumed;

  const render = renderPocketAudioBuffer(project, { sampleRate, scope: options.scope || "sequence" });
  const stems = renderPocketAudioStemBuffers(project, { sampleRate, scope: options.scope || "sequence" });
  const preAnalysis = analyseRenderedBuffer(render);
  const stemAnalysis = analyseStemBuffers(stems);
  const mixPatch = suggestMixPatch(project, stemAnalysis, options.profile, preAnalysis);
  const premaster = applyMixPatchToStemBuffers(stems, mixPatch, { sampleRate });
  const mastered = masterBuffer(premaster, options.profile);
  const shouldWriteWav24 = shouldExport(options, "wav24");
  const wav24 = shouldWriteWav24 ? encodePcmWavBytes({ channels: mastered.buffer.channels, sampleRate: mastered.buffer.sampleRate, bitDepth: 24 }) : null;
  const exportedAnalysis = wav24 ? analyseRenderedBuffer(decodePcmWavBytes(wav24)) : null;
  const outputs = await writeTrackOutputs({
    sourcePath,
    sourceText,
    outDir: options.outDir,
    slug,
    outputPaths,
    wav24,
    premaster,
    stems,
    mixPatch,
    masterSettings: mastered.settings,
    exportSet: options.exportSet,
    analyzeOnly: options.analyzeOnly
  });
  const renderInfo = {
    scope: render.timeline?.scope || "sequence",
    sectionIds: render.timeline?.sectionIds || [],
    durationSeconds: render.duration,
    analyzeOnly: Boolean(options.analyzeOnly)
  };
  const qc = buildQcReport({
    project,
    profile: options.profile,
    preAnalysis,
    postAnalysis: mastered.postAnalysis,
    stemAnalysis,
    masterSettings: mastered.settings,
    exportedAnalysis,
    renderInfo
  });
  const report = {
    schema: "pocket-master-report-v1",
    title,
    sourcePath,
    sourceHash,
    analyzeOnly: Boolean(options.analyzeOnly),
    schemaVersion: raw.projectVersion ?? raw.schemaVersion ?? null,
    profile: options.profile,
    renderInfo,
    preAnalysis,
    stemAnalysis,
    mixPatch,
    masterSettings: mastered.settings,
    postAnalysis: mastered.postAnalysis,
    exportedAnalysis,
    qc,
    outputs
  };
  await writeFile(outputs.reportJson, JSON.stringify(report, null, 2));
  await writeFile(outputs.reportMd, renderMarkdownReport(report));
  return report;
}

export async function resolveInputPaths(inputs) {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  const resolved = [];
  for (const item of list.flatMap((value) => String(value || "").split(",")).filter(Boolean)) {
    if (item.includes("*")) {
      resolved.push(...await expandSimpleGlob(item));
    } else {
      resolved.push(resolve(item));
    }
  }
  return Array.from(new Set(resolved)).filter((path) => extname(path).toLowerCase() === ".json").sort((a, b) => a.localeCompare(b));
}

async function writeTrackOutputs(input) {
  const outputs = { ...input.outputPaths };
  if (shouldExport(input, "wav24") && input.wav24) {
    await writeFile(outputs.masterWav, input.wav24);
    await writeFile(outputs.premasterWav, encodePcmWavBytes({ channels: input.premaster.channels, sampleRate: input.premaster.sampleRate, bitDepth: 24 }));
  } else {
    delete outputs.masterWav;
    delete outputs.premasterWav;
  }
  await writeFile(outputs.mixPatch, JSON.stringify(input.mixPatch, null, 2));
  await writeFile(outputs.masterSettings, JSON.stringify(input.masterSettings, null, 2));
  await writeFile(outputs.sourceProject, input.sourceText);
  if (shouldExport(input, "stems")) {
    outputs.stemsDir = join(input.outDir, "stems", input.slug);
    for (const [stem, buffer] of Object.entries(input.stems)) {
      const stemPath = join(outputs.stemsDir, `${stem}.wav`);
      await mkdir(dirname(stemPath), { recursive: true });
      await writeFile(stemPath, encodePcmWavBytes({ channels: buffer.channels, sampleRate: buffer.sampleRate, bitDepth: 24 }));
    }
  }
  return outputs;
}

async function writeFailedTrackReport(sourcePath, { index, outDir, profile, error }) {
  const title = `Failed Track ${index + 1}`;
  const slug = `${String(index + 1).padStart(2, "0")}-${sanitizeFileStem(sourcePath, "failed-track")}`;
  const outputs = {
    reportJson: join(outDir, "reports_json", `${slug}.master-report.json`),
    reportMd: join(outDir, "reports_md", `${slug}.master-report.md`),
    sourceProject: join(outDir, "source-projects", `${slug}.source.json`)
  };
  await copyFile(sourcePath, outputs.sourceProject).catch(async () => {});
  const report = {
    schema: "pocket-master-report-v1",
    title,
    sourcePath,
    sourceHash: "",
    schemaVersion: null,
    profile,
    renderInfo: { scope: "sequence", sectionIds: [] },
    preAnalysis: {},
    stemAnalysis: {},
    mixPatch: { schema: "pocket-mix-patch-v1", changes: {}, reasons: [] },
    masterSettings: {},
    postAnalysis: {},
    exportedAnalysis: null,
    outputs,
    qc: {
      status: "FAIL",
      checks: [{ name: "track processing", status: "FAIL", message: error.message }],
      failures: [error.message],
      warnings: []
    }
  };
  await writeFile(outputs.reportJson, JSON.stringify(report, null, 2));
  await writeFile(outputs.reportMd, renderMarkdownReport(report));
  return report;
}

async function prepareOutput(outDir) {
  for (const folder of OUTPUT_FOLDERS) await mkdir(join(outDir, folder), { recursive: true });
}

function normalizeBatchOptions(options) {
  const out = {
    ...options,
    analyzeOnly: Boolean(options.analyzeOnly || options["analyze-only"]),
    albumConsistency: Boolean(options.albumConsistency || options["album-consistency"]),
    force: Boolean(options.force)
  };
  out.exportSet = parseExportSet(out.export || out.exports || "wav24,stems,report");
  if (out.analyzeOnly) {
    out.exportSet.delete("wav24");
    out.exportSet.delete("stems");
    out.exportSet.add("report");
  }
  return out;
}

function parseExportSet(value) {
  const text = Array.isArray(value) ? value.join(",") : String(value || "");
  const set = new Set(text.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!set.size) set.add("report");
  return set;
}

function shouldExport(options, name) {
  if (options.analyzeOnly && (name === "wav24" || name === "stems")) return false;
  return options.exportSet?.has(name);
}

function trackOutputPaths(outDir, slug) {
  return {
    masterWav: join(outDir, "masters_wav24", `${slug}.wav`),
    premasterWav: join(outDir, "premaster_wav24", `${slug}.premaster.wav`),
    reportJson: join(outDir, "reports_json", `${slug}.master-report.json`),
    reportMd: join(outDir, "reports_md", `${slug}.master-report.md`),
    mixPatch: join(outDir, "mix-patches", `${slug}.mix-patch.json`),
    masterSettings: join(outDir, "master-settings", `${slug}.master-settings.json`),
    sourceProject: join(outDir, "source-projects", `${slug}.source.json`)
  };
}

async function tryResumeReport(reportPath, options) {
  if (options.force) return null;
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const sameSource = report.sourceHash === options.sourceHash;
    const sameProfile = report.profile?.id === options.profile.id;
    const sameScope = (report.renderInfo?.scope || "sequence") === options.scope;
    const sameAnalyzeMode = Boolean(report.analyzeOnly) === Boolean(options.analyzeOnly);
    if (sameSource && sameProfile && sameScope && sameAnalyzeMode) {
      return { ...report, resumed: true };
    }
  } catch {
    return null;
  }
  return null;
}

function buildAlbumConsistency(reports, profile) {
  const loudness = reports
    .filter((report) => report.qc?.status !== "FAIL" && Number.isFinite(report.postAnalysis?.integratedLufs))
    .map((report) => ({ title: report.title, integratedLufs: report.postAnalysis.integratedLufs }))
    .sort((a, b) => a.integratedLufs - b.integratedLufs);
  if (!loudness.length) {
    return {
      status: "FAIL",
      trackCount: 0,
      recommendation: "No successfully mastered tracks were available for album consistency analysis."
    };
  }
  const values = loudness.map((item) => item.integratedLufs);
  const min = values[0];
  const max = values[values.length - 1];
  const median = percentile(values, 0.5);
  const spread = max - min;
  const recommended = Math.min(profile.targetIntegratedLufs, median);
  return {
    status: spread > 2.5 ? "WARN" : "PASS",
    trackCount: loudness.length,
    minIntegratedLufs: round(min, 2),
    maxIntegratedLufs: round(max, 2),
    medianIntegratedLufs: round(median, 2),
    loudnessSpreadLu: round(spread, 2),
    recommendedTargetIntegratedLufs: round(recommended, 2),
    recommendation: spread > 2.5
      ? `Album loudness varies by ${round(spread, 2)} LU; consider a common album target around ${round(recommended, 2)} LUFS rather than forcing every track to ${profile.targetIntegratedLufs} LUFS.`
      : `Album loudness spread is ${round(spread, 2)} LU; current masters are consistent enough for the selected profile.`
  };
}

function percentile(values, amount) {
  if (!values.length) return null;
  const index = (values.length - 1) * amount;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

async function expandSimpleGlob(pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  const star = normalized.indexOf("*");
  const slash = normalized.lastIndexOf("/", star);
  const dir = resolve(slash >= 0 ? normalized.slice(0, slash) : ".");
  const suffix = normalized.slice(star + 1);
  const prefix = slash >= 0 ? normalized.slice(slash + 1, star) : normalized.slice(0, star);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
    .map((entry) => join(dir, entry.name));
}

function validateNativeSchema(raw) {
  const version = Number(raw.projectVersion ?? raw.schemaVersion);
  if (version !== 16) throw new Error(`Expected native schema-16 project JSON; got schema ${Number.isFinite(version) ? version : "unknown"}.`);
  const sequence = Array.isArray(raw.songSequence) ? raw.songSequence : [];
  if (!sequence.length) throw new Error("Project is missing songSequence; refusing to silently master Section A only.");
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}
