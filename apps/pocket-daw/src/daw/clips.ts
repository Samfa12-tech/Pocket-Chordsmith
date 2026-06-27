import type { Clip, PocketDawProject } from "./schema";
import { cloneProject } from "./dawProject";
import { recomputeTimelineBars } from "./timeline";

export type ClipTransformField = "transpose" | "gain";

export function selectClip(project: PocketDawProject, clipId: string | null): PocketDawProject {
  const next = cloneProject(project);
  next.timeline.clips.forEach((clip) => {
    clip.metadata = { ...(clip.metadata || {}), selected: clip.id === clipId };
  });
  return next;
}

export function moveClipByBars(project: PocketDawProject, clipId: string, deltaBars: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return project;
  clip.startBar = Math.max(1, clip.startBar + deltaBars);
  return recomputeTimelineBars(next);
}

export function moveClipToBar(project: PocketDawProject, clipId: string, startBar: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return project;
  const target = Math.max(1, startBar);
  const delta = target - clip.startBar;
  if (Math.abs(delta) < 0.0001) return project;
  const loopParentId = typeof clip.metadata?.loopParentId === "string" ? clip.metadata.loopParentId : clip.id;
  next.timeline.clips.forEach((item) => {
    if (item.id === clip.id || item.id === loopParentId || item.metadata?.loopParentId === loopParentId) {
      item.startBar = Math.max(1, item.startBar + delta);
    }
  });
  return recomputeTimelineBars(next);
}

export function duplicateClip(project: PocketDawProject, clipId: string): { project: PocketDawProject; duplicatedId: string | null } {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return { project, duplicatedId: null };
  const newClip: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: nextClipId(next.timeline.clips),
    startBar: clip.startBar + clip.barLength,
    linked: true,
    name: `${clip.name} copy`
  };
  next.timeline.clips.push(newClip);
  recomputeTimelineBars(next);
  return { project: next, duplicatedId: newClip.id };
}

export function deleteClip(project: PocketDawProject, clipId: string): PocketDawProject {
  const next = cloneProject(project);
  next.timeline.clips = next.timeline.clips.filter((clip) => clip.id !== clipId);
  return recomputeTimelineBars(next);
}

export function toggleClipMute(project: PocketDawProject, clipId: string): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (clip) clip.muted = !clip.muted;
  return next;
}

export function setClipTransform(project: PocketDawProject, clipId: string, field: ClipTransformField, value: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return project;
  const current = clip.transforms || { transpose: 0, octave: 0, gain: 1, stemMutes: {} };
  clip.transforms = {
    ...current,
    transpose: current.transpose ?? 0,
    octave: current.octave ?? 0,
    gain: current.gain ?? 1,
    stemMutes: current.stemMutes || {}
  };
  if (field === "transpose") clip.transforms.transpose = clampNumber(value, -48, 48, 0, true);
  if (field === "gain") clip.transforms.gain = clampNumber(value, 0, 4, 1, false);
  return next;
}

export function splitClipAtBar(project: PocketDawProject, clipId: string, splitBar: number): { project: PocketDawProject; rightClipId: string | null } {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return { project, rightClipId: null };
  const split = Math.round(splitBar);
  const clipEnd = clip.startBar + clip.barLength;
  if (split <= clip.startBar || split >= clipEnd) return { project, rightClipId: null };
  const originalLength = clip.barLength;
  const leftLength = split - clip.startBar;
  const rightLength = originalLength - leftLength;
  const sourceOffset = clipSourceStartBar(clip);
  clip.barLength = leftLength;
  const rightClip: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: nextClipId(next.timeline.clips),
    startBar: split,
    barLength: rightLength,
    linked: clip.linked,
    name: `${clip.name} split`,
    metadata: {
      ...(clip.metadata || {}),
      sourceStartBar: sourceOffset + leftLength
    }
  };
  next.timeline.clips.push(rightClip);
  recomputeTimelineBars(next);
  return { project: next, rightClipId: rightClip.id };
}

export function trimClipStart(project: PocketDawProject, clipId: string, deltaBars: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "generated-section") return project;
  const delta = Math.round(deltaBars);
  if (delta === 0) return project;
  const sourceOffset = clipSourceStartBar(clip);
  if (delta > 0) {
    const trim = Math.min(delta, clip.barLength - 1);
    clip.startBar += trim;
    clip.barLength -= trim;
    clip.metadata = { ...(clip.metadata || {}), sourceStartBar: sourceOffset + trim };
  } else {
    const extend = Math.min(Math.abs(delta), clip.startBar - 1, sourceOffset);
    if (extend <= 0) return project;
    clip.startBar -= extend;
    clip.barLength += extend;
    clip.metadata = { ...(clip.metadata || {}), sourceStartBar: sourceOffset - extend };
  }
  return recomputeTimelineBars(next);
}

export function trimClipEnd(project: PocketDawProject, clipId: string, deltaBars: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "generated-section") return project;
  const delta = Math.round(deltaBars);
  if (delta === 0) return project;
  clip.barLength = Math.max(1, clip.barLength + delta);
  return recomputeTimelineBars(next);
}

export function repeatGeneratedSectionClipToEnd(project: PocketDawProject, clipId: string, requestedEndBar: number): { project: PocketDawProject; repeatedCount: number } {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "generated-section" || !clip.sectionId) return { project, repeatedCount: 0 };
  const sourceLength = Math.max(0.25, clip.barLength);
  const baseEnd = clip.startBar + sourceLength;
  const endBar = Math.max(baseEnd, requestedEndBar);
  next.timeline.clips = next.timeline.clips.filter((item) => item.metadata?.loopParentId !== clip.id);
  let repeatedCount = 0;
  let startBar = baseEnd;
  while (startBar < endBar - 0.001 && repeatedCount < 128) {
    const length = Math.min(sourceLength, endBar - startBar);
    const loopClip: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: nextClipId(next.timeline.clips),
      startBar,
      barLength: length,
      linked: true,
      name: `${clip.name} repeat ${repeatedCount + 1}`,
      metadata: {
        ...(clip.metadata || {}),
        loopParentId: clip.id,
        sourceStartBar: 0,
        loopIndex: repeatedCount + 1
      }
    };
    next.timeline.clips.push(loopClip);
    repeatedCount += 1;
    startBar += length;
  }
  return { project: recomputeTimelineBars(next), repeatedCount };
}

export function pasteClip(project: PocketDawProject, source: Clip, startBar: number): { project: PocketDawProject; pastedId: string } {
  const next = cloneProject(project);
  const newClip: Clip = {
    ...JSON.parse(JSON.stringify(source)),
    id: nextClipId(next.timeline.clips),
    startBar: Math.max(1, startBar),
    linked: true,
    name: `${source.name} pasted`
  };
  next.timeline.clips.push(newClip);
  recomputeTimelineBars(next);
  return { project: next, pastedId: newClip.id };
}

export function clipSourceStartBar(clip: Clip): number {
  const value = clip.metadata?.sourceStartBar;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function nextClipId(clips: Clip[]): string {
  let i = clips.length + 1;
  const ids = new Set(clips.map((clip) => clip.id));
  while (ids.has(`clip_${String(i).padStart(3, "0")}`)) i += 1;
  return `clip_${String(i).padStart(3, "0")}`;
}

function clampNumber(value: number, min: number, max: number, fallback: number, integer: boolean): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.max(min, Math.min(max, number));
  return integer ? Math.round(clamped) : Math.round(clamped * 1000) / 1000;
}
