import { buildPocketHandoff, inspectDeepLinkHandoff, readEncodedHandoff, type PocketDawHandoff } from "./pocketHandoff";

type DeepLinkUnlisten = () => void;

export const SECOND_INSTANCE_DEEP_LINK_EVENT = "pocket-daw-second-instance";
export const LOCAL_HANDOFF_EVENT = "pocket-daw-local-handoff";

export interface HandoffBridgeStatus {
  source: "deep-link" | "local-server" | "download-file" | "project-file";
  result: "ignored" | "failed-parse";
  message: string;
  receivedAt: string;
}

export interface ProjectFileLaunch {
  path: string;
  receivedAt: string;
  source: "startup-args" | "second-instance";
}

interface SecondInstanceLaunchPayload {
  argv?: unknown;
  cwd?: unknown;
}

interface LocalHandoffPayload {
  encodedHandoff?: unknown;
  receivedAt?: unknown;
}

interface DownloadHandoffFilePayload {
  fileName?: unknown;
  path?: unknown;
  contents?: unknown;
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

export async function readInitialProjectFileLaunch(onStatus?: (status: HandoffBridgeStatus) => void): Promise<ProjectFileLaunch | null> {
  if (!isTauriRuntimeAvailable()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = await invoke<SecondInstanceLaunchPayload>("initial_launch_args");
    const paths = extractPocketDawProjectPathsFromLaunchPayload(payload);
    if (!paths.length) return null;
    return { path: paths[0], receivedAt: new Date().toISOString(), source: "startup-args" };
  } catch (error) {
    onStatus?.({
      source: "project-file",
      result: "failed-parse",
      message: error instanceof Error ? error.message : "Could not read Pocket DAW launch arguments.",
      receivedAt: new Date().toISOString()
    });
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
      void firstDeepLinkHandoff(urls, onStatus).then((handoff) => {
        if (handoff) onHandoff(handoff);
      });
    }));
  } catch {
    // The single-instance event below still covers installed-app launches routed to a running app.
  }
  try {
    const { listen } = await import("@tauri-apps/api/event");
    unlisten.push(await listen<SecondInstanceLaunchPayload>(SECOND_INSTANCE_DEEP_LINK_EVENT, (event) => {
      const urls = extractDeepLinkUrlsFromSecondInstancePayload(event.payload);
      if (!urls.length) {
        if (extractPocketDawProjectPathsFromLaunchPayload(event.payload).length) return;
        onStatus?.({
          source: "deep-link",
          result: "ignored",
          message: "Second-instance launch did not include a pocket-daw:// URL.",
          receivedAt: new Date().toISOString()
        });
        return;
      }
      void firstDeepLinkHandoff(urls, onStatus).then((handoff) => {
        if (handoff) onHandoff(handoff);
      });
    }));
    unlisten.push(await listen<LocalHandoffPayload>(LOCAL_HANDOFF_EVENT, (event) => {
      const handoff = handoffFromLocalServerPayload(event.payload, onStatus);
      if (handoff) onHandoff(handoff);
    }));
  } catch {
    // Event listening is unavailable outside the installed Tauri runtime.
  }
  if (!unlisten.length) return null;
  return () => unlisten.forEach((dispose) => dispose());
}

export async function listenForProjectFileLaunches(
  onProjectFile: (launch: ProjectFileLaunch) => void,
  onStatus?: (status: HandoffBridgeStatus) => void
): Promise<DeepLinkUnlisten | null> {
  if (!isTauriRuntimeAvailable()) return null;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<SecondInstanceLaunchPayload>(SECOND_INSTANCE_DEEP_LINK_EVENT, (event) => {
      const paths = extractPocketDawProjectPathsFromLaunchPayload(event.payload);
      if (!paths.length) return;
      onProjectFile({ path: paths[0], receivedAt: new Date().toISOString(), source: "second-instance" });
    });
  } catch (error) {
    onStatus?.({
      source: "project-file",
      result: "failed-parse",
      message: error instanceof Error ? error.message : "Could not listen for Pocket DAW project launches.",
      receivedAt: new Date().toISOString()
    });
    return null;
  }
}

export function handoffFromLocalServerPayload(payload: unknown, onStatus?: (status: HandoffBridgeStatus) => void): PocketDawHandoff | null {
  const encoded = isLocalHandoffPayload(payload) && typeof payload.encodedHandoff === "string" ? payload.encodedHandoff : "";
  const receivedAt = isLocalHandoffPayload(payload) && typeof payload.receivedAt === "string" ? payload.receivedAt : new Date().toISOString();
  if (!encoded) {
    onStatus?.({
      source: "local-server",
      result: "failed-parse",
      message: "Local handoff did not include a PocketHandoff payload.",
      receivedAt
    });
    return null;
  }
  const handoff = readEncodedHandoff(encoded, "local-server");
  if (!handoff) {
    onStatus?.({
      source: "local-server",
      result: "failed-parse",
      message: "Local handoff payload was not a valid PocketHandoff envelope.",
      receivedAt
    });
    return null;
  }
  return handoff;
}

export function extractDeepLinkUrlsFromSecondInstancePayload(payload: unknown): string[] {
  const argv = launchArgvFromPayload(payload);
  return argv.filter((value): value is string => typeof value === "string" && isPocketDawProtocol(value));
}

export function extractPocketDawProjectPathsFromLaunchPayload(payload: unknown): string[] {
  return launchArgvFromPayload(payload)
    .map((value) => typeof value === "string" ? projectPathFromLaunchArg(value) : null)
    .filter((value): value is string => !!value);
}

export function downloadHandoffFileNameFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "pocket-daw:" || url.searchParams.get("source") !== "download") return null;
    return url.searchParams.get("file") || null;
  } catch {
    return null;
  }
}

export function handoffFromDownloadFilePayload(payload: unknown, onStatus?: (status: HandoffBridgeStatus) => void): PocketDawHandoff | null {
  if (!isDownloadHandoffFilePayload(payload) || typeof payload.contents !== "string" || !payload.contents.trim()) {
    onStatus?.({
      source: "download-file",
      result: "failed-parse",
      message: "Downloaded Pocket Chordsmith handoff file did not contain a share code.",
      receivedAt: new Date().toISOString()
    });
    return null;
  }
  const fileName = typeof payload.fileName === "string" ? payload.fileName : "downloaded handoff";
  const handoff = buildPocketHandoff("chordsmith-to-daw", payload.contents.trim(), {
    sourceApp: "Pocket Chordsmith",
    targetApp: "PocketDAW",
    metadata: { fileName }
  });
  return {
    payload: handoff,
    code: handoff.code,
    source: "download-file",
    status: `Pocket Chordsmith handoff imported from ${fileName}.`,
    clear: () => undefined
  };
}

async function firstDeepLinkHandoff(urls: string[] | null | undefined, onStatus?: (status: HandoffBridgeStatus) => void): Promise<PocketDawHandoff | null> {
  if (!Array.isArray(urls)) return null;
  for (const url of urls) {
    const fileName = downloadHandoffFileNameFromUrl(url);
    if (fileName) {
      const handoff = await readDownloadFileHandoff(fileName, onStatus);
      if (handoff) return handoff;
      continue;
    }
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

async function readDownloadFileHandoff(fileName: string, onStatus?: (status: HandoffBridgeStatus) => void): Promise<PocketDawHandoff | null> {
  try {
    onStatus?.({
      source: "download-file",
      result: "ignored",
      message: `Reading Pocket Chordsmith handoff file ${fileName} from Downloads...`,
      receivedAt: new Date().toISOString()
    });
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = await invoke<DownloadHandoffFilePayload>("read_download_handoff_file", { fileName });
    return handoffFromDownloadFilePayload(payload, onStatus);
  } catch (error) {
    onStatus?.({
      source: "download-file",
      result: "failed-parse",
      message: error instanceof Error ? error.message : String(error || "Could not read downloaded Pocket Chordsmith handoff file."),
      receivedAt: new Date().toISOString()
    });
    return null;
  }
}

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isSecondInstancePayload(value: unknown): value is SecondInstanceLaunchPayload {
  return !!value && typeof value === "object";
}

function isLocalHandoffPayload(value: unknown): value is LocalHandoffPayload {
  return !!value && typeof value === "object";
}

function isDownloadHandoffFilePayload(value: unknown): value is DownloadHandoffFilePayload {
  return !!value && typeof value === "object";
}

function launchArgvFromPayload(payload: unknown): unknown[] {
  return isSecondInstancePayload(payload) && Array.isArray(payload.argv) ? payload.argv : Array.isArray(payload) ? payload : [];
}

function isPocketDawProtocol(value: string): boolean {
  try {
    return new URL(value).protocol === "pocket-daw:";
  } catch {
    return false;
  }
}

function projectPathFromLaunchArg(value: string): string | null {
  const trimmed = stripOuterQuotes(value.trim());
  if (!trimmed || trimmed.startsWith("-") || isPocketDawProtocol(trimmed)) return null;
  if (/^file:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "file:") return null;
      const pathname = decodeURIComponent(url.pathname);
      const windowsPath = pathname.replace(/^\/([A-Za-z]:[\\/])/, "$1").replace(/\//g, "\\");
      return isPocketDawProjectPath(windowsPath) ? windowsPath : null;
    } catch {
      return null;
    }
  }
  return isPocketDawProjectPath(trimmed) ? trimmed : null;
}

function isPocketDawProjectPath(value: string): boolean {
  return /\.pocketdaw$/i.test(value);
}

function stripOuterQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
