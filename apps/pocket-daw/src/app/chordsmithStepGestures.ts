import type { ChordsmithStepSelection } from "./state";

export type ChordsmithStepArticulation = "hold" | "slide" | "tuplet";

export interface ChordsmithStepDragAction {
  selection: ChordsmithStepSelection;
  articulation: ChordsmithStepArticulation;
  status: string;
}

export function chordsmithStepDragAction(start: ChordsmithStepSelection, end: ChordsmithStepSelection): ChordsmithStepDragAction | null {
  if (start.kind !== end.kind || start.sectionId !== end.sectionId || Math.abs(start.step - end.step) !== 1) return null;
  if (start.kind === "drums") {
    if (end.kind !== "drums" || start.lane !== end.lane || end.step >= start.step) return null;
    return {
      selection: { ...start, step: Math.min(start.step, end.step) },
      articulation: "tuplet",
      status: "Backward drag toggled drum tuplet."
    };
  }
  if (start.kind === "bass") {
    if (end.kind !== "bass") return null;
    return {
      selection: { ...start, step: Math.max(start.step, end.step) },
      articulation: end.step > start.step ? "hold" : "slide",
      status: end.step > start.step ? "Forward drag toggled bass hold." : "Backward drag toggled bass slide."
    };
  }
  if (start.kind === "melody") {
    if (end.kind !== "melody" || start.trackIndex !== end.trackIndex) return null;
    if (end.step < start.step) {
      return {
        selection: { ...start, step: Math.min(start.step, end.step) },
        articulation: "tuplet",
        status: "Backward drag toggled melody tuplet."
      };
    }
    return {
      selection: { ...start, step: end.step },
      articulation: "hold",
      status: "Forward drag toggled melody hold."
    };
  }
  return null;
}
