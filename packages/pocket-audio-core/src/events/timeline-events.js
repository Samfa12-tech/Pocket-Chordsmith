import { DEFAULT_PPQ, DEFAULT_STEM_MIX, SECTION_IDS } from "../constants.js";
import {
  chordsmithAutoBassMidi,
  chordsmithBassIndexToMidi,
  chordsmithChordForStep,
  chordsmithChordMidiNotes,
  chordsmithMelodyIndexToMidi,
  chordsmithPowerChordNotes
} from "../music/pitches.js";
import { beatDurationSeconds, buildStepTimeline, spanDurationSeconds, stepDurationSeconds, stepsPerBar, tripletTimesForSpan } from "../music/timeline.js";
import { chordsmithChordRhythmStarts } from "../performance/chord-rhythm.js";
import { chordsmithDrumPeak, chordsmithDrumStepDuration, chordsmithDrumTupletDuration } from "../performance/drum-feel.js";
import { chordsmithGuitarStepDuration } from "../performance/guitar-gates.js";
import { chordsmithHumanizeOffset, chordsmithHumanizePeak } from "../performance/humanize.js";
import { chordsmithPhraseInfo } from "../performance/phrases.js";
import { chordsmithPitchedTupletDuration, chordsmithPitchedTupletMiddleIndex, chordsmithPitchedTupletMiddleMidi } from "../performance/tuplets.js";
import { DEFAULT_GUITAR_STRUM_MODE } from "../sounds/guitar.js";
import { CHORDSMITH_SEQUENCED_DRUM_LANE_IDS, normalisePocketAudioDrumLane } from "../sounds/drum-lanes.js";
import { normalisePocketAudioArticulation } from "../performance/expression.js";
import { createPocketAudioRendererCapabilityReport } from "../engine/capabilities.js";

export function buildPocketAudioTimeline(project, options = {}) {
  if (!project || project.app !== "PocketAudioProject") throw new Error("buildPocketAudioTimeline expects a normalised PocketAudioProject.");
  const scope = options.scope || "sequence";
  const sectionIds = resolveTimelineSectionIds(project, { ...options, scope });
  const events = [];
  let baseTime = options.startTime || 0;
  let baseTick = options.startTick || 0;
  sectionIds.forEach((sectionId, arrangementIndex) => {
    const section = project.sections[sectionId] || project.sections.A;
    const sectionEvents = buildSectionEvents(project, section, { baseTime, baseTick, arrangementIndex });
    events.push(...sectionEvents.events);
    baseTime += sectionEvents.duration;
    baseTick += sectionEvents.durationTicks;
  });
  const capabilityReport = createPocketAudioRendererCapabilityReport(project, { renderer: options.renderer || "offline" });
  const eventLosses = events.flatMap((event) => event.compatibility || []);
  return {
    scope,
    events: events.sort((a, b) => a.time - b.time || roleOrder(a.stem) - roleOrder(b.stem)),
    duration: baseTime - (options.startTime || 0),
    durationTicks: baseTick - (options.startTick || 0),
    ppq: project.meta.ppq || DEFAULT_PPQ,
    sectionIds: sectionIds.slice(),
    capabilityReport,
    lossReport: [...capabilityReport.losses, ...eventLosses]
  };
}

function resolveTimelineSectionIds(project, options) {
  if (Array.isArray(options.sectionIds) && options.sectionIds.length) {
    const sectionIds = options.sectionIds.map(normaliseSectionId).filter(Boolean);
    if (sectionIds.length) return sectionIds;
  }
  if (options.scope === "section") return [normaliseSectionId(options.sectionId || project.transport.currentSection || "A") || "A"];
  if (options.scope === "all") return SECTION_IDS.slice();
  const sequence = Array.isArray(project.sequence) ? project.sequence.map(normaliseSectionId).filter(Boolean) : [];
  return sequence.length ? sequence : [normaliseSectionId(project.transport.currentSection || "A") || "A"];
}

function normaliseSectionId(value) {
  const safe = String(value || "").toUpperCase();
  return SECTION_IDS.includes(safe) ? safe : null;
}

export function buildSectionEvents(project, section, { baseTime = 0, baseTick = 0, arrangementIndex = 0 } = {}) {
  const meta = project.meta;
  const spb = stepsPerBar(project);
  const totalSteps = section.bars * spb;
  const timeline = buildStepTimeline({
    stepCount: totalSteps,
    startTime: baseTime,
    bpm: meta.bpm,
    resolution: meta.resolution,
    swing: meta.swing
  });
  const events = [];
  const rich = buildRichSectionEvents(project, section, { baseTime, baseTick, arrangementIndex, timeline, totalSteps, spb });
  events.push(...rich.events);
  for (let step = 0; step < totalSteps; step += 1) {
    const time = timeline.times[step];
    const tick = baseTick + stepToTicks(step, meta.resolution, meta.ppq);
    const bar = Math.floor(step / spb) + 1;
    const beat = Math.floor((step % spb) / meta.resolution) + 1;
    if (!rich.ownedStems.has("drums")) addDrumEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
    if (!rich.ownedStems.has("bass")) addBassEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
    if (!rich.ownedStems.has("chords")) addChordEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex });
    if (!rich.ownedStems.has("melody")) addMelodyEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
    if (!rich.ownedStems.has("guitar")) addGuitarEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
  }
  return {
    events,
    duration: timeline.duration,
    durationTicks: stepToTicks(totalSteps, meta.resolution, meta.ppq)
  };
}

function buildRichSectionEvents(project, section, context) {
  const events = [];
  const ownedStems = new Set();
  Object.entries(section.richTracks || {}).forEach(([trackId, track]) => {
    const sourceEvents = Array.isArray(track?.events) ? track.events : [];
    if (!sourceEvents.length) return;
    const stem = richTrackStem(trackId, track);
    if (!richTrackOwnsStem(project, track)) return;
    ownedStems.add(stem);
    let previousPitched = null;
    sourceEvents.forEach((source, index) => {
      const localTick = source.tick === undefined
        ? stepToTicks(Number(source.step || 0), project.meta.resolution, project.meta.ppq)
        : Math.max(0, Number(source.tick || 0));
      const authoredStep = source.step === undefined ? localTick / project.meta.ppq * project.meta.resolution : Number(source.step || 0);
      const step = Math.max(0, Math.min(context.totalSteps - 0.000001, authoredStep));
      const time = source.tick === undefined
        ? timeAtStep(context.timeline, step)
        : context.baseTime + localTick / project.meta.ppq * beatSeconds(project);
      const durationTicks = source.durationTicks ?? Math.max(1, stepToTicks(Number(source.duration || 1), project.meta.resolution, project.meta.ppq));
      const duration = durationTicks / project.meta.ppq * beatSeconds(project);
      const lane = stem === "drums" ? normalisePocketAudioDrumLane(source.lane || source.sound || trackId) : undefined;
      const midi = richSingleMidi(source);
      const midiNotes = richPolyMidi(source);
      const requestedArticulation = normalisePocketAudioArticulation(source.articulation || defaultRichArticulation(stem, lane));
      const connectedInvalid = (requestedArticulation === "hammer" || requestedArticulation === "pull") && previousPitched === null;
      const articulation = connectedInvalid ? "finger" : requestedArticulation;
      const compatibility = connectedInvalid ? [{
        path: `sections.${section.id}.tracks.${trackId}.events[${index}].articulation`,
        feature: `bass-articulation:${requestedArticulation}`,
        action: "fallback",
        fallback: "finger",
        message: `${requestedArticulation} requires a previous pitched event and rendered as finger.`
      }] : [];
      const patch = {
        idSuffix: `_rich_${safeId(trackId)}_${index}`,
        time,
        tick: context.baseTick + localTick,
        durationTicks,
        stem,
        type: richEventType(stem, lane),
        duration,
        velocity: normaliseRichVelocity(source.velocity),
        accent: articulation === "accent" || Number(source.velocity || 0) >= 112,
        midi,
        midiNotes,
        instrument: source.sound || richDefaultSound(project, section, stem),
        articulation,
        sourceArticulation: connectedInvalid ? requestedArticulation : undefined,
        sound: source.sound,
        lane,
        role: source.role,
        expression: source.expression,
        technique: source.technique,
        note: source.note,
        notes: source.notes,
        sourceDuration: source.duration,
        trackId,
        compatibility,
        pan: source.pan,
        humanizeVelocity: false
      };
      if (stem === "bass") patch.bassTone = source.sound || projectSoundBassTone(project);
      if (stem === "drums") patch.drumKit = projectSoundDrumKit(project);
      events.push(baseEvent(project, section, {
        step,
        time,
        tick: context.baseTick + localTick,
        bar: Math.floor(step / context.spb) + 1,
        beat: Math.floor((step % context.spb) / project.meta.resolution) + 1,
        arrangementIndex: context.arrangementIndex
      }, patch));
      if (midi !== undefined || midiNotes?.length) previousPitched = midi ?? midiNotes[0];
    });
  });
  return { events, ownedStems };
}

function richTrackOwnsStem(project, track) {
  const profileId = String(project.soundProfile?.id || project.meta?.audioProfile || "standard");
  const compactMirror = track?.compatibility?.compactMirror === true;
  return !compactMirror || !["standard", "lofi_chill"].includes(profileId);
}

function addDrumEvents(events, project, section, context) {
  const drumKit = projectSoundDrumKit(project);
  CHORDSMITH_SEQUENCED_DRUM_LANE_IDS.forEach((lane) => {
    const levels = section.drums[lane] || [];
    const tuplets = section.drumTuplets[lane] || [];
    if (isTupletSecond(tuplets, context.step)) return;
    const level = Number(levels[context.step] || 0);
    if (isTupletStart(tuplets, context.step, context.totalSteps)) {
      const nextLevel = Number(levels[context.step + 1] || level);
      const spanDur = spanDuration(project, context.step, 2);
      tripletTimes(project, context.step, context.time).forEach((time, index) => {
        const tupletLevel = index === 2 ? nextLevel : level;
        if (tupletLevel > 0) events.push(baseEvent(project, section, context, {
          time,
          tick: context.tick + tripletTickOffset(index, project.meta.resolution, project.meta.ppq),
          stem: "drums",
          type: lane,
          duration: chordsmithDrumTupletDuration({ lane, level: tupletLevel, spanDuration: spanDur }),
          velocity: chordsmithDrumPeak(lane, tupletLevel),
          accent: tupletLevel > 1,
          tuplet: true,
          drumKit,
          humanizeSeed: seedForDrum(lane),
          humanizeStep: context.step + index
        }));
      });
    } else if (level > 0) {
      events.push(baseEvent(project, section, context, {
        stem: "drums",
        type: lane,
        duration: chordsmithDrumStepDuration({
          lane,
          level,
            stepDuration: stepDurationSeconds(project.meta, context.step)
          }),
        velocity: chordsmithDrumPeak(lane, level),
        accent: level > 1,
        drumKit,
        humanizeSeed: seedForDrum(lane)
      }));
    }
  });
}

function addBassEvents(events, project, section, context) {
  if (project.mixer.stems.bass?.mute) return;
  if (section.bass.hold[context.step] || section.bass.slide[context.step]) return;
  const source = section.bass.mode === "manual" ? section.bass.notes : section.bass.grid;
  const active = (step) => section.bass.mode === "manual" ? source[step] !== null && source[step] !== undefined : Number(source[step] || 0) > 0;
  if (!active(context.step)) return;
  const tuplets = section.drumTuplets.bass || [];
  if (isTupletSecond(tuplets, context.step)) return;
  if (isTupletStart(tuplets, context.step, context.totalSteps)) {
    const leftMidi = bassMidiAt(project, section, context.step);
    const rightMidi = bassMidiAt(project, section, context.step + 1);
    const midMidi = chordsmithPitchedTupletMiddleMidi(leftMidi, rightMidi);
    const spanDur = spanDuration(project, context.step, 2);
    const notes = [leftMidi, midMidi, rightMidi ?? leftMidi];
    tripletTimes(project, context.step, context.time).forEach((time, index) => {
      const sourceStep = index === 2 ? context.step + 1 : context.step;
      if (!active(sourceStep)) return;
      const midi = notes[index];
      if (midi === null || midi === undefined) return;
      events.push(baseEvent(project, section, context, {
        time,
        tick: context.tick + tripletTickOffset(index, project.meta.resolution, project.meta.ppq),
        stem: "bass",
        type: "bass",
        duration: chordsmithPitchedTupletDuration(spanDur),
        velocity: bassAccent(section, sourceStep) ? 0.42 : 0.34,
        accent: bassAccent(section, sourceStep),
        midi,
        tuplet: true,
        bassTone: projectSoundBassTone(project),
        articulation: section.bass.articulation?.[sourceStep] || undefined,
        humanizeSeed: 4,
        humanizeStep: context.step + index
      }));
    });
    return;
  }
  const phrase = phraseDuration(project, section.bass.hold, section.bass.slide, context.step, context.totalSteps, "bass");
  events.push(baseEvent(project, section, context, {
    stem: "bass",
    type: "bass",
    duration: phrase.duration,
    velocity: bassAccent(section, context.step) ? 0.42 : 0.34,
    accent: bassAccent(section, context.step),
    midi: bassMidiAt(project, section, context.step),
    slideMidi: phrase.slideStep === null ? undefined : bassMidiAt(project, section, phrase.slideStep),
    slideOffset: phrase.slideOffset,
    bassTone: projectSoundBassTone(project),
    articulation: section.bass.articulation?.[context.step] || undefined,
    humanizeSeed: 4
  }));
}

function addChordEvents(events, project, section, context) {
  if (project.mixer.stems.chords?.mute || !section.chords.enabled) return;
  if (context.step % stepsPerBar(project) !== 0) return;
  const chord = currentChord(project, section, context.step);
  chordRhythmStarts(project, context.time, section.chords.rhythmMode).forEach(([time, duration], index) => {
    events.push(baseEvent(project, section, context, {
      idSuffix: `_${index}`,
      time,
      tick: context.tick + Math.round((time - context.time) / beatSeconds(project) * project.meta.ppq),
      stem: "chords",
      type: "chord",
      duration,
      velocity: project.mixer.stems.chords?.volume ?? DEFAULT_STEM_MIX.chords.volume,
      midiNotes: chordMidiNotes(project, section, chord),
      instrument: section.chords.instrument,
      articulation: section.chords.playMode
    }));
  });
}

function addMelodyEvents(events, project, section, context) {
  if (project.mixer.stems.melody?.mute) return;
  const anySolo = section.melody.some((track) => track.solo);
  section.melody.forEach((track, trackIndex) => {
    if (track.mute || (anySolo && !track.solo)) return;
    if (track.hold[context.step] || track.slide[context.step] || isTupletSecond(track.tuplets, context.step)) return;
    const note = track.notes[context.step];
    if (note === null || note === undefined) return;
    if (isTupletStart(track.tuplets, context.step, context.totalSteps)) {
      const next = track.notes[context.step + 1] ?? note;
      const notes = [note, chordsmithPitchedTupletMiddleIndex(note, next, { melodyPitchMode: project.meta.melodyPitchMode }), next];
      const spanDur = spanDuration(project, context.step, 2);
      tripletTimes(project, context.step, context.time).forEach((time, index) => {
        events.push(baseEvent(project, section, context, {
          idSuffix: `_${trackIndex}_${index}`,
          time,
          tick: context.tick + tripletTickOffset(index, project.meta.resolution, project.meta.ppq),
          stem: "melody",
          type: "melody",
          duration: chordsmithPitchedTupletDuration(spanDur),
          velocity: project.mixer.stems.melody?.volume ?? DEFAULT_STEM_MIX.melody.volume,
          midi: melodyMidiAt(project, notes[index], track.octave),
          instrument: track.instrument,
          pan: track.pan,
          tuplet: true,
          humanizeSeed: 10 + trackIndex,
          humanizeStep: context.step + index
        }));
      });
      return;
    }
    const phrase = phraseDuration(project, track.hold, track.slide, context.step, context.totalSteps);
    events.push(baseEvent(project, section, context, {
      idSuffix: `_${trackIndex}`,
      stem: "melody",
      type: "melody",
      duration: phrase.duration,
      velocity: project.mixer.stems.melody?.volume ?? DEFAULT_STEM_MIX.melody.volume,
      midi: melodyMidiAt(project, note, track.octave),
      instrument: track.instrument,
      pan: track.pan,
      slideMidi: phrase.slideStep === null ? undefined : melodyMidiAt(project, track.notes[phrase.slideStep], track.octave),
      slideOffset: phrase.slideOffset,
      humanizeSeed: 10 + trackIndex
    }));
  });
}

function addGuitarEvents(events, project, section, context) {
  if (project.mixer.stems.guitar?.mute || !section.guitar.enabled) return;
  const art = section.guitar.pattern[context.step];
  if (!art || art === "off" || art === "hold") return;
  const chord = currentChord(project, section, context.step);
  events.push(baseEvent(project, section, context, {
    stem: "guitar",
    type: "guitar",
    duration: guitarDuration(project, section, context.step, art, context.totalSteps),
    velocity: section.guitar.volume,
    midiNotes: powerChordNotes(project, section, chord),
    instrument: section.guitar.tone,
    articulation: art,
    direction: guitarDirection(context.step, section.guitar.strumMode),
    humanizeSeed: 17,
    humanizeVelocity: false
  }));
}

function baseEvent(project, section, context, patch) {
  const humanizeStep = patch.humanizeStep ?? context.step;
  const time = patch.time ?? context.time;
  const velocity = patch.velocity ?? 1;
  const event = {
    id: `${section.id}_${context.arrangementIndex}_${patch.stem}_${patch.type}_${context.step}${patch.idSuffix || ""}`,
    time: humanizedTime(project, time, humanizeStep, patch.humanizeSeed),
    duration: patch.duration ?? stepDurationSeconds(project.meta, context.step),
    tick: patch.tick ?? context.tick,
    durationTicks: patch.durationTicks ?? Math.max(1, Math.round(((patch.duration ?? stepDurationSeconds(project.meta, context.step)) / beatSeconds(project)) * project.meta.ppq)),
    step: context.step,
    bar: context.bar,
    beat: context.beat,
    sectionId: section.id,
    arrangementIndex: context.arrangementIndex,
    stem: patch.stem,
    type: patch.type,
    velocity: patch.humanizeVelocity === false ? velocity : humanizedPeak(project, velocity, humanizeStep, patch.humanizeSeed),
    accent: Boolean(patch.accent),
    tuplet: Boolean(patch.tuplet),
    audioProfile: project.meta.audioProfile || "standard",
    lofiPreset: project.lofi?.presetId || "",
    chipPreset: project.chip?.presetId || "",
    metalPreset: project.metal?.presetId || "",
    funkPreset: project.funk?.presetId || "",
    westernPreset: project.western?.presetId || "",
    soundProfile: cloneJson(project.soundProfile || { id: project.meta.audioProfile || "standard", preset: "", parameters: {}, recipeVersion: 1 })
  };
  ["midi", "midiNotes", "instrument", "articulation", "sourceArticulation", "pan", "slideMidi", "slideOffset", "direction", "drumKit", "bassTone", "sound", "lane", "role", "expression", "technique", "note", "notes", "sourceDuration", "trackId", "compatibility"].forEach((key) => {
    if (patch[key] !== undefined) event[key] = patch[key];
  });
  if (project.lofi?.texture?.enabled) event.lofiTexture = cloneJson(project.lofi.texture);
  if (project.chip?.texture?.enabled) event.chipTexture = cloneJson(project.chip.texture);
  if (project.metal?.texture?.enabled) event.metalTexture = cloneJson(project.metal.texture);
  return event;
}

function projectSoundDrumKit(project) {
  if (project.meta.audioProfile === "chip_arcade" || project.meta.audioProfile === "chip_tune") return project.chip?.drumKit || "chip_noise_kit";
  if (project.meta.audioProfile === "heavy_metal") return project.metal?.drumKit || "metal_tight";
  if (project.meta.audioProfile === "funk_groove") return project.funk?.drumKit || "funk_dry_pocket";
  if (project.meta.audioProfile === "western_frontier") return project.western?.drumKit || "western_train_kit";
  return project.lofi?.drumKit || "classic";
}

function projectSoundBassTone(project) {
  if (project.meta.audioProfile === "chip_arcade" || project.meta.audioProfile === "chip_tune") return project.chip?.bassTone || "chip_triangle_bass";
  if (project.meta.audioProfile === "heavy_metal") return project.metal?.bassTone || "metal_pick_bass";
  if (project.meta.audioProfile === "funk_groove") return project.funk?.bassTone || "funk_finger_pocket";
  if (project.meta.audioProfile === "western_frontier") return project.western?.bassTone || "western_picked_bass";
  return project.lofi?.bassTone || "classic";
}

function humanizedTime(project, time, step, seed) {
  if (seed === undefined || seed === null) return time;
  return Math.max(0, time + chordsmithHumanizeOffset(step, seed, project.meta.humanizeOn));
}

function humanizedPeak(project, value, step, seed) {
  if (seed === undefined || seed === null) return value;
  return chordsmithHumanizePeak(value, step, seed, project.meta.humanizeOn);
}

function seedForDrum(lane) {
  if (lane === "kick") return 1;
  if (lane === "snare") return 2;
  return 3;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function roleOrder(stem) {
  return ["drums", "bass", "chords", "melody", "guitar"].indexOf(stem);
}

function currentChord(project, section, step) {
  return chordsmithChordForStep({
    key: project.meta.key,
    scale: project.meta.scale,
    chordType: section.chords.type,
    timeSig: project.meta.timeSig,
    resolution: project.meta.resolution,
    progression: section.progression,
    step
  });
}

function chordMidiNotes(project, section, chord) {
  return chordsmithChordMidiNotes({
    chord,
    chordOctave: section.chords.octave,
    chordPlayMode: section.chords.playMode
  });
}

function powerChordNotes(_project, section, chord) {
  return chordsmithPowerChordNotes({ rootPc: chord.rootPc, guitarRegister: section.guitar.register });
}

function melodyMidiAt(project, noteIndex, octave = 0) {
  return chordsmithMelodyIndexToMidi({
    key: project.meta.key,
    scale: project.meta.scale,
    melodyPitchMode: project.meta.melodyPitchMode,
    noteIndex,
    octave
  });
}

function bassMidiAt(project, section, step) {
  if (section.bass.mode === "manual" && section.bass.notes[step] !== null && section.bass.notes[step] !== undefined) {
    return chordsmithBassIndexToMidi({
      key: project.meta.key,
      scale: project.meta.scale,
      noteIndex: section.bass.notes[step]
    });
  }
  return chordsmithAutoBassMidi({ rootPc: currentChord(project, section, step).rootPc });
}

function phraseDuration(project, holds, slides, step, totalSteps, role = "melody") {
  return chordsmithPhraseInfo({
    step,
    totalSteps,
    role,
    stepDurationAt: (index) => stepDurationSeconds(project.meta, index),
    holdAt: (index) => Boolean(holds[index]),
    slideAt: (index) => Boolean(slides[index])
  });
}

function chordRhythmStarts(project, barStart, mode) {
  return chordsmithChordRhythmStarts({
    mode,
    barStart,
    beatDuration: beatSeconds(project),
    timeSig: project.meta.timeSig
  });
}

function isTupletStart(tuplets, step, totalSteps) {
  return step < totalSteps - 1 && Boolean(tuplets?.[step]);
}

function isTupletSecond(tuplets, step) {
  return step > 0 && Boolean(tuplets?.[step - 1]);
}

function tripletTimes(project, step, start) {
  return tripletTimesForSpan(start, spanDuration(project, step, 2));
}

function spanDuration(project, step, span) {
  return spanDurationSeconds(project.meta, step, span);
}

function stepToTicks(step, resolution, ppq = DEFAULT_PPQ) {
  return Math.round((step / resolution) * ppq);
}

function tripletTickOffset(index, resolution, ppq) {
  return Math.round((index / 3) * (2 / resolution) * ppq);
}

function beatSeconds(project) {
  return beatDurationSeconds(project.meta);
}

function bassAccent(section, step) {
  return section.bass.mode === "manual" ? Boolean(section.bass.accent[step]) : Number(section.bass.grid[step] || 0) > 1;
}

function guitarDuration(project, section, step, articulation, totalSteps) {
  const stepDur = stepDurationSeconds(project.meta, step);
  let duration = stepDur;
  let index = step + 1;
  while (index < totalSteps && section.guitar.pattern[index] === "hold") {
    duration += stepDurationSeconds(project.meta, index);
    index += 1;
  }
  return chordsmithGuitarStepDuration({ stepDuration: stepDur, heldDuration: duration, articulation });
}

function guitarDirection(step, mode) {
  if (mode === "up") return "up";
  if (mode === "alternate") return step % 2 ? "up" : DEFAULT_GUITAR_STRUM_MODE;
  return DEFAULT_GUITAR_STRUM_MODE;
}

function richTrackStem(trackId, track) {
  const requested = String(track?.stem || track?.role || trackId || "").toLowerCase();
  if (["drums", "drum", "kick", "snare", "rim", "clap", "hat", "hat_closed", "hat_open", "ride", "crash", "china", "tom_high", "tom_mid", "tom_low", "percussion"].includes(requested)) return "drums";
  if (requested === "bass") return "bass";
  if (["chord", "chords", "harmony", "stab", "stabs"].includes(requested)) return "chords";
  if (requested === "guitar") return "guitar";
  return "melody";
}

function richEventType(stem, lane) {
  if (stem === "drums") return lane || "percussion";
  if (stem === "chords") return "chord";
  if (stem === "melody") return "melody";
  return stem;
}

function richSingleMidi(source) {
  if (source.midi !== undefined) return Number(source.midi);
  if (source.note === undefined || Array.isArray(source.note)) return undefined;
  return Number(source.note);
}

function richPolyMidi(source) {
  if (Array.isArray(source.midiNotes)) return source.midiNotes.map(Number);
  if (!Array.isArray(source.notes)) return undefined;
  return source.notes.map(Number);
}

function richDefaultSound(project, section, stem) {
  if (stem === "bass") return projectSoundBassTone(project);
  if (stem === "chords") return section.chords.instrument;
  if (stem === "guitar") return section.guitar.tone;
  if (stem === "melody") return section.melody[0]?.instrument;
  return undefined;
}

function defaultRichArticulation(stem, lane) {
  if (stem === "drums") return lane === "hat_open" ? "open" : "finger";
  return "finger";
}

function normaliseRichVelocity(value) {
  const number = Number(value ?? 100);
  return Math.max(0, Math.min(1, number > 1 ? number / 127 : number));
}

function timeAtStep(timeline, step) {
  const leftIndex = Math.floor(step);
  const fraction = step - leftIndex;
  const left = timeline.times[leftIndex] ?? 0;
  const right = timeline.times[leftIndex + 1] ?? (left + timeline.duration / Math.max(1, timeline.times.length));
  return left + (right - left) * fraction;
}

function safeId(value) {
  return String(value || "track").replace(/[^a-z0-9_-]/gi, "_");
}
