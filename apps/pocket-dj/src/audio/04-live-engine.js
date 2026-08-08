let session = null;
let audioCtx = null, masterGain, masterFilter, limiter,
    synthBusGain, synthDryGain, fxWetMasterGain, fxToneFilter,
    delayNode, delayFeedback, delayWet,
    chorusDelay, chorusWetGain, chorusLfo, chorusDepthGain,
    flangerDelay, flangerWetGain, flangerFeedbackGain, flangerLfo, flangerDepthGain,
    reverbConvolver, reverbWet;
const stemGains = {};
let noiseBuffer = null;
const liveNoiseBuffers = new Map();
let schedulerId = null;
let nextEventTime = 0;
let schedulerDiagnostics = {missedTickCount:0,droppedStepCount:0,droppedRichEventCount:0,catchupResetCount:0,interruptionCount:0};
let visualTimers = [];
let macroFrameId = null;
let macroToken = 0;
let state = {
  playing:false,
  currentSection:"A",
  currentStep:-1,
  currentStepForSchedule:0,
  bar:1,
  beat:1,
  performanceStemScales:{drums:1,bass:1,chords:1,melody:1,guitar:1},
  performanceFx:{filter:null,echo:null,chorus:null,flanger:null,reverb:null,mix:null},
  buildSavedVolumes:null,
  buildSavedFx:null,
  dropQueued:false,
  dropBoundaryScheduled:false,
  dropLanding:false
};
function beatDur(){ return 60 / (session?.deck.bpm || 96); }
function resolution(){ return session?.deck.resolution || 4; }
function stepsPerBar(){ return (session?.deck.timeSig || 4) * resolution(); }
function sectionStepCount(section){ return (section?.bars || 4) * stepsPerBar(); }
function stepDuration(step){
  const base = beatDur() / resolution();
  const swing = session?.deck.swing || 0;
  if(swing > 0 && resolution() >= 2 && resolution() !== 3){ return step % 2 ? base + base * swing : base - base * swing; }
  return base;
}
function spanDuration(startStep, count){ let d=0; for(let i=0;i<count;i++) d += stepDuration(startStep+i); return d; }
function ensureAudio(){
  if(audioCtx) return audioCtx.state === "suspended" ? audioCtx.resume() : Promise.resolve();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx) throw new Error("Web Audio is not available in this browser.");
  audioCtx = new Ctx();
  audioCtx.addEventListener?.("statechange", () => {
    if(state.playing && audioCtx.state !== "running"){
      schedulerDiagnostics.interruptionCount++;
      stopPlayback();
      showStatus("Audio was interrupted. Press Play to resume cleanly.");
    }
  });
  masterGain = audioCtx.createGain();
  masterFilter = audioCtx.createBiquadFilter();
  limiter = audioCtx.createDynamicsCompressor();
  synthBusGain = audioCtx.createGain();
  synthDryGain = audioCtx.createGain();
  fxWetMasterGain = audioCtx.createGain();
  fxToneFilter = audioCtx.createBiquadFilter();
  delayNode = audioCtx.createDelay(1.2);
  delayFeedback = audioCtx.createGain();
  delayWet = audioCtx.createGain();
  reverbConvolver = audioCtx.createConvolver();
  reverbWet = audioCtx.createGain();
  masterFilter.type = "lowpass";
  masterFilter.frequency.value = 20000;
  fxToneFilter.type = "highshelf";
  fxToneFilter.frequency.value = 1800;
  fxToneFilter.gain.value = 0;
  limiter.threshold.value = -16; limiter.knee.value = 18; limiter.ratio.value = 3; limiter.attack.value = .003; limiter.release.value = .10;
  STEMS.forEach(id => {
    stemGains[id] = audioCtx.createGain();
    if(id === "chords" || id === "melody") stemGains[id].connect(synthBusGain);
    else stemGains[id].connect(masterGain);
  });
  synthBusGain.connect(synthDryGain);
  synthDryGain.connect(fxToneFilter);
  delayNode.connect(delayFeedback); delayFeedback.connect(delayNode); delayNode.connect(delayWet); delayWet.connect(fxWetMasterGain);
  synthBusGain.connect(delayNode);
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
  reverbConvolver.buffer = createImpulse(1.6,2.4);
  synthBusGain.connect(reverbConvolver); reverbConvolver.connect(reverbWet); reverbWet.connect(fxWetMasterGain);
  fxWetMasterGain.connect(fxToneFilter);
  fxToneFilter.connect(masterGain);
  masterGain.connect(masterFilter);
  masterFilter.connect(limiter);
  limiter.connect(audioCtx.destination);
  noiseBuffer = makeNoiseBuffer(2.0, false);
  applyMixerAndFx();
  return audioCtx.state === "suspended" ? audioCtx.resume() : Promise.resolve();
}
function createImpulse(seconds, decay){
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(2,len,audioCtx.sampleRate);
  for(let ch=0;ch<2;ch++){
    const data = buffer.getChannelData(ch);
    for(let i=0;i<len;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay);
  }
  return buffer;
}
function makeNoiseBuffer(seconds, fade=false){
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1,len,audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<len;i++) data[i] = (Math.random()*2-1) * (fade ? (1 - i / len) : 1);
  return buffer;
}
function liveNoiseBuffer(key, seconds=0.06, fade=false, poolSize=8){
  const cacheKey = `${key}:${audioCtx.sampleRate}:${seconds}:${fade ? 1 : 0}`;
  let entry = liveNoiseBuffers.get(cacheKey);
  if(!entry){
    entry = {index:0, buffers:Array.from({length:poolSize}, () => makeNoiseBuffer(seconds, fade))};
    liveNoiseBuffers.set(cacheKey, entry);
  }
  const buffer = entry.buffers[entry.index % entry.buffers.length];
  entry.index++;
  return buffer;
}
function midiToFreq(m){ return 440 * Math.pow(2,(m-69)/12); }
function stemOutput(stem){ return stemGains[stem] || masterFilter; }
function featureSeed(step, seed=0){
  const x = Math.sin((step + 1) * 12.9898 + (seed + 1) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function humanizeOn(){ return !!session?.deck?.humanizeOn; }
function isLofiDeck(){ return session?.deck?.audioProfile === LOFI_AUDIO_PROFILE_ID || !!session?.deck?.lofiPreset; }
function isChipDeck(){ return session?.deck?.audioProfile === CHIP_AUDIO_PROFILE_ID || String(session?.deck?.chipPreset || "").startsWith("chip_"); }
function isMetalDeck(){ return session?.deck?.audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID || String(session?.deck?.metalPreset || "").startsWith("metal_"); }
function lofiDrumKit(){
  const kit = session?.deck?.drumKit || "classic";
  const resolver = pocketAudioCoreModule?.resolvePocketDrumKitId;
  if(typeof resolver === "function") return resolver(kit, session?.deck?.audioProfile, session?.deck?.metalPreset || session?.deck?.chipPreset || session?.deck?.lofiPreset);
  return FALLBACK_DRUM_KIT_CONFIGS[kit] ? kit : (isChipDeck() ? "chip_noise_kit" : (isMetalDeck() ? "metal_tight" : (isLofiDeck() ? "lofi_dusty" : "classic")));
}
function pocketDrumKitConfig(kit){
  const shared = pocketAudioCoreModule?.POCKET_DRUM_KIT_CONFIGS;
  return (shared && shared[kit]) || FALLBACK_DRUM_KIT_CONFIGS[kit] || FALLBACK_DRUM_KIT_CONFIGS.classic;
}
function humanizeOffset(step, seed=0){ return humanizeOn() ? (featureSeed(step, seed) - 0.5) * 0.018 : 0; }
function humanizePeak(base, step, seed=0){ return humanizeOn() ? base * (0.88 + featureSeed(step, seed + 99) * 0.20) : base; }
function safeAudioTime(t){ return Number.isFinite(t) ? Math.max(0, t) : 0; }
function activeSoundParameters(){
  const profile = session?.deck?.soundProfile?.parameters || {};
  const texture = isMetalDeck() ? (session?.deck?.metalTexture || {}) : isChipDeck() ? (session?.deck?.chipTexture || {}) : isLofiDeck() ? (session?.deck?.lofiTexture || {}) : {};
  return {...texture,...profile};
}
function pocketDjPlaybackRecipeProbe(profileId=session?.deck?.audioProfile || STANDARD_AUDIO_PROFILE_ID, parameters={}){
  const p = parameters || {};
  if(profileId === HEAVY_METAL_AUDIO_PROFILE_ID) return {drive:4.2 + clamp(asNum(p.drive,.48),0,1)*3.4, palmMuteLength:1.12 - clamp(asNum(p.palmMute,.78),0,1)*.42, lowTightnessHz:clamp(asNum(p.lowTightness,.86),0,1)*90, presenceGain:clamp(asNum(p.presence,.58),0,1)*2.2, pickInput:.86 + clamp(asNum(p.pickAttack,.72),0,1)*.28};
  if(profileId === CHIP_AUDIO_PROFILE_ID) return {driftCents:clamp(asNum(p.pitchDrift,.02),0,1)*24, saturationGain:1 + clamp(asNum(p.saturation,.18),0,1)*.18, crushFilterMul:1 + clamp(asNum(p.sampleRateCrush,.14),0,1)*.32};
  if(profileId === FUNK_AUDIO_PROFILE_ID) return {slapTransient:.52, popTransient:.62, ghostGain:.34, pocket:clamp(asNum(p.pocket,.78),0,1)};
  return {neutral:true};
}
function envGain(g,t,a,d,s,r,peak,dur){
  const end = t + Math.max(.015,dur);
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(.0001,t);
  g.gain.linearRampToValueAtTime(Math.max(.0001,peak), t + Math.max(.001,a));
  g.gain.linearRampToValueAtTime(Math.max(.0001,peak*s), t + Math.max(.002,a+d));
  g.gain.setValueAtTime(Math.max(.0001,peak*s), end);
  g.gain.exponentialRampToValueAtTime(.0001, end + Math.max(.02,r));
}
function connectWithPan(source, destination, pan=0, at=audioCtx?.currentTime || 0){
  if(audioCtx.createStereoPanner){
    const p = audioCtx.createStereoPanner();
    p.pan.setValueAtTime(clamp(asNum(pan,0),-1,1), at);
    source.connect(p);
    p.connect(destination);
    return p;
  }
  source.connect(destination);
  return destination;
}
function playOsc(stem,midi,t,dur,wave="sawtooth",peak=.2,filterType=null,filterFreq=1500,pan=0){
  return playOscFreq(stem,midiToFreq(midi),t,dur,wave,peak,filterType,filterFreq,pan);
}
function playOscFreq(stem,freq,t,dur,wave="sawtooth",peak=.2,filterType=null,filterFreq=1500,pan=0){
  if(!audioCtx) return;
  const params = activeSoundParameters();
  if(isChipDeck() && params.enabled !== false){
    const recipe = pocketDjPlaybackRecipeProbe(CHIP_AUDIO_PROFILE_ID,params);
    const drift = recipe.driftCents * (featureSeed(Math.round(t*1000),31)-.5);
    freq *= Math.pow(2,drift/1200);
    peak *= recipe.saturationGain;
    filterFreq *= recipe.crushFilterMul;
  }
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  let node = g;
  osc.type = wave; osc.frequency.setValueAtTime(freq, t);
  osc.connect(g);
  if(filterType){
    const f = audioCtx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(filterFreq,t); f.Q.value = .7; g.connect(f); node = f;
  }
  connectWithPan(node, stemOutput(stem), pan, t);
  envGain(g,t,.01,.06,.7,.20,peak,dur);
  osc.start(t); osc.stop(t + dur + .25);
}
function playKick(t, peak=0.95){
  const kit = lofiDrumKit();
  const cfg = pocketDrumKitConfig(kit).kick;
  const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
  let node = osc;
  osc.type = "sine";
  osc.frequency.setValueAtTime(cfg.startFreq,t);
  osc.frequency.exponentialRampToValueAtTime(cfg.endFreq,t+cfg.sweepSeconds);
  if(cfg.filterFreq){
    const f = audioCtx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.setValueAtTime(cfg.filterFreq,t);
    osc.connect(f); node = f;
  }
  g.gain.setValueAtTime(Math.max(cfg.gainFloor, peak * cfg.gainScale),t);
  g.gain.exponentialRampToValueAtTime(.001,t+cfg.rampSeconds);
  node.connect(g); g.connect(stemOutput("drums")); osc.start(t); osc.stop(t+cfg.length); flashStem("drums");
}
function playSnare(t, peak=0.5){
  const kit = lofiDrumKit();
  const cfg = pocketDrumKitConfig(kit).snare;
  const src = audioCtx.createBufferSource(), hp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
  let node = hp;
  src.buffer = liveNoiseBuffer(kit === "classic" ? "snare" : `snare_${kit}`, cfg.noiseSeconds, false);
  hp.type = "highpass"; hp.frequency.value = cfg.highpass;
  if(cfg.lowpass){
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cfg.lowpass;
    hp.connect(lp); node = lp;
  }
  g.gain.setValueAtTime(Math.max(cfg.gainFloor, peak * cfg.gainScale),t);
  g.gain.exponentialRampToValueAtTime(.001,t+cfg.rampSeconds);
  src.connect(hp); node.connect(g); g.connect(stemOutput("drums")); src.start(t); src.stop(t+cfg.length);
  if(cfg.bodyFreq){
    const body = audioCtx.createOscillator(), bodyGain = audioCtx.createGain();
    body.type = "triangle";
    body.frequency.setValueAtTime(cfg.bodyFreq,t);
    bodyGain.gain.setValueAtTime(cfg.bodyGain,t);
    bodyGain.gain.exponentialRampToValueAtTime(.001,t+cfg.bodyRampSeconds);
    body.connect(bodyGain); bodyGain.connect(stemOutput("drums")); body.start(t); body.stop(t+cfg.bodyLength);
  }
  flashStem("drums");
}
function playHat(t, peak=0.16, open=false){
  const kit = lofiDrumKit();
  const cfg = pocketDrumKitConfig(kit).hat;
  const hatLen = open ? cfg.openLength : cfg.closedLength;
  const src = audioCtx.createBufferSource(), hp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
  let node = hp;
  src.buffer = liveNoiseBuffer(kit === "classic" ? (open ? "hat_open" : "hat_closed") : `${open ? "hat_open" : "hat_closed"}_${kit}`, hatLen, false);
  hp.type = "highpass"; hp.frequency.value = open ? cfg.highpassOpen : cfg.highpassClosed;
  if(cfg.lowpass){
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cfg.lowpass;
    hp.connect(lp); node = lp;
  }
  g.gain.setValueAtTime(Math.max(open ? cfg.gainFloorOpen : cfg.gainFloorClosed, peak * (open ? cfg.gainScaleOpen : cfg.gainScaleClosed)),t);
  g.gain.exponentialRampToValueAtTime(.001,t + (open ? cfg.rampSecondsOpen : cfg.rampSecondsClosed));
  src.connect(hp); node.connect(g); g.connect(stemOutput("drums")); src.start(t); src.stop(t+hatLen); flashStem("drums");
}
function playFunkTransient(t, peak=.12, bright=false){
  if(!audioCtx) return;
  const src = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
  const length = bright ? .045 : .065;
  src.buffer = liveNoiseBuffer(`funk_transient_${bright ? "bright" : "body"}_${Math.round(peak*100)}`,length,true);
  filter.type = bright ? "bandpass" : "lowpass"; filter.frequency.value = bright ? 2200 : 760; filter.Q.value = bright ? 1.1 : .7;
  gain.gain.setValueAtTime(.0001,t); gain.gain.linearRampToValueAtTime(Math.max(.0001,peak),t+.002); gain.gain.exponentialRampToValueAtTime(.0001,t+length);
  src.connect(filter); filter.connect(gain); gain.connect(stemOutput("bass")); src.start(t); src.stop(t+length+.01);
}
function playBassExpressive(midi,t,dur=.22,peak=.34,articulation="finger",event={}){
  const art = String(articulation || "finger").toLowerCase();
  const emphasis = !!session?.performance?.funkMacros?.slapPopEmphasis;
  const velocity = richEventVelocity(event,1);
  const scaledPeak = peak * velocity * (emphasis && ["slap","pop"].includes(art) ? 1.28 : 1);
  if(art === "hold") return;
  if(art === "mute" || art === "ghost"){
    playFunkTransient(t, scaledPeak * (art === "ghost" ? .34 : .55), false);
    playOsc("bass",midi,t,Math.min(.09,dur*.38),"triangle",scaledPeak*.24,"lowpass",art === "ghost" ? 520 : 760);
    flashStem("bass");
    return;
  }
  const eventTone = FUNK_BASS_TONES.includes(String(event.sound || "")) ? String(event.sound) : null;
  playBass(midi,t,Math.max(.045,dur),scaledPeak,art === "accent" || art === "slap" || art === "pop",eventTone);
  if(art === "slap" || art === "palm_mute") playFunkTransient(t,scaledPeak*.52,false);
  if(art === "pop"){
    playFunkTransient(t,scaledPeak*.62,true);
    playOsc("bass",midi+12,t+.006,Math.min(.15,dur*.58),"square",scaledPeak*.22,"highpass",1100);
  }
}
function playDrumLane(lane,t,peak=.5){
  const id = String(lane || "hat_closed").toLowerCase();
  if(id === "kick") return playKick(t,peak);
  if(id === "snare" || id === "rim" || id === "clap" || id === "percussion" || id.startsWith("tom_")) return playSnare(t,peak * (id === "rim" ? .72 : id === "clap" ? .86 : id.startsWith("tom_") ? .78 : 1));
  if(id === "crash" || id === "china" || id === "ride") return playHat(t,peak * (id === "crash" ? 1.65 : .9),true);
  return playHat(t,peak,id === "hat_open");
}
function playLofiTexture(t, step=0){
  const texture = session?.deck?.lofiTexture || {};
  if(!isLofiDeck() || !texture.enabled || !audioCtx) return;
  const hiss = clamp(asNum(texture.tapeHiss, DEFAULT_LOFI_TEXTURE.tapeHiss),0,1);
  const crackle = clamp(asNum(texture.vinylCrackle, DEFAULT_LOFI_TEXTURE.vinylCrackle),0,1);
  const age = clamp(asNum(texture.lowPassAge, DEFAULT_LOFI_TEXTURE.lowPassAge),0,1);
  if(hiss > .005){
    const src = audioCtx.createBufferSource(), hp = audioCtx.createBiquadFilter(), lp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
    src.buffer = liveNoiseBuffer(`lofi_hiss_${Math.round(hiss*100)}_${Math.round(age*100)}`, .22, false);
    hp.type = "highpass"; hp.frequency.value = 520;
    lp.type = "lowpass"; lp.frequency.value = 3600 - age * 1800;
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.0055*hiss,t+.018); g.gain.exponentialRampToValueAtTime(.0001,t+.2);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(stemOutput("drums")); src.start(t); src.stop(t+.22);
  }
  if(crackle > .01 && featureSeed(step,43) < crackle * .7){
    const src = audioCtx.createBufferSource(), bp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
    src.buffer = liveNoiseBuffer(`lofi_crackle_${step % 19}`, .026, false);
    bp.type = "bandpass"; bp.frequency.value = 1550 + featureSeed(step,44) * 1300; bp.Q.value = .95;
    g.gain.setValueAtTime(.018*crackle,t); g.gain.exponentialRampToValueAtTime(.0001,t+.024);
    src.connect(bp); bp.connect(g); g.connect(stemOutput("drums")); src.start(t); src.stop(t+.028);
  }
}
function playCrash(t){ playHat(t,1.55,true); }
function bassToneConfig(tone=session?.deck?.bassTone){
  if(tone === "western_upright_bass") return {mainWave:"triangle", subWave:"sine", mainPeak:.72, subPeak:.24, cutoff:300, subCutoff:120};
  if(tone === "funk_finger_pocket") return {mainWave:"triangle", subWave:"sine", mainPeak:.82, subPeak:.32, cutoff:720, subCutoff:145};
  if(tone === "funk_slap_pop") return {mainWave:"square", subWave:"triangle", mainPeak:.72, subPeak:.38, cutoff:980, subCutoff:180};
  if(tone === "funk_muted_thump") return {mainWave:"triangle", subWave:"sine", mainPeak:.64, subPeak:.16, cutoff:420, subCutoff:120};
  if(tone === "funk_round_finger") return {mainWave:"sine", subWave:"sine", mainPeak:.78, subPeak:.38, cutoff:360, subCutoff:135};
  if(tone === "funk_synth_pocket") return {mainWave:"sawtooth", subWave:"triangle", mainPeak:.64, subPeak:.3, cutoff:820, subCutoff:175};
  if(tone === "chip_triangle_bass") return {mainWave:"triangle", subWave:"sine", mainPeak:.88, subPeak:.25, cutoff:520, subCutoff:180};
  if(tone === "chip_square_bass") return {mainWave:"square", subWave:"triangle", mainPeak:.72, subPeak:.22, cutoff:680, subCutoff:220};
  if(tone === "modern_chip_sub") return {mainWave:"square", subWave:"sine", mainPeak:.64, subPeak:.62, cutoff:420, subCutoff:150};
  if(tone === "bitcrush_bass") return {mainWave:"sawtooth", subWave:"square", mainPeak:.58, subPeak:.34, cutoff:560, subCutoff:210};
  if(tone === "metal_pick_bass") return {mainWave:"sawtooth", subWave:"square", mainPeak:.72, subPeak:.4, cutoff:520, subCutoff:140};
  if(tone === "metal_sub_pick") return {mainWave:"triangle", subWave:"sine", mainPeak:.58, subPeak:.68, cutoff:360, subCutoff:110};
  if(tone === "metal_grind_bass") return {mainWave:"sawtooth", subWave:"triangle", mainPeak:.66, subPeak:.32, cutoff:760, subCutoff:170};
  if(tone === "warm_sub") return {mainWave:"sine", subWave:"sine", mainPeak:.82, subPeak:.55, cutoff:210, subCutoff:120};
  if(tone === "soft_upright") return {mainWave:"triangle", subWave:"sine", mainPeak:.72, subPeak:.28, cutoff:360, subCutoff:140};
  if(tone === "rounded_triangle_bass") return {mainWave:"triangle", subWave:"sine", mainPeak:.84, subPeak:.34, cutoff:300, subCutoff:130};
  return {mainWave:"sawtooth", subWave:"sine", mainPeak:1, subPeak:.42, cutoff:420, subCutoff:220};
}
function playBass(midi,t,dur=.22,peak=.34,accent=false,toneOverride=null){
  const cfg = bassToneConfig(toneOverride || session?.deck?.bassTone);
  const params = activeSoundParameters();
  const bassDur = accent ? dur * 1.35 : dur;
  const bassPeak = (accent ? peak * 1.12 : peak) * cfg.mainPeak * (isMetalDeck() ? 1 + clamp(asNum(params.drive,.48),0,1)*.12 : 1);
  const cutoff = isMetalDeck() ? cfg.cutoff * (.72 + clamp(asNum(params.presence,.58),0,1)*.58) : cfg.cutoff;
  playOsc("bass",midi,t,bassDur,cfg.mainWave,bassPeak,"lowpass",accent ? cutoff * 1.18 : cutoff);
  playOsc("bass",midi-12,t,bassDur*.82,cfg.subWave,peak*cfg.subPeak,"lowpass",cfg.subCutoff);
  flashStem("bass");
}
function playBassPhrase(midi,t,dur=.22,peak=.34,accent=false,slideMidi=null,slideOffset=null){
  if(slideMidi === null || slideOffset === null){
    playBass(midi,t,dur,peak,accent);
    return;
  }
  const cfg = bassToneConfig();
  const endAt = t + Math.max(.08,dur) + .22;
  const slideAt = Math.max(t + .02, t + slideOffset);
  const makeVoice = (startMidi,targetMidi,wave,peakMul,cutoff) => {
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    osc.type = wave;
    osc.frequency.setValueAtTime(midiToFreq(startMidi), t);
    osc.frequency.linearRampToValueAtTime(midiToFreq(targetMidi), Math.min(endAt - .03, slideAt + .09));
    f.type = "lowpass"; f.frequency.setValueAtTime(cutoff, t);
    osc.connect(f); f.connect(g); g.connect(stemOutput("bass"));
    envGain(g,t,.01,.06,.7,.20,peak*peakMul*(accent ? 1.18 : 1),dur);
    osc.start(t); osc.stop(endAt);
  };
  makeVoice(midi,slideMidi,cfg.mainWave,cfg.mainPeak,accent ? cfg.cutoff * 1.18 : cfg.cutoff);
  makeVoice(midi-12,slideMidi-12,cfg.subWave,cfg.subPeak,cfg.subCutoff);
  flashStem("bass");
}
function playChord(chord,t,dur){
  const notes = chordMidiNotes(chord, session.deck.chordOctave || 0);
  const mode = session.deck.chordPlayMode || "block";
  const cfg = chordInstrumentConfig(session.deck.chordInstrument || "pocket");
  const ordered = (mode === "strum_down" || mode === "arp_down") ? notes.slice().reverse() : notes.slice();
  const chordDur = Math.max(.08, Math.min(dur * cfg.durMul, cfg.maxLiveDur || 1.1));
  if(mode === "block"){
    ordered.forEach((midi,i) => {
      const noteStart = t + i * .01 * cfg.spreadMul;
      playChordTone(midiToFreq(midi), noteStart, chordDur, i===0 ? cfg.rootWave : cfg.wave, cfg.peak, cfg.filter, cfg.freq, cfg);
      if(cfg.shimmer && i > 0) playChordTone(midiToFreq(midi + 12), noteStart + .014, Math.min(.12, chordDur*.35), "sine", cfg.peak*.08, "lowpass", 5200, {attack:.002, decay:.12, sustain:.06, release:.35, layers:[{wave:"sine", level:1}]});
    });
  }else{
    const gap = (mode.startsWith("strum") ? .045 : .12) * cfg.spreadMul;
    ordered.forEach((midi,i) => {
      const noteStart = t + i * gap;
      const noteDur = mode.startsWith("strum") ? chordDur : Math.min(.25, chordDur*.45);
      playChordTone(midiToFreq(midi), noteStart, noteDur, i===0 ? cfg.rootWave : cfg.wave, cfg.peak*.92, cfg.filter, cfg.freq, cfg);
    });
  }
  flashStem("chords");
}
function chordEnvelope(gain,t,dur,peak,cfg={}){
  const attack = Math.max(.001, cfg.attack ?? .01);
  const decay = Math.max(.001, cfg.decay ?? .06);
  const sustain = clamp(cfg.sustain ?? .7, .001, 1);
  const release = Math.max(.025, cfg.release ?? .2);
  const endAt = t + Math.max(.02,dur);
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(.0001,t);
  gain.gain.linearRampToValueAtTime(Math.max(.0001,peak),t+attack);
  gain.gain.linearRampToValueAtTime(Math.max(.0001,peak*sustain),t+attack+decay);
  gain.gain.setValueAtTime(Math.max(.0001,peak*sustain),endAt);
  gain.gain.exponentialRampToValueAtTime(.0001,endAt+release);
  return endAt + release + .03;
}
function playChordTone(freq,t,dur,type,peak,filterType,filterFreq,cfg={},pan=0){
  const gain = audioCtx.createGain();
  let output = gain;
  if(filterType){
    const f = audioCtx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq,t);
    f.Q.setValueAtTime(cfg.filterQ ?? .7,t);
    if(cfg.filterSweep) f.frequency.linearRampToValueAtTime(cfg.filterSweep, t + Math.max(.04, Math.min(.22,dur*.5)));
    gain.connect(f);
    output = f;
  }
  connectWithPan(output, stemOutput("chords"), pan, t);
  const stopAt = chordEnvelope(gain,t,dur,peak,cfg);
  (cfg.layers || [{wave:type, freqMul:1, detune:cfg.detune ?? 0, level:1}]).forEach(layer => {
    const osc = audioCtx.createOscillator(), layerGain = audioCtx.createGain();
    osc.type = layer.wave || type;
    osc.frequency.setValueAtTime(freq * (layer.freqMul || 1), t);
    osc.detune.setValueAtTime(layer.detune ?? 0, t);
    layerGain.gain.setValueAtTime(layer.level ?? 1, t);
    osc.connect(layerGain); layerGain.connect(gain);
    osc.start(t); osc.stop(stopAt);
  });
}
function chordInstrumentConfig(name){
  if(name === "funk_clav_stab") return {rootWave:"square",wave:"square",peak:.16,filter:"bandpass",freq:1800,filterQ:1.1,attack:.001,decay:.045,sustain:.08,release:.09,durMul:.34,spreadMul:.52,shimmer:false,maxLiveDur:.3,layers:[{wave:"square",level:.72},{wave:"triangle",level:.18,detune:7}]};
  if(name === "funk_rhodes_stab") return {rootWave:"triangle",wave:"triangle",peak:.145,filter:"lowpass",freq:1800,filterQ:.8,attack:.004,decay:.11,sustain:.14,release:.16,durMul:.44,spreadMul:.42,shimmer:false,maxLiveDur:.42,layers:[{wave:"triangle",level:.82},{wave:"sine",freqMul:2,level:.16,detune:4}]};
  if(name === "funk_brass_stack") return {rootWave:"sawtooth",wave:"square",peak:.13,filter:"bandpass",freq:1300,filterQ:.82,attack:.002,decay:.08,sustain:.16,release:.12,durMul:.4,spreadMul:.24,shimmer:false,maxLiveDur:.36,layers:[{wave:"sawtooth",level:.58,detune:-4},{wave:"square",level:.34,detune:5}]};
  if(name === "metal_power_stack") return {rootWave:"sawtooth",wave:"sawtooth",peak:.15,filter:"bandpass",freq:1180,filterQ:.9,filterSweep:1950,attack:.002,decay:.08,sustain:.58,release:.16,durMul:.72,spreadMul:.3,shimmer:false,maxLiveDur:.76,layers:[{wave:"sawtooth",level:.78,detune:-5},{wave:"square",level:.42,detune:5},{wave:"triangle",freqMul:.5,level:.2}]};
  if(name === "dark_organ_stack") return {rootWave:"triangle",wave:"sawtooth",peak:.125,filter:"lowpass",freq:1050,filterQ:.62,filterSweep:1500,attack:.09,decay:.24,sustain:.82,release:.62,durMul:1.35,spreadMul:.18,shimmer:false,maxLiveDur:1.7,layers:[{wave:"triangle",level:.72,detune:-8},{wave:"sawtooth",level:.36,detune:7},{wave:"sine",freqMul:2,level:.16}]};
  if(name === "piano") return {rootWave:"triangle",wave:"triangle",peak:.23,filter:"lowpass",freq:3100,filterQ:.9,attack:.003,decay:.18,sustain:.18,release:.16,durMul:.72,spreadMul:.45,shimmer:false,maxLiveDur:.82,layers:[{wave:"triangle",level:1},{wave:"sine",freqMul:2,level:.18,detune:3}]};
  if(name === "saloon_piano") return {rootWave:"triangle",wave:"triangle",peak:.205,filter:"lowpass",freq:3600,filterQ:1,attack:.002,decay:.13,sustain:.12,release:.18,durMul:.62,spreadMul:.58,shimmer:false,maxLiveDur:.7,layers:[{wave:"triangle",level:.88,detune:-8},{wave:"triangle",level:.62,detune:9},{wave:"sine",freqMul:2,level:.16,detune:5}]};
  if(name === "harp") return {rootWave:"triangle",wave:"sine",peak:.18,filter:"lowpass",freq:4600,filterQ:1.4,attack:.002,decay:.1,sustain:.03,release:.36,durMul:.5,spreadMul:1.45,shimmer:true,maxLiveDur:.58,layers:[{wave:"triangle",level:.9},{wave:"sine",freqMul:2,level:.26,detune:7}]};
  if(name === "warm_pad") return {rootWave:"sine",wave:"triangle",peak:.14,filter:"lowpass",freq:1200,filterQ:.65,filterSweep:1700,attack:.11,decay:.24,sustain:.82,release:.62,durMul:1.35,spreadMul:.25,shimmer:false,maxLiveDur:1.65,layers:[{wave:"sine",level:.95,detune:-5},{wave:"triangle",level:.48,detune:6}]};
  if(name === "dusty_rhodes") return {rootWave:"triangle",wave:"triangle",peak:.155,filter:"lowpass",freq:1550,filterQ:.72,attack:.012,decay:.18,sustain:.44,release:.34,durMul:.96,spreadMul:.38,shimmer:false,maxLiveDur:1.05,layers:[{wave:"triangle",level:.82,detune:-4},{wave:"sine",freqMul:2.01,level:.21,detune:5},{wave:"sine",freqMul:3.01,level:.045,detune:-8}]};
  if(name === "felt_piano") return {rootWave:"triangle",wave:"triangle",peak:.145,filter:"lowpass",freq:1900,filterQ:.82,attack:.006,decay:.24,sustain:.22,release:.42,durMul:.82,spreadMul:.34,shimmer:false,maxLiveDur:.96,layers:[{wave:"triangle",level:.78},{wave:"sine",freqMul:2,level:.16,detune:-3}]};
  if(name === "cassette_keys") return {rootWave:"triangle",wave:"triangle",peak:.135,filter:"lowpass",freq:1320,filterQ:.7,attack:.018,decay:.18,sustain:.54,release:.44,durMul:1.04,spreadMul:.45,shimmer:false,maxLiveDur:1.22,layers:[{wave:"triangle",level:.72,detune:-9},{wave:"triangle",level:.5,detune:10},{wave:"sine",freqMul:2,level:.12,detune:3}]};
  if(name === "muted_jazz_guitar") return {rootWave:"triangle",wave:"triangle",peak:.132,filter:"bandpass",freq:1180,filterQ:.95,attack:.004,decay:.09,sustain:.08,release:.16,durMul:.5,spreadMul:.72,shimmer:false,maxLiveDur:.42,layers:[{wave:"triangle",level:.8},{wave:"square",level:.11,detune:-5}]};
  if(name === "lofi_warm_pad") return {rootWave:"sine",wave:"triangle",peak:.115,filter:"lowpass",freq:930,filterQ:.58,filterSweep:1180,attack:.18,decay:.3,sustain:.86,release:.72,durMul:1.48,spreadMul:.22,shimmer:false,maxLiveDur:1.85,layers:[{wave:"sine",level:.92,detune:-7},{wave:"triangle",level:.42,detune:7}]};
  if(name === "chip_square_stack") return {rootWave:"square",wave:"square",peak:.16,filter:"lowpass",freq:3600,filterQ:.8,attack:.002,decay:.08,sustain:.48,release:.14,durMul:.82,spreadMul:.16,shimmer:false,maxLiveDur:.68,layers:[{wave:"square",level:.72},{wave:"square",level:.38,detune:6},{wave:"triangle",level:.12,freqMul:2}]};
  if(name === "chip_triangle_pad") return {rootWave:"triangle",wave:"triangle",peak:.125,filter:"lowpass",freq:2200,filterQ:.62,attack:.055,decay:.16,sustain:.72,release:.34,durMul:1.18,spreadMul:.12,shimmer:false,maxLiveDur:1.2,layers:[{wave:"triangle",level:.8},{wave:"sine",level:.18,freqMul:2}]};
  if(name === "chip_arp_keys") return {rootWave:"square",wave:"square",peak:.135,filter:"bandpass",freq:1850,filterQ:1.1,attack:.001,decay:.055,sustain:.16,release:.12,durMul:.46,spreadMul:.72,shimmer:true,maxLiveDur:.36,layers:[{wave:"square",level:.74},{wave:"triangle",level:.16,freqMul:2,detune:-4}]};
  if(name === "modern_chip_poly") return {rootWave:"square",wave:"sawtooth",peak:.142,filter:"lowpass",freq:2550,filterQ:.78,filterSweep:3400,attack:.008,decay:.13,sustain:.54,release:.22,durMul:.96,spreadMul:.28,shimmer:true,maxLiveDur:.92,layers:[{wave:"square",level:.62,detune:-7},{wave:"sawtooth",level:.4,detune:8},{wave:"triangle",level:.22,freqMul:.5}]};
  if(name === "glass") return {rootWave:"sine",wave:"sine",peak:.16,filter:"bandpass",freq:1500,filterQ:1.15,attack:.004,decay:.2,sustain:.1,release:.44,durMul:.9,spreadMul:.85,shimmer:true,maxLiveDur:.82,layers:[{wave:"sine",level:.36},{wave:"sine",freqMul:2.01,level:.64},{wave:"sine",freqMul:4.02,level:.34},{wave:"triangle",freqMul:6.01,level:.12}]};
  return {rootWave:"triangle",wave:"sine",peak:.24,filter:"lowpass",freq:1800,filterQ:.8,attack:.01,decay:.06,sustain:.7,release:.2,durMul:1,spreadMul:1,shimmer:false,maxLiveDur:1.15,layers:[{wave:"triangle",level:.82},{wave:"sine",level:.35}]};
}
function playMelody(midi,t,dur,instrument="pulse",pan=0,peakMul=1){
  playLeadInstrument(midi,t,dur,instrument,pan,peakMul);
  flashStem("melody");
}
function leadInstrumentConfig(name){
  if(name === "funk_muted_trumpet") return {wave:"square",peak:.105,filter:"bandpass",freq:1450,durMul:.5};
  if(name === "funk_sax_punch") return {wave:"sawtooth",peak:.12,filter:"bandpass",freq:1250,durMul:.62};
  if(name === "soft") return {wave:"triangle",peak:.16,filter:"lowpass",freq:1700,durMul:1};
  if(name === "synth") return {wave:"sawtooth",peak:.18,filter:"lowpass",freq:1500,durMul:.95};
  if(name === "bell") return {wave:"sine",peak:.105,filter:"lowpass",freq:2600,durMul:1.05};
  if(name === "lead_guitar") return {wave:"sawtooth",peak:.16,filter:"bandpass",freq:1800,durMul:.92};
  if(name === "distorted_lead_guitar") return {wave:"sawtooth",peak:.13,filter:"lowpass",freq:2400,durMul:.86};
  if(name === "banjo") return {wave:"triangle",peak:.13,filter:"bandpass",freq:2100,durMul:.48};
  if(name === "harmonica") return {wave:"square",peak:.115,filter:"bandpass",freq:1250,durMul:1.18};
  if(name === "cowboy_whistle") return {wave:"sine",peak:.10,filter:"lowpass",freq:3200,durMul:1.12};
  if(name === "trumpet") return {wave:"square",peak:.14,filter:"bandpass",freq:1650,durMul:1.05};
  if(name === "saxophone") return {wave:"triangle",peak:.17,filter:"bandpass",freq:940,durMul:1.12};
  if(name === "mellow_vibes") return {wave:"sine",peak:.105,filter:"lowpass",freq:2100,durMul:1.15};
  if(name === "soft_pluck") return {wave:"triangle",peak:.112,filter:"lowpass",freq:1650,durMul:.62};
  if(name === "mellow_sax") return {wave:"triangle",peak:.118,filter:"bandpass",freq:820,durMul:1.18};
  if(name === "muted_trumpet") return {wave:"square",peak:.095,filter:"bandpass",freq:1180,durMul:.98};
  if(name === "tape_bell") return {wave:"sine",peak:.088,filter:"lowpass",freq:1900,durMul:1.04};
  if(name === "chip_square_lead") return {wave:"square",peak:.155,filter:"lowpass",freq:4200,durMul:.88};
  if(name === "chip_pulse_lead") return {wave:"square",peak:.135,filter:"bandpass",freq:2400,durMul:.76};
  if(name === "chip_triangle_blip") return {wave:"triangle",peak:.12,filter:"lowpass",freq:3100,durMul:.54};
  if(name === "chip_bell_stack") return {wave:"sine",peak:.108,filter:"lowpass",freq:3900,durMul:1.05};
  if(name === "modern_chip_lead") return {wave:"square",peak:.138,filter:"lowpass",freq:3600,durMul:.86};
  if(name === "shred_lead_guitar") return {wave:"sawtooth",peak:.132,filter:"bandpass",freq:2300,durMul:.78};
  if(name === "twin_harmony_lead") return {wave:"sawtooth",peak:.118,filter:"lowpass",freq:2900,durMul:.86};
  return {wave:"square",peak:.20,filter:"lowpass",freq:2300,durMul:1};
}
function playLeadInstrument(midi,t,dur=.28,instrument="pulse",pan=0,peakMul=1){
  const cfg = leadInstrumentConfig(instrument);
  playOsc("melody",midi,t,dur*cfg.durMul,cfg.wave,cfg.peak*peakMul,cfg.filter,cfg.freq,pan);
  if(instrument === "bell") playOsc("melody",midi+12,t+.012,dur*.42,"sine",.022*peakMul,"lowpass",3200,pan);
  else if(instrument === "lead_guitar") playOscFreq("melody",midiToFreq(midi)*1.006,t+.006,dur*.72,"square",.035*peakMul,"lowpass",2600,pan);
  else if(instrument === "distorted_lead_guitar") playOscFreq("melody",midiToFreq(midi)*.996,t+.004,dur*.68,"square",.05*peakMul,"bandpass",2100,pan);
  else if(instrument === "banjo"){ playOscFreq("melody",midiToFreq(midi)*2.01,t+.004,Math.min(.09,dur*.38),"triangle",.028*peakMul,"highpass",1500,pan); playOscFreq("melody",midiToFreq(midi)*.997,t+.012,Math.min(.13,dur*.48),"square",.018*peakMul,"bandpass",2600,pan); }
  else if(instrument === "harmonica"){ playOscFreq("melody",midiToFreq(midi)*1.004,t+.006,dur*.92,"triangle",.035*peakMul,"bandpass",860,pan); playOscFreq("melody",midiToFreq(midi)*2,t+.014,dur*.42,"square",.012*peakMul,"bandpass",2100,pan); }
  else if(instrument === "cowboy_whistle") playOscFreq("melody",midiToFreq(midi)*2,t+.01,dur*.65,"sine",.014*peakMul,"lowpass",3600,pan);
  else if(instrument === "trumpet") playOsc("melody",midi+12,t+.008,dur*.35,"sawtooth",.018*peakMul,"bandpass",2400,pan);
  else if(instrument === "saxophone") playOsc("melody",midi-12,t+.004,dur*.42,"sine",.03*peakMul,"lowpass",760,pan);
  else if(instrument === "mellow_vibes") playOsc("melody",midi+12,t+.01,Math.min(.18,dur*.48),"sine",.018*peakMul,"lowpass",2400,pan);
  else if(instrument === "soft_pluck") playOscFreq("melody",midiToFreq(midi)*2,t+.004,Math.min(.12,dur*.45),"sine",.014*peakMul,"lowpass",2200,pan);
  else if(instrument === "mellow_sax") playOsc("melody",midi-12,t+.004,dur*.46,"sine",.018*peakMul,"lowpass",640,pan);
  else if(instrument === "muted_trumpet") playOsc("melody",midi+12,t+.006,dur*.28,"triangle",.012*peakMul,"bandpass",1700,pan);
  else if(instrument === "tape_bell") playOscFreq("melody",midiToFreq(midi+12)*.997,t+.016,dur*.38,"sine",.014*peakMul,"lowpass",2100,pan);
  else if(instrument === "chip_pulse_lead") playOscFreq("melody",midiToFreq(midi)*1.5,t+.006,dur*.38,"square",.022*peakMul,"bandpass",2800,pan);
  else if(instrument === "chip_bell_stack") playOsc("melody",midi+12,t+.012,dur*.32,"triangle",.018*peakMul,"lowpass",4200,pan);
  else if(instrument === "modern_chip_lead") playOscFreq("melody",midiToFreq(midi)*.997,t+.004,dur*.72,"sawtooth",.032*peakMul,"lowpass",3000,pan);
}
function distortionCurve(amount=3){
  const samples = 2048, curve = new Float32Array(samples);
  const drive = Math.max(.1, amount);
  for(let i=0;i<samples;i++){ const x = i*2/samples-1; curve[i] = Math.tanh(x*drive); }
  return curve;
}
function guitarToneConfig(tone=session?.deck?.guitarTone){
  if(tone === "clean") return {drive:.65,input:.62,peak:.086,lowpass:4300,highpass:90,body:1.4,mid:1,spread:.016,sustain:1.08,mute:.085,scratch:.040};
  if(tone === "crunch") return {drive:2.4,input:.80,peak:.092,lowpass:3600,highpass:100,body:2.8,mid:2,spread:.013,sustain:.98,mute:.074,scratch:.044};
  if(tone === "metal") return {drive:6.2,input:.92,peak:.088,lowpass:3050,highpass:115,body:4.5,mid:3,spread:.009,sustain:.86,mute:.060,scratch:.040};
  if(tone === "tight_metal") return {drive:7.1,input:.88,peak:.078,lowpass:2850,highpass:145,body:3.5,mid:3.35,spread:.007,sustain:.76,mute:.045,scratch:.036};
  if(tone === "doom_fuzz") return {drive:8.4,input:.82,peak:.075,lowpass:2450,highpass:72,body:5.2,mid:2.15,spread:.012,sustain:1.18,mute:.095,scratch:.030};
  if(tone === "western_twang") return {drive:1.25,input:.68,peak:.082,lowpass:4700,highpass:125,body:1.1,mid:2.4,spread:.020,sustain:.72,mute:.070,scratch:.034};
  if(tone === "funk_muted") return {drive:1.45,input:.70,peak:.074,lowpass:3900,highpass:210,body:1.2,mid:2.75,spread:.014,sustain:.42,mute:.045,scratch:.038};
  if(tone === "high_gain") return {drive:4.2,input:.88,peak:.090,lowpass:3250,highpass:108,body:3.7,mid:2.6,spread:.010,sustain:.91,mute:.066,scratch:.042};
  return {drive:4.2,input:.88,peak:.090,lowpass:3250,highpass:108,body:3.7,mid:2.6,spread:.010,sustain:.91,mute:.066,scratch:.042};
}
function guitarDirectionForStep(step){
  const mode = session?.deck?.guitarStrumMode || "down";
  if(mode === "up") return "up";
  if(mode === "alternate") return step % 2 ? "up" : "down";
  return "down";
}
function playGuitar(notes,t,dur,art="open",step=0){
  t = safeAudioTime(t);
  const cfg = guitarToneConfig(session.deck.guitarTone);
  const profileParams = activeSoundParameters();
  const metalRecipe = isMetalDeck() ? pocketDjPlaybackRecipeProbe(HEAVY_METAL_AUDIO_PROFILE_ID,profileParams) : null;
  const metalDrive = metalRecipe ? (metalRecipe.drive - 4.2) / 3.4 : 0;
  const palmMute = metalRecipe ? (1.12 - metalRecipe.palmMuteLength) / .42 : 0;
  const lowTightness = metalRecipe ? metalRecipe.lowTightnessHz / 90 : 0;
  const presence = metalRecipe ? metalRecipe.presenceGain / 2.2 : 0;
  const pickAttack = metalRecipe ? (metalRecipe.pickInput - .86) / .28 : 0;
  const isChug = art === "chug", isAccent = art === "accent", isScratch = art === "scratch";
  const playDur = isChug ? Math.min(dur,cfg.mute * (1.12 - palmMute*.42)) : isScratch ? cfg.scratch : Math.max(.12,dur*cfg.sustain);
  const ordered = guitarDirectionForStep(step) === "up" ? notes.slice().reverse() : notes.slice();
  const spread = isChug || isScratch ? .003 : cfg.spread;
  const bus = audioCtx.createGain(), input = audioCtx.createGain(), shaper = audioCtx.createWaveShaper(), hp = audioCtx.createBiquadFilter(), lp = audioCtx.createBiquadFilter(), body = audioCtx.createBiquadFilter(), mid = audioCtx.createBiquadFilter(), out = audioCtx.createGain();
  input.gain.setValueAtTime(cfg.input * (isAccent ? 1.18 : 1) * (isMetalDeck() ? .86 + pickAttack*.28 : 1), t);
  shaper.curve = distortionCurve((cfg.drive + metalDrive * 3.4) * (isAccent ? 1.12 : 1));
  shaper.oversample = "2x";
  hp.type = "highpass"; hp.frequency.setValueAtTime(isChug ? Math.max(135,cfg.highpass + lowTightness*90) : cfg.highpass,t);
  lp.type = "lowpass"; lp.frequency.setValueAtTime(isChug ? Math.min(cfg.lowpass,2400 + presence*620) : cfg.lowpass,t);
  body.type = "peaking"; body.frequency.setValueAtTime(isChug ? 170 : 240,t); body.Q.value = .75; body.gain.setValueAtTime(isChug ? 1.5 + presence*1.1 : cfg.body,t);
  mid.type = "peaking"; mid.frequency.setValueAtTime(isChug ? 720 : 980,t); mid.Q.value = .85; mid.gain.setValueAtTime(isChug ? Math.max(1.8,cfg.mid + presence*2.2) : cfg.mid,t);
  out.gain.setValueAtTime(.82,t);
  bus.connect(input); input.connect(shaper); shaper.connect(hp); hp.connect(body); body.connect(mid); mid.connect(lp); lp.connect(out); out.connect(stemOutput("guitar"));
  if(isScratch){
    const src = audioCtx.createBufferSource(), g = audioCtx.createGain(), bp = audioCtx.createBiquadFilter();
    src.buffer = liveNoiseBuffer(`guitar_scratch_${playDur}`, playDur, true); bp.type = "bandpass"; bp.frequency.value = 1450; bp.Q.value = .9;
    g.gain.setValueAtTime(.001,t); g.gain.linearRampToValueAtTime(.11,t+.004); g.gain.exponentialRampToValueAtTime(.001,t+playDur);
    src.connect(bp); bp.connect(g); g.connect(bus); src.start(t); src.stop(t+playDur+.02); flashStem("guitar"); return;
  }
  ordered.forEach((midi,i) => {
    const start = t + i * spread;
    const oscA = audioCtx.createOscillator(), oscB = audioCtx.createOscillator(), g = audioCtx.createGain();
    oscA.type = "sawtooth"; oscB.type = session.deck.guitarTone === "clean" ? "triangle" : "square";
    oscA.frequency.setValueAtTime(midiToFreq(midi),start);
    oscB.frequency.setValueAtTime(midiToFreq(midi) * (1.003 + i*.0009),start);
    oscA.detune.setValueAtTime((featureSeed(step, i+50)-.5)*4,start);
    oscB.detune.setValueAtTime((featureSeed(step, i+70)-.5)*5,start);
    const peak = cfg.peak * (isAccent ? 1.28 : 1) * (isChug ? 1.05 : 1) / Math.sqrt(ordered.length);
    g.gain.setValueAtTime(.001,start);
    g.gain.linearRampToValueAtTime(peak,start+(isChug ? .002 : .006));
    g.gain.exponentialRampToValueAtTime(Math.max(.0001, peak*(isChug ? .10 : .52)), start + Math.max(.025, playDur*(isChug ? .45 : .35)));
    g.gain.exponentialRampToValueAtTime(.0001,start+playDur+(isChug ? .035 : .18));
    oscA.connect(g); oscB.connect(g); g.connect(bus);
    oscA.start(start); oscB.start(start); oscA.stop(start+playDur+.22); oscB.stop(start+playDur+.22);
  });
  flashStem("guitar");
}
function duckStem(stem,t,amount){
  const g = stemGains[stem]; if(!g) return;
  const base = effectiveStemGain(stem);
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(base,t);
  g.gain.linearRampToValueAtTime(base * (1 - amount*.72), t+.012);
  g.gain.exponentialRampToValueAtTime(Math.max(.0001,base), t+.20);
}
function effectiveStemGain(stem){
  if(!session) return 0;
  const perf = session.performance;
  const muted = !!perf.stemMutes[stem] || (stem === "bass" && !!perf.funkMacros?.bassMute);
  const scale = clamp(asNum(state.performanceStemScales?.[stem], 1), 0, 1.4);
  let gain = muted ? 0 : clamp(asNum(perf.stemVolumes[stem],.8),0,1) * scale;
  if(stem === "guitar" && !session.deck.guitarActive) gain = 0;
  return gain;
}
function resetPerformanceStemScales(value=1){
  state.performanceStemScales = {drums:value,bass:value,chords:value,melody:value,guitar:value};
}
function effectiveFxValues(){
  const base = {...DEFAULT_FX, ...(session?.performance?.fx || {})};
  const perf = state.performanceFx || {};
  return {
    filter: clamp(asNum(perf.filter ?? base.filter, DEFAULT_FX.filter), 0, 1),
    echo: clamp(asNum(perf.echo ?? base.echo, DEFAULT_FX.echo), 0, 1),
    chorus: clamp(asNum(perf.chorus ?? base.chorus, DEFAULT_FX.chorus), 0, 1),
    flanger: clamp(asNum(perf.flanger ?? base.flanger, DEFAULT_FX.flanger), 0, 1),
    reverb: clamp(asNum(perf.reverb ?? base.reverb, DEFAULT_FX.reverb), 0, 1),
    mix: clamp(asNum(perf.mix ?? base.mix, DEFAULT_FX.mix), 0, 1)
  };
}
function clearPerformanceFx(){
  state.performanceFx = {filter:null,echo:null,chorus:null,flanger:null,reverb:null,mix:null};
}
function applyMixerAndFx(){
  if(!audioCtx || !session) return;
  STEMS.forEach(stem => { if(stemGains[stem]) stemGains[stem].gain.setTargetAtTime(effectiveStemGain(stem), audioCtx.currentTime, .018); });
  if(masterGain) masterGain.gain.setTargetAtTime(session.performance.masterVolume ?? .82, audioCtx.currentTime, .018);
  const fx = effectiveFxValues();
  const cutoff = 260 + Math.pow(clamp(fx.filter,0,1), 2.25) * 19740;
  masterFilter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, .03);
  masterFilter.Q.setTargetAtTime(fx.filter < .2 ? 1.2 : .45, audioCtx.currentTime, .03);
  const mapped = chordsmithFxParams({delay:fx.echo, chorus:fx.chorus, flanger:fx.flanger, reverb:fx.reverb, mix:fx.mix});
  if(synthDryGain) synthDryGain.gain.setTargetAtTime(mapped.dryGain, audioCtx.currentTime, .02);
  if(fxWetMasterGain) fxWetMasterGain.gain.setTargetAtTime(mapped.wetMasterGain, audioCtx.currentTime, .02);
  if(fxToneFilter){
    fxToneFilter.frequency.setTargetAtTime(mapped.tone.frequency, audioCtx.currentTime, .03);
    fxToneFilter.gain.setTargetAtTime(mapped.tone.gain, audioCtx.currentTime, .03);
  }
  delayNode.delayTime.setTargetAtTime(mapped.delay.time, audioCtx.currentTime, .02);
  delayFeedback.gain.setTargetAtTime(mapped.delay.feedback, audioCtx.currentTime, .02);
  delayWet.gain.setTargetAtTime(mapped.source.delay * .95, audioCtx.currentTime, .02);
  chorusWetGain.gain.setTargetAtTime(mapped.source.chorus * .95, audioCtx.currentTime, .02);
  chorusDepthGain.gain.setTargetAtTime(mapped.chorus.depth, audioCtx.currentTime, .02);
  chorusLfo.frequency.setTargetAtTime(mapped.chorus.rate, audioCtx.currentTime, .02);
  flangerWetGain.gain.setTargetAtTime(mapped.source.flanger * .85, audioCtx.currentTime, .02);
  flangerFeedbackGain.gain.setTargetAtTime(mapped.flanger.feedback, audioCtx.currentTime, .02);
  flangerDepthGain.gain.setTargetAtTime(mapped.flanger.depth, audioCtx.currentTime, .02);
  flangerLfo.frequency.setTargetAtTime(mapped.flanger.rate, audioCtx.currentTime, .02);
  reverbWet.gain.setTargetAtTime(mapped.source.reverb * 1.05, audioCtx.currentTime, .02);
}

/* 6. Scheduler */
