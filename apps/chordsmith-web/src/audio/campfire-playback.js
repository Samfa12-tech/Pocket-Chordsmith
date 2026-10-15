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

function chordsmithProjectHasCampfire(project){
  if(project?.guitarTone === "campfire_acoustic") return true;
  return Object.values(project?.sections || {}).some(section => Object.entries(section?.tracks || {}).some(([id, track]) =>
    (id === "guitar" || track?.stem === "guitar") && track?.events?.some(event => (event.sound || event.instrument) === "campfire_acoustic")));
}

async function loadChordsmithCampfirePlanner(){
  if(globalThis.PocketAudioPrepared) return globalThis.PocketAudioPrepared;
  if(!chordsmithCampfirePlannerPromise){
    chordsmithCampfirePlannerPromise = (async () => {
      if(typeof DecompressionStream !== "function") throw new Error("Campfire Acoustic playback is unavailable in this browser. Use a current browser or Core WAV export.");
      const bytes = Uint8Array.from(atob(POCKET_AUDIO_PREPARED_RUNTIME_GZIP_BASE64), char => char.charCodeAt(0));
      const source = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      // This is only the immutable, locally built Core payload embedded above.
      // No user/project/network text is executable input, and CSP is unchanged.
      const script = document.createElement("script");
      script.textContent = source;
      document.head.append(script);
      script.remove();
      if(!globalThis.PocketAudioPrepared) throw new Error("Campfire Acoustic could not load. Core WAV export is available separately.");
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
  chordsmithCampfireRequired = chordsmithProjectHasCampfire(snapshot);
  if(!chordsmithCampfireRequired){ chordsmithCampfirePlan = null; return true; }
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
  if(!state.isPlaying || !(chordsmithCampfireRequired || state.guitarTone === "campfire_acoustic")) return;
  clearTimeout(chordsmithCampfireRefreshTimer);
  chordsmithCampfireRefreshTimer = setTimeout(async () => {
    chordsmithCampfireRefreshTimer = null;
    if(!state.isPlaying) return;
    const request = ++chordsmithPlaybackRequest;
    try {
      await prepareChordsmithCampfirePlayback(exportProject(), request);
    } catch(error) {
      if(request !== chordsmithPlaybackRequest || !state.isPlaying) return;
      chordsmithCampfirePlan = null;
      chordsmithCampfireBank?.cancelScheduledFrom(audioCtx.currentTime);
      setStatus(error.message || "Campfire changes need Stop and Play to prepare.");
    }
  }, 50);
}

function getChordsmithCampfireDiagnostics(){
  return {...chordsmithCampfireDiagnostics, pending:!!chordsmithCampfirePreparation, bank:chordsmithCampfireBank?.getDiagnostics() || null};
}
