import { POCKET_DAW_VERSION } from "../daw/schema";

export type UpdaterState =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "installing"
  | "ready-to-restart"
  | "error";

export interface PocketDawUpdateInfo {
  currentVersion: string;
  version: string;
  notes: string | null;
  date: string | null;
}

export interface PocketDawUpdateCheckResult {
  runtimeAvailable: boolean;
  available: boolean;
  currentVersion: string;
  update: PocketDawUpdateInfo | null;
  message: string;
}

export interface PocketDawUpdateInstallResult {
  runtimeAvailable: boolean;
  installed: boolean;
  message: string;
}

export interface PocketDawRelaunchResult {
  runtimeAvailable: boolean;
  relaunched: boolean;
  message: string;
}

export interface PocketDawUpdateProgress {
  status: "downloading" | "installing";
  downloadedBytes: number;
  totalBytes: number | null;
  progress: number | null;
  message: string;
}

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

type TauriUpdate = {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall(onEvent?: (event: DownloadEvent) => void): Promise<void>;
  close?(): Promise<void>;
};

let pendingUpdate: TauriUpdate | null = null;

export function isUpdaterAvailable(): boolean {
  return isTauriRuntimeAvailable();
}

export async function checkForPocketDawUpdate(): Promise<PocketDawUpdateCheckResult> {
  if (!isTauriRuntimeAvailable()) {
    pendingUpdate = null;
    return {
      runtimeAvailable: false,
      available: false,
      currentVersion: POCKET_DAW_VERSION,
      update: null,
      message: "Updater is only available in the installed desktop app."
    };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    pendingUpdate = update as TauriUpdate | null;
    if (!pendingUpdate) {
      return {
        runtimeAvailable: true,
        available: false,
        currentVersion: POCKET_DAW_VERSION,
        update: null,
        message: "You're on the latest available version."
      };
    }
    return {
      runtimeAvailable: true,
      available: true,
      currentVersion: pendingUpdate.currentVersion || POCKET_DAW_VERSION,
      update: updateInfoFromTauriUpdate(pendingUpdate),
      message: `Pocket DAW ${pendingUpdate.version} is available.`
    };
  } catch (error) {
    pendingUpdate = null;
    return {
      runtimeAvailable: true,
      available: false,
      currentVersion: POCKET_DAW_VERSION,
      update: null,
      message: `Update check failed: ${friendlyUpdaterError(error)}`
    };
  }
}

export async function downloadAndInstallPocketDawUpdate(
  onProgress?: (progress: PocketDawUpdateProgress) => void
): Promise<PocketDawUpdateInstallResult> {
  if (!isTauriRuntimeAvailable()) {
    return {
      runtimeAvailable: false,
      installed: false,
      message: "Updater is only available in the installed desktop app."
    };
  }

  try {
    let update = pendingUpdate;
    if (!update) {
      const checkResult = await checkForPocketDawUpdate();
      update = pendingUpdate;
      if (!checkResult.available || !update) {
        return {
          runtimeAvailable: true,
          installed: false,
          message: checkResult.message
        };
      }
    }

    let downloadedBytes = 0;
    let totalBytes: number | null = null;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        downloadedBytes = 0;
        totalBytes = typeof event.data.contentLength === "number" ? event.data.contentLength : null;
        onProgress?.({
          status: "downloading",
          downloadedBytes,
          totalBytes,
          progress: null,
          message: "Downloading update..."
        });
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        onProgress?.({
          status: "downloading",
          downloadedBytes,
          totalBytes,
          progress: totalBytes && totalBytes > 0 ? Math.min(1, downloadedBytes / totalBytes) : null,
          message: totalBytes ? `Downloading update (${Math.round((downloadedBytes / totalBytes) * 100)}%).` : "Downloading update..."
        });
      } else {
        onProgress?.({
          status: "installing",
          downloadedBytes,
          totalBytes,
          progress: 1,
          message: "Installing update..."
        });
      }
    });
    await update.close?.().catch(() => undefined);
    pendingUpdate = null;
    return {
      runtimeAvailable: true,
      installed: true,
      message: "Update installed. Restart Pocket DAW to finish."
    };
  } catch (error) {
    return {
      runtimeAvailable: true,
      installed: false,
      message: `Update install failed: ${friendlyUpdaterError(error)}`
    };
  }
}

export async function relaunchPocketDaw(): Promise<PocketDawRelaunchResult> {
  if (!isTauriRuntimeAvailable()) {
    return {
      runtimeAvailable: false,
      relaunched: false,
      message: "Please close and reopen Pocket DAW to finish updating."
    };
  }
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return {
      runtimeAvailable: true,
      relaunched: true,
      message: "Restarting Pocket DAW..."
    };
  } catch (error) {
    return {
      runtimeAvailable: true,
      relaunched: false,
      message: `Please close and reopen Pocket DAW to finish updating. Relaunch failed: ${friendlyUpdaterError(error)}`
    };
  }
}

function updateInfoFromTauriUpdate(update: TauriUpdate): PocketDawUpdateInfo {
  return {
    currentVersion: update.currentVersion || POCKET_DAW_VERSION,
    version: update.version,
    notes: update.body || null,
    date: update.date || null
  };
}

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function friendlyUpdaterError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "The updater runtime returned an unknown error.";
}
