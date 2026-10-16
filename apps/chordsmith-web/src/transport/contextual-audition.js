let chordAudition=null;
let auditionRevision=0;
let auditionMessage="Select a chord bar. Audio quality not checked.";
function bassAuditionDuration(time,dur){
return chordAudition?Math.min(dur,Math.max(.01,chordAudition.endAudioTime-chordAudition.tail-time)):dur;
}
function chordBitPlan(){
const bar=Math.trunc(state.selectedSlot);
if(bar < 0||bar >= sectionBarCount()) return null;
const barsBefore=clamp(Number(document.getElementById("chordAuditionLead")?.value||1), 0, 2);
const tail=clamp(Number(document.getElementById("chordAuditionTail")?.value||1), 0.5, 2);
const actualLead=Math.min(bar,barsBefore);
const start=(bar-actualLead)*stepsPerBar(), end=(bar+1)*stepsPerBar();
return {section:state.currentSection, bar, start, end, tail,
  label:`Section ${state.currentSection}, bar ${bar + 1} / ${actualLead} bar${actualLead===1 ? "" : "s"} before / ${tail}s tail`};
}
function isAuditionCurrent(context=chordAudition){
return !!context&&chordAudition===context&&context.revision===auditionRevision
 &&state.currentSection===context.section&&state.selectedSlot===context.bar;
}
function clearChordAudition(message="Stopped."){
chordAudition=null;
auditionMessage=message;
renderAuditionUi();
}
function invalidateAudition(edited=false){
if(edited) auditionRevision++;
if(chordAudition&&(edited||!isAuditionCurrent())){
  stopPlayback();
  auditionMessage="Passage changed. Hear this bit again.";
}
renderAuditionUi();
}
function renderAuditionUi(){
const hear=document.getElementById("hearChordBitBtn"), stop=document.getElementById("stopChordBitBtn");
const range=document.getElementById("chordAuditionRange"), status=document.getElementById("chordAuditionStatus");
if(!hear) return;
const plan=chordBitPlan();
hear.disabled=!plan||!!chordAudition||transportBusy;
stop.disabled=!chordAudition;
range.textContent=plan?.label||"Select an active chord bar.";
hear.setAttribute("aria-label", `Hear this bit: ${range.textContent}`);
status.textContent=auditionMessage;
renderChordComparison();
}
async function hearChordBit(chordMode=null){
if(transportBusy) return;
const plan=chordBitPlan();
if(!plan) return;
storeSection();
stopPlayback({forAudition:true});
const context={...plan, revision:auditionRevision, source:JSON.stringify(exportProject()), endAudioTime:Infinity, chordMode:typeof chordMode==="string"?chordMode:null};
chordAudition=context;
auditionMessage="Preparing. Stop cancels.";
renderAuditionUi();
try{
  await togglePlay("audition");
}finally{
  if(chordAudition===context&&!state.isPlaying) clearChordAudition(context.error||"Not played. Hear this bit again.");
  renderAuditionUi();
}
}
function checkChordAuditionClock(){
const context=chordAudition;
if(!context||state.playbackMode!=="audition") return false;
if(!isAuditionCurrent()){
  invalidateAudition();
  return true;
}
if(audioCtx.currentTime >= context.endAudioTime){
  stopPlayback();
  auditionMessage="Audition complete. Audio quality not checked.";
  renderAuditionUi();
  return true;
}
return false;
}
function bindChordAuditionControls(){
bindChordComparison();
document.getElementById("hearChordBitBtn")?.addEventListener("click", hearChordBit);
document.getElementById("stopChordBitBtn")?.addEventListener("click", stopPlayback);
for(const id of ["chordAuditionLead", "chordAuditionTail"]){
  document.getElementById(id)?.addEventListener("change", () => invalidateAudition(true));
}
renderAuditionUi();
}
