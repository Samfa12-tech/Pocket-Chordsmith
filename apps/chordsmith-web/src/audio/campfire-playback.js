let chordsmithCampfirePlannerPromise = null;
let chordsmithCampfireBank = null;
let chordsmithCampfireContext = null;
let chordsmithCampfireDestination = null;
let chordsmithCampfireKey = "";
let chordsmithCampfirePlan = null;
let chordsmithCampfirePreparation = null;
let chordsmithPlaybackRequest = 0;
let chordsmithCampfireRequired = false;
let chordsmithCampfireRefreshTimer = null;
const chordsmithCampfireDiagnostics = {preparations:0, reuses:0, bytes:0, lastPrepareMs:0};

function chordsmithRichTrackIsGuitar(id, track){
  // Match Core's richTrackStem precedence, including custom IDs and case.
  return String(track?.stem || track?.role || id || "").toLowerCase() === "guitar";
}

function chordsmithProjectHasCampfire(project){
  if(project?.guitarTone === "campfire_acoustic") return true;
  return Object.values(project?.sections || {}).some(section => Object.entries(section?.tracks || {}).some(([id, track]) =>
    chordsmithRichTrackIsGuitar(id, track) && track?.events?.some(event => (event.sound || event.instrument) === "campfire_acoustic")));
}

function chordsmithStateHasCampfire(){
  return state.guitarTone === "campfire_acoustic" || chordsmithProjectHasCampfire({sections:state._richSource || state._projectSource?.sections});
}

function setChordsmithGuitarPerformance(sectionId, value){
  state[sectionPropKey("guitarPerformance", sectionId)] = value;
  if(sectionId === state.currentSection) state.guitarPerformance = value;
}

function chordsmithHasAuthoredCampfireGuitar(sectionId){
  return Object.entries(state._richSource?.[sectionId]?.tracks || {}).some(([id, track]) =>
    chordsmithRichTrackIsGuitar(id, track) && track?.compatibility?.compactMirror !== true && track?.events?.some(event => (event.sound || event.instrument) === "campfire_acoustic"));
}

function replaceChordsmithCampfireRichPartWithGrid(sectionId){
  if(!chordsmithStateHasCampfire()) return;
  for(const [id, track] of Object.entries(state._richSource?.[sectionId]?.tracks || {})){
    if(!chordsmithRichTrackIsGuitar(id, track)) continue;
    track.events = [];
    track.compatibility = {...track.compatibility, compactMirror:true};
  }
}

async function loadChordsmithCampfirePlanner(){
  if(globalThis.PocketAudioPrepared) return globalThis.PocketAudioPrepared;
  if(!chordsmithCampfirePlannerPromise){
    chordsmithCampfirePlannerPromise = (async () => {
      if(typeof DecompressionStream !== "function") throw new Error("Campfire Acoustic needs a current browser. Your song is unchanged.");
      const bytes = Uint8Array.from(atob(POCKET_AUDIO_PREPARED_RUNTIME_GZIP_BASE64), char => char.charCodeAt(0));
      const source = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      // This is only the immutable, locally built Core payload embedded above.
      // No user/project/network text is executable input, and CSP is unchanged.
      const script = document.createElement("script");
      script.textContent = source;
      document.head.append(script);
      script.remove();
      if(!globalThis.PocketAudioPrepared) throw new Error("Campfire Acoustic could not load. Reload the app or try a current browser.");
      return globalThis.PocketAudioPrepared;
    })().catch(error => { chordsmithCampfirePlannerPromise = null; throw error; });
  }
  return chordsmithCampfirePlannerPromise;
}

function compileChordsmithCampfirePlan(module, snapshot){
  const project = module.normalisePocketChordsmithProject(snapshot);
  const sections = new Map();
  const events = [];
  const warnings = new Set();
  for(const id of SECTION_IDS){
    const section = project.sections[id];
    const timeline = module.buildPocketAudioTimeline(project, {scope:"section", sectionId:id});
    const guitarEvents = timeline.events.filter(event => event.type === "guitar");
    const prepared = guitarEvents.filter(event => event.instrument === "campfire_acoustic");
    const owned = prepared.length > 0 || section.guitar.tone === "campfire_acoustic";
    if(owned && guitarEvents.some(event => event.instrument !== "campfire_acoustic")) throw new Error("This section mixes prepared and amplifier guitar voices. Use Core WAV export for this arrangement.");
    const times = module.buildStepTimeline({stepCount:section.bars * project.meta.timeSig * project.meta.resolution, ...project.meta}).times;
    const byStep = new Map();
    for(const event of prepared){
      const step = Math.floor(event.step);
      if(!byStep.has(step)) byStep.set(step, []);
      byStep.get(step).push({event, offset:event.time - times[step]});
      events.push(event);
    }
    sections.set(id, {owned, byStep});
    timeline.lossReport.forEach(item => { if(item.feature?.startsWith("campfire-")) warnings.add(item.message); });
  }
  return {project, sections, events, warnings:[...warnings]};
}

async function prepareChordsmithCampfirePlayback(snapshot, request){
  chordsmithCampfirePreparation?.abort();
  chordsmithCampfirePreparation = null;
  chordsmithCampfireRequired = snapshot ? chordsmithProjectHasCampfire(snapshot) : chordsmithStateHasCampfire();
  if(!chordsmithCampfireRequired){ chordsmithCampfirePlan = null; return true; }
  snapshot ||= exportProject();
  const preparation = new AbortController();
  chordsmithCampfirePreparation = preparation;
  const start = performance.now();
  let preparedBank = null;
  try{
    const module = await loadChordsmithCampfirePlanner();
    if(preparation.signal.aborted || request !== chordsmithPlaybackRequest) return false;
    const plan = compileChordsmithCampfirePlan(module, snapshot);
    const voiceModule = globalThis.PocketAudioCampfire;
    const identities = new Set(plan.events.flatMap(event => voiceModule.campfireAcousticEventVoices(event, {sampleRate:audioCtx.sampleRate}).map(voice => voiceModule.campfireAcousticNoteKey(voice.identity))));
    const key = [...identities].sort().join("|");
    const sameContext = chordsmithCampfireBank && chordsmithCampfireContext === audioCtx && chordsmithCampfireDestination === guitarGain;
    if(sameContext && state.isPlaying){
      await chordsmithCampfireBank.prepareMissingEvents(plan.events, {signal:preparation.signal});
      if(preparation.signal.aborted || request !== chordsmithPlaybackRequest) return false;
      chordsmithCampfireKey = key;
      chordsmithCampfireDiagnostics.reuses++;
    } else if(sameContext && key === chordsmithCampfireKey){
      chordsmithCampfireDiagnostics.reuses++;
    } else {
      chordsmithCampfireBank?.dispose();
      chordsmithCampfireBank = null;
      chordsmithCampfireKey = "";
      preparedBank = await voiceModule.prepareCampfireAcousticNoteBank(audioCtx, plan.events, {destination:guitarGain, signal:preparation.signal});
      if(preparation.signal.aborted || request !== chordsmithPlaybackRequest){ preparedBank.dispose(); return false; }
      chordsmithCampfireBank = preparedBank;
      chordsmithCampfireContext = audioCtx;
      chordsmithCampfireDestination = guitarGain;
      chordsmithCampfireKey = key;
      chordsmithCampfireDiagnostics.preparations++;
    }
    chordsmithCampfirePlan = plan;
    chordsmithCampfireDiagnostics.bytes = chordsmithCampfireBank.getDiagnostics().bytes;
    chordsmithCampfireDiagnostics.lastPrepareMs = performance.now() - start;
    return true;
  }catch(error){
    if(preparation.signal.aborted || request !== chordsmithPlaybackRequest){ preparedBank?.dispose(); return false; }
    throw error;
  }finally{
    if(chordsmithCampfirePreparation === preparation) chordsmithCampfirePreparation = null;
  }
}

function cancelChordsmithCampfirePlayback(clearCache=false){
  clearTimeout(chordsmithCampfireRefreshTimer);
  chordsmithCampfireRefreshTimer = null;
  chordsmithPlaybackRequest++;
  chordsmithCampfirePreparation?.abort();
  chordsmithCampfirePreparation = null;
  chordsmithCampfireBank?.stopAll();
  chordsmithCampfirePlan = null;
  if(clearCache){
    chordsmithCampfireBank?.dispose();
    chordsmithCampfireBank = null;
    chordsmithCampfireContext = null;
    chordsmithCampfireDestination = null;
    chordsmithCampfireKey = "";
    chordsmithCampfireDiagnostics.bytes = 0;
  }
}

function scheduleChordsmithCampfireStep(sectionId, step, time){
  const section = chordsmithCampfirePlan?.sections.get(sectionId);
  if(!section?.owned) return !chordsmithCampfirePlan && (chordsmithCampfireRequired || state.guitarTone === "campfire_acoustic");
  if(!state.guitarEnabled) return true;
  for(const item of section.byStep.get(step) || []) chordsmithCampfireBank.schedule(item.event, time + item.offset);
  return true;
}

function queueChordsmithCampfireRefresh(){
  if(chordsmithCampfirePreparation){
    chordsmithPlaybackRequest++;
    chordsmithCampfirePreparation.abort();
    if(!state.isPlaying){ updateTransportButtonLabels(); setStatus("Guitar changes are ready. Press Play to prepare them."); }
  }
  if(!state.isPlaying || !(chordsmithCampfireRequired || state.guitarTone === "campfire_acoustic")) return;
  clearTimeout(chordsmithCampfireRefreshTimer);
  chordsmithCampfireRefreshTimer = setTimeout(async () => {
    chordsmithCampfireRefreshTimer = null;
    if(!state.isPlaying) return;
    const request = ++chordsmithPlaybackRequest;
    try {
      await prepareChordsmithCampfirePlayback(null, request);
    } catch(error) {
      if(request !== chordsmithPlaybackRequest || !state.isPlaying) return;
      chordsmithCampfirePlan = null;
      chordsmithCampfireBank?.cancelScheduledFrom(audioCtx.currentTime);
      setStatus(error.message || "Campfire changes need Stop and Play to prepare.");
    }
  }, 50);
}

async function previewChordsmithCampfireStep(sectionId, step){
  try{
  await ensureAudio();
  applyVolumes();
  const request = ++chordsmithPlaybackRequest;
  const snapshot = exportProject();
  snapshot.guitarEnabled = true;
  if(!(await prepareChordsmithCampfirePlayback(snapshot, request))) return false;
  const items = chordsmithCampfirePlan?.sections.get(sectionId)?.byStep.get(step) || [];
  if(!items.length) return false;
  const first = Math.min(...items.map(item => item.offset));
  for(const item of items) chordsmithCampfireBank.schedule(item.event, audioCtx.currentTime + 0.015 + item.offset - first);
  return true;
  }catch(error){
    if(error?.name !== "AbortError") setStatus(error.message || "Campfire preview is unavailable");
    return false;
  }
}

function getChordsmithCampfireDiagnostics(){
  return {...chordsmithCampfireDiagnostics, pending:!!chordsmithCampfirePreparation, bank:chordsmithCampfireBank?.getDiagnostics() || null};
}

async function chordsmithCampfireExportTimeline(snapshot, options){
  const module = await loadChordsmithCampfirePlanner();
  return module.buildPocketAudioTimeline(module.normalisePocketChordsmithProject(snapshot), options);
}

async function chordsmithCampfireMidiEvents(events, ticksPerQuarter, snapshot, options){
  const timeline = await chordsmithCampfireExportTimeline(snapshot, options);
  const out = events.filter(event => event.ch !== 3);
  if(!snapshot.guitarEnabled) return {events:out, guitarProgram:null};
  const guitarEvents = timeline.events.filter(item => item.type === "guitar");
  const ticks = seconds => Math.max(0, Math.round(seconds * snapshot.bpm / 60 * ticksPerQuarter));
  for(const event of guitarEvents){
    if(event.velocity <= 0) continue;
    const campfire = event.instrument === "campfire_acoustic";
    if(!campfire && event.articulation === "scratch") continue;
    const notes = event.midiNotes?.length ? [...event.midiNotes] : [event.midi];
    if(event.direction === "up") notes.reverse();
    const onset = snapshot.midiExportMode === "performance" ? ticks(event.time) : Math.round(event.tick / timeline.ppq * ticksPerQuarter);
    const spread = campfire ? event.technique?.campfire?.strumSeconds ?? 0.027 : event.articulation === "chug" ? 0.004 : 0.012;
    const velocity = event.trackId ? Math.round(event.velocity * 127) : campfire ? Math.round(event.velocity * 100) : event.articulation === "accent" ? 108 : event.articulation === "chug" ? 92 : 96;
    const duration = campfire ? 1.5 : event.duration;
    if(campfire) globalThis.PocketAudioCampfire.campfireAcousticEventVoices(event, {sampleRate:44100});
    for(let index = 0; index < notes.length; index++) pushMidiNote(out, onset + ticks(index * spread), ticks(duration * (snapshot.midiExactDurations ? 1 : 0.92)), notes[index], velocity, 3);
  }
  return {events:out.sort((a,b) => a.tick - b.tick || (a.on === b.on ? 0 : a.on ? -1 : 1)), guitarProgram:guitarEvents.length && guitarEvents.every(event => event.instrument === "campfire_acoustic") ? 25 : null};
}
