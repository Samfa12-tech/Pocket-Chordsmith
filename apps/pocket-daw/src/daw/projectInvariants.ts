import type { ClipType, HostedPluginIdentity, HostedPluginProjectMetadata, HostedPluginStateSnapshot, PocketDawProject } from "./schema";
import { normalizeProjectRelativeMediaPath } from "./mediaPool";
import { DRUM_RACK_FIRST_NOTE, DRUM_RACK_PAD_COUNT, validHostedPluginState } from "./devices";

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

const CONTROL_ONLY_CLIP_TYPES: ReadonlySet<ClipType> = new Set(["automation", "marker"]);

export function validateProjectInvariants(project: PocketDawProject): ProjectInvariantReport {
  const errors: ProjectInvariantIssue[] = [];
  const warnings: ProjectInvariantIssue[] = [];
  const add = (severity: ProjectInvariantSeverity, code: string, path: string, message: string) => {
    (severity === "error" ? errors : warnings).push({ severity, code, path, message });
  };

  const trackIds = collectDuplicateIds(project.tracks, "tracks", add);
  collectDuplicateIds(project.timeline.clips, "timeline.clips", add);
  collectDuplicateIds(project.timeline.markers, "timeline.markers", add);
  const mediaIds = collectDuplicateIds(project.mediaPool, "mediaPool", add);
  const deviceIds = collectDuplicateIds(project.devices, "devices", add);
  const mediaById = new Map(project.mediaPool.map((item) => [item.id, item]));
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
    if (track.instrumentDeviceId) {
      if (!deviceIds.has(track.instrumentDeviceId)) {
        add("error", "missing-track-instrument-device", `${base}.instrumentDeviceId`, `Track ${track.id} references missing instrument device ${track.instrumentDeviceId}.`);
      } else if (track.trackType !== "midi") {
        add("error", "invalid-instrument-track-type", `${base}.instrumentDeviceId`, `Track ${track.id} must be a MIDI track to own an instrument device.`);
      }
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
      } else {
        const media = mediaById.get(clip.mediaPoolItemId);
        if (media?.metadata?.analysisInvalidated === true || media?.metadata?.waveformNeedsRefresh === true) {
          add("warning", "stale-audio-waveform-analysis", `${base}.mediaPoolItemId`, `Audio clip ${clip.id} uses media ${media.id} with stale waveform analysis.`);
        }
        if (!hasWaveformPeaks(media?.metadata?.waveformPeaks)) {
          add("warning", "missing-audio-waveform-analysis", `${base}.mediaPoolItemId`, `Audio clip ${clip.id} uses media ${clip.mediaPoolItemId} without waveform analysis.`);
        }
      }
      const metadata = clip.metadata || {};
      for (const field of ["sourceOffsetSeconds", "durationSeconds", "fadeInSeconds", "fadeOutSeconds"] as const) {
        const value = metadata[field];
        if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
          add("error", "invalid-audio-clip-metadata", `${base}.metadata.${field}`, `Audio clip ${clip.id} has invalid ${field}.`);
        }
      }
      if (metadata.takeStatus !== undefined && metadata.takeStatus !== "active" && metadata.takeStatus !== "comp-segment" && metadata.takeStatus !== "muted-take" && metadata.takeStatus !== "archived-take") {
        add("warning", "invalid-audio-take-status", `${base}.metadata.takeStatus`, `Audio clip ${clip.id} has an unknown take status.`);
      }
    }
    if (clip.automationLaneId && !laneIds.has(clip.automationLaneId)) {
      add("error", "missing-clip-automation-lane", `${base}.automationLaneId`, `Clip ${clip.id} references missing automation lane ${clip.automationLaneId}.`);
    }
    if (CONTROL_ONLY_CLIP_TYPES.has(clip.type) || (clip.type === "generated-pattern" && !isRenderableGeneratedPatternClip(clip))) {
      add("warning", "control-only-clip-type", `${base}.type`, `Clip type ${clip.type} is schema-valid but not fully rendered as audio material.`);
    }
  });

  project.mediaPool.forEach((item, index) => {
    const base = `mediaPool[${index}]`;
    if (item.durationSeconds !== undefined && (!isFiniteNumber(item.durationSeconds) || item.durationSeconds < 0)) {
      add("error", "invalid-media-duration", `${base}.durationSeconds`, `Media item ${item.id} has an invalid duration.`);
    }
    const projectRelativePath = metadataString(item.metadata?.projectRelativePath);
    if (projectRelativePath && !normalizeProjectRelativeMediaPath(projectRelativePath)) {
      add("warning", "unsafe-project-media-path", `${base}.metadata.projectRelativePath`, `Media item ${item.id} has an unsafe project-relative media path.`);
    }
    const decodedCachePath = metadataString(item.metadata?.nativeDecodedCacheRelativePath);
    if (decodedCachePath && !normalizeProjectRelativeMediaPath(decodedCachePath)) {
      add("warning", "unsafe-decoded-cache-path", `${base}.metadata.nativeDecodedCacheRelativePath`, `Media item ${item.id} has an unsafe decoded-cache path.`);
    }
    const uri = metadataString(item.uri);
    if ((uri.startsWith("project-media") || uri.startsWith("project://media/") || uri.startsWith("project-cache")) && !normalizeProjectRelativeMediaPath(uri)) {
      add("warning", "unsafe-project-media-uri", `${base}.uri`, `Media item ${item.id} has an unsafe project-relative URI.`);
    }
  });

  project.devices.forEach((device, index) => {
    const base = `devices[${index}]`;
    if (device.type === "quick-sampler") {
      if (!mediaIds.has(device.mediaPoolItemId)) {
        add("warning", "missing-sampler-media", `${base}.mediaPoolItemId`, `Quick Sampler ${device.id} references unavailable media ${device.mediaPoolItemId}.`);
      }
      validateSampleRange(device.startPosition, device.endPosition, `${base}`, device.id, add);
      validateUnitRange(device.loopStartPosition, `${base}.loopStartPosition`, device.id, add);
      validateUnitRange(device.loopEndPosition, `${base}.loopEndPosition`, device.id, add);
      if (device.loopEndPosition <= device.loopStartPosition) {
        add("error", "invalid-sampler-loop", `${base}.loopEndPosition`, `Quick Sampler ${device.id} loop end must follow loop start.`);
      }
      if (!isFiniteNumber(device.envelope.attackSeconds) || !isFiniteNumber(device.envelope.decaySeconds) || !isFiniteNumber(device.envelope.sustainLevel) || !isFiniteNumber(device.envelope.releaseSeconds)) {
        add("error", "invalid-sampler-envelope", `${base}.envelope`, `Quick Sampler ${device.id} envelope values must be finite.`);
      }
    } else if (device.type === "drum-rack") {
      if (device.pads.length !== DRUM_RACK_PAD_COUNT) {
        add("error", "invalid-drum-rack-pad-count", `${base}.pads`, `Drum Rack ${device.id} must contain exactly ${DRUM_RACK_PAD_COUNT} pads.`);
      }
      const padIds = new Set<string>();
      const notes = new Set<number>();
      device.pads.forEach((pad, padIndex) => {
        const padBase = `${base}.pads[${padIndex}]`;
        if (!pad.id || padIds.has(pad.id)) add("error", "duplicate-drum-pad-id", `${padBase}.id`, `Drum Rack ${device.id} contains a missing or duplicate pad id.`);
        padIds.add(pad.id);
        if (notes.has(pad.midiNote) || pad.midiNote !== DRUM_RACK_FIRST_NOTE + padIndex) {
          add("error", "invalid-drum-pad-note", `${padBase}.midiNote`, `Drum Rack ${device.id} pads must map in order to MIDI notes 36-51.`);
        }
        notes.add(pad.midiNote);
        if (pad.mediaPoolItemId && !mediaIds.has(pad.mediaPoolItemId)) {
          add("warning", "missing-drum-pad-media", `${padBase}.mediaPoolItemId`, `Drum Rack pad ${pad.id} references unavailable media ${pad.mediaPoolItemId}.`);
        }
        validateSampleRange(pad.startPosition, pad.endPosition, padBase, pad.id, add);
      });
    } else {
      validateHostedPlugin(device.hostedPlugin, device.hostedPluginState, device.hostedPluginMetadata, base, add);
    }
  });

  project.fx.chains.forEach((chain, chainIndex) => chain.slots.forEach((slot, slotIndex) => {
    if (!slot.hostedPlugin) return;
    validateHostedPlugin(slot.hostedPlugin, slot.hostedPluginState, slot.hostedPluginMetadata, `fx.chains[${chainIndex}].slots[${slotIndex}]`, add);
  }));

  project.automation.lanes.forEach((lane, index) => {
    const base = `automation.lanes[${index}]`;
    if (lane.trackId && !trackIds.has(lane.trackId)) add("error", "missing-automation-track", `${base}.trackId`, `Automation lane ${lane.id} targets missing track ${lane.trackId}.`);
    const deviceTarget = lane.targetPath.match(/^device:([^:]+):parameter:([^:]+)$/);
    if (lane.targetPath.startsWith("device:") && !deviceTarget) {
      add("error", "invalid-device-automation-path", `${base}.targetPath`, `Automation lane ${lane.id} has an invalid device parameter path.`);
    } else if (deviceTarget && !deviceIds.has(deviceTarget[1])) {
      add("error", "missing-automation-device", `${base}.targetPath`, `Automation lane ${lane.id} targets missing device ${deviceTarget[1]}.`);
    }
    lane.points.forEach((point, pointIndex) => {
      if (!isFiniteNumber(point.bar) || !isFiniteNumber(point.value)) {
        add("error", "non-finite-automation-point", `${base}.points[${pointIndex}]`, `Automation lane ${lane.id} has a non-finite point.`);
      }
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

function validateSampleRange(
  start: number,
  end: number,
  base: string,
  ownerId: string,
  add: (severity: ProjectInvariantSeverity, code: string, path: string, message: string) => void
) {
  validateUnitRange(start, `${base}.startPosition`, ownerId, add);
  validateUnitRange(end, `${base}.endPosition`, ownerId, add);
  if (end <= start) add("error", "invalid-sample-range", `${base}.endPosition`, `${ownerId} sample end must follow sample start.`);
}

function validateUnitRange(
  value: number,
  path: string,
  ownerId: string,
  add: (severity: ProjectInvariantSeverity, code: string, path: string, message: string) => void
) {
  if (!isFiniteNumber(value) || value < 0 || value > 1) add("error", "invalid-sample-position", path, `${ownerId} sample positions must be finite values from 0 to 1.`);
}

function validateHostedPlugin(
  identity: HostedPluginIdentity,
  state: HostedPluginStateSnapshot | undefined,
  metadata: HostedPluginProjectMetadata | undefined,
  base: string,
  add: (severity: ProjectInvariantSeverity, code: string, path: string, message: string) => void
) {
  if (identity.format !== "vst3" || !identity.classId || !identity.moduleFilename) {
    add("error", "invalid-hosted-plugin-identity", `${base}.hostedPlugin`, "Hosted VST3 identity requires a class id and module filename.");
  }
  if (/[\\/]/.test(identity.moduleFilename)) {
    add("error", "hosted-plugin-path-leak", `${base}.hostedPlugin.moduleFilename`, "Hosted plug-in identity must store only a module filename, never a local path.");
  }
  if (state && !validHostedPluginState(state)) {
    add("error", "invalid-hosted-plugin-state", `${base}.hostedPluginState`, "Hosted plug-in state is invalid or exceeds the 32 MiB per-instance limit.");
  }
  if (metadata && (!Array.isArray(metadata.parameterDescriptors) || !Array.isArray(metadata.factoryPrograms) || !Array.isArray(metadata.pocketPresets))) {
    add("error", "invalid-hosted-plugin-metadata", `${base}.hostedPluginMetadata`, "Hosted plug-in metadata lists must be valid arrays.");
  }
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

function hasWaveformPeaks(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => {
    const peak = Number(item);
    return Number.isFinite(peak) && peak >= 0;
  });
}

function metadataString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRenderableGeneratedPatternClip(clip: PocketDawProject["timeline"]["clips"][number]): boolean {
  return clip.type === "generated-pattern" &&
    typeof clip.sectionId === "string" &&
    typeof clip.metadata?.patternId === "string" &&
    clip.metadata.patternId.trim().length > 0;
}

function isAllowedVirtualClipTrack(type: ClipType, trackId: string): boolean {
  return type === "generated-section" && trackId === "arrangement";
}
