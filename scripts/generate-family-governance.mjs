import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "FAMILY_MANIFEST.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const check = process.argv.includes("--check");
const errors = [];

validateManifest();
validateSourceTruth();

const outputs = new Map([
  ["docs/generated/ROOT_INVENTORY.md", renderInventory()],
  ["docs/generated/LICENSING_TABLE.md", renderLicensing()],
  ["docs/generated/SECURITY_SCOPE.md", renderSecurityScope()],
  ["docs/generated/RELEASE_DASHBOARD.md", renderReleaseDashboard()],
  ["docs/generated/COMPONENT_VERSION_MATRIX.md", renderVersionMatrix()],
]);

for (const [relativePath, content] of outputs) {
  const outputPath = resolve(root, relativePath);
  if (check) {
    if (!existsSync(outputPath)) {
      errors.push(`Missing generated governance file: ${relativePath}`);
    } else if (readFileSync(outputPath, "utf8") !== content) {
      errors.push(`Generated governance drift: ${relativePath}`);
    }
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content);
    console.log(`Generated ${relativePath}`);
  }
}

if (errors.length) {
  console.error("Family governance verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(check ? "Family governance is current." : "Family governance generated.");

function validateManifest() {
  const ids = new Set();
  const paths = new Set();
  for (const component of manifest.components || []) {
    for (const field of ["id", "name", "path", "kind", "license", "releaseStatus", "packageCommand", "testCommand"]) {
      if (!String(component[field] || "").trim()) errors.push(`${component.id || "component"} is missing ${field}`);
    }
    if (ids.has(component.id)) errors.push(`Duplicate component id: ${component.id}`);
    if (paths.has(component.path)) errors.push(`Duplicate component path: ${component.path}`);
    ids.add(component.id);
    paths.add(component.path);
    if (!existsSync(resolve(root, component.path))) errors.push(`Missing component path: ${component.path}`);
    if (!component.versions || !Object.keys(component.versions).length) errors.push(`${component.id} has no version domains`);
    if (!component.deployment?.channel || !component.deployment?.identifier || !("sourceCommit" in component.deployment)) {
      errors.push(`${component.id} has incomplete deployment metadata`);
    }
  }
}

function validateSourceTruth() {
  const byId = new Map(manifest.components.map((component) => [component.id, component]));
  comparePackageVersion(byId.get("chordsmith-web"), "apps/chordsmith-web/package.json", "package");
  comparePackageVersion(byId.get("pocket-dj"), "apps/pocket-dj/package.json", "package");
  comparePackageVersion(byId.get("pocket-daw"), "apps/pocket-daw/package.json", "source");
  comparePackageVersion(byId.get("pocket-audio-core"), "packages/pocket-audio-core/package.json", "package");
  comparePackageVersion(byId.get("pcs-format"), "packages/pcs-format/package.json", "package");

  const dawStatus = readJson("apps/pocket-daw/release-status.json");
  const daw = byId.get("pocket-daw");
  compare("pocket-daw project schema", daw.versions.projectSchema, dawStatus.projectSchemaVersion);
  compare("pocket-daw latest published", daw.versions.latestPublished, dawStatus.latestPublishedVersion);
  compare("pocket-daw installed smoke", daw.versions.lastInstalledSmoke, dawStatus.lastInstalledSmoke.version);

  const chordsmithSource = readFileSync(resolve(root, "apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html"), "utf8");
  requireMatch(chordsmithSource, /const PROJECT_SCHEMA_VERSION = 17;/, "Chordsmith schema 17 constant");
  requireMatch(chordsmithSource, /const POCKET_AUDIO_CORE_VERSION = "0\.2\.0";/, "Chordsmith core version");
  const djSource = readFileSync(resolve(root, "apps/pocket-dj/pocket_dj_v1g_core_bridge.html"), "utf8");
  requireMatch(djSource, /const PROJECT_SCHEMA_VERSION = 17;/, "Pocket DJ source schema 17 constant");
  requireMatch(djSource, /const POCKET_AUDIO_CORE_VERSION = "0\.2\.0";/, "Pocket DJ core version");

  const plugin = readFileSync(resolve(root, "addons/pocket_chordsmith/plugin.cfg"), "utf8");
  const addonVersion = plugin.match(/^version="([^"]+)"/m)?.[1];
  compare("Godot addon version", byId.get("godot-addon").versions.addon, addonVersion);
}

function comparePackageVersion(component, path, versionKey) {
  compare(`${component.id} ${versionKey}`, component.versions[versionKey], readJson(path).version);
}

function compare(label, expected, actual) {
  if (String(expected) !== String(actual)) errors.push(`${label} drift: manifest=${expected}, source=${actual}`);
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) errors.push(`${label} is not present in current source`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function preamble(title) {
  return `# ${title}\n\n> Generated from \`FAMILY_MANIFEST.json\` by \`scripts/generate-family-governance.mjs\`. Do not edit this file directly. Manifest date: ${manifest.updated}.\n\n`;
}

function renderInventory() {
  const rows = manifest.components.map((c) => `| ${c.id} | \`${c.path}/\` | ${c.kind} | ${c.releaseStatus} |`);
  return `${preamble("Pocket Audio Root Inventory")}| Component ID | Canonical path | Kind | Status |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`;
}

function renderLicensing() {
  const rows = manifest.components.map((c) => `| ${c.name} | \`${c.path}/\` | ${c.license} | ${c.releaseStatus} |`);
  return `${preamble("Pocket Audio Licensing Table")}| Component | Canonical path | License | Distribution status |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n\nDependency lockfiles and third-party notices are release inputs and must remain present in package/release review.\n`;
}

function renderSecurityScope() {
  const rows = manifest.components.map((c) => `- **${c.name}**: \`${c.path}/\` (${c.releaseStatus})`);
  return `${preamble("Pocket Audio Security Scope")}Security reports are accepted for every current component and repository-owned build/release workflow:\n\n${rows.join("\n")}\n\nRunnable historical archives are unsupported and may contain fixed vulnerabilities. Reproduce archive issues against a current component before expecting a fix.\n`;
}

function renderReleaseDashboard() {
  const rows = manifest.components.map((c) => `| ${c.name} | ${versionSummary(c)} | ${c.releaseStatus} | ${c.deployment.channel} | ${c.deployment.identifier} | \`${c.testCommand}\` |`);
  return `${preamble("Pocket Audio Family Release Dashboard")}| Component | Source/build/schema versions | Status | Channel | Current identifier | Gate |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\nPocket DAW claims remain bound to \`apps/pocket-daw/release-status.json\`; source, published, and exact installed-smoke versions are intentionally separate domains.\n`;
}

function renderVersionMatrix() {
  const keys = Array.from(new Set(manifest.components.flatMap((c) => Object.keys(c.versions))));
  const header = `| Component | ${keys.join(" | ")} |`;
  const divider = `| --- | ${keys.map(() => "---").join(" | ")} |`;
  const rows = manifest.components.map((c) => `| ${c.name} | ${keys.map((key) => c.versions[key] ?? "-").join(" | ")} |`);
  return `${preamble("Pocket Audio Component Version Matrix")}${header}\n${divider}\n${rows.join("\n")}\n\nVersion domains are intentionally independent. Compatibility is expressed by schema/core fields, not by forcing one family-wide version.\n`;
}

function versionSummary(component) {
  return Object.entries(component.versions).map(([key, value]) => `${key} ${value}`).join("; ");
}
