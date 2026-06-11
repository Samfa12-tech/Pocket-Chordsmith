import { readPocketDawHandoff } from "./pocketHandoff";

export function readHandoffImportText(): string | null {
  try {
    return readPocketDawHandoff()?.code || null;
  } catch {
    return null;
  }
}
