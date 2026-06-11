import type { Clip, PocketDawProject, TrackRole } from "../daw/schema";
import { sortClips } from "../daw/timeline";
import { clipSourceStartBar } from "../daw/clips";
import { midiDataFromClip } from "../daw/midiClips";
import type { SanitizedPcsProject, SanitizedPcsSection } from "../compatibility/pcsSanitizer";

export type RenderedEventKind = "kick" | "snare" | "hat" | "bass" | "chord" | "melody" | "guitar" | "midi";

export interface RenderedEvent {
  id: string;
  clipId: string;
  kind: RenderedEventKind;
  trackId: string;
  role: TrackRole;
  time: number;
  duration: number;
  bar: number;
  step: number;
  midi?: number;
  midiNotes?: number[];
  velocity: number;
  pan?: number;
  instrument?: string;
  accent?: boolean;
  articulation?: string;
  slideMidi?: number;
  slideOffset?: number;
  direction?: "down" | "up";
}

export interface RenderContext {
  pcsSources: Map<string, SanitizedPcsProject>;
  primaryPcsSource: SanitizedPcsProject | null;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function renderTimelineEvents(project: PocketDawProject): RenderedEvent[] {
  const context = buildRenderContext(project);
  return sortClips(project.timeline.clips)
    .flatMap((clip) => resolveClipEvents(project, clip, context))
    .sort((a, b) => a.time - b.time || roleOrder(a.role) - roleOrder(b.role));
}

export function projectDurationSeconds(project: PocketDawProject): number {
  const secondsPerBar = project.project.timeSig * (60 / project.project.bpm);
  return Math.max(1, project.timeline.bars * secondsPerBar);
}

export function buildRenderContext(project: PocketDawProject): RenderContext {
  const pcsSources = new Map<string, SanitizedPcsProject>();
  project.sourceRefs.forEach((ref) => {
    if (ref.sourceType !== "pocket-chordsmith" || !ref.normalized) return;
    pcsSources.set(ref.id, ref.normalized as unknown as SanitizedPcsProject);
  });
  return {
    pcsSources,
    primaryPcsSource: pcsSources.values().next().value || null
  };
}

export function resolveClipEvents(project: PocketDawProject, clip: Clip, context = buildRenderContext(project)): RenderedEvent[] {
  if (clip.muted) return [];
  if (clip.type === "generated-section") return resolveGeneratedSectionClip(project, clip, context);
  if (clip.type === "generated-pattern") return resolveGeneratedPatternClip(project, clip, context);
  if (clip.type === "midi") return resolveMidiClip(project, clip, context);
  if (clip.type === "audio") return resolveAudioClip(project, clip, context);
  if (clip.type === "automation") return resolveAutomationClip(project, clip, context);
  if (clip.type === "marker") return resolveMarkerClip(project, clip, context);
  return [];
}

export function resolveGeneratedSectionClip(project: PocketDawProject, clip: Clip, context: RenderContext): RenderedEvent[] {
  const pcs = (clip.sourceRefId ? context.pcsSources.get(clip.sourceRefId) : null) || context.primaryPcsSource;
  const section = pcs && clip.sectionId ? pcs.sections[clip.sectionId as keyof typeof pcs.sections] : null;
  if (!pcs || !section) return [];
  return renderGeneratedSectionEvents(project, pcs, section, clip);
}

export function resolveGeneratedPatternClip(_project: PocketDawProject, _clip: Clip, _context: RenderContext): RenderedEvent[] {
  return [];
}

export function resolveMidiClip(project: PocketDawProject, clip: Clip, _context: RenderContext): RenderedEvent[] {
  const data = midiDataFromClip(clip);
  if (!data.notes.length) return [];
  const secondsPerBeat = 60 / project.project.bpm;
  const clipStart = (clip.startBar - 1) * project.project.timeSig * secondsPerBeat;
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const renderTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
  return data.notes
    .filter((note) => note.startTick + note.durationTicks > sourceStartTick && note.startTick < sourceStartTick + renderTicks)
    .map((note) => {
      const clippedStartTick = Math.max(note.startTick, sourceStartTick);
      const localStartTick = clippedStartTick - sourceStartTick;
      const skippedTicks = Math.max(0, sourceStartTick - note.startTick);
      const durationTicks = Math.max(1, Math.min(note.durationTicks - skippedTicks, renderTicks - localStartTick));
      return {
        id: `${clip.id}_${note.id}`,
        clipId: clip.id,
        kind: "midi" as const,
        trackId: clip.trackId,
        role: "media" as const,
        time: clipStart + (localStartTick / data.ppq) * secondsPerBeat,
        duration: Math.max(0.03, (durationTicks / data.ppq) * secondsPerBeat),
        bar: clip.startBar + Math.floor(localStartTick / (data.ppq * project.project.timeSig)),
        step: Math.round(localStartTick),
        midi: Math.max(0, Math.min(127, note.pitch + (clip.transforms.transpose || 0) + (clip.transforms.octave || 0) * 12)),
        velocity: Math.max(0.05, Math.min(1, (note.velocity / 127) * (clip.transforms.gain ?? 1))),
        pan: 0,
        instrument: "midi_preview",
        articulation: "note",
        accent: note.velocity >= 104
      };
    });
}

export function resolveAudioClip(_project: PocketDawProject, _clip: Clip, _context: RenderContext): RenderedEvent[] {
  return [];
}

export function resolveAutomationClip(_project: PocketDawProject, _clip: Clip, _context: RenderContext): RenderedEvent[] {
  return [];
}

export function resolveMarkerClip(_project: PocketDawProject, _clip: Clip, _context: RenderContext): RenderedEvent[] {
  return [];
}

function renderGeneratedSectionEvents(
  project: PocketDawProject,
  pcs: SanitizedPcsProject,
  section: SanitizedPcsSection,
  clip: Clip
): RenderedEvent[] {
  const out: RenderedEvent[] = [];
  const { bpm, timeSig, resolution, swing } = project.project;
  const secondsPerBeat = 60 / bpm;
  const stepsPerBar = timeSig * resolution;
  const sourceStartStep = clipSourceStartBar(clip) * stepsPerBar;
  const sectionMaxSteps = section.bars * stepsPerBar;
  const renderSteps = Math.max(0, Math.min(Math.round(clip.barLength * stepsPerBar), sectionMaxSteps - sourceStartStep));
  const stepTimes = buildStepTimes(renderSteps, (clip.startBar - 1) * timeSig * secondsPerBeat, secondsPerBeat, resolution, swing);
  const clipStart = (clip.startBar - 1) * timeSig * secondsPerBeat;
  const clipGain = clip.transforms.gain ?? 1;
  const stemMutes = clip.transforms.stemMutes || {};

  for (let localStep = 0; localStep < renderSteps; localStep += 1) {
    const step = sourceStartStep + localStep;
    const eventTime = stepTimes[localStep] ?? clipStart;
    const stepDur = stepDurationSeconds(localStep, secondsPerBeat, resolution, swing);
    const eventBar = clip.startBar + Math.floor(localStep / stepsPerBar);

    if (!stemMutes.drums) {
      (["kick", "snare", "hat"] as const).forEach((drum) => {
        const level = section.grid[drum][step] || 0;
        if (gridTripletSecond(section, drum, step, sectionMaxSteps)) return;
        if (gridTripletStart(section, drum, step, sectionMaxSteps)) {
          const nextLevel = section.grid[drum][step + 1] || 0;
          const spanDur = spanDurationForSteps(localStep, 2, secondsPerBeat, resolution, swing);
          tripletTimesForSpan(eventTime, spanDur).forEach((time, tripletIndex) => {
            const tripletLevel = tripletIndex === 2 ? nextLevel : level;
            if (tripletLevel <= 0) return;
            out.push(drumEvent(clip, drum, step, eventBar, time, Math.max(0.04, spanDur / 3 * 0.7), tripletLevel, clipGain, true));
          });
        } else if (level > 0) {
          out.push({
            ...drumEvent(
              clip,
              drum,
              step,
              eventBar,
              eventTime,
              Math.min(drum === "kick" ? 0.1 : drum === "snare" ? 0.08 : level > 1 ? 0.12 : 0.025, stepDur * (drum === "hat" && level > 1 ? 0.75 : 0.7)),
              level,
              clipGain,
              false
            )
          });
        }
      });
    }

    if (!stemMutes.bass && pcs.bassOn && bassTriggerAt(pcs, section, step) && !section.bassHold[step] && !section.bassSlide[step]) {
      if (gridTripletStart(section, "bass", step, sectionMaxSteps)) {
        const spanDur = spanDurationForSteps(localStep, 2, secondsPerBeat, resolution, swing);
        const times = tripletTimesForSpan(eventTime, spanDur);
        const leftMidi = bassMidiAt(pcs, section, step);
        const rightMidi = bassMidiAt(pcs, section, step + 1);
        const midMidi = leftMidi !== null && rightMidi !== null ? Math.round((leftMidi + rightMidi) / 2) : leftMidi;
        [leftMidi, midMidi, rightMidi ?? leftMidi].forEach((midi, tripletIndex) => {
          if (midi === null) return;
          const accent = tripletIndex === 2 ? bassAccentAt(pcs, section, step + 1) : bassAccentAt(pcs, section, step);
          out.push({
            id: `${clip.id}_bass_${step}_${tripletIndex}`,
            clipId: clip.id,
            kind: "bass",
            trackId: "bass",
            role: "bass",
            time: times[tripletIndex],
            duration: Math.max(0.08, spanDur / 3 * 0.86),
            bar: eventBar,
            step,
            midi,
            velocity: humanizedPeak((accent ? 0.42 : 0.34) * clipGain, step + tripletIndex, 4, false),
            accent
          });
        });
      } else if (!gridTripletSecond(section, "bass", step, sectionMaxSteps)) {
        const phrase = bassPhraseInfo(pcs, section, step, secondsPerBeat, resolution, swing, sectionMaxSteps);
        const midi = bassMidiAt(pcs, section, step);
        if (midi !== null) {
          out.push({
            id: `${clip.id}_bass_${step}`,
            clipId: clip.id,
            kind: "bass",
            trackId: "bass",
            role: "bass",
            time: eventTime,
            duration: phrase.dur,
            bar: eventBar,
            step,
            midi,
            velocity: humanizedPeak((phrase.accent ? 0.42 : 0.34) * clipGain, step, 4, false),
            accent: phrase.accent,
            slideMidi: phrase.slideMidi ?? undefined,
            slideOffset: phrase.slideOffset ?? undefined
          });
        }
      }
    }

    if (!stemMutes.chords && pcs.chordsOn && step % stepsPerBar === 0) {
      const chord = currentChord(pcs, section, step);
      chordRhythmStarts(pcs, eventTime, secondsPerBeat).forEach(([start, duration], chordIndex) => {
        out.push({
          id: `${clip.id}_chord_${step}_${chordIndex}`,
          clipId: clip.id,
          kind: "chord",
          trackId: "chords",
          role: "chords",
          time: start,
          duration: Math.min(duration, pcs.timeSig * secondsPerBeat),
          bar: eventBar,
          step,
          midiNotes: chordMidiNotes(pcs, chord, pcs.chordOctave + (clip.transforms.octave || 0)).map((midi) => midi + (clip.transforms.transpose || 0)),
          velocity: clipGain,
          instrument: pcs.chordInstrument,
          articulation: pcs.chordPlayMode
        });
      });
    }

    if (!stemMutes.melody) {
      section.melodyTracks.forEach((track, trackIndex) => {
        if (section.melodyMute[trackIndex]) return;
        const hasSolo = section.melodySolo.some(Boolean);
        if (hasSolo && !section.melodySolo[trackIndex]) return;
        if (section.melodyHold[trackIndex]?.[step] || section.melodySlide[trackIndex]?.[step] || melodyTripletSecond(section, trackIndex, step, sectionMaxSteps)) return;
        const note = track[step];
        if (note === null || note === undefined) return;
        if (melodyTripletStart(section, trackIndex, step, sectionMaxSteps)) {
          const spanDur = spanDurationForSteps(localStep, 2, secondsPerBeat, resolution, swing);
          const times = tripletTimesForSpan(eventTime, spanDur);
          const nextNote = track[step + 1] ?? note;
          const notes = [note, melodyTripletMiddleIndex(pcs, note, nextNote), nextNote];
          notes.forEach((noteIndex, tripletIndex) => {
            out.push(melodyEvent(project, pcs, section, clip, trackIndex, step, eventBar, times[tripletIndex], Math.max(0.08, spanDur / 3 * 0.86), noteIndex, clipGain));
          });
          return;
        }
        const phrase = melodyPhraseInfo(pcs, section, trackIndex, step, secondsPerBeat, resolution, swing, sectionMaxSteps);
        out.push({
          ...melodyEvent(project, pcs, section, clip, trackIndex, step, eventBar, eventTime, phrase.dur, note, clipGain),
          slideMidi: phrase.slideMidi === null ? undefined : phrase.slideMidi + (clip.transforms.transpose || 0),
          slideOffset: phrase.slideOffset ?? undefined
        });
      });
    }

    if (!stemMutes.guitar && pcs.guitarEnabled) {
      const art = section.guitarPattern[step];
      if (art && art !== "off" && art !== "hold") {
        out.push({
          id: `${clip.id}_guitar_${step}`,
          clipId: clip.id,
          kind: "guitar",
          trackId: "guitar",
          role: "guitar",
          time: eventTime,
          duration: guitarStepDuration(section, step, art, secondsPerBeat, resolution, swing, sectionMaxSteps),
          bar: eventBar,
          step,
          midiNotes: powerChordNotes(pcs, currentChord(pcs, section, step)),
          velocity: clipGain,
          articulation: art,
          instrument: pcs.guitarTone,
          direction: guitarDirectionForStep(step, pcs.guitarStrumMode)
        });
      }
    }
  }
  return out;
}

function roleOrder(role: TrackRole) {
  return ["drums", "bass", "chords", "melody", "guitar"].indexOf(role);
}

function stepDurationSeconds(step: number, secondsPerBeat: number, resolution: number, swing: number): number {
  const base = secondsPerBeat / resolution;
  if (swing > 0 && resolution >= 2 && resolution !== 3) return step % 2 === 1 ? base + base * swing : base - base * swing;
  return base;
}

function buildStepTimes(stepCount: number, startTime: number, secondsPerBeat: number, resolution: number, swing: number) {
  const times = new Array<number>(stepCount);
  let cursor = startTime;
  for (let step = 0; step < stepCount; step += 1) {
    times[step] = cursor;
    cursor += stepDurationSeconds(step, secondsPerBeat, resolution, swing);
  }
  return times;
}

function spanDurationForSteps(startStep: number, span: number, secondsPerBeat: number, resolution: number, swing: number) {
  let dur = 0;
  for (let i = 0; i < span; i += 1) dur += stepDurationSeconds(startStep + i, secondsPerBeat, resolution, swing);
  return dur;
}

function tripletTimesForSpan(startTime: number, spanDur: number) {
  return [startTime, startTime + spanDur / 3, startTime + (spanDur * 2) / 3];
}

function drumEvent(
  clip: Clip,
  drum: "kick" | "snare" | "hat",
  step: number,
  bar: number,
  time: number,
  duration: number,
  level: number,
  clipGain: number,
  triplet: boolean
): RenderedEvent {
  return {
    id: `${clip.id}_${drum}_${step}${triplet ? "_tuplet" : ""}`,
    clipId: clip.id,
    kind: drum,
    trackId: "drums",
    role: "drums",
    time,
    duration,
    bar,
    step,
    velocity: drumPeak(drum, level) * clipGain,
    accent: level > 1
  };
}

function drumPeak(drum: "kick" | "snare" | "hat", level: number) {
  if (drum === "kick") return level > 1 ? 1.12 : 0.95;
  if (drum === "snare") return level > 1 ? 0.72 : 0.5;
  return level > 1 ? 0.24 : 0.16;
}

function gridTripletStart(section: SanitizedPcsSection, lane: keyof SanitizedPcsSection["gridTuplets"], step: number, maxSteps: number) {
  return step < maxSteps - 1 && !!section.gridTuplets[lane]?.[step];
}

function gridTripletSecond(section: SanitizedPcsSection, lane: keyof SanitizedPcsSection["gridTuplets"], step: number, maxSteps: number) {
  return step > 0 && gridTripletStart(section, lane, step - 1, maxSteps);
}

function melodyTripletStart(section: SanitizedPcsSection, trackIndex: number, step: number, maxSteps: number) {
  return step < maxSteps - 1 && !!section.melodyTuplets[trackIndex]?.[step];
}

function melodyTripletSecond(section: SanitizedPcsSection, trackIndex: number, step: number, maxSteps: number) {
  return step > 0 && melodyTripletStart(section, trackIndex, step - 1, maxSteps);
}

function melodyTripletMiddleIndex(project: SanitizedPcsProject, a: number, b: number) {
  const max = project.melodyPitchMode === "chromatic" ? 23 : 13;
  return Math.max(0, Math.min(max, Math.round((a + b) / 2)));
}

function humanizedPeak(base: number, _step: number, _seed: number, _enabled: boolean) {
  return base;
}

function bassAccentAt(project: SanitizedPcsProject, section: SanitizedPcsSection, step: number) {
  if (project.bassMode === "manual") return !!section.bassAccent[step];
  return (section.grid.bass[step] || 0) === 2;
}

function bassPhraseInfo(
  project: SanitizedPcsProject,
  section: SanitizedPcsSection,
  step: number,
  secondsPerBeat: number,
  resolution: number,
  swing: number,
  maxSteps: number
) {
  let dur = 0;
  let idx = step;
  do {
    dur += stepDurationSeconds(idx, secondsPerBeat, resolution, swing);
    idx += 1;
  } while (idx < maxSteps && section.bassHold[idx]);

  let slideMidi: number | null = null;
  let slideOffset: number | null = null;
  if (idx < maxSteps && section.bassSlide[idx] && bassTriggerAt(project, section, idx)) {
    slideMidi = bassMidiAt(project, section, idx);
    slideOffset = dur;
    do {
      dur += stepDurationSeconds(idx, secondsPerBeat, resolution, swing);
      idx += 1;
    } while (idx < maxSteps && section.bassHold[idx]);
  }

  return {
    dur: Math.max(0.18, dur * 0.94),
    accent: bassAccentAt(project, section, step),
    slideMidi,
    slideOffset
  };
}

function melodyPhraseInfo(
  project: SanitizedPcsProject,
  section: SanitizedPcsSection,
  trackIndex: number,
  step: number,
  secondsPerBeat: number,
  resolution: number,
  swing: number,
  maxSteps: number
) {
  const holdTrack = section.melodyHold[trackIndex] || [];
  const slideTrack = section.melodySlide[trackIndex] || [];
  const noteTrack = section.melodyTracks[trackIndex] || [];
  let dur = 0;
  let idx = step;
  do {
    dur += stepDurationSeconds(idx, secondsPerBeat, resolution, swing);
    idx += 1;
  } while (idx < maxSteps && holdTrack[idx]);

  let slideMidi: number | null = null;
  let slideOffset: number | null = null;
  if (idx < maxSteps && slideTrack[idx] && noteTrack[idx] !== null && noteTrack[idx] !== undefined) {
    slideMidi = melodyIndexToMidi(project, noteTrack[idx]!, section.melodyOctaves[trackIndex] || 0);
    slideOffset = dur;
    do {
      dur += stepDurationSeconds(idx, secondsPerBeat, resolution, swing);
      idx += 1;
    } while (idx < maxSteps && holdTrack[idx]);
  }

  return {
    dur: Math.max(0.18, dur * 0.92),
    slideMidi,
    slideOffset
  };
}

function melodyEvent(
  project: PocketDawProject,
  pcs: SanitizedPcsProject,
  section: SanitizedPcsSection,
  clip: Clip,
  trackIndex: number,
  step: number,
  bar: number,
  time: number,
  duration: number,
  note: number,
  clipGain: number
): RenderedEvent {
  return {
    id: `${clip.id}_melody_${trackIndex}_${step}_${time.toFixed(3)}`,
    clipId: clip.id,
    kind: "melody",
    trackId: melodyTrackId(project, trackIndex),
    role: "melody",
    time,
    duration,
    bar,
    step,
    midi: melodyIndexToMidi(pcs, note, (section.melodyOctaves[trackIndex] || 0) + (clip.transforms.octave || 0)) + (clip.transforms.transpose || 0),
    velocity: clipGain,
    pan: section.melodyPan[trackIndex] || 0,
    instrument: section.melodyInstruments[trackIndex] || "pulse"
  };
}

function melodyTrackId(project: PocketDawProject, trackIndex: number) {
  const byMetadata = project.tracks.find((track) => {
    const value = track.metadata?.chordsmithMelodyTrackIndex;
    return track.role === "melody" && typeof value === "number" && value === trackIndex;
  });
  if (byMetadata) return byMetadata.id;
  if (trackIndex === 0 && project.tracks.some((track) => track.id === "melody")) return "melody";
  const conventional = `melody-${trackIndex + 1}`;
  return project.tracks.some((track) => track.id === conventional) ? conventional : "melody";
}

function chordRhythmStarts(project: SanitizedPcsProject, barStart: number, secondsPerBeat: number): Array<[number, number]> {
  if (project.chordRhythmMode === "quarter") {
    return Array.from({ length: project.timeSig }, (_, beat) => [barStart + beat * secondsPerBeat, secondsPerBeat * 0.9]);
  }
  if (project.chordRhythmMode === "half") {
    const starts: Array<[number, number]> = [[barStart, secondsPerBeat * 1.8]];
    if (project.timeSig >= 4) starts.push([barStart + 2 * secondsPerBeat, secondsPerBeat * 1.8]);
    else if (project.timeSig === 3) starts.push([barStart + 1.5 * secondsPerBeat, secondsPerBeat * 1.2]);
    return starts;
  }
  return [[barStart, secondsPerBeat * project.timeSig * 0.92]];
}

function scalePcs(project: SanitizedPcsProject): number[] {
  const root = Math.max(0, NOTES.indexOf(project.key));
  const ints = project.scale === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return ints.map((i) => (root + i + 12) % 12);
}

function chordQuality(project: SanitizedPcsProject, degree: number): "maj" | "min" | "dim" {
  return project.scale === "minor"
    ? (["min", "dim", "maj", "min", "min", "maj", "maj"][degree] as "maj" | "min" | "dim")
    : (["maj", "min", "min", "maj", "maj", "min", "dim"][degree] as "maj" | "min" | "dim");
}

function chordIntervals(project: SanitizedPcsProject, quality: "maj" | "min" | "dim") {
  if (project.chordType === "sus2") return [0, 2, 7];
  if (project.chordType === "sus4") return [0, 5, 7];
  if (project.chordType === "seventh") return quality === "maj" ? [0, 4, 7, 11] : quality === "min" ? [0, 3, 7, 10] : [0, 3, 6, 10];
  return quality === "maj" ? [0, 4, 7] : quality === "min" ? [0, 3, 7] : [0, 3, 6];
}

function currentChord(project: SanitizedPcsProject, section: SanitizedPcsSection, step: number) {
  const bar = Math.floor(step / (project.timeSig * project.resolution));
  const degree = Math.max(0, Math.min(6, section.progression[bar] ?? 0));
  return { degree, rootPc: scalePcs(project)[degree], quality: chordQuality(project, degree), intervals: chordIntervals(project, chordQuality(project, degree)) };
}

function chordMidiNotes(project: SanitizedPcsProject, chord: ReturnType<typeof currentChord>, octave = 0) {
  const root = 48 + chord.rootPc + octave * 12;
  const notes = chord.intervals.map((interval, index) => root + interval + (index === 0 ? 0 : 12));
  return project.chordPlayMode === "strum_down" || project.chordPlayMode === "arp_down" ? notes.reverse() : notes;
}

function powerChordNotes(project: SanitizedPcsProject, chord: ReturnType<typeof currentChord>) {
  const reg = project.guitarRegister || "low";
  const min = reg === "high" ? 52 : reg === "mid" ? 45 : 35;
  const max = reg === "high" ? 64 : reg === "mid" ? 57 : 47;
  let root = 24 + chord.rootPc;
  while (root < min) root += 12;
  while (root > max) root -= 12;
  return [root, root + 7, root + 12].map((note) => Math.max(0, Math.min(127, note)));
}

function melodyIndexToMidi(project: SanitizedPcsProject, idx: number, octave = 0) {
  const safe = Math.max(0, Math.min(project.melodyPitchMode === "chromatic" ? 23 : 13, idx));
  if (project.melodyPitchMode === "chromatic") return 72 + (safe % 12) + (Math.floor(safe / 12) + octave) * 12;
  const pcs = scalePcs(project);
  return 72 + pcs[safe % 7] + (Math.floor(safe / 7) + octave) * 12;
}

function bassManualIndexToMidi(project: SanitizedPcsProject, idx: number) {
  const pcs = scalePcs(project);
  const safe = Math.max(0, Math.min(13, idx));
  return 36 + pcs[safe % 7] + Math.floor(safe / 7) * 12;
}

function bassMidiAt(project: SanitizedPcsProject, section: SanitizedPcsSection, step: number) {
  const manual = section.bassNotes[step];
  if (project.bassMode === "manual" && manual !== null && manual !== undefined) return bassManualIndexToMidi(project, manual);
  return 36 + currentChord(project, section, step).rootPc;
}

function bassTriggerAt(project: SanitizedPcsProject, section: SanitizedPcsSection, step: number) {
  if (project.bassMode === "manual") return section.bassNotes[step] !== null && section.bassNotes[step] !== undefined;
  return (section.grid.bass[step] || 0) > 0;
}

function guitarDirectionForStep(step: number, mode: string): "down" | "up" {
  if (mode === "up") return "up";
  if (mode === "alternate") return step % 2 ? "up" : "down";
  return "down";
}

function guitarStepDuration(
  section: SanitizedPcsSection,
  step: number,
  articulation: string,
  secondsPerBeat: number,
  resolution: number,
  swing: number,
  maxSteps: number
) {
  if (articulation === "chug" || articulation === "scratch") return Math.min(0.16, stepDurationSeconds(step, secondsPerBeat, resolution, swing) * 0.82);
  let dur = stepDurationSeconds(step, secondsPerBeat, resolution, swing);
  let idx = step + 1;
  while (idx < maxSteps && section.guitarPattern[idx] === "hold") {
    dur += stepDurationSeconds(idx, secondsPerBeat, resolution, swing);
    idx += 1;
  }
  return Math.max(0.18, dur * 0.92);
}
