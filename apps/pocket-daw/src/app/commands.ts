import { parseAnyImportText } from "../compatibility/pcsParser";
import { sanitizePocketChordsmithProject } from "../compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../compatibility/pcsToDaw";
import { migratePocketDawProject } from "../compatibility/migrations";
import { cloneProject, createDefaultMetronomeSettings, parsePocketDawProjectFile } from "../daw/dawProject";
import { deleteClip, duplicateClip, moveClipByBars, moveClipToBar, pasteClip, repeatGeneratedSectionClipToEnd, splitClipAtBar, toggleClipMute, trimClipEnd, trimClipStart } from "../daw/clips";
import { addTrackFx, removeTrackFx, setTrackInput, setTrackPan, setTrackVolume, toggleTrackArmed, toggleTrackFx, toggleTrackMonitor, toggleTrackMute, toggleTrackSolo } from "../daw/mixer";
import { addDrumLaneFx, isDrumLaneId, removeDrumLaneFx, setDrumLaneMute, setDrumLanePan, setDrumLaneVolume, toggleDrumLaneFx } from "../daw/drumLanes";
import { addTrackToProject, renameTrack, type AddTrackKind } from "../daw/tracks";
import { placeAudioClipOnTimeline } from "../daw/audioClips";
import { addMidiNote, deleteMidiNote, moveMidiNote, resizeMidiNote, setMidiNoteVelocity, transposeMidiNote } from "../daw/midiClips";
import { addAutomationPoint, deleteAutomationPoint, ensureTrackAutomationLane, setAutomationLaneEnabled, type TrackAutomationField, updateAutomationPoint } from "../daw/automation";
import { addBusTrack, addReturnTrack, routeTrackToOutput } from "../daw/routing";
import { setFxSlotParameter, setPocketProEqPreset } from "../daw/fx";
import { pushUndo, redo, undo } from "../daw/undo";
import { addMarkerAtBar, clearLoop, deleteMarker, renameMarker, setLoopToClip, snapBarValue } from "../daw/timeline";
import {
  appendChordsmithSection,
  applyDrumPreset,
  applyGuitarPreset,
  cycleBassStep,
  cycleDrumTuplet,
  cycleDrumStep,
  cycleGuitarStep,
  cycleMelodyStep,
  fillAutoBass,
  getPrimaryChordsmithSource,
  isSectionId,
  setBassMode,
  setChordInstrument,
  setChordsmithGlobals,
  setGuitarSettings,
  setMelodyMute,
  setMelodyOctave,
  setMelodyPan,
  setMelodyInstrument,
  setMelodySolo,
  setSectionBars,
  setSectionChord,
  toggleBassAccent,
  toggleBassHold,
  toggleBassSlide,
  toggleBassTuplet,
  toggleMelodyHold,
  toggleMelodySlide,
  toggleMelodyTuplet,
  type ChordsmithGlobalPatch,
  type DrumLane
} from "../daw/chordsmithEditor";
import { drumPresetEventsForProject, drumPresetLabel, drumPresetVisibleForProject, findDrumPreset } from "../daw/chordsmithDrumPresets";
import { findGuitarPreset, guitarPresetLabel, guitarPresetPatternForProject, guitarPresetVisibleForProject } from "../daw/chordsmithGuitarPresets";
import type { PocketDawProject } from "../daw/schema";
import type { AppState } from "./state";

export function importTextToProject(text: string): { project: PocketDawProject; message: string } {
  const parsed = parseAnyImportText(text);
  if (parsed.kind === "pocketdaw") {
    return { project: parsed.data, message: "Opened .pocketdaw project." };
  }
  if (parsed.kind === "pdj") {
    const source = (parsed.data as Record<string, unknown>).source as Record<string, unknown> | undefined;
    const sourceProject = source?.project || (parsed.data as Record<string, unknown>).project;
    const pcs = sanitizePocketChordsmithProject(sourceProject);
    return { project: createDawProjectFromChordsmithProject(pcs), message: "Imported Pocket DJ source Chordsmith project." };
  }
  const pcs = sanitizePocketChordsmithProject(parsed.data);
  const project = createDawProjectFromChordsmithProject(pcs);
  project.importHistory[0].importKind = parsed.importKind;
  return { project, message: parsed.importKind === "PCS1" ? "Imported PCS1 share code." : "Imported raw Pocket Chordsmith JSON." };
}

export function loadPocketDawRaw(raw: string): PocketDawProject {
  return migratePocketDawProject(parsePocketDawProjectFile(raw));
}

export function commitProject(state: AppState, project: PocketDawProject, status: string): AppState {
  return {
    ...state,
    undoStack: pushUndo(state.undoStack, project),
    status
  };
}

export function moveSelectedClip(state: AppState, delta: number): AppState {
  if (!state.selectedClipId) return state;
  return commitProject(state, moveClipByBars(state.undoStack.present, state.selectedClipId, delta), `Moved clip ${delta > 0 ? "right" : "left"} ${Math.abs(delta)} bar.`);
}

export function moveSelectedClipBySnap(state: AppState, direction: -1 | 1): AppState {
  const project = state.undoStack.present;
  const delta = state.snapMode === "beat" ? direction / Math.max(1, project.project.timeSig) : direction;
  return moveSelectedClip(state, delta);
}

export function moveClipToBarCommand(state: AppState, clipId: string, startBar: number): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return { ...state, status: "Choose a clip before dragging." };
  const snapped = snapBarValue(startBar, state.snapMode, project.project.timeSig);
  const next = moveClipToBar(project, clipId, snapped);
  if (next === project) return { ...state, selectedClipId: clipId, status: `Clip stayed at Bar ${clip.startBar}.` };
  return {
    ...commitProject(state, next, `Moved ${clip.name} to Bar ${snapped}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function repeatClipToEndCommand(state: AppState, clipId: string, endBar: number): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return { ...state, status: "Choose a section before repeating it." };
  const snappedEnd = snapBarValue(endBar, state.snapMode, project.project.timeSig);
  const result = repeatGeneratedSectionClipToEnd(project, clipId, snappedEnd);
  if (result.project === project) return { ...state, selectedClipId: clipId, status: "Only generated section clips can be repeat-dragged." };
  return {
    ...commitProject(state, result.project, result.repeatedCount ? `Repeated ${clip.name} ${result.repeatedCount} time${result.repeatedCount === 1 ? "" : "s"}.` : `Cleared repeats for ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function duplicateSelectedClip(state: AppState): AppState {
  if (!state.selectedClipId) return state;
  const result = duplicateClip(state.undoStack.present, state.selectedClipId);
  return {
    ...commitProject(state, result.project, "Duplicated selected clip."),
    selectedClipId: result.duplicatedId || state.selectedClipId
  };
}

export function deleteSelectedClip(state: AppState): AppState {
  if (!state.selectedClipId) return state;
  const next = deleteClip(state.undoStack.present, state.selectedClipId);
  return {
    ...commitProject(state, next, "Deleted selected clip."),
    selectedClipId: next.timeline.clips[0]?.id || null
  };
}

export function toggleSelectedClipMute(state: AppState): AppState {
  if (!state.selectedClipId) return state;
  return commitProject(state, toggleClipMute(state.undoStack.present, state.selectedClipId), "Toggled clip mute.");
}

export function splitSelectedClipAtPlayhead(state: AppState): AppState {
  if (!state.selectedClipId) return state;
  const result = splitClipAtBar(state.undoStack.present, state.selectedClipId, snapBarValue(state.playheadBar, "bar", state.undoStack.present.project.timeSig));
  if (!result.rightClipId) return { ...state, status: "Move the playhead inside the selected clip to split." };
  return {
    ...commitProject(state, result.project, "Split selected clip at playhead."),
    selectedClipId: result.rightClipId
  };
}

export function trimSelectedClipStartCommand(state: AppState, deltaBars: number): AppState {
  if (!state.selectedClipId) return state;
  return commitProject(state, trimClipStart(state.undoStack.present, state.selectedClipId, deltaBars), deltaBars > 0 ? "Trimmed clip start right." : "Extended clip start left.");
}

export function trimSelectedClipEndCommand(state: AppState, deltaBars: number): AppState {
  if (!state.selectedClipId) return state;
  return commitProject(state, trimClipEnd(state.undoStack.present, state.selectedClipId, deltaBars), deltaBars > 0 ? "Extended clip end right." : "Trimmed clip end left.");
}

export function copySelectedClip(state: AppState): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === state.selectedClipId);
  if (!clip) return { ...state, status: "Select a clip to copy." };
  return { ...state, clipClipboard: JSON.parse(JSON.stringify(clip)), status: `Copied ${clip.name}.` };
}

export function pasteClipAtPlayhead(state: AppState): AppState {
  if (!state.clipClipboard) return { ...state, status: "Copy a clip before pasting." };
  const startBar = snapBarValue(state.playheadBar, state.snapMode, state.undoStack.present.project.timeSig);
  const result = pasteClip(state.undoStack.present, state.clipClipboard, startBar);
  return {
    ...commitProject(state, result.project, "Pasted clip at playhead."),
    selectedClipId: result.pastedId
  };
}

export function toggleTrackMuteCommand(state: AppState, trackId: string): AppState {
  return commitProject(state, toggleTrackMute(state.undoStack.present, trackId), "Toggled track mute.");
}

export function toggleTrackSoloCommand(state: AppState, trackId: string): AppState {
  return commitProject(state, toggleTrackSolo(state.undoStack.present, trackId), "Toggled track solo.");
}

export function toggleTrackArmedCommand(state: AppState, trackId: string): AppState {
  const track = state.undoStack.present.tracks.find((item) => item.id === trackId);
  if (!track?.recordKind || track.recordKind === "none") return { ...state, status: "Only live audio tracks can be armed." };
  const willArm = !track.armed;
  return commitProject(state, toggleTrackArmed(state.undoStack.present, trackId), willArm ? `Armed ${track.name}.` : `Disarmed ${track.name}.`);
}

export function toggleTrackMonitorCommand(state: AppState, trackId: string): AppState {
  const track = state.undoStack.present.tracks.find((item) => item.id === trackId);
  if (!track?.recordKind || track.recordKind === "none") return { ...state, status: "Only live audio tracks have input monitoring." };
  const next = toggleTrackMonitor(state.undoStack.present, trackId);
  const updated = next.tracks.find((item) => item.id === trackId);
  return commitProject(state, next, `${track.name} monitor ${updated?.monitorEnabled ? "on" : "off"}.`);
}

export function toggleMetronomeCommand(state: AppState): AppState {
  const project = cloneProject(state.undoStack.present);
  const current = project.project.metronome || createDefaultMetronomeSettings();
  project.project.metronome = { ...current, enabled: !current.enabled };
  return commitProject(state, project, project.project.metronome.enabled ? "Metronome on." : "Metronome off.");
}

export function setTrackVolumeCommand(state: AppState, trackId: string, volume: number): AppState {
  return commitProject(state, setTrackVolume(state.undoStack.present, trackId, volume), "Updated track volume.");
}

export function setTrackPanCommand(state: AppState, trackId: string, pan: number): AppState {
  return commitProject(state, setTrackPan(state.undoStack.present, trackId, pan), "Updated track pan.");
}

export function addTrackCommand(state: AppState, kind: AddTrackKind): AppState {
  const result = addTrackToProject(state.undoStack.present, kind);
  return {
    ...commitProject(state, result.project, "Added track."),
    selectedTrackId: result.trackId,
    showAddTrack: false
  };
}

export function addBusTrackCommand(state: AppState): AppState {
  const result = addBusTrack(state.undoStack.present);
  return {
    ...commitProject(state, result.project, "Added bus track."),
    selectedTrackId: result.trackId,
    showAddTrack: false
  };
}

export function addReturnTrackCommand(state: AppState): AppState {
  const result = addReturnTrack(state.undoStack.present);
  return {
    ...commitProject(state, result.project, "Added return track."),
    selectedTrackId: result.trackId,
    showAddTrack: false
  };
}

export function routeTrackOutputCommand(state: AppState, trackId: string, outputId: string): AppState {
  return commitProject(state, routeTrackToOutput(state.undoStack.present, trackId, outputId || "master"), "Updated track output routing.");
}

export function ensureAutomationLaneCommand(state: AppState, trackId: string, field: TrackAutomationField): AppState {
  const result = ensureTrackAutomationLane(state.undoStack.present, trackId, field);
  return commitProject(state, result.project, `Enabled ${field} automation lane.`);
}

export function addAutomationPointCommand(state: AppState, trackId: string, field: TrackAutomationField): AppState {
  const ensured = ensureTrackAutomationLane(state.undoStack.present, trackId, field);
  const track = ensured.project.tracks.find((item) => item.id === trackId);
  const value = field === "pan" ? track?.pan || 0 : 1;
  const next = addAutomationPoint(ensured.project, ensured.laneId, { bar: state.playheadBar || 1, value, curve: "linear" });
  return commitProject(state, next, `Added ${field} automation point.`);
}

export function updateAutomationPointCommand(state: AppState, laneId: string, pointIndex: number, bar: number, value: number): AppState {
  return commitProject(state, updateAutomationPoint(state.undoStack.present, laneId, pointIndex, { bar, value }), "Updated automation point.");
}

export function deleteAutomationPointCommand(state: AppState, laneId: string, pointIndex: number): AppState {
  return commitProject(state, deleteAutomationPoint(state.undoStack.present, laneId, pointIndex), "Deleted automation point.");
}

export function setAutomationLaneEnabledCommand(state: AppState, laneId: string, enabled: boolean): AppState {
  return commitProject(state, setAutomationLaneEnabled(state.undoStack.present, laneId, enabled), enabled ? "Automation lane enabled." : "Automation lane disabled.");
}

export function placeAudioClipCommand(state: AppState, mediaPoolItemId: string): AppState {
  const result = placeAudioClipOnTimeline(state.undoStack.present, mediaPoolItemId, state.cursorBar || state.playheadBar || 1);
  if (!result.clipId) return { ...state, status: "Choose an audio media item before placing a clip." };
  return {
    ...commitProject(state, result.project, "Placed audio clip on the timeline."),
    selectedClipId: result.clipId,
    selectedTrackId: result.trackId
  };
}

export function addMidiNoteCommand(state: AppState, clipId: string): AppState {
  const tick = Math.max(0, Math.round((state.playheadBar - 1) * state.undoStack.present.project.timeSig * state.undoStack.present.project.ppq));
  return commitProject(state, addMidiNote(state.undoStack.present, clipId, tick), "Added MIDI note.");
}

export function deleteMidiNoteCommand(state: AppState, clipId: string, noteId: string): AppState {
  return commitProject(state, deleteMidiNote(state.undoStack.present, clipId, noteId), "Deleted MIDI note.");
}

export function moveMidiNoteCommand(state: AppState, clipId: string, noteId: string, direction: -1 | 1): AppState {
  return commitProject(state, moveMidiNote(state.undoStack.present, clipId, noteId, direction * state.undoStack.present.project.ppq), "Moved MIDI note.");
}

export function pitchMidiNoteCommand(state: AppState, clipId: string, noteId: string, direction: -1 | 1): AppState {
  return commitProject(state, transposeMidiNote(state.undoStack.present, clipId, noteId, direction), "Changed MIDI note pitch.");
}

export function resizeMidiNoteCommand(state: AppState, clipId: string, noteId: string, direction: -1 | 1): AppState {
  return commitProject(state, resizeMidiNote(state.undoStack.present, clipId, noteId, direction * Math.round(state.undoStack.present.project.ppq / 2)), "Changed MIDI note duration.");
}

export function setMidiNoteVelocityCommand(state: AppState, clipId: string, noteId: string, velocity: number): AppState {
  return commitProject(state, setMidiNoteVelocity(state.undoStack.present, clipId, noteId, velocity), "Changed MIDI note velocity.");
}

export function addTrackFxCommand(state: AppState, trackId: string, type: string): AppState {
  return commitProject(state, addTrackFx(state.undoStack.present, trackId, type), "Added FX slot.");
}

export function toggleTrackFxCommand(state: AppState, chainId: string, slotId: string): AppState {
  return commitProject(state, toggleTrackFx(state.undoStack.present, chainId, slotId), "Toggled FX bypass.");
}

export function removeTrackFxCommand(state: AppState, chainId: string, slotId: string): AppState {
  return commitProject(state, removeTrackFx(state.undoStack.present, chainId, slotId), "Removed FX slot.");
}

export function setFxSlotParameterCommand(state: AppState, chainId: string, slotId: string, parameter: string, value: number | boolean): AppState {
  return commitProject(state, setFxSlotParameter(state.undoStack.present, chainId, slotId, parameter, value), "Updated FX setting.");
}

export function setPocketProEqPresetCommand(state: AppState, chainId: string, slotId: string, presetId: string): AppState {
  return commitProject(state, setPocketProEqPreset(state.undoStack.present, chainId, slotId, presetId), "Applied EQ preset.");
}

export function setDrumLaneVolumeCommand(state: AppState, laneId: string, volume: number): AppState {
  if (!isDrumLaneId(laneId)) return state;
  return commitProject(state, setDrumLaneVolume(state.undoStack.present, laneId, volume), `Updated ${laneId} drum volume.`);
}

export function setDrumLanePanCommand(state: AppState, laneId: string, pan: number): AppState {
  if (!isDrumLaneId(laneId)) return state;
  return commitProject(state, setDrumLanePan(state.undoStack.present, laneId, pan), `Updated ${laneId} drum pan.`);
}

export function setDrumLaneMuteCommand(state: AppState, laneId: string, mute: boolean): AppState {
  if (!isDrumLaneId(laneId)) return state;
  return commitProject(state, setDrumLaneMute(state.undoStack.present, laneId, mute), `${laneId} drum ${mute ? "muted" : "unmuted"}.`);
}

export function addDrumLaneFxCommand(state: AppState, laneId: string, type: string): AppState {
  if (!isDrumLaneId(laneId)) return state;
  return commitProject(state, addDrumLaneFx(state.undoStack.present, laneId, type), `Added ${type} to ${laneId} drum.`);
}

export function toggleDrumLaneFxCommand(state: AppState, chainId: string, slotId: string): AppState {
  return commitProject(state, toggleDrumLaneFx(state.undoStack.present, chainId, slotId), "Toggled drum lane FX bypass.");
}

export function removeDrumLaneFxCommand(state: AppState, chainId: string, slotId: string): AppState {
  return commitProject(state, removeDrumLaneFx(state.undoStack.present, chainId, slotId), "Removed drum lane FX slot.");
}

export function setTrackInputCommand(state: AppState, trackId: string, inputDeviceId: string | null): AppState {
  return commitProject(state, setTrackInput(state.undoStack.present, trackId, inputDeviceId), "Updated track input.");
}

export function renameTrackCommand(state: AppState, trackId: string, name: string): AppState {
  const track = state.undoStack.present.tracks.find((item) => item.id === trackId);
  if (!track) return { ...state, status: "Choose a track before renaming." };
  const next = renameTrack(state.undoStack.present, trackId, name);
  if (next === state.undoStack.present) return { ...state, selectedTrackId: trackId, status: "Track name unchanged." };
  return {
    ...commitProject(state, next, `Renamed track to ${next.tracks.find((item) => item.id === trackId)?.name || "Track"}.`),
    selectedTrackId: trackId
  };
}

export function setLoopEnabled(state: AppState, enabled: boolean): AppState {
  const project = cloneProject(state.undoStack.present);
  project.timeline.loop.enabled = enabled;
  return commitProject(state, project, enabled ? "Loop enabled." : "Loop disabled.");
}

export function setLoopBars(state: AppState, startBar: number, endBar: number): AppState {
  const project = cloneProject(state.undoStack.present);
  project.timeline.loop.startBar = Math.max(1, Math.round(startBar));
  project.timeline.loop.endBar = Math.max(project.timeline.loop.startBar + 1, Math.round(endBar));
  return commitProject(state, project, "Updated loop region.");
}

export function setLoopToSelectedClipCommand(state: AppState): AppState {
  if (!state.selectedClipId) return { ...state, status: "Select a clip before setting loop." };
  return commitProject(state, setLoopToClip(state.undoStack.present, state.selectedClipId), "Loop set to selected clip.");
}

export function clearLoopCommand(state: AppState): AppState {
  return commitProject(state, clearLoop(state.undoStack.present), "Loop cleared.");
}

export function addMarkerAtPlayheadCommand(state: AppState): AppState {
  return commitProject(state, addMarkerAtBar(state.undoStack.present, state.playheadBar), "Added marker at playhead.");
}

export function renameMarkerCommand(state: AppState, markerId: string, name: string): AppState {
  return commitProject(state, renameMarker(state.undoStack.present, markerId, name), "Renamed marker.");
}

export function deleteMarkerCommand(state: AppState, markerId: string): AppState {
  return commitProject(state, deleteMarker(state.undoStack.present, markerId), "Deleted marker.");
}

export function setSectionBarsCommand(state: AppState, sectionId: string, bars: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, setSectionBars(state.undoStack.present, sectionId, bars), `Updated Section ${sectionId} length.`);
}

export function appendChordsmithSectionCommand(state: AppState, sectionId: string): AppState {
  if (!isSectionId(sectionId)) return { ...state, status: "Choose a valid Chordsmith section to add." };
  return commitProject(state, appendChordsmithSection(state.undoStack.present, sectionId), `Added Section ${sectionId} to the song.`);
}

export function setSectionChordCommand(state: AppState, sectionId: string, barIndex: number, degree: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, setSectionChord(state.undoStack.present, sectionId, barIndex, degree), `Updated Section ${sectionId} chord.`);
}

export function setChordsmithGlobalsCommand(state: AppState, patch: ChordsmithGlobalPatch): AppState {
  return commitProject(state, setChordsmithGlobals(state.undoStack.present, patch), "Updated Chordsmith global settings.");
}

export function setChordInstrumentCommand(state: AppState, instrument: string): AppState {
  return commitProject(state, setChordInstrument(state.undoStack.present, instrument), "Updated Chordsmith chord sound.");
}

export function cycleDrumStepCommand(state: AppState, sectionId: string, lane: string, step: number): AppState {
  if (!isSectionId(sectionId) || !["kick", "snare", "hat"].includes(lane)) return state;
  return commitProject(state, cycleDrumStep(state.undoStack.present, sectionId, lane as DrumLane, step), `Edited Section ${sectionId} ${lane}.`);
}

export function cycleDrumTupletCommand(state: AppState, sectionId: string, lane: string, step: number): AppState {
  if (!isSectionId(sectionId) || !["kick", "snare", "hat"].includes(lane)) return state;
  return commitProject(state, cycleDrumTuplet(state.undoStack.present, sectionId, lane as DrumLane, step), `Toggled Section ${sectionId} ${lane} tuplet.`);
}

export function applyDrumPresetCommand(state: AppState, sectionId: string, presetId: string): AppState {
  if (!isSectionId(sectionId)) return { ...state, status: "Choose a valid Chordsmith section before applying a drum preset." };
  const pcs = getPrimaryChordsmithSource(state.undoStack.present);
  const preset = findDrumPreset(presetId);
  if (!pcs || !preset) return { ...state, status: "Choose a valid drum preset." };
  if (!drumPresetVisibleForProject(preset, pcs)) return { ...state, status: "Choose a drum preset available for this time signature." };
  const pattern = drumPresetEventsForProject(preset.id, pcs);
  if (!pattern.events.length) return { ...state, status: "No drum pattern is available for this preset and time signature." };
  const note = pattern.note ? ` ${pattern.note}` : "";
  return commitProject(
    state,
    applyDrumPreset(state.undoStack.present, sectionId, preset.id),
    `Applied ${drumPresetLabel(preset, pcs)} drum preset to Section ${sectionId}.${note}`
  );
}

export function cycleBassStepCommand(state: AppState, sectionId: string, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, cycleBassStep(state.undoStack.present, sectionId, step), `Edited Section ${sectionId} bass.`);
}

export function setBassModeCommand(state: AppState, mode: string): AppState {
  return commitProject(state, setBassMode(state.undoStack.present, mode), `Bass mode set to ${mode === "manual" ? "manual" : "auto"}.`);
}

export function fillAutoBassCommand(state: AppState): AppState {
  return commitProject(state, fillAutoBass(state.undoStack.present), "Filled manual bass from auto bass.");
}

export function toggleBassHoldCommand(state: AppState, sectionId: string, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, toggleBassHold(state.undoStack.present, sectionId, step), `Toggled Section ${sectionId} bass hold.`);
}

export function toggleBassSlideCommand(state: AppState, sectionId: string, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, toggleBassSlide(state.undoStack.present, sectionId, step), `Toggled Section ${sectionId} bass slide.`);
}

export function toggleBassTupletCommand(state: AppState, sectionId: string, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, toggleBassTuplet(state.undoStack.present, sectionId, step), `Toggled Section ${sectionId} bass tuplet.`);
}

export function toggleBassAccentCommand(state: AppState, sectionId: string, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, toggleBassAccent(state.undoStack.present, sectionId, step), `Toggled Section ${sectionId} bass accent.`);
}

export function cycleMelodyStepCommand(state: AppState, sectionId: string, trackIndex: number, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, cycleMelodyStep(state.undoStack.present, sectionId, trackIndex, step), `Edited Section ${sectionId} melody.`);
}

export function setMelodyInstrumentCommand(state: AppState, sectionId: string, trackIndex: number, instrument: string): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, setMelodyInstrument(state.undoStack.present, sectionId, trackIndex, instrument), `Updated Section ${sectionId} melody instrument.`);
}

export function setMelodyOctaveCommand(state: AppState, sectionId: string, trackIndex: number, octave: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, setMelodyOctave(state.undoStack.present, sectionId, trackIndex, octave), `Updated Section ${sectionId} melody octave.`);
}

export function setMelodyPanCommand(state: AppState, sectionId: string, trackIndex: number, pan: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, setMelodyPan(state.undoStack.present, sectionId, trackIndex, pan), `Updated Section ${sectionId} melody pan.`);
}

export function setMelodyMuteCommand(state: AppState, sectionId: string, trackIndex: number, muted: boolean): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, setMelodyMute(state.undoStack.present, sectionId, trackIndex, muted), `Updated Section ${sectionId} melody mute.`);
}

export function setMelodySoloCommand(state: AppState, sectionId: string, trackIndex: number, solo: boolean): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, setMelodySolo(state.undoStack.present, sectionId, trackIndex, solo), `Updated Section ${sectionId} melody solo.`);
}

export function toggleMelodyHoldCommand(state: AppState, sectionId: string, trackIndex: number, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, toggleMelodyHold(state.undoStack.present, sectionId, trackIndex, step), `Toggled Section ${sectionId} melody hold.`);
}

export function toggleMelodySlideCommand(state: AppState, sectionId: string, trackIndex: number, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, toggleMelodySlide(state.undoStack.present, sectionId, trackIndex, step), `Toggled Section ${sectionId} melody slide.`);
}

export function toggleMelodyTupletCommand(state: AppState, sectionId: string, trackIndex: number, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, toggleMelodyTuplet(state.undoStack.present, sectionId, trackIndex, step), `Toggled Section ${sectionId} melody tuplet.`);
}

export function cycleGuitarStepCommand(state: AppState, sectionId: string, step: number): AppState {
  if (!isSectionId(sectionId)) return state;
  return commitProject(state, cycleGuitarStep(state.undoStack.present, sectionId, step), `Edited Section ${sectionId} guitar.`);
}

export function applyGuitarPresetCommand(state: AppState, sectionId: string, presetId: string): AppState {
  if (!isSectionId(sectionId)) return { ...state, status: "Choose a valid Chordsmith section before applying a guitar preset." };
  const pcs = getPrimaryChordsmithSource(state.undoStack.present);
  const section = pcs?.sections[sectionId];
  const preset = findGuitarPreset(presetId);
  if (!pcs || !section || !preset) return { ...state, status: "Choose a valid guitar preset." };
  if (!guitarPresetVisibleForProject(preset, pcs)) return { ...state, status: "Choose a guitar preset available for this time signature." };
  const pattern = guitarPresetPatternForProject(preset.id, pcs, section);
  if (!pattern.pattern.some((art) => art !== "off")) return { ...state, status: "No guitar pattern is available for this preset and time signature." };
  return commitProject(
    state,
    applyGuitarPreset(state.undoStack.present, sectionId, preset.id),
    `Applied ${guitarPresetLabel(preset)} guitar preset to Section ${sectionId}.`
  );
}

export function setGuitarSettingsCommand(state: AppState, patch: Parameters<typeof setGuitarSettings>[1]): AppState {
  return commitProject(state, setGuitarSettings(state.undoStack.present, patch), "Updated Chordsmith guitar settings.");
}

export function undoCommand(state: AppState): AppState {
  return { ...state, undoStack: undo(state.undoStack), status: "Undo." };
}

export function redoCommand(state: AppState): AppState {
  return { ...state, undoStack: redo(state.undoStack), status: "Redo." };
}
