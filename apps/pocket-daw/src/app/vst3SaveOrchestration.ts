export interface HostedStateCaptureResult {
  captured: boolean;
  warning?: string;
}

export interface HostedInstanceForSave {
  instanceId: string;
  name: string;
  phase?: string;
}

export async function serializeAfterReadyHostedStateCapture<T>(
  instances: HostedInstanceForSave[],
  capture: (instanceId: string) => Promise<HostedStateCaptureResult>,
  serialize: () => Promise<T>
): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  for (const instance of instances) {
    if (instance.phase !== "ready") continue;
    const result = await capture(instance.instanceId);
    if (!result.captured && result.warning) warnings.push(`${instance.name}: ${result.warning}`);
  }
  return { result: await serialize(), warnings };
}

export async function safeReloadHostedInstance(
  instanceId: string,
  phase: string | undefined,
  capture: (instanceId: string) => Promise<HostedStateCaptureResult>,
  unload: (instanceId: string) => Promise<unknown>,
  reload: (instanceId: string) => Promise<unknown>
): Promise<HostedStateCaptureResult> {
  const captureResult = phase === "ready" ? await capture(instanceId) : { captured: false };
  try {
    await unload(instanceId);
  } catch {
    // The helper may already be gone; reload still proceeds from preserved project state.
  }
  await reload(instanceId);
  return captureResult;
}

export function appendHostedStateSaveWarnings(message: string, warnings: string[]): string {
  if (!warnings.length) return message;
  return `${message} Saved with ${warnings.length} plug-in state warning${warnings.length === 1 ? "" : "s"}: ${warnings.join(" ")}`.trim();
}
