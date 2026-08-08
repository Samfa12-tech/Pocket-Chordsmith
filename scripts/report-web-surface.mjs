import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const appRoot = resolve(required("app"));
const activeName = required("active");
const activePath = resolve(appRoot, activeName);
const maxActiveBytes = Number(required("maxActiveBytes"));
const maxModuleBytes = Number(args.maxModuleBytes || 0);
const allowedRunnable = new Set(["index.html", activeName, ...list("allowRunnable")]);
const errors = [];

const activeBytes = statSync(activePath).size;
if (activeBytes > maxActiveBytes) errors.push(`${activeName} is ${activeBytes} bytes; budget is ${maxActiveBytes}`);

const runnableHtml = readdirSync(appRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".html")
  .map((entry) => entry.name);
const unclassified = runnableHtml.filter((name) => !allowedRunnable.has(name));
if (unclassified.length) errors.push(`Unclassified runnable HTML (move to apps/archive or allow explicitly): ${unclassified.join(", ")}`);

const moduleFiles = walk(resolve(appRoot, "src")).filter((path) => /\.[cm]?js$/i.test(path));
const moduleBytes = moduleFiles.reduce((total, path) => total + statSync(path).size, 0);
if (maxModuleBytes && moduleBytes > maxModuleBytes) errors.push(`src modules total ${moduleBytes} bytes; budget is ${maxModuleBytes}`);

const activeSource = readFileSync(activePath, "utf8");
const generatedSourceManifests = walk(resolve(appRoot, "src")).filter((path) => /source-manifest\.json$/i.test(path));
const generatedFragments = new Set(generatedSourceManifests.flatMap((path) => {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  return (Array.isArray(manifest.fragments) ? manifest.fragments : []).map((fragment) => resolve(appRoot, fragment));
}));
const referencedModules = moduleFiles.filter((path) => activeSource.includes(basename(path)) || generatedFragments.has(path));
const apparentlyUnreferenced = moduleFiles.filter((path) => !referencedModules.includes(path));

console.log(`${args.product || basename(appRoot)} web surface:`);
console.log(`- active HTML: ${activeBytes} / ${maxActiveBytes} bytes`);
console.log(`- modular source: ${moduleBytes}${maxModuleBytes ? ` / ${maxModuleBytes}` : ""} bytes across ${moduleFiles.length} files`);
console.log(`- runnable HTML: ${runnableHtml.join(", ")}`);
console.log(`- source modules referenced by active HTML: ${referencedModules.map((path) => basename(path)).join(", ") || "none"}`);
console.log(`- dead-code candidates requiring review: ${apparentlyUnreferenced.map((path) => basename(path)).join(", ") || "none"}`);

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

function walk(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function parseArgs(values) {
  const parsed = { allowRunnable: [] };
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, "");
    const value = values[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid argument near ${values[index] || "end"}`);
    if (key === "allowRunnable") parsed.allowRunnable.push(value);
    else parsed[key] = value;
  }
  return parsed;
}

function required(key) {
  if (!args[key]) throw new Error(`Missing --${key}`);
  return args[key];
}

function list(key) {
  return Array.isArray(args[key]) ? args[key] : [];
}
