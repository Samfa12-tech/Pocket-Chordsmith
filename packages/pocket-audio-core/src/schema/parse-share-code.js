import { PCS_SHARE_PREFIX } from "../constants.js";

export function utf8ToBase64Url(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoaCompat(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToUtf8(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atobCompat(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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

function btoaCompat(binary) {
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

function atobCompat(encoded) {
  if (typeof atob === "function") return atob(encoded);
  return Buffer.from(encoded, "base64").toString("binary");
}
