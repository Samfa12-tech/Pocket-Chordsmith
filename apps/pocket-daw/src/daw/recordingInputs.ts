import { cloneProject } from "./dawProject";
import type { AudioDeviceInfo, PocketDawProject, RecordingInputMode, Track, TrackRecordingInput } from "./schema";

export interface RecordingInputDeviceAvailability {
  id: string;
  name?: string;
  channelCount?: number;
}

export interface RecordingInputPreflightOptions {
  availableInputDevices?: RecordingInputDeviceAvailability[];
  allowMultipleArmedTracks?: boolean;
}

export interface RecordingInputCapturePlanItem {
  trackId: string;
  trackName: string;
  deviceId: string | null;
  mode: RecordingInputMode;
  channelMap: number[];
  label: string;
}

export interface RecordingInputPreflight {
  ok: boolean;
  mode: "single-track" | "future-multitrack";
  armedTrackCount: number;
  selectedTrackId: string | null;
  capturePlan: RecordingInputCapturePlanItem[];
  errors: string[];
  warnings: string[];
}

export function setTrackRecordingInputAssignment(
  project: PocketDawProject,
  trackId: string,
  assignment: TrackRecordingInput | null
): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (!track || !isRecordCapableTrack(track)) return project;
  if (!assignment) {
    delete track.recordingInput;
    return next;
  }
  const normalized = normalizeAssignment(assignment);
  track.recordingInput = normalized;
  track.inputDeviceId = normalized.deviceId;
  if (normalized.mode === "mono" || normalized.mode === "stereo") track.recordingChannelMode = normalized.mode;
  return next;
}

export function buildRecordingInputPreflight(
  project: PocketDawProject,
  options: RecordingInputPreflightOptions = {}
): RecordingInputPreflight {
  const errors: string[] = [];
  const warnings: string[] = [];
  const availableDevices = normalizeAvailableDevices(options.availableInputDevices, project.audioDeviceSettings.devices);
  const armedTracks = project.tracks.filter((track) => track.armed && isRecordCapableTrack(track));
  const mode = options.allowMultipleArmedTracks ? "future-multitrack" : "single-track";

  if (!armedTracks.length) errors.push("Arm one live audio track before recording.");
  if (!options.allowMultipleArmedTracks && armedTracks.length > 1) {
    errors.push("Only one live audio track can be armed for this recording alpha.");
  }

  const capturePlan = armedTracks.map((track) => {
    const assignment = assignmentForTrack(project, track, availableDevices);
    const device = deviceForAssignment(assignment, availableDevices);
    if (assignment.deviceId && !device) warnings.push(`${track.name} uses saved input device ${assignment.deviceId}, which is not currently available.`);
    const channelCount = device?.channelCount ?? fallbackInputChannelCount(project);
    const channelMap = channelMapForAssignment(assignment);
    const label = `${track.name}: ${labelForAssignment(assignment, channelMap)}`;
    const maxChannel = channelMap.reduce((max, channel) => Math.max(max, channel), -1);
    if (channelCount > 0 && maxChannel >= channelCount) {
      errors.push(`${track.name} needs ${neededChannelLabel(channelMap)} but ${device?.name || "the selected input device"} exposes ${channelCount} input channel${channelCount === 1 ? "" : "s"}.`);
    }
    return {
      trackId: track.id,
      trackName: track.name,
      deviceId: assignment.deviceId,
      mode: assignment.mode,
      channelMap,
      label
    };
  });

  if (options.allowMultipleArmedTracks) {
    duplicateChannelErrors(capturePlan, armedTracks).forEach((error) => errors.push(error));
  }

  return {
    ok: errors.length === 0,
    mode,
    armedTrackCount: armedTracks.length,
    selectedTrackId: armedTracks.length === 1 ? armedTracks[0].id : null,
    capturePlan: errors.length ? [] : capturePlan,
    errors,
    warnings
  };
}

export function nativeRecordingAlphaChannelCompatibilityError(item: RecordingInputCapturePlanItem | null | undefined): string | null {
  if (!item) return "No recording capture plan is available.";
  if (item.mode === "mono" && item.channelMap.length === 1 && item.channelMap[0] === 0) return null;
  if (item.mode === "stereo" && item.channelMap.length === 2 && item.channelMap[0] === 0 && item.channelMap[1] === 1) return null;
  const supported = item.mode === "stereo" ? "Stereo Ch 1-2" : "Mono Ch 1";
  return `${item.trackName} is assigned to ${labelForAssignment({ deviceId: item.deviceId, mode: item.mode, channelIndex: item.channelMap[0], channelPair: item.channelMap.length > 1 ? [item.channelMap[0], item.channelMap[1]] : undefined }, item.channelMap)}, but the native recording alpha currently captures ${supported} only.`;
}

function assignmentForTrack(
  project: PocketDawProject,
  track: Track,
  availableDevices: RecordingInputDeviceAvailability[]
): TrackRecordingInput {
  if (track.recordingInput) return normalizeAssignment(track.recordingInput);
  const deviceId = track.inputDeviceId || project.audioDeviceSettings.inputDeviceId || availableDevices[0]?.id || null;
  const mode = track.recordingChannelMode === "stereo" ? "stereo" : "mono";
  return mode === "stereo"
    ? { deviceId, mode, channelPair: [0, 1] }
    : { deviceId, mode, channelIndex: 0 };
}

function normalizeAssignment(assignment: TrackRecordingInput): TrackRecordingInput {
  const deviceId = typeof assignment.deviceId === "string" && assignment.deviceId.trim() ? assignment.deviceId.trim() : null;
  const mode: RecordingInputMode = assignment.mode === "stereo" || assignment.mode === "split-mono" ? assignment.mode : "mono";
  if (mode === "stereo") {
    const pair = Array.isArray(assignment.channelPair) ? assignment.channelPair : [0, 1];
    return {
      deviceId,
      mode,
      channelPair: [safeChannel(pair[0], 0), safeChannel(pair[1], 1)],
      allowDuplicateChannels: assignment.allowDuplicateChannels === true
    };
  }
  return {
    deviceId,
    mode,
    channelIndex: safeChannel(assignment.channelIndex, 0),
    allowDuplicateChannels: assignment.allowDuplicateChannels === true
  };
}

function normalizeAvailableDevices(
  explicit: RecordingInputDeviceAvailability[] | undefined,
  projectDevices: AudioDeviceInfo[] | undefined
): RecordingInputDeviceAvailability[] {
  const source = explicit?.length
    ? explicit
    : (projectDevices || [])
      .filter((device) => device.kind === "input" || device.kind === "duplex" || device.isDefaultInput)
      .map((device) => ({
        id: device.id,
        name: device.name,
        channelCount: maxSupportedChannels(device.supportedChannels)
      }));
  return source
    .filter((device) => typeof device.id === "string" && device.id.trim())
    .map((device) => ({
      id: device.id.trim(),
      name: device.name || device.id.trim(),
      channelCount: Number.isFinite(device.channelCount) ? Math.max(0, Math.floor(Number(device.channelCount))) : undefined
    }));
}

function deviceForAssignment(assignment: TrackRecordingInput, availableDevices: RecordingInputDeviceAvailability[]) {
  if (!assignment.deviceId) return availableDevices[0] || null;
  return availableDevices.find((device) => device.id === assignment.deviceId) || null;
}

function channelMapForAssignment(assignment: TrackRecordingInput): number[] {
  if (assignment.mode === "stereo") return [...(assignment.channelPair || [0, 1])];
  return [assignment.channelIndex ?? 0];
}

function labelForAssignment(assignment: TrackRecordingInput, channelMap: number[]): string {
  if (assignment.mode === "stereo") return `Stereo Ch ${channelMap[0] + 1}-${channelMap[1] + 1}`;
  if (assignment.mode === "split-mono") return `Split Mono Ch ${channelMap[0] + 1}`;
  return `Mono Ch ${channelMap[0] + 1}`;
}

function neededChannelLabel(channelMap: number[]): string {
  if (channelMap.length === 1) return `channel ${channelMap[0] + 1}`;
  return `channels ${channelMap[0] + 1}-${channelMap[channelMap.length - 1] + 1}`;
}

function duplicateChannelErrors(capturePlan: RecordingInputCapturePlanItem[], tracks: Track[]): string[] {
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const owners = new Map<string, string>();
  const errors: string[] = [];
  capturePlan.forEach((item) => {
    const allowDuplicate = trackById.get(item.trackId)?.recordingInput?.allowDuplicateChannels === true;
    item.channelMap.forEach((channel) => {
      const key = `${item.deviceId || "default"}:${channel}`;
      const existing = owners.get(key);
      if (existing && !allowDuplicate) {
        errors.push(`Recording channel ${channel + 1} is assigned to both ${existing} and ${item.trackName}.`);
        return;
      }
      owners.set(key, item.trackName);
    });
  });
  return errors;
}

function isRecordCapableTrack(track: Track): boolean {
  return !!track.recordKind && track.recordKind !== "none";
}

function fallbackInputChannelCount(project: PocketDawProject): number {
  const count = Number(project.audioDeviceSettings.inputChannels || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function maxSupportedChannels(values: number[] | undefined): number | undefined {
  const channels = (values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return channels.length ? Math.max(...channels) : undefined;
}

function safeChannel(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
}
