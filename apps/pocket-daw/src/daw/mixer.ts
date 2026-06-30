import type { PocketDawProject, RecordingChannelMode } from "./schema";
import { cloneProject } from "./dawProject";
import { addFxSlot, removeFxSlot, toggleFxSlot } from "./fx";
import { generatedDrumBranchLane, setDrumLaneMute, setDrumLanePan, setDrumLaneSolo, setDrumLaneVolume, syncDrumBranchTrackMix } from "./drumLanes";

export function setTrackVolume(project: PocketDawProject, trackId: string, volume: number): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  const branchLane = generatedDrumBranchLane(track);
  if (branchLane) return syncDrumBranchTrackMix(setDrumLaneVolume(project, branchLane, volume), branchLane);
  if (track) track.volume = clamp(volume, 0, 1.2);
  return next;
}

export function setTrackPan(project: PocketDawProject, trackId: string, pan: number): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  const branchLane = generatedDrumBranchLane(track);
  if (branchLane) return syncDrumBranchTrackMix(setDrumLanePan(project, branchLane, pan), branchLane);
  if (track) track.pan = clamp(pan, -1, 1);
  return next;
}

export function toggleTrackMute(project: PocketDawProject, trackId: string): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  const branchLane = generatedDrumBranchLane(track);
  if (branchLane) return syncDrumBranchTrackMix(setDrumLaneMute(project, branchLane, !track?.mute), branchLane);
  if (track && track.role !== "fx-return" && track.role !== "master") track.mute = !track.mute;
  return next;
}

export function toggleTrackSolo(project: PocketDawProject, trackId: string): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  const branchLane = generatedDrumBranchLane(track);
  if (branchLane) return syncDrumBranchTrackMix(setDrumLaneSolo(project, branchLane, !track?.solo), branchLane);
  if (track && track.role !== "fx-return" && track.role !== "master") track.solo = !track.solo;
  return next;
}

export function toggleTrackArmed(project: PocketDawProject, trackId: string): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (track && track.recordKind && track.recordKind !== "none") {
    const shouldArm = !track.armed;
    next.tracks.forEach((item) => {
      if (item.recordKind && item.recordKind !== "none") item.armed = item.id === trackId ? shouldArm : false;
    });
  }
  return next;
}

export function toggleTrackMonitor(project: PocketDawProject, trackId: string): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (track && track.recordKind && track.recordKind !== "none") track.monitorEnabled = !track.monitorEnabled;
  return next;
}

export function addTrackFx(project: PocketDawProject, trackId: string, type: string): PocketDawProject {
  return addFxSlot(project, trackId, type);
}

export function toggleTrackFx(project: PocketDawProject, chainId: string, slotId: string): PocketDawProject {
  return toggleFxSlot(project, chainId, slotId);
}

export function removeTrackFx(project: PocketDawProject, chainId: string, slotId: string): PocketDawProject {
  return removeFxSlot(project, chainId, slotId);
}

export function setTrackInput(project: PocketDawProject, trackId: string, inputDeviceId: string | null): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (track) track.inputDeviceId = inputDeviceId;
  return next;
}

export function setTrackRecordingChannelMode(project: PocketDawProject, trackId: string, mode: RecordingChannelMode): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (track && track.recordKind && track.recordKind !== "none") track.recordingChannelMode = mode;
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
