#!/usr/bin/env node
import { batchMasterRelease } from "../packages/pocket-audio-core/src/mastering/batch-release.js";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.command !== "batch") {
    throw new Error("Usage: node bin/pocket-audio-release.js batch --input \"packs/*.json\" --out release/out --profile spotify_lofi_chill --scope sequence --export wav24,stems,report");
  }
  const result = await batchMasterRelease(args);
  console.log(JSON.stringify({
    status: result.manifest.status,
    outDir: result.outDir,
    inputCount: result.manifest.inputCount,
    failures: result.manifest.failures
  }, null, 2));
  process.exitCode = result.manifest.status === "FAIL" ? 1 : 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const out = { command: argv[0] || "" };
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const rawKey = item.slice(2);
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    index += 1;
  }
  if (out.input) out.inputs = [out.input];
  if (out.albumConsistency === undefined && out["album-consistency"] !== undefined) out.albumConsistency = out["album-consistency"];
  if (out.analyzeOnly === undefined && out["analyze-only"] !== undefined) out.analyzeOnly = out["analyze-only"];
  return out;
}
