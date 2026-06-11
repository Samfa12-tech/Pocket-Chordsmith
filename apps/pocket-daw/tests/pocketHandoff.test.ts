import { describe, expect, it } from "vitest";
import {
  buildPocketHandoff,
  clearUrlHandoff,
  decodePocketHandoff,
  encodePocketHandoff,
  HANDOFF_WINDOW_PREFIX,
  readStoredHandoff,
  readUrlHandoff,
  readWindowNameHandoff
} from "../src/native/pocketHandoff";

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

describe("PocketHandoff compatibility", () => {
  it("encodes and decodes PocketHandoff envelopes", () => {
    const payload = buildPocketHandoff("pcs-to-daw", "PCS1:test", {
      createdAt: "2026-06-11T00:00:00.000Z",
      sourceApp: "Pocket Chordsmith",
      metadata: { songTitle: "Test" }
    });
    const encoded = encodePocketHandoff(payload);

    expect(decodePocketHandoff(encoded)).toMatchObject({
      app: "PocketHandoff",
      handoffVersion: 1,
      kind: "pcs-to-daw",
      code: "PCS1:test",
      sourceApp: "Pocket Chordsmith"
    });
  });

  it("reads envelope and legacy imports from URL query/hash sources", () => {
    const payload = buildPocketHandoff("dj-to-daw", "{\"session\":true}", { createdAt: "2026-06-11T00:00:00.000Z" });
    const encoded = encodePocketHandoff(payload);
    const handoff = readUrlHandoff(`https://example.test/daw?pocketHandoff=${encoded}`);
    const legacy = readUrlHandoff("https://example.test/daw#pcs1=PCS1%3Alegacy");

    expect(handoff?.source).toBe("url");
    expect(handoff?.payload.kind).toBe("dj-to-daw");
    expect(handoff?.code).toBe("{\"session\":true}");
    expect(legacy?.payload.kind).toBe("chordsmith-to-daw");
    expect(legacy?.code).toBe("PCS1:legacy");
  });

  it("reads window.name and localStorage fallback envelopes", () => {
    const payload = buildPocketHandoff("import", "{\"raw\":true}", { createdAt: "2026-06-11T00:00:00.000Z" });
    const storage = new MemoryStorage();
    storage.setItem("PocketHandoff", encodePocketHandoff(payload));

    expect(readWindowNameHandoff(`${HANDOFF_WINDOW_PREFIX}${encodePocketHandoff(payload)}`)?.code).toBe("{\"raw\":true}");
    expect(readStoredHandoff(storage)?.source).toBe("localStorage");
  });

  it("clears consumed handoff params and fragments without removing unrelated query params", () => {
    const payload = buildPocketHandoff("pcs-to-daw", "PCS1:test", { createdAt: "2026-06-11T00:00:00.000Z" });
    const cleanedQuery = clearUrlHandoff(`https://example.test/daw?keep=1&pocketHandoff=${encodePocketHandoff(payload)}`);
    const cleanedHash = clearUrlHandoff("https://example.test/daw?keep=1#pcs1=PCS1%3Astale&other=2");

    expect(cleanedQuery).toBe("https://example.test/daw?keep=1");
    expect(cleanedHash).toBe("https://example.test/daw?keep=1");
  });
});
