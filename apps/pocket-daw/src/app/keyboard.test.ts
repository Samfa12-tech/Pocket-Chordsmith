import { describe, expect, it } from "vitest";
import { commandFromKeyboardEvent } from "./keyboard";

describe("Pocket DAW keyboard shortcuts", () => {
  it("treats space key variants as play/pause", () => {
    expect(commandFromKeyboardEvent(keyEvent({ key: " ", code: "Space" }))).toBe("play-pause");
    expect(commandFromKeyboardEvent(keyEvent({ key: "Space", code: "Space" }))).toBe("play-pause");
    expect(commandFromKeyboardEvent(keyEvent({ key: "Spacebar", code: "Space" }))).toBe("play-pause");
  });

  it("does not steal space from editable fields", () => {
    class FakeHTMLElement extends EventTarget {
      dataset: Record<string, string> = {};
      isContentEditable = false;
      tagName: string;

      constructor(tagName: string) {
        super();
        this.tagName = tagName;
      }
    }

    const previousHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement;
    try {
      const input = new FakeHTMLElement("INPUT");
      expect(commandFromKeyboardEvent(keyEvent({ key: " ", code: "Space", target: input }))).toBeNull();
    } finally {
      globalThis.HTMLElement = previousHTMLElement;
    }
  });
});

function keyEvent(overrides: Partial<Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "target">> = {}) {
  return {
    key: " ",
    code: "Space",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    ...overrides
  };
}
