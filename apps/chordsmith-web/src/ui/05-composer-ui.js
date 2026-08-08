function renderProgression(){
  els.progressionSlots.innerHTML = "";
  state.progression.forEach((ch, i) => {
    const isActiveBar = i < sectionBarCount();
    const btn = document.createElement("button");
    btn.className = "slot" + (i === state.selectedSlot ? " active" : "") + (isActiveBar ? "" : " inactive"); btn.dataset.tip = "Select this bar, then choose a chord from the palette.";
    btn.innerHTML = `<div class="tiny">Bar ${i+1}</div><div class="big">${ch?.name || "-"}</div><div class="tiny">${ch?.numeral || ""}</div>`;
    btn.addEventListener("click", () => { state.selectedSlot = i; updateSuggestions(); renderProgression(); renderChordPalette(); });
    els.progressionSlots.appendChild(btn);
  });
  highlightSlots();
}
function simpleChordDegrees(){
  return state.scale === "major" ? [0,3,4,5] : [0,2,5,6];
}
function renderChordPalette(){
  els.chordPalette.innerHTML = "";
  const chords = state.uiMode === "simple" ? simpleChordDegrees().map(d => state.availableChords[d]) : state.availableChords;
  chords.forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "chord-btn" + (state.nextSuggested.includes(ch.degree) ? " suggested" : ""); btn.dataset.tip = state.nextSuggested.includes(ch.degree) ? "Suggested next chord based on the selected bar." : "Place this chord into the selected bar.";
    btn.innerHTML = `<div>${ch.name}</div>`;
    btn.addEventListener("click", async () => {
      pushUndoState();
      state.progression[state.selectedSlot] = ch; storeSection(); updateSuggestions(); renderProgression(); renderChordPalette();
      await ensureAudio(); playChord(ch, audioCtx.currentTime, 0.6);
    });
    els.chordPalette.appendChild(btn);
  });
}
function currentMelodyTrackOctave(){
  return state.melodyOctaves?.[state.activeMelodyTrack] ?? state.melodyOctave ?? 0;
}
function renderPads(){
  els.padGrid.innerHTML = "";
  const trackOctave = currentMelodyTrackOctave();
  if(state.melodyPitchMode === "chromatic"){
    for(let oct=0; oct<2; oct++){
      NOTES.forEach((n, i) => {
        const idx = oct * 12 + i;
        const p = document.createElement("button");
        p.className = "pad"; p.dataset.tip = "Tap to preview this chromatic note live for the selected melody track.";
        p.innerHTML = `<span>${n}</span><span class="tiny">${oct === 0 ? "Low" : "High"}</span>`;
        const fire = async () => { await ensureAudio(); playLeadInstrument(72 + i + oct*12 + (trackOctave*12), audioCtx.currentTime, 0.28, state.melodyInstruments[state.activeMelodyTrack] || "pulse", melodyTrackPanValue(state.activeMelodyTrack), humanizePeak(1, idx, 20 + state.activeMelodyTrack)); };
        p.addEventListener("click", fire);
        els.padGrid.appendChild(p);
      });
    }
    return;
  }
  const scale = buildScale(state.key, state.scale), labels = currentLabels();
  for(let oct=0; oct<2; oct++){
    scale.forEach((n, i) => {
      const p = document.createElement("button");
      p.className = "pad"; p.dataset.tip = "Tap to preview this note live for the selected melody track.";
      p.innerHTML = `<span>${NOTES[n]}</span><span class="tiny">${labels[i]}</span>`;
      const fire = async () => { await ensureAudio(); playLeadInstrument(72 + n + oct*12 + (trackOctave*12), audioCtx.currentTime, 0.28, state.melodyInstruments[state.activeMelodyTrack] || "pulse", melodyTrackPanValue(state.activeMelodyTrack), humanizePeak(1, oct * 7 + i, 20 + state.activeMelodyTrack)); };
      p.addEventListener("click", fire);
      els.padGrid.appendChild(p);
    });
  }
}
function renderDrumPads(){
  if(!els.drumPadGrid) return;
  if(els.drumPadGrid.childElementCount === DRUM_PADS.length) return;
  els.drumPadGrid.innerHTML = "";
  DRUM_PADS.forEach(d => {
    const p = document.createElement("button");
    p.type = "button";
    p.className = `drum-pad ${d.cls}`;
    p.dataset.drumPad = d.id;
    p.dataset.tip = d.recordLane ? "Tap to play live. With Write enabled during playback, this pad writes its schema-17 drum lane." : "Tap to play live.";
    p.setAttribute("aria-label", d.name);
    p.innerHTML = `<span class="drum-name">${d.name}</span><span class="drum-meta">${d.meta}</span><span class="drum-level"></span>`;
    const fire = async (ev) => {
      ev.preventDefault();
      await ensureAudio();
      const velocity = pointerVelocity(ev);
      playDrumPad(d.id, velocity);
      recordDrumPadHit(d.id);
    };
    p.addEventListener("pointerdown", fire, {passive:false});
    // Pointer events retain touch velocity; native keyboard activation emits
    // a click with detail 0, so Enter and Space get equivalent behaviour.
    p.addEventListener("click", ev => { if(ev.detail === 0) fire(ev); });
    p.addEventListener("contextmenu", ev => ev.preventDefault());
    els.drumPadGrid.appendChild(p);
  });
}
function resetLiveRecordStepClock(){
  state.liveRecordStepClock = [];
}
function rememberScheduledStepForRecording(item, time){
  if(!audioCtx || !item) return;
  if(!Array.isArray(state.liveRecordStepClock)) state.liveRecordStepClock = [];
  const now = audioCtx.currentTime;
  state.liveRecordStepClock.push({
    section:item.section,
    step:item.step,
    time,
    stepCount:item.stepCount || totalSteps()
  });
  state.liveRecordStepClock = state.liveRecordStepClock
    .filter(entry => entry.time >= now - 1 && entry.time <= now + 2)
    .slice(-256);
}
function nearestLiveRecordStep(){
  if(!audioCtx || !Array.isArray(state.liveRecordStepClock) || !state.liveRecordStepClock.length) return null;
  const now = audioCtx.currentTime;
  let best = null;
  state.liveRecordStepClock.forEach(entry => {
    const distance = Math.abs(entry.time - now);
    if(!best || distance < best.distance) best = {...entry, distance};
  });
  const stepWindow = Math.max(LIVE_DRUM_RECORD_LOOKAHEAD_SECONDS, stepDurationForIndex(best?.step || 0) * 0.55);
  return best && best.distance <= stepWindow ? best : null;
}
function recordDrumPadHit(id){
  if(!state.drumRecordToGrid) return;
  const pad = DRUM_PADS.find(d => d.id === id);
  if(!pad || !pad.recordLane){
    if(els.drumPadStatus) els.drumPadStatus.textContent = "Live-only pad";
    setStatus("That drum pad is live-only and was not written to the grid");
    return;
  }
  const quantized = nearestLiveRecordStep();
  if(!state.isPlaying || (state.currentStep < 0 && !quantized)){
    if(els.drumPadStatus) els.drumPadStatus.textContent = "Start playback to write";
    setStatus("Start playback to write drum pad hits into the beat grid");
    return;
  }
  const sectionId = sanitizeSectionId(quantized?.section || state.currentPlaybackSection || state.currentSection);
  const grid = state[sectionPropKey("grid", sectionId)] || state.grid;
  const drumLanes = state[sectionPropKey("drumLanes", sectionId)] || createDrumLanes();
  const maxStep = Math.max(0, sectionBarCount(sectionId) * stepsPerBar() - 1);
  const step = clamp(asInt(quantized?.step ?? state.currentStep, 0), 0, maxStep);
  pushUndoState();
  if(!drumLanes[pad.recordLane]) drumLanes[pad.recordLane] = new Array(totalSteps()).fill(0);
  drumLanes[pad.recordLane][step] = pad.recordLevel;
  state[sectionPropKey("drumLanes", sectionId)] = drumLanes;
  if(pad.recordTrack){
    if(!grid[pad.recordTrack]) grid[pad.recordTrack] = new Array(totalSteps()).fill(0);
    grid[pad.recordTrack][step] = pad.recordLevel;
  }
  if(sectionId === state.currentSection){
    syncSection();
    renderSeq();
  }
  const stepLabel = step + 1;
  const timingNote = quantized ? "nearest grid" : "current step";
  if(els.drumPadStatus) els.drumPadStatus.textContent = `Wrote ${pad.name} - ${sectionId}:${stepLabel}`;
  setStatus(`Wrote ${pad.name} to Section ${sectionId}, step ${stepLabel} (${timingNote})`);
}
function clearKitDrums(){
  pushUndoState();
  ["kick","snare","hat"].forEach(track => { if(state.grid[track]) state.grid[track].fill(0); });
  COMMON_DRUM_LANES.forEach(lane => { if(state.drumLanes?.[lane] && Array.isArray(state.drumLanes[lane])) state.drumLanes[lane].fill(0); });
  storeSection();
  renderSeq();
  if(els.drumPadStatus) els.drumPadStatus.textContent = "Kit drums cleared";
  setStatus(`Cleared kit drum tracks in Section ${state.currentSection}`);
}
function visibleBeatStep(bar, beat, fraction=0){
  const res = activeResolution();
  if(fraction > 0 && res <= 1) return -1;
  const base = ((bar * state.timeSig) + beat) * res;
  const offset = fraction > 0 ? clamp(Math.round(fraction * res), 0, Math.max(0, res - 1)) : 0;
  const step = base + offset;
  return step >= 0 && step < visibleSectionSteps() ? step : -1;
}
function setDrumPresetHit(track, bar, beat, fraction=0, level=1){
  if(!state.grid[track] || beat < 0 || beat >= state.timeSig) return;
  const step = visibleBeatStep(bar, beat, fraction);
  if(step < 0) return;
  state.grid[track][step] = Math.max(normalizeBeatCell(state.grid[track][step]), clamp(asInt(level, 1), 1, 2));
}
function addPreset16(track, bar, pos16, level=1){
  const beat = Math.floor(pos16 / 4);
  const fraction = (pos16 % 4) / 4;
  setDrumPresetHit(track, bar, beat, fraction, level);
}
function shouldUsePresetEvent(event){
  const res = activeResolution();
  if(event.minRes && res < event.minRes) return false;
  if(event.maxRes && res > event.maxRes) return false;
  return true;
}
function drumPresetPatternDef(presetId){
  const bySig = DRUM_PATTERN_DEFS[state.timeSig] || {};
  return bySig[presetId] || bySig.money || DRUM_PATTERN_DEFS[4].money;
}
function drumPresetResolutionKey(def){
  const res = activeResolution();
  if(res >= 4 && def.res4) return "res4";
  if(res >= 2 && def.res2) return "res2";
  if(def.res1) return "res1";
  if(def.res2) return "res2";
  return "res4";
}
function drumPresetEventsForCurrentResolution(presetId){
  const def = drumPresetPatternDef(presetId);
  const key = drumPresetResolutionKey(def);
  return {
    events:Array.isArray(def[key]) ? def[key] : [],
    note:def[`${key}Note`] || ""
  };
}
function applyPatternForBar(events, bar){
  events.forEach(event => {
    if(!shouldUsePresetEvent(event)) return;
    addPreset16(event.track, bar, event.pos16, event.level || 1);
  });
}
function fillDrumPresetForSection(presetId, sectionId=state.currentSection){
  const original = state.currentSection;
  storeSection();
  state.currentSection = sanitizeSectionId(sectionId);
  syncSection();
  const pattern = drumPresetEventsForCurrentResolution(presetId);
  state.gridTuplets = ensureGridTupletLengths(state.gridTuplets || blankGridTuplets());
  ["kick","snare","hat"].forEach(track => {
    state.grid[track] = rescaleBeatTrack(state.grid[track] || [], normalizeBeatCell);
    state.grid[track].fill(0);
    if(state.gridTuplets && state.gridTuplets[track]) state.gridTuplets[track].fill(false);
  });
  for(let bar = 0; bar < sectionBarCount(); bar++){
    applyPatternForBar(pattern.events, bar);
  }
  storeSection();
  state.currentSection = original;
  syncSection();
}
function applyDrumPreset(presetId){
  const preset = DRUM_PRESETS.find(p => p.id === presetId) || DRUM_PRESETS[0];
  if(!drumPresetVisible(preset)){
    setStatus("Choose a drum preset available for this mode and time signature");
    return;
  }
  const pattern = drumPresetEventsForCurrentResolution(preset.id);
  if(!pattern.events.length){
    setStatus("No drum pattern is available for this preset and time signature");
    return;
  }
  pushUndoState();
  state.gridTuplets = ensureGridTupletLengths(state.gridTuplets || blankGridTuplets());
  ["kick","snare","hat"].forEach(track => {
    state.grid[track] = rescaleBeatTrack(state.grid[track] || [], normalizeBeatCell);
    state.grid[track].fill(0);
    if(state.gridTuplets && state.gridTuplets[track]) state.gridTuplets[track].fill(false);
  });

  for(let bar = 0; bar < sectionBarCount(); bar++){
    applyPatternForBar(pattern.events, bar);
  }

  storeSection();
  markProjectDirty();
  renderSeq();
  const note = pattern.note ? ` ${pattern.note}` : "";
  setStatus(`Applied ${drumPresetLabel(preset)} drum preset to Section ${state.currentSection}.${note}`);
}
function melodyNoteCount(){
  return state.melodyPitchMode === "chromatic" ? 24 : 14;
}
function melodyIndexToMidi(idx, trackOctave = currentMelodyTrackOctave()){
  return melodyIndexToMidiForSettings(idx,state.melodyPitchMode,state.key,state.scale,trackOctave);
}
function melodyIndexToMidiForSettings(idx,pitchMode,key,scaleName,trackOctave=0){
  const noteCount = pitchMode === "chromatic" ? 24 : 14;
  const safeIdx = clamp(asInt(idx, 0), 0, noteCount - 1);
  if(pitchMode === "chromatic"){
    const chroma = ((safeIdx % 12) + 12) % 12;
    const oct = Math.floor(safeIdx / 12);
    return 72 + chroma + ((trackOctave + oct) * 12);
  }
  const scale = buildScale(key,scaleName);
  const degree = ((safeIdx % 7) + 7) % 7;
  const oct = Math.floor(safeIdx / 7);
  return 72 + scale[degree] + ((trackOctave + oct) * 12);
}
function midiToMelodyIndex(midi,pitchMode=state.melodyPitchMode,key=state.key,scaleName=state.scale,trackOctave=currentMelodyTrackOctave()){
  const noteCount = pitchMode === "chromatic" ? 24 : 14;
  let best = {idx:0,dist:Infinity};
  for(let idx=0;idx<noteCount;idx++){
    const dist = Math.abs(melodyIndexToMidiForSettings(idx,pitchMode,key,scaleName,trackOctave) - midi);
    if(dist < best.dist) best = {idx,dist};
  }
  return best.idx;
}
function melodyIndexLabel(idx){
  if(idx === null || idx === undefined) return "";
  const safeIdx = clamp(asInt(idx, 0), 0, melodyNoteCount() - 1);
  if(state.melodyPitchMode === "chromatic"){
    const note = NOTES[((safeIdx % 12) + 12) % 12];
    const oct = Math.floor(safeIdx / 12);
    return `${note}${oct === 1 ? "^" : ""}`;
  }
  const labels = currentLabels();
  const degree = ((safeIdx % 7) + 7) % 7;
  const oct = Math.floor(safeIdx / 7);
  return `${labels[degree]}${oct === 1 ? "^" : ""}`;
}
function selectedMelodyLabel(){
  const idx = clamp(asInt(state.selectedMelodyDegree, 0), 0, melodyNoteCount() - 1);
  if(state.melodyPitchMode === "chromatic"){
    const note = NOTES[((idx % 12) + 12) % 12];
    const oct = Math.floor(idx / 12) + currentMelodyTrackOctave();
    return `${note} chromatic O${oct >= 0 ? "+" + oct : oct}`;
  }
  const labels = currentLabels(), scale = buildScale(state.key, state.scale);
  const degree = ((idx % 7) + 7) % 7;
  const oct = Math.floor(idx / 7) + currentMelodyTrackOctave();
  return `${labels[degree]} ${NOTES[scale[degree]]} O${oct >= 0 ? "+" + oct : oct}`;
}
function melodyIndexForScaleDegree(degree, octave=0){
  const safeDegree = ((asInt(degree, 0) % 7) + 7) % 7;
  const safeOctave = clamp(asInt(octave, 0), 0, 1);
  if(state.melodyPitchMode === "chromatic"){
    const pc = buildScale(state.key, state.scale)[safeDegree];
    return clamp(pc + safeOctave * 12, 0, 23);
  }
  return clamp(safeDegree + safeOctave * 7, 0, 13);
}
function chordToneDegree(rootDegree, offset){
  return ((asInt(rootDegree, 0) + asInt(offset, 0)) % 7 + 7) % 7;
}
function melodyIdeaEventsForBar(style, barIndex){
  const offsets = style.offsets || [0,2,4,2];
  const events = [];
  for(let beat = 0; beat < state.timeSig; beat++){
    const offset = offsets[(beat + barIndex) % offsets.length];
    events.push({beat, fraction:0, offset, hold:activeResolution() > 1});
  }
  if(activeResolution() > 1 && state.timeSig >= 4){
    events.push({beat:state.timeSig - 1, fraction:0.5, offset:style.pickup ?? 1, hold:false});
  }
  return events;
}
async function applyMelodyIdea(){
  pushUndoState();
  state.melodyInputMode = "grid";
  if(state.uiMode === "simple") state.activeMelodyTrack = 0;
  if(!state.melodyTracks.length) state.melodyTracks = blankMelodyTracks(1);
  state.melodyInstruments = ensureMelodyInstrumentsLength(state.melodyInstruments, state.melodyTracks.length);
  state.melodyOctaves = ensureMelodyOctavesLength(state.melodyOctaves, state.melodyTracks.length, state.melodyOctave || 0);
  state.melodyHold = ensureMelodyHoldLength(state.melodyHold, state.melodyTracks.length);
  state.melodySlide = ensureMelodySlideLength(state.melodySlide, state.melodyTracks.length);
  state.melodyTuplets = ensureMelodyTupletsLength(state.melodyTuplets || [], state.melodyTracks.length);

  const trackIndex = state.uiMode === "simple" ? 0 : clamp(asInt(state.activeMelodyTrack, 0), 0, state.melodyTracks.length - 1);
  const track = state.melodyTracks[trackIndex] || blankMelody();
  const holdTrack = state.melodyHold[trackIndex] || new Array(totalSteps()).fill(false);
  const slideTrack = state.melodySlide[trackIndex] || new Array(totalSteps()).fill(false);
  const tupletTrack = state.melodyTuplets[trackIndex] || new Array(totalSteps()).fill(false);
  const visibleSteps = visibleSectionSteps();
  for(let i = 0; i < visibleSteps; i++){
    track[i] = null;
    holdTrack[i] = false;
    slideTrack[i] = false;
    tupletTrack[i] = false;
  }

  const style = randomChoice(MELODY_IDEA_STYLES);
  let firstNote = null;
  for(let bar = 0; bar < sectionBarCount(); bar++){
    const chord = state.progression[bar] || state.availableChords[0] || {degree:0};
    melodyIdeaEventsForBar(style, bar).forEach(event => {
      const step = visibleBeatStep(bar, event.beat, event.fraction);
      if(step < 0 || step >= visibleSteps) return;
      const octave = bar % 2 === 1 && event.beat >= Math.max(1, state.timeSig - 2) ? 1 : 0;
      const degree = chordToneDegree(chord.degree, event.offset);
      const noteIndex = melodyIndexForScaleDegree(degree, octave);
      track[step] = noteIndex;
      if(firstNote === null) firstNote = noteIndex;
      if(event.hold && step + 1 < visibleSteps && (track[step + 1] === null || track[step + 1] === undefined)) holdTrack[step + 1] = true;
    });
  }

  state.melodyTracks[trackIndex] = track;
  state.melodyHold[trackIndex] = holdTrack;
  state.melodySlide[trackIndex] = slideTrack;
  state.melodyTuplets[trackIndex] = tupletTrack;
  state.selectedMelodyDegree = firstNote ?? state.selectedMelodyDegree;
  storeSection();
  markProjectDirty();
  renderAll();
  setStatus(`Generated ${style.name} melody idea on track ${trackIndex + 1}`);

  if(firstNote !== null){
    try{
      await ensureAudio();
      playLeadInstrument(melodyIndexToMidi(firstNote, state.melodyOctaves[trackIndex] ?? 0), audioCtx.currentTime, 0.34, state.melodyInstruments[trackIndex] || "pulse", melodyTrackPanValue(trackIndex), 0.9);
    }catch(e){}
  }
}
function renderMelodySelect(){
  if(!els.melodyDegreeSelect) return;
  els.melodyDegreeSelect.innerHTML = "";
  if(state.melodyPitchMode === "chromatic"){
    for(let oct = 0; oct < 2; oct++){
      NOTES.forEach((n, i) => {
        const idx = oct * 12 + i;
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = `${n} - ${oct === 0 ? "Low" : "High"}`;
        els.melodyDegreeSelect.appendChild(opt);
      });
    }
  } else {
    const labels = currentLabels(), scale = buildScale(state.key, state.scale);
    for(let oct = 0; oct < 2; oct++){
      scale.forEach((n, i) => {
        const idx = oct * 7 + i;
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = `${labels[i]} - ${NOTES[n]} ${oct === 0 ? "Low" : "High"}`;
        els.melodyDegreeSelect.appendChild(opt);
      });
    }
  }
  state.selectedMelodyDegree = clamp(asInt(state.selectedMelodyDegree, 0), 0, melodyNoteCount() - 1);
  els.melodyDegreeSelect.value = String(state.selectedMelodyDegree);
}
function renderMelodyInstrumentSelect(){
  if(!els.melodyInstrumentSelect) return;
  if(!state.melodyInstruments.length) state.melodyInstruments = ensureMelodyInstrumentsLength([], state.melodyTracks.length || 1);
  els.melodyInstrumentSelect.value = state.melodyInstruments[state.activeMelodyTrack] || "pulse";
}
function leadInstrumentConfig(name){
  if(name === "funk_muted_trumpet") return {wave:"square",peak:0.11,filter:"bandpass",freq:1580,durMul:0.48,funk:true};
  if(name === "funk_sax_punch") return {wave:"triangle",peak:0.13,filter:"bandpass",freq:980,durMul:0.56,funk:true};
  if(name === "western_harmonica") return {wave:"square",peak:0.115,filter:"bandpass",freq:1250,durMul:1.18,western:true};
  if(name === "western_banjo") return {wave:"triangle",peak:0.13,filter:"bandpass",freq:2200,durMul:0.46,western:true};
  if(name === "western_fiddle") return {wave:"sawtooth",peak:0.11,filter:"bandpass",freq:1750,durMul:1.08,western:true};
  if(name === "chip_square_lead") return {wave:"square", peak:0.155, filter:"lowpass", freq:4200, durMul:0.88, chip:true};
  if(name === "chip_pulse_lead") return {wave:"square", peak:0.135, filter:"bandpass", freq:2400, durMul:0.76, chip:true};
  if(name === "chip_triangle_blip") return {wave:"triangle", peak:0.12, filter:"lowpass", freq:3100, durMul:0.54, chip:true};
  if(name === "chip_bell_stack") return {wave:"sine", peak:0.108, filter:"lowpass", freq:3900, durMul:1.05, chip:true};
  if(name === "modern_chip_lead") return {wave:"square", peak:0.138, filter:"lowpass", freq:3600, durMul:0.86, chip:true};
  if(name === "shred_lead_guitar") return {wave:"sawtooth", peak:0.132, filter:"bandpass", freq:2300, durMul:0.78, metal:true};
  if(name === "twin_harmony_lead") return {wave:"sawtooth", peak:0.118, filter:"lowpass", freq:2900, durMul:0.86, metal:true};
  if(name === "soft") return {wave:"triangle", peak:0.16, filter:"lowpass", freq:1700, durMul:1.0};
  if(name === "synth") return {wave:"sawtooth", peak:0.18, filter:"lowpass", freq:1500, durMul:0.95};
  if(name === "bell") return {wave:"sine", peak:0.105, filter:"lowpass", freq:2600, durMul:1.05};
  if(name === "lead_guitar") return {wave:"sawtooth", peak:0.16, filter:"bandpass", freq:1800, durMul:0.92};
  if(name === "distorted_lead_guitar") return {wave:"sawtooth", peak:0.13, filter:"lowpass", freq:2400, durMul:0.86};
  if(name === "banjo") return {wave:"triangle", peak:0.13, filter:"bandpass", freq:2100, durMul:0.48};
  if(name === "harmonica") return {wave:"square", peak:0.115, filter:"bandpass", freq:1250, durMul:1.18};
  if(name === "cowboy_whistle") return {wave:"sine", peak:0.10, filter:"lowpass", freq:3200, durMul:1.12};
  if(name === "trumpet") return {wave:"square", peak:0.14, filter:"bandpass", freq:1650, durMul:1.05};
  if(name === "saxophone") return {wave:"triangle", peak:0.17, filter:"bandpass", freq:940, durMul:1.12};
  if(name === "mellow_vibes") return {wave:"sine", peak:0.105, filter:"lowpass", freq:2100, durMul:1.15, lofi:true};
  if(name === "soft_pluck") return {wave:"triangle", peak:0.112, filter:"lowpass", freq:1650, durMul:0.62, lofi:true};
  if(name === "mellow_sax") return {wave:"triangle", peak:0.118, filter:"bandpass", freq:820, durMul:1.18, lofi:true};
  if(name === "muted_trumpet") return {wave:"square", peak:0.095, filter:"bandpass", freq:1180, durMul:0.98, lofi:true};
  if(name === "tape_bell") return {wave:"sine", peak:0.088, filter:"lowpass", freq:1900, durMul:1.04, lofi:true};
  return {wave:"square", peak:0.20, filter:"lowpass", freq:2300, durMul:1.0};
}
function playLeadInstrument(midi, t, dur=0.28, instrument="pulse", pan=0, peakMul=1){
  const cfg = leadInstrumentConfig(instrument);
  playTone(midiToFreq(midi), t, dur * cfg.durMul, cfg.wave, leadGain, cfg.peak * peakMul, cfg.filter, cfg.freq, pan);
  if(instrument === "bell"){
    playTone(midiToFreq(midi + 12), t + 0.012, dur * 0.42, "sine", leadGain, 0.022 * peakMul, "lowpass", 3200, pan);
  } else if(instrument === "lead_guitar"){
    playTone(midiToFreq(midi) * 1.006, t + 0.006, dur * 0.72, "square", leadGain, 0.035 * peakMul, "lowpass", 2600, pan);
  } else if(instrument === "distorted_lead_guitar"){
    playTone(midiToFreq(midi) * 0.996, t + 0.004, dur * 0.68, "square", leadGain, 0.05 * peakMul, "bandpass", 2100, pan);
  } else if(instrument === "banjo"){
    playTone(midiToFreq(midi) * 2.01, t + 0.004, Math.min(0.09, dur * 0.38), "triangle", leadGain, 0.028 * peakMul, "highpass", 1500, pan);
    playTone(midiToFreq(midi) * 0.997, t + 0.012, Math.min(0.13, dur * 0.48), "square", leadGain, 0.018 * peakMul, "bandpass", 2600, pan);
  } else if(instrument === "harmonica"){
    playTone(midiToFreq(midi) * 1.004, t + 0.006, dur * 0.92, "triangle", leadGain, 0.035 * peakMul, "bandpass", 860, pan);
    playTone(midiToFreq(midi) * 2, t + 0.014, dur * 0.42, "square", leadGain, 0.012 * peakMul, "bandpass", 2100, pan);
  } else if(instrument === "cowboy_whistle"){
    playTone(midiToFreq(midi) * 2, t + 0.01, dur * 0.65, "sine", leadGain, 0.014 * peakMul, "lowpass", 3600, pan);
  } else if(instrument === "trumpet"){
    playTone(midiToFreq(midi + 12), t + 0.008, dur * 0.35, "sawtooth", leadGain, 0.018 * peakMul, "bandpass", 2400, pan);
  } else if(instrument === "saxophone"){
    playTone(midiToFreq(midi - 12), t + 0.004, dur * 0.42, "sine", leadGain, 0.03 * peakMul, "lowpass", 760, pan);
  } else if(instrument === "mellow_vibes"){
    playTone(midiToFreq(midi + 12), t + 0.01, Math.min(0.18, dur * 0.48), "sine", leadGain, 0.018 * peakMul, "lowpass", 2400, pan);
  } else if(instrument === "soft_pluck"){
    playTone(midiToFreq(midi) * 2, t + 0.004, Math.min(0.12, dur * 0.45), "sine", leadGain, 0.014 * peakMul, "lowpass", 2200, pan);
  } else if(instrument === "mellow_sax"){
    playTone(midiToFreq(midi - 12), t + 0.004, dur * 0.46, "sine", leadGain, 0.018 * peakMul, "lowpass", 640, pan);
  } else if(instrument === "muted_trumpet"){
    playTone(midiToFreq(midi + 12), t + 0.006, dur * 0.28, "triangle", leadGain, 0.012 * peakMul, "bandpass", 1700, pan);
  } else if(instrument === "tape_bell"){
    playTone(midiToFreq(midi + 12) * 0.997, t + 0.016, dur * 0.38, "sine", leadGain, 0.014 * peakMul, "lowpass", 2100, pan);
  } else if(instrument === "chip_square_lead"){
    playTone(midiToFreq(midi) * 2, t + 0.004, Math.min(0.12, dur * 0.42), "triangle", leadGain, 0.018 * peakMul, "lowpass", 5200, pan);
  } else if(instrument === "chip_pulse_lead"){
    playTone(midiToFreq(midi) * 1.005, t + 0.006, dur * 0.62, "square", leadGain, 0.026 * peakMul, "lowpass", 3600, pan);
  } else if(instrument === "chip_triangle_blip"){
    playTone(midiToFreq(midi) * 2, t + 0.004, Math.min(0.08, dur * 0.28), "sine", leadGain, 0.012 * peakMul, "lowpass", 4200, pan);
  } else if(instrument === "chip_bell_stack"){
    playTone(midiToFreq(midi + 12) * 2.003, t + 0.012, Math.min(0.18, dur * 0.5), "sine", leadGain, 0.024 * peakMul, "lowpass", 4800, pan);
    playTone(midiToFreq(midi) * 3.01, t + 0.018, Math.min(0.14, dur * 0.38), "triangle", leadGain, 0.01 * peakMul, "highpass", 2100, pan);
  } else if(instrument === "modern_chip_lead"){
    playTone(midiToFreq(midi + 12) * 1.997, t + 0.005, Math.min(0.16, dur * 0.58), "triangle", leadGain, 0.02 * peakMul, "lowpass", 4300, pan);
    playTone(midiToFreq(midi - 12) * 0.5, t + 0.002, Math.min(0.18, dur * 0.68), "square", leadGain, 0.012 * peakMul, "lowpass", 1600, pan);
  }
}
function playLeadPhraseInstrument(midi, t, dur=0.28, instrument="pulse", pan=0, peakMul=1, slideMidi=null, slideOffset=null){
  if(slideMidi === null || slideOffset === null){
    playLeadInstrument(midi, t, dur, instrument, pan, peakMul);
    return;
  }
  const cfg = leadInstrumentConfig(instrument);
  const slideAt = Math.max(t + 0.02, t + (slideOffset * cfg.durMul));
  const endAt = t + Math.max(0.08, dur * cfg.durMul) + 0.22;
  const makeVoice = (freqMul=1, waveOverride=null, peakScale=1, filterType=cfg.filter, filterFreq=cfg.freq) => {
    const osc = audioCtx.createOscillator();
    osc.type = waveOverride || cfg.wave;
    osc.frequency.setValueAtTime(midiToFreq(midi) * freqMul, t);
    osc.frequency.linearRampToValueAtTime(midiToFreq(slideMidi) * freqMul, Math.min(endAt - 0.03, slideAt + 0.08));
    const gain = audioCtx.createGain();
    let node = osc;
    if(filterType){
      const f = audioCtx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(filterFreq, t);
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    connectWithPan(audioCtx, gain, leadGain, pan);
    adsr(gain, t, 0.01, 0.06, 0.7, Math.max(0.08, dur * cfg.durMul), cfg.peak * peakMul * peakScale);
    osc.start(t);
    osc.stop(endAt);
    registerLiveVoice(activeLeadVoices, {oscs:[osc], gain, stopAt:endAt}, LIVE_LEAD_VOICE_LIMIT, t, 0.018);
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
function renderMelodyOctaveChips(){
  if(!els.melodyOctaveChips) return;
  els.melodyOctaveChips.innerHTML = "";
  const activeOctave = currentMelodyTrackOctave();
  [-1,0,1].forEach(oct=>{
    const b = document.createElement("button");
    b.className = "mini-chip" + (activeOctave === oct ? " active" : "");
    b.textContent = oct === -1 ? "Melody Low" : oct === 0 ? "Melody Mid" : "Melody High";
    b.addEventListener("click", ()=>{
      pushUndoState();
      state.melodyOctaves[state.activeMelodyTrack] = oct;
      storeSection();
      renderMelodyOctaveChips();
      renderMelodyRows();
      renderPads();
      setStatus(`Melody track ${state.activeMelodyTrack + 1} octave set to ${b.textContent}`);
    });
    els.melodyOctaveChips.appendChild(b);
  });
}
function renderMelodyDegreeChips(){
  if(!els.melodyDegreeChips) return;
  els.melodyDegreeChips.innerHTML = "";
  const makeChip = (idx, text) => {
    const b = document.createElement("button");
    b.className = "degree-chip" + (state.selectedMelodyDegree === idx ? " active" : "");
    b.textContent = text;
    b.dataset.tip = state.melodyPitchMode === "chromatic" ? "Choose this chromatic note for melody sequencing." : "Choose this scale note for melody sequencing.";
    b.addEventListener("click", () => {
      state.selectedMelodyDegree = idx;
      els.melodyDegreeSelect.value = String(idx);
      renderMelodyDegreeChips();
      setStatus(`Melody note selected: ${selectedMelodyLabel()}`);
    });
    els.melodyDegreeChips.appendChild(b);
  };
  if(state.melodyPitchMode === "chromatic"){
    for(let oct = 0; oct < 2; oct++){
      NOTES.forEach((n, i) => makeChip(oct * 12 + i, `${n} ${oct === 0 ? "L" : "H"}`));
    }
    return;
  }
  const labels = currentLabels(), scale = buildScale(state.key, state.scale);
  for(let oct = 0; oct < 2; oct++){
    scale.forEach((n, i) => makeChip(oct * 7 + i, `${labels[i]} ${NOTES[n]} ${oct === 0 ? "L" : "H"}`));
  }
}
function renderMelodyTrackChips(){
  if(!els.melodyTrackChips) return;
  els.melodyTrackChips.innerHTML = "";
  state.melodyTracks.forEach((_, idx) => {
    const b = document.createElement("button");
    b.className = "mini-chip" + (state.activeMelodyTrack === idx ? " active" : "");
    b.textContent = `Track ${idx + 1}`;
    b.dataset.tip = "Select which melody track you are editing.";
    b.addEventListener("click", () => {
      state.activeMelodyTrack = idx;
      renderMelodyTrackChips();
      renderMelodyTrackControls();
      renderMelodyInstrumentSelect();
      renderMelodyOctaveChips();
      renderPads();
      renderMelodyRows();
    });
    els.melodyTrackChips.appendChild(b);
  });
  if(els.removeMelodyTrackBtn){
    els.removeMelodyTrackBtn.disabled = state.melodyTracks.length <= 1;
    els.removeMelodyTrackBtn.style.opacity = state.melodyTracks.length <= 1 ? "0.5" : "1";
  }
}


function renderMelodyTrackControls(){
  if(!els.melodyTrackControls) return;
  els.melodyTrackControls.innerHTML = "";
  const anySolo = state.melodySolo.some(Boolean);
  state.melodyTracks.forEach((_, idx) => {
    const row = document.createElement("div");
    row.className = "track-control-row";
    const tag = document.createElement("div");
    tag.className = "track-tag";
    const audible = melodyTrackIsAudible(idx);
    tag.textContent = `T${idx + 1}${audible ? "" : " off"}`;
    row.appendChild(tag);

    const muteBtn = document.createElement("button");
    muteBtn.className = "mini-chip warn" + (state.melodyMute[idx] ? " active" : "");
    muteBtn.textContent = "M";
    muteBtn.addEventListener("click", () => {
      pushUndoState();
      state.melodyMute[idx] = !state.melodyMute[idx];
      if(state.melodyMute[idx]) state.melodySolo[idx] = false;
      storeSection();
      renderMelodyTrackControls();
      setStatus(`Melody track ${idx + 1} ${state.melodyMute[idx] ? "muted" : "unmuted"}`);
    });
    row.appendChild(muteBtn);

    const soloBtn = document.createElement("button");
    soloBtn.className = "mini-chip info" + (state.melodySolo[idx] ? " active" : "");
    soloBtn.textContent = "S";
    soloBtn.addEventListener("click", () => {
      pushUndoState();
      state.melodySolo[idx] = !state.melodySolo[idx];
      if(state.melodySolo[idx]) state.melodyMute[idx] = false;
      storeSection();
      renderMelodyTrackControls();
      setStatus(state.melodySolo[idx] ? `Melody track ${idx + 1} soloed` : `Melody track ${idx + 1} solo cleared`);
    });
    row.appendChild(soloBtn);

    const panWrap = document.createElement("div");
    panWrap.className = "pan-compact";
    const left = document.createElement("span");
    left.className = "tiny";
    left.textContent = "L";
    panWrap.appendChild(left);
    const pan = document.createElement("input");
    pan.type = "range";
    pan.min = "-1";
    pan.max = "1";
    pan.step = "0.01";
    pan.value = String(melodyTrackPanValue(idx));
    pan.setAttribute("aria-label", `Melody track ${idx + 1} pan`);
    const right = document.createElement("span");
    right.className = "tiny";
    right.textContent = "R";
    const readout = document.createElement("span");
    readout.className = "pan-readout";
    readout.textContent = panLabel(melodyTrackPanValue(idx));
    pan.addEventListener("input", () => {
      state.melodyPan[idx] = clamp(asNumber(pan.value, 0), -1, 1);
      storeSection();
      tag.textContent = `T${idx + 1}${melodyTrackIsAudible(idx) ? "" : " off"}`;
      readout.textContent = panLabel(melodyTrackPanValue(idx));
    });
    pan.addEventListener("change", () => setStatus(`Melody track ${idx + 1} pan ${panLabel(melodyTrackPanValue(idx))}`));
    panWrap.appendChild(pan);
    panWrap.appendChild(right);
    panWrap.appendChild(readout);
    row.appendChild(panWrap);

    if(anySolo && !state.melodySolo[idx]) row.style.opacity = "0.7";
    els.melodyTrackControls.appendChild(row);
  });
}

function clearMelodyHoldFrom(trackIndex, startStep){
  const holdTrack = state.melodyHold[trackIndex] || [];
  for(let i = startStep; i < holdTrack.length; i++) holdTrack[i] = false;
}
function melodyPhraseInfo(section, trackIndex, step){
  const holdTracks = section.melodyHold || [];
  const slideTracks = section.melodySlide || [];
  const holdTrack = holdTracks[trackIndex] || [];
  const slideTrack = slideTracks[trackIndex] || [];
  const track = (section.melodyTracks || [])[trackIndex] || [];
  const stepCount = section.bars * stepsPerBar();
  let dur = 0;
  let idx = step;
  do {
    dur += stepDurationForIndex(idx, activeResolution(), state.swing);
    idx += 1;
  } while(idx < stepCount && holdTrack[idx]);

  let slideMidi = null;
  let slideOffset = null;
  if(idx < stepCount && slideTrack[idx] && track[idx] !== null && track[idx] !== undefined){
    slideMidi = melodyIndexToMidi(track[idx], (section.melodyOctaves || [])[trackIndex] ?? 0);
    slideOffset = dur;
    do {
      dur += stepDurationForIndex(idx, activeResolution(), state.swing);
      idx += 1;
    } while(idx < stepCount && holdTrack[idx]);
  }

  return {
    dur: Math.max(0.18, dur * 0.92),
    slideMidi,
    slideOffset
  };
}
function melodyCellDisplay(track, holdTrack, slideTrack, i, labels){
  if(holdTrack && holdTrack[i]) return "-";
  if(track[i] === null || track[i] === undefined) return "";
  const base = melodyIndexLabel(track[i]);
  return slideTrack && slideTrack[i] ? `~${base}` : base;
}
function hasMelodyNoteAt(track, i){
  return track && track[i] !== null && track[i] !== undefined;
}
function melodyHoldVisualClasses(track, holdTrack, slideTrack, i, steps){
  const hasNote = hasMelodyNoteAt(track, i);
  const isHold = !!(holdTrack && holdTrack[i]);
  const nextHold = i < steps - 1 && !!(holdTrack && holdTrack[i + 1]);
  const prevConnected = i > 0 && (hasMelodyNoteAt(track, i - 1) || !!(holdTrack && holdTrack[i - 1]) || !!(slideTrack && slideTrack[i - 1]));
  const parts = [];
  if(hasNote && !isHold) parts.push("melody-note-start");
  if(hasNote && nextHold) parts.push("melody-hold-start");
  if(isHold && nextHold) parts.push("melody-hold-mid");
  if(isHold && !nextHold) parts.push("melody-hold-end");
  if(isHold && !prevConnected) parts.push("melody-hold-orphan");
  return parts.length ? " " + parts.join(" ") : "";
}
function cleanMelodyConnectionsForSection(sectionId=state.currentSection){
  const id = sanitizeSectionId(sectionId);
  const tracks = state[sectionPropKey("melodyTracks", id)] || [];
  const holds = state[sectionPropKey("melodyHold", id)] || [];
  const slides = state[sectionPropKey("melodySlide", id)] || [];
  const steps = Math.min(getSectionStepCount(id), getMaxSectionStepCount());
  tracks.forEach((track, trackIndex) => {
    const holdTrack = holds[trackIndex] || [];
    const slideTrack = slides[trackIndex] || [];
    let connected = false;
    for(let i = 0; i < steps; i++){
      const hasNote = hasMelodyNoteAt(track, i);
      if(hasNote){
        if(holdTrack[i]) holdTrack[i] = false;
        connected = true;
      } else if(holdTrack[i]){
        if(!connected){
          holdTrack[i] = false;
          connected = false;
        } else {
          connected = true;
        }
      } else {
        connected = false;
      }
      if(slideTrack[i] && !hasNote) slideTrack[i] = false;
    }
  });
}
function clearMelodySlideFrom(trackIndex, startStep){
  const slideTrack = state.melodySlide[trackIndex] || [];
  for(let i = startStep; i < slideTrack.length; i++) slideTrack[i] = false;
}
function applyMelodyConnectionRange(trackIndex, startStep, targetStep){
  const holdTrack = state.melodyHold[trackIndex] || [];
  const slideTrack = state.melodySlide[trackIndex] || [];
  const track = state.melodyTracks[trackIndex] || [];
  clearMelodyHoldFrom(trackIndex, startStep + 1);
  clearMelodySlideFrom(trackIndex, startStep + 1);
  const safeTarget = clamp(asInt(targetStep, startStep), startStep, visibleSectionSteps() - 1);
  const startValue = track[startStep];
  let end = startStep;
  let slide = false;
  for(let i = startStep + 1; i <= safeTarget; i++){
    const hasNote = track[i] !== null && track[i] !== undefined;
    if(i === safeTarget && hasNote && track[i] !== startValue){
      slideTrack[i] = true;
      end = i;
      slide = true;
      break;
    }
    if(hasNote) break;
    holdTrack[i] = true;
    end = i;
  }
  return {end, slide};
}

function clearBassHoldFrom(startStep){
  const holdTrack = state.bassHold || [];
  for(let i = startStep; i < holdTrack.length; i++) holdTrack[i] = false;
}
function clearBassSlideFrom(startStep){
  const slideTrack = state.bassSlide || [];
  for(let i = startStep; i < slideTrack.length; i++) slideTrack[i] = false;
}
function bassManualIndexToMidi(idx,key=state.key,scaleName=state.scale){
  const scale = buildScale(key,scaleName);
  const degree = ((idx % 7) + 7) % 7;
  const oct = Math.floor(idx / 7);
  return 36 + scale[degree] + (oct * 12);
}
function bassManualLabel(idx){
  if(idx === null || idx === undefined) return "";
  const labels = currentLabels();
  const degree = ((idx % 7) + 7) % 7;
  const oct = Math.floor(idx / 7);
  return `${labels[degree]}${oct === 1 ? "^" : ""}`;
}
function bassStepMidiAt(section, step){
  if(state.bassMode === "manual"){
    const idx = (section.bassNotes || [])[step];
    return idx === null || idx === undefined ? null : bassManualIndexToMidi(idx);
  }
  const bar = Math.floor(step / stepsPerBar());
  const ch = (section.progression || state.progression)[bar] || state.availableChords[0];
  return 36 + ch.root;
}
function bassStepAccentAt(section, step){
  if(state.bassMode === "manual") return !!((section.bassAccent || [])[step]);
  return normalizeBeatCell((section.grid.bass || [])[step]) === 2;
}
function bassStepHasTrigger(section, step){
  if(state.bassMode === "manual") return (section.bassNotes || [])[step] !== null && (section.bassNotes || [])[step] !== undefined;
  return normalizeBeatCell((section.grid.bass || [])[step]) > 0;
}
function applyBassConnectionRange(startStep, targetStep){
  const holdTrack = state.bassHold || [];
  const slideTrack = state.bassSlide || [];
  clearBassHoldFrom(startStep + 1);
  clearBassSlideFrom(startStep + 1);
  const section = getSectionData(state.currentSection, false);
  const safeTarget = clamp(asInt(targetStep, startStep), startStep, visibleSectionSteps() - 1);
  const startMidi = bassStepMidiAt(section, startStep);
  let end = startStep;
  let slide = false;
  for(let i = startStep + 1; i <= safeTarget; i++){
    const hasNote = bassStepHasTrigger(section, i);
    if(i === safeTarget && hasNote){
      if(bassStepMidiAt(section, i) !== startMidi){
        slideTrack[i] = true;
        end = i;
        slide = true;
      }
      break;
    }
    if(hasNote) break;
    holdTrack[i] = true;
    end = i;
  }
  return {end, slide};
}
function bassPhraseInfo(section, step){
  const holdTrack = section.bassHold || [];
  const slideTrack = section.bassSlide || [];
  const stepCount = section.bars * stepsPerBar();
  let dur = 0;
  let idx = step;
  do {
    dur += stepDurationForIndex(idx, activeResolution(), state.swing);
    idx += 1;
  } while(idx < stepCount && holdTrack[idx]);
  let slideMidi = null;
  let slideOffset = null;
  if(idx < stepCount && slideTrack[idx] && bassStepHasTrigger(section, idx)){
    slideMidi = bassStepMidiAt(section, idx);
    slideOffset = dur;
    do {
      dur += stepDurationForIndex(idx, activeResolution(), state.swing);
      idx += 1;
    } while(idx < stepCount && holdTrack[idx]);
  }
  return { dur: Math.max(0.18, dur * 0.94), slideMidi, slideOffset };
}
function bassArticulationShort(art){ return {finger:"",slap:"S",pop:"P",mute:"M",hammer:"H",pull:"U",slide:"~",hold:"-"}[art] ?? ""; }
function bassCellDisplay(level, hold, slide, manualIdx=null, manualAccent=false, articulation="finger"){
  if(hold) return "-";
  if(state.bassMode === "manual"){
    if(manualIdx === null || manualIdx === undefined) return "";
    const label = bassManualLabel(manualIdx);
    if(slide) return `~${label}`;
    const mark = bassArticulationShort(articulation);
    return `${label}${manualAccent ? "!" : ""}${mark ? `·${mark}` : ""}`;
  }
  if(level === 0) return "";
  if(slide) return "~" + beatCellLabel("bass", level);
  return beatCellLabel("bass", level);
}

function guitarArticulationLabel(art){
  if(art === "open") return "Str";
  if(art === "chug") return "PM";
  if(art === "accent") return "!";
  if(art === "hold") return "--";
  if(art === "scratch") return "X";
  return "";
}
function guitarArticulationTip(art){
  if(art === "open") return "open strum";
  if(art === "chug") return "palm-muted chug";
  if(art === "accent") return "accented strum";
  if(art === "hold") return "hold/sustain from the previous guitar hit";
  if(art === "scratch") return "dead mute scratch";
  return "rest";
}
function guitarStepArt(section, step){
  return normalizeGuitarArticulation(((section.guitarPattern || [])[step]));
}
function guitarStepDuration(section, step, articulation){
  const stepCount = section.bars * stepsPerBar();
  const stepDur = stepDurationForIndex(step, activeResolution(), state.swing);
  if(articulation === "chug") return Math.max(0.055, Math.min(0.16, stepDur * 0.58));
  if(articulation === "scratch") return Math.max(0.035, Math.min(0.075, stepDur * 0.42));
  let dur = stepDur;
  let idx = step + 1;
  while(idx < stepCount && guitarStepArt(section, idx) === "hold"){
    dur += stepDurationForIndex(idx, activeResolution(), state.swing);
    idx++;
  }
  return Math.max(0.16, Math.min(1.8, dur * (articulation === "accent" ? 0.98 : 0.92)));
}
function buildPowerChordNotes(ch, register=state.guitarRegister){
  const chord = ch || state.availableChords[0] || {root:0};
  const rootPc = clamp(asInt(chord.root, 0), 0, 11);
  const minByRegister = register === "high" ? 52 : register === "mid" ? 45 : 35;
  const maxByRegister = register === "high" ? 64 : register === "mid" ? 57 : 47;
  let root = 24 + rootPc;
  while(root < minByRegister) root += 12;
  while(root > maxByRegister) root -= 12;
  return [root, root + 7, root + 12].map(n => clamp(n, 0, 127));
}
function guitarToneConfig(tone=state.guitarTone){
  if(tone === "funk_muted") return {drive:1.45,input:0.7,peak:0.074,lowpass:3900,highpass:210,body:1.2,mid:2.75,spread:0.014,sustain:0.42,mute:0.045,scratch:0.038};
  if(tone === "clean") return {drive:0.65, input:0.62, peak:0.086, lowpass:4300, highpass:90, body:1.4, mid:1.0, spread:0.016, sustain:1.08, mute:0.085, scratch:0.040};
  if(tone === "crunch") return {drive:2.4, input:0.80, peak:0.092, lowpass:3600, highpass:100, body:2.8, mid:2.0, spread:0.013, sustain:0.98, mute:0.074, scratch:0.044};
  if(tone === "metal") return {drive:6.2, input:0.92, peak:0.088, lowpass:3050, highpass:115, body:4.5, mid:3.0, spread:0.009, sustain:0.86, mute:0.060, scratch:0.040};
  if(tone === "tight_metal") return {drive:7.1, input:0.88, peak:0.078, lowpass:2850, highpass:145, body:3.5, mid:3.35, spread:0.007, sustain:0.76, mute:0.045, scratch:0.036};
  if(tone === "doom_fuzz") return {drive:8.4, input:0.82, peak:0.075, lowpass:2450, highpass:72, body:5.2, mid:2.15, spread:0.012, sustain:1.18, mute:0.095, scratch:0.030};
  if(tone === "western_twang") return {drive:1.25, input:0.68, peak:0.082, lowpass:4700, highpass:125, body:1.1, mid:2.4, spread:0.020, sustain:0.72, mute:0.070, scratch:0.034};
  return {drive:4.2, input:0.88, peak:0.090, lowpass:3250, highpass:108, body:3.7, mid:2.6, spread:0.010, sustain:0.91, mute:0.066, scratch:0.042};
}
function guitarDistortionCurve(amount=2.5){
  const samples = 2048;
  const curve = new Float32Array(samples);
  const drive = Math.max(0.1, amount);
  for(let i=0; i<samples; i++){
    const x = (i * 2 / samples) - 1;
    curve[i] = Math.tanh(x * drive);
  }
  return curve;
}
function guitarNoiseBuffer(ctx, seconds=0.06){
  return liveNoiseBuffer(ctx, `guitar_scratch_${seconds}`, seconds, true);
}
function guitarDirectionForStep(step, mode=state.guitarStrumMode){
  if(mode === "up") return "up";
  if(mode === "alternate") return step % 2 ? "up" : "down";
  return "down";
}
function playGuitarVoice(ctx, dest, notes, t, dur, articulation="open", toneName=state.guitarTone, direction="down", step=0){
  if(!ctx || !dest || !Array.isArray(notes) || !notes.length) return;
  t = safeAudioTime(t);
  let cfg = {...guitarToneConfig(toneName)};
  if(normalizeSoundProfileId(state.audioProfile) === HEAVY_METAL_AUDIO_PROFILE_ID && state.metalTexture?.enabled){
    cfg=metalGuitarRecipe(cfg,state.metalTexture);
  }
  const isChug = articulation === "chug";
  const isAccent = articulation === "accent";
  const isScratch = articulation === "scratch";
  const playDur = isChug ? Math.min(dur, cfg.mute) : isScratch ? cfg.scratch : Math.max(0.12, dur * cfg.sustain);
  const ordered = direction === "up" ? notes.slice().reverse() : notes.slice();
  const spread = isChug || isScratch ? 0.003 : cfg.spread;

  const bus = ctx.createGain();
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const hp = ctx.createBiquadFilter();
  const lp = ctx.createBiquadFilter();
  const body = ctx.createBiquadFilter();
  const mid = ctx.createBiquadFilter();
  const out = ctx.createGain();
  input.gain.setValueAtTime(cfg.input * (isAccent ? 1.18 : 1), t);
  shaper.curve = guitarDistortionCurve(cfg.drive * (isAccent ? 1.12 : 1));
  shaper.oversample = "2x";
  hp.type = "highpass";
  hp.frequency.setValueAtTime(isChug ? Math.max(135, cfg.highpass) : cfg.highpass, t);
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(isChug ? Math.min(cfg.lowpass, 2400) : cfg.lowpass, t);
  body.type = "peaking";
  body.frequency.setValueAtTime(isChug ? 170 : 240, t);
  body.Q.value = 0.75;
  body.gain.setValueAtTime(isChug ? 1.5 : cfg.body, t);
  mid.type = "peaking";
  mid.frequency.setValueAtTime(isChug ? 720 : 980, t);
  mid.Q.value = 0.85;
  mid.gain.setValueAtTime(isChug ? Math.max(1.8, cfg.mid) : cfg.mid, t);
  out.gain.setValueAtTime(0.82, t);
  bus.connect(input);
  input.connect(shaper);
  shaper.connect(hp);
  hp.connect(body);
  body.connect(mid);
  mid.connect(lp);
  lp.connect(out);
  out.connect(dest);
  const guitarVoice = {oscs:[], sources:[], gain:out, stopAt:t + playDur + 0.25};
  if(ctx === audioCtx) registerLiveVoice(activeGuitarVoices, guitarVoice, LIVE_GUITAR_VOICE_LIMIT, t, 0.018);

  if(isScratch){
    const noise = ctx.createBufferSource();
    noise.buffer = guitarNoiseBuffer(ctx, playDur);
    const bp = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1450, t);
    bp.Q.value = 0.9;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.11, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + playDur);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    noise.start(t);
    noise.stop(t + playDur + 0.02);
    guitarVoice.sources.push(noise);
    guitarVoice.stopAt = t + playDur + 0.02;
    return;
  }

  ordered.forEach((midi, idx) => {
    const start = t + idx * spread;
    const freq = midiToFreq(midi);
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();
    oscA.type = "sawtooth";
    oscB.type = toneName === "clean" ? "triangle" : "square";
    oscA.frequency.setValueAtTime(freq, start);
    oscB.frequency.setValueAtTime(freq * (1.003 + idx * 0.0009), start);
    oscA.detune.setValueAtTime((featureSeed(step, idx + 50) - 0.5) * 4, start);
    oscB.detune.setValueAtTime((featureSeed(step, idx + 70) - 0.5) * 5, start);
    const peak = cfg.peak * (isAccent ? 1.28 : 1) * (isChug ? 1.05 : 1) / Math.sqrt(ordered.length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + (isChug ? 0.002 : 0.006));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * (isChug ? 0.10 : 0.52)), start + Math.max(0.025, playDur * (isChug ? 0.45 : 0.35)));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + playDur + (isChug ? 0.035 : 0.18));
    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(bus);
    oscA.start(start);
    oscB.start(start);
    oscA.stop(start + playDur + 0.22);
    oscB.stop(start + playDur + 0.22);
    guitarVoice.oscs.push(oscA, oscB);
  });
}
function scheduleGuitarStep(section, step, time){
  if(!state.guitarEnabled) return;
  const art = guitarStepArt(section, step);
  if(art === "off" || art === "hold") return;
  const bar = Math.floor(step / stepsPerBar());
  const ch = section.progression[bar] || state.availableChords[0];
  const notes = buildPowerChordNotes(ch, state.guitarRegister);
  const dur = guitarStepDuration(section, step, art);
  playGuitarVoice(audioCtx, guitarGain, notes, time + humanizeOffset(step, 17) + funkPocketOffset(step), dur, art, state.guitarTone, guitarDirectionForStep(step), step);
}
function renderGuitarOffline(ctx, dest, ev){
  playGuitarVoice(ctx, dest, ev.notes, ev.time, ev.dur, ev.articulation, ev.tone, ev.direction, ev.step);
}
function firstAudibleGuitarStep(section){
  const stepCount = (section && section.bars ? section.bars : sectionBarCount()) * stepsPerBar();
  for(let step=0; step<stepCount; step++){
    const art = guitarStepArt(section, step);
    if(art !== "off" && art !== "hold") return step;
  }
  return -1;
}
async function auditionCurrentSectionGuitar(){
  const section = getSectionData(state.currentSection, false);
  const step = firstAudibleGuitarStep(section);
  if(step < 0) return false;
  await ensureAudio();
  applyVolumes();
  const bar = Math.floor(step / stepsPerBar());
  const ch = (section.progression || state.progression)[bar] || state.availableChords[0];
  const art = guitarStepArt(section, step);
  const notes = buildPowerChordNotes(ch, state.guitarRegister);
  playGuitarVoice(audioCtx, guitarGain, notes, audioCtx.currentTime + 0.015, Math.min(0.36, guitarStepDuration(section, step, art)), art, state.guitarTone, guitarDirectionForStep(step), step);
  return true;
}
function guitarPatternHasAudibleData(sectionId=state.currentSection){
  const id = sanitizeSectionId(sectionId);
  const pattern = state[sectionPropKey("guitarPattern", id)] || [];
  const steps = getSectionStepCount(id);
  for(let i = 0; i < steps; i++){
    const art = normalizeGuitarArticulation(pattern[i]);
    if(art !== "off" && art !== "hold") return true;
  }
  return false;
}
function guitarFillStyleLabel(style){
  return style === "sparse_strum" ? "Sparse strum" : style === "chug" ? "Chug" : style === "accents_only" ? "Accents only" : "Gentle strum";
}
function guitarPatternPresetLabel(preset){
  return {
    rock_eighths:"Rock 8ths",
    punk_downstrokes:"Punk",
    metal_chug:"Metal chug",
    gallop:"Gallop",
    doom_slow:"Doom",
    verse_chorus:"Verse/chorus",
    boom_chick:"Boom-chick",
    train_chop:"Train chop",
    western_waltz:"Western waltz"
  }[preset] || String(preset || "Guitar preset").replace(/_/g, " ");
}
function buildGeneratedGuitarPattern(sectionId=state.currentSection, style="gentle_strum"){
  const id = sanitizeSectionId(sectionId);
  const pattern = createGuitarState();
  const steps = getSectionStepCount(id);
  const res = activeResolution();
  const barSteps = stepsPerBar();
  const beat = Math.max(1, res);
  const safeStyle = safeChoice(style, GUITAR_FILL_STYLES, "gentle_strum");

  for(let step = 0; step < steps; step++){
    const pos = step % Math.max(1, barSteps);
    if(state.timeSig === 3 && res === 2){
      const cell = pos % 6;
      if(safeStyle === "gentle_strum"){
        pattern[step] = ["accent", "hold", "open", "hold", "open", "hold"][cell] || "off";
      } else if(safeStyle === "sparse_strum"){
        pattern[step] = ["accent", "hold", "off", "hold", "open", "hold"][cell] || "off";
      } else if(safeStyle === "chug"){
        pattern[step] = ["accent", "off", "chug", "off", "chug", "off"][cell] || "off";
      } else if(safeStyle === "accents_only"){
        pattern[step] = cell === 0 ? "accent" : "off";
      }
      continue;
    }

    const beatIndex = Math.floor(pos / beat);
    const sub = pos % beat;
    if(safeStyle === "gentle_strum"){
      if(sub === 0) pattern[step] = beatIndex === 0 ? "accent" : "open";
      else if(pattern[step - 1] && pattern[step - 1] !== "off") pattern[step] = "hold";
    } else if(safeStyle === "sparse_strum"){
      if(pos === 0) pattern[step] = "accent";
      else if(sub === 0 && (beatIndex === 2 || (state.timeSig === 3 && beatIndex === 2))) pattern[step] = "open";
      else if(step > 0 && pattern[step - 1] && pattern[step - 1] !== "off") pattern[step] = "hold";
    } else if(safeStyle === "chug"){
      const unit = Math.max(1, Math.round(res / 2));
      if(pos % unit === 0) pattern[step] = pos === 0 || pos === beat * 2 ? "accent" : "chug";
    } else if(safeStyle === "accents_only"){
      if(pos === 0 || (state.timeSig === 4 && pos === beat * 2)) pattern[step] = "accent";
    }
  }
  return ensureGuitarPatternLength(pattern);
}
function fillGuitarFromChords(sectionId=state.currentSection, style=null, replace=true){
  const id = sanitizeSectionId(sectionId);
  const chosenStyle = style || (els.guitarFillStyleSelect ? els.guitarFillStyleSelect.value : "gentle_strum");
  if(!replace && guitarPatternHasAudibleData(id)) return false;
  state[sectionPropKey("guitarPattern", id)] = buildGeneratedGuitarPattern(id, chosenStyle);
  if(id === state.currentSection) state.guitarPattern = state[sectionPropKey("guitarPattern", id)];
  state.guitarPatternPreset = chosenStyle;
  return true;
}
function clearGuitarPattern(sectionId=state.currentSection){
  const id = sanitizeSectionId(sectionId);
  state[sectionPropKey("guitarPattern", id)] = createGuitarState();
  if(id === state.currentSection) state.guitarPattern = state[sectionPropKey("guitarPattern", id)];
}
function fillGuitarAllSections(){
  const style = els.guitarFillStyleSelect ? els.guitarFillStyleSelect.value : "gentle_strum";
  const existing = SECTION_IDS.filter(id => guitarPatternHasAudibleData(id));
  let replace = true;
  if(existing.length){
    replace = window.confirm(`Some sections already contain guitar data (${existing.join(", ")}). OK replaces all sections; Cancel fills empty sections only.`);
  }
  let changed = 0;
  SECTION_IDS.forEach(id => {
    if(replace || !guitarPatternHasAudibleData(id)){
      if(fillGuitarFromChords(id, style, true)) changed++;
    }
  });
  state.guitarEnabled = true;
  syncSection();
  renderAll();
  markProjectDirty();
  setStatus(`Generated ${guitarFillStyleLabel(style)} guitar for ${changed} section${changed === 1 ? "" : "s"}`);
}
async function setGuitarEnabled(enabled, audition=false){
  storeSection();
  state.guitarEnabled = !!enabled;
  let generated = false;
  if(state.guitarEnabled && firstAudibleGuitarStep(getSectionData(state.currentSection, false)) < 0){
    const style = els.guitarFillStyleSelect ? els.guitarFillStyleSelect.value : "gentle_strum";
    generated = fillGuitarFromChords(state.currentSection, style, true);
  }
  renderAll();
  let heard = false;
  if(state.guitarEnabled && audition){
    heard = await auditionCurrentSectionGuitar();
  }
  if(state.guitarEnabled){
    if(generated) setStatus(heard ? `No guitar part existed, so ${guitarFillStyleLabel(state.guitarPatternPreset)} was generated and enabled` : `No guitar part existed, so ${guitarFillStyleLabel(state.guitarPatternPreset)} was generated. Press Play to hear it.`);
    else setStatus(heard ? "Guitar rhythm enabled" : "Guitar rhythm enabled. Add guitar cells or choose Fill Guitar From Chords to hear it.");
  } else {
    setStatus("Guitar rhythm disabled");
  }
  markProjectDirty();
}
function guitarMidiDurationTicks(section, step, articulation, ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  const stepTicks = tickPerStep(activeResolution(), ticksPerQuarter);
  if(articulation === "chug") return Math.max(1, Math.round(stepTicks * 0.48));
  if(articulation === "scratch") return Math.max(1, Math.round(stepTicks * 0.25));
  let durTicks = stepTicks;
  let idx = step + 1;
  const stepCount = section.bars * stepsPerBar();
  while(idx < stepCount && guitarStepArt(section, idx) === "hold"){
    durTicks += stepTicks;
    idx++;
  }
  return Math.max(1, Math.round(state.midiExactDurations ? durTicks : durTicks * 0.9));
}
function exportGuitarToMidi(events, tick, section, step, ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  if(!state.guitarEnabled) return;
  const art = guitarStepArt(section, step);
  if(art === "off" || art === "hold" || art === "scratch") return;
  const bar = Math.floor(step / stepsPerBar());
  const notes = buildPowerChordNotes(section.progression[bar] || state.availableChords[0], state.guitarRegister);
  const durTicks = guitarMidiDurationTicks(section, step, art, ticksPerQuarter);
  const direction = guitarDirectionForStep(step);
  const ordered = direction === "up" ? notes.slice().reverse() : notes;
  const gapTicks = art === "chug" ? Math.max(1, Math.round(ticksPerQuarter * 0.004)) : Math.max(1, Math.round(ticksPerQuarter * 0.012));
  const vel = art === "accent" ? 108 : art === "chug" ? 92 : 96;
  ordered.forEach((note, idx) => pushMidiNote(events, tick + idx * gapTicks, Math.max(1, durTicks - idx * gapTicks), note, vel, 3));
}
function applyGuitarPreset(name=state.guitarPatternPreset, sectionId=state.currentSection){
  const id = sanitizeSectionId(sectionId);
  const pattern = createGuitarState();
  const stepCount = sectionBarCount(id) * stepsPerBar();
  const res = activeResolution();
  const eighth = Math.max(1, Math.round(res / 2));
  const beat = Math.max(1, res);
  const barSteps = stepsPerBar();
  const preset = safeChoice(name, guitarPatternPresetIds(), "metal_chug");
  for(let step=0; step<stepCount; step++){
    const pos = step % Math.max(1, barSteps);
    if(preset === "rock_eighths"){
      if(step % eighth === 0) pattern[step] = pos === 0 ? "accent" : "open";
    } else if(preset === "punk_downstrokes"){
      if(step % eighth === 0) pattern[step] = "chug";
      if(pos === 0 || pos === beat * 2) pattern[step] = "accent";
    } else if(preset === "metal_chug"){
      if(step % Math.max(1, Math.round(res / 4)) === 0) pattern[step] = pos % beat === 0 ? "accent" : "chug";
    } else if(preset === "gallop"){
      const unit = Math.max(1, Math.round(res / 4));
      const slot = Math.floor(pos / unit) % 4;
      if(slot === 0 || slot === 1 || slot === 3) pattern[step] = slot === 0 ? "accent" : "chug";
    } else if(preset === "thrash_gallop"){
      const unit = Math.max(1, Math.round(res / 4));
      const slot = Math.floor(pos / unit) % 4;
      if(slot === 0 || slot === 1 || slot === 3) pattern[step] = slot === 0 ? "accent" : "chug";
    } else if(preset === "tremolo_drive"){
      const unit = Math.max(1, Math.round(res / 4));
      if(step % unit === 0) pattern[step] = pos === 0 || pos === beat * 2 ? "accent" : "chug";
    } else if(preset === "breakdown_stabs"){
      if(pos === 0 || pos === beat * 2) pattern[step] = "accent";
      else if(pos === Math.max(1, Math.round(beat / 2)) || pos === beat * 2 + Math.max(1, Math.round(beat / 2))) pattern[step] = "chug";
    } else if(preset === "doom_slow"){
      if(pos === 0 || pos === beat * 2) pattern[step] = "accent";
      else if(pos > 0) pattern[step] = "hold";
    } else if(preset === "verse_chorus"){
      const bar = Math.floor(step / barSteps);
      if(bar < 2){
        if(step % beat === 0) pattern[step] = pos === 0 ? "accent" : "open";
        else if(pos % beat !== 0) pattern[step] = "hold";
      } else if(step % eighth === 0){
        pattern[step] = pos === 0 || pos === beat * 2 ? "accent" : "chug";
      }
    } else if(preset === "boom_chick"){
      if(pos === 0 || pos === beat * 2) pattern[step] = "accent";
      else if(pos === beat || pos === beat * 3) pattern[step] = "scratch";
    } else if(preset === "train_chop"){
      const unit = Math.max(1, Math.round(res / 4));
      if(step % unit === 0){
        const slot = Math.floor(pos / unit) % 4;
        pattern[step] = slot === 0 ? "accent" : slot === 2 ? "open" : "chug";
      }
    } else if(preset === "western_waltz"){
      if(pos === 0) pattern[step] = "accent";
      else if(pos === beat || pos === beat * 2) pattern[step] = "scratch";
    }
  }
  state[sectionPropKey("guitarPattern", id)] = ensureGuitarPatternLength(pattern);
  if(id === state.currentSection) state.guitarPattern = state[sectionPropKey("guitarPattern", id)];
  state.guitarPatternPreset = preset;
  return preset;
}

function renderSingleMelodyRow(trackIndex){
  const steps = visibleSectionSteps();
  const row = document.createElement("div");
  row.className = "melody-row";
  row.style.setProperty("--steps", steps);
  const labels = currentLabels();
  const track = state.melodyTracks[trackIndex] || blankMelody();
  const holdTrack = state.melodyHold[trackIndex] || new Array(totalSteps()).fill(false);
  const slideTrack = state.melodySlide[trackIndex] || new Array(totalSteps()).fill(false);
  const isActive = state.activeMelodyTrack === trackIndex;

  const name = document.createElement("button");
  name.type = "button";
  name.className = "track-name" + (isActive ? " active" : "");
  name.textContent = `Mel ${trackIndex + 1}${isActive ? " *" : ""}`;
  name.addEventListener("click", ()=>{
    state.activeMelodyTrack = trackIndex;
    renderMelodyTrackChips();
    renderMelodyTrackControls();
    renderMelodyInstrumentSelect();
    renderMelodyOctaveChips();
    renderPads();
    renderMelodyRows();
  });
  row.appendChild(name);

  let holdDrag = null;
  let suppressClickStep = -1;
  const HOLD_DRAG_THRESHOLD = 10;
  const updateHoldDragTarget = (clientX=null, clientY=null) => {
    if(!holdDrag || clientX === null || clientY === null) return;
    const el = document.elementFromPoint(clientX, clientY);
    const stepEl = el && el.closest ? el.closest('.melody-row .cell[data-step]') : null;
    if(stepEl){
      holdDrag.targetStep = clamp(asInt(stepEl.dataset.step, holdDrag.startStep), 0, steps - 1);
    }
  };
  const finishHoldDrag = (clientX=null, clientY=null) => {
    if(!holdDrag) return;
    updateHoldDragTarget(clientX, clientY);
    const targetStep = holdDrag.targetStep ?? holdDrag.startStep;
    const wasDragging = !!holdDrag.dragging;
    if(wasDragging && targetStep === holdDrag.startStep - 1){
      toggleMelodyTriplet(trackIndex, targetStep);
      suppressClickStep = holdDrag.startStep;
    } else if(wasDragging && targetStep > holdDrag.startStep){
      const result = applyMelodyConnectionRange(trackIndex, holdDrag.startStep, targetStep);
      storeSection();
      renderMelodyRows();
      setStatus(result.slide ? `Connected melody track ${trackIndex + 1} with slide` : `Extended melody track ${trackIndex + 1} hold`);
      suppressClickStep = holdDrag.startStep;
    }
    holdDrag = null;
  };
  const handleGlobalHoldMove = (e) => {
    if(!holdDrag) return;
    const dx = Math.abs((e.clientX ?? holdDrag.startX) - holdDrag.startX);
    const dy = Math.abs((e.clientY ?? holdDrag.startY) - holdDrag.startY);
    if(dx >= HOLD_DRAG_THRESHOLD || dy >= HOLD_DRAG_THRESHOLD){
      holdDrag.dragging = true;
      if(holdDrag.cancelHold) holdDrag.cancelHold();
      e.preventDefault();
      updateHoldDragTarget(e.clientX, e.clientY);
    }
  };
  const handleGlobalHoldEnd = (e) => {
    if(!holdDrag) return;
    const x = e && typeof e.clientX === 'number' ? e.clientX : null;
    const y = e && typeof e.clientY === 'number' ? e.clientY : null;
    finishHoldDrag(x, y);
  };
  document.addEventListener('pointermove', handleGlobalHoldMove, {passive:false});
  document.addEventListener('pointerup', handleGlobalHoldEnd);
  document.addEventListener('pointercancel', handleGlobalHoldEnd);

  for(let i=0;i<steps;i++){
    const c = document.createElement("button");
    const isTupletStart = melodyTripletStart(getSectionData(state.currentSection, true), trackIndex, i);
    const hasNote = track[i] !== null && track[i] !== undefined;
    c.className = "cell melody" + ((track[i] !== null || holdTrack[i]) ? " on melody" : "") + (holdTrack[i] ? " hold" : "") + (slideTrack[i] ? " slide" : "") + melodyHoldVisualClasses(track, holdTrack, slideTrack, i, steps) + (isTupletStart ? " triplet-start" : "") + (i === state.currentStep ? " current" : "");
    if(isActive) c.style.borderColor = "var(--accent)";
    c.dataset.tip = `Tap empty cell to place ${selectedMelodyLabel()} on melody track ${trackIndex + 1}. Tap filled cell to cycle up. Drag right from a note to hold it. Drag onto a later different note to slide. Drag right-to-left across two adjacent notes to toggle a triplet: three notes play in the space of those two cells. Consecutive triplets use non-overlapping pairs like 1-2, 3-4. Long press to clear.`;
    c.dataset.step = String(i);
    c.textContent = melodyCellDisplay(track, holdTrack, slideTrack, i, labels);
    const melodyState = holdTrack[i] ? "hold" : hasNote ? `${melodyIndexLabel(track[i])}${slideTrack[i] ? ", slide" : ""}` : "off";
    c.setAttribute("aria-label", `Melody track ${trackIndex + 1}, step ${i + 1}, ${melodyState}${isTupletStart ? ", triplet start" : ""}`);
    c.setAttribute("aria-pressed", hasNote || !!holdTrack[i] ? "true" : "false");
    c.setAttribute("aria-describedby", "melodyKeyboardHelp");

    let holdTimer = null;
    let held = false;
    let restoreAfterKeyboardClick = false;
    const clearCell = () => {
      pushUndoState();
      state.melodyTracks[trackIndex][i] = null;
      if(state.melodyTuplets && state.melodyTuplets[trackIndex]){
        state.melodyTuplets[trackIndex][i] = false;
        if(i > 0) state.melodyTuplets[trackIndex][i - 1] = false;
      }
      holdTrack[i] = false;
      slideTrack[i] = false;
      clearMelodyHoldFrom(trackIndex, i + 1);
      clearMelodySlideFrom(trackIndex, i + 1);
      storeSection();
      renderMelodyRows();
      setStatus(`Melody track ${trackIndex + 1} note cleared`);
    };
    const startHold = () => {
      held = false;
      holdTimer = setTimeout(() => {
        clearCell();
        held = true;
        holdTimer = null;
      }, 450);
    };
    const cancelHold = () => {
      if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
    };

    c.addEventListener("keydown", event => {
      const command = event.key.toLowerCase();
      if(event.key === " " || event.key === "Enter") { restoreAfterKeyboardClick = true; return; }
      if(!["t","h","s","delete","backspace"].includes(command)) return;
      event.preventDefault();
      if(command === "delete" || command === "backspace") {
        clearCell();
        requestAnimationFrame(() => els.melodyRows?.querySelectorAll(".melody-row")[trackIndex]?.querySelector(`[data-step="${i}"]`)?.focus({preventScroll:true}));
        return;
      }
      if(command === "t"){
        pushUndoState();
        if(!toggleMelodyTriplet(trackIndex, i)) setStatus("Melody triplet needs two adjacent notes");
      } else {
        const nextHasNote = i < steps - 1 && track[i + 1] !== null && track[i + 1] !== undefined;
        if(!hasNote || i >= steps - 1 || (command === "h" && nextHasNote) || (command === "s" && (!nextHasNote || track[i + 1] === track[i]))){
          setStatus(command === "h" ? "Melody hold needs a note followed by an empty cell" : "Melody slide needs a different note in the next cell");
          return;
        }
        pushUndoState();
        const result = applyMelodyConnectionRange(trackIndex, i, i + 1);
        storeSection();
        renderMelodyRows();
        setStatus(result.slide ? `Melody track ${trackIndex + 1} slides to the next note` : `Melody track ${trackIndex + 1} holds into the next cell`);
      }
      requestAnimationFrame(() => els.melodyRows?.querySelectorAll(".melody-row")[trackIndex]?.querySelector(`[data-step="${i}"]`)?.focus({preventScroll:true}));
    });

    c.addEventListener("pointerdown", (e) => {
      if(track[i] !== null && !holdTrack[i]){
        holdDrag = {
          trackIndex,
          startStep:i,
          targetStep:i,
          startX:e.clientX,
          startY:e.clientY,
          dragging:false,
          cancelHold
        };
        pushUndoState();
        if(c.setPointerCapture && e.pointerId !== undefined){
          try{ c.setPointerCapture(e.pointerId); }catch(err){}
        }
        e.preventDefault();
      }
      startHold();
    });
    c.addEventListener("pointerup", cancelHold);
    c.addEventListener("pointercancel", cancelHold);
    c.addEventListener("pointerleave", () => { if(!holdDrag) cancelHold(); });

    c.addEventListener("click", async () => {
      if(suppressClickStep === i){ suppressClickStep = -1; return; }
      if(held || holdDrag) return;
      pushUndoState();
      state.activeMelodyTrack = trackIndex;
      if(holdTrack[i]) holdTrack[i] = false;
      if(slideTrack[i]) slideTrack[i] = false;
      if(state.melodyTuplets && state.melodyTuplets[trackIndex]){
        state.melodyTuplets[trackIndex][i] = false;
        if(i > 0) state.melodyTuplets[trackIndex][i - 1] = false;
      }
      const current = state.melodyTracks[trackIndex][i];
      if(current === null || current === undefined){
        state.melodyTracks[trackIndex][i] = state.selectedMelodyDegree;
      } else {
        state.melodyTracks[trackIndex][i] = (current + 1) % melodyNoteCount();
      }
      storeSection();
      renderMelodyTrackChips();
      renderMelodyRows();
      if(restoreAfterKeyboardClick){
        restoreAfterKeyboardClick = false;
        requestAnimationFrame(() => els.melodyRows?.querySelectorAll(".melody-row")[trackIndex]?.querySelector(`[data-step="${i}"]`)?.focus({preventScroll:true}));
      }
      await ensureAudio();
      playLeadInstrument(melodyIndexToMidi(state.melodyTracks[trackIndex][i]), audioCtx.currentTime, 0.28, state.melodyInstruments[trackIndex] || "pulse", melodyTrackPanValue(trackIndex), humanizePeak(1, i, 30 + trackIndex));
    });

    row.appendChild(c);
  }

  row._cleanup = () => {
    document.removeEventListener('pointermove', handleGlobalHoldMove);
    document.removeEventListener('pointerup', handleGlobalHoldEnd);
    document.removeEventListener('pointercancel', handleGlobalHoldEnd);
  };

  return row;
}

function renderMelodyRows(){
  if(!els.melodyRows) return;
  els.melodyRows.innerHTML = "";
  state.melodyHold = ensureMelodyHoldLength(state.melodyHold, state.melodyTracks.length);
  renderMelodyTrackChips();
  renderMelodyTrackControls();
  const visibleTracks = state.uiMode === "simple" ? state.melodyTracks.slice(0, simpleModeMelodyTrackCount()) : state.melodyTracks;
  visibleTracks.forEach((_, idx) => {
    els.melodyRows.appendChild(renderSingleMelodyRow(idx));
  });
}
function renderDrumPresetChips(){
  if(!els.drumPresetSelect) return;
  const previous = els.drumPresetSelect.value || "";
  els.drumPresetSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose beat preset...";
  els.drumPresetSelect.appendChild(placeholder);
  DRUM_PRESETS.filter(drumPresetVisible).forEach(preset => {
    const option = document.createElement("option");
    const label = drumPresetLabel(preset);
    option.value = preset.id;
    option.textContent = label;
    option.title = preset.tip || `Fill kick, snare and hat with a ${label} groove for the current section.`;
    els.drumPresetSelect.appendChild(option);
  });
  els.drumPresetSelect.value = [...els.drumPresetSelect.options].some(option => option.value === previous) ? previous : "";
  els.drumPresetSelect.dataset.tip = "Choose a beat preset to fill kick, snare and hats for the current section.";
}
let sequencerFocus = {track:"kick", step:0};
let restoreSequencerFocus = false;
function sequencerCellAccessibleName(track, step, details){
  const trackName = track.name || track.id;
  let cellState = "off";
  if(track.id === "bass" && state.bassMode === "manual"){
    if(details.bassManualOn){
      const noteLabel = melodyIndexLabel(details.bassManualIdx);
      cellState = `${noteLabel || "note"}${details.isAccent ? ", accent" : ""}`;
    } else if(details.bassHold) cellState = "hold";
  } else if(details.isOn){
    cellState = details.isAccent ? "accent" : "on";
  }
  if(details.bassSlide) cellState += ", slide";
  if(details.isTupletStart) cellState += ", triplet start";
  return `${trackName}, step ${step + 1}, ${cellState}`;
}
function focusSequencerCell(trackIndex, step){
  const rows = Array.from(els.seqRows?.querySelectorAll(".seq-row") || []);
  if(!rows.length) return;
  const nextRow = (trackIndex + rows.length) % rows.length;
  const cells = Array.from(rows[nextRow].querySelectorAll(".cell[data-step]"));
  if(!cells.length) return;
  const nextStep = clamp(step, 0, cells.length - 1);
  const target = cells[nextStep];
  rows.forEach(row => row.querySelectorAll(".cell[data-step]").forEach(cell => { cell.tabIndex = cell === target ? 0 : -1; }));
  sequencerFocus = {track:TRACKS[nextRow].id, step:nextStep};
  target.focus({preventScroll:true});
}
function renderSeq(){
  const steps = visibleSectionSteps();
  const section = getSectionData(state.currentSection, false);
  els.seqHeader.style.setProperty("--steps", steps);
  els.seqHeader.innerHTML = `<div class="track-name">Steps</div>`;
  for(let i=0;i<steps;i++){
    const d = document.createElement("div");
    d.className = "cell" + (i === state.currentStep ? " current" : "");
    d.dataset.step = String(i);
    const p = i % state.resolution;
    d.textContent = p === 0 ? (Math.floor(i/state.resolution)+1) : ".";
    els.seqHeader.appendChild(d);
  }
  Array.from(els.seqRows.children || []).forEach(rowEl => {
    if(rowEl && rowEl._cleanup) {
      if(Array.isArray(rowEl._cleanup)) rowEl._cleanup.forEach(fn => { try{ fn(); }catch(err){} });
      else if(typeof rowEl._cleanup === 'function') { try{ rowEl._cleanup(); }catch(err){} }
    }
  });
  els.seqRows.innerHTML = "";
  TRACKS.forEach((track, trackIndex) => {
    const row = document.createElement("div");
    row.className = "seq-row"; row.style.setProperty("--steps", steps);
    row.setAttribute("role", "row");
    row.setAttribute("aria-label", `${track.name} sequence`);
    const name = document.createElement("button");
    name.type = "button";
    name.className = "track-name" + (state.selectedTrack === track.id ? " active" : "");
    name.textContent = track.name;
    name.addEventListener("click", ()=>{
      state.selectedTrack = track.id;
      renderSeq();
      renderTrackChips();
    });
    row.appendChild(name);
    for(let i=0;i<steps;i++){
      const c = document.createElement("button");
      const cellLevel = normalizeBeatCell(state.grid[track.id][i]);
      const bassHold = track.id === "bass" && !!state.bassHold[i];
      const bassSlide = track.id === "bass" && !!state.bassSlide[i];
      const bassManualIdx = track.id === "bass" ? state.bassNotes[i] : null;
      const bassManualAccent = track.id === "bass" && !!state.bassAccent[i];
      const bassArticulation = track.id === "bass" ? safeChoice(state.bassArticulation?.[i],BASS_ARTICULATIONS,"finger") : "finger";
      const bassManualOn = track.id === "bass" && state.bassMode === "manual" && bassManualIdx !== null && bassManualIdx !== undefined;
      const isTupletStart = gridTripletStart(section, track.id, i);
      const bassAutoOn = track.id === "bass" && (cellLevel > 0 || bassHold);
      const isOn = track.id === "bass" ? (state.bassMode === "manual" ? (bassManualOn || bassHold) : bassAutoOn) : cellLevel > 0;
      const isAccent = track.id === "bass" ? (state.bassMode === "manual" ? bassManualAccent : cellLevel === 2) : cellLevel === 2;
      c.className = "cell " + track.id + (isOn ? ` on ${track.id}` : "") + (isAccent ? " accent" : "") + (bassSlide ? " slide" : "") + (isTupletStart ? " triplet-start" : "") + (i === state.currentStep ? " current" : "");
      if(track.id === "bass") c.style.touchAction = "none";
      c.dataset.step = String(i);
      c.setAttribute("aria-pressed", isOn ? "true" : "false");
      c.setAttribute("aria-label", sequencerCellAccessibleName(track, i, {cellLevel, bassHold, bassSlide, bassManualIdx, bassManualOn, isOn, isAccent, isTupletStart}));
      c.tabIndex = sequencerFocus.track === track.id && sequencerFocus.step === i ? 0 : -1;
      c.addEventListener("focus", () => { sequencerFocus = {track:track.id, step:i}; });
      c.addEventListener("keydown", (event) => {
        const command = event.key.toLowerCase();
        if(command === "t"){
          event.preventDefault();
          pushUndoState();
          restoreSequencerFocus = true;
          if(!toggleGridTriplet(track.id, i)){
            restoreSequencerFocus = false;
            setStatus("Triplet needs two adjacent active cells");
          }
          return;
        }
        if(track.id === "bass" && state.bassMode === "manual" && ["h","s","a","delete","backspace","1","2","3","4","5","6","7","8"].includes(command)){
          event.preventDefault();
          const hasNote = state.bassNotes[i] !== null && state.bassNotes[i] !== undefined;
          const nextHasNote = i < steps - 1 && state.bassNotes[i + 1] !== null && state.bassNotes[i + 1] !== undefined;
          if(command === "h" || command === "s"){
            if(!hasNote || i >= steps - 1 || (command === "h" && nextHasNote) || (command === "s" && (!nextHasNote || state.bassNotes[i + 1] === state.bassNotes[i]))){
              setStatus(command === "h" ? "Bass hold needs a note followed by an empty cell" : "Bass slide needs a different note in the next cell");
              return;
            }
            pushUndoState();
            const result = applyBassConnectionRange(i, i + 1);
            storeSection();
            restoreSequencerFocus = true;
            renderSeq();
            setStatus(result.slide ? "Connected bass to the next note with a slide" : "Held bass into the next cell");
            return;
          }
          if(!hasNote){ setStatus("Place a manual bass note first"); return; }
          pushUndoState();
          const directArticulation = {"1":"finger","2":"slap","3":"pop","4":"mute","5":"hammer","6":"pull","7":"slide","8":"hold"}[command];
          if(directArticulation){
            state.bassArticulation[i] = directArticulation;
            state.bassEditArticulation = directArticulation;
          } else if(command === "a") state.bassAccent[i] = !state.bassAccent[i];
          else {
            state.bassNotes[i] = null;
            state.bassAccent[i] = false;
            state.bassHold[i] = false;
            state.bassSlide[i] = false;
            state.bassArticulation[i] = "finger";
            clearBassHoldFrom(i + 1);
            clearBassSlideFrom(i + 1);
          }
          storeSection();
          restoreSequencerFocus = true;
          renderSeq();
          setStatus(directArticulation ? `Bass step ${i + 1}: ${directArticulation}` : command === "a" ? `Bass accent ${state.bassAccent[i] ? "on" : "off"}` : "Bass note cleared");
          return;
        }
        if((command === "delete" || command === "backspace") && track.id !== "bass"){
          event.preventDefault();
          pushUndoState();
          state.grid[track.id][i] = 0;
          if(state.gridTuplets?.[track.id]){
            state.gridTuplets[track.id][i] = false;
            if(i > 0) state.gridTuplets[track.id][i - 1] = false;
          }
          storeSection();
          restoreSequencerFocus = true;
          renderSeq();
          setStatus(`${track.name} step ${i + 1} cleared`);
          return;
        }
        let nextTrack = trackIndex;
        let nextStep = i;
        if(event.key === "ArrowLeft") nextStep--;
        else if(event.key === "ArrowRight") nextStep++;
        else if(event.key === "ArrowUp") nextTrack--;
        else if(event.key === "ArrowDown") nextTrack++;
        else if(event.key === "Home") nextStep = 0;
        else if(event.key === "End") nextStep = steps - 1;
        else if(event.key === " " || event.key === "Enter") { restoreSequencerFocus = true; return; }
        else return;
        event.preventDefault();
        focusSequencerCell(nextTrack, nextStep);
      });
      c.dataset.tip = (c.dataset.tip || "") + " Drag right-to-left across two adjacent hits to toggle a triplet: three hits play in the space of those two cells. Consecutive triplets use non-overlapping pairs like 1-2, 3-4.";
      c.textContent = track.id === "bass" ? bassCellDisplay(cellLevel, bassHold, bassSlide, bassManualIdx, bassManualAccent, bassArticulation) : beatCellLabel(track.id, cellLevel);
      let rhythmTripletDrag = null;
      let rhythmTripletSuppressClick = false;
      if(track.id !== "bass"){
        c.addEventListener("pointerdown", (e) => {
          if(normalizeBeatCell(state.grid[track.id][i]) > 0){
            rhythmTripletDrag = {startStep:i, startX:e.clientX, startY:e.clientY};
            try{ c.setPointerCapture && c.setPointerCapture(e.pointerId); }catch(err){}
          }
        });
        c.addEventListener("pointerup", (e) => {
          if(!rhythmTripletDrag) return;
          const dx = (rhythmTripletDrag.startX ?? e.clientX) - e.clientX;
          const dy = Math.abs((rhythmTripletDrag.startY ?? e.clientY) - e.clientY);
          const targetEl = document.elementFromPoint(e.clientX, e.clientY);
          const targetCell = targetEl && targetEl.closest ? targetEl.closest('.seq-row .cell[data-step]') : null;
          const targetStep = targetCell ? asInt(targetCell.dataset.step, i) : i - 1;
          if(dx > 12 && dy < 34 && targetStep === i - 1){
            pushUndoState();
            rhythmTripletSuppressClick = toggleGridTriplet(track.id, i - 1);
            e.preventDefault();
          }
          rhythmTripletDrag = null;
        });
        c.addEventListener("pointercancel", () => { rhythmTripletDrag = null; });
      }
      let bassDrag = null;
      let suppressClick = false;
      if(track.id === "bass"){
        const updateBassDragTarget = (clientX=null, clientY=null) => {
          if(!bassDrag || clientX === null || clientY === null) return;
          const el = document.elementFromPoint(clientX, clientY);
          const stepEl = el && el.closest ? el.closest('.seq-row .cell[data-step]') : null;
          if(stepEl) bassDrag.targetStep = clamp(asInt(stepEl.dataset.step, bassDrag.startStep), bassDrag.startStep, steps - 1);
        };
        const finishBassDrag = (clientX=null, clientY=null) => {
          if(!bassDrag) return;
          updateBassDragTarget(clientX, clientY);
          if(bassDrag.dragging && bassDrag.targetStep > bassDrag.startStep){
            const result = applyBassConnectionRange(bassDrag.startStep, bassDrag.targetStep);
            storeSection();
            renderSeq();
            setStatus(result.slide ? "Connected bass phrase with glide" : "Extended bass hold");
            suppressClick = true;
          }
          bassDrag = null;
        };
        const handleGlobalBassMove = (e) => {
          if(!bassDrag) return;
          const dx = Math.abs((e.clientX ?? bassDrag.startX) - bassDrag.startX);
          const dy = Math.abs((e.clientY ?? bassDrag.startY) - bassDrag.startY);
          if(dx >= 10 || dy >= 10){
            bassDrag.dragging = true;
            e.preventDefault();
            updateBassDragTarget(e.clientX, e.clientY);
          }
        };
        const handleGlobalBassEnd = (e) => {
          if(!bassDrag) return;
          const x = e && typeof e.clientX === 'number' ? e.clientX : null;
          const y = e && typeof e.clientY === 'number' ? e.clientY : null;
          finishBassDrag(x, y);
        };
        document.addEventListener('pointermove', handleGlobalBassMove, {passive:false});
        document.addEventListener('pointerup', handleGlobalBassEnd);
        document.addEventListener('pointercancel', handleGlobalBassEnd);
        c.addEventListener('pointerdown', (e)=>{
          const canStart = state.bassMode === "manual" ? (bassManualIdx !== null && bassManualIdx !== undefined) : cellLevel > 0;
          if(!canStart) return;
          pushUndoState();
          bassDrag = {startStep:i, targetStep:i, dragging:false, startX:e.clientX, startY:e.clientY};
          e.preventDefault();
          try{ c.setPointerCapture && c.setPointerCapture(e.pointerId); }catch(err){}
        });
        row._cleanup = row._cleanup || [];
        row._cleanup.push(() => {
          document.removeEventListener('pointermove', handleGlobalBassMove);
          document.removeEventListener('pointerup', handleGlobalBassEnd);
          document.removeEventListener('pointercancel', handleGlobalBassEnd);
        });
      }
      c.addEventListener("click", async () => {
        if(rhythmTripletSuppressClick){ rhythmTripletSuppressClick = false; return; }
        if(suppressClick){ suppressClick = false; return; }
        pushUndoState();
        if(track.id === "bass"){
          clearBassHoldFrom(i + 1);
          clearBassSlideFrom(i + 1);
          if(state.bassMode === "manual"){
            const current = state.bassNotes[i];
            if(current === null || current === undefined){
              state.bassNotes[i] = 0;
              state.bassAccent[i] = false;
              state.bassArticulation[i] = state.bassEditArticulation || "finger";
            } else if(current >= 13){
              state.bassNotes[i] = null;
              state.bassAccent[i] = false;
            } else {
              state.bassNotes[i] = current + 1;
              state.bassArticulation[i] = state.bassEditArticulation || state.bassArticulation[i] || "finger";
            }
            storeSection();
            renderSeq();
            if(state.bassNotes[i] !== null && state.bassNotes[i] !== undefined){
              await ensureAudio();
              const t = audioCtx.currentTime;
              const phrase = bassPhraseInfo(getSectionData(state.currentSection, false), i);
              const midi = bassStepMidiAt(getSectionData(state.currentSection, false), i);
              playBassPhrase(midi, t, phrase.dur, state.bassAccent[i] ? 0.42 : 0.34, !!state.bassAccent[i], phrase.slideMidi, phrase.slideOffset, bassArticulationAt(getSectionData(state.currentSection,false),i));
            }
            return;
          }
        }
        const nextLevel = (normalizeBeatCell(state.grid[track.id][i]) + 1) % 3;
        state.grid[track.id][i] = nextLevel;
        if(nextLevel === 0 && state.gridTuplets && state.gridTuplets[track.id]){
          state.gridTuplets[track.id][i] = false;
          if(i > 0) state.gridTuplets[track.id][i - 1] = false;
        }
        storeSection();
        renderSeq();
        if(nextLevel > 0){
          await ensureAudio(); const t = audioCtx.currentTime;
          const isAccent = nextLevel === 2;
          if(track.id === "kick") playKick(t, isAccent ? 1.12 : 0.95);
          if(track.id === "snare") playSnare(t, isAccent ? 0.72 : 0.5);
          if(track.id === "hat") playHat(t, isAccent ? 0.24 : 0.16, isAccent);
          if(track.id === "bass"){
            const section = getSectionData(state.currentSection, false);
            const phrase = bassPhraseInfo(section, i);
            playBassPhrase(bassStepMidiAt(section, i), t, phrase.dur, isAccent ? 0.42 : 0.34, isAccent, phrase.slideMidi, phrase.slideOffset, bassArticulationAt(section,i));
          }
        }
      });
      if(track.id === "bass" && state.bassMode === "manual"){
        let holdTimer = null;
        c.addEventListener('pointerdown', ()=>{
          holdTimer = setTimeout(()=>{
            if(state.bassNotes[i] === null || state.bassNotes[i] === undefined) return;
            pushUndoState();
            if(!state.bassAccent[i]){
              state.bassAccent[i] = true;
              storeSection();
              renderSeq();
              setStatus('Bass note accented');
            } else {
              state.bassNotes[i] = null;
              state.bassAccent[i] = false;
              state.bassHold[i] = false;
              state.bassSlide[i] = false;
              state.bassArticulation[i] = "finger";
              clearBassHoldFrom(i + 1);
              clearBassSlideFrom(i + 1);
              storeSection();
              renderSeq();
              setStatus('Bass note cleared');
            }
            holdTimer = null;
          }, 450);
        });
        const clearLong = ()=>{ if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; } };
        c.addEventListener('pointerup', clearLong);
        c.addEventListener('pointercancel', clearLong);
        c.addEventListener('pointerleave', clearLong);
      }
      row.appendChild(c);
    }
    els.seqRows.appendChild(row);
  });
  if(!els.seqRows.querySelector('.cell[data-step][tabindex="0"]')){
    const first = els.seqRows.querySelector('.cell[data-step]');
    if(first) first.tabIndex = 0;
  }
  if(restoreSequencerFocus){
    restoreSequencerFocus = false;
    requestAnimationFrame(() => {
      const trackIndex = Math.max(0, TRACKS.findIndex(track => track.id === sequencerFocus.track));
      focusSequencerCell(trackIndex, sequencerFocus.step);
    });
  }
}

function alignGuitarGridWidth(){
  if(!els.guitarRow) return;
  const refRow = els.seqRows ? els.seqRows.querySelector(".seq-row") : null;
  const refWidth = Math.max(
    els.seqHeader ? els.seqHeader.scrollWidth : 0,
    refRow ? refRow.scrollWidth : 0
  );
  if(refWidth > 0){
    els.guitarRow.style.width = `${refWidth}px`;
    els.guitarRow.style.minWidth = `${refWidth}px`;
  } else {
    els.guitarRow.style.width = "100%";
    els.guitarRow.style.minWidth = "100%";
  }
}

function renderGuitarPanel(){
  if(!els.guitarRow) return;
  const steps = visibleSectionSteps();
  const section = getSectionData(state.currentSection, false);
  state.guitarPattern = ensureGuitarPatternLength(state.guitarPattern || []);
  els.guitarRow.style.setProperty("--steps", steps);
  els.guitarRow.innerHTML = "";

  const name = document.createElement("button");
  name.type = "button";
  name.className = "track-name" + (state.guitarEnabled ? " active" : "");
  name.textContent = "Gtr";
  name.dataset.tip = "Guitar rhythm power-chord lane.";
  name.addEventListener("click", () => {
    pushUndoState();
    setGuitarEnabled(!state.guitarEnabled, true);
  });
  els.guitarRow.appendChild(name);

  for(let i=0; i<steps; i++){
    const art = normalizeGuitarArticulation(state.guitarPattern[i]);
    const c = document.createElement("button");
    c.className = "cell guitar" + (art !== "off" ? " on guitar" : "") + (art === "accent" ? " accent" : "") + (art === "chug" ? " chug" : "") + (art === "scratch" ? " scratch" : "") + (i === state.currentStep ? " current" : "");
    c.dataset.step = String(i);
    c.dataset.tip = `Guitar rhythm step: ${guitarArticulationTip(art)}. Tap to cycle rest, strum, palm mute, accent, hold and scratch.`;
    c.textContent = guitarArticulationLabel(art);
    c.setAttribute("aria-label", `Guitar, step ${i + 1}, ${art}`);
    c.setAttribute("aria-pressed", art === "off" ? "false" : "true");
    c.setAttribute("aria-describedby", "guitarKeyboardHelp");
    let restoreAfterKeyboardClick = false;
    c.addEventListener("keydown", event => {
      const direct = {"1":"open","2":"chug","3":"accent","4":"hold","5":"scratch"};
      const command = event.key.toLowerCase();
      if(event.key === " " || event.key === "Enter") { restoreAfterKeyboardClick = true; return; }
      const next = command === "delete" || command === "backspace" ? "off" : direct[command] || null;
      if(!next) return;
      event.preventDefault();
      event.stopPropagation();
      pushUndoState();
      state.guitarPattern[i] = next;
      storeSection();
      renderGuitarPanel();
      setStatus(`Guitar step ${i + 1}: ${next}`);
      requestAnimationFrame(() => els.guitarRow?.querySelector(`[data-step="${i}"]`)?.focus({preventScroll:true}));
    });
    c.addEventListener("click", async () => {
      pushUndoState();
      const order = ["off","open","chug","accent","hold","scratch"];
      const current = normalizeGuitarArticulation(state.guitarPattern[i]);
      state.guitarPattern[i] = order[(order.indexOf(current) + 1) % order.length];
      storeSection();
      renderGuitarPanel();
      if(restoreAfterKeyboardClick){
        restoreAfterKeyboardClick = false;
        requestAnimationFrame(() => els.guitarRow?.querySelector(`[data-step="${i}"]`)?.focus({preventScroll:true}));
      }
      if(state.guitarPattern[i] !== "off" && state.guitarPattern[i] !== "hold"){
        await ensureAudio();
        const bar = Math.floor(i / stepsPerBar());
        const notes = buildPowerChordNotes((section.progression || state.progression)[bar] || state.availableChords[0], state.guitarRegister);
        playGuitarVoice(audioCtx, guitarGain, notes, audioCtx.currentTime, guitarStepDuration(section, i, state.guitarPattern[i]), state.guitarPattern[i], state.guitarTone, guitarDirectionForStep(i), i);
      }
    });
    els.guitarRow.appendChild(c);
  }
  alignGuitarGridWidth();

  if(els.guitarFillStyleSelect) els.guitarFillStyleSelect.value = GUITAR_FILL_STYLES.includes(state.guitarPatternPreset) ? state.guitarPatternPreset : "gentle_strum";

  if(els.guitarPresetSelect){
    els.guitarPresetSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose rhythm preset...";
    els.guitarPresetSelect.appendChild(placeholder);
    guitarPatternPresetIds().forEach(id => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = guitarPatternPresetLabel(id);
      els.guitarPresetSelect.appendChild(option);
    });
    els.guitarPresetSelect.value = "";
    els.guitarPresetSelect.dataset.tip = "Choose a guitar rhythm preset for the current section.";
  }
}
function renderTrackChips(){
  els.trackChips.innerHTML = "";
  TRACKS.forEach(t => {
    const b = document.createElement("button");
    b.className = "chip" + (state.selectedTrack === t.id ? " active" : "");
    b.textContent = t.name;
    b.addEventListener("click", ()=>{ state.selectedTrack = t.id; renderTrackChips(); });
    els.trackChips.appendChild(b);
  });
}
function renderSectionCopyOptions(){
  if(!els.copyTargetSectionSelect) return;
  const previous = SECTION_IDS.includes(els.copyTargetSectionSelect.value) ? els.copyTargetSectionSelect.value : null;
  els.copyTargetSectionSelect.innerHTML = "";
  SECTION_IDS.forEach(id => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    els.copyTargetSectionSelect.appendChild(option);
  });
  const fallback = SECTION_IDS.find(id => id !== state.currentSection) || state.currentSection;
  els.copyTargetSectionSelect.value = previous && previous !== state.currentSection ? previous : fallback;
}
function renderSectionChips(){
  els.sectionChips.innerHTML = "";
  SECTION_IDS.forEach(s => {
    const b = document.createElement("button");
    b.className = "chip" + (state.currentSection === s ? " active" : "") + (state.currentPlaybackSection === s && state.isPlaying ? " playing" : "");
    b.textContent = s;
    b.title = `Section ${s}`;
    b.dataset.tip = `Edit Section ${s}.`;
    b.addEventListener("click", ()=>{ storeSection(); state.currentSection = s; syncSection(); renderAll(); });
    els.sectionChips.appendChild(b);
  });
  renderSectionCopyOptions();
}
function renderSectionSequence(){
  if(!els.sectionSequence) return;
  els.sectionSequence.innerHTML = "";
  const seq = sequenceList();
  if(els.addSequenceSlotBtn){
    els.addSequenceSlotBtn.disabled = !canAddSequenceSlot();
    els.addSequenceSlotBtn.style.opacity = canAddSequenceSlot() ? "1" : "0.5";
  }
  if(els.removeSequenceSlotBtn){
    els.removeSequenceSlotBtn.disabled = !canRemoveSequenceSlot();
    els.removeSequenceSlotBtn.style.opacity = canRemoveSequenceSlot() ? "1" : "0.5";
  }
  seq.forEach((sectionId, idx) => {
    const b = document.createElement("button");
    b.className = "chip sequence-slot" + (state.currentSequenceIndex === idx && state.isPlaying && state.playbackMode === "sequence" ? " playing" : "");
    b.textContent = sectionId;
    let holdTimer = null, held = false;
    const startHold = () => {
      held = false;
      holdTimer = setTimeout(() => {
        held = true;
        pushUndoState();
        state.songSequence.splice(idx, 1);
        if(!state.songSequence.length) state.songSequence = ["A"];
        renderSectionSequence();
      }, 450);
    };
    const endHold = () => { if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; } };
    b.addEventListener("touchstart", startHold, {passive:true});
    b.addEventListener("touchend", endHold); b.addEventListener("touchcancel", endHold);
    b.addEventListener("mousedown", startHold); b.addEventListener("mouseup", endHold); b.addEventListener("mouseleave", endHold);
    b.addEventListener("click", ()=>{
      if(held) return;
      pushUndoState();
      const current = sanitizeSectionId(state.songSequence[idx]);
      const nextIdx = (SECTION_IDS.indexOf(current) + 1) % SECTION_IDS.length;
      state.songSequence[idx] = SECTION_IDS[nextIdx];
      renderSectionSequence();
    });
    els.sectionSequence.appendChild(b);
  });
}
function highlightSlots(){
  [...els.progressionSlots.children].forEach((slot, i) => {
    slot.classList.toggle("playing", state.currentPlaybackSection === state.currentSection && Math.floor(state.currentStep / stepsPerBar()) === i && state.currentStep >= 0 && i < sectionBarCount());
  });
}

function applyTheme(){
  const themes = {
    night:{bg:"#0f1115",panel:"#171a21",panel2:"#1e2430",line:"#2b3242",text:"#eef2ff",muted:"#9eabc7",accent:"#7aa2ff",accent2:"#8ff0c6"},
    ocean:{bg:"#0d1720",panel:"#132430",panel2:"#193241",line:"#2d4b5d",text:"#edf9ff",muted:"#9cc6d4",accent:"#63b7ff",accent2:"#7ef0d7"},
    forest:{bg:"#101811",panel:"#17211a",panel2:"#213025",line:"#38503f",text:"#eef8ef",muted:"#a7c0ab",accent:"#8dcf7b",accent2:"#d9f29a"},
    sunset:{bg:"#201116",panel:"#2c1820",panel2:"#3a2029",line:"#5a3640",text:"#fff1ee",muted:"#ddb3a9",accent:"#ff9d6b",accent2:"#ffd27a"}
  };
  const t = themes[state.theme] || themes.night;
  const r = document.documentElement.style;
  r.setProperty("--bg", t.bg); r.setProperty("--panel", t.panel); r.setProperty("--panel2", t.panel2);
  r.setProperty("--line", t.line); r.setProperty("--text", t.text); r.setProperty("--muted", t.muted);
  r.setProperty("--accent", t.accent); r.setProperty("--accent2", t.accent2);
}
function applyUiMode(){
  document.querySelectorAll(".adv-only").forEach(el => el.classList.toggle("hidden", state.uiMode !== "advanced"));
  els.resolutionLabel.textContent = `Resolution: ${displayedResolutionName()}`;
}

function fillTrack(mode){
  pushUndoState();
  const t = state.selectedTrack;
  state.grid[t].fill(0);
  const beats = sectionBarCount() * state.timeSig;
  const res = activeResolution();

  for(let beat = 0; beat < beats; beat++){
    const start = beat * res;

    if(mode === "full"){
      state.grid[t][start] = 1;
      continue;
    }

    if(mode === "half"){
      if(res === 1){
        state.grid[t][start] = 1;
      } else {
        state.grid[t][start] = 1;
        const second = start + Math.floor(res / 2);
        if(second < start + res) state.grid[t][second] = 1;
      }
      continue;
    }

    if(mode === "quarter"){
      const quarterSpacing = Math.max(1, Math.round(res / 4));
      for(let s = 0; s < res; s += quarterSpacing){
        state.grid[t][start + s] = 1;
      }
      continue;
    }

    if(mode === "triplet"){
      if(!state.gridTuplets || !state.gridTuplets[t]) state.gridTuplets = ensureGridTupletLengths(state.gridTuplets || blankGridTuplets());
      if(res < 2){
        state.grid[t][start] = 1;
      } else {
        for(let s = 0; s < res; s += 2){
          const a = start + s;
          const b = a + 1;
          if(b < state.grid[t].length){
            state.grid[t][a] = 1;
            state.grid[t][b] = 1;
            state.gridTuplets[t][a] = true;
          }
        }
      }
    }
  }

  storeSection();
  renderSeq();
  if(state.uiMode === "advanced") renderMelodyRows();
  setStatus(`Filled ${t} with ${mode} pattern at ${displayedResolutionName()} resolution`);
}
function clearTrack(){ state.grid[state.selectedTrack].fill(0); storeSection(); renderSeq(); setStatus(`Cleared ${state.selectedTrack}`); }

function saveToSlot(n){
  try{
    localStorage.setItem(`pocket_chordsmith_slot_${n}`, JSON.stringify(exportProject()));
    setStatus(`Saved to slot ${n}`);
  }catch(e){
    setStatus("Could not save to local storage");
  }
}
function loadFromSlot(n){
  return loadProjectFromStorage(`pocket_chordsmith_slot_${n}`, `Slot ${n} is empty`, `Loaded slot ${n}`);
}
function refreshAutoSaveStatus(){
  if(!els.autoSaveStatus) return;
  try{
    const raw = localStorage.getItem("pocket_chordsmith_autosave");
    if(state.autosaveDirty) els.autoSaveStatus.textContent = "Auto-save pending";
    else els.autoSaveStatus.textContent = raw ? "Auto-save found; edits save every 60 seconds" : "Auto-save starts after first edit";
  }catch(e){
    els.autoSaveStatus.textContent = "Auto-save unavailable";
  }
}
function markProjectDirty(){
  state.autosaveDirty = true;
  if(els.autoSaveStatus) els.autoSaveStatus.textContent = "Auto-save pending";
}
function saveAutoSnapshot(force=false){
  const forceSave = force === true;
  if(!forceSave && !state.autosaveDirty){
    refreshAutoSaveStatus();
    return;
  }
  try{
    localStorage.setItem("pocket_chordsmith_autosave", JSON.stringify(exportProject()));
    state.autosaveDirty = false;
    if(els.autoSaveStatus) els.autoSaveStatus.textContent = `Auto-saved ${new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}`;
  }catch(e){
    if(els.autoSaveStatus) els.autoSaveStatus.textContent = "Auto-save unavailable";
  }
}
function loadAutoSnapshot(){
  const loaded = loadProjectFromStorage("pocket_chordsmith_autosave", "No auto-save found", "Loaded auto-save");
  if(loaded) state.autosaveDirty = false;
  refreshAutoSaveStatus();
  return loaded;
}
function snapshotProjectState(){
  storeSection();
  return JSON.stringify(exportProject());
}
function pushUndoState(){
  if(state.suspendUndo) return;
  markProjectDirty();
  try{
    const snap = snapshotProjectState();
    const last = state.undoStack[state.undoStack.length - 1];
    if(snap !== last){
      state.undoStack.push(snap);
      if(state.undoStack.length > 40) state.undoStack.shift();
    }
  }catch(e){}
}
function undoLastChange(){
  if(!state.undoStack.length){
    setStatus("Nothing to undo");
    return;
  }
  try{
    state.suspendUndo = true;
    const snap = state.undoStack.pop();
    importProject(JSON.parse(snap));
    markProjectDirty();
    setStatus("Undid last change");
  }catch(e){
    setStatus("Undo failed");
  }finally{
    state.suspendUndo = false;
  }
}
function editableShortcutTarget(target){
  if(!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}
async function previewCurrentChordSetting(message){
  if(audioCtx) silenceChordVoices(audioCtx.currentTime, 0.04);
  markProjectDirty();
  if(message) setStatus(message);
  try{
    await ensureAudio();
    const chord = currentPerformanceChord();
    if(chord) playChord(chord, audioCtx.currentTime + 0.015, 0.62);
  }catch(e){}
}
