import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "apps", "pocket-audio-handoff", "index.html");
const outputPath = process.argv[2]
  ? resolve(root, process.argv[2])
  : resolve(root, "local-artifacts", "staging", "pocket-audio-handoff-dev", "index.html");
const source = readFileSync(sourcePath, "utf8");
const productionCsp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/;
const match = source.match(productionCsp);

if (!match) throw new Error("Pocket Audio Handoff production CSP is missing.");
if (!/script-src[^;]*'sha256-[A-Za-z0-9+/=]+'/i.test(match[1])) throw new Error("Pocket Audio Handoff production CSP must use a generated script hash.");

const developmentCsp = match[1].replace(
  /connect-src[^;]*/,
  "connect-src 'self' https://pocket-audio-handoff.samfa12.workers.dev http://localhost:* http://127.0.0.1:*",
);
const development = source
  .replace('<meta name="application-version" content="handoff-v2" />', '<meta name="application-version" content="handoff-v2-dev" />\n  <meta name="pocket-audio-handoff-dev-mode" content="enabled" />')
  .replace(productionCsp, `<meta http-equiv="Content-Security-Policy" content="${developmentCsp}" />`);

mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(outputPath, development);
console.log(`Created local-only Handoff development page: ${outputPath}`);
