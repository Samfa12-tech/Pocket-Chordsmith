function bindElements(){
  ["toast","helpOverlay","helpCloseBtn","importHelpBtn","deckHelpBtn","importScreen","deckScreen","transportBar","importText","importError","importBtn","demoBtn","lofiDemoBtn","chipDemoBtn","metalDemoBtn","loadLastBtn","importStatus","statusText","deckName","metaGrid","currentSectionText","queuedSectionText","barBeatText","loopText","progressFill","beatDots","sectionPads","launchModeSelect","sequencePlayBtn","sequenceRepeatBtn","sequenceStrip","mixer","fxGrid","buildStateText","buildBtn","dropBtn","gentleBuildBtn","rainyDropBtn","filteredStudyBtn","tapeResetBtn","funkOneDropBtn","funkBassMuteBtn","funkSlapPopBtn","funkGhostLiftBtn","funkPhraseFillBtn","resetFxBtn","loopBtn","editSourceBtn","handoffBox","handoffText","handoffHelp","saveBtn","loadLastDeckBtn","clearSessionBtn","playBtn","stopBtn","restartBtn","masterVolume"].forEach(id => el[id] = document.getElementById(id));
}
function setImportError(message=""){
  if(!el.importText || !el.importError) return;
  const text = String(message || "").trim();
  if(text) el.importText.setAttribute("aria-invalid", "true");
  else el.importText.removeAttribute("aria-invalid");
  el.importError.textContent = text;
}
function showStatus(msg){
  if(el.statusText) el.statusText.textContent = msg;
  if(el.importStatus) el.importStatus.textContent = msg;
  if(el.toast){ el.toast.textContent = msg; el.toast.classList.add("show"); clearTimeout(el.toast._timer); el.toast._timer = setTimeout(() => el.toast.classList.remove("show"), 1800); }
}
function renderAll(){ renderShell(); renderMeta(); renderTransportState(); renderPads(); renderSequence(); renderMixer(); renderFx(); updateButtons(); }
function renderShell(){
  applyImportedTheme(session?.deck?.theme || "night");
  const hasSession = !!session;
  el.importScreen.classList.toggle("hidden", hasSession);
  el.deckScreen.classList.toggle("hidden", !hasSession);
  el.transportBar.classList.toggle("hidden", !hasSession);
  if(hasSession){ el.deckName.textContent = session.deck.name || "Imported Chordsmith Project"; }
  el.loadLastBtn.classList.toggle("hidden", !hasLocalSession());
}
function niceThemeName(theme){ return String(theme || "night").replace(/^./, c => c.toUpperCase()); }
function niceLofiPresetName(id){
  if(isChipDeck()) return niceChipPresetName(session?.deck?.chipPreset);
  if(isMetalDeck()) return niceMetalPresetName(session?.deck?.metalPreset);
  if(session?.deck?.audioProfile === WESTERN_AUDIO_PROFILE_ID) return niceWesternPresetName(session?.deck?.soundProfile?.preset || id);
  if(session?.deck?.audioProfile === FUNK_AUDIO_PROFILE_ID) return niceFunkPresetName(session?.deck?.soundProfile?.preset || id);
  if(!id) return isLofiDeck() ? "Lofi Chill" : "Standard";
  return String(id).replace(/^lofi_/, "").split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function niceChipPresetName(id){
  if(!id) return "Chip Tune";
  return String(id).replace(/^chip_/, "").split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function niceMetalPresetName(id){
  if(!id) return "Heavy Metal";
  return String(id).replace(/^metal_/, "").split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function niceWesternPresetName(id){ return String(id || "western_trail").replace(/^western_/, "").split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function niceFunkPresetName(id){ return String(id || "funk_classic_pocket").replace(/^funk_/, "").split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function renderMeta(){
  if(!session) return;
  const activeCount = SECTION_IDS.filter(id => session.sections[id].active).length;
  const meta = [
    ["BPM", session.deck.bpm], ["Key", session.deck.key], ["Scale", session.deck.scale], ["Time", `${session.deck.timeSig}/4`],
    ["Swing", `${Math.round((session.deck.swing||0)*100)}%`], ["Active", `${activeCount}/8`],
    ["Theme", niceThemeName(session.deck.theme || "night")], ["Profile", niceLofiPresetName(session.deck.lofiPreset)],
    ["Song from", "Pocket Chordsmith"],
    ["Audio Core", pocketAudioCoreStatusLabel()], ["Schema", `PCS ${POCKET_AUDIO_CORE_SCHEMA_SUPPORT}`],
    ["Playback", `${session.compatibility?.lossReport?.length || 0} reported fallback${(session.compatibility?.lossReport?.length || 0) === 1 ? "" : "s"}`]
  ];
  el.metaGrid.innerHTML = meta.map(([k,v]) => `<div class="meta-card"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(String(v))}</div></div>`).join("");
}
function renderTransportState(){
  if(!session) return;
  const currentId = state.currentSection || session.performance.currentSection || "A";
  const section = getSection(currentId);
  const step = Math.max(0,state.currentStep);
  const pct = state.currentStep < 0 ? 0 : ((step % stepsPerBar()) + 1) / stepsPerBar() * 100;
  el.currentSectionText.textContent = currentId;
  el.queuedSectionText.textContent = session.performance.queuedSection || "—";
  el.loopText.textContent = session.performance.loopCurrentSection
    ? (session.performance.queuedSection ? "Hold on · queue waiting" : "Hold on")
    : (state.dropQueued ? "Drop queued" : (session.performance.sequencePlaying ? "Sequence on" : "Hold off"));
  el.barBeatText.textContent = state.currentStep < 0 ? `${section?.bars || 4} bars` : `Bar ${state.bar}/${section?.bars || 4} · Beat ${state.beat}/${session.deck.timeSig}`;
  el.progressFill.style.width = `${pct}%`;
  el.beatDots.style.setProperty("--beats", session.deck.timeSig);
  el.beatDots.innerHTML = Array.from({length:session.deck.timeSig},(_,i)=>`<div class="beat-dot ${state.currentStep >= 0 && i+1 === state.beat ? "on" : ""}"></div>`).join("");
  el.playBtn.textContent = state.playing ? "Pause" : "Play";
  el.loopBtn.textContent = session.performance.loopCurrentSection ? "Release Hold" : "Hold Section";
}
function renderPads(){
  if(!session) return;
  el.sectionPads.innerHTML = "";
  SECTION_IDS.forEach(id => {
    const sec = session.sections[id];
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "pad";
    pad.dataset.sectionPad = id;
    pad.innerHTML = `<div class="letter">${id}</div><div class="drop-badge hidden">DROP</div><div class="pad-meta"><span class="bars">${sec.bars} bar${sec.bars===1?"":"s"}</span><span class="state">ready</span></div>`;
    let longPressTimer = null;
    let longPressed = false;
    const clearLongPress = () => { if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; } };
    pad.addEventListener("pointerdown", e => {
      if(!sec.active) return;
      longPressed = false;
      clearLongPress();
      try{ pad.setPointerCapture(e.pointerId); }catch(err){}
      longPressTimer = setTimeout(() => {
        longPressed = true;
        setDropTarget(id);
      }, 560);
    });
    pad.addEventListener("pointerup", e => {
      e.preventDefault();
      clearLongPress();
      if(longPressed) return;
      queueSection(id);
    });
    pad.addEventListener("pointercancel", clearLongPress);
    pad.addEventListener("pointerleave", clearLongPress);
    pad.addEventListener("keydown", e => {
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        queueSection(id);
      }
      if(e.key.toLowerCase() === "d"){
        e.preventDefault();
        setDropTarget(id);
      }
    });
    el.sectionPads.appendChild(pad);
  });
  updatePadStates();
}
function updatePadStates(){
  if(!session || !el.sectionPads) return;
  const currentId = state.currentSection || session.performance.currentSection || "A";
  const queuedId = session.performance.queuedSection || null;
  SECTION_IDS.forEach(id => {
    const s = session.sections[id];
    const pad = el.sectionPads.querySelector(`[data-section-pad="${id}"]`);
    if(!pad) return;
    const inactive = !s.active;
    const isCurrent = id === currentId;
    const isQueued = id === queuedId;
    pad.classList.toggle("inactive", inactive);
    pad.classList.toggle("current", isCurrent);
    pad.classList.toggle("queued", isQueued);
    pad.classList.toggle("looping", isCurrent && !!session.performance.loopCurrentSection);
    pad.classList.toggle("drop-target", id === session.performance.dropTarget);
    const badge = pad.querySelector(".drop-badge");
    if(badge) badge.classList.toggle("hidden", id !== session.performance.dropTarget);
    pad.disabled = inactive;
    const stateLabel = inactive ? "empty" : isCurrent ? (session.performance.loopCurrentSection ? "held" : "current") : isQueued ? (session.performance.loopCurrentSection ? "queued / waiting" : "queued") : (id === session.performance.dropTarget ? "drop target" : "ready");
    const stateEl = pad.querySelector(".state");
    if(stateEl) stateEl.textContent = stateLabel;
  });
}
function applyImportedTheme(theme){
  const t = CHORDSMITH_THEMES[theme] || CHORDSMITH_THEMES.night;
  const r = document.documentElement.style;
  ["bg","panel","panel2","line","text","muted","cyan","magenta","violet","lime","amber","danger"].forEach(k => r.setProperty(`--${k}`, t[k]));
  document.body.style.background = t.background;
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", t.bg);
}
function sequenceLabel(){
  if(!session) return "";
  return (session.performance.sequence || []).join(" → ");
}
function syncSequenceIndexToSection(sectionId){
  if(!session) return;
  const seq = session.performance.sequence || [];
  const idx = seq.indexOf(sectionId);
  if(idx >= 0) session.performance.sequenceIndex = idx;
}
function currentSequencePosition(){
  if(!session) return 0;
  const seq = session.performance.sequence || [];
  let idx = clamp(asInt(session.performance.sequenceIndex,0),0,Math.max(0,seq.length-1));
  if(seq[idx] !== session.performance.currentSection){
    const first = seq.indexOf(session.performance.currentSection);
    if(first >= 0) idx = first;
  }
  session.performance.sequenceIndex = idx;
  return idx;
}
function nextSequenceSection(){
  if(!session || !session.performance.sequencePlaying) return null;
  const seq = sanitizeDjSequence(session.performance.sequence, session.sections);
  session.performance.sequence = seq;
  if(!seq.length) return null;
  let idx = currentSequencePosition();
  let nextIdx = idx + 1;
  if(nextIdx >= seq.length){
    if(!session.performance.sequenceRepeat){
      session.performance.sequencePlaying = false;
      session.performance.sequenceIndex = idx;
      return null;
    }
    nextIdx = 0;
  }
  session.performance.sequenceIndex = nextIdx;
  return seq[nextIdx];
}
function advanceSequenceAtBoundary(boundaryTime){
  if(!session || !session.performance.sequencePlaying || session.performance.loopCurrentSection || session.performance.queuedSection) return false;
  const next = nextSequenceSection();
  if(!next) return false;
  session.performance.currentSection = next;
  state.currentStepForSchedule = 0;
  scheduleUiAt(boundaryTime, () => {
    state.currentSection = next;
    state.currentStep = 0;
    state.bar = 1;
    state.beat = 1;
    autosave();
    updatePadStates();
    renderTransportState();
    renderSequence();
    showStatus(`Sequence advanced to section ${next}`);
  });
  return true;
}
function toggleSequencePlayback(){
  if(!session) return;
  session.performance.sequence = sanitizeDjSequence(session.performance.sequence, session.sections);
  session.performance.sequencePlaying = !session.performance.sequencePlaying;
  if(session.performance.sequencePlaying) currentSequencePosition();
  autosave();
  renderSequence();
  renderTransportState();
  showStatus(session.performance.sequencePlaying ? `Sequence playing: ${sequenceLabel()}` : "Sequence stopped");
}
function toggleSequenceRepeat(){
  if(!session) return;
  session.performance.sequenceRepeat = !session.performance.sequenceRepeat;
  autosave();
  renderSequence();
  showStatus(session.performance.sequenceRepeat ? "Sequence repeat on" : "Sequence repeat off");
}
function renderSequence(){
  if(!session || !el.sequenceStrip) return;
  const seq = sanitizeDjSequence(session.performance.sequence, session.sections);
  session.performance.sequence = seq;
  const idx = currentSequencePosition();
  el.sequenceStrip.innerHTML = seq.map((id,i) => `<span class="sequence-chip ${i === idx && session.performance.sequencePlaying ? "current" : ""} ${i === idx + 1 && session.performance.sequencePlaying ? "next" : ""}">${escapeHtml(id)}</span>${i < seq.length-1 ? '<span class="sequence-arrow">→</span>' : ''}`).join("");
  if(el.sequencePlayBtn){
    el.sequencePlayBtn.textContent = session.performance.sequencePlaying ? "Stop Sequence" : "Play Sequence";
    el.sequencePlayBtn.classList.toggle("primary", !!session.performance.sequencePlaying);
  }
  if(el.sequenceRepeatBtn){
    el.sequenceRepeatBtn.textContent = session.performance.sequenceRepeat ? "Repeat On" : "Repeat Off";
    el.sequenceRepeatBtn.classList.toggle("good", !!session.performance.sequenceRepeat);
  }
}
function setDropTarget(sectionId){
  if(!session || !SECTION_IDS.includes(sectionId)) return;
  const sec = session.sections[sectionId];
  if(!sec || !sec.active) return showStatus(`Section ${sectionId} is empty.`);
  session.performance.dropTarget = session.performance.dropTarget === sectionId ? null : sectionId;
  autosave();
  updatePadStates();
  renderFxValuesOnly();
  showStatus(session.performance.dropTarget ? `Drop target set: section ${sectionId}` : "Drop target cleared");
}
function launchModeLabel(){
  const mode = session?.performance?.launchQuantize || "bar";
  return mode === "instant" ? "Instant" : mode === "section" ? "End of Section" : "Next Bar";
}
function isLaunchBoundary(atNextBar, atSectionEnd){
  const mode = session?.performance?.launchQuantize || "bar";
  if(mode === "section") return atSectionEnd;
  if(mode === "bar") return atNextBar || atSectionEnd;
  return false;
}
function renderMixer(){
  if(!session) return;
  el.mixer.innerHTML = "";
  STEMS.forEach(stem => {
    const inactive = stem === "guitar" && !session.deck.guitarActive;
    const row = document.createElement("div");
    row.className = `stem ${inactive ? "inactive" : ""}`;
    row.dataset.stemRow = stem;
    const stemName = stem.charAt(0).toUpperCase() + stem.slice(1);
    const muted = !!session.performance.stemMutes[stem];
    row.innerHTML = `<div class="stem-name" id="stem-name-${stem}">${stem.toUpperCase()}</div>
      <button class="btn mute ${muted ? "on" : ""}" data-mute="${stem}" aria-label="Mute ${stemName}" aria-pressed="${muted}" ${inactive?"disabled":""}>Mute</button>
      <input type="range" min="0" max="1" step="0.01" value="${session.performance.stemVolumes[stem]}" data-stem-volume="${stem}" aria-label="${stemName} volume" ${inactive?"disabled":""}>
      <div class="meter" aria-hidden="true"><div class="meter-fill"></div></div>`;
    el.mixer.appendChild(row);
  });
}
function renderMixerValuesOnly(){
  if(!session) return;
  STEMS.forEach(stem => {
    const slider = document.querySelector(`[data-stem-volume="${stem}"]`);
    if(slider) slider.value = session.performance.stemVolumes[stem];
  });
}
function renderFx(){
  if(!session) return;
  const fx = session.performance.fx;
  const rows = [
    ["filter","Filter",fx.filter,"setMasterFilter"],
    ["echo","Echo",fx.echo,"setEchoAmount"],
    ["reverb","Reverb",fx.reverb,"setReverbAmount"]
  ];
  el.fxGrid.innerHTML = rows.map(([id,label,value]) => `<div class="fx-row"><label for="fx-${id}">${label}</label><input id="fx-${id}" type="range" min="0" max="1" step="0.01" value="${value}" data-fx="${id}"><div class="fx-value" id="fxv-${id}">${Math.round(value*100)}</div></div>`).join("");
  renderFxValuesOnly();
}
function renderFxValuesOnly(){
  if(!session) return;
  Object.entries(session.performance.fx).forEach(([id,value]) => {
    const slider = document.querySelector(`[data-fx="${id}"]`); if(slider && document.activeElement !== slider) slider.value = value;
    const out = document.getElementById(`fxv-${id}`); if(out) out.textContent = String(Math.round(value*100));
  });
  const label = state.dropQueued ? "Drop queued" : state.dropLanding ? "Drop landing" : session.performance.buildActive ? "Build active" : "Neutral";
  el.buildStateText.textContent = label;
  el.buildStateText.classList.toggle("build-state", !!session.performance.buildActive || !!state.dropQueued || !!state.dropLanding);
  if(el.buildBtn) el.buildBtn.classList.toggle("building", !!session.performance.buildActive && !state.dropQueued);
  if(el.dropBtn){
    el.dropBtn.classList.toggle("drop-armed", !!state.dropQueued || !!session.performance.dropTarget);
    el.dropBtn.textContent = session.performance.dropTarget ? `Drop → ${session.performance.dropTarget}` : (session.performance.queuedSection ? `Drop → ${session.performance.queuedSection}` : "Drop");
  }
  const macroButtons = {oneDrop:el.funkOneDropBtn,bassMute:el.funkBassMuteBtn,slapPopEmphasis:el.funkSlapPopBtn,ghostLift:el.funkGhostLiftBtn,phraseFill:el.funkPhraseFillBtn};
  Object.entries(macroButtons).forEach(([key,button]) => { if(button){ const active = !!session.performance.funkMacros?.[key]; button.setAttribute("aria-pressed",String(active)); button.classList.toggle("on",active); } });
}
function updateButtons(){
  if(!session) return;
  el.launchModeSelect.value = session.performance.launchQuantize;
  el.masterVolume.value = session.performance.masterVolume;
}
function escapeHtml(str){ return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

let helpReturnFocus = null;
