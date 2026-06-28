import type { AppState } from "./state";
import type {
  PocketDawRelaunchResult,
  PocketDawUpdateCheckResult,
  PocketDawUpdateInstallResult,
  PocketDawUpdateProgress,
} from "../native/updaterBridge";
import { POCKET_DAW_VERSION } from "../daw/schema";

type UpdaterUiPatch = Pick<
  AppState,
  | "showUpdaterPanel"
  | "updaterStatus"
  | "updaterMessage"
  | "updaterCurrentVersion"
  | "updaterAvailableVersion"
  | "updaterReleaseNotes"
  | "updaterDownloadProgress"
  | "status"
>;

export function beginUpdaterCheck(
  state: AppState,
  showPanel: boolean,
): UpdaterUiPatch {
  return {
    showUpdaterPanel: showPanel || state.showUpdaterPanel,
    updaterStatus: "checking",
    updaterMessage: "Checking for updates...",
    updaterCurrentVersion: state.updaterCurrentVersion,
    updaterAvailableVersion: null,
    updaterReleaseNotes: null,
    updaterDownloadProgress: null,
    status: state.status,
  };
}

export function applyUpdaterCheckResult(
  state: AppState,
  result: PocketDawUpdateCheckResult,
  showPanel: boolean,
): UpdaterUiPatch {
  const base = {
    showUpdaterPanel: state.showUpdaterPanel,
    updaterMessage: result.message,
    updaterCurrentVersion: result.currentVersion || POCKET_DAW_VERSION,
    updaterAvailableVersion: null,
    updaterReleaseNotes: null,
    updaterDownloadProgress: null,
    status: state.status,
  };
  if (!result.runtimeAvailable) {
    return {
      ...base,
      updaterStatus: showPanel ? "error" : "idle",
    };
  }
  if (result.available && result.update) {
    return {
      ...base,
      showUpdaterPanel: true,
      updaterStatus: "available",
      updaterAvailableVersion: result.update.version,
      updaterReleaseNotes: result.update.notes,
      status: `Pocket DAW ${result.update.version} is available. Open Help > Check for Updates.`,
    };
  }
  return {
    ...base,
    showUpdaterPanel: showPanel ? state.showUpdaterPanel : false,
    updaterStatus: "not-available",
  };
}

export function beginUpdaterDownload(state: AppState): UpdaterUiPatch {
  return {
    showUpdaterPanel: state.showUpdaterPanel,
    updaterStatus: "downloading",
    updaterMessage: state.playing
      ? "Downloading update while playback continues..."
      : "Downloading update...",
    updaterCurrentVersion: state.updaterCurrentVersion,
    updaterAvailableVersion: state.updaterAvailableVersion,
    updaterReleaseNotes: state.updaterReleaseNotes,
    updaterDownloadProgress: 0,
    status: state.status,
  };
}

export function applyUpdaterProgress(
  state: AppState,
  progress: PocketDawUpdateProgress,
): UpdaterUiPatch {
  return {
    showUpdaterPanel: state.showUpdaterPanel,
    updaterStatus: progress.status,
    updaterMessage: progress.message,
    updaterCurrentVersion: state.updaterCurrentVersion,
    updaterAvailableVersion: state.updaterAvailableVersion,
    updaterReleaseNotes: state.updaterReleaseNotes,
    updaterDownloadProgress: progress.progress,
    status: state.status,
  };
}

export function applyUpdaterInstallResult(
  state: AppState,
  result: PocketDawUpdateInstallResult,
): UpdaterUiPatch {
  return {
    showUpdaterPanel: state.showUpdaterPanel,
    updaterStatus: result.installed ? "ready-to-restart" : "error",
    updaterMessage: result.message,
    updaterCurrentVersion: state.updaterCurrentVersion,
    updaterAvailableVersion: state.updaterAvailableVersion,
    updaterReleaseNotes: state.updaterReleaseNotes,
    updaterDownloadProgress: result.installed ? 1 : null,
    status: result.installed
      ? "Update installed. Restart Pocket DAW to finish."
      : state.status,
  };
}

export function applyUpdaterRelaunchResult(
  state: AppState,
  result: PocketDawRelaunchResult,
): UpdaterUiPatch {
  return {
    showUpdaterPanel: state.showUpdaterPanel,
    updaterStatus: result.relaunched ? state.updaterStatus : "ready-to-restart",
    updaterMessage: result.message,
    updaterCurrentVersion: state.updaterCurrentVersion,
    updaterAvailableVersion: state.updaterAvailableVersion,
    updaterReleaseNotes: state.updaterReleaseNotes,
    updaterDownloadProgress: state.updaterDownloadProgress,
    status: result.message,
  };
}
