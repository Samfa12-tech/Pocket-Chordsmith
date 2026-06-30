import type { GameExportManifest } from "../daw/exportJobs";

export const GODOT_GAME_PACK_PUSH_DEFAULT_URL = "http://127.0.0.1:47859/pocket-daw/godot/game-pack";

export type GamePackPushResult =
  | { ok: true; pushed: true; fallbackRequired: false; status: number; message: string; targetUrl: string; manifestKind: GameExportManifest["kind"]; manifestFile: string }
  | { ok: false; pushed: false; fallbackRequired: true; status?: number; message: string; targetUrl: string; manifestKind: GameExportManifest["kind"]; manifestFile: string };

export interface GamePackPushRequest {
  blob: Blob;
  fileName: string;
  manifest: GameExportManifest;
  endpointUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function pushGamePackToGodot(request: GamePackPushRequest): Promise<GamePackPushResult> {
  const targetUrl = request.endpointUrl || GODOT_GAME_PACK_PUSH_DEFAULT_URL;
  const base = {
    targetUrl,
    manifestKind: request.manifest.kind,
    manifestFile: request.manifest.manifestFile
  };
  if (!isLoopbackHttpUrl(targetUrl)) {
    return {
      ...base,
      ok: false,
      pushed: false,
      fallbackRequired: true,
      message: "Godot push endpoint must be an http:// loopback URL."
    };
  }
  const fetcher = request.fetchImpl || globalThis.fetch;
  if (typeof fetcher !== "function") {
    return {
      ...base,
      ok: false,
      pushed: false,
      fallbackRequired: true,
      message: "Fetch is unavailable; save the Godot game pack ZIP manually."
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(100, request.timeoutMs ?? 2500));
  try {
    const response = await fetcher(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/zip",
        "X-Pocket-Daw-Pack-Kind": request.manifest.kind,
        "X-Pocket-Daw-Manifest": request.manifest.manifestFile,
        "X-Pocket-Daw-Filename": request.fileName
      },
      body: request.blob,
      signal: controller.signal
    });
    const text = await safeResponseText(response);
    if (!response.ok) {
      return {
        ...base,
        ok: false,
        pushed: false,
        fallbackRequired: true,
        status: response.status,
        message: text || `Godot push endpoint rejected the pack with HTTP ${response.status}.`
      };
    }
    return {
      ...base,
      ok: true,
      pushed: true,
      fallbackRequired: false,
      status: response.status,
      message: text || "Godot game pack pushed to local endpoint."
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      pushed: false,
      fallbackRequired: true,
      message: error instanceof Error && error.name === "AbortError"
        ? "Godot push endpoint timed out; save the ZIP manually."
        : `Godot push endpoint unavailable; save the ZIP manually. ${error instanceof Error ? error.message : String(error || "")}`.trim()
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function isLoopbackHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:") return false;
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname === "::1";
  } catch {
    return false;
  }
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
