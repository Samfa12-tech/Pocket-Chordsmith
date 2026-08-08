function buildPlaybackPlan(mode="section"){
  const includeSequence = mode === "sequence";
  const sections = includeSequence ? sequenceList() : [state.currentSection];
  const plan = [];
  let absStep = 0;
  sections.forEach((sectionId, seqIndex) => {
    const data = getSectionData(sectionId, true);
    const stepCount = data.bars * stepsPerBar();
    for(let step = 0; step < stepCount; step++){
      plan.push({section:sectionId, step, seqIndex, stepCount, absStep});
      absStep++;
    }
  });
  return plan;
}
function schedulePlanStep(item, time){
  const section = getSectionData(item.section, true);
  const step = item.step;
  rememberScheduledStepForRecording(item, time);
  const bar = Math.floor(step / stepsPerBar());
  const isBeatStart = step % activeResolution() === 0;
  const beatIndex = Math.floor(step / activeResolution());

  if(state.metronomeOn && isBeatStart) playMetronome(time, beatIndex % state.timeSig === 0);
  if(isBeatStart) playLofiTexture(time, item.absStep || step);
  ["kick","snare","hat"].forEach((trackId, idx) => {
    const level = normalizeBeatCell(section.grid[trackId][step]);
    if(gridTripletSecond(section, trackId, step)) return;
    const seed = idx + 1;
    const playOne = (lev, tt, offsetStep=0) => {
      const pocketTime = tt + funkPocketOffset(step + offsetStep);
      const ghostScale = funkGhostScale(trackId,lev);
      if(trackId === "kick"){
        playKick(pocketTime + humanizeOffset(step + offsetStep, seed), humanizePeak(lev === 2 ? 1.12 : 0.95, step + offsetStep, seed));
        applySidechainDuck(chordGain, pocketTime + 0.001);
      } else if(trackId === "snare") playSnare(pocketTime + humanizeOffset(step + offsetStep, seed), humanizePeak((lev === 2 ? 0.72 : 0.5)*ghostScale, step + offsetStep, seed));
      else playHat(pocketTime + humanizeOffset(step + offsetStep, seed), humanizePeak(lev === 2 ? 0.24 : 0.16, step + offsetStep, seed), lev === 2);
    };
    if(gridTripletStart(section, trackId, step)){
      const spanDur = spanDurationForSteps(step, 2);
      const nextLevel = normalizeBeatCell(section.grid[trackId][step + 1]);
      tripletTimesForSpan(time, spanDur).forEach((tt, ti) => playOne(ti === 2 ? nextLevel : level, tt, ti));
    } else if(level > 0) playOne(level, time, 0);
  });
  EXPANDED_DRUM_LANES.forEach((lane,laneIndex) => {
    const level = normalizeBeatCell(section.drumLanes?.[lane]?.[step]);
    if(level > 0) playExpandedDrumLane(lane,time + humanizeOffset(step,30 + laneIndex) + funkPocketOffset(step),(level === 2 ? 1.08 : 0.82)*funkGhostScale(lane,level));
  });
  if(state.bassOn && !gridTripletSecond(section, "bass", step) && bassStepHasTrigger(section, step) && !(section.bassHold || [])[step] && !(section.bassSlide || [])[step]){
    if(gridTripletStart(section, "bass", step)){
      const spanDur = spanDurationForSteps(step, 2);
      const times = tripletTimesForSpan(time, spanDur);
      const leftMidi = bassStepMidiAt(section, step);
      const rightMidi = bassStepMidiAt(section, step + 1);
      const midMidi = leftMidi !== null && rightMidi !== null ? Math.round((leftMidi + rightMidi) / 2) : leftMidi;
      [leftMidi, midMidi, rightMidi ?? leftMidi].forEach((midi, ti) => {
        if(midi !== null){
          const accent = ti === 2 ? bassStepAccentAt(section, step + 1) : bassStepAccentAt(section, step);
          playBass(midi, times[ti] + humanizeOffset(step + ti, 4) + funkPocketOffset(step + ti), Math.max(0.08, spanDur / 3 * 0.86), humanizePeak(accent ? 0.42 : 0.34, step + ti, 4), accent, bassArticulationAt(section,ti === 2 ? step + 1 : step));
        }
      });
    } else {
      const bassAccent = bassStepAccentAt(section, step);
      const phrase = bassPhraseInfo(section, step);
      const bassMidi = bassStepMidiAt(section, step);
      if(bassMidi !== null) playBassPhrase(bassMidi, time + humanizeOffset(step, 4) + funkPocketOffset(step), phrase.dur, humanizePeak(bassAccent ? 0.42 : 0.34, step, 4), bassAccent, phrase.slideMidi, phrase.slideOffset, bassArticulationAt(section,step));
    }
  }
  scheduleGuitarStep(section, step, time);
  if(state.chordsOn && step % stepsPerBar() === 0){
    const ch = section.progression[bar] || state.availableChords[0];
    chordRhythmStarts(time).forEach(([st, dur]) => playChord(ch, st, dur));
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
          notes.forEach((noteIndex, ti) => playLeadInstrument(
            melodyIndexToMidi(noteIndex, section.melodyOctaves[trackIndex] ?? 0),
            times[ti] + humanizeOffset(step + ti, 10 + trackIndex),
            Math.max(0.08, spanDur / 3 * 0.86),
            section.melodyInstruments[trackIndex] || "pulse",
            melodyTrackPanValue(trackIndex, section.name),
            humanizePeak(1, step + ti, 10 + trackIndex)
          ));
        } else {
          const phrase = melodyPhraseInfo(section, trackIndex, step);
          playLeadPhraseInstrument(
            melodyIndexToMidi(track[step], section.melodyOctaves[trackIndex] ?? 0),
            time + humanizeOffset(step, 10 + trackIndex),
            phrase.dur,
            section.melodyInstruments[trackIndex] || "pulse",
            melodyTrackPanValue(trackIndex, section.name),
            humanizePeak(1, step, 10 + trackIndex),
            phrase.slideMidi,
            phrase.slideOffset
          );
        }
      }
    });
  if(state.uiMode === "advanced"){
    if(state.melodyInputMode === "xy" && (state.xyPlaybackMode === "pulse" || state.xyPlaybackMode === "ostinato") && state.xyLiveActive && melodyTrackIsAudible(state.activeMelodyTrack, section.name)){
      const stepDur = stepDurationForIndex(step);
      if(state.xyPlaybackMode === "pulse"){
        const pulseTimes = xyPulseTimesForWindow(item.absStep || 0, time, stepDur);
        const pulseIntervalSecs = Math.max(beatDur() * (state.xyLivePulseInterval || 1), 0.06);
        const pulseDur = state.xyPadMode === "sustain" ? Math.min(pulseIntervalSecs * 0.82, state.xyLiveGate) : Math.max(0.08, Math.min(pulseIntervalSecs * 0.72, beatDur() * 0.9));
        pulseTimes.forEach(pulseTime => {
          playLeadXY(state.xyLiveMidi, pulseTime, pulseDur, state.xyLiveInstrument, state.xyLiveBrightness);
        });
      } else {
        const ostinatoEvents = xyPulseEventsForWindow(item.absStep || 0, time, stepDur, 0.5);
        const pattern = xyOstinatoPattern(xyPitchPoolMidis(), state.xyLiveMidi);
        const ostDur = Math.max(0.07, Math.min(0.32, state.xyLiveGate));
        ostinatoEvents.forEach(ev => {
          const midi = pattern[((ev.index % pattern.length) + pattern.length) % pattern.length] ?? state.xyLiveMidi;
          playLeadXY(midi, ev.time, ostDur, state.xyLiveInstrument, state.xyLiveBrightness);
        });
      }
    }
  }
  const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
  const timer = setTimeout(() => {
    const prevStep = state.lastHighlightedStep;
    state.currentStep = step;
    state.currentPlaybackSection = item.section;
    state.currentSequenceIndex = state.playbackMode === "sequence" ? item.seqIndex : -1;
    const shouldFollow = state.followPlaybackSection !== false && state.currentSection !== item.section;
    if(shouldFollow){
      storeSection();
      state.currentSection = item.section;
      syncSection();
      renderAll();
    } else if(state.playbackMode !== "sequence" && state.currentSection !== item.section){
      storeSection();
      state.currentSection = item.section;
      syncSection();
      renderAll();
    } else {
      updatePlaybackHighlights(prevStep, step);
      highlightSlots();
      renderSectionChips();
      renderSectionSequence();
    }
    triggerXYPadPulse();
  }, delayMs);
  state.pendingUiTimers.push(timer);
}
function scheduler(){
  if(audioCtx && audioCtx.state === "suspended"){
    audioCtx.resume().catch(() => {});
  }
  while(nextNoteTime < audioCtx.currentTime + SCHEDULER_LOOKAHEAD_SECONDS){
    const item = state.transportPlan[playStep % state.transportPlan.length];
    schedulePlanStep(item, nextNoteTime);
    nextNoteTime += stepDurationForIndex(playStep % Math.max(1, item.stepCount));
    playStep++;
  }
}
async function startPlayback(mode="section"){
  state.bpm = sanitizeBpm(els.bpmInput.value, 96);
  els.bpmInput.value = state.bpm;
  storeSection();
  primePocketAudioCoreFromCurrentProject(mode === "sequence" ? "song playback" : "section playback")
    .then(() => callPocketAudioCore("play", {scope: mode === "sequence" ? "sequence" : "section", sectionId: state.currentSection}))
    .catch(() => {});
  els.playBtn.textContent = mode === "sequence" ? "Play" : "...";
  if(els.playSequenceBtn) els.playSequenceBtn.textContent = mode === "sequence" ? "..." : "Play Song";
  setStatus(mode === "sequence" ? "Starting song sequence..." : "Starting audio...");
  await ensureAudio();
  clearSchedulerTimers();
  clearPendingUiTimers();
  state.transportPlan = buildPlaybackPlan(mode);
  state.playbackMode = mode;
  nextNoteTime = audioCtx.currentTime + 0.04;
  playStep = 0;
  resetLiveRecordStepClock();
  state.currentStep = -1;
  state.currentSequenceIndex = -1;
  state.currentPlaybackSection = mode === "sequence" ? sequenceList()[0] : state.currentSection;
  if(mode === "sequence" && state.followPlaybackSection !== false && state.currentSection !== state.currentPlaybackSection){
    state.currentSection = state.currentPlaybackSection;
    syncSection();
    renderAll();
  }
  state.lastHighlightedStep = -1;
  state.isPlaying = true;
  updateTransportButtonLabels();
  setStatus(mode === "sequence" ? "Playing song sequence" : `Playing section ${state.currentSection}`);
  schedulerTimer = setInterval(() => {
    if(!state.isPlaying || !state.transportPlan.length) return;
    scheduler();
  }, SCHEDULER_INTERVAL_MS);
  schedulerTimers.add(schedulerTimer);
}
async function togglePlay(mode="section"){
  if(transportBusy) return;
  transportBusy = true;
  try{
    if(state.isPlaying){
      if(state.playbackMode === mode){
        stopPlayback();
        return;
      }
      stopPlayback();
    }
    await startPlayback(mode);
  }catch(e){
    console.error(e);
    state.isPlaying = false;
    clearSchedulerTimers();
    updateTransportButtonLabels();
    setStatus("Could not start audio");
  }finally{
    transportBusy = false;
  }
}
function stopPlayback(){
  callPocketAudioCore("stop");
  state.isPlaying = false;
  clearSchedulerTimers();
  resetLiveRecordStepClock();
  silenceChordVoices();
  silenceLiveVoices(activeLeadVoices);
  silenceLiveVoices(activeGuitarVoices);
  if(state.followPlaybackSection !== false && state.currentPlaybackSection){
    storeSection();
    state.currentSection = sanitizeSectionId(state.currentPlaybackSection);
    syncSection();
  }
  state.currentStep = -1;
  state.currentSequenceIndex = -1;
  clearPendingUiTimers();
  resetPlaybackHighlights();
  updateTransportButtonLabels();
  renderAll();
  setStatus("Stopped");
}
