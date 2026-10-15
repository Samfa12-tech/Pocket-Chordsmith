let pocketDjCampfireBank = null;
let pocketDjCampfirePlan = null;
let pocketDjCampfirePreparation = null;
let pocketDjPlaybackRequest = 0;

function pocketDjProjectHasCampfire(project){
  return project?.guitarTone === "campfire_acoustic" || Object.values(project?.sections || {}).some(section =>
    Object.entries(section?.tracks || {}).some(([id,track]) => (id.startsWith("guitar") || track?.stem === "guitar") &&
      track?.events?.some(event => (event.sound || event.instrument) === "campfire_acoustic")));
}

async function preparePocketDjCampfire(request, activeSession){
  pocketDjCampfirePreparation?.abort();
  const source = activeSession.source.originalProject || activeSession.source.project;
  if(!pocketDjProjectHasCampfire(source)){
    pocketDjCampfireBank?.dispose();
    pocketDjCampfireBank = null;
    pocketDjCampfirePlan = null;
    return true;
  }
  if(pocketDjCampfirePlan?.session === activeSession && pocketDjCampfireBank) return true;
  const controller = new AbortController();
  pocketDjCampfirePreparation = controller;
  let bank = null;
  try{
    const core = await loadPocketAudioCoreModule();
    if(controller.signal.aborted || request !== pocketDjPlaybackRequest || session !== activeSession) return false;
    if(typeof core.prepareCampfireAcousticNoteBank !== "function") throw new Error("Campfire Acoustic needs the current bundled Pocket Audio Core. Your song is unchanged.");
    const input = {...source,bpm:activeSession.deck.bpm,key:activeSession.deck.key,scale:activeSession.deck.scale};
    const project = core.normalisePocketChordsmithProject(input);
    const sections = new Map();
    const events = [];
    const warnings = new Set();
    for(const id of SECTION_IDS){
      const timeline = core.buildPocketAudioTimeline(project,{scope:"section",sectionId:id});
      const guitar = timeline.events.filter(event => event.type === "guitar");
      const prepared = guitar.filter(event => event.instrument === "campfire_acoustic");
      const owned = prepared.length > 0 || project.sections[id].guitar.tone === "campfire_acoustic";
      if(owned && guitar.some(event => event.instrument !== "campfire_acoustic")) throw new Error("This section mixes Campfire and amplifier guitar. Separate the guitar parts before live DJ playback; the original source is preserved.");
      const stepTimes = core.buildStepTimeline({stepCount:project.sections[id].bars * project.meta.timeSig * project.meta.resolution,...project.meta}).times;
      const byStep = new Map();
      for(const event of prepared){
        const step = Math.floor(event.step);
        if(!byStep.has(step)) byStep.set(step,[]);
        byStep.get(step).push({event,offset:event.time - stepTimes[step]});
        events.push(event);
      }
      sections.set(id,{owned,byStep,events:prepared});
      timeline.lossReport.filter(loss => loss.feature?.startsWith("campfire-")).forEach(loss => warnings.add(loss.message));
    }
    bank = await core.prepareCampfireAcousticNoteBank(audioCtx,events,{destination:stemGains.guitar,signal:controller.signal});
    if(controller.signal.aborted || request !== pocketDjPlaybackRequest || session !== activeSession){bank.dispose();return false;}
    pocketDjCampfireBank?.dispose();
    pocketDjCampfireBank = bank;
    pocketDjCampfirePlan = {session:activeSession,sections,warnings:[...warnings]};
    return true;
  }catch(error){
    if(controller.signal.aborted || request !== pocketDjPlaybackRequest || session !== activeSession){bank?.dispose();return false;}
    throw error;
  }finally{
    if(pocketDjCampfirePreparation === controller) pocketDjCampfirePreparation = null;
  }
}

function schedulePocketDjCampfireStep(section,step,time){
  const prepared = pocketDjCampfirePlan?.sections.get(section.id);
  if(!prepared?.owned) return false;
  if(session.deck.guitarActive) for(const item of prepared.byStep.get(step) || []) pocketDjCampfireBank.schedule(item.event,time + item.offset);
  return true;
}

function stopPocketDjCampfire(){
  pocketDjPlaybackRequest++;
  pocketDjCampfirePreparation?.abort();
  pocketDjCampfirePreparation = null;
  pocketDjCampfireBank?.stopAll();
}

function adoptPocketDjSession(nextSession){
  if(state.playing) stopPlayback();
  else stopPocketDjCampfire();
  pocketDjCampfireBank?.dispose();
  pocketDjCampfireBank = null;
  pocketDjCampfirePlan = null;
  session = nextSession;
}
