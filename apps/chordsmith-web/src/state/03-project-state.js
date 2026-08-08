function currentLabels(){ return state.scale === "major" ? DEGREE_LABELS : MINOR_LABELS; }
function buildScale(key, scale){
  const root = noteIndex(key);
  const ints = scale === "major" ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
  return ints.map(i => (root + i) % 12);
}
function triadQuality(scale, degree){
  return scale === "major" ? ["maj","min","min","maj","maj","min","dim"][degree] : ["min","dim","maj","min","min","maj","maj"][degree];
}
function chordIntervals(quality, type){
  if(type === "sus2") return [0,2,7];
  if(type === "sus4") return [0,5,7];
  if(type === "seventh"){
    if(quality === "maj") return [0,4,7,11];
    if(quality === "min") return [0,3,7,10];
    return [0,3,6,10];
  }
  if(quality === "maj") return [0,4,7];
  if(quality === "min") return [0,3,7];
  return [0,3,6];
}
function chordSuffix(quality, type){
  if(type === "sus2") return "sus2";
  if(type === "sus4") return "sus4";
  if(type === "seventh") return quality === "maj" ? "maj7" : quality === "min" ? "m7" : "dim7";
  return quality === "maj" ? "" : quality === "min" ? "m" : "dim";
}
function makeChord(scaleNotes, degree){
  const quality = triadQuality(state.scale, degree);
  return {
    degree,
    root: scaleNotes[degree],
    quality,
    numeral: currentLabels()[degree],
    intervals: chordIntervals(quality, state.chordType),
    name: `${NOTES[scaleNotes[degree]]}${chordSuffix(quality, state.chordType)}`
  };
}
function generateAvailableChords(){
  const scaleNotes = buildScale(state.key, state.scale);
  state.availableChords = Array.from({length:7}, (_,i)=>makeChord(scaleNotes, i));
  const defaults = state.scale === "major" ? [0,4,5,3] : [0,5,2,6];
  const remap = (prog) => (!Array.isArray(prog) || !prog.length) ? defaults.map(d=>state.availableChords[d]) :
    prog.map(ch => ch === null ? null : (state.availableChords[ch?.degree ?? 0] || state.availableChords[0]));
  SECTION_IDS.forEach(id => { state[sectionPropKey("progression", id)] = remap(state[sectionPropKey("progression", id)]); });
  syncSection();
  updateSuggestions();
}
function randomChoice(list){
  return list[Math.floor(Math.random() * list.length)];
}
function randomKeyAndChordPattern(){
  const nextKey = randomChoice(NOTES);
  const nextScale = randomChoice(["major", "minor"]);
  const pattern = randomChoice(CHORD_RANDOMISER_PATTERNS[nextScale] || CHORD_RANDOMISER_PATTERNS.major);
  return {key:nextKey, scale:nextScale, pattern};
}
function transposeChromaticMelodiesForKeyChange(previousKey, nextKey){
  if(state.melodyPitchMode !== "chromatic" || previousKey === nextKey) return;
  const from = noteIndex(previousKey), to = noteIndex(nextKey);
  if(from < 0 || to < 0) return;
  const delta = (to - from + 12) % 12;
  const transposeIndex = (value) => {
    if(value === null || value === undefined) return null;
    const idx = clamp(asInt(value, 0), 0, 23);
    const oct = Math.floor(idx / 12);
    const pc = (idx + delta) % 12;
    return clamp(pc + oct * 12, 0, 23);
  };
  SECTION_IDS.forEach(id => {
    const key = sectionPropKey("melodyTracks", id);
    state[key] = ensureMelodyTracksLength(state[key]).map(track => track.map(transposeIndex));
  });
  state.selectedMelodyDegree = transposeIndex(state.selectedMelodyDegree) ?? 0;
  syncSection();
}
function alignMelodyPickerToKey(){
  if(state.melodyPitchMode === "chromatic"){
    state.selectedMelodyDegree = clamp(noteIndex(state.key), 0, 11);
  } else {
    state.selectedMelodyDegree = clamp(asInt(state.selectedMelodyDegree, 0), 0, melodyNoteCount() - 1);
  }
}
async function applyRandomIdea(){
  if(isLofiActive() || Math.random() < 0.22){
    applyLofiPresetToProject(randomChoice(LOFI_STYLE_PRESET_IDS), {fullLoop:false});
    return;
  }
  pushUndoState();
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  const idea = randomKeyAndChordPattern();
  const previousKey = state.key;

  state.key = idea.key;
  state.scale = idea.scale;
  transposeChromaticMelodiesForKeyChange(previousKey, idea.key);
  alignMelodyPickerToKey();
  generateAvailableChords();
  state.progression = idea.pattern.degrees.map(degree => state.availableChords[degree] || state.availableChords[0]);
  state.selectedSlot = 0;
  storeSection();
  updateSuggestions();
  markProjectDirty();
  renderAll();

  const modeLabel = idea.scale === "major" ? "major" : "minor";
  const chordNames = state.progression.map(ch => ch?.name || "-").join(" - ");
  const message = `${idea.key} ${modeLabel}: ${idea.pattern.name} pattern (${chordNames})`;
  if(wasPlaying){
    state.playbackMode = previousMode;
    restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`);
  } else {
    setStatus(message);
  }

  try{
    await ensureAudio();
    const firstChord = state.progression[0] || state.availableChords[0];
    playChord(firstChord, audioCtx.currentTime, 0.75);
  }catch(e){}
}
function updateSuggestions(){
  const current = state.progression[state.selectedSlot] || state.availableChords[0];
  const map = {0:[3,4,5],1:[4,6],2:[5,3],3:[1,4],4:[0,5],5:[1,3,4],6:[0,2]};
  state.nextSuggested = map[current.degree] || [0,4,5];
}

function blankGrid(){ return {kick:new Array(totalSteps()).fill(0), snare:new Array(totalSteps()).fill(0), hat:new Array(totalSteps()).fill(0), bass:new Array(totalSteps()).fill(0)}; }
function blankGridTuplets(){ return {kick:new Array(totalSteps()).fill(false), snare:new Array(totalSteps()).fill(false), hat:new Array(totalSteps()).fill(false), bass:new Array(totalSteps()).fill(false)}; }
function blankMelody(){ return new Array(totalSteps()).fill(null); }
function blankMelodyTracks(count=1){
  return Array.from({length:count}, () => blankMelody());
}
function blankMelodyInstruments(count=1){
  return Array.from({length:count}, () => "pulse");
}
function blankMelodyOctaves(count=1){
  return Array.from({length:count}, () => 0);
}
function blankMelodyMute(count=1){
  return Array.from({length:count}, () => false);
}
function blankMelodySolo(count=1){
  return Array.from({length:count}, () => false);
}
function blankMelodyPan(count=1){
  return Array.from({length:count}, () => 0);
}
function blankMelodyHold(count=1){
  return Array.from({length:count}, () => new Array(totalSteps()).fill(false));
}
function blankMelodySlide(count=1){
  return Array.from({length:count}, () => new Array(totalSteps()).fill(false));
}
function blankMelodyTuplets(count=1){
  return Array.from({length:count}, () => new Array(totalSteps()).fill(false));
}
function blankBassHold(){ return new Array(totalSteps()).fill(false); }
function blankBassSlide(){ return new Array(totalSteps()).fill(false); }
function blankBassNotes(){ return new Array(totalSteps()).fill(null); }
function blankBassAccent(){ return new Array(totalSteps()).fill(false); }
function normalizeGuitarArticulation(value){
  const v = String(value || "off").toLowerCase();
  if(v === "mute" || v === "palm" || v === "pm") return "chug";
  if(v === "sustain") return "hold";
  if(v === "dead" || v === "dead_mute") return "scratch";
  return GUITAR_ARTICULATIONS.includes(v) ? v : "off";
}
function createGuitarState(){
  return new Array(totalSteps()).fill("off");
}
function ensureGuitarPatternLength(pattern){
  const old = Array.isArray(pattern) ? pattern : [];
  const newLen = totalSteps();
  const next = new Array(newLen).fill("off");
  if(!old.length) return next;
  if(old.length === newLen) return old.map(normalizeGuitarArticulation);
  old.forEach((value, index) => {
    const art = normalizeGuitarArticulation(value);
    if(art === "off") return;
    const targetIndex = rescaleStepIndex(index, old.length, newLen);
    next[targetIndex] = art;
  });
  return next;
}
function normaliseGuitarState(raw){
  return ensureGuitarPatternLength(raw);
}
function ensureMelodyBoolLength(list, trackCount){
  const safe = Array.isArray(list) ? list.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(false);
  return safe.map(v => !!v);
}
function ensureMelodyPanLength(list, trackCount){
  const safe = Array.isArray(list) ? list.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(0);
  return safe.map(v => clamp(asNumber(v, 0), -1, 1));
}
function melodyTrackIsAudible(trackIndex, section=null){
  if(state.uiMode === "simple") return trackIndex === 0;
  const suffix = section || state.currentSection;
  const mute = state[`melodyMute${suffix}`] || state.melodyMute || [];
  const solo = state[`melodySolo${suffix}`] || state.melodySolo || [];
  const anySolo = solo.some(Boolean);
  if(anySolo) return !!solo[trackIndex];
  return !mute[trackIndex];
}
function melodyTrackPanValue(trackIndex, section=null){
  const suffix = section || state.currentSection;
  const pans = state[`melodyPan${suffix}`] || state.melodyPan || [];
  return clamp(asNumber(pans[trackIndex], 0), -1, 1);
}
function panLabel(value){
  if(value < -0.1) return "L";
  if(value > 0.1) return "R";
  return "C";
}
function featureSeed(step, seed=0){
  const x = Math.sin((step + 1) * 12.9898 + (seed + 1) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function stableNoiseSample(index, seed=0){
  const x = Math.sin((index + 1) * 12.9898 + (seed + 1) * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
function humanizeOffset(step, seed=0){
  if(!state.humanizeOn) return 0;
  return (featureSeed(step, seed) - 0.5) * 0.018;
}
function humanizePeak(base, step, seed=0){
  if(!state.humanizeOn) return base;
  return base * (0.88 + featureSeed(step, seed + 99) * 0.20);
}
function humanizeVelocity(base, step, seed=0){
  return clamp(Math.round(base * (state.humanizeOn ? (0.9 + featureSeed(step, seed + 199) * 0.18) : 1)), 1, 127);
}
function safeAudioTime(t){
  if(!Number.isFinite(t)) return 0;
  return Math.max(0, t);
}
function applySidechainDuck(gainNode, t, amount=state.sidechainAmount){
  if(!gainNode || !state.sidechainOn) return;
  const amt = clamp(asNumber(amount, 0.45), 0, 1);
  const base = gainNode.gain.value || 1;
  const duck = Math.max(0.18, base * (1 - (amt * 0.72)));
  gainNode.gain.cancelScheduledValues(t);
  gainNode.gain.setValueAtTime(base, t);
  gainNode.gain.linearRampToValueAtTime(duck, t + 0.012);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, base), t + 0.22);
}
function applyAdvancedVisibility(){
  if(els.melodyPadsPanel) els.melodyPadsPanel.classList.toggle("optional-hidden", !state.showMelodyPads || state.uiMode !== "advanced");
  if(els.drumPadsPanel) els.drumPadsPanel.classList.toggle("optional-hidden", !state.showDrumPads || state.uiMode !== "advanced");
  if(els.melodyPickerPanel) els.melodyPickerPanel.classList.toggle("optional-hidden", !state.showMelodyPicker || state.uiMode !== "advanced" || state.melodyInputMode === "xy");
  if(els.melodyTrackControls) els.melodyTrackControls.classList.toggle("optional-hidden", !state.showTrackControls || state.uiMode !== "advanced");
  if(els.sidechainAmountRow) els.sidechainAmountRow.style.display = state.sidechainOn && state.uiMode === "advanced" ? "flex" : "none";
}

function rescaleStepIndex(index, oldLen, newLen){
  if(newLen <= 0) return 0;
  if(!oldLen || oldLen <= 0) return clamp(asInt(index, 0), 0, newLen - 1);
  return clamp(Math.round((index / oldLen) * newLen), 0, newLen - 1);
}
function rescaleBoundaryIndex(index, oldLen, newLen){
  if(newLen <= 0) return 0;
  if(!oldLen || oldLen <= 0) return clamp(asInt(index, 0), 0, newLen);
  return clamp(Math.round((index / oldLen) * newLen), 0, newLen);
}
function mergeBeatLevel(existing, incoming){
  return Math.max(normalizeBeatCell(existing), normalizeBeatCell(incoming));
}
function rescaleBeatTrack(track, normalizer=normalizeBeatCell){
  const old = Array.isArray(track) ? track : [];
  const newLen = totalSteps();
  const next = new Array(newLen).fill(0);
  if(!old.length) return next;
  if(old.length === newLen) return old.map(v => normalizer(v));

  old.forEach((value, index) => {
    const safeValue = normalizer(value);
    if(!safeValue) return;
    const targetIndex = rescaleStepIndex(index, old.length, newLen);
    next[targetIndex] = mergeBeatLevel(next[targetIndex], safeValue);
  });
  return next;
}
function rescaleNullableNoteTrack(track, normalizer=null){
  const old = Array.isArray(track) ? track : [];
  const newLen = totalSteps();
  const next = new Array(newLen).fill(null);
  if(!old.length) return next;
  if(old.length === newLen){
    return old.map(v => {
      if(v === null || v === undefined) return null;
      return normalizer ? normalizer(v) : v;
    });
  }

  old.forEach((value, index) => {
    if(value === null || value === undefined) return;
    const targetIndex = rescaleStepIndex(index, old.length, newLen);
    next[targetIndex] = normalizer ? normalizer(value) : value;
  });
  return next;
}
function rescaleBoolIntervalTrack(track){
  const old = Array.isArray(track) ? track : [];
  const newLen = totalSteps();
  const next = new Array(newLen).fill(false);
  if(!old.length) return next;
  if(old.length === newLen) return old.map(v => !!v);

  old.forEach((value, index) => {
    if(!value) return;
    const start = rescaleBoundaryIndex(index, old.length, newLen);
    const end = Math.max(start + 1, rescaleBoundaryIndex(index + 1, old.length, newLen));
    for(let i = start; i < Math.min(end, newLen); i++) next[i] = true;
  });
  return next;
}
function rescalePhrasedNoteData(noteTrack, holdTrack, slideTrack, accentTrack=null, normalizer=null){
  const oldNotes = Array.isArray(noteTrack) ? noteTrack : [];
  const oldHold = Array.isArray(holdTrack) ? holdTrack : [];
  const oldSlide = Array.isArray(slideTrack) ? slideTrack : [];
  const oldAccent = Array.isArray(accentTrack) ? accentTrack : null;
  const oldLen = Math.max(oldNotes.length, oldHold.length, oldSlide.length, oldAccent ? oldAccent.length : 0);
  const newLen = totalSteps();
  const notes = new Array(newLen).fill(null);
  const hold = new Array(newLen).fill(false);
  const slide = new Array(newLen).fill(false);
  const accent = oldAccent ? new Array(newLen).fill(false) : null;

  if(!oldLen){
    return {notes, hold, slide, accent};
  }

  if(oldLen === newLen){
    for(let i = 0; i < newLen; i++){
      const rawNote = oldNotes[i];
      notes[i] = rawNote === null || rawNote === undefined ? null : (normalizer ? normalizer(rawNote) : rawNote);
      hold[i] = !!oldHold[i];
      slide[i] = !!oldSlide[i];
      if(accent) accent[i] = !!oldAccent[i];
    }
    return {notes, hold, slide, accent};
  }

  const safeNoteAt = (index) => {
    const raw = oldNotes[index];
    if(raw === null || raw === undefined) return null;
    return normalizer ? normalizer(raw) : raw;
  };

  let index = 0;
  while(index < oldLen){
    const note = safeNoteAt(index);
    if(note === null || oldSlide[index]){
      index++;
      continue;
    }

    let phraseEnd = index + 1;
    while(phraseEnd < oldLen && oldHold[phraseEnd]) phraseEnd++;

    let slideIndex = -1;
    let slideNote = null;
    if(phraseEnd < oldLen && oldSlide[phraseEnd] && safeNoteAt(phraseEnd) !== null){
      slideIndex = phraseEnd;
      slideNote = safeNoteAt(slideIndex);
      phraseEnd = slideIndex + 1;
      while(phraseEnd < oldLen && oldHold[phraseEnd]) phraseEnd++;
    }

    let newStart = rescaleBoundaryIndex(index, oldLen, newLen);
    let newEnd = rescaleBoundaryIndex(phraseEnd, oldLen, newLen);
    if(newStart >= newLen) newStart = newLen - 1;
    if(newEnd <= newStart) newEnd = Math.min(newLen, newStart + 1);

    notes[newStart] = note;
    if(accent) accent[newStart] = !!oldAccent[index];

    if(slideIndex >= 0){
      let newSlideStart = rescaleBoundaryIndex(slideIndex, oldLen, newLen);
      newSlideStart = clamp(newSlideStart, newStart + 1, Math.max(newStart + 1, newLen - 1));
      for(let i = newStart + 1; i < Math.min(newSlideStart, newLen); i++) hold[i] = true;
      if(newSlideStart < newLen){
        notes[newSlideStart] = slideNote;
        slide[newSlideStart] = true;
        if(accent) accent[newSlideStart] = !!oldAccent[slideIndex];
        for(let i = newSlideStart + 1; i < Math.min(newEnd, newLen); i++) hold[i] = true;
      }
    } else {
      for(let i = newStart + 1; i < Math.min(newEnd, newLen); i++) hold[i] = true;
    }

    index = Math.max(index + 1, phraseEnd);
  }

  return {notes, hold, slide, accent};
}
function rescaleMelodySectionData(sectionId){
  const keyTracks = sectionPropKey("melodyTracks", sectionId);
  const keyHold = sectionPropKey("melodyHold", sectionId);
  const keySlide = sectionPropKey("melodySlide", sectionId);
  const sourceTracks = state[keyTracks];
  const sourceHold = state[keyHold];
  const sourceSlide = state[keySlide];
  const trackCount = Math.max(1, Array.isArray(sourceTracks) ? sourceTracks.length : 0);
  const nextTracks = [];
  const nextHold = [];
  const nextSlide = [];

  for(let trackIndex = 0; trackIndex < trackCount; trackIndex++){
    const scaled = rescalePhrasedNoteData(
      (sourceTracks || [])[trackIndex],
      (sourceHold || [])[trackIndex],
      (sourceSlide || [])[trackIndex],
      null,
      v => clamp(asInt(v, 0), 0, 23)
    );
    nextTracks.push(scaled.notes);
    nextHold.push(scaled.hold);
    nextSlide.push(scaled.slide);
  }

  state[keyTracks] = nextTracks;
  state[keyHold] = nextHold;
  state[keySlide] = nextSlide;
}
function rescaleBassSectionData(sectionId){
  const scaled = rescalePhrasedNoteData(
    state[sectionPropKey("bassNotes", sectionId)],
    state[sectionPropKey("bassHold", sectionId)],
    state[sectionPropKey("bassSlide", sectionId)],
    state[sectionPropKey("bassAccent", sectionId)],
    v => clamp(asInt(v, 0), 0, 13)
  );
  state[sectionPropKey("bassNotes", sectionId)] = scaled.notes;
  state[sectionPropKey("bassHold", sectionId)] = scaled.hold;
  state[sectionPropKey("bassSlide", sectionId)] = scaled.slide;
  state[sectionPropKey("bassAccent", sectionId)] = scaled.accent || new Array(totalSteps()).fill(false);
  state[sectionPropKey("bassArticulation", sectionId)] = ensureBassArticulationTrack(state[sectionPropKey("bassArticulation", sectionId)] || []);
  state[sectionPropKey("drumLanes", sectionId)] = sanitizeDrumLanes(state[sectionPropKey("drumLanes", sectionId)] || {});
}
function ensureGridLengths(target){
  TRACKS.forEach(t => {
    const old = target[t.id] || [];
    target[t.id] = rescaleBeatTrack(old, normalizeBeatCell);
  });
}
function ensureMelodyLength(arr){
  return rescaleNullableNoteTrack(arr, v => clamp(asInt(v, 0), 0, 23));
}
function ensureMelodyTracksLength(tracks){
  const safe = Array.isArray(tracks) && tracks.length ? tracks.slice(0, MAX_MELODY_TRACKS) : blankMelodyTracks(1);
  return safe.map(track => ensureMelodyLength(track));
}
function ensureMelodyHoldTrack(track){ return rescaleBoolIntervalTrack(track); }
function ensureMelodyHoldLength(tracks, trackCount=1){
  const safe = Array.isArray(tracks) ? tracks.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(new Array(totalSteps()).fill(false));
  return safe.map(track => ensureMelodyHoldTrack(track));
}
function ensureMelodySlideTrack(track){ return rescaleBoolIntervalTrack(track); }
function ensureMelodySlideLength(tracks, trackCount=1){
  const safe = Array.isArray(tracks) ? tracks.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(new Array(totalSteps()).fill(false));
  return safe.map(track => ensureMelodySlideTrack(track));
}
function ensureTupletTrack(track){ return rescaleBoolIntervalTrack(track); }
function sanitizeGridTuplets(grid){
  const out = {};
  TRACKS.forEach(track => {
    const source = grid && Array.isArray(grid[track.id]) ? grid[track.id] : [];
    out[track.id] = ensureTupletTrack(source);
  });
  return out;
}
function ensureGridTupletLengths(target){
  const out = target || {};
  TRACKS.forEach(t => { out[t.id] = ensureTupletTrack(out[t.id] || []); });
  return out;
}
function ensureMelodyTupletsLength(tracks, trackCount=1){
  const safe = Array.isArray(tracks) ? tracks.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(new Array(totalSteps()).fill(false));
  return safe.map(track => ensureTupletTrack(track));
}
function normalizeTupletStarts(tupletTrack, steps, isValidStart){
  // v56c: tuplets are two-cell spans, so starts must never overlap.
  // This converts accidental chains like 1-2, 2-3, 3-4 into clean pairs: 1-2, 3-4.
  let blockedUntil = -1;
  for(let i = 0; i < totalSteps(); i++){
    const valid = i < steps - 1 && !!isValidStart(i);
    if(!tupletTrack[i] || !valid){
      tupletTrack[i] = false;
      continue;
    }
    if(i <= blockedUntil){
      tupletTrack[i] = false;
      continue;
    }
    tupletTrack[i] = true;
    blockedUntil = i + 1;
  }
}
function clearInvalidGridTuplets(sectionId=state.currentSection){
  const grid = state[sectionPropKey("grid", sectionId)] || state.grid;
  const tuplets = state[sectionPropKey("gridTuplets", sectionId)] || state.gridTuplets;
  const steps = visibleSectionSteps(sectionId);
  TRACKS.forEach(t => {
    if(!tuplets[t.id]) tuplets[t.id] = new Array(totalSteps()).fill(false);
    normalizeTupletStarts(tuplets[t.id], steps, i =>
      normalizeBeatCell(grid[t.id]?.[i]) > 0 && normalizeBeatCell(grid[t.id]?.[i + 1]) > 0
    );
  });
}
function clearInvalidMelodyTuplets(sectionId=state.currentSection){
  const tracks = state[sectionPropKey("melodyTracks", sectionId)] || state.melodyTracks || [];
  const tuplets = state[sectionPropKey("melodyTuplets", sectionId)] || state.melodyTuplets || [];
  const steps = visibleSectionSteps(sectionId);
  tracks.forEach((track, idx) => {
    const tupletTrack = tuplets[idx] || [];
    tuplets[idx] = tupletTrack;
    normalizeTupletStarts(tupletTrack, steps, i =>
      track[i] !== null && track[i] !== undefined && track[i + 1] !== null && track[i + 1] !== undefined
    );
  });
}
function gridTripletStart(section, trackId, step){
  if(!section || !section.gridTuplets || !section.gridTuplets[trackId]) return false;
  const stepCount = section.bars * stepsPerBar();
  return step < stepCount - 1 && !!section.gridTuplets[trackId][step] && normalizeBeatCell(section.grid[trackId]?.[step]) > 0 && normalizeBeatCell(section.grid[trackId]?.[step+1]) > 0;
}
function gridTripletSecond(section, trackId, step){ return step > 0 && gridTripletStart(section, trackId, step - 1); }
function melodyTripletStart(section, trackIndex, step){
  const track = (section.melodyTracks || [])[trackIndex] || [];
  const tuplets = (section.melodyTuplets || [])[trackIndex] || [];
  const stepCount = section.bars * stepsPerBar();
  return step < stepCount - 1 && !!tuplets[step] && track[step] !== null && track[step] !== undefined && track[step+1] !== null && track[step+1] !== undefined;
}
function melodyTripletSecond(section, trackIndex, step){ return step > 0 && melodyTripletStart(section, trackIndex, step - 1); }
function toggleGridTriplet(trackId, startStep){
  const steps = visibleSectionSteps();
  if(startStep < 0 || startStep >= steps - 1) return false;
  if(normalizeBeatCell(state.grid[trackId]?.[startStep]) === 0 || normalizeBeatCell(state.grid[trackId]?.[startStep+1]) === 0) return false;
  if(!state.gridTuplets || !state.gridTuplets[trackId]) state.gridTuplets = ensureGridTupletLengths(state.gridTuplets || blankGridTuplets());
  const wasOn = !!state.gridTuplets[trackId][startStep];
  state.gridTuplets[trackId][startStep] = !wasOn;
  clearInvalidGridTuplets(state.currentSection);
  const isOn = !!state.gridTuplets[trackId][startStep];
  const overlapCleaned = !wasOn && !isOn;
  storeSection();
  renderSeq();
  setStatus(overlapCleaned
    ? "Triplet overlaps were cleaned. Consecutive triplets use pairs like 1-2, 3-4, 5-6."
    : isOn ? "Triplet marked: three hits now play in the space of those two cells" : "Triplet marker removed");
  return true;
}
function toggleMelodyTriplet(trackIndex, startStep){
  const steps = visibleSectionSteps();
  const track = state.melodyTracks[trackIndex] || [];
  if(startStep < 0 || startStep >= steps - 1) return false;
  if(track[startStep] === null || track[startStep] === undefined || track[startStep+1] === null || track[startStep+1] === undefined) return false;
  state.melodyTuplets = ensureMelodyTupletsLength(state.melodyTuplets || [], state.melodyTracks.length);
  const wasOn = !!state.melodyTuplets[trackIndex][startStep];
  state.melodyTuplets[trackIndex][startStep] = !wasOn;
  clearInvalidMelodyTuplets(state.currentSection);
  const isOn = !!state.melodyTuplets[trackIndex][startStep];
  const overlapCleaned = !wasOn && !isOn;
  storeSection();
  renderMelodyRows();
  setStatus(overlapCleaned
    ? "Melody triplet overlaps were cleaned. Consecutive triplets use pairs like 1-2, 3-4, 5-6."
    : isOn ? "Melody triplet marked: three notes play in the space of those two cells" : "Melody triplet marker removed");
  return true;
}
function melodyTripletMiddleIndex(a, b){
  if(a === null || a === undefined) return b;
  if(b === null || b === undefined) return a;
  const max = Math.max(0, melodyNoteCount() - 1);
  return clamp(Math.round((asInt(a,0) + asInt(b,0)) / 2), 0, max);
}
function spanDurationForSteps(startStep, span=2, resolution=activeResolution(), swing=state.swing){
  let dur = 0;
  for(let i=0;i<span;i++) dur += stepDurationForIndex(startStep + i, resolution, swing);
  return dur;
}
function tripletTimesForSpan(startTime, spanDur){ return [startTime, startTime + spanDur / 3, startTime + (spanDur * 2) / 3]; }
function tripletTickOffsets(spanTicks){ return [0, Math.round(spanTicks / 3), Math.round((spanTicks * 2) / 3)]; }
function ensureBassHoldTrack(track){ return ensureMelodyHoldTrack(track); }
function ensureBassSlideTrack(track){ return ensureMelodySlideTrack(track); }
function ensureBassNotesTrack(track){ return rescaleNullableNoteTrack(track, v => clamp(asInt(v, 0), 0, 13)); }
function ensureBassAccentTrack(track){ return rescaleBoolIntervalTrack(track); }
function ensureMelodyInstrumentsLength(list, trackCount){
  const safe = Array.isArray(list) ? list.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push("pulse");
  const allowed = melodyInstrumentIds();
  return safe.map(v => allowed.includes(v) ? v : "pulse");
}
function ensureMelodyOctavesLength(list, trackCount, fallback=0){
  const safe = Array.isArray(list) ? list.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(fallback);
  return safe.map(v => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : Math.max(-1, Math.min(1, n));
  });
}
function currentSectionSuffix(){
  return sanitizeSectionId(state.currentSection);
}
function syncSection(){
  const suffix = currentSectionSuffix();
  SECTION_PROP_GROUPS.forEach(currentKey => {
    state[currentKey] = state[sectionPropKey(currentKey, suffix)];
  });

  if(!state.melodyTracks.length){
    state.melodyTracks = blankMelodyTracks(1);
    state[sectionPropKey("melodyTracks", suffix)] = state.melodyTracks;
  }

  state.melodyInstruments = ensureMelodyInstrumentsLength(state.melodyInstruments, state.melodyTracks.length);
  state.melodyOctaves = ensureMelodyOctavesLength(state.melodyOctaves, state.melodyTracks.length, state.melodyOctave || 0);
  state.melodyMute = ensureMelodyBoolLength(state.melodyMute, state.melodyTracks.length);
  state.melodySolo = ensureMelodyBoolLength(state.melodySolo, state.melodyTracks.length);
  state.melodyPan = ensureMelodyPanLength(state.melodyPan, state.melodyTracks.length);
  state.melodyHold = ensureMelodyHoldLength(state.melodyHold, state.melodyTracks.length);
  state.melodySlide = ensureMelodySlideLength(state.melodySlide, state.melodyTracks.length);
  state.gridTuplets = ensureGridTupletLengths(state.gridTuplets || blankGridTuplets());
  state.melodyTuplets = ensureMelodyTupletsLength(state.melodyTuplets || [], state.melodyTracks.length);
  cleanMelodyConnectionsForSection(suffix);
  clearInvalidGridTuplets(suffix);
  clearInvalidMelodyTuplets(suffix);
  state.bassHold = ensureBassHoldTrack(state.bassHold);
  state.bassSlide = ensureBassSlideTrack(state.bassSlide);
  state.bassNotes = ensureBassNotesTrack(state.bassNotes);
  state.bassAccent = ensureBassAccentTrack(state.bassAccent);
  state.bassArticulation = ensureBassArticulationTrack(state.bassArticulation);
  state.drumLanes = sanitizeDrumLanes(state.drumLanes || {});
  state.guitarPattern = ensureGuitarPatternLength(state.guitarPattern);

  state[sectionPropKey("melodyInstruments", suffix)] = state.melodyInstruments;
  state[sectionPropKey("melodyOctaves", suffix)] = state.melodyOctaves;
  state[sectionPropKey("melodyMute", suffix)] = state.melodyMute;
  state[sectionPropKey("melodySolo", suffix)] = state.melodySolo;
  state[sectionPropKey("melodyPan", suffix)] = state.melodyPan;
  state[sectionPropKey("melodyHold", suffix)] = state.melodyHold;
  state[sectionPropKey("melodySlide", suffix)] = state.melodySlide;
  state[sectionPropKey("gridTuplets", suffix)] = state.gridTuplets;
  state[sectionPropKey("melodyTuplets", suffix)] = state.melodyTuplets;
  state[sectionPropKey("bassHold", suffix)] = state.bassHold;
  state[sectionPropKey("bassSlide", suffix)] = state.bassSlide;
  state[sectionPropKey("bassNotes", suffix)] = state.bassNotes;
  state[sectionPropKey("bassAccent", suffix)] = state.bassAccent;
  state[sectionPropKey("bassArticulation", suffix)] = state.bassArticulation;
  state[sectionPropKey("drumLanes", suffix)] = state.drumLanes;
  state[sectionPropKey("guitarPattern", suffix)] = state.guitarPattern;
  state[sectionPropKey("progression", suffix)] = state.progression;
  state[sectionPropKey("grid", suffix)] = state.grid;

  state.activeMelodyTrack = Math.max(0, Math.min(state.activeMelodyTrack, state.melodyTracks.length - 1));
}
function storeSection(){
  const suffix = currentSectionSuffix();
  SECTION_PROP_GROUPS.forEach(currentKey => {
    state[sectionPropKey(currentKey, suffix)] = state[currentKey];
  });
}

function masterVolumeValue(){
  return volumeSliderValue("masterVol", 0.82);
}
function volumeSliderValue(id, fallback){
  const raw = els[id] ? parseFloat(els[id].value) : fallback;
  return clamp(Number.isFinite(raw) ? raw : fallback, 0, 1);
}
function setVolumeSliderValue(id, value, fallback){
  if(!els[id]) return;
  els[id].value = String(clamp(asNumber(value, fallback), 0, 1));
}
function preparePlaybackStructureRestart(){
  if(!state.isPlaying || !audioCtx) return;
  const now = audioCtx.currentTime;
  clearSchedulerTimers();
  clearPendingUiTimers();
  resetLiveRecordStepClock();
  resetPlaybackHighlights();
  silenceChordVoices(now, 0.018);
  silenceLiveVoices(activeLeadVoices, now, 0.018);
  silenceLiveVoices(activeGuitarVoices, now, 0.018);
  if(masterGain){
    try{
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(0.0001, now, 0.012);
    }catch(e){}
  }
  state.currentStep = -1;
  state.currentSequenceIndex = -1;
  state.lastHighlightedStep = -1;
}
function restartPlaybackPlanAfterStructureChange(message="Playback plan updated"){
  if(!state.isPlaying || !audioCtx) return;
  const mode = state.playbackMode || "section";
  clearSchedulerTimers();
  clearPendingUiTimers();
  resetPlaybackHighlights();
  state.transportPlan = buildPlaybackPlan(mode);
  nextNoteTime = audioCtx.currentTime + 0.12;
  playStep = 0;
  resetLiveRecordStepClock();
  state.currentStep = -1;
  state.currentSequenceIndex = -1;
  state.currentPlaybackSection = mode === "sequence" ? sequenceList()[0] : state.currentSection;
  state.lastHighlightedStep = -1;
  if(masterGain){
    const now = audioCtx.currentTime;
    try{
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(masterVolumeValue(), now + 0.035, 0.025);
    }catch(e){}
  }
  schedulerTimer = setInterval(() => {
    if(!state.isPlaying || !state.transportPlan.length) return;
    scheduler();
  }, SCHEDULER_INTERVAL_MS);
  schedulerTimers.add(schedulerTimer);
  scheduler();
  updateTransportButtonLabels();
  setStatus(message);
}

function applyResolutionChange(newRes, playbackMessage=null){
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  if(wasPlaying) preparePlaybackStructureRestart();
  storeSection();
  state.resolution = newRes;
  SECTION_IDS.forEach(id => {
    ensureGridLengths(state[sectionPropKey("grid", id)]);
    state[sectionPropKey("gridTuplets", id)] = ensureGridTupletLengths(state[sectionPropKey("gridTuplets", id)] || blankGridTuplets());
    rescaleMelodySectionData(id);
    rescaleBassSectionData(id);
    state[sectionPropKey("guitarPattern", id)] = ensureGuitarPatternLength(state[sectionPropKey("guitarPattern", id)] || []);
    state[sectionPropKey("melodyOctaves", id)] = ensureMelodyOctavesLength(state[sectionPropKey("melodyOctaves", id)], state[sectionPropKey("melodyTracks", id)].length, state.melodyOctave || 0);
    state[sectionPropKey("melodyMute", id)] = ensureMelodyBoolLength(state[sectionPropKey("melodyMute", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodySolo", id)] = ensureMelodyBoolLength(state[sectionPropKey("melodySolo", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodyPan", id)] = ensureMelodyPanLength(state[sectionPropKey("melodyPan", id)], state[sectionPropKey("melodyTracks", id)].length);
    state[sectionPropKey("melodyTuplets", id)] = ensureMelodyTupletsLength(state[sectionPropKey("melodyTuplets", id)] || [], state[sectionPropKey("melodyTracks", id)].length);
  });
  syncSection();
  renderAll();
  if(wasPlaying){
    state.playbackMode = previousMode;
    restartPlaybackPlanAfterStructureChange(playbackMessage || `Resolution changed to ${displayedResolutionName()} - playback restarted with the full grid`);
  }
}

function clearPendingUiTimers(){
  state.pendingUiTimers.forEach(id => clearTimeout(id));
  state.pendingUiTimers = [];
}

function setCellCurrentState(cell, isCurrent){
  if(!cell) return;
  cell.classList.toggle("current", !!isCurrent);
}
function updatePlaybackHighlights(prevStep, nextStep){
  const prevBar = prevStep >= 0 ? Math.floor(prevStep / stepsPerBar()) : -1;
  const nextBar = nextStep >= 0 ? Math.floor(nextStep / stepsPerBar()) : -1;

  if(els.seqHeader){
    const prevHead = els.seqHeader.querySelector(`[data-step="${prevStep}"]`);
    const nextHead = els.seqHeader.querySelector(`[data-step="${nextStep}"]`);
    setCellCurrentState(prevHead, false);
    setCellCurrentState(nextHead, true);
  }

  if(els.seqRows){
    els.seqRows.querySelectorAll(`[data-step="${prevStep}"]`).forEach(el => setCellCurrentState(el, false));
    els.seqRows.querySelectorAll(`[data-step="${nextStep}"]`).forEach(el => setCellCurrentState(el, true));
  }

  if(els.melodyRows){
    els.melodyRows.querySelectorAll(`[data-step="${prevStep}"]`).forEach(el => setCellCurrentState(el, false));
    els.melodyRows.querySelectorAll(`[data-step="${nextStep}"]`).forEach(el => setCellCurrentState(el, true));
  }
  if(els.guitarRow){
    els.guitarRow.querySelectorAll(`[data-step="${prevStep}"]`).forEach(el => setCellCurrentState(el, false));
    els.guitarRow.querySelectorAll(`[data-step="${nextStep}"]`).forEach(el => setCellCurrentState(el, true));
  }

  const slots = els.progressionSlots ? Array.from(els.progressionSlots.children) : [];
  if(prevBar !== nextBar && slots.length){
    if(prevBar >= 0 && slots[prevBar]) slots[prevBar].classList.remove("playing");
    if(nextBar >= 0 && slots[nextBar]) slots[nextBar].classList.add("playing");
  }

  state.lastHighlightedStep = nextStep;
  updateMiniTransport();
}
function resetPlaybackHighlights(){
  updatePlaybackHighlights(state.lastHighlightedStep, -1);
}
function resetTransientUi(options={}){
  const {keepStepHighlight=false} = options;
  clearPendingUiTimers();
  if(!keepStepHighlight) resetPlaybackHighlights();
  state.xyLastWriteStep = -1;
  if(els.xyPadMarker) els.xyPadMarker.style.display = "none";
  if(els.xyPadReadout) els.xyPadReadout.textContent = "Ready";
}
function syncModeState(prevMode=null){
  if(state.uiMode === "simple") {
    state.melodyInputMode = "grid";
    state.activeMelodyTrack = 0;
    if(prevMode === "advanced" && state.resolution !== 1){
      state.lastAdvancedResolution = state.resolution;
    }
  } else if(state.uiMode === "advanced") {
    if(prevMode === "simple" && !state.advancedFxPrimed){
      state.fxDelay = 0;
      state.fxChorus = 0;
      state.fxFlanger = 0;
      state.fxReverb = 0;
      state.fxMix = 0;
      state.advancedFxPrimed = true;
    }
    if(prevMode === "simple" && state.resolution === 1 && state.lastAdvancedResolution && state.lastAdvancedResolution !== 1){
      state.resolution = state.lastAdvancedResolution;
      SECTION_IDS.forEach(id => {
        ensureGridLengths(state[sectionPropKey("grid", id)]);
        state[sectionPropKey("melodyTracks", id)] = ensureMelodyTracksLength(state[sectionPropKey("melodyTracks", id)]);
        state[sectionPropKey("melodyOctaves", id)] = ensureMelodyOctavesLength(state[sectionPropKey("melodyOctaves", id)], state[sectionPropKey("melodyTracks", id)].length, state.melodyOctave || 0);
        state[sectionPropKey("melodyHold", id)] = ensureMelodyHoldLength(state[sectionPropKey("melodyHold", id)], state[sectionPropKey("melodyTracks", id)].length);
        state[sectionPropKey("guitarPattern", id)] = ensureGuitarPatternLength(state[sectionPropKey("guitarPattern", id)] || []);
      });
      syncSection();
    }
  }
}

function initStateArrays(){
  SECTION_IDS.forEach(id => {
    state[sectionPropKey("grid", id)] = blankGrid();
    state[sectionPropKey("gridTuplets", id)] = blankGridTuplets();
    state[sectionPropKey("melodyTracks", id)] = blankMelodyTracks(1);
    state[sectionPropKey("melodyInstruments", id)] = blankMelodyInstruments(1);
    state[sectionPropKey("melodyOctaves", id)] = blankMelodyOctaves(1);
    state[sectionPropKey("melodyMute", id)] = blankMelodyMute(1);
    state[sectionPropKey("melodySolo", id)] = blankMelodySolo(1);
    state[sectionPropKey("melodyPan", id)] = blankMelodyPan(1);
    state[sectionPropKey("melodyHold", id)] = blankMelodyHold(1);
    state[sectionPropKey("melodySlide", id)] = blankMelodySlide(1);
    state[sectionPropKey("melodyTuplets", id)] = blankMelodyTuplets(1);
    state[sectionPropKey("bassHold", id)] = blankBassHold();
    state[sectionPropKey("bassSlide", id)] = blankBassSlide();
    state[sectionPropKey("bassNotes", id)] = blankBassNotes();
    state[sectionPropKey("bassAccent", id)] = blankBassAccent();
    state[sectionPropKey("bassArticulation", id)] = ensureBassArticulationTrack([]);
    state[sectionPropKey("drumLanes", id)] = createDrumLanes();
    state[sectionPropKey("guitarPattern", id)] = createGuitarState();
    state[sectionPropKey("progression", id)] = new Array(4).fill(null);
  });
  syncSection();
}
