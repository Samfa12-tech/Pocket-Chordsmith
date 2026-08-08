import { PCS_SHARE_PREFIX } from "../constants.js";
import { decodePcsPayload, encodePcsPayload } from "../../../pcs-format/src/index.js";

export function utf8ToBase64Url(text) {
  return encodePcsPayload(String(text));
}

export function base64UrlToUtf8(value) {
  return decodePcsPayload(String(value || ""));
}

export function buildPocketChordsmithShareCode(project) {
  return `${PCS_SHARE_PREFIX}${utf8ToBase64Url(JSON.stringify(project))}`;
}

export function parsePocketChordsmithShareCode(text) {
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

export function parsePocketChordsmithInput(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Pocket Audio Core needs a project JSON object, JSON string, or PCS1 share code.");
    if (trimmed.startsWith(PCS_SHARE_PREFIX)) return parsePocketChordsmithShareCode(trimmed);
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error("That does not look like valid Pocket Chordsmith JSON or a PCS1 share code.");
    }
  }
  if (input && typeof input === "object" && !Array.isArray(input)) return input;
  throw new Error("Pocket Audio Core needs a project JSON object, JSON string, or PCS1 share code.");
}
