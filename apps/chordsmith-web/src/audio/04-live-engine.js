function createReverbImpulse(ctx, seconds=1.6, decay=2.4){
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for(let ch = 0; ch < 2; ch++){
    const data = impulse.getChannelData(ch);
    for(let i = 0; i < length; i++){
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}
function makeNoiseBuffer(ctx, seconds=0.06, fade=false){
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for(let i = 0; i < len; i++){
    const amp = fade ? (1 - (i / len)) : 1;
    data[i] = (Math.random() * 2 - 1) * amp;
  }
  return buf;
}
function liveNoiseBuffer(ctx, key, seconds=0.06, fade=false, poolSize=8){
  if(ctx !== audioCtx) return makeNoiseBuffer(ctx, seconds, fade);
  const cacheKey = `${key}:${ctx.sampleRate}:${seconds}:${fade ? 1 : 0}`;
  let entry = liveNoiseBuffers.get(cacheKey);
  if(!entry){
    entry = {
      index:0,
      buffers:Array.from({length:poolSize}, () => makeNoiseBuffer(ctx, seconds, fade))
    };
    liveNoiseBuffers.set(cacheKey, entry);
  }
  const buffer = entry.buffers[entry.index % entry.buffers.length];
  entry.index++;
  return buffer;
}
function prewarmLiveNoiseBuffers(){
  if(!audioCtx) return;
  liveNoiseBuffer(audioCtx, "snare", 0.12, false);
  liveNoiseBuffer(audioCtx, "hat_closed", 0.05, false);
  liveNoiseBuffer(audioCtx, "hat_open", 0.16, false);
  liveNoiseBuffer(audioCtx, "guitar_scratch_0.06", 0.06, true);
}
function updateFx(){
  if(!audioCtx) return;
  const readFx = (el, fallback=0) => {
    const raw = el ? el.value : undefined;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const delayAmt = readFx(els.fxDelay, state.fxDelay ?? 0);
  const chorusAmt = readFx(els.fxChorus, state.fxChorus ?? 0);
  const flangerAmt = readFx(els.fxFlanger, state.fxFlanger ?? 0);
  const reverbAmt = readFx(els.fxReverb, state.fxReverb ?? 0);
  const fxMixAmt = readFx(els.fxMix, state.fxMix ?? 0.65);

  state.fxDelay = delayAmt;
  state.fxChorus = chorusAmt;
  state.fxFlanger = flangerAmt;
  state.fxReverb = reverbAmt;
  state.fxMix = fxMixAmt;

  if(synthDryGain){
    synthDryGain.gain.setTargetAtTime(Math.max(0.52, 1.0 - (fxMixAmt * 0.48)), audioCtx.currentTime, 0.02);
  }
  if(fxWetMasterGain){
    fxWetMasterGain.gain.setTargetAtTime(fxMixAmt * 1.45, audioCtx.currentTime, 0.02);
  }
  if(fxToneFilter){
    const brightness = (chorusAmt * 0.9) + (flangerAmt * 1.1) + (reverbAmt * 0.35) - (delayAmt * 0.10);
    fxToneFilter.gain.setTargetAtTime(Math.max(-2, Math.min(7, brightness * 6.0)), audioCtx.currentTime, 0.03);
  }

  if(delayNode){
    delayNode.delayTime.setTargetAtTime(0.10 + delayAmt * 0.42, audioCtx.currentTime, 0.02);
    delayFeedbackGain.gain.setTargetAtTime(0.05 + delayAmt * 0.72, audioCtx.currentTime, 0.02);
    delayWetGain.gain.setTargetAtTime(delayAmt * 0.95, audioCtx.currentTime, 0.02);
  }
  if(chorusDelay){
    chorusWetGain.gain.setTargetAtTime(chorusAmt * 0.95, audioCtx.currentTime, 0.02);
    chorusDepthGain.gain.setTargetAtTime(0.0014 + chorusAmt * 0.030, audioCtx.currentTime, 0.02);
    chorusLfo.frequency.setTargetAtTime(0.25 + chorusAmt * 1.9, audioCtx.currentTime, 0.02);
  }
  if(flangerDelay){
    flangerWetGain.gain.setTargetAtTime(flangerAmt * 0.85, audioCtx.currentTime, 0.02);
    flangerFeedbackGain.gain.setTargetAtTime(0.08 + flangerAmt * 0.82, audioCtx.currentTime, 0.02);
    flangerDepthGain.gain.setTargetAtTime(0.0007 + flangerAmt * 0.0062, audioCtx.currentTime, 0.02);
    flangerLfo.frequency.setTargetAtTime(0.10 + flangerAmt * 1.10, audioCtx.currentTime, 0.02);
  }
  if(reverbWetGain){
    reverbWetGain.gain.setTargetAtTime(reverbAmt * 1.05, audioCtx.currentTime, 0.02);
  }
}
async function ensureAudio(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();

    masterGain = audioCtx.createGain();
    chordGain = audioCtx.createGain();
    beatGain = audioCtx.createGain();
    leadGain = audioCtx.createGain();
    guitarGain = audioCtx.createGain();
    metroGain = audioCtx.createGain();
    synthBusGain = audioCtx.createGain();

    chordGain.connect(synthBusGain);
    leadGain.connect(synthBusGain);

    synthDryGain = audioCtx.createGain();
    fxWetMasterGain = audioCtx.createGain();
    fxToneFilter = audioCtx.createBiquadFilter();
    masterLimiter = audioCtx.createDynamicsCompressor();
    fxToneFilter.type = "highshelf";
    fxToneFilter.frequency.value = 1800;
    fxToneFilter.gain.value = 0;
    masterLimiter.threshold.value = -16;
    masterLimiter.knee.value = 18;
    masterLimiter.ratio.value = 3;
    masterLimiter.attack.value = 0.003;
    masterLimiter.release.value = 0.10;

    synthBusGain.connect(synthDryGain);
    synthDryGain.connect(fxToneFilter);

    beatGain.connect(masterGain);
    guitarGain.connect(masterGain);
    metroGain.connect(masterGain);

    delayNode = audioCtx.createDelay(1.0);
    delayFeedbackGain = audioCtx.createGain();
    delayWetGain = audioCtx.createGain();
    synthBusGain.connect(delayNode);
    delayNode.connect(delayFeedbackGain);
    delayFeedbackGain.connect(delayNode);
    delayNode.connect(delayWetGain);
    delayWetGain.connect(fxWetMasterGain);

    chorusDelay = audioCtx.createDelay(0.08);
    chorusWetGain = audioCtx.createGain();
    chorusLfo = audioCtx.createOscillator();
    chorusDepthGain = audioCtx.createGain();
    chorusDelay.delayTime.value = 0.016;
    chorusLfo.type = "sine";
    chorusLfo.connect(chorusDepthGain);
    chorusDepthGain.connect(chorusDelay.delayTime);
    synthBusGain.connect(chorusDelay);
    chorusDelay.connect(chorusWetGain);
    chorusWetGain.connect(fxWetMasterGain);
    chorusLfo.start();

    flangerDelay = audioCtx.createDelay(0.02);
    flangerWetGain = audioCtx.createGain();
    flangerFeedbackGain = audioCtx.createGain();
    flangerLfo = audioCtx.createOscillator();
    flangerDepthGain = audioCtx.createGain();
    flangerDelay.delayTime.value = 0.003;
    flangerLfo.type = "sine";
    flangerLfo.connect(flangerDepthGain);
    flangerDepthGain.connect(flangerDelay.delayTime);
    synthBusGain.connect(flangerDelay);
    flangerDelay.connect(flangerFeedbackGain);
    flangerFeedbackGain.connect(flangerDelay);
    flangerDelay.connect(flangerWetGain);
    flangerWetGain.connect(fxWetMasterGain);
    flangerLfo.start();

    reverbConvolver = audioCtx.createConvolver();
    reverbConvolver.buffer = createReverbImpulse(audioCtx, 1.6, 2.4);
    reverbWetGain = audioCtx.createGain();
    synthBusGain.connect(reverbConvolver);
    reverbConvolver.connect(reverbWetGain);
    reverbWetGain.connect(fxWetMasterGain);

    fxWetMasterGain.connect(fxToneFilter);
    fxToneFilter.connect(masterGain);
    masterGain.connect(masterLimiter);
    masterLimiter.connect(audioCtx.destination);
    applyVolumes();
    updateFx();
    prewarmLiveNoiseBuffers();
  }
  if(audioCtx.state === "suspended") await audioCtx.resume();
}
function applyVolumes(){
  if(!audioCtx) return;
  masterGain.gain.value = parseFloat(els.masterVol.value);
  chordGain.gain.value = parseFloat(els.chordVol.value);
  beatGain.gain.value = parseFloat(els.beatVol.value);
  leadGain.gain.value = parseFloat(els.leadVol.value);
  if(guitarGain) guitarGain.gain.value = state.guitarVolume ?? 0.66;
  updateFx();
}
function adsr(g, t, a, d, s, r, peak=1){
  g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(peak,t+a); g.gain.linearRampToValueAtTime(s*peak,t+a+d);
  g.gain.setValueAtTime(s*peak,t+r); g.gain.exponentialRampToValueAtTime(0.0001,t+r+0.2);
}
function connectWithPan(ctx, source, destination, pan=0){
  const safePan = clamp(asNumber(pan, 0), -1, 1);
  if(ctx.createStereoPanner){
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(safePan, ctx.currentTime || 0);
    source.connect(panner);
    panner.connect(destination);
    return panner;
  }
  source.connect(destination);
  return destination;
}
function chipVoiceRecipe(freq,type,filterFreq,peak,pan,seed=0,texture=state.chipTexture){
  const chip = sanitizeChipTexture(texture,state.chipPreset);
  const quantum = Math.max(0.5,1 + chip.bitDepth * 7);
  const nextFreq = Math.round((freq * (1 + ((featureSeed(seed,41)-0.5) * chip.pitchDrift * 0.018))) / quantum) * quantum;
  return {freq:nextFreq,type:type === "square" && chip.pulseWidth > 0.62 ? "sawtooth" : type === "square" && chip.pulseWidth < 0.38 ? "triangle" : type,filterFreq:Math.min(filterFreq,7200-chip.sampleRateCrush*5600),peak:peak*(0.88+chip.saturation*0.22),pan:clamp(pan+(featureSeed(Math.round(freq),42)-0.5)*chip.stereoSpread,-1,1),quantum};
}
function metalGuitarRecipe(base,texture=state.metalTexture){
  const cfg = {...base};
  const t = sanitizeMetalTexture(texture,state.metalPreset);
  cfg.drive *= 0.55+t.drive*1.25; cfg.mute *= 1.2-t.palmMute*0.78; cfg.highpass *= 0.72+t.lowTightness*0.72; cfg.body *= 1.3-t.lowTightness*0.55; cfg.lowpass *= 0.72+t.presence*0.62; cfg.mid *= 0.68+t.presence*0.78; cfg.spread *= 0.42+t.roomSize*2.2; cfg.sustain *= 0.72+t.roomSize*0.85; cfg.peak *= 0.84+t.pickAttack*0.24;
  return cfg;
}
function buildSoundProfileParameterTrace(profileId,parameters={}){
  const id=normalizeSoundProfileId(profileId);
  if(id===CHIP_AUDIO_PROFILE_ID) return chipVoiceRecipe(440,"square",5000,0.2,0,123,parameters);
  if(id===HEAVY_METAL_AUDIO_PROFILE_ID) return metalGuitarRecipe(guitarToneConfig("tight_metal"),parameters);
  if(id===FUNK_AUDIO_PROFILE_ID){ const p=sanitizeFunkParameters(parameters); return {bassTransient:0.018+p.slapAmount*0.018,popTransient:0.018+p.popBrightness*0.018,muteDurationScale:0.5-p.muteDepth*0.22,pocketOffset:(p.pocket-0.5)*0.03,ghostVelocity:Math.round(38+p.ghostNotes*42),stabDurationScale:1-p.stabTightness*0.68}; }
  return {profile:id};
}
function funkPocketOffset(step){
  if(normalizeSoundProfileId(state.audioProfile)!==FUNK_AUDIO_PROFILE_ID || step%2===0) return 0;
  return (sanitizeFunkParameters(state.funkParameters).pocket-0.5)*0.03;
}
function funkGhostScale(lane,level){
  if(normalizeSoundProfileId(state.audioProfile)!==FUNK_AUDIO_PROFILE_ID || !["snare","rim","clap"].includes(lane) || level>1) return 1;
  return 0.46+sanitizeFunkParameters(state.funkParameters).ghostNotes*0.5;
}
function funkStabDurationScale(){
  if(normalizeSoundProfileId(state.audioProfile)!==FUNK_AUDIO_PROFILE_ID) return 1;
  return 1-sanitizeFunkParameters(state.funkParameters).stabTightness*0.68;
}
function playTone(freq, t, dur, type, dest, peak=0.4, filterType=null, filterFreq=1400, pan=0){
  const chip = isChipActive() && state.chipTexture?.enabled ? sanitizeChipTexture(state.chipTexture,state.chipPreset) : null;
  if(chip){
    const recipe=chipVoiceRecipe(freq,type,filterFreq,peak,pan,Math.round(t*1000),chip);
    freq=recipe.freq; type=recipe.type; filterFreq=recipe.filterFreq; peak=recipe.peak; pan=recipe.pan;
    filterType = filterType || "lowpass";
  }
  const osc = audioCtx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq,t);
  const gain = audioCtx.createGain();
  let node = osc;
  if(filterType){
    const f = audioCtx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(filterFreq,t);
    node.connect(f); node = f;
  }
  node.connect(gain); connectWithPan(audioCtx, gain, dest, pan);
  adsr(gain, t, 0.01, 0.06, 0.7, dur, peak);
  osc.start(t); osc.stop(t+dur+0.25);
  const voice = {oscs:[osc], gain, stopAt:t + dur + 0.25};
  if(dest === leadGain) registerLiveVoice(activeLeadVoices, voice, LIVE_LEAD_VOICE_LIMIT, t, 0.018);
  return voice;
}
function pruneLiveVoices(list, now=audioCtx?.currentTime || 0){
  for(let i = list.length - 1; i >= 0; i--){
    const voice = list[i];
    if(!voice || voice.stopAt <= now) list.splice(i, 1);
  }
}
function releaseLiveVoice(voice, at=audioCtx?.currentTime || 0, fade=0.025){
  if(!voice) return;
  const safeAt = Math.max(0, at);
  const gains = [voice.gain].concat(Array.isArray(voice.gains) ? voice.gains : []).filter(Boolean);
  gains.forEach(gain => {
    try{
      gain.gain.cancelScheduledValues(safeAt);
      gain.gain.setTargetAtTime(0.0001, safeAt, Math.max(0.008, fade));
    }catch(e){}
  });
  const sources = []
    .concat(Array.isArray(voice.oscs) ? voice.oscs : [])
    .concat(Array.isArray(voice.sources) ? voice.sources : []);
  sources.forEach(source => {
    try{ source.stop(safeAt + Math.max(0.025, fade * 3)); }catch(e){}
  });
  voice.stopAt = safeAt;
}
function registerLiveVoice(list, voice, limit, at=audioCtx?.currentTime || 0, fade=0.025){
  pruneLiveVoices(list);
  while(list.length >= limit){
    releaseLiveVoice(list.shift(), at, fade);
  }
  list.push(voice);
  return voice;
}
function silenceLiveVoices(list, at=audioCtx?.currentTime || 0, fade=0.025){
  list.splice(0).forEach(voice => releaseLiveVoice(voice, at, fade));
}
function pruneChordVoices(now=audioCtx?.currentTime || 0){
  for(let i = activeChordVoices.length - 1; i >= 0; i--){
    const voice = activeChordVoices[i];
    if(!voice || voice.stopAt <= now) activeChordVoices.splice(i, 1);
  }
}
function releaseChordVoice(voice, at=audioCtx?.currentTime || 0, fade=0.035){
  if(!voice || !voice.gain) return;
  const oscs = Array.isArray(voice.oscs) ? voice.oscs : (voice.osc ? [voice.osc] : []);
  const safeAt = Math.max(0, at);
  try{
    voice.gain.gain.cancelScheduledValues(safeAt);
    voice.gain.gain.setTargetAtTime(0.0001, safeAt, Math.max(0.01, fade));
  }catch(e){}
  oscs.forEach(osc => {
    try{ osc.stop(safeAt + Math.max(0.03, fade * 3)); }catch(e){}
  });
  voice.stopAt = safeAt;
}
function silenceChordVoices(at=audioCtx?.currentTime || 0, fade=0.035){
  activeChordVoices.splice(0).forEach(voice => releaseChordVoice(voice, at, fade));
}
function chordEnvelope(gain, t, dur, peak, cfg={}){
  const attack = Math.max(0.001, cfg.attack ?? 0.01);
  const decay = Math.max(0.001, cfg.decay ?? 0.06);
  const sustain = clamp(cfg.sustain ?? 0.7, 0.001, 1);
  const release = Math.max(0.025, cfg.release ?? 0.2);
  const endAt = t + Math.max(0.02, dur);
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak * sustain), t + attack + decay);
  gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), endAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt + release);
  return endAt + release + 0.03;
}
function playChordTone(freq, t, dur, type, peak, filterType, filterFreq, cfg={}, pan=0){
  pruneChordVoices();
  while(activeChordVoices.length >= LIVE_CHORD_VOICE_LIMIT){
    releaseChordVoice(activeChordVoices.shift(), t, 0.02);
  }
  const gain = audioCtx.createGain();
  let output = gain;
  if(filterType){
    const f = audioCtx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq, t);
    f.Q.setValueAtTime(cfg.filterQ ?? 0.7, t);
    if(cfg.filterSweep){
      f.frequency.linearRampToValueAtTime(cfg.filterSweep, t + Math.max(0.04, Math.min(0.22, dur * 0.5)));
    }
    gain.connect(f);
    output = f;
  }
  connectWithPan(audioCtx, output, chordGain, pan);
  const stopAt = chordEnvelope(gain, t, dur, peak, cfg);
  const oscs = [];
  const layers = cfg.layers || [{wave:type, freqMul:1, detune:cfg.detune ?? 0, level:1}];
  layers.forEach(layer => {
    const osc = audioCtx.createOscillator();
    const layerGain = audioCtx.createGain();
    osc.type = layer.wave || type;
    osc.frequency.setValueAtTime(freq * (layer.freqMul || 1), t);
    osc.detune.setValueAtTime(layer.detune ?? 0, t);
    layerGain.gain.setValueAtTime(layer.level ?? 1, t);
    osc.connect(layerGain);
    layerGain.connect(gain);
    osc.start(t);
    osc.stop(stopAt);
    oscs.push(osc);
  });
  activeChordVoices.push({oscs, gain, stopAt});
}
function lofiDrumKit(){
  const kit = state.drumKit || "classic";
  const resolver = pocketAudioCoreModule?.resolvePocketDrumKitId;
  if(typeof resolver === "function") return resolver(kit, state.audioProfile, state.metalPreset || state.chipPreset || state.lofiPreset);
  return FALLBACK_DRUM_KIT_CONFIGS[kit] ? kit : (isChipActive() ? "chip_noise_kit" : isLofiActive() ? "lofi_dusty" : "classic");
}
function pocketDrumKitConfig(kit){
  const shared = pocketAudioCoreModule?.POCKET_DRUM_KIT_CONFIGS;
  return (shared && shared[kit]) || FALLBACK_DRUM_KIT_CONFIGS[kit] || FALLBACK_DRUM_KIT_CONFIGS.classic;
}
function playKick(t, peak=0.95){
  const kit = lofiDrumKit();
  const cfg = pocketDrumKitConfig(kit).kick;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  let node = o;
  o.type = "sine";
  o.frequency.setValueAtTime(cfg.startFreq, t);
  o.frequency.exponentialRampToValueAtTime(cfg.endFreq, t + cfg.sweepSeconds);
  if(cfg.filterFreq){
    const f = audioCtx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(cfg.filterFreq, t);
    o.connect(f); node = f;
  }
  g.gain.setValueAtTime(Math.max(cfg.gainFloor, peak * cfg.gainScale), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + cfg.rampSeconds);
  node.connect(g); g.connect(beatGain); o.start(t); o.stop(t + cfg.length);
}
function playSnare(t, peak=0.5){
  const kit = lofiDrumKit();
  const cfg = pocketDrumKitConfig(kit).snare;
  const n = audioCtx.createBufferSource(); n.buffer = liveNoiseBuffer(audioCtx, kit === "classic" ? "snare" : `snare_${kit}`, cfg.noiseSeconds, false);
  const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = cfg.highpass;
  const g = audioCtx.createGain();
  let node = hp;
  if(cfg.lowpass){
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cfg.lowpass;
    hp.connect(lp); node = lp;
  }
  g.gain.setValueAtTime(Math.max(cfg.gainFloor, peak * cfg.gainScale), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + cfg.rampSeconds);
  n.connect(hp); node.connect(g); g.connect(beatGain);
  n.start(t); n.stop(t + cfg.length);
  if(cfg.bodyFreq){
    const body = audioCtx.createOscillator(), bodyGain = audioCtx.createGain();
    body.type = "triangle";
    body.frequency.setValueAtTime(cfg.bodyFreq, t);
    bodyGain.gain.setValueAtTime(cfg.bodyGain, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + cfg.bodyRampSeconds);
    body.connect(bodyGain); bodyGain.connect(beatGain); body.start(t); body.stop(t + cfg.bodyLength);
  }
}
function playHat(t, peak=0.16, open=false){
  const kit = lofiDrumKit();
  const cfg = pocketDrumKitConfig(kit).hat;
  const hatLen = open ? cfg.openLength : cfg.closedLength;
  const n = audioCtx.createBufferSource(); n.buffer = liveNoiseBuffer(audioCtx, kit === "classic" ? (open ? "hat_open" : "hat_closed") : `${open ? "hat_open" : "hat_closed"}_${kit}`, hatLen, false);
  const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = open ? cfg.highpassOpen : cfg.highpassClosed;
  const g = audioCtx.createGain();
  let node = hp;
  if(cfg.lowpass){
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cfg.lowpass;
    hp.connect(lp); node = lp;
  }
  g.gain.setValueAtTime(Math.max(open ? cfg.gainFloorOpen : cfg.gainFloorClosed, peak * (open ? cfg.gainScaleOpen : cfg.gainScaleClosed)), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (open ? cfg.rampSecondsOpen : cfg.rampSecondsClosed));
  n.connect(hp); node.connect(g); g.connect(beatGain); n.start(t); n.stop(t + hatLen);
}
function playLofiTexture(t, step=0){
  if(!isLofiActive() || !state.lofiTexture?.enabled || !audioCtx) return;
  const hiss = lofiAmount("tapeHiss", DEFAULT_LOFI_TEXTURE.tapeHiss);
  const crackle = lofiAmount("vinylCrackle", DEFAULT_LOFI_TEXTURE.vinylCrackle);
  const age = lofiAmount("lowPassAge", DEFAULT_LOFI_TEXTURE.lowPassAge);
  if(hiss > 0.005){
    const n = audioCtx.createBufferSource();
    n.buffer = liveNoiseBuffer(audioCtx, `lofi_hiss_${Math.round(hiss * 100)}_${Math.round(age * 100)}`, 0.22, false);
    const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 520;
    const lp = audioCtx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3600 - age * 1800;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.0055 * hiss, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(beatGain);
    n.start(t); n.stop(t + 0.22);
  }
  if(crackle > 0.01 && featureSeed(step, 43) < crackle * 0.7){
    const n = audioCtx.createBufferSource();
    n.buffer = liveNoiseBuffer(audioCtx, `lofi_crackle_${step % 19}`, 0.026, false);
    const bp = audioCtx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1550 + featureSeed(step, 44) * 1300; bp.Q.value = 0.95;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.018 * crackle, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.024);
    n.connect(bp); bp.connect(g); g.connect(beatGain);
    n.start(t); n.stop(t + 0.028);
  }
}
function drumNoiseBuffer(lenSec=0.18){
  return liveNoiseBuffer(audioCtx, `drum_${lenSec}`, lenSec, false);
}
function playClap(t, peak=0.34){
  [0, 0.018, 0.036].forEach((off, i) => {
    const n = audioCtx.createBufferSource(); n.buffer = drumNoiseBuffer(0.09);
    const bp = audioCtx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(1450 + i*150, t + off); bp.Q.value = 0.85;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t + off);
    g.gain.linearRampToValueAtTime(Math.max(0.05, peak), t + off + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.075);
    n.connect(bp); bp.connect(g); g.connect(beatGain);
    n.start(t + off); n.stop(t + off + 0.09);
  });
}
function playTom(freq, t, peak=0.6){
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.58, t + 0.22);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.05, peak), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g); g.connect(beatGain); o.start(t); o.stop(t + 0.31);
}
function playCymbal(t, peak=0.42, ride=false){
  const dur = ride ? 0.42 : 0.9;
  const n = audioCtx.createBufferSource(); n.buffer = drumNoiseBuffer(dur);
  const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.setValueAtTime(ride ? 4300 : 3300, t);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.03, peak), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(hp); hp.connect(g); g.connect(beatGain);
  n.start(t); n.stop(t + dur);
  if(ride){
    const bell = audioCtx.createOscillator(), bg = audioCtx.createGain();
    bell.type = "triangle"; bell.frequency.setValueAtTime(980, t);
    bg.gain.setValueAtTime(0.07, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    bell.connect(bg); bg.connect(beatGain); bell.start(t); bell.stop(t + 0.24);
  }
}
function playDrumPad(id, velocity=1, time=null, animate=true){
  if(!audioCtx) return;
  const t = time ?? audioCtx.currentTime;
  const v = clamp(asNumber(velocity, 1), 0.15, 1.25);
  if(id === "kick") playKick(t, 0.95 * v);
  else if(id === "snare") playSnare(t, 0.56 * v);
  else if(id === "hat") playHat(t, 0.17 * v, false);
  else if(id === "openhat") playHat(t, 0.25 * v, true);
  else if(id === "clap") playClap(t, 0.34 * v);
  else if(id === "tomlow") playTom(118, t, 0.62 * v);
  else if(id === "tommid") playTom(158, t, 0.58 * v);
  else if(id === "tomhi") playTom(218, t, 0.52 * v);
  else if(id === "crash") playCymbal(t, 0.42 * v, false);
  else if(id === "ride") playCymbal(t, 0.24 * v, true);
  if(animate) animateDrumPad(id, v);
}
function playExpandedDrumLane(lane,time,velocity=1){
  const padId = DRUM_LANE_PAD_IDS[lane] || "clap";
  playDrumPad(padId,velocity,time,false);
}
function pointerVelocity(ev){
  if(typeof ev.pressure === "number" && ev.pressure > 0) return clamp(0.55 + ev.pressure * 0.7, 0.2, 1.15);
  return 1;
}
function animateDrumPad(id, velocity=1){
  if(!els.drumPadGrid) return;
  const pad = els.drumPadGrid.querySelector(`[data-drum-pad="${id}"]`);
  if(!pad) return;
  pad.classList.remove("hit");
  void pad.offsetWidth;
  pad.classList.add("hit");
  const level = pad.querySelector(".drum-level");
  if(level){
    level.style.transform = `scaleX(${clamp(velocity, 0.15, 1)})`;
    setTimeout(()=>{ level.style.transform = "scaleX(0)"; }, 130);
  }
  setTimeout(()=> pad.classList.remove("hit"), 145);
}
function bassToneConfig(tone=state.bassTone){
  if(tone === "funk_finger_pocket") return {mainWave:"triangle",subWave:"sine",mainPeak:0.82,subPeak:0.3,cutoff:720,subCutoff:155,attack:0.008};
  if(tone === "funk_slap_pop") return {mainWave:"sawtooth",subWave:"sine",mainPeak:0.7,subPeak:0.34,cutoff:1180,subCutoff:170,attack:0.002};
  if(tone === "funk_muted_thump") return {mainWave:"triangle",subWave:"sine",mainPeak:0.48,subPeak:0.28,cutoff:410,subCutoff:130,attack:0.002};
  if(tone === "funk_round_finger") return {mainWave:"triangle",subWave:"sine",mainPeak:0.76,subPeak:0.42,cutoff:520,subCutoff:145,attack:0.014};
  if(tone === "funk_synth_pocket") return {mainWave:"sawtooth",subWave:"triangle",mainPeak:0.68,subPeak:0.3,cutoff:920,subCutoff:180,attack:0.004};
  if(tone === "chip_triangle_bass") return {mainWave:"triangle", subWave:"sine", mainPeak:0.88, subPeak:0.25, cutoff:520, subCutoff:180, attack:0.004};
  if(tone === "chip_square_bass") return {mainWave:"square", subWave:"triangle", mainPeak:0.72, subPeak:0.22, cutoff:680, subCutoff:220, attack:0.002};
  if(tone === "modern_chip_sub") return {mainWave:"square", subWave:"sine", mainPeak:0.64, subPeak:0.62, cutoff:420, subCutoff:150, attack:0.006};
  if(tone === "bitcrush_bass") return {mainWave:"sawtooth", subWave:"square", mainPeak:0.58, subPeak:0.34, cutoff:560, subCutoff:210, attack:0.003};
  if(tone === "metal_pick_bass") return {mainWave:"triangle", subWave:"sine", mainPeak:0.64, subPeak:0.34, cutoff:430, subCutoff:125, attack:0.006};
  if(tone === "metal_sub_pick") return {mainWave:"triangle", subWave:"sine", mainPeak:0.58, subPeak:0.68, cutoff:360, subCutoff:110, attack:0.006};
  if(tone === "metal_grind_bass") return {mainWave:"sawtooth", subWave:"triangle", mainPeak:0.66, subPeak:0.32, cutoff:760, subCutoff:170, attack:0.002};
  if(tone === "warm_sub") return {mainWave:"sine", subWave:"sine", mainPeak:0.82, subPeak:0.55, cutoff:210, subCutoff:120, attack:0.018};
  if(tone === "soft_upright") return {mainWave:"triangle", subWave:"sine", mainPeak:0.72, subPeak:0.28, cutoff:360, subCutoff:140, attack:0.008};
  if(tone === "rounded_triangle_bass") return {mainWave:"triangle", subWave:"sine", mainPeak:0.84, subPeak:0.34, cutoff:300, subCutoff:130, attack:0.012};
  return {mainWave:"sawtooth", subWave:"sine", mainPeak:1, subPeak:0.42, cutoff:420, subCutoff:220, attack:0.01};
}
function playBass(rootMidi, t, dur=0.22, peak=0.34, accent=false, articulation="finger"){
  const cfg = bassToneConfig();
  const art = safeChoice(articulation,BASS_ARTICULATIONS,"finger");
  const funk = normalizeSoundProfileId(state.audioProfile) === FUNK_AUDIO_PROFILE_ID ? sanitizeFunkParameters(state.funkParameters) : DEFAULT_FUNK_PARAMETERS;
  const durMul = art === "mute" ? 0.34 : art === "slap" ? 0.72 : art === "pop" ? 0.62 : 1;
  const bassDur = (accent ? dur * 1.35 : dur) * durMul;
  const artPeak = art === "slap" ? 1 + funk.slapAmount * 0.22 : art === "pop" ? 1.18 + funk.popBrightness * 0.18 : art === "mute" ? 0.72 - funk.muteDepth * 0.18 : 1;
  const bassPeak = (accent ? peak * 1.12 : peak) * cfg.mainPeak * artPeak;
  const cutoff = (accent ? cfg.cutoff * 1.18 : cfg.cutoff) * (art === "pop" ? 1.7 : art === "slap" ? 1.35 : art === "mute" ? 0.62 : 1);
  playTone(midiToFreq(rootMidi) * (art === "pop" ? 2 : 1), t, bassDur, cfg.mainWave, beatGain, bassPeak, "lowpass", cutoff);
  playTone(midiToFreq(rootMidi-12), t, bassDur*0.82, cfg.subWave, beatGain, peak * cfg.subPeak, "lowpass", cfg.subCutoff);
  if(art === "slap" || art === "pop") playTone(midiToFreq(rootMidi + (art === "pop" ? 24 : 12)),t,Math.min(0.045,bassDur),"square",beatGain,0.018 + (art === "pop" ? funk.popBrightness : funk.slapAmount) * 0.018,"highpass",1900);
}
function playBassPhrase(rootMidi, t, dur=0.22, peak=0.34, accent=false, slideMidi=null, slideOffset=null, articulation="finger"){
  if(slideMidi === null || slideOffset === null){
    playBass(rootMidi, t, dur, peak, accent, articulation);
    return;
  }
  const cfg = bassToneConfig();
  const endAt = t + Math.max(0.08, dur) + 0.22;
  const slideAt = Math.max(t + 0.02, t + slideOffset);
  const makeVoice = (midi, target, wave, peakMul, cutoff) => {
    const osc = audioCtx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(midiToFreq(midi), t);
    osc.frequency.linearRampToValueAtTime(midiToFreq(target), Math.min(endAt - 0.03, slideAt + 0.09));
    const gain = audioCtx.createGain();
    const f = audioCtx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(cutoff, t);
    osc.connect(f); f.connect(gain); gain.connect(beatGain);
    adsr(gain, t, 0.01, 0.06, 0.7, Math.max(0.08, dur), peak * peakMul * (accent ? 1.18 : 1));
    osc.start(t); osc.stop(endAt);
  };
  makeVoice(rootMidi, slideMidi, cfg.mainWave, cfg.mainPeak, accent ? cfg.cutoff * 1.18 : cfg.cutoff);
  makeVoice(rootMidi-12, slideMidi-12, cfg.subWave, cfg.subPeak, cfg.subCutoff);
}
function playMetronome(t, accent=false){
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = "square"; o.frequency.value = accent ? 1400 : 1000;
  g.gain.setValueAtTime(accent ? 0.18 : 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.04);
  o.connect(g); g.connect(metroGain); o.start(t); o.stop(t+0.045);
}
function chordNotes(ch){
  const base = 48 + ch.root + (state.chordOctave * 12);
  let notes = ch.intervals.map((it, idx) => base + it + (idx===0?0:12));
  if(state.chordPlayMode === "strum_down" || state.chordPlayMode === "arp_down") notes = notes.reverse();
  return notes;
}
function chordInstrumentConfig(name){
  if(name === "funk_clav_stab") return {rootWave:"square",wave:"square",peak:0.15,filter:"bandpass",freq:2250,filterQ:0.9,attack:0.004,decay:0.08,sustain:0.08,release:0.1,durMul:0.34,spreadMul:0.4,shimmer:false,maxLiveDur:0.42,layers:[{wave:"square",level:0.8},{wave:"triangle",freqMul:2,level:0.18}]};
  if(name === "funk_rhodes_stab") return {rootWave:"triangle",wave:"triangle",peak:0.16,filter:"lowpass",freq:1900,filterQ:0.9,attack:0.008,decay:0.08,sustain:0.08,release:0.1,durMul:0.56,spreadMul:0.4,shimmer:false,maxLiveDur:0.42,layers:[{wave:"triangle",level:0.8},{wave:"triangle",freqMul:2,level:0.18}]};
  if(name === "funk_brass_stack") return {rootWave:"sawtooth",wave:"sawtooth",peak:0.13,filter:"bandpass",freq:1450,filterQ:0.9,attack:0.01,decay:0.08,sustain:0.08,release:0.1,durMul:0.42,spreadMul:0.4,shimmer:false,maxLiveDur:0.42,layers:[{wave:"sawtooth",level:0.8},{wave:"triangle",freqMul:2,level:0.18}]};
  if(name === "western_saloon_piano") return {rootWave:"triangle",wave:"triangle",peak:0.19,filter:"lowpass",freq:3500,filterQ:1,attack:0.002,decay:0.12,sustain:0.1,release:0.16,durMul:0.6,spreadMul:0.58,shimmer:false,maxLiveDur:0.68,layers:[{wave:"triangle",level:0.86,detune:-8},{wave:"triangle",level:0.6,detune:9}]};
  if(name === "western_mandolin_chop") return {rootWave:"triangle",wave:"square",peak:0.12,filter:"bandpass",freq:2400,filterQ:1.1,attack:0.002,decay:0.06,sustain:0.04,release:0.09,durMul:0.34,spreadMul:0.72,shimmer:false,maxLiveDur:0.28,layers:[{wave:"triangle",level:0.8},{wave:"square",freqMul:2,level:0.12}]};
  if(name === "metal_power_stack") return {
    rootWave:"sawtooth", wave:"sawtooth", peak:0.15, filter:"bandpass", freq:1180, filterQ:0.9, filterSweep:1950,
    attack:0.002, decay:0.08, sustain:0.58, release:0.16, durMul:0.72, spreadMul:0.3, shimmer:false, maxLiveDur:0.76,
    layers:[{wave:"sawtooth", level:0.78, detune:-5}, {wave:"square", level:0.42, detune:5}, {wave:"triangle", freqMul:0.5, level:0.2}]
  };
  if(name === "dark_organ_stack") return {
    rootWave:"triangle", wave:"sawtooth", peak:0.125, filter:"lowpass", freq:1050, filterQ:0.62, filterSweep:1500,
    attack:0.09, decay:0.24, sustain:0.82, release:0.62, durMul:1.35, spreadMul:0.18, shimmer:false, maxLiveDur:1.7,
    layers:[{wave:"triangle", level:0.72, detune:-8}, {wave:"sawtooth", level:0.36, detune:7}, {wave:"sine", freqMul:2, level:0.16}]
  };
  if(name === "chip_square_stack") return {
    rootWave:"square", wave:"square", peak:0.16, filter:"lowpass", freq:3600, filterQ:0.8,
    attack:0.002, decay:0.08, sustain:0.48, release:0.14, durMul:0.82, spreadMul:0.16, shimmer:false, maxLiveDur:0.68,
    layers:[{wave:"square", level:0.72}, {wave:"square", level:0.38, detune:6}, {wave:"triangle", freqMul:2, level:0.12}]
  };
  if(name === "chip_triangle_pad") return {
    rootWave:"triangle", wave:"triangle", peak:0.125, filter:"lowpass", freq:2200, filterQ:0.62,
    attack:0.055, decay:0.16, sustain:0.72, release:0.34, durMul:1.18, spreadMul:0.12, shimmer:false, maxLiveDur:1.2,
    layers:[{wave:"triangle", level:0.8}, {wave:"sine", freqMul:2, level:0.18}]
  };
  if(name === "chip_arp_keys") return {
    rootWave:"square", wave:"square", peak:0.135, filter:"bandpass", freq:1850, filterQ:1.1,
    attack:0.001, decay:0.055, sustain:0.16, release:0.12, durMul:0.46, spreadMul:0.72, shimmer:true, maxLiveDur:0.36,
    layers:[{wave:"square", level:0.74}, {wave:"triangle", freqMul:2, level:0.16, detune:-4}]
  };
  if(name === "modern_chip_poly") return {
    rootWave:"square", wave:"sawtooth", peak:0.142, filter:"lowpass", freq:2550, filterQ:0.78, filterSweep:3400,
    attack:0.008, decay:0.13, sustain:0.54, release:0.22, durMul:0.96, spreadMul:0.28, shimmer:true, maxLiveDur:0.92,
    layers:[{wave:"square", level:0.62, detune:-7}, {wave:"sawtooth", level:0.4, detune:8}, {wave:"triangle", freqMul:0.5, level:0.22}]
  };
  if(name === "piano") return {
    rootWave:"triangle", wave:"triangle", peak:0.23, filter:"lowpass", freq:3100, filterQ:0.9,
    attack:0.003, decay:0.18, sustain:0.18, release:0.16, durMul:0.72, spreadMul:0.45, shimmer:false, maxLiveDur:0.82,
    layers:[{wave:"triangle", level:1}, {wave:"sine", freqMul:2, level:0.18, detune:3}]
  };
  if(name === "saloon_piano") return {
    rootWave:"triangle", wave:"triangle", peak:0.205, filter:"lowpass", freq:3600, filterQ:1.0,
    attack:0.002, decay:0.13, sustain:0.12, release:0.18, durMul:0.62, spreadMul:0.58, shimmer:false, maxLiveDur:0.7,
    layers:[
      {wave:"triangle", level:0.88, detune:-8},
      {wave:"triangle", level:0.62, detune:9},
      {wave:"sine", freqMul:2, level:0.16, detune:5}
    ]
  };
  if(name === "harp") return {
    rootWave:"triangle", wave:"sine", peak:0.18, filter:"lowpass", freq:4600, filterQ:1.4,
    attack:0.002, decay:0.1, sustain:0.03, release:0.36, durMul:0.5, spreadMul:1.45, shimmer:true, maxLiveDur:0.58,
    layers:[{wave:"triangle", level:0.9}, {wave:"sine", freqMul:2, level:0.26, detune:7}]
  };
  if(name === "warm_pad") return {
    rootWave:"sine", wave:"triangle", peak:0.14, filter:"lowpass", freq:1200, filterQ:0.65, filterSweep:1700,
    attack:0.11, decay:0.24, sustain:0.82, release:0.62, durMul:1.35, spreadMul:0.25, shimmer:false, maxLiveDur:1.65,
    layers:[{wave:"sine", level:0.95, detune:-5}, {wave:"triangle", level:0.48, detune:6}]
  };
  if(name === "dusty_rhodes") return {
    rootWave:"triangle", wave:"triangle", peak:0.155, filter:"lowpass", freq:1550, filterQ:0.72,
    attack:0.012, decay:0.18, sustain:0.44, release:0.34, durMul:0.96, spreadMul:0.38, shimmer:false, maxLiveDur:1.05,
    layers:[{wave:"triangle", level:0.82, detune:-4}, {wave:"sine", freqMul:2.01, level:0.21, detune:5}, {wave:"sine", freqMul:3.01, level:0.045, detune:-8}]
  };
  if(name === "felt_piano") return {
    rootWave:"triangle", wave:"triangle", peak:0.145, filter:"lowpass", freq:1900, filterQ:0.82,
    attack:0.006, decay:0.24, sustain:0.22, release:0.42, durMul:0.82, spreadMul:0.34, shimmer:false, maxLiveDur:0.96,
    layers:[{wave:"triangle", level:0.78}, {wave:"sine", freqMul:2, level:0.16, detune:-3}]
  };
  if(name === "cassette_keys") return {
    rootWave:"triangle", wave:"triangle", peak:0.135, filter:"lowpass", freq:1320, filterQ:0.7,
    attack:0.018, decay:0.18, sustain:0.54, release:0.44, durMul:1.04, spreadMul:0.45, shimmer:false, maxLiveDur:1.22,
    layers:[{wave:"triangle", level:0.72, detune:-9}, {wave:"triangle", level:0.5, detune:10}, {wave:"sine", freqMul:2, level:0.12, detune:3}]
  };
  if(name === "muted_jazz_guitar") return {
    rootWave:"triangle", wave:"triangle", peak:0.132, filter:"bandpass", freq:1180, filterQ:0.95,
    attack:0.004, decay:0.09, sustain:0.08, release:0.16, durMul:0.5, spreadMul:0.72, shimmer:false, maxLiveDur:0.42,
    layers:[{wave:"triangle", level:0.8}, {wave:"square", level:0.11, detune:-5}]
  };
  if(name === "lofi_warm_pad") return {
    rootWave:"sine", wave:"triangle", peak:0.115, filter:"lowpass", freq:930, filterQ:0.58, filterSweep:1180,
    attack:0.18, decay:0.3, sustain:0.86, release:0.72, durMul:1.48, spreadMul:0.22, shimmer:false, maxLiveDur:1.85,
    layers:[{wave:"sine", level:0.92, detune:-7}, {wave:"triangle", level:0.42, detune:7}]
  };
  if(name === "glass") return {
    rootWave:"sine", wave:"sine", peak:0.16, filter:"bandpass", freq:1500, filterQ:1.15,
    attack:0.004, decay:0.2, sustain:0.1, release:0.44, durMul:0.9, spreadMul:0.85, shimmer:true, maxLiveDur:0.82,
    layers:[{wave:"sine", level:0.36}, {wave:"sine", freqMul:2.01, level:0.64}, {wave:"sine", freqMul:4.02, level:0.34}, {wave:"triangle", freqMul:6.01, level:0.12}]
  };
  return {
    rootWave:"triangle", wave:"sine", peak:0.24, filter:"lowpass", freq:1800, filterQ:0.8,
    attack:0.01, decay:0.06, sustain:0.7, release:0.2, durMul:1.0, spreadMul:1.0, shimmer:false, maxLiveDur:1.15,
    layers:[{wave:"triangle", level:0.82}, {wave:"sine", level:0.35}]
  };
}
function playChord(ch, t, dur){
  const notes = chordNotes(ch);
  const cfg = chordInstrumentConfig(state.chordInstrument);
  const chordDur = Math.max(0.08, Math.min(dur * cfg.durMul * funkStabDurationScale(), cfg.maxLiveDur || 1.1));
  if(state.chordPlayMode === "block"){
    notes.forEach((m, idx) => {
      const noteStart = t + idx * 0.01 * cfg.spreadMul;
      playChordTone(midiToFreq(m), noteStart, chordDur, idx===0 ? cfg.rootWave : cfg.wave, cfg.peak, cfg.filter, cfg.freq, cfg);
      if(cfg.shimmer && idx > 0 && state.chordPlayMode === "block") playChordTone(midiToFreq(m + 12), noteStart + 0.014, Math.min(0.12, chordDur * 0.35), "sine", cfg.peak * 0.08, "lowpass", 5200, {attack:0.002, decay:0.12, sustain:0.06, release:0.35, layers:[{wave:"sine", level:1}]});
    });
  } else {
    const gap = (state.chordPlayMode.startsWith("strum") ? 0.045 : 0.12) * cfg.spreadMul;
    notes.forEach((m, idx) => {
      const noteStart = t + idx * gap;
      const noteDur = state.chordPlayMode.startsWith("strum") ? chordDur : Math.min(0.25, chordDur * 0.45);
      playChordTone(midiToFreq(m), noteStart, noteDur, idx===0 ? cfg.rootWave : cfg.wave, cfg.peak * 0.92, cfg.filter, cfg.freq, cfg);
    });
  }
}
function chordRhythmStarts(barStart){
  const starts = [];
  if(state.chordRhythmMode === "sustain") return [[barStart, beatDur() * state.timeSig * 0.92]];
  if(state.chordRhythmMode === "quarter"){
    for(let b=0;b<state.timeSig;b++) starts.push([barStart + b*beatDur(), beatDur()*0.9]);
    return starts;
  }
  starts.push([barStart, beatDur()*1.8]);
  if(state.timeSig >= 4) starts.push([barStart + 2*beatDur(), beatDur()*1.8]);
  else if(state.timeSig === 3) starts.push([barStart + 1.5*beatDur(), beatDur()*1.2]);
  return starts;
}
