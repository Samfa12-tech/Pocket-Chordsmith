import { afterEach, describe, expect, it } from "vitest";
import { commandFromKeyboardEvent, isEditableTarget } from "../src/app/keyboard";

class FakeHTMLElement extends EventTarget {
  dataset: Record<string, string> = {};
  isContentEditable = false;
  tagName = "div";
}

function keyboardEvent(key: string, options: Partial<Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "target">> = {}) {
  return {
    key,
    code: key === " " ? "Space" : key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    ...options
  };
}

describe("keyboard command mapping", () => {
  const previousHTMLElement = globalThis.HTMLElement;

  afterEach(() => {
    globalThis.HTMLElement = previousHTMLElement;
  });

  it("maps DAW-style shortcuts", () => {
    expect(commandFromKeyboardEvent(keyboardEvent(" "))).toBe("play-pause");
    expect(commandFromKeyboardEvent(keyboardEvent("Home"))).toBe("seek-start");
    expect(commandFromKeyboardEvent(keyboardEvent("l"))).toBe("toggle-loop");
    expect(commandFromKeyboardEvent(keyboardEvent("p"))).toBe("loop-selected");
    expect(commandFromKeyboardEvent(keyboardEvent("M"))).toBe("mute-selected-track");
    expect(commandFromKeyboardEvent(keyboardEvent("s"))).toBe("solo-selected-track");
    expect(commandFromKeyboardEvent(keyboardEvent("r"))).toBe("arm-selected-track");
    expect(commandFromKeyboardEvent(keyboardEvent("d"))).toBe("duplicate-clip");
    expect(commandFromKeyboardEvent(keyboardEvent("x"))).toBe("split-clip");
    expect(commandFromKeyboardEvent(keyboardEvent("g"))).toBe("add-marker");
    expect(commandFromKeyboardEvent(keyboardEvent("Delete"))).toBe("delete-clip");
    expect(commandFromKeyboardEvent(keyboardEvent("ArrowLeft"))).toBe("move-clip-left");
    expect(commandFromKeyboardEvent(keyboardEvent("ArrowRight"))).toBe("move-clip-right");
    expect(commandFromKeyboardEvent(keyboardEvent("+"))).toBe("zoom-in");
    expect(commandFromKeyboardEvent(keyboardEvent("-"))).toBe("zoom-out");
    expect(commandFromKeyboardEvent(keyboardEvent("s", { ctrlKey: true }))).toBe("save-project");
    expect(commandFromKeyboardEvent(keyboardEvent("o", { ctrlKey: true }))).toBe("open-file");
    expect(commandFromKeyboardEvent(keyboardEvent("e", { ctrlKey: true }))).toBe("export-wav");
    expect(commandFromKeyboardEvent(keyboardEvent("c", { ctrlKey: true, shiftKey: true }))).toBe("copy-range");
    expect(commandFromKeyboardEvent(keyboardEvent("x", { ctrlKey: true, shiftKey: true }))).toBe("cut-range");
    expect(commandFromKeyboardEvent(keyboardEvent("x", { ctrlKey: true }))).toBe("cut-clip");
    expect(commandFromKeyboardEvent(keyboardEvent("c", { ctrlKey: true }))).toBe("copy-clip");
    expect(commandFromKeyboardEvent(keyboardEvent("v", { ctrlKey: true }))).toBe("paste-clip");
    expect(commandFromKeyboardEvent(keyboardEvent("t"))).toBe("add-track");
  });

  it("ignores editable fields and future note-entry surfaces", () => {
    globalThis.HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement;
    const input = new FakeHTMLElement();
    input.tagName = "input";
    const noteGrid = new FakeHTMLElement();
    noteGrid.dataset.noteInput = "true";
    const plain = new FakeHTMLElement();

    expect(isEditableTarget(input as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget(noteGrid as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget(plain as unknown as EventTarget)).toBe(false);
    expect(commandFromKeyboardEvent(keyboardEvent(" ", { target: input }))).toBeNull();
    expect(commandFromKeyboardEvent(keyboardEvent("d", { target: noteGrid }))).toBeNull();
  });
});
