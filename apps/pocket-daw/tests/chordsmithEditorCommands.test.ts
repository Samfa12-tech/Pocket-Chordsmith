import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { nativeRenderCacheSignature } from "../src/audio/nativeRenderCache";
import { cycleDrumStepCommand, toggleBassTupletCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { getPrimaryChordsmithSource } from "../src/daw/chordsmithEditor";

describe("Chordsmith editor command integration", () => {
  it("changes drum source data and regenerated playback events", () => {
    const state = createInitialState();
    const next = cycleDrumStepCommand(state, "A", "kick", 1);
    const pcs = getPrimaryChordsmithSource(next.undoStack.present);

    expect(pcs?.sections.A.grid.kick[1]).toBe(1);
    expect(renderTimelineEvents(next.undoStack.present).some((event) => event.kind === "kick" && event.step === 1)).toBe(true);
  });

  it("changes the native render cache signature after a Chordsmith source edit", () => {
    const state = createInitialState();
    const before = nativeRenderCacheSignature(state.undoStack.present);
    const next = cycleDrumStepCommand(state, "A", "kick", 1);

    expect(nativeRenderCacheSignature(next.undoStack.present)).not.toBe(before);
  });

  it("toggles bass tuplets through the editor command path", () => {
    const state = createInitialState();
    const next = toggleBassTupletCommand(state, "A", 2);
    const pcs = getPrimaryChordsmithSource(next.undoStack.present);

    expect(pcs?.sections.A.gridTuplets.bass[2]).toBe(true);
  });
});
