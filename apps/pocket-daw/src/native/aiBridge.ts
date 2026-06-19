export const AI_BRIDGE_REQUEST_EVENT = "pocket-daw-ai-request";
export const AI_BRIDGE_ENABLED_KEY = "pocket_daw_ai_bridge_enabled_v1";

export interface AiBridgeSession {
  app: string;
  url: string;
  statusUrl: string;
  controlUrl: string;
  token: string;
  enabled: boolean;
  sessionPath: string;
  processId: number;
  startedAt: string;
}

export interface AiBridgeRequestPayload {
  requestId: string;
  kind: string;
  body: string;
  receivedAt: string;
}

export interface AiBridgeUiStatus {
  runtimeAvailable: boolean;
  enabled: boolean;
  url: string | null;
  statusUrl: string | null;
  controlUrl: string | null;
  sessionPath: string | null;
  processId: number | null;
  startedAt: string | null;
  lastRequestAt: string | null;
  lastError: string | null;
  testMessage: string;
}

export type AiBridgeUnlisten = () => void;

export function defaultAiBridgeUiStatus(): AiBridgeUiStatus {
  return {
    runtimeAvailable: isTauriRuntimeAvailable(),
    enabled: false,
    url: null,
    statusUrl: null,
    controlUrl: null,
    sessionPath: null,
    processId: null,
    startedAt: null,
    lastRequestAt: null,
    lastError: null,
    testMessage: isTauriRuntimeAvailable()
      ? "Live app bridge has not been checked yet."
      : "Live app bridge is only available in the installed Pocket DAW app."
  };
}

export function readAiBridgeEnabledPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AI_BRIDGE_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveAiBridgeEnabledPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_BRIDGE_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // Local storage is best-effort; the native runtime remains authoritative.
  }
}

export async function aiBridgeSession(): Promise<AiBridgeSession | null> {
  if (!isTauriRuntimeAvailable()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AiBridgeSession>("ai_bridge_session");
}

export async function setAiBridgeEnabled(enabled: boolean): Promise<AiBridgeSession | null> {
  if (!isTauriRuntimeAvailable()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AiBridgeSession>("ai_bridge_set_enabled", { enabled });
}

export async function resolveAiBridgeRequest(requestId: string, response: unknown): Promise<void> {
  if (!isTauriRuntimeAvailable()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("ai_bridge_resolve_request", {
    requestId,
    responseJson: JSON.stringify(response)
  });
}

export async function listenForAiBridgeRequests(
  handler: (payload: AiBridgeRequestPayload) => Promise<unknown> | unknown
): Promise<AiBridgeUnlisten | null> {
  if (!isTauriRuntimeAvailable()) return null;
  const { listen } = await import("@tauri-apps/api/event");
  return listen<AiBridgeRequestPayload>(AI_BRIDGE_REQUEST_EVENT, (event) => {
    const payload = event.payload;
    void Promise.resolve(handler(payload))
      .then((response) => resolveAiBridgeRequest(payload.requestId, response))
      .catch((error) => resolveAiBridgeRequest(payload.requestId, {
        ok: false,
        code: "frontend_error",
        message: error instanceof Error ? error.message : String(error || "Pocket DAW live bridge request failed.")
      }));
  });
}

export function uiStatusFromSession(session: AiBridgeSession | null, patch: Partial<AiBridgeUiStatus> = {}): AiBridgeUiStatus {
  const base = defaultAiBridgeUiStatus();
  if (!session) return { ...base, ...patch };
  return {
    ...base,
    runtimeAvailable: true,
    enabled: !!session.enabled,
    url: session.url || null,
    statusUrl: session.statusUrl || null,
    controlUrl: session.controlUrl || null,
    sessionPath: session.sessionPath || null,
    processId: typeof session.processId === "number" ? session.processId : null,
    startedAt: session.startedAt || null,
    testMessage: session.enabled ? "Live app bridge is enabled." : "Live app bridge is disabled.",
    ...patch
  };
}

export function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
