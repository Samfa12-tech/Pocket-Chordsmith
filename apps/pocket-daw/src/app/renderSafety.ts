const SAFE_HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CONTROL_OR_CSS_META = /[\u0000-\u001f\u007f;"'()\\]|url\s*\(|javascript\s*:|expression\s*\(|@import/i;

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'=]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;", "=": "&#61;" }[char] || char));
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

export function sanitizeDataAttr(value: unknown): string {
  return escapeAttr(value);
}

export function sanitizeDomId(value: unknown, fallback = "node"): string {
  const safe = String(value || "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return safe || fallback;
}

export function sanitizeCssColor(value: unknown, fallback = "#40d8ff"): string {
  const colour = String(value || "").trim();
  if (!SAFE_HEX_COLOUR.test(colour)) return fallback;
  if (CONTROL_OR_CSS_META.test(colour)) return fallback;
  return colour;
}

export function sanitizeCssLengthOrNumber(value: unknown, fallback = 0, min = 0, max = 100_000): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(fallback);
  return String(Math.max(min, Math.min(max, number)));
}

export function safeTrackColour(value: unknown): string {
  return sanitizeCssColor(value, "#40d8ff");
}

export function safeClipColour(value: unknown): string {
  return sanitizeCssColor(value, "#40d8ff");
}
