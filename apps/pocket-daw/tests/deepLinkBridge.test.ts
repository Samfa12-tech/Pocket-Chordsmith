import { describe, expect, it } from "vitest";
import {
  downloadHandoffFileNameFromUrl,
  extractDeepLinkUrlsFromSecondInstancePayload,
  handoffFromDownloadFilePayload,
  handoffFromLocalServerPayload
} from "../src/native/deepLinkBridge";
import { buildPocketHandoff, encodePocketHandoff } from "../src/native/pocketHandoff";

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
});
