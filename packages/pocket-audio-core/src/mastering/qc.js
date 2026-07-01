export function buildQcReport({ project, profile, preAnalysis, postAnalysis, stemAnalysis, masterSettings, exportedAnalysis, renderInfo }) {
  const checks = [];
  check(checks, "schema/project validation", Boolean(project?.app === "PocketAudioProject"), "Project normalised as PocketAudioProject.");
  check(checks, "full song sequence renders", Boolean(renderInfo?.scope === "sequence" && renderInfo?.sectionIds?.length), `Rendered sections: ${(renderInfo?.sectionIds || []).join(", ") || "none"}.`);
  check(checks, "stereo output", postAnalysis.channelCount === profile.channels, `Channels: ${postAnalysis.channelCount}.`);
  check(checks, "no NaN/Infinity samples", postAnalysis.nonFiniteSamples === 0, `Non-finite samples: ${postAnalysis.nonFiniteSamples}.`);
  check(checks, "clipped samples = 0", postAnalysis.clippedSamples === 0, `Clipped samples: ${postAnalysis.clippedSamples}.`);
  check(checks, "true peak ceiling", (postAnalysis.truePeakDbtp ?? 999) <= profile.truePeakCeilingDbtp + 0.05, `True peak: ${fmt(postAnalysis.truePeakDbtp)} dBTP, ceiling ${profile.truePeakCeilingDbtp} dBTP.`);
  check(checks, "LUFS target", lufsWithinTolerance(postAnalysis, profile), lufsMessage(postAnalysis, profile, masterSettings), "warn");
  check(checks, "no accidental long silence", postAnalysis.silenceAtStartMs < 5000, `Start silence: ${postAnalysis.silenceAtStartMs} ms.`, "warn");
  check(checks, "tail is not cut", postAnalysis.tailSeconds >= 0.1, `Detected tail: ${postAnalysis.tailSeconds} s.`, "warn");
  check(checks, "stems render if requested", stemAnalysis && Object.keys(stemAnalysis).length > 0, `Stem count: ${Object.keys(stemAnalysis || {}).length}.`);
  check(checks, "limiter gain reduction within profile limit", Number(masterSettings?.limiterGainReductionDb || 0) <= profile.maxLimiterGainReductionDb + 0.01, `Limiter gain reduction: ${fmt(masterSettings?.limiterGainReductionDb)} dB.`);
  check(checks, "exported WAV re-read/reanalysed", Boolean(renderInfo?.analyzeOnly || (exportedAnalysis && exportedAnalysis.channelCount === profile.channels)), exportedAnalysis ? `Exported true peak: ${fmt(exportedAnalysis.truePeakDbtp)} dBTP.` : renderInfo?.analyzeOnly ? "Analyze-only mode skipped WAV export verification." : "No exported analysis.");

  const failures = checks.filter((item) => item.status === "FAIL");
  const warnings = checks.filter((item) => item.status === "WARN");
  return {
    status: failures.length ? "FAIL" : warnings.length ? "WARN" : "PASS",
    checks,
    failures: failures.map((item) => item.message),
    warnings: warnings.map((item) => item.message),
    preAnalysis,
    postAnalysis,
    exportedAnalysis
  };
}

function check(checks, name, pass, message, warnMode = "fail") {
  checks.push({
    name,
    status: pass ? "PASS" : warnMode === "warn" ? "WARN" : "FAIL",
    message
  });
}

function lufsWithinTolerance(analysis, profile) {
  if (analysis.integratedLufs === null) return false;
  return Math.abs(analysis.integratedLufs - profile.targetIntegratedLufs) <= profile.targetToleranceLu;
}

function lufsMessage(analysis, profile, masterSettings = {}) {
  const base = `Integrated LUFS: ${fmt(analysis.integratedLufs)}, target ${profile.targetIntegratedLufs} +/- ${profile.targetToleranceLu}.`;
  if (lufsWithinTolerance(analysis, profile)) return base;
  if (masterSettings.loudnessTargetStatus === "transient-limited") {
    return `Transient-limited: ${base} ${masterSettings.loudnessTargetReason || "Reaching target would exceed the profile dynamics limit."}`;
  }
  if (masterSettings.loudnessTargetStatus === "above_target") {
    return `Above target: ${base} ${masterSettings.loudnessTargetReason || "Master stayed above target while preserving true-peak safety."}`;
  }
  return `${base} ${masterSettings.loudnessTargetReason || ""}`.trim();
}

function fmt(value) {
  if (value === null || value === undefined) return "n/a";
  return Number.isFinite(value) ? Number(value).toFixed(2) : String(value);
}
