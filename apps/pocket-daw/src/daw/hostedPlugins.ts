import { createAutomationLane, deviceParameterAutomationPath, fxParameterAutomationPath } from "./automation";
import { cloneProject } from "./dawProject";
import { ensureProjectFx } from "./fx";
import { addTrackToProject } from "./tracks";
import {
  MAX_HOSTED_PLUGIN_STATE_BYTES,
  MAX_HOSTED_PLUGIN_LATENCY_SAMPLES,
  MAX_HOSTED_PLUGIN_TAIL_SAMPLES,
  type FxPluginInstance,
  type HostedPluginFactoryProgram,
  type HostedPluginIdentity,
  type HostedPluginParameterDescriptor,
  type HostedPluginPocketPreset,
  type HostedPluginProjectMetadata,
  type HostedPluginStateSnapshot,
  type HostedPluginDevice,
  type JsonObject,
  type PocketDawProject
} from "./schema";

export interface VerifiedHostedPluginDescriptor {
  verified: true;
  identity: HostedPluginIdentity;
  supportsInstrumentRole: boolean;
  supportsEffectRole: boolean;
  reportedLatencySamples: number;
  reportedTailSamples: number;
  parameterDescriptors: HostedPluginParameterDescriptor[];
  factoryPrograms: HostedPluginFactoryProgram[];
}

export interface HostedPluginInsertResult {
  project: PocketDawProject;
  instanceId: string;
  trackId: string;
  chainId?: string;
}

export interface HostedPluginRuntimeMetadata {
  parameterDescriptors: HostedPluginParameterDescriptor[];
  factoryPrograms: HostedPluginFactoryProgram[];
  selectedFactoryProgramId?: string;
  latencySamples: number;
  tailSamples: number;
}

export interface HostedPluginStateValidationResult {
  valid: boolean;
  compressedBytes: number;
  checksumSha256: string;
}

export function createHostedPluginInstrumentTrack(
  project: PocketDawProject,
  descriptor: VerifiedHostedPluginDescriptor
): HostedPluginInsertResult | null {
  if (!descriptor.verified || !descriptor.supportsInstrumentRole) return null;
  const added = addTrackToProject(project, "midi-instrument");
  const next = cloneProject(added.project);
  const track = next.tracks.find((item) => item.id === added.trackId);
  if (!track || track.trackType !== "midi") return null;
  const id = uniqueProjectId(next, `vst3-${descriptor.identity.name}`, "device");
  const device: HostedPluginDevice = {
    id,
    type: "vst3-instrument",
    name: cleanName(descriptor.identity.name, "VST3 Instrument"),
    enabled: true,
    hostedPlugin: cleanIdentity(descriptor.identity),
    hostedPluginMetadata: metadataFromDescriptor(descriptor),
    parameters: defaultParameterValues(descriptor.parameterDescriptors)
  };
  next.devices.push(device);
  track.instrumentDeviceId = id;
  track.name = device.name;
  return { project: next, instanceId: id, trackId: track.id };
}

export function addHostedPluginEffect(
  project: PocketDawProject,
  trackId: string,
  descriptor: VerifiedHostedPluginDescriptor
): HostedPluginInsertResult | null {
  if (!descriptor.verified || !descriptor.supportsEffectRole) return null;
  const prepared = ensureProjectFx(project);
  const next = cloneProject(prepared);
  const track = next.tracks.find((item) => item.id === trackId);
  const chain = track?.fxChainId ? next.fx.chains.find((item) => item.id === track.fxChainId) : null;
  if (!track || track.trackType === "folder" || !chain) return null;
  const id = uniqueProjectId(next, `vst3-fx-${descriptor.identity.name}`, "slot");
  const slot: FxPluginInstance = {
    id,
    type: "vst3-effect",
    name: cleanName(descriptor.identity.name, "VST3 Effect"),
    enabled: true,
    parameters: defaultParameterValues(descriptor.parameterDescriptors),
    hostedPlugin: cleanIdentity(descriptor.identity),
    hostedPluginMetadata: metadataFromDescriptor(descriptor)
  };
  chain.slots.push(slot);
  return { project: next, instanceId: id, trackId, chainId: chain.id };
}

export function substituteHostedPlugin(
  project: PocketDawProject,
  instanceId: string,
  descriptor: VerifiedHostedPluginDescriptor
): PocketDawProject {
  if (!descriptor.verified) return project;
  const device = project.devices.find((item): item is HostedPluginDevice => item.id === instanceId && item.type === "vst3-instrument");
  if (device) {
    if (!descriptor.supportsInstrumentRole) return project;
    const next = cloneProject(project);
    const target = next.devices.find((item) => item.id === instanceId && item.type === "vst3-instrument") as HostedPluginDevice;
    target.name = cleanName(descriptor.identity.name, target.name);
    target.hostedPlugin = cleanIdentity(descriptor.identity);
    target.parameters = mergedParameterValues(target.parameters, descriptor.parameterDescriptors);
    target.hostedPluginMetadata = metadataFromDescriptor(descriptor, target.hostedPluginMetadata);
    return next;
  }
  for (const chain of project.fx.chains) {
    const slot = chain.slots.find((item) => item.id === instanceId && item.hostedPlugin);
    if (!slot) continue;
    if (!descriptor.supportsEffectRole) return project;
    const next = cloneProject(project);
    const target = next.fx.chains.find((item) => item.id === chain.id)!.slots.find((item) => item.id === instanceId)!;
    target.name = cleanName(descriptor.identity.name, target.name);
    target.hostedPlugin = cleanIdentity(descriptor.identity);
    target.parameters = mergedParameterValues(target.parameters, descriptor.parameterDescriptors);
    target.hostedPluginMetadata = metadataFromDescriptor(descriptor, target.hostedPluginMetadata);
    return next;
  }
  return project;
}

export function setHostedInstrumentParameter(project: PocketDawProject, instanceId: string, stableId: string, value: number): PocketDawProject {
  const device = project.devices.find((item): item is HostedPluginDevice => item.id === instanceId && item.type === "vst3-instrument");
  if (!device || !safeStableId(stableId)) return project;
  const descriptor = device.hostedPluginMetadata?.parameterDescriptors.find((item) => item.stableId === stableId);
  if (descriptor?.readOnly) return project;
  const next = cloneProject(project);
  const target = next.devices.find((item) => item.id === instanceId && item.type === "vst3-instrument") as HostedPluginDevice;
  target.parameters[stableId] = clamp(value, descriptor?.min ?? 0, descriptor?.max ?? 1);
  return next;
}

export function setHostedEffectParameter(project: PocketDawProject, chainId: string, slotId: string, stableId: string, value: number): PocketDawProject {
  if (!safeStableId(stableId)) return project;
  const slot = project.fx.chains.find((item) => item.id === chainId)?.slots.find((item) => item.id === slotId && item.hostedPlugin);
  if (!slot) return project;
  const descriptor = slot.hostedPluginMetadata?.parameterDescriptors.find((item) => item.stableId === stableId);
  if (descriptor?.readOnly) return project;
  const next = cloneProject(project);
  const target = next.fx.chains.find((item) => item.id === chainId)!.slots.find((item) => item.id === slotId)!;
  target.parameters[stableId] = clamp(value, descriptor?.min ?? 0, descriptor?.max ?? 1);
  return next;
}

export function ensureHostedInstrumentAutomationLane(
  project: PocketDawProject,
  instanceId: string,
  stableId: string
): { project: PocketDawProject; laneId: string } | null {
  const device = project.devices.find((item): item is HostedPluginDevice => item.id === instanceId && item.type === "vst3-instrument");
  const descriptor = device?.hostedPluginMetadata?.parameterDescriptors.find((item) => item.stableId === stableId);
  const value = Number(device?.parameters[stableId]);
  if (!device || descriptor?.automatable === false || !Number.isFinite(value)) return null;
  const targetPath = deviceParameterAutomationPath(instanceId, stableId);
  const existing = project.automation.lanes.find((lane) => lane.targetPath === targetPath);
  if (existing) return { project, laneId: existing.id };
  return createAutomationLane(project, targetPath, {
    min: descriptor?.min ?? 0,
    max: descriptor?.max ?? 1,
    points: [{ bar: 1, value, curve: "linear" }]
  });
}

export function ensureHostedEffectAutomationLane(project: PocketDawProject, chainId: string, slotId: string, stableId: string) {
  const slot = project.fx.chains.find((item) => item.id === chainId)?.slots.find((item) => item.id === slotId && item.hostedPlugin);
  const descriptor = slot?.hostedPluginMetadata?.parameterDescriptors.find((item) => item.stableId === stableId);
  const value = Number(slot?.parameters[stableId]);
  if (!slot || descriptor?.automatable === false || !Number.isFinite(value)) return null;
  const targetPath = fxParameterAutomationPath(chainId, slotId, stableId);
  const existing = project.automation.lanes.find((lane) => lane.targetPath === targetPath);
  if (existing) return { project, laneId: existing.id };
  return createAutomationLane(project, targetPath, {
    min: descriptor?.min ?? 0,
    max: descriptor?.max ?? 1,
    points: [{ bar: 1, value, curve: "linear" }]
  });
}

export function setHostedPluginSnapshot(
  project: PocketDawProject,
  instanceId: string,
  snapshot: HostedPluginStateSnapshot,
  validation: HostedPluginStateValidationResult
): PocketDawProject {
  if (!validHostedStateSnapshot(snapshot) || !validation.valid ||
      validation.compressedBytes !== snapshot.sizeBytes ||
      validation.checksumSha256.toLowerCase() !== snapshot.checksum.toLowerCase()) return project;
  const next = cloneProject(project);
  const device = next.devices.find((item) => item.id === instanceId && item.type === "vst3-instrument");
  if (device?.type === "vst3-instrument") {
    device.hostedPluginState = { ...snapshot };
    return next;
  }
  const slot = next.fx.chains.flatMap((chain) => chain.slots).find((item) => item.id === instanceId && item.hostedPlugin);
  if (!slot) return project;
  slot.hostedPluginState = { ...snapshot };
  return next;
}

export function saveHostedPocketPreset(
  project: PocketDawProject,
  instanceId: string,
  name: string,
  createdAt = new Date().toISOString()
): PocketDawProject {
  const target = hostedProjectTarget(project, instanceId);
  if (!target) return project;
  const presetName = cleanName(name, "Pocket Preset");
  const preset: HostedPluginPocketPreset = {
    id: uniquePresetId(target.metadata?.pocketPresets || [], presetName),
    name: presetName,
    createdAt,
    parameters: { ...target.parameters },
    ...(target.snapshot ? { hostedPluginState: { ...target.snapshot } } : {})
  };
  const next = cloneProject(project);
  updateHostedProjectTarget(next, instanceId, (parameters, metadata) => {
    metadata.pocketPresets.push(preset);
    metadata.selectedPocketPresetId = preset.id;
    Object.assign(parameters, preset.parameters);
  });
  return next;
}

export function applyHostedPocketPreset(project: PocketDawProject, instanceId: string, presetId: string): PocketDawProject {
  const target = hostedProjectTarget(project, instanceId);
  const preset = target?.metadata?.pocketPresets.find((item) => item.id === presetId);
  if (!target || !preset) return project;
  const next = cloneProject(project);
  updateHostedProjectTarget(next, instanceId, (parameters, metadata, setSnapshot) => {
    Object.keys(parameters).forEach((key) => delete parameters[key]);
    Object.assign(parameters, preset.parameters);
    metadata.selectedPocketPresetId = preset.id;
    setSnapshot(preset.hostedPluginState);
  });
  return next;
}

export function selectHostedFactoryProgram(project: PocketDawProject, instanceId: string, programId: string): PocketDawProject {
  const target = hostedProjectTarget(project, instanceId);
  if (!target?.metadata?.factoryPrograms.some((item) => item.id === programId)) return project;
  const next = cloneProject(project);
  updateHostedProjectTarget(next, instanceId, (_parameters, metadata) => {
    metadata.selectedFactoryProgramId = programId;
    delete metadata.selectedPocketPresetId;
  });
  return next;
}

export function mergeHostedPluginRuntimeMetadata(
  project: PocketDawProject,
  instanceId: string,
  runtime: HostedPluginRuntimeMetadata
): PocketDawProject {
  if (!hostedProjectTarget(project, instanceId)) return project;
  const descriptors = runtime.parameterDescriptors.map(cleanParameterDescriptor).filter(Boolean) as HostedPluginParameterDescriptor[];
  const programs = runtime.factoryPrograms
    .map((item) => ({ id: cleanFactoryProgramId(item.id), name: cleanName(item.name, "Program") }))
    .filter((item) => item.id);
  const next = cloneProject(project);
  updateHostedProjectTarget(next, instanceId, (parameters, metadata) => {
    const merged = mergedParameterValues(parameters, descriptors);
    Object.keys(parameters).forEach((key) => delete parameters[key]);
    Object.assign(parameters, merged);
    metadata.parameterDescriptors = descriptors;
    metadata.factoryPrograms = programs;
    metadata.lastKnownLatencySamples = boundedTimingSamples(runtime.latencySamples, MAX_HOSTED_PLUGIN_LATENCY_SAMPLES);
    metadata.lastKnownTailSamples = boundedTimingSamples(runtime.tailSamples, MAX_HOSTED_PLUGIN_TAIL_SAMPLES);
    const selected = cleanFactoryProgramId(runtime.selectedFactoryProgramId);
    if (selected && programs.some((item) => item.id === selected)) metadata.selectedFactoryProgramId = selected;
    else if (metadata.selectedFactoryProgramId && !programs.some((item) => item.id === metadata.selectedFactoryProgramId)) {
      delete metadata.selectedFactoryProgramId;
    }
  });
  return next;
}

export function validHostedStateSnapshot(snapshot: HostedPluginStateSnapshot): boolean {
  const encoded = String(snapshot.data || "");
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decodedBytes = encoded.length ? encoded.length / 4 * 3 - padding : 0;
  return snapshot.encoding === "gzip-base64" &&
    /^[a-f0-9]{64}$/i.test(snapshot.checksum) &&
    Number.isInteger(snapshot.sizeBytes) && snapshot.sizeBytes >= 0 && snapshot.sizeBytes <= MAX_HOSTED_PLUGIN_STATE_BYTES &&
    encoded.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) &&
    decodedBytes === snapshot.sizeBytes && encoded.length <= Math.ceil(MAX_HOSTED_PLUGIN_STATE_BYTES * 4 / 3) + 4;
}

function metadataFromDescriptor(
  descriptor: VerifiedHostedPluginDescriptor,
  previous?: HostedPluginProjectMetadata
): HostedPluginProjectMetadata {
  return {
    parameterDescriptors: descriptor.parameterDescriptors.map(cleanParameterDescriptor).filter(Boolean) as HostedPluginParameterDescriptor[],
    factoryPrograms: descriptor.factoryPrograms.map((item) => ({ id: cleanFactoryProgramId(item.id), name: cleanName(item.name, "Program") })).filter((item) => item.id),
    pocketPresets: previous?.pocketPresets.map((preset) => ({ ...preset, parameters: { ...preset.parameters } })) || [],
    ...(previous?.selectedPocketPresetId ? { selectedPocketPresetId: previous.selectedPocketPresetId } : {}),
    lastKnownLatencySamples: boundedTimingSamples(descriptor.reportedLatencySamples, MAX_HOSTED_PLUGIN_LATENCY_SAMPLES),
    lastKnownTailSamples: boundedTimingSamples(descriptor.reportedTailSamples, MAX_HOSTED_PLUGIN_TAIL_SAMPLES)
  };
}

function cleanParameterDescriptor(parameter: HostedPluginParameterDescriptor): HostedPluginParameterDescriptor | null {
  const stableId = safeStableId(parameter.stableId);
  if (!stableId) return null;
  const min = finite(parameter.min, 0);
  const max = Math.max(min, finite(parameter.max, 1));
  return {
    stableId,
    name: cleanName(parameter.name, stableId),
    ...(parameter.shortLabel ? { shortLabel: cleanName(parameter.shortLabel, stableId).slice(0, 32) } : {}),
    ...(parameter.unit ? { unit: cleanName(parameter.unit, "").slice(0, 16) } : {}),
    min,
    max,
    defaultValue: clamp(parameter.defaultValue, min, max),
    ...(Number.isInteger(parameter.stepCount) && Number(parameter.stepCount) >= 1 ? { stepCount: Math.min(1_000_000, Number(parameter.stepCount)) } : {}),
    automatable: parameter.automatable !== false,
    ...(parameter.readOnly ? { readOnly: true } : {})
  };
}

function defaultParameterValues(parameters: HostedPluginParameterDescriptor[]): JsonObject {
  return Object.fromEntries(parameters.map(cleanParameterDescriptor).filter(Boolean).map((parameter) => [parameter!.stableId, parameter!.defaultValue]));
}

function mergedParameterValues(previous: JsonObject, parameters: HostedPluginParameterDescriptor[]): JsonObject {
  const next = defaultParameterValues(parameters);
  parameters.map(cleanParameterDescriptor).filter(Boolean).forEach((parameter) => {
    const value = Number(previous[parameter!.stableId]);
    if (Number.isFinite(value)) next[parameter!.stableId] = clamp(value, parameter!.min, parameter!.max);
  });
  return next;
}

function cleanIdentity(identity: HostedPluginIdentity): HostedPluginIdentity {
  return {
    format: "vst3",
    classId: cleanName(identity.classId, "unknown").slice(0, 128),
    vendor: cleanName(identity.vendor, "Unknown vendor"),
    name: cleanName(identity.name, "Unknown plug-in"),
    version: cleanName(identity.version, "Unknown"),
    category: cleanName(identity.category, "Unknown"),
    moduleFilename: cleanName(identity.moduleFilename.split(/[\\/]/).pop(), "Unknown.vst3"),
    binaryFingerprint: String(identity.binaryFingerprint || "").replace(/[^a-f0-9]/gi, "").slice(0, 128)
  };
}

function hostedProjectTarget(project: PocketDawProject, instanceId: string): { parameters: JsonObject; metadata?: HostedPluginProjectMetadata; snapshot?: HostedPluginStateSnapshot } | null {
  const device = project.devices.find((item): item is HostedPluginDevice => item.id === instanceId && item.type === "vst3-instrument");
  if (device?.type === "vst3-instrument") return { parameters: device.parameters, metadata: device.hostedPluginMetadata, snapshot: device.hostedPluginState };
  const slot = project.fx.chains.flatMap((chain) => chain.slots).find((item) => item.id === instanceId && item.hostedPlugin);
  return slot ? { parameters: slot.parameters, metadata: slot.hostedPluginMetadata, snapshot: slot.hostedPluginState } : null;
}

function updateHostedProjectTarget(
  project: PocketDawProject,
  instanceId: string,
  update: (parameters: JsonObject, metadata: HostedPluginProjectMetadata, setSnapshot: (snapshot?: HostedPluginStateSnapshot) => void) => void
) {
  const device = project.devices.find((item): item is HostedPluginDevice => item.id === instanceId && item.type === "vst3-instrument");
  if (device?.type === "vst3-instrument") {
    device.hostedPluginMetadata ||= { parameterDescriptors: [], factoryPrograms: [], pocketPresets: [] };
    update(device.parameters, device.hostedPluginMetadata, (snapshot) => {
      if (snapshot) device.hostedPluginState = { ...snapshot };
      else delete device.hostedPluginState;
    });
    return;
  }
  const slot = project.fx.chains.flatMap((chain) => chain.slots).find((item) => item.id === instanceId && item.hostedPlugin);
  if (!slot) return;
  slot.hostedPluginMetadata ||= { parameterDescriptors: [], factoryPrograms: [], pocketPresets: [] };
  update(slot.parameters, slot.hostedPluginMetadata, (snapshot) => {
    if (snapshot) slot.hostedPluginState = { ...snapshot };
    else delete slot.hostedPluginState;
  });
}

function uniqueProjectId(project: PocketDawProject, preferred: string, prefix: string): string {
  const used = new Set([
    ...project.devices.map((item) => item.id),
    ...project.fx.chains.flatMap((chain) => chain.slots.map((slot) => slot.id))
  ]);
  const base = `${prefix}-${safeStableId(preferred) || "vst3"}`.slice(0, 80);
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function uniquePresetId(presets: HostedPluginPocketPreset[], name: string): string {
  const used = new Set(presets.map((item) => item.id));
  const base = `preset-${safeStableId(name) || "pocket"}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function safeStableId(value: unknown): string {
  return String(value || "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96);
}

function cleanFactoryProgramId(value: unknown): string {
  const text = String(value || "");
  const nativeId = text.match(/^(-?\d+):(-?\d+)$/);
  return nativeId ? `${Number(nativeId[1])}:${Number(nativeId[2])}` : safeStableId(text);
}

function cleanName(value: unknown, fallback: string): string {
  return (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, 96) || fallback;
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: unknown, min: number, max: number): number {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.round(finite(value, 0)));
}

function boundedTimingSamples(value: unknown, maximum: number): number {
  return Math.min(maximum, nonNegativeInteger(value));
}
