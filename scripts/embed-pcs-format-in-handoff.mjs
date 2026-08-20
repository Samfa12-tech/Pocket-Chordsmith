import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const handoffPath = resolve(root, "apps", "pocket-audio-handoff", "index.html");
const formatPath = resolve(root, "packages", "pcs-format", "src", "index.js");
const begin = "    /* BEGIN GENERATED PCS FORMAT RUNTIME */";
const end = "    /* END GENERATED PCS FORMAT RUNTIME */";
const check = process.argv.includes("--check");
const source = readFileSync(formatPath, "utf8").replace(/\r\n/g, "\n");
const handoff = readFileSync(handoffPath, "utf8").replace(/\r\n/g, "\n");

if (!handoff.includes(begin) || !handoff.includes(end)) throw new Error("Pocket Audio Handoff is missing PCS Format runtime markers.");

const runtime = [
  begin,
  "    // Generated from packages/pcs-format/src/index.js; do not edit this block directly.",
  "    const PocketAudioPcsFormat = (() => {",
  source.replace(/^export /gm, "").trimEnd().split("\n").map((line) => line.trim() ? `      ${line}` : "").join("\n"),
  "      return Object.freeze({ parsePcsProject, PCS_MAX_DECODED_BYTES, PCS_MAX_ENCODED_CHARS });",
  "    })();",
  end,
].join("\n");
const expression = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);
const withRuntime = handoff.replace(expression, runtime);
// Keep the CSP hash bound to the inline runtime even if HTML serialization
// changes tag casing or adds a non-executable attribute.
const scriptMatch = withRuntime.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i);
if (!scriptMatch) throw new Error("Pocket Audio Handoff is missing its runtime script.");
const scriptHash = createHash("sha256").update(scriptMatch[1], "utf8").digest("base64");
const next = withRuntime.replace(
  /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(" \/>)/,
  `$1default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; script-src 'self' 'sha256-${scriptHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://pocket-audio-handoff.samfa12.workers.dev$2`,
);

if (check) {
  if (next !== handoff) throw new Error("Pocket Audio Handoff embedded PCS Format runtime is stale. Run node scripts/embed-pcs-format-in-handoff.mjs.");
  console.log("Pocket Audio Handoff embedded PCS Format runtime is current.");
} else {
  writeFileSync(handoffPath, next);
  console.log("Embedded the current PCS Format runtime in Pocket Audio Handoff.");
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
