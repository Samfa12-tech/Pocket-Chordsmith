let djComparison=null,djComparisonUndo=null;
function comparisonBassVolume(value){return djAudition?.compareBass??value;}
function djComparisonCurrent(){return djComparison&&djComparison.owner===session&&djComparison.source===JSON.stringify(exportPocketDjSession(session))&&djComparison.range===djAuditionPlan()?.label;}
function renderDjComparison(){
const box=document.getElementById("djComparison");if(!box)return;
const ready=!!djComparisonCurrent();
for(const action of ["a","b","apply"])box.querySelector(`[data-compare=${action}]`).disabled=!ready||(action==="apply"&&(djComparison.example||djComparison.a===djComparison.b));
box.querySelector("[data-compare=stop]").disabled=!djAudition;
box.querySelector("[data-compare=undo]").disabled=!djComparisonUndo||djComparisonUndo.owner!==session||djComparison?.example||session.performance.stemVolumes.bass!==djComparisonUndo.after;
}
function discardDjComparison(message="Discarded. Deck and saved source are unchanged."){
djComparison=null;if(djAudition)stopPlayback({preservePerformance:true});document.getElementById("djComparisonStatus").textContent=message;renderDjComparison();
}
async function djComparisonAction(action){
const status=document.getElementById("djComparisonStatus");
if(action==="discard"){discardDjComparison();return;}
if(action==="stop"){stopPlayback({preservePerformance:true});renderDjComparison();return;}
if(action==="undo"){
const edit=djComparisonUndo;if(djComparison?.example||!edit||edit.owner!==session||session.performance.stemVolumes.bass!==edit.after){status.textContent="Bass changed since Apply. Undo was not applied.";return;}
discardDjComparison("");session.performance.stemVolumes.bass=edit.before;djComparisonUndo=null;applyMixerAndFx();autosave();renderAll();status.textContent="Undid the bass proposal. Other settings retained.";renderDjComparison();return;
}
if(!session){status.textContent="Import a song first.";return;}
if(action==="prepare"||action.startsWith("example")){
if(session.performance.buildActive||state.dropQueued||state.dropLanding||state.buildSavedFx||macroFrameId||session.performance.funkMacros?.phraseFill){status.textContent="Finish or reset build/drop/fill before comparing.";return;}
stopPlayback({preservePerformance:true});
const original=session.performance.stemVolumes.bass;
djComparison={owner:session,source:JSON.stringify(exportPocketDjSession(session)),range:djAuditionPlan().label,a:original,b:clamp(Number(document.getElementById("djComparisonBass").value)/100,0,1),example:action.startsWith("example")};
if(djComparison.example)djComparison.b=original*.5;
status.textContent="Ready. Listen for bass leaving room for other parts. A/B replay the same passage start; levels are deliberately not matched for this balance edit.";
renderDjComparison();if(action==="prepare")return;action=action==="example-a"?"a":"b";
}
if(!djComparisonCurrent()){discardDjComparison("Deck or range changed. Prepare again.");return;}
if(action==="apply"){
if(djComparison.example||djComparison.a===djComparison.b)return;
const proposal=djComparison;stopPlayback({preservePerformance:true});
djComparisonUndo={owner:session,before:proposal.a,after:proposal.b};session.performance.stemVolumes.bass=proposal.b;djComparison=null;applyMixerAndFx();autosave();renderAll();status.textContent="Bass proposal applied as one edit. Undo restores its previous level.";renderDjComparison();return;
}
if(action==="a"||action==="b"){
const owner=djComparison;if(djAudition)stopPlayback({preservePerformance:true});await hearDjBit(owner[action]);
if(djComparison===owner&&djComparisonCurrent()){status.textContent=`${owner.example?"Example":"Comparison"} ${action.toUpperCase()}, bass ${Math.round(owner[action]*100)}%. Same passage start.`;renderDjComparison();}
}
}
function bindDjComparison(){
const box=document.createElement("details");box.id="djComparison";
box.innerHTML='<summary>Compare bass balance</summary><p class="tiny">Temporary audition on the visible passage. A/B replay from the same start; Apply is the only action that changes the deck.</p><label>Proposed bass % <input id="djComparisonBass" type="number" min="0" max="100" step="5" value="50"></label><div class="row"><button data-compare="prepare">Prepare proposal</button><button data-compare="a">A · Original</button><button data-compare="b">B · Proposed</button><button data-compare="stop">Stop comparison</button><button data-compare="apply">Apply</button><button data-compare="discard">Discard</button><button data-compare="undo">Undo proposal</button></div><p class="tiny">Playable example on your passage: listen for space around the kick when bass is halved. Examples cannot be applied or saved.</p><div class="row"><button data-compare="example-a">Hear original example</button><button data-compare="example-b">Hear quieter bass example</button></div><p id="djComparisonStatus" class="tiny" role="status" aria-live="polite">Not compared. Nothing autoplays.</p>';
document.getElementById("djAuditionControls").insertAdjacentElement("afterend",box);
for(const button of box.querySelectorAll("button"))button.style.minHeight="44px";
for(const row of box.querySelectorAll(".row")){row.style.display="flex";row.style.flexWrap="wrap";row.style.gap="6px";}
box.addEventListener("click",event=>{const action=event.target.closest("[data-compare]")?.dataset.compare;if(action)void djComparisonAction(action);});
box.querySelector("input").addEventListener("input",()=>discardDjComparison("Proposal changed. Prepare again."));
const cancel=event=>{if(djComparison&&!box.contains(event.target)&&event.target.closest?.("button,input,select,textarea,a")&&!event.target.closest("#playBtn,#stopBtn,#restartBtn"))discardDjComparison("Another control changed. Prepare again.");};
for(const name of ["pointerdown","click","input","change","keydown"])document.addEventListener(name,cancel,true);
renderDjComparison();
}
