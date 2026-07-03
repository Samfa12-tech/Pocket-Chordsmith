import { describe, expect, it } from "vitest";
import { configureHiddenFileInput } from "../src/app/fileInputs";

function createFakeFileInput() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    type: "",
    accept: "",
    tabIndex: 0,
    style: {} as Record<string, string>,
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    addEventListener(name: string, handler: () => void) {
      listeners[name] = [...(listeners[name] || []), handler];
    },
    listeners
  };
}

describe("hidden file inputs", () => {
  it("keeps native file pickers out of the visible app layout", () => {
    const input = createFakeFileInput();
    let changed = false;

    configureHiddenFileInput(input as unknown as HTMLInputElement, {
      accept: ".pocketdaw",
      label: "project-open",
      onChange: () => {
        changed = true;
      }
    });

    expect(input.type).toBe("file");
    expect(input.accept).toBe(".pocketdaw");
    expect(input.tabIndex).toBe(-1);
    expect(input.attributes["aria-hidden"]).toBe("true");
    expect(input.attributes["data-hidden-file-input"]).toBe("project-open");
    expect(input.style).toMatchObject({
      position: "fixed",
      left: "-10000px",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none"
    });

    input.listeners.change[0]();
    expect(changed).toBe(true);
  });
});
