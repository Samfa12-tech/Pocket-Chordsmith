function setSectionProgressionDegrees(sectionId, degrees){
  const id = sanitizeSectionId(sectionId);
  state[sectionPropKey("progression", id)] = degrees.map(degree => state.availableChords[degree] || state.availableChords[0]);
}
function sectionStepIndex(bar, beat=0, fraction=0){
  const res = activeResolution();
  const step = (bar * state.timeSig + beat) * res + Math.round(fraction * res);
  return clamp(step, 0, Math.max(0, totalSteps() - 1));
}
function clearSectionPerformance(sectionId){
  const id = sanitizeSectionId(sectionId);
  state[sectionPropKey("grid", id)] = blankGrid();
  state[sectionPropKey("gridTuplets", id)] = blankGridTuplets();
  state[sectionPropKey("bassNotes", id)] = blankBassNotes();
  state[sectionPropKey("bassHold", id)] = blankBassHold();
  state[sectionPropKey("bassSlide", id)] = blankBassSlide();
  state[sectionPropKey("bassAccent", id)] = blankBassAccent();
  state[sectionPropKey("melodyTracks", id)] = blankMelodyTracks(2);
  state[sectionPropKey("melodyInstruments", id)] = blankMelodyInstruments(2);
  state[sectionPropKey("melodyOctaves", id)] = blankMelodyOctaves(2);
  state[sectionPropKey("melodyMute", id)] = blankMelodyMute(2);
  state[sectionPropKey("melodySolo", id)] = blankMelodySolo(2);
  state[sectionPropKey("melodyPan", id)] = [-0.12, 0.22];
  state[sectionPropKey("melodyHold", id)] = blankMelodyHold(2);
  state[sectionPropKey("melodySlide", id)] = blankMelodySlide(2);
  state[sectionPropKey("melodyTuplets", id)] = blankMelodyTuplets(2);
}
function fillLofiBassForSection(sectionId, variant=0){
  const id = sanitizeSectionId(sectionId);
  const notes = blankBassNotes();
  const hold = blankBassHold();
  const slide = blankBassSlide();
  const accent = blankBassAccent();
  const bars = sectionBarCount(id);
  const res = activeResolution();
  const progression = state[sectionPropKey("progression", id)] || state.progression || [];
  for(let bar = 0; bar < bars; bar++){
    const chord = progression[bar % Math.max(1, progression.length)] || state.availableChords[0];
    const root = clamp(asInt(chord?.degree, 0), 0, 6);
    const fifth = (root + 4) % 7;
    const start = sectionStepIndex(bar, 0, 0);
    notes[start] = root;
    accent[start] = true;
    for(let i = 1; i < Math.min(res * 2, totalSteps() - start); i++) hold[start + i] = true;
    if(state.timeSig >= 4 && variant !== 2){
      const mid = sectionStepIndex(bar, 2, variant === 1 ? 0.5 : 0);
      notes[mid] = variant === 3 ? fifth : root;
      accent[mid] = variant === 3;
      for(let i = 1; i < Math.min(res, totalSteps() - mid); i++) hold[mid + i] = true;
    } else if(state.timeSig === 3 && bar % 2 === 1){
      const waltz = sectionStepIndex(bar, 2, 0);
      notes[waltz] = fifth;
    }
  }
  state[sectionPropKey("bassNotes", id)] = notes;
  state[sectionPropKey("bassHold", id)] = hold;
  state[sectionPropKey("bassSlide", id)] = slide;
  state[sectionPropKey("bassAccent", id)] = accent;
  state.bassMode = "manual";
}
function fillLofiMelodyForSection(sectionId, preset, variant=0){
  const id = sanitizeSectionId(sectionId);
  const tracks = blankMelodyTracks(2);
  const hold = blankMelodyHold(2);
  const slide = blankMelodySlide(2);
  const tuplets = blankMelodyTuplets(2);
  const instruments = [preset.melodyInstrument || "mellow_vibes", preset.melodyInstrument === "tape_bell" ? "mellow_vibes" : "tape_bell"];
  const octaves = [0, variant === 3 ? 1 : 0];
  const bars = sectionBarCount(id);
  const motif = variant === 1 ? [4,2,0,2] : variant === 2 ? [2,0,4,2] : variant === 3 ? [4,5,7,5] : [0,2,4,2];
  const answer = variant === 2 ? [null,4,null,2] : [null,5,null,4];
  for(let bar = 0; bar < bars; bar++){
    if(variant === 2 && bar % 2 === 0) continue;
    const phrase = (bar + variant) % motif.length;
    tracks[0][sectionStepIndex(bar, 0, 0)] = motif[phrase];
    if(state.timeSig >= 4){
      tracks[0][sectionStepIndex(bar, 1, 0.5)] = motif[(phrase + 1) % motif.length];
      tracks[0][sectionStepIndex(bar, 3, 0)] = motif[(phrase + 3) % motif.length];
      const ans = answer[phrase % answer.length];
      if(ans !== null) tracks[1][sectionStepIndex(bar, 2, 0.5)] = ans;
    } else {
      tracks[0][sectionStepIndex(bar, 2, 0)] = motif[(phrase + 1) % motif.length];
      if(bar % 2 === 1) tracks[1][sectionStepIndex(bar, 1, 0)] = 7;
    }
  }
  state[sectionPropKey("melodyTracks", id)] = tracks;
  state[sectionPropKey("melodyInstruments", id)] = instruments;
  state[sectionPropKey("melodyOctaves", id)] = octaves;
  state[sectionPropKey("melodyMute", id)] = blankMelodyMute(2);
  state[sectionPropKey("melodySolo", id)] = blankMelodySolo(2);
  state[sectionPropKey("melodyPan", id)] = [-0.18, 0.24];
  state[sectionPropKey("melodyHold", id)] = hold;
  state[sectionPropKey("melodySlide", id)] = slide;
  state[sectionPropKey("melodyTuplets", id)] = tuplets;
}
function applyLofiPresetToProject(presetId, options={}){
  const preset = lofiPresetConfig(presetId) || LOFI_STYLE_PRESETS.lofi_study_room;
  const fullLoop = !!options.fullLoop;
  pushUndoState();
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  if(wasPlaying) stopPlayback();
  state.audioProfile = LOFI_AUDIO_PROFILE_ID;
  state.lofiPreset = sanitizeLofiPresetId(presetId) || "lofi_study_room";
  state.settingsGenre = "lofi";
  state.lofiTexture = sanitizeLofiTexture(preset.texture, state.lofiPreset);
  state.chipPreset = "";
  state.chipTexture = {...DEFAULT_CHIP_TEXTURE, enabled:false};
  state.metalPreset = "";
  state.metalTexture = {...DEFAULT_METAL_TEXTURE, enabled:false};
  state.drumKit = safeChoice(preset.drumKit, lofiDrumKitIds(), "lofi_dusty");
  state.drumGroovePreset = safeChoice(preset.drumGroovePreset, lofiDrumGroovePresetIds(), "lofi_backbeat_76");
  state.bassTone = safeChoice(preset.bassTone, lofiBassToneIds(), "warm_sub");
  state.key = preset.key || state.key;
  state.scale = preset.scale || state.scale;
  state.timeSig = safeChoice(preset.timeSig, [3,4], 4);
  state.bpm = clamp(asInt(preset.bpm, 76), 60, 90);
  state.swing = clamp(asNumber(preset.swing, 0.12), 0, 0.18);
  state.humanizeOn = true;
  state.sidechainOn = true;
  state.sidechainAmount = clamp(state.drumGroovePreset === "lofi_sparse_clicks" ? 0.18 : 0.26, 0, 1);
  state.chordType = "seventh";
  state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "dusty_rhodes");
  state.chordPlayMode = state.chordInstrument === "muted_jazz_guitar" ? "strum_down" : "block";
  state.chordRhythmMode = "sustain";
  state.resolution = 4;
  state.lastAdvancedResolution = 4;
  state.guitarEnabled = false;
  generateAvailableChords();
  const sections = fullLoop ? ["A","B","C","D"] : [state.currentSection || "A"];
  sections.forEach((id, idx) => {
    state.sectionBars[id] = 4;
    clearSectionPerformance(id);
    const rotate = idx % Math.max(1, preset.progression.length);
    const degrees = preset.progression.map((_, pidx) => preset.progression[(pidx + rotate) % preset.progression.length]);
    setSectionProgressionDegrees(id, degrees);
    fillDrumPresetForSection(idx === 2 ? "lofi_sparse_clicks" : state.drumGroovePreset, id);
    if(idx === 2){
      const grid = state[sectionPropKey("grid", id)];
      if(grid){
        grid.kick.fill(0);
        grid.snare.fill(0);
        for(let bar = 0; bar < sectionBarCount(id); bar++) grid.hat[sectionStepIndex(bar, 0, 0)] = 1;
      }
    }
    fillLofiBassForSection(id, idx);
    fillLofiMelodyForSection(id, preset, fullLoop ? idx : 0);
    if(id === state.currentSection) syncSection();
  });
  if(fullLoop) state.songSequence = ["A","A","B","A","C","B","D","A"];
  state.currentSection = sections[0];
  syncSection();
  state.selectedSlot = 0;
  state.activeMelodyTrack = 0;
  updateSuggestions();
  markProjectDirty();
  renderAll();
  const label = preset.label || "Lofi Chill";
  const message = fullLoop ? `${label} game loop generated across A-D` : `${label} lofi idea generated`;
  if(wasPlaying){
    state.playbackMode = previousMode;
    restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`);
  } else {
    setStatus(message);
  }
  try{
    ensureAudio().then(() => {
      const firstChord = state.progression[0] || state.availableChords[0];
      playChord(firstChord, audioCtx.currentTime, 0.8);
      playLofiTexture(audioCtx.currentTime, 0);
    }).catch(() => {});
  }catch(e){}
}
function fillChipBassForSection(id, rotate=0){
  const notes = ensureBassNotesTrack(state[sectionPropKey("bassNotes", id)] || []);
  const hold = ensureBassHoldTrack(state[sectionPropKey("bassHold", id)] || []);
  const slide = ensureBassSlideTrack(state[sectionPropKey("bassSlide", id)] || []);
  const accent = ensureBassAccentTrack(state[sectionPropKey("bassAccent", id)] || []);
  notes.fill(null); hold.fill(false); slide.fill(false); accent.fill(false);
  const pattern = [0, null, 0, 7, 4, null, 7, null, 0, null, 5, 7, 4, null, 2, null];
  for(let bar = 0; bar < sectionBarCount(id); bar++){
    pattern.forEach((note, pos) => {
      const step = sectionStepIndex(bar, Math.floor(pos / 4), (pos % 4) / 4);
      if(step < 0 || step >= notes.length || note === null) return;
      notes[step] = (note + rotate) % 14;
      accent[step] = pos === 0 || pos === 8;
    });
  }
  state[sectionPropKey("bassNotes", id)] = notes;
  state[sectionPropKey("bassHold", id)] = hold;
  state[sectionPropKey("bassSlide", id)] = slide;
  state[sectionPropKey("bassAccent", id)] = accent;
}
function fillChipMelodyForSection(id, preset, rotate=0){
  const steps = totalSteps();
  const tracks = [blankMelody(), blankMelody()];
  const hold = blankMelodyHold(2);
  const slide = blankMelodySlide(2);
  const tuplets = blankMelodyTuplets(2);
  const motif = preset.label === "Bug Maze Pulse" ? [0,2,4,7,9,7,4,2] : [0,2,4,5,7,5,4,2];
  const answer = preset.scale === "minor" ? [7,9,10,9,7,null,4,5] : [7,9,11,9,7,null,5,4];
  for(let bar = 0; bar < sectionBarCount(id); bar++){
    for(let i = 0; i < 8; i++){
      const step = sectionStepIndex(bar, Math.floor(i / 2), (i % 2) * 0.5);
      if(step >= 0 && step < steps && i % 2 === 0) tracks[0][step] = motif[(i + rotate + bar) % motif.length];
    }
    [1,3,5,7].forEach((i, idx) => {
      const step = sectionStepIndex(bar, Math.floor(i / 2), (i % 2) * 0.5);
      const note = answer[(idx + rotate + bar) % answer.length];
      if(step >= 0 && step < steps && note !== null) tracks[1][step] = note;
    });
  }
  state[sectionPropKey("melodyTracks", id)] = tracks;
  state[sectionPropKey("melodyInstruments", id)] = [preset.melodyInstrument || "chip_square_lead", preset.melodyInstrument === "modern_chip_lead" ? "chip_square_lead" : "chip_bell_stack"];
  state[sectionPropKey("melodyOctaves", id)] = [0, 1];
  state[sectionPropKey("melodyMute", id)] = blankMelodyMute(2);
  state[sectionPropKey("melodySolo", id)] = blankMelodySolo(2);
  state[sectionPropKey("melodyPan", id)] = [-0.22, 0.24];
  state[sectionPropKey("melodyHold", id)] = hold;
  state[sectionPropKey("melodySlide", id)] = slide;
  state[sectionPropKey("melodyTuplets", id)] = tuplets;
}
function applyChipPresetToProject(presetId, options={}){
  const preset = chipPresetConfig(presetId) || CHIP_STYLE_PRESETS.chip_arcade_start;
  const fullLoop = !!options.fullLoop;
  pushUndoState();
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  if(wasPlaying) stopPlayback();
  state.audioProfile = CHIP_AUDIO_PROFILE_ID;
  state.chipPreset = sanitizeChipPresetId(presetId) || "chip_arcade_start";
  state.settingsGenre = "chip";
  state.chipTexture = sanitizeChipTexture(preset.texture, state.chipPreset);
  state.lofiPreset = "";
  state.lofiTexture = {...DEFAULT_LOFI_TEXTURE, enabled:false};
  state.metalPreset = "";
  state.metalTexture = {...DEFAULT_METAL_TEXTURE, enabled:false};
  state.drumKit = safeChoice(preset.drumKit, chipDrumKitIds(), "chip_noise_kit");
  state.drumGroovePreset = safeChoice(preset.drumGroovePreset, chipDrumGroovePresetIds(), "chip_run_128");
  state.bassTone = safeChoice(preset.bassTone, chipBassToneIds(), "chip_triangle_bass");
  state.key = preset.key || state.key;
  state.scale = preset.scale || state.scale;
  state.timeSig = safeChoice(preset.timeSig, [3,4], 4);
  state.bpm = clamp(asInt(preset.bpm, 128), 80, 180);
  state.swing = clamp(asNumber(preset.swing, 0.03), 0, 0.12);
  state.humanizeOn = true;
  state.sidechainOn = true;
  state.sidechainAmount = preset.drumKit === "modern_chip_punch" ? 0.36 : 0.22;
  state.chordType = preset.chordInstrument === "modern_chip_poly" ? "seventh" : "triad";
  state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "chip_square_stack");
  state.chordPlayMode = preset.chordInstrument === "chip_arp_keys" ? "arp_up" : "block";
  state.chordRhythmMode = preset.chordInstrument === "chip_arp_keys" ? "quarter" : "sustain";
  state.resolution = 4;
  state.lastAdvancedResolution = 4;
  state.bassMode = "manual";
  state.guitarEnabled = false;
  generateAvailableChords();
  const sections = fullLoop ? ["A","B","C","D"] : [state.currentSection || "A"];
  sections.forEach((id, idx) => {
    state.sectionBars[id] = 4;
    clearSectionPerformance(id);
    const rotate = idx % Math.max(1, preset.progression.length);
    const degrees = preset.progression.map((_, pidx) => preset.progression[(pidx + rotate) % preset.progression.length]);
    setSectionProgressionDegrees(id, degrees);
    fillDrumPresetForSection(idx === 2 ? "chip_menu_bounce" : state.drumGroovePreset, id);
    fillChipBassForSection(id, idx);
    fillChipMelodyForSection(id, preset, idx);
    if(id === state.currentSection) syncSection();
  });
  if(fullLoop) state.songSequence = ["A","A","B","A","C","B","D","A"];
  state.currentSection = sections[0];
  syncSection();
  state.selectedSlot = 0;
  state.activeMelodyTrack = 0;
  updateSuggestions();
  markProjectDirty();
  renderAll();
  const label = preset.label || "Chip Tune";
  const message = fullLoop ? `${label} chip game loop generated across A-D` : `${label} chip idea generated`;
  if(wasPlaying){
    state.playbackMode = previousMode;
    restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`);
  } else {
    setStatus(message);
  }
  try{
    ensureAudio().then(() => {
      const firstChord = state.progression[0] || state.availableChords[0];
      playChord(firstChord, audioCtx.currentTime, 0.6);
    }).catch(() => {});
  }catch(e){}
}
function fillMetalBassForSection(id, preset, rotate=0){
  const steps = sectionBarCount(id) * stepsPerBar();
  const notes = ensureBassNotesTrack([]);
  const hold = ensureBassHoldTrack([]);
  const slide = ensureBassSlideTrack([]);
  const accent = ensureBassAccentTrack([]);
  const grid = state[sectionPropKey("grid", id)] || blankGrid();
  const degrees = preset.progression || [0,5,6,4];
  for(let bar = 0; bar < sectionBarCount(id); bar++){
    const degree = degrees[(bar + rotate) % degrees.length] || 0;
    const hits = preset.drumGroovePreset === "metal_blast_220" ? [0,1,2,3] : preset.drumGroovePreset === "metal_doom_70" ? [0,2] : [0,0.5,2,2.5,3];
    hits.forEach((beat, idx) => {
      const step = sectionStepIndex(bar, Math.floor(beat), beat % 1);
      if(step >= 0 && step < steps){
        grid.bass[step] = idx === 0 ? 2 : 1;
        notes[step] = degree;
        accent[step] = idx === 0;
      }
    });
  }
  state[sectionPropKey("grid", id)] = grid;
  state[sectionPropKey("bassNotes", id)] = notes;
  state[sectionPropKey("bassHold", id)] = hold;
  state[sectionPropKey("bassSlide", id)] = slide;
  state[sectionPropKey("bassAccent", id)] = accent;
}
function fillMetalMelodyForSection(id, preset, rotate=0){
  const steps = sectionBarCount(id) * stepsPerBar();
  const tracks = [blankMelody()];
  const hold = blankMelodyHold(1);
  const slide = blankMelodySlide(1);
  const tuplets = blankMelodyTuplets(1);
  const motif = preset.drumGroovePreset === "metal_doom_70" ? [0,null,1,null,5,null,4,null] : [0,1,3,4,6,4,3,1];
  for(let bar = 0; bar < sectionBarCount(id); bar++){
    for(let i = 0; i < 8; i += 2){
      const step = sectionStepIndex(bar, Math.floor(i / 2), (i % 2) * 0.5);
      const note = motif[(i + rotate + bar) % motif.length];
      if(step >= 0 && step < steps && note !== null) tracks[0][step] = note;
    }
  }
  state[sectionPropKey("melodyTracks", id)] = tracks;
  state[sectionPropKey("melodyInstruments", id)] = [preset.melodyInstrument || "shred_lead_guitar"];
  state[sectionPropKey("melodyOctaves", id)] = [1];
  state[sectionPropKey("melodyMute", id)] = blankMelodyMute(1);
  state[sectionPropKey("melodySolo", id)] = blankMelodySolo(1);
  state[sectionPropKey("melodyPan", id)] = [0.12];
  state[sectionPropKey("melodyHold", id)] = hold;
  state[sectionPropKey("melodySlide", id)] = slide;
  state[sectionPropKey("melodyTuplets", id)] = tuplets;
}
function applyMetalPresetToProject(presetId, options={}){
  const preset = metalPresetConfig(presetId) || METAL_STYLE_PRESETS.metal_classic_chug;
  const fullLoop = !!options.fullLoop;
  pushUndoState();
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  if(wasPlaying) stopPlayback();
  state.audioProfile = HEAVY_METAL_AUDIO_PROFILE_ID;
  state.metalPreset = sanitizeMetalPresetId(presetId) || "metal_classic_chug";
  state.settingsGenre = "metal";
  state.metalTexture = sanitizeMetalTexture(preset.texture, state.metalPreset);
  state.lofiPreset = "";
  state.lofiTexture = {...DEFAULT_LOFI_TEXTURE, enabled:false};
  state.chipPreset = "";
  state.chipTexture = {...DEFAULT_CHIP_TEXTURE, enabled:false};
  state.drumKit = safeChoice(preset.drumKit, metalDrumKitIds(), "metal_tight");
  state.drumGroovePreset = safeChoice(preset.drumGroovePreset, metalDrumGroovePresetIds(), "metal_backbeat_chug");
  state.bassTone = safeChoice(preset.bassTone, metalBassToneIds(), "metal_pick_bass");
  state.key = preset.key || "E";
  state.scale = "minor";
  state.timeSig = 4;
  state.bpm = clamp(asInt(preset.bpm, 128), 60, 240);
  state.swing = clamp(asNumber(preset.swing, 0), 0, 0.08);
  state.humanizeOn = false;
  state.sidechainOn = true;
  state.sidechainAmount = preset.drumGroovePreset === "metal_doom_70" ? 0.24 : 0.38;
  state.chordType = "triad";
  state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "metal_power_stack");
  state.chordPlayMode = "block";
  state.chordRhythmMode = "quarter";
  state.resolution = 4;
  state.lastAdvancedResolution = 4;
  state.bassMode = "manual";
  state.guitarEnabled = true;
  state.guitarVolume = METAL_GUITAR_MIX_VOLUME;
  state.guitarTone = safeChoice(preset.guitarTone, guitarToneIds(), "tight_metal");
  state.guitarRegister = preset.guitarTone === "doom_fuzz" ? "low" : "mid";
  state.guitarStrumMode = "down";
  state.guitarPatternPreset = safeChoice(preset.guitarPatternPreset, guitarPatternPresetIds(), "metal_chug");
  generateAvailableChords();
  const sections = fullLoop ? ["A","B","C","D"] : [state.currentSection || "A"];
  sections.forEach((id, idx) => {
    state.sectionBars[id] = 4;
    clearSectionPerformance(id);
    const rotate = idx % Math.max(1, preset.progression.length);
    const degrees = preset.progression.map((_, pidx) => preset.progression[(pidx + rotate) % preset.progression.length]);
    setSectionProgressionDegrees(id, degrees);
    fillDrumPresetForSection(idx === 2 && fullLoop ? "metal_breakdown_half_time" : state.drumGroovePreset, id);
    fillMetalBassForSection(id, preset, idx);
    applyGuitarPreset(state.guitarPatternPreset, id);
    fillMetalMelodyForSection(id, preset, idx);
    if(id === state.currentSection) syncSection();
  });
  if(fullLoop) state.songSequence = ["A","A","B","A","C","B","D","A"];
  state.currentSection = sections[0];
  syncSection();
  state.selectedSlot = 0;
  state.activeMelodyTrack = 0;
  updateSuggestions();
  markProjectDirty();
  renderAll();
  const label = preset.label || "Heavy Metal";
  const message = fullLoop ? `${label} metal loop generated across A-D` : `${label} metal idea generated`;
  if(wasPlaying){
    state.playbackMode = previousMode;
    restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`);
  } else {
    setStatus(message);
  }
}
function applyWesternMelodyShowcase(sectionId, rotate=0){
  const id = sanitizeSectionId(sectionId);
  const steps = sectionBarCount(id) * stepsPerBar();
  const beat = Math.max(1, activeResolution());
  const eighth = Math.max(1, Math.round(beat / 2));
  const tracks = ensureMelodyTracksLength(state[sectionPropKey("melodyTracks", id)] || blankMelodyTracks(1));
  while(tracks.length < 3) tracks.push(blankMelody());
  const hold = ensureMelodyHoldLength(state[sectionPropKey("melodyHold", id)] || [], tracks.length);
  const slide = ensureMelodySlideLength(state[sectionPropKey("melodySlide", id)] || [], tracks.length);
  const tuplets = ensureMelodyTupletsLength(state[sectionPropKey("melodyTuplets", id)] || [], tracks.length);
  const setNote = (trackIndex, step, note) => {
    if(step >= 0 && step < steps) tracks[trackIndex][step] = note;
  };
  [0,1,2].forEach(trackIndex => {
    tracks[trackIndex].fill(null);
    if(hold[trackIndex]) hold[trackIndex].fill(false);
    if(slide[trackIndex]) slide[trackIndex].fill(false);
    if(tuplets[trackIndex]) tuplets[trackIndex].fill(false);
  });
  for(let bar = 0; bar < sectionBarCount(id); bar++){
    const start = bar * stepsPerBar();
    const phrase = (bar + rotate) % 4;
    setNote(0, start, [0,2,4,2][phrase]);
    setNote(0, start + eighth, [2,4,5,4][phrase]);
    setNote(0, start + beat + eighth, [4,5,4,2][phrase]);
    setNote(0, start + beat * 2, [5,4,2,0][phrase]);
    setNote(1, start + beat, [4,3,4,5][phrase]);
    setNote(1, start + beat * 3, [2,0,2,4][phrase]);
    setNote(2, start + beat * 2 + eighth, [7,6,5,4][phrase]);
  }
  const instruments = ensureMelodyInstrumentsLength(state[sectionPropKey("melodyInstruments", id)] || [], tracks.length);
  instruments[0] = "banjo";
  instruments[1] = "harmonica";
  instruments[2] = "cowboy_whistle";
  const octaves = ensureMelodyOctavesLength(state[sectionPropKey("melodyOctaves", id)] || [], tracks.length, 0);
  octaves[0] = -1;
  octaves[1] = 0;
  octaves[2] = 1;
  const mute = ensureMelodyBoolLength(state[sectionPropKey("melodyMute", id)] || [], tracks.length);
  const solo = ensureMelodyBoolLength(state[sectionPropKey("melodySolo", id)] || [], tracks.length);
  const pan = ensureMelodyPanLength(state[sectionPropKey("melodyPan", id)] || [], tracks.length);
  mute[0] = false; mute[1] = false; mute[2] = false;
  solo[0] = false; solo[1] = false; solo[2] = false;
  pan[0] = -0.25; pan[1] = 0.18; pan[2] = 0.42;
  state[sectionPropKey("melodyTracks", id)] = tracks;
  state[sectionPropKey("melodyInstruments", id)] = instruments;
  state[sectionPropKey("melodyOctaves", id)] = octaves;
  state[sectionPropKey("melodyMute", id)] = mute;
  state[sectionPropKey("melodySolo", id)] = solo;
  state[sectionPropKey("melodyPan", id)] = pan;
  state[sectionPropKey("melodyHold", id)] = hold;
  state[sectionPropKey("melodySlide", id)] = slide;
  state[sectionPropKey("melodyTuplets", id)] = tuplets;
}
function applyWesternPresetToProject(presetId="western_frontier_ride", options={}){
  const preset = westernPresetConfig(presetId);
  const fullLoop = !!options.fullLoop;
  const shouldPushUndo = options.pushUndo !== false;
  const shouldRender = options.render !== false;
  const shouldSetStatus = options.status !== false;
  const shouldPreview = options.preview !== false;
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  if(shouldPushUndo) pushUndoState();
  if(wasPlaying) stopPlayback();
  state.audioProfile = WESTERN_AUDIO_PROFILE_ID;
  state.lofiPreset = "";
  state.lofiTexture = {...DEFAULT_LOFI_TEXTURE, enabled:false};
  state.chipPreset = "";
  state.chipTexture = {...DEFAULT_CHIP_TEXTURE, enabled:false};
  state.westernPreset = sanitizeWesternPresetId(presetId) || "western_frontier_ride";
  state.soundProfile = {id:WESTERN_AUDIO_PROFILE_ID,preset:state.westernPreset,recipeVersion:SOUND_RECIPE_VERSION,parameters:{}};
  state.key = preset.key || state.key;
  state.scale = preset.scale || state.scale;
  state.timeSig = safeChoice(preset.timeSig, [3,4], state.timeSig);
  state.bpm = clamp(asInt(preset.bpm, 112), 60, 180);
  state.swing = clamp(asNumber(preset.swing, 0.04), 0, 0.18);
  state.chordType = "triad";
  state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "saloon_piano");
  state.chordPlayMode = safeChoice(preset.chordPlayMode, ["block","strum_up","strum_down","arp_up","arp_down"], "strum_up");
  state.chordRhythmMode = safeChoice(preset.chordRhythmMode, ["sustain","quarter","half"], "quarter");
  state.drumKit = "classic";
  state.drumGroovePreset = safeChoice(preset.drumGroovePreset, ["boom_chick","train_beat","cowboy_waltz"], "boom_chick");
  state.bassTone = "classic";
  state.guitarEnabled = true;
  state.guitarTone = safeChoice(preset.guitarTone, guitarToneIds(), "western_twang");
  state.guitarRegister = safeChoice(preset.guitarRegister, guitarRegisterIds(), "mid");
  state.guitarStrumMode = safeChoice(preset.guitarStrumMode, guitarStrumModeIds(), "alternate");
  state.guitarVolume = 0.62;
  state.settingsGenre = "western";
  generateAvailableChords();
  const sections = fullLoop ? ["A","B","C","D"] : [state.currentSection || "A"];
  sections.forEach((id, idx) => {
    state.sectionBars[id] = 4;
    clearSectionPerformance(id);
    const rotate = idx % Math.max(1, preset.progression.length);
    const degrees = preset.progression.map((_, pidx) => preset.progression[(pidx + rotate) % preset.progression.length]);
    setSectionProgressionDegrees(id, degrees);
    fillDrumPresetForSection(idx % 2 === 1 ? preset.altDrumGroovePreset : preset.drumGroovePreset, id);
    applyGuitarPreset(idx % 2 === 1 ? preset.altGuitarPatternPreset : preset.guitarPatternPreset, id);
    applyWesternMelodyShowcase(id, idx);
    if(id === state.currentSection) syncSection();
  });
  if(fullLoop) state.songSequence = ["A","A","B","B","C","D","A"];
  state.currentSection = sections[0];
  syncSection();
  state.selectedSlot = 0;
  state.activeMelodyTrack = 0;
  updateSuggestions();
  markProjectDirty();
  if(shouldRender) renderAll();
  const label = preset.label || "Western";
  const message = fullLoop ? `${label} western game loop generated across A-D` : `${label} western idea generated`;
  if(wasPlaying){
    state.playbackMode = previousMode;
    restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`);
  } else if(shouldSetStatus) {
    setStatus(message);
  }
  if(shouldPreview){
    try{
      ensureAudio().then(() => {
        const firstChord = state.progression[0] || state.availableChords[0];
        playChord(firstChord, audioCtx.currentTime, 0.6);
      }).catch(() => {});
    }catch(e){}
  }
}
function funkPresetConfig(id=state.funkPreset){ return FUNK_STYLE_PRESETS[id] || FUNK_STYLE_PRESETS.funk_classic_pocket; }
function applyFunkPresetToProject(presetId="funk_classic_pocket",options={}){
  const preset = funkPresetConfig(presetId);
  const fullLoop = !!options.fullLoop;
  pushUndoState();
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  if(wasPlaying) stopPlayback();
  state.audioProfile = FUNK_AUDIO_PROFILE_ID;
  state.funkPreset = FUNK_STYLE_PRESETS[presetId] ? presetId : "funk_classic_pocket";
  state.funkParameters = sanitizeFunkParameters(preset.parameters);
  state.soundProfile = {id:FUNK_AUDIO_PROFILE_ID,preset:state.funkPreset,recipeVersion:SOUND_RECIPE_VERSION,parameters:deepCloneProjectValue(state.funkParameters)};
  state.lofiPreset = ""; state.lofiTexture = {...DEFAULT_LOFI_TEXTURE,enabled:false};
  state.chipPreset = ""; state.chipTexture = {...DEFAULT_CHIP_TEXTURE,enabled:false};
  state.metalPreset = ""; state.metalTexture = {...DEFAULT_METAL_TEXTURE,enabled:false};
  state.westernPreset = "western_trail";
  state.settingsGenre = "funk";
  state.key = preset.key; state.scale = preset.scale; state.timeSig = 4; state.bpm = preset.bpm; state.swing = 0.04;
  state.resolution = 4; state.lastAdvancedResolution = 4; state.humanizeOn = true; state.sidechainOn = true; state.sidechainAmount = 0.24;
  state.chordType = "seventh"; state.chordInstrument = preset.chordInstrument; state.chordPlayMode = "block"; state.chordRhythmMode = "quarter";
  state.drumKit = preset.drumKit; state.drumGroovePreset = preset.drumGroovePreset; state.bassTone = preset.bassTone; state.bassMode = "manual";
  state.guitarEnabled = true; state.guitarTone = "funk_muted"; state.guitarRegister = "mid"; state.guitarStrumMode = "alternate";
  generateAvailableChords();
  const sections = fullLoop ? ["A","B","C","D"] : [state.currentSection || "A"];
  sections.forEach((id,variant) => {
    state.sectionBars[id] = 4;
    clearSectionPerformance(id);
    setSectionProgressionDegrees(id,preset.progression.map((_,index)=>preset.progression[(index+variant)%preset.progression.length]));
    const grid = state[sectionPropKey("grid",id)];
    const lanes = createDrumLanes();
    const notes = ensureBassNotesTrack([]), accents = ensureBassAccentTrack([]), holds = ensureBassHoldTrack([]), slides = ensureBassSlideTrack([]), arts = ensureBassArticulationTrack([]);
    const guitar = createGuitarState();
    const melody = blankMelodyTracks(1);
    for(let bar=0;bar<4;bar++){
      const start = bar * stepsPerBar();
      [0,6,8,14].forEach((pos,index)=>{ grid.kick[start+pos] = index === 0 ? 2 : 1; });
      [4,12].forEach(pos=>{ grid.snare[start+pos] = 2; });
      for(let pos=0;pos<16;pos++){ grid.hat[start+pos] = pos % 4 === 0 ? 2 : 1; }
      [3,7,11,15].forEach(pos=>{ lanes.snare[start+pos] = 1; });
      if(bar === 3) lanes.clap[start+15] = 2;
      const phrase = variant % 2 ? [[0,0,"slap"],[3,7,"pop"],[6,4,"mute"],[8,0,"finger"],[11,5,"hammer"],[14,7,"pull"]] : [[0,0,"slap"],[2,7,"mute"],[5,4,"pop"],[8,0,"finger"],[10,5,"hammer"],[13,7,"pop"],[15,4,"mute"]];
      phrase.forEach(([pos,note,art],index)=>{ notes[start+pos]=note; arts[start+pos]=art; accents[start+pos]=["slap","pop"].includes(art); if(index === phrase.length-1 && bar<3) slides[start+pos]=false; });
      [0,3,6,10,14].forEach((pos,index)=>{ guitar[start+pos] = index % 2 ? "scratch" : "open"; });
      [6,14].forEach((pos,index)=>{ melody[0][start+pos] = [4,7,5,2][(bar+variant+index)%4]; });
    }
    state[sectionPropKey("drumLanes",id)] = lanes;
    state[sectionPropKey("bassNotes",id)] = notes; state[sectionPropKey("bassAccent",id)] = accents; state[sectionPropKey("bassHold",id)] = holds; state[sectionPropKey("bassSlide",id)] = slides; state[sectionPropKey("bassArticulation",id)] = arts;
    state[sectionPropKey("guitarPattern",id)] = guitar;
    state[sectionPropKey("melodyTracks",id)] = melody; state[sectionPropKey("melodyInstruments",id)] = [preset.melodyInstrument]; state[sectionPropKey("melodyOctaves",id)] = [0]; state[sectionPropKey("melodyMute",id)] = [false]; state[sectionPropKey("melodySolo",id)] = [false]; state[sectionPropKey("melodyPan",id)] = [0.18]; state[sectionPropKey("melodyHold",id)] = blankMelodyHold(1); state[sectionPropKey("melodySlide",id)] = blankMelodySlide(1); state[sectionPropKey("melodyTuplets",id)] = blankMelodyTuplets(1);
  });
  if(fullLoop) state.songSequence = ["A","A","B","A","C","B","D","A"];
  state.currentSection = sections[0]; syncSection(); state.selectedSlot = 0; state.activeMelodyTrack = 0; updateSuggestions(); markProjectDirty(); renderAll();
  const message = fullLoop ? `${preset.label} funk loop generated across A-D` : `${preset.label} funk idea generated`;
  if(wasPlaying){ state.playbackMode = previousMode; restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`); } else setStatus(message);
}
function genreComposerApi(){
  const api = window.PocketChordsmithGenreComposer;
  if(!api || typeof api.composeSong !== "function") throw new Error("Genre composer could not load");
  return api;
}
function selectedGenreArchetype(genre){
  const selected = {
    lofi: els.lofiPresetSelect?.value || state.lofiPreset || "lofi_study_room",
    chip: els.chipPresetSelect?.value || state.chipPreset || "chip_arcade_start",
    metal: els.metalPresetSelect?.value || state.metalPreset || "metal_classic_chug",
    western: els.westernPresetSelect?.value || state.westernPreset || "western_frontier_ride",
    funk: els.funkPresetSelect?.value || state.funkPreset || "funk_classic_pocket"
  };
  return selected[genre] || "";
}
function requestedGenreSeed(){
  const typed = String(els.genreSeedInput?.value || "").trim();
  return typed || genreComposerApi().createSeed();
}
function presetForGenreComposition(genre, archetype){
  if(genre === "lofi") return lofiPresetConfig(archetype);
  if(genre === "chip") return chipPresetConfig(archetype);
  if(genre === "metal") return metalPresetConfig(archetype);
  if(genre === "western") return westernPresetConfig(archetype);
  if(genre === "funk") return funkPresetConfig(archetype);
  return null;
}
function resetOtherGenreProfiles(activeGenre){
  if(activeGenre !== "lofi"){ state.lofiPreset = ""; state.lofiTexture = {...DEFAULT_LOFI_TEXTURE,enabled:false}; }
  if(activeGenre !== "chip"){ state.chipPreset = ""; state.chipTexture = {...DEFAULT_CHIP_TEXTURE,enabled:false}; }
  if(activeGenre !== "metal"){ state.metalPreset = ""; state.metalTexture = {...DEFAULT_METAL_TEXTURE,enabled:false}; }
  if(activeGenre !== "western") state.westernPreset = "western_trail";
  if(activeGenre !== "funk"){ state.funkPreset = ""; state.funkParameters = {...DEFAULT_FUNK_PARAMETERS}; }
}
function applyGenreCompositionSoundProfile(plan, options={}){
  const identity = plan.identity;
  const genre = identity.genre;
  const preset = presetForGenreComposition(genre, identity.archetype) || {};
  const profileOnly = !!options.profileOnly;
  resetOtherGenreProfiles(genre);
  state.settingsGenre = genre;
  if(!profileOnly){
    state.key = identity.key;
    state.scale = identity.scale;
    state.timeSig = identity.timeSignature;
    state.bpm = identity.bpm;
    state.resolution = 4;
    state.lastAdvancedResolution = 4;
    state.bassMode = "manual";
    state.humanizeOn = genre === "lofi" || genre === "funk";
    state.sidechainOn = genre !== "western";
    state.sidechainAmount = genre === "metal" ? 0.34 : genre === "funk" ? 0.24 : 0.18;
  }
  if(genre === "lofi"){
    state.audioProfile = LOFI_AUDIO_PROFILE_ID;
    state.lofiPreset = LOFI_STYLE_PRESETS[identity.archetype] ? identity.archetype : "lofi_study_room";
    state.lofiTexture = sanitizeLofiTexture(preset.texture, state.lofiPreset);
    state.soundProfile = {id:LOFI_AUDIO_PROFILE_ID,preset:state.lofiPreset,recipeVersion:SOUND_RECIPE_VERSION,parameters:deepCloneProjectValue(state.lofiTexture)};
    state.drumKit = safeChoice(preset.drumKit, lofiDrumKitIds(), "lofi_dusty");
    state.drumGroovePreset = safeChoice(preset.drumGroovePreset, lofiDrumGroovePresetIds(), "lofi_backbeat_76");
    state.bassTone = safeChoice(preset.bassTone, lofiBassToneIds(), "warm_sub");
    state.chordType = "seventh";
    state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "felt_piano");
    state.chordPlayMode = "block";
    state.chordRhythmMode = "half";
    state.guitarEnabled = false;
  }else if(genre === "chip"){
    state.audioProfile = CHIP_AUDIO_PROFILE_ID;
    state.chipPreset = CHIP_STYLE_PRESETS[identity.archetype] ? identity.archetype : "chip_arcade_start";
    state.chipTexture = sanitizeChipTexture(preset.texture, state.chipPreset);
    state.soundProfile = {id:CHIP_AUDIO_PROFILE_ID,preset:state.chipPreset,recipeVersion:SOUND_RECIPE_VERSION,parameters:deepCloneProjectValue(state.chipTexture)};
    state.drumKit = safeChoice(preset.drumKit, chipDrumKitIds(), "chip_noise_kit");
    state.drumGroovePreset = safeChoice(preset.drumGroovePreset, chipDrumGroovePresetIds(), "chip_run_128");
    state.bassTone = safeChoice(preset.bassTone, chipBassToneIds(), "chip_triangle_bass");
    state.chordType = "triad";
    state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "chip_square_stack");
    state.chordPlayMode = "arp_up";
    state.chordRhythmMode = "quarter";
    state.guitarEnabled = false;
  }else if(genre === "metal"){
    state.audioProfile = HEAVY_METAL_AUDIO_PROFILE_ID;
    state.metalPreset = METAL_STYLE_PRESETS[identity.archetype] ? identity.archetype : "metal_classic_chug";
    state.metalTexture = sanitizeMetalTexture(preset.texture, state.metalPreset);
    state.soundProfile = {id:HEAVY_METAL_AUDIO_PROFILE_ID,preset:state.metalPreset,recipeVersion:SOUND_RECIPE_VERSION,parameters:deepCloneProjectValue(state.metalTexture)};
    state.drumKit = safeChoice(preset.drumKit, metalDrumKitIds(), "metal_tight");
    state.drumGroovePreset = safeChoice(preset.drumGroovePreset, metalDrumGroovePresetIds(), "metal_backbeat_chug");
    state.bassTone = safeChoice(preset.bassTone, metalBassToneIds(), "metal_pick_bass");
    state.chordType = "triad";
    state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "metal_power_stack");
    state.chordPlayMode = "block";
    state.chordRhythmMode = "quarter";
    state.guitarEnabled = true;
    state.guitarVolume = METAL_GUITAR_MIX_VOLUME;
    state.guitarTone = safeChoice(preset.guitarTone, guitarToneIds(), "tight_metal");
    state.guitarRegister = preset.guitarTone === "doom_fuzz" ? "low" : "mid";
    state.guitarStrumMode = "down";
    state.guitarPatternPreset = safeChoice(preset.guitarPatternPreset, guitarPatternPresetIds(), "metal_chug");
  }else if(genre === "western"){
    state.audioProfile = WESTERN_AUDIO_PROFILE_ID;
    state.westernPreset = WESTERN_STYLE_PRESETS[identity.archetype] ? identity.archetype : "western_frontier_ride";
    state.soundProfile = {id:WESTERN_AUDIO_PROFILE_ID,preset:state.westernPreset,recipeVersion:SOUND_RECIPE_VERSION,parameters:{}};
    state.drumKit = "classic";
    state.drumGroovePreset = identity.archetype === "western_train_chase" ? "train_beat" : identity.timeSignature === 3 ? "cowboy_waltz" : "boom_chick";
    state.bassTone = "classic";
    state.chordType = "triad";
    state.chordInstrument = "saloon_piano";
    state.chordPlayMode = "strum_up";
    state.chordRhythmMode = "quarter";
    state.guitarEnabled = true;
    state.guitarTone = "western_twang";
    state.guitarRegister = "mid";
    state.guitarStrumMode = "alternate";
    state.guitarPatternPreset = identity.timeSignature === 3 ? "western_waltz" : "boom_chick";
  }else if(genre === "funk"){
    state.audioProfile = FUNK_AUDIO_PROFILE_ID;
    state.funkPreset = FUNK_STYLE_PRESETS[identity.archetype] ? identity.archetype : "funk_classic_pocket";
    state.funkParameters = sanitizeFunkParameters(preset.parameters);
    state.soundProfile = {id:FUNK_AUDIO_PROFILE_ID,preset:state.funkPreset,recipeVersion:SOUND_RECIPE_VERSION,parameters:deepCloneProjectValue(state.funkParameters)};
    state.drumKit = safeChoice(preset.drumKit, funkDrumKitIds(), "funk_dry_pocket");
    state.drumGroovePreset = safeChoice(preset.drumGroovePreset, funkDrumGroovePresetIds(), "funk_backbeat_98");
    state.bassTone = safeChoice(preset.bassTone, funkBassToneIds(), "funk_finger_pocket");
    state.chordType = "seventh";
    state.chordInstrument = safeChoice(preset.chordInstrument, chordInstrumentIds(), "funk_clav_stab");
    state.chordPlayMode = "block";
    state.chordRhythmMode = "quarter";
    state.guitarEnabled = true;
    state.guitarTone = "funk_muted";
    state.guitarRegister = "mid";
    state.guitarStrumMode = "alternate";
  }
  generateAvailableChords();
}
function resetGenreComposerSection(id){
  clearSectionPerformance(id);
  state[sectionPropKey("progression", id)] = [];
  state[sectionPropKey("drumLanes", id)] = createDrumLanes();
  state[sectionPropKey("bassArticulation", id)] = ensureBassArticulationTrack([]);
  state[sectionPropKey("guitarPattern", id)] = createGuitarState();
}
function composerStepInBar(bar, cell){
  const steps = stepsPerBar();
  const local = clamp(Math.round((Number(cell) / 15) * Math.max(0, steps - 1)), 0, Math.max(0, steps - 1));
  return bar * steps + local;
}
function fillGenreComposerSection(plan, genre){
  const id = plan.id;
  const bars = plan.bars;
  const grid = blankGrid();
  const lanes = createDrumLanes();
  const notes = blankBassNotes();
  const holds = blankBassHold();
  const slides = blankBassSlide();
  const accents = blankBassAccent();
  const articulations = ensureBassArticulationTrack([]);
  const guitar = createGuitarState();
  const riffCells = plan.rhythmicCell.filter((cell) => Number.isFinite(cell));
  const setGrid = (lane, step, level=1) => { if(step >= 0 && step < grid[lane].length) grid[lane][step] = Math.max(grid[lane][step] || 0, level); };
  const setLane = (lane, step, level=1) => { if(Array.isArray(lanes[lane]) && step >= 0 && step < lanes[lane].length) lanes[lane][step] = Math.max(lanes[lane][step] || 0, level); };
  const setBass = (step, note, articulation="finger", level=1) => {
    if(step < 0 || step >= notes.length) return;
    notes[step] = clamp(Math.round(note), 0, 13);
    articulations[step] = articulation;
    accents[step] = level > 1 || ["pick","slap","pop"].includes(articulation);
    setGrid("bass", step, level);
  };
  for(let bar = 0; bar < bars; bar++){
    const root = plan.progression[bar % plan.progression.length] || 0;
    const beat = (number) => composerStepInBar(bar, number);
    if(genre === "metal"){
      const attacks = riffCells.filter((_, index) => plan.density.drums > 1 || index % 2 === 0);
      attacks.forEach((cell, index) => {
        const step = beat(cell);
        const level = index === 0 ? 2 : 1;
        setGrid("kick", step, level);
        setBass(step, index % 4 === 3 ? root + 7 : root, "pick", level);
        guitar[step] = plan.role === "breakdown" ? (index % 2 ? "chug" : "accent") : index % 4 === 0 ? "accent" : "chug";
      });
      [4,12].forEach((cell) => setGrid("snare", beat(cell), 2));
      for(let cell = 0; cell < 16; cell += plan.density.drums >= 3 ? 2 : 4) setGrid("hat", beat(cell), cell % 8 === 0 ? 2 : 1);
      if(plan.role === "chorus") setLane("crash", beat(0), 2);
      if(plan.role === "solo") setLane("ride", beat(0), 1);
    }else if(genre === "lofi"){
      setGrid("kick", beat(0), 2); if(plan.energy > .48) setGrid("kick", beat(10), 1);
      setGrid("snare", beat(4), 1); setGrid("snare", beat(12), 2);
      [2,6,10,14].forEach((cell) => { if(plan.energy > .3 || cell === 6) setGrid("hat", beat(cell), cell === 10 ? 2 : 1); });
      setBass(beat(0), root, "finger", 2);
      if(plan.energy > .42) setBass(beat(8), (root + 4) % 7, "finger", 1);
      if(plan.energy > .6) setBass(beat(14), (root + 6) % 7, "slide", 1);
    }else if(genre === "western"){
      setGrid("kick", beat(0), 2); setBass(beat(0), root, "finger", 2);
      const second = state.timeSig === 3 ? 5 : 8;
      setGrid("hat", beat(second), 1); setBass(beat(second), (root + 4) % 7, "finger", 1);
      if(state.timeSig === 4){ setGrid("snare", beat(8), 1); setGrid("hat", beat(12), 1); }
      [0, second].forEach((cell, index) => { const step = beat(cell); guitar[step] = index ? "open" : "accent"; });
      if(plan.energy > .65) guitar[beat(state.timeSig === 3 ? 9 : 12)] = "open";
    }else if(genre === "chip"){
      [0,8].forEach((cell, index) => setGrid("kick", beat(cell), index ? 1 : 2));
      [4,12].forEach((cell) => setGrid("snare", beat(cell), 2));
      for(let cell = 0; cell < 16; cell += 2) setGrid("hat", beat(cell), cell % 4 ? 1 : 2);
      [0,4,8,12].forEach((cell, index) => setBass(beat(cell), index % 2 ? root + 7 : root, "finger", index ? 1 : 2));
      if(plan.role === "chorus") setLane("crash", beat(0), 1);
    }else if(genre === "funk"){
      [0,6,8,14].forEach((cell, index) => { if(plan.energy > .35 || index < 2) setGrid("kick", beat(cell), index === 0 ? 2 : 1); });
      [4,12].forEach((cell) => setGrid("snare", beat(cell), 2));
      for(let cell = 0; cell < 16; cell += 2) setGrid("hat", beat(cell), cell % 4 ? 1 : 2);
      [3,7,11,15].forEach((cell) => setLane("snare", beat(cell), 1));
      const phrase = [[0,root,"slap",2],[3,root + 7,"mute",1],[6,(root + 4) % 7,"pop",2],[10,root,"finger",1],[13,(root + 5) % 7,"hammer",1],[15,(root + 7) % 14,"pull",1]];
      phrase.forEach(([cell,note,art,level]) => setBass(beat(cell), note, art, level));
      [2,6,10,14].forEach((cell, index) => { guitar[beat(cell)] = index % 2 ? "scratch" : "open"; });
    }
    if(plan.fill && bar === bars - 1){
      [10,12,14,15].forEach((cell, index) => setLane(index % 2 ? "tom_mid" : "tom_low", beat(cell), index === 3 ? 2 : 1));
      setLane("crash", beat(15), 1);
    }
  }
  const hasLead = plan.lead !== "none";
  const trackCount = hasLead && genre === "chip" ? 2 : 1;
  const tracks = blankMelodyTracks(trackCount);
  const melodyHold = blankMelodyHold(trackCount);
  const melodySlide = blankMelodySlide(trackCount);
  const melodyTuplets = blankMelodyTuplets(trackCount);
  const leadInstrument = plan.leadInstrument || (genre === "chip" ? "chip_square_lead" : "pulse");
  if(hasLead){
    const perBar = plan.lead === "solo" || plan.lead === "hook" ? 4 : plan.lead === "sparse" ? 1 : 2;
    for(let bar = 0; bar < bars; bar++){
      const root = plan.progression[bar % plan.progression.length] || 0;
      for(let phraseIndex = 0; phraseIndex < perBar; phraseIndex++){
        const motifIndex = (bar * perBar + phraseIndex) % plan.motif.length;
        const value = phraseIndex === 0 ? root : plan.motif[motifIndex];
        if(value === null || value === undefined) continue;
        const step = bar * stepsPerBar() + clamp(Math.floor((phraseIndex * stepsPerBar()) / perBar), 0, stepsPerBar() - 1);
        tracks[0][step] = clamp(Math.round(value), 0, 13);
        if(genre === "chip" && phraseIndex % 2 === 1){
          const arpStep = Math.min(tracks[1].length - 1, step + Math.max(1, Math.floor(activeResolution() / 2)));
          tracks[1][arpStep] = clamp(Math.round(value + 4), 0, 13);
        }
      }
    }
  }
  state[sectionPropKey("grid", id)] = grid;
  state[sectionPropKey("drumLanes", id)] = lanes;
  state[sectionPropKey("bassNotes", id)] = notes;
  state[sectionPropKey("bassHold", id)] = holds;
  state[sectionPropKey("bassSlide", id)] = slides;
  state[sectionPropKey("bassAccent", id)] = accents;
  state[sectionPropKey("bassArticulation", id)] = articulations;
  state[sectionPropKey("guitarPattern", id)] = guitar;
  state[sectionPropKey("melodyTracks", id)] = tracks;
  state[sectionPropKey("melodyInstruments", id)] = genre === "chip" ? [leadInstrument,"chip_square_lead"] : [leadInstrument];
  state[sectionPropKey("melodyOctaves", id)] = Array.from({length:trackCount}, () => genre === "metal" ? 1 : 0);
  state[sectionPropKey("melodyMute", id)] = blankMelodyMute(trackCount);
  state[sectionPropKey("melodySolo", id)] = blankMelodySolo(trackCount);
  state[sectionPropKey("melodyPan", id)] = trackCount === 2 ? [-0.18,0.18] : [0.12];
  state[sectionPropKey("melodyHold", id)] = melodyHold;
  state[sectionPropKey("melodySlide", id)] = melodySlide;
  state[sectionPropKey("melodyTuplets", id)] = melodyTuplets;
}
function serialiseGenreComposition(plan){
  return {
    version:plan.version,
    identity:deepCloneProjectValue(plan.identity),
    sections:plan.sections.map(section => ({id:section.id,role:section.role,bars:section.bars,energy:section.energy,progressionRole:section.progressionRole,motifTransform:section.motifTransform,lead:section.lead,variation:section.variation,fill:section.fill})),
    sequence:plan.sequence.slice()
  };
}
function composeGenreSong(genre, options={}){
  const api = genreComposerApi();
  const seed = options.seed ?? requestedGenreSeed();
  const plan = api.composeSong({genre,archetype:options.archetype || options.presetId,seed,mode:options.mode || "song"});
  const errors = api.validatePlan(plan);
  if(errors.length) throw new Error(`Genre plan invalid: ${errors.join(", ")}`);
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  pushUndoState();
  if(wasPlaying) stopPlayback();
  applyGenreCompositionSoundProfile(plan);
  state.genreComposition = serialiseGenreComposition(plan);
  SECTION_IDS.forEach(resetGenreComposerSection);
  plan.sections.forEach(section => {
    state.sectionBars[section.id] = section.bars;
    setSectionProgressionDegrees(section.id, section.progression);
    fillGenreComposerSection(section, plan.identity.genre);
  });
  state.songSequence = plan.sequence.slice();
  state.currentSection = plan.sections[0].id;
  if(state._projectSource && typeof state._projectSource === "object") state._projectSource = {...state._projectSource,sections:{}};
  state._richSource = {};
  syncSection();
  state.selectedSlot = 0;
  state.activeMelodyTrack = 0;
  updateSuggestions();
  markProjectDirty();
  renderAll();
  const label = plan.identity.archetype.replace(/^\w+_/, "").replaceAll("_", " ");
  const message = `${label} ${plan.identity.mode === "game-loop" ? "game loop" : "full song"} composed from seed ${plan.identity.seed}`;
  if(wasPlaying){ state.playbackMode = previousMode; restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`); }
  else setStatus(message);
  return plan;
}
function applyGenreSoundProfileOnly(genre){
  const api = genreComposerApi();
  const archetype = selectedGenreArchetype(genre);
  const plan = api.composeSong({genre,archetype,seed:`profile:${archetype}`,key:state.key});
  const wasPlaying = !!state.isPlaying;
  const previousMode = state.playbackMode || "section";
  pushUndoState();
  if(wasPlaying) stopPlayback();
  applyGenreCompositionSoundProfile(plan,{profileOnly:true});
  markProjectDirty();
  renderAll();
  const message = `${plan.identity.archetype.replace(/^\w+_/, "").replaceAll("_", " ")} sound profile applied`;
  if(wasPlaying){ state.playbackMode = previousMode; restartPlaybackPlanAfterStructureChange(`${message}; playback restarted`); }
  else setStatus(message);
}
function loadDemo(){
  importProject(JSON.parse(JSON.stringify(POCKET_CHORDSMITH_V61_SHOWCASE_DEMO)));
  applyWesternPresetToProject("western_frontier_ride", {fullLoop:true, pushUndo:false, render:false, status:false, preview:false});
  renderAll();
  primePocketAudioCoreFromCurrentProject("demo").catch(() => {});
  setStatus("Loaded Pocket Chordsmith v68 demo");
}
function bytesVLQ(value){
  let buffer = value & 0x7F;
  const bytes = [];
  while((value >>= 7)){
    buffer <<= 8;
    buffer |= ((value & 0x7F) | 0x80);
  }
  while(true){
    bytes.push(buffer & 0xFF);
    if(buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}
function strBytes(s){ return Array.from(s).map(c => c.charCodeAt(0)); }

function getSelectedExportScope(){
  const raw = els.exportScopeSelect ? String(els.exportScopeSelect.value || "SEQUENCE").toUpperCase() : "SEQUENCE";
  if(raw === "ALL" || raw === "SEQUENCE" || SECTION_IDS.includes(raw)) return raw;
  return "SEQUENCE";
}

function exportScopeLabel(scope = getSelectedExportScope()){
  if(scope === "ALL") return "all sections";
  if(scope === "SEQUENCE") return "song sequence";
  return `section ${scope}`;
}

function coreTimelineOptionsForExportScope(scope = getSelectedExportScope()){
  if(SECTION_IDS.includes(scope)) return {scope:"section", sectionId:scope};
  if(scope === "ALL") return {scope:"all"};
  return {scope:"sequence"};
}

function projectSectionsForExport(){
  storeSection();
  const scope = getSelectedExportScope();
  const includeMelody = true;
  if(scope === "SEQUENCE") return sequenceList().map(id => getSectionData(id, includeMelody));
  if(scope === "ALL") return SECTION_IDS.map(id => getSectionData(id, includeMelody));
  return [getSectionData(scope, includeMelody)];
}

function buildSequenceEvents(){
  const sections = projectSectionsForExport();
  const events = [];
  let baseTime = 0;

  sections.forEach(section => {
    const stepCount = section.bars * stepsPerBar();
    const timeline = buildStepTimeline(stepCount, baseTime, activeResolution(), state.swing);

    for(let step = 0; step < stepCount; step++){
      const time = timeline.times[step];
      const stepDur = stepDurationForIndex(step, activeResolution(), state.swing);
      const bar = Math.floor(step / stepsPerBar());
      const ch = section.progression[bar] || state.availableChords[0];

      if(isLofiActive() && state.lofiTexture?.enabled){
        events.push({type:"texture", time, dur: Math.max(0.08, Math.min(0.24, stepDur)), step, section:section.name, audioProfile:LOFI_AUDIO_PROFILE_ID, lofiPreset:state.lofiPreset || "", lofiTexture:sanitizeLofiTexture(state.lofiTexture, state.lofiPreset)});
      }

      if(step % stepsPerBar() === 0){
        chordRhythmStarts(time).forEach(([st, dur]) => {
          events.push({type:"chord", chord: ch, time: st, dur: Math.min(dur, state.timeSig * beatDur())*funkStabDurationScale(), step, section:section.name});
        });
      }

      ["kick","snare","hat"].forEach((trackId, idx) => {
        const level = normalizeBeatCell(section.grid[trackId][step]);
        if(gridTripletSecond(section, trackId, step)) return;
        const type = trackId;
        const seed = idx + 1;
        if(gridTripletStart(section, trackId, step)){
          const nextLevel = normalizeBeatCell(section.grid[trackId][step + 1]);
          const spanDur = spanDurationForSteps(step, 2);
          tripletTimesForSpan(time, spanDur).forEach((tt, ti) => {
            const lev = ti === 2 ? nextLevel : level;
            events.push({type, accent:lev === 2, velocityScale:funkGhostScale(trackId,lev), time: safeAudioTime(tt + humanizeOffset(step + ti, seed) + funkPocketOffset(step + ti)), dur: Math.min(type === "hat" && lev === 2 ? 0.12 : 0.08, spanDur / 3 * 0.7), step, section:section.name, tuplet:true});
          });
        } else if(level > 0) {
          events.push({type, accent:level === 2, velocityScale:funkGhostScale(trackId,level), time: safeAudioTime(time + humanizeOffset(step, seed) + funkPocketOffset(step)), dur: Math.min(type === "kick" ? 0.10 : type === "snare" ? 0.08 : (level === 2 ? 0.12 : 0.025), stepDur * (type === "hat" && level === 2 ? 0.75 : 0.7)), step, section:section.name});
        }
      });
      EXPANDED_DRUM_LANES.forEach((lane,laneIndex) => {
        const level = normalizeBeatCell(section.drumLanes?.[lane]?.[step]);
        if(level > 0) events.push({type:"drum",lane,accent:level === 2,velocityScale:funkGhostScale(lane,level),time:safeAudioTime(time + humanizeOffset(step,30 + laneIndex) + funkPocketOffset(step)),dur:lane === "crash" || lane === "china" ? 0.9 : lane === "ride" ? 0.42 : 0.16,step,section:section.name});
      });
      if(!gridTripletSecond(section, "bass", step) && bassStepHasTrigger(section, step) && !(section.bassHold || [])[step] && !(section.bassSlide || [])[step]){
        if(gridTripletStart(section, "bass", step)){
          const spanDur = spanDurationForSteps(step, 2);
          const times = tripletTimesForSpan(time, spanDur);
          const leftMidi = bassStepMidiAt(section, step);
          const rightMidi = bassStepMidiAt(section, step + 1);
          const midMidi = leftMidi !== null && rightMidi !== null ? Math.round((leftMidi + rightMidi) / 2) : leftMidi;
          [leftMidi, midMidi, rightMidi ?? leftMidi].forEach((midi, ti) => {
            if(midi !== null) events.push({type:"bass", articulation:bassArticulationAt(section,ti === 2 ? step + 1 : step), accent:ti === 2 ? bassStepAccentAt(section, step + 1) : bassStepAccentAt(section, step), midi, time: safeAudioTime(times[ti] + humanizeOffset(step + ti, 4) + funkPocketOffset(step + ti)), dur: Math.max(0.08, spanDur / 3 * 0.86), step, section:section.name, tuplet:true});
          });
        } else {
          const phrase = bassPhraseInfo(section, step);
          const bassMidi = bassStepMidiAt(section, step);
          if(bassMidi !== null) events.push({type:"bass", articulation:bassArticulationAt(section,step), accent:bassStepAccentAt(section, step), midi: bassMidi, time: safeAudioTime(time + humanizeOffset(step, 4) + funkPocketOffset(step)), dur: phrase.dur, slideMidi: phrase.slideMidi, slideOffset: phrase.slideOffset, step, section:section.name});
        }
      }
      if(state.guitarEnabled){
        const guitarArt = guitarStepArt(section, step);
        if(guitarArt !== "off" && guitarArt !== "hold"){
          events.push({
            type:"guitar",
            articulation:guitarArt,
            notes:buildPowerChordNotes(ch, state.guitarRegister),
            tone:state.guitarTone,
            direction:guitarDirectionForStep(step),
            time:safeAudioTime(time + humanizeOffset(step, 17) + funkPocketOffset(step)),
            dur:guitarStepDuration(section, step, guitarArt),
            step,
            section:section.name
          });
        }
      }
      melodyTracksForCurrentMode(section).forEach((track, trackIndex) => {
          const holdTrack = (section.melodyHold || [])[trackIndex] || [];
          const slideTrack = (section.melodySlide || [])[trackIndex] || [];
          if(holdTrack[step] || slideTrack[step] || melodyTripletSecond(section, trackIndex, step)) return;
          if(track[step] !== null && track[step] !== undefined && melodyTrackIsAudible(trackIndex, section.name)){
            if(melodyTripletStart(section, trackIndex, step)){
              const spanDur = spanDurationForSteps(step, 2);
              const times = tripletTimesForSpan(time, spanDur);
              const notes = [track[step], melodyTripletMiddleIndex(track[step], track[step + 1]), track[step + 1]];
              notes.forEach((noteIndex, ti) => events.push({
                type:"melody",
                midi: melodyIndexToMidi(noteIndex, ((section.melodyOctaves || [])[trackIndex] ?? 0)),
                time: safeAudioTime(times[ti] + humanizeOffset(step + ti, 10 + trackIndex)),
                dur: Math.max(0.08, spanDur / 3 * 0.86),
                instrument: (section.melodyInstruments || [])[trackIndex] || "pulse",
                trackIndex,
                pan: melodyTrackPanValue(trackIndex, section.name),
                step,
                section:section.name,
                tuplet:true
              }));
            } else {
              const phrase = melodyPhraseInfo(section, trackIndex, step);
              events.push({
                type:"melody",
                midi: melodyIndexToMidi(track[step], ((section.melodyOctaves || [])[trackIndex] ?? 0)),
                time: safeAudioTime(time + humanizeOffset(step, 10 + trackIndex)),
                dur: phrase.dur,
                slideMidi: phrase.slideMidi,
                slideOffset: phrase.slideOffset,
                instrument: (section.melodyInstruments || [])[trackIndex] || "pulse",
                trackIndex,
                pan: melodyTrackPanValue(trackIndex, section.name),
                step,
                section:section.name
              });
            }
          }
        });
    }
    baseTime = timeline.endTime;
  });

  return events.sort((a,b) => a.time - b.time);
}

function roundTraceNumber(value, places=6){
  if(value === null || value === undefined || !Number.isFinite(Number(value))) return value === undefined ? undefined : null;
  const scale = Math.pow(10, places);
  return Math.round(Number(value) * scale) / scale;
}

function normalizeTraceChord(chord){
  if(!chord || typeof chord !== "object") return undefined;
  return {
    degree: asInt(chord.degree, 0),
    name: chord.name || "",
    root: asInt(chord.root, 0)
  };
}

function normalizeChordsmithTraceEvent(ev){
  const out = {
    type: ev.type,
    sectionId: ev.section || "A",
    step: asInt(ev.step, 0),
    time: roundTraceNumber(ev.time),
    duration: roundTraceNumber(ev.dur),
    accent: !!ev.accent,
    tuplet: !!ev.tuplet
  };
  if(ev.chord){
    out.chord = normalizeTraceChord(ev.chord);
    out.midiNotes = chordNotes(ev.chord);
    out.instrument = state.chordInstrument || "pocket";
    out.articulation = state.chordPlayMode || "block";
  }
  if(ev.midi !== undefined) out.midi = ev.midi;
  if(ev.slideMidi !== undefined) out.slideMidi = ev.slideMidi;
  if(ev.slideOffset !== undefined) out.slideOffset = roundTraceNumber(ev.slideOffset);
  if(ev.instrument !== undefined) out.instrument = ev.instrument;
  if(ev.trackIndex !== undefined) out.trackIndex = ev.trackIndex;
  if(ev.lane !== undefined) out.lane = ev.lane;
  if(ev.pan !== undefined) out.pan = roundTraceNumber(ev.pan);
  if(ev.articulation !== undefined) out.articulation = ev.articulation;
  if(ev.notes !== undefined) out.midiNotes = ev.notes.slice();
  if(ev.tone !== undefined) out.tone = ev.tone;
  if(ev.direction !== undefined) out.direction = ev.direction;
  if(ev.audioProfile !== undefined) out.audioProfile = ev.audioProfile;
  if(ev.lofiPreset !== undefined) out.lofiPreset = ev.lofiPreset;
  if(ev.chipPreset !== undefined) out.chipPreset = ev.chipPreset;
  if(ev.metalPreset !== undefined) out.metalPreset = ev.metalPreset;
  if(ev.lofiTexture !== undefined) out.lofiTexture = {...ev.lofiTexture};
  if(ev.chipTexture !== undefined) out.chipTexture = {...ev.chipTexture};
  if(ev.metalTexture !== undefined) out.metalTexture = {...ev.metalTexture};
  return out;
}

function buildChordsmithParityTrace(options={}){
  const previousScope = els.exportScopeSelect ? els.exportScopeSelect.value : "";
  if(els.exportScopeSelect && options.scope) els.exportScopeSelect.value = String(options.scope).toUpperCase();
  try{
    const project = exportProject();
    const events = buildSequenceEvents().map(normalizeChordsmithTraceEvent);
    return {
      app: "PocketChordsmith",
      version: "v68",
      projectVersion: PROJECT_SCHEMA_VERSION,
      scope: getSelectedExportScope(),
      eventCount: events.length,
      project,
      events
    };
  }finally{
    if(els.exportScopeSelect && previousScope) els.exportScopeSelect.value = previousScope;
  }
}

function buildChordsmithParityTraceFromProject(rawProject, options={}){
  const snapshot = exportProject();
  const previousSection = state.currentSection;
  const previousScope = els.exportScopeSelect ? els.exportScopeSelect.value : "";
  const wasPlaying = !!state.isPlaying;
  if(wasPlaying) stopPlayback();
  try{
    importProject(rawProject);
    return buildChordsmithParityTrace(options);
  }finally{
    try{
      importProject(snapshot);
      state.currentSection = sanitizeSectionId(previousSection) || "A";
      syncSection();
      if(els.exportScopeSelect && previousScope) els.exportScopeSelect.value = previousScope;
      renderAll();
    }catch(e){
      console.error("Could not restore project after parity trace", e);
    }
  }
}

window.PocketChordsmithParityTrace = {
  current: buildChordsmithParityTrace,
  fromProject: buildChordsmithParityTraceFromProject,
  normalizeEvent: normalizeChordsmithTraceEvent
};

function phraseTickInfo(section, trackIndex, step, kind="melody", ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  const resolution = activeResolution();
  const stepTicks = tickPerStep(resolution, ticksPerQuarter);
  const stepCount = section.bars * stepsPerBar();
  let holdTrack = [];
  let slideTrack = [];
  let noteTrack = [];
  let midiFor = () => null;

  if(kind === "bass"){
    holdTrack = section.bassHold || [];
    slideTrack = section.bassSlide || [];
    midiFor = idx => bassStepMidiAt(section, idx);
  } else {
    holdTrack = (section.melodyHold || [])[trackIndex] || [];
    slideTrack = (section.melodySlide || [])[trackIndex] || [];
    noteTrack = (section.melodyTracks || [])[trackIndex] || [];
    midiFor = idx => {
      const value = noteTrack[idx];
      if(value === null || value === undefined) return null;
      return melodyIndexToMidi(value, ((section.melodyOctaves || [])[trackIndex] ?? 0));
    };
  }

  let durTicks = 0;
  let idx = step;
  do {
    durTicks += stepTicks;
    idx += 1;
  } while(idx < stepCount && holdTrack[idx]);

  let slideMidi = null;
  let slideOffsetTicks = null;
  if(idx < stepCount && slideTrack[idx]){
    slideMidi = midiFor(idx);
    slideOffsetTicks = durTicks;
    do {
      durTicks += stepTicks;
      idx += 1;
    } while(idx < stepCount && holdTrack[idx]);
  }

  return {
    durTicks: Math.max(1, Math.round(state.midiExactDurations ? durTicks : durTicks * 0.92)),
    slideMidi,
    slideOffsetTicks: slideOffsetTicks === null ? null : Math.round(slideOffsetTicks)
  };
}

function chordRhythmStartsTicks(barStartTick, ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  const starts = [];
  const beatTicks = ticksPerQuarter;
  if(state.chordRhythmMode === "sustain") return [[barStartTick, state.timeSig * beatTicks]];
  if(state.chordRhythmMode === "quarter"){
    for(let b=0; b<state.timeSig; b++) starts.push([barStartTick + b * beatTicks, beatTicks]);
    return starts;
  }
  starts.push([barStartTick, beatTicks * 2]);
  if(state.timeSig >= 4) starts.push([barStartTick + 2 * beatTicks, beatTicks * 2]);
  else if(state.timeSig === 3) starts.push([barStartTick + Math.round(1.5 * beatTicks), Math.round(1.5 * beatTicks)]);
  return starts;
}

function chordMidiNotesForExport(ch){
  const notes = chordNotes(ch);
  return state.midiChordExport === "block" ? notes.slice().sort((a,b)=>a-b) : notes;
}

function pushMidiNote(events, tick, durTicks, note, vel, ch){
  const safeNote = clamp(asInt(note, 60), 0, 127);
  const start = Math.max(0, Math.round(tick));
  const dur = Math.max(1, Math.round(durTicks));
  events.push({tick:start, on:true, note:safeNote, vel:clamp(asInt(vel, 80), 1, 127), ch});
  events.push({tick:start + dur, on:false, note:safeNote, vel:0, ch});
}

function buildQuantizedMidiEvents(ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  const sections = projectSectionsForExport();
  const events = [];
  const resolution = activeResolution();
  const stepTicks = tickPerStep(resolution, ticksPerQuarter);
  let sectionStartTick = 0;

  sections.forEach(section => {
    const stepCount = section.bars * stepsPerBar();
    for(let step = 0; step < stepCount; step++){
      const tick = Math.round(sectionStartTick + step * stepTicks);
      const bar = Math.floor(step / stepsPerBar());
      const barStartTick = Math.round(sectionStartTick + bar * state.timeSig * ticksPerQuarter);
      const ch = section.progression[bar] || state.availableChords[0];

      if(step % stepsPerBar() === 0 && state.midiChordExport !== "none"){
        chordRhythmStartsTicks(barStartTick, ticksPerQuarter).forEach(([startTick, durTicks]) => {
          const notes = chordMidiNotesForExport(ch);
          notes.forEach((note, idx) => {
            const isPlayed = state.midiChordExport === "played" && state.chordPlayMode !== "block";
            const gapTicks = isPlayed ? Math.round((state.chordPlayMode.startsWith("strum") ? 0.045 : 0.12) / beatDur() * ticksPerQuarter) : 0;
            const noteTick = startTick + (isPlayed ? idx * gapTicks : 0);
            const noteDur = state.chordPlayMode.startsWith("arp") && state.midiChordExport === "played" ? Math.min(Math.round(ticksPerQuarter * 0.35), durTicks) : durTicks;
            pushMidiNote(events, noteTick, state.midiExactDurations ? noteDur : Math.round(noteDur * 0.92), note, 76, 0);
          });
        });
      }

      [{id:"kick", note:36, dur:0.12, vel:100, accentVel:118}, {id:"snare", note:38, dur:0.10, vel:96, accentVel:112}, {id:"hat", note:null, dur:0.06, vel:68, accentVel:96}].forEach(d => {
        const level = normalizeBeatCell(section.grid[d.id][step]);
        if(gridTripletSecond(section, d.id, step)) return;
        if(gridTripletStart(section, d.id, step)){
          const spanTicks = Math.round(stepTicks * 2);
          const offsets = tripletTickOffsets(spanTicks);
          const nextLevel = normalizeBeatCell(section.grid[d.id][step + 1]);
          offsets.forEach((off, ti) => {
            const lev = ti === 2 ? nextLevel : level;
            const note = d.id === "hat" ? (lev === 2 ? 46 : 42) : d.note;
            pushMidiNote(events, tick + off, Math.max(1, Math.round(spanTicks / 3 * 0.72)), note, lev === 2 ? d.accentVel : d.vel, 9);
          });
        } else if(level > 0){
          const note = d.id === "hat" ? (level === 2 ? 46 : 42) : d.note;
          pushMidiNote(events, tick, Math.round(ticksPerQuarter * (d.id === "hat" && level === 2 ? 0.18 : d.dur)), note, level === 2 ? d.accentVel : d.vel, 9);
        }
      });
      const expandedMidiNotes = {rim:37,clap:39,ride:51,crash:49,china:52,tom_high:50,tom_mid:47,tom_low:45,percussion:56};
      EXPANDED_DRUM_LANES.forEach(lane => {
        const level = normalizeBeatCell(section.drumLanes?.[lane]?.[step]);
        const note = expandedMidiNotes[lane];
        if(level > 0 && note) pushMidiNote(events,tick,Math.round(ticksPerQuarter * 0.1),note,level === 2 ? 112 : 90,9);
      });

      if(!gridTripletSecond(section, "bass", step) && bassStepHasTrigger(section, step) && !(section.bassHold || [])[step] && !(section.bassSlide || [])[step]){
        const bassMidi = bassStepMidiAt(section, step);
        if(gridTripletStart(section, "bass", step)){
          const spanTicks = Math.round(stepTicks * 2);
          const offsets = tripletTickOffsets(spanTicks);
          const rightMidi = bassStepMidiAt(section, step + 1);
          const midMidi = bassMidi !== null && rightMidi !== null ? Math.round((bassMidi + rightMidi) / 2) : bassMidi;
          [bassMidi, midMidi, rightMidi ?? bassMidi].forEach((midi, ti) => {
            if(midi !== null) pushMidiNote(events, tick + offsets[ti], Math.max(1, Math.round(spanTicks / 3 * 0.86)), midi, (ti === 2 ? bassStepAccentAt(section, step + 1) : bassStepAccentAt(section, step)) ? 98 : 82, 1);
          });
        } else if(bassMidi !== null){
          const phrase = phraseTickInfo(section, 0, step, "bass", ticksPerQuarter);
          pushMidiNote(events, tick, phrase.durTicks, bassMidi, bassStepAccentAt(section, step) ? 98 : 82, 1);
        }
      }
      exportGuitarToMidi(events, tick, section, step, ticksPerQuarter);

      melodyTracksForCurrentMode(section).forEach((track, trackIndex) => {
          const holdTrack = (section.melodyHold || [])[trackIndex] || [];
          const slideTrack = (section.melodySlide || [])[trackIndex] || [];
          if(holdTrack[step] || slideTrack[step] || melodyTripletSecond(section, trackIndex, step)) return;
          if(track[step] !== null && track[step] !== undefined && melodyTrackIsAudible(trackIndex, section.name)){
            if(melodyTripletStart(section, trackIndex, step)){
              const spanTicks = Math.round(stepTicks * 2);
              const offsets = tripletTickOffsets(spanTicks);
              const notes = [track[step], melodyTripletMiddleIndex(track[step], track[step + 1]), track[step + 1]];
              notes.forEach((noteIndex, ti) => pushMidiNote(events, tick + offsets[ti], Math.max(1, Math.round(spanTicks / 3 * 0.86)), melodyIndexToMidi(noteIndex, ((section.melodyOctaves || [])[trackIndex] ?? 0)), 88, 2));
            } else {
              const phrase = phraseTickInfo(section, trackIndex, step, "melody", ticksPerQuarter);
              const midi = melodyIndexToMidi(track[step], ((section.melodyOctaves || [])[trackIndex] ?? 0));
              pushMidiNote(events, tick, phrase.durTicks, midi, 88, 2);
            }
          }
        });
    }
    sectionStartTick += sectionLengthTicks(section, ticksPerQuarter);
  });

  return events.sort((a,b) => a.tick - b.tick || (a.on === b.on ? 0 : a.on ? -1 : 1));
}

function buildPerformanceMidiEvents(ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  const midiEvents = [];
  const events = buildSequenceEvents();
  events.forEach(ev => {
    const evTick = secondsToMidiTicks(ev.time, ticksPerQuarter);
    if(ev.type === "chord"){
      if(state.midiChordExport === "none") return;
      chordMidiNotesForExport(ev.chord).forEach((note, idx) => {
        let startTick = evTick;
        if(state.midiChordExport === "played" && state.chordPlayMode !== "block"){
          const gap = state.chordPlayMode.startsWith("strum") ? 0.045 : 0.12;
          startTick += secondsToMidiTicks(idx * gap, ticksPerQuarter);
        }
        const durSeconds = state.chordPlayMode.startsWith("arp") && state.midiChordExport === "played" ? Math.min(0.18, ev.dur * 0.35) : Math.min(ev.dur, 1.2);
        pushMidiNote(midiEvents, startTick, secondsToMidiTicks(durSeconds, ticksPerQuarter), note, humanizeVelocity(76, ev.step ?? 0, 1), 0);
      });
    } else if(ev.type === "bass"){
      pushMidiNote(midiEvents, evTick, secondsToMidiTicks(ev.dur, ticksPerQuarter), ev.midi, humanizeVelocity(ev.accent ? 98 : 82, ev.step ?? 0, 4), 1);
    } else if(ev.type === "melody"){
      pushMidiNote(midiEvents, evTick, secondsToMidiTicks(ev.dur, ticksPerQuarter), ev.midi, humanizeVelocity(88, ev.step ?? 0, 10 + (ev.trackIndex || 0)), 2);
    } else if(ev.type === "guitar"){
      if(ev.articulation === "scratch") return;
      const ordered = ev.direction === "up" ? ev.notes.slice().reverse() : ev.notes;
      const gapTicks = ev.articulation === "chug" ? secondsToMidiTicks(0.004, ticksPerQuarter) : secondsToMidiTicks(0.012, ticksPerQuarter);
      const velocity = ev.articulation === "accent" ? 108 : ev.articulation === "chug" ? 92 : 96;
      ordered.forEach((note, idx) => {
        pushMidiNote(midiEvents, evTick + idx * gapTicks, secondsToMidiTicks(Math.max(0.03, ev.dur - idx * 0.004), ticksPerQuarter), note, humanizeVelocity(velocity, ev.step ?? 0, 17 + idx), 3);
      });
    } else if(ev.type === "kick"){
      pushMidiNote(midiEvents, evTick, secondsToMidiTicks(0.06, ticksPerQuarter), 36, humanizeVelocity(ev.accent ? 118 : 100, ev.step ?? 0, 1), 9);
    } else if(ev.type === "snare"){
      pushMidiNote(midiEvents, evTick, secondsToMidiTicks(0.05, ticksPerQuarter), 38, humanizeVelocity(ev.accent ? 112 : 96, ev.step ?? 0, 2), 9);
    } else if(ev.type === "hat"){
      pushMidiNote(midiEvents, evTick, secondsToMidiTicks(ev.accent ? 0.08 : 0.02, ticksPerQuarter), ev.accent ? 46 : 42, humanizeVelocity(ev.accent ? 96 : 68, ev.step ?? 0, 3), 9);
    } else if(ev.type === "drum"){
      const note = {rim:37,clap:39,ride:51,crash:49,china:52,tom_high:50,tom_mid:47,tom_low:45,percussion:56}[ev.lane] || 39;
      pushMidiNote(midiEvents,evTick,secondsToMidiTicks(Math.min(ev.dur || 0.1,0.18),ticksPerQuarter),note,humanizeVelocity(ev.accent ? 112 : 90,ev.step ?? 0,31),9);
    }
  });
  return midiEvents.sort((a,b) => a.tick - b.tick || (a.on === b.on ? 0 : a.on ? -1 : 1));
}

function exportMidiFile(){
  try{
    const ticksPerQuarter = MIDI_TICKS_PER_QUARTER;
    const tempo = Math.round(60000000 / state.bpm);
    const track = [];
    const pushEvent = (delta, bytes) => track.push(...bytesVLQ(delta), ...bytes);
    pushEvent(0, [0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF]);

    const midiEvents = state.midiExportMode === "performance"
      ? buildPerformanceMidiEvents(ticksPerQuarter)
      : buildQuantizedMidiEvents(ticksPerQuarter);

    let lastTick = 0;
    midiEvents.forEach(ev => {
      const tick = Math.max(0, Math.round(ev.tick));
      const delta = Math.max(0, tick - lastTick);
      lastTick = tick;
      const status = (ev.on ? 0x90 : 0x80) | (ev.ch & 0x0F);
      pushEvent(delta, [status, ev.note & 0x7F, ev.vel & 0x7F]);
    });

    pushEvent(0, [0xFF, 0x2F, 0x00]);

    const trackLength = track.length;
    const header = [
      ...strBytes("MThd"), 0x00,0x00,0x00,0x06, 0x00,0x00, 0x00,0x01,
      (ticksPerQuarter >> 8) & 0xFF, ticksPerQuarter & 0xFF,
      ...strBytes("MTrk"),
      (trackLength >> 24) & 0xFF, (trackLength >> 16) & 0xFF, (trackLength >> 8) & 0xFF, trackLength & 0xFF
    ];
    const bytes = new Uint8Array([...header, ...track]);
    const blob = new Blob([bytes], {type:"audio/midi"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.midiExportMode === "performance" ? "pocket_chordsmith_performance_export.mid" : "pocket_chordsmith_quantized_export.mid";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatus(`Exported ${state.midiExportMode} MIDI - ${midiEvents.length} MIDI events`);
  }catch(e){
    console.error(e);
    setStatus("MIDI export failed");
  }
}

function readMidiVLQ(bytes, ref){
  let value = 0;
  let guard = 0;
  while(ref.pos < bytes.length){
    const b = bytes[ref.pos++];
    value = (value << 7) | (b & 0x7F);
    guard++;
    if(!(b & 0x80)) return value;
    if(guard > 4) throw new Error("Invalid MIDI variable length value");
  }
  throw new Error("Unexpected end of MIDI track");
}
function midiChunkName(view, offset){
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}
function parseStandardMidi(buffer){
  if(!(buffer instanceof ArrayBuffer) || buffer.byteLength > MIDI_IMPORT_MAX_BYTES) throw new RangeError(`MIDI file exceeds the ${MIDI_IMPORT_MAX_BYTES / (1024 * 1024)} MiB import limit`);
  const view = new DataView(buffer);
  let offset = 0;
  const readU16 = () => { const v = view.getUint16(offset, false); offset += 2; return v; };
  const readU32 = () => { const v = view.getUint32(offset, false); offset += 4; return v; };
  if(view.byteLength < 14 || midiChunkName(view, 0) !== "MThd") throw new Error("Not a standard MIDI file");
  offset = 4;
  const headerLength = readU32();
  const format = readU16();
  const trackCount = readU16();
  if(trackCount > MIDI_IMPORT_MAX_TRACKS) throw new RangeError(`MIDI file exceeds the ${MIDI_IMPORT_MAX_TRACKS}-track import limit`);
  const division = readU16();
  offset = 8 + headerLength;
  if(format !== 0 && format !== 1) throw new Error("Only MIDI format 0 and 1 are supported");
  if(division & 0x8000) throw new Error("SMPTE-time MIDI files are not supported yet");
  const ticksPerQuarter = division || MIDI_TICKS_PER_QUARTER;
  const notes = [];
  const tempos = [];
  const timeSignatures = [];
  const trackNames = [];
  const keySignatures = [];
  const lyrics = [];
  const programChanges = [];
  const controlChanges = [];
  const pitchBends = [];
  let sysexCount = 0;
  let tracksRead = 0;
  let parsedEventCount = 0;
  const decodeMidiText = (bytes, start, len) => {
    const chunk = bytes.slice(start, start + len);
    try{
      return new TextDecoder("utf-8").decode(chunk).replace(/\0/g, "").trim();
    }catch(e){
      return Array.from(chunk).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : "").join("").trim();
    }
  };
  const signedByte = (value) => value > 127 ? value - 256 : value;

  const readTrack = (trackBytes, trackIndex) => {
    const ref = {pos:0};
    let tick = 0;
    let runningStatus = 0;
    const active = new Map();
    const keyFor = (channel, note) => `${channel}:${note}`;
    const dataLengthFor = (command) => (command === 0xC0 || command === 0xD0) ? 1 : 2;
    const closeNote = (channel, note, velocity) => {
      const key = keyFor(channel, note);
      const stack = active.get(key);
      if(!stack || !stack.length) return;
      const start = stack.shift();
      if(tick > start.tick){
        notes.push({trackIndex, channel, note, velocity:start.velocity, offVelocity:velocity || 0, startTick:start.tick, endTick:tick});
      }
      if(!stack.length) active.delete(key);
    };

    while(ref.pos < trackBytes.length){
      parsedEventCount++;
      if(parsedEventCount > MIDI_IMPORT_MAX_EVENTS) throw new RangeError(`MIDI file exceeds the ${MIDI_IMPORT_MAX_EVENTS}-event import limit`);
      tick += readMidiVLQ(trackBytes, ref);
      if(ref.pos >= trackBytes.length) break;
      let status = trackBytes[ref.pos++];
      if(status < 0x80){
        if(!runningStatus) throw new Error("Invalid running status in MIDI track");
        ref.pos--;
        status = runningStatus;
      } else if(status < 0xF0){
        runningStatus = status;
      }

      if(status === 0xFF){
        if(ref.pos >= trackBytes.length) break;
        const metaType = trackBytes[ref.pos++];
        const len = readMidiVLQ(trackBytes, ref);
        const start = ref.pos;
        if(metaType === 0x51 && len >= 3){
          const microsecondsPerQuarter = (trackBytes[start] << 16) | (trackBytes[start + 1] << 8) | trackBytes[start + 2];
          tempos.push({tick, microsecondsPerQuarter, trackIndex});
        } else if(metaType === 0x58 && len >= 2){
          const numerator = trackBytes[start];
          const denominator = Math.pow(2, trackBytes[start + 1]);
          timeSignatures.push({tick, numerator, denominator, trackIndex});
        } else if(metaType === 0x03 && len > 0){
          const name = decodeMidiText(trackBytes, start, len);
          if(name) trackNames.push({tick, trackIndex, name});
        } else if(metaType === 0x05 && len > 0){
          const text = decodeMidiText(trackBytes, start, len);
          if(text) lyrics.push({tick, trackIndex, text});
        } else if(metaType === 0x59 && len >= 2){
          keySignatures.push({tick, trackIndex, sharpsFlats:signedByte(trackBytes[start]), minor:trackBytes[start + 1] === 1});
        }
        ref.pos = start + len;
        if(metaType === 0x2F) break;
        continue;
      }

      if(status === 0xF0 || status === 0xF7){
        const len = readMidiVLQ(trackBytes, ref);
        ref.pos += len;
        sysexCount++;
        continue;
      }

      const command = status & 0xF0;
      const channel = status & 0x0F;
      const len = dataLengthFor(command);
      if(ref.pos + len > trackBytes.length) break;
      const d1 = trackBytes[ref.pos++];
      const d2 = len > 1 ? trackBytes[ref.pos++] : 0;
      if(command === 0x90 && d2 > 0){
        const key = keyFor(channel, d1);
        if(!active.has(key)) active.set(key, []);
        active.get(key).push({tick, velocity:d2, channel, note:d1});
      } else if(command === 0x80 || (command === 0x90 && d2 === 0)){
        closeNote(channel, d1, d2);
      } else if(command === 0xC0){
        programChanges.push({tick, trackIndex, channel, program:d1});
      } else if(command === 0xB0){
        controlChanges.push({tick, trackIndex, channel, controller:d1, value:d2});
      } else if(command === 0xE0){
        pitchBends.push({tick, trackIndex, channel, value:(((d2 << 7) | d1) - 8192)});
      }
    }

    active.forEach((stack) => {
      stack.forEach(start => {
        if(tick > start.tick){
          notes.push({trackIndex, channel:start.channel, note:start.note, velocity:start.velocity, startTick:start.tick, endTick:tick});
        }
      });
    });
  };

  while(offset + 8 <= view.byteLength && tracksRead < trackCount){
    const chunk = midiChunkName(view, offset);
    offset += 4;
    const length = view.getUint32(offset, false);
    offset += 4;
    if(offset + length > view.byteLength) throw new Error("Truncated MIDI track data");
    if(chunk === "MTrk"){
      const bytes = new Uint8Array(buffer, offset, length);
      readTrack(bytes, tracksRead);
      tracksRead++;
    }
    offset += length;
  }

  return {format, trackCount, tracksRead, ticksPerQuarter, notes, tempos, timeSignatures, trackNames, keySignatures, lyrics, programChanges, controlChanges, pitchBends, sysexCount};
}
function firstMidiEvent(list){
  const events = (list || []).map((ev, idx) => Object.assign({__order:idx}, ev));
  events.sort((a,b) => a.tick - b.tick || a.trackIndex - b.trackIndex || a.__order - b.__order);
  if(!events.length) return null;
  const firstTick = events[0].tick;
  const sameTick = events.filter(ev => ev.tick === firstTick);
  return sameTick[sameTick.length - 1] || events[0] || null;
}
function quantizeMidiTickToStep(tick, ticksPerQuarter, resolution=activeResolution()){
  const stepTicks = ticksPerQuarter / resolution;
  return Math.round(tick / stepTicks);
}
function midiNoteIsGuide(note){
  if(!note || !Number.isFinite(note.note) || note.note < 0 || note.note > 127) return true;
  return note.channel !== 9 && asInt(note.velocity, 0) <= 2;
}
function midiTimeSignatureForImport(parsed, currentState=state){
  const timeSig = firstMidiEvent(parsed?.timeSignatures || []);
  if(timeSig && Number.isFinite(timeSig.numerator) && Number.isFinite(timeSig.denominator) && timeSig.denominator > 0){
    return {numerator:timeSig.numerator, denominator:timeSig.denominator, source:"midi"};
  }
  const fallback = safeChoice(asInt(currentState?.timeSig, 4), [3,4], 4);
  return {numerator:fallback, denominator:4, source:"state"};
}
function midiBarTicks(parsed, currentState=state){
  const sig = midiTimeSignatureForImport(parsed, currentState);
  return Math.max(1, Math.round((parsed?.ticksPerQuarter || MIDI_TICKS_PER_QUARTER) * 4 * (sig.numerator / sig.denominator)));
}
function detectMidiImportTiming(parsed, currentState=state){
  const ticksPerQuarter = parsed?.ticksPerQuarter || MIDI_TICKS_PER_QUARTER;
  const barTicks = midiBarTicks(parsed, currentState);
  const notes = Array.isArray(parsed?.notes) ? parsed.notes : [];
  let firstAudibleTick = null;
  let ignoredGuideNotes = 0;
  notes.forEach(note => {
    if(midiNoteIsGuide(note)){
      ignoredGuideNotes++;
      return;
    }
    const tick = Math.max(0, asInt(note.startTick, 0));
    firstAudibleTick = firstAudibleTick === null ? tick : Math.min(firstAudibleTick, tick);
  });
  const tolerance = Math.max(24, ticksPerQuarter / 16);
  let leadingTrimBars = 0;
  if(firstAudibleTick !== null && firstAudibleTick >= barTicks){
    const nearestBars = Math.max(1, Math.round(firstAudibleTick / barTicks));
    const boundary = nearestBars * barTicks;
    if(Math.abs(firstAudibleTick - boundary) <= tolerance) leadingTrimBars = nearestBars;
  }
  return {
    sourceStartTick:leadingTrimBars * barTicks,
    leadingTrimBars,
    firstAudibleTick:firstAudibleTick ?? 0,
    barTicks,
    resolution:activeResolution(),
    ignoredGuideNotes
  };
}
function normalizedMidiNotesForImport(parsed, timing){
  const sourceStartTick = timing?.sourceStartTick || 0;
  return (parsed?.notes || [])
    .filter(note => !midiNoteIsGuide(note))
    .map(note => Object.assign({}, note, {
      rawStartTick:note.startTick,
      rawEndTick:note.endTick,
      startTick:(note.startTick || 0) - sourceStartTick,
      endTick:(note.endTick || note.startTick || 0) - sourceStartTick
    }))
    .filter(note => note.endTick > 0);
}
function chooseMidiImportResolution(notes, ticksPerQuarter){
  const candidates = [1,2,4,8,16];
  const onsets = (notes || [])
    .map(note => asNumber(note.startTick, 0))
    .filter(tick => Number.isFinite(tick) && tick >= -ticksPerQuarter);
  if(!onsets.length) return activeResolution();
  const scores = candidates.map(resolution => {
    const stepTicks = ticksPerQuarter / resolution;
    let fit = 0;
    let error = 0;
    const steps = new Set();
    onsets.forEach(tick => {
      const rounded = Math.round(tick / stepTicks);
      const dist = Math.abs(tick - rounded * stepTicks);
      const tolerance = Math.max(8, Math.min(ticksPerQuarter / 16, stepTicks * 0.26));
      if(dist <= tolerance) fit++;
      error += dist / stepTicks;
      steps.add(rounded);
    });
    const fitRatio = fit / onsets.length;
    const collisionRatio = steps.size / onsets.length;
    return {resolution, fitRatio, avgError:error / onsets.length, collisionRatio};
  });
  const usable = scores.filter(score => score.fitRatio >= 0.86 && score.avgError <= 0.18);
  if(usable.length) return usable[0].resolution;
  scores.sort((a,b) => b.fitRatio - a.fitRatio || a.avgError - b.avgError || b.collisionRatio - a.collisionRatio || a.resolution - b.resolution);
  return scores[0]?.resolution || activeResolution();
}
function midiDrumTarget(note){
  if([35,36].includes(note)) return {track:"kick", level:1};
  if([37,38,39,40].includes(note)) return {track:"snare", level:1};
  if([42,44].includes(note)) return {track:"hat", level:1};
  if([46].includes(note)) return {track:"hat", level:2};
  if([51,53,59].includes(note)) return {track:"hat", level:2};
  if([54].includes(note)) return {track:"hat", level:1};
  if([49,55,57].includes(note)) return {track:"hat", level:2};
  return null;
}
function midiProgramForChannel(parsed, channel, tick=Infinity){
  const changes = (parsed?.programChanges || [])
    .filter(ev => ev.channel === channel && ev.tick <= tick)
    .sort((a,b) => a.tick - b.tick || a.trackIndex - b.trackIndex);
  return changes.length ? changes[changes.length - 1].program : null;
}
function midiPanForChannel(parsed, channel){
  const pans = (parsed?.controlChanges || []).filter(ev => ev.channel === channel && ev.controller === 10);
  if(!pans.length) return null;
  const value = pans[pans.length - 1].value;
  return clamp(((value / 127) * 2) - 1, -1, 1);
}
function midiProgramSuggestsBass(program){
  return Number.isFinite(program) && program >= 32 && program <= 39;
}
function midiProgramSuggestsGuitar(program){
  return Number.isFinite(program) && program >= 24 && program <= 31;
}
function midiProgramSuggestsDistortedGuitar(program){
  return Number.isFinite(program) && program >= 29 && program <= 31;
}
function midiProgramSuggestsBrass(program){
  return Number.isFinite(program) && program >= 56 && program <= 63;
}
function midiProgramSuggestsKeysOrgan(program){
  return Number.isFinite(program) && program >= 0 && program <= 23;
}
function midiProgramToMelodyInstrument(program){
  if(midiProgramSuggestsDistortedGuitar(program)) return "distorted_lead_guitar";
  if(midiProgramSuggestsGuitar(program)) return "lead_guitar";
  if(midiProgramSuggestsBrass(program)) return "trumpet";
  if(midiProgramSuggestsKeysOrgan(program)) return program >= 16 ? "soft" : "synth";
  return null;
}
function midiToBassManualIndex(midi,key=state.key,scaleName=state.scale){
  let best = {idx:0, dist:Infinity};
  for(let idx = 0; idx < 14; idx++){
    const candidate = bassManualIndexToMidi(idx,key,scaleName);
    const dist = Math.abs(candidate - midi);
    if(dist < best.dist) best = {idx, dist};
  }
  return best.idx;
}
function chooseBestMelodyTrackOctave(notes){
  const midis = (notes || []).map(n => typeof n === "number" ? n : n && n.note).filter(n => Number.isFinite(n));
  if(!midis.length) return 0;
  let best = {octave:0, score:-Infinity};
  [-1,0,1].forEach(octave => {
    const base = 72 + (octave * 12);
    let valid = 0;
    let centrePenalty = 0;
    midis.forEach(midi => {
      const idx = midi - base;
      if(idx >= 0 && idx <= 23){
        valid++;
        centrePenalty += Math.abs(idx - 11.5) / 24;
      }
    });
    const score = valid * 100 - centrePenalty;
    if(score > best.score) best = {octave, score};
  });
  return best.octave;
}
function midiToChromaticMelodyIndex(midi, trackOctave){
  const base = 72 + (trackOctave * 12);
  const idx = midi - base;
  if(idx < 0 || idx > 23) return null;
  return idx;
}
function applyHeldMidiLength(note, startStep, targetTrack, holdTrack, maxSteps, ticksPerQuarter){
  const stepTicks = ticksPerQuarter / activeResolution();
  const endStep = clamp(Math.round(note.endTick / stepTicks), startStep + 1, maxSteps);
  for(let s = startStep + 1; s < endStep; s++){
    if(targetTrack[s] !== null && targetTrack[s] !== undefined) break;
    holdTrack[s] = true;
  }
}
function midiKeySignatureToProjectKey(sig){
  if(!sig) return null;
  const majorBySf = {"-7":"Cb","-6":"Gb","-5":"Db","-4":"Ab","-3":"Eb","-2":"Bb","-1":"F","0":"C","1":"G","2":"D","3":"A","4":"E","5":"B","6":"F#","7":"C#"};
  const minorBySf = {"-7":"Ab","-6":"Eb","-5":"Bb","-4":"F","-3":"C","-2":"G","-1":"D","0":"A","1":"E","2":"B","3":"F#","4":"C#","5":"G#","6":"D#","7":"A#"};
  const sf = clamp(asInt(sig.sharpsFlats, 0), -7, 7);
  return {key:(sig.minor ? minorBySf[sf] : majorBySf[sf]) || "C", scale:sig.minor ? "minor" : "major"};
}
function inferMidiKeyScale(notes, parsed){
  const explicit = midiKeySignatureToProjectKey(firstMidiEvent(parsed?.keySignatures || []));
  if(explicit && NOTES.includes(explicit.key)) return explicit;
  const pitchWeights = new Array(12).fill(0);
  const bassWeights = new Array(12).fill(0);
  (notes || []).forEach(note => {
    if(note.channel === 9 || midiNoteIsGuide(note)) return;
    const pc = ((note.note % 12) + 12) % 12;
    const duration = Math.max(1, (note.endTick || note.startTick || 0) - (note.startTick || 0));
    const weight = duration * Math.max(8, asInt(note.velocity, 64)) / 64;
    pitchWeights[pc] += weight;
    if(note.note < 60) bassWeights[pc] += weight * 1.35;
  });
  if(!pitchWeights.some(Boolean)) return {key:state.key, scale:state.scale};
  const modes = [
    {scale:"major", intervals:[0,2,4,5,7,9,11]},
    {scale:"minor", intervals:[0,2,3,5,7,8,10]}
  ];
  let best = null;
  NOTES.forEach((key, root) => {
    modes.forEach(mode => {
      const scalePcs = mode.intervals.map(i => (root + i) % 12);
      let score = bassWeights[root] * 1.6 + pitchWeights[root] * 0.5;
      pitchWeights.forEach((weight, pc) => {
        score += scalePcs.includes(pc) ? weight : -weight * 0.42;
      });
      if(!best || score > best.score) best = {key, scale:mode.scale, score};
    });
  });
  return best ? {key:best.key, scale:best.scale} : {key:state.key, scale:state.scale};
}
function midiChordCandidatesForCurrentType(){
  const qualities = state.chordType === "seventh"
    ? [
        {quality:"maj", intervals:[0,4,7,11]},
        {quality:"min", intervals:[0,3,7,10]},
        {quality:"dim", intervals:[0,3,6,10]}
      ]
    : [
        {quality:"maj", intervals:[0,4,7]},
        {quality:"min", intervals:[0,3,7]},
        {quality:"dim", intervals:[0,3,6]},
        {quality:"sus2", intervals:[0,2,7]},
        {quality:"sus4", intervals:[0,5,7]}
      ];
  const out = [];
  for(let root = 0; root < 12; root++){
    qualities.forEach(q => out.push({root, quality:q.quality, intervals:q.intervals, pcs:q.intervals.map(i => (root + i) % 12)}));
  }
  return out;
}
function mapMidiChordCandidateToPocketChord(candidate){
  if(!candidate || !state.availableChords.length) return null;
  const exact = state.availableChords.find(ch => ((ch.root % 12) + 12) % 12 === candidate.root && (ch.quality === candidate.quality || candidate.quality.startsWith(ch.quality)));
  if(exact) return exact;
  const rootOnly = state.availableChords.find(ch => ((ch.root % 12) + 12) % 12 === candidate.root);
  if(rootOnly) return rootOnly;
  return null;
}
function likelyMidiChordForWeights(weights, bassWeights){
  if(!weights || !weights.some(Boolean)) return null;
  const total = weights.reduce((a,b)=>a+b, 0);
  if(total <= 0) return null;
  let best = null;
  midiChordCandidatesForCurrentType().forEach(candidate => {
    let chordToneWeight = 0;
    let extraWeight = 0;
    weights.forEach((weight, pc) => {
      if(!weight) return;
      if(candidate.pcs.includes(pc)) chordToneWeight += weight;
      else extraWeight += weight;
    });
    const thirdPresent = candidate.pcs.slice(1).some(pc => weights[pc] > 0);
    const rootWeight = weights[candidate.root] || 0;
    const bassRoot = bassWeights[candidate.root] || 0;
    const score = chordToneWeight - extraWeight * 0.55 + rootWeight * 0.35 + bassRoot * 0.8 + (thirdPresent ? total * 0.12 : -total * 0.25);
    if(chordToneWeight >= total * 0.58 && (!best || score > best.score)) best = {candidate, score};
  });
  return best && best.score > 0 ? mapMidiChordCandidateToPocketChord(best.candidate) : null;
}
function midiChordFingerprintForBar(notes, barStartTick, barEndTick){
  const weights = new Array(12).fill(0);
  const bassWeights = new Array(12).fill(0);
  (notes || []).forEach(note => {
    if(note.channel === 9 || midiNoteIsGuide(note) || note.note < 36) return;
    const start = asNumber(note.startTick, 0);
    const end = Math.max(start + 1, asNumber(note.endTick, start + 1));
    const overlap = Math.max(0, Math.min(end, barEndTick) - Math.max(start, barStartTick));
    if(overlap <= 0) return;
    const pc = ((note.note % 12) + 12) % 12;
    const weight = overlap * (Math.max(8, asInt(note.velocity, 64)) / 64);
    weights[pc] += weight;
    if(note.note < 60) bassWeights[pc] += weight * 1.4;
  });
  const chord = likelyMidiChordForWeights(weights, bassWeights);
  if(chord) return `ch:${chord.root}:${chord.quality}`;
  return weights.some(Boolean) ? `pc:${weights.map((v, pc) => v > 0 ? pc : "-").filter(v => v !== "-").join(".")}` : "ch:-";
}
function midiChunkFingerprint(notes, parsed, timing, chunkIndex){
  const chunkStartBar = chunkIndex * MAX_BARS;
  const chunkEndBar = chunkStartBar + MAX_BARS;
  const stepsInChunk = MAX_BARS * stepsPerBar();
  const drums = new Set();
  const bass = new Set();
  const melody = new Set();
  const channels = new Set();
  const chordParts = [];
  for(let bar = chunkStartBar; bar < chunkEndBar; bar++){
    chordParts.push(midiChordFingerprintForBar(notes, bar * timing.barTicks, (bar + 1) * timing.barTicks));
  }
  (notes || []).forEach(note => {
    const step = quantizeMidiTickToStep(note.startTick, parsed.ticksPerQuarter, activeResolution());
    const bar = Math.floor(step / stepsPerBar());
    if(bar < chunkStartBar || bar >= chunkEndBar) return;
    const localStep = step - (chunkStartBar * stepsPerBar());
    if(localStep < 0 || localStep >= stepsInChunk) return;
    const coarse = Math.floor(localStep / Math.max(1, activeResolution()));
    if(note.channel === 9){
      const drum = midiDrumTarget(note.note);
      if(drum) drums.add(`${drum.track}:${coarse}`);
      return;
    }
    const program = midiProgramForChannel(parsed, note.channel, note.rawStartTick ?? note.startTick);
    channels.add(`${note.channel}:${Number.isFinite(program) ? program : "?"}`);
    if((midiProgramSuggestsBass(program) && note.note <= 76) || note.note < 52) bass.add(coarse);
    else if(note.note >= 55) melody.add(`${note.channel}:${coarse}`);
  });
  return [
    chordParts.join(","),
    `d:${Array.from(drums).sort().join(".")}`,
    `b:${Array.from(bass).sort((a,b)=>a-b).join(".")}`,
    `m:${Array.from(melody).sort().join(".")}`,
    `c:${Array.from(channels).sort().join(".")}`
  ].join("|");
}
function midiFingerprintSimilarity(a, b){
  const aSet = new Set(String(a || "").split(/[|,.]/).filter(Boolean));
  const bSet = new Set(String(b || "").split(/[|,.]/).filter(Boolean));
  if(!aSet.size && !bSet.size) return 1;
  let shared = 0;
  aSet.forEach(token => { if(bSet.has(token)) shared++; });
  return shared / Math.max(1, Math.max(aSet.size, bSet.size));
}
function planMidiImportSections(normalizedNotes, parsed, timing, estimatedBars){
  const chunkCount = clamp(Math.ceil(Math.max(1, estimatedBars) / MAX_BARS), 1, 256);
  const representatives = [];
  const chunkToSection = [];
  const exact = new Map();
  let approximatedChunks = 0;
  for(let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++){
    const sourceStartBar = chunkIndex * MAX_BARS;
    const barCount = clamp(estimatedBars - sourceStartBar, 1, MAX_BARS);
    const fingerprint = midiChunkFingerprint(normalizedNotes, parsed, timing, chunkIndex);
    if(exact.has(fingerprint)){
      chunkToSection[chunkIndex] = exact.get(fingerprint);
      continue;
    }
    if(representatives.length < SECTION_IDS.length){
      const sectionIndex = representatives.length;
      representatives.push({chunkIndex, sourceStartBar, barCount, fingerprint});
      exact.set(fingerprint, sectionIndex);
      chunkToSection[chunkIndex] = sectionIndex;
      continue;
    }
    let best = {sectionIndex:0, score:-Infinity};
    representatives.forEach((rep, sectionIndex) => {
      const score = midiFingerprintSimilarity(fingerprint, rep.fingerprint);
      if(score > best.score) best = {sectionIndex, score};
    });
    chunkToSection[chunkIndex] = best.sectionIndex;
    approximatedChunks++;
  }
  return {
    chunkCount,
    representatives,
    chunkToSection,
    usedSectionCount:clamp(representatives.length || 1, 1, SECTION_IDS.length),
    approximatedChunks,
    songSequence:chunkToSection.map(sectionIndex => SECTION_IDS[sectionIndex]).filter(Boolean)
  };
}
function midiChannelProgramSummary(parsed){
  const channels = new Map();
  (parsed?.programChanges || []).forEach(ev => {
    if(!channels.has(ev.channel)) channels.set(ev.channel, new Set());
    channels.get(ev.channel).add(ev.program);
  });
  if(!channels.size) return "";
  return Array.from(channels.entries())
    .sort((a,b) => a[0] - b[0])
    .map(([channel, programs]) => `ch ${channel + 1}: ${Array.from(programs).sort((a,b)=>a-b).join("/")}`)
    .join("; ");
}
function midiPitchBendSummary(parsed){
  const counts = new Map();
  (parsed?.pitchBends || []).forEach(ev => {
    const key = ev.channel;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  if(!counts.size) return "";
  return Array.from(counts.entries())
    .sort((a,b) => a[0] - b[0])
    .map(([channel, count]) => `ch ${channel + 1}: ${count}`)
    .join("; ");
}
function tryImportChordProgressionFromMidi(notes, ticksPerQuarter, sectionId, maxSteps, startStepOffset=0, options={}){
  const fillMissingChords = options.fillMissingChords === true;
  const nextProgression = new Array(MAX_BARS).fill(null);
  let updated = 0;
  let carried = 0;
  let empty = 0;
  let previousChord = null;
  const sectionStartTick = startStepOffset * (ticksPerQuarter / activeResolution());
  const stepTicks = ticksPerQuarter / activeResolution();
  const barTickLength = stepsPerBar() * stepTicks;
  for(let bar = 0; bar < sectionBarCount(sectionId); bar++){
    const barStart = sectionStartTick + bar * barTickLength;
    const barEnd = barStart + barTickLength;
    const weights = new Array(12).fill(0);
    const bassWeights = new Array(12).fill(0);
    (notes || []).forEach(note => {
      if(note.channel === 9 || midiNoteIsGuide(note) || note.note < 36) return;
      const start = asNumber(note.startTick, 0);
      const end = Math.max(start + 1, asNumber(note.endTick, start + 1));
      const overlap = Math.max(0, Math.min(end, barEnd) - Math.max(start, barStart));
      if(overlap <= 0) return;
      const pc = ((note.note % 12) + 12) % 12;
      const velocity = Math.max(8, asInt(note.velocity, 64));
      const weight = overlap * (velocity / 64);
      weights[pc] += weight;
      if(note.note < 60) bassWeights[pc] += weight * 1.4;
    });
    const chord = likelyMidiChordForWeights(weights, bassWeights);
    if(chord){
      nextProgression[bar] = chord;
      previousChord = chord;
      updated++;
    } else if(fillMissingChords && previousChord){
      nextProgression[bar] = previousChord;
      carried++;
    } else {
      empty++;
    }
  }
  state[sectionPropKey("progression", sectionId)] = nextProgression;
  return {updated, carried, empty, changed:updated > 0 || carried > 0};
}
function setMidiImportSummary(text){
  if(els.midiImportSummary){
    els.midiImportSummary.textContent = text;
    els.midiImportSummary.style.display = text ? "block" : "none";
  }
}
function makeMidiImportSectionData(){
  const melodyTrackCount = MAX_MELODY_TRACKS;
  return {
    grid:blankGrid(),
    gridTuplets:blankGridTuplets(),
    melodyTracks:blankMelodyTracks(melodyTrackCount),
    melodyHold:blankMelodyHold(melodyTrackCount),
    melodySlide:blankMelodySlide(melodyTrackCount),
    melodyTuplets:blankMelodyTuplets(melodyTrackCount),
    bassNotes:blankBassNotes(),
    bassHold:blankBassHold(),
    bassSlide:blankBassSlide(),
    bassAccent:blankBassAccent(),
    melodyCandidates:Array.from({length:melodyTrackCount}, () => new Map()),
    bassCandidates:new Map(),
    melodyOctaves:blankMelodyOctaves(melodyTrackCount),
    melodyProgramCounts:Array.from({length:melodyTrackCount}, () => new Map()),
    melodyPanValues:Array.from({length:melodyTrackCount}, () => [])
  };
}
function applyHeldMidiLength(note, startStep, targetTrack, holdTrack, maxSteps, ticksPerQuarter, tickOffset=0){
  const stepTicks = ticksPerQuarter / activeResolution();
  const endStep = clamp(Math.round((note.endTick - tickOffset) / stepTicks), startStep + 1, maxSteps);
  for(let s = startStep + 1; s < endStep; s++){
    if(targetTrack[s] !== null && targetTrack[s] !== undefined) break;
    holdTrack[s] = true;
  }
}
function importParsedMidiToProject(parsed, fileName="MIDI"){
  if(state.uiMode !== "advanced"){
    setStatus("Switch to Advanced mode to import MIDI");
    setMidiImportSummary("MIDI import is available in Advanced mode only.");
    return;
  }
  if(!parsed || !Array.isArray(parsed.notes)) throw new Error("No MIDI note data found");
  const wasPlaying = !!state.isPlaying;
  if(wasPlaying) stopPlayback();
  pushUndoState();
  storeSection();

  const tempo = firstMidiEvent(parsed.tempos);
  const timeSig = firstMidiEvent(parsed.timeSignatures);
  const foundBpm = tempo ? Math.round(60000000 / tempo.microsecondsPerQuarter) : null;
  if(foundBpm){
    state.bpm = sanitizeBpm(foundBpm, state.bpm);
    if(els.bpmInput) els.bpmInput.value = state.bpm;
  }
  const foundTimeSigLabel = timeSig ? `${timeSig.numerator}/${timeSig.denominator}` : "not found";
  state.timeSig = timeSig && timeSig.numerator === 3 ? 3 : 4;
  if(els.timeSigSelect) els.timeSigSelect.value = String(state.timeSig);

  const timing = detectMidiImportTiming(parsed, state);
  const normalizedNotes = normalizedMidiNotesForImport(parsed, timing);
  const previousResolution = activeResolution();
  const importResolution = chooseMidiImportResolution(normalizedNotes, parsed.ticksPerQuarter);
  timing.resolution = importResolution;
  if(importResolution !== previousResolution){
    state.resolution = importResolution;
    state.lastAdvancedResolution = importResolution;
    if(els.resolutionSelect) els.resolutionSelect.value = String(state.resolution);
  }
  const inferredKey = inferMidiKeyScale(normalizedNotes, parsed);
  if(inferredKey && NOTES.includes(inferredKey.key)){
    state.key = inferredKey.key;
    state.scale = safeChoice(inferredKey.scale, ["major","minor"], state.scale);
    if(els.keySelect) els.keySelect.value = state.key;
    if(els.scaleSelect) els.scaleSelect.value = state.scale;
  }
  state.melodyPitchMode = "chromatic";
  state.bassMode = "manual";
  state.currentStep = -1;
  state.lastHighlightedStep = -1;
  state.currentSection = "A";
  generateAvailableChords();

  const latestTick = normalizedNotes.reduce((m,n) => Math.max(m, n.endTick || n.startTick || 0), 0);
  const estimatedBars = latestTick ? Math.ceil(latestTick / timing.barTicks) : 1;
  const importPlan = planMidiImportSections(normalizedNotes, parsed, timing, estimatedBars);
  const usedSectionCount = importPlan.usedSectionCount;
  const importBars = importPlan.representatives.reduce((sum, rep) => sum + (rep.barCount || MAX_BARS), 0);
  const maxGlobalSteps = Math.max(1, estimatedBars) * stepsPerBar();
  const stepTicks = parsed.ticksPerQuarter / activeResolution();
  const sections = {};
  SECTION_IDS.forEach((id, sectionIndex) => {
    const rep = importPlan.representatives[sectionIndex];
    state.sectionBars[id] = rep ? clamp(rep.barCount, 1, MAX_BARS) : MAX_BARS;
    sections[id] = makeMidiImportSectionData();
  });

  let imported = 0;
  let skipped = 0;
  let drumImported = 0;
  let drumSkipped = 0;
  let drumCellsMerged = 0;
  let bassImported = 0;
  let melodyImported = 0;
  let melodyCollapsed = 0;
  let outOfRangeSkipped = 0;
  let notesWithinImportWindow = 0;
  let notesRepresentedByPhraseReuse = 0;
  let notesBeyondArrangementCapacity = 0;
  let highestMelodyLaneUsed = 0;
  const melodyTrackCount = MAX_MELODY_TRACKS;
  const laneProgramCounts = Array.from({length:melodyTrackCount}, () => new Map());
  const lanePanValues = Array.from({length:melodyTrackCount}, () => []);
  const drumCellKeys = new Set();
  const channelLaneMap = new Map();
  const directImportChunks = new Set(importPlan.representatives.map(rep => rep.chunkIndex));
  const representativeSourceStepForSection = (sectionIndex) => (importPlan.representatives[sectionIndex]?.sourceStartBar || 0) * stepsPerBar();
  const routeByStep = (globalStep) => {
    if(globalStep < 0 || globalStep >= maxGlobalSteps) return null;
    const sourceBar = Math.floor(globalStep / stepsPerBar());
    const chunkIndex = Math.floor(sourceBar / MAX_BARS);
    if(!directImportChunks.has(chunkIndex)) return null;
    const sectionIndex = importPlan.chunkToSection[chunkIndex];
    const sectionId = SECTION_IDS[sectionIndex];
    if(!sectionId || sectionIndex >= usedSectionCount) return null;
    const localStep = globalStep - representativeSourceStepForSection(sectionIndex);
    const localMaxSteps = visibleSectionSteps(sectionId);
    if(localStep < 0 || localStep >= localMaxSteps) return null;
    return {sectionId, sectionIndex, localStep, localMaxSteps, tickOffset:(representativeSourceStepForSection(sectionIndex) * stepTicks)};
  };

  const pitchedByGlobalStep = new Map();
  normalizedNotes.forEach(note => {
    const globalStep = quantizeMidiTickToStep(note.startTick, parsed.ticksPerQuarter, activeResolution());
    if(globalStep >= 0 && globalStep < maxGlobalSteps) notesWithinImportWindow++;
    const route = routeByStep(globalStep);
    if(!route){
      skipped++;
      outOfRangeSkipped++;
      if(globalStep >= 0 && globalStep < maxGlobalSteps) notesRepresentedByPhraseReuse++;
      else notesBeyondArrangementCapacity++;
      return;
    }
    const data = sections[route.sectionId];
    if(note.channel === 9){
      const drum = midiDrumTarget(note.note);
      if(!drum){ skipped++; drumSkipped++; return; }
      const cellKey = `${route.sectionId}:${drum.track}:${route.localStep}`;
      if(drumCellKeys.has(cellKey)) drumCellsMerged++;
      else drumCellKeys.add(cellKey);
      data.grid[drum.track][route.localStep] = mergeBeatLevel(data.grid[drum.track][route.localStep], drum.level);
      imported++; drumImported++;
      return;
    }
    if(!pitchedByGlobalStep.has(globalStep)) pitchedByGlobalStep.set(globalStep, []);
    pitchedByGlobalStep.get(globalStep).push({note, route});
  });

  pitchedByGlobalStep.forEach((items, globalStep) => {
    const sortedLow = items.slice().sort((a,b) => a.note.note - b.note.note || a.note.startTick - b.note.startTick);
    const bassItem = sortedLow.find(item => {
      const program = midiProgramForChannel(parsed, item.note.channel, item.note.rawStartTick ?? item.note.startTick);
      return midiProgramSuggestsBass(program) && item.note.note <= 76;
    }) || sortedLow.find(item => item.note.note < 64) || null;
    if(bassItem){
      const data = sections[bassItem.route.sectionId];
      const existing = data.bassCandidates.get(bassItem.route.localStep);
      if(!existing || bassItem.note.note < existing.note.note) data.bassCandidates.set(bassItem.route.localStep, bassItem);
    }

    const melodyItems = items
      .filter(item => item !== bassItem && item.note.note >= 55)
      .sort((a,b) => b.note.note - a.note.note || a.note.startTick - b.note.startTick);
    const occupiedLanes = new Set();
    melodyItems.forEach(item => {
      const program = midiProgramForChannel(parsed, item.note.channel, item.note.rawStartTick ?? item.note.startTick);
      let lane = channelLaneMap.get(item.note.channel);
      if(lane === undefined || occupiedLanes.has(lane)){
        lane = null;
        for(let candidate = 0; candidate < melodyTrackCount; candidate++){
          if(!occupiedLanes.has(candidate) && (!channelLaneMap.has(item.note.channel) || candidate === channelLaneMap.get(item.note.channel))){
            lane = candidate;
            break;
          }
        }
        if(lane === null){
          for(let candidate = 0; candidate < melodyTrackCount; candidate++){
            if(!occupiedLanes.has(candidate)){
              lane = candidate;
              break;
            }
          }
        }
      }
      if(lane === null || lane === undefined){
        melodyCollapsed++;
        return;
      }
      if(!channelLaneMap.has(item.note.channel)) channelLaneMap.set(item.note.channel, lane);
      occupiedLanes.add(lane);
      const data = sections[item.route.sectionId];
      const existing = data.melodyCandidates[lane].get(item.route.localStep);
      if(!existing || item.note.note > existing.note.note) data.melodyCandidates[lane].set(item.route.localStep, item);
      if(Number.isFinite(program)){
        laneProgramCounts[lane].set(program, (laneProgramCounts[lane].get(program) || 0) + 1);
        data.melodyProgramCounts[lane].set(program, (data.melodyProgramCounts[lane].get(program) || 0) + 1);
      }
      const pan = midiPanForChannel(parsed, item.note.channel);
      if(pan !== null){
        lanePanValues[lane].push(pan);
        data.melodyPanValues[lane].push(pan);
      }
      highestMelodyLaneUsed = Math.max(highestMelodyLaneUsed, lane + 1);
    });
  });

  SECTION_IDS.slice(0, usedSectionCount).forEach(sectionId => {
    const data = sections[sectionId];
    const maxSteps = visibleSectionSteps(sectionId);
    data.bassCandidates.forEach(({note, route}, step) => {
      data.bassNotes[step] = midiToBassManualIndex(note.note);
      data.bassAccent[step] = note.velocity >= 104;
      applyHeldMidiLength(note, step, data.bassNotes, data.bassHold, maxSteps, parsed.ticksPerQuarter, route.tickOffset);
      imported++; bassImported++;
    });
    data.melodyCandidates.forEach((candidateMap, lane) => {
      const laneNotes = Array.from(candidateMap.values()).map(item => item.note.note);
      data.melodyOctaves[lane] = chooseBestMelodyTrackOctave(laneNotes);
      candidateMap.forEach(({note, route}, step) => {
        const idx = midiToChromaticMelodyIndex(note.note, data.melodyOctaves[lane]);
        if(idx === null){ skipped++; return; }
        data.melodyTracks[lane][step] = idx;
        applyHeldMidiLength(note, step, data.melodyTracks[lane], data.melodyHold[lane], maxSteps, parsed.ticksPerQuarter, route.tickOffset);
        imported++; melodyImported++;
      });
    });
  });

  const importedMelodyTrackCount = clamp(highestMelodyLaneUsed || 1, 1, melodyTrackCount);
  const defaultImportInstruments = ["pulse", "soft", "synth", "bell", "pulse", "soft"];
  const defaultImportPans = importedMelodyTrackCount === 1 ? [0] : [-0.55, 0.55, -0.32, 0.32, -0.12, 0.12];
  for(let lane = 0; lane < importedMelodyTrackCount; lane++){
    const programs = Array.from(laneProgramCounts[lane].entries()).sort((a,b) => b[1] - a[1]);
    const instrument = midiProgramToMelodyInstrument(programs[0]?.[0]);
    if(instrument && melodyInstrumentIds().includes(instrument)) defaultImportInstruments[lane] = instrument;
    if(lanePanValues[lane].length){
      defaultImportPans[lane] = clamp(lanePanValues[lane].reduce((a,b)=>a+b, 0) / lanePanValues[lane].length, -1, 1);
    }
  }

  let progressionSections = 0;
  let progressionBarsUpdated = 0;
  let progressionBarsCarried = 0;
  let progressionBarsEmpty = 0;
  SECTION_IDS.forEach((sectionId, sectionIndex) => {
    const data = sections[sectionId];
    const sectionImportInstruments = defaultImportInstruments.slice(0, importedMelodyTrackCount);
    const sectionImportPans = defaultImportPans.slice(0, importedMelodyTrackCount);
    for(let lane = 0; lane < importedMelodyTrackCount; lane++){
      const programs = Array.from((data.melodyProgramCounts[lane] || new Map()).entries()).sort((a,b) => b[1] - a[1]);
      const instrument = midiProgramToMelodyInstrument(programs[0]?.[0]);
      if(instrument && melodyInstrumentIds().includes(instrument)) sectionImportInstruments[lane] = instrument;
      const pans = data.melodyPanValues[lane] || [];
      if(pans.length) sectionImportPans[lane] = clamp(pans.reduce((a,b)=>a+b, 0) / pans.length, -1, 1);
    }
    state[sectionPropKey("grid", sectionId)] = data.grid;
    state[sectionPropKey("gridTuplets", sectionId)] = data.gridTuplets;
    state[sectionPropKey("bassNotes", sectionId)] = data.bassNotes;
    state[sectionPropKey("bassHold", sectionId)] = data.bassHold;
    state[sectionPropKey("bassSlide", sectionId)] = data.bassSlide;
    state[sectionPropKey("bassAccent", sectionId)] = data.bassAccent;
    state[sectionPropKey("guitarPattern", sectionId)] = createGuitarState();
    state[sectionPropKey("melodyTracks", sectionId)] = data.melodyTracks.slice(0, importedMelodyTrackCount);
    state[sectionPropKey("melodyInstruments", sectionId)] = sectionImportInstruments;
    state[sectionPropKey("melodyOctaves", sectionId)] = data.melodyOctaves.slice(0, importedMelodyTrackCount);
    state[sectionPropKey("melodyMute", sectionId)] = blankMelodyMute(importedMelodyTrackCount);
    state[sectionPropKey("melodySolo", sectionId)] = blankMelodySolo(importedMelodyTrackCount);
    state[sectionPropKey("melodyPan", sectionId)] = sectionImportPans;
    state[sectionPropKey("melodyHold", sectionId)] = data.melodyHold.slice(0, importedMelodyTrackCount);
    state[sectionPropKey("melodySlide", sectionId)] = data.melodySlide.slice(0, importedMelodyTrackCount);
    state[sectionPropKey("melodyTuplets", sectionId)] = data.melodyTuplets.slice(0, importedMelodyTrackCount);
    if(sectionIndex < usedSectionCount){
      const rep = importPlan.representatives[sectionIndex];
      const startStepOffset = (rep?.sourceStartBar || 0) * stepsPerBar();
      const progressionImported = tryImportChordProgressionFromMidi(normalizedNotes, parsed.ticksPerQuarter, sectionId, visibleSectionSteps(sectionId), startStepOffset);
      if(progressionImported.changed) progressionSections++;
      progressionBarsUpdated += progressionImported.updated || 0;
      progressionBarsCarried += progressionImported.carried || 0;
      progressionBarsEmpty += progressionImported.empty || 0;
    } else {
      state[sectionPropKey("progression", sectionId)] = new Array(MAX_BARS).fill(null);
    }
    clearInvalidGridTuplets(sectionId);
    clearInvalidMelodyTuplets(sectionId);
  });

  state.songSequence = importPlan.songSequence.length ? importPlan.songSequence : SECTION_IDS.slice(0, usedSectionCount);
  const guitarPrograms = new Set((parsed.programChanges || []).map(ev => ev.program).filter(program => midiProgramSuggestsGuitar(program)));
  const guitarStyle = Array.from(guitarPrograms).some(program => midiProgramSuggestsDistortedGuitar(program)) ? "chug" : "sparse_strum";
  let guitarGeneratedSections = 0;
  if(guitarPrograms.size){
    SECTION_IDS.slice(0, usedSectionCount).forEach(sectionId => {
      const progression = state[sectionPropKey("progression", sectionId)] || [];
      if(!progression.some(Boolean)) return;
      const pattern = buildGeneratedGuitarPattern(sectionId, guitarStyle);
      const barSteps = stepsPerBar();
      progression.forEach((chord, bar) => {
        if(chord) return;
        const start = bar * barSteps;
        for(let step = start; step < Math.min(pattern.length, start + barSteps); step++) pattern[step] = "off";
      });
      state[sectionPropKey("guitarPattern", sectionId)] = ensureGuitarPatternLength(pattern);
      guitarGeneratedSections++;
    });
  }
  state.guitarEnabled = guitarGeneratedSections > 0;
  if(guitarGeneratedSections){
    state.guitarPatternPreset = guitarStyle;
    state.guitarTone = guitarStyle === "chug" ? "high_gain" : "clean";
  }
  state.activeMelodyTrack = 0;
  syncSection();
  renderAll();

  const timeSigNote = timeSig
    ? (timeSig.numerator === state.timeSig && timeSig.denominator === 4 ? `Time signature: ${foundTimeSigLabel}.` : `Time signature: ${foundTimeSigLabel} found; using ${state.timeSig}/4.`)
    : `Time signature: not found in MIDI; using ${state.timeSig}/4.`;
  const phraseNote = importPlan.chunkCount > usedSectionCount
    ? `Stored ${usedSectionCount} representative 4-bar section${usedSectionCount === 1 ? "" : "s"} from ${importPlan.chunkCount} source phrase${importPlan.chunkCount === 1 ? "" : "s"}; song sequence has ${state.songSequence.length} slot${state.songSequence.length === 1 ? "" : "s"}.`
    : `Imported ${importBars} bar${importBars === 1 ? "" : "s"} into ${state.songSequence.join("-")}.`;
  const approximationNote = importPlan.approximatedChunks ? ` Warning: ${importPlan.approximatedChunks} source phrase${importPlan.approximatedChunks === 1 ? "" : "s"} exceeded the 8-section limit and were mapped to the closest stored section.` : "";
  const collapseNote = melodyCollapsed ? ` Melody notes collapsed beyond available tracks: ${melodyCollapsed}.` : " Melody notes collapsed beyond available tracks: 0.";
  const trimNote = timing.leadingTrimBars ? `Trimmed ${timing.leadingTrimBars} pre-roll bar${timing.leadingTrimBars === 1 ? "" : "s"}.` : "No pre-roll trim.";
  const resolutionNote = importResolution !== previousResolution ? `Resolution auto-set to ${importResolution}×.` : `Resolution kept at ${importResolution}×.`;
  const sourceBarsNote = `Approx source bars after trim: ${estimatedBars}.`;
  const sourceCountNote = `Source note pairs analysed: ${parsed.notes.length}. Notes within import window: ${notesWithinImportWindow}. Notes beyond arrangement capacity: ${notesBeyondArrangementCapacity}.`;
  const reuseNote = notesRepresentedByPhraseReuse ? ` Notes represented by songSequence phrase reuse rather than direct section storage: ${notesRepresentedByPhraseReuse}.` : "";
  const drumNote = `Drum MIDI hits mapped: ${drumImported}. Drum MIDI hits skipped: ${drumSkipped}. Drum grid cells written: ${drumCellKeys.size}. Drum hits merged by same lane/step: ${drumCellsMerged}.`;
  const bassNote = `Bass notes written: ${bassImported}. Melody notes written: ${melodyImported} across ${importedMelodyTrackCount} track${importedMelodyTrackCount === 1 ? "" : "s"}.`;
  const guideNote = timing.ignoredGuideNotes ? `Ignored ${timing.ignoredGuideNotes} guide/near-silent notes.` : "No guide/near-silent notes ignored.";
  const keyMeta = firstMidiEvent(parsed.keySignatures || []);
  const channelMeta = midiChannelProgramSummary(parsed);
  const bendMeta = midiPitchBendSummary(parsed);
  const metadataNote = `Metadata: ${keyMeta ? "key signature used" : "key inferred"} (${state.key} ${state.scale}); lyrics ${parsed.lyrics?.length || 0}; program changes ${parsed.programChanges?.length || 0}${channelMeta ? ` (${channelMeta})` : ""}; pitch bends ${parsed.pitchBends?.length || 0}${bendMeta ? ` ignored by channel (${bendMeta})` : " ignored"}; CCs ${parsed.controlChanges?.length || 0}; SysEx ${parsed.sysexCount || 0}.`;
  const chordNote = progressionSections
    ? `Chords: sections updated ${progressionSections}; chord bars detected ${progressionBarsUpdated}; chord bars blank due no harmonic material ${progressionBarsEmpty}; chord bars filled from carry-forward/inference ${progressionBarsCarried}.`
    : `Chords: no harmonic bars detected; chord bars blank due no harmonic material ${progressionBarsEmpty}; chord bars filled from carry-forward/inference 0.`;
  const guitarNote = guitarGeneratedSections ? `Guitar: generated conservative ${guitarStyle.replace("_", " ")} accompaniment in ${guitarGeneratedSections} section${guitarGeneratedSections === 1 ? "" : "s"}.` : "Guitar: not generated; no guitar-program channels with detected section chords.";
  const summary = `Imported ${fileName}. BPM: ${foundBpm ? foundBpm + (foundBpm !== state.bpm ? " -> " + state.bpm : "") : "not found, kept " + state.bpm}. ${timeSigNote} ${trimNote} ${resolutionNote} ${sourceBarsNote} Format: ${parsed.format}. Tracks read: ${parsed.tracksRead}/${parsed.trackCount}. ${phraseNote} ${sourceCountNote}${reuseNote} Notes imported into stored sections: ${imported}. Skipped from direct section storage: ${skipped}. ${drumNote} ${bassNote}${collapseNote} ${guideNote} ${metadataNote} ${chordNote} ${guitarNote}${approximationNote}`;
  setMidiImportSummary(summary);
  markProjectDirty();
  setStatus(summary);
}

async function importMidiFile(file){
  if(!file) return;
  try{
    if(state.uiMode !== "advanced"){
      setStatus("Switch to Advanced mode to import MIDI");
      setMidiImportSummary("MIDI import is available in Advanced mode only.");
      return;
    }
    if(Number(file.size) > MIDI_IMPORT_MAX_BYTES) throw new RangeError(`MIDI file exceeds the ${MIDI_IMPORT_MAX_BYTES / (1024 * 1024)} MiB import limit`);
    setStatus("Importing MIDI...");
    const buffer = await file.arrayBuffer();
    const parsed = parseStandardMidi(buffer);
    importParsedMidiToProject(parsed, file.name || "MIDI");
  }catch(e){
    console.error(e);
    const msg = e && e.message ? e.message : "MIDI import failed";
    setMidiImportSummary(`MIDI import failed: ${msg}`);
    setStatus(`MIDI import failed: ${msg}`);
  }finally{
    if(els.midiImportInput) els.midiImportInput.value = "";
  }
}
