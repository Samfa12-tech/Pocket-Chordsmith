export interface NativeExternalLinkApi {
  isAvailable(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export function normalizeExternalUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed) || /%(?![0-9a-f]{2})/i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname) return trimmed;
    if (parsed.protocol === "mailto:" && parsed.pathname.trim()) return trimmed;
  } catch {
    // A malformed URL never reaches the native bridge.
  }
  return null;
}

export async function openExternalUrlNative(url: string, api: NativeExternalLinkApi = defaultNativeExternalLinkApi): Promise<boolean> {
  const normalized = normalizeExternalUrl(url);
  if (!normalized || !api.isAvailable()) return false;
  try {
    await api.invoke("open_external_url", { url: normalized });
    return true;
  } catch {
    return false;
  }
}

export function isNativeExternalLinkAvailable(api: NativeExternalLinkApi = defaultNativeExternalLinkApi): boolean {
  return api.isAvailable();
}

const defaultNativeExternalLinkApi: NativeExternalLinkApi = {
  isAvailable() {
    return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  },
  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const api = await import("@tauri-apps/api/core");
    return api.invoke<T>(command, args);
  }
};

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}
