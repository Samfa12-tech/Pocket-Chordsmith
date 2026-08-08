function makeOfflineTone(ctx, dest, freq, t, dur, type, peak=0.4, filterType=null, filterFreq=1400, pan=0){
  t = safeAudioTime(t);
  dur = Math.max(0.001, Number.isFinite(dur) ? dur : 0.001);
  const chip = isChipActive() && state.chipTexture?.enabled ? sanitizeChipTexture(state.chipTexture,state.chipPreset) : null;
  if(chip){
    freq *= 1 + ((featureSeed(Math.round(t*1000),41)-0.5) * chip.pitchDrift * 0.018);
    freq = Math.round(freq / Math.max(0.5,1 + chip.bitDepth * 7)) * Math.max(0.5,1 + chip.bitDepth * 7);
    filterType = filterType || "lowpass";
    filterFreq = Math.min(filterFreq,7200 - chip.sampleRateCrush * 5600);
    type = type === "square" && chip.pulseWidth > 0.62 ? "sawtooth" : type === "square" && chip.pulseWidth < 0.38 ? "triangle" : type;
    peak *= 0.88 + chip.saturation * 0.22;
    pan = clamp(pan + (featureSeed(Math.round(freq),42)-0.5) * chip.stereoSpread,-1,1);
  }
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);

  const gain = ctx.createGain();
  let node = osc;

  if(filterType){
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq, t);
    node.connect(f);
    node = f;
  }

  node.connect(gain);
  connectWithPan(ctx, gain, dest, pan);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.01);
  gain.gain.linearRampToValueAtTime(peak * 0.7, t + 0.07);
  gain.gain.setValueAtTime(peak * 0.7, t + Math.max(0.02, dur));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);

  osc.start(t);
  osc.stop(t + dur + 0.2);
}
function makeOfflineChordTone(ctx, dest, freq, t, dur, type, peak=0.4, filterType=null, filterFreq=1400, cfg={}, pan=0){
  t = safeAudioTime(t);
  dur = Math.max(0.001, Number.isFinite(dur) ? dur : 0.001);
  const attack = Math.max(0.001, cfg.attack ?? 0.01);
  const decay = Math.max(0.001, cfg.decay ?? 0.06);
  const sustain = clamp(cfg.sustain ?? 0.7, 0.001, 1);
  const release = Math.max(0.025, cfg.release ?? 0.2);
  const gain = ctx.createGain();
  let output = gain;

  if(filterType){
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq, t);
    f.Q.setValueAtTime(cfg.filterQ ?? 0.7, t);
    if(cfg.filterSweep){
      f.frequency.linearRampToValueAtTime(cfg.filterSweep, t + Math.max(0.04, Math.min(0.22, dur * 0.5)));
    }
    gain.connect(f);
    output = f;
  }

  connectWithPan(ctx, output, dest, pan);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak * sustain), t + attack + decay);
  gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), t + dur);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);

  const layers = cfg.layers || [{wave:type, freqMul:1, detune:0, level:1}];
  layers.forEach(layer => {
    const osc = ctx.createOscillator();
    const layerGain = ctx.createGain();
    osc.type = layer.wave || type;
    osc.frequency.setValueAtTime(freq * (layer.freqMul || 1), t);
    osc.detune.setValueAtTime(layer.detune ?? 0, t);
    layerGain.gain.setValueAtTime(layer.level ?? 1, t);
    osc.connect(layerGain);
    layerGain.connect(gain);
    osc.start(t);
    osc.stop(t + dur + release + 0.03);
  });
}
function makeOfflineLeadPhrase(ctx, dest, midi, t, dur, instrument="pulse", pan=0, slideMidi=null, slideOffset=null){
  t = safeAudioTime(t);
  dur = Math.max(0.001, Number.isFinite(dur) ? dur : 0.001);
  const cfg = leadInstrumentConfig(instrument);
  const mainPeak = Math.max(cfg.lofi ? 0.028 : 0.12, cfg.peak * 0.8);
  if(slideMidi === null || slideOffset === null){
    makeOfflineTone(ctx, dest, midiToFreq(midi), t, dur * cfg.durMul, cfg.wave, mainPeak, cfg.filter, cfg.freq, pan);
    if(instrument === "bell"){
      makeOfflineTone(ctx, dest, midiToFreq(midi + 12), t + 0.012, Math.min(0.10, dur * 0.42), "sine", 0.018, "lowpass", 3200, pan);
    } else if(instrument === "lead_guitar"){
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 1.006, t + 0.006, dur * 0.72, "square", 0.028, "lowpass", 2600, pan);
    } else if(instrument === "distorted_lead_guitar"){
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 0.996, t + 0.004, dur * 0.68, "square", 0.04, "bandpass", 2100, pan);
    } else if(instrument === "banjo"){
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 2.01, t + 0.004, Math.min(0.09, dur * 0.38), "triangle", 0.024, "highpass", 1500, pan);
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 0.997, t + 0.012, Math.min(0.13, dur * 0.48), "square", 0.015, "bandpass", 2600, pan);
    } else if(instrument === "harmonica"){
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 1.004, t + 0.006, dur * 0.92, "triangle", 0.028, "bandpass", 860, pan);
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 2, t + 0.014, dur * 0.42, "square", 0.01, "bandpass", 2100, pan);
    } else if(instrument === "cowboy_whistle"){
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 2, t + 0.01, dur * 0.65, "sine", 0.012, "lowpass", 3600, pan);
    } else if(instrument === "trumpet"){
      makeOfflineTone(ctx, dest, midiToFreq(midi + 12), t + 0.008, dur * 0.35, "sawtooth", 0.015, "bandpass", 2400, pan);
    } else if(instrument === "saxophone"){
      makeOfflineTone(ctx, dest, midiToFreq(midi - 12), t + 0.004, dur * 0.42, "sine", 0.024, "lowpass", 760, pan);
    } else if(instrument === "mellow_vibes"){
      makeOfflineTone(ctx, dest, midiToFreq(midi + 12), t + 0.01, Math.min(0.18, dur * 0.48), "sine", 0.014, "lowpass", 2400, pan);
    } else if(instrument === "soft_pluck"){
      makeOfflineTone(ctx, dest, midiToFreq(midi) * 2, t + 0.004, Math.min(0.12, dur * 0.45), "sine", 0.011, "lowpass", 2200, pan);
    } else if(instrument === "mellow_sax"){
      makeOfflineTone(ctx, dest, midiToFreq(midi - 12), t + 0.004, dur * 0.46, "sine", 0.014, "lowpass", 640, pan);
    } else if(instrument === "muted_trumpet"){
      makeOfflineTone(ctx, dest, midiToFreq(midi + 12), t + 0.006, dur * 0.28, "triangle", 0.01, "bandpass", 1700, pan);
    } else if(instrument === "tape_bell"){
      makeOfflineTone(ctx, dest, midiToFreq(midi + 12) * 0.997, t + 0.016, dur * 0.38, "sine", 0.011, "lowpass", 2100, pan);
    }
    return;
  }
  const makeVoice = (freqMul=1, waveOverride=null, peakScale=1, filterType=cfg.filter, filterFreq=cfg.freq) => {
    const osc = ctx.createOscillator();
    osc.type = waveOverride || cfg.wave;
    const slideTime = safeAudioTime(t + Math.max(0, Math.min(dur * cfg.durMul, (Number.isFinite(slideOffset) ? slideOffset : 0) * cfg.durMul + 0.08)));
    osc.frequency.setValueAtTime(midiToFreq(midi) * freqMul, t);
    osc.frequency.linearRampToValueAtTime(midiToFreq(slideMidi) * freqMul, slideTime);
    const gain = ctx.createGain();
    let node = osc;
    if(filterType){
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(filterFreq, t);
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    connectWithPan(ctx, gain, dest, pan);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(mainPeak * peakScale, t + 0.01);
    gain.gain.linearRampToValueAtTime(mainPeak * 0.7 * peakScale, t + 0.07);
    gain.gain.setValueAtTime(mainPeak * 0.7 * peakScale, t + Math.max(0.02, dur * cfg.durMul));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * cfg.durMul + 0.18);
    osc.start(t);
    osc.stop(t + dur * cfg.durMul + 0.2);
  };
  makeVoice();
  if(instrument === "bell"){
    makeVoice(2, "sine", 0.16, "lowpass", 3200);
  } else if(instrument === "lead_guitar"){
    makeVoice(1.006, "square", 0.2, "lowpass", 2600);
  } else if(instrument === "distorted_lead_guitar"){
    makeVoice(0.996, "square", 0.34, "bandpass", 2100);
  } else if(instrument === "banjo"){
    makeVoice(2.01, "triangle", 0.18, "highpass", 1500);
    makeVoice(0.997, "square", 0.13, "bandpass", 2600);
  } else if(instrument === "harmonica"){
    makeVoice(1.004, "triangle", 0.24, "bandpass", 860);
    makeVoice(2, "square", 0.08, "bandpass", 2100);
  } else if(instrument === "cowboy_whistle"){
    makeVoice(2, "sine", 0.14, "lowpass", 3600);
  } else if(instrument === "trumpet"){
    makeVoice(2, "sawtooth", 0.13, "bandpass", 2400);
  } else if(instrument === "saxophone"){
    makeVoice(0.5, "sine", 0.18, "lowpass", 760);
  } else if(instrument === "mellow_vibes"){
    makeVoice(2, "sine", 0.16, "lowpass", 2400);
  } else if(instrument === "soft_pluck"){
    makeVoice(2, "sine", 0.13, "lowpass", 2200);
  } else if(instrument === "mellow_sax"){
    makeVoice(0.5, "sine", 0.15, "lowpass", 640);
  } else if(instrument === "muted_trumpet"){
    makeVoice(2, "triangle", 0.13, "bandpass", 1700);
  } else if(instrument === "tape_bell"){
    makeVoice(1.994, "sine", 0.14, "lowpass", 2100);
  }
}
function makeOfflineToneSlide(ctx, dest, startFreq, endFreq, t, dur, slideOffset, type, peak=0.4, filterType=null, filterFreq=1400){
  const safeT = safeAudioTime(t);
  const safeDur = Math.max(0.06, dur);
  const safeSlide = Math.max(0.02, Math.min(safeDur - 0.02, slideOffset));
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, safeT);
  osc.frequency.linearRampToValueAtTime(endFreq, safeT + safeSlide + 0.08);
  const gain = ctx.createGain();
  let node = osc;
  if(filterType){ const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(filterFreq, safeT); node.connect(f); node = f; }
  node.connect(gain); gain.connect(dest);
  gain.gain.setValueAtTime(0.0001, safeT);
  gain.gain.linearRampToValueAtTime(peak, safeT + 0.01);
  gain.gain.linearRampToValueAtTime(peak * 0.7, safeT + 0.07);
  gain.gain.setValueAtTime(peak * 0.7, safeT + Math.max(0.02, safeDur));
  gain.gain.exponentialRampToValueAtTime(0.0001, safeT + safeDur + 0.18);
  osc.start(safeT);
  osc.stop(safeT + safeDur + 0.2);
}

function writeWavFromBuffer(buffer){
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeString = (offset, str) => {
    for(let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels = [];
  for(let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  for(let i = 0; i < samples; i++){
    for(let ch = 0; ch < numChannels; ch++){
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([out], {type:"audio/wav"});
}



function makeOfflineKick(ctx, dest, t){
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const kit = lofiDrumKit();

  osc.type = "sine";
  osc.frequency.setValueAtTime(kit === "classic" ? 150 : kit === "lofi_tape_soft" ? 118 : 132, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + (kit === "classic" ? 0.16 : 0.18));

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(kit === "classic" ? 180 : kit === "lofi_brush" ? 135 : 170, t);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(kit === "classic" ? 0.22 : kit === "lofi_brush" ? 0.105 : 0.13, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (kit === "classic" ? 0.18 : 0.21));

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(t);
  osc.stop(t + (kit === "classic" ? 0.2 : 0.23));
}

function makeOfflineSnare(ctx, dest, t, velocityScale=1){
  const kit = lofiDrumKit();
  const noiseDur = kit === "lofi_brush" ? 0.2 : 0.18;
  const noiseLen = Math.floor(ctx.sampleRate * noiseDur);
  const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const seed = Math.round(t * 1000) + (kit === "classic" ? 1 : 27);
  for(let i = 0; i < noiseLen; i++) data[i] = stableNoiseSample(i, seed) * (kit === "classic" ? 0.9 : 0.65);

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = kit === "classic" ? "highpass" : "bandpass";
  noiseFilter.frequency.setValueAtTime(kit === "classic" ? 1600 : kit === "lofi_brush" ? 1180 : 1350, t);
  noiseFilter.Q.value = kit === "classic" ? 0.7 : 0.95;

  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = "lowpass";
  toneFilter.frequency.setValueAtTime(kit === "classic" ? 5200 : kit === "lofi_tape_soft" ? 2200 : 2800, t);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime((kit === "classic" ? 0.16 : kit === "lofi_brush" ? 0.07 : 0.085)*velocityScale, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + (kit === "lofi_brush" ? 0.18 : 0.14));

  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = "triangle";
  bodyOsc.frequency.setValueAtTime(kit === "lofi_brush" ? 150 : 180, t);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime((kit === "classic" ? 0.08 : 0.035)*velocityScale, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

  noise.connect(noiseFilter);
  noiseFilter.connect(toneFilter);
  toneFilter.connect(noiseGain);
  noiseGain.connect(dest);

  bodyOsc.connect(bodyGain);
  bodyGain.connect(dest);

  noise.start(t);
  noise.stop(t + (kit === "lofi_brush" ? 0.2 : 0.16));
  bodyOsc.start(t);
  bodyOsc.stop(t + 0.11);
}

function makeOfflineHat(ctx, dest, t, open=false, peak=0.045){
  const kit = lofiDrumKit();
  const hatLen = open ? (kit === "classic" ? 0.22 : 0.2) : (kit === "classic" ? 0.07 : 0.065);
  const noiseLen = Math.floor(ctx.sampleRate * hatLen);
  const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const seed = Math.round(t * 1000) + (open ? 55 : 33);
  for(let i = 0; i < noiseLen; i++) data[i] = stableNoiseSample(i, seed) * (open ? 0.95 : 1);

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(kit === "classic" ? (open ? 3200 : 5000) : (open ? 2600 : 3400), t);

  const shimmer = ctx.createBiquadFilter();
  shimmer.type = kit === "classic" ? "peaking" : "lowpass";
  shimmer.frequency.setValueAtTime(kit === "classic" ? (open ? 7600 : 9200) : kit === "lofi_tape_soft" ? 5200 : 6200, t);
  shimmer.Q.value = 0.8;
  if(shimmer.gain) shimmer.gain.setValueAtTime(kit === "classic" ? (open ? 4.5 : 1.5) : 0, t);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(kit === "classic" ? (open ? Math.max(0.09, peak) : peak) : Math.max(open ? 0.028 : 0.018, peak * 0.55), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.18 : 0.06));

  noise.connect(filter);
  filter.connect(shimmer);
  shimmer.connect(gain);
  gain.connect(dest);

  if(open){
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(420, t);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.018, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    body.connect(bodyGain);
    bodyGain.connect(dest);
    body.start(t);
    body.stop(t + 0.13);
  }

  noise.start(t);
  noise.stop(t + hatLen);
}
function makeOfflineExpandedDrum(ctx,dest,lane,t,accent=false,velocityScale=1){
  const peak = accent ? 0.16 : 0.11;
  if(["rim","clap","percussion"].includes(lane)){
    makeOfflineSnare(ctx,dest,t,velocityScale);
    if(lane === "clap") makeOfflineSnare(ctx,dest,t + 0.018,velocityScale);
    return;
  }
  if(["tom_high","tom_mid","tom_low"].includes(lane)){
    const midi = lane === "tom_high" ? 57 : lane === "tom_mid" ? 52 : 45;
    makeOfflineTone(ctx,dest,midiToFreq(midi),t,0.18,"sine",peak,"lowpass",950);
    return;
  }
  if(["ride","crash","china"].includes(lane)){
    makeOfflineHat(ctx,dest,t,true,accent ? 0.13 : 0.09);
    makeOfflineTone(ctx,dest,lane === "ride" ? 980 : lane === "china" ? 740 : 620,t,lane === "ride" ? 0.24 : 0.48,"triangle",peak * 0.35,"highpass",2800);
  }
}

function makeOfflineLofiTexture(ctx, dest, totalDuration){
  if(!isLofiActive() || !state.lofiTexture?.enabled) return;
  const texture = sanitizeLofiTexture(state.lofiTexture, state.lofiPreset);
  const hiss = clamp(texture.tapeHiss, 0, 1);
  const crackle = clamp(texture.vinylCrackle, 0, 1);
  const warmth = clamp(texture.warmth, 0, 1);
  const age = clamp(texture.lowPassAge, 0, 1);
  const bit = clamp(texture.bitCrush, 0, 1);
  if(hiss <= 0.005 && crackle <= 0.005) return;
  const len = Math.max(1, Math.ceil(totalDuration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const crackleWindow = Math.max(900, Math.floor(ctx.sampleRate * 0.09));
  for(let i = 0; i < len; i++){
    const base = stableNoiseSample(i, 91) * hiss * 0.014;
    const tick = Math.floor(i / crackleWindow);
    const tickSeed = featureSeed(tick, 92);
    const local = i % crackleWindow;
    const crack = tickSeed < crackle * 0.22 && local < 760
      ? stableNoiseSample(i, 93) * crackle * 0.07 * Math.exp(-local / 130)
      : 0;
    const crushed = bit > 0.01 ? Math.round((base + crack) * (28 - bit * 18)) / (28 - bit * 18) : base + crack;
    data[i] = crushed;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.setValueAtTime(420, 0);
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(3800 - age * 2000, 0);
  const gain = ctx.createGain(); gain.gain.setValueAtTime(0.42 + warmth * 0.22, 0);
  src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(dest);
  src.start(0);
  src.stop(totalDuration);
}

async function renderCoreWavForCurrentProject(durationLabel, eventCount){
  const exportScope = getSelectedExportScope();
  const scopeLabel = exportScopeLabel(exportScope);
  const timelineOptions = coreTimelineOptionsForExportScope(exportScope);
  try{
    const mod = await loadPocketAudioCoreModule();
    const project = await pocketAudioCore.loadProject(exportProject());
    const timeline = mod.buildPocketAudioTimeline ? mod.buildPocketAudioTimeline(project, timelineOptions) : pocketAudioCore.timeline;
    setWavProgress(`Rendering ${durationLabel} (${scopeLabel}) with Pocket Audio Core from ${timeline?.events?.length || eventCount} events.`);
    pocketAudioCoreStatus = `WAV render ${scopeLabel}: ${timeline?.events?.length || eventCount} timeline events`;
    updatePocketAudioCoreStatusUi();
    const blob = await pocketAudioCore.renderWav({sampleRate:44100, ...timelineOptions});
    setWavOutput(blob);
    setWavProgress(`WAV ready via Pocket Audio Core (${scopeLabel}): ${durationLabel}, ${Math.round(blob.size / 1024 / 1024 * 10) / 10} MB.`);
    setStatus(`WAV ready via Pocket Audio Core (${scopeLabel}). Preview, open, or download it from Settings.`);
    return true;
  }catch(e){
    setWavProgress(`Pocket Audio Core render unavailable for ${scopeLabel}; falling back to the Chordsmith WAV renderer.`);
    return false;
  }
}

function preflightWavExport(durationSeconds, sampleRate, channels = 2){
  const api = globalThis.PocketChordsmithWavExportPreflight;
  if(!api) throw new Error("WAV safety preflight did not load. Reload Pocket Chordsmith before exporting.");
  const budget = api.chooseWavExportBudget({
    userAgent: navigator.userAgent,
    deviceMemory: navigator.deviceMemory,
  });
  return api.estimateWavExportResources({
    durationSeconds,
    sampleRate,
    channels,
    maximumWorkingBytes: budget.maximumWorkingBytes,
    maximumDurationSeconds: budget.maximumDurationSeconds,
  });
}


async function exportWavFile(){
  const token = ++state.wavExportToken;
  state.wavExporting = true;
  updateWavExportUi();
  setWavProgress("Preparing WAV render...");
  try{
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if(!OfflineCtx){
      setStatus("WAV export not supported in this browser");
      setWavProgress("");
      return;
    }

    clearWavOutput();
    const events = buildSequenceEvents();
    if(!events.length){
      setStatus("Nothing to export");
      setWavProgress("");
      return;
    }

    const maxEventEnd = events.reduce((m, ev) => {
      const tail = ev.type === "chord" ? 0.6 : ev.type === "melody" ? 0.5 : ev.type === "guitar" ? 0.45 : 0.25;
      return Math.max(m, (ev.time || 0) + (ev.dur || 0) + tail);
    }, 0);
    const totalDuration = Math.max(2.0, maxEventEnd + 1.0);
    const sampleRate = 44100;
    const durationLabel = `${Math.ceil(totalDuration)}s audio`;
    const scopeLabel = exportScopeLabel();
    const resourceEstimate = preflightWavExport(totalDuration, sampleRate, 2);
    if(!resourceEstimate.ok){
      const message = globalThis.PocketChordsmithWavExportPreflight.formatWavExportPreflightFailure(resourceEstimate);
      setWavProgress(message);
      setStatus(`WAV export stopped safely. ${message}`);
      return;
    }
    const workingMemoryMb = Math.ceil(resourceEstimate.estimatedWorkingBytes / 1024 / 1024);
    setWavProgress(`Rendering ${durationLabel} (${scopeLabel}) from ${events.length} events. Keep this tab open.`);
    setStatus(`Rendering WAV (${scopeLabel}, ${durationLabel}, up to ${workingMemoryMb} MB working memory)...`);
    await new Promise(resolve => setTimeout(resolve, 50));
    if(token !== state.wavExportToken) return;
    if(await renderCoreWavForCurrentProject(durationLabel, events.length)) return;

    const ctx = new OfflineCtx(2, Math.ceil(totalDuration * sampleRate), sampleRate);

    const chordG = ctx.createGain();
    const beatG = ctx.createGain();
    const leadG = ctx.createGain();
    const guitarG = ctx.createGain();
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();

    chordG.gain.value = parseFloat(els.chordVol.value) * 0.78;
    beatG.gain.value = parseFloat(els.beatVol.value) * 0.68;
    leadG.gain.value = (els.leadVol ? parseFloat(els.leadVol.value) : 0.65) * 0.82;
    guitarG.gain.value = (state.guitarVolume ?? 0.66) * 0.78;
    master.gain.value = 0.92;

    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.10;

    chordG.connect(master);
    beatG.connect(master);
    leadG.connect(master);
    guitarG.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    makeOfflineLofiTexture(ctx, master, totalDuration);

    events.forEach(ev => {
      if(ev.type === "chord"){
        chordNotes(ev.chord).forEach((note, idx) => {
          const cfg = chordInstrumentConfig(state.chordInstrument);
          let noteStart = safeAudioTime(ev.time);
          if(state.chordPlayMode !== "block"){
            const gap = (state.chordPlayMode.startsWith("strum") ? 0.045 : 0.12) * cfg.spreadMul;
            noteStart += idx * gap;
          } else {
            noteStart += idx * 0.01 * cfg.spreadMul;
          }
        const baseDur = Math.min(ev.dur * cfg.durMul, state.chordInstrument === "warm_pad" ? 1.8 : 1.2);
          const dur = state.chordPlayMode.startsWith("arp") ? Math.min(0.18, baseDur * 0.35) : baseDur;
          const peak = humanizePeak(cfg.peak * 0.72, ev.step ?? 0, 1);
          makeOfflineChordTone(ctx, chordG, midiToFreq(note), noteStart, dur, idx === 0 ? cfg.rootWave : cfg.wave, peak, cfg.filter, cfg.freq, cfg);
          if(cfg.shimmer && idx > 0) makeOfflineChordTone(ctx, chordG, midiToFreq(note + 12), noteStart + 0.014, Math.min(0.16, dur * 0.42), "sine", peak * 0.12, "lowpass", 5200, {attack:0.002, decay:0.12, sustain:0.06, release:0.35, layers:[{wave:"sine", level:1}]});
        });
      } else if(ev.type === "bass"){
        const cfg = bassToneConfig();
        const art = safeChoice(ev.articulation,BASS_ARTICULATIONS,"finger");
        const funk = sanitizeFunkParameters(state.funkParameters);
        const bassPeak = humanizePeak(ev.accent ? 0.15 : 0.125, ev.step ?? 0, 4) * (art === "slap" ? 1 + funk.slapAmount * 0.22 : art === "pop" ? 1 + funk.popBrightness * 0.22 : art === "mute" ? 0.72 - funk.muteDepth * 0.18 : 1);
        const artDur = ev.dur * (art === "mute" ? 0.34 : art === "slap" ? 0.72 : art === "pop" ? 0.62 : 1);
        if(ev.slideMidi !== null && ev.slideMidi !== undefined && ev.slideOffset !== null && ev.slideOffset !== undefined){
          makeOfflineToneSlide(ctx, beatG, midiToFreq(ev.midi), midiToFreq(ev.slideMidi), safeAudioTime(ev.time), artDur, ev.slideOffset, cfg.mainWave, bassPeak * cfg.mainPeak, "lowpass", ev.accent ? cfg.cutoff * 1.18 : cfg.cutoff);
          makeOfflineToneSlide(ctx, beatG, midiToFreq(ev.midi - 12), midiToFreq(ev.slideMidi - 12), safeAudioTime(ev.time), Math.min(0.14, artDur * 0.72), Math.min(ev.slideOffset, artDur * 0.7), cfg.subWave, bassPeak * cfg.subPeak, "lowpass", cfg.subCutoff);
        } else {
          makeOfflineTone(ctx, beatG, midiToFreq(ev.midi) * (art === "pop" ? 2 : 1), safeAudioTime(ev.time), artDur, cfg.mainWave, bassPeak * cfg.mainPeak, "lowpass", (ev.accent ? cfg.cutoff * 1.18 : cfg.cutoff) * (art === "pop" ? 1.7 : art === "slap" ? 1.35 : art === "mute" ? 0.62 : 1));
          makeOfflineTone(ctx, beatG, midiToFreq(ev.midi - 12), ev.time, Math.min(0.14, artDur * 0.72), cfg.subWave, bassPeak * cfg.subPeak, "lowpass", cfg.subCutoff);
          if(art === "slap" || art === "pop") makeOfflineTone(ctx,beatG,midiToFreq(ev.midi + (art === "pop" ? 24 : 12)),ev.time,Math.min(0.045,artDur),"square",0.018 + (art === "pop" ? funk.popBrightness : funk.slapAmount) * 0.018,"highpass",1900);
        }
      } else if(ev.type === "melody"){
        makeOfflineLeadPhrase(
          ctx,
          leadG,
          ev.midi,
          ev.time,
          ev.dur,
          ev.instrument || "pulse",
          ev.pan || 0,
          ev.slideMidi ?? null,
          ev.slideOffset ?? null
        );
      } else if(ev.type === "guitar"){
        renderGuitarOffline(ctx, guitarG, ev);
      } else if(ev.type === "kick"){
        makeOfflineKick(ctx, beatG, safeAudioTime(ev.time));
        if(ev.accent) makeOfflineKick(ctx, beatG, safeAudioTime(ev.time) + 0.001);
      } else if(ev.type === "snare"){
        makeOfflineSnare(ctx, beatG, safeAudioTime(ev.time),ev.velocityScale ?? 1);
        if(ev.accent) makeOfflineSnare(ctx, beatG, safeAudioTime(ev.time) + 0.001,ev.velocityScale ?? 1);
      } else if(ev.type === "hat"){
        makeOfflineHat(ctx, beatG, safeAudioTime(ev.time), !!ev.accent, ev.accent ? 0.10 : 0.045);
      } else if(ev.type === "drum"){
        makeOfflineExpandedDrum(ctx,beatG,ev.lane,safeAudioTime(ev.time),!!ev.accent,ev.velocityScale ?? 1);
      }
    });

    const rendered = await ctx.startRendering();
    if(token !== state.wavExportToken) return;
    setWavProgress("Encoding WAV file...");
    await new Promise(resolve => setTimeout(resolve, 20));
    if(token !== state.wavExportToken) return;
    const blob = writeWavFromBuffer(rendered);
    setWavOutput(blob);
    setWavProgress(`WAV ready via Chordsmith renderer (${scopeLabel}): ${durationLabel}, ${Math.round(blob.size / 1024 / 1024 * 10) / 10} MB.`);
    setStatus(`WAV ready via Chordsmith renderer (${scopeLabel}). Preview, open, or download it from Settings.`);
  }catch(e){
    console.error(e);
    setWavProgress("");
    setStatus(`WAV export failed${e && e.message ? ": " + e.message : ""}`);
  }finally{
    if(token === state.wavExportToken){
      state.wavExporting = false;
      updateWavExportUi();
    }
  }
}
