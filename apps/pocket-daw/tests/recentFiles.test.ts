import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAutosave, loadAutosaveFileState, saveAutosave } from "../src/native/recentFiles";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) || null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] || null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("recent files and autosave metadata", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the current native project path alongside autosave JSON", () => {
    saveAutosave("{\"app\":\"PocketDAW\"}", {
      path: "C:\\Users\\sam_s\\Documents\\Pocket Chordsmith\\song.pocketdaw",
      label: "song.pocketdaw"
    });

    expect(loadAutosave()).toBe("{\"app\":\"PocketDAW\"}");
    expect(loadAutosaveFileState()).toEqual({
      path: "C:\\Users\\sam_s\\Documents\\Pocket Chordsmith\\song.pocketdaw",
      label: "song.pocketdaw"
    });
  });
});
