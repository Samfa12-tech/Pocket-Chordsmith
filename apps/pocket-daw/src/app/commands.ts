import { parseAnyImportText } from "../compatibility/pcsParser";
import { sanitizePocketChordsmithProject } from "../compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../compatibility/pcsToDaw";
import { migratePocketDawProject } from "../compatibility/migrations";
import { cloneProject, createDefaultMetronomeSettings, parsePocketDawProjectFile } from "../daw/dawProject";
import { activateAudioTake, activateAudioTakeLane, applyAudioClipAction, cropClipToRange, deleteClip, deleteClipRange, duplicateClip, moveClipByBars, moveClipToBar, pasteClip, repeatGeneratedSectionClipToEnd, rippleDeleteClipRange, rippleDeleteTimelineRange, setAudioClipProperty, setAudioTakeArchived, setClipTransform, setGeneratedClipStemMute, splitClipAtBar, splitClipsAtRange, splitGroupedAudioTakesAtBar, toggleClipMute, trimClipEnd, trimClipStart, type AudioClipAction, type AudioClipPropertyField, type ClipTransformField, type GeneratedStemRole } from "../daw/clips";
import { addTrackFx, removeTrackFx, setTrackInput, setTrackPan, setTrackRecordingChannelMode, setTrackVolume, toggleTrackArmed, toggleTrackFx, toggleTrackMonitor, toggleTrackMute, toggleTrackSolo } from "../daw/mixer";
import { setTrackRecordingInputAssignment } from "../daw/recordingInputs";
import { addDrumLaneFx, branchGeneratedDrumsToTracks, collapseGeneratedDrumBranches, cycleDrumBranchStep, drumBranchGroupCollapsed, isDrumLaneId, removeDrumLaneFx, setDrumBranchGroupCollapsed, setDrumLaneGate, setDrumLaneMute, setDrumLanePan, setDrumLaneVolume, toggleDrumLaneFx } from "../daw/drumLanes";
import { addTrackToProject, renameTrack, setTrackFolder, toggleFolderExpanded, type AddTrackKind } from "../daw/tracks";
import { placeAudioClipOnTimeline, placePunchRecordingClipOnTrack } from "../daw/audioClips";
import { addMidiAftertouch, addMidiController, addMidiNote, addMidiPitchBend, addMidiProgramChange, applyMidiGrooveTemplate, createEmptyMidiClip, createMidiTempoMapSummary, cropMidiClipToRange, deleteMidiAftertouch, deleteMidiClipRange, deleteMidiController, deleteMidiNote, deleteMidiPitchBend, deleteMidiProgramChange, duplicateMidiAftertouch, duplicateMidiController, duplicateMidiNote, duplicateMidiPitchBend, duplicateMidiProgramChange, midiDataFromClip, midiGrooveTemplateById, moveMidiNote, quantizeMidiClip, resizeMidiNote, rippleDeleteMidiClipRange, rippleDeleteMidiTimelineRange, setMidiAftertouchField, setMidiClipBarLength, setMidiControllerField, setMidiNoteField, setMidiNoteVelocity, setMidiPitchBendField, setMidiProgramChangeField, splitMidiClipsAtRange, swingMidiClip, transformMidiClipPitch, transformMidiClipVelocity, transposeMidiNote, type MidiAftertouchField, type MidiControllerField, type MidiGrooveTemplateId, type MidiNoteField, type MidiPitchBendField, type MidiPitchTransform, type MidiProgramChangeField, type MidiQuantizeGrid, type MidiSwingPercent, type MidiVelocityTransform } from "../daw/midiClips";
import type { MidiTempoMapSummary } from "../daw/midiClips";
import { convertMidiClipToBassOverlays } from "../daw/midiBassConversion";
import { convertMidiClipToChordOverlays } from "../daw/midiChordConversion";
import { convertMidiClipToDrumBranchOverlays } from "../daw/midiDrumConversion";
import { convertMidiClipToMelodyOverlays } from "../daw/midiMelodyConversion";
import { addAutomationPoint, deleteAutomationPoint, ensureClipAutomationLane, ensureFxParameterAutomationLane, ensureProjectAutomationLane, ensureTrackAutomationLane, ensureTrackSendAutomationLane, getClipAutomationLane, getFxParameterAutomationLane, getTrackAutomationLane, getTrackSendAutomationLane, setAutomationLaneEnabled, setAutomationLanePoints, type ClipAutomationField, type ProjectAutomationField, type TrackAutomationField, type TrackSendAutomationField, updateAutomationPoint } from "../daw/automation";
import { addBusTrack, addReturnTrack, routeTrackToOutput, setTrackSendLevel, setTrackSendMode, type TrackSendMode } from "../daw/routing";
import { setFxSlotParameter, setPocketProEqPreset } from "../daw/fx";
import { pushUndo, redo, undo } from "../daw/undo";
import { addGameStateMarkerAtBar, addMarkerAtBar, clearLoop, clearTimelineSelection, deleteMarker, effectiveMeterAtBar, gameStateMarkerLabel, isGameStateMarkerId, renameMarker, setLoopToClip, setTimelineSelectionRange, setTimelineSelectionToClip, setTimelineSelectionToLoop, snapBarValue, snapBeatStepAtBar, snapProjectBarValue, timelineQuarterNoteBeatsBetweenBars } from "../daw/timeline";
import {
  appendChordsmithSection,
  applyBassPreset,
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
import { bassPresetLabel, bassPresetPatternForProject, bassPresetVisibleForProject, findBassPreset } from "../daw/chordsmithBassPresets";
import { findGuitarPreset, guitarPresetLabel, guitarPresetPatternForProject, guitarPresetVisibleForProject } from "../daw/chordsmithGuitarPresets";
import type { AutomationPoint, Clip, PocketDawProject, ProjectMeterMapPoint, RecordingChannelMode, RecordingInputMode, TrackRecordingInput } from "../daw/schema";
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

export type ExportProfileSettingField = "sampleRate" | "bitDepth" | "tailSeconds" | "channelMode" | "normalize" | "dither";

export function setExportProfileSettingCommand(state: AppState, profileId: string, field: ExportProfileSettingField, value: number | string): AppState {
  const project = state.undoStack.present;
  const profile = project.exportProfiles.find((item) => item.id === profileId);
  if (!profile) return { ...state, status: "Choose an export profile before editing render settings." };
  const next = cloneProject(project);
  const nextProfile = next.exportProfiles.find((item) => item.id === profileId);
  if (!nextProfile) return state;
  if (field === "sampleRate") {
    nextProfile.sampleRate = clampExportSampleRate(Number(value));
    return commitProject(state, next, `Set ${profile.name} sample rate to ${nextProfile.sampleRate} Hz.`);
  }
  if (field === "bitDepth") {
    nextProfile.bitDepth = Number(value) === 32 ? 32 : Number(value) === 24 ? 24 : 16;
    return commitProject(state, next, `Set ${profile.name} bit depth to ${nextProfile.bitDepth === 32 ? "32-bit float" : `${nextProfile.bitDepth}-bit PCM`}.`);
  }
  if (field === "channelMode") {
    const channelMode = String(value).toLowerCase() === "mono" ? "mono" : "stereo";
    nextProfile.settings = {
      ...(nextProfile.settings || {}),
      channelMode
    };
    return commitProject(state, next, `Set ${profile.name} channel mode to ${channelMode}.`);
  }
  if (field === "normalize") {
    const normalize = String(value).toLowerCase() === "peak" ? "peak" : false;
    nextProfile.settings = {
      ...(nextProfile.settings || {}),
      normalize
    };
    return commitProject(state, next, `Set ${profile.name} normalization to ${normalize === "peak" ? "peak" : "off"}.`);
  }
  if (field === "dither") {
    const dither = String(value).toLowerCase() === "tpdf" ? "tpdf" : "off";
    nextProfile.settings = {
      ...(nextProfile.settings || {}),
      dither
    };
    return commitProject(state, next, `Set ${profile.name} dither to ${dither === "tpdf" ? "TPDF" : "off"}.`);
  }
  const tailValue = Number(value);
  const tailSeconds = Math.round(Math.max(0, Math.min(30, Number.isFinite(tailValue) ? tailValue : 0)) * 100) / 100;
  nextProfile.settings = {
    ...(nextProfile.settings || {}),
    tailSeconds
  };
  return commitProject(state, next, `Set ${profile.name} tail to ${tailSeconds} seconds.`);
}

function clampExportSampleRate(value: number): number {
  const sampleRate = Math.round(Number.isFinite(value) ? value : 44100);
  return Math.max(22050, Math.min(192000, sampleRate));
}

export function moveSelectedClip(state: AppState, delta: number): AppState {
  if (!state.selectedClipId) return state;
  return commitProject(state, moveClipByBars(state.undoStack.present, state.selectedClipId, delta), `Moved clip ${delta > 0 ? "right" : "left"} ${Math.abs(delta)} bar.`);
}

export function moveSelectedClipBySnap(state: AppState, direction: -1 | 1): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === state.selectedClipId);
  const delta = state.snapMode === "beat" ? direction * snapBeatStepAtBar(project, clip?.startBar || state.playheadBar) : direction;
  return moveSelectedClip(state, delta);
}

export function moveClipToBarCommand(state: AppState, clipId: string, startBar: number): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return { ...state, status: "Choose a clip before dragging." };
  const snapped = snapProjectBarValue(project, startBar, state.snapMode);
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
  const snappedEnd = snapProjectBarValue(project, endBar, state.snapMode);
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

export function setSelectedClipTransformCommand(state: AppState, clipId: string, field: ClipTransformField, value: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return { ...state, status: "Choose a clip before editing transforms." };
  const next = setClipTransform(state.undoStack.present, clipId, field, value);
  return {
    ...commitProject(state, next, field === "transpose" ? `Set ${clip.name} transpose to ${next.timeline.clips.find((item) => item.id === clipId)?.transforms.transpose ?? 0}.` : `Set ${clip.name} gain to ${next.timeline.clips.find((item) => item.id === clipId)?.transforms.gain ?? 1}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setSelectedGeneratedClipStemMuteCommand(state: AppState, clipId: string, stem: GeneratedStemRole, muted: boolean): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "generated-section") return { ...state, status: "Choose a generated section before editing stem mutes." };
  const next = setGeneratedClipStemMute(state.undoStack.present, clipId, stem, muted);
  return {
    ...commitProject(state, next, `${muted ? "Muted" : "Unmuted"} ${stem} in ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setSelectedAudioClipPropertyCommand(state: AppState, clipId: string, field: AudioClipPropertyField, value: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio clip before editing audio properties." };
  const next = setAudioClipProperty(state.undoStack.present, clipId, field, value);
  const updated = next.timeline.clips.find((item) => item.id === clipId);
  const labels: Record<AudioClipPropertyField, string> = {
    gain: "gain",
    sourceOffsetSeconds: "source offset",
    durationSeconds: "duration",
    fadeInSeconds: "fade in",
    fadeOutSeconds: "fade out",
    playbackRate: "playback rate",
    pitchSemitones: "varispeed pitch"
  };
  return {
    ...commitProject(state, next, `Set ${clip.name} ${labels[field]} to ${updated?.metadata?.[field] ?? value}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function applySelectedAudioClipActionCommand(state: AppState, clipId: string, action: AudioClipAction): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio clip before editing audio properties." };
  const result = applyAudioClipAction(state.undoStack.present, clipId, action);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function placePunchRecordingClipCommand(
  state: AppState,
  mediaPoolItemId: string,
  trackId: string,
  captureStartBar: number,
  punchStartBar: number,
  punchEndBar: number
): AppState {
  const media = state.undoStack.present.mediaPool.find((item) => item.id === mediaPoolItemId && item.kind === "audio");
  const track = state.undoStack.present.tracks.find((item) => item.id === trackId && item.trackType === "audio");
  if (!media || !track) return { ...state, status: "Choose an audio recording media item and audio track before placing a punch take." };
  const result = placePunchRecordingClipOnTrack(state.undoStack.present, mediaPoolItemId, trackId, { captureStartBar, punchStartBar, punchEndBar });
  if (!result.clipId || result.project === state.undoStack.present) {
    return { ...state, selectedTrackId: trackId, status: `Could not place punch take ${media.name}; check the punch range.` };
  }
  return {
    ...commitProject(state, result.project, `Placed punch take ${media.name} from bar ${punchStartBar} to ${punchEndBar}.`),
    selectedClipId: result.clipId,
    selectedTrackId: trackId,
    lowerDockTab: "audio-editor"
  };
}

export function placePunchRecordingClipFromRangeCommand(
  state: AppState,
  mediaPoolItemId: string,
  trackId: string,
  captureStartBar: number
): AppState {
  const selection = state.undoStack.present.timeline.selection;
  if (!selection || selection.source !== "punch") {
    return { ...state, selectedTrackId: trackId, status: "Set an explicit punch range before placing a punch take." };
  }
  const placed = placePunchRecordingClipCommand(state, mediaPoolItemId, trackId, captureStartBar, selection.startBar, selection.endBar);
  if (placed.undoStack.present === state.undoStack.present) return placed;
  const media = state.undoStack.present.mediaPool.find((item) => item.id === mediaPoolItemId);
  return {
    ...placed,
    status: `Placed punch take ${media?.name || "recording"} from active punch range ${formatRangeBar(selection.startBar)} to ${formatRangeBar(selection.endBar)}.`
  };
}

export function activateAudioTakeCommand(state: AppState, clipId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio take before activating it." };
  const result = activateAudioTake(state.undoStack.present, clipId);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function activateAudioTakeLaneCommand(state: AppState, clipId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio take lane before activating it." };
  const result = activateAudioTakeLane(state.undoStack.present, clipId);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setAudioTakeArchivedCommand(state: AppState, clipId: string, archived: boolean): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio take before archiving it." };
  const result = setAudioTakeArchived(state.undoStack.present, clipId, archived);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function compAudioTakeFromPlayheadCommand(state: AppState, clipId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio take before comping." };
  const splitBar = snapBarValue(state.playheadBar, "bar", state.undoStack.present.project.timeSig);
  const result = splitGroupedAudioTakesAtBar(state.undoStack.present, clipId, splitBar);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: result.rightClipId || clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
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

export function cutSelectedClip(state: AppState): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === state.selectedClipId);
  if (!clip) return { ...state, status: "Select a clip to cut." };
  const next = deleteClip(state.undoStack.present, clip.id);
  return {
    ...commitProject({ ...state, clipClipboard: JSON.parse(JSON.stringify(clip)) }, next, `Cut ${clip.name}.`),
    selectedClipId: next.timeline.clips[0]?.id || null
  };
}

export function copySelectedClipRangeCommand(state: AppState): AppState {
  const result = selectedClipRangeClipboard(state, "copying");
  if (!result.clip || !result.sourceClip) return { ...state, status: result.status };
  return {
    ...state,
    clipClipboard: result.clip,
    selectedClipId: result.sourceClip.id,
    selectedTrackId: result.sourceClip.trackId || state.selectedTrackId,
    status: `Copied range from ${result.sourceClip.name}.`
  };
}

export function cutSelectedClipRangeCommand(state: AppState): AppState {
  const selection = state.undoStack.present.timeline.selection;
  const result = selectedClipRangeClipboard(state, "cutting");
  if (!selection || !result.clip || !result.sourceClip) return { ...state, status: result.status };
  const deleteResult = result.sourceClip.type === "midi"
    ? deleteMidiClipRange(state.undoStack.present, result.sourceClip.id, selection.startBar, selection.endBar)
    : deleteClipRange(state.undoStack.present, result.sourceClip.id, selection.startBar, selection.endBar);
  if (!deleteResult.changed) {
    return {
      ...state,
      selectedClipId: result.sourceClip.id,
      selectedTrackId: result.sourceClip.trackId || state.selectedTrackId,
      status: deleteResult.status
    };
  }
  return {
    ...commitProject({ ...state, clipClipboard: result.clip }, deleteResult.project, `Cut range from ${result.sourceClip.name}.`),
    selectedClipId: deleteResult.rightClipId || (deleteResult.deletedClipId ? null : result.sourceClip.id),
    selectedTrackId: result.sourceClip.trackId || state.selectedTrackId
  };
}

export function pasteClipAtPlayhead(state: AppState): AppState {
  if (!state.clipClipboard) return { ...state, status: "Copy a clip before pasting." };
  const startBar = snapProjectBarValue(state.undoStack.present, state.playheadBar, state.snapMode);
  const result = pasteClip(state.undoStack.present, state.clipClipboard, startBar);
  return {
    ...commitProject(state, result.project, "Pasted clip at playhead."),
    selectedClipId: result.pastedId
  };
}

function selectedClipRangeClipboard(state: AppState, verb: "copying" | "cutting"): { clip: Clip | null; sourceClip: Clip | null; status: string } {
  const selection = state.undoStack.present.timeline.selection;
  if (!selection) return { clip: null, sourceClip: null, status: `Set an edit range before ${verb} range.` };
  if (!state.selectedClipId) return { clip: null, sourceClip: null, status: `Select a clip before ${verb} range.` };
  const sourceClip = state.undoStack.present.timeline.clips.find((item) => item.id === state.selectedClipId) || null;
  if (!sourceClip) return { clip: null, sourceClip: null, status: `Select a clip before ${verb} range.` };
  const cropResult = sourceClip.type === "midi"
    ? cropMidiClipToRange(state.undoStack.present, sourceClip.id, selection.startBar, selection.endBar)
    : cropClipToRange(state.undoStack.present, sourceClip.id, selection.startBar, selection.endBar);
  if (!cropResult.changed) return { clip: null, sourceClip, status: cropResult.status };
  const cropped = cropResult.project.timeline.clips.find((item) => item.id === sourceClip.id);
  if (!cropped) return { clip: null, sourceClip, status: `The selected clip does not overlap the edit range.` };
  return { clip: JSON.parse(JSON.stringify(cropped)), sourceClip, status: cropResult.status };
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

export function setTrackFolderCommand(state: AppState, trackId: string, folderId: string | null): AppState {
  const project = state.undoStack.present;
  const track = project.tracks.find((item) => item.id === trackId);
  const folder = folderId ? project.tracks.find((item) => item.id === folderId && item.trackType === "folder") : null;
  const next = setTrackFolder(project, trackId, folder?.id || null);
  if (next === project) return { ...state, status: "Track folder unchanged." };
  return {
    ...commitProject(state, next, folder ? `Moved ${track?.name || "track"} into ${folder.name}.` : `Removed ${track?.name || "track"} from folder.`),
    selectedTrackId: trackId
  };
}

export function toggleFolderExpandedCommand(state: AppState, folderId: string): AppState {
  const project = state.undoStack.present;
  const folder = project.tracks.find((item) => item.id === folderId && item.trackType === "folder");
  const next = toggleFolderExpanded(project, folderId);
  if (next === project) return { ...state, status: "Folder unchanged." };
  const expanded = next.tracks.find((item) => item.id === folderId)?.metadata?.folderExpanded !== false;
  return {
    ...commitProject(state, next, `${folder?.name || "Folder"} ${expanded ? "expanded" : "collapsed"}.`),
    selectedTrackId: folderId
  };
}

export function addEmptyMidiClipCommand(state: AppState, trackId = state.selectedTrackId || "", startBar = state.playheadBar): AppState {
  const track = state.undoStack.present.tracks.find((item) => item.id === trackId);
  if (!track || track.trackType !== "midi") return { ...state, status: "Select a MIDI track before adding an empty MIDI clip." };
  const result = createEmptyMidiClip(state.undoStack.present, track.id, Math.max(1, startBar), `${track.name} Clip`);
  if (!result.clipId) return { ...state, status: "Could not add a MIDI clip to the selected track." };
  return {
    ...commitProject(state, result.project, `Added MIDI clip to ${track.name}.`),
    selectedClipId: result.clipId,
    selectedTrackId: result.trackId,
    lowerDockTab: "piano-roll"
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

export function setTrackSendLevelCommand(state: AppState, trackId: string, returnTrackId: string, level: number): AppState {
  const project = state.undoStack.present;
  const track = project.tracks.find((item) => item.id === trackId);
  const ret = project.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
  if (!track || !ret || track.role === "master" || track.trackType === "return") {
    return { ...state, status: "Choose a source track and return before editing sends." };
  }
  return {
    ...commitProject(state, setTrackSendLevel(project, trackId, returnTrackId, level), `Set ${track.name} send to ${ret.name}.`),
    selectedTrackId: trackId
  };
}

export function setTrackSendModeCommand(state: AppState, trackId: string, returnTrackId: string, mode: TrackSendMode): AppState {
  const project = state.undoStack.present;
  const track = project.tracks.find((item) => item.id === trackId);
  const ret = project.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
  if (!track || !ret || track.role === "master" || track.trackType === "return") {
    return { ...state, status: "Choose a source track and return before editing send mode." };
  }
  const label = mode === "pre-fader" ? "pre-fader" : "post-fader";
  return {
    ...commitProject(state, setTrackSendMode(project, trackId, returnTrackId, mode), `Set ${track.name} send to ${ret.name} ${label}.`),
    selectedTrackId: trackId
  };
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

export function addAutomationPointToLaneCommand(state: AppState, laneId: string, bar: number, value: number, curve: string = "linear"): AppState {
  const lane = state.undoStack.present.automation.lanes.find((item) => item.id === laneId);
  if (!lane) return { ...state, status: "Choose an automation lane before drawing points." };
  return commitProject(
    state,
    addAutomationPoint(state.undoStack.present, laneId, { bar, value, curve: cleanAutomationCurve(curve) }),
    "Added drawn automation point."
  );
}

export function addAutomationPointsToLaneCommand(state: AppState, laneId: string, points: Array<{ bar: number; value: number; curve?: string }>): AppState {
  const lane = state.undoStack.present.automation.lanes.find((item) => item.id === laneId);
  if (!lane) return { ...state, status: "Choose an automation lane before drawing points." };
  const cleanPoints = points.filter((point) => Number.isFinite(point.bar) && Number.isFinite(point.value));
  if (!cleanPoints.length) return { ...state, status: "Draw on an automation lane to add points." };
  const next = cleanPoints.reduce(
    (project, point) => addAutomationPoint(project, laneId, { bar: point.bar, value: point.value, curve: cleanAutomationCurve(point.curve) }),
    state.undoStack.present
  );
  return commitProject(state, next, `Added ${cleanPoints.length} drawn automation point${cleanPoints.length === 1 ? "" : "s"}.`);
}

export function recordTrackAutomationPointCommand(state: AppState, trackId: string, field: TrackAutomationField, value: number, bar = state.playheadBar || 1): AppState {
  const project = state.undoStack.present;
  const track = project.tracks.find((item) => item.id === trackId);
  const lane = getTrackAutomationLane(project, trackId, field);
  if (!track || !lane) return state;
  const automationValue = field === "volume" ? volumeAutomationMultiplier(track.volume, value) : value;
  return commitProject(
    state,
    addAutomationPoint(project, lane.id, { bar, value: automationValue, curve: "linear" }),
    `Recorded ${track.name} ${field} automation point.`
  );
}

export function ensureProjectAutomationLaneCommand(state: AppState, field: ProjectAutomationField): AppState {
  const result = ensureProjectAutomationLane(state.undoStack.present, field);
  return commitProject(state, result.project, `Enabled project ${field} automation lane.`);
}

function volumeAutomationMultiplier(baseVolume: number, targetVolume: number): number {
  if (!Number.isFinite(targetVolume)) return 1;
  if (!Number.isFinite(baseVolume) || Math.abs(baseVolume) < 0.0001) return targetVolume;
  return targetVolume / baseVolume;
}

export function addProjectAutomationPointCommand(state: AppState, field: ProjectAutomationField): AppState {
  const project = state.undoStack.present;
  const ensured = ensureProjectAutomationLane(project, field);
  const value = field === "tempo" ? project.project.bpm : 0;
  const next = addAutomationPoint(ensured.project, ensured.laneId, { bar: state.playheadBar || 1, value, curve: "linear" });
  return commitProject(state, next, `Added project ${field} automation point.`);
}

export type ProjectMeterMapField = "bar" | "numerator" | "denominator";

export function addProjectMeterMapPointCommand(state: AppState, options: Partial<Pick<ProjectMeterMapPoint, "bar" | "numerator" | "denominator">> = {}): AppState {
  const project = state.undoStack.present;
  const bar = cleanMeterBar(options.bar ?? state.playheadBar ?? 1);
  const meter = effectiveMeterAtBar(project, bar);
  const point: ProjectMeterMapPoint = cleanProjectMeterMapPoint({
    id: uniqueProjectMeterMapId(project, "meter_manual"),
    bar,
    numerator: options.numerator ?? meter.numerator,
    denominator: options.denominator ?? meter.denominator,
    source: "manual"
  });
  const next = cloneProject(project);
  next.project.meterMap = sortProjectMeterMap([...(next.project.meterMap || []), point]);
  return commitProject(state, next, `Added project meter ${point.numerator}/${point.denominator} at Bar ${point.bar}.`);
}

export function updateProjectMeterMapPointCommand(state: AppState, pointId: string, patch: Partial<Pick<ProjectMeterMapPoint, ProjectMeterMapField>>): AppState {
  const project = state.undoStack.present;
  const existing = (project.project.meterMap || []).find((point) => point.id === pointId);
  if (!existing) return { ...state, status: "Choose a project meter-map point before editing it." };
  const next = cloneProject(project);
  next.project.meterMap = sortProjectMeterMap((next.project.meterMap || []).map((point) => {
    if (point.id !== pointId) return point;
    return cleanProjectMeterMapPoint({
      ...point,
      bar: patch.bar ?? point.bar,
      numerator: patch.numerator ?? point.numerator,
      denominator: patch.denominator ?? point.denominator,
      source: point.source || "manual"
    });
  }));
  const updated = next.project.meterMap.find((point) => point.id === pointId) || existing;
  return commitProject(state, next, `Updated project meter ${updated.numerator}/${updated.denominator} at Bar ${updated.bar}.`);
}

export function deleteProjectMeterMapPointCommand(state: AppState, pointId: string): AppState {
  const project = state.undoStack.present;
  const existing = (project.project.meterMap || []).find((point) => point.id === pointId);
  if (!existing) return { ...state, status: "Choose a project meter-map point before deleting it." };
  const next = cloneProject(project);
  next.project.meterMap = (next.project.meterMap || []).filter((point) => point.id !== pointId);
  return commitProject(state, next, `Deleted project meter ${existing.numerator}/${existing.denominator} at Bar ${existing.bar}.`);
}

function cleanProjectMeterMapPoint(point: ProjectMeterMapPoint): ProjectMeterMapPoint {
  return {
    ...point,
    id: String(point.id || "meter_manual").replace(/[^a-z0-9_-]+/gi, "-") || "meter_manual",
    bar: cleanMeterBar(point.bar),
    numerator: Math.max(1, Math.min(32, Math.round(Number(point.numerator) || 4))),
    denominator: Math.max(1, Math.min(32, Math.round(Number(point.denominator) || 4)))
  };
}

function cleanMeterBar(value: unknown): number {
  const bar = Number(value);
  return Math.round(Math.max(1, Math.min(4096, Number.isFinite(bar) ? bar : 1)) * 1000000) / 1000000;
}

function sortProjectMeterMap(points: ProjectMeterMapPoint[]): ProjectMeterMapPoint[] {
  return points.slice().sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id));
}

function uniqueProjectMeterMapId(project: PocketDawProject, base: string): string {
  const existing = new Set((project.project.meterMap || []).map((point) => point.id));
  let id = base;
  let n = 2;
  while (existing.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

export function ensureTrackSendAutomationLaneCommand(state: AppState, trackId: string, returnTrackId: string, field: TrackSendAutomationField): AppState {
  const project = state.undoStack.present;
  const track = project.tracks.find((item) => item.id === trackId);
  const ret = project.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
  if (!track || !ret || track.role === "master" || track.trackType === "return") {
    return { ...state, status: "Choose a source track and return before automating sends." };
  }
  const result = ensureTrackSendAutomationLane(project, trackId, returnTrackId, field);
  return {
    ...commitProject(state, result.project, `Enabled ${track.name} send automation to ${ret.name}.`),
    selectedTrackId: trackId
  };
}

export function addTrackSendAutomationPointCommand(state: AppState, trackId: string, returnTrackId: string, field: TrackSendAutomationField): AppState {
  const project = state.undoStack.present;
  const track = project.tracks.find((item) => item.id === trackId);
  const ret = project.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
  if (!track || !ret || track.role === "master" || track.trackType === "return") {
    return { ...state, status: "Choose a source track and return before automating sends." };
  }
  const ensured = ensureTrackSendAutomationLane(project, trackId, returnTrackId, field);
  const levels = track.metadata?.sendLevels;
  const fallbackLevel = levels && typeof levels === "object" && !Array.isArray(levels) ? Number((levels as Record<string, unknown>)[returnTrackId]) : 0;
  const next = addAutomationPoint(ensured.project, ensured.laneId, { bar: state.playheadBar || 1, value: Number.isFinite(fallbackLevel) ? fallbackLevel : 0, curve: "linear" });
  return {
    ...commitProject(state, next, `Added ${track.name} send automation point to ${ret.name}.`),
    selectedTrackId: trackId
  };
}

export function recordTrackSendAutomationPointCommand(state: AppState, trackId: string, returnTrackId: string, field: TrackSendAutomationField, value: number, bar = state.playheadBar || 1): AppState {
  const project = state.undoStack.present;
  const track = project.tracks.find((item) => item.id === trackId);
  const ret = project.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
  const lane = getTrackSendAutomationLane(project, trackId, returnTrackId, field);
  if (!track || !ret || !lane || track.role === "master" || track.trackType === "return") return state;
  return {
    ...commitProject(
      state,
      addAutomationPoint(project, lane.id, { bar, value, curve: "linear" }),
      `Recorded ${track.name} send automation point to ${ret.name}.`
    ),
    selectedTrackId: trackId
  };
}

export function ensureClipAutomationLaneCommand(state: AppState, clipId: string, field: ClipAutomationField): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio clip before automating clip gain." };
  const result = ensureClipAutomationLane(state.undoStack.present, clipId, field);
  return {
    ...commitProject(state, result.project, `Enabled ${clip.name} gain automation.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function addClipAutomationPointCommand(state: AppState, clipId: string, field: ClipAutomationField): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return { ...state, status: "Choose an audio clip before automating clip gain." };
  const ensured = ensureClipAutomationLane(state.undoStack.present, clipId, field);
  const updatedClip = ensured.project.timeline.clips.find((item) => item.id === clipId);
  const fallbackGain = typeof updatedClip?.metadata?.gain === "number" ? updatedClip.metadata.gain : updatedClip?.transforms.gain ?? 1;
  const next = addAutomationPoint(ensured.project, ensured.laneId, { bar: state.playheadBar || clip.startBar || 1, value: fallbackGain, curve: "linear" });
  return {
    ...commitProject(state, next, `Added ${clip.name} gain automation point.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function recordClipAutomationPointCommand(state: AppState, clipId: string, field: ClipAutomationField, value: number, bar = state.playheadBar || 1): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  const lane = getClipAutomationLane(project, clipId, field);
  if (!clip || clip.type !== "audio" || !lane) return state;
  return {
    ...commitProject(
      state,
      addAutomationPoint(project, lane.id, { bar, value, curve: "linear" }),
      `Recorded ${clip.name} ${field} automation point.`
    ),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function updateAutomationPointCommand(state: AppState, laneId: string, pointIndex: number, bar: number, value: number, curve?: string): AppState {
  return commitProject(
    state,
    updateAutomationPoint(state.undoStack.present, laneId, pointIndex, { bar, value, curve: cleanAutomationCurve(curve) }),
    "Updated automation point."
  );
}

export function deleteAutomationPointCommand(state: AppState, laneId: string, pointIndex: number): AppState {
  return commitProject(state, deleteAutomationPoint(state.undoStack.present, laneId, pointIndex), "Deleted automation point.");
}

export function setAutomationLaneEnabledCommand(state: AppState, laneId: string, enabled: boolean): AppState {
  return commitProject(state, setAutomationLaneEnabled(state.undoStack.present, laneId, enabled), enabled ? "Automation lane enabled." : "Automation lane disabled.");
}

function cleanAutomationCurve(value: string | undefined): NonNullable<AutomationPoint["curve"]> {
  if (value === "hold" || value === "ease-in" || value === "ease-out") return value;
  return "linear";
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
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before adding notes." };
  const tick = midiTickAtPlayhead(state, clip);
  return {
    ...commitProject(state, addMidiNote(state.undoStack.present, clipId, tick), `Added MIDI note to ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setMidiClipBarLengthCommand(state: AppState, clipId: string, barLength: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before editing clip length." };
  const next = setMidiClipBarLength(state.undoStack.present, clipId, barLength);
  const updated = next.timeline.clips.find((item) => item.id === clipId);
  return {
    ...commitProject(state, next, `Set ${clip.name} length to ${updated?.barLength ?? clip.barLength} bars.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function deleteMidiNoteCommand(state: AppState, clipId: string, noteId: string): AppState {
  return commitProject(state, deleteMidiNote(state.undoStack.present, clipId, noteId), "Deleted MIDI note.");
}

export function duplicateMidiNoteCommand(state: AppState, clipId: string, noteId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before duplicating notes." };
  return {
    ...commitProject(state, duplicateMidiNote(state.undoStack.present, clipId, noteId), `Duplicated ${clip.name} note.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
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

export function setMidiNoteFieldCommand(state: AppState, clipId: string, noteId: string, field: MidiNoteField, value: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before editing note data." };
  return {
    ...commitProject(state, setMidiNoteField(state.undoStack.present, clipId, noteId, field, value), `Updated ${clip.name} note ${field}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function addMidiControllerCommand(state: AppState, clipId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before adding controller data." };
  const tick = midiTickAtPlayhead(state, clip);
  return {
    ...commitProject(state, addMidiController(state.undoStack.present, clipId, tick), `Added CC1 controller point to ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setMidiControllerFieldCommand(state: AppState, clipId: string, controllerId: string, field: MidiControllerField, value: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before editing controller data." };
  return {
    ...commitProject(state, setMidiControllerField(state.undoStack.present, clipId, controllerId, field, value), `Updated ${clip.name} controller ${field}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function duplicateMidiControllerCommand(state: AppState, clipId: string, controllerId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before duplicating controller data." };
  return {
    ...commitProject(state, duplicateMidiController(state.undoStack.present, clipId, controllerId), `Duplicated ${clip.name} controller point.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function deleteMidiControllerCommand(state: AppState, clipId: string, controllerId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before deleting controller data." };
  return {
    ...commitProject(state, deleteMidiController(state.undoStack.present, clipId, controllerId), `Deleted ${clip.name} controller point.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function addMidiProgramChangeCommand(state: AppState, clipId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before adding program changes." };
  const tick = midiTickAtPlayhead(state, clip);
  return {
    ...commitProject(state, addMidiProgramChange(state.undoStack.present, clipId, tick), `Added program change to ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setMidiProgramChangeFieldCommand(state: AppState, clipId: string, programId: string, field: MidiProgramChangeField, value: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before editing program changes." };
  return {
    ...commitProject(state, setMidiProgramChangeField(state.undoStack.present, clipId, programId, field, value), `Updated ${clip.name} program ${field}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function duplicateMidiProgramChangeCommand(state: AppState, clipId: string, programId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before duplicating program changes." };
  return {
    ...commitProject(state, duplicateMidiProgramChange(state.undoStack.present, clipId, programId), `Duplicated ${clip.name} program change.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function deleteMidiProgramChangeCommand(state: AppState, clipId: string, programId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before deleting program changes." };
  return {
    ...commitProject(state, deleteMidiProgramChange(state.undoStack.present, clipId, programId), `Deleted ${clip.name} program change.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function addMidiPitchBendCommand(state: AppState, clipId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before adding pitch bends." };
  const tick = midiTickAtPlayhead(state, clip);
  return {
    ...commitProject(state, addMidiPitchBend(state.undoStack.present, clipId, tick), `Added pitch bend to ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setMidiPitchBendFieldCommand(state: AppState, clipId: string, bendId: string, field: MidiPitchBendField, value: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before editing pitch bends." };
  return {
    ...commitProject(state, setMidiPitchBendField(state.undoStack.present, clipId, bendId, field, value), `Updated ${clip.name} pitch bend ${field}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function duplicateMidiPitchBendCommand(state: AppState, clipId: string, bendId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before duplicating pitch bends." };
  return {
    ...commitProject(state, duplicateMidiPitchBend(state.undoStack.present, clipId, bendId), `Duplicated ${clip.name} pitch bend.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function deleteMidiPitchBendCommand(state: AppState, clipId: string, bendId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before deleting pitch bends." };
  return {
    ...commitProject(state, deleteMidiPitchBend(state.undoStack.present, clipId, bendId), `Deleted ${clip.name} pitch bend.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function addMidiAftertouchCommand(state: AppState, clipId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before adding aftertouch." };
  const tick = midiTickAtPlayhead(state, clip);
  return {
    ...commitProject(state, addMidiAftertouch(state.undoStack.present, clipId, tick), `Added aftertouch to ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function setMidiAftertouchFieldCommand(state: AppState, clipId: string, aftertouchId: string, field: MidiAftertouchField, value: number): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before editing aftertouch." };
  return {
    ...commitProject(state, setMidiAftertouchField(state.undoStack.present, clipId, aftertouchId, field, value), `Updated ${clip.name} aftertouch ${field}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function duplicateMidiAftertouchCommand(state: AppState, clipId: string, aftertouchId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before duplicating aftertouch." };
  return {
    ...commitProject(state, duplicateMidiAftertouch(state.undoStack.present, clipId, aftertouchId), `Duplicated ${clip.name} aftertouch.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function deleteMidiAftertouchCommand(state: AppState, clipId: string, aftertouchId: string): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before deleting aftertouch." };
  return {
    ...commitProject(state, deleteMidiAftertouch(state.undoStack.present, clipId, aftertouchId), `Deleted ${clip.name} aftertouch.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

function midiTickAtPlayhead(state: AppState, clip: Clip): number {
  const ppq = midiDataFromClip(clip).ppq;
  const clipStartBar = Number.isFinite(clip.startBar) ? clip.startBar : 1;
  const playheadBar = Number.isFinite(state.playheadBar) ? Math.max(clipStartBar, state.playheadBar) : clipStartBar;
  const beats = timelineQuarterNoteBeatsBetweenBars(state.undoStack.present, clipStartBar, playheadBar);
  return Math.max(0, Math.round(beats * ppq));
}

export function convertMidiDrumsToBranchOverlaysCommand(state: AppState, clipId = state.selectedClipId || "", sectionId = state.chordsmithEditorSectionId || "A"): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before mapping drums." };
  const result = convertMidiClipToDrumBranchOverlays(state.undoStack.present, clipId, sectionId);
  if (!result.written) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.skipped ? `No supported drum hits found in ${clip.name}; skipped ${result.skipped}.` : `No MIDI notes found to map in ${clip.name}.`
    };
  }
  return {
    ...commitProject(state, result.project, `Mapped ${result.written} MIDI drum cell${result.written === 1 ? "" : "s"} from ${clip.name} to Section ${result.sectionId} branch overlays${result.merged ? ` (${result.merged} merged)` : ""}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId,
    chordsmithEditorSectionId: result.sectionId
  };
}

export function convertMidiMelodyToGeneratedOverlaysCommand(
  state: AppState,
  clipId = state.selectedClipId || "",
  sectionId = state.chordsmithEditorSectionId || "A",
  trackIndex = 0
): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before mapping melody." };
  const result = convertMidiClipToMelodyOverlays(state.undoStack.present, clipId, sectionId, trackIndex);
  if (!result.written) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.skipped ? `No supported melodic MIDI notes found in ${clip.name}; skipped ${result.skipped}.` : `No MIDI notes found to map in ${clip.name}.`
    };
  }
  return {
    ...commitProject(state, result.project, `Mapped ${result.written} MIDI melodic note${result.written === 1 ? "" : "s"} from ${clip.name} to Section ${result.sectionId} Melody ${result.trackIndex + 1} overlays${result.merged ? ` (${result.merged} merged)` : ""}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId,
    chordsmithEditorSectionId: result.sectionId
  };
}

export function convertMidiBassToGeneratedOverlaysCommand(state: AppState, clipId = state.selectedClipId || "", sectionId = state.chordsmithEditorSectionId || "A"): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before mapping bass." };
  const result = convertMidiClipToBassOverlays(state.undoStack.present, clipId, sectionId);
  if (!result.written) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.skipped ? `No supported bass MIDI notes found in ${clip.name}; skipped ${result.skipped}.` : `No MIDI notes found to map in ${clip.name}.`
    };
  }
  return {
    ...commitProject(state, result.project, `Mapped ${result.written} MIDI bass note${result.written === 1 ? "" : "s"} from ${clip.name} to Section ${result.sectionId} Bass overlays${result.merged ? ` (${result.merged} merged)` : ""}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId,
    chordsmithEditorSectionId: result.sectionId
  };
}

export function convertMidiChordsToGeneratedOverlaysCommand(state: AppState, clipId = state.selectedClipId || "", sectionId = state.chordsmithEditorSectionId || "A"): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before mapping chords." };
  const result = convertMidiClipToChordOverlays(state.undoStack.present, clipId, sectionId);
  if (!result.written) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: result.skipped ? `No supported MIDI chord groups found in ${clip.name}; skipped ${result.skipped}.` : `No MIDI notes found to map in ${clip.name}.`
    };
  }
  return {
    ...commitProject(state, result.project, `Mapped ${result.written} MIDI chord group${result.written === 1 ? "" : "s"} from ${clip.name} to Section ${result.sectionId} Chords overlays${result.merged ? ` (${result.merged} grouped)` : ""}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId,
    chordsmithEditorSectionId: result.sectionId
  };
}

export function convertMidiArrangementToGeneratedOverlaysCommand(
  state: AppState,
  clipId = state.selectedClipId || "",
  sectionId = state.chordsmithEditorSectionId || "A",
  melodyTrackIndex = 0
): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before mapping an arrangement." };

  const drums = convertMidiClipToDrumBranchOverlays(state.undoStack.present, clipId, sectionId);
  const bass = convertMidiClipToBassOverlays(drums.project, clipId, sectionId);
  const chords = convertMidiClipToChordOverlays(bass.project, clipId, sectionId);
  const melody = convertMidiClipToMelodyOverlays(chords.project, clipId, sectionId, melodyTrackIndex);
  const totalWritten = drums.written + bass.written + chords.written + melody.written;
  const totalSkipped = drums.skipped + bass.skipped + chords.skipped + melody.skipped;
  const totalMerged = drums.merged + bass.merged + chords.merged + melody.merged;

  if (!totalWritten) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: totalSkipped ? `No supported arrangement material found in ${clip.name}; skipped ${totalSkipped}.` : `No MIDI notes found to map in ${clip.name}.`
    };
  }

  const summary = `${drums.written} drums, ${bass.written} bass, ${chords.written} chords, ${melody.written} melody`;
  return {
    ...commitProject(state, melody.project, `Mapped MIDI arrangement from ${clip.name} to Section ${melody.sectionId}: ${summary}${totalMerged ? ` (${totalMerged} merged/grouped)` : ""}. Raw MIDI clip preserved.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId,
    chordsmithEditorSectionId: melody.sectionId
  };
}

export function adoptMidiTempoMapStartCommand(state: AppState, clipId = state.selectedClipId || ""): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before adopting MIDI tempo." };
  const midi = midiDataFromClip(clip);
  const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) || null : null;
  const metadata = {
    ...(media?.metadata || {}),
    ...(midi.metadata || {}),
    ppq: midi.ppq
  };
  const summary = createMidiTempoMapSummary(metadata, { fallbackBpm: project.project.bpm, fallbackTimeSig: project.project.timeSig });
  const tempo = summary?.tempoEvents[0] || null;
  const meter = summary?.timeSignatureEvents[0] || null;
  if (!tempo && !meter) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: `${clip.name} has no imported MIDI tempo or meter metadata to adopt.`
    };
  }
  const patch: ChordsmithGlobalPatch = {};
  if (tempo) patch.bpm = tempo.bpm;
  let skippedMeter = "";
  if (meter) {
    if (meter.denominator === 4) patch.timeSig = meter.numerator;
    else skippedMeter = ` Meter ${meter.numerator}/${meter.denominator} is preserved but project globals currently support /4 meters only.`;
  }
  if (patch.bpm === undefined && patch.timeSig === undefined) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: skippedMeter.trim() || `${clip.name} has no supported MIDI tempo or meter metadata to adopt.`
    };
  }
  const next = setChordsmithGlobals(project, patch);
  const parts = [
    patch.bpm !== undefined ? `${patch.bpm} BPM` : "",
    patch.timeSig !== undefined ? `${patch.timeSig}/4` : ""
  ].filter(Boolean);
  return {
    ...commitProject(state, next, `Adopted MIDI start ${parts.join(" and ")} from ${clip.name}.${skippedMeter}`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function adoptMidiTempoMapAutomationCommand(state: AppState, clipId = state.selectedClipId || ""): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before converting a MIDI tempo map." };
  const midi = midiDataFromClip(clip);
  const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) || null : null;
  const metadata = {
    ...(media?.metadata || {}),
    ...(midi.metadata || {}),
    ppq: midi.ppq
  };
  const summary = createMidiTempoMapSummary(metadata, { fallbackBpm: project.project.bpm, fallbackTimeSig: project.project.timeSig });
  if (!summary?.tempoEvents.length) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: `${clip.name} has no imported MIDI tempo events to convert into project tempo automation.`
    };
  }
  const firstTempo = summary.tempoEvents[0]!.bpm;
  const withBaseTempo = setChordsmithGlobals(project, { bpm: firstTempo });
  const ensured = ensureProjectAutomationLane(withBaseTempo, "tempo");
  const points = summary.tempoEvents.map((event) => ({
    bar: midiTempoEventAutomationBar(event.position, summary.ppq, midiBeatsPerBarAtTick(summary, event.tick, project.project.timeSig)),
    value: event.bpm,
    curve: "hold" as const
  }));
  const next = setAutomationLanePoints(ensured.project, ensured.laneId, points);
  return {
    ...commitProject(state, next, `Converted ${summary.tempoEvents.length} MIDI tempo event${summary.tempoEvents.length === 1 ? "" : "s"} from ${clip.name} into project tempo automation.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function adoptMidiMeterMapCommand(state: AppState, clipId = state.selectedClipId || ""): AppState {
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before converting a MIDI meter map." };
  const midi = midiDataFromClip(clip);
  const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) || null : null;
  const metadata = {
    ...(media?.metadata || {}),
    ...(midi.metadata || {}),
    ppq: midi.ppq
  };
  const summary = createMidiTempoMapSummary(metadata, { fallbackBpm: project.project.bpm, fallbackTimeSig: project.project.timeSig });
  if (!summary?.timeSignatureEvents.length) {
    return {
      ...state,
      selectedClipId: clipId,
      selectedTrackId: clip.trackId || state.selectedTrackId,
      status: `${clip.name} has no imported MIDI meter events to convert into a project meter map.`
    };
  }
  const first = summary.timeSignatureEvents[0]!;
  const meterMap: ProjectMeterMapPoint[] = summary.timeSignatureEvents.map((event, index) => ({
    id: `meter_${index + 1}`,
    bar: midiTempoEventAutomationBar(event.position, summary.ppq, midiBeatsPerBarAtTick(summary, event.tick, project.project.timeSig)),
    numerator: event.numerator,
    denominator: event.denominator,
    source: "midi-import",
    sourceClipId: clip.id,
    sourceTick: event.tick,
    seconds: Math.round(event.seconds * 1000000) / 1000000
  }));
  let next = cloneProject(project);
  next.project.meterMap = meterMap;
  if (first.denominator === 4) {
    next = setChordsmithGlobals(next, { timeSig: first.numerator });
  }
  const unsupportedStart = first.denominator !== 4
    ? ` Start meter ${first.numerator}/${first.denominator} is stored in the meter map; project globals currently support /4 meters only.`
    : "";
  return {
    ...commitProject(state, next, `Converted ${meterMap.length} MIDI meter event${meterMap.length === 1 ? "" : "s"} from ${clip.name} into the project meter map.${unsupportedStart}`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

function midiTempoEventAutomationBar(position: { bar: number; beat: number; tick: number }, ppq: number, beatsPerBarValue: number): number {
  const beatsPerBar = Math.max(1, Math.round(Number(beatsPerBarValue) || 4));
  const safePpq = Math.max(1, Math.round(Number(ppq) || 480));
  const bar = Math.max(1, Number(position.bar) || 1);
  const beat = Math.max(1, Number(position.beat) || 1);
  const tick = Math.max(0, Number(position.tick) || 0);
  const fractional = (beat - 1) / beatsPerBar + tick / (safePpq * beatsPerBar);
  return Math.round((bar + fractional) * 1000000) / 1000000;
}

function midiBeatsPerBarAtTick(summary: MidiTempoMapSummary, tick: number, fallbackTimeSig: number): number {
  let beatsPerBar = Math.max(1, Math.round(Number(fallbackTimeSig) || 4));
  const target = Math.max(0, Math.round(Number(tick) || 0));
  summary.timeSignatureEvents
    .slice()
    .sort((a, b) => a.tick - b.tick)
    .some((event) => {
      if (event.tick >= target && event.tick !== 0) return true;
      beatsPerBar = Math.max(1, Math.round(event.numerator));
      return false;
    });
  return beatsPerBar;
}

export function quantizeMidiClipCommand(state: AppState, clipId: string, grid: MidiQuantizeGrid): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before quantizing." };
  return {
    ...commitProject(state, quantizeMidiClip(state.undoStack.present, clipId, grid), `Quantized ${clip.name} to ${grid}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function swingMidiClipCommand(state: AppState, clipId: string, percent: MidiSwingPercent): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before applying swing." };
  return {
    ...commitProject(state, swingMidiClip(state.undoStack.present, clipId, percent), `Applied ${percent}% swing to ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function applyMidiGrooveTemplateCommand(state: AppState, clipId: string, templateId: MidiGrooveTemplateId): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before applying a groove template." };
  const template = midiGrooveTemplateById(templateId);
  return {
    ...commitProject(state, applyMidiGrooveTemplate(state.undoStack.present, clipId, template.id), `Applied ${template.name} groove to ${clip.name}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function transformMidiVelocityCommand(state: AppState, clipId: string, transform: MidiVelocityTransform): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before editing velocities." };
  const label = transform === "level-96" ? "Leveled" : "Humanized";
  return {
    ...commitProject(state, transformMidiClipVelocity(state.undoStack.present, clipId, transform), `${label} ${clip.name} velocities.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
}

export function transformMidiPitchCommand(state: AppState, clipId: string, transform: MidiPitchTransform): AppState {
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "midi") return { ...state, status: "Choose a MIDI clip before transposing notes." };
  const direction = transform.endsWith("up") ? "up" : "down";
  const interval = transform.startsWith("octave") ? "an octave" : "a semitone";
  return {
    ...commitProject(state, transformMidiClipPitch(state.undoStack.present, clipId, transform), `Transposed ${clip.name} ${direction} ${interval}.`),
    selectedClipId: clipId,
    selectedTrackId: clip.trackId || state.selectedTrackId
  };
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

export function ensureFxAutomationLaneCommand(state: AppState, chainId: string, slotId: string, parameter: string): AppState {
  const result = ensureFxParameterAutomationLane(state.undoStack.present, chainId, slotId, parameter);
  if (!result) return { ...state, status: "Choose a numeric FX parameter before automating it." };
  return commitProject(state, result.project, "Enabled FX parameter automation.");
}

export function addFxAutomationPointCommand(state: AppState, chainId: string, slotId: string, parameter: string): AppState {
  const ensured = ensureFxParameterAutomationLane(state.undoStack.present, chainId, slotId, parameter);
  if (!ensured) return { ...state, status: "Choose a numeric FX parameter before automating it." };
  const chain = ensured.project.fx?.chains.find((item) => item.id === chainId);
  const slot = chain?.slots.find((item) => item.id === slotId);
  const value = Number(slot?.parameters?.[String(parameter || "").replace(/[^a-z0-9_-]+/gi, "")]);
  const next = addAutomationPoint(ensured.project, ensured.laneId, { bar: state.playheadBar || 1, value: Number.isFinite(value) ? value : 0, curve: "linear" });
  return commitProject(state, next, "Added FX automation point.");
}

export function recordFxAutomationPointCommand(state: AppState, chainId: string, slotId: string, parameter: string, value: number, bar = state.playheadBar || 1): AppState {
  const lane = getFxParameterAutomationLane(state.undoStack.present, chainId, slotId, parameter);
  if (!lane) return state;
  return commitProject(
    state,
    addAutomationPoint(state.undoStack.present, lane.id, { bar, value, curve: "linear" }),
    "Recorded FX automation point."
  );
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

export function setDrumLaneGateCommand(state: AppState, laneId: string, gate: number): AppState {
  if (!isDrumLaneId(laneId)) return state;
  return commitProject(state, setDrumLaneGate(state.undoStack.present, laneId, gate), `Updated ${laneId} drum gate.`);
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

export function branchGeneratedDrumsCommand(state: AppState): AppState {
  const before = state.undoStack.present.tracks.length;
  const next = branchGeneratedDrumsToTracks(state.undoStack.present);
  const added = Math.max(0, next.tracks.length - before);
  return commitProject(state, next, added ? `Branched generated drums into ${added} lane track${added === 1 ? "" : "s"}.` : "Generated drum branches are already visible.");
}

export function collapseGeneratedDrumBranchesCommand(state: AppState): AppState {
  const before = state.undoStack.present.tracks.length;
  const next = collapseGeneratedDrumBranches(state.undoStack.present);
  const removed = Math.max(0, before - next.tracks.length);
  return commitProject(state, next, removed ? `Collapsed ${removed} generated drum branch track${removed === 1 ? "" : "s"}.` : "No generated drum branch tracks were visible.");
}

export function toggleDrumBranchGroupCollapsedCommand(state: AppState): AppState {
  const branchCount = state.undoStack.present.tracks.filter((track) => Boolean(track.metadata?.generatedDrumLane)).length;
  if (!branchCount) return { ...state, status: "Branch generated drums before hiding branch rows." };
  const collapsed = !drumBranchGroupCollapsed(state.undoStack.present);
  return commitProject(
    state,
    setDrumBranchGroupCollapsed(state.undoStack.present, collapsed),
    collapsed ? "Hid generated drum branch rows." : "Showed generated drum branch rows."
  );
}

export function setTrackInputCommand(state: AppState, trackId: string, inputDeviceId: string | null): AppState {
  const base = setTrackInput(state.undoStack.present, trackId, inputDeviceId);
  return commitProject(state, setTrackRecordingInputAssignment(base, trackId, recordingAssignmentForTrack(base, trackId)), "Updated track input.");
}

export function setTrackRecordingChannelModeCommand(state: AppState, trackId: string, mode: RecordingChannelMode): AppState {
  const track = state.undoStack.present.tracks.find((item) => item.id === trackId);
  if (!track?.recordKind || track.recordKind === "none") return { ...state, status: "Only live audio tracks have recording channel modes." };
  if (mode !== "mono" && mode !== "stereo") return { ...state, status: "Choose Mono or Stereo recording." };
  const base = setTrackRecordingChannelMode(state.undoStack.present, trackId, mode);
  return commitProject(
    state,
    setTrackRecordingInputAssignment(base, trackId, recordingAssignmentForTrack(base, trackId, mode)),
    `${track.name} recording set to ${mode}.`
  );
}

export function setTrackRecordingInputChannelCommand(state: AppState, trackId: string, value: string, deviceIdOverride?: string | null): AppState {
  const track = state.undoStack.present.tracks.find((item) => item.id === trackId);
  if (!track?.recordKind || track.recordKind === "none") return { ...state, status: "Only live audio tracks have recording input channels." };
  const deviceId = deviceIdOverride !== undefined ? deviceIdOverride : track.recordingInput?.deviceId ?? track.inputDeviceId ?? null;
  const assignment = recordingAssignmentFromChannelValue(deviceId, value);
  if (!assignment) return { ...state, status: "Choose a mono or stereo input channel." };
  return commitProject(
    state,
    setTrackRecordingInputAssignment(state.undoStack.present, trackId, assignment),
    `${track.name} recording input set to ${recordingAssignmentLabel(assignment)}.`
  );
}

function recordingAssignmentForTrack(project: PocketDawProject, trackId: string, overrideMode?: RecordingInputMode): TrackRecordingInput | null {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track?.recordKind || track.recordKind === "none") return null;
  const mode = overrideMode === "stereo" ? "stereo" : track.recordingChannelMode === "stereo" ? "stereo" : "mono";
  if (mode === "stereo") {
    const pair = track.recordingInput?.mode === "stereo" ? track.recordingInput.channelPair : undefined;
    return { deviceId: track.inputDeviceId ?? null, mode, channelPair: pair || [0, 1] };
  }
  const channelIndex = track.recordingInput?.mode === "mono" ? track.recordingInput.channelIndex : undefined;
  return { deviceId: track.inputDeviceId ?? null, mode, channelIndex: channelIndex ?? 0 };
}

function recordingAssignmentFromChannelValue(deviceId: string | null, value: string): TrackRecordingInput | null {
  const [mode, first, second] = value.split(":");
  const channelA = Number(first);
  const channelB = Number(second);
  if (mode === "stereo" && Number.isFinite(channelA) && Number.isFinite(channelB)) {
    return { deviceId, mode: "stereo", channelPair: [Math.max(0, Math.floor(channelA)), Math.max(0, Math.floor(channelB))] };
  }
  if (mode === "split-mono" && Number.isFinite(channelA)) {
    return { deviceId, mode: "split-mono", channelIndex: Math.max(0, Math.floor(channelA)) };
  }
  if (mode === "mono" && Number.isFinite(channelA)) {
    return { deviceId, mode: "mono", channelIndex: Math.max(0, Math.floor(channelA)) };
  }
  return null;
}

function recordingAssignmentLabel(assignment: TrackRecordingInput): string {
  if (assignment.mode === "stereo") {
    const pair = assignment.channelPair || [0, 1];
    return `Stereo Ch ${pair[0] + 1}-${pair[1] + 1}`;
  }
  if (assignment.mode === "split-mono") return `Split Mono Ch ${(assignment.channelIndex ?? 0) + 1}`;
  return `Mono Ch ${(assignment.channelIndex ?? 0) + 1}`;
}

function formatRangeBar(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(3).replace(/0+$/g, "").replace(/\.$/, "");
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

export function setTimelineSelectionRangeCommand(state: AppState, startBar: number, endBar: number): AppState {
  return commitProject(state, setTimelineSelectionRange(state.undoStack.present, startBar, endBar, "manual"), "Updated edit range.");
}

export function setPunchRangeCommand(state: AppState, startBar: number, endBar: number): AppState {
  const next = setTimelineSelectionRange(state.undoStack.present, startBar, endBar, "punch");
  const selection = next.timeline.selection;
  return commitProject(
    state,
    next,
    `Punch range set from bar ${formatRangeBar(selection?.startBar ?? startBar)} to ${formatRangeBar(selection?.endBar ?? endBar)}.`
  );
}

export function setTimelineSelectionToSelectedClipCommand(state: AppState): AppState {
  if (!state.selectedClipId) return { ...state, status: "Select a clip before setting edit range." };
  const project = state.undoStack.present;
  const clip = project.timeline.clips.find((item) => item.id === state.selectedClipId);
  return {
    ...commitProject(state, setTimelineSelectionToClip(project, state.selectedClipId), "Edit range set to selected clip."),
    selectedClipId: state.selectedClipId,
    selectedTrackId: clip?.trackId || state.selectedTrackId
  };
}

export function setTimelineSelectionToLoopCommand(state: AppState): AppState {
  return commitProject(state, setTimelineSelectionToLoop(state.undoStack.present), "Edit range set to loop.");
}

export function clearTimelineSelectionCommand(state: AppState): AppState {
  return commitProject(state, clearTimelineSelection(state.undoStack.present), "Edit range cleared.");
}

export function splitTimelineSelectionCommand(state: AppState): AppState {
  const selection = state.undoStack.present.timeline.selection;
  if (!selection) return { ...state, status: "Set an edit range before splitting range." };
  const clipResult = splitClipsAtRange(state.undoStack.present, selection.startBar, selection.endBar);
  const midiResult = splitMidiClipsAtRange(clipResult.project, selection.startBar, selection.endBar);
  const splitCount = clipResult.splitCount + midiResult.splitCount;
  if (!splitCount) return { ...state, status: "No clips crossed the edit range boundaries." };
  const boundaryLabel = splitCount === 1 ? "boundary" : "boundaries";
  return commitProject(state, midiResult.project, `Split ${splitCount} clip ${boundaryLabel} at edit range.`);
}

export function cropSelectedClipToTimelineSelectionCommand(state: AppState): AppState {
  const selection = state.undoStack.present.timeline.selection;
  if (!selection) return { ...state, status: "Set an edit range before cropping." };
  if (!state.selectedClipId) return { ...state, status: "Select a clip before cropping to range." };
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === state.selectedClipId);
  const result = clip?.type === "midi"
    ? cropMidiClipToRange(state.undoStack.present, state.selectedClipId, selection.startBar, selection.endBar)
    : cropClipToRange(state.undoStack.present, state.selectedClipId, selection.startBar, selection.endBar);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: state.selectedClipId,
      selectedTrackId: clip?.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: state.selectedClipId,
    selectedTrackId: clip?.trackId || state.selectedTrackId
  };
}

export function deleteSelectedClipRangeCommand(state: AppState): AppState {
  const selection = state.undoStack.present.timeline.selection;
  if (!selection) return { ...state, status: "Set an edit range before deleting range." };
  if (!state.selectedClipId) return { ...state, status: "Select a clip before deleting range." };
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === state.selectedClipId);
  const result = clip?.type === "midi"
    ? deleteMidiClipRange(state.undoStack.present, state.selectedClipId, selection.startBar, selection.endBar)
    : deleteClipRange(state.undoStack.present, state.selectedClipId, selection.startBar, selection.endBar);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: state.selectedClipId,
      selectedTrackId: clip?.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: result.rightClipId || (result.deletedClipId ? null : state.selectedClipId),
    selectedTrackId: clip?.trackId || state.selectedTrackId
  };
}

export function rippleDeleteSelectedClipRangeCommand(state: AppState): AppState {
  const selection = state.undoStack.present.timeline.selection;
  if (!selection) return { ...state, status: "Set an edit range before ripple deleting range." };
  if (!state.selectedClipId) return { ...state, status: "Select a clip before ripple deleting range." };
  const clip = state.undoStack.present.timeline.clips.find((item) => item.id === state.selectedClipId);
  const result = clip?.type === "midi"
    ? rippleDeleteMidiClipRange(state.undoStack.present, state.selectedClipId, selection.startBar, selection.endBar)
    : rippleDeleteClipRange(state.undoStack.present, state.selectedClipId, selection.startBar, selection.endBar);
  if (!result.changed) {
    return {
      ...state,
      selectedClipId: state.selectedClipId,
      selectedTrackId: clip?.trackId || state.selectedTrackId,
      status: result.status
    };
  }
  return {
    ...commitProject(state, result.project, result.status),
    selectedClipId: result.rightClipId || (result.deletedClipId ? null : state.selectedClipId),
    selectedTrackId: clip?.trackId || state.selectedTrackId
  };
}

export function rippleDeleteTimelineSelectionCommand(state: AppState): AppState {
  const selection = state.undoStack.present.timeline.selection;
  if (!selection) return { ...state, status: "Set an edit range before ripple deleting all tracks." };
  const clipResult = rippleDeleteTimelineRange(state.undoStack.present, selection.startBar, selection.endBar);
  const midiResult = rippleDeleteMidiTimelineRange(clipResult.project, selection.startBar, selection.endBar);
  if (!clipResult.changed && !midiResult.changed) return { ...state, status: clipResult.status };
  const selectedClipStillExists = state.selectedClipId
    ? midiResult.project.timeline.clips.some((clip) => clip.id === state.selectedClipId)
    : false;
  const affectedCount = clipResult.affectedClipIds.length + midiResult.affectedClipIds.length;
  const movedCount = clipResult.movedClipIds.length + midiResult.movedClipIds.length;
  const affectedLabel = affectedCount === 1 ? "clip" : "clips";
  const movedLabel = movedCount === 1 ? "later clip" : "later clips";
  return {
    ...commitProject(state, midiResult.project, `Ripple deleted edit range across all tracks; edited ${affectedCount} ${affectedLabel} and moved ${movedCount} ${movedLabel}.`),
    selectedClipId: selectedClipStillExists ? state.selectedClipId : midiResult.rightClipIds[0] || clipResult.rightClipIds[0] || midiResult.movedClipIds[0] || clipResult.movedClipIds[0] || null
  };
}

export function addMarkerAtPlayheadCommand(state: AppState): AppState {
  return commitProject(state, addMarkerAtBar(state.undoStack.present, state.playheadBar), "Added marker at playhead.");
}

export function addGameStateMarkerAtPlayheadCommand(state: AppState, gameState: string): AppState {
  if (!isGameStateMarkerId(gameState)) return { ...state, status: "Choose a valid game-state marker." };
  return commitProject(state, addGameStateMarkerAtBar(state.undoStack.present, state.playheadBar, gameState), `Added ${gameStateMarkerLabel(gameState)} game-state marker.`);
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

export function cycleDrumBranchStepCommand(state: AppState, sectionId: string, lane: string, step: number): AppState {
  if (!isSectionId(sectionId) || !isDrumLaneId(lane)) return state;
  return commitProject(state, cycleDrumBranchStep(state.undoStack.present, sectionId, lane, step), `Edited Section ${sectionId} ${lane} branch drum.`);
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

export function applyBassPresetCommand(state: AppState, sectionId: string, presetId: string): AppState {
  if (!isSectionId(sectionId)) return { ...state, status: "Choose a valid Chordsmith section before applying a bass preset." };
  const pcs = getPrimaryChordsmithSource(state.undoStack.present);
  const section = pcs?.sections[sectionId];
  const preset = findBassPreset(presetId);
  if (!pcs || !section || !preset) return { ...state, status: "Choose a valid bass preset." };
  if (!bassPresetVisibleForProject(preset, pcs)) return { ...state, status: "Choose a bass preset available for this time signature." };
  const pattern = bassPresetPatternForProject(preset.id, pcs, section);
  if (!pattern.notes.some((note) => note !== null && note !== undefined)) return { ...state, status: "No bass pattern is available for this preset and time signature." };
  return commitProject(
    state,
    applyBassPreset(state.undoStack.present, sectionId, preset.id),
    `Applied ${bassPresetLabel(preset)} bass preset to Section ${sectionId}.`
  );
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
