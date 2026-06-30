import { afterEach, describe, expect, it, vi } from "vitest";
import { openProjectFileNative, projectFileStateFromPath, projectRecoveryRecommendation, projectTitleFromFileState, saveBlobFileAs, saveProjectFile, type NativeFileApi, type NativeProjectRecoveryCandidate } from "../src/native/fileBridge";
import { createDemoProject } from "../src/demo/demoProject";

describe("native file bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates friendly labels from native paths", () => {
    expect(projectFileStateFromPath("C:\\Songs\\Pocket Demo.pocketdaw").label).toBe("Pocket Demo.pocketdaw");
    expect(projectFileStateFromPath("/tmp/session.json").label).toBe("session.json");
    expect(projectFileStateFromPath(null, "Untitled").label).toBe("Untitled");
  });

  it("derives display titles from saved Pocket DAW file labels", () => {
    expect(projectTitleFromFileState({ path: "C:\\Songs\\Sam Jam.pocketdaw", label: "Sam Jam.pocketdaw" })).toBe("Sam Jam");
    expect(projectTitleFromFileState({ path: "C:\\Songs\\Sketch", label: "Sketch" })).toBe("Sketch");
    expect(projectTitleFromFileState(null)).toBeNull();
  });

  it("saves to the current native path before asking for save as", async () => {
    const calls: string[] = [];
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke(command) {
        calls.push(command);
        return { path: "C:\\Songs\\Saved.pocketdaw", label: "Saved.pocketdaw" } as never;
      }
    };

    const result = await saveProjectFile(createDemoProject(), "C:\\Songs\\Saved.pocketdaw", false, api);

    expect(calls).toEqual(["write_project_file"]);
    expect(result.mode).toBe("native");
    expect(result.file?.label).toBe("Saved.pocketdaw");
  });

  it("uses native save as when no current path exists", async () => {
    const calls: string[] = [];
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke(command) {
        calls.push(command);
        return { path: "C:\\Songs\\New.pocketdaw", label: "New.pocketdaw" } as never;
      }
    };

    const result = await saveProjectFile(createDemoProject(), null, false, api);

    expect(calls).toEqual(["save_project_file_as"]);
    expect(result.mode).toBe("native");
    expect(result.file?.path).toBe("C:\\Songs\\New.pocketdaw");
  });

  it("blocks saving projects with invariant errors before invoking native writes", async () => {
    const calls: string[] = [];
    const project = createDemoProject();
    project.timeline.clips[0].trackId = "missing-track";
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke(command) {
        calls.push(command);
        return { path: "C:\\Songs\\Bad.pocketdaw", label: "Bad.pocketdaw" } as never;
      }
    };

    await expect(saveProjectFile(project, "C:\\Songs\\Bad.pocketdaw", false, api)).rejects.toThrow("save-blocking invariant");
    expect(calls).toEqual([]);
  });

  it("opens native project payloads and treats cancel as null", async () => {
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke() {
        return { path: "C:\\Songs\\Opened.pocketdaw", label: "", contents: "{\"ok\":true}" } as never;
      }
    };
    const cancelled: NativeFileApi = {
      isAvailable: () => true,
      async invoke() {
        return null as never;
      }
    };

    await expect(openProjectFileNative(cancelled)).resolves.toBeNull();
    await expect(openProjectFileNative(api)).resolves.toMatchObject({
      contents: "{\"ok\":true}",
      file: { path: "C:\\Songs\\Opened.pocketdaw", label: "Opened.pocketdaw" }
    });
  });

  it("reports malformed native open payloads clearly", async () => {
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke() {
        return { path: null, contents: 123 } as never;
      }
    };

    await expect(openProjectFileNative(api)).rejects.toThrow("invalid project file payload");
  });

  it("saves binary blobs through native save-as with byte payloads", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return { path: "C:\\Songs\\Pack.zip", label: "Pack.zip", bytesWritten: 3 } as never;
      }
    };

    const result = await saveBlobFileAs(new Blob([new Uint8Array([1, 2, 3])], { type: "application/zip" }), "Pack.zip", api);

    expect(result).toMatchObject({ mode: "native", bytesWritten: 3, file: { label: "Pack.zip" } });
    expect(calls).toEqual([{
      command: "save_binary_file_as",
      args: {
        defaultName: "Pack.zip",
        bytes: [1, 2, 3]
      }
    }]);
  });

  it("treats cancelled native binary save as cancelled without fallback", async () => {
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke() {
        return null as never;
      }
    };

    await expect(saveBlobFileAs(new Blob(["zip"]), "Pack.zip", api)).resolves.toMatchObject({
      mode: "cancelled",
      file: null
    });
  });

  it("reports malformed native binary save payloads clearly", async () => {
    stubDownloadEnvironment();
    const api: NativeFileApi = {
      isAvailable: () => true,
      async invoke() {
        return { path: null, bytesWritten: "many" } as never;
      }
    };

    await expect(saveBlobFileAs(new Blob(["zip"]), "Pack.zip", api)).resolves.toMatchObject({
      mode: "browser-fallback",
      message: expect.stringContaining("invalid binary file payload")
    });
  });

  it("recommends visible recovery for newer valid temp or backup candidates", () => {
    const current = recoveryCandidate("C:\\Songs\\Song.pocketdaw", 100, true);
    const temp = recoveryCandidate("C:\\Songs\\Song.pocketdaw.tmp", 200, true);
    const backup = recoveryCandidate("C:\\Songs\\Song.pocketdaw.bak", 50, true);

    expect(projectRecoveryRecommendation({ current, temp, backup })).toMatchObject({
      kind: "offer-temp",
      candidate: "temp"
    });
    expect(projectRecoveryRecommendation({ current: { ...current, valid: false }, temp: null, backup })).toMatchObject({
      kind: "offer-backup",
      candidate: "backup"
    });
    expect(projectRecoveryRecommendation({ current, temp: { ...temp, valid: false }, backup })).toMatchObject({
      kind: "none",
      candidate: null
    });
  });
});

function stubDownloadEnvironment() {
  const anchor = {
    href: "",
    download: "",
    click: vi.fn(),
    remove: vi.fn()
  };
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn()
  });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => anchor),
    body: {
      appendChild: vi.fn()
    }
  });
  vi.stubGlobal("window", {
    setTimeout: vi.fn()
  });
}

function recoveryCandidate(path: string, modifiedUnixMs: number, valid: boolean): NativeProjectRecoveryCandidate {
  return {
    path,
    sizeBytes: 128,
    modifiedUnixMs,
    valid,
    note: valid ? "valid Pocket DAW project candidate" : "not a valid Pocket DAW project candidate"
  };
}
