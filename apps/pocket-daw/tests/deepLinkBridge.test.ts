import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadHandoffFileNameFromUrl,
  extractDeepLinkUrlsFromSecondInstancePayload,
  extractPocketDawProjectPathsFromLaunchPayload,
  handoffFromDownloadFilePayload,
  handoffFromLocalServerPayload
} from "../src/native/deepLinkBridge";
import { buildPocketHandoff, encodePocketHandoff } from "../src/native/pocketHandoff";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => true)
}));

const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  mockedInvoke.mockClear();
});

describe("deep link bridge", () => {
  it("extracts Pocket DAW protocol URLs from second-instance argv payloads", () => {
    const urls = extractDeepLinkUrlsFromSecondInstancePayload({
      argv: [
        "C:\\Program Files\\Pocket DAW\\Pocket DAW.exe",
        "--some-flag",
        "pocket-daw://handoff?pocketHandoff=abc123",
        "https://example.test/not-a-protocol-launch"
      ],
      cwd: "C:\\Users\\sam_s"
    });

    expect(urls).toEqual(["pocket-daw://handoff?pocketHandoff=abc123"]);
  });

  it("also accepts a raw argv array for test harnesses", () => {
    expect(extractDeepLinkUrlsFromSecondInstancePayload(["pocket-daw://handoff?pcs1=PCS1%3Atest"])).toEqual([
      "pocket-daw://handoff?pcs1=PCS1%3Atest"
    ]);
  });

  it("extracts Pocket DAW project paths from launch arguments", () => {
    const paths = extractPocketDawProjectPathsFromLaunchPayload({
      argv: [
        "C:\\Users\\sam_s\\AppData\\Local\\Pocket DAW\\pocket-daw.exe",
        "--some-flag",
        "C:\\Users\\sam_s\\Music\\lofi demo project.pocketdaw",
        "pocket-daw://handoff?pocketHandoff=abc123",
        "C:\\Users\\sam_s\\Music\\notes.txt"
      ],
      cwd: "C:\\Users\\sam_s"
    });

    expect(paths).toEqual(["C:\\Users\\sam_s\\Music\\lofi demo project.pocketdaw"]);
  });

  it("accepts quoted and file URL project launch arguments", () => {
    expect(extractPocketDawProjectPathsFromLaunchPayload([
      "\"C:\\Users\\sam_s\\Music\\quoted project.pocketdaw\"",
      "file:///C:/Users/sam_s/Music/url%20project.pocketdaw"
    ])).toEqual([
      "C:\\Users\\sam_s\\Music\\quoted project.pocketdaw",
      "C:\\Users\\sam_s\\Music\\url project.pocketdaw"
    ]);
  });

  it("decodes local loopback handoff payloads", () => {
    const encodedHandoff = encodePocketHandoff(buildPocketHandoff("chordsmith-to-daw", "PCS1:local"));
    const handoff = handoffFromLocalServerPayload({ encodedHandoff, receivedAt: "test" });

    expect(handoff?.source).toBe("local-server");
    expect(handoff?.code).toBe("PCS1:local");
    expect(handoff?.payload.kind).toBe("chordsmith-to-daw");
  });

  it("reports invalid local loopback handoff payloads", () => {
    const statuses: unknown[] = [];
    const handoff = handoffFromLocalServerPayload({ encodedHandoff: "not-valid", receivedAt: "test" }, (status) => statuses.push(status));

    expect(handoff).toBeNull();
    expect(statuses).toContainEqual(expect.objectContaining({
      source: "local-server",
      result: "failed-parse"
    }));
  });

  it("rejects stale or wrongly targeted local loopback handoff payloads", () => {
    const statuses: unknown[] = [];
    const stale = encodePocketHandoff(buildPocketHandoff("chordsmith-to-daw", "PCS1:stale", {
      createdAt: "2026-07-03T00:00:00.000Z",
      expiresAt: "2026-07-03T00:01:00.000Z"
    }));
    const wrongTarget = encodePocketHandoff({
      ...buildPocketHandoff("chordsmith-to-daw", "PCS1:wrong-target"),
      targetApp: "PocketDJ"
    });

    expect(handoffFromLocalServerPayload({ encodedHandoff: stale, receivedAt: "test" }, (status) => statuses.push(status))).toBeNull();
    expect(handoffFromLocalServerPayload({ encodedHandoff: wrongTarget, receivedAt: "test" }, (status) => statuses.push(status))).toBeNull();
    expect(statuses).toEqual([
      expect.objectContaining({ source: "local-server", result: "failed-parse" }),
      expect.objectContaining({ source: "local-server", result: "failed-parse" })
    ]);
  });

  it("keeps legacy PocketHandoff JSON importable through manual text import", () => {
    const legacy = {
      app: "PocketHandoff",
      handoffVersion: 1,
      kind: "chordsmith-to-daw",
      code: "PCS1:legacy",
      createdAt: "2026-01-01T00:00:00.000Z",
      sourceApp: "Pocket Chordsmith"
    };

    const handoff = handoffFromDownloadFilePayload({
      fileName: "pocket-chordsmith-to-pocket-daw-test-123.pcs1.txt",
      contents: JSON.stringify(legacy)
    });

    expect(handoff?.source).toBe("download-file");
    expect(handoff?.code).toBe(JSON.stringify(legacy));
  });

  it("extracts downloaded handoff file names from tiny protocol URLs", () => {
    const fileName = "pocket-chordsmith-to-pocket-daw-test-123.pcs1.txt";

    expect(downloadHandoffFileNameFromUrl(`pocket-daw://handoff?source=download&file=${encodeURIComponent(fileName)}`)).toBe(fileName);
    expect(downloadHandoffFileNameFromUrl("pocket-daw://handoff?source=loopback")).toBeNull();
  });

  it("wraps downloaded PCS1 handoff files for the existing importer", () => {
    const handoff = handoffFromDownloadFilePayload({
      fileName: "pocket-chordsmith-to-pocket-daw-test-123.pcs1.txt",
      contents: "PCS1:downloaded"
    });

    expect(handoff?.source).toBe("download-file");
    expect(handoff?.code).toBe("PCS1:downloaded");
    expect(handoff?.payload.kind).toBe("chordsmith-to-daw");
  });

  it("cleans up downloaded handoff files through the clear hook", async () => {
    const fileName = "pocket-chordsmith-to-pocket-daw-test-123.pcs1.txt";
    const handoff = handoffFromDownloadFilePayload({
      fileName,
      contents: "PCS1:downloaded"
    });

    handoff?.clear();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedInvoke).toHaveBeenCalledWith("delete_download_handoff_file", { fileName });
  });
});
