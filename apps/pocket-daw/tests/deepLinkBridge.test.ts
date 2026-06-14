import { describe, expect, it } from "vitest";
import { extractDeepLinkUrlsFromSecondInstancePayload } from "../src/native/deepLinkBridge";

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
});
