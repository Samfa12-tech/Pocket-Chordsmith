let djAudition=null;
const djScheduledVoices=new Map();

function startDjVoice(source,start,end){
  djScheduledVoices.set(source,start);
  source.addEventListener("ended",()=>djScheduledVoices.delete(source),{once:true});
  source.start(start); source.stop(end);
}
function releaseDjAuditionVoices(){
  for(const [source,start] of djScheduledVoices){try{source.stop(start>audioCtx.currentTime?audioCtx.currentTime:audioCtx.currentTime+.015);}catch{}}
  djScheduledVoices.clear();
}
function djAuditionDuration(time,duration){
  return djAudition?Math.min(duration,Math.max(.01,djAudition.endAudioTime-djAudition.tail-time)):duration;
}

function djAuditionPlan(){
  if(!session) return null;
  const section=session.performance.currentSection;
  const bar=clamp(asInt(document.getElementById("djAuditionBar").value,0),0,getSection(section).bars-1);
  const lead=clamp(asInt(document.getElementById("djAuditionLead").value,1),0,2);
  const tail=clamp(asNum(document.getElementById("djAuditionTail").value,1),.5,2);
  const start=Math.max(0,(bar-lead)*stepsPerBar());
  const actualLead=(bar*stepsPerBar()-start)/stepsPerBar();
  return {section,bar,start,end:(bar+1)*stepsPerBar(),tail,
    label:`Section ${section}, bar ${bar+1} / ${actualLead} bar${actualLead===1?"":"s"} before / ${tail}s tail`};
}
function setDjAuditionStatus(message){
  document.getElementById("djAuditionStatus").textContent=message;
}
function renderDjAudition(){
  renderDjComparison();
  if(!session) return;
  const select=document.getElementById("djAuditionBar");
  const count=getSection(session.performance.currentSection).bars;
  if(select.options.length !== count){
    const prior=select.value;
    select.replaceChildren(...Array.from({length:count},(_,bar)=>new Option(String(bar+1),String(bar))));
    select.value=String(Math.min(asInt(prior,0),count-1));
  }
  const plan=djAuditionPlan();
  document.getElementById("djAuditionRange").textContent=plan.label;
  document.getElementById("hearDjBitBtn").disabled=!!djAudition;
  document.getElementById("stopDjBitBtn").disabled=!djAudition;
}
function djAuditionIsCurrent(context){
  return djAudition===context && session===context.session && JSON.stringify(exportPocketDjSession(session))===context.source;
}
async function hearDjBit(compareBass=null){
  if(!session || djAudition) return;
  if(session.performance.buildActive || state.dropQueued || state.dropLanding || state.buildSavedFx || macroFrameId || session.performance.funkMacros?.phraseFill){
    setDjAuditionStatus("Finish or reset the active build/drop/fill first; use Play to hear that performance.");
    return;
  }
  stopPlayback({preservePerformance:true});
  const context={...djAuditionPlan(),session,source:JSON.stringify(exportPocketDjSession(session)),endAudioTime:Infinity,compareBass:typeof compareBass==="number"?compareBass:null};
  djAudition=context; renderDjAudition(); setDjAuditionStatus("Preparing. Stop cancels.");
  await startPlayback(context);
  if(djAudition===context && !state.playing){djAudition=null;renderDjAudition();setDjAuditionStatus("Passage changed. Hear this bit again.");}
}
function bindDjAudition(){
  bindDjComparison();
  document.getElementById("hearDjBitBtn").addEventListener("click",hearDjBit);
  document.getElementById("stopDjBitBtn").addEventListener("click",stopPlayback);
  for(const id of ["djAuditionBar","djAuditionLead","djAuditionTail"]){
    document.getElementById(id).addEventListener("change",()=>{if(djAudition)stopPlayback();renderDjAudition();});
  }
  // Cancel before existing controls change the performance; keep those controls' actions intact.
  const cancelForControl=event=>{
    if(!djAudition || !event.target.closest?.("button,input,select,textarea,a")) return;
    if(event.target.closest("#djAuditionControls,#djComparison,#playBtn,#stopBtn,#restartBtn")) return;
    stopPlayback();
  };
  for(const name of ["pointerdown","click","input","change"]) document.addEventListener(name,cancelForControl,true);
}
