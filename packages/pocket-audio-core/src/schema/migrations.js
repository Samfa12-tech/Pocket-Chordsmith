import { DEFAULT_SOURCE_SCHEMA_VERSION } from "../constants.js";

export function detectPocketChordsmithSchema(raw) {
  const version = Number(raw?.projectVersion ?? raw?.schemaVersion ?? DEFAULT_SOURCE_SCHEMA_VERSION);
  return Number.isFinite(version) ? Math.max(1, Math.floor(version)) : DEFAULT_SOURCE_SCHEMA_VERSION;
}

export function migratePocketChordsmithProject(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Pocket Chordsmith project data must be a JSON object.");
  }
  return {
    project: raw,
    sourceSchemaVersion: detectPocketChordsmithSchema(raw),
    migrationNotes: []
  };
}
