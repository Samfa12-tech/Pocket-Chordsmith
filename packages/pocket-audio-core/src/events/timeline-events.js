import { DEFAULT_PPQ, SECTION_IDS } from "../constants.js";
import { chordIntervals, chordQuality } from "../music/chords.js";
import { scalePitchClasses } from "../music/scales.js";
import { buildStepTimeline, stepDurationSeconds, stepsPerBar } from "../music/timeline.js";

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
  return {
    scope,
    events: events.sort((a, b) => a.time - b.time || roleOrder(a.stem) - roleOrder(b.stem)),
    duration: baseTime - (options.startTime || 0),
    durationTicks: baseTick - (options.startTick || 0),
    ppq: project.meta.ppq || DEFAULT_PPQ,
    sectionIds: sectionIds.slice()
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
  for (let step = 0; step < totalSteps; step += 1) {
    const time = timeline.times[step];
    const tick = baseTick + stepToTicks(step, meta.resolution, meta.ppq);
    const bar = Math.floor(step / spb) + 1;
    const beat = Math.floor((step % spb) / meta.resolution) + 1;
    addDrumEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
    addBassEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
    addChordEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex });
    addMelodyEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
    addGuitarEvents(events, project, section, { step, time, tick, bar, beat, arrangementIndex, totalSteps });
  }
  return {
    events,
    duration: timeline.duration,
    durationTicks: stepToTicks(totalSteps, meta.resolution, meta.ppq)
  };
}

function addDrumEvents(events, project, section, context) {
  ["kick", "snare", "hat"].forEach((lane) => {
    const levels = section.drums[lane] || [];
    const tuplets = section.drumTuplets[lane] || [];
    if (isTupletSecond(tuplets, context.step)) return;
    const level = Number(levels[context.step] || 0);
    if (isTupletStart(tuplets, context.step, context.totalSteps)) {
      const nextLevel = Number(levels[context.step + 1] || level);
      tripletTimes(project, context.step, context.time).forEach((time, index) => {
        const tupletLevel = index === 2 ? nextLevel : level;
        if (tupletLevel > 0) events.push(baseEvent(project, section, context, {
          time,
          tick: context.tick + tripletTickOffset(index, project.meta.resolution, project.meta.ppq),
          stem: "drums",
          type: lane,
          duration: drumDuration(project, lane, tupletLevel) / 3,
          velocity: drumVelocity(lane, tupletLevel),
          accent: tupletLevel > 1,
          tuplet: true
        }));
      });
    } else if (level > 0) {
      events.push(baseEvent(project, section, context, {
        stem: "drums",
        type: lane,
        duration: drumDuration(project, lane, level),
        velocity: drumVelocity(lane, level),
        accent: level > 1
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
    tripletTimes(project, context.step, context.time).forEach((time, index) => {
      const sourceStep = index === 2 ? context.step + 1 : context.step;
      if (!active(sourceStep)) return;
      events.push(baseEvent(project, section, { ...context, step: sourceStep }, {
        time,
        tick: context.tick + tripletTickOffset(index, project.meta.resolution, project.meta.ppq),
        stem: "bass",
        type: "bass",
        duration: Math.max(0.08, spanDuration(project, context.step, 2) / 3 * 0.86),
        velocity: bassAccent(section, sourceStep) ? 0.42 : 0.34,
        accent: bassAccent(section, sourceStep),
        midi: bassMidiAt(project, section, sourceStep),
        tuplet: true
      }));
    });
    return;
  }
  const phrase = phraseDuration(project, section.bass.hold, section.bass.slide, context.step, context.totalSteps);
  events.push(baseEvent(project, section, context, {
    stem: "bass",
    type: "bass",
    duration: phrase.duration,
    velocity: bassAccent(section, context.step) ? 0.42 : 0.34,
    accent: bassAccent(section, context.step),
    midi: bassMidiAt(project, section, context.step),
    slideMidi: phrase.slideStep === null ? undefined : bassMidiAt(project, section, phrase.slideStep),
    slideOffset: phrase.slideOffset
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
      velocity: project.mixer.stems.chords?.volume ?? 0.72,
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
      const notes = [note, Math.round((note + next) / 2), next];
      tripletTimes(project, context.step, context.time).forEach((time, index) => {
        events.push(baseEvent(project, section, context, {
          idSuffix: `_${trackIndex}_${index}`,
          time,
          tick: context.tick + tripletTickOffset(index, project.meta.resolution, project.meta.ppq),
          stem: "melody",
          type: "melody",
          duration: Math.max(0.08, spanDuration(project, context.step, 2) / 3 * 0.86),
          velocity: project.mixer.stems.melody?.volume ?? 0.65,
          midi: melodyMidiAt(project, notes[index], track.octave),
          instrument: track.instrument,
          pan: track.pan,
          tuplet: true
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
      velocity: project.mixer.stems.melody?.volume ?? 0.65,
      midi: melodyMidiAt(project, note, track.octave),
      instrument: track.instrument,
      pan: track.pan,
      slideMidi: phrase.slideStep === null ? undefined : melodyMidiAt(project, track.notes[phrase.slideStep], track.octave),
      slideOffset: phrase.slideOffset
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
    direction: guitarDirection(context.step, section.guitar.strumMode)
  }));
}

function baseEvent(project, section, context, patch) {
  const event = {
    id: `${section.id}_${context.arrangementIndex}_${patch.stem}_${patch.type}_${context.step}${patch.idSuffix || ""}`,
    time: patch.time ?? context.time,
    duration: patch.duration ?? stepDurationSeconds(project.meta, context.step),
    tick: patch.tick ?? context.tick,
    durationTicks: Math.max(1, Math.round(((patch.duration ?? stepDurationSeconds(project.meta, context.step)) / beatSeconds(project)) * project.meta.ppq)),
    step: context.step,
    bar: context.bar,
    beat: context.beat,
    sectionId: section.id,
    arrangementIndex: context.arrangementIndex,
    stem: patch.stem,
    type: patch.type,
    velocity: patch.velocity ?? 1,
    accent: Boolean(patch.accent),
    tuplet: Boolean(patch.tuplet)
  };
  ["midi", "midiNotes", "instrument", "articulation", "pan", "slideMidi", "slideOffset", "direction"].forEach((key) => {
    if (patch[key] !== undefined) event[key] = patch[key];
  });
  return event;
}

function roleOrder(stem) {
  return ["drums", "bass", "chords", "melody", "guitar"].indexOf(stem);
}

function currentChord(project, section, step) {
  const barIndex = Math.floor(step / stepsPerBar(project));
  const degree = Math.max(0, Math.min(6, Number(section.progression[barIndex] ?? 0)));
  const pcs = scalePitchClasses(project.meta.key, project.meta.scale);
  const quality = chordQuality(project.meta.scale, degree);
  return { degree, rootPc: pcs[degree], quality, intervals: chordIntervals(section.chords.type, quality) };
}

function chordMidiNotes(project, section, chord) {
  const root = 48 + chord.rootPc + (section.chords.octave || 0) * 12;
  const notes = chord.intervals.map((interval, index) => root + interval + (index === 0 ? 0 : 12));
  return section.chords.playMode === "strum_down" || section.chords.playMode === "arp_down" ? notes.reverse() : notes;
}

function powerChordNotes(_project, section, chord) {
  const register = section.guitar.register || "low";
  const min = register === "high" ? 52 : register === "mid" ? 45 : 35;
  const max = register === "high" ? 64 : register === "mid" ? 57 : 47;
  let root = 24 + chord.rootPc;
  while (root < min) root += 12;
  while (root > max) root -= 12;
  return [root, root + 7, root + 12].map((note) => Math.max(0, Math.min(127, note)));
}

function melodyMidiAt(project, noteIndex, octave = 0) {
  const safe = Math.max(0, Math.min(23, Number(noteIndex) || 0));
  if (project.meta.melodyPitchMode === "chromatic") return 72 + safe + octave * 12;
  const pcs = scalePitchClasses(project.meta.key, project.meta.scale);
  return 72 + pcs[safe % 7] + (Math.floor(safe / 7) + octave) * 12;
}

function bassMidiAt(project, section, step) {
  if (section.bass.mode === "manual" && section.bass.notes[step] !== null && section.bass.notes[step] !== undefined) {
    const pcs = scalePitchClasses(project.meta.key, project.meta.scale);
    const safe = Math.max(0, Math.min(13, Number(section.bass.notes[step]) || 0));
    return 36 + pcs[safe % 7] + Math.floor(safe / 7) * 12;
  }
  return 36 + currentChord(project, section, step).rootPc;
}

function phraseDuration(project, holds, slides, step, totalSteps) {
  let duration = 0;
  let index = step;
  do {
    duration += stepDurationSeconds(project.meta, index);
    index += 1;
  } while (index < totalSteps && holds[index]);
  let slideStep = null;
  let slideOffset = null;
  if (index < totalSteps && slides[index]) {
    slideStep = index;
    slideOffset = duration;
    do {
      duration += stepDurationSeconds(project.meta, index);
      index += 1;
    } while (index < totalSteps && holds[index]);
  }
  return { duration: Math.max(0.08, duration * 0.92), slideStep, slideOffset };
}

function chordRhythmStarts(project, barStart, mode) {
  const beat = beatSeconds(project);
  if (mode === "quarter") return Array.from({ length: project.meta.timeSig }, (_, index) => [barStart + index * beat, beat * 0.9]);
  if (mode === "half") {
    const starts = [[barStart, beat * 1.8]];
    if (project.meta.timeSig >= 4) starts.push([barStart + beat * 2, beat * 1.8]);
    else if (project.meta.timeSig === 3) starts.push([barStart + beat * 1.5, beat * 1.2]);
    return starts;
  }
  return [[barStart, beat * project.meta.timeSig * 0.92]];
}

function isTupletStart(tuplets, step, totalSteps) {
  return step < totalSteps - 1 && Boolean(tuplets?.[step]);
}

function isTupletSecond(tuplets, step) {
  return step > 0 && Boolean(tuplets?.[step - 1]);
}

function tripletTimes(project, step, start) {
  const span = spanDuration(project, step, 2);
  return [start, start + span / 3, start + span * 2 / 3];
}

function spanDuration(project, step, span) {
  let out = 0;
  for (let offset = 0; offset < span; offset += 1) out += stepDurationSeconds(project.meta, step + offset);
  return out;
}

function stepToTicks(step, resolution, ppq = DEFAULT_PPQ) {
  return Math.round((step / resolution) * ppq);
}

function tripletTickOffset(index, resolution, ppq) {
  return Math.round((index / 3) * (2 / resolution) * ppq);
}

function beatSeconds(project) {
  return 60 / project.meta.bpm;
}

function drumDuration(project, lane, level) {
  const stepDur = stepDurationSeconds(project.meta, 0);
  if (lane === "kick") return Math.min(0.1, stepDur * 0.7);
  if (lane === "snare") return Math.min(0.08, stepDur * 0.7);
  return Math.min(level > 1 ? 0.12 : 0.025, stepDur * (level > 1 ? 0.75 : 0.7));
}

function drumVelocity(lane, level) {
  if (lane === "kick") return level > 1 ? 1.12 : 0.95;
  if (lane === "snare") return level > 1 ? 0.72 : 0.5;
  return level > 1 ? 0.24 : 0.16;
}

function bassAccent(section, step) {
  return section.bass.mode === "manual" ? Boolean(section.bass.accent[step]) : Number(section.bass.grid[step] || 0) > 1;
}

function guitarDuration(project, section, step, articulation, totalSteps) {
  if (articulation === "chug" || articulation === "scratch") return Math.min(0.16, stepDurationSeconds(project.meta, step) * 0.82);
  let duration = stepDurationSeconds(project.meta, step);
  let index = step + 1;
  while (index < totalSteps && section.guitar.pattern[index] === "hold") {
    duration += stepDurationSeconds(project.meta, index);
    index += 1;
  }
  return Math.max(0.18, duration * 0.92);
}

function guitarDirection(step, mode) {
  if (mode === "up") return "up";
  if (mode === "alternate") return step % 2 ? "up" : "down";
  return "down";
}
