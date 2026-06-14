import type { PocketDawProject } from "./schema";
import { cloneProject } from "./dawProject";
import { addFxSlot, removeFxSlot, toggleFxSlot } from "./fx";

export function setTrackVolume(project: PocketDawProject, trackId: string, volume: number): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (track) track.volume = clamp(volume, 0, 1.2);
  return next;
}

export function setTrackPan(project: PocketDawProject, trackId: string, pan: number): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (track) track.pan = clamp(pan, -1, 1);
  return next;
}

export function toggleTrackMute(project: PocketDawProject, trackId: string): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (track && track.role !== "fx-return" && track.role !== "master") track.mute = !track.mute;
  return next;
}

export function toggleTrackSolo(project: PocketDawProject, trackId: string): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
