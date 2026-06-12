import { describe, expect, it } from "vitest";
import { chordsmithStepDragAction } from "../src/app/chordsmithStepGestures";

describe("Chordsmith step drag gestures", () => {
  it("maps forward bass drags to holds on the later step", () => {
    expect(chordsmithStepDragAction(
      { kind: "bass", sectionId: "A", step: 4 },
      { kind: "bass", sectionId: "A", step: 5 }
    )).toMatchObject({
      selection: { kind: "bass", sectionId: "A", step: 5 },
      articulation: "hold",
      status: "Forward drag toggled bass hold."
    });
  });

  it("maps backward bass drags to slides on the later step", () => {
    expect(chordsmithStepDragAction(
      { kind: "bass", sectionId: "A", step: 5 },
      { kind: "bass", sectionId: "A", step: 4 }
    )).toMatchObject({
      selection: { kind: "bass", sectionId: "A", step: 5 },
      articulation: "slide",
      status: "Backward drag toggled bass slide."
    });
  });

  it("maps backward melody drags to tuplets and forward melody drags to holds", () => {
    expect(chordsmithStepDragAction(
      { kind: "melody", sectionId: "B", trackIndex: 1, step: 8 },
      { kind: "melody", sectionId: "B", trackIndex: 1, step: 7 }
    )).toMatchObject({
      selection: { kind: "melody", sectionId: "B", trackIndex: 1, step: 7 },
      articulation: "tuplet"
    });
    expect(chordsmithStepDragAction(
      { kind: "melody", sectionId: "B", trackIndex: 1, step: 7 },
      { kind: "melody", sectionId: "B", trackIndex: 1, step: 8 }
    )).toMatchObject({
      selection: { kind: "melody", sectionId: "B", trackIndex: 1, step: 8 },
      articulation: "hold"
    });
  });

  it("only maps backward adjacent drum drags within the same lane to tuplets", () => {
    expect(chordsmithStepDragAction(
      { kind: "drums", sectionId: "C", lane: "hat", step: 10 },
      { kind: "drums", sectionId: "C", lane: "hat", step: 9 }
    )).toMatchObject({
      selection: { kind: "drums", sectionId: "C", lane: "hat", step: 9 },
      articulation: "tuplet"
    });
    expect(chordsmithStepDragAction(
      { kind: "drums", sectionId: "C", lane: "hat", step: 9 },
      { kind: "drums", sectionId: "C", lane: "snare", step: 8 }
    )).toBeNull();
  });

  it("ignores non-adjacent or cross-section drags", () => {
    expect(chordsmithStepDragAction(
      { kind: "bass", sectionId: "A", step: 1 },
      { kind: "bass", sectionId: "A", step: 3 }
    )).toBeNull();
    expect(chordsmithStepDragAction(
      { kind: "bass", sectionId: "A", step: 1 },
      { kind: "bass", sectionId: "B", step: 2 }
    )).toBeNull();
  });
});
