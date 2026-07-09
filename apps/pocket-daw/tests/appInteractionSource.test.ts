import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("App interaction source guards", () => {
  it("clears stale clip selection when a plain track header is selected", () => {
    const source = readFileSync("src/app/App.ts", "utf8");
    const trackClickHandler = source.slice(
      source.indexOf('this.root.querySelectorAll<HTMLElement>("[data-track-id]")'),
      source.indexOf('this.root.querySelectorAll<HTMLInputElement>("[data-volume]")')
    );

    expect(trackClickHandler).toContain("this.state.selectedTrackId = el.dataset.trackId || null");
    expect(trackClickHandler).toContain("this.state.selectedClipId = null");
    expect(trackClickHandler).toContain("this.state.selectedClipIds = []");
  });

  it("routes More by Samfa12 and feedback mailto through the external-link bridge", () => {
    const source = readFileSync("src/app/App.ts", "utf8");
    const moreAction = source.slice(
      source.indexOf('if (action === "more-by-samfa12")'),
      source.indexOf('if (action === "studio-focus-timeline")')
    );
    const feedbackSend = source.slice(source.indexOf("private async sendFeedbackEmail"), source.indexOf("private async openExternalUrl"));
    const externalUrlHelper = source.slice(source.indexOf("private async openExternalUrl"), source.indexOf("private async refreshAudioDevices"));

    expect(moreAction).toContain("await this.openExternalUrl(MORE_BY_SAMFA12_URL)");
    expect(feedbackSend).toContain("await this.openExternalUrl(draft.mailtoUrl)");
    expect(externalUrlHelper).toContain("await openExternalUrlNative(url)");
    expect(externalUrlHelper).toContain("if (isNativeExternalLinkAvailable())");
    expect(externalUrlHelper.indexOf("if (isNativeExternalLinkAvailable())")).toBeLessThan(externalUrlHelper.indexOf("window.open"));
  });
});
