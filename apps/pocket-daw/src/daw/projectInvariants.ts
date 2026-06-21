import type { ClipType, PocketDawProject } from "./schema";

export type ProjectInvariantSeverity = "error" | "warning";

export interface ProjectInvariantIssue {
  severity: ProjectInvariantSeverity;
  code: string;
  message: string;
  path: string;
}

export interface ProjectInvariantReport {
  ok: boolean;
  errors: ProjectInvariantIssue[];
  warnings: ProjectInvariantIssue[];
}

const CONTROL_ONLY_CLIP_TYPES: ReadonlySet<ClipType> = new Set(["automation", "marker", "generated-pattern"]);

export function validateProjectInvariants(project: PocketDawProject): ProjectInvariantReport {
  const errors: ProjectInvariantIssue[] = [];
  const warnings: ProjectInvariantIssue[] = [];
  const add = (severity: ProjectInvariantSeverity, code: string, path: string, message: string) => {
    (severity === "error" ? errors : warnings).push({ severity, code, path, message });
  };

  const trackIds = collectDuplicateIds(project.tracks, "tracks", add);
  const clipIds = collectDuplicateIds(project.timeline.clips, "timeline.clips", add);
  const markerIds = collectDuplicateIds(project.timeline.markers, "timeline.markers", add);
  const mediaIds = collectDuplicateIds(project.mediaPool, "mediaPool", add);
  const laneIds = collectDuplicateIds(project.automation.lanes, "automation.lanes", add);
  collectDuplicateIds(project.sourceRefs, "sourceRefs", add);

  if (!trackIds.has(project.routing.masterTrackId)) {
    add("error", "invalid-master-track", "routing.masterTrackId", `Routing master track ${project.routing.masterTrackId} does not exist.`);
  }
  const master = project.tracks.find((track) => track.id === project.routing.masterTrackId);
  if (master && master.role !== "master") {
    add("warning", "master-role-mismatch", "routing.masterTrackId", `Routing master track ${master.id} is not marked as role master.`);
  }

  if (!isFiniteNumber(project.timeline.bars) || project.timeline.bars <= 0) {
    add("error", "invalid-timeline-bars", "timeline.bars", "Timeline bars must be a finite positive number.");
  }
  if (
    project.timeline.loop.enabled &&
    (!isFiniteNumber(project.timeline.loop.startBar) ||
      !isFiniteNumber(project.timeline.loop.endBar) ||
      project.timeline.loop.endBar <= project.timeline.loop.startBar)
  ) {
    add("error", "invalid-loop-range", "timeline.loop", "Enabled loop range must have finite start/end bars and end after start.");
  }

  project.tracks.forEach((track, index) => {
    const base = `tracks[${index}]`;
    if (track.routing.outputId && track.routing.outputId !== "master" && !trackIds.has(track.routing.outputId)) {
      add("error", "dangling-track-output", `${base}.routing.outputId`, `Track ${track.id} routes to missing output ${track.routing.outputId}.`);
    }
    for (const sendId of track.routing.sendIds || []) {
      if (!trackIds.has(sendId)) add("warning", "dangling-track-send", `${base}.routing.sendIds`, `Track ${track.id} sends to missing track ${sendId}.`);
    }
    for (const laneId of track.automationLaneIds || []) {
      if (!laneIds.has(laneId)) add("warning", "missing-track-automation-lane", `${base}.automationLaneIds`, `Track ${track.id} references missing automation lane ${laneId}.`);
    }
    if (hasRoutingCycle(project, track.id)) {
      add("error", "routing-cycle", `${base}.routing.outputId`, `Track ${track.id} is part of a routing cycle.`);
    }
  });

  project.timeline.markers.forEach((marker, index) => {
    if (!isFiniteNumber(marker.bar)) add("error", "non-finite-marker-bar", `timeline.markers[${index}].bar`, `Marker ${marker.id} has a non-finite bar.`);
  });

  project.timeline.clips.forEach((clip, index) => {
    const base = `timeline.clips[${index}]`;
    if (!trackIds.has(clip.trackId) && !isAllowedVirtualClipTrack(clip.type, clip.trackId)) {
      add("error", "missing-clip-track", `${base}.trackId`, `Clip ${clip.id} targets missing track ${clip.trackId}.`);
    }
    if (!isFiniteNumber(clip.startBar)) add("error", "non-finite-clip-start", `${base}.startBar`, `Clip ${clip.id} has a non-finite startBar.`);
    if (!isFiniteNumber(clip.barLength) || clip.barLength <= 0) add("error", "invalid-clip-length", `${base}.barLength`, `Clip ${clip.id} must have a finite positive barLength.`);
    if (clip.type === "audio") {
      if (!clip.mediaPoolItemId || !mediaIds.has(clip.mediaPoolItemId)) {
        add("error", "missing-clip-media", `${base}.mediaPoolItemId`, `Audio clip ${clip.id} references missing media ${clip.mediaPoolItemId || "(none)"}.`);
      }
      const metadata = clip.metadata || {};
      for (const field of ["sourceOffsetSeconds", "durationSeconds", "fadeInSeconds", "fadeOutSeconds"] as const) {
        const value = metadata[field];
        if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
          add("error", "invalid-audio-clip-metadata", `${base}.metadata.${field}`, `Audio clip ${clip.id} has invalid ${field}.`);
        }
      }
    }
    if (clip.automationLaneId && !laneIds.has(clip.automationLaneId)) {
      add("error", "missing-clip-automation-lane", `${base}.automationLaneId`, `Clip ${clip.id} references missing automation lane ${clip.automationLaneId}.`);
    }
    if (CONTROL_ONLY_CLIP_TYPES.has(clip.type)) {
      add("warning", "control-only-clip-type", `${base}.type`, `Clip type ${clip.type} is schema-valid but not fully rendered as audio material.`);
    }
  });

  project.mediaPool.forEach((item, index) => {
    if (item.durationSeconds !== undefined && (!isFiniteNumber(item.durationSeconds) || item.durationSeconds < 0)) {
      add("error", "invalid-media-duration", `mediaPool[${index}].durationSeconds`, `Media item ${item.id} has an invalid duration.`);
    }
  });

  project.automation.lanes.forEach((lane, index) => {
    const base = `automation.lanes[${index}]`;
    if (lane.trackId && !trackIds.has(lane.trackId)) add("error", "missing-automation-track", `${base}.trackId`, `Automation lane ${lane.id} targets missing track ${lane.trackId}.`);
    lane.points.forEach((point, pointIndex) => {
      if (!isFiniteNumber(point.bar) || !isFiniteNumber(point.value)) {
        add("error", "non-finite-automation-point", `${base}.points[${pointIndex}]`, `Automation lane ${lane.id} has a non-finite point.`);
      }
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

function collectDuplicateIds(
  items: Array<{ id: string }>,
  path: string,
  add: (severity: ProjectInvariantSeverity, code: string, path: string, message: string) => void
): Set<string> {
  const ids = new Set<string>();
  const duplicates = new Set<string>();
  items.forEach((item, index) => {
    if (!item.id) {
      add("error", "missing-id", `${path}[${index}].id`, `${path}[${index}] is missing an id.`);
      return;
    }
    if (ids.has(item.id)) duplicates.add(item.id);
    ids.add(item.id);
  });
  duplicates.forEach((id) => add("error", "duplicate-id", path, `${path} contains duplicate id ${id}.`));
  return ids;
}

function hasRoutingCycle(project: PocketDawProject, startId: string): boolean {
  const visited = new Set<string>();
  let current: string | null | undefined = startId;
  while (current && current !== "master") {
    if (visited.has(current)) return true;
    visited.add(current);
    current = project.tracks.find((track) => track.id === current)?.routing.outputId;
  }
  return false;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAllowedVirtualClipTrack(type: ClipType, trackId: string): boolean {
  return type === "generated-section" && trackId === "arrangement";
}
