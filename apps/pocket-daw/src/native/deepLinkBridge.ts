import { readDeepLinkHandoff, type PocketDawHandoff } from "./pocketHandoff";

type DeepLinkUnlisten = () => void;

export async function readInitialDeepLinkHandoff(): Promise<PocketDawHandoff | null> {
  if (!isTauriRuntimeAvailable()) return null;
  try {
    const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
    return firstDeepLinkHandoff(await getCurrent());
  } catch {
    return null;
  }
}

export async function listenForDeepLinkHandoffs(onHandoff: (handoff: PocketDawHandoff) => void): Promise<DeepLinkUnlisten | null> {
  if (!isTauriRuntimeAvailable()) return null;
  try {
    const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
    return await onOpenUrl((urls) => {
      const handoff = firstDeepLinkHandoff(urls);
      if (handoff) onHandoff(handoff);
    });
  } catch {
    return null;
  }
}

function firstDeepLinkHandoff(urls: string[] | null | undefined): PocketDawHandoff | null {
  if (!Array.isArray(urls)) return null;
  for (const url of urls) {
    const handoff = readDeepLinkHandoff(url);
    if (handoff) return handoff;
  }
  return null;
}

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
