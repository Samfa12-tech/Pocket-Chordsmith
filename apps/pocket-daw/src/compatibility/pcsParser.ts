import { parsePocketDawProjectFile } from "../daw/dawProject";
import { migratePocketDawProject } from "./migrations";

export const PCS_SHARE_PREFIX = "PCS1:";
export const POCKET_DJ_SHARE_PREFIX = "PDJ1:";

export type ImportParseResult =
  | { kind: "pocketdaw"; data: ReturnType<typeof migratePocketDawProject> }
  | { kind: "pcs"; data: unknown; importKind: "PCS1" | "raw-json" }
  | { kind: "pdj"; data: unknown; importKind: "PDJ1" | "raw-json" };

export function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToUtf8(value: string): string {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function parsePocketChordsmithShareCode(text: string): unknown {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith(PCS_SHARE_PREFIX)) {
    throw new Error("That does not look like a Pocket Chordsmith PCS1 share code.");
  }
  const payload = trimmed.slice(PCS_SHARE_PREFIX.length).trim();
  if (!payload) throw new Error("That PCS1 share code is empty.");
  let decoded = "";
  try {
    decoded = base64UrlToUtf8(payload);
  } catch {
    throw new Error("That PCS1 share code could not be decoded.");
  }
  try {
    return JSON.parse(decoded);
  } catch {
    throw new Error("That PCS1 share code decoded, but the project JSON was invalid.");
  }
}

export function parsePocketChordsmithJson(text: string): unknown {
  try {
    return JSON.parse(String(text || "").trim());
  } catch {
    throw new Error("That does not look like valid JSON or a PCS1 share code.");
  }
}

export function parseAnyImportText(text: string): ImportParseResult {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Paste a PCS1 share code, Pocket Chordsmith JSON, or .pocketdaw JSON first.");

  if (trimmed.startsWith(PCS_SHARE_PREFIX)) {
    return { kind: "pcs", data: parsePocketChordsmithShareCode(trimmed), importKind: "PCS1" };
  }

  if (trimmed.startsWith(POCKET_DJ_SHARE_PREFIX)) {
    const decoded = base64UrlToUtf8(trimmed.slice(POCKET_DJ_SHARE_PREFIX.length).trim());
    return { kind: "pdj", data: JSON.parse(decoded), importKind: "PDJ1" };
  }

  const parsed = parsePocketChordsmithJson(trimmed);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const maybeApp = (parsed as Record<string, unknown>).app;
    if (maybeApp === "PocketDAW") {
      return { kind: "pocketdaw", data: migratePocketDawProject(parsePocketDawProjectFile(parsed)) };
    }
    if (maybeApp === "PocketDJ") return { kind: "pdj", data: parsed, importKind: "raw-json" };
  }
  return { kind: "pcs", data: parsed, importKind: "raw-json" };
}

export function buildPocketChordsmithShareCode(project: unknown): string {
  return `${PCS_SHARE_PREFIX}${utf8ToBase64Url(JSON.stringify(project))}`;
}
