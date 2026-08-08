function helpFocusable(){
  return Array.from(el.helpOverlay?.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') || []).filter(node => !node.disabled && node.offsetParent !== null);
}
function openHelp(event){
  if(!el.helpOverlay) return;
  helpReturnFocus = event?.currentTarget || document.activeElement;
  el.helpOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => el.helpCloseBtn?.focus());
}
function closeHelp(){
  if(!el.helpOverlay || el.helpOverlay.classList.contains("hidden")) return;
  el.helpOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  if(helpReturnFocus?.isConnected) helpReturnFocus.focus();
  helpReturnFocus = null;
}

/* 11. Event handlers */
function bindHandlers(){
  el.importBtn.addEventListener("click", handleImport);
  el.importText.addEventListener("input", () => setImportError());
  el.importHelpBtn?.addEventListener("click", openHelp);
  el.deckHelpBtn?.addEventListener("click", openHelp);
  el.helpCloseBtn?.addEventListener("click", closeHelp);
  el.helpOverlay?.addEventListener("click", e => { if(e.target === el.helpOverlay) closeHelp(); });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") closeHelp();
    if(e.key === "Tab" && el.helpOverlay && !el.helpOverlay.classList.contains("hidden")){
      const items = helpFocusable();
      if(!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  });
  el.demoBtn.addEventListener("click", loadDemo);
  el.lofiDemoBtn?.addEventListener("click", loadLofiDemo);
  el.chipDemoBtn?.addEventListener("click", loadChipDemo);
  el.metalDemoBtn?.addEventListener("click", loadMetalDemo);
  el.loadLastBtn.addEventListener("click", loadLocalSession);
  el.loadLastDeckBtn.addEventListener("click", loadLocalSession);
  el.saveBtn.addEventListener("click", () => { saveLocalSession(); showStatus("Session saved"); });
  el.clearSessionBtn.addEventListener("click", () => {
    if(window.confirm("Clear this saved Pocket DJ session? This cannot be undone.")) clearLocalSession();
  });
  el.editSourceBtn.addEventListener("click", editSourceSongInChordsmith);
  el.playBtn.addEventListener("click", () => state.playing ? stopPlayback() : startPlayback());
  el.stopBtn.addEventListener("click", stopPlayback);
  el.restartBtn.addEventListener("click", restartPlayback);
  el.loopBtn.addEventListener("click", toggleSectionLoop);
  el.sequencePlayBtn.addEventListener("click", toggleSequencePlayback);
  el.sequenceRepeatBtn.addEventListener("click", toggleSequenceRepeat);
  el.launchModeSelect.addEventListener("change", () => { session.performance.launchQuantize = ["instant","bar","section"].includes(el.launchModeSelect.value) ? el.launchModeSelect.value : "bar"; autosave(); renderTransportState(); showStatus(`Launch mode: ${launchModeLabel()}`); });
  el.masterVolume.addEventListener("input", () => { if(session){ session.performance.masterVolume = clamp(asNum(el.masterVolume.value,.82),0,1); applyMixerAndFx(); autosave(false); }});
  el.buildBtn.addEventListener("click", triggerBuild);
  el.dropBtn.addEventListener("click", triggerDrop);
  el.gentleBuildBtn?.addEventListener("click", () => triggerLofiMacro("gentle"));
  el.rainyDropBtn?.addEventListener("click", () => triggerLofiMacro("rainy"));
  el.filteredStudyBtn?.addEventListener("click", () => triggerLofiMacro("study"));
  el.tapeResetBtn?.addEventListener("click", () => triggerLofiMacro("tape"));
  el.funkOneDropBtn?.addEventListener("click", () => triggerFunkMacro("oneDrop"));
  el.funkBassMuteBtn?.addEventListener("click", () => triggerFunkMacro("bassMute"));
  el.funkSlapPopBtn?.addEventListener("click", () => triggerFunkMacro("slapPopEmphasis"));
  el.funkGhostLiftBtn?.addEventListener("click", () => triggerFunkMacro("ghostLift"));
  el.funkPhraseFillBtn?.addEventListener("click", () => triggerFunkMacro("phraseFill"));
  el.resetFxBtn.addEventListener("click", () => resetFx(true));
  document.addEventListener("input", e => {
    const stem = e.target?.dataset?.stemVolume;
    if(stem) setStemVolume(stem, e.target.value);
    const fx = e.target?.dataset?.fx;
    if(fx === "filter") setMasterFilter(e.target.value);
    if(fx === "echo") setEchoAmount(e.target.value);
    if(fx === "reverb") setReverbAmount(e.target.value);
  });
  document.addEventListener("click", e => {
    const stem = e.target?.dataset?.mute;
    if(stem && session) setStemMute(stem, !session.performance.stemMutes[stem]);
  });
}
async function handleImport(){
  try{
    await loadPocketAudioCoreModule().catch(() => null);
    const parsed = parseAnyImportText(el.importText.value);
    session = parsed.kind === "pdj" ? normalizePocketDjSession(parsed.data) : createDjSessionFromChordsmithProject(sanitizePocketChordsmithProject(parsed.data), parsed.data);
    state.currentSection = session.performance.currentSection;
    state.currentStepForSchedule = 0;
    state.dropQueued = false;
    state.dropBoundaryScheduled = false;
    state.dropLanding = false;
    resetPerformanceStemScales(1);
    clearPerformanceFx();
    primePocketAudioCore(session.source.project, parsed.kind === "pdj" ? "PDJ source project" : "PCS import");
    setImportError();
    saveLocalSession(); renderAll(); showStatus(parsed.kind === "pdj" ? "Pocket DJ session loaded" : "Pocket Chordsmith project imported");
  }catch(e){
    const message = e.message || "Import failed";
    setImportError(message);
    showStatus(message);
  }
}
async function consumeIncomingPocketDjHandoff(){
  const payload = readUrlHandoff() || readWindowNameHandoff() || readStoredHandoff(HANDOFF_TO_DJ_KEY);
  if(!isExpectedHandoff(payload, "pcs-to-dj")) return false;
  if(el.importText) el.importText.value = payload.code;
  try{
    await loadPocketAudioCoreModule().catch(() => null);
    const parsed = parseAnyImportText(payload.code);
    session = parsed.kind === "pdj" ? normalizePocketDjSession(parsed.data) : createDjSessionFromChordsmithProject(sanitizePocketChordsmithProject(parsed.data), parsed.data);
    state.currentSection = session.performance.currentSection;
    state.currentStepForSchedule = 0;
    state.dropQueued = false;
    state.dropBoundaryScheduled = false;
    state.dropLanding = false;
    resetPerformanceStemScales(1);
    clearPerformanceFx();
    primePocketAudioCore(session.source.project, parsed.kind === "pdj" ? "PDJ handoff source" : "PCS handoff");
    clearStoredHandoff(HANDOFF_TO_DJ_KEY);
    clearUrlHandoff();
    saveLocalSession();
    renderAll();
    showStatus(parsed.kind === "pdj" ? "Pocket DJ session received" : "Song received from Pocket Chordsmith");
    return true;
  }catch(e){
    showStatus(e.message || "Handoff import failed");
    return false;
  }
}

/* 12. Local save/load */
function hasLocalSession(){ try{return !!localStorage.getItem(LOCAL_KEY);}catch(e){return false;} }
function saveLocalSession(){ try{ if(session) localStorage.setItem(LOCAL_KEY, JSON.stringify(exportPocketDjSession(session))); }catch(e){} }
function autosave(render=false){ saveLocalSession(); if(render) renderAll(); }
function loadLocalSession(){
  try{
    const raw = localStorage.getItem(LOCAL_KEY);
    if(!raw) return showStatus("No saved Pocket DJ session yet.");
    session = normalizePocketDjSession(JSON.parse(raw));
    state.currentSection = session.performance.currentSection;
    state.currentStepForSchedule = 0; state.currentStep = -1; state.dropQueued = false; state.dropBoundaryScheduled = false; state.dropLanding = false; resetPerformanceStemScales(1); clearPerformanceFx(); session.performance.buildActive = false;
    primePocketAudioCore(session.source.project, "saved session source");
    renderAll(); applyMixerAndFx(); showStatus("Last session loaded");
  }catch(e){ showStatus("Could not load the last session."); }
}
function clearLocalSession(){
  try{ localStorage.removeItem(LOCAL_KEY); }catch(e){}
  stopPlayback(); session = null; renderShell(); showStatus("Session cleared");
}

/* 13. Demo data */
function makeDemoProject(){
  const resolution = 4, timeSig = 4, len = MAX_BARS * timeSig * resolution;
  const blankGrid = () => ({kick:new Array(len).fill(0),snare:new Array(len).fill(0),hat:new Array(len).fill(0),bass:new Array(len).fill(0)});
  const blankBoolGrid = () => ({kick:new Array(len).fill(false),snare:new Array(len).fill(false),hat:new Array(len).fill(false),bass:new Array(len).fill(false)});
  const mel = () => new Array(len).fill(null);
  const bool = () => new Array(len).fill(false);
  const project = {projectVersion:16,title:"Pocket DJ Demo",theme:"sunset",key:"A",scale:"minor",timeSig,bpm:118,swing:.04,resolution,chordType:"seventh",chordInstrument:"warm_pad",chordPlayMode:"strum_up",chordRhythmMode:"sustain",chordOctave:0,melodyPitchMode:"scale",bassMode:"auto",guitarEnabled:true,guitarTone:"high_gain",guitarRegister:"low",guitarStrumMode:"alternate",guitarVolume:.72,fxDelay:.08,fxReverb:.1,fxMix:.65,sidechainOn:true,sidechainAmount:.45,sectionBars:{A:2,B:2,C:2,D:2,E:2,F:2,G:2,H:2},songSequence:["A","A","B","C","D","B","A"]};
  SECTION_IDS.forEach(id => {
    project[sectionKey("progression",id)] = id === "C" ? [0,3,5,4] : id === "D" ? [5,6,0,0] : [0,5,2,6];
    project[sectionKey("grid",id)] = blankGrid(); project[sectionKey("gridTuplets",id)] = blankBoolGrid();
    project[sectionKey("melodyTracks",id)] = [mel()]; project[sectionKey("melodyInstruments",id)] = [id === "C" ? "lead_guitar" : "synth"];
    project[sectionKey("melodyOctaves",id)] = [0]; project[sectionKey("melodyMute",id)] = [false]; project[sectionKey("melodySolo",id)] = [false]; project[sectionKey("melodyPan",id)] = [0];
    project[sectionKey("melodyHold",id)] = [bool()]; project[sectionKey("melodySlide",id)] = [bool()]; project[sectionKey("melodyTuplets",id)] = [bool()];
    project[sectionKey("bassNotes",id)] = new Array(len).fill(null); project[sectionKey("bassHold",id)] = bool(); project[sectionKey("bassSlide",id)] = bool(); project[sectionKey("bassAccent",id)] = bool(); project[sectionKey("guitarPattern",id)] = new Array(len).fill("off");
  });
  function fillSection(id, style){
    const g = project[sectionKey("grid",id)], m = project[sectionKey("melodyTracks",id)][0], gh = project[sectionKey("guitarPattern",id)];
    for(let bar=0; bar<2; bar++){
      const o = bar*16;
      [0,8].forEach(p=>g.kick[o+p]=1); [4,12].forEach(p=>g.snare[o+p]=2); [0,2,4,6,8,10,12,14].forEach(p=>g.hat[o+p]=1); [0,8,12].forEach(p=>g.bass[o+p]=1);
      if(style === "busy"){ [2,10,14].forEach(p=>g.kick[o+p]=1); [3,7,11,15].forEach(p=>g.hat[o+p]=2); }
      if(style === "half"){ g.snare[o+4]=0; g.snare[o+8]=2; g.kick[o+10]=1; }
      if(style === "drop"){ [0,4,8,12].forEach(p=>g.kick[o+p]=1); [2,6,10,14].forEach(p=>g.hat[o+p]=2); g.snare[o+4]=2; g.snare[o+12]=2; }
      [0,4,8,12].forEach((p,i)=>{ gh[o+p] = style === "half" ? (i%2?"scratch":"chug") : style === "drop" ? "accent" : "chug"; });
    }
  }
  fillSection("A","plain"); fillSection("B","busy"); fillSection("C","half"); fillSection("D","drop");
  [[0,0],[3,2],[6,4],[8,5],[10,4],[12,2],[14,6],[18,5],[22,4],[26,2],[30,0]].forEach(([s,n]) => project.melodyTracksA[0][s]=n);
  [[0,7],[2,6],[4,5],[6,4],[8,2],[12,4],[16,5],[18,6],[20,7],[24,9],[28,7]].forEach(([s,n]) => project.melodyTracksB[0][s]=n);
  [[0,0],[8,2],[16,3],[24,4]].forEach(([s,n]) => {project.melodyTracksC[0][s]=n; project.melodyHoldC[0][s+1]=true; project.melodyHoldC[0][s+2]=true;});
  [[0,7],[4,9],[8,11],[12,12],[16,11],[20,9],[24,7],[28,6]].forEach(([s,n]) => project.melodyTracksD[0][s]=n);
  project.gridTupletsB.hat[14] = true; project.gridTupletsB.hat[30] = true;
  return project;
}
function makeLofiDemoProject(){
  const project = makeDemoProject();
  const len = MAX_BARS * 4 * 4;
  project.title = "Lofi DJ Demo";
  project.theme = "night";
  project.key = "A";
  project.scale = "minor";
  project.bpm = 76;
  project.swing = .12;
  project.audioProfile = LOFI_AUDIO_PROFILE_ID;
  project.lofiPreset = "lofi_study_room";
  project.lofiTexture = {enabled:true, vinylCrackle:.08, tapeHiss:.05, wowFlutter:.03, warmth:.18, lowPassAge:.24, bitCrush:.01};
  project.drumKit = "lofi_dusty";
  project.drumGroovePreset = "lofi_backbeat_76";
  project.bassTone = "warm_sub";
  project.chordInstrument = "dusty_rhodes";
  project.chordPlayMode = "block";
  project.chordRhythmMode = "sustain";
  project.bassMode = "manual";
  project.guitarEnabled = false;
  project.fxDelay = .06;
  project.fxReverb = .24;
  project.fxMix = .58;
  project.sidechainOn = true;
  project.sidechainAmount = .24;
  project.sectionBars = {A:2,B:2,C:2,D:2,E:1,F:1,G:1,H:1};
  project.songSequence = ["A","A","B","A","C","B","D","A"];
  SECTION_IDS.forEach(id => {
    project[sectionKey("progression",id)] = id === "A" ? [0,5,2,6] : id === "B" ? [0,5,3,6] : id === "C" ? [3,6,0,5] : id === "D" ? [0,3,5,6] : DEFAULT_PROGRESSION.slice();
    project[sectionKey("grid",id)] = {kick:new Array(len).fill(0),snare:new Array(len).fill(0),hat:new Array(len).fill(0),bass:new Array(len).fill(0)};
    project[sectionKey("gridTuplets",id)] = {kick:new Array(len).fill(false),snare:new Array(len).fill(false),hat:new Array(len).fill(false),bass:new Array(len).fill(false)};
    project[sectionKey("melodyTracks",id)] = [new Array(len).fill(null), new Array(len).fill(null)];
    project[sectionKey("melodyInstruments",id)] = ["mellow_vibes","tape_bell"];
    project[sectionKey("melodyOctaves",id)] = [0,0];
    project[sectionKey("melodyMute",id)] = [false,false];
    project[sectionKey("melodySolo",id)] = [false,false];
    project[sectionKey("melodyPan",id)] = [-.18,.24];
    project[sectionKey("melodyHold",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("melodySlide",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("melodyTuplets",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("bassNotes",id)] = new Array(len).fill(null);
    project[sectionKey("bassHold",id)] = new Array(len).fill(false);
    project[sectionKey("bassSlide",id)] = new Array(len).fill(false);
    project[sectionKey("bassAccent",id)] = new Array(len).fill(false);
    project[sectionKey("guitarPattern",id)] = new Array(len).fill("off");
  });
  function fillLofi(id, variant=0){
    const g = project[sectionKey("grid",id)], m0 = project[sectionKey("melodyTracks",id)][0], m1 = project[sectionKey("melodyTracks",id)][1], bass = project[sectionKey("bassNotes",id)], accent = project[sectionKey("bassAccent",id)];
    for(let bar=0; bar<2; bar++){
      const o = bar * 16;
      [0,8].forEach(p=>g.kick[o+p]=1);
      [4,12].forEach(p=>g.snare[o+p]=1);
      [0,2,4,6,8,10,12,14].forEach((p,i)=>g.hat[o+p]=i%4===0?2:1);
      if(variant === 1){ [3,10].forEach(p=>g.kick[o+p]=1); g.snare[o+6]=1; }
      if(variant === 2){ g.snare[o+4]=0; g.hat[o+6]=0; g.hat[o+10]=0; }
      bass[o] = [0,0,3,0][bar % 4]; accent[o] = true;
      bass[o+8] = variant === 3 ? 4 : 0;
      m0[o] = [0,2,4,2][(bar+variant)%4];
      m0[o+6] = [2,4,5,4][(bar+variant)%4];
      m0[o+12] = [4,2,0,2][(bar+variant)%4];
      if(variant !== 2) m1[o+10] = [7,5,4,5][(bar+variant)%4];
    }
  }
  fillLofi("A",0); fillLofi("B",1); fillLofi("C",2); fillLofi("D",3);
  return project;
}
function makeChipDemoProject(){
  const project = makeDemoProject();
  const len = MAX_BARS * 4 * 4;
  project.title = "Chip DJ Demo - Bug Maze Pulse";
  project.theme = "ocean";
  project.key = "E";
  project.scale = "minor";
  project.bpm = 130;
  project.swing = .04;
  project.audioProfile = CHIP_AUDIO_PROFILE_ID;
  project.chipPreset = "chip_bug_maze_pulse";
  project.chipTexture = {enabled:true, bitDepth:.18, sampleRateCrush:.14, pulseWidth:.42, pitchDrift:.025, saturation:.32, stereoSpread:.2};
  project.lofiPreset = "";
  project.lofiTexture = {...DEFAULT_LOFI_TEXTURE, enabled:false};
  project.drumKit = "modern_chip_punch";
  project.drumGroovePreset = "chip_arp_jam";
  project.bassTone = "modern_chip_sub";
  project.chordInstrument = "modern_chip_poly";
  project.chordPlayMode = "block";
  project.chordRhythmMode = "quarter";
  project.bassMode = "manual";
  project.guitarEnabled = false;
  project.fxDelay = .1;
  project.fxChorus = .22;
  project.fxReverb = .16;
  project.fxMix = .62;
  project.sidechainOn = true;
  project.sidechainAmount = .36;
  project.sectionBars = {A:2,B:2,C:2,D:2,E:1,F:1,G:1,H:1};
  project.songSequence = ["A","A","B","A","C","B","D","A"];
  SECTION_IDS.forEach(id => {
    project[sectionKey("progression",id)] = id === "B" ? [0,6,5,3] : id === "C" ? [3,5,6,5] : id === "D" ? [0,3,5,6] : [0,6,5,3];
    project[sectionKey("grid",id)] = {kick:new Array(len).fill(0),snare:new Array(len).fill(0),hat:new Array(len).fill(0),bass:new Array(len).fill(0)};
    project[sectionKey("gridTuplets",id)] = {kick:new Array(len).fill(false),snare:new Array(len).fill(false),hat:new Array(len).fill(false),bass:new Array(len).fill(false)};
    project[sectionKey("melodyTracks",id)] = [new Array(len).fill(null), new Array(len).fill(null)];
    project[sectionKey("melodyInstruments",id)] = ["modern_chip_lead","chip_bell_stack"];
    project[sectionKey("melodyOctaves",id)] = [0,1];
    project[sectionKey("melodyMute",id)] = [false,false];
    project[sectionKey("melodySolo",id)] = [false,false];
    project[sectionKey("melodyPan",id)] = [-.22,.24];
    project[sectionKey("melodyHold",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("melodySlide",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("melodyTuplets",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("bassNotes",id)] = new Array(len).fill(null);
    project[sectionKey("bassHold",id)] = new Array(len).fill(false);
    project[sectionKey("bassSlide",id)] = new Array(len).fill(false);
    project[sectionKey("bassAccent",id)] = new Array(len).fill(false);
    project[sectionKey("guitarPattern",id)] = new Array(len).fill("off");
  });
  function fillChip(id, variant=0){
    const g = project[sectionKey("grid",id)];
    const m0 = project[sectionKey("melodyTracks",id)][0];
    const m1 = project[sectionKey("melodyTracks",id)][1];
    const bass = project[sectionKey("bassNotes",id)];
    const accent = project[sectionKey("bassAccent",id)];
    const motif = variant === 2 ? [7,9,10,9,7,null,4,5] : [0,2,4,7,9,7,4,2];
    for(let bar=0; bar<2; bar++){
      const o = bar * 16;
      [0,6,8,14].forEach(p=>g.kick[o+p]=1);
      [4,12].forEach(p=>g.snare[o+p]=2);
      [0,2,4,6,8,10,12,14].forEach((p,i)=>g.hat[o+p]=i%3===0?2:1);
      if(variant === 1){ [3,10].forEach(p=>g.kick[o+p]=1); [7,15].forEach(p=>g.hat[o+p]=2); }
      if(variant === 2){ g.kick[o+6]=0; g.snare[o+8]=2; [1,5,9,13].forEach(p=>g.hat[o+p]=1); }
      if(variant === 3){ [0,4,8,12].forEach(p=>g.kick[o+p]=1); [2,6,10,14].forEach(p=>g.hat[o+p]=2); }
      [0,3,6,10,12].forEach((p,i)=>{ bass[o+p] = [0,0,7,4,7][i]; accent[o+p] = p === 0 || p === 12; });
      [0,2,4,6,8,10,12,14].forEach((p,i)=>{ if(motif[i] !== null) m0[o+p] = motif[(i + variant + bar) % motif.length]; });
      [3,7,11,15].forEach((p,i)=>{ m1[o+p] = [7,9,10,9][(i + variant + bar) % 4]; });
    }
  }
  fillChip("A",0); fillChip("B",1); fillChip("C",2); fillChip("D",3);
  return project;
}
function makeMetalDemoProject(){
  const project = makeDemoProject();
  const len = MAX_BARS * 4 * 4;
  project.title = "Heavy Metal DJ Demo - Classic Chug";
  project.theme = "night";
  project.key = "E";
  project.scale = "minor";
  project.bpm = 154;
  project.swing = 0;
  project.audioProfile = HEAVY_METAL_AUDIO_PROFILE_ID;
  project.metalPreset = "metal_classic_chug";
  project.metalTexture = {enabled:true, drive:.52, palmMute:.82, lowTightness:.88, presence:.6, roomSize:.12, pickAttack:.76};
  project.lofiPreset = "";
  project.lofiTexture = {...DEFAULT_LOFI_TEXTURE, enabled:false};
  project.chipPreset = "";
  project.chipTexture = {...DEFAULT_CHIP_TEXTURE, enabled:false};
  project.drumKit = "metal_tight";
  project.drumGroovePreset = "metal_backbeat_chug";
  project.bassTone = "metal_pick_bass";
  project.chordInstrument = "metal_power_stack";
  project.chordPlayMode = "strum_down";
  project.chordRhythmMode = "quarter";
  project.melodyPitchMode = "scale";
  project.bassMode = "manual";
  project.guitarEnabled = true;
  project.guitarTone = "tight_metal";
  project.guitarRegister = "low";
  project.guitarStrumMode = "alternate";
  project.guitarVolume = .82;
  project.fxDelay = .06;
  project.fxChorus = .08;
  project.fxFlanger = .04;
  project.fxReverb = .12;
  project.fxMix = .52;
  project.sidechainOn = true;
  project.sidechainAmount = .32;
  project.sectionBars = {A:2,B:2,C:2,D:2,E:1,F:1,G:1,H:1};
  project.songSequence = ["A","A","B","A","C","B","D","A"];
  SECTION_IDS.forEach(id => {
    project[sectionKey("progression",id)] = id === "B" ? [0,1,6,4] : id === "C" ? [0,6,5,1] : id === "D" ? [0,0,1,6] : [0,5,6,4];
    project[sectionKey("grid",id)] = {kick:new Array(len).fill(0),snare:new Array(len).fill(0),hat:new Array(len).fill(0),bass:new Array(len).fill(0)};
    project[sectionKey("gridTuplets",id)] = {kick:new Array(len).fill(false),snare:new Array(len).fill(false),hat:new Array(len).fill(false),bass:new Array(len).fill(false)};
    project[sectionKey("melodyTracks",id)] = [new Array(len).fill(null), new Array(len).fill(null)];
    project[sectionKey("melodyInstruments",id)] = ["shred_lead_guitar","twin_harmony_lead"];
    project[sectionKey("melodyOctaves",id)] = [0,1];
    project[sectionKey("melodyMute",id)] = [false,false];
    project[sectionKey("melodySolo",id)] = [false,false];
    project[sectionKey("melodyPan",id)] = [-.18,.2];
    project[sectionKey("melodyHold",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("melodySlide",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("melodyTuplets",id)] = [new Array(len).fill(false), new Array(len).fill(false)];
    project[sectionKey("bassNotes",id)] = new Array(len).fill(null);
    project[sectionKey("bassHold",id)] = new Array(len).fill(false);
    project[sectionKey("bassSlide",id)] = new Array(len).fill(false);
    project[sectionKey("bassAccent",id)] = new Array(len).fill(false);
    project[sectionKey("guitarPattern",id)] = new Array(len).fill("off");
  });
  function fillMetal(id, variant=0){
    const g = project[sectionKey("grid",id)];
    const m0 = project[sectionKey("melodyTracks",id)][0];
    const m1 = project[sectionKey("melodyTracks",id)][1];
    const bass = project[sectionKey("bassNotes",id)];
    const accent = project[sectionKey("bassAccent",id)];
    const guitar = project[sectionKey("guitarPattern",id)];
    for(let bar=0; bar<2; bar++){
      const o = bar * 16;
      [0,4,8,12].forEach(p=>g.kick[o+p]=1);
      [4,12].forEach(p=>g.snare[o+p]=2);
      [0,2,4,6,8,10,12,14].forEach(p=>g.hat[o+p]=1);
      if(variant === 1){ [3,6,10,14].forEach(p=>g.kick[o+p]=1); [1,5,9,13].forEach(p=>g.hat[o+p]=2); }
      if(variant === 2){ [0,8].forEach(p=>g.kick[o+p]=1); g.snare[o+12]=0; [4,12].forEach(p=>g.hat[o+p]=2); }
      if(variant === 3){ [0,2,4,6,8,10,12,14].forEach(p=>g.kick[o+p]=1); [4,12].forEach(p=>g.snare[o+p]=2); }
      [0,2,4,6,8,10,12,14].forEach((p,i)=>{ bass[o+p] = i % 4 === 3 ? 5 : 0; accent[o+p] = p === 0 || p === 8; guitar[o+p] = variant === 2 ? (i % 2 ? "scratch" : "accent") : (i % 4 === 3 ? "accent" : "chug"); });
      [0,3,6,8,10,12,15].forEach((p,i)=>{ m0[o+p] = [0,1,3,5,6,5,3][(i + variant) % 7]; });
      [4,8,12].forEach((p,i)=>{ m1[o+p] = [7,8,10][(i + variant) % 3]; });
    }
  }
  fillMetal("A",0); fillMetal("B",1); fillMetal("C",2); fillMetal("D",3);
  return project;
}
function loadDemo(){
  session = createDjSessionFromChordsmithProject(sanitizePocketChordsmithProject(makeDemoProject()));
  state.currentSection = session.performance.currentSection; state.currentStepForSchedule = 0; state.currentStep = -1; state.dropQueued = false; state.dropBoundaryScheduled = false; state.dropLanding = false; resetPerformanceStemScales(1); clearPerformanceFx();
  primePocketAudioCore(session.source.project, "demo");
  saveLocalSession(); renderAll(); showStatus("Demo deck loaded");
}
function loadLofiDemo(){
  session = createDjSessionFromChordsmithProject(sanitizePocketChordsmithProject(makeLofiDemoProject()));
  state.currentSection = session.performance.currentSection; state.currentStepForSchedule = 0; state.currentStep = -1; state.dropQueued = false; state.dropBoundaryScheduled = false; state.dropLanding = false; resetPerformanceStemScales(1); clearPerformanceFx();
  primePocketAudioCore(session.source.project, "lofi demo");
  saveLocalSession(); renderAll(); showStatus("Lofi DJ Demo loaded");
}
function loadChipDemo(){
  session = createDjSessionFromChordsmithProject(sanitizePocketChordsmithProject(makeChipDemoProject()));
  state.currentSection = session.performance.currentSection; state.currentStepForSchedule = 0; state.currentStep = -1; state.dropQueued = false; state.dropBoundaryScheduled = false; state.dropLanding = false; resetPerformanceStemScales(1); clearPerformanceFx();
  primePocketAudioCore(session.source.project, "chip demo");
  saveLocalSession(); renderAll(); showStatus("Chip DJ Demo loaded");
}
function loadMetalDemo(){
  session = createDjSessionFromChordsmithProject(sanitizePocketChordsmithProject(makeMetalDemoProject()));
  state.currentSection = session.performance.currentSection; state.currentStepForSchedule = 0; state.currentStep = -1; state.dropQueued = false; state.dropBoundaryScheduled = false; state.dropLanding = false; resetPerformanceStemScales(1); clearPerformanceFx();
  primePocketAudioCore(session.source.project, "metal demo");
  saveLocalSession(); renderAll(); showStatus("Heavy Metal DJ Demo loaded");
}

document.addEventListener("visibilitychange", () => {
  if(document.hidden && state.playing){
    schedulerDiagnostics.interruptionCount++;
    stopPlayback();
    showStatus("Playback stopped while the tab was hidden. Press Play to resume on a clean boundary.");
  }
});

function init(){
  window.PocketDJCapabilities = cloneJson(POCKET_DJ_CAPABILITIES);
  window.getPocketDJSchedulerDiagnostics = () => cloneJson(schedulerDiagnostics);
  window.negotiatePocketDjCapabilities = negotiatePocketDjCapabilities;
  window.pocketDjCapabilityReportForProject = capabilityReportForProject;
  window.pocketDjPlaybackRecipeProbe = pocketDjPlaybackRecipeProbe;
  bindElements(); bindHandlers(); applyImportedTheme("night"); renderShell(); loadPocketAudioCoreModule().catch(() => {}); consumeIncomingPocketDjHandoff().catch(() => {});
}
init();
