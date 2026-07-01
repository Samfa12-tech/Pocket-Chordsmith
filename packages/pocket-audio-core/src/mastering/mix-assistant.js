import { analyseRenderedBuffer } from "../export/audio-metrics.js";
import { dbToGain } from "./release-profiles.js";
import { applyGainToBuffer, sumRenderedBuffers } from "./audio-buffer-utils.js";

const STEMS = ["drums", "bass", "chords", "melody", "guitar"];

export function analyseStemBuffers(stemBuffers) {
  const out = {};
  for (const stem of STEMS) {
    if (stemBuffers[stem]) out[stem] = analyseRenderedBuffer(stemBuffers[stem]);
  }
  return out;
}

export function suggestMixPatch(project, stemAnalysis, profile, preAnalysis = null) {
  const changes = { masterGainDb: 0, stems: {} };
  const reasons = [];
  const stemLoudness = Object.entries(stemAnalysis)
    .map(([stem, metrics]) => ({
      stem,
      rmsDbfs: metrics.rmsDbfs ?? -120,
      truePeakDbtp: metrics.truePeakDbtp ?? -120,
      crestFactorDb: metrics.crestFactorDb ?? null,
      transientIndexDb: transientIndex(metrics)
    }))
    .sort((a, b) => b.rmsDbfs - a.rmsDbfs);
  const peak = preAnalysis?.truePeakDbtp ?? preAnalysis?.samplePeakDbfs ?? null;
  const blocker = identifyLoudnessBlocker(stemAnalysis, preAnalysis);

  if (peak !== null && peak > -3 && stemLoudness.length) {
    const trim = Math.max(-2, Math.min(-0.5, -0.5 - (peak + 3) * 0.25));
    const target = blocker?.stem || stemLoudness[0].stem;
    changes.stems[target] = { gainDb: round(trim), pan: 0 };
    reasons.push(`${title(target)} ${blocker ? "transients" : "level"} limit release headroom; ${round(trim)} dB trim protects the true-peak limiter before final loudness matching.`);
  }

  if (blocker && blocker.transientIndexDb >= 14 && !changes.stems[blocker.stem]) {
    changes.stems[blocker.stem] = { gainDb: -0.8, pan: 0 };
    reasons.push(`${title(blocker.stem)} transient index is ${round(blocker.transientIndexDb)} dB, so a -0.8 dB trim reduces limiter work without rewriting the source mix.`);
  }

  const bass = stemAnalysis.bass;
  const drums = stemAnalysis.drums;
  if (stemAnalysis.chords && Number.isFinite(profile.mixAssistant?.chordGainDb)) {
    changes.stems.chords = mergeStemChange(changes.stems.chords, { gainDb: profile.mixAssistant.chordGainDb });
    reasons.push(profile.mixAssistant.chordReason || `Chord stem is trimmed ${round(profile.mixAssistant.chordGainDb)} dB for the selected release profile.`);
  }

  if (bass && drums && (bass.rmsDbfs ?? -120) > (drums.rmsDbfs ?? -120) + 3) {
    changes.stems.bass = mergeStemChange(changes.stems.bass, { gainDb: -1, monoBelowHz: 120 });
    reasons.push("Bass stem is more than 3 dB RMS above drums; trim keeps limiter work conservative.");
  }

  const air = stemAnalysis.drums?.spectralBalance?.air;
  const mid = stemAnalysis.drums?.spectralBalance?.mid;
  if (air !== null && air !== undefined && mid !== null && mid !== undefined && air > mid + 3) {
    changes.stems.drums = mergeStemChange(changes.stems.drums, { gainDb: -0.6 });
    reasons.push("Drum air band is bright for the lofi/chill profile; small drum trim avoids harshness.");
  }

  const sustained = chooseSustainedSupportStem(stemAnalysis);
  if (sustained && preAnalysis?.integratedLufs !== null && preAnalysis.integratedLufs < profile.targetIntegratedLufs - 4 && peak !== null && peak > -4) {
    changes.stems[sustained] = mergeStemChange(changes.stems[sustained], { gainDb: 0.4 });
    reasons.push(`${title(sustained)} is a sustained stem with room for +0.4 dB makeup, supporting loudness before asking the final limiter for more reduction.`);
  }

  if (!reasons.length) reasons.push("No corrective mix trim required; source balance is within conservative release assistant thresholds.");

  return {
    schema: "pocket-mix-patch-v1",
    sourceProjectTitle: project?.meta?.title || project?.title || "Pocket Project",
    profile: profile.id,
    analysis: {
      blockingStem: blocker?.stem || null,
      blockingReason: blocker?.reason || null,
      transientIndexDb: blocker ? round(blocker.transientIndexDb) : null,
      loudestStem: stemLoudness[0]?.stem || null
    },
    changes,
    reasons
  };
}

export function applyMixPatchToStemBuffers(stemBuffers, patch, options = {}) {
  const buffers = [];
  for (const stem of STEMS) {
    const buffer = stemBuffers[stem];
    if (!buffer) continue;
    const gainDb = Number(patch?.changes?.stems?.[stem]?.gainDb || 0) + Number(patch?.changes?.masterGainDb || 0);
    buffers.push(applyGainToBuffer(buffer, dbToGain(gainDb)));
  }
  return sumRenderedBuffers(buffers, options);
}

function mergeStemChange(current = {}, patch) {
  return {
    ...current,
    ...patch,
    gainDb: round(Number(current.gainDb || 0) + Number(patch.gainDb || 0))
  };
}

function identifyLoudnessBlocker(stemAnalysis, preAnalysis) {
  const prePeak = preAnalysis?.truePeakDbtp ?? preAnalysis?.samplePeakDbfs ?? -120;
  const candidates = Object.entries(stemAnalysis || {})
    .map(([stem, metrics]) => ({
      stem,
      truePeakDbtp: metrics.truePeakDbtp ?? -120,
      rmsDbfs: metrics.rmsDbfs ?? -120,
      crestFactorDb: metrics.crestFactorDb ?? 0,
      transientIndexDb: transientIndex(metrics)
    }))
    .filter((item) => item.truePeakDbtp > -30)
    .sort((a, b) => {
      const transientScore = (b.transientIndexDb - a.transientIndexDb) * 0.7;
      const peakScore = (b.truePeakDbtp - a.truePeakDbtp) * 0.3;
      return transientScore + peakScore;
    });
  const candidate = candidates[0];
  if (!candidate) return null;
  const nearMixPeak = prePeak - candidate.truePeakDbtp <= 4;
  const transientRole = candidate.stem === "drums" || candidate.stem === "bass";
  if ((candidate.transientIndexDb >= 12 && nearMixPeak) || (transientRole && candidate.crestFactorDb >= 10)) {
    return {
      ...candidate,
      reason: `${candidate.stem} has high transient energy (${round(candidate.transientIndexDb)} dB index) near the premaster peak.`
    };
  }
  return null;
}

function chooseSustainedSupportStem(stemAnalysis) {
  return ["melody", "guitar"]
    .map((stem) => ({ stem, metrics: stemAnalysis?.[stem] }))
    .filter((item) => item.metrics && (item.metrics.rmsDbfs ?? -120) > -45 && (item.metrics.crestFactorDb ?? 99) < 12)
    .sort((a, b) => (b.metrics.rmsDbfs ?? -120) - (a.metrics.rmsDbfs ?? -120))[0]?.stem || null;
}

function transientIndex(metrics) {
  const truePeak = metrics?.truePeakDbtp ?? metrics?.samplePeakDbfs ?? null;
  const rms = metrics?.rmsDbfs ?? null;
  if (truePeak === null || rms === null) return 0;
  return truePeak - rms;
}

function title(value) {
  return String(value).slice(0, 1).toUpperCase() + String(value).slice(1);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
