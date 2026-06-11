import { describe, expect, it } from "vitest";
import { openProjectFileNative, projectFileStateFromPath, saveProjectFile, type NativeFileApi } from "../src/native/fileBridge";
import { createDemoProject } from "../src/demo/demoProject";

describe("native file bridge", () => {
  it("creates friendly labels from native paths", () => {
    expect(projectFileStateFromPath("C:\\Songs\\Pocket Demo.pocketdaw").label).toBe("Pocket Demo.pocketdaw");
    expect(projectFileStateFromPath("/tmp/session.json").label).toBe("session.json");
    expect(projectFileStateFromPath(null, "Untitled").label).toBe("Untitled");
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
});
