export interface UndoStack<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
}

export function createUndoStack<T>(initial: T, limit = 80): UndoStack<T> {
  return { past: [], present: clone(initial), future: [], limit };
}

export function pushUndo<T>(stack: UndoStack<T>, next: T): UndoStack<T> {
  return {
    past: [...stack.past.slice(-stack.limit + 1), clone(stack.present)],
    present: clone(next),
    future: [],
    limit: stack.limit
  };
}

export function replacePresent<T>(stack: UndoStack<T>, present: T): UndoStack<T> {
  return { ...stack, present: clone(present) };
}

export function undo<T>(stack: UndoStack<T>): UndoStack<T> {
  if (!stack.past.length) return stack;
  const previous = stack.past[stack.past.length - 1];
  return {
    past: stack.past.slice(0, -1),
    present: clone(previous),
    future: [clone(stack.present), ...stack.future],
    limit: stack.limit
  };
}

export function redo<T>(stack: UndoStack<T>): UndoStack<T> {
  if (!stack.future.length) return stack;
  const next = stack.future[0];
  return {
    past: [...stack.past, clone(stack.present)].slice(-stack.limit),
    present: clone(next),
    future: stack.future.slice(1),
    limit: stack.limit
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
