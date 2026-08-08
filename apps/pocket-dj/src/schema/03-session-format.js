function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function asNum(v,fallback){ const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function asInt(v,fallback){ const n = parseInt(v,10); return Number.isFinite(n) ? n : fallback; }
function safeChoice(value, allowed, fallback){ return allowed.includes(value) ? value : fallback; }
function cloneJson(value){
  if(value === undefined) return undefined;
  try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; }
}
function assertPocketDjProjectResourceLimits(project){
  if(!project || typeof project !== "object" || Array.isArray(project)) return;
  const sections = project.sections && typeof project.sections === "object" && !Array.isArray(project.sections) ? project.sections : {};
  let totalEvents = 0;
  SECTION_IDS.forEach(id => {
    const section = sections[id];
    if(!section || typeof section !== "object" || Array.isArray(section)) return;
    const groups = [section.tracks,section.richTracks].filter((group,index,all) => group && typeof group === "object" && !Array.isArray(group) && all.indexOf(group) === index);
    const entries = groups.flatMap(group => Object.entries(group));
    assertPocketDjProjectResourceLimit(`sections.${id}.tracks`,entries.length,PROJECT_RESOURCE_LIMITS.maxTracksPerSection);
    entries.forEach(([trackId,track]) => {
      if(!track || typeof track !== "object" || Array.isArray(track)) return;
      const eventLists = [Array.isArray(track.events) ? track.events : []];
      if(track.lanes && typeof track.lanes === "object" && !Array.isArray(track.lanes)) Object.values(track.lanes).forEach(events => eventLists.push(Array.isArray(events) ? events : []));
      const trackEventCount = eventLists.reduce((sum,events) => sum + events.length,0);
      assertPocketDjProjectResourceLimit(`sections.${id}.tracks.${trackId}.events`,trackEventCount,PROJECT_RESOURCE_LIMITS.maxEventsPerTrack);
      totalEvents += trackEventCount;
      assertPocketDjProjectResourceLimit("project rich events",totalEvents,PROJECT_RESOURCE_LIMITS.maxEventsPerProject);
      eventLists.forEach(events => events.forEach((event,index) => {
        if(Array.isArray(event?.notes)) assertPocketDjProjectResourceLimit(`sections.${id}.tracks.${trackId}.events[${index}].notes`,event.notes.length,PROJECT_RESOURCE_LIMITS.maxNotesPerEvent);
      }));
    });
  });
}
function assertPocketDjProjectResourceLimit(path,actual,limit){
  if(actual <= limit) return;
  const error = new RangeError(`Project exceeds ${path} limit (${actual} > ${limit}).`);
  error.code = "PROJECT_RESOURCE_LIMIT_EXCEEDED";
  error.path = path;
  error.actual = actual;
  error.limit = limit;
  throw error;
}
function uniqueStrings(values){ return Array.from(new Set((Array.isArray(values) ? values : []).map(value => String(value || "")).filter(Boolean))); }
function canonicalProfileId(value){
  const id = String(value || "").trim().toLowerCase();
  return PROFILE_DEFAULT_PRESETS[id] ? id : (PROFILE_ALIASES[id] || STANDARD_AUDIO_PROFILE_ID);
}
function canonicalPresetForProfile(profileId, value){
  const raw = String(value || "").trim();
  return raw || PROFILE_DEFAULT_PRESETS[profileId] || PROFILE_DEFAULT_PRESETS[STANDARD_AUDIO_PROFILE_ID];
}
function rendererPresetId(value){ return PRESET_ALIASES[String(value || "")] || String(value || ""); }
function hasRichProjectSurface(raw){
  if(!raw || typeof raw !== "object") return false;
  if(raw.soundProfile || (Array.isArray(raw.formatFeatures) && raw.formatFeatures.some(feature => SCHEMA17_FEATURES.includes(feature)))) return true;
  return Object.values(raw.sections || {}).some(section => Object.values(section?.tracks || {}).some(track => Array.isArray(track?.events) || track?.lanes));
}
function normalizeSoundProfile(raw){
  const source = raw?.soundProfile && typeof raw.soundProfile === "object" && !Array.isArray(raw.soundProfile) ? cloneJson(raw.soundProfile) : {};
  const legacyPreset = raw?.audioProfile === LEGACY_CHIP_AUDIO_PROFILE_ID || raw?.audioProfile === CHIP_AUDIO_PROFILE_ID ? (raw.chipPreset || raw.stylePreset) : raw?.stylePreset;
  const rawId = source.id || raw?.audioProfile || raw?.style?.profile || raw?.style?.audioProfile || (String(legacyPreset || "").startsWith("lofi_") ? LOFI_AUDIO_PROFILE_ID : String(legacyPreset || "").startsWith("chip_") ? CHIP_AUDIO_PROFILE_ID : String(legacyPreset || "").startsWith("metal_") ? HEAVY_METAL_AUDIO_PROFILE_ID : String(legacyPreset || "").startsWith("western_") ? WESTERN_AUDIO_PROFILE_ID : String(legacyPreset || "").startsWith("funk_") ? FUNK_AUDIO_PROFILE_ID : STANDARD_AUDIO_PROFILE_ID);
  const id = canonicalProfileId(rawId);
  const preset = canonicalPresetForProfile(id, source.preset || raw?.style?.preset || legacyPreset);
  return {...source, id, preset, recipeVersion:Math.max(1, asInt(source.recipeVersion,1)), parameters:source.parameters && typeof source.parameters === "object" && !Array.isArray(source.parameters) ? source.parameters : {}};
}
function normalizeRichEvent(raw, path){
  const event = raw && typeof raw === "object" && !Array.isArray(raw) ? cloneJson(raw) : {};
  if(event.step !== undefined) event.step = Math.max(0, asNum(event.step,0));
  if(event.tick !== undefined) event.tick = Math.max(0, asNum(event.tick,0));
  if(event.duration !== undefined) event.duration = Math.max(0, asNum(event.duration,1));
  if(event.velocity !== undefined) event.velocity = clamp(asNum(event.velocity,100),0,127);
  if(event.notes !== undefined && !Array.isArray(event.notes)) event.notes = [event.notes];
  if(event.articulation !== undefined) event.articulation = String(event.articulation);
  Object.defineProperty(event,"_path",{value:path, enumerable:false, configurable:true});
  return event;
}
function normalizeRichTracks(rawTracks, sectionId){
  const tracks = {};
  if(!rawTracks || typeof rawTracks !== "object" || Array.isArray(rawTracks)) return tracks;
  Object.entries(rawTracks).forEach(([trackId, rawTrack]) => {
    const track = rawTrack && typeof rawTrack === "object" && !Array.isArray(rawTrack) ? cloneJson(rawTrack) : {};
    const events = Array.isArray(track.events) ? track.events : [];
    tracks[trackId] = {...track, events:events.map((event,index) => normalizeRichEvent(event, `sections.${sectionId}.tracks.${trackId}.events[${index}]`))};
    if(track.lanes && typeof track.lanes === "object" && !Array.isArray(track.lanes)){
      tracks[trackId].lanes = Object.fromEntries(Object.entries(track.lanes).map(([lane, laneEvents]) => [lane, (Array.isArray(laneEvents) ? laneEvents : []).map((event,index) => normalizeRichEvent({...event, sound:event?.sound || lane}, `sections.${sectionId}.tracks.${trackId}.lanes.${lane}[${index}]`))]));
    }
  });
  return tracks;
}
function richTrackEvents(section, trackId){
  const track = section?.richTracks?.[trackId];
  if(!track) return [];
  const events = Array.isArray(track.events) ? track.events.slice() : [];
  if(track.lanes && typeof track.lanes === "object") Object.values(track.lanes).forEach(laneEvents => events.push(...(Array.isArray(laneEvents) ? laneEvents : [])));
  return events;
}
function richEventStep(event, project=session?.source?.project){
  if(event?.step !== undefined) return asNum(event.step,0);
  if(event?.tick !== undefined){
    const ppq = Math.max(1, asNum(project?.ppq || project?.ticksPerQuarter || 480,480));
    return asNum(event.tick,0) / ppq * (project?.resolution || session?.deck?.resolution || 4);
  }
  return null;
}
function richEventsAt(section, trackId, step, budget){
  if(!richTrackOwnsPlayback(section,trackId)) return [];
  const matches = [];
  for(const event of richTrackEvents(section,trackId)){
    const eventStep = richEventStep(event);
    if(eventStep === null || Math.abs(eventStep - step) >= .001) continue;
    if(budget && budget.remaining <= 0){
      budget.dropped++;
      continue;
    }
    matches.push(event);
    if(budget) budget.remaining--;
  }
  return matches;
}
function richTrackOwnsPlayback(section,trackId){
  const track = section?.richTracks?.[trackId];
  if(!track || !richTrackEvents(section,trackId).length) return false;
  const profileId = canonicalProfileId(session?.deck?.soundProfile?.id || session?.deck?.audioProfile);
  return track.compatibility?.compactMirror !== true || ![STANDARD_AUDIO_PROFILE_ID,LOFI_AUDIO_PROFILE_ID].includes(profileId);
}
function richTrackHasEvents(section, trackId){ return richTrackOwnsPlayback(section,trackId); }
function richEventVelocity(event, fallback=.8){
  const value = event?.velocity === undefined ? fallback : asNum(event.velocity, fallback * 127);
  return clamp(value > 1 ? value / 127 : value,0,1.2);
}
function richEventDuration(event, step, fallback){
  if(event?.durationTicks !== undefined){
    const project = session?.source?.project || {};
    const ppq = Math.max(1,asNum(project.ppq || project.ticksPerQuarter || 480,480));
    return Math.max(.035,spanDuration(step,Math.max(.001,asNum(event.durationTicks,1) / ppq * resolution())));
  }
  if(event?.duration === undefined) return fallback;
  return Math.max(.035, spanDuration(step, Math.max(.05, asNum(event.duration,1))));
}
function supportedFeatureSet(){ return new Set(POCKET_DJ_CAPABILITIES.features); }
function capabilityReportForProject(project){
  const requestedFeatures = uniqueStrings(project?.formatFeatures);
  const lossReport = [];
  const addLoss = (entry) => lossReport.push({...entry, path:String(entry.path || ""), feature:String(entry.feature || ""), action:entry.action || "fallback"});
  requestedFeatures.filter(feature => !supportedFeatureSet().has(feature)).forEach(feature => addLoss({path:"formatFeatures",feature,action:"preserved",message:`Pocket DJ preserves unknown feature ${feature} without rendering it.`}));
  const profileId = project?.soundProfile?.id || project?.audioProfile || STANDARD_AUDIO_PROFILE_ID;
  if(!POCKET_DJ_CAPABILITIES.profiles.includes(profileId)) addLoss({path:"soundProfile.id",feature:`sound-profile:${profileId}`,action:"fallback",fallback:STANDARD_AUDIO_PROFILE_ID,message:`Profile ${profileId} is preserved and rendered with Standard fallback.`});
  SECTION_IDS.forEach(sectionId => {
    const section = project?.sections?.[sectionId];
    Object.entries(section?.richTracks || {}).forEach(([trackId, track]) => {
      richTrackEvents(section,trackId).forEach(event => {
        const articulation = String(event.articulation || "").toLowerCase();
        if(articulation && !SUPPORTED_ARTICULATIONS.includes(articulation)) addLoss({path:`${event._path}.articulation`,feature:`articulation:${articulation}`,action:"fallback",fallback:"accent",message:`${articulation} is preserved and approximated as an accent.`});
        if(trackId === "drums"){
          const lane = String(event.sound || event.lane || event.role || "hat_closed").toLowerCase();
          if(!SUPPORTED_DRUM_LANES.includes(lane)) addLoss({path:`${event._path}.sound`,feature:`drum-lane:${lane}`,action:"fallback",fallback:"percussion",message:`${lane} is preserved and mapped to a Pocket DJ percussion voice.`});
          else if(!DJ_NATIVE_DRUM_LANES.includes(lane)) addLoss({path:`${event._path}.sound`,feature:`drum-lane:${lane}`,action:"approximated",fallback:lane.startsWith("tom_") || lane === "rim" || lane === "clap" ? "snare" : "hat_open",message:`${lane} is preserved and approximated by the Pocket DJ drum recipe.`});
        }
        Object.keys(event.technique || {}).filter(namespace => !Object.prototype.hasOwnProperty.call(POCKET_DJ_CAPABILITIES.techniques,namespace)).forEach(namespace => addLoss({path:`${event._path}.technique.${namespace}`,feature:`technique:${namespace}`,action:"preserved",message:`Technique namespace ${namespace} is preserved without a Pocket DJ-specific renderer.`}));
      });
    });
  });
  return {consumer:POCKET_DJ_CAPABILITIES.consumer,schemaVersions:POCKET_DJ_CAPABILITIES.schemaVersions.slice(),supportedFeatures:POCKET_DJ_CAPABILITIES.features.slice(),requestedFeatures,supportedProfiles:POCKET_DJ_CAPABILITIES.profiles.slice(),lossReport};
}
function negotiatePocketDjCapabilities(request={}){
  const requestedFeatures = uniqueStrings(request.features || request.formatFeatures);
  const requestedArticulations = uniqueStrings(request.articulations);
  return {
    ...cloneJson(POCKET_DJ_CAPABILITIES),
    requestedFeatures,
    unsupportedFeatures:requestedFeatures.filter(feature => !POCKET_DJ_CAPABILITIES.features.includes(feature)),
    requestedArticulations,
    unsupportedArticulations:requestedArticulations.filter(articulation => !SUPPORTED_ARTICULATIONS.includes(articulation))
  };
}
function sectionKey(base,id){ return `${base}${id}`; }
function normalizeBeat(value){
  if(value === true) return 1;
  if(value === false || value === null || value === undefined) return 0;
  return clamp(asInt(value,0),0,2);
}
function normalizeBool(value){ return !!value; }
function normalizeMaybeNote(value, max){
  if(value === null || value === undefined || value === "") return null;
  return clamp(asInt(value,0),0,max);
}
function normalizeGuitarArt(value){
  const v = String(value || "off").toLowerCase();
  if(["open","chug","accent","hold","scratch"].includes(v)) return v;
  if(["mute","palm","pm","palm_mute"].includes(v)) return "chug";
  if(["staccato","short"].includes(v)) return "scratch";
  if(["sustain"].includes(v)) return "hold";
  return "off";
}
function expectedSteps(project){ return MAX_BARS * project.timeSig * project.resolution; }
function fitArray(source, len, fill, normalizer){
  const out = new Array(len).fill(fill);
  const arr = Array.isArray(source) ? source : [];
  if(!arr.length) return out;
  if(arr.length === len){
    for(let i=0;i<len;i++) out[i] = normalizer ? normalizer(arr[i]) : arr[i];
    return out;
  }
  for(let i=0;i<arr.length;i++){
    const raw = normalizer ? normalizer(arr[i]) : arr[i];
    if(raw === null || raw === undefined || raw === false || raw === 0 || raw === "off") continue;
    const target = clamp(Math.round((i / arr.length) * len), 0, len - 1);
    out[target] = raw;
  }
  return out;
}
function sanitizeResolution(v){
  const n = asInt(v,4);
  return [1,2,4,8,16].includes(n) ? n : 4;
}
function sanitizeSectionBars(raw){
  const out = {};
  SECTION_IDS.forEach(id => out[id] = clamp(asInt(raw && raw[id], id === "A" ? 4 : 4),1,MAX_BARS));
  return out;
}
function sanitizeSequence(raw){
  const seq = Array.isArray(raw) ? raw : [];
  const out = seq.map(x => String(x || "A").toUpperCase()).filter(x => SECTION_IDS.includes(x)).slice(0,64);
  return out;
}
function sanitizeDjSequence(raw, sections){
  const activeIds = SECTION_IDS.filter(id => sections?.[id]?.active);
  const source = Array.isArray(raw) && raw.length ? raw : activeIds;
  const out = source.map(x => String(x || "A").toUpperCase()).filter(x => SECTION_IDS.includes(x) && sections?.[x]?.active).slice(0,64);
  return out.length ? out : (activeIds.length ? activeIds : ["A"]);
}
function degreeFromAny(value, fallback=0){
  if(value && typeof value === "object" && !Array.isArray(value)) return clamp(asInt(value.degree, fallback),0,6);
  return clamp(asInt(value, fallback),0,6);
}
function sanitizeProgression(raw){
  const arr = Array.isArray(raw) ? raw : DEFAULT_PROGRESSION;
  const out = [];
  for(let i=0;i<MAX_BARS;i++) out.push(degreeFromAny(arr[i], DEFAULT_PROGRESSION[i] ?? 0));
  return out;
}
function gridHasHits(grid){
  return DRUM_TRACKS.some(track => (grid[track] || []).some(v => normalizeBeat(v) > 0));
}
function tracksHaveNotes(tracks){ return (tracks || []).some(track => (track || []).some(v => v !== null && v !== undefined)); }
function guitarHasPattern(pattern){ return (pattern || []).some(v => normalizeGuitarArt(v) !== "off"); }
function progressionDiffers(raw){
  if(!Array.isArray(raw)) return false;
  return raw.some((v,i) => degreeFromAny(v, DEFAULT_PROGRESSION[i] ?? 0) !== (DEFAULT_PROGRESSION[i] ?? 0));
}
function sanitizeGrid(raw, len){
  const out = {};
  DRUM_TRACKS.forEach(track => out[track] = fitArray(raw && raw[track], len, 0, normalizeBeat));
  return out;
}
function sanitizeGridTuplets(raw, len){
  const out = {};
  DRUM_TRACKS.forEach(track => out[track] = fitArray(raw && raw[track], len, false, normalizeBool));
  return out;
}
function sanitizeMelodyTracks(raw, len){
  const source = Array.isArray(raw) && raw.length ? raw : [];
  const tracks = source.slice(0,8).map(t => fitArray(t, len, null, v => normalizeMaybeNote(v,23)));
  return tracks.length ? tracks : [new Array(len).fill(null)];
}
function ensureTrackArray(raw, count, fallback, normalizer){
  const arr = Array.isArray(raw) ? raw.slice(0,count) : [];
  while(arr.length < count) arr.push(fallback);
  return arr.map(v => normalizer ? normalizer(v) : v);
}
function ensureTrackGrid(raw, count, len, fill, normalizer){
  const arr = Array.isArray(raw) ? raw.slice(0,count) : [];
  while(arr.length < count) arr.push([]);
  return arr.map(t => fitArray(t, len, fill, normalizer));
}
function sanitizeSection(raw, project, id){
  const len = expectedSteps(project);
  const richSource = raw.sections?.[id] && typeof raw.sections[id] === "object" ? raw.sections[id] : {};
  const richTracks = normalizeRichTracks(richSource.tracks, id);
  const progressionRaw = raw[sectionKey("progression", id)];
  const grid = sanitizeGrid(raw[sectionKey("grid", id)], len);
  const gridTuplets = sanitizeGridTuplets(raw[sectionKey("gridTuplets", id)], len);
  const melodyTracks = sanitizeMelodyTracks(raw[sectionKey("melodyTracks", id)] || raw[sectionKey("melody", id)], len);
  const trackCount = melodyTracks.length;
  const guitarPattern = fitArray(raw[sectionKey("guitarPattern", id)] || raw[sectionKey("rockGuitar", id)], len, "off", normalizeGuitarArt);
  const bassNotes = fitArray(raw[sectionKey("bassNotes", id)], len, null, v => normalizeMaybeNote(v,13));
  const sequenceHas = (project.songSequence || []).includes(id);
  const active = id === "A" || sequenceHas || gridHasHits(grid) || tracksHaveNotes(melodyTracks) || bassNotes.some(v => v !== null) || (project.guitarEnabled && guitarHasPattern(guitarPattern)) || progressionDiffers(progressionRaw) || Object.values(richTracks).some(track => (track.events || []).length > 0);
  return {
    ...cloneJson(richSource),
    id,
    bars: clamp(asInt(project.sectionBars[id] ?? richSource.bars, MAX_BARS), 1, MAX_BARS),
    active,
    progression: sanitizeProgression(progressionRaw),
    grid,
    gridTuplets,
    melodyTracks,
    melodyInstruments: ensureTrackArray(raw[sectionKey("melodyInstruments", id)], trackCount, "pulse", v => safeChoice(v,pocketMelodyInstrumentIds(),"pulse")),
    melodyOctaves: ensureTrackArray(raw[sectionKey("melodyOctaves", id)], trackCount, 0, v => clamp(asInt(v,0),-1,1)),
    melodyMute: ensureTrackArray(raw[sectionKey("melodyMute", id)], trackCount, false, v => !!v),
    melodySolo: ensureTrackArray(raw[sectionKey("melodySolo", id)], trackCount, false, v => !!v),
    melodyPan: ensureTrackArray(raw[sectionKey("melodyPan", id)], trackCount, 0, v => clamp(asNum(v,0),-1,1)),
    melodyHold: ensureTrackGrid(raw[sectionKey("melodyHold", id)], trackCount, len, false, normalizeBool),
    melodySlide: ensureTrackGrid(raw[sectionKey("melodySlide", id)], trackCount, len, false, normalizeBool),
    melodyTuplets: ensureTrackGrid(raw[sectionKey("melodyTuplets", id)], trackCount, len, false, normalizeBool),
    bassNotes,
    bassHold: fitArray(raw[sectionKey("bassHold", id)], len, false, normalizeBool),
    bassSlide: fitArray(raw[sectionKey("bassSlide", id)], len, false, normalizeBool),
    bassAccent: fitArray(raw[sectionKey("bassAccent", id)], len, false, normalizeBool),
    guitarPattern,
    tracks: cloneJson(richSource.tracks || {}),
    richTracks
  };
}
function sanitizeLofiPresetId(value){
  const id = String(value || "");
  return lofiStylePresetIds().includes(id) ? id : "";
}
function sanitizeChipPresetId(value){
  const id = String(value || "");
  return chipStylePresetIds().includes(id) ? id : "";
}
function sanitizeMetalPresetId(value){
  const id = String(value || "");
  return metalStylePresetIds().includes(id) ? id : "";
}
function sanitizeLofiTexture(raw){
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    enabled: !!source.enabled,
    vinylCrackle: clamp(asNum(source.vinylCrackle, DEFAULT_LOFI_TEXTURE.vinylCrackle), 0, 1),
    tapeHiss: clamp(asNum(source.tapeHiss, DEFAULT_LOFI_TEXTURE.tapeHiss), 0, 1),
    wowFlutter: clamp(asNum(source.wowFlutter, DEFAULT_LOFI_TEXTURE.wowFlutter), 0, 1),
    warmth: clamp(asNum(source.warmth, DEFAULT_LOFI_TEXTURE.warmth), 0, 1),
    lowPassAge: clamp(asNum(source.lowPassAge, DEFAULT_LOFI_TEXTURE.lowPassAge), 0, 1),
    bitCrush: clamp(asNum(source.bitCrush, DEFAULT_LOFI_TEXTURE.bitCrush), 0, 1)
  };
}
function sanitizeChipTexture(raw){
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    enabled: !!source.enabled,
    bitDepth: clamp(asNum(source.bitDepth, DEFAULT_CHIP_TEXTURE.bitDepth), 0, 1),
    sampleRateCrush: clamp(asNum(source.sampleRateCrush, DEFAULT_CHIP_TEXTURE.sampleRateCrush), 0, 1),
    pulseWidth: clamp(asNum(source.pulseWidth, DEFAULT_CHIP_TEXTURE.pulseWidth), 0, 1),
    pitchDrift: clamp(asNum(source.pitchDrift, DEFAULT_CHIP_TEXTURE.pitchDrift), 0, 1),
    saturation: clamp(asNum(source.saturation, DEFAULT_CHIP_TEXTURE.saturation), 0, 1),
    stereoSpread: clamp(asNum(source.stereoSpread, DEFAULT_CHIP_TEXTURE.stereoSpread), 0, 1)
  };
}
function sanitizeMetalTexture(raw){
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    enabled: !!source.enabled,
    drive: clamp(asNum(source.drive, DEFAULT_METAL_TEXTURE.drive), 0, 1),
    palmMute: clamp(asNum(source.palmMute, DEFAULT_METAL_TEXTURE.palmMute), 0, 1),
    lowTightness: clamp(asNum(source.lowTightness, DEFAULT_METAL_TEXTURE.lowTightness), 0, 1),
    presence: clamp(asNum(source.presence, DEFAULT_METAL_TEXTURE.presence), 0, 1),
    roomSize: clamp(asNum(source.roomSize, DEFAULT_METAL_TEXTURE.roomSize), 0, 1),
    pickAttack: clamp(asNum(source.pickAttack, DEFAULT_METAL_TEXTURE.pickAttack), 0, 1)
  };
}
function sanitizePocketChordsmithProject(raw){
  if(!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That project is not a valid Pocket Chordsmith JSON object.");
  assertPocketDjProjectResourceLimits(raw);
  const originalProject = cloneJson(raw);
  const soundProfile = normalizeSoundProfile(raw);
  const rawStylePreset = raw.stylePreset || "";
  const rawChipPreset = raw.chipPreset || (soundProfile.id === CHIP_AUDIO_PROFILE_ID ? rendererPresetId(soundProfile.preset) : (String(rawStylePreset).startsWith("chip_") ? rawStylePreset : ""));
  const rawLofiPreset = raw.lofiPreset || (soundProfile.id === LOFI_AUDIO_PROFILE_ID ? rendererPresetId(soundProfile.preset) : (String(rawStylePreset).startsWith("lofi_") ? rawStylePreset : ""));
  const rawMetalPreset = raw.metalPreset || (soundProfile.id === HEAVY_METAL_AUDIO_PROFILE_ID ? rendererPresetId(soundProfile.preset) : (String(rawStylePreset).startsWith("metal_") ? rawStylePreset : ""));
  const chipPreset = sanitizeChipPresetId(rawChipPreset);
  const metalPreset = chipPreset ? "" : sanitizeMetalPresetId(rawMetalPreset);
  const lofiPreset = chipPreset || metalPreset ? "" : sanitizeLofiPresetId(rawLofiPreset);
  const audioProfile = soundProfile.id === CHIP_AUDIO_PROFILE_ID || raw.audioProfile === LEGACY_CHIP_AUDIO_PROFILE_ID || chipPreset
    ? CHIP_AUDIO_PROFILE_ID
    : (soundProfile.id === HEAVY_METAL_AUDIO_PROFILE_ID || metalPreset
      ? HEAVY_METAL_AUDIO_PROFILE_ID
      : (soundProfile.id === LOFI_AUDIO_PROFILE_ID || lofiPreset ? LOFI_AUDIO_PROFILE_ID : soundProfile.id));
  const rich = hasRichProjectSurface(raw) || soundProfile.id === WESTERN_AUDIO_PROFILE_ID || soundProfile.id === FUNK_AUDIO_PROFILE_ID;
  const project = {
    ...originalProject,
    projectVersion: rich ? Math.max(PROJECT_SCHEMA_VERSION, asInt(raw.projectVersion ?? raw.schemaVersion, PROJECT_SCHEMA_VERSION)) : asInt(raw.projectVersion ?? raw.schemaVersion, 1),
    formatFeatures: uniqueStrings([...(Array.isArray(raw.formatFeatures) ? raw.formatFeatures : []), ...(rich ? SCHEMA17_FEATURES : [])]),
    soundProfile,
    key: safeChoice(raw.key, NOTES, "C"),
    scale: safeChoice(raw.scale, ["major","minor"], "major"),
    timeSig: safeChoice(asInt(raw.timeSig,4), [3,4], 4),
    bpm: clamp(asInt(raw.bpm,96), 40, 240),
    theme: safeChoice(raw.theme, ["night","ocean","forest","sunset"], "night"),
    swing: clamp(asNum(raw.swing,0), 0, .3),
    audioProfile,
    lofiPreset: audioProfile === LOFI_AUDIO_PROFILE_ID ? lofiPreset : "",
    lofiTexture: sanitizeLofiTexture(raw.lofiTexture),
    chipPreset: audioProfile === CHIP_AUDIO_PROFILE_ID ? (chipPreset || rendererPresetId(soundProfile.preset) || "chip_arcade_start") : "",
    chipTexture: sanitizeChipTexture(raw.chipTexture),
    metalPreset: audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID ? (metalPreset || rendererPresetId(soundProfile.preset) || "metal_classic_chug") : "",
    metalTexture: sanitizeMetalTexture(raw.metalTexture),
    drumKit: safeChoice(raw.drumKit, pocketDrumKitIds(), "classic"),
    drumGroovePreset: String(raw.drumGroovePreset || ""),
    bassTone: safeChoice(raw.bassTone, pocketBassToneIds(), "classic"),
    resolution: sanitizeResolution(raw.resolution ?? raw.lastAdvancedResolution ?? 4),
    chordType: safeChoice(raw.chordType,["triad","seventh","sus2","sus4"],"triad"),
    chordInstrument: safeChoice(raw.chordInstrument,pocketChordInstrumentIds(),"pocket"),
    chordPlayMode: safeChoice(raw.chordPlayMode,["block","strum_up","strum_down","arp_up","arp_down"],"block"),
    chordRhythmMode: safeChoice(raw.chordRhythmMode,["sustain","quarter","half"],"sustain"),
    chordOctave: clamp(asInt(raw.chordOctave,0),-1,1),
    melodyPitchMode: safeChoice(raw.melodyPitchMode,["scale","chromatic"],"scale"),
    bassMode: safeChoice(raw.bassMode,["auto","manual"],"auto"),
    guitarEnabled: !!raw.guitarEnabled,
    guitarTone: safeChoice(raw.guitarTone,["clean","crunch","high_gain","metal","tight_metal","doom_fuzz","western_twang","funk_muted"],audioProfile === WESTERN_AUDIO_PROFILE_ID ? "western_twang" : "high_gain"),
    guitarRegister: safeChoice(raw.guitarRegister,["low","mid","high"],"low"),
    guitarStrumMode: safeChoice(raw.guitarStrumMode,["down","up","alternate"],"down"),
    guitarVolume: clamp(asNum(raw.guitarVolume,.66),0,1),
    fxDelay: clamp(asNum(raw.fxDelay,.12),0,1),
    fxChorus: clamp(asNum(raw.fxChorus,.18),0,1),
    fxFlanger: clamp(asNum(raw.fxFlanger,.06),0,1),
    fxReverb: clamp(asNum(raw.fxReverb,.18),0,1),
    fxMix: clamp(asNum(raw.fxMix,.65),0,1),
    humanizeOn: !!raw.humanizeOn,
    sidechainOn: !!(raw.sidechainOn ?? raw.pumpChordsEnabled),
    sidechainAmount: clamp(asNum(raw.sidechainAmount ?? raw.pumpAmount,.45),0,1),
    sectionBars: sanitizeSectionBars(raw.sectionBars || raw.sectionLengths),
    songSequence: sanitizeSequence(raw.songSequence || raw.sectionSequence),
    rawTitle: raw.title || raw.name || "Imported Chordsmith Project",
    sections: {}
  };
  if(audioProfile === WESTERN_AUDIO_PROFILE_ID){
    project.chordInstrument = safeChoice(raw.chordInstrument,pocketChordInstrumentIds(),"saloon_piano");
    project.chordPlayMode = safeChoice(raw.chordPlayMode,["block","strum_up","strum_down","arp_up","arp_down"],"strum_up");
    project.guitarTone = safeChoice(raw.guitarTone,["clean","crunch","western_twang"],"western_twang");
  }
  if(audioProfile === FUNK_AUDIO_PROFILE_ID){
    project.bassTone = safeChoice(raw.bassTone,pocketBassToneIds(),"funk_finger_pocket");
    project.chordInstrument = safeChoice(raw.chordInstrument,pocketChordInstrumentIds(),"funk_clav_stab");
    project.drumGroovePreset = raw.drumGroovePreset || "funk_backbeat_98";
  }
  if(project.audioProfile !== LOFI_AUDIO_PROFILE_ID) project.lofiTexture.enabled = false;
  if(project.audioProfile !== CHIP_AUDIO_PROFILE_ID) project.chipTexture.enabled = false;
  if(project.audioProfile !== HEAVY_METAL_AUDIO_PROFILE_ID) project.metalTexture.enabled = false;
  SECTION_IDS.forEach(id => project.sections[id] = sanitizeSection(raw, project, id));
  project.compatibility = capabilityReportForProject(project);
  Object.defineProperty(project,"_originalProject",{value:originalProject, enumerable:false, configurable:true});
  return project;
}

/* 4. Session converter */
function createDjSessionFromChordsmithProject(project, originalProject=project?._originalProject || project){
  const activeIds = SECTION_IDS.filter(id => project.sections[id] && project.sections[id].active);
  const first = activeIds[0] || "A";
  const guitarActive = project.guitarEnabled && SECTION_IDS.some(id => guitarHasPattern(project.sections[id].guitarPattern));
  const sequence = sanitizeDjSequence(project.songSequence, project.sections);
  const sequenceStart = Math.max(0, sequence.indexOf(first));
  return {
    app:"PocketDJ",
    djVersion:POCKET_DJ_VERSION,
    schemaVersion:PROJECT_SCHEMA_VERSION,
    formatFeatures:project.formatFeatures || [],
    source:{app:"PocketChordsmith", sourcePrefix:"PCS1", projectVersion:project.projectVersion, project, originalProject:cloneJson(originalProject)},
    deck:{
      name:project.rawTitle || "Imported Chordsmith Project",
      bpm:project.bpm, key:project.key, scale:project.scale, theme:project.theme || "night", timeSig:project.timeSig, swing:project.swing,
      audioProfile:project.audioProfile, soundProfile:cloneJson(project.soundProfile), formatFeatures:project.formatFeatures || [], lofiPreset:project.lofiPreset, lofiTexture:project.lofiTexture, chipPreset:project.chipPreset, chipTexture:project.chipTexture, metalPreset:project.metalPreset, metalTexture:project.metalTexture,
      drumKit:project.drumKit, drumGroovePreset:project.drumGroovePreset, bassTone:project.bassTone,
      resolution:project.resolution, chordType:project.chordType, chordInstrument:project.chordInstrument,
      chordPlayMode:project.chordPlayMode, chordRhythmMode:project.chordRhythmMode, chordOctave:project.chordOctave,
      melodyPitchMode:project.melodyPitchMode, bassMode:project.bassMode,
      guitarEnabled:project.guitarEnabled, guitarActive, guitarTone:project.guitarTone, guitarRegister:project.guitarRegister, guitarStrumMode:project.guitarStrumMode,
      humanizeOn:project.humanizeOn,
      sidechainOn:project.sidechainOn, sidechainAmount:project.sidechainAmount
    },
    sections:project.sections,
    performance:{
      currentSection:first,
      queuedSection:null,
      launchQuantize:"bar",
      loopCurrentSection:false,
      dropTarget:null,
      sequence,
      sequencePlaying:false,
      sequenceRepeat:true,
      sequenceIndex:sequenceStart,
      stemVolumes:{...DEFAULT_STEM_VOLUMES, guitar:project.guitarVolume ?? DEFAULT_STEM_VOLUMES.guitar},
      stemMutes:{...DEFAULT_STEM_MUTES},
      fx:{filter:DEFAULT_FX.filter, echo:project.fxDelay, chorus:project.fxChorus, flanger:project.fxFlanger, reverb:project.fxReverb, mix:project.fxMix},
      masterVolume:.82,
      buildActive:false,
      funkMacros:{oneDrop:false,bassMute:false,slapPopEmphasis:false,ghostLift:false,phraseFill:false}
    },
    compatibility:cloneJson(project.compatibility || capabilityReportForProject(project))
  };
}
function normalizePocketDjSession(raw){
  if(!raw || raw.app !== "PocketDJ") throw new Error("That is not a Pocket DJ session.");
  assertPocketDjProjectResourceLimits(raw);
  assertPocketDjProjectResourceLimits(raw.source?.project);
  assertPocketDjProjectResourceLimits(raw.source?.originalProject);
  assertPocketDjProjectResourceLimits(raw.project);
  const originalProject = raw.source?.originalProject || raw.source?.project || raw.project || {};
  const sourceProject = raw.source && raw.source.project ? sanitizePocketChordsmithProject(raw.source.project) : sanitizePocketChordsmithProject(raw.project || {});
  const base = createDjSessionFromChordsmithProject(sourceProject, originalProject);
  const perf = raw.performance || {};
  const activeIds = SECTION_IDS.filter(id => base.sections[id].active);
  base.deck.name = raw.deck?.name || base.deck.name;
  base.deck.soundProfile = cloneJson(raw.deck?.soundProfile || sourceProject.soundProfile);
  base.deck.formatFeatures = uniqueStrings(raw.deck?.formatFeatures || sourceProject.formatFeatures);
  base.performance.currentSection = SECTION_IDS.includes(perf.currentSection) ? perf.currentSection : (activeIds[0] || "A");
  base.performance.queuedSection = SECTION_IDS.includes(perf.queuedSection) ? perf.queuedSection : null;
  base.performance.launchQuantize = ["instant","bar","section"].includes(perf.launchQuantize) ? perf.launchQuantize : "bar";
  base.performance.loopCurrentSection = !!perf.loopCurrentSection;
  base.performance.dropTarget = SECTION_IDS.includes(perf.dropTarget) && base.sections[perf.dropTarget]?.active ? perf.dropTarget : null;
  base.performance.sequence = sanitizeDjSequence(perf.sequence || base.source.project.songSequence, base.sections);
  base.performance.sequencePlaying = !!perf.sequencePlaying;
  base.performance.sequenceRepeat = perf.sequenceRepeat !== false;
  base.performance.sequenceIndex = clamp(asInt(perf.sequenceIndex,0), 0, Math.max(0, base.performance.sequence.length - 1));
  base.performance.stemVolumes = {...base.performance.stemVolumes, ...(perf.stemVolumes || {})};
  STEMS.forEach(s => base.performance.stemVolumes[s] = clamp(asNum(base.performance.stemVolumes[s], DEFAULT_STEM_VOLUMES[s]),0,1));
  base.performance.stemMutes = {...base.performance.stemMutes, ...(perf.stemMutes || {})};
  STEMS.forEach(s => base.performance.stemMutes[s] = !!base.performance.stemMutes[s]);
  base.performance.fx = {...base.performance.fx, ...(perf.fx || {})};
  base.performance.fx.filter = clamp(asNum(base.performance.fx.filter, DEFAULT_FX.filter),0,1);
  base.performance.fx.echo = clamp(asNum(base.performance.fx.echo, DEFAULT_FX.echo),0,1);
  base.performance.fx.chorus = clamp(asNum(base.performance.fx.chorus, DEFAULT_FX.chorus),0,1);
  base.performance.fx.flanger = clamp(asNum(base.performance.fx.flanger, DEFAULT_FX.flanger),0,1);
  base.performance.fx.reverb = clamp(asNum(base.performance.fx.reverb, DEFAULT_FX.reverb),0,1);
  base.performance.fx.mix = clamp(asNum(base.performance.fx.mix, DEFAULT_FX.mix),0,1);
  base.performance.masterVolume = clamp(asNum(perf.masterVolume,.82),0,1);
  base.performance.funkMacros = {...base.performance.funkMacros, ...(perf.funkMacros || {})};
  Object.keys(base.performance.funkMacros).forEach(key => base.performance.funkMacros[key] = !!base.performance.funkMacros[key]);
  base.compatibility = cloneJson(raw.compatibility || sourceProject.compatibility || capabilityReportForProject(sourceProject));
  return base;
}
function exportPocketDjSession(session){ return JSON.parse(JSON.stringify(session)); }
function buildSourcePocketChordsmithShareCode(){
  if(!session || !session.source || !session.source.project) throw new Error("No source Pocket Chordsmith song is loaded.");
  const source = session.source.originalProject || session.source.project;
  return `${PCS_SHARE_PREFIX}${utf8ToBase64Url(JSON.stringify(source))}`;
}
function showHandoffOutput(text, message){
  if(el.handoffText) el.handoffText.value = text;
  if(el.handoffHelp) el.handoffHelp.textContent = message;
  if(el.handoffBox) el.handoffBox.classList.remove("hidden");
}
async function copyHandoffText(text){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch(e){}
  return false;
}
function openPreparedHandoffWindow(payload=null){
  try{
    const opened = window.open("about:blank", "PocketHandoffTarget");
    if(opened){
      if(payload) opened.name = `${HANDOFF_WINDOW_PREFIX}${encodePocketHandoff(payload)}`;
      try{ opened.opener = null; }catch(e){}
      return opened;
    }
  }catch(e){}
  return null;
}
function openHandoffUrl(url, blockedMessage, payload=null, preparedWindow=null){
  try{
    if(preparedWindow && !preparedWindow.closed){
      preparedWindow.location.href = url;
      return true;
    }
    const targetName = payload ? `${HANDOFF_WINDOW_PREFIX}${encodePocketHandoff(payload)}` : "_blank";
    const opened = window.open(url, targetName);
    if(opened){
      if(payload) opened.name = targetName;
      try{ opened.opener = null; }catch(e){}
      return true;
    }
  }catch(e){}
  showStatus(blockedMessage);
  return false;
}
async function editSourceSongInChordsmith(){
  let code = "";
  try{
    code = buildSourcePocketChordsmithShareCode();
  }catch(e){
    showStatus(e.message || "No source song to edit.");
    return;
  }
  showHandoffOutput(code, "Copy this source song code into Pocket Chordsmith Import.");
  const payload = buildPocketHandoff("dj-to-chordsmith", code);
  const saved = saveHandoffPayload(HANDOFF_TO_CHORDSMITH_KEY, payload);
  const targetBaseUrl = resolvePocketChordsmithUrl();
  const preparedWindow = openPreparedHandoffWindow(payload);
  const copied = await copyHandoffText(code);
  const opened = openHandoffUrl(
    buildHandoffUrl(targetBaseUrl, payload),
    `Source song code ready. Pop-up blocked; open ${targetBaseUrl} and paste Import.`,
    payload,
    preparedWindow
  );
  if(opened){
    showStatus(copied ? "Source song sent. Opening Pocket Chordsmith..." : "Source song sent. Opening Pocket Chordsmith...");
    showHandoffOutput(code, saved ? "Pocket Chordsmith will import this source song when it opens." : "Pocket Chordsmith will import from the launch URL; copy fallback is ready.");
  }else if(copied){
    showStatus("Source song copied. Open Pocket Chordsmith and paste Import.");
  }else{
    showStatus("Source song ready below. Copy it into Pocket Chordsmith Import.");
  }
}

/* 5. Audio engine */
