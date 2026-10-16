import { describe, expect, it, vi } from "vitest";
import { ProjectFileOpen, projectFileUsesFamilyImport, projectOpenRecordingBusy } from "../src/app/projectFileOpen";
import type { NativeProjectOpenResult } from "../src/native/fileBridge";
import { createDemoProject, createDemoChordsmithProject } from "../src/demo/demoProject";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { createPocketDjImportFixture } from "./pocketDjFixtures";

const selected: NativeProjectOpenResult = {
  mode: "selected", project: { contents: "{}", file: { path: "C:/song.json", label: "song.json" } }
};
function options() {
  return {
    select: vi.fn(async (): Promise<NativeProjectOpenResult> => selected),
    isCurrent: vi.fn(() => true), openNative: vi.fn(async () => {}),
    openBrowser: vi.fn(), report: vi.fn()
  };
}

describe("project file picker coordination", () => {
  it("protects preparing, count-in, recording, stopping and MIDI capture from project replacement", () => {
    for (const status of ["preparing", "count-in", "recording", "stopping"]) expect(projectOpenRecordingBusy(status, "idle")).toBe(true);
    expect(projectOpenRecordingBusy("idle", "recording")).toBe(true);
    expect(projectOpenRecordingBusy("idle", "idle")).toBe(false);
    expect(projectOpenRecordingBusy("error", "error")).toBe(false);
  });
  it("routes Chordsmith/DJ JSON through the family importer and keeps DAW JSON on project recovery", () => {
    const file = (contents: string, label = "song.json") => ({ contents, file: { path: "C:/" + label, label } });
    expect(projectFileUsesFamilyImport(file(JSON.stringify(createDemoChordsmithProject())))).toBe(true);
    expect(projectFileUsesFamilyImport(file(JSON.stringify(createPocketDjImportFixture())))).toBe(true);
    expect(projectFileUsesFamilyImport(file(buildPocketDawProjectFile(createDemoProject())))).toBe(false);
    expect(projectFileUsesFamilyImport(file("invalid", "song.POCKETDAW"))).toBe(false);
    expect(() => projectFileUsesFamilyImport(file("invalid"))).toThrow();
  });
  it("cancels without a second picker, project load or status replacement", async () => {
    const hooks = options(); hooks.select.mockResolvedValue({ mode: "cancelled" });
    await new ProjectFileOpen().open(hooks);
    expect(hooks.openBrowser).not.toHaveBeenCalled();
    expect(hooks.openNative).not.toHaveBeenCalled();
    expect(hooks.report).not.toHaveBeenCalled();
  });

  it("uses browser fallback only when the native runtime is unavailable", async () => {
    const hooks = options(); hooks.select.mockResolvedValue({ mode: "unavailable" });
    await new ProjectFileOpen().open(hooks);
    expect(hooks.openBrowser).toHaveBeenCalledOnce();
    expect(hooks.openNative).not.toHaveBeenCalled();
  });

  it("ignores duplicate opens while pending and rejects a result after a project edit/import", async () => {
    let release!: (value: NativeProjectOpenResult) => void;
    const hooks = options(); hooks.select.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const picker = new ProjectFileOpen(); const pending = picker.open(hooks);
    await picker.open(hooks);
    expect(hooks.select).toHaveBeenCalledOnce();
    hooks.isCurrent.mockReturnValue(false); release(selected); await pending;
    expect(hooks.openNative).not.toHaveBeenCalled();
    expect(hooks.openBrowser).not.toHaveBeenCalled();
    expect(hooks.report).toHaveBeenCalledWith(expect.stringContaining("project changed"));
    hooks.isCurrent.mockReturnValue(true); hooks.select.mockResolvedValue(selected);
    await picker.open(hooks);
    expect(hooks.openNative).toHaveBeenCalledWith(selected.project, hooks.isCurrent);
  });

  it("passes the current-project guard to recovery and releases the picker on failure", async () => {
    const picker = new ProjectFileOpen(); const hooks = options();
    hooks.select.mockRejectedValueOnce(new Error("read failed"));
    await picker.open(hooks);
    expect(hooks.report).toHaveBeenCalledWith("Native open failed: read failed");
    expect(hooks.openBrowser).not.toHaveBeenCalled();
    await picker.open(hooks);
    expect(hooks.openNative).toHaveBeenCalledWith(selected.project, hooks.isCurrent);
  });
});
