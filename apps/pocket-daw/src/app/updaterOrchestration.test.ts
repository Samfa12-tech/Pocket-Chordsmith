import { describe, expect, it } from "vitest";
import type { AppState } from "./state";
import { createInitialState } from "./state";
import {
  applyUpdaterCheckResult,
  applyUpdaterInstallResult,
  applyUpdaterProgress,
  applyUpdaterRelaunchResult,
  beginUpdaterCheck,
  beginUpdaterDownload,
} from "./updaterOrchestration";

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    ...createInitialState(),
    ...overrides,
  };
}

describe("updater orchestration state transitions", () => {
  it("opens and resets the updater panel for a manual check", () => {
    const patch = beginUpdaterCheck(
      state({ updaterAvailableVersion: "0.9.0", updaterDownloadProgress: 0.6 }),
      true,
    );

    expect(patch).toMatchObject({
      showUpdaterPanel: true,
      updaterStatus: "checking",
      updaterMessage: "Checking for updates...",
      updaterAvailableVersion: null,
      updaterReleaseNotes: null,
      updaterDownloadProgress: null,
    });
  });

  it("keeps silent startup checks hidden when no update is available", () => {
    const patch = applyUpdaterCheckResult(
      state({ showUpdaterPanel: false }),
      {
        runtimeAvailable: true,
        available: false,
        currentVersion: "0.6.34",
        update: null,
        message: "You're on the latest available version.",
      },
      false,
    );

    expect(patch).toMatchObject({
      showUpdaterPanel: false,
      updaterStatus: "not-available",
      updaterCurrentVersion: "0.6.34",
      updaterAvailableVersion: null,
      updaterReleaseNotes: null,
    });
  });

  it("opens the panel and surfaces status when an update is found during startup", () => {
    const patch = applyUpdaterCheckResult(
      state({ showUpdaterPanel: false, status: "Ready." }),
      {
        runtimeAvailable: true,
        available: true,
        currentVersion: "0.6.34",
        update: {
          currentVersion: "0.6.34",
          version: "0.6.35",
          notes: "Fixes",
          date: null,
        },
        message: "Pocket DAW 0.6.35 is available.",
      },
      false,
    );

    expect(patch).toMatchObject({
      showUpdaterPanel: true,
      updaterStatus: "available",
      updaterAvailableVersion: "0.6.35",
      updaterReleaseNotes: "Fixes",
      status: "Pocket DAW 0.6.35 is available. Open Help > Check for Updates.",
    });
  });

  it("keeps unavailable desktop updater runtime quiet on startup", () => {
    const patch = applyUpdaterCheckResult(
      state({ updaterStatus: "checking" }),
      {
        runtimeAvailable: false,
        available: false,
        currentVersion: "0.6.34",
        update: null,
        message: "Updater is only available in the installed desktop app.",
      },
      false,
    );

    expect(patch).toMatchObject({
      updaterStatus: "idle",
      updaterMessage: "Updater is only available in the installed desktop app.",
    });
  });

  it("tracks download, install and relaunch states", () => {
    const downloading = beginUpdaterDownload(
      state({
        playing: true,
        updaterStatus: "available",
        updaterAvailableVersion: "0.6.35",
      }),
    );
    expect(downloading).toMatchObject({
      updaterStatus: "downloading",
      updaterMessage: "Downloading update while playback continues...",
      updaterDownloadProgress: 0,
    });

    const progress = applyUpdaterProgress(state(downloading), {
      status: "installing",
      downloadedBytes: 100,
      totalBytes: 100,
      progress: 1,
      message: "Installing update...",
    });
    expect(progress).toMatchObject({
      updaterStatus: "installing",
      updaterMessage: "Installing update...",
      updaterDownloadProgress: 1,
    });

    const installed = applyUpdaterInstallResult(state(progress), {
      runtimeAvailable: true,
      installed: true,
      message: "Update installed. Restart Pocket DAW to finish.",
    });
    expect(installed).toMatchObject({
      updaterStatus: "ready-to-restart",
      updaterDownloadProgress: 1,
      status: "Update installed. Restart Pocket DAW to finish.",
    });

    const relaunchBlocked = applyUpdaterRelaunchResult(state(installed), {
      runtimeAvailable: false,
      relaunched: false,
      message: "Please close and reopen Pocket DAW to finish updating.",
    });
    expect(relaunchBlocked).toMatchObject({
      updaterStatus: "ready-to-restart",
      updaterMessage: "Please close and reopen Pocket DAW to finish updating.",
      status: "Please close and reopen Pocket DAW to finish updating.",
    });
  });
});
