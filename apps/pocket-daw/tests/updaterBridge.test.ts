import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/app/state";
import { renderAppShell } from "../src/app/ui";
import { POCKET_DAW_VERSION } from "../src/daw/schema";
import { checkForPocketDawUpdate, isUpdaterAvailable, relaunchPocketDaw } from "../src/native/updaterBridge";

describe("Pocket DAW updater bridge", () => {
  it("returns safe fallback results outside the installed Tauri runtime", async () => {
    expect(isUpdaterAvailable()).toBe(false);

    const check = await checkForPocketDawUpdate();
    expect(check.runtimeAvailable).toBe(false);
    expect(check.available).toBe(false);
    expect(check.message).toContain("installed desktop app");

    const relaunch = await relaunchPocketDaw();
    expect(relaunch.runtimeAvailable).toBe(false);
    expect(relaunch.relaunched).toBe(false);
    expect(relaunch.message).toContain("close and reopen");
  });

  it("sets updater state defaults with startup checks enabled", () => {
    const state = createInitialState();

    expect(state.showUpdaterPanel).toBe(false);
    expect(state.updaterStatus).toBe("idle");
    expect(state.updaterMessage).toBe("Updates not checked yet.");
    expect(state.updaterCurrentVersion).toBe(POCKET_DAW_VERSION);
    expect(state.updaterAvailableVersion).toBeNull();
    expect(state.updaterDownloadProgress).toBeNull();
    expect(state.updaterAutoCheckOnStartup).toBe(true);
  });

  it("renders the Help update action and updater panel states", () => {
    const state = createInitialState();
    expect(renderAppShell(state)).toContain("Check for Updates");

    state.showUpdaterPanel = true;
    state.updaterStatus = "available";
    state.updaterAvailableVersion = "0.5.8";
    state.updaterReleaseNotes = "A signed update is ready.";
    state.updaterDownloadProgress = 0.42;
    const html = renderAppShell(state);

    expect(html).toContain("Pocket DAW Updates");
    expect(html).toContain("Pocket DAW 0.5.8 is available.");
    expect(html).toContain("A signed update is ready.");
    expect(html).toContain("Download and Install");
    expect(html).toContain("Check on startup and notify when updates are available");
  });
});
