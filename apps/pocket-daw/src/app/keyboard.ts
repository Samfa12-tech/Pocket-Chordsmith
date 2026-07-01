export type KeyboardCommand =
  | "play-pause"
  | "seek-start"
  | "toggle-loop"
  | "mute-selected-track"
  | "solo-selected-track"
  | "arm-selected-track"
  | "duplicate-clip"
  | "copy-clip"
  | "cut-clip"
  | "copy-range"
  | "cut-range"
  | "paste-clip"
  | "delete-clip"
  | "split-clip"
  | "loop-selected"
  | "add-marker"
  | "move-clip-left"
  | "move-clip-right"
  | "zoom-in"
  | "zoom-out"
  | "undo"
  | "redo"
  | "save-project"
  | "open-file"
  | "export-wav"
  | "add-track";

export function commandFromKeyboardEvent(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "target">): KeyboardCommand | null {
  if (isEditableTarget(event.target)) return null;
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (ctrl && !event.altKey && !event.shiftKey && key === "z") return "undo";
  if (ctrl && !event.altKey && !event.shiftKey && key === "y") return "redo";
  if (ctrl && !event.altKey && !event.shiftKey && key === "s") return "save-project";
  if (ctrl && !event.altKey && !event.shiftKey && key === "o") return "open-file";
  if (ctrl && !event.altKey && !event.shiftKey && key === "e") return "export-wav";
  if (ctrl && !event.altKey && event.shiftKey && key === "c") return "copy-range";
  if (ctrl && !event.altKey && event.shiftKey && key === "x") return "cut-range";
  if (ctrl && !event.altKey && !event.shiftKey && key === "c") return "copy-clip";
  if (ctrl && !event.altKey && !event.shiftKey && key === "x") return "cut-clip";
  if (ctrl && !event.altKey && !event.shiftKey && key === "v") return "paste-clip";
  if (ctrl || event.metaKey || event.altKey) return null;
  if (isSpacebarEvent(event)) return "play-pause";
  if (event.key === "Home") return "seek-start";
  if (event.key === "Delete" || event.key === "Backspace") return "delete-clip";
  if (event.key === "ArrowLeft") return "move-clip-left";
  if (event.key === "ArrowRight") return "move-clip-right";
  if (key === "l") return "toggle-loop";
  if (key === "p") return "loop-selected";
  if (key === "m") return "mute-selected-track";
  if (key === "s") return "solo-selected-track";
  if (key === "r") return "arm-selected-track";
  if (key === "d") return "duplicate-clip";
  if (key === "x") return "split-clip";
  if (key === "g") return "add-marker";
  if (key === "t") return "add-track";
  if (key === "+" || key === "=") return "zoom-in";
  if (key === "-" || key === "_") return "zoom-out";
  return null;
}

function isSpacebarEvent(event: Pick<KeyboardEvent, "key" | "code">): boolean {
  return event.code === "Space" || event.key === " " || event.key === "Spacebar" || event.key === "Space";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.dataset.noteInput === "true") return true;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
