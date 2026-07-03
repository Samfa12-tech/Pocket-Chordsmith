import { describe, expect, it } from "vitest";
import {
  buildPocketHandoff,
  clearUrlHandoff,
  decodePocketHandoff,
  encodePocketHandoff,
  HANDOFF_WINDOW_PREFIX,
  inspectDeepLinkHandoff,
  readDeepLinkHandoff,
  readStoredHandoff,
  readUrlHandoff,
  readWindowNameHandoff,
  validatePocketHandoffEnvelope
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
      sourceApp: "Pocket Chordsmith",
      targetApp: "PocketDAW",
      nonce: expect.any(String),
      expiresAt: expect.any(String)
    });
  });

  it("validates fresh target-addressed handoff envelopes", () => {
    const payload = buildPocketHandoff("pcs-to-daw", "PCS1:test", {
      createdAt: "2026-07-03T00:00:00.000Z",
      expiresAt: "2026-07-03T00:05:00.000Z",
      nonce: "abc12345"
    });

    expect(validatePocketHandoffEnvelope(payload, {
      now: new Date("2026-07-03T00:01:00.000Z"),
      requireFreshness: true,
      requireTarget: true
    })).toEqual({ ok: true });
  });

  it("rejects expired or wrongly targeted strict handoff envelopes", () => {
    const expired = buildPocketHandoff("pcs-to-daw", "PCS1:test", {
      createdAt: "2026-07-03T00:00:00.000Z",
      expiresAt: "2026-07-03T00:05:00.000Z"
    });
    const wrongTarget = { ...expired, expiresAt: "2026-07-03T00:30:00.000Z", targetApp: "PocketDJ" };

    expect(validatePocketHandoffEnvelope(expired, {
      now: new Date("2026-07-03T00:06:00.000Z"),
      requireFreshness: true,
      requireTarget: true
    })).toMatchObject({ ok: false, message: expect.stringContaining("expired") });
    expect(validatePocketHandoffEnvelope(wrongTarget, {
      now: new Date("2026-07-03T00:01:00.000Z"),
      requireFreshness: true,
      requireTarget: true
    })).toMatchObject({ ok: false, message: expect.stringContaining("not supported") });
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

  it("reads installed-app deep links without accepting arbitrary schemes", () => {
    const payload = buildPocketHandoff("chordsmith-to-daw", "PCS1:deep-link", {
      createdAt: "2026-06-11T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
    const encoded = encodePocketHandoff(payload);

    const handoff = readDeepLinkHandoff(`pocket-daw://handoff?pocketHandoff=${encoded}`);
    const rejected = readDeepLinkHandoff(`https://example.test/daw?pocketHandoff=${encoded}`);

    expect(handoff?.source).toBe("deep-link");
    expect(handoff?.code).toBe("PCS1:deep-link");
    expect(rejected).toBeNull();
  });

  it("classifies malformed installed-app deep links as failed parse", () => {
    const malformed = inspectDeepLinkHandoff("pocket-daw://handoff?pocketHandoff=not-a-valid-envelope");
    const ignored = inspectDeepLinkHandoff("https://example.test/daw?pocketHandoff=not-a-valid-envelope");
    const wakeOnly = inspectDeepLinkHandoff("pocket-daw://handoff?source=loopback");

    expect(malformed).toMatchObject({
      result: "failed-parse",
      message: expect.stringContaining("valid PocketHandoff")
    });
    expect(ignored).toMatchObject({
      result: "ignored"
    });
    expect(wakeOnly).toMatchObject({
      result: "ignored",
      message: expect.stringContaining("waiting for the local handoff")
    });
  });
});
