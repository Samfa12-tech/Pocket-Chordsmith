function getSection(id=state.currentSection){ return session?.sections[id] || session?.sections.A; }
function currentChord(section, step){
  const bar = Math.floor(step / stepsPerBar()) % MAX_BARS;
  return makeChord(section.progression[bar] ?? 0);
}
function noteIndex(n){ return NOTES.indexOf(n); }
function scalePcs(){
  const root = noteIndex(session.deck.key);
  const ints = session.deck.scale === "minor" ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
  return ints.map(i => (root + i + 12) % 12);
}
function chordQuality(deg){
  return session.deck.scale === "minor" ? ["min","dim","maj","min","min","maj","maj"][deg] : ["maj","min","min","maj","maj","min","dim"][deg];
}
function chordIntervals(quality){
  const type = session.deck.chordType;
  if(type === "sus2") return [0,2,7];
  if(type === "sus4") return [0,5,7];
  if(type === "seventh") return quality === "maj" ? [0,4,7,11] : quality === "min" ? [0,3,7,10] : [0,3,6,10];
  return quality === "maj" ? [0,4,7] : quality === "min" ? [0,3,7] : [0,3,6];
}
function makeChord(degree){
  const deg = clamp(asInt(degree,0),0,6);
  const rootPc = scalePcs()[deg];
  const quality = chordQuality(deg);
  return {degree:deg,rootPc,quality,intervals:chordIntervals(quality)};
}
function chordMidiNotes(chord, octave=0){
  const root = 48 + chord.rootPc + octave*12;
  return chord.intervals.map((interval,i) => clamp(root + interval + (i === 0 ? 0 : 12), 0, 127));
}
function powerChordNotes(chord){
  const reg = session.deck.guitarRegister || "low";
  const minByRegister = reg === "high" ? 52 : reg === "mid" ? 45 : 35;
  const maxByRegister = reg === "high" ? 64 : reg === "mid" ? 57 : 47;
  let root = 24 + chord.rootPc;
  while(root < minByRegister) root += 12;
  while(root > maxByRegister) root -= 12;
  return [root,root+7,root+12].map(n => clamp(n,0,127));
}
function melodyIndexToMidi(idx, octave=0){
  const safe = normalizeMaybeNote(idx, session.deck.melodyPitchMode === "chromatic" ? 23 : 13) || 0;
  if(session.deck.melodyPitchMode === "chromatic") return 72 + (safe % 12) + (Math.floor(safe/12)+octave)*12;
  const pcs = scalePcs(); return 72 + pcs[safe % 7] + (Math.floor(safe/7)+octave)*12;
}
function bassManualIndexToMidi(idx){
  const pcs = scalePcs(); const safe = normalizeMaybeNote(idx,13) || 0;
  return 36 + pcs[safe % 7] + Math.floor(safe/7)*12;
}
function isTupletStart(tupletTrack, valueTrack, step, isActive){
  return !!(tupletTrack && tupletTrack[step]) && step < valueTrack.length-1 && isActive(valueTrack[step]) && isActive(valueTrack[step+1]);
}
function isTupletSecond(tupletTrack, valueTrack, step, isActive){ return step > 0 && isTupletStart(tupletTrack,valueTrack,step-1,isActive); }
function tripletTimes(t, dur){ return [t, t+dur/3, t+dur*2/3]; }
function melodyPhraseDuration(section, trackIndex, step){
  const hold = section.melodyHold[trackIndex] || [];
  let dur = stepDuration(step), i = step + 1;
  while(i < sectionStepCount(section) && hold[i]){ dur += stepDuration(i); i++; }
  return Math.max(.18, dur*.92);
}
function bassPhraseDuration(section, step){
  let dur = stepDuration(step), i = step + 1;
  while(i < sectionStepCount(section) && section.bassHold[i]){ dur += stepDuration(i); i++; }
  return Math.max(.18, dur*.94);
}
function bassPhraseSlideInfo(section, step){
  let i = step + 1;
  let offset = stepDuration(step);
  while(i < sectionStepCount(section) && section.bassHold[i]){
    offset += stepDuration(i);
    i++;
  }
  if(i < sectionStepCount(section) && section.bassSlide[i] && bassTriggerAt(section,i)) return {midi:bassMidiAt(section,i), offset};
  return null;
}
function guitarStepDuration(section, step, art){
  const stepDur = stepDuration(step);
  if(art === "chug") return Math.max(.055, Math.min(.16, stepDur*.58));
  if(art === "scratch") return Math.max(.035, Math.min(.075, stepDur*.42));
  let dur = stepDuration(step), i = step + 1;
  while(i < sectionStepCount(section) && section.guitarPattern[i] === "hold"){ dur += stepDuration(i); i++; }
  return Math.max(.16, Math.min(1.8, dur * (art === "accent" ? .98 : .92)));
}
function bassMidiAt(section, step){
  if(session.deck.bassMode === "manual" && section.bassNotes[step] !== null && section.bassNotes[step] !== undefined) return bassManualIndexToMidi(section.bassNotes[step]);
  return 36 + currentChord(section, step).rootPc;
}
function bassTriggerAt(section, step){
  if(session.deck.bassMode === "manual") return section.bassNotes[step] !== null && section.bassNotes[step] !== undefined;
  return normalizeBeat(section.grid.bass[step]) > 0;
}
function chordShouldPlay(step){
  const mode = session.deck.chordRhythmMode || "sustain";
  if(mode === "quarter") return step % resolution() === 0;
  if(mode === "half") return step % (resolution()*2) === 0;
  return step % stepsPerBar() === 0;
}
function chordDurationForStep(section, step){
  const mode = session.deck.chordRhythmMode || "sustain";
  if(mode === "quarter") return beatDur()*.9;
  if(mode === "half") return beatDur()*1.8;
  return spanDuration(step, Math.min(stepsPerBar(), sectionStepCount(section)-step))*.92;
}
function richEventNotes(event, track, section, step){
  const raw = Array.isArray(event?.notes) ? event.notes : event?.note === undefined ? [] : [event.note];
  if(raw.length) return raw.slice(0,PROJECT_RESOURCE_LIMITS.maxNotesPerEvent).map(value => clamp(asNum(value,0),0,127));
  if(track === "guitar") return powerChordNotes(currentChord(section,step));
  return track === "bass" ? [bassMidiAt(section,step)] : [];
}
function scheduleRichDrumEvents(section, step, time, budget){
  if(session.performance.stemMutes.drums) return;
  richEventsAt(section,"drums",step,budget).forEach(event => {
    const lane = String(event.sound || event.lane || event.role || "hat_closed").toLowerCase();
    const art = String(event.articulation || "").toLowerCase();
    if(session.performance.funkMacros?.oneDrop && step % stepsPerBar() !== 0 && lane !== "kick") return;
    const peak = richEventVelocity(event, lane === "kick" ? .9 : lane === "snare" ? .6 : .22) * (art === "ghost" ? (session.performance.funkMacros?.ghostLift ? .78 : .42) : 1);
    playDrumLane(lane,time + humanizeOffset(step,29),peak);
  });
}
function scheduleRichBassEvents(section, step, time, budget){
  richEventsAt(section,"bass",step,budget).forEach(event => {
    const art = String(event.articulation || "finger").toLowerCase();
    const midi = richEventNotes(event,"bass",section,step)[0];
    const duration = richEventDuration(event,step,bassPhraseDuration(section,step));
    playBassExpressive(midi,time + humanizeOffset(step,4),duration,.42,art,event);
  });
}
function scheduleRichMelodyEvents(section, step, time, budget){
  richEventsAt(section,"melody",step,budget).forEach(event => {
    const notes = richEventNotes(event,"melody",section,step);
    const duration = richEventDuration(event,step,Math.max(.06,stepDuration(step)*.92));
    const instrument = event.sound || event.instrument || section.melodyInstruments[0] || "pulse";
    const peak = richEventVelocity(event,1);
    notes.forEach((midi,index) => playMelody(midi,time + index*.008,duration,instrument,asNum(event.expression?.pan,section.melodyPan[0] || 0),peak));
  });
}
function scheduleRichChordEvents(section, step, time, budget){
  richEventsAt(section,"chords",step,budget).forEach(event => {
    const cfg = chordInstrumentConfig(event.sound || session.deck.chordInstrument || "pocket");
    const duration = richEventDuration(event,step,chordDurationForStep(section,step));
    const peak = richEventVelocity(event,1);
    richEventNotes(event,"chords",section,step).forEach((midi,index) => playChordTone(midiToFreq(midi),time + index*.008,duration,index ? cfg.wave : cfg.rootWave,cfg.peak*peak,cfg.filter,cfg.freq,cfg));
    flashStem("chords");
  });
}
function scheduleRichGuitarEvents(section, step, time, budget){
  richEventsAt(section,"guitar",step,budget).forEach(event => {
    const art = normalizeGuitarArt(event.articulation || event.sound || "open");
    playGuitar(richEventNotes(event,"guitar",section,step),time + humanizeOffset(step,17),richEventDuration(event,step,guitarStepDuration(section,step,art)),art,step);
  });
}
function scheduleStep(section, step, time){
  if(!section) return;
  const richEventBudget = {remaining:PROJECT_RESOURCE_LIMITS.maxRichEventsPerStep,dropped:0};
  const stepCount = sectionStepCount(section);
  const funkMacros = session.performance.funkMacros || {};
  if(step % resolution() === 0) playLofiTexture(time, step);
  const hasRichDrums = richTrackHasEvents(section,"drums");
  if(hasRichDrums) scheduleRichDrumEvents(section,step,time,richEventBudget);
  ["kick","snare","hat"].forEach(track => {
    if(hasRichDrums) return;
    if(session.performance.stemMutes.drums) return;
    if(funkMacros.oneDrop && step % stepsPerBar() !== 0 && track !== "kick") return;
    const vals = section.grid[track] || [];
    const tuplets = section.gridTuplets[track] || [];
    if(isTupletSecond(tuplets, vals, step, v => normalizeBeat(v)>0)) return;
    const playOne = (level, t, offsetStep=0) => {
      const seed = track === "kick" ? 1 : track === "snare" ? 2 : 3;
      const tt = t + humanizeOffset(step + offsetStep, seed);
      if(track === "kick"){
        playKick(tt, humanizePeak(level === 2 ? 1.12 : .95, step + offsetStep, seed));
        if(session.deck.sidechainOn) duckStem("chords", tt + .001, session.deck.sidechainAmount || .45);
      }
      if(track === "snare") playSnare(tt, humanizePeak(level === 2 ? .72 : .5, step + offsetStep, seed));
      if(track === "hat") playHat(tt, humanizePeak(level === 2 ? .24 : .16, step + offsetStep, seed), level === 2);
    };
    const level = normalizeBeat(vals[step]);
    if(isTupletStart(tuplets, vals, step, v => normalizeBeat(v)>0)){
      const levels = [level, level, normalizeBeat(vals[step+1]) || level];
      tripletTimes(time, spanDuration(step,2)).forEach((tt,i) => playOne(levels[i],tt,i));
    } else if(level > 0) playOne(level,time);
  });
  const hasRichBass = richTrackHasEvents(section,"bass");
  if(hasRichBass && !session.performance.stemMutes.bass && !session.performance.funkMacros?.bassMute) scheduleRichBassEvents(section,step,time,richEventBudget);
  if(!hasRichBass && !session.performance.stemMutes.bass && !session.performance.funkMacros?.bassMute && !section.bassHold[step] && !section.bassSlide[step]){
    const vals = session.deck.bassMode === "manual" ? section.bassNotes : section.grid.bass;
    const tuplets = section.gridTuplets.bass || [];
    const active = v => session.deck.bassMode === "manual" ? v !== null && v !== undefined : normalizeBeat(v)>0;
    if(!isTupletSecond(tuplets, vals, step, active) && bassTriggerAt(section, step)){
      if(isTupletStart(tuplets, vals, step, active)){
        const times = tripletTimes(time, spanDuration(step,2));
        [step,step,step+1].forEach((s,i) => {
          const accent = !!section.bassAccent[s] || normalizeBeat(section.grid.bass[s]) === 2;
          playBass(bassMidiAt(section,s), times[i] + humanizeOffset(step+i,4), Math.max(.06,spanDuration(step,2)/3*.82), humanizePeak(accent ? .42 : .34, step+i, 4), accent);
        });
      } else {
        const accent = !!section.bassAccent[step] || normalizeBeat(section.grid.bass[step]) === 2;
        const slide = bassPhraseSlideInfo(section,step);
        playBassPhrase(bassMidiAt(section,step), time + humanizeOffset(step,4), bassPhraseDuration(section,step), humanizePeak(accent ? .42 : .34, step, 4), accent, slide?.midi ?? null, slide?.offset ?? null);
      }
    }
  }
  const hasRichChords = richTrackHasEvents(section,"chords");
  if(hasRichChords && !session.performance.stemMutes.chords) scheduleRichChordEvents(section,step,time,richEventBudget);
  if(!hasRichChords && !session.performance.stemMutes.chords && chordShouldPlay(step)) playChord(currentChord(section,step), time, chordDurationForStep(section,step));
  const hasRichMelody = richTrackHasEvents(section,"melody");
  if(hasRichMelody && !session.performance.stemMutes.melody) scheduleRichMelodyEvents(section,step,time,richEventBudget);
  if(!hasRichMelody && !session.performance.stemMutes.melody){
    const anySolo = (section.melodySolo || []).some(Boolean);
    section.melodyTracks.forEach((track, ti) => {
      if(anySolo && !section.melodySolo[ti]) return;
      if(section.melodyMute[ti]) return;
      if(section.melodyHold[ti]?.[step] || section.melodySlide[ti]?.[step]) return;
      const tuplets = section.melodyTuplets[ti] || [];
      const active = v => v !== null && v !== undefined;
      if(isTupletSecond(tuplets, track, step, active)) return;
      if(track[step] !== null && track[step] !== undefined){
        if(isTupletStart(tuplets, track, step, active)){
          const times = tripletTimes(time, spanDuration(step,2));
          const mid = Math.round((track[step] + track[step+1]) / 2);
          [track[step], mid, track[step+1]].forEach((note,i) => playMelody(melodyIndexToMidi(note,section.melodyOctaves[ti] || 0), times[i] + humanizeOffset(step+i,10+ti), Math.max(.06,spanDuration(step,2)/3*.82), section.melodyInstruments[ti], section.melodyPan[ti] || 0, humanizePeak(1, step+i, 10+ti)));
        } else playMelody(melodyIndexToMidi(track[step],section.melodyOctaves[ti] || 0), time + humanizeOffset(step,10+ti), melodyPhraseDuration(section,ti,step), section.melodyInstruments[ti], section.melodyPan[ti] || 0, humanizePeak(1, step, 10+ti));
      }
    });
  }
  const hasRichGuitar = richTrackHasEvents(section,"guitar");
  if(hasRichGuitar && session.deck.guitarActive && !session.performance.stemMutes.guitar) scheduleRichGuitarEvents(section,step,time,richEventBudget);
  if(!hasRichGuitar && session.deck.guitarActive && !session.performance.stemMutes.guitar){
    const art = section.guitarPattern[step];
    if(art && art !== "off" && art !== "hold") playGuitar(powerChordNotes(currentChord(section,step)), time + humanizeOffset(step,17), guitarStepDuration(section,step,art), art, step);
  }
  if(funkMacros.phraseFill && step % stepsPerBar() >= Math.max(0,stepsPerBar() - resolution())){
    if(!session.performance.stemMutes.drums){
      playSnare(time,.24); playHat(time + stepDuration(step)*.35,.16,true);
    }
    if(step % stepsPerBar() === stepsPerBar() - 1) funkMacros.phraseFill = false;
  }
  schedulerDiagnostics.droppedRichEventCount += richEventBudget.dropped;
  scheduleVisual(section, step, time);
}
function scheduleVisual(section, step, time){
  const delay = Math.max(0,(time - audioCtx.currentTime)*1000);
  const timer = setTimeout(() => {
    state.currentSection = section?.id || session?.performance.currentSection || state.currentSection;
    state.currentStep = step;
    state.bar = Math.floor(step / stepsPerBar()) + 1;
    state.beat = Math.floor((step % stepsPerBar()) / resolution()) + 1;
    updatePadStates();
    renderTransportState();
    renderFxValuesOnly();
    renderMixerValuesOnly();
  }, delay);
  visualTimers.push(timer);
}
function scheduleUiAt(time, callback){
  const delay = Math.max(0,(time - audioCtx.currentTime)*1000);
  const timer = setTimeout(callback, delay);
  visualTimers.push(timer);
}
function schedulerTick(){
  if(!state.playing || !session || !audioCtx) return;
  const tickNow = audioCtx.currentTime;
  let lastDroppedStep = null;
  let processedSteps = 0;
  if(nextEventTime < tickNow - MAX_AUDIBLE_LATENESS_SECONDS) schedulerDiagnostics.missedTickCount++;
  while(nextEventTime < tickNow + LOOKAHEAD_SECONDS){
    if(pocketDjSchedulerCatchupDecision(processedSteps,MAX_SCHEDULER_CATCHUP_STEPS) === "reset"){
      schedulerDiagnostics.catchupResetCount++;
      nextEventTime = tickNow;
      break;
    }
    const section = getSection(session.performance.currentSection);
    const step = state.currentStepForSchedule ?? 0;
    const policy = pocketDjSchedulerPolicy(nextEventTime, tickNow, LOOKAHEAD_SECONDS, MAX_AUDIBLE_LATENESS_SECONDS);
    if(policy === "schedule") scheduleStep(section, step, nextEventTime);
    else if(policy === "drop") { schedulerDiagnostics.droppedStepCount++; lastDroppedStep = step; }
    else break;
    nextEventTime += stepDuration(step);
    advanceStepAfterScheduling(section, step);
    processedSteps++;
  }
  if(lastDroppedStep !== null){
    state.currentStep = lastDroppedStep;
    state.bar = Math.floor(lastDroppedStep / stepsPerBar()) + 1;
    state.beat = Math.floor((lastDroppedStep % stepsPerBar()) / resolution()) + 1;
    updatePadStates();
    renderTransportState();
  }
}
/* scheduler-policy:start */
function pocketDjSchedulerPolicy(eventTime, now, lookaheadSeconds, maxAudibleLatenessSeconds){
  if(eventTime < now - maxAudibleLatenessSeconds) return "drop";
  if(eventTime < now + lookaheadSeconds) return "schedule";
  return "wait";
}
function pocketDjSchedulerCatchupDecision(processedSteps,maxSteps){
  return processedSteps >= maxSteps ? "reset" : "continue";
}
/* scheduler-policy:end */
function applyDropAtBoundary(boundaryTime){
  if(!state.dropQueued || state.dropBoundaryScheduled || !session) return;
  state.dropBoundaryScheduled = true;
  scheduleUiAt(boundaryTime, () => {
    state.dropQueued = false;
    state.dropBoundaryScheduled = false;
    state.dropLanding = true;
    session.performance.buildActive = false;
    restoreBuildSnapshot();
    playDropImpact();
    applyMixerAndFx();
    autosave();
    renderAll();
    showStatus("Drop landed");
    setTimeout(() => {
      state.dropLanding = false;
      renderFxValuesOnly();
    }, Math.max(240, beatDur() * 700));
  });
}
function launchQueuedSectionAtBoundary(boundaryTime){
  if(!session?.performance.queuedSection || session.performance.loopCurrentSection) return false;
  const launched = session.performance.queuedSection;
  session.performance.currentSection = launched;
  session.performance.queuedSection = null;
  syncSequenceIndexToSection(launched);
  state.currentStepForSchedule = 0;
  scheduleUiAt(boundaryTime, () => {
    state.currentSection = launched;
    state.currentStep = 0;
    state.bar = 1;
    state.beat = 1;
    autosave();
    updatePadStates();
    renderTransportState();
    renderSequence();
    showStatus(`Section ${launched} playing`);
  });
  return true;
}
function advanceStepAfterScheduling(section, step){
  const stepCount = sectionStepCount(section);
  let nextStep = step + 1;
  const atNextBar = nextStep > 0 && nextStep % stepsPerBar() === 0;
  const atSectionEnd = nextStep >= stepCount;
  const boundaryTime = nextEventTime;
  const launchBoundary = isLaunchBoundary(atNextBar, atSectionEnd);

  if(launchBoundary){
    applyDropAtBoundary(boundaryTime);
  }

  if(launchBoundary && session.performance.queuedSection){
    if(session.performance.loopCurrentSection){
      state.currentStepForSchedule = atSectionEnd ? 0 : nextStep;
      return;
    }
    if(launchQueuedSectionAtBoundary(boundaryTime)) return;
  }

  if(atSectionEnd){
    nextStep = 0;
    if(!session.performance.queuedSection && !session.performance.loopCurrentSection && advanceSequenceAtBoundary(boundaryTime)) return;
  }
  state.currentStepForSchedule = nextStep;
}

/* 7. Section launcher */
async function startPlayback(){
  if(!session) return showStatus("Load a project first.");
  try{
    callPocketAudioCore("play", {sectionId: session.performance.currentSection, scope: "section"});
    await ensureAudio();
    if(masterGain) masterGain.gain.setTargetAtTime(session.performance.masterVolume,.001 + audioCtx.currentTime,.018);
  }catch(e){ showStatus("Audio needs one tap to start on this device. Press Play again."); return; }
  clearScheduler();
  state.playing = true;
  state.currentSection = session.performance.currentSection;
  if(session.performance.sequencePlaying) currentSequencePosition();
  state.currentStepForSchedule = 0;
  state.currentStep = -1;
  state.bar = 1;
  state.beat = 1;
  nextEventTime = audioCtx.currentTime + .04;
  applyMixerAndFx();
  schedulerId = setInterval(schedulerTick, SCHEDULER_MS);
  schedulerTick();
  renderAll(); showStatus(`Playing section ${state.currentSection}`);
}
function stopPlayback(){
  callPocketAudioCore("stop");
  state.playing = false;
  clearScheduler();
  cancelMacroAnimation();
  state.dropQueued = false;
  state.dropBoundaryScheduled = false;
  state.dropLanding = false;
  if(session){
    session.performance.buildActive = false;
    restoreBuildSnapshot();
    resetPerformanceStemScales(1);
    clearPerformanceFx();
    session.performance.fx = {...DEFAULT_FX};
  }
  if(masterGain && audioCtx) masterGain.gain.setTargetAtTime(.0001,audioCtx.currentTime,.025);
  state.currentStep = -1;
  state.currentStepForSchedule = 0;
  applyMixerAndFx();
  renderAll(); showStatus("Stopped");
}
function restartPlayback(){
  if(!session) return;
  session.performance.currentSection = state.currentSection;
  state.currentStepForSchedule = 0;
  state.currentStep = -1;
  if(state.playing){ startPlayback(); }
  else { renderAll(); showStatus("Restart ready"); }
}
function clearScheduler(){
  if(schedulerId) clearInterval(schedulerId); schedulerId = null;
  visualTimers.forEach(t => clearTimeout(t)); visualTimers = [];
}
function cancelMacroAnimation(){
  macroToken++;
  if(macroFrameId){ cancelAnimationFrame(macroFrameId); macroFrameId = null; }
}
function queueSection(sectionId){
  if(!session || !SECTION_IDS.includes(sectionId)) return;
  const section = session.sections[sectionId];
  if(!section || !section.active) return showStatus(`Section ${sectionId} is empty.`);
  if(session.performance.launchQuantize === "instant") return jumpToSection(sectionId);
  session.performance.queuedSection = sectionId;
  callPocketAudioCore("queueSection", sectionId, {quantize: session.performance.launchQuantize});
  autosave();
  updatePadStates();
  renderTransportState();
  renderSequence();
  if(session.performance.loopCurrentSection) showStatus(`Hold on: section ${sectionId} queued and waiting`);
  else showStatus(`Section ${sectionId} queued: ${launchModeLabel()}`);
}
function jumpToSection(sectionId){
  if(!session || !SECTION_IDS.includes(sectionId)) return;
  const section = session.sections[sectionId];
  if(!section || !section.active) return showStatus(`Section ${sectionId} is empty.`);
  cancelMacroAnimation();
  state.dropQueued = false;
  state.dropBoundaryScheduled = false;
  state.dropLanding = false;
  state.currentSection = sectionId;
  session.performance.currentSection = sectionId;
  syncSequenceIndexToSection(sectionId);
  session.performance.queuedSection = null;
  state.currentStepForSchedule = 0;
  state.currentStep = -1;
  if(state.playing) startPlayback();
  else renderAll();
  autosave(); showStatus(`Jumped to section ${sectionId}`);
}
function toggleSectionLoop(){
  if(!session) return;
  session.performance.loopCurrentSection = !session.performance.loopCurrentSection;
  autosave(); renderAll();
  if(session.performance.loopCurrentSection) showStatus(`Hold on: section changes and sequence advancement will wait`);
  else if(session.performance.queuedSection) showStatus(`Hold released: section ${session.performance.queuedSection} will launch at ${launchModeLabel()}`);
  else showStatus("Hold released");
}

/* 8. Stem mixer */
function setStemMute(stem, muted){ session.performance.stemMutes[stem] = !!muted; callPocketAudioCore("setStemMute", stem, !!muted); applyMixerAndFx(); autosave(); renderMixer(); }
function setStemVolume(stem, value){ session.performance.stemVolumes[stem] = clamp(asNum(value,.8),0,1); callPocketAudioCore("setStemVolume", stem, session.performance.stemVolumes[stem]); applyMixerAndFx(); autosave(false); renderMixerValuesOnly(); }
function flashStem(stem){
  const row = document.querySelector(`[data-stem-row="${stem}"]`); if(!row) return;
  row.classList.add("lit"); clearTimeout(row._meterTimer); row._meterTimer = setTimeout(() => row.classList.remove("lit"), 110);
}

/* 9. FX engine */
function setMasterFilter(value){ clearPerformanceFx(); session.performance.fx.filter = clamp(asNum(value,DEFAULT_FX.filter),0,1); callPocketAudioCore("setFx", {filter:session.performance.fx.filter}); applyMixerAndFx(); autosave(false); renderFxValuesOnly(); }
function setEchoAmount(value){ clearPerformanceFx(); session.performance.fx.echo = clamp(asNum(value,0),0,1); callPocketAudioCore("setFx", {echo:session.performance.fx.echo}); applyMixerAndFx(); autosave(false); renderFxValuesOnly(); }
function setReverbAmount(value){ clearPerformanceFx(); session.performance.fx.reverb = clamp(asNum(value,0),0,1); callPocketAudioCore("setFx", {reverb:session.performance.fx.reverb}); applyMixerAndFx(); autosave(false); renderFxValuesOnly(); }
function easeInOutCubic(x){ return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; }
function lerp(a,b,t){ return a + (b - a) * t; }
function captureBuildSnapshot(){
  if(!session) return;
  if(!state.buildSavedVolumes) state.buildSavedVolumes = {...session.performance.stemVolumes};
  if(!state.buildSavedFx) state.buildSavedFx = {...session.performance.fx};
}
function restoreBuildSnapshot(){
  if(!session) return;
  if(state.buildSavedVolumes){
    session.performance.stemVolumes = {...session.performance.stemVolumes, ...state.buildSavedVolumes};
  }
  if(state.buildSavedFx){
    session.performance.fx = {...session.performance.fx, ...state.buildSavedFx};
  }
  state.buildSavedVolumes = null;
  state.buildSavedFx = null;
  clearPerformanceFx();
  resetPerformanceStemScales(1);
}
function startPerformanceMacro(targets, durationMs, onDone){
  if(!session) return;
  cancelMacroAnimation();
  captureBuildSnapshot();
  const token = ++macroToken;
  const startTime = performance.now();
  const fromFx = {...session.performance.fx};
  const toFx = {...fromFx, ...(targets.fx || {})};
  const fromVolumes = {...session.performance.stemVolumes};
  const toVolumes = {...fromVolumes, ...(targets.volumes || {})};
  const tick = now => {
    if(token !== macroToken || !session) return;
    const pct = clamp((now - startTime) / Math.max(1,durationMs), 0, 1);
    const e = easeInOutCubic(pct);
    Object.keys(toFx).forEach(id => session.performance.fx[id] = clamp(lerp(asNum(fromFx[id],0), asNum(toFx[id],0), e), 0, 1));
    Object.keys(toVolumes).forEach(stem => {
      if(!STEMS.includes(stem)) return;
      session.performance.stemVolumes[stem] = clamp(lerp(asNum(fromVolumes[stem],0), asNum(toVolumes[stem],0), e), 0, 1);
    });
    clearPerformanceFx();
    resetPerformanceStemScales(1);
    applyMixerAndFx();
    renderFxValuesOnly();
    renderMixerValuesOnly();
    if(pct < 1){ macroFrameId = requestAnimationFrame(tick); }
    else { macroFrameId = null; if(onDone) onDone(); renderFxValuesOnly(); renderMixerValuesOnly(); autosave(); }
  };
  macroFrameId = requestAnimationFrame(tick);
}
function playBuildRiser(durationSec){
  if(!audioCtx || !noiseBuffer) return;
  const t = audioCtx.currentTime + .01;
  const dur = Math.max(.7, durationSec || beatDur() * session.deck.timeSig);
  const src = audioCtx.createBufferSource(), hp = audioCtx.createBiquadFilter(), lp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
  src.buffer = noiseBuffer; src.loop = true;
  hp.type = "highpass"; lp.type = "lowpass";
  if(isLofiDeck()){
    hp.frequency.setValueAtTime(260,t); hp.frequency.exponentialRampToValueAtTime(1250,t + dur*.9);
    lp.frequency.setValueAtTime(1150,t); lp.frequency.exponentialRampToValueAtTime(3400,t + dur*.9);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.028,t + dur*.3); g.gain.linearRampToValueAtTime(.048,t + dur*.82); g.gain.exponentialRampToValueAtTime(.0001,t + dur);
  }else{
    hp.frequency.setValueAtTime(420,t); hp.frequency.exponentialRampToValueAtTime(5200,t + dur*.94);
    lp.frequency.setValueAtTime(1700,t); lp.frequency.exponentialRampToValueAtTime(9200,t + dur*.94);
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.075,t + dur*.25); g.gain.linearRampToValueAtTime(.15,t + dur*.86); g.gain.exponentialRampToValueAtTime(.0001,t + dur);
  }
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(masterFilter);
  src.start(t); src.stop(t + dur + .04);
}
function playDropImpact(){
  if(!audioCtx) return;
  const t = audioCtx.currentTime + .012;
  if(isLofiDeck()){
    playKick(t + .006, .82);
    playHat(t + .025, .11, true);
    return;
  }
  playCrash(t);
  playKick(t + .006, 1.18);
}
function triggerBuild(){
  if(!session) return;
  callPocketAudioCore("triggerBuild", {bars: session.performance.queuedSection ? 1 : 2});
  state.dropQueued = false;
  state.dropBoundaryScheduled = false;
  session.performance.buildActive = true;
  const bars = session.performance.queuedSection ? 1 : 2;
  const durationSec = Math.max(1.0, beatDur() * session.deck.timeSig * bars);
  if(audioCtx) playBuildRiser(durationSec);
  const baseVol = {...session.performance.stemVolumes};
  const targetVolumes = isLofiDeck() ? {
    drums: Math.min(baseVol.drums, 0.50),
    bass: Math.min(baseVol.bass, 0.28),
    chords: Math.min(baseVol.chords, 0.68),
    melody: Math.min(baseVol.melody, 0.58),
    guitar: Math.min(baseVol.guitar, 0.54)
  } : {
    drums: Math.min(baseVol.drums, 0.48),
    bass: Math.min(baseVol.bass, 0.08),
    chords: Math.min(baseVol.chords, 0.58),
    melody: Math.min(baseVol.melody, 0.70),
    guitar: Math.min(baseVol.guitar, 0.52)
  };
  startPerformanceMacro(
    {fx:isLofiDeck() ? {filter:.48, echo:.04, reverb:.28, mix:.58} : {filter:.74, echo:.01, reverb:.18}, volumes:targetVolumes},
    durationSec * 1000,
    () => showStatus(isLofiDeck() ? "Gentle build settled. Warm drop is ready." : "Build peak reached. Drop is ready.")
  );
  renderFxValuesOnly();
  renderMixerValuesOnly();
  showStatus(`${isLofiDeck() ? "Gentle build" : "Building"} ${session.performance.dropTarget ? `towards drop section ${session.performance.dropTarget}` : session.performance.queuedSection ? `into section ${session.performance.queuedSection}` : `over ${bars} bars`}: bass and drums pulling back`);
}
function triggerLofiMacro(kind){
  if(!session) return;
  if(kind === "gentle"){
    triggerBuild();
    return;
  }
  cancelMacroAnimation();
  session.performance.buildActive = kind !== "tape";
  const duration = kind === "rainy" ? beatDur() * session.deck.timeSig * 1.5 : beatDur() * session.deck.timeSig;
  const targets = kind === "rainy"
    ? {fx:{filter:.42, echo:.08, reverb:.42, mix:.68}, volumes:{drums:.44,bass:.36,chords:.72,melody:.52,guitar:.48}}
    : kind === "study"
      ? {fx:{filter:.34, echo:.03, reverb:.24, mix:.55}, volumes:{drums:.38,bass:.42,chords:.70,melody:.34,guitar:.42}}
      : {fx:{filter:.20, echo:.02, reverb:.18, mix:.48}, volumes:{drums:.12,bass:.18,chords:.46,melody:.18,guitar:.22}};
  startPerformanceMacro(targets, duration * 1000, () => {
    if(kind === "tape"){
      restoreBuildSnapshot();
      session.performance.buildActive = false;
      applyMixerAndFx();
      showStatus("Tape stop reset");
    }else{
      showStatus(kind === "rainy" ? "Rainy Drop is tucked and ready" : "Filtered Study Mode active");
    }
  });
  renderFxValuesOnly();
  renderMixerValuesOnly();
  showStatus(kind === "rainy" ? "Rainy Drop: softening drums and adding space" : kind === "study" ? "Filtered Study Mode: low, warm and steady" : "Tape Stop: soft reset");
}
function triggerFunkMacro(kind){
  if(!session) return;
  const macros = session.performance.funkMacros || (session.performance.funkMacros = {oneDrop:false,bassMute:false,slapPopEmphasis:false,ghostLift:false,phraseFill:false});
  if(!(session.deck.audioProfile === FUNK_AUDIO_PROFILE_ID || session.deck.soundProfile?.id === FUNK_AUDIO_PROFILE_ID)){
    showStatus("Funk performance macro ready; source composition unchanged");
  }
  if(kind === "phraseFill") macros.phraseFill = true;
  else macros[kind] = !macros[kind];
  applyMixerAndFx(); autosave(); renderAll();
  const labels = {oneDrop:"One-drop",bassMute:"Bass mute",slapPopEmphasis:"Slap/pop emphasis",ghostLift:"Ghost lift",phraseFill:"Phrase fill"};
  showStatus(`${labels[kind] || kind} ${kind === "phraseFill" ? "queued" : macros[kind] ? "on" : "off"}; source composition unchanged`);
}
function triggerDrop(){
  if(!session) return;
  const target = session.performance.dropTarget || session.performance.queuedSection;
  callPocketAudioCore("triggerDrop", {targetSection: target || state.currentSection, quantize: session.performance.launchQuantize});
  if(!state.playing){
    resetFx(false);
    if(target) jumpToSection(target);
    showStatus(target ? `Drop target loaded: section ${target}` : "Drop reset: mix restored");
    return;
  }
  cancelMacroAnimation();
  if(session.performance.launchQuantize === "instant"){
    session.performance.buildActive = false;
    state.dropQueued = false;
    state.dropBoundaryScheduled = false;
    restoreBuildSnapshot();
    resetPerformanceStemScales(1);
    clearPerformanceFx();
    applyMixerAndFx();
    playDropImpact();
    if(target) jumpToSection(target);
    else renderAll();
    showStatus(target ? `Drop landed instantly on section ${target}` : "Drop landed instantly");
    return;
  }
  if(target) session.performance.queuedSection = target;
  state.dropQueued = true;
  state.dropBoundaryScheduled = false;
  session.performance.buildActive = true;
  autosave();
  renderFxValuesOnly();
  updatePadStates();
  renderTransportState();
  renderSequence();
  const targetText = target ? ` into section ${target}` : "";
  showStatus(`Drop queued for ${launchModeLabel()}${targetText}`);
}
function resetFx(show=true){
  if(!session) return;
  cancelMacroAnimation();
  restoreBuildSnapshot();
  clearPerformanceFx();
  session.performance.fx = {...DEFAULT_FX};
  callPocketAudioCore("setFx", session.performance.fx);
  session.performance.buildActive = false;
  session.performance.funkMacros = {oneDrop:false,bassMute:false,slapPopEmphasis:false,ghostLift:false,phraseFill:false};
  state.dropQueued = false;
  state.dropBoundaryScheduled = false;
  state.dropLanding = false;
  resetPerformanceStemScales(1);
  applyMixerAndFx(); autosave(); renderAll(); if(show) showStatus("FX and build reset");
}

/* 10. UI renderer */
const el = {};
