import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { parsePocketChordsmithInput } from "../src/index.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const repoRoot = resolve(packageRoot, "../..");

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.source) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

const sourcePath = resolve(String(args.source));
const godotBin = String(args.godotBin || process.env.GODOT_BIN || "");
const godotProject = String(args.godotProject || process.env.GODOT_PROJECT_PATH || "");
if (!existsSync(sourcePath)) throw new Error(`Source file not found: ${sourcePath}`);
if (!godotBin) throw new Error("Missing --godot-bin or GODOT_BIN.");
if (!godotProject) throw new Error("Missing --godot-project or GODOT_PROJECT_PATH.");

const workRoot = String(args.workRoot || "res://addons/pocket_chordsmith/_trace_compare");
const chartPath = `${workRoot}/source_pcs_chart.tres`;
const godotTracePath = `${workRoot}/godot_event_trace.json`;
const nativeMetricsPath = `${workRoot}/native_preview_metrics.json`;
const sampleMetricsPath = `${workRoot}/sample_preview_metrics.json`;
const voiceMetricsPath = `${workRoot}/voice_metric_comparison.json`;
const keepReports = Boolean(args.keepReports);
const voiceMetricSource = args.sampleMetrics ? "sample" : "native";
const compareVoiceMetrics = Boolean(args.voiceMetrics || args.sampleMetrics);
const voiceMetricKeys = ["peak", "rms", "mean_abs_delta", "zero_crossing_rate", "active_duration_seconds", "attack_peak", "attack_rms"];

const rawInput = readFileSync(sourcePath, "utf8");
const rawProject = parsePocketChordsmithInput(rawInput);
const browserTrace = await buildBrowserTrace(rawProject);
const godotTrace = runGodotTrace({
  godotBin,
  godotProject,
  sourcePath,
  workRoot,
  chartPath,
  godotTracePath,
  nativeMetricsPath,
  sampleMetricsPath,
  includeNativeMetrics: Boolean(args.nativeMetrics || (compareVoiceMetrics && voiceMetricSource === "native")),
  includeSampleMetrics: Boolean(args.sampleMetrics)
});
const browserVoiceMetrics = compareVoiceMetrics ? await buildBrowserVoiceMetrics(rawProject) : null;

const browserEvents = comparableEvents(browserTrace.events, "browser");
const godotEvents = comparableEvents(godotTrace.events, "godot");
const firstEventDiff = firstDiff(browserEvents, godotEvents);
const browserCounts = countTypes(browserEvents);
const godotCounts = countTypes(godotEvents);
const countDiff = JSON.stringify(browserCounts) === JSON.stringify(godotCounts) ? null : { browser: browserCounts, godot: godotCounts };
const voiceMetricDiff = compareVoiceMetrics ? compareBrowserAndGodotVoiceMetrics(browserVoiceMetrics, godotTrace, voiceMetricSource) : null;
if (keepReports && voiceMetricDiff) {
  writeVoiceMetricReport(godotProject, voiceMetricsPath, {
    sourcePath,
    metricSource: voiceMetricSource,
    browserEventCount: browserEvents.length,
    godotEventCount: godotEvents.length,
    byType: voiceMetricDiff.byType,
    topVoiceMetricDrifts: topVoiceMetricDrifts(voiceMetricDiff.summaries),
    summaries: voiceMetricDiff.summaries,
    errors: voiceMetricDiff.errors
  });
}

printReport({
  sourcePath,
  browserTrace,
  godotTrace,
  browserEvents,
  godotEvents,
  firstEventDiff,
  countDiff,
  voiceMetricDiff,
  godotTracePath,
  nativeMetricsPath,
  sampleMetricsPath,
  voiceMetricsPath,
  keepReports
});

if (!keepReports) {
  try {
    rmSync(globalizeGodotProjectPath(godotProject, workRoot), { recursive: true, force: true });
  } catch {
    // Best effort only; Godot project caches can keep files around briefly on Windows.
  }
}

if (firstEventDiff || countDiff || voiceMetricDiff?.fatal) process.exitCode = 1;

async function buildBrowserTrace(project) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(pathToFileURL(join(repoRoot, "apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html")).href, {
      waitUntil: "load"
    });
    await page.waitForFunction(
      () => window.PocketChordsmithParityTrace && typeof window.PocketChordsmithParityTrace.fromProject === "function"
    );
    const trace = await page.evaluate(
      (inputProject) => window.PocketChordsmithParityTrace.fromProject(inputProject),
      project
    );
    if (pageErrors.length) {
      throw new Error(`Chordsmith browser page errors: ${pageErrors.join(" | ")}`);
    }
    return trace;
  } finally {
    await browser.close();
  }
}

async function buildBrowserVoiceMetrics(project) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(pathToFileURL(join(repoRoot, "apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html")).href, {
      waitUntil: "load"
    });
    await page.waitForFunction(
      () => window.PocketChordsmithParityTrace && typeof window.PocketChordsmithParityTrace.fromProject === "function"
    );
    const metrics = await page.evaluate(async (inputProject) => {
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OfflineCtx) throw new Error("OfflineAudioContext is unavailable in this browser.");

      function metricKey(event) {
        const notes = Array.isArray(event.midiNotes) ? event.midiNotes.join(",") : "";
        return [
          event.type,
          event.midi ?? "",
          notes,
          Math.round(Number(event.duration || 0) * 1000),
          event.instrument || event.tone || "",
          event.articulation || "",
          event.direction || "",
          event.accent ? 1 : 0,
          event.tuplet ? 1 : 0,
          Math.round(Number(event.pan || 0) * 100)
        ].join(":");
      }

      function analyseAudioBuffer(buffer, attackStartSeconds = 0) {
        let peak = 0;
        let sumSquares = 0;
        let sumAbsDelta = 0;
        let sampleCount = 0;
        let zeroCrossings = 0;
        let previous = 0;
        let hasPrevious = false;
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const data = buffer.getChannelData(channel);
          for (let index = 0; index < data.length; index += 1) {
            const value = data[index] || 0;
            peak = Math.max(peak, Math.abs(value));
            sumSquares += value * value;
            if (hasPrevious) {
              sumAbsDelta += Math.abs(value - previous);
              if ((value >= 0 && previous < 0) || (value < 0 && previous >= 0)) zeroCrossings += 1;
            }
            previous = value;
            hasPrevious = true;
            sampleCount += 1;
          }
        }
        const active = analyseActiveWindow(buffer, 0.0001);
        const attack = analyseAttackWindow(buffer, attackStartSeconds, 0.05);
        const comparableSamples = Math.max(1, sampleCount - 1);
        return {
          peak,
          rms: Math.sqrt(sumSquares / Math.max(1, sampleCount)),
          mean_abs_delta: sumAbsDelta / comparableSamples,
          zero_crossing_rate: zeroCrossings / comparableSamples,
          active_duration_seconds: active.active_duration_seconds,
          attack_peak: attack.attack_peak,
          attack_rms: attack.attack_rms,
          sample_count: sampleCount,
          frame_count: buffer.length,
          duration_seconds: buffer.length / buffer.sampleRate,
          mix_rate: buffer.sampleRate,
          stereo: buffer.numberOfChannels === 2
        };
      }

      function analyseActiveWindow(buffer, threshold = 0.0001) {
        let firstActiveFrame = -1;
        let lastActiveFrame = -1;
        for (let frame = 0; frame < buffer.length; frame += 1) {
          let framePeak = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            framePeak = Math.max(framePeak, Math.abs(buffer.getChannelData(channel)[frame] || 0));
          }
          if (framePeak >= threshold) {
            if (firstActiveFrame < 0) firstActiveFrame = frame;
            lastActiveFrame = frame;
          }
        }
        if (firstActiveFrame < 0) {
          return { active_duration_seconds: 0 };
        }
        return {
          active_duration_seconds: (lastActiveFrame - firstActiveFrame + 1) / buffer.sampleRate
        };
      }

      function analyseAttackWindow(buffer, attackStartSeconds = 0, attackSeconds = 0.05) {
        const attackStartFrame = Math.max(0, Math.min(buffer.length - 1, Math.round(attackStartSeconds * buffer.sampleRate)));
        const attackEndFrame = Math.min(buffer.length, attackStartFrame + Math.max(1, Math.ceil(attackSeconds * buffer.sampleRate)));
        let attackPeak = 0;
        let attackSquares = 0;
        let attackSamples = 0;
        for (let frame = attackStartFrame; frame < attackEndFrame; frame += 1) {
          for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const value = buffer.getChannelData(channel)[frame] || 0;
            attackPeak = Math.max(attackPeak, Math.abs(value));
            attackSquares += value * value;
            attackSamples += 1;
          }
        }
        return {
          attack_peak: attackPeak,
          attack_rms: Math.sqrt(attackSquares / Math.max(1, attackSamples))
        };
      }

      async function renderEventMetric(rawEvent, normalizedEvent) {
        const start = 0.05;
        const duration = Math.max(0.45, Number(normalizedEvent.duration || rawEvent.dur || 0) + 0.7);
        const sampleRate = 44100;
        const ctx = new OfflineCtx(2, Math.ceil(duration * sampleRate), sampleRate);
        const out = ctx.createGain();
        out.gain.value = 1;
        out.connect(ctx.destination);

        const previous = {
          audioCtx,
          beatGain,
          chordGain,
          leadGain,
          guitarGain,
          masterGain,
          activeChordVoices: activeChordVoices.slice(),
          activeLeadVoices: activeLeadVoices.slice(),
          activeGuitarVoices: activeGuitarVoices.slice()
        };

        audioCtx = ctx;
        beatGain = out;
        chordGain = out;
        leadGain = out;
        guitarGain = out;
        masterGain = out;
        activeChordVoices.splice(0);
        activeLeadVoices.splice(0);
        activeGuitarVoices.splice(0);

        try {
          const step = Number(normalizedEvent.step || rawEvent.step || 0);
          const type = normalizedEvent.type;
          if (type === "bass") {
            const peak = humanizePeak(normalizedEvent.accent ? 0.42 : 0.34, step, 4);
            playBassPhrase(normalizedEvent.midi, start, normalizedEvent.duration || rawEvent.dur || 0.22, peak, !!normalizedEvent.accent, normalizedEvent.slideMidi ?? null, normalizedEvent.slideOffset ?? null);
          } else if (type === "melody") {
            const trackIndex = Number(rawEvent.trackIndex || normalizedEvent.trackIndex || 0);
            playLeadPhraseInstrument(normalizedEvent.midi, start, normalizedEvent.duration || rawEvent.dur || 0.28, normalizedEvent.instrument || "pulse", normalizedEvent.pan || 0, humanizePeak(1, step, 10 + trackIndex), normalizedEvent.slideMidi ?? null, normalizedEvent.slideOffset ?? null);
          } else if (type === "guitar") {
            playGuitarVoice(ctx, out, normalizedEvent.midiNotes || rawEvent.notes || [], start, normalizedEvent.duration || rawEvent.dur || 0.24, normalizedEvent.articulation || "open", normalizedEvent.tone || normalizedEvent.instrument || "high_gain", normalizedEvent.direction || "down", step);
          } else if (type === "chord") {
            playChord(rawEvent.chord, start, normalizedEvent.duration || rawEvent.dur || 0.5);
          } else if (type === "kick") {
            playKick(start, normalizedEvent.accent ? 1.12 : 0.95);
          } else if (type === "snare") {
            playSnare(start, normalizedEvent.accent ? 0.72 : 0.5);
          } else if (type === "hat" || type === "open_hat") {
            playHat(start, normalizedEvent.accent ? 0.24 : 0.16, normalizedEvent.accent || type === "open_hat");
          } else {
            return null;
          }
          const rendered = await ctx.startRendering();
          return analyseAudioBuffer(rendered, start);
        } finally {
          audioCtx = previous.audioCtx;
          beatGain = previous.beatGain;
          chordGain = previous.chordGain;
          leadGain = previous.leadGain;
          guitarGain = previous.guitarGain;
          masterGain = previous.masterGain;
          activeChordVoices.splice(0, activeChordVoices.length, ...previous.activeChordVoices);
          activeLeadVoices.splice(0, activeLeadVoices.length, ...previous.activeLeadVoices);
          activeGuitarVoices.splice(0, activeGuitarVoices.length, ...previous.activeGuitarVoices);
        }
      }

      const snapshot = exportProject();
      const previousSection = state.currentSection;
      const previousScope = els.exportScopeSelect ? els.exportScopeSelect.value : "";
      const wasPlaying = !!state.isPlaying;
      if (wasPlaying) stopPlayback();
      try {
        importProject(inputProject);
        const rawEvents = buildSequenceEvents();
        const normalizedEvents = rawEvents.map(normalizeChordsmithTraceEvent);
        const seen = new Set();
        const counts = {};
        const maxPerType = 64;
        const out = [];
        for (let index = 0; index < rawEvents.length; index += 1) {
          const event = normalizedEvents[index];
          if (!["kick", "snare", "hat", "open_hat", "bass", "chord", "guitar", "melody"].includes(event.type)) continue;
          counts[event.type] = counts[event.type] || 0;
          if (counts[event.type] >= maxPerType) continue;
          const key = metricKey(event);
          if (seen.has(key)) continue;
          seen.add(key);
          counts[event.type] += 1;
          const metrics = await renderEventMetric(rawEvents[index], event);
          if (metrics) out.push({ event, metrics });
        }
        return out;
      } finally {
        try {
          importProject(snapshot);
          state.currentSection = sanitizeSectionId(previousSection) || "A";
          syncSection();
          if (els.exportScopeSelect && previousScope) els.exportScopeSelect.value = previousScope;
          renderAll();
        } catch (error) {
          console.error("Could not restore project after browser audio metrics", error);
        }
      }
    }, project);
    if (pageErrors.length) {
      throw new Error(`Chordsmith browser page errors: ${pageErrors.join(" | ")}`);
    }
    return metrics;
  } finally {
    await browser.close();
  }
}

function runGodotTrace(options) {
  const projectOutput = globalizeGodotProjectPath(options.godotProject, options.workRoot);
  mkdirSync(projectOutput, { recursive: true });
  execGodot(options.godotBin, options.godotProject, [
    "--script",
    "res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd",
    "--",
    "--source",
    options.sourcePath,
    "--output",
    options.chartPath
  ]);
  execGodot(options.godotBin, options.godotProject, [
    "--script",
    "res://addons/pocket_chordsmith/tools/export_pocket_chordsmith_event_trace.gd",
    "--",
    "--chart",
    options.chartPath,
    "--report",
    options.godotTracePath
  ]);
  if (options.includeNativeMetrics) {
    execGodot(options.godotBin, options.godotProject, [
      "--script",
      "res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_native_preview.gd",
      "--",
      "--chart",
      options.chartPath,
      "--profile",
      "res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres",
      "--report",
      options.nativeMetricsPath
    ]);
  }
  if (options.includeSampleMetrics) {
    execGodot(options.godotBin, options.godotProject, [
      "--script",
      "res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_sample_preview.gd",
      "--",
      "--chart",
      options.chartPath,
      "--profile",
      "res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres",
      "--report",
      options.sampleMetricsPath
    ]);
  }
  const trace = JSON.parse(readFileSync(globalizeGodotProjectPath(options.godotProject, options.godotTracePath), "utf8"));
  if (options.includeNativeMetrics) {
    trace.nativeMetrics = JSON.parse(readFileSync(globalizeGodotProjectPath(options.godotProject, options.nativeMetricsPath), "utf8"));
  }
  if (options.includeSampleMetrics) {
    trace.sampleMetrics = JSON.parse(readFileSync(globalizeGodotProjectPath(options.godotProject, options.sampleMetricsPath), "utf8"));
  }
  return trace;
}

function execGodot(godotBinPath, projectPath, scriptArgs) {
  const child = spawnSync(godotBinPath, ["--headless", "--path", projectPath, ...scriptArgs], {
    encoding: "utf8",
    windowsHide: true
  });
  const output = `${child.stdout || ""}${child.stderr || ""}`;
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Godot exited ${child.status} while running ${scriptArgs.join(" ")}:\n${output}`);
  if (output.includes("SCRIPT ERROR") || output.includes("ERROR:")) {
    throw new Error(`Godot reported errors while running ${scriptArgs.join(" ")}:\n${output}`);
  }
  return output;
}

function comparableEvents(events, source) {
  return events.map((event) => compactEvent(event, source)).sort(compareEvents);
}

function compactEvent(event, source) {
  const out = {
    type: event.type,
    sectionId: event.sectionId || event.section || "A",
    step: numberOrNull(event.step),
    time: round(event.time),
    duration: round(event.duration ?? event.dur),
    accent: Boolean(event.accent),
    tuplet: Boolean(event.tuplet)
  };
  if (!isDrumType(out.type)) copyOptional(out, event, "midi");
  copyOptional(out, event, "slideMidi");
  copyOptionalEventTime(out, event, "slideOffset");
  if (event.instrument !== undefined && event.instrument !== null) out.instrument = event.instrument;
  else if (event.tone !== undefined && event.tone !== null) out.instrument = event.tone;
  if (out.type === "bass" && (out.instrument === "manual_bass" || out.instrument === "auto_bass")) delete out.instrument;
  copyOptional(out, event, "articulation");
  copyOptionalPan(out, event);
  copyOptional(out, event, "direction");
  if (Array.isArray(event.midiNotes)) out.midiNotes = event.midiNotes.map(Number);
  if ((out.type === "chord" || out.type === "guitar") && Array.isArray(out.midiNotes)) delete out.midi;
  if (source === "godot" && event.track_type === "drum") delete out.instrument;
  return out;
}

function copyOptional(target, source, key) {
  if (source[key] !== undefined && source[key] !== null && source[key] !== "") target[key] = source[key];
}

function copyOptionalNumber(target, source, key) {
  if (source[key] !== undefined && source[key] !== null) target[key] = round(source[key]);
}

function copyOptionalEventTime(target, source, key) {
  if (source[key] !== undefined && source[key] !== null) target[key] = round(source[key]);
}

function copyOptionalPan(target, source) {
  if (source.pan === undefined || source.pan === null) return;
  const pan = round(source.pan);
  if (Math.abs(pan) > 0.000001) target.pan = pan;
}

function isDrumType(type) {
  return type === "kick" || type === "snare" || type === "hat" || type === "open_hat";
}

function compareEvents(a, b) {
  return (a.time - b.time)
    || roleOrder(a.type) - roleOrder(b.type)
    || (a.step ?? -1) - (b.step ?? -1)
    || JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function roleOrder(type) {
  return ["kick", "snare", "hat", "open_hat", "bass", "chord", "guitar", "melody", "texture", "fx"].indexOf(type) + 1 || 99;
}

function firstDiff(left, right) {
  const used = new Set();
  for (let index = 0; index < left.length; index += 1) {
    const actual = left[index];
    const matchIndex = right.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && eventsEqual(actual, candidate));
    if (matchIndex < 0) {
      return { index, browser: actual, godot: firstUnused(right, used) };
    }
    used.add(matchIndex);
  }
  if (used.size !== right.length) return { index: left.length, browser: null, godot: firstUnused(right, used) };
  return null;
}

function firstUnused(events, used) {
  return events.find((_, index) => !used.has(index)) || null;
}

function eventsEqual(left, right) {
  if (left === null || right === null) return left === right;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (key === "time" || key === "duration" || key === "slideOffset") {
      if (Math.abs(Number(left[key]) - Number(right[key])) > 0.002) return false;
    } else if (JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null)) {
      return false;
    }
  }
  return true;
}

function countTypes(events) {
  return events.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] || 0) + 1;
    return counts;
  }, {});
}

function compareBrowserAndGodotVoiceMetrics(browserMetrics, godotTrace, metricSource = "native") {
  const metricReport = metricSource === "sample" ? godotTrace?.sampleMetrics : godotTrace?.nativeMetrics;
  const godotMetrics = Array.isArray(metricReport?.metrics) ? metricReport.metrics : [];
  if (!browserMetrics?.length || !godotMetrics.length) {
    return {
      fatal: true,
      errors: [`Missing browser or Godot ${metricSource} voice metrics.`],
      metricSource,
      summaries: []
    };
  }
  const browserCandidates = [];
  for (const item of browserMetrics) {
    const compact = compactEvent(item.event, "browser");
    browserCandidates.push({ compact, metrics: item.metrics });
  }
  const summaries = [];
  const errors = [];
  const usedBrowserIndexes = new Set();
  for (const item of godotMetrics) {
    const eventIndex = Number(item.event_index);
    const godotEvent = godotTrace.events?.[eventIndex];
    if (!godotEvent) continue;
    const compact = compactEvent(godotEvent, "godot");
    const matchIndex = browserCandidates.findIndex((candidate, index) => !usedBrowserIndexes.has(index) && eventsEqualWithoutTime(candidate.compact, compact));
    if (matchIndex < 0) continue;
    usedBrowserIndexes.add(matchIndex);
    const browser = browserCandidates[matchIndex];
    summaries.push({
      type: compact.type,
      signature: eventSignature(compact),
      browser: summarizeMetric(browser.metrics),
      godot: summarizeMetric(item),
      ratios: {
        peak: safeRatio(item.peak, browser.metrics.peak),
        rms: safeRatio(item.rms, browser.metrics.rms),
        mean_abs_delta: safeRatio(item.mean_abs_delta, browser.metrics.mean_abs_delta),
        zero_crossing_rate: safeRatio(item.zero_crossing_rate, browser.metrics.zero_crossing_rate),
        active_duration_seconds: safeRatio(item.active_duration_seconds, browser.metrics.active_duration_seconds),
        attack_peak: safeRatio(item.attack_peak, browser.metrics.attack_peak),
        attack_rms: safeRatio(item.attack_rms, browser.metrics.attack_rms)
      }
    });
  }
  const byType = groupMetricSummariesByType(summaries);
  for (const type of ["bass", "chord", "guitar", "melody"]) {
    if (!byType[type]?.count) errors.push(`No overlapping ${type} voice metrics were compared.`);
  }
  return {
    fatal: errors.length > 0,
    errors,
    metricSource,
    byType,
    summaries
  };
}

function writeVoiceMetricReport(godotProjectPath, reportPath, report) {
  const absoluteReportPath = globalizeGodotProjectPath(godotProjectPath, reportPath);
  mkdirSync(dirname(absoluteReportPath), { recursive: true });
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function eventSignature(event) {
  const clone = { ...event };
  delete clone.time;
  return JSON.stringify(clone);
}

function eventsEqualWithoutTime(left, right) {
  const cloneLeft = { ...left, time: 0 };
  const cloneRight = { ...right, time: 0 };
  return eventsEqual(cloneLeft, cloneRight);
}

function summarizeMetric(metric) {
  return {
    peak: round(metric.peak),
    rms: round(metric.rms),
    mean_abs_delta: round(metric.mean_abs_delta),
    zero_crossing_rate: round(metric.zero_crossing_rate),
    active_duration_seconds: round(metric.active_duration_seconds),
    attack_peak: round(metric.attack_peak),
    attack_rms: round(metric.attack_rms),
    duration_seconds: round(metric.duration_seconds)
  };
}

function safeRatio(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || Math.abs(bottom) < 0.0000001) return null;
  return round(top / bottom);
}

function median(values) {
  const finite = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}

function groupMetricSummariesByType(summaries) {
  const groups = {};
  for (const summary of summaries) {
    const group = groups[summary.type] || {
      count: 0,
      peak_ratios: [],
      rms_ratios: [],
      mean_abs_delta_ratios: [],
      zero_crossing_rate_ratios: [],
      active_duration_seconds_ratios: [],
      attack_peak_ratios: [],
      attack_rms_ratios: []
    };
    group.count += 1;
    for (const key of voiceMetricKeys) {
      const value = summary.ratios[key];
      if (Number.isFinite(value)) group[`${key}_ratios`].push(value);
    }
    groups[summary.type] = group;
  }
  const out = {};
  for (const [type, group] of Object.entries(groups)) {
    out[type] = {
      count: group.count,
      median_peak_ratio: round(median(group.peak_ratios)),
      median_rms_ratio: round(median(group.rms_ratios)),
      median_mean_abs_delta_ratio: round(median(group.mean_abs_delta_ratios)),
      median_zero_crossing_rate_ratio: round(median(group.zero_crossing_rate_ratios)),
      median_active_duration_seconds_ratio: round(median(group.active_duration_seconds_ratios)),
      median_attack_peak_ratio: round(median(group.attack_peak_ratios)),
      median_attack_rms_ratio: round(median(group.attack_rms_ratios))
    };
  }
  return out;
}

function topVoiceMetricDrifts(summaries, limit = 8) {
  return summaries
    .map((summary) => {
      const ratios = summary.ratios || {};
      const score = Math.max(
        ...voiceMetricKeys.map((key) => metricRatioDrift(ratios[key]))
      );
      return { type: summary.type, score: round(score), ratios, signature: summary.signature };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function metricRatioDrift(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.max(ratio, 1 / ratio);
}

function numberOrNull(value) {
  return value === undefined || value === null ? null : Number(value);
}

function round(value) {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000000) / 1000000;
}


function globalizeGodotProjectPath(projectPath, resourcePath) {
  if (!resourcePath.startsWith("res://")) return resourcePath;
  return join(projectPath, resourcePath.slice("res://".length).replaceAll("/", "\\"));
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        out.help = true;
        break;
      case "--source":
      case "-s":
        out.source = argv[++index];
        break;
      case "--godot-bin":
        out.godotBin = argv[++index];
        break;
      case "--godot-project":
        out.godotProject = argv[++index];
        break;
      case "--work-root":
        out.workRoot = argv[++index];
        break;
      case "--native-metrics":
        out.nativeMetrics = true;
        break;
      case "--voice-metrics":
        out.voiceMetrics = true;
        break;
      case "--sample-metrics":
        out.sampleMetrics = true;
        break;
      case "--keep-reports":
        out.keepReports = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printReport(report) {
  console.log("Chordsmith browser-to-Godot event trace comparison");
  console.log(`Source: ${report.sourcePath}`);
  console.log(`Browser events: ${report.browserEvents.length}`);
  console.log(`Godot events: ${report.godotEvents.length}`);
  console.log(`Browser types: ${JSON.stringify(countTypes(report.browserEvents))}`);
  console.log(`Godot types: ${JSON.stringify(countTypes(report.godotEvents))}`);
  console.log(`Type counts: ${report.countDiff ? "DRIFT" : "ok"}`);
  console.log(`Event trace: ${report.firstEventDiff ? "DRIFT" : "ok"}`);
  if (report.voiceMetricDiff) {
    console.log(`Voice metrics (${report.voiceMetricDiff.metricSource || "native"}): ${report.voiceMetricDiff.fatal ? "INCOMPLETE" : "ok"}`);
    console.log(`Voice metric ratios by type: ${JSON.stringify(report.voiceMetricDiff.byType)}`);
    console.log(`Top voice metric drifts: ${JSON.stringify(topVoiceMetricDrifts(report.voiceMetricDiff.summaries))}`);
    for (const error of report.voiceMetricDiff.errors) console.log(`Voice metric issue: ${error}`);
  }
  if (report.firstEventDiff) console.log(`First event diff: ${JSON.stringify(report.firstEventDiff)}`);
  if (report.keepReports) {
    console.log(`Godot event trace: ${report.godotTracePath}`);
    if (report.godotTrace?.nativeMetrics || report.nativeMetricsPath) console.log(`Native metrics path: ${report.nativeMetricsPath}`);
    if (report.godotTrace?.sampleMetrics || report.sampleMetricsPath) console.log(`Sample metrics path: ${report.sampleMetricsPath}`);
    if (report.voiceMetricDiff) console.log(`Voice metric comparison path: ${report.voiceMetricsPath}`);
  }
}

function printUsage() {
  console.log("Compare Pocket Chordsmith browser/Core event trace with Godot compiled-event trace.");
  console.log("Usage:");
  console.log("  node scripts/compare-chordsmith-godot-trace.mjs --source <project.json|song.pcs1.txt> --godot-bin <Godot_console.exe> --godot-project <project-dir> [--native-metrics] [--voice-metrics] [--sample-metrics] [--keep-reports]");
  console.log("");
  console.log("Environment alternatives:");
  console.log("  GODOT_BIN=<Godot_console.exe> GODOT_PROJECT_PATH=<project-dir> npm run compare:chordsmith-godot-trace -- --source <file>");
}
