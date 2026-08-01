export const SIDECAR_NAME: string;
export const SIDECAR_PROTOCOL_VERSION: number;
export const SIDECAR_TARGET: string;
export const SIDECAR_BLOCK_FRAMES: number;
export const VST3_SDK_TAG: string;
export const VST3_SDK_COMMIT: string;
export const VST3_SDK_LICENSE_SHA256: string;
export function hashVendoredSdkTree(sdkRoot: string, subsets: string[]): string;
export function stagedSidecarName(target?: string): string;
export function validateProbePayload(payload: unknown): Record<string, unknown>;
export function peMachine(bytes: Buffer): number | null;
export function preparePluginHostSidecar(options?: {
  release?: boolean;
  checkOnly?: boolean;
  root?: string;
}): {
  stagedPath: string;
  metadataPath: string;
  metadata: Record<string, unknown>;
  probe: Record<string, unknown>;
};
