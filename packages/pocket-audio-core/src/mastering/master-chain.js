import { analyseRenderedBuffer } from "../export/audio-metrics.js";
import { cloneRenderedBuffer, finiteSampleReport, round } from "./audio-buffer-utils.js";
import { dbToGain, gainToDb } from "./release-profiles.js";

export function masterBuffer(input, profile) {
  const finite = finiteSampleReport(input);
  if (finite.nonFiniteSamples) {
    throw new Error(`Cannot master buffer with non-finite samples: ${finite.nonFiniteSamples}.`);
  }

  const settings = {
    profile: profile.id,
    chain: [],
    loudnessTrimDb: 0,
    requestedLoudnessTrimDb: 0,
    maxSafeLoudnessTrimDb: 0,
    limiterGainReductionDb: 0,
    loudnessTargetStatus: "not_evaluated",
    loudnessTargetReason: "",
    passes: []
  };
  let buffer = cloneRenderedBuffer(input);

  if (profile.dcBlock) {
    buffer = dcBlock(buffer);
    settings.chain.push("dc_block");
  }
  if (profile.highPassHz) {
    buffer = highPass(buffer, profile.highPassHz);
    settings.chain.push(`high_pass_${profile.highPassHz}hz`);
  }
  if (profile.warmth?.enabled) {
    buffer = saturate(buffer, profile.warmth);
    settings.chain.push("gentle_warmth");
  }
  if (profile.glueCompression?.enabled) {
    const compressed = glueCompress(buffer, profile.glueCompression);
    buffer = compressed.buffer;
    settings.chain.push("gentle_glue_compression");
    settings.glueGainReductionDb = round(compressed.maxGainReductionDb, 3);
  }

  const preLimiter = analyseRenderedBuffer(buffer);
  if (preLimiter.integratedLufs !== null) {
    const plan = planLoudnessTrim(preLimiter, profile, profile.maxLimiterGainReductionDb);
    settings.requestedLoudnessTrimDb = round(plan.requestedTrimDb, 3);
    settings.maxSafeLoudnessTrimDb = round(plan.maxSafeTrimDb, 3);
    if (Math.abs(plan.trimDb) > 0.01) {
      settings.loudnessTrimDb = round(settings.loudnessTrimDb + plan.trimDb, 3);
      buffer = gain(buffer, dbToGain(plan.trimDb));
      settings.chain.push("loudness_trim_pass_1");
    }
    settings.passes.push({
      pass: 1,
      requestedTrimDb: round(plan.requestedTrimDb, 3),
      appliedTrimDb: round(plan.trimDb, 3),
      maxSafeTrimDb: round(plan.maxSafeTrimDb, 3),
      dynamicsLimited: plan.dynamicsLimited
    });
  }

  let limited = truePeakLimiter(buffer, profile);
  buffer = limited.buffer;
  let cumulativeLimiterGainReductionDb = limited.maxGainReductionDb;
  settings.chain.push("true_peak_lookahead_limiter_pass_1");

  let postAnalysis = analyseRenderedBuffer(buffer);
  const remainingLimiterWorkDb = Math.max(0, Number(profile.maxLimiterGainReductionDb || 0) - cumulativeLimiterGainReductionDb);
  if (postAnalysis.integratedLufs !== null && postAnalysis.integratedLufs < profile.targetIntegratedLufs - profile.targetToleranceLu && remainingLimiterWorkDb > 0.05) {
    const plan = planLoudnessTrim(postAnalysis, profile, remainingLimiterWorkDb);
    const trimDb = Math.min(plan.trimDb, 1.5);
    if (trimDb > 0.01) {
      settings.loudnessTrimDb = round(settings.loudnessTrimDb + trimDb, 3);
      buffer = gain(buffer, dbToGain(trimDb));
      settings.chain.push("loudness_trim_pass_2");
      settings.passes.push({
        pass: 2,
        requestedTrimDb: round(plan.requestedTrimDb, 3),
        appliedTrimDb: round(trimDb, 3),
        maxSafeTrimDb: round(plan.maxSafeTrimDb, 3),
        dynamicsLimited: plan.dynamicsLimited
      });
      limited = truePeakLimiter(buffer, profile);
      buffer = limited.buffer;
      cumulativeLimiterGainReductionDb += limited.maxGainReductionDb;
      settings.chain.push("true_peak_lookahead_limiter_pass_2");
      postAnalysis = analyseRenderedBuffer(buffer);
    }
  }

  return {
    buffer,
    settings: finalizeLoudnessStatus(settings, profile, preLimiter, postAnalysis, cumulativeLimiterGainReductionDb),
    preLimiterAnalysis: preLimiter,
    postAnalysis
  };
}

function gain(buffer, amount) {
  const out = cloneRenderedBuffer(buffer);
  out.channels.forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) channel[index] *= amount;
  });
  return out;
}

function dcBlock(buffer) {
  const out = cloneRenderedBuffer(buffer);
  out.channels.forEach((channel) => {
    const mean = channel.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) / Math.max(1, channel.length);
    for (let index = 0; index < channel.length; index += 1) channel[index] -= mean;
  });
  return out;
}

function highPass(buffer, hz) {
  const out = cloneRenderedBuffer(buffer);
  const rc = 1 / (2 * Math.PI * hz);
  const dt = 1 / out.sampleRate;
  const alpha = rc / (rc + dt);
  out.channels.forEach((channel) => {
    let previousInput = 0;
    let previousOutput = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const input = channel[index];
      const filtered = alpha * (previousOutput + input - previousInput);
      channel[index] = filtered;
      previousInput = input;
      previousOutput = filtered;
    }
  });
  return out;
}

function saturate(buffer, warmth) {
  const out = cloneRenderedBuffer(buffer);
  const drive = Number(warmth.drive || 1.05);
  const mix = Math.max(0, Math.min(0.3, Number(warmth.mix || 0.1)));
  out.channels.forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) {
      const dry = channel[index];
      const wet = Math.tanh(dry * drive) / Math.tanh(drive);
      channel[index] = dry * (1 - mix) + wet * mix;
    }
  });
  return out;
}

function glueCompress(buffer, settings) {
  const out = cloneRenderedBuffer(buffer);
  const threshold = dbToGain(settings.thresholdDb ?? -18);
  const ratio = Math.max(1, Number(settings.ratio || 1.5));
  const maxReduction = Math.max(0, Number(settings.maxGainReductionDb || 1.5));
  let maxGainReductionDb = 0;
  out.channels.forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) {
      const abs = Math.abs(channel[index]);
      if (abs <= threshold) continue;
      const overDb = gainToDb(abs / threshold) || 0;
      const reductionDb = Math.min(maxReduction, overDb - overDb / ratio);
      const g = dbToGain(-reductionDb);
      channel[index] *= g;
      maxGainReductionDb = Math.max(maxGainReductionDb, reductionDb);
    }
  });
  return { buffer: out, maxGainReductionDb };
}

function planLoudnessTrim(analysis, profile, limiterWorkAvailableDb) {
  const requestedTrimDb = profile.targetIntegratedLufs - analysis.integratedLufs;
  if (requestedTrimDb <= 0) {
    return {
      requestedTrimDb,
      trimDb: requestedTrimDb,
      maxSafeTrimDb: requestedTrimDb,
      dynamicsLimited: false
    };
  }
  const peak = analysis.truePeakDbtp ?? analysis.samplePeakDbfs ?? -120;
  const truePeakHeadroomDb = profile.truePeakCeilingDbtp - peak;
  const maxSafeTrimDb = Math.max(0, truePeakHeadroomDb + Math.max(0, limiterWorkAvailableDb) - 0.05);
  const trimDb = Math.min(requestedTrimDb, maxSafeTrimDb);
  return {
    requestedTrimDb,
    trimDb,
    maxSafeTrimDb,
    dynamicsLimited: trimDb + 0.05 < requestedTrimDb
  };
}

function finalizeLoudnessStatus(settings, profile, preLimiter, postAnalysis, limiterGainReductionDb) {
  settings.limiterGainReductionDb = round(limiterGainReductionDb, 3);
  const target = profile.targetIntegratedLufs;
  const tolerance = profile.targetToleranceLu;
  const postLufs = postAnalysis.integratedLufs;
  if (postLufs === null) {
    settings.loudnessTargetStatus = "unmeasurable";
    settings.loudnessTargetReason = "Integrated loudness could not be measured after mastering.";
    return settings;
  }
  if (Math.abs(postLufs - target) <= tolerance) {
    settings.loudnessTargetStatus = "reached";
    settings.loudnessTargetReason = `Post-master loudness ${round(postLufs, 2)} LUFS is within ${tolerance} LU of target ${target} LUFS.`;
    return settings;
  }
  if (postLufs < target - tolerance) {
    const requested = settings.requestedLoudnessTrimDb;
    const available = settings.maxSafeLoudnessTrimDb;
    const limit = Number(profile.maxLimiterGainReductionDb || 0);
    settings.loudnessTargetStatus = "transient-limited";
    settings.loudnessTargetReason = `Post-master loudness ${round(postLufs, 2)} LUFS remains below target because the requested ${round(requested, 2)} dB lift exceeds the safe ${round(available, 2)} dB lift under the ${round(limit, 2)} dB limiter-reduction cap.`;
    if ((preLimiter.crestFactorDb ?? 0) > 12) {
      settings.loudnessTargetReason += ` Premaster crest factor is ${round(preLimiter.crestFactorDb, 2)} dB, indicating transient-limited material.`;
    }
    return settings;
  }
  settings.loudnessTargetStatus = "above_target";
  settings.loudnessTargetReason = `Post-master loudness ${round(postLufs, 2)} LUFS is above target ${target} LUFS; true peak protection remains active.`;
  return settings;
}

function truePeakLimiter(buffer, profileOrCeiling) {
  const ceilingDbtp = typeof profileOrCeiling === "number" ? profileOrCeiling : profileOrCeiling.truePeakCeilingDbtp;
  const limiter = typeof profileOrCeiling === "number" ? {} : (profileOrCeiling.limiter || {});
  const out = cloneRenderedBuffer(buffer);
  const ceiling = dbToGain(ceilingDbtp);
  const lookaheadSamples = Math.max(1, Math.round((out.sampleRate || 44100) * Number(limiter.lookaheadMs || 5) / 1000));
  const releaseSamples = Math.max(1, Math.round((out.sampleRate || 44100) * Number(limiter.releaseMs || 80) / 1000));
  const frameCount = Math.max(0, ...out.channels.map((channel) => channel.length));
  const framePeaks = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let peak = 0;
    for (const channel of out.channels) {
      const sample = Number.isFinite(channel[frame]) ? channel[frame] : 0;
      peak = Math.max(peak, Math.abs(sample));
    }
    framePeaks[frame] = peak;
  }
  let maxGainReductionDb = 0;
  let envelopeGain = 1;
  const deque = [];
  let nextFrameToAdd = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const end = Math.min(frameCount, frame + lookaheadSamples);
    while (nextFrameToAdd < end) {
      while (deque.length && framePeaks[deque[deque.length - 1]] <= framePeaks[nextFrameToAdd]) deque.pop();
      deque.push(nextFrameToAdd);
      nextFrameToAdd += 1;
    }
    while (deque.length && deque[0] < frame) deque.shift();
    const futurePeak = deque.length ? framePeaks[deque[0]] : framePeaks[frame];
    const targetGain = futurePeak > ceiling ? ceiling / futurePeak : 1;
    if (targetGain < envelopeGain) {
      envelopeGain = targetGain;
    } else {
      envelopeGain += (1 - envelopeGain) / releaseSamples;
    }
    if (envelopeGain < 1) maxGainReductionDb = Math.max(maxGainReductionDb, Math.abs(gainToDb(envelopeGain) || 0));
    for (const channel of out.channels) {
      if (frame < channel.length) channel[frame] *= envelopeGain;
    }
  }

  const post = analyseRenderedBuffer(out);
  if ((post.truePeakDbtp ?? -120) > ceilingDbtp) {
    const safetyGainDb = ceilingDbtp - post.truePeakDbtp - 0.02;
    const safetyGain = dbToGain(safetyGainDb);
    out.channels.forEach((channel) => {
      for (let index = 0; index < channel.length; index += 1) channel[index] *= safetyGain;
    });
    maxGainReductionDb = Math.max(maxGainReductionDb, Math.abs(safetyGainDb));
  }
  return { buffer: out, maxGainReductionDb };
}
