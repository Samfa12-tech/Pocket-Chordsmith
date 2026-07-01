export function renderMarkdownReport(report) {
  const lines = [];
  lines.push(`# ${report.title} - Master Report`);
  lines.push("");
  lines.push("## Status");
  lines.push(report.qc.status);
  lines.push("");
  lines.push("## Source");
  lines.push(`- Project path: ${report.sourcePath}`);
  lines.push(`- Source hash: ${report.sourceHash}`);
  lines.push(`- Schema version: ${report.schemaVersion}`);
  lines.push(`- Song sequence: ${report.renderInfo.sectionIds.join(", ")}`);
  lines.push(`- Profile: ${report.profile.id}`);
  lines.push("");
  lines.push("## Pre-master analysis");
  metricLines(report.preAnalysis).forEach((line) => lines.push(line));
  lines.push("");
  lines.push("## Stem analysis");
  for (const [stem, metrics] of Object.entries(report.stemAnalysis || {})) {
    lines.push(`- ${stem}: LUFS ${fmt(metrics.integratedLufs)}, true peak ${fmt(metrics.truePeakDbtp)} dBTP, RMS ${fmt(metrics.rmsDbfs)} dBFS`);
  }
  lines.push("");
  lines.push("## Mix patch");
  (report.mixPatch.reasons || []).forEach((reason) => lines.push(`- ${reason}`));
  lines.push("");
  lines.push("## Master settings");
  lines.push(`- Chain: ${(report.masterSettings.chain || []).join(" -> ")}`);
  lines.push(`- Loudness trim: ${fmt(report.masterSettings.loudnessTrimDb)} dB`);
  lines.push(`- Limiter gain reduction: ${fmt(report.masterSettings.limiterGainReductionDb)} dB`);
  lines.push("");
  lines.push("## Post-master analysis");
  metricLines(report.postAnalysis).forEach((line) => lines.push(line));
  lines.push("");
  lines.push("## Warnings / failures");
  if (!report.qc.failures.length && !report.qc.warnings.length) lines.push("- None");
  report.qc.failures.forEach((item) => lines.push(`- FAIL: ${item}`));
  report.qc.warnings.forEach((item) => lines.push(`- WARN: ${item}`));
  lines.push("");
  return lines.join("\n");
}

export function releaseSummaryCsv(reports) {
  const header = [
    "track_number",
    "title",
    "status",
    "duration_seconds",
    "integrated_lufs",
    "true_peak_dbtp",
    "sample_peak_dbfs",
    "crest_factor_db",
    "clipped_samples",
    "limiter_gain_reduction_db",
    "warnings",
    "master_wav_path",
    "report_path"
  ];
  const rows = reports.map((report, index) => [
    index + 1,
    report.title,
    report.qc.status,
    report.postAnalysis.durationSeconds,
    report.postAnalysis.integratedLufs,
    report.postAnalysis.truePeakDbtp,
    report.postAnalysis.samplePeakDbfs,
    report.postAnalysis.crestFactorDb,
    report.postAnalysis.clippedSamples,
    report.masterSettings.limiterGainReductionDb,
    [...report.qc.failures, ...report.qc.warnings].join(" | "),
    report.outputs.masterWav || "",
    report.outputs.reportMd || ""
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function metricLines(metrics) {
  return [
    `- LUFS-I: ${fmt(metrics.integratedLufs)}`,
    `- True peak: ${fmt(metrics.truePeakDbtp)} dBTP`,
    `- Sample peak: ${fmt(metrics.samplePeakDbfs)} dBFS`,
    `- RMS: ${fmt(metrics.rmsDbfs)} dBFS`,
    `- Clipped samples: ${metrics.clippedSamples}`,
    `- Non-finite samples: ${metrics.nonFiniteSamples}`,
    `- DC offset L/R: ${fmt(metrics.dcOffsetL)} / ${fmt(metrics.dcOffsetR)}`,
    `- Stereo correlation: ${fmt(metrics.stereoCorrelation)}`,
    `- Tail/silence: ${fmt(metrics.tailSeconds)} s / ${fmt(metrics.silenceAtStartMs)} ms`
  ];
}

function fmt(value) {
  if (value === null || value === undefined) return "n/a";
  return Number.isFinite(value) ? Number(value).toFixed(2) : String(value);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
