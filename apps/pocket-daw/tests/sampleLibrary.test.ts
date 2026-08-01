import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptySampleLibraryIndex,
  filterSampleLibraryEntries,
  inferSampleCategory,
  loadSampleLibraryIndex,
  mergeSampleLibraryDiscovery,
  recentSampleLibraryEntries,
  recordSampleRecent,
  removeSampleLibraryFolder,
  SAMPLE_LIBRARY_RECENT_LIMIT,
  saveSampleLibraryIndex,
  sanitizeSampleLibraryIndex,
  selectSampleLibraryFolderNative,
  toggleSampleFavorite,
  type DiscoveredSampleFile,
  type NativeSampleLibraryApi,
  type NativeSampleLibraryDiscovery
} from "../src/native/sampleLibrary";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) || null; }
  key(index: number) { return [...this.values.keys()][index] || null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const folderDiscovery: NativeSampleLibraryDiscovery = {
  rootPath: "C:\\Samples\\Pocket Kit",
  rootLabel: "Pocket Kit",
  warnings: [],
  truncated: false,
  files: [
    sample("C:\\Samples\\Pocket Kit\\Drums\\lofi_kick.WAV", 1200),
    sample("C:\\Samples\\Pocket Kit\\Keys\\dusty_rhodes.flac", 2400),
    sample("C:\\Samples\\Pocket Kit\\Notes.txt", 20) as NativeSampleLibraryDiscovery["files"][number]
  ]
};

describe("sample library", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("merges supported discovered files, categorizes them, and replaces a folder scan", () => {
    const first = mergeSampleLibraryDiscovery(createEmptySampleLibraryIndex(), folderDiscovery, "folder", "2026-08-01T00:00:00.000Z");
    expect(first.folders).toHaveLength(1);
    expect(first.entries.map((entry) => [entry.name, entry.category])).toEqual([
      ["lofi_kick.WAV", "drums"],
      ["dusty_rhodes.flac", "chords"]
    ]);

    const refreshed = mergeSampleLibraryDiscovery(first, {
      ...folderDiscovery,
      files: [sample("C:\\Samples\\Pocket Kit\\Drums\\new_snare.wav", 900)]
    }, "folder", "2026-08-02T00:00:00.000Z");
    expect(refreshed.entries.map((entry) => entry.name)).toEqual(["new_snare.wav"]);
    expect(refreshed.folders[0].addedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(refreshed.folders[0].lastScannedAt).toBe("2026-08-02T00:00:00.000Z");
  });

  it("searches all tokens and combines category, folder, and favorite filters", () => {
    let index = mergeSampleLibraryDiscovery(createEmptySampleLibraryIndex(), folderDiscovery, "folder");
    const kick = index.entries.find((entry) => entry.category === "drums")!;
    index = toggleSampleFavorite(index, kick.id);

    expect(filterSampleLibraryEntries(index, { query: "lofi WAV", category: "drums", favoritesOnly: true, folderId: index.folders[0].id }))
      .toEqual([kick]);
    expect(filterSampleLibraryEntries(index, { query: "snare" })).toEqual([]);
  });

  it("keeps ordered recents bounded and removes dangling local metadata", () => {
    let index = createEmptySampleLibraryIndex();
    for (let number = 0; number < SAMPLE_LIBRARY_RECENT_LIMIT + 5; number += 1) {
      index = mergeSampleLibraryDiscovery(index, {
        rootPath: null,
        rootLabel: null,
        warnings: [],
        truncated: false,
        files: [sample(`C:\\Loose\\hit-${number}.wav`, number)]
      }, "file");
      index = recordSampleRecent(index, index.entries[0].id);
    }
    expect(recentSampleLibraryEntries(index)).toHaveLength(SAMPLE_LIBRARY_RECENT_LIMIT);
    const folderIndex = mergeSampleLibraryDiscovery(index, folderDiscovery, "folder");
    const folderEntry = folderIndex.entries.find((entry) => entry.source === "folder")!;
    const favorite = toggleSampleFavorite(folderIndex, folderEntry.id);
    const removed = removeSampleLibraryFolder(favorite, favorite.folders[0].id);
    expect(removed.entries.some((entry) => entry.id === folderEntry.id)).toBe(false);
    expect(removed.favoriteIds).not.toContain(folderEntry.id);
  });

  it("sanitizes untrusted persisted state and never treats paths as project data", () => {
    const clean = sanitizeSampleLibraryIndex({
      version: 999,
      entries: [
        { path: "C:\\Sounds\\Kick.wav", id: "kick", category: "wrong", source: "folder", sizeBytes: -5 },
        { path: "C:\\Sounds\\readme.txt", id: "bad" }
      ],
      folders: [{ path: "C:\\Sounds", id: "sounds" }],
      favoriteIds: ["kick", "missing"],
      recentIds: ["missing", "kick"],
      settings: { previewVolume: 9, lastFolderId: "missing" }
    });
    expect(clean.version).toBe(1);
    expect(clean.entries).toHaveLength(1);
    expect(clean.entries[0]).toMatchObject({ path: "C:\\Sounds\\Kick.wav", category: "drums", sizeBytes: 0 });
    expect(clean.favoriteIds).toEqual(["kick"]);
    expect(clean.recentIds).toEqual(["kick"]);
    expect(clean.settings).toMatchObject({ previewVolume: 1, lastFolderId: null });
  });

  it("persists through native app-data commands and uses local storage only as a browser fallback", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const stored = mergeSampleLibraryDiscovery(createEmptySampleLibraryIndex(), folderDiscovery, "folder");
    const api: NativeSampleLibraryApi = {
      isAvailable: () => true,
      invoke: async <T>(command: string, args?: Record<string, unknown>) => {
        calls.push([command, args]);
        return (command === "sample_library_load_state" ? stored : undefined) as T;
      }
    };
    expect((await loadSampleLibraryIndex(api)).entries).toHaveLength(2);
    await saveSampleLibraryIndex(stored, api);
    expect(calls.map(([command]) => command)).toEqual(["sample_library_load_state", "sample_library_save_state"]);
    expect(calls[1][1]).toHaveProperty("state.version", 1);

    const browserApi: NativeSampleLibraryApi = { isAvailable: () => false, invoke: async () => { throw new Error("unused"); } };
    await saveSampleLibraryIndex(stored, browserApi);
    expect((await loadSampleLibraryIndex(browserApi)).entries).toHaveLength(2);
  });

  it("validates native discovery payloads", async () => {
    const api: NativeSampleLibraryApi = {
      isAvailable: () => true,
      invoke: async <T>() => folderDiscovery as T
    };
    const selected = await selectSampleLibraryFolderNative(api);
    expect(selected?.files.map((file) => file.name)).toEqual(["lofi_kick.WAV", "dusty_rhodes.flac"]);
  });

  it("recognizes starter-sound naming conventions", () => {
    expect(inferSampleCategory("open_hat.wav")).toBe("drums");
    expect(inferSampleCategory("melody_soft_pluck.wav")).toBe("melody");
    expect(inferSampleCategory("victory_hit.wav")).toBe("fx");
  });
});

function sample(path: string, sizeBytes: number): DiscoveredSampleFile {
  const name = path.split("\\").pop()!;
  return {
    path,
    name,
    folderPath: path.slice(0, path.length - name.length - 1),
    extension: (name.split(".").pop() || "").toLowerCase() as DiscoveredSampleFile["extension"],
    sizeBytes,
    modifiedUnixMs: 1_700_000_000_000
  };
}
