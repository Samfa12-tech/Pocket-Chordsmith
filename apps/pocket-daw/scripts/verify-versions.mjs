import { readFileSync } from "node:fs";
import packageJson from "../package.json" with { type: "json" };

const version = packageJson.version;
const checks = [
  ["package.json", packageJson.version],
  ["package-lock.json root", JSON.parse(readFileSync("package-lock.json", "utf8")).version],
  ["package-lock.json package", JSON.parse(readFileSync("package-lock.json", "utf8")).packages[""].version],
  ["src-tauri/tauri.conf.json", JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version],
  ["src-tauri/Cargo.toml", readFileSync("src-tauri/Cargo.toml", "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1]],
  ["src/daw/schema.ts POCKET_DAW_VERSION", readFileSync("src/daw/schema.ts", "utf8").match(/POCKET_DAW_VERSION\s*=\s*"([^"]+)"/)?.[1]]
];

const failures = checks.filter(([, value]) => value !== version);
if (failures.length) {
  for (const [name, value] of failures) console.error(`${name} is ${value || "missing"}, expected ${version}`);
  process.exit(1);
}

const schemaVersion = readFileSync("src/daw/schema.ts", "utf8").match(/POCKET_DAW_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1];
if (schemaVersion !== "2") {
  console.error(`POCKET_DAW_SCHEMA_VERSION is ${schemaVersion}, expected 2`);
  process.exit(1);
}

console.log(`Version sync OK: ${version}, schema ${schemaVersion}`);
