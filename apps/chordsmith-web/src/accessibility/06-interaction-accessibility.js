function bindKeyboardShortcuts(){
  document.addEventListener("keydown", (ev) => {
    if(!(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey) return;
    if(String(ev.key || "").toLowerCase() !== "z") return;
    if(editableShortcutTarget(ev.target)) return;
    ev.preventDefault();
    undoLastChange();
  });
}
function updateMelodyInputModeUI(){
  const xy = state.melodyInputMode === "xy";
  if(els.xyPadWrap) els.xyPadWrap.style.display = xy ? "grid" : "none";
  if(els.xyPadControls) els.xyPadControls.style.display = xy ? "flex" : "none";
  if(els.melodyGridControls) els.melodyGridControls.style.display = xy ? "none" : "block";
  if(els.melodyDegreeSelect) els.melodyDegreeSelect.style.display = xy ? "none" : "";
  if(!xy){ clearXYLiveState(); }
  applyAdvancedVisibility();
}

function updateXYPadModeOptions(){
  if(!els.xyPadModeSelect) return;
  const rateOpt = [...els.xyPadModeSelect.options].find(opt => opt.value === "rate");
  const hideRate = state.xyPlaybackMode !== "pulse";
  if(hideRate){
    if(state.xyPadMode === "rate") state.xyPadMode = state.xyPlaybackMode === "sustain" ? "frequency" : "sustain";
    if(rateOpt) rateOpt.hidden = true;
  } else if(rateOpt) {
    rateOpt.hidden = false;
  }
  els.xyPadModeSelect.value = state.xyPadMode === "rate" && hideRate ? (state.xyPlaybackMode === "sustain" ? "frequency" : "sustain") : state.xyPadMode;
}

function clearXYLiveState(preserveReadout=false){
  state.xyLiveActive = false;
  state.xyLiveMidi = null;
  state.xyLastWriteStep = -1;
  if(els.xyPadMarker) els.xyPadMarker.style.display = "none";
  if(els.xyPadReadout && !preserveReadout) els.xyPadReadout.textContent = "Ready";
}
function triggerXYPadPulse(){
  return;
}

function currentPerformanceChord(){
  const bar = state.currentStep >= 0 ? Math.floor(state.currentStep / stepsPerBar()) : state.selectedSlot;
  return state.progression[Math.max(0, Math.min(MAX_BARS - 1, bar))] || state.availableChords[0];
}
function uniquePitchClasses(list){
  const out = [];
  list.forEach(pc => {
    const safe = ((pc % 12) + 12) % 12;
    if(!out.includes(safe)) out.push(safe);
  });
  return out;
}
function xyPulseInfo(y){
  const choices = [
    {label:"Whole", beats:state.timeSig},
    {label:"Half", beats:Math.max(1, state.timeSig / 2)},
    {label:"Quarter", beats:1},
    {label:"Eighth", beats:0.5},
    {label:"Sixteenth", beats:0.25}
  ];
  const safeY = Math.max(0, Math.min(0.9999, y));
  const idx = Math.max(0, Math.min(choices.length - 1, Math.floor((1 - safeY) * choices.length)));
  return choices[idx];
}
function xyPulseEventsForWindow(absStep, startTime, stepDur, intervalBeats=Math.max(state.xyLivePulseInterval || 1, 0.25)){
  const beatStart = absStep / activeResolution();
  const beatEnd = beatStart + (stepDur / beatDur());
  const epsilon = 0.00001;
  const firstIndex = Math.ceil((beatStart - epsilon) / intervalBeats);
  const out = [];
  for(let idx = firstIndex; ; idx++){
    const pulseBeat = idx * intervalBeats;
    if(pulseBeat >= beatEnd - epsilon) break;
    if(pulseBeat + epsilon < beatStart) continue;
    out.push({time:startTime + ((pulseBeat - beatStart) * beatDur()), index:idx});
  }
  if(!out.length && Math.abs((beatStart / intervalBeats) - Math.round(beatStart / intervalBeats)) < 0.0001){
    out.push({time:startTime, index:Math.round(beatStart / intervalBeats)});
  }
  return out;
}
function xyPulseTimesForWindow(absStep, startTime, stepDur){
  return xyPulseEventsForWindow(absStep, startTime, stepDur).map(ev => ev.time);
}
function xySustainDuration(){
  if(state.xyPadMode === "sustain") return state.xyLiveGate;
  if(state.xyPlaybackMode === "ostinato") return Math.max(0.08, Math.min(0.42, state.xyLiveGate));
  if(state.isPlaying) return Math.max(0.3, beatDur() * 0.95);
  return 0.4;
}
function xyOstinatoPattern(midis, midi){
  const ordered = (midis && midis.length ? midis.slice() : [midi]).sort((a,b)=>a-b);
  let anchor = ordered.findIndex(n => n === midi);
  if(anchor < 0){
    let bestDist = Infinity;
    ordered.forEach((n, idx) => {
      const dist = Math.abs(n - midi);
      if(dist < bestDist){ bestDist = dist; anchor = idx; }
    });
  }
  anchor = Math.max(0, anchor);
  const pick = offset => ordered[Math.max(0, Math.min(ordered.length - 1, anchor + offset))] ?? midi;
  return [pick(0), pick(2), pick(4), pick(2)];
}
function xyPitchPool(){
  const chord = currentPerformanceChord();
  const rootPc = state.xyChordFollow ? chord.root : noteIndex(state.key);
  let pcs = [];
  if(state.xyScaleMode === "pentatonic"){
    const intervals = state.scale === "major" ? [0,2,4,7,9] : [0,3,5,7,10];
    pcs = intervals.map(i => rootPc + i);
  } else if(state.xyScaleMode === "chord"){
    pcs = chord.intervals.map(i => chord.root + i);
    if(!state.xyChordFollow){
      const tonic = state.availableChords[0];
      pcs = tonic.intervals.map(i => tonic.root + i);
    }
  } else if(state.xyScaleMode === "shred"){
    const base = state.xyChordFollow ? chord.root : rootPc;
    const spicy = chord.quality === "maj" ? [0,2,4,6,7,9,11] : [0,3,5,6,7,10];
    pcs = spicy.map(i => base + i);
    pcs = pcs.concat((state.xyChordFollow ? chord.intervals : [0,3,7]).map(i => base + i));
  } else {
    const baseScale = buildScale(state.xyChordFollow ? NOTES[chord.root] : state.key, state.scale);
    pcs = baseScale.slice();
  }
  pcs = uniquePitchClasses(pcs);
  const pool = [];
  for(let oct = 0; oct < 3 && pool.length < 14; oct++){
    pcs.forEach(pc => {
      if(pool.length >= 14) return;
      const midi = 60 + pc + ((currentMelodyTrackOctave() + oct) * 12);
      pool.push({midi, pc});
    });
  }
  while(pool.length < 14){
    const last = pool[pool.length - 1] || {midi:60 + rootPc, pc:((rootPc%12)+12)%12};
    pool.push({midi:last.midi + 12, pc:last.pc});
  }
  return pool;
}
function xyPitchPoolMidis(){
  return xyPitchPool().map(item => item.midi);
}
function playLeadXY(midi, t, dur, instrument, brightness=1800){
  const cfg = leadInstrumentConfig(instrument);
  const filterFreq = state.xyPadMode === "frequency" ? brightness : cfg.freq;
  const pan = melodyTrackPanValue(state.activeMelodyTrack);
  playTone(midiToFreq(midi), t, dur * cfg.durMul, cfg.wave, leadGain, cfg.peak, cfg.filter, filterFreq, pan);
  if(instrument === "bell"){
    playTone(midiToFreq(midi + 12), t + 0.012, dur * 0.36, "sine", leadGain, 0.018, "lowpass", 3200, pan);
  }
}
let xyKeyboardX = 0;
let xyKeyboardY = 0.5;
async function handleXYPosition(rawX, rawY){
  const x = Math.max(0, Math.min(1, rawX));
  const y = Math.max(0, Math.min(1, rawY));
  xyKeyboardX = x;
  xyKeyboardY = y;
  const pool = xyPitchPool();
  const noteIdx = Math.max(0, Math.min(pool.length - 1, Math.floor(x * pool.length)));
  const pulseInfo = xyPulseInfo(y);
  const gate = 0.12 + ((1 - y) * 0.72);
  const brightness = 900 + ((1 - y) * 2200);
  const instrument = state.melodyInstruments[state.activeMelodyTrack] || "pulse";
  const pan = melodyTrackPanValue(state.activeMelodyTrack);
  const midi = pool[noteIdx].midi;
  state.xyLiveActive = true;
  state.xyLiveMidi = midi;
  state.xyLiveBrightness = brightness;
  state.xyLiveGate = gate;
  state.xyLivePulseInterval = pulseInfo.beats;
  state.xyLivePulseLabel = pulseInfo.label;
  state.xyLiveInstrument = instrument;
  state.xyLivePan = pan;
  if(els.xyPadMarker){
    els.xyPadMarker.style.display = "block";
    els.xyPadMarker.style.left = `${x * 100}%`;
    els.xyPadMarker.style.top = `${y * 100}%`;
  }
  if(els.xyPadReadout || els.xyPad){
    const chord = currentPerformanceChord();
    const modeLabel = state.xyScaleMode === "shred" ? "Shred" : state.xyScaleMode === "song" ? "Song" : state.xyScaleMode === "pentatonic" ? "Penta" : "Chord";
    const yLabel = state.xyPlaybackMode === "pulse"
      ? (state.xyPadMode === "frequency" ? `Freq ${Math.round(brightness)} Hz` : state.xyPadMode === "rate" ? pulseInfo.label : `Gate ${Math.round(gate * 1000)}ms`)
      : state.xyPlaybackMode === "ostinato"
        ? `Gate ${Math.round(gate * 1000)}ms`
        : (state.xyPadMode === "frequency" ? `Freq ${Math.round(brightness)} Hz` : `Sustain ${Math.round(gate * 1000)}ms`);
    const playLabel = state.xyPlaybackMode === "pulse" ? "Pulse" : state.xyPlaybackMode === "ostinato" ? "Ostinato" : "Sustain";
    const readout = `${NOTES[pool[noteIdx].pc]} - ${modeLabel} - ${playLabel} - ${yLabel}${state.xyChordFollow ? " - " + chord.name : ""}`;
    if(els.xyPadReadout) els.xyPadReadout.textContent = readout;
    if(els.xyPad){
      els.xyPad.setAttribute("aria-valuemax", String(pool.length));
      els.xyPad.setAttribute("aria-valuenow", String(noteIdx + 1));
      els.xyPad.setAttribute("aria-valuetext", readout);
    }
  }

  if(state.xyRecordToGrid && state.isPlaying && state.currentStep >= 0){
    const step = state.currentStep;
    if(step !== state.xyLastWriteStep){
      pushUndoState();
      state.melodyTracks[state.activeMelodyTrack][step] = noteIdx;
      state.xyLastWriteStep = step;
      storeSection();
      renderMelodyRows();
    }
  }

  await ensureAudio();
  if((state.xyPlaybackMode === "pulse" || state.xyPlaybackMode === "ostinato") && state.isPlaying) return;
  const liveDur = xySustainDuration();
  playLeadXY(midi, audioCtx.currentTime, liveDur, instrument, brightness);
}
async function handleXYPad(clientX, clientY){
  if(!els.xyPad) return;
  const rect = els.xyPad.getBoundingClientRect();
  await handleXYPosition((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
}

function toggleSettings(open=null){
  const wasOpen = state.settingsOpen;
  state.settingsOpen = open === null ? !state.settingsOpen : !!open;
  els.settingsModal.classList.toggle("open", state.settingsOpen);
  els.settingsModal.setAttribute("aria-hidden", state.settingsOpen ? "false" : "true");
  document.querySelectorAll(".app, .mini-transport").forEach(node => {
    node.toggleAttribute("inert", state.settingsOpen);
    node.inert = state.settingsOpen;
  });
  document.body.classList.toggle("modal-open", state.settingsOpen);
  if(state.settingsOpen && !wasOpen){
    state.settingsGenre = detectActiveGenre();
    renderGenreDrawer();
    settingsFocusReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : els.settingsBtn;
    requestAnimationFrame(() => {
      const target = els.closeSettingsBtn || els.settingsModal.querySelector(".modal-window");
      if(target && target.focus) target.focus({preventScroll:true});
    });
  } else if(!state.settingsOpen && wasOpen && settingsFocusReturn && settingsFocusReturn.focus){
    state.settingsGenreDrawerOpen = false;
    renderGenreDrawer();
    settingsFocusReturn.focus({preventScroll:true});
    settingsFocusReturn = null;
  }
}
function genreDisplayName(genre){
  return {clean:"Clean", lofi:"Lofi / Chill", chip:"Chip Tune", metal:"Heavy Metal", western:"Western",funk:"Funk"}[genre] || "Clean";
}
function renderGenreDrawer(){
  const activeGenre = safeChoice(state.settingsGenre || detectActiveGenre(), ["clean","lofi","chip","metal","western","funk"], "clean");
  state.settingsGenre = activeGenre;
  if(els.genreDrawer){
    els.genreDrawer.classList.toggle("open", !!state.settingsGenreDrawerOpen);
    els.genreDrawer.setAttribute("aria-hidden", state.settingsGenreDrawerOpen ? "false" : "true");
  }
  if(els.genreDrawerBtn){
    els.genreDrawerBtn.setAttribute("aria-expanded", state.settingsGenreDrawerOpen ? "true" : "false");
    els.genreDrawerBtn.textContent = state.settingsGenreDrawerOpen ? "Hide Genre" : "Genre";
  }
  if(els.genreSummary){
    const projectGenre = detectActiveGenre();
    els.genreSummary.textContent = state.settingsGenreDrawerOpen
      ? `${genreDisplayName(activeGenre)} controls are open.`
      : `Current sound family: ${genreDisplayName(projectGenre)}.`;
  }
  document.querySelectorAll(".genre-tab").forEach(tab => {
    const selected = tab.dataset.genre === activeGenre;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll(".genre-panel").forEach(panel => {
    const selected = panel.dataset.genrePanel === activeGenre;
    panel.classList.toggle("active", selected);
    panel.toggleAttribute("hidden", !selected);
  });
  const westernPreset = westernPresetConfig(state.westernPreset);
  if(els.westernPresetSelect) els.westernPresetSelect.value = sanitizeWesternPresetId(state.westernPreset) || "western_frontier_ride";
  if(els.westernDrumPresetSelect){
    els.westernDrumPresetSelect.value = safeChoice(state.drumGroovePreset || westernPreset.drumGroovePreset, ["boom_chick","train_beat","cowboy_waltz"], westernPreset.drumGroovePreset);
  }
  if(els.westernGuitarPresetSelect){
    els.westernGuitarPresetSelect.value = safeChoice(state.guitarPatternPreset || westernPreset.guitarPatternPreset, ["boom_chick","train_chop","western_waltz"], westernPreset.guitarPatternPreset);
  }
  if(els.funkPresetSelect) els.funkPresetSelect.value = state.funkPreset || "funk_classic_pocket";
  if(els.funkPocket) els.funkPocket.value = String(state.funkParameters?.pocket ?? DEFAULT_FUNK_PARAMETERS.pocket);
  if(els.funkSlap) els.funkSlap.value = String(state.funkParameters?.slapAmount ?? DEFAULT_FUNK_PARAMETERS.slapAmount);
  if(els.funkGhost) els.funkGhost.value = String(state.funkParameters?.ghostNotes ?? DEFAULT_FUNK_PARAMETERS.ghostNotes);
}
function openGenreDrawer(genreId=null){
  state.settingsGenre = safeChoice(genreId || state.settingsGenre || detectActiveGenre(), ["clean","lofi","chip","metal","western","funk"], "clean");
  state.settingsGenreDrawerOpen = true;
  renderGenreDrawer();
  requestAnimationFrame(() => {
    const activeTab = els.genreDrawer?.querySelector(".genre-tab.active");
    if(activeTab && activeTab.focus) activeTab.focus({preventScroll:true});
  });
}
function closeGenreDrawer(){
  state.settingsGenreDrawerOpen = false;
  renderGenreDrawer();
  if(els.genreDrawerBtn && els.genreDrawerBtn.focus) els.genreDrawerBtn.focus({preventScroll:true});
}
function selectSettingsGenre(genreId){
  state.settingsGenre = safeChoice(genreId, ["clean","lofi","chip","metal","western","funk"], "clean");
  state.settingsGenreDrawerOpen = true;
  renderGenreDrawer();
}
function applyCleanGenreToProject(){
  pushUndoState();
  state.audioProfile = WESTERN_AUDIO_PROFILE_ID;
  state.lofiPreset = "";
  state.lofiTexture = {...DEFAULT_LOFI_TEXTURE, enabled:false};
  state.chipPreset = "";
  state.chipTexture = {...DEFAULT_CHIP_TEXTURE, enabled:false};
  state.metalPreset = "";
  state.metalTexture = {...DEFAULT_METAL_TEXTURE, enabled:false};
  state.funkPreset = "";
  state.funkParameters = {...DEFAULT_FUNK_PARAMETERS};
  state.funkPreset = "";
  state.metalPreset = "";
  state.metalTexture = {...DEFAULT_METAL_TEXTURE, enabled:false};
  state.drumKit = "classic";
  state.drumGroovePreset = "";
  state.bassTone = "classic";
  state.chordInstrument = "pocket";
  state.guitarTone = "high_gain";
  state.westernPreset = "western_frontier_ride";
  state.settingsGenre = "clean";
  markProjectDirty();
  renderAll();
  setStatus("Clean Pocket Chordsmith sound restored");
}
function bindHorizontalWheelScroll(){
  document.querySelectorAll(".sequencer-wrap").forEach(wrap => {
    wrap.addEventListener("wheel", (e) => {
      const maxScroll = wrap.scrollWidth - wrap.clientWidth;
      if(maxScroll <= 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const nextLeft = clamp(wrap.scrollLeft + e.deltaY, 0, maxScroll);
      if(nextLeft === wrap.scrollLeft) return;

      wrap.scrollLeft = nextLeft;
      e.preventDefault();
    }, {passive:false});
  });
}
function applyTooltips(){
  bindTooltipLayer();
  document.querySelectorAll('[data-tip]').forEach(el=>{
    if(state.tooltipsOn) el.classList.add('has-tip');
    else el.classList.remove('has-tip');
  });
  if(!state.tooltipsOn) hideHoverTooltip();
}
function ensureHoverTooltip(){
  if(!hoverTooltipEl){
    hoverTooltipEl = document.createElement("div");
    hoverTooltipEl.className = "hover-tooltip";
    hoverTooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(hoverTooltipEl);
  }
  return hoverTooltipEl;
}
function tooltipTargetFromEvent(event){
  const target = event.target && event.target.closest ? event.target.closest(".has-tip[data-tip]") : null;
  return target && document.body.contains(target) ? target : null;
}
function positionHoverTooltip(target=activeTooltipTarget){
  if(!target || !hoverTooltipEl || !hoverTooltipEl.classList.contains("show")) return;
  const rect = target.getBoundingClientRect();
  const gap = 8;
  const margin = 10;
  const tipRect = hoverTooltipEl.getBoundingClientRect();
  let left = clamp(rect.left, margin, window.innerWidth - tipRect.width - margin);
  let top = rect.bottom + gap;
  if(top + tipRect.height > window.innerHeight - margin) top = rect.top - tipRect.height - gap;
  if(top < margin) top = margin;
  hoverTooltipEl.style.left = `${Math.round(left)}px`;
  hoverTooltipEl.style.top = `${Math.round(top)}px`;
}
function showHoverTooltip(target){
  if(!state.tooltipsOn || !target) return;
  const text = String(target.dataset.tip || "").trim();
  if(!text) return;
  const tip = ensureHoverTooltip();
  activeTooltipTarget = target;
  tip.textContent = text;
  tip.classList.add("show");
  positionHoverTooltip(target);
}
function hideHoverTooltip(){
  activeTooltipTarget = null;
  if(hoverTooltipEl) hoverTooltipEl.classList.remove("show");
}
function bindTooltipLayer(){
  if(tooltipLayerBound) return;
  tooltipLayerBound = true;
  document.addEventListener("pointerover", event => showHoverTooltip(tooltipTargetFromEvent(event)), true);
  document.addEventListener("pointermove", () => positionHoverTooltip(), true);
  document.addEventListener("pointerout", event => {
    if(!activeTooltipTarget) return;
    const next = event.relatedTarget;
    if(next && activeTooltipTarget.contains(next)) return;
    hideHoverTooltip();
  }, true);
  document.addEventListener("focusin", event => showHoverTooltip(tooltipTargetFromEvent(event)), true);
  document.addEventListener("focusout", hideHoverTooltip, true);
  window.addEventListener("scroll", hideHoverTooltip, true);
  window.addEventListener("resize", hideHoverTooltip);
}

function clearWavOutput(){
  if(state.wavUrl){
    try{ URL.revokeObjectURL(state.wavUrl); }catch(e){}
    state.wavUrl = null;
  }
  state.wavBlob = null;
  state.wavFile = null;

  if(els.wavPreview){
    try{ els.wavPreview.pause(); }catch(e){}
    els.wavPreview.removeAttribute("src");
    try{ els.wavPreview.load(); }catch(e){}
  }
  if(els.wavOpenLink){
    els.wavOpenLink.removeAttribute("href");
  }
  if(els.wavDownloadLink){
    els.wavDownloadLink.removeAttribute("href");
  }
  if(els.wavShareBtn) els.wavShareBtn.style.display = "none";
  if(els.wavResultBox) els.wavResultBox.style.display = "none";
  if(!state.wavExporting) setWavProgress("");
}
function setWavProgress(text){
  if(els.wavProgressText) els.wavProgressText.textContent = text || "";
}
function updateWavExportUi(){
  if(els.exportWavBtn){
    els.exportWavBtn.disabled = !!state.wavExporting;
    els.exportWavBtn.setAttribute("aria-busy", state.wavExporting ? "true" : "false");
  }
  if(els.cancelWavExportBtn) els.cancelWavExportBtn.style.display = state.wavExporting ? "inline-flex" : "none";
}
function cancelWavExport(){
  if(!state.wavExporting) return;
  state.wavExportToken++;
  state.wavExporting = false;
  updateWavExportUi();
  setWavProgress("WAV export cancelled. The phone may finish clearing the render for a moment.");
  setStatus("WAV export cancelled");
}

function setWavOutput(blob){
  clearWavOutput();

  state.wavBlob = blob;
  state.wavUrl = URL.createObjectURL(blob);

  if(els.wavPreview){
    els.wavPreview.src = state.wavUrl;
    try{ els.wavPreview.load(); }catch(e){}
  }
  if(els.wavOpenLink) els.wavOpenLink.href = state.wavUrl;
  if(els.wavDownloadLink) els.wavDownloadLink.href = state.wavUrl;
  if(els.wavResultBox) els.wavResultBox.style.display = "grid";

  // File constructor is not supported reliably on all mobile browsers.
  // Preview/open/download must work even if File creation fails.
  try{
    if(typeof File !== "undefined"){
      state.wavFile = new File([blob], "pocket_chordsmith_export.wav", {type:"audio/wav"});
    }
  }catch(e){
    state.wavFile = null;
  }

  let canShareFile = false;
  try{
    canShareFile = !!(state.wavFile && navigator.share && navigator.canShare && navigator.canShare({files:[state.wavFile]}));
  }catch(e){
    canShareFile = false;
  }
  if(els.wavShareBtn) els.wavShareBtn.style.display = canShareFile ? "inline-flex" : "none";
}

async function shareWavOutput(){
  try{
    if(!state.wavBlob || !navigator.share){
      setStatus("Share not supported for WAV on this browser");
      return;
    }

    let file = state.wavFile;
    if(!file && typeof File !== "undefined"){
      try{
        file = new File([state.wavBlob], "pocket_chordsmith_export.wav", {type:"audio/wav"});
      }catch(e){
        file = null;
      }
    }

    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({
        files:[file],
        title:"Pocket Chordsmith WAV",
        text:"Exported from Pocket Chordsmith"
      });
      return;
    }

    setStatus("Use Open WAV or Download WAV on this browser");
  }catch(e){}
}
