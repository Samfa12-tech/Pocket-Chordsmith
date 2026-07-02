import type { JsonObject, PocketDawProject, SourceRef } from "./schema";

export interface PocketDjSourceSummary {
  sourceRefId: string;
  title: string;
  sourcePrefix: string;
  djVersion: number | null;
  currentSection: string | null;
  queuedSection: string | null;
  launchQuantize: string | null;
  dropTarget: string | null;
  loopCurrentSection: boolean;
  sequence: string[];
  sequencePlaying: boolean;
  sequenceRepeat: boolean;
  sequenceIndex: number;
  buildActive: boolean;
  masterVolume: number | null;
  stemVolumes: Record<string, number>;
  stemMutes: Record<string, boolean>;
  fx: Record<string, number>;
}

export function createPocketDjSourceSummary(project: PocketDawProject): PocketDjSourceSummary | null {
  const ref = project.sourceRefs.find((item) => item.sourceType === "pocket-dj");
  return ref ? pocketDjSourceSummaryFromRef(ref) : null;
}

export function pocketDjSourceSummaryFromRef(ref: SourceRef): PocketDjSourceSummary {
  const normalized = jsonObject(ref.normalized);
  const deck = jsonObject(normalized.deck);
  const performance = jsonObject(normalized.performance);
  return {
    sourceRefId: ref.id,
    title: stringValue(ref.title) || stringValue(deck.name) || "Pocket DJ Session",
    sourcePrefix: stringValue(ref.sourcePrefix) || "PDJ1",
    djVersion: numberOrNull(normalized.djVersion ?? ref.schemaVersion),
    currentSection: stringOrNull(performance.currentSection),
    queuedSection: stringOrNull(performance.queuedSection),
    launchQuantize: stringOrNull(performance.launchQuantize),
    dropTarget: stringOrNull(performance.dropTarget),
    loopCurrentSection: performance.loopCurrentSection === true,
    sequence: Array.isArray(performance.sequence) ? performance.sequence.filter((item): item is string => typeof item === "string") : [],
    sequencePlaying: performance.sequencePlaying === true,
    sequenceRepeat: performance.sequenceRepeat === true,
    sequenceIndex: Math.max(0, Math.floor(numberOrNull(performance.sequenceIndex) ?? 0)),
    buildActive: performance.buildActive === true,
    masterVolume: numberOrNull(performance.masterVolume),
    stemVolumes: numberMap(performance.stemVolumes),
    stemMutes: booleanMap(performance.stemMutes),
    fx: numberMap(performance.fx)
  };
}

function jsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown): string | null {
  const text = stringValue(value).trim();
  return text || null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberMap(value: unknown): Record<string, number> {
  const object = jsonObject(value);
  return Object.fromEntries(
    Object.entries(object)
      .map(([key, entry]) => [key, numberOrNull(entry)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== null)
  );
}

function booleanMap(value: unknown): Record<string, boolean> {
  const object = jsonObject(value);
  return Object.fromEntries(
    Object.entries(object)
      .filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
  );
}
