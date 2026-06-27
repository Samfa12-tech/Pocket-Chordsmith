import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { nativeRenderCacheSignature } from "../src/audio/nativeRenderCache";
import { applyBassPresetCommand, applyDrumPresetCommand, applyGuitarPresetCommand, cycleDrumStepCommand, toggleBassTupletCommand } from "../src/app/commands";
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

  it("applies drum presets through the editor command path", () => {
    const state = createInitialState();
    const next = applyDrumPresetCommand(state, "A", "money");
    const pcs = getPrimaryChordsmithSource(next.undoStack.present);

    expect(next.status).toBe("Applied Basic rock drum preset to Section A.");
    expect(pcs?.sections.A.grid.kick[0]).toBe(1);
    expect(pcs?.sections.A.grid.snare[4]).toBe(2);
    expect(renderTimelineEvents(next.undoStack.present).some((event) => event.kind === "snare" && event.step === 4 && event.accent)).toBe(true);
  });

  it("rejects drum presets that do not match the current time signature", () => {
    const state = createInitialState();
    const threeFour = applyDrumPresetCommand(state, "A", "lofi_sleepy_waltz_3_4");

    expect(threeFour.undoStack.present).toBe(state.undoStack.present);
    expect(threeFour.status).toBe("Choose a drum preset available for this time signature.");
  });

  it("applies guitar presets through the editor command path", () => {
    const state = createInitialState();
    const next = applyGuitarPresetCommand(state, "A", "metal_chug");
    const pcs = getPrimaryChordsmithSource(next.undoStack.present);

    expect(next.status).toBe("Applied Metal chug guitar preset to Section A.");
    expect(pcs?.guitarEnabled).toBe(true);
    expect(pcs?.guitarPatternPreset).toBe("metal_chug");
    expect(pcs?.sections.A.guitarPattern[0]).toBe("accent");
    expect(pcs?.sections.A.guitarPattern[1]).toBe("chug");
    expect(renderTimelineEvents(next.undoStack.present).some((event) => event.kind === "guitar" && event.step === 1)).toBe(true);
  });

  it("applies bass presets through the editor command path", () => {
    const state = createInitialState();
    const next = applyBassPresetCommand(state, "A", "copy_kick");
    const pcs = getPrimaryChordsmithSource(next.undoStack.present);

    expect(next.status).toBe("Applied Copy kick bass preset to Section A.");
    expect(pcs?.bassMode).toBe("manual");
    expect(pcs?.sections.A.bassNotes[0]).toBe(0);
    expect(renderTimelineEvents(next.undoStack.present).some((event) => event.kind === "bass" && event.step === 0)).toBe(true);
  });

  it("rejects unavailable bass presets", () => {
    const state = createInitialState();
    const next = applyBassPresetCommand(state, "A", "not_a_bass_preset");

    expect(next.undoStack.present).toBe(state.undoStack.present);
    expect(next.status).toBe("Choose a valid bass preset.");
  });

  it("toggles bass tuplets through the editor command path", () => {
    const state = createInitialState();
    const next = toggleBassTupletCommand(state, "A", 2);
    const pcs = getPrimaryChordsmithSource(next.undoStack.present);

    expect(pcs?.sections.A.gridTuplets.bass[2]).toBe(true);
  });
});
