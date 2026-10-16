let chordAudition = null;
let chordAuditionRevision = 0;
let chordAuditionMessage = "Select a chord bar. Audio quality not checked.";

function chordAuditionPlan(){
  const bar = Math.trunc(state.selectedSlot);
  if(bar < 0 || bar >= sectionBarCount()) return null;
  const barsBefore = clamp(Number(document.getElementById("chordAuditionLead")?.value || 1), 0, 2);
  const tail = clamp(Number(document.getElementById("chordAuditionTail")?.value || 1), 0.5, 2);
  // Include the previous chord attack.
  const start = Math.max(0, bar * stepsPerBar() - barsBefore * stepsPerBar());
  const end = Math.min(sectionBarCount() * stepsPerBar(), (bar + 1) * stepsPerBar());
  const actualLead = (bar * stepsPerBar() - start) / stepsPerBar();
  return {section:state.currentSection, bar, start, end, tail,
    label:`Section ${state.currentSection}, bar ${bar + 1} / ${actualLead} bar${actualLead === 1 ? "" : "s"} before / ${tail}s tail`};
}

function chordAuditionIsCurrent(context=chordAudition){
  return !!context && chordAudition === context && context.revision === chordAuditionRevision
    && state.currentSection === context.section && state.selectedSlot === context.bar;
}

function clearChordAudition(message="Stopped."){
  chordAudition = null;
  chordAuditionMessage = message;
  updateChordAuditionUi();
}

function cancelChordAuditionIfChanged(edited=false){
  if(edited) chordAuditionRevision++;
  if(chordAudition && (edited || !chordAuditionIsCurrent())){
    stopPlayback();
    chordAuditionMessage = "Passage changed. Hear this bit again.";
  }
  updateChordAuditionUi();
}

function updateChordAuditionUi(){
  const hear = document.getElementById("hearChordBitBtn"), stop = document.getElementById("stopChordBitBtn");
  const range = document.getElementById("chordAuditionRange"), status = document.getElementById("chordAuditionStatus");
  if(!hear || !stop || !range || !status) return;
  const plan = chordAuditionPlan();
  hear.disabled = !plan || !!chordAudition || transportBusy;
  stop.disabled = !chordAudition;
  range.textContent = plan?.label || "Select an active chord bar.";
  hear.setAttribute("aria-label", `Hear this bit: ${range.textContent}`);
  status.textContent = chordAuditionMessage;
}

async function hearSelectedChordBit(){
  if(transportBusy) return;
  const plan = chordAuditionPlan();
  if(!plan) return;
  storeSection();
  stopPlayback({forAudition:true});
  const context = {...plan, revision:chordAuditionRevision, source:JSON.stringify(exportProject()), endAudioTime:Infinity};
  chordAudition = context;
  chordAuditionMessage = "Preparing. Stop cancels.";
  updateChordAuditionUi();
  try{
    await togglePlay("audition");
  }finally{
    if(chordAudition === context && !state.isPlaying) clearChordAudition(context.error || "Not played. Hear this bit again.");
    updateChordAuditionUi();
  }
}

function checkChordAuditionClock(){
  const context = chordAudition;
  if(!context || state.playbackMode !== "audition") return false;
  if(!chordAuditionIsCurrent()){
    cancelChordAuditionIfChanged();
    return true;
  }
  if(audioCtx.currentTime >= context.endAudioTime){
    stopPlayback();
    chordAuditionMessage = "Audition complete. Audio quality not checked.";
    updateChordAuditionUi();
    return true;
  }
  return false;
}

function bindChordAuditionControls(){
  document.getElementById("hearChordBitBtn")?.addEventListener("click", hearSelectedChordBit);
  document.getElementById("stopChordBitBtn")?.addEventListener("click", stopPlayback);
  for(const id of ["chordAuditionLead", "chordAuditionTail"]){
    document.getElementById(id)?.addEventListener("change", () => cancelChordAuditionIfChanged(true));
  }
  updateChordAuditionUi();
}
