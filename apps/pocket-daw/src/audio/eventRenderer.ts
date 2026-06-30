import type { Clip, JsonObject, PocketDawProject, TrackRole } from "../daw/schema";
import { sortClips } from "../daw/timeline";
import { clipSourceStartBar } from "../daw/clips";
import { midiDataFromClip } from "../daw/midiClips";
import { anyDrumLaneSolo, DRUM_LANE_DEFS, generatedDrumBranchLane, getDrumBranchLaneSteps, getDrumLaneMix, type DrumLaneId } from "../daw/drumLanes";
import { getMelodyOverlayEvents } from "../daw/melodyOverlays";
import type { SanitizedPcsProject, SanitizedPcsSection } from "../compatibility/pcsSanitizer";
import { chordsmithChordRhythmStarts } from "../../../../packages/pocket-audio-core/src/performance/chord-rhythm.js";
import { chordsmithDrumPeak, chordsmithDrumStepDuration, chordsmithDrumTupletDuration } from "../../../../packages/pocket-audio-core/src/performance/drum-feel.js";
import { chordsmithHumanizeOffset, chordsmithHumanizePeak } from "../../../../packages/pocket-audio-core/src/performance/humanize.js";
import { chordsmithGuitarStepDuration } from "../../../../packages/pocket-audio-core/src/performance/guitar-gates.js";
import { chordsmithPhraseInfo } from "../../../../packages/pocket-audio-core/src/performance/phrases.js";
import { chordsmithPitchedTupletDuration, chordsmithPitchedTupletMiddleIndex, chordsmithPitchedTupletMiddleMidi } from "../../../../packages/pocket-audio-core/src/performance/tuplets.js";
import { buildStepTimeline, spanDurationSeconds, stepDurationSeconds, tripletTimesForSpan } from "../../../../packages/pocket-audio-core/src/music/timeline.js";
import {
  chordsmithAutoBassMidi,
  chordsmithBassIndexToMidi,
  chordsmithChordForStep,
  chordsmithChordMidiNotes,
  chordsmithMelodyIndexToMidi,
  chordsmithPowerChordNotes
} from "../../../../packages/pocket-audio-core/src/music/pitches.js";
import { DEFAULT_MELODY_INSTRUMENT } from "../../../../packages/pocket-audio-core/src/sounds/instruments.js";
import { DEFAULT_GUITAR_STRUM_MODE } from "../../../../packages/pocket-audio-core/src/sounds/guitar.js";
import { CHORDSMITH_SEQUENCED_DRUM_LANE_IDS, chordsmithLiveDrumPadPeak } from "../../../../packages/pocket-audio-core/src/sounds/drum-lanes.js";

export type RenderedEventKind = DrumLaneId | "texture" | "bass" | "chord" | "melody" | "guitar" | "midi";
type SequencedDrumLane = Exclude<keyof SanitizedPcsSection["grid"], "bass">;
const SEQUENCED_DRUM_LANES = CHORDSMITH_SEQUENCED_DRUM_LANE_IDS as readonly SequencedDrumLane[];

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
  channel?: number;
  midiExportVelocity?: number;
  velocity: number;
  pan?: number;
  instrument?: string;
  drumLane?: DrumLaneId;
  drumKit?: string;
  bassTone?: string;
  audioProfile?: string;
  lofiPreset?: string;
  lofiTexture?: JsonObject;
  chipPreset?: string;
  chipTexture?: JsonObject;
  accent?: boolean;
  tuplet?: boolean;
  articulation?: string;
  slideMidi?: number;
  slideOffset?: number;
  direction?: "down" | "up";
}

export interface RenderContext {
  pcsSources: Map<string, SanitizedPcsProject>;
  primaryPcsSource: SanitizedPcsProject | null;
}

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
  const clipStart = barStartSeconds(project, clip.startBar);
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const renderTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
  return data.notes
    .filter((note) => note.startTick + note.durationTicks > sourceStartTick && note.startTick < sourceStartTick + renderTicks)
    .map((note) => {
      const clippedStartTick = Math.max(note.startTick, sourceStartTick);
      const localStartTick = clippedStartTick - sourceStartTick;
      const skippedTicks = Math.max(0, sourceStartTick - note.startTick);
      const durationTicks = Math.max(1, Math.min(note.durationTicks - skippedTicks, renderTicks - localStartTick));
      const channel = typeof note.channel === "number" ? note.channel : 0;
      const midiExportVelocity = Math.max(0.05, Math.min(1, (note.velocity / 127) * (clip.transforms.gain ?? 1)));
      const controllerVolume = midiControllerUnitAt(data.controllers, 7, clippedStartTick, channel, 1);
      const controllerPan = midiControllerPanAt(data.controllers, clippedStartTick, channel);
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
        channel,
        midiExportVelocity,
        velocity: Math.max(0, Math.min(1, midiExportVelocity * controllerVolume)),
        pan: controllerPan,
        instrument: "midi_preview",
        articulation: "note",
        accent: note.velocity >= 104
      };
    });
}

function midiControllerUnitAt(controllers: ReturnType<typeof midiDataFromClip>["controllers"], controller: number, tick: number, channel: number, fallback: number): number {
  const point = latestMidiControllerAt(controllers, controller, tick, channel);
  return point ? Math.max(0, Math.min(1, point.value / 127)) : fallback;
}

function midiControllerPanAt(controllers: ReturnType<typeof midiDataFromClip>["controllers"], tick: number, channel: number): number {
  const point = latestMidiControllerAt(controllers, 10, tick, channel);
  if (!point) return 0;
  return Math.max(-1, Math.min(1, ((point.value - 64) / 63)));
}

function latestMidiControllerAt(
  controllers: ReturnType<typeof midiDataFromClip>["controllers"],
  controller: number,
  tick: number,
  channel: number
): ReturnType<typeof midiDataFromClip>["controllers"][number] | null {
  let latest: ReturnType<typeof midiDataFromClip>["controllers"][number] | null = null;
  for (const point of controllers) {
    if (point.controller !== controller || (point.channel ?? 0) !== channel || point.tick > tick) continue;
    if (!latest || point.tick > latest.tick || (point.tick === latest.tick && midiControllerOrder(point.id) >= midiControllerOrder(latest.id))) latest = point;
  }
  return latest;
}

function midiControllerOrder(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
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
  const clipStart = barStartSeconds(project, clip.startBar);
  const stepTimes = buildStepTimes(renderSteps, clipStart, secondsPerBeat, resolution, swing);
  const clipGain = clip.transforms.gain ?? 1;
  const stemMutes = clip.transforms.stemMutes || {};
  const sourceMeta = sourceEventMetadata(pcs);

  for (let localStep = 0; localStep < renderSteps; localStep += 1) {
    const step = sourceStartStep + localStep;
    const eventTime = stepTimes[localStep] ?? clipStart;
    const stepDur = stepDurationForIndex(localStep, secondsPerBeat, resolution, swing);
    const eventBar = clip.startBar + Math.floor(localStep / stepsPerBar);

    if (!stemMutes.drums) {
      const texture = lofiTextureEvent(clip, pcs, step, eventBar, eventTime, stepDur);
      if (texture) out.push(texture);
      SEQUENCED_DRUM_LANES.forEach((drum) => {
        const level = section.grid[drum][step] || 0;
        if (gridTripletSecond(section, drum, step, sectionMaxSteps)) return;
        if (gridTripletStart(section, drum, step, sectionMaxSteps)) {
          const nextLevel = section.grid[drum][step + 1] || 0;
          const spanDur = spanDurationForSteps(localStep, 2, secondsPerBeat, resolution, swing);
          tripletTimesForSpan(eventTime, spanDur).forEach((time, tripletIndex) => {
            const tripletLevel = tripletIndex === 2 ? nextLevel : level;
            if (tripletLevel <= 0) return;
            const branchDrum = branchTargetDrumLane(project, drum, tripletLevel);
            const event = drumEvent(
              project,
              clip,
              pcs,
              branchDrum,
              step,
              eventBar,
              humanizedTime(pcs, time, step + tripletIndex, seedForDrum(drum)),
              chordsmithDrumTupletDuration({ lane: drum, level: tripletLevel, spanDuration: spanDur }),
              tripletLevel,
              clipGain,
              true,
              step + tripletIndex,
              drum
            );
            if (event) out.push(event);
          });
        } else if (level > 0) {
          const branchDrum = branchTargetDrumLane(project, drum, level);
          const event = drumEvent(
            project,
            clip,
            pcs,
            branchDrum,
            step,
            eventBar,
            humanizedTime(pcs, eventTime, step, seedForDrum(drum)),
            chordsmithDrumStepDuration({ lane: drum, level, stepDuration: stepDur }),
            level,
            clipGain,
            false,
            step,
            drum
          );
          if (event) out.push(event);
        }
      });
      DRUM_LANE_DEFS.forEach((lane) => {
        const level = getDrumBranchLaneSteps(project, section.id, lane.id)[step] || 0;
        if (level <= 0) return;
        const event = drumEvent(
          project,
          clip,
          pcs,
          lane.id,
          step,
          eventBar,
          humanizedTime(pcs, eventTime, step, seedForDrum(lane.id)),
          branchDrumOverlayDuration(lane.id, stepDur),
          level,
          clipGain,
          false,
          step,
          lane.id,
          chordsmithLiveDrumPadPeak(lane.id, level),
          "_branch_overlay"
        );
        if (event) out.push(event);
      });
    }

    if (!stemMutes.bass && pcs.bassOn && bassTriggerAt(pcs, section, step) && !section.bassHold[step] && !section.bassSlide[step]) {
      if (gridTripletStart(section, "bass", step, sectionMaxSteps)) {
        const spanDur = spanDurationForSteps(localStep, 2, secondsPerBeat, resolution, swing);
        const times = tripletTimesForSpan(eventTime, spanDur);
        const leftMidi = bassMidiAt(pcs, section, step);
        const rightMidi = bassMidiAt(pcs, section, step + 1);
        const midMidi = chordsmithPitchedTupletMiddleMidi(leftMidi, rightMidi);
        [leftMidi, midMidi, rightMidi ?? leftMidi].forEach((midi, tripletIndex) => {
          if (midi === null) return;
          const accent = tripletIndex === 2 ? bassAccentAt(pcs, section, step + 1) : bassAccentAt(pcs, section, step);
          out.push({
            id: `${clip.id}_bass_${step}_${tripletIndex}`,
            clipId: clip.id,
            kind: "bass",
            trackId: "bass",
            role: "bass",
            time: humanizedTime(pcs, times[tripletIndex], step + tripletIndex, 4),
            duration: chordsmithPitchedTupletDuration(spanDur),
            bar: eventBar,
            step,
            midi: applyClipPitchTransform(midi, clip),
            velocity: humanizedPeak(pcs, (accent ? 0.42 : 0.34) * clipGain, step + tripletIndex, 4),
            accent,
            bassTone: pcs.bassTone,
            tuplet: true,
            ...sourceMeta
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
            time: humanizedTime(pcs, eventTime, step, 4),
            duration: phrase.dur,
            bar: eventBar,
            step,
            midi: applyClipPitchTransform(midi, clip),
            velocity: humanizedPeak(pcs, (phrase.accent ? 0.42 : 0.34) * clipGain, step, 4),
            accent: phrase.accent,
            slideMidi: phrase.slideMidi === null ? undefined : applyClipPitchTransform(phrase.slideMidi, clip),
            slideOffset: phrase.slideOffset ?? undefined,
            bassTone: pcs.bassTone,
            ...sourceMeta
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
          midiNotes: chordMidiNotes(pcs, chord, pcs.chordOctave + (clip.transforms.octave || 0)).map((midi: number) => midi + (clip.transforms.transpose || 0)),
          velocity: clipGain,
          instrument: pcs.chordInstrument,
          articulation: pcs.chordPlayMode,
          ...sourceMeta
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
            out.push({
              ...melodyEvent(
                project,
                pcs,
                section,
                clip,
                trackIndex,
                step,
                eventBar,
                humanizedTime(pcs, times[tripletIndex], step + tripletIndex, 10 + trackIndex),
                chordsmithPitchedTupletDuration(spanDur),
                noteIndex,
                clipGain,
                step + tripletIndex
              ),
              tuplet: true
            });
          });
          return;
        }
        const phrase = melodyPhraseInfo(pcs, section, trackIndex, step, secondsPerBeat, resolution, swing, sectionMaxSteps);
        out.push({
          ...melodyEvent(project, pcs, section, clip, trackIndex, step, eventBar, humanizedTime(pcs, eventTime, step, 10 + trackIndex), phrase.dur, note, clipGain),
          slideMidi: phrase.slideMidi === null ? undefined : phrase.slideMidi + (clip.transforms.transpose || 0),
          slideOffset: phrase.slideOffset ?? undefined
        });
      });
      section.melodyTracks.forEach((_track, trackIndex) => {
        if (section.melodyMute[trackIndex]) return;
        const hasSolo = section.melodySolo.some(Boolean);
        if (hasSolo && !section.melodySolo[trackIndex]) return;
        getMelodyOverlayEvents(project, section.id, trackIndex, step).forEach((overlay, overlayIndex) => {
          out.push({
            id: `${clip.id}_melody_overlay_${trackIndex}_${step}_${overlayIndex}_${overlay.midi}`,
            clipId: clip.id,
            kind: "melody",
            trackId: melodyTrackId(project, trackIndex),
            role: "melody",
            time: humanizedTime(pcs, eventTime, step + overlayIndex, 22 + trackIndex),
            duration: spanDurationForSteps(localStep, Math.max(1, Math.min(overlay.durationSteps, renderSteps - localStep)), secondsPerBeat, resolution, swing),
            bar: eventBar,
            step,
            midi: applyClipPitchTransform(overlay.midi, clip),
            velocity: humanizedPeak(pcs, overlay.velocity * clipGain, step + overlayIndex, 22 + trackIndex),
            pan: section.melodyPan[trackIndex] || 0,
            instrument: section.melodyInstruments[trackIndex] || DEFAULT_MELODY_INSTRUMENT,
            articulation: "midi-overlay",
            ...sourceMeta
          });
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
          time: humanizedTime(pcs, eventTime, step, 17),
          duration: guitarStepDuration(section, step, art, secondsPerBeat, resolution, swing, sectionMaxSteps),
          bar: eventBar,
          step,
          midiNotes: powerChordNotes(pcs, currentChord(pcs, section, step)).map((midi) => applyClipPitchTransform(midi, clip)),
          velocity: clipGain,
          articulation: art,
          instrument: pcs.guitarTone,
          direction: guitarDirectionForStep(step, pcs.guitarStrumMode),
          ...sourceMeta
        });
      }
    }
  }
  return out;
}

function roleOrder(role: TrackRole) {
  return ["drums", "bass", "chords", "melody", "guitar"].indexOf(role);
}

function buildStepTimes(stepCount: number, startTime: number, secondsPerBeat: number, resolution: number, swing: number) {
  return buildStepTimeline({ stepCount, startTime, bpm: bpmFromSecondsPerBeat(secondsPerBeat), resolution, swing }).times;
}

function barStartSeconds(project: PocketDawProject, bar: number) {
  const completedBars = Math.max(0, Math.round(bar) - 1);
  const stepCount = completedBars * project.project.timeSig * project.project.resolution;
  return buildStepTimeline({
    stepCount,
    startTime: 0,
    bpm: project.project.bpm,
    resolution: project.project.resolution,
    swing: project.project.swing
  }).duration;
}

function stepDurationForIndex(step: number, secondsPerBeat: number, resolution: number, swing: number): number {
  return stepDurationSeconds({ bpm: bpmFromSecondsPerBeat(secondsPerBeat), resolution, swing }, step);
}

function spanDurationForSteps(startStep: number, span: number, secondsPerBeat: number, resolution: number, swing: number) {
  return spanDurationSeconds({ bpm: bpmFromSecondsPerBeat(secondsPerBeat), resolution, swing }, startStep, span);
}

function bpmFromSecondsPerBeat(secondsPerBeat: number) {
  return 60 / Math.max(0.0001, secondsPerBeat);
}

function drumEvent(
  project: PocketDawProject,
  clip: Clip,
  pcs: SanitizedPcsProject,
  drum: DrumLaneId,
  step: number,
  bar: number,
  time: number,
  duration: number,
  level: number,
  clipGain: number,
  triplet: boolean,
  humanizeStep = step,
  sourceDrum: DrumLaneId = drum,
  basePeak?: number,
  idSuffix = ""
): RenderedEvent | null {
  const mix = getDrumLaneMix(project, drum);
  if (mix.mute || mix.volume <= 0) return null;
  if (anyDrumLaneSolo(project) && !mix.solo) return null;
  const branchTrack = project.tracks.find((track) => generatedDrumBranchLane(track) === drum && track.active !== false);
  const usesBranchTrack = !!branchTrack;
  return {
    id: `${clip.id}_${drum}_${step}${triplet ? "_tuplet" : ""}${idSuffix}`,
    clipId: clip.id,
    kind: drum,
    drumLane: drum,
    trackId: branchTrack?.id || "drums",
    role: "drums",
    time,
    duration: Math.max(0.01, duration * mix.gate),
    bar,
    step,
    velocity: humanizedPeak(pcs, (basePeak ?? chordsmithDrumPeak(sourceDrum, level)) * clipGain * (usesBranchTrack ? 1 : mix.volume), humanizeStep, seedForDrum(sourceDrum)),
    pan: usesBranchTrack ? 0 : mix.pan,
    accent: level > 1,
    drumKit: pcs.drumKit,
    ...sourceEventMetadata(pcs)
  };
}

function branchDrumOverlayDuration(laneId: DrumLaneId, stepDuration: number): number {
  if (laneId === "crash") return 0.9;
  if (laneId === "ride") return 0.42;
  if (laneId === "tomlow" || laneId === "tommid" || laneId === "tomhi") return 0.31;
  if (laneId === "clap") return 0.12;
  if (laneId === "openhat") return 0.12;
  return chordsmithDrumStepDuration({ lane: laneId, level: 1, stepDuration });
}

function branchTargetDrumLane(project: PocketDawProject, sourceLane: SequencedDrumLane, level: number): DrumLaneId {
  const sourceDrum = sourceLane as DrumLaneId;
  if (level <= 1) return sourceDrum;
  const accentBranch = DRUM_LANE_DEFS.find((lane) => lane.chordsmithRecordTrack === sourceLane && lane.chordsmithRecordLevel === level);
  if (!accentBranch || accentBranch.id === sourceLane) return sourceDrum;
  return project.tracks.some((track) => generatedDrumBranchLane(track) === accentBranch.id && track.active !== false) ? accentBranch.id : sourceDrum;
}

function lofiTextureEvent(clip: Clip, pcs: SanitizedPcsProject, step: number, bar: number, time: number, duration: number): RenderedEvent | null {
  if (pcs.audioProfile !== "lofi_chill" || !pcs.lofiTexture?.enabled) return null;
  return {
    id: `${clip.id}_texture_${step}`,
    clipId: clip.id,
    kind: "texture",
    trackId: "drums",
    role: "drums",
    time,
    duration: Math.max(0.08, Math.min(0.24, duration)),
    bar,
    step,
    velocity: 1,
    ...sourceEventMetadata(pcs)
  };
}

function sourceEventMetadata(pcs: SanitizedPcsProject) {
  return {
    audioProfile: pcs.audioProfile,
    lofiPreset: pcs.lofiPreset,
    lofiTexture: pcs.lofiTexture,
    chipPreset: pcs.chipPreset,
    chipTexture: pcs.chipTexture
  };
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
  return chordsmithPitchedTupletMiddleIndex(a, b, { melodyPitchMode: project.melodyPitchMode });
}

function humanizedTime(project: SanitizedPcsProject, time: number, step: number, seed: number) {
  return Math.max(0, time + chordsmithHumanizeOffset(step, seed, project.humanizeOn));
}

function humanizedPeak(project: SanitizedPcsProject, base: number, step: number, seed: number) {
  return chordsmithHumanizePeak(base, step, seed, project.humanizeOn);
}

function seedForDrum(drum: DrumLaneId) {
  if (drum === "kick") return 1;
  if (drum === "snare") return 2;
  return 3;
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
  const phrase = chordsmithPhraseInfo({
    step,
    totalSteps: maxSteps,
    role: "bass",
    stepDurationAt: (index) => stepDurationForIndex(index, secondsPerBeat, resolution, swing),
    holdAt: (index) => Boolean(section.bassHold[index]),
    slideAt: (index) => Boolean(section.bassSlide[index])
  });
  const slideMidi = phrase.slideStep === null ? null : bassMidiAt(project, section, phrase.slideStep);

  return {
    dur: phrase.duration,
    accent: bassAccentAt(project, section, step),
    slideMidi,
    slideOffset: phrase.slideOffset
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
  const phrase = chordsmithPhraseInfo({
    step,
    totalSteps: maxSteps,
    role: "melody",
    stepDurationAt: (index) => stepDurationForIndex(index, secondsPerBeat, resolution, swing),
    holdAt: (index) => Boolean(holdTrack[index]),
    slideAt: (index) => Boolean(slideTrack[index] && noteTrack[index] !== null && noteTrack[index] !== undefined)
  });
  const slideMidi = phrase.slideStep === null
    ? null
    : melodyIndexToMidi(project, noteTrack[phrase.slideStep]!, section.melodyOctaves[trackIndex] || 0);

  return {
    dur: phrase.duration,
    slideMidi,
    slideOffset: phrase.slideOffset
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
  clipGain: number,
  humanizeStep = step
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
    velocity: humanizedPeak(pcs, clipGain, humanizeStep, 10 + trackIndex),
    pan: section.melodyPan[trackIndex] || 0,
    instrument: section.melodyInstruments[trackIndex] || DEFAULT_MELODY_INSTRUMENT,
    ...sourceEventMetadata(pcs)
  };
}

function applyClipPitchTransform(midi: number, clip: Clip): number {
  return Math.max(0, Math.min(127, midi + (clip.transforms.transpose || 0) + (clip.transforms.octave || 0) * 12));
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
  return chordsmithChordRhythmStarts({
    mode: project.chordRhythmMode,
    barStart,
    beatDuration: secondsPerBeat,
    timeSig: project.timeSig
  });
}

function currentChord(project: SanitizedPcsProject, section: SanitizedPcsSection, step: number) {
  return chordsmithChordForStep({
    key: project.key,
    scale: project.scale,
    chordType: project.chordType,
    timeSig: project.timeSig,
    resolution: project.resolution,
    progression: section.progression,
    step
  });
}

function chordMidiNotes(project: SanitizedPcsProject, chord: ReturnType<typeof currentChord>, octave = 0) {
  return chordsmithChordMidiNotes({
    chord,
    chordOctave: octave,
    chordPlayMode: project.chordPlayMode
  });
}

function powerChordNotes(project: SanitizedPcsProject, chord: ReturnType<typeof currentChord>) {
  return chordsmithPowerChordNotes({ rootPc: chord.rootPc, guitarRegister: project.guitarRegister });
}

function melodyIndexToMidi(project: SanitizedPcsProject, idx: number, octave = 0) {
  return chordsmithMelodyIndexToMidi({
    key: project.key,
    scale: project.scale,
    melodyPitchMode: project.melodyPitchMode,
    noteIndex: idx,
    octave
  });
}

function bassManualIndexToMidi(project: SanitizedPcsProject, idx: number) {
  return chordsmithBassIndexToMidi({ key: project.key, scale: project.scale, noteIndex: idx });
}

function bassMidiAt(project: SanitizedPcsProject, section: SanitizedPcsSection, step: number) {
  const manual = section.bassNotes[step];
  if (project.bassMode === "manual" && manual !== null && manual !== undefined) return bassManualIndexToMidi(project, manual);
  return chordsmithAutoBassMidi({ rootPc: currentChord(project, section, step).rootPc });
}

function bassTriggerAt(project: SanitizedPcsProject, section: SanitizedPcsSection, step: number) {
  if (project.bassMode === "manual") return section.bassNotes[step] !== null && section.bassNotes[step] !== undefined;
  return (section.grid.bass[step] || 0) > 0;
}

function guitarDirectionForStep(step: number, mode: string): "down" | "up" {
  if (mode === "up") return "up";
  if (mode === "alternate") return step % 2 ? "up" : DEFAULT_GUITAR_STRUM_MODE;
  return DEFAULT_GUITAR_STRUM_MODE;
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
  const stepDur = stepDurationForIndex(step, secondsPerBeat, resolution, swing);
  let dur = stepDur;
  let idx = step + 1;
  while (idx < maxSteps && section.guitarPattern[idx] === "hold") {
    dur += stepDurationForIndex(idx, secondsPerBeat, resolution, swing);
    idx += 1;
  }
  return chordsmithGuitarStepDuration({ stepDuration: stepDur, heldDuration: dur, articulation });
}
