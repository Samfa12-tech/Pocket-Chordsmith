function bassArticulationAt(section, step){
  if((section.bassHold || [])[step]) return "hold";
  if((section.bassSlide || [])[step]) return "slide";
  return safeChoice((section.bassArticulation || [])[step],BASS_ARTICULATIONS,"finger");
}
function richEventDurationSteps(holdTrack, step, stepCount){
  let duration = 1;
  while(step + duration < stepCount && holdTrack?.[step + duration]) duration++;
  return duration;
}
function compactEventsForRichSection(sectionId){
  const previousScope = els.exportScopeSelect ? els.exportScopeSelect.value : "";
  if(els.exportScopeSelect) els.exportScopeSelect.value = sanitizeSectionId(sectionId);
  try{
    return buildSequenceEvents();
  }finally{
    if(els.exportScopeSelect) els.exportScopeSelect.value = previousScope;
  }
}
function generatedRichTracksForSection(sectionId){
  const section = getSectionData(sectionId,true);
  const compactMirror = () => ({compatibility:{compactMirror:true,liveMirror:true},events:[]});
  const tracks = {drums:compactMirror(),bass:compactMirror(),guitar:compactMirror(),chords:compactMirror()};
  const pushEvent = (track,event) => {
    if(!tracks[track]) tracks[track] = compactMirror();
    tracks[track].events.push({
      step:event.step,
      tick:event.tick ?? Math.round(event.step * MIDI_TICKS_PER_QUARTER / activeResolution()),
      duration:event.duration ?? 1,
      durationTicks:event.durationTicks ?? Math.max(1,Math.round((event.duration ?? 1) * MIDI_TICKS_PER_QUARTER / activeResolution())),
      velocity:event.velocity ?? 96,
      articulation:event.articulation || "finger",
      sound:event.sound || "standard",
      role:event.role || "support",
      expression:event.expression || {},
      technique:event.technique || {},
      ...(event.lane ? {lane:event.lane} : {}),
      ...(event.note !== undefined ? {note:event.note} : {}),
      ...(event.notes ? {notes:event.notes} : {})
    });
  };
  const beatSeconds = Math.max(0.001,beatDur());
  const profileId = normalizeSoundProfileId(state.audioProfile);
  compactEventsForRichSection(sectionId).forEach(event => {
    if(event.type === "texture") return;
    const tick = Math.max(0,Math.round(Number(event.time || 0) / beatSeconds * MIDI_TICKS_PER_QUARTER));
    const durationTicks = Math.max(1,Math.round(Number(event.dur || 0.08) / beatSeconds * MIDI_TICKS_PER_QUARTER));
    const timing = {step:event.step,tick,durationTicks,duration:durationTicks * activeResolution() / MIDI_TICKS_PER_QUARTER};
    if(event.type === "kick" || event.type === "snare" || event.type === "hat" || event.type === "drum"){
      const lane = event.type === "hat" ? (event.accent ? "hat_open" : "hat_closed") : event.type === "drum" ? event.lane : event.type;
      pushEvent("drums",{...timing,lane,sound:lane,velocity:event.accent ? 116 : Math.round(96 * (event.velocityScale ?? 1)),articulation:event.accent ? "accent" : lane === "hat_open" ? "open" : "finger",role:lane === "kick" && event.step % stepsPerBar() === 0 ? "anchor" : "groove",technique:{drums:{lane}}});
      return;
    }
    if(event.type === "bass"){
      pushEvent("bass",{...timing,note:event.midi,velocity:event.accent ? 112 : event.articulation === "mute" ? 72 : 92,articulation:event.articulation,sound:state.bassTone || "classic",role:event.step % stepsPerBar() === 0 ? "anchor" : event.articulation === "pop" ? "fill" : "groove",technique:profileId === FUNK_AUDIO_PROFILE_ID ? {funk:{hand:event.articulation === "slap" ? "thumb" : event.articulation === "pop" ? "index" : "finger"}} : {}});
      return;
    }
    if(event.type === "guitar"){
      const baseVelocity = event.articulation === "accent" ? 112 : 94;
      const mixScale = profileId === HEAVY_METAL_AUDIO_PROFILE_ID ? (state.guitarVolume ?? 0.66) / 0.66 : 1;
      pushEvent("guitar",{...timing,notes:event.notes,velocity:clamp(Math.round(baseVelocity * mixScale),1,127),articulation:event.articulation,sound:event.tone || state.guitarTone,role:"rhythm",technique:profileId === HEAVY_METAL_AUDIO_PROFILE_ID ? {metal:{palmMuteDepth:state.metalTexture?.palmMute ?? 0,pickDirection:event.direction}} : profileId === WESTERN_AUDIO_PROFILE_ID ? {western:{pickDirection:event.direction}} : {}});
      return;
    }
    if(event.type === "chord"){
      pushEvent("chords",{...timing,notes:chordNotes(event.chord),velocity:82,articulation:state.chordPlayMode,sound:state.chordInstrument,role:"harmony"});
      return;
    }
    if(event.type === "melody"){
      const trackIndex = Math.max(0,asInt(event.trackIndex,0));
      pushEvent(`melody${trackIndex + 1}`,{...timing,note:event.midi,velocity:94,articulation:event.slideMidi !== undefined ? "slide" : "legato",sound:event.instrument || section.melodyInstruments?.[trackIndex] || "pulse",role:trackIndex === 0 ? "lead" : "response",expression:{pan:event.pan ?? section.melodyPan?.[trackIndex] ?? 0}});
    }
  });
  return tracks;
}
function richEventsMatch(a,b){
  const aStep = a.step !== undefined ? Math.round(a.step) : richEventStep(a,activeResolution());
  const bStep = b.step !== undefined ? Math.round(b.step) : richEventStep(b,activeResolution());
  if(aStep !== bStep) return false;
  if(a.sound && b.sound && a.sound !== b.sound) return false;
  if(a.note !== undefined && b.note !== undefined && Number(a.note) !== Number(b.note)) return false;
  return true;
}
function richEventNeedsPreservation(event){
  if(event.tick !== undefined && Math.abs(event.tick / (MIDI_TICKS_PER_QUARTER / activeResolution()) - Math.round(event.tick / (MIDI_TICKS_PER_QUARTER / activeResolution()))) > 0.0001) return true;
  if(event.expression && Object.keys(event.expression).some(key => key !== "pan")) return true;
  if(event.technique && Object.keys(event.technique).some(ns => !["drums","funk","metal","western","chip"].includes(ns))) return true;
  return false;
}
function buildRichSections(){
  const source = sanitizeRichSections(state._richSource || state._projectSource?.sections);
  const out = {};
  SECTION_IDS.forEach(id => {
    const generated = generatedRichTracksForSection(id);
    const sourceSection = source[id] || {tracks:{}};
    const mergedSection = mergeProjectValues(sourceSection,{tracks:{}});
    Object.entries(generated).forEach(([trackName,track]) => {
      const sourceTrack = sourceSection.tracks?.[trackName];
      const sourceEvents = Array.isArray(sourceTrack?.events) ? sourceTrack.events : [];
      const authoredRichSource = sourceEvents.length > 0 && sourceTrack?.compatibility?.compactMirror !== true;
      if(authoredRichSource){
        mergedSection.tracks[trackName] = mergeProjectValues(sourceTrack,{compatibility:mergeProjectValues(sourceTrack.compatibility,{compactMirror:false}),events:sourceEvents.map(deepCloneProjectValue)});
        return;
      }
      const used = new Set();
      const events = track.events.map(event => {
        const matchIndex = sourceEvents.findIndex((sourceEvent,index) => !used.has(index) && richEventsMatch(event,sourceEvent));
        if(matchIndex < 0) return event;
        used.add(matchIndex);
        const sourceEvent = sourceEvents[matchIndex];
        return mergeProjectValues(sourceEvent,{...event,expression:mergeProjectValues(sourceEvent.expression,event.expression),technique:mergeProjectValues(sourceEvent.technique,event.technique)});
      });
      sourceEvents.forEach((event,index) => { if(!used.has(index) && richEventNeedsPreservation(event)) events.push(deepCloneProjectValue(event)); });
      mergedSection.tracks[trackName] = mergeProjectValues(sourceTrack,{compatibility:mergeProjectValues(sourceTrack?.compatibility,track.compatibility),events});
    });
    Object.entries(sourceSection.tracks || {}).forEach(([trackName,track]) => { if(!generated[trackName]) mergedSection.tracks[trackName] = deepCloneProjectValue(track); });
    out[id] = mergedSection;
  });
  return out;
}
function makeLossEntry(path,feature,action,fallback,message){ return {path,feature,action,...(fallback ? {fallback} : {}),message}; }
function collectSchema16Losses(project){
  const losses = [];
  const profileId = normalizeSoundProfileId(project.soundProfile?.id || project.audioProfile);
  if([WESTERN_AUDIO_PROFILE_ID,FUNK_AUDIO_PROFILE_ID].includes(profileId)) losses.push(makeLossEntry("soundProfile.id",`sound-profile:${profileId}`,"fallback","standard",`${profileId} identity is preserved only in schema 17; schema 16 uses standard profile metadata.`));
  if(project.soundProfile?.parameters && Object.keys(project.soundProfile.parameters).length) losses.push(makeLossEntry("soundProfile.parameters","sound-profile-parameters","dropped",null,"Renderer-neutral sound parameters are not representable in schema 16."));
  SECTION_IDS.forEach(id => {
    const tracks = project.sections?.[id]?.tracks || {};
    Object.entries(tracks).forEach(([trackName,track]) => (track.events || []).forEach((event,index) => {
      const base = `sections.${id}.tracks.${trackName}.events[${index}]`;
      if(trackName === "drums" && !["kick","snare","hat_closed","hat_open"].includes(event.sound)) losses.push(makeLossEntry(`${base}.sound`,`drum-lane:${event.sound}`,"fallback",event.sound === "clap" || event.sound === "rim" ? "snare" : "dropped",`${event.sound} has no dedicated schema-16 lane.`));
      if(trackName === "bass" && !["finger","accent","slide","hold"].includes(event.articulation)) losses.push(makeLossEntry(`${base}.articulation`,`bass-articulation:${event.articulation}`,"fallback",["slap","pop"].includes(event.articulation) ? "accent" : "finger",`${event.articulation} bass intent is simplified in schema 16.`));
      if(event.expression && Object.keys(event.expression).length) losses.push(makeLossEntry(`${base}.expression`,"rich-expression","dropped",null,"Rich expression namespaces are not representable in schema 16."));
      if(event.technique && Object.keys(event.technique).length) losses.push(makeLossEntry(`${base}.technique`,"namespaced-technique","dropped",null,"Namespaced technique data is not representable in schema 16."));
      if(event.tick !== undefined && event.step === undefined) losses.push(makeLossEntry(`${base}.tick`,"tick-precision","approximated","step","Tick-precision timing is projected to the nearest schema-16 grid step."));
    }));
  });
  return losses.sort((a,b) => a.path.localeCompare(b.path) || a.feature.localeCompare(b.feature));
}
function projectToSchema16(project){
  const legacy = deepCloneProjectValue(project) || {};
  const losses = collectSchema16Losses(project);
  const lossReport = {lossy:losses.length>0,sourceSchemaVersion:PROJECT_SCHEMA_VERSION,targetSchemaVersion:LEGACY_PROJECT_SCHEMA_VERSION,richSourceRetained:true,losses};
  legacy.projectVersion = LEGACY_PROJECT_SCHEMA_VERSION;
  legacy.audioProfile = normalizeSoundProfileId(project.soundProfile?.id || project.audioProfile) === CHIP_AUDIO_PROFILE_ID ? "chip_tune" : [LOFI_AUDIO_PROFILE_ID,HEAVY_METAL_AUDIO_PROFILE_ID].includes(normalizeSoundProfileId(project.soundProfile?.id || project.audioProfile)) ? normalizeSoundProfileId(project.soundProfile?.id || project.audioProfile) : "standard";
  delete legacy.formatFeatures; delete legacy.soundProfile; delete legacy.sections;
  SECTION_IDS.forEach(id => { delete legacy[`bassArticulation${id}`]; delete legacy[`drumLanes${id}`]; });
  legacy.compatibility = mergeProjectValues(legacy.compatibility,{sourceSchemaVersion:PROJECT_SCHEMA_VERSION,richSource:deepCloneProjectValue(project),lossReport});
  return {project:legacy,lossReport};
}
function negotiatePcsCapabilities(project,capabilities={}){
  const versions = Array.isArray(capabilities.schemaVersions) ? capabilities.schemaVersions.map(Number) : [asInt(capabilities.maxSchema,PROJECT_SCHEMA_VERSION)];
  const schema = versions.includes(PROJECT_SCHEMA_VERSION) ? PROJECT_SCHEMA_VERSION : Math.max(...versions.filter(Number.isFinite),LEGACY_PROJECT_SCHEMA_VERSION);
  if(schema >= PROJECT_SCHEMA_VERSION) return {project:deepCloneProjectValue(project),schemaVersion:PROJECT_SCHEMA_VERSION,lossReport:{lossy:false,sourceSchemaVersion:PROJECT_SCHEMA_VERSION,targetSchemaVersion:PROJECT_SCHEMA_VERSION,richSourceRetained:true,losses:[]}};
  const projected = projectToSchema16(project);
  return {...projected,schemaVersion:LEGACY_PROJECT_SCHEMA_VERSION};
}

function exportProject(options={}){
  storeSection();
  const profileId = normalizeSoundProfileId(state.audioProfile,"standard");
  const soundProfile = mergeProjectValues(state.soundProfile,{id:profileId,preset:activeProfilePreset(profileId),recipeVersion:SOUND_RECIPE_VERSION,parameters:activeProfileParameters(profileId)});
  const out = {
    projectVersion:PROJECT_SCHEMA_VERSION,
    formatFeatures:FORMAT_FEATURES.slice(), soundProfile,
    key:state.key, scale:state.scale, timeSig:state.timeSig, bpm:state.bpm, swing:state.swing, audioProfile:profileId, lofiPreset:state.lofiPreset || "", lofiTexture:sanitizeLofiTexture(state.lofiTexture, state.lofiPreset), chipPreset:state.chipPreset || "", chipTexture:sanitizeChipTexture(state.chipTexture, state.chipPreset), metalPreset:state.metalPreset || "", metalTexture:sanitizeMetalTexture(state.metalTexture, state.metalPreset), westernPreset:state.westernPreset || "", funkPreset:state.funkPreset || "", funkParameters:sanitizeFunkParameters(state.funkParameters), drumKit:state.drumKit || "classic", drumGroovePreset:state.drumGroovePreset || "", bassTone:state.bassTone || "classic", theme:state.theme, uiMode:state.uiMode,
    chordType:state.chordType, chordInstrument:state.chordInstrument, resolution:state.resolution, masterVolume:masterVolumeValue(), chordVolume:volumeSliderValue("chordVol", 0.72), beatVolume:volumeSliderValue("beatVol", 0.86), leadVolume:volumeSliderValue("leadVol", 0.65), melodyPitchMode:state.melodyPitchMode, midiExportMode:state.midiExportMode, midiChordExport:state.midiChordExport, midiExactDurations:state.midiExactDurations,
    guitarEnabled:state.guitarEnabled, guitarTone:state.guitarTone, guitarRegister:state.guitarRegister, guitarStrumMode:state.guitarStrumMode, guitarPatternPreset:state.guitarPatternPreset, guitarVolume:state.guitarVolume,
    chordPlayMode:state.chordPlayMode, chordRhythmMode:state.chordRhythmMode, chordOctave:state.chordOctave, melodyOctave:state.melodyOctave,
    melodyInputMode:state.melodyInputMode, xyPlaybackMode:state.xyPlaybackMode, xyPadMode:state.xyPadMode, xyScaleMode:state.xyScaleMode, xyChordFollow:state.xyChordFollow, xyRecordToGrid:state.xyRecordToGrid,
    fxDelay:state.fxDelay, fxChorus:state.fxChorus, fxFlanger:state.fxFlanger, fxReverb:state.fxReverb, fxMix:state.fxMix, metronomeOn:state.metronomeOn, chordsOn:state.chordsOn, bassOn:state.bassOn, showMelodyPads:state.showMelodyPads, showDrumPads:state.showDrumPads, drumRecordToGrid:state.drumRecordToGrid, showMelodyPicker:state.showMelodyPicker, showTrackControls:state.showTrackControls, bassMode:state.bassMode, humanizeOn:state.humanizeOn, sidechainOn:state.sidechainOn, sidechainAmount:state.sidechainAmount, lastAdvancedResolution:state.lastAdvancedResolution,
    sectionBars:state.sectionBars, songSequence:sequenceList(), followPlaybackSection:state.followPlaybackSection !== false,
    genreComposition:state.genreComposition ? deepCloneProjectValue(state.genreComposition) : undefined
  };
  SECTION_IDS.forEach(id => {
    out[sectionPropKey("progression", id)] = state[sectionPropKey("progression", id)].map(ch => ch === null ? null : (ch?.degree ?? 0));
    out[sectionPropKey("grid", id)] = state[sectionPropKey("grid", id)];
    out[sectionPropKey("gridTuplets", id)] = state[sectionPropKey("gridTuplets", id)] || blankGridTuplets();
    out[sectionPropKey("melodyTracks", id)] = state[sectionPropKey("melodyTracks", id)];
    out[sectionPropKey("melodyInstruments", id)] = state[sectionPropKey("melodyInstruments", id)];
    out[sectionPropKey("melodyOctaves", id)] = state[sectionPropKey("melodyOctaves", id)];
    out[sectionPropKey("melodyMute", id)] = state[sectionPropKey("melodyMute", id)];
    out[sectionPropKey("melodySolo", id)] = state[sectionPropKey("melodySolo", id)];
    out[sectionPropKey("melodyPan", id)] = state[sectionPropKey("melodyPan", id)];
    out[sectionPropKey("melodyHold", id)] = state[sectionPropKey("melodyHold", id)];
    out[sectionPropKey("melodySlide", id)] = state[sectionPropKey("melodySlide", id)];
    out[sectionPropKey("melodyTuplets", id)] = state[sectionPropKey("melodyTuplets", id)] || blankMelodyTuplets(1);
    out[sectionPropKey("bassHold", id)] = state[sectionPropKey("bassHold", id)];
    out[sectionPropKey("bassSlide", id)] = state[sectionPropKey("bassSlide", id)];
    out[sectionPropKey("bassNotes", id)] = state[sectionPropKey("bassNotes", id)];
    out[sectionPropKey("bassAccent", id)] = state[sectionPropKey("bassAccent", id)];
    out[sectionPropKey("bassArticulation", id)] = state[sectionPropKey("bassArticulation", id)] || ensureBassArticulationTrack([]);
    out[sectionPropKey("drumLanes", id)] = state[sectionPropKey("drumLanes", id)] || createDrumLanes();
    out[sectionPropKey("guitarPattern", id)] = state[sectionPropKey("guitarPattern", id)] || createGuitarState();
  });
  out.sections = buildRichSections();
  const canonical = mergeProjectValues(state._projectSource,out);
  canonical.projectVersion = PROJECT_SCHEMA_VERSION;
  canonical.formatFeatures = Array.from(new Set([...(Array.isArray(canonical.formatFeatures) ? canonical.formatFeatures : []),...FORMAT_FEATURES]));
  const targetSchema = asInt(options.targetSchema ?? state.exportSchemaVersion,PROJECT_SCHEMA_VERSION);
  if(targetSchema <= LEGACY_PROJECT_SCHEMA_VERSION){
    const projected = projectToSchema16(canonical);
    state.lastCapabilityReport = projected.lossReport.losses;
    return projected.project;
  }
  state.lastCapabilityReport = [];
  return canonical;
}
function importProject(rawData){
  const previousShape = {timeSig:state.timeSig, resolution:state.resolution, uiMode:state.uiMode};
  let data;
  try{
    if(rawData && typeof rawData === "object" && !Array.isArray(rawData)){
      const incomingMode = inferProjectUiMode(rawData);
      state.uiMode = incomingMode;
      state.timeSig = safeChoice(asInt(rawData.timeSig, state.timeSig), [3,4], state.timeSig);
      state.resolution = incomingMode === "simple" ? 1 : sanitizeResolutionValue(rawData.resolution, state.resolution || 1);
    }
    data = sanitizeProjectData(rawData);
  }catch(e){
    state.timeSig = previousShape.timeSig;
    state.resolution = previousShape.resolution;
    state.uiMode = previousShape.uiMode;
    throw e;
  }
  const wasPlaying = state.isPlaying;
  if(wasPlaying) stopPlayback();

  state.key = data.key;
  state.scale = data.scale;
  state.timeSig = data.timeSig;
  state.bpm = data.bpm;
  state.swing = data.swing;
  state.audioProfile = data.audioProfile || "standard";
  state.soundProfile = sanitizeSoundProfile(data.soundProfile,data);
  state.lofiPreset = data.lofiPreset || "";
  state.lofiTexture = sanitizeLofiTexture(data.lofiTexture, state.lofiPreset);
  state.chipPreset = data.chipPreset || "";
  state.chipTexture = sanitizeChipTexture(data.chipTexture, state.chipPreset);
  state.metalPreset = data.metalPreset || "";
  state.metalTexture = sanitizeMetalTexture(data.metalTexture, state.metalPreset);
  state.westernPreset = data.westernPreset || "western_trail";
  state.funkPreset = data.funkPreset || "";
  state.funkParameters = sanitizeFunkParameters(data.funkParameters || state.soundProfile?.parameters);
  state.genreComposition = data.genreComposition ? deepCloneProjectValue(data.genreComposition) : null;
  state.drumKit = data.drumKit || "classic";
  state.drumGroovePreset = data.drumGroovePreset || "";
  state.bassTone = data.bassTone || "classic";
  state.theme = data.theme;
  state.uiMode = data.uiMode;
  state.chordType = data.chordType;
  state.chordInstrument = data.chordInstrument || "pocket";
  state.resolution = data.resolution;
  state.melodyPitchMode = data.melodyPitchMode || "scale";
  state.midiExportMode = data.midiExportMode || "quantized";
  state.midiChordExport = data.midiChordExport || "played";
  state.midiExactDurations = data.midiExactDurations !== false;
  state.guitarEnabled = !!data.guitarEnabled;
  state.guitarTone = data.guitarTone || "high_gain";
  state.guitarRegister = data.guitarRegister || "low";
  state.guitarStrumMode = data.guitarStrumMode || "down";
  state.guitarPatternPreset = data.guitarPatternPreset || "metal_chug";
  state.guitarVolume = data.guitarVolume ?? 0.66;
  state.lastAdvancedResolution = data.lastAdvancedResolution || (state.resolution === 1 ? 2 : state.resolution);
  state.chordPlayMode = data.chordPlayMode;
  state.chordRhythmMode = data.chordRhythmMode;
  state.chordOctave = data.chordOctave;
  state.melodyOctave = data.melodyOctave;
  state.melodyInputMode = data.melodyInputMode;
  state.xyPlaybackMode = data.xyPlaybackMode || (data.xyOstinatoOn ? "ostinato" : "sustain");
  state.xyPadMode = data.xyPadMode === "brightness" ? "frequency" : data.xyPadMode === "gate" ? "sustain" : (data.xyPadMode || "sustain");
  if(state.xyPlaybackMode === "sustain" && state.xyPadMode === "sustain") state.xyPadMode = "frequency";
  if(state.xyPlaybackMode === "sustain" && state.xyPadMode === "rate") state.xyPadMode = "frequency";
  state.xyScaleMode = data.xyScaleMode || "song";
  state.xyChordFollow = data.xyChordFollow !== false;
  state.xyRecordToGrid = !!data.xyRecordToGrid;
  state.xyLiveActive = false;
  state.fxDelay = data.fxDelay;
  state.fxChorus = data.fxChorus;
  state.fxFlanger = data.fxFlanger;
  state.fxReverb = data.fxReverb;
  state.fxMix = data.fxMix ?? 0.65;
  state.metronomeOn = data.metronomeOn !== false;
  state.chordsOn = data.chordsOn !== false;
  state.bassOn = data.bassOn !== false;
  state.advancedFxPrimed = !!((state.fxDelay||0) || (state.fxChorus||0) || (state.fxFlanger||0) || (state.fxReverb||0) || (state.fxMix||0));
  state.showMelodyPads = data.showMelodyPads !== false;
  state.showDrumPads = data.showDrumPads !== false;
  state.drumRecordToGrid = !!data.drumRecordToGrid;
  state.showMelodyPicker = data.showMelodyPicker !== false;
  state.showTrackControls = data.showTrackControls !== false;
  state.bassMode = data.bassMode || "auto";
  state.humanizeOn = !!data.humanizeOn;
  state.sidechainOn = !!data.sidechainOn;
  state.sidechainAmount = data.sidechainAmount ?? 0.45;

  els.keySelect.value = state.key;
  els.scaleSelect.value = state.scale;
  els.timeSigSelect.value = String(state.timeSig);
  els.bpmInput.value = state.bpm;
  storeSection();
  els.swingInput.value = state.swing;
  els.swingValue.textContent = `${Math.round(state.swing*100)}%`;
  els.themeSelect.value = state.theme;
  els.uiModeSelect.value = state.uiMode;
  els.chordTypeSelect.value = state.chordType;
  els.resolutionSelect.value = String(state.resolution);
  setVolumeSliderValue("masterVol", data.masterVolume, 0.82);
  setVolumeSliderValue("chordVol", data.chordVolume, 0.72);
  setVolumeSliderValue("beatVol", data.beatVolume, 0.86);
  setVolumeSliderValue("leadVol", data.leadVolume, 0.65);
  applyVolumes();
  if(els.melodyPitchModeSelect) els.melodyPitchModeSelect.value = state.melodyPitchMode;
  if(els.midiExportModeSelect) els.midiExportModeSelect.value = state.midiExportMode;
  if(els.midiChordExportSelect) els.midiChordExportSelect.value = state.midiChordExport;
  if(els.midiExactDurationsToggle) els.midiExactDurationsToggle.checked = !!state.midiExactDurations;
  if(els.guitarEnabledToggle) els.guitarEnabledToggle.checked = !!state.guitarEnabled;
  if(els.guitarEnabledToggleSettings) els.guitarEnabledToggleSettings.checked = !!state.guitarEnabled;
  if(els.guitarToneSelect) els.guitarToneSelect.value = state.guitarTone;
  if(els.guitarRegisterSelect) els.guitarRegisterSelect.value = state.guitarRegister;
  if(els.guitarStrumModeSelect) els.guitarStrumModeSelect.value = state.guitarStrumMode;
  if(els.guitarVolume) els.guitarVolume.value = String(state.guitarVolume);
  if(els.guitarEnabledToggle) els.guitarEnabledToggle.checked = !!state.guitarEnabled;
  if(els.guitarEnabledToggleSettings) els.guitarEnabledToggleSettings.checked = !!state.guitarEnabled;
  if(els.guitarToneSelect) els.guitarToneSelect.value = state.guitarTone;
  if(els.guitarRegisterSelect) els.guitarRegisterSelect.value = state.guitarRegister;
  if(els.guitarStrumModeSelect) els.guitarStrumModeSelect.value = state.guitarStrumMode;
  if(els.guitarVolume) els.guitarVolume.value = String(state.guitarVolume ?? 0.66);

  generateAvailableChords();
  const remap = arr => arr.map(d => d === null ? null : (state.availableChords[d] || state.availableChords[0]));
  state.sectionBars = data.sectionBars;
  state.songSequence = data.songSequence;
  state.followPlaybackSection = data.followPlaybackSection !== false;
  SECTION_IDS.forEach(id => {
    state[sectionPropKey("progression", id)] = remap(data[sectionPropKey("progression", id)]);
    state[sectionPropKey("grid", id)] = data[sectionPropKey("grid", id)];
    state[sectionPropKey("gridTuplets", id)] = ensureGridTupletLengths(data[sectionPropKey("gridTuplets", id)] || blankGridTuplets());
    state[sectionPropKey("melodyTracks", id)] = ensureMelodyTracksLength(data[sectionPropKey("melodyTracks", id)]);
    state[sectionPropKey("melodyInstruments", id)] = ensureMelodyInstrumentsLength(data[sectionPropKey("melodyInstruments", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodyOctaves", id)] = ensureMelodyOctavesLength(data[sectionPropKey("melodyOctaves", id)], state[sectionPropKey("melodyTracks", id)].length, state.melodyOctave || 0);
    state[sectionPropKey("melodyMute", id)] = ensureMelodyBoolLength(data[sectionPropKey("melodyMute", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodySolo", id)] = ensureMelodyBoolLength(data[sectionPropKey("melodySolo", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodyPan", id)] = ensureMelodyPanLength(data[sectionPropKey("melodyPan", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodyHold", id)] = ensureMelodyHoldLength(data[sectionPropKey("melodyHold", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodySlide", id)] = ensureMelodySlideLength(data[sectionPropKey("melodySlide", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodyTuplets", id)] = ensureMelodyTupletsLength(data[sectionPropKey("melodyTuplets", id)] || [], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("bassHold", id)] = ensureBassHoldTrack(data[sectionPropKey("bassHold", id)]);
    state[sectionPropKey("bassSlide", id)] = ensureBassSlideTrack(data[sectionPropKey("bassSlide", id)]);
    state[sectionPropKey("bassNotes", id)] = ensureBassNotesTrack(data[sectionPropKey("bassNotes", id)]);
    state[sectionPropKey("bassAccent", id)] = ensureBassAccentTrack(data[sectionPropKey("bassAccent", id)]);
    state[sectionPropKey("bassArticulation", id)] = ensureBassArticulationTrack(data[sectionPropKey("bassArticulation", id)] || []);
    state[sectionPropKey("drumLanes", id)] = sanitizeDrumLanes(data[sectionPropKey("drumLanes", id)] || {});
    state[sectionPropKey("guitarPattern", id)] = normaliseGuitarState(data[sectionPropKey("guitarPattern", id)] || []);
    ensureGridLengths(state[sectionPropKey("grid", id)]);
    state[sectionPropKey("gridTuplets", id)] = ensureGridTupletLengths(state[sectionPropKey("gridTuplets", id)] || blankGridTuplets());
    clearInvalidGridTuplets(id);
    clearInvalidMelodyTuplets(id);
  });

  state._projectSource = deepCloneProjectValue(data.__preservedProjectSource || rawData);
  state._richSource = deepCloneProjectValue(data.sections || state._projectSource?.sections);

  state.currentSection = "A";
  state.activeMelodyTrack = 0;
  state.currentStep = -1;
  state.lastHighlightedStep = -1;
  state.xyLastWriteStep = -1;
  syncSection();
  clearWavOutput();
  renderAll();
  return true;
}
