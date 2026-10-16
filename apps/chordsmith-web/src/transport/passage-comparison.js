let chordComparison=null,chordComparisonUndo=null;
function comparisonChordMode(){return chordAudition?.chordMode||state.chordPlayMode;}
function chordComparisonBusy(){return transportBusy||state.drumRecordToGrid||state.xyRecordToGrid;}
function chordComparisonCurrent(){return chordComparison&&chordComparison.source===JSON.stringify(exportProject())&&chordComparison.range===chordBitPlan()?.label;}
function chordComparisonUndoDepth(){
const edit=chordComparisonUndo,history=state.undoStack;
if(!edit||edit.stack!==history||edit.after!==JSON.stringify(exportProject()))return 0;
const depth=history.length-(history.at(-1)===edit.after?1:0),offset=edit.history.length-depth;
return depth>0&&offset>=0&&history.slice(0,depth).every((snap,index)=>snap===edit.history[offset+index])?depth:0;
}
function renderChordComparison(){
const box=document.getElementById("chordComparison");if(!box)return;
const ready=!!chordComparisonCurrent(),busy=chordComparisonBusy();
for(const action of ["a","b","apply"])box.querySelector(`[data-compare=${action}]`).disabled=!ready||busy||(action==="apply"&&(chordComparison.example||chordComparison.a===chordComparison.b));
box.querySelector("[data-compare=stop]").disabled=!chordAudition;
box.querySelector("[data-compare=undo]").disabled=chordComparison?.example||!chordComparisonUndoDepth();
}
function discardChordComparison(message="Discarded. Your song is unchanged."){
chordComparison=null;stopPlayback({forAudition:true});document.getElementById("chordComparisonStatus").textContent=message;renderChordComparison();
}
async function chordComparisonAction(action){
const status=document.getElementById("chordComparisonStatus");
if(action==="discard"){discardChordComparison();return;}
if(action==="stop"){stopPlayback({forAudition:true});status.textContent="Comparison stopped. A or B replays the same passage.";renderChordComparison();return;}
if(action==="undo"){const depth=chordComparisonUndoDepth();if(chordComparison?.example||!depth)return;state.undoStack.length=depth;chordComparisonUndo=null;discardChordComparison("");undoLastChange();return;}
if(chordComparisonBusy()){status.textContent="Stop recording or preparation before comparing.";return;}
if(action==="prepare"||action.startsWith("example")){
if(!chordBitPlan()||!state.chordsOn){status.textContent="Select a chord bar and enable Chords first. Your song is unchanged.";return;}
storeSection();stopPlayback({forAudition:true});
chordComparison={source:JSON.stringify(exportProject()),range:chordBitPlan().label,a:state.chordPlayMode,b:document.getElementById("chordComparisonMode").value,example:action.startsWith("example")};
if(chordComparison.example){chordComparison.a="block";chordComparison.b="arp_up";}
status.textContent="Ready. Listen for notes together versus a rising roll. Each side replays the same passage start; no loudness matching is claimed.";
renderChordComparison();
if(action==="prepare")return;
action=action==="example-a"?"a":"b";
}
if(!chordComparisonCurrent()){discardChordComparison("Source or selection changed. Prepare again.");return;}
if(action==="apply"){
if(chordComparison.example||chordComparison.a===chordComparison.b)return;
const mode=chordComparison.b;chordComparison=null;stopPlayback({forAudition:true});pushUndoState();const history=state.undoStack.slice();state.chordPlayMode=mode;markProjectDirty();renderAll();chordComparisonUndo={after:JSON.stringify(exportProject()),history,stack:state.undoStack};status.textContent="Whole-song chord performance applied. Undo restores the previous setting.";renderChordComparison();return;
}
if(action==="a"||action==="b"){
const owner=chordComparison;const audition=await hearChordBit(owner[action]);
if(audition&&chordAudition===audition&&state.isPlaying&&chordComparison===owner&&chordComparisonCurrent()){status.textContent=`${owner.example?"Example":"Comparison"} ${action.toUpperCase()}: ${owner[action]}. Same passage start; Stop releases the audio.`;renderChordComparison();}
}
}
function bindChordComparison(){
const box=document.createElement("details");box.id="chordComparison";
box.innerHTML='<summary>Compare a chord performance</summary><p class="tiny">Try a setting without editing your song. A and B replay the visible Hear this bit range from the same start.</p><label>Proposed <select id="chordComparisonMode"><option value="block">Together</option><option value="strum_up">Up strum</option><option value="strum_down">Down strum</option><option value="arp_up">Rising roll</option><option value="arp_down">Falling roll</option></select></label><div class="row"><button class="pill" data-compare="prepare">Prepare proposal</button><button class="pill" data-compare="a">A · Original</button><button class="pill" data-compare="b">B · Proposed</button><button class="pill" data-compare="stop">Stop comparison</button><button class="pill" data-compare="apply">Apply</button><button class="pill" data-compare="discard">Discard</button><button class="pill" data-compare="undo">Undo</button></div><p class="tiny">Playable examples on your selected passage: listen for together versus spread-out notes. Examples cannot be applied or saved.</p><div class="row"><button class="pill" data-compare="example-a">Hear together example</button><button class="pill" data-compare="example-b">Hear rising example</button></div><p class="tiny" id="chordComparisonStatus" role="status" aria-live="polite">Not compared. Nothing autoplays.</p>';
document.querySelector(".chord-audition").insertAdjacentElement("afterend",box);
for(const button of box.querySelectorAll("button"))button.style.minHeight="44px";
for(const row of box.querySelectorAll(".row")){row.style.display="flex";row.style.flexWrap="wrap";row.style.gap="6px";}
box.addEventListener("click",event=>{const action=event.target.closest("[data-compare]")?.dataset.compare;if(action)void chordComparisonAction(action);});
box.querySelector("select").addEventListener("change",()=>discardChordComparison("Proposal changed. Prepare again."));
const cancel=event=>{if(chordComparison&&!box.contains(event.target)&&event.target.closest?.("button,input,select,textarea,a"))discardChordComparison("Another control changed. Prepare again.");};
for(const name of ["pointerdown","click","input","change","keydown"])document.addEventListener(name,cancel,true);
renderChordComparison();
}
