import { cloneProject } from "./dawProject";
import { addTrackToProject } from "./tracks";
import {
  MAX_HOSTED_PLUGIN_STATE_BYTES,
  type DrumRackDevice,
  type DrumRackPad,
  type HostedPluginStateSnapshot,
  type InstrumentDevice,
  type PocketDawProject,
  type SamplerDevice,
  type SamplerEnvelope
} from "./schema";

export const DRUM_RACK_FIRST_NOTE = 36;
export const DRUM_RACK_PAD_COUNT = 16;
export const DEFAULT_SAMPLER_ENVELOPE: Readonly<SamplerEnvelope> = {
  attackSeconds: 0.005,
  decaySeconds: 0.08,
  sustainLevel: 1,
  releaseSeconds: 0.12
};

export type SamplerParameter =
  | "rootNote"
  | "keyTracking"
  | "coarseTune"
  | "fineTuneCents"
  | "gain"
  | "pan"
  | "startPosition"
  | "endPosition"
  | "reverse"
  | "playbackMode"
  | "loopStartPosition"
  | "loopEndPosition";

export type SamplerEnvelopeParameter = keyof SamplerEnvelope;
export type DrumRackPadParameter =
  | "name"
  | "gain"
  | "pan"
  | "coarseTune"
  | "fineTuneCents"
  | "startPosition"
  | "endPosition"
  | "reverse"
  | "playbackMode"
  | "mute"
  | "solo"
  | "chokeGroup";

export interface DeviceTrackResult {
  project: PocketDawProject;
  trackId: string;
  deviceId: string;
}

export function createQuickSamplerDevice(
  mediaPoolItemId: string,
  options: { id?: string; name?: string } = {}
): SamplerDevice {
  return {
    id: safeId(options.id, "sampler"),
    type: "quick-sampler",
    name: cleanName(options.name, "Quick Sampler"),
    enabled: true,
    mediaPoolItemId: safeId(mediaPoolItemId, "media"),
    rootNote: 60,
    keyTracking: true,
    coarseTune: 0,
    fineTuneCents: 0,
    gain: 1,
    pan: 0,
    startPosition: 0,
    endPosition: 1,
    reverse: false,
    playbackMode: "one-shot",
    loopStartPosition: 0,
    loopEndPosition: 1,
    envelope: { ...DEFAULT_SAMPLER_ENVELOPE }
  };
}

export function createDrumRackDevice(
  mediaPoolItemIds: readonly string[] = [],
  options: { id?: string; name?: string; sampleNames?: readonly string[] } = {}
): DrumRackDevice {
  return {
    id: safeId(options.id, "drum-rack"),
    type: "drum-rack",
    name: cleanName(options.name, "Drum Rack"),
    enabled: true,
    pads: Array.from({ length: DRUM_RACK_PAD_COUNT }, (_, index) => createDrumRackPad(
      index,
      mediaPoolItemIds[index],
      options.sampleNames?.[index]
    ))
  };
}

export function createQuickSamplerTrack(
  project: PocketDawProject,
  mediaPoolItemId: string,
  name?: string
): DeviceTrackResult | null {
  if (!project.mediaPool.some((item) => item.id === mediaPoolItemId && item.kind === "audio")) return null;
  const added = addTrackToProject(project, "midi-instrument");
  const mediaName = project.mediaPool.find((item) => item.id === mediaPoolItemId)?.name || "Sample";
  const device = createQuickSamplerDevice(mediaPoolItemId, {
    id: uniqueDeviceId(added.project, "sampler"),
    name: name || mediaName
  });
  const attached = replaceTrackInstrumentDevice(added.project, added.trackId, device);
  const track = attached.tracks.find((item) => item.id === added.trackId);
  if (track) track.name = cleanName(name, `${mediaName} Sampler`);
  return { project: attached, trackId: added.trackId, deviceId: device.id };
}

export function createDrumRackTrack(
  project: PocketDawProject,
  mediaPoolItemIds: readonly string[],
  name = "Drum Rack"
): DeviceTrackResult | null {
  const validIds = mediaPoolItemIds
    .filter((id, index) => mediaPoolItemIds.indexOf(id) === index)
    .filter((id) => project.mediaPool.some((item) => item.id === id && item.kind === "audio"))
    .slice(0, DRUM_RACK_PAD_COUNT);
  if (!validIds.length) return null;
  const added = addTrackToProject(project, "midi-instrument");
  const sampleNames = validIds.map((id) => project.mediaPool.find((item) => item.id === id)?.name || "Sample");
  const device = createDrumRackDevice(validIds, {
    id: uniqueDeviceId(added.project, "drum-rack"),
    name,
    sampleNames
  });
  const attached = replaceTrackInstrumentDevice(added.project, added.trackId, device);
  const track = attached.tracks.find((item) => item.id === added.trackId);
  if (track) track.name = cleanName(name, "Drum Rack");
  return { project: attached, trackId: added.trackId, deviceId: device.id };
}

export function replaceTrackInstrumentDevice(
  project: PocketDawProject,
  trackId: string,
  device: InstrumentDevice
): PocketDawProject {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track || track.trackType !== "midi" || !deviceReferencesValidMedia(project, device)) return project;
  const next = cloneProject(project);
  const nextTrack = next.tracks.find((item) => item.id === trackId)!;
  const oldDeviceId = nextTrack.instrumentDeviceId;
  const uniqueId = uniqueDeviceId(next, device.id || "device", oldDeviceId);
  const cleanDevice = cloneDevice(device);
  cleanDevice.id = uniqueId;
  const existingIndex = next.devices.findIndex((item) => item.id === oldDeviceId);
  if (existingIndex >= 0) next.devices.splice(existingIndex, 1, cleanDevice);
  else next.devices.push(cleanDevice);
  nextTrack.instrumentDeviceId = cleanDevice.id;
  if (oldDeviceId && oldDeviceId !== cleanDevice.id && !next.tracks.some((item) => item.id !== trackId && item.instrumentDeviceId === oldDeviceId)) {
    removeDeviceDataInPlace(next, oldDeviceId);
  }
  return next;
}

export function removeInstrumentDevice(project: PocketDawProject, deviceId: string): PocketDawProject {
  if (!project.devices.some((item) => item.id === deviceId)) return project;
  const next = cloneProject(project);
  next.tracks.forEach((track) => {
    if (track.instrumentDeviceId === deviceId) delete track.instrumentDeviceId;
  });
  removeDeviceDataInPlace(next, deviceId);
  return next;
}

export function setInstrumentDeviceEnabled(project: PocketDawProject, deviceId: string, enabled: boolean): PocketDawProject {
  const current = project.devices.find((item) => item.id === deviceId);
  if (!current || current.enabled === enabled) return project;
  const next = cloneProject(project);
  next.devices.find((item) => item.id === deviceId)!.enabled = enabled;
  return next;
}

export function setSamplerParameter(
  project: PocketDawProject,
  deviceId: string,
  parameter: SamplerParameter,
  value: number | boolean | string
): PocketDawProject {
  const current = project.devices.find((item): item is SamplerDevice => item.id === deviceId && item.type === "quick-sampler");
  if (!current) return project;
  const next = cloneProject(project);
  const sampler = next.devices.find((item): item is SamplerDevice => item.id === deviceId && item.type === "quick-sampler")!;
  applySamplerParameter(sampler, parameter, value);
  normalizeSamplerRanges(sampler);
  return next;
}

export function setSamplerEnvelopeParameter(
  project: PocketDawProject,
  deviceId: string,
  parameter: SamplerEnvelopeParameter,
  value: number
): PocketDawProject {
  const current = project.devices.find((item): item is SamplerDevice => item.id === deviceId && item.type === "quick-sampler");
  if (!current) return project;
  const next = cloneProject(project);
  const sampler = next.devices.find((item): item is SamplerDevice => item.id === deviceId && item.type === "quick-sampler")!;
  sampler.envelope[parameter] = parameter === "sustainLevel" ? clamp(value, 0, 1, 1) : clamp(value, 0, 60, 0);
  return next;
}

export function setDrumRackPadParameter(
  project: PocketDawProject,
  deviceId: string,
  padIndex: number,
  parameter: DrumRackPadParameter,
  value: number | boolean | string | null
): PocketDawProject {
  const current = project.devices.find((item): item is DrumRackDevice => item.id === deviceId && item.type === "drum-rack");
  if (!current || !current.pads[padIndex]) return project;
  const next = cloneProject(project);
  const pad = next.devices.find((item): item is DrumRackDevice => item.id === deviceId && item.type === "drum-rack")!.pads[padIndex];
  applyDrumPadParameter(pad, parameter, value);
  normalizePadRanges(pad);
  return next;
}

export function mapDrumRackPadSample(
  project: PocketDawProject,
  deviceId: string,
  padIndex: number,
  mediaPoolItemId: string | null,
  name?: string
): PocketDawProject {
  const current = project.devices.find((item): item is DrumRackDevice => item.id === deviceId && item.type === "drum-rack");
  if (!current || !current.pads[padIndex]) return project;
  if (mediaPoolItemId && !project.mediaPool.some((item) => item.id === mediaPoolItemId && item.kind === "audio")) return project;
  const next = cloneProject(project);
  const pad = next.devices.find((item): item is DrumRackDevice => item.id === deviceId && item.type === "drum-rack")!.pads[padIndex];
  if (mediaPoolItemId) pad.mediaPoolItemId = mediaPoolItemId;
  else delete pad.mediaPoolItemId;
  if (name !== undefined) pad.name = cleanName(name, `Pad ${padIndex + 1}`);
  return next;
}

export function setHostedPluginStateSnapshot(
  project: PocketDawProject,
  deviceId: string,
  snapshot: HostedPluginStateSnapshot
): PocketDawProject {
  const current = project.devices.find((item) => item.id === deviceId && item.type === "vst3-instrument");
  if (!current || !validHostedPluginState(snapshot)) return project;
  const next = cloneProject(project);
  const device = next.devices.find((item) => item.id === deviceId && item.type === "vst3-instrument");
  if (device?.type === "vst3-instrument") device.hostedPluginState = { ...snapshot };
  return next;
}

export function validHostedPluginState(value: unknown): value is HostedPluginStateSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<HostedPluginStateSnapshot>;
  return state.encoding === "gzip-base64" &&
    typeof state.data === "string" &&
    /^[a-f0-9]{64}$/i.test(String(state.checksum || "")) &&
    Number.isInteger(state.sizeBytes) &&
    Number(state.sizeBytes) >= 0 &&
    Number(state.sizeBytes) <= MAX_HOSTED_PLUGIN_STATE_BYTES &&
    state.data.length <= Math.ceil(MAX_HOSTED_PLUGIN_STATE_BYTES * 4 / 3) + 4;
}

export function deviceAutomationTargetPath(deviceId: string, stableParameterId: string): string {
  return `device:${safeId(deviceId, "device")}:parameter:${safeId(stableParameterId, "parameter")}`;
}

function createDrumRackPad(index: number, mediaPoolItemId?: string, name?: string): DrumRackPad {
  const midiNote = DRUM_RACK_FIRST_NOTE + index;
  return {
    id: `pad-${midiNote}`,
    midiNote,
    name: cleanName(name, `Pad ${index + 1}`),
    ...(mediaPoolItemId ? { mediaPoolItemId: safeId(mediaPoolItemId, "media") } : {}),
    gain: 1,
    pan: 0,
    coarseTune: 0,
    fineTuneCents: 0,
    startPosition: 0,
    endPosition: 1,
    reverse: false,
    playbackMode: "one-shot",
    mute: false,
    solo: false,
    chokeGroup: midiNote === 42 || midiNote === 46 ? "hats" : null
  };
}

function applySamplerParameter(device: SamplerDevice, parameter: SamplerParameter, value: number | boolean | string) {
  if (parameter === "rootNote") device.rootNote = Math.round(clamp(value, 0, 127, 60));
  else if (parameter === "keyTracking") device.keyTracking = value === true;
  else if (parameter === "coarseTune") device.coarseTune = Math.round(clamp(value, -48, 48, 0));
  else if (parameter === "fineTuneCents") device.fineTuneCents = clamp(value, -100, 100, 0);
  else if (parameter === "gain") device.gain = clamp(value, 0, 4, 1);
  else if (parameter === "pan") device.pan = clamp(value, -1, 1, 0);
  else if (parameter === "startPosition") device.startPosition = clamp(value, 0, 1, 0);
  else if (parameter === "endPosition") device.endPosition = clamp(value, 0, 1, 1);
  else if (parameter === "reverse") device.reverse = value === true;
  else if (parameter === "playbackMode") device.playbackMode = value === "gate" || value === "loop" ? value : "one-shot";
  else if (parameter === "loopStartPosition") device.loopStartPosition = clamp(value, 0, 1, 0);
  else if (parameter === "loopEndPosition") device.loopEndPosition = clamp(value, 0, 1, 1);
}

function applyDrumPadParameter(pad: DrumRackPad, parameter: DrumRackPadParameter, value: number | boolean | string | null) {
  if (parameter === "name") pad.name = cleanName(value, pad.name);
  else if (parameter === "gain") pad.gain = clamp(value, 0, 4, 1);
  else if (parameter === "pan") pad.pan = clamp(value, -1, 1, 0);
  else if (parameter === "coarseTune") pad.coarseTune = Math.round(clamp(value, -48, 48, 0));
  else if (parameter === "fineTuneCents") pad.fineTuneCents = clamp(value, -100, 100, 0);
  else if (parameter === "startPosition") pad.startPosition = clamp(value, 0, 1, 0);
  else if (parameter === "endPosition") pad.endPosition = clamp(value, 0, 1, 1);
  else if (parameter === "reverse") pad.reverse = value === true;
  else if (parameter === "playbackMode") pad.playbackMode = value === "gate" ? "gate" : "one-shot";
  else if (parameter === "mute") pad.mute = value === true;
  else if (parameter === "solo") pad.solo = value === true;
  else if (parameter === "chokeGroup") pad.chokeGroup = value === null ? null : cleanName(value, "").slice(0, 32) || null;
}

function normalizeSamplerRanges(device: SamplerDevice) {
  device.startPosition = Math.min(0.999, Math.max(0, device.startPosition));
  if (device.endPosition <= device.startPosition) device.endPosition = device.startPosition + 0.001;
  device.loopStartPosition = Math.max(device.startPosition, Math.min(device.loopStartPosition, device.endPosition - 0.001));
  device.loopEndPosition = Math.min(device.endPosition, Math.max(device.loopEndPosition, device.loopStartPosition + 0.001));
}

function normalizePadRanges(pad: DrumRackPad) {
  pad.startPosition = Math.min(0.999, Math.max(0, pad.startPosition));
  if (pad.endPosition <= pad.startPosition) pad.endPosition = pad.startPosition + 0.001;
}

function deviceReferencesValidMedia(project: PocketDawProject, device: InstrumentDevice): boolean {
  const mediaIds = new Set(project.mediaPool.filter((item) => item.kind === "audio").map((item) => item.id));
  if (device.type === "quick-sampler") return mediaIds.has(device.mediaPoolItemId);
  if (device.type === "drum-rack") return device.pads.every((pad) => !pad.mediaPoolItemId || mediaIds.has(pad.mediaPoolItemId));
  return true;
}

function removeDeviceDataInPlace(project: PocketDawProject, deviceId: string) {
  project.devices = project.devices.filter((item) => item.id !== deviceId);
  const prefix = `device:${deviceId}:parameter:`;
  const removedLaneIds = new Set(project.automation.lanes.filter((lane) => lane.targetPath.startsWith(prefix)).map((lane) => lane.id));
  project.automation.lanes = project.automation.lanes.filter((lane) => !removedLaneIds.has(lane.id));
  project.tracks.forEach((track) => {
    track.automationLaneIds = track.automationLaneIds.filter((id) => !removedLaneIds.has(id));
  });
}

function cloneDevice<T extends InstrumentDevice>(device: T): T {
  return JSON.parse(JSON.stringify(device)) as T;
}

function uniqueDeviceId(project: PocketDawProject, preferred: string, replacingId?: string): string {
  const used = new Set(project.devices.filter((item) => item.id !== replacingId).map((item) => item.id));
  const base = safeId(preferred, "device");
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function safeId(value: unknown, fallback: string): string {
  return String(value || "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;
}

function cleanName(value: unknown, fallback: string): string {
  return (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, 96) || fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
