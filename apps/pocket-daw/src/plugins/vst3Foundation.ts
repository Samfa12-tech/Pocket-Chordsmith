export const VST3_HOST_PROTOCOL_VERSION = 2 as const;
export const VST3_STATE_LIMIT_BYTES = 32 * 1024 * 1024;
export const VST3_SCAN_TIMEOUT_MS = 20_000;

export type Vst3QuarantineReason =
  | "crash"
  | "timeout"
  | "invalidDescriptor"
  | "unsupportedArchitecture"
  | "loadFailure";

export interface HostedPluginIdentity {
  format: "vst3";
  classId: string;
  vendor: string;
  name: string;
  version: string;
  category: string;
  moduleFilename: string;
  binaryFingerprint: string;
}

export interface Vst3PluginDescriptor {
  identity: HostedPluginIdentity;
  moduleSourceKey: string;
  supportsInstrumentRole: boolean;
  supportsEffectRole: boolean;
  audioInputBusCount: number;
  audioOutputBusCount: number;
  eventInputBusCount: number;
  reportedLatencySamples: number;
  reportedTailSamples?: number;
  parameterDescriptors?: HostedPluginParameterDescriptor[];
  factoryPrograms?: HostedPluginFactoryProgram[];
  vendorEditorAvailable?: boolean;
}

export type Vst3InstanceFailureCode =
  | "missingPlugin"
  | "loadFailure"
  | "helperCrash"
  | "deadlineMissed"
  | "stateRejected"
  | "protocolMismatch"
  | "unsupported";

export type Vst3InstancePhase = "missing" | "unavailable" | "loading" | "ready" | "failed" | "disabled";

export interface Vst3InstanceStatus {
  instanceId: string;
  phase: Vst3InstancePhase;
  disabled: boolean;
  failureCode?: Vst3InstanceFailureCode;
  latencySamples: number;
  tailSamples: number;
  parameterDescriptors: HostedPluginParameterDescriptor[];
  factoryPrograms: HostedPluginFactoryProgram[];
  selectedFactoryProgramId?: string;
  vendorEditorAvailable: boolean;
  genericEditorAvailable: boolean;
}

export interface Vst3VendorEditorResult {
  opened: boolean;
  code: "opened" | "unavailable" | "instanceMissing" | "unsupported";
}

export interface Vst3ParameterEditPoll {
  parameterEdits: Array<{ parameterId: number; value: number }>;
  restartFlags?: number;
  editorOpen: boolean;
  stateSnapshot?: HostedPluginStateSnapshot;
}

export interface Vst3ModuleCandidate {
  sourceKey: string;
  moduleFilename: string;
  binaryFingerprint: string;
  locationScope: "official" | "userAdded";
  descriptorStatus: "needsIsolatedScanner" | "verifiedByIsolatedScanner";
  quarantined: boolean;
  descriptors: Vst3PluginDescriptor[];
}

export interface Vst3BetaStatus {
  enabled: boolean;
  consentVersion: number | null;
  currentConsentVersion: number;
  scannerAvailable: boolean;
  audioHostingAvailable: boolean;
  vendorEditorAvailable: boolean;
  genericEditorAvailable: boolean;
  sidecarAvailable: boolean;
  sidecarProtocolVersion: number | null;
  vst3SdkLinked: boolean;
  audioBlockFrames: number;
  officialScanRootCount: number;
  userScanRootCount: number;
  cachedModuleCount: number;
  verifiedDescriptorCount: number;
  quarantinedModuleCount: number;
  stateLimitBytes: number;
  boundary: string;
}

export interface Vst3DiagnosticsSummary {
  betaEnabled: boolean;
  sidecarAvailable: boolean;
  vst3SdkLinked: boolean;
  scannerAvailable: boolean;
  audioHostingAvailable: boolean;
  audioBlockFrames: number;
  configuredRootCount: number;
  cachedModuleCount: number;
  verifiedDescriptorCount: number;
  quarantinedModuleCount: number;
  boundary: string;
}

export interface PluginStateValidation {
  valid: boolean;
  compressedBytes: number;
  uncompressedBytes: number;
  checksumSha256: string;
}

/**
 * Native-sidecar control protocol. Scanner and persistent session-graph modes
 * are implemented out of process; absolute module paths remain native-private.
 */
export type Vst3HostRequest =
  | {
      protocolVersion: typeof VST3_HOST_PROTOCOL_VERSION;
      requestId: string;
      mode: "scanner" | "session";
      kind: "hello" | "shutdown";
      payload: null;
    }
  | {
      protocolVersion: typeof VST3_HOST_PROTOCOL_VERSION;
      requestId: string;
      mode: "scanner";
      kind: "scanModule";
      sourceKey: string;
    }
  | {
      protocolVersion: typeof VST3_HOST_PROTOCOL_VERSION;
      requestId: string;
      mode: "session";
      kind: "loadInstance";
      instanceId: string;
      identity: HostedPluginIdentity;
    }
  | {
      protocolVersion: typeof VST3_HOST_PROTOCOL_VERSION;
      requestId: string;
      mode: "session";
      kind: "unloadInstance" | "retryInstance" | "queryStatus" | "getState";
      instanceId: string;
    }
  | {
      protocolVersion: typeof VST3_HOST_PROTOCOL_VERSION;
      requestId: string;
      mode: "session";
      kind: "setState";
      instanceId: string;
      stateSize: number;
      stateChecksum: string;
    };

export type Vst3HostResponse =
  | {
      protocolVersion: typeof VST3_HOST_PROTOCOL_VERSION;
      requestId: string;
      ok: true;
      code?: "scannerReady" | "scanComplete" | "shutdown";
      descriptors?: Vst3PluginDescriptor[];
    }
  | {
      protocolVersion: typeof VST3_HOST_PROTOCOL_VERSION;
      requestId: string;
      ok: false;
      code:
        | "unsupported"
        | "timeout"
        | "crash"
        | "invalidDescriptor"
        | "loadFailure"
        | "vst3SdkUnavailable"
        | "protocolMismatch"
        | "invalidRequest";
    };

export interface NativeVst3FoundationApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export async function getVst3BetaStatus(
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3BetaStatus | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<Vst3BetaStatus>("vst3_beta_status");
}

export async function setVst3BetaEnabled(
  enabled: boolean,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3BetaStatus | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<Vst3BetaStatus>("vst3_beta_set_enabled", { enabled });
}

export async function getVst3UserScanRoots(
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<string[]> {
  if (!api.isAvailable()) return [];
  return api.invoke<string[]>("vst3_beta_get_user_scan_roots");
}

export async function setVst3UserScanRoots(
  roots: string[],
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<string[]> {
  if (!api.isAvailable()) return [];
  return api.invoke<string[]>("vst3_beta_set_user_scan_roots", { roots });
}

/** Opens the native folder picker and privately persists the selected absolute root. */
export async function selectVst3UserScanFolder(
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<string[] | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<string[] | null>("vst3_beta_select_user_scan_folder");
}

export async function discoverVst3Modules(
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3ModuleCandidate[]> {
  if (!api.isAvailable()) return [];
  return api.invoke<Vst3ModuleCandidate[]>("vst3_beta_discover_modules");
}

export async function listVst3Registry(
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3ModuleCandidate[]> {
  if (!api.isAvailable()) return [];
  return api.invoke<Vst3ModuleCandidate[]>("vst3_beta_list_registry");
}

export async function quarantineVst3Module(
  sourceKey: string,
  reason: Vst3QuarantineReason,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<boolean> {
  if (!api.isAvailable()) return false;
  await api.invoke<void>("vst3_beta_quarantine_module", { sourceKey, reason });
  return true;
}

export async function clearVst3Quarantine(
  sourceKey: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<boolean> {
  if (!api.isAvailable()) return false;
  await api.invoke<void>("vst3_beta_clear_quarantine", { sourceKey });
  return true;
}

export async function validateVst3StateSnapshot(
  compressedState: Uint8Array,
  checksumSha256: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<PluginStateValidation | null> {
  if (!api.isAvailable()) return null;
  if (compressedState.byteLength > VST3_STATE_LIMIT_BYTES) {
    throw new Error("Plug-in state exceeds the 32 MiB per-instance limit.");
  }
  return api.invoke<PluginStateValidation>("vst3_validate_state_snapshot", {
    compressedState: Array.from(compressedState),
    checksumSha256
  });
}

export async function loadVst3Instance(
  instanceId: string,
  identity: HostedPluginIdentity,
  role: "instrument" | "effect",
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3InstanceStatus | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<Vst3InstanceStatus>("vst3_session_load_instance", {
    instanceId,
    identity: redactIdentity(identity),
    role
  });
}

export async function queryVst3InstanceStatus(
  instanceId: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3InstanceStatus | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<Vst3InstanceStatus>("vst3_session_query_status", { instanceId });
}

export async function unloadVst3Instance(
  instanceId: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<boolean> {
  if (!api.isAvailable()) return false;
  await api.invoke<void>("vst3_session_unload_instance", { instanceId });
  return true;
}

export async function retryVst3Instance(
  instanceId: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3InstanceStatus | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<Vst3InstanceStatus>("vst3_session_retry_instance", { instanceId });
}

export async function readVst3InstanceState(
  instanceId: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<HostedPluginStateSnapshot | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<HostedPluginStateSnapshot | null>("vst3_session_get_state", { instanceId });
}

export async function restoreVst3InstanceState(
  instanceId: string,
  snapshot: HostedPluginStateSnapshot,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<boolean> {
  if (!api.isAvailable()) return false;
  if (snapshot.sizeBytes > VST3_STATE_LIMIT_BYTES) throw new Error("Plug-in state exceeds the 32 MiB per-instance limit.");
  return api.invoke<boolean>("vst3_session_set_state", { instanceId, snapshot });
}

export async function setVst3InstanceParameter(
  instanceId: string,
  stableParameterId: string,
  value: number,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<boolean> {
  if (!api.isAvailable()) return false;
  return api.invoke<boolean>("vst3_session_set_parameter", {
    instanceId,
    stableParameterId: safeToken(stableParameterId),
    value
  });
}

export async function selectVst3FactoryProgram(
  instanceId: string,
  programId: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3InstanceStatus | null> {
  if (!api.isAvailable()) return null;
  const match = String(programId).match(/^(-?\d+):(-?\d+)$/);
  if (!match) throw new Error("The VST3 factory program ID is invalid.");
  return api.invoke<Vst3InstanceStatus>("vst3_session_select_program", {
    instanceId,
    programId: `${Number(match[1])}:${Number(match[2])}`
  });
}

/** Native code must return unavailable until editor ownership/DPI/focus support is proven. */
export async function openVst3VendorEditor(
  instanceId: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3VendorEditorResult> {
  if (!api.isAvailable()) return { opened: false, code: "unavailable" };
  return api.invoke<Vst3VendorEditorResult>("vst3_session_open_vendor_editor", { instanceId });
}

export async function pollVst3ParameterEdits(
  instanceId: string,
  api: NativeVst3FoundationApi = defaultNativeVst3FoundationApi
): Promise<Vst3ParameterEditPoll | null> {
  if (!api.isAvailable()) return null;
  return api.invoke<Vst3ParameterEditPoll>("vst3_session_poll_parameter_edits", { instanceId });
}

export function verifiedVst3Descriptors(modules: Vst3ModuleCandidate[]): VerifiedHostedPluginDescriptor[] {
  return modules.flatMap((module) => {
    if (module.quarantined || module.descriptorStatus !== "verifiedByIsolatedScanner") return [];
    return module.descriptors.map((descriptor) => ({
      verified: true as const,
      identity: redactIdentity(descriptor.identity),
      supportsInstrumentRole: descriptor.supportsInstrumentRole,
      supportsEffectRole: descriptor.supportsEffectRole,
      reportedLatencySamples: nonNegativeInteger(descriptor.reportedLatencySamples),
      reportedTailSamples: nonNegativeInteger(descriptor.reportedTailSamples),
      parameterDescriptors: descriptor.parameterDescriptors || [],
      factoryPrograms: descriptor.factoryPrograms || []
    }));
  });
}

export function vst3DescriptorKey(identity: HostedPluginIdentity): string {
  return `${safeToken(identity.classId)}:${safeToken(identity.binaryFingerprint)}`;
}

export function findExactVst3Descriptor(
  identity: HostedPluginIdentity,
  modules: Vst3ModuleCandidate[]
): VerifiedHostedPluginDescriptor | null {
  const key = vst3DescriptorKey(identity);
  return verifiedVst3Descriptors(modules).find((descriptor) => vst3DescriptorKey(descriptor.identity) === key) || null;
}

/** Aggregate-only diagnostics deliberately omit module names, fingerprints and paths. */
export function createVst3DiagnosticsSummary(status: Vst3BetaStatus): Vst3DiagnosticsSummary {
  return {
    betaEnabled: status.enabled,
    sidecarAvailable: status.sidecarAvailable,
    vst3SdkLinked: status.vst3SdkLinked,
    scannerAvailable: status.scannerAvailable,
    audioHostingAvailable: status.audioHostingAvailable,
    audioBlockFrames: status.audioBlockFrames,
    configuredRootCount: status.officialScanRootCount + status.userScanRootCount,
    cachedModuleCount: status.cachedModuleCount,
    verifiedDescriptorCount: status.verifiedDescriptorCount,
    quarantinedModuleCount: status.quarantinedModuleCount,
    boundary: status.boundary
  };
}

const defaultNativeVst3FoundationApi: NativeVst3FoundationApi = {
  isAvailable() {
    return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  },
  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const api = await import("@tauri-apps/api/core");
    return api.invoke<T>(command, args);
  }
};

function redactIdentity(identity: HostedPluginIdentity): HostedPluginIdentity {
  return {
    format: "vst3",
    classId: String(identity.classId || "").slice(0, 128),
    vendor: String(identity.vendor || "Unknown vendor").slice(0, 96),
    name: String(identity.name || "Unknown plug-in").slice(0, 96),
    version: String(identity.version || "Unknown").slice(0, 64),
    category: String(identity.category || "Unknown").slice(0, 64),
    moduleFilename: String(identity.moduleFilename || "Unknown.vst3").split(/[\\/]/).pop()!.slice(0, 160),
    binaryFingerprint: safeToken(identity.binaryFingerprint).slice(0, 128)
  };
}

function safeToken(value: unknown): string {
  return String(value || "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 128);
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}
import type {
  HostedPluginFactoryProgram,
  HostedPluginParameterDescriptor,
  HostedPluginStateSnapshot
} from "../daw/schema";
import type { VerifiedHostedPluginDescriptor } from "../daw/hostedPlugins";
