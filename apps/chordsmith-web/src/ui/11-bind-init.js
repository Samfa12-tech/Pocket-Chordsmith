function renderAll(){
  if(state.uiMode === "simple"){
    state.melodyInputMode = "grid";
    state.activeMelodyTrack = 0;
  }
  applyTheme(); applyUiMode();
  updateMelodyInputModeUI();
  els.resolutionLabel.textContent = `Resolution: ${displayedResolutionName()}`;
  els.resolutionSelect.value = String(state.resolution);
  if(els.melodyPitchModeSelect) els.melodyPitchModeSelect.value = state.melodyPitchMode;
  if(els.midiExportModeSelect) els.midiExportModeSelect.value = state.midiExportMode;
  if(els.midiChordExportSelect) els.midiChordExportSelect.value = state.midiChordExport;
  if(els.midiExactDurationsToggle) els.midiExactDurationsToggle.checked = !!state.midiExactDurations;
  if(els.keySelect) els.keySelect.value = state.key;
  if(els.scaleSelect) els.scaleSelect.value = state.scale;
  els.uiModeSelect.value = state.uiMode; els.themeSelect.value = state.theme; if(els.bassModeSelect) els.bassModeSelect.value = state.bassMode;
  if(els.melodyInputModeSelect) els.melodyInputModeSelect.value = state.melodyInputMode;
  if(els.xyPlaybackModeSelect) els.xyPlaybackModeSelect.value = state.xyPlaybackMode || "sustain";
  updateXYPadModeOptions();
  if(els.xyScaleModeSelect) els.xyScaleModeSelect.value = state.xyScaleMode || "song";
  if(els.xyChordFollowToggle) els.xyChordFollowToggle.checked = state.xyChordFollow !== false;
  if(els.xyRecordToggle) els.xyRecordToggle.checked = !!state.xyRecordToGrid;
  if(els.chordInstrumentSelect) els.chordInstrumentSelect.value = state.chordInstrument || "pocket";
  els.chordOctaveSelect.value = String(state.chordOctave); els.chordPlayModeSelect.value = state.chordPlayMode; els.chordRhythmModeSelect.value = state.chordRhythmMode;
  if(els.fxDelay) els.fxDelay.value = String(state.fxDelay ?? 0.12);
  if(els.fxChorus) els.fxChorus.value = String(state.fxChorus ?? 0.18);
  if(els.fxFlanger) els.fxFlanger.value = String(state.fxFlanger ?? 0.06);
  if(els.fxReverb) els.fxReverb.value = String(state.fxReverb ?? 0.18);
  if(els.fxMix) els.fxMix.value = String(state.fxMix ?? 0.65);
  if(els.lofiPresetSelect) els.lofiPresetSelect.value = state.lofiPreset || "";
  if(els.drumKitSelect) els.drumKitSelect.value = state.drumKit || "classic";
  if(els.bassToneSelect) els.bassToneSelect.value = state.bassTone || "classic";
  if(els.lofiTextureToggle) els.lofiTextureToggle.checked = !!state.lofiTexture?.enabled;
  if(els.lofiVinylCrackle) els.lofiVinylCrackle.value = String(state.lofiTexture?.vinylCrackle ?? DEFAULT_LOFI_TEXTURE.vinylCrackle);
  if(els.lofiTapeHiss) els.lofiTapeHiss.value = String(state.lofiTexture?.tapeHiss ?? DEFAULT_LOFI_TEXTURE.tapeHiss);
  if(els.lofiWowFlutter) els.lofiWowFlutter.value = String(state.lofiTexture?.wowFlutter ?? DEFAULT_LOFI_TEXTURE.wowFlutter);
  if(els.lofiWarmth) els.lofiWarmth.value = String(state.lofiTexture?.warmth ?? DEFAULT_LOFI_TEXTURE.warmth);
  if(els.lofiLowPassAge) els.lofiLowPassAge.value = String(state.lofiTexture?.lowPassAge ?? DEFAULT_LOFI_TEXTURE.lowPassAge);
  if(els.lofiBitCrush) els.lofiBitCrush.value = String(state.lofiTexture?.bitCrush ?? DEFAULT_LOFI_TEXTURE.bitCrush);
  if(els.chipPresetSelect) els.chipPresetSelect.value = state.chipPreset || "";
  if(els.chipDrumKitSelect) els.chipDrumKitSelect.value = chipDrumKitIds().includes(state.drumKit) ? state.drumKit : "chip_noise_kit";
  if(els.chipBassToneSelect) els.chipBassToneSelect.value = chipBassToneIds().includes(state.bassTone) ? state.bassTone : "chip_triangle_bass";
  if(els.chipTextureToggle) els.chipTextureToggle.checked = !!state.chipTexture?.enabled;
  if(els.chipBitDepth) els.chipBitDepth.value = String(state.chipTexture?.bitDepth ?? DEFAULT_CHIP_TEXTURE.bitDepth);
  if(els.chipSampleRateCrush) els.chipSampleRateCrush.value = String(state.chipTexture?.sampleRateCrush ?? DEFAULT_CHIP_TEXTURE.sampleRateCrush);
  if(els.chipPulseWidth) els.chipPulseWidth.value = String(state.chipTexture?.pulseWidth ?? DEFAULT_CHIP_TEXTURE.pulseWidth);
  if(els.chipPitchDrift) els.chipPitchDrift.value = String(state.chipTexture?.pitchDrift ?? DEFAULT_CHIP_TEXTURE.pitchDrift);
  if(els.chipSaturation) els.chipSaturation.value = String(state.chipTexture?.saturation ?? DEFAULT_CHIP_TEXTURE.saturation);
  if(els.chipStereoSpread) els.chipStereoSpread.value = String(state.chipTexture?.stereoSpread ?? DEFAULT_CHIP_TEXTURE.stereoSpread);
  if(els.metalPresetSelect) els.metalPresetSelect.value = state.metalPreset || "";
  if(els.metalDrumKitSelect) els.metalDrumKitSelect.value = metalDrumKitIds().includes(state.drumKit) ? state.drumKit : "metal_tight";
  if(els.metalBassToneSelect) els.metalBassToneSelect.value = metalBassToneIds().includes(state.bassTone) ? state.bassTone : "metal_pick_bass";
  if(els.metalTextureToggle) els.metalTextureToggle.checked = !!state.metalTexture?.enabled;
  if(els.metalDrive) els.metalDrive.value = String(state.metalTexture?.drive ?? DEFAULT_METAL_TEXTURE.drive);
  if(els.metalPalmMute) els.metalPalmMute.value = String(state.metalTexture?.palmMute ?? DEFAULT_METAL_TEXTURE.palmMute);
  if(els.metalLowTightness) els.metalLowTightness.value = String(state.metalTexture?.lowTightness ?? DEFAULT_METAL_TEXTURE.lowTightness);
  if(els.metalPresence) els.metalPresence.value = String(state.metalTexture?.presence ?? DEFAULT_METAL_TEXTURE.presence);
  if(els.metalRoomSize) els.metalRoomSize.value = String(state.metalTexture?.roomSize ?? DEFAULT_METAL_TEXTURE.roomSize);
  if(els.metalPickAttack) els.metalPickAttack.value = String(state.metalTexture?.pickAttack ?? DEFAULT_METAL_TEXTURE.pickAttack);
  renderGenreDrawer();
  if(els.showMelodyPadsToggle) els.showMelodyPadsToggle.checked = !!state.showMelodyPads;
  if(els.showDrumPadsToggle) els.showDrumPadsToggle.checked = !!state.showDrumPads;
  if(els.drumRecordToggle) els.drumRecordToggle.checked = !!state.drumRecordToGrid;
  if(els.metronomeToggle) els.metronomeToggle.checked = !!state.metronomeOn;
  if(els.chordsToggle) els.chordsToggle.checked = !!state.chordsOn;
  if(els.bassToggle) els.bassToggle.checked = !!state.bassOn;
  if(els.guitarEnabledToggle) els.guitarEnabledToggle.checked = !!state.guitarEnabled;
  if(els.guitarEnabledToggleSettings) els.guitarEnabledToggleSettings.checked = !!state.guitarEnabled;
  if(els.showMelodyPickerToggle) els.showMelodyPickerToggle.checked = !!state.showMelodyPicker;
  if(els.showTrackControlsToggle) els.showTrackControlsToggle.checked = !!state.showTrackControls;
  if(els.humanizeToggle) els.humanizeToggle.checked = !!state.humanizeOn;
  if(els.sidechainToggle) els.sidechainToggle.checked = !!state.sidechainOn;
  if(els.sidechainAmount) els.sidechainAmount.value = String(state.sidechainAmount ?? 0.45);
  if(els.bassModeSelect) els.bassModeSelect.value = state.bassMode;
  if(els.bassArticulationSelect) els.bassArticulationSelect.value = state.bassEditArticulation || "finger";
  if(els.projectSchemaSelect) els.projectSchemaSelect.value = String(state.exportSchemaVersion || PROJECT_SCHEMA_VERSION);
  els.tooltipsToggle.checked = state.tooltipsOn;
  renderProgression(); renderChordPalette(); renderDrumPresetChips(); renderSeq(); renderGuitarPanel(); renderTrackChips(); renderSectionChips(); renderSectionSequence();
  if(els.sectionBarsSelect) els.sectionBarsSelect.value = String(sectionBarCount());
  if(els.copyTargetSectionSelect){
    const target = els.copyTargetSectionSelect.value;
    if(!SECTION_IDS.includes(target) || target === state.currentSection){
      els.copyTargetSectionSelect.value = SECTION_IDS.find(id => id !== state.currentSection) || state.currentSection;
    }
  }
  if(!state.melodyTracks.length) state.melodyTracks = blankMelodyTracks(1);
  state.melodyInstruments = ensureMelodyInstrumentsLength(state.melodyInstruments, state.melodyTracks.length);
  state.melodyMute = ensureMelodyBoolLength(state.melodyMute, state.melodyTracks.length);
  state.melodySolo = ensureMelodyBoolLength(state.melodySolo, state.melodyTracks.length);
  state.melodyPan = ensureMelodyPanLength(state.melodyPan, state.melodyTracks.length);
  state.activeMelodyTrack = state.uiMode === "simple" ? 0 : Math.max(0, Math.min(state.activeMelodyTrack, state.melodyTracks.length - 1));
  renderMelodySelect();
  renderMelodyRows();
  if(state.uiMode === "advanced"){
    renderPads(); renderDrumPads(); renderMelodyDegreeChips(); renderMelodyOctaveChips(); renderMelodyTrackChips(); renderMelodyTrackControls(); renderMelodyInstrumentSelect();
  }
  applyAdvancedVisibility();
  if(audioCtx) updateFx();
  applyTooltips();
  toggleSettings(state.settingsOpen);
  updateTransportButtonLabels();
  updateMiniTransport();
  state.lastHighlightedStep = state.currentStep;
}

function bindControls(){
  bindHorizontalWheelScroll();
  els.playBtn.addEventListener("click", ()=>togglePlay("section"));
  if(els.playSequenceBtn) els.playSequenceBtn.addEventListener("click", ()=>togglePlay("sequence"));
  if(els.miniPlayBtn) els.miniPlayBtn.addEventListener("click", ()=>togglePlay(state.playbackMode === "sequence" && state.isPlaying ? "sequence" : "section"));
  els.stopBtn.addEventListener("click", stopPlayback);
  if(els.miniStopBtn) els.miniStopBtn.addEventListener("click", stopPlayback);
  els.demoBtn.addEventListener("click", ()=>{ pushUndoState(); loadDemo(); });
  els.undoBtn.addEventListener("click", undoLastChange);
  if(els.miniUndoBtn) els.miniUndoBtn.addEventListener("click", undoLastChange);
  if(els.randomIdeaBtn){
    els.randomIdeaBtn.dataset.tip = "Pick a random key and a curated chord pattern for the current section.";
    els.randomIdeaBtn.addEventListener("click", applyRandomIdea);
  }
  if(els.lofiChillBtn){
    els.lofiChillBtn.dataset.tip = "Compose a complete, sectioned lofi song. Use a fixed seed in Genre Studio to reproduce a variation.";
    els.lofiChillBtn.addEventListener("click", () => composeGenreSong("lofi"));
  }
  if(els.lofiGameLoopBtn){
    els.lofiGameLoopBtn.dataset.tip = "Generate an A/B/C/D lofi game loop with adaptive sections.";
    els.lofiGameLoopBtn.addEventListener("click", () => composeGenreSong("lofi",{archetype:selectedGenreArchetype("lofi"),mode:"game-loop"}));
  }
  if(els.chipTuneBtn){
    els.chipTuneBtn.dataset.tip = "Compose a complete chiptune with constrained pulse, triangle-bass, and noise-drum roles.";
    els.chipTuneBtn.addEventListener("click", () => composeGenreSong("chip"));
  }
  if(els.chipGameLoopBtn){
    els.chipGameLoopBtn.dataset.tip = "Generate an A/B/C/D chip tune game loop with harmonised leads.";
    els.chipGameLoopBtn.addEventListener("click", () => composeGenreSong("chip",{archetype:selectedGenreArchetype("chip"),mode:"game-loop"}));
  }
  if(els.metalChugBtn){
    els.metalChugBtn.dataset.tip = "Compose a complete metal song with riff-led sections, coordinated kick/bass/guitar, transitions, and an ending.";
    els.metalChugBtn.addEventListener("click", () => composeGenreSong("metal"));
  }
  if(els.metalGameLoopBtn){
    els.metalGameLoopBtn.dataset.tip = "Generate an A/B/C/D metal game loop with riff, breakdown, and lead sections.";
    els.metalGameLoopBtn.addEventListener("click", () => composeGenreSong("metal",{archetype:selectedGenreArchetype("metal"),mode:"game-loop"}));
  }
  if(els.westernTrailBtn) els.westernTrailBtn.addEventListener("click",()=>composeGenreSong("western"));
  if(els.funkGrooveBtn) els.funkGrooveBtn.addEventListener("click",()=>composeGenreSong("funk"));
  if(els.funkGameLoopBtn) els.funkGameLoopBtn.addEventListener("click",()=>composeGenreSong("funk",{archetype:selectedGenreArchetype("funk"),mode:"game-loop"}));
  if(els.genreDrawerBtn) els.genreDrawerBtn.addEventListener("click", () => {
    if(state.settingsGenreDrawerOpen) closeGenreDrawer();
    else openGenreDrawer(detectActiveGenre());
  });
  if(els.closeGenreDrawerBtn) els.closeGenreDrawerBtn.addEventListener("click", closeGenreDrawer);
  document.querySelectorAll(".genre-tab").forEach(tab => {
    tab.addEventListener("click", () => selectSettingsGenre(tab.dataset.genre));
    tab.addEventListener("keydown", event => {
      const tabs = Array.from(document.querySelectorAll(".genre-tab"));
      const current = tabs.indexOf(tab);
      let next = current;
      if(event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
      else if(event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
      else if(event.key === "Home") next = 0;
      else if(event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectSettingsGenre(tabs[next].dataset.genre);
      tabs[next].focus({preventScroll:true});
    });
  });
  if(els.cleanGenreBtn) els.cleanGenreBtn.addEventListener("click", applyCleanGenreToProject);
  if(els.lofiApplyIdeaBtn) els.lofiApplyIdeaBtn.addEventListener("click", () => {
    applyLofiPresetToProject(sanitizeLofiPresetId(els.lofiPresetSelect?.value) || state.lofiPreset || "lofi_study_room", {fullLoop:false});
  });
  if(els.lofiApplyLoopBtn) els.lofiApplyLoopBtn.addEventListener("click", () => {
    composeGenreSong("lofi",{archetype:selectedGenreArchetype("lofi"),mode:"game-loop"});
  });
  if(els.chipApplyIdeaBtn) els.chipApplyIdeaBtn.addEventListener("click", () => {
    applyChipPresetToProject(sanitizeChipPresetId(els.chipPresetSelect?.value) || state.chipPreset || "chip_arcade_start", {fullLoop:false});
  });
  if(els.chipApplyLoopBtn) els.chipApplyLoopBtn.addEventListener("click", () => {
    composeGenreSong("chip",{archetype:selectedGenreArchetype("chip"),mode:"game-loop"});
  });
  if(els.metalApplyIdeaBtn) els.metalApplyIdeaBtn.addEventListener("click", () => {
    applyMetalPresetToProject(sanitizeMetalPresetId(els.metalPresetSelect?.value) || state.metalPreset || "metal_classic_chug", {fullLoop:false});
  });
  if(els.metalApplyLoopBtn) els.metalApplyLoopBtn.addEventListener("click", () => {
    composeGenreSong("metal",{archetype:selectedGenreArchetype("metal"),mode:"game-loop"});
  });
  if(els.westernPresetSelect) els.westernPresetSelect.addEventListener("change", () => {
    const value = sanitizeWesternPresetId(els.westernPresetSelect.value) || "western_frontier_ride";
    applyWesternPresetToProject(value, {fullLoop:false});
  });
  if(els.westernApplyIdeaBtn) els.westernApplyIdeaBtn.addEventListener("click", () => {
    applyWesternPresetToProject(sanitizeWesternPresetId(els.westernPresetSelect?.value) || state.westernPreset || "western_frontier_ride", {fullLoop:false});
  });
  if(els.westernApplyLoopBtn) els.westernApplyLoopBtn.addEventListener("click", () => {
    composeGenreSong("western",{archetype:selectedGenreArchetype("western"),mode:"game-loop"});
  });
  if(els.westernDrumPresetSelect) els.westernDrumPresetSelect.addEventListener("change", () => {
    pushUndoState();
    const preset = safeChoice(els.westernDrumPresetSelect.value, ["boom_chick","train_beat","cowboy_waltz"], "boom_chick");
    state.drumGroovePreset = preset;
    fillDrumPresetForSection(preset, state.currentSection);
    markProjectDirty();
    renderAll();
    setStatus(`Western drums: ${els.westernDrumPresetSelect.options[els.westernDrumPresetSelect.selectedIndex].text}`);
  });
  if(els.westernGuitarPresetSelect) els.westernGuitarPresetSelect.addEventListener("change", () => {
    pushUndoState();
    const preset = safeChoice(els.westernGuitarPresetSelect.value, ["boom_chick","train_chop","western_waltz"], "boom_chick");
    state.guitarEnabled = true;
    state.guitarTone = "western_twang";
    applyGuitarPreset(preset, state.currentSection);
    markProjectDirty();
    renderAll();
    setStatus(`Western guitar: ${els.westernGuitarPresetSelect.options[els.westernGuitarPresetSelect.selectedIndex].text}`);
  });
  if(els.funkPresetSelect) els.funkPresetSelect.addEventListener("change",()=>applyFunkPresetToProject(els.funkPresetSelect.value,{fullLoop:false}));
  if(els.funkApplyIdeaBtn) els.funkApplyIdeaBtn.addEventListener("click",()=>applyFunkPresetToProject(els.funkPresetSelect?.value || "funk_classic_pocket",{fullLoop:false}));
  if(els.funkApplyLoopBtn) els.funkApplyLoopBtn.addEventListener("click",()=>composeGenreSong("funk",{archetype:selectedGenreArchetype("funk"),mode:"game-loop"}));
  [["lofi","lofiApplyProfileBtn","lofiComposeSongBtn"],["chip","chipApplyProfileBtn","chipComposeSongBtn"],["metal","metalApplyProfileBtn","metalComposeSongBtn"],["western","westernApplyProfileBtn","westernComposeSongBtn"],["funk","funkApplyProfileBtn","funkComposeSongBtn"]].forEach(([genre,profileId,composeId]) => {
    if(els[profileId]) els[profileId].addEventListener("click",()=>applyGenreSoundProfileOnly(genre));
    if(els[composeId]) els[composeId].addEventListener("click",()=>composeGenreSong(genre,{archetype:selectedGenreArchetype(genre)}));
  });
  const updateFunkParameters = () => { state.funkParameters=sanitizeFunkParameters({pocket:els.funkPocket?.value,slapAmount:els.funkSlap?.value,ghostNotes:els.funkGhost?.value}); state.audioProfile=FUNK_AUDIO_PROFILE_ID; if(!state.funkPreset) state.funkPreset="funk_classic_pocket"; markProjectDirty(); };
  ["funkPocket","funkSlap","funkGhost"].forEach(id=>{ if(els[id]) els[id].addEventListener("input",updateFunkParameters); });
  if(els.lofiPresetSelect) els.lofiPresetSelect.addEventListener("change", () => {
    const value = sanitizeLofiPresetId(els.lofiPresetSelect.value);
    if(value){
      applyLofiPresetToProject(value, {fullLoop:false});
      return;
    }
    pushUndoState();
    state.audioProfile = "standard";
    state.lofiPreset = "";
    state.lofiTexture = {...DEFAULT_LOFI_TEXTURE, enabled:false};
    state.drumKit = "classic";
    state.drumGroovePreset = "";
    state.bassTone = "classic";
    state.settingsGenre = "clean";
    markProjectDirty();
    renderAll();
    setStatus("Lofi profile off; clean project settings restored");
  });
  if(els.chipPresetSelect) els.chipPresetSelect.addEventListener("change", () => {
    const value = sanitizeChipPresetId(els.chipPresetSelect.value);
    if(value){
      applyChipPresetToProject(value, {fullLoop:false});
      return;
    }
    pushUndoState();
    state.audioProfile = "standard";
    state.chipPreset = "";
    state.chipTexture = {...DEFAULT_CHIP_TEXTURE, enabled:false};
    state.drumKit = "classic";
    state.drumGroovePreset = "";
    state.bassTone = "classic";
    state.settingsGenre = "clean";
    markProjectDirty();
    renderAll();
    setStatus("Chip tune profile off; clean project settings restored");
  });
  if(els.metalPresetSelect) els.metalPresetSelect.addEventListener("change", () => {
    const value = sanitizeMetalPresetId(els.metalPresetSelect.value);
    if(value){
      applyMetalPresetToProject(value, {fullLoop:false});
      return;
    }
    pushUndoState();
    state.audioProfile = "standard";
    state.metalPreset = "";
    state.metalTexture = {...DEFAULT_METAL_TEXTURE, enabled:false};
    state.drumKit = "classic";
    state.drumGroovePreset = "";
    state.bassTone = "classic";
    state.settingsGenre = "clean";
    markProjectDirty();
    renderAll();
    setStatus("Heavy metal profile off; clean project settings restored");
  });
  if(els.drumKitSelect) els.drumKitSelect.addEventListener("change", () => {
    pushUndoState();
    state.drumKit = safeChoice(els.drumKitSelect.value, lofiDrumKitIds(), "classic");
    if(state.drumKit !== "classic") state.audioProfile = LOFI_AUDIO_PROFILE_ID;
    markProjectDirty();
    setStatus(`Drum kit: ${els.drumKitSelect.options[els.drumKitSelect.selectedIndex].text}`);
  });
  if(els.bassToneSelect) els.bassToneSelect.addEventListener("change", () => {
    pushUndoState();
    state.bassTone = safeChoice(els.bassToneSelect.value, lofiBassToneIds(), "classic");
    if(state.bassTone !== "classic") state.audioProfile = LOFI_AUDIO_PROFILE_ID;
    markProjectDirty();
    setStatus(`Bass tone: ${els.bassToneSelect.options[els.bassToneSelect.selectedIndex].text}`);
  });
  if(els.chipDrumKitSelect) els.chipDrumKitSelect.addEventListener("change", () => {
    pushUndoState();
    state.drumKit = safeChoice(els.chipDrumKitSelect.value, chipDrumKitIds(), "chip_noise_kit");
    state.audioProfile = CHIP_AUDIO_PROFILE_ID;
    if(!state.chipPreset) state.chipPreset = "chip_arcade_start";
    state.lofiPreset = "";
    markProjectDirty();
    renderAll();
    setStatus(`Chip drums: ${els.chipDrumKitSelect.options[els.chipDrumKitSelect.selectedIndex].text}`);
  });
  if(els.chipBassToneSelect) els.chipBassToneSelect.addEventListener("change", () => {
    pushUndoState();
    state.bassTone = safeChoice(els.chipBassToneSelect.value, chipBassToneIds(), "chip_triangle_bass");
    state.audioProfile = CHIP_AUDIO_PROFILE_ID;
    if(!state.chipPreset) state.chipPreset = "chip_arcade_start";
    state.lofiPreset = "";
    markProjectDirty();
    renderAll();
    setStatus(`Chip bass: ${els.chipBassToneSelect.options[els.chipBassToneSelect.selectedIndex].text}`);
  });
  if(els.metalDrumKitSelect) els.metalDrumKitSelect.addEventListener("change", () => {
    pushUndoState();
    state.drumKit = safeChoice(els.metalDrumKitSelect.value, metalDrumKitIds(), "metal_tight");
    state.audioProfile = HEAVY_METAL_AUDIO_PROFILE_ID;
    if(!state.metalPreset) state.metalPreset = "metal_classic_chug";
    state.lofiPreset = "";
    state.chipPreset = "";
    markProjectDirty();
    renderAll();
    setStatus(`Metal drums: ${els.metalDrumKitSelect.options[els.metalDrumKitSelect.selectedIndex].text}`);
  });
  if(els.metalBassToneSelect) els.metalBassToneSelect.addEventListener("change", () => {
    pushUndoState();
    state.bassTone = safeChoice(els.metalBassToneSelect.value, metalBassToneIds(), "metal_pick_bass");
    state.audioProfile = HEAVY_METAL_AUDIO_PROFILE_ID;
    if(!state.metalPreset) state.metalPreset = "metal_classic_chug";
    state.lofiPreset = "";
    state.chipPreset = "";
    markProjectDirty();
    renderAll();
    setStatus(`Metal bass: ${els.metalBassToneSelect.options[els.metalBassToneSelect.selectedIndex].text}`);
  });
  const updateLofiTextureControls = (mark=true) => {
    state.lofiTexture = sanitizeLofiTexture({
      enabled: !!els.lofiTextureToggle?.checked,
      vinylCrackle: els.lofiVinylCrackle?.value,
      tapeHiss: els.lofiTapeHiss?.value,
      wowFlutter: els.lofiWowFlutter?.value,
      warmth: els.lofiWarmth?.value,
      lowPassAge: els.lofiLowPassAge?.value,
      bitCrush: els.lofiBitCrush?.value
    }, state.lofiPreset);
    if(state.lofiTexture.enabled){
      state.audioProfile = LOFI_AUDIO_PROFILE_ID;
      if(!state.lofiPreset) state.lofiPreset = "lofi_study_room";
    }
    if(mark) markProjectDirty();
  };
  if(els.lofiTextureToggle) els.lofiTextureToggle.addEventListener("change", () => {
    pushUndoState();
    updateLofiTextureControls(true);
    renderAll();
    setStatus(state.lofiTexture.enabled ? "Lofi texture on" : "Lofi texture off");
  });
  ["lofiVinylCrackle","lofiTapeHiss","lofiWowFlutter","lofiWarmth","lofiLowPassAge","lofiBitCrush"].forEach(id => {
    if(els[id]) els[id].addEventListener("input", () => {
      updateLofiTextureControls(true);
      if(els.lofiTextureToggle && !els.lofiTextureToggle.checked){
        state.lofiTexture.enabled = false;
      }
    });
  });
  const updateChipTextureControls = (mark=true) => {
    state.chipTexture = sanitizeChipTexture({
      enabled: !!els.chipTextureToggle?.checked,
      bitDepth: els.chipBitDepth?.value,
      sampleRateCrush: els.chipSampleRateCrush?.value,
      pulseWidth: els.chipPulseWidth?.value,
      pitchDrift: els.chipPitchDrift?.value,
      saturation: els.chipSaturation?.value,
      stereoSpread: els.chipStereoSpread?.value
    }, state.chipPreset);
    if(state.chipTexture.enabled){
      state.audioProfile = CHIP_AUDIO_PROFILE_ID;
      if(!state.chipPreset) state.chipPreset = "chip_arcade_start";
      state.lofiPreset = "";
    }
    if(mark) markProjectDirty();
  };
  if(els.chipTextureToggle) els.chipTextureToggle.addEventListener("change", () => {
    pushUndoState();
    updateChipTextureControls(true);
    renderAll();
    setStatus(state.chipTexture.enabled ? "Chip texture on" : "Chip texture off");
  });
  ["chipBitDepth","chipSampleRateCrush","chipPulseWidth","chipPitchDrift","chipSaturation","chipStereoSpread"].forEach(id => {
    if(els[id]) els[id].addEventListener("input", () => {
      updateChipTextureControls(true);
      if(els.chipTextureToggle && !els.chipTextureToggle.checked){
        state.chipTexture.enabled = false;
      }
    });
  });
  const updateMetalTextureControls = (mark=true) => {
    state.metalTexture = sanitizeMetalTexture({
      enabled: !!els.metalTextureToggle?.checked,
      drive: els.metalDrive?.value,
      palmMute: els.metalPalmMute?.value,
      lowTightness: els.metalLowTightness?.value,
      presence: els.metalPresence?.value,
      roomSize: els.metalRoomSize?.value,
      pickAttack: els.metalPickAttack?.value
    }, state.metalPreset);
    if(state.metalTexture.enabled){
      state.audioProfile = HEAVY_METAL_AUDIO_PROFILE_ID;
      if(!state.metalPreset) state.metalPreset = "metal_classic_chug";
      state.lofiPreset = "";
      state.chipPreset = "";
    }
    if(mark) markProjectDirty();
  };
  if(els.metalTextureToggle) els.metalTextureToggle.addEventListener("change", () => {
    pushUndoState();
    updateMetalTextureControls(true);
    renderAll();
    setStatus(state.metalTexture.enabled ? "Metal texture on" : "Metal texture off");
  });
  ["metalDrive","metalPalmMute","metalLowTightness","metalPresence","metalRoomSize","metalPickAttack"].forEach(id => {
    if(els[id]) els[id].addEventListener("input", () => {
      updateMetalTextureControls(true);
      if(els.metalTextureToggle && !els.metalTextureToggle.checked){
        state.metalTexture.enabled = false;
      }
    });
  });
  if(els.drumPresetSelect) els.drumPresetSelect.addEventListener("change", ()=>{
    const preset = els.drumPresetSelect.value;
    if(!preset) return;
    applyDrumPreset(preset);
    if(els.drumPresetSelect) els.drumPresetSelect.value = "";
  });
  if(els.bassArticulationSelect) els.bassArticulationSelect.addEventListener("change",()=>{
    state.bassEditArticulation = safeChoice(els.bassArticulationSelect.value,BASS_ARTICULATIONS,"finger");
    setStatus(`Bass touch set to ${state.bassEditArticulation}. Tap a manual bass cell or use keys 1-8.`);
  });
  if(els.projectSchemaSelect) els.projectSchemaSelect.addEventListener("change",()=>{
    state.exportSchemaVersion = asInt(els.projectSchemaSelect.value,PROJECT_SCHEMA_VERSION);
    const canonical = exportProject({targetSchema:PROJECT_SCHEMA_VERSION});
    const report = state.exportSchemaVersion <= LEGACY_PROJECT_SCHEMA_VERSION ? projectToSchema16(canonical).lossReport.losses : [];
    state.lastCapabilityReport = report;
    if(els.projectLossReport) els.projectLossReport.textContent = report.length ? `Legacy projection: ${report.length} explicit loss or fallback entr${report.length === 1 ? "y" : "ies"}.` : state.exportSchemaVersion === 17 ? "Schema 17 preserves rich events and profile identity." : "This project is legacy-safe for schema 16.";
  });
  if(els.melodyIdeaBtn){
    els.melodyIdeaBtn.dataset.tip = "Generate a chord-aware melody on the active melody track.";
    els.melodyIdeaBtn.addEventListener("click", applyMelodyIdea);
  }
  els.settingsBtn.addEventListener("click", ()=>toggleSettings(true));
  if(els.miniSettingsBtn) els.miniSettingsBtn.addEventListener("click", ()=>toggleSettings(true));
  els.closeSettingsBtn.addEventListener("click", ()=>toggleSettings(false));
  els.settingsModal.addEventListener("click", (e)=>{
    if(e.target === els.settingsModal) toggleSettings(false);
  });
  document.addEventListener("keydown", async (e)=>{
    if(e.key === "Escape" && state.settingsOpen){
      if(state.settingsGenreDrawerOpen) closeGenreDrawer();
      else toggleSettings(false);
    }
    if(e.key === "Tab" && state.settingsOpen){
      const focusable = Array.from(els.settingsModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.disabled && el.offsetParent !== null);
      if(focusable.length){
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if(e.shiftKey && document.activeElement === first){
          e.preventDefault();
          last.focus();
        } else if(!e.shiftKey && document.activeElement === last){
          e.preventDefault();
          first.focus();
        }
      }
    }
    const targetTag = (e.target && e.target.tagName || "").toLowerCase();
    if(["input","textarea","select"].includes(targetTag) || e.repeat) return;
    if(state.uiMode !== "advanced" || !state.showDrumPads) return;
    const pad = DRUM_PADS.find(d => d.key === e.key.toLowerCase());
    if(!pad) return;
    e.preventDefault();
    await ensureAudio();
    playDrumPad(pad.id, 1);
    recordDrumPadHit(pad.id);
  });
  els.saveSlot1Btn.addEventListener("click", ()=>saveToSlot(1));
  els.loadSlot1Btn.addEventListener("click", ()=>loadFromSlot(1));
  els.saveSlot2Btn.addEventListener("click", ()=>saveToSlot(2));
  els.loadSlot2Btn.addEventListener("click", ()=>loadFromSlot(2));
  els.loadAutoBtn.addEventListener("click", ()=>loadAutoSnapshot());
  els.tooltipsToggle.addEventListener("change", ()=>{ state.tooltipsOn = els.tooltipsToggle.checked; applyTooltips(); });
  els.bpmInput.addEventListener("change", ()=>{ state.bpm = sanitizeBpm(els.bpmInput.value, 96); els.bpmInput.value = state.bpm; markProjectDirty(); updateMiniTransport(); });
  els.swingInput.addEventListener("input", ()=>{ state.swing = parseFloat(els.swingInput.value); els.swingValue.textContent = `${Math.round(state.swing*100)}%`; markProjectDirty(); });
  els.keySelect.addEventListener("change", ()=>{ pushUndoState(); state.key = els.keySelect.value; generateAvailableChords(); renderAll(); });
  els.scaleSelect.addEventListener("change", ()=>{ pushUndoState(); state.scale = els.scaleSelect.value; generateAvailableChords(); renderAll(); });
  els.timeSigSelect.addEventListener("change", ()=>{
    pushUndoState();
    state.timeSig = parseInt(els.timeSigSelect.value,10);
    applyResolutionChange(state.resolution, `Time signature changed to ${state.timeSig}/4 - playback restarted safely`);
  });
  els.uiModeSelect.addEventListener("change", ()=>{
    pushUndoState();
    const wasPlaying = !!state.isPlaying;
    const previousPlaybackMode = state.playbackMode || "section";
    const prevMode = state.uiMode;
    state.uiMode = els.uiModeSelect.value;
    syncModeState(prevMode);
    renderAll();
    if(wasPlaying){
      state.playbackMode = previousPlaybackMode;
      restartPlaybackPlanAfterStructureChange(`Mode changed to ${state.uiMode} - playback restarted with the full grid`);
    }
  });
  els.themeSelect.addEventListener("change", ()=>{ pushUndoState(); state.theme = els.themeSelect.value; applyTheme(); });
  if(els.bassModeSelect) els.bassModeSelect.addEventListener("change", ()=>{ pushUndoState(); state.bassMode = els.bassModeSelect.value; storeSection(); renderSeq(); setStatus(state.bassMode === "manual" ? "Bass set to manual mode" : "Bass set to auto root-follow"); });
  els.chordTypeSelect.addEventListener("change", ()=>{ pushUndoState(); state.chordType = els.chordTypeSelect.value; generateAvailableChords(); renderAll(); });
  els.resolutionSelect.addEventListener("change", ()=>{ pushUndoState(); applyResolutionChange(parseInt(els.resolutionSelect.value,10)); });
  els.fillFullBtn.dataset.tip = "Fill one hit per beat at the current resolution."; els.fillFullBtn.addEventListener("click", ()=>fillTrack("full"));
  els.fillHalfBtn.dataset.tip = "Fill two hits per beat within the current resolution."; els.fillHalfBtn.addEventListener("click", ()=>fillTrack("half"));
  els.fillQuarterBtn.dataset.tip = "Fill every available subdivision in the current resolution."; els.fillQuarterBtn.addEventListener("click", ()=>fillTrack("quarter"));
  els.fillTripletBtn.dataset.tip = "Adds triplet markers inside the current straight grid: three hits play in the space of every two filled cells."; els.fillTripletBtn.addEventListener("click", ()=>fillTrack("triplet"));
  els.clearTrackBtn.addEventListener("click", ()=>{ pushUndoState(); clearTrack(); });
  if(els.addMelodyTrackBtn) els.addMelodyTrackBtn.addEventListener("click", ()=>{
    if(state.melodyTracks.length >= MAX_MELODY_TRACKS){
      setStatus(`Maximum ${MAX_MELODY_TRACKS} melody tracks`);
      return;
    }
    pushUndoState();
    state.melodyTracks.push(blankMelody());
    state.melodyInstruments.push("pulse");
    state.melodyOctaves.push(0);
    state.melodyMute.push(false);
    state.melodySolo.push(false);
    state.melodyPan.push(0);
    state.melodyHold.push(new Array(totalSteps()).fill(false));
    state.melodySlide.push(new Array(totalSteps()).fill(false));
    state.melodyTuplets = ensureMelodyTupletsLength(state.melodyTuplets || [], state.melodyTracks.length);
    state.activeMelodyTrack = state.melodyTracks.length - 1;
    storeSection();
    renderAll();
    setStatus(`Added melody track ${state.activeMelodyTrack + 1}`);
  });
  if(els.removeMelodyTrackBtn) els.removeMelodyTrackBtn.addEventListener("click", ()=>{
    if(state.melodyTracks.length <= 1){
      setStatus("At least one melody track is required");
      return;
    }
    pushUndoState();
    state.melodyTracks.splice(state.activeMelodyTrack, 1);
    state.melodyInstruments.splice(state.activeMelodyTrack, 1);
    state.melodyOctaves.splice(state.activeMelodyTrack, 1);
    state.melodyMute.splice(state.activeMelodyTrack, 1);
    state.melodySolo.splice(state.activeMelodyTrack, 1);
    state.melodyPan.splice(state.activeMelodyTrack, 1);
    state.melodyHold.splice(state.activeMelodyTrack, 1);
    state.melodySlide.splice(state.activeMelodyTrack, 1);
    if(state.melodyTuplets) state.melodyTuplets.splice(state.activeMelodyTrack, 1);
    state.activeMelodyTrack = Math.max(0, Math.min(state.activeMelodyTrack, state.melodyTracks.length - 1));
    storeSection();
    renderAll();
    setStatus("Removed melody track");
  });
  if(els.chordInstrumentSelect) els.chordInstrumentSelect.addEventListener("change", async ()=>{
    pushUndoState();
    state.chordInstrument = els.chordInstrumentSelect.value;
    await previewCurrentChordSetting(`Chord sound: ${els.chordInstrumentSelect.options[els.chordInstrumentSelect.selectedIndex].text}`);
  });
  els.chordOctaveSelect.addEventListener("change", async ()=>{
    pushUndoState();
    state.chordOctave = parseInt(els.chordOctaveSelect.value, 10);
    await previewCurrentChordSetting(`Chord octave: ${els.chordOctaveSelect.options[els.chordOctaveSelect.selectedIndex].text}`);
  });
  els.chordPlayModeSelect.addEventListener("change", async ()=>{
    pushUndoState();
    state.chordPlayMode = els.chordPlayModeSelect.value;
    await previewCurrentChordSetting(`Chord style: ${els.chordPlayModeSelect.options[els.chordPlayModeSelect.selectedIndex].text}`);
  });
  els.chordRhythmModeSelect.addEventListener("change", async ()=>{
    pushUndoState();
    state.chordRhythmMode = els.chordRhythmModeSelect.value;
    await previewCurrentChordSetting(`Chord rhythm: ${els.chordRhythmModeSelect.options[els.chordRhythmModeSelect.selectedIndex].text}`);
  });
  const updateGuitarEnabled = async (enabled) => {
    pushUndoState();
    await setGuitarEnabled(enabled, true);
  };
  if(els.guitarEnabledToggle) els.guitarEnabledToggle.addEventListener("change", ()=>updateGuitarEnabled(els.guitarEnabledToggle.checked));
  if(els.guitarEnabledToggleSettings) els.guitarEnabledToggleSettings.addEventListener("change", ()=>updateGuitarEnabled(els.guitarEnabledToggleSettings.checked));
  if(els.guitarToneSelect) els.guitarToneSelect.addEventListener("change", ()=>{
    state.guitarTone = safeChoice(els.guitarToneSelect.value, guitarToneIds(), "high_gain");
    markProjectDirty();
    renderGuitarPanel();
    setStatus(`Guitar tone: ${els.guitarToneSelect.options[els.guitarToneSelect.selectedIndex].text}`);
  });
  if(els.guitarRegisterSelect) els.guitarRegisterSelect.addEventListener("change", ()=>{
    state.guitarRegister = safeChoice(els.guitarRegisterSelect.value, guitarRegisterIds(), "low");
    markProjectDirty();
    setStatus(`Guitar register: ${els.guitarRegisterSelect.options[els.guitarRegisterSelect.selectedIndex].text}`);
  });
  if(els.guitarStrumModeSelect) els.guitarStrumModeSelect.addEventListener("change", ()=>{
    state.guitarStrumMode = safeChoice(els.guitarStrumModeSelect.value, guitarStrumModeIds(), "down");
    markProjectDirty();
    setStatus(`Guitar strum: ${els.guitarStrumModeSelect.options[els.guitarStrumModeSelect.selectedIndex].text}`);
  });
  if(els.guitarVolume) els.guitarVolume.addEventListener("input", ()=>{
    state.guitarVolume = clamp(asNumber(els.guitarVolume.value, 0.66), 0, 1);
    markProjectDirty();
    if(guitarGain) guitarGain.gain.value = state.guitarVolume;
  });
  if(els.guitarFillStyleSelect) els.guitarFillStyleSelect.addEventListener("change", ()=>{
    state.guitarPatternPreset = safeChoice(els.guitarFillStyleSelect.value, GUITAR_FILL_STYLES, "gentle_strum");
    markProjectDirty();
    setStatus(`Guitar fill style: ${guitarFillStyleLabel(state.guitarPatternPreset)}`);
  });
  if(els.guitarPresetSelect) els.guitarPresetSelect.addEventListener("change", ()=>{
    const preset = safeChoice(els.guitarPresetSelect.value, guitarPatternPresetIds(), "metal_chug");
    pushUndoState();
    applyGuitarPreset(preset, state.currentSection);
    state.guitarEnabled = true;
    renderAll();
    if(els.guitarPresetSelect) els.guitarPresetSelect.value = "";
    setStatus(`Applied guitar preset: ${guitarPatternPresetLabel(preset)}`);
  });
  if(els.fillGuitarFromChordsBtn) els.fillGuitarFromChordsBtn.addEventListener("click", ()=>{
    if(guitarPatternHasAudibleData(state.currentSection) && !window.confirm(`Replace the existing guitar pattern in Section ${state.currentSection}?`)){
      setStatus("Guitar fill cancelled");
      return;
    }
    pushUndoState();
    const style = els.guitarFillStyleSelect ? els.guitarFillStyleSelect.value : "gentle_strum";
    fillGuitarFromChords(state.currentSection, style, true);
    state.guitarEnabled = true;
    syncSection();
    renderAll();
    markProjectDirty();
    setStatus(`Generated ${guitarFillStyleLabel(style)} guitar from Section ${state.currentSection} chords`);
  });
  if(els.applyGuitarAllBtn) els.applyGuitarAllBtn.addEventListener("click", ()=>{
    pushUndoState();
    fillGuitarAllSections();
  });
  if(els.clearGuitarBtn) els.clearGuitarBtn.addEventListener("click", ()=>{
    if(guitarPatternHasAudibleData(state.currentSection) && !window.confirm(`Clear the guitar pattern in Section ${state.currentSection}?`)){
      setStatus("Clear guitar cancelled");
      return;
    }
    pushUndoState();
    clearGuitarPattern(state.currentSection);
    syncSection();
    renderAll();
    markProjectDirty();
    setStatus(`Cleared guitar pattern in Section ${state.currentSection}`);
  });
  if(els.midiExportModeSelect) els.midiExportModeSelect.addEventListener("change", ()=>{ state.midiExportMode = els.midiExportModeSelect.value; markProjectDirty(); setStatus(state.midiExportMode === "quantized" ? "MIDI export set to clean quantized timing" : "MIDI export set to performance timing"); });
  if(els.midiChordExportSelect) els.midiChordExportSelect.addEventListener("change", ()=>{ state.midiChordExport = els.midiChordExportSelect.value; markProjectDirty(); setStatus(`MIDI chord export: ${state.midiChordExport}`); });
  if(els.midiExactDurationsToggle) els.midiExactDurationsToggle.addEventListener("change", ()=>{ state.midiExactDurations = els.midiExactDurationsToggle.checked; markProjectDirty(); setStatus(state.midiExactDurations ? "MIDI notes use exact grid lengths" : "MIDI notes use performance-shortened lengths"); });
  const updateMelodyDegree = () => {
    const v = parseInt(els.melodyDegreeSelect.value, 10);
    if(!Number.isNaN(v)){
      state.selectedMelodyDegree = clamp(v, 0, melodyNoteCount() - 1);
      renderMelodyDegreeChips();
      setStatus(`Melody note selected: ${selectedMelodyLabel()}`);
    }
  };
  els.melodyDegreeSelect.addEventListener("change", updateMelodyDegree);
  els.melodyDegreeSelect.addEventListener("input", updateMelodyDegree);
  if(els.melodyInstrumentSelect) els.melodyInstrumentSelect.addEventListener("change", ()=>{
    pushUndoState();
    state.melodyInstruments[state.activeMelodyTrack] = els.melodyInstrumentSelect.value;
    storeSection();
    renderPads();
    setStatus(`Melody track ${state.activeMelodyTrack + 1} instrument: ${els.melodyInstrumentSelect.value}`);
  });
  if(els.melodyPitchModeSelect) els.melodyPitchModeSelect.addEventListener("change", ()=>{
    pushUndoState();
    state.melodyPitchMode = els.melodyPitchModeSelect.value;
    state.selectedMelodyDegree = clamp(asInt(state.selectedMelodyDegree, 0), 0, melodyNoteCount() - 1);
    renderMelodySelect();
    renderMelodyDegreeChips();
    renderPads();
    renderMelodyRows();
    setStatus(state.melodyPitchMode === "chromatic" ? "Melody picker set to chromatic/free-note mode" : "Melody picker set to scale-note mode");
  });
  if(els.melodyInputModeSelect) els.melodyInputModeSelect.addEventListener("change", ()=>{
    state.melodyInputMode = els.melodyInputModeSelect.value;
    markProjectDirty();
    if(state.melodyInputMode !== "xy") resetTransientUi({keepStepHighlight:true});
    updateMelodyInputModeUI();
  });
  if(els.xyPlaybackModeSelect) els.xyPlaybackModeSelect.addEventListener("change", ()=>{
    state.xyPlaybackMode = els.xyPlaybackModeSelect.value;
    markProjectDirty();
    if(state.xyPlaybackMode === "sustain" && state.xyPadMode === "rate") state.xyPadMode = "frequency";
    if(state.xyPlaybackMode === "sustain" && !["frequency","sustain"].includes(state.xyPadMode)) state.xyPadMode = "frequency";
    updateXYPadModeOptions();
    setStatus(state.xyPlaybackMode === "pulse" ? "X-Y pad set to pulse in time with the music" : "X-Y pad set to sustain mode");
  });
  if(els.xyPadModeSelect) els.xyPadModeSelect.addEventListener("change", ()=>{
    state.xyPadMode = els.xyPadModeSelect.value;
    markProjectDirty();
    updateXYPadModeOptions();
    if(els.xyPadReadout) els.xyPadReadout.textContent = `Y = ${state.xyPadMode}`;
  });
  if(els.xyScaleModeSelect) els.xyScaleModeSelect.addEventListener("change", ()=>{
    state.xyScaleMode = els.xyScaleModeSelect.value;
    markProjectDirty();
    setStatus(`X-Y solo mode: ${state.xyScaleMode === "shred" ? "Shred Mode" : state.xyScaleMode}`);
  });
  if(els.xyChordFollowToggle) els.xyChordFollowToggle.addEventListener("change", ()=>{
    state.xyChordFollow = !!els.xyChordFollowToggle.checked;
    markProjectDirty();
    setStatus(state.xyChordFollow ? "X-Y pad follows the current chord" : "X-Y pad stays on the selected solo scale");
  });
  if(els.xyRecordToggle) els.xyRecordToggle.addEventListener("change", ()=>{
    state.xyRecordToGrid = els.xyRecordToggle.checked;
    state.xyLastWriteStep = -1;
    markProjectDirty();
    setStatus(state.xyRecordToGrid ? "X-Y pad will write notes into the active melody track while the loop plays" : "X-Y pad is in live overlay mode");
  });
  if(els.xyPad){
    const startXY = async (e) => {
      e.preventDefault();
      state.xyLastWriteStep = -1;
      await handleXYPad(e.clientX, e.clientY);
      if(els.xyPad.setPointerCapture && e.pointerId !== undefined){ try{ els.xyPad.setPointerCapture(e.pointerId); }catch(err){} }
    };
    const moveXY = async (e) => {
      if((e.buttons && e.buttons !== 0) || e.pressure > 0){
        e.preventDefault();
        await handleXYPad(e.clientX, e.clientY);
      }
    };
    const endXY = () => {
      clearXYLiveState();
    };
    els.xyPad.addEventListener("pointerdown", startXY);
    els.xyPad.addEventListener("pointermove", moveXY);
    els.xyPad.addEventListener("pointerup", endXY);
    els.xyPad.addEventListener("pointerleave", endXY);
    els.xyPad.addEventListener("pointercancel", endXY);
    els.xyPad.addEventListener("keydown", async e => {
      const poolLength = xyPitchPool().length;
      const pitchStep = poolLength > 1 ? 1 / poolLength : 1;
      const yStep = e.shiftKey ? 0.02 : 0.1;
      let nextX = xyKeyboardX;
      let nextY = xyKeyboardY;
      if(e.key === "ArrowLeft") nextX -= pitchStep;
      else if(e.key === "ArrowRight") nextX += pitchStep;
      else if(e.key === "ArrowUp") nextY -= yStep;
      else if(e.key === "ArrowDown") nextY += yStep;
      else if(e.key === "Home") nextX = 0;
      else if(e.key === "End") nextX = 1;
      else if(e.key === " " || e.key === "Enter"){
        // Replay the current keyboard position without changing either axis.
      } else if(e.key === "Escape"){
        e.preventDefault();
        clearXYLiveState(true);
        setStatus("X-Y pad stopped");
        return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
      state.xyLastWriteStep = -1;
      await handleXYPosition(nextX, nextY);
      setStatus(`X-Y pad: ${els.xyPad.getAttribute("aria-valuetext")}`);
    });
    els.xyPad.addEventListener("keyup", e => {
      if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"," ","Enter"].includes(e.key)) clearXYLiveState(true);
    });
    els.xyPad.addEventListener("blur", () => clearXYLiveState(true));
  }

  ["showMelodyPadsToggle","showDrumPadsToggle","showMelodyPickerToggle","showTrackControlsToggle"].forEach(id => {
    if(els[id]) els[id].addEventListener("change", () => {
      if(id === "showMelodyPadsToggle") state.showMelodyPads = els[id].checked;
      if(id === "showDrumPadsToggle") state.showDrumPads = els[id].checked;
      if(id === "showMelodyPickerToggle") state.showMelodyPicker = els[id].checked;
      if(id === "showTrackControlsToggle") state.showTrackControls = els[id].checked;
      markProjectDirty();
      applyAdvancedVisibility();
    });
  });
  if(els.drumRecordToggle) els.drumRecordToggle.addEventListener("change", () => {
    state.drumRecordToGrid = !!els.drumRecordToggle.checked;
    markProjectDirty();
    if(els.drumPadStatus) els.drumPadStatus.textContent = state.drumRecordToGrid ? "Write armed" : "Touch performance";
    setStatus(state.drumRecordToGrid ? "Drum kit write mode armed. Start playback and tap supported pads to write them into the grid." : "Drum kit is live-only");
  });
  if(els.drumClearRecordingBtn) els.drumClearRecordingBtn.addEventListener("click", clearKitDrums);
  if(els.humanizeToggle) els.humanizeToggle.addEventListener("change", () => {
    state.humanizeOn = els.humanizeToggle.checked;
    markProjectDirty();
    setStatus(state.humanizeOn ? "Humanise on" : "Humanise off");
  });
  if(els.sidechainToggle) els.sidechainToggle.addEventListener("change", () => {
    state.sidechainOn = els.sidechainToggle.checked;
    markProjectDirty();
    applyAdvancedVisibility();
    setStatus(state.sidechainOn ? "Chord pump on" : "Chord pump off");
  });
  if(els.sidechainAmount) els.sidechainAmount.addEventListener("input", () => {
    state.sidechainAmount = clamp(asNumber(els.sidechainAmount.value, 0.45), 0, 1);
    markProjectDirty();
  });
  if(els.sectionBarsSelect) els.sectionBarsSelect.addEventListener("change", ()=>{
    pushUndoState();
    const wasPlaying = !!state.isPlaying;
    const previousMode = state.playbackMode || "section";
    state.sectionBars[state.currentSection] = clamp(parseInt(els.sectionBarsSelect.value, 10), 1, MAX_BARS);
    renderAll();
    const message = `Section ${state.currentSection} length set to ${state.sectionBars[state.currentSection]} bar${state.sectionBars[state.currentSection] === 1 ? "" : "s"}`;
    if(wasPlaying){
      state.playbackMode = previousMode;
      restartPlaybackPlanAfterStructureChange(`${message} - playback restarted with the full grid`);
    } else {
      setStatus(message);
    }
  });
  if(els.copyAToBBtn) els.copyAToBBtn.addEventListener("click", ()=>{
    const target = sanitizeSectionId(els.copyTargetSectionSelect ? els.copyTargetSectionSelect.value : state.currentSection);
    if(target === state.currentSection){ setStatus("Choose a different target section"); return; }
    pushUndoState();
    SECTION_PROP_GROUPS.forEach(key => {
      state[sectionPropKey(key, target)] = JSON.parse(JSON.stringify(state[sectionPropKey(key, state.currentSection)]));
    });
    state.sectionBars[target] = sectionBarCount(state.currentSection);
    renderAll();
    setStatus(`Copied section ${state.currentSection} to ${target}`);
  });
  if(els.addSequenceSlotBtn) els.addSequenceSlotBtn.addEventListener("click", ()=>{
    if(!canAddSequenceSlot()){
      setStatus("Song sequence is already at the 64-slot limit");
      return;
    }
    pushUndoState();
    const seq = sequenceList();
    const nextSection = seq.length ? seq[seq.length - 1] : state.currentSection;
    state.songSequence = [...seq, nextSection];
    renderSectionSequence();
    setStatus(`Added ${nextSection} to song sequence`);
  });
  if(els.removeSequenceSlotBtn) els.removeSequenceSlotBtn.addEventListener("click", ()=>{
    if(!canRemoveSequenceSlot()){
      setStatus("Song sequence needs at least one slot");
      return;
    }
    pushUndoState();
    state.songSequence = sequenceList().slice(0, -1);
    renderSectionSequence();
    setStatus("Removed last song sequence slot");
  });
  if(els.clearSequenceBtn) els.clearSequenceBtn.addEventListener("click", ()=>{ pushUndoState(); state.songSequence = [state.currentSection]; renderSectionSequence(); setStatus("Cleared song sequence"); });
  els.exportJsonBtn.addEventListener("click", async ()=>{
    const jsonText = JSON.stringify(exportProject());
    els.projectBox.value = jsonText;
    setProjectBoxValidation();
    rememberImmersiveModeBeforeExternalUi();
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(jsonText);
        setStatus("Compact project JSON exported and copied to clipboard");
      } else {
        setStatus("Compact project JSON exported");
      }
    }catch(e){
      setStatus("Compact project JSON exported");
    }finally{
      scheduleImmersiveRestore();
    }
  });
  els.importJsonBtn.addEventListener("click", importProjectFromTextBox);
  if(els.copyShareCodeBtn) els.copyShareCodeBtn.addEventListener("click", copyShareCode);
  if(els.importShareCodeBtn) els.importShareCodeBtn.addEventListener("click", importShareCode);
  if(els.pushToDjBtn) els.pushToDjBtn.addEventListener("click", pushToPocketDj);
  if(els.pushToDawBtn) els.pushToDawBtn.addEventListener("click", pushToPocketDaw);
  if(els.pushToGodotBtn) els.pushToGodotBtn.addEventListener("click", pushToGodot);
  if(els.mobileTransferBtn) els.mobileTransferBtn.addEventListener("click", openMobileTransferPage);
  if(els.mobileTransferShareBtn) els.mobileTransferShareBtn.addEventListener("click", shareMobileTransfer);
  if(els.mobileTransferCopyBtn) els.mobileTransferCopyBtn.addEventListener("click", copyMobileTransferCode);
  if(els.mobileTransferDownloadBtn) els.mobileTransferDownloadBtn.addEventListener("click", downloadMobileTransferCode);
  if(els.mobileTransferOpenBtn) els.mobileTransferOpenBtn.addEventListener("click", openMobileTransferPage);
  els.exportMidiBtn.addEventListener("click", ()=>{
    rememberImmersiveModeBeforeExternalUi();
    setStatus("Exporting MIDI...");
    exportMidiFile();
    scheduleImmersiveRestore();
  });
  if(els.importMidiBtn) els.importMidiBtn.addEventListener("click", e=>{
    if(state.uiMode !== "advanced"){
      e.preventDefault();
      setStatus("Switch to Advanced mode to import MIDI");
      setMidiImportSummary("MIDI import is available in Advanced mode only.");
      return;
    }
    rememberImmersiveModeBeforeExternalUi();
    setMidiImportSummary("Choose a .mid or .midi file. The picker allows all files because some phones label MIDI as an unknown file type.");
  });
  if(els.importMidiBtn) els.importMidiBtn.addEventListener("keydown", e=>{
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      els.importMidiBtn.click();
    }
  });
  if(els.midiImportInput) els.midiImportInput.addEventListener("change", ()=>{
    scheduleImmersiveRestore();
    const file = els.midiImportInput.files && els.midiImportInput.files[0];
    importMidiFile(file);
  });
  if(els.midiImportInput) els.midiImportInput.addEventListener("cancel", ()=>{
    setStatus("MIDI import cancelled");
    scheduleImmersiveRestore();
  });
  els.exportWavBtn.addEventListener("click", ()=>{ setStatus("Exporting WAV... this can take a moment on phone"); exportWavFile(); });
  if(els.cancelWavExportBtn) els.cancelWavExportBtn.addEventListener("click", cancelWavExport);
  if(els.wavShareBtn) els.wavShareBtn.addEventListener("click", async ()=>{
    rememberImmersiveModeBeforeExternalUi();
    await shareWavOutput();
    scheduleImmersiveRestore();
  });
  if(els.wavOpenLink) els.wavOpenLink.addEventListener("click", ()=>{ rememberImmersiveModeBeforeExternalUi(); scheduleImmersiveRestore(); });
  if(els.wavDownloadLink) els.wavDownloadLink.addEventListener("click", ()=>{ rememberImmersiveModeBeforeExternalUi(); scheduleImmersiveRestore(); });
  ["masterVol","chordVol","beatVol","leadVol"].forEach(id => els[id].addEventListener("input", applyVolumes));
  [
    ["metronomeToggle", "metronomeOn", "Metronome"],
    ["chordsToggle", "chordsOn", "Chords"],
    ["bassToggle", "bassOn", "Bass"]
  ].forEach(([id, key, label]) => {
    if(!els[id]) return;
    els[id].addEventListener("change", () => {
      pushUndoState();
      state[key] = !!els[id].checked;
      markProjectDirty();
      setStatus(`${label} ${state[key] ? "on" : "off"}`);
    });
  });
  ["fxDelay","fxChorus","fxFlanger","fxReverb","fxMix"].forEach(id => {
    if(els[id]) els[id].addEventListener("input", ()=>{
      state[id] = parseFloat(els[id].value);
      markProjectDirty();
      updateFx();
      setStatus(`FX updated: delay ${Math.round(parseFloat(els.fxDelay?.value ?? 0)*100)}%, chorus ${Math.round(parseFloat(els.fxChorus?.value ?? 0)*100)}%, flanger ${Math.round(parseFloat(els.fxFlanger?.value ?? 0)*100)}%, reverb ${Math.round(parseFloat(els.fxReverb?.value ?? 0)*100)}%, mix ${Math.round(parseFloat(els.fxMix?.value ?? 0)*100)}%`);
    });
  });
}

function init(){
  ["statusText","miniStatusText","miniSectionText","miniPlayBtn","miniStopBtn","miniUndoBtn","miniSettingsBtn","playBtn","stopBtn","demoBtn","undoBtn","randomIdeaBtn","settingsBtn","settingsModal","closeSettingsBtn","bpmInput","swingInput","swingValue","keySelect","scaleSelect","timeSigSelect","uiModeSelect","themeSelect","chordTypeSelect","chordInstrumentSelect","progressionSlots","chordPalette","padGrid","drumPresetChips","drumPadsPanel","drumPadGrid","drumPadStatus","drumRecordToggle","drumClearRecordingBtn","melodyIdeaBtn","melodyDegreeSelect","melodyPitchModeSelect","melodyInputModeSelect","xyPlaybackModeSelect","xyPadModeSelect","xyScaleModeSelect","xyChordFollowToggle","xyRecordToggle","xyPadControls","xyPadWrap","xyPad","xyPadMarker","xyPadReadout","melodyGridControls","melodyDegreeChips","melodyOctaveChips","melodyTrackChips","melodyTrackControls","addMelodyTrackBtn","removeMelodyTrackBtn","melodyInstrumentSelect","melodyRows","resolutionLabel","resolutionSelect","seqHeader","seqRows","trackChips","guitarEnabledToggle","guitarEnabledToggleSettings","guitarToneSelect","guitarRegisterSelect","guitarStrumModeSelect","guitarVolume","guitarPresetChips","guitarFillStyleSelect","fillGuitarFromChordsBtn","applyGuitarAllBtn","clearGuitarBtn","guitarRow","chordOctaveSelect","chordPlayModeSelect","chordRhythmModeSelect","fillFullBtn","fillHalfBtn","fillQuarterBtn","fillTripletBtn","clearTrackBtn","sectionChips","sectionBarsSelect","copyTargetSectionSelect","copyAToBBtn","playSequenceBtn","addSequenceSlotBtn","removeSequenceSlotBtn","clearSequenceBtn","sectionSequence","projectBox","exportScopeSelect","midiExportModeSelect","midiChordExportSelect","midiExactDurationsToggle","exportJsonBtn","importJsonBtn","copyShareCodeBtn","importShareCodeBtn","pushToDjBtn","pushToDawBtn","pushToGodotBtn","mobileTransferBtn","mobileTransferPanel","mobileTransferShareBtn","mobileTransferCopyBtn","mobileTransferDownloadBtn","mobileTransferOpenBtn","mobileTransferStatus","pushHandoffStatus","exportMidiBtn","exportWavBtn","cancelWavExportBtn","wavProgressText","importMidiBtn","midiImportInput","midiImportSummary","wavResultBox","wavPreview","wavOpenLink","wavDownloadLink","wavShareBtn","saveSlot1Btn","loadSlot1Btn","saveSlot2Btn","loadSlot2Btn","loadAutoBtn","autoSaveStatus","tooltipsToggle","masterVol","chordVol","beatVol","leadVol","metronomeToggle","chordsToggle","bassToggle","fxDelay","fxChorus","fxFlanger","fxReverb","fxMix","showMelodyPadsToggle","showDrumPadsToggle","showMelodyPickerToggle","showTrackControlsToggle","humanizeToggle","sidechainToggle","sidechainAmount","sidechainAmountRow","bassModeSelect","bassArticulationSelect","projectSchemaSelect","projectLossReport","melodyPadsPanel","drumPadsPanel","melodyPickerPanel"].forEach(id => els[id] = document.getElementById(id));
  ["lofiChillBtn","lofiGameLoopBtn","lofiPresetSelect","drumKitSelect","bassToneSelect","lofiTextureToggle","lofiVinylCrackle","lofiTapeHiss","lofiWowFlutter","lofiWarmth","lofiLowPassAge","lofiBitCrush","lofiApplyIdeaBtn","lofiApplyLoopBtn","lofiApplyProfileBtn","lofiComposeSongBtn"].forEach(id => els[id] = document.getElementById(id));
  ["chipTuneBtn","chipGameLoopBtn","chipPresetSelect","chipDrumKitSelect","chipBassToneSelect","chipTextureToggle","chipBitDepth","chipSampleRateCrush","chipPulseWidth","chipPitchDrift","chipSaturation","chipStereoSpread","chipApplyIdeaBtn","chipApplyLoopBtn","chipApplyProfileBtn","chipComposeSongBtn"].forEach(id => els[id] = document.getElementById(id));
  ["metalChugBtn","metalGameLoopBtn","metalPresetSelect","metalDrumKitSelect","metalBassToneSelect","metalTextureToggle","metalDrive","metalPalmMute","metalLowTightness","metalPresence","metalRoomSize","metalPickAttack","metalApplyIdeaBtn","metalApplyLoopBtn","metalApplyProfileBtn","metalComposeSongBtn"].forEach(id => els[id] = document.getElementById(id));
  ["genreDrawerBtn","genreDrawer","closeGenreDrawerBtn","genreSeedInput","genreSummary","cleanGenreBtn","westernTrailBtn","westernPresetSelect","westernApplyIdeaBtn","westernApplyLoopBtn","westernApplyProfileBtn","westernComposeSongBtn","westernDrumPresetSelect","westernGuitarPresetSelect","funkGrooveBtn","funkGameLoopBtn","funkPresetSelect","funkApplyIdeaBtn","funkApplyLoopBtn","funkApplyProfileBtn","funkComposeSongBtn","funkPocket","funkSlap","funkGhost"].forEach(id => els[id] = document.getElementById(id));
  els.drumPresetSelect = document.getElementById("drumPresetSelect");
  els.guitarPresetSelect = document.getElementById("guitarPresetSelect");
  els.pocketAudioCoreStatus = document.getElementById("pocketAudioCoreStatus");
  const controlNames = {
    chordOctaveSelect:"Chord octave", chordPlayModeSelect:"Chord style", chordRhythmModeSelect:"Chord rhythm",
    resolutionSelect:"Beat resolution", guitarToneSelect:"Guitar tone", guitarRegisterSelect:"Guitar register",
    guitarStrumModeSelect:"Guitar strum style", guitarPresetSelect:"Guitar pattern preset", guitarFillStyleSelect:"Guitar fill style",
    melodyDegreeSelect:"Melody note", melodyInputModeSelect:"Melody input mode", melodyInstrumentSelect:"Melody instrument",
    melodyPitchModeSelect:"Melody pitch mode", xyPlaybackModeSelect:"X-Y playback mode", xyPadModeSelect:"X-Y pad mode",
    xyScaleModeSelect:"X-Y scale mode", sectionBarsSelect:"Section length", copyTargetSectionSelect:"Copy target section",
    themeSelect:"Theme", bassModeSelect:"Bass mode", exportScopeSelect:"Export scope",
    midiExportModeSelect:"MIDI export timing", midiChordExportSelect:"MIDI chord export", projectBox:"Project JSON or share code",
    lofiPresetSelect:"Lofi preset", drumKitSelect:"Lofi drum kit", bassToneSelect:"Lofi bass tone",
    chipPresetSelect:"Chip tune preset", chipDrumKitSelect:"Chip drum kit", chipBassToneSelect:"Chip bass tone",
    metalPresetSelect:"Heavy metal preset", metalDrumKitSelect:"Metal drum kit", metalBassToneSelect:"Metal bass tone",
    westernPresetSelect:"Western preset", westernDrumPresetSelect:"Western drum preset", westernGuitarPresetSelect:"Western guitar preset"
  };
  Object.entries(controlNames).forEach(([id, name]) => {
    const control = document.getElementById(id);
    if(control && !control.getAttribute("aria-label") && !(control.labels && control.labels.length)) control.setAttribute("aria-label", name);
  });
  if(els.projectBox) els.projectBox.addEventListener("input", () => setProjectBoxValidation());
  ["mobileTransferStatus","pushHandoffStatus","autoSaveStatus","midiImportSummary","wavProgressText"].forEach(id => {
    const status = document.getElementById(id);
    if(status){ status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); }
  });
  updatePocketAudioCoreStatusUi();
  loadPocketAudioCoreModule().catch(() => {});
  bindImmersiveRestoreEvents();
  NOTES.forEach(n => { const o = document.createElement("option"); o.value=n; o.textContent=n; els.keySelect.appendChild(o); });
  [[els.chordInstrumentSelect,"funk_clav_stab","Funk Clav Stab"],[els.chordInstrumentSelect,"funk_rhodes_stab","Funk Rhodes Stab"],[els.chordInstrumentSelect,"funk_brass_stack","Funk Brass Stack"],[els.guitarToneSelect,"funk_muted","Funk Muted"]].forEach(([select,value,label]) => { if(select && !select.querySelector(`option[value="${value}"]`)){ const option=document.createElement("option"); option.value=value; option.textContent=label; select.appendChild(option); } });
  els.keySelect.value = state.key; els.scaleSelect.value = state.scale; els.timeSigSelect.value = String(state.timeSig); els.uiModeSelect.value = state.uiMode; els.themeSelect.value = state.theme;
  initStateArrays(); generateAvailableChords();
  syncModeState();
  if(state.xyPlaybackMode === "sustain" && state.xyPadMode === "sustain") state.xyPadMode = "frequency";
  // simple starter groove
  [0,1,2,3].forEach(bar => { state.gridA.kick[bar] = 1; state.gridA.bass[bar] = 1; });
  state.gridA.snare[1] = 1; state.gridA.snare[3] = 1;
  state.progressionA = [state.availableChords[0], state.availableChords[4], state.availableChords[5], state.availableChords[3]];
  state.progressionB = [state.availableChords[5], state.availableChords[3], state.availableChords[0], state.availableChords[4]];
  state.progressionC = [state.availableChords[3], state.availableChords[5], state.availableChords[0], state.availableChords[4]];
  state.progressionD = [state.availableChords[0], state.availableChords[2], state.availableChords[5], state.availableChords[4]];
  state.songSequence = DEFAULT_SONG_SEQUENCE.slice();
  syncSection();
  try{
    bindControls();
    bindKeyboardShortcuts();
  }catch(e){
    document.body.dataset.bindError = e && e.message ? e.message : "Control binding failed";
    console.error(e);
  }
  renderAll();
  refreshAutoSaveStatus();
  consumeIncomingChordsmithHandoff();
  setInterval(saveAutoSnapshot, 60000);
  window.addEventListener("beforeunload", ()=>saveAutoSnapshot());
}
init();
