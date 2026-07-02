import type { Clip, PocketDawProject } from "./schema";
import { cloneProject } from "./dawProject";
import { recomputeTimelineBars, timelineBarAtSeconds, timelineSecondsAtBar } from "./timeline";
import { detectAudioTransientsFromPeaks } from "./audioClips";

export type ClipTransformField = "transpose" | "gain";
export type GeneratedStemRole = "drums" | "bass" | "chords" | "melody" | "guitar";
export type AudioClipPropertyField = "gain" | "sourceOffsetSeconds" | "durationSeconds" | "fadeInSeconds" | "fadeOutSeconds" | "playbackRate" | "pitchSemitones";
export type AudioClipAction = "normalize-gain" | "reset-fades" | "quick-fade" | "crossfade-overlap" | "create-crossfade-left" | "invert-phase" | "reverse" | "analyze-transients" | "create-warp-markers" | "quantize-warp-markers" | "apply-warp-varispeed" | "clear-warp-markers";
export type AudioTakeStatus = "active" | "comp-segment" | "muted-take" | "archived-take";

export interface AudioClipActionResult {
  project: PocketDawProject;
  changed: boolean;
  status: string;
}

export interface AudioTakeCompSplitResult extends AudioClipActionResult {
  rightClipId: string | null;
  splitCount: number;
}

export interface AudioTakeRangeCompResult extends AudioClipActionResult {
  activeClipId: string | null;
  splitCount: number;
}

export interface ClipRangeSplitResult {
  project: PocketDawProject;
  splitCount: number;
  rightClipIds: string[];
}

export interface ClipRangeCropResult extends AudioClipActionResult {
  clipId: string | null;
}

export interface ClipRangeDeleteResult extends AudioClipActionResult {
  deletedClipId: string | null;
  rightClipId: string | null;
}

export interface ClipRangeRippleDeleteResult extends ClipRangeDeleteResult {
  rippleBars: number;
  movedClipIds: string[];
}

export interface TimelineRippleDeleteResult extends AudioClipActionResult {
  rippleBars: number;
  affectedClipIds: string[];
  movedClipIds: string[];
  rightClipIds: string[];
}

export interface AudioTakeSummary {
  groupId: string;
  takeNumber: number;
  takeCount: number;
  active: boolean;
  lanes: Array<{
    takeLaneId: string;
    takeNumber: number;
    clipCount: number;
    activeClipCount: number;
    archivedClipCount: number;
    mutedClipCount: number;
    startBar: number;
    endBar: number;
    segmentNames: string[];
  }>;
  siblings: Array<{
    clipId: string;
    name: string;
    takeNumber: number;
    takeLaneId: string;
    takeStatus: AudioTakeStatus;
    active: boolean;
    archived: boolean;
    muted: boolean;
  }>;
}

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

export function setGeneratedClipStemMute(project: PocketDawProject, clipId: string, stem: GeneratedStemRole, muted: boolean): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "generated-section") return project;
  const current = clip.transforms || { transpose: 0, octave: 0, gain: 1, stemMutes: {} };
  clip.transforms = {
    ...current,
    transpose: current.transpose ?? 0,
    octave: current.octave ?? 0,
    gain: current.gain ?? 1,
    stemMutes: {
      ...(current.stemMutes || {}),
      [stem]: muted
    }
  };
  return next;
}

export function setAudioClipProperty(project: PocketDawProject, clipId: string, field: AudioClipPropertyField, value: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") return project;
  const max = field === "gain" ? 4 : field === "playbackRate" ? 4 : field === "pitchSemitones" ? 48 : 24 * 60 * 60;
  const min = field === "pitchSemitones" ? -48 : 0;
  const fallback = field === "gain" || field === "playbackRate" ? 1 : field === "durationSeconds" ? timelineSecondsBetweenBars(project, clip.startBar, clip.startBar + clip.barLength) : 0;
  clip.metadata = {
    ...(clip.metadata || {}),
    [field]: clampNumber(value, min, max, fallback, false)
  };
  retargetAudioClipWarpMarkers(project, clip);
  return next;
}

export function applyAudioClipAction(project: PocketDawProject, clipId: string, action: AudioClipAction): AudioClipActionResult {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== "audio") {
    return { project, changed: false, status: "Choose an audio clip before editing audio properties." };
  }

  if (action === "quick-fade") {
    clip.metadata = {
      ...(clip.metadata || {}),
      fadeInSeconds: 0.05,
      fadeOutSeconds: 0.05
    };
    return { project: next, changed: true, status: `Applied short fades to ${clip.name}.` };
  }

  if (action === "reset-fades") {
    clip.metadata = {
      ...(clip.metadata || {}),
      fadeInSeconds: 0,
      fadeOutSeconds: 0
    };
    return { project: next, changed: true, status: `Reset fades for ${clip.name}.` };
  }

  if (action === "crossfade-overlap") {
    return applyOverlapCrossfade(project, next, clip);
  }

  if (action === "create-crossfade-left") {
    return createLeftOverlapCrossfade(project, next, clip);
  }

  if (action === "invert-phase") {
    const inverted = clip.metadata?.invertPhase !== true;
    clip.metadata = {
      ...(clip.metadata || {}),
      invertPhase: inverted
    };
    return {
      project: next,
      changed: true,
      status: inverted ? `Inverted phase for ${clip.name}.` : `Restored phase for ${clip.name}.`
    };
  }

  if (action === "reverse") {
    const reversed = clip.metadata?.reversed !== true;
    clip.metadata = {
      ...(clip.metadata || {}),
      reversed
    };
    return {
      project: next,
      changed: true,
      status: reversed ? `Reversed ${clip.name}.` : `Restored forward playback for ${clip.name}.`
    };
  }

  const media = clip.mediaPoolItemId ? next.mediaPool.find((item) => item.id === clip.mediaPoolItemId) : null;
  if (action === "clear-warp-markers") {
    const markerCount = Array.isArray(clip.metadata?.audioWarpMarkers) ? clip.metadata.audioWarpMarkers.length : 0;
    if (!markerCount) return { project, changed: false, status: `No warp markers to clear for ${clip.name}.` };
    clip.metadata = {
      ...(clip.metadata || {}),
      audioWarpMarkers: [],
      audioWarpMarkerCount: 0,
      audioWarpReady: false,
      audioWarpPlaybackMode: "metadata-only"
    };
    return { project: next, changed: true, status: `Cleared ${markerCount} warp marker${markerCount === 1 ? "" : "s"} for ${clip.name}.` };
  }

  if (action === "quantize-warp-markers") {
    const markers = quantizableAudioWarpMarkers(clip.metadata?.audioWarpMarkers);
    if (!markers.length) return { project, changed: false, status: `Create warp markers for ${clip.name} before quantizing audio timing.` };
    const stepBars = audioWarpQuantizeStepBars(next);
    const quantized = markers.map((marker) => {
      const targetBar = roundBar(Math.max(1, Math.round(marker.targetBar / stepBars) * stepBars));
      return {
        ...marker,
        targetBar,
        targetSeconds: roundSeconds(timelineSecondsAtBar(next, targetBar))
      };
    });
    const updatedAt = new Date().toISOString();
    clip.metadata = {
      ...(clip.metadata || {}),
      audioWarpMarkers: quantized,
      audioWarpMarkerCount: quantized.length,
      audioWarpReady: true,
      audioWarpPlaybackMode: "metadata-only",
      audioWarpEngine: "pending-time-stretch-engine",
      audioWarpQuantizeGrid: "1/16",
      audioWarpQuantizedAt: updatedAt,
      audioWarpUpdatedAt: updatedAt
    };
    return {
      project: next,
      changed: true,
      status: `Quantized ${quantized.length} warp marker target${quantized.length === 1 ? "" : "s"} for ${clip.name} to 1/16; playback stretching is not enabled yet.`
    };
  }

  if (action === "apply-warp-varispeed") {
    const markers = quantizableAudioWarpMarkers(clip.metadata?.audioWarpMarkers);
    if (markers.length < 2) return { project, changed: false, status: `Create at least two warp markers for ${clip.name} before applying warp varispeed.` };
    const result = audioWarpGlobalVarispeed(markers, next, clip);
    if (!result) return { project, changed: false, status: `Warp markers for ${clip.name} need distinct source and target times before varispeed can be applied.` };
    const previousPitch = metadataNumber(clip.metadata?.pitchSemitones, 0, -48, 48);
    const updatedAt = new Date().toISOString();
    clip.metadata = {
      ...(clip.metadata || {}),
      sourceOffsetSeconds: result.sourceOffsetSeconds,
      playbackRate: result.playbackRate,
      pitchSemitones: previousPitch,
      audioWarpMarkers: markers,
      audioWarpMarkerCount: markers.length,
      audioWarpReady: true,
      audioWarpPlaybackMode: "global-varispeed",
      audioWarpEngine: "global-varispeed",
      audioWarpAppliedRate: result.playbackRate,
      audioWarpAppliedSourceOffsetSeconds: result.sourceOffsetSeconds,
      audioWarpAppliedFromMarkerCount: markers.length,
      audioWarpAppliedAt: updatedAt,
      audioWarpUpdatedAt: updatedAt
    };
    return {
      project: next,
      changed: true,
      status: `Applied warp varispeed ${result.playbackRate}x to ${clip.name}; pitch changes with speed until pitch-preserving stretch is added.`
    };
  }

  if (action === "analyze-transients") {
    if (!media) return { project, changed: false, status: `Reload or relink ${clip.name} before analyzing transients.` };
    const analysis = detectAudioTransientsFromPeaks(media.metadata?.waveformPeaks, media.durationSeconds || 0);
    if (!analysis.markersSeconds.length) {
      return { project, changed: false, status: `Analyze or reload ${clip.name} with stronger waveform peaks before detecting transients.` };
    }
    media.metadata = {
      ...(media.metadata || {}),
      audioTransientMarkersSeconds: analysis.markersSeconds,
      audioTransientThreshold: analysis.threshold,
      audioTransientPeakCount: analysis.peakCount,
      audioTransientMaxPeak: analysis.maxPeak,
      audioTransientUpdatedAt: new Date().toISOString()
    };
    clip.metadata = {
      ...(clip.metadata || {}),
      transientSourceMediaId: media.id,
      transientMarkerCount: analysis.markersSeconds.length,
      transientAnalysisReady: true,
      transientAnalysisUpdatedAt: media.metadata.audioTransientUpdatedAt
    };
    return {
      project: next,
      changed: true,
      status: `Detected ${analysis.markersSeconds.length} transient marker${analysis.markersSeconds.length === 1 ? "" : "s"} for ${clip.name}.`
    };
  }

  if (action === "create-warp-markers") {
    if (!media) return { project, changed: false, status: `Reload or relink ${clip.name} before creating warp markers.` };
    const transientMarkers = audioTransientMarkers(media.metadata?.audioTransientMarkersSeconds, media.durationSeconds || 0);
    if (!transientMarkers.length) return { project, changed: false, status: `Analyze transients for ${clip.name} before creating warp markers.` };
    const sourceOffset = metadataNumber(clip.metadata?.sourceOffsetSeconds, 0, 0, 24 * 60 * 60);
    const clipStartSeconds = timelineSecondsAtBar(next, clip.startBar);
    const durationSeconds = metadataNumber(clip.metadata?.durationSeconds, Math.max(0, (media.durationSeconds || 0) - sourceOffset), 0, 24 * 60 * 60);
    const sourceEnd = sourceOffset + Math.max(0, durationSeconds);
    const markers = transientMarkers
      .filter((sourceSeconds) => sourceSeconds >= sourceOffset && sourceSeconds <= sourceEnd)
      .slice(0, 128)
      .map((sourceSeconds, index) => {
        const localSeconds = Math.max(0, sourceSeconds - sourceOffset);
        const targetSeconds = clipStartSeconds + localSeconds;
        return {
          id: `warp_${index + 1}`,
          sourceSeconds: roundSeconds(sourceSeconds),
          targetBar: roundBar(timelineBarAtSeconds(next, targetSeconds)),
          targetSeconds: roundSeconds(targetSeconds),
          source: "transient",
          locked: true
        };
      });
    if (!markers.length) return { project, changed: false, status: `No transient markers fall inside ${clip.name}'s current source window.` };
    const updatedAt = new Date().toISOString();
    clip.metadata = {
      ...(clip.metadata || {}),
      audioWarpMarkers: markers,
      audioWarpMarkerCount: markers.length,
      audioWarpSourceMediaId: media.id,
      audioWarpReady: true,
      audioWarpPlaybackMode: "metadata-only",
      audioWarpEngine: "pending-time-stretch-engine",
      audioWarpUpdatedAt: updatedAt
    };
    return {
      project: next,
      changed: true,
      status: `Created ${markers.length} source-safe warp marker${markers.length === 1 ? "" : "s"} for ${clip.name}; playback stretching is not enabled yet.`
    };
  }

  const maxPeak = maxWaveformPeak(media?.metadata?.waveformPeaks);
  if (!media || maxPeak <= 0) {
    return { project, changed: false, status: `Analyze or reload ${clip.name} before normalizing gain.` };
  }
  const targetPeak = 0.95;
  const gain = clampNumber(targetPeak / maxPeak, 0, 4, 1, false);
  clip.metadata = {
    ...(clip.metadata || {}),
    gain,
    normalizedPeakTarget: targetPeak,
    normalizedFromPeak: clampNumber(maxPeak, 0, 1, maxPeak, false)
  };
  return { project: next, changed: true, status: `Normalized ${clip.name} gain to ${gain}.` };
}

export function audioClipTakeSummary(project: PocketDawProject, clipId: string): AudioTakeSummary | null {
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  const groupId = audioClipTakeGroupId(clip);
  if (!clip || clip.type !== "audio" || !groupId) return null;
  const siblings = audioTakeSiblings(project, clip)
    .filter((item) => clipsOverlap(item, clip))
    .map((item, index) => ({
      clipId: item.id,
      name: item.name,
      takeNumber: takeIndexForClip(item, index),
      takeLaneId: takeLaneIdForClip(item, index),
      takeStatus: audioTakeStatus(item),
      active: audioTakeStatus(item) === "active" || audioTakeStatus(item) === "comp-segment" ? !item.muted : false,
      archived: audioTakeStatus(item) === "archived-take",
      muted: item.muted
    }))
    .sort((a, b) => a.takeNumber - b.takeNumber || a.clipId.localeCompare(b.clipId));
  const selected = siblings.find((item) => item.clipId === clip.id);
  if (!selected) return null;
  const lanes = summarizeAudioTakeLanes(project, clip.trackId, groupId);
  return {
    groupId,
    takeNumber: selected.takeNumber,
    takeCount: siblings.length,
    active: selected.active,
    lanes,
    siblings
  };
}

function summarizeAudioTakeLanes(project: PocketDawProject, trackId: string, groupId: string): AudioTakeSummary["lanes"] {
  const laneMap = new Map<string, Clip[]>();
  takeGroupClips(project, trackId, groupId).forEach((clip, index) => {
    const laneId = takeLaneIdForClip(clip, index);
    laneMap.set(laneId, [...(laneMap.get(laneId) || []), clip]);
  });
  return Array.from(laneMap.entries())
    .map(([takeLaneId, clips]) => {
      const ordered = clips.slice().sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
      const first = ordered[0];
      const takeNumber = first ? takeIndexForClip(first, 0) : 0;
      const statuses = ordered.map(audioTakeStatus);
      const activeClipCount = ordered.filter((clip) => (audioTakeStatus(clip) === "active" || audioTakeStatus(clip) === "comp-segment") && !clip.muted).length;
      return {
        takeLaneId,
        takeNumber,
        clipCount: ordered.length,
        activeClipCount,
        archivedClipCount: statuses.filter((status) => status === "archived-take").length,
        mutedClipCount: ordered.filter((clip) => clip.muted || audioTakeStatus(clip) === "muted-take").length,
        startBar: Math.min(...ordered.map((clip) => clip.startBar)),
        endBar: Math.max(...ordered.map((clip) => clip.startBar + clip.barLength)),
        segmentNames: ordered.map((clip) => clip.name)
      };
    })
    .sort((a, b) => a.takeNumber - b.takeNumber || a.takeLaneId.localeCompare(b.takeLaneId));
}

export function activateAudioTake(project: PocketDawProject, clipId: string): AudioClipActionResult {
  const selected = project.timeline.clips.find((item) => item.id === clipId);
  const groupId = audioClipTakeGroupId(selected);
  if (!selected || selected.type !== "audio" || !groupId) {
    return { project, changed: false, status: "Choose a grouped audio take before activating a take." };
  }
  const siblings = audioTakeSiblings(project, selected).filter((clip) => clipsOverlap(clip, selected) && audioTakeStatus(clip) !== "archived-take");
  if (siblings.length < 2) {
    return { project, changed: false, status: "No alternate takes are available for this audio clip." };
  }
  const next = cloneProject(project);
  let changed = false;
  next.timeline.clips.forEach((clip) => {
    if (clip.type !== "audio" || clip.trackId !== selected.trackId || audioClipTakeGroupId(clip) !== groupId) return;
    if (!clipsOverlap(clip, selected)) return;
    if (audioTakeStatus(clip) === "archived-take") return;
    const active = clip.id === selected.id;
    const nextMuted = !active;
    const takeStatus: AudioTakeStatus = active ? "active" : "muted-take";
    if (clip.muted !== nextMuted || clip.metadata?.takeActive !== active || clip.metadata?.takeStatus !== takeStatus) changed = true;
    clip.muted = nextMuted;
    clip.metadata = {
      ...(clip.metadata || {}),
      takeActive: active,
      takeStatus
    };
  });
  if (!changed) return { project, changed: false, status: `${selected.name} is already the active take.` };
  const summary = audioClipTakeSummary(next, clipId);
  return {
    project: next,
    changed: true,
    status: `Activated Take ${summary?.takeNumber ?? ""} for ${selected.name}.`.replace("  ", " ")
  };
}

export function splitGroupedAudioTakesAtBar(project: PocketDawProject, clipId: string, splitBar: number): AudioTakeCompSplitResult {
  const selected = project.timeline.clips.find((item) => item.id === clipId);
  const groupId = audioClipTakeGroupId(selected);
  if (!selected || selected.type !== "audio" || !groupId) {
    return { project, changed: false, status: "Choose a grouped audio take before comping.", rightClipId: null, splitCount: 0 };
  }
  const siblings = audioTakeSiblings(project, selected).filter((clip) => clipsOverlap(clip, selected) && audioTakeStatus(clip) !== "archived-take");
  if (siblings.length < 2) {
    return { project, changed: false, status: "No alternate takes are available for this audio clip.", rightClipId: null, splitCount: 0 };
  }
  if (!clipSpansBar(selected, splitBar)) {
    return { project, changed: false, status: "Move the playhead inside the selected take before comping.", rightClipId: null, splitCount: 0 };
  }
  const splitIds = siblings
    .filter((clip) => clipSpansBar(clip, splitBar))
    .map((clip) => clip.id);
  let next = project;
  let rightClipId: string | null = null;
  let splitCount = 0;
  splitIds.forEach((id) => {
    const split = splitClipAtBar(next, id, splitBar);
    if (split.rightClipId) {
      splitCount += 1;
      if (id === clipId) rightClipId = split.rightClipId;
      next = split.project;
    }
  });
  if (!rightClipId || splitCount === 0) {
    return { project, changed: false, status: "Move the playhead inside the selected take before comping.", rightClipId: null, splitCount: 0 };
  }
  const activated = activateAudioTake(next, rightClipId);
  const take = activated.project.timeline.clips.find((clip) => clip.id === rightClipId);
  return {
    project: activated.changed ? activated.project : next,
    changed: true,
    status: `Comped ${take?.name || "selected take"} from bar ${formatBarForStatus(splitBar)}.`,
    rightClipId,
    splitCount
  };
}

export function compGroupedAudioTakeRange(project: PocketDawProject, clipId: string, startBar: number, endBar: number): AudioTakeRangeCompResult {
  const selected = project.timeline.clips.find((item) => item.id === clipId);
  const groupId = audioClipTakeGroupId(selected);
  if (!selected || selected.type !== "audio" || !groupId) {
    return { project, changed: false, status: "Choose a grouped audio take before range comping.", activeClipId: null, splitCount: 0 };
  }
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || Math.abs(rawEnd - rawStart) < 0.0001) {
    return { project, changed: false, status: "Set an edit range before range comping.", activeClipId: null, splitCount: 0 };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (!clipOverlapsRange(selected, rangeStart, rangeEnd)) {
    return { project, changed: false, status: "Move the edit range over the selected take before range comping.", activeClipId: null, splitCount: 0 };
  }
  const initialSiblings = audioTakeSiblings(project, selected).filter((clip) => audioTakeStatus(clip) !== "archived-take");
  if (initialSiblings.length < 2) {
    return { project, changed: false, status: "No alternate takes are available for this audio clip.", activeClipId: null, splitCount: 0 };
  }
  const selectedLaneId = takeLaneIdForClip(selected, initialSiblings.findIndex((clip) => clip.id === selected.id));
  let next = project;
  let splitCount = 0;

  [rangeStart, rangeEnd].forEach((bar) => {
    const splitIds = takeGroupClips(next, selected.trackId, groupId)
      .filter((clip) => audioTakeStatus(clip) !== "archived-take" && clipSpansBar(clip, bar))
      .map((clip) => clip.id);
    splitIds.forEach((id) => {
      const split = splitClipAtBar(next, id, bar);
      if (split.rightClipId) {
        splitCount += 1;
        next = split.project;
      }
    });
  });

  const editable = cloneProject(next);
  let changed = false;
  let activeClipId: string | null = null;
  takeGroupClips(editable, selected.trackId, groupId).forEach((clip, index) => {
    if (audioTakeStatus(clip) === "archived-take" || !clipOverlapsRange(clip, rangeStart, rangeEnd)) return;
    const insideRange = clip.startBar >= rangeStart - 0.0001 && clipEndBar(clip) <= rangeEnd + 0.0001;
    if (!insideRange) return;
    const active = takeLaneIdForClip(clip, index) === selectedLaneId;
    const nextMuted = !active;
    const takeStatus: AudioTakeStatus = active ? "comp-segment" : "muted-take";
    if (clip.muted !== nextMuted || clip.metadata?.takeActive !== active || clip.metadata?.takeStatus !== takeStatus) changed = true;
    clip.muted = nextMuted;
    const recordingTakeId = typeof clip.metadata?.recordingTakeId === "string" && clip.metadata.recordingTakeId.trim()
      ? clip.metadata.recordingTakeId
      : clip.id;
    clip.metadata = {
      ...(clip.metadata || {}),
      takeActive: active,
      takeStatus,
      ...(active
        ? {
            compGroupId: groupId,
            compSourceTakeId: recordingTakeId,
            compRangeStartBar: rangeStart,
            compRangeEndBar: rangeEnd
          }
        : {})
    };
    if (active) activeClipId = clip.id;
  });
  if (!changed || !activeClipId) {
    return { project, changed: false, status: "The selected take is already active over that edit range.", activeClipId: null, splitCount };
  }
  recomputeTimelineBars(editable);
  return {
    project: editable,
    changed: true,
    status: `Comped ${selected.name} over edit range ${formatBarForStatus(rangeStart)} to ${formatBarForStatus(rangeEnd)}.`,
    activeClipId,
    splitCount
  };
}

export function activateAudioTakeLane(project: PocketDawProject, clipId: string): AudioClipActionResult {
  const selected = project.timeline.clips.find((item) => item.id === clipId);
  const groupId = audioClipTakeGroupId(selected);
  if (!selected || selected.type !== "audio" || !groupId) {
    return { project, changed: false, status: "Choose a grouped audio take before activating a take lane." };
  }
  const siblings = audioTakeSiblings(project, selected).filter((clip) => audioTakeStatus(clip) !== "archived-take");
  const selectedLaneId = takeLaneIdForClip(selected, siblings.findIndex((clip) => clip.id === selected.id));
  if (!selectedLaneId || siblings.filter((clip, index) => takeLaneIdForClip(clip, index) === selectedLaneId).length < 1) {
    return { project, changed: false, status: "Choose a grouped audio take lane before activating it." };
  }
  const next = cloneProject(project);
  let changed = false;
  next.timeline.clips.forEach((clip, index) => {
    if (clip.type !== "audio" || clip.trackId !== selected.trackId || audioClipTakeGroupId(clip) !== groupId) return;
    if (audioTakeStatus(clip) === "archived-take") return;
    const laneId = takeLaneIdForClip(clip, index);
    const active = laneId === selectedLaneId;
    const nextMuted = !active;
    const takeStatus: AudioTakeStatus = active ? "active" : "muted-take";
    if (clip.muted !== nextMuted || clip.metadata?.takeActive !== active || clip.metadata?.takeStatus !== takeStatus) changed = true;
    clip.muted = nextMuted;
    clip.metadata = {
      ...(clip.metadata || {}),
      takeActive: active,
      takeStatus
    };
  });
  if (!changed) return { project, changed: false, status: `Take lane ${selectedLaneId} is already active.` };
  return {
    project: next,
    changed: true,
    status: `Activated take lane ${selectedLaneId} for ${selected.name}.`
  };
}

export function setAudioTakeArchived(project: PocketDawProject, clipId: string, archived: boolean): AudioClipActionResult {
  const selected = project.timeline.clips.find((item) => item.id === clipId);
  const groupId = audioClipTakeGroupId(selected);
  if (!selected || selected.type !== "audio" || !groupId) {
    return { project, changed: false, status: "Choose a grouped audio take before archiving." };
  }
  const currentStatus = audioTakeStatus(selected);
  const targetStatus: AudioTakeStatus = archived ? "archived-take" : "muted-take";
  if (currentStatus === targetStatus && selected.muted) {
    return {
      project,
      changed: false,
      status: archived ? `${selected.name} is already archived.` : `${selected.name} is already restored.`
    };
  }
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId)!;
  clip.muted = true;
  clip.metadata = {
    ...(clip.metadata || {}),
    takeActive: false,
    takeStatus: targetStatus
  };
  return {
    project: next,
    changed: true,
    status: archived ? `Archived ${selected.name}.` : `Restored ${selected.name} as an available muted take.`
  };
}

function audioClipTakeGroupId(clip: Clip | undefined): string | null {
  const groupId = clip?.metadata?.recordingTakeGroupId || clip?.metadata?.takeGroupId;
  return typeof groupId === "string" && groupId.trim() ? groupId : null;
}

function audioTakeSiblings(project: PocketDawProject, clip: Clip): Clip[] {
  const groupId = audioClipTakeGroupId(clip);
  if (!groupId) return [];
  return project.timeline.clips
    .filter((item) => item.type === "audio" && item.trackId === clip.trackId && audioClipTakeGroupId(item) === groupId)
    .sort((a, b) => takeSortKey(a) - takeSortKey(b) || a.startBar - b.startBar || a.id.localeCompare(b.id));
}

function takeGroupClips(project: PocketDawProject, trackId: string, groupId: string): Clip[] {
  return project.timeline.clips
    .filter((item) => item.type === "audio" && item.trackId === trackId && audioClipTakeGroupId(item) === groupId)
    .sort((a, b) => takeSortKey(a) - takeSortKey(b) || a.startBar - b.startBar || a.id.localeCompare(b.id));
}

function takeIndexForClip(clip: Clip, fallbackIndex: number): number {
  const takeIndex = Number(clip.metadata?.takeLaneIndex ?? clip.metadata?.takeIndex);
  return Number.isFinite(takeIndex) && takeIndex > 0 ? Math.round(takeIndex) : fallbackIndex + 1;
}

function takeSortKey(clip: Clip): number {
  const takeIndex = Number(clip.metadata?.takeLaneIndex ?? clip.metadata?.takeIndex);
  return Number.isFinite(takeIndex) && takeIndex > 0 ? takeIndex : Number.MAX_SAFE_INTEGER;
}

function takeLaneIdForClip(clip: Clip, fallbackIndex: number): string {
  const value = clip.metadata?.takeLaneId;
  if (typeof value === "string" && value.trim()) return value;
  const groupId = audioClipTakeGroupId(clip) || "take";
  return `${groupId}-lane-${takeIndexForClip(clip, fallbackIndex)}`;
}

function audioTakeStatus(clip: Clip): AudioTakeStatus {
  const value = clip.metadata?.takeStatus;
  if (value === "archived-take" || value === "muted-take" || value === "active" || value === "comp-segment") return value;
  return clip.metadata?.takeActive === false || clip.muted ? "muted-take" : "active";
}

function clipEndBar(clip: Clip): number {
  return clip.startBar + clip.barLength;
}

function clipsOverlap(a: Clip, b: Clip): boolean {
  const epsilon = 0.0001;
  return a.startBar < clipEndBar(b) - epsilon && b.startBar < clipEndBar(a) - epsilon;
}

function clipOverlapsRange(clip: Clip, startBar: number, endBar: number): boolean {
  const epsilon = 0.0001;
  return clip.startBar < endBar - epsilon && startBar < clipEndBar(clip) - epsilon;
}

function clipSpansBar(clip: Clip, bar: number): boolean {
  const epsilon = 0.0001;
  return bar > clip.startBar + epsilon && bar < clipEndBar(clip) - epsilon;
}

function canSplitAtRangeBoundary(clip: Clip, bar: number): boolean {
  if (!canRangeEditClip(clip)) return false;
  return clipSpansBar(clip, bar);
}

function canRangeEditClip(clip: Clip): boolean {
  return clip.type === "generated-section" || clip.type === "generated-pattern" || clip.type === "audio";
}

function nextClipIdFromSet(ids: Set<string>): string {
  let index = ids.size + 1;
  while (ids.has(`clip_${String(index).padStart(3, "0")}`)) index += 1;
  const id = `clip_${String(index).padStart(3, "0")}`;
  ids.add(id);
  return id;
}

function shiftedClipMetadata(project: PocketDawProject, clip: Clip, deltaBars: number): NonNullable<Clip["metadata"]> {
  if (clip.type === "audio") {
    const metadata: NonNullable<Clip["metadata"]> = {
      ...(clip.metadata || {}),
      sourceOffsetSeconds: audioClipSourceOffsetSeconds(clip) + timelineSecondsBetweenBars(project, clip.startBar, clip.startBar + deltaBars)
    };
    delete metadata.sourceStartBar;
    return metadata;
  }
  return {
    ...(clip.metadata || {}),
    sourceStartBar: clipSourceStartBar(clip) + deltaBars
  };
}

function shiftClipSourceStart(project: PocketDawProject, clip: Clip, deltaBars: number): void {
  clip.metadata = shiftedClipMetadata(project, clip, deltaBars);
}

function formatBarForStatus(bar: number): string {
  return Number.isInteger(bar) ? String(bar) : bar.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function applyOverlapCrossfade(original: PocketDawProject, next: PocketDawProject, selected: Clip): AudioClipActionResult {
  const selectedStart = selected.startBar;
  const selectedEnd = selected.startBar + selected.barLength;
  const candidates = next.timeline.clips
    .filter((clip) => clip.id !== selected.id && clip.type === "audio" && clip.trackId === selected.trackId)
    .map((clip) => {
      const overlapStart = Math.max(selectedStart, clip.startBar);
      const overlapEnd = Math.min(selectedEnd, clip.startBar + clip.barLength);
      return { clip, overlapBars: Math.max(0, overlapEnd - overlapStart) };
    })
    .filter((item) => item.overlapBars > 0.001);

  const left = candidates
    .filter((item) => item.clip.startBar < selected.startBar)
    .sort((a, b) => b.clip.startBar - a.clip.startBar)[0];
  if (left) {
    const overlapStart = Math.max(selectedStart, left.clip.startBar);
    const overlapEnd = Math.min(selectedEnd, left.clip.startBar + left.clip.barLength);
    const seconds = crossfadeSecondsForRange(original, overlapStart, overlapEnd);
    left.clip.metadata = {
      ...(left.clip.metadata || {}),
      fadeOutSeconds: seconds,
      crossfadeOutClipId: selected.id,
      crossfadeSeconds: seconds
    };
    selected.metadata = {
      ...(selected.metadata || {}),
      fadeInSeconds: seconds,
      crossfadeInClipId: left.clip.id,
      crossfadeSeconds: seconds
    };
    return { project: next, changed: true, status: `Applied ${formatSeconds(seconds)} crossfade between ${left.clip.name} and ${selected.name}.` };
  }

  const right = candidates
    .filter((item) => item.clip.startBar > selected.startBar)
    .sort((a, b) => a.clip.startBar - b.clip.startBar)[0];
  if (right) {
    const overlapStart = Math.max(selectedStart, right.clip.startBar);
    const overlapEnd = Math.min(selectedEnd, right.clip.startBar + right.clip.barLength);
    const seconds = crossfadeSecondsForRange(original, overlapStart, overlapEnd);
    selected.metadata = {
      ...(selected.metadata || {}),
      fadeOutSeconds: seconds,
      crossfadeOutClipId: right.clip.id,
      crossfadeSeconds: seconds
    };
    right.clip.metadata = {
      ...(right.clip.metadata || {}),
      fadeInSeconds: seconds,
      crossfadeInClipId: selected.id,
      crossfadeSeconds: seconds
    };
    return { project: next, changed: true, status: `Applied ${formatSeconds(seconds)} crossfade between ${selected.name} and ${right.clip.name}.` };
  }

  return { project: original, changed: false, status: "Overlap audio clips on the same track before creating a crossfade." };
}

function createLeftOverlapCrossfade(original: PocketDawProject, next: PocketDawProject, selected: Clip): AudioClipActionResult {
  const selectedStart = selected.startBar;
  const previous = next.timeline.clips
    .filter((clip) => clip.id !== selected.id && clip.type === "audio" && clip.trackId === selected.trackId)
    .map((clip) => ({ clip, endBar: clip.startBar + clip.barLength }))
    .filter((item) => item.endBar <= selectedStart + 0.001)
    .sort((a, b) => b.endBar - a.endBar)[0];

  if (!previous) {
    return { project: original, changed: false, status: "Place the selected audio clip directly after another audio clip on the same track before creating an overlap crossfade." };
  }

  const gapBars = selectedStart - previous.endBar;
  if (gapBars > 0.001) {
    return { project: original, changed: false, status: "Place audio clips edge-to-edge before creating an overlap crossfade." };
  }

  const sourceOffsetSeconds = audioClipSourceOffsetSeconds(selected);
  if (sourceOffsetSeconds <= 0.001) {
    return { project: original, changed: false, status: "Select a right-hand audio clip with earlier source material before creating an overlap crossfade." };
  }

  const earliestStartFromSource = timelineBarAtSeconds(original, Math.max(0, timelineSecondsAtBar(original, selected.startBar) - sourceOffsetSeconds));
  const sourceOverlapBars = Math.max(0, selected.startBar - earliestStartFromSource);
  const overlapBars = Math.min(0.25, sourceOverlapBars, Math.max(0, selected.startBar - 1));
  if (overlapBars <= 0.001) {
    return { project: original, changed: false, status: "Select a right-hand audio clip with earlier source material before creating an overlap crossfade." };
  }

  const overlapSeconds = crossfadeSecondsForRange(original, selected.startBar - overlapBars, selected.startBar);
  selected.startBar = Math.max(1, selected.startBar - overlapBars);
  selected.barLength += overlapBars;
  selected.metadata = {
    ...(selected.metadata || {}),
    sourceOffsetSeconds: Math.max(0, sourceOffsetSeconds - overlapSeconds)
  };
  retargetAudioClipWarpMarkers(original, selected);
  recomputeTimelineBars(next);

  const result = applyOverlapCrossfade(original, next, selected);
  if (!result.changed) return result;
  return {
    ...result,
    status: `Created ${formatSeconds(overlapSeconds)} overlap crossfade between ${previous.clip.name} and ${selected.name}.`
  };
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
  const rightMetadata = clip.type === "audio"
    ? {
        ...(clip.metadata || {}),
        sourceOffsetSeconds: audioClipSourceOffsetSeconds(clip) + timelineSecondsBetweenBars(project, clip.startBar, clip.startBar + leftLength),
        sourceStartBar: undefined
      }
    : {
        ...(clip.metadata || {}),
        sourceStartBar: sourceOffset + leftLength
      };
  if (clip.type === "audio") delete rightMetadata.sourceStartBar;
  if (clip.type === "audio") retargetAudioClipWarpMarkers(project, clip);
  const rightClip: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: nextClipId(next.timeline.clips),
    startBar: split,
    barLength: rightLength,
    linked: clip.linked,
    name: `${clip.name} split`,
    metadata: rightMetadata
  };
  if (rightClip.type === "audio") retargetAudioClipWarpMarkers(project, rightClip);
  next.timeline.clips.push(rightClip);
  recomputeTimelineBars(next);
  return { project: next, rightClipId: rightClip.id };
}

export function splitClipsAtRange(project: PocketDawProject, startBar: number, endBar: number): ClipRangeSplitResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, splitCount: 0, rightClipIds: [] };
  }
  const start = Math.max(1, Math.min(rawStart, rawEnd));
  const end = Math.max(start, Math.max(rawStart, rawEnd));
  if (end <= start) return { project, splitCount: 0, rightClipIds: [] };

  let next = project;
  const rightClipIds: string[] = [];
  [start, end].forEach((bar) => {
    const clipIds = next.timeline.clips
      .filter((clip) => canSplitAtRangeBoundary(clip, bar))
      .map((clip) => clip.id);
    clipIds.forEach((clipId) => {
      const split = splitClipAtBar(next, clipId, bar);
      if (split.rightClipId) {
        rightClipIds.push(split.rightClipId);
        next = split.project;
      }
    });
  });

  return { project: next, splitCount: rightClipIds.length, rightClipIds };
}

export function cropClipToRange(project: PocketDawProject, clipId: string, startBar: number, endBar: number): ClipRangeCropResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, clipId: null, status: "Set a valid edit range before cropping." };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (rangeEnd <= rangeStart) return { project, changed: false, clipId: null, status: "Set a longer edit range before cropping." };

  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || !canRangeEditClip(clip)) {
    return { project, changed: false, clipId: null, status: "Choose a generated, pattern or audio clip before cropping to range." };
  }
  const clipEnd = clipEndBar(clip);
  const cropStart = Math.max(clip.startBar, rangeStart);
  const cropEnd = Math.min(clipEnd, rangeEnd);
  const minLength = clip.type === "audio" ? 0.125 : 0.125;
  if (cropEnd - cropStart < minLength) {
    return { project, changed: false, clipId, status: "The selected clip does not overlap the edit range." };
  }

  const sourceDeltaBars = cropStart - clip.startBar;
  if (clip.type === "audio") {
    const sourceOffsetSeconds = audioClipSourceOffsetSeconds(clip);
    clip.metadata = {
      ...(clip.metadata || {}),
      sourceOffsetSeconds: sourceOffsetSeconds + timelineSecondsBetweenBars(project, clip.startBar, clip.startBar + sourceDeltaBars)
    };
    delete clip.metadata.sourceStartBar;
  } else {
    clip.metadata = {
      ...(clip.metadata || {}),
      sourceStartBar: clipSourceStartBar(clip) + sourceDeltaBars
    };
  }
  clip.startBar = cropStart;
  clip.barLength = cropEnd - cropStart;
  if (clip.type === "audio") retargetAudioClipWarpMarkers(project, clip);
  recomputeTimelineBars(next);
  return { project: next, changed: true, clipId, status: `Cropped ${clip.name} to edit range.` };
}

export function deleteClipRange(project: PocketDawProject, clipId: string, startBar: number, endBar: number): ClipRangeDeleteResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a valid edit range before deleting range." };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (rangeEnd <= rangeStart) return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a longer edit range before deleting range." };

  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || !canRangeEditClip(clip)) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Choose a generated, pattern or audio clip before deleting range." };
  }
  const epsilon = 0.0001;
  const clipStart = clip.startBar;
  const clipEnd = clipEndBar(clip);
  const removeStart = Math.max(clipStart, rangeStart);
  const removeEnd = Math.min(clipEnd, rangeEnd);
  if (removeEnd - removeStart <= epsilon) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "The selected clip does not overlap the edit range." };
  }

  if (removeStart <= clipStart + epsilon && removeEnd >= clipEnd - epsilon) {
    next.timeline.clips = next.timeline.clips.filter((item) => item.id !== clipId);
    recomputeTimelineBars(next);
    return { project: next, changed: true, deletedClipId: clipId, rightClipId: null, status: `Deleted ${clip.name} range.` };
  }

  if (removeStart <= clipStart + epsilon) {
    const sourceDeltaBars = removeEnd - clipStart;
    shiftClipSourceStart(project, clip, sourceDeltaBars);
    clip.startBar = removeEnd;
    clip.barLength = clipEnd - removeEnd;
    if (clip.type === "audio") retargetAudioClipWarpMarkers(project, clip);
    recomputeTimelineBars(next);
    return { project: next, changed: true, deletedClipId: null, rightClipId: clip.id, status: `Deleted range from ${clip.name}.` };
  }

  if (removeEnd >= clipEnd - epsilon) {
    clip.barLength = removeStart - clipStart;
    if (clip.type === "audio") retargetAudioClipWarpMarkers(project, clip);
    recomputeTimelineBars(next);
    return { project: next, changed: true, deletedClipId: null, rightClipId: null, status: `Deleted range from ${clip.name}.` };
  }

  const rightClip: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: nextClipId(next.timeline.clips),
    startBar: removeEnd,
    barLength: clipEnd - removeEnd,
    linked: clip.linked,
    name: `${clip.name} range`,
    metadata: shiftedClipMetadata(project, clip, removeEnd - clipStart)
  };
  clip.barLength = removeStart - clipStart;
  if (clip.type === "audio") retargetAudioClipWarpMarkers(project, clip);
  if (rightClip.type === "audio") retargetAudioClipWarpMarkers(project, rightClip);
  next.timeline.clips.push(rightClip);
  recomputeTimelineBars(next);
  return { project: next, changed: true, deletedClipId: null, rightClipId: rightClip.id, status: `Deleted range from ${clip.name}.` };
}

export function rippleDeleteClipRange(project: PocketDawProject, clipId: string, startBar: number, endBar: number): ClipRangeRippleDeleteResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  const baseFailure = { rippleBars: 0, movedClipIds: [] };
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a valid edit range before ripple deleting range.", ...baseFailure };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  if (rangeEnd <= rangeStart) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Set a longer edit range before ripple deleting range.", ...baseFailure };
  }
  const originalClip = project.timeline.clips.find((item) => item.id === clipId);
  if (!originalClip || !canRangeEditClip(originalClip)) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "Choose a generated, pattern or audio clip before ripple deleting range.", ...baseFailure };
  }
  const removeStart = Math.max(originalClip.startBar, rangeStart);
  const removeEnd = Math.min(clipEndBar(originalClip), rangeEnd);
  const rippleBars = removeEnd - removeStart;
  if (rippleBars <= 0.0001) {
    return { project, changed: false, deletedClipId: null, rightClipId: null, status: "The selected clip does not overlap the edit range.", ...baseFailure };
  }

  const deleted = deleteClipRange(project, clipId, startBar, endBar);
  if (!deleted.changed) return { ...deleted, ...baseFailure };
  const next = cloneProject(deleted.project);
  const movedClipIds: string[] = [];
  next.timeline.clips.forEach((clip) => {
    if (clip.trackId !== originalClip.trackId) return;
    if (clip.startBar < removeEnd - 0.0001) return;
    clip.startBar = Math.max(1, clip.startBar - rippleBars);
    movedClipIds.push(clip.id);
  });
  recomputeTimelineBars(next);
  const movedLabel = movedClipIds.length === 1 ? "clip" : "clips";
  return {
    project: next,
    changed: true,
    deletedClipId: deleted.deletedClipId,
    rightClipId: deleted.rightClipId,
    rippleBars,
    movedClipIds,
    status: `Ripple deleted range from ${originalClip.name}; moved ${movedClipIds.length} ${movedLabel}.`
  };
}

export function rippleDeleteTimelineRange(project: PocketDawProject, startBar: number, endBar: number): TimelineRippleDeleteResult {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  const empty = { rippleBars: 0, affectedClipIds: [], movedClipIds: [], rightClipIds: [] };
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return { project, changed: false, status: "Set a valid edit range before ripple deleting all tracks.", ...empty };
  }
  const rangeStart = Math.max(1, Math.min(rawStart, rawEnd));
  const rangeEnd = Math.max(rangeStart, Math.max(rawStart, rawEnd));
  const rippleBars = rangeEnd - rangeStart;
  if (rippleBars <= 0.0001) {
    return { project, changed: false, status: "Set a longer edit range before ripple deleting all tracks.", ...empty };
  }

  const next = cloneProject(project);
  const originalClips = new Map(next.timeline.clips.map((clip) => [clip.id, { startBar: clip.startBar, endBar: clipEndBar(clip) }]));
  const usedClipIds = new Set(next.timeline.clips.map((clip) => clip.id));
  const nextClips: Clip[] = [];
  const affectedClipIds: string[] = [];
  const rightClipIds: string[] = [];

  next.timeline.clips.forEach((clip) => {
    const clipStart = clip.startBar;
    const clipEnd = clipEndBar(clip);
    if (clipEnd <= rangeStart + 0.0001 || clipStart >= rangeEnd - 0.0001 || !canRangeEditClip(clip)) {
      nextClips.push(clip);
      return;
    }

    affectedClipIds.push(clip.id);
    const leftLength = Math.max(0, rangeStart - clipStart);
    const rightLength = Math.max(0, clipEnd - rangeEnd);
    if (leftLength > 0.0001) {
      clip.barLength = leftLength;
      if (clip.type === "audio") retargetAudioClipWarpMarkers(project, clip);
      nextClips.push(clip);
    }
    if (rightLength > 0.0001) {
      const rightId = leftLength > 0.0001 ? nextClipIdFromSet(usedClipIds) : clip.id;
      const rightClip: Clip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: rightId,
        startBar: rangeStart,
        barLength: rightLength,
        linked: clip.linked,
        name: leftLength > 0.0001 ? `${clip.name} ripple` : clip.name,
        metadata: shiftedClipMetadata(project, clip, rangeEnd - clipStart)
      };
      if (rightClip.type === "audio") retargetAudioClipWarpMarkers(project, rightClip);
      nextClips.push(rightClip);
      if (rightId !== clip.id) rightClipIds.push(rightId);
    }
  });

  next.timeline.clips = nextClips;
  const movedClipIds: string[] = [];
  next.timeline.clips.forEach((clip) => {
    if (!canRangeEditClip(clip)) return;
    const original = originalClips.get(clip.id);
    if (!original) return;
    if (original.startBar < rangeEnd - 0.0001) return;
    clip.startBar = Math.max(1, clip.startBar - rippleBars);
    movedClipIds.push(clip.id);
  });
  recomputeTimelineBars(next);
  if (!affectedClipIds.length && !movedClipIds.length) {
    return { project, changed: false, status: "No generated, pattern or audio clips were affected by the edit range.", ...empty };
  }
  const affectedLabel = affectedClipIds.length === 1 ? "clip" : "clips";
  const movedLabel = movedClipIds.length === 1 ? "later clip" : "later clips";
  return {
    project: next,
    changed: true,
    status: `Ripple deleted edit range across all tracks; edited ${affectedClipIds.length} ${affectedLabel} and moved ${movedClipIds.length} ${movedLabel}.`,
    rippleBars,
    affectedClipIds,
    movedClipIds,
    rightClipIds
  };
}

export function trimClipStart(project: PocketDawProject, clipId: string, deltaBars: number): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip || !canRangeEditClip(clip)) return project;
  const delta = Math.round(deltaBars);
  if (delta === 0) return project;
  if (clip.type === "audio") {
    const sourceOffsetSeconds = audioClipSourceOffsetSeconds(clip);
    if (delta > 0) {
      const trim = Math.min(delta, Math.max(0, clip.barLength - 0.125));
      if (trim <= 0) return project;
      const trimSeconds = timelineSecondsBetweenBars(project, clip.startBar, clip.startBar + trim);
      clip.startBar += trim;
      clip.barLength -= trim;
      clip.metadata = { ...(clip.metadata || {}), sourceOffsetSeconds: sourceOffsetSeconds + trimSeconds };
      retargetAudioClipWarpMarkers(project, clip);
    } else {
      const requestedStartBar = Math.max(1, clip.startBar - Math.min(Math.abs(delta), clip.startBar - 1));
      const earliestStartFromSource = timelineBarAtSeconds(project, Math.max(0, timelineSecondsAtBar(project, clip.startBar) - sourceOffsetSeconds));
      const newStartBar = Math.min(clip.startBar, Math.max(requestedStartBar, earliestStartFromSource));
      const extend = clip.startBar - newStartBar;
      if (extend <= 0) return project;
      const extendSeconds = timelineSecondsBetweenBars(project, newStartBar, clip.startBar);
      clip.startBar = newStartBar;
      clip.barLength += extend;
      clip.metadata = { ...(clip.metadata || {}), sourceOffsetSeconds: Math.max(0, sourceOffsetSeconds - extendSeconds) };
      retargetAudioClipWarpMarkers(project, clip);
    }
    return recomputeTimelineBars(next);
  }
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
  if (!clip || !canRangeEditClip(clip)) return project;
  const delta = Math.round(deltaBars);
  if (delta === 0) return project;
  clip.barLength = Math.max(clip.type === "audio" ? 0.125 : 1, clip.barLength + delta);
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

function audioClipSourceOffsetSeconds(clip: Clip): number {
  const value = clip.metadata?.sourceOffsetSeconds;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function maxWaveformPeak(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((max, item) => {
    const peak = Math.abs(Number(item));
    return Number.isFinite(peak) ? Math.max(max, peak) : max;
  }, 0);
}

function audioTransientMarkers(value: unknown, durationSeconds: number): number[] {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : Number.POSITIVE_INFINITY;
  if (!Array.isArray(value)) return [];
  return value
    .map((marker) => Number(marker))
    .filter((marker) => Number.isFinite(marker) && marker >= 0 && marker <= duration)
    .sort((a, b) => a - b)
    .filter((marker, index, markers) => index === 0 || Math.abs(marker - markers[index - 1]) >= 0.005)
    .map(roundSeconds);
}

function quantizableAudioWarpMarkers(value: unknown): Array<{ id: string; sourceSeconds: number; targetBar: number; targetSeconds: number; source: string; locked: boolean }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((marker, index) => {
      if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
      const data = marker as Record<string, unknown>;
      const sourceSeconds = Number(data.sourceSeconds);
      const targetBar = Number(data.targetBar);
      if (!Number.isFinite(sourceSeconds) || sourceSeconds < 0 || !Number.isFinite(targetBar) || targetBar < 1) return null;
      const targetSeconds = Number(data.targetSeconds);
      return {
        id: typeof data.id === "string" ? data.id : `warp_${index + 1}`,
        sourceSeconds: roundSeconds(sourceSeconds),
        targetBar: roundBar(targetBar),
        targetSeconds: Number.isFinite(targetSeconds) ? roundSeconds(targetSeconds) : 0,
        source: typeof data.source === "string" ? data.source : "transient",
        locked: data.locked !== false
      };
    })
    .filter((marker): marker is { id: string; sourceSeconds: number; targetBar: number; targetSeconds: number; source: string; locked: boolean } => !!marker)
    .slice(0, 128);
}

function audioWarpQuantizeStepBars(project: PocketDawProject): number {
  const numerator = Math.max(1, Math.round(Number(project.project.timeSig) || 4));
  return 1 / (numerator * 4);
}

function audioWarpGlobalVarispeed(
  markers: Array<{ sourceSeconds: number; targetSeconds: number }>,
  project: PocketDawProject,
  clip: Clip
): { playbackRate: number; sourceOffsetSeconds: number } | null {
  const ordered = markers
    .filter((marker) => Number.isFinite(marker.sourceSeconds) && Number.isFinite(marker.targetSeconds))
    .sort((a, b) => a.targetSeconds - b.targetSeconds || a.sourceSeconds - b.sourceSeconds);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return null;
  const sourceSpan = Math.abs(last.sourceSeconds - first.sourceSeconds);
  const targetSpan = Math.abs(last.targetSeconds - first.targetSeconds);
  if (sourceSpan < 0.005 || targetSpan < 0.005) return null;
  const playbackRate = clampNumber(sourceSpan / targetSpan, 0.25, 4, 1, false);
  const clipStartSeconds = timelineSecondsAtBar(project, clip.startBar);
  const firstLocalTargetSeconds = Math.max(0, first.targetSeconds - clipStartSeconds);
  const sourceOffsetSeconds = clampNumber(first.sourceSeconds - firstLocalTargetSeconds * playbackRate, 0, 24 * 60 * 60, audioClipSourceOffsetSeconds(clip), false);
  return {
    playbackRate: roundPlaybackRate(playbackRate),
    sourceOffsetSeconds: roundSeconds(sourceOffsetSeconds)
  };
}

function retargetAudioClipWarpMarkers(project: PocketDawProject, clip: Clip): void {
  if (clip.type !== "audio" || !Array.isArray(clip.metadata?.audioWarpMarkers)) return;
  const sourceOffset = audioClipSourceOffsetSeconds(clip);
  const clipStartSeconds = timelineSecondsAtBar(project, clip.startBar);
  const clipDurationSeconds = Math.max(0, timelineSecondsAtBar(project, clip.startBar + clip.barLength) - clipStartSeconds);
  const sourceEnd = sourceOffset + clipDurationSeconds;
  const markers = clip.metadata.audioWarpMarkers
    .map((marker, index) => {
      if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
      const data = marker as Record<string, unknown>;
      const sourceSeconds = Number(data.sourceSeconds);
      if (!Number.isFinite(sourceSeconds) || sourceSeconds < sourceOffset || sourceSeconds > sourceEnd) return null;
      const localSeconds = Math.max(0, sourceSeconds - sourceOffset);
      const targetSeconds = clipStartSeconds + localSeconds;
      return {
        id: typeof data.id === "string" ? data.id : `warp_${index + 1}`,
        sourceSeconds: roundSeconds(sourceSeconds),
        targetBar: roundBar(timelineBarAtSeconds(project, targetSeconds)),
        targetSeconds: roundSeconds(targetSeconds),
        source: typeof data.source === "string" ? data.source : "transient",
        locked: data.locked !== false
      };
    })
    .filter((marker): marker is { id: string; sourceSeconds: number; targetBar: number; targetSeconds: number; source: string; locked: boolean } => !!marker)
    .slice(0, 128);
  clip.metadata = {
    ...(clip.metadata || {}),
    audioWarpMarkers: markers,
    audioWarpMarkerCount: markers.length,
    audioWarpReady: markers.length > 0,
    audioWarpPlaybackMode: "metadata-only"
  };
}

function metadataNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function roundSeconds(value: number): number {
  return Math.max(0, Math.round(value * 1000) / 1000);
}

function roundPlaybackRate(value: number): number {
  return Math.max(0.25, Math.min(4, Math.round(value * 1000000) / 1000000));
}

function roundBar(value: number): number {
  return Math.max(1, Math.round(value * 1000) / 1000);
}

function crossfadeSecondsForRange(project: PocketDawProject, startBar: number, endBar: number): number {
  return clampNumber(timelineSecondsBetweenBars(project, startBar, endBar), 0, 24 * 60 * 60, 0, false);
}

function timelineSecondsBetweenBars(project: PocketDawProject, startBar: number, endBar: number): number {
  return Math.max(0, timelineSecondsAtBar(project, endBar) - timelineSecondsAtBar(project, startBar));
}

function formatSeconds(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}s`;
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
