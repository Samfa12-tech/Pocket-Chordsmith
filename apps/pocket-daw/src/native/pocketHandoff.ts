import type { JsonObject } from "../daw/schema";

export const HANDOFF_APP = "PocketHandoff" as const;
export const HANDOFF_VERSION = 1;
export const HANDOFF_WINDOW_PREFIX = "PocketHandoff:";
export const HANDOFF_STORAGE_KEYS = ["PocketHandoff", "pocketHandoff", "pocket-daw:handoff"] as const;
export const HANDOFF_ENVELOPE_PARAMS = ["pocketHandoff", "handoff"] as const;
export const HANDOFF_LEGACY_PARAMS = ["pcs1", "pcs", "code", "import"] as const;

export type PocketHandoffKind = "pcs-to-daw" | "chordsmith-to-daw" | "dj-to-daw" | "import";
export type PocketHandoffSource = "url" | "window.name" | "localStorage" | "deep-link" | "local-server";

export interface PocketHandoffEnvelope {
  app: typeof HANDOFF_APP;
  handoffVersion: typeof HANDOFF_VERSION;
  kind: PocketHandoffKind;
  code: string;
  createdAt: string;
  sourceApp?: string;
  targetApp?: string;
  metadata?: JsonObject;
}

export interface PocketDawHandoff {
  payload: PocketHandoffEnvelope;
  code: string;
  source: PocketHandoffSource;
  status: string;
  clear: () => void;
}

export type DeepLinkHandoffInspection =
  | { result: "handoff"; handoff: PocketDawHandoff }
  | { result: "failed-parse"; url: string; message: string }
  | { result: "ignored"; url: string; message: string };

export function buildPocketHandoff(kind: PocketHandoffKind, code: string, options: Partial<Omit<PocketHandoffEnvelope, "app" | "handoffVersion" | "kind" | "code" | "createdAt">> & { createdAt?: string } = {}): PocketHandoffEnvelope {
  return {
    app: HANDOFF_APP,
    handoffVersion: HANDOFF_VERSION,
    kind,
    code,
    createdAt: options.createdAt || new Date().toISOString(),
    sourceApp: options.sourceApp,
    targetApp: options.targetApp || "PocketDAW",
    metadata: options.metadata
  };
}

export function encodePocketHandoff(payload: PocketHandoffEnvelope): string {
  return base64UrlEncode(JSON.stringify(payload));
}

export function decodePocketHandoff(raw: string | null | undefined): PocketHandoffEnvelope | null {
  if (!raw) return null;
  const candidates = expandDecodeCandidates(raw);
  for (const candidate of candidates) {
    const parsed = parseEnvelopeJson(candidate);
    if (parsed) return parsed;
  }
  return null;
}

export function buildPocketHandoffUrl(baseUrl: string, payload: PocketHandoffEnvelope): string {
  const url = new URL(baseUrl, "http://pocket.local/");
  url.searchParams.set(HANDOFF_ENVELOPE_PARAMS[0], encodePocketHandoff(payload));
  return url.toString();
}

export function readUrlHandoff(
  input: string | Pick<Location, "href" | "search" | "hash"> = getWindowLocation(),
  options: { source?: PocketHandoffSource; clear?: () => void } = {}
): PocketDawHandoff | null {
  const url = locationToUrl(input);
  const search = new URLSearchParams(url.search);
  const hash = hashParams(url.hash);
  const directHashEnvelope = decodePocketHandoff(url.hash.replace(/^#/, ""));
  const source = options.source || "url";
  const clear = options.clear || (() => clearPocketHandoffUrl());

  for (const name of HANDOFF_ENVELOPE_PARAMS) {
    const value = search.get(name) || hash.get(name);
    const payload = decodePocketHandoff(value);
    if (payload) return makeHandoff(payload, source, clear);
  }

  if (directHashEnvelope) return makeHandoff(directHashEnvelope, source, clear);

  for (const name of HANDOFF_LEGACY_PARAMS) {
    const value = search.get(name) || hash.get(name);
    if (value) return makeHandoff(buildPocketHandoff(legacyKind(name), value, { sourceApp: legacySourceApp(name) }), source, clear);
  }

  return null;
}

export function readDeepLinkHandoff(input: string): PocketDawHandoff | null {
  const inspected = inspectDeepLinkHandoff(input);
  return inspected.result === "handoff" ? inspected.handoff : null;
}

export function readEncodedHandoff(raw: string, source: PocketHandoffSource): PocketDawHandoff | null {
  const payload = decodePocketHandoff(raw);
  if (!payload) return null;
  return makeHandoff(payload, source, () => undefined);
}

export function inspectDeepLinkHandoff(input: string): DeepLinkHandoffInspection {
  if (!isPocketDawDeepLink(input)) {
    return { result: "ignored", url: input, message: "Ignored non-Pocket DAW launch URL." };
  }
  const handoff = readUrlHandoff(input, { source: "deep-link", clear: () => undefined });
  if (handoff) return { result: "handoff", handoff };
  return { result: "failed-parse", url: input, message: "Pocket DAW launch URL did not contain a valid PocketHandoff payload." };
}

export function readWindowNameHandoff(name = getWindowName()): PocketDawHandoff | null {
  const payload = decodePocketHandoff(name);
  if (!payload) return null;
  return makeHandoff(payload, "window.name", () => clearWindowNameHandoff());
}

export function readStoredHandoff(storage: Storage | null = getLocalStorage()): PocketDawHandoff | null {
  if (!storage) return null;
  for (const key of HANDOFF_STORAGE_KEYS) {
    const payload = decodePocketHandoff(storage.getItem(key));
    if (payload) return makeHandoff(payload, "localStorage", () => clearStoredHandoff(storage));
  }
  return null;
}

export function readPocketDawHandoff(): PocketDawHandoff | null {
  return readUrlHandoff() || readWindowNameHandoff() || readStoredHandoff();
}

export function clearPocketHandoffUrl(): void {
  const win = getWindow();
  if (!win) return;
  const cleaned = clearUrlHandoff(win.location.href);
  if (cleaned !== win.location.href && win.history?.replaceState) {
    win.history.replaceState(win.history.state, win.document?.title || "", cleaned);
  }
}

export function clearUrlHandoff(rawUrl: string): string {
  const url = new URL(rawUrl, "http://pocket.local/");
  const keys = [...HANDOFF_ENVELOPE_PARAMS, ...HANDOFF_LEGACY_PARAMS];
  keys.forEach((key) => url.searchParams.delete(key));
  if (hashContainsHandoff(url.hash)) url.hash = "";
  return url.toString();
}

export function clearWindowNameHandoff(): void {
  const win = getWindow();
  if (win) win.name = "";
}

export function clearStoredHandoff(storage: Storage | null = getLocalStorage()): void {
  if (!storage) return;
  HANDOFF_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
}

function makeHandoff(payload: PocketHandoffEnvelope, source: PocketHandoffSource, clear: () => void): PocketDawHandoff {
  return {
    payload,
    code: payload.code,
    source,
    status: `${handoffKindLabel(payload.kind)} imported from ${source}.`,
    clear
  };
}

function parseEnvelopeJson(text: string): PocketHandoffEnvelope | null {
  try {
    const parsed = JSON.parse(text) as Partial<PocketHandoffEnvelope>;
    if (
      parsed.app === HANDOFF_APP &&
      parsed.handoffVersion === HANDOFF_VERSION &&
      isHandoffKind(parsed.kind) &&
      typeof parsed.code === "string" &&
      parsed.code.trim()
    ) {
      return {
        app: HANDOFF_APP,
        handoffVersion: HANDOFF_VERSION,
        kind: parsed.kind,
        code: parsed.code,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
        sourceApp: typeof parsed.sourceApp === "string" ? parsed.sourceApp : undefined,
        targetApp: typeof parsed.targetApp === "string" ? parsed.targetApp : undefined,
        metadata: isJsonObject(parsed.metadata) ? parsed.metadata : undefined
      };
    }
  } catch {
    return null;
  }
  return null;
}

function expandDecodeCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const unprefixed = trimmed.startsWith(HANDOFF_WINDOW_PREFIX) ? trimmed.slice(HANDOFF_WINDOW_PREFIX.length) : trimmed;
  const uriDecoded = safeDecodeURIComponent(unprefixed);
  const candidates = new Set<string>([trimmed, unprefixed, uriDecoded]);
  [trimmed, unprefixed, uriDecoded].forEach((candidate) => {
    const base64 = base64UrlDecode(candidate);
    if (base64) candidates.add(base64);
  });
  return [...candidates].filter(Boolean);
}

function hashParams(hash: string): URLSearchParams {
  const body = hash.replace(/^#/, "");
  if (!body) return new URLSearchParams();
  const queryish = body.startsWith("?") ? body.slice(1) : body.includes("?") ? body.slice(body.indexOf("?") + 1) : body;
  return queryish.includes("=") ? new URLSearchParams(queryish) : new URLSearchParams();
}

function hashContainsHandoff(hash: string): boolean {
  const body = hash.replace(/^#/, "");
  if (!body) return false;
  if (decodePocketHandoff(body)) return true;
  const params = hashParams(hash);
  return [...HANDOFF_ENVELOPE_PARAMS, ...HANDOFF_LEGACY_PARAMS].some((key) => params.has(key));
}

function locationToUrl(input: string | Pick<Location, "href" | "search" | "hash">): URL {
  if (typeof input === "string") return new URL(input, "http://pocket.local/");
  const href = input.href || `http://pocket.local/${input.search || ""}${input.hash || ""}`;
  return new URL(href, "http://pocket.local/");
}

function legacyKind(name: string): PocketHandoffKind {
  return name === "import" ? "import" : "chordsmith-to-daw";
}

function legacySourceApp(name: string): string {
  return name === "import" ? "Legacy Import" : "Pocket Chordsmith";
}

function isPocketDawDeepLink(value: string): boolean {
  try {
    return new URL(value).protocol === "pocket-daw:";
  } catch {
    return false;
  }
}

function handoffKindLabel(kind: PocketHandoffKind): string {
  if (kind === "dj-to-daw") return "Pocket DJ handoff";
  if (kind === "import") return "Pocket handoff import";
  return "Pocket Chordsmith handoff";
}

function isHandoffKind(value: unknown): value is PocketHandoffKind {
  return value === "pcs-to-daw" || value === "chordsmith-to-daw" || value === "dj-to-daw" || value === "import";
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function base64UrlEncode(text: string): string {
  const base64 = base64Encode(text);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(text: string): string | null {
  try {
    const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return base64Decode(padded);
  } catch {
    return null;
  }
}

function base64Encode(text: string): string {
  const global = globalThis as { btoa?: (value: string) => string; Buffer?: { from: (value: string, encoding?: BufferEncoding) => { toString: (encoding: BufferEncoding) => string } } };
  if (global.btoa) return global.btoa(unescape(encodeURIComponent(text)));
  if (global.Buffer) return global.Buffer.from(text, "utf8").toString("base64");
  throw new Error("No base64 encoder is available.");
}

function base64Decode(text: string): string {
  const global = globalThis as { atob?: (value: string) => string; Buffer?: { from: (value: string, encoding?: BufferEncoding) => { toString: (encoding: BufferEncoding) => string } } };
  if (global.atob) return decodeURIComponent(escape(global.atob(text)));
  if (global.Buffer) return global.Buffer.from(text, "base64").toString("utf8");
  throw new Error("No base64 decoder is available.");
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

function getWindowLocation(): Location {
  const win = getWindow();
  return win?.location || new URL("http://pocket.local/") as unknown as Location;
}

function getWindowName(): string {
  return getWindow()?.name || "";
}

function getLocalStorage(): Storage | null {
  try {
    return getWindow()?.localStorage || null;
  } catch {
    return null;
  }
}
