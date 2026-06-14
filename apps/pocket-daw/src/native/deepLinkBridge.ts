import { inspectDeepLinkHandoff, type PocketDawHandoff } from "./pocketHandoff";

type DeepLinkUnlisten = () => void;

export const SECOND_INSTANCE_DEEP_LINK_EVENT = "pocket-daw-second-instance";

export interface HandoffBridgeStatus {
  source: "deep-link";
  result: "ignored" | "failed-parse";
  message: string;
  receivedAt: string;
}

interface SecondInstanceLaunchPayload {
  argv?: unknown;
  cwd?: unknown;
}

export async function readInitialDeepLinkHandoff(onStatus?: (status: HandoffBridgeStatus) => void): Promise<PocketDawHandoff | null> {
  if (!isTauriRuntimeAvailable()) return null;
  try {
    const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
    return firstDeepLinkHandoff(await getCurrent(), onStatus);
  } catch {
    return null;
  }
}

export async function listenForDeepLinkHandoffs(
  onHandoff: (handoff: PocketDawHandoff) => void,
  onStatus?: (status: HandoffBridgeStatus) => void
): Promise<DeepLinkUnlisten | null> {
  if (!isTauriRuntimeAvailable()) return null;
  const unlisten: DeepLinkUnlisten[] = [];
  try {
    const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
    unlisten.push(await onOpenUrl((urls) => {
      const handoff = firstDeepLinkHandoff(urls, onStatus);
      if (handoff) onHandoff(handoff);
    }));
  } catch {
    // The single-instance event below still covers installed-app launches routed to a running app.
  }
  try {
    const { listen } = await import("@tauri-apps/api/event");
    unlisten.push(await listen<SecondInstanceLaunchPayload>(SECOND_INSTANCE_DEEP_LINK_EVENT, (event) => {
      const urls = extractDeepLinkUrlsFromSecondInstancePayload(event.payload);
      if (!urls.length) {
        onStatus?.({
          source: "deep-link",
          result: "ignored",
          message: "Second-instance launch did not include a pocket-daw:// URL.",
          receivedAt: new Date().toISOString()
        });
        return;
      }
      const handoff = firstDeepLinkHandoff(urls, onStatus);
      if (handoff) onHandoff(handoff);
    }));
  } catch {
    // Event listening is unavailable outside the installed Tauri runtime.
  }
  if (!unlisten.length) return null;
  return () => unlisten.forEach((dispose) => dispose());
}

export function extractDeepLinkUrlsFromSecondInstancePayload(payload: unknown): string[] {
  const argv = isSecondInstancePayload(payload) && Array.isArray(payload.argv) ? payload.argv : Array.isArray(payload) ? payload : [];
  return argv.filter((value): value is string => typeof value === "string" && isPocketDawProtocol(value));
}

function firstDeepLinkHandoff(urls: string[] | null | undefined, onStatus?: (status: HandoffBridgeStatus) => void): PocketDawHandoff | null {
  if (!Array.isArray(urls)) return null;
  for (const url of urls) {
    const inspected = inspectDeepLinkHandoff(url);
    if (inspected.result === "handoff") return inspected.handoff;
    onStatus?.({
      source: "deep-link",
      result: inspected.result,
      message: inspected.message,
      receivedAt: new Date().toISOString()
    });
  }
  return null;
}

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isSecondInstancePayload(value: unknown): value is SecondInstanceLaunchPayload {
  return !!value && typeof value === "object";
}

function isPocketDawProtocol(value: string): boolean {
  try {
    return new URL(value).protocol === "pocket-daw:";
  } catch {
    return false;
  }
}
