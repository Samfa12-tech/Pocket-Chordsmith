import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { DEFAULT_BOOTSTRAPPER_MANIFEST } from "./make-bootstrapper-manifest.mjs";

export const BOOTSTRAPPER_CHANNEL = "windows-installer";
export const BOOTSTRAPPER_SLUG = "samfa12/pocket-daw";
export const BOOTSTRAPPER_MANIFEST_URL = `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/${DEFAULT_BOOTSTRAPPER_MANIFEST}`;
export const GITHUB_LATEST_RELEASE_URL = "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest";

const ROOT = process.cwd();
const VERSION = packageJson.version;
const RELEASE_DIR = join(ROOT, "releases", "itch-bootstrapper");
const WORK_DIR = join(RELEASE_DIR, "work");
const UPLOAD_DIR = join(RELEASE_DIR, "upload");
const NSIS_PATH = process.env.MAKENSIS_PATH || join(process.env.LOCALAPPDATA || "", "tauri", "NSIS", "makensis.exe");
const BOOTSTRAPPER_EXE = `Pocket_DAW_Itch_Bootstrapper_v${VERSION}.exe`;

export function bootstrapperPowerShell({
  manifestUrl = BOOTSTRAPPER_MANIFEST_URL,
  fallbackUrl = GITHUB_LATEST_RELEASE_URL
} = {}) {
  return String.raw`$ErrorActionPreference = "Stop"
$ManifestUrl = "${manifestUrl}"
$FallbackUrl = "${fallbackUrl}"
$DownloadDir = Join-Path $env:TEMP "PocketDawBootstrapper"
New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null

try {
  Write-Host "Fetching Pocket DAW latest installer manifest..."
  $manifest = Invoke-RestMethod -Uri $ManifestUrl -UseBasicParsing
  if (-not $manifest.installer -or -not $manifest.installer.url -or -not $manifest.installer.sha256) {
    throw "The bootstrapper manifest is missing installer url or sha256."
  }

  $fileName = if ($manifest.installer.fileName) { $manifest.installer.fileName } else { "Pocket_DAW_latest_setup.exe" }
  $safeName = [System.IO.Path]::GetFileName($fileName)
  if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = "Pocket_DAW_latest_setup.exe" }
  $installerPath = Join-Path $DownloadDir $safeName

  Write-Host "Downloading Pocket DAW $($manifest.version) installer..."
  Invoke-WebRequest -Uri $manifest.installer.url -OutFile $installerPath -UseBasicParsing

  $expected = [string]$manifest.installer.sha256
  $actual = (Get-FileHash -Algorithm SHA256 -Path $installerPath).Hash.ToLowerInvariant()
  if ($actual -ne $expected.ToLowerInvariant()) {
    Remove-Item -Force -ErrorAction SilentlyContinue $installerPath
    throw "Installer SHA-256 mismatch. Expected $expected but got $actual."
  }

  Write-Host "Verified Pocket DAW installer hash. Launching setup..."
  Start-Process -FilePath $installerPath -Wait
  exit 0
} catch {
  Write-Host ""
  Write-Host "Pocket DAW bootstrapper failed: $($_.Exception.Message)"
  Write-Host "Manual fallback: $FallbackUrl"
  Write-Host ""
  try {
    Add-Type -AssemblyName PresentationFramework
    $newline = [Environment]::NewLine
    $message = "Pocket DAW bootstrapper could not download or verify the latest installer." + $newline + $newline + $_.Exception.Message + $newline + $newline + "Manual fallback:" + $newline + $FallbackUrl
    [System.Windows.MessageBox]::Show($message, "Pocket DAW Bootstrapper", "OK", "Warning") | Out-Null
  } catch {}
  exit 1
}
`;
}

export function packageItchBootstrapper({ compile = true } = {}) {
  rmSync(RELEASE_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
  mkdirSync(UPLOAD_DIR, { recursive: true });

  const psPath = join(WORK_DIR, "pocket-daw-bootstrapper-download.ps1");
  const nsisPath = join(WORK_DIR, "pocket-daw-bootstrapper.nsi");
  writeFileSync(psPath, bootstrapperPowerShell());
  writeFileSync(nsisPath, nsisScript(psPath));

  const exePath = join(UPLOAD_DIR, BOOTSTRAPPER_EXE);
  if (compile) {
    if (!existsSync(NSIS_PATH)) throw new Error(`makensis.exe was not found at ${NSIS_PATH}. Set MAKENSIS_PATH to override.`);
    const result = spawnSync(NSIS_PATH, [nsisPath], { cwd: ROOT, stdio: "inherit", shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`makensis failed with status ${result.status}`);
    if (!existsSync(exePath)) throw new Error(`Bootstrapper EXE was not created: ${exePath}`);
  } else {
    writeFileSync(exePath, "Pocket DAW bootstrapper test placeholder\n");
  }

  const readmePath = join(UPLOAD_DIR, "README_FIRST.txt");
  writeFileSync(readmePath, `Pocket DAW itch bootstrapper

This itch download is a small downloader-installer. It fetches the latest Pocket DAW setup EXE from GitHub Releases, verifies its SHA-256 hash from ${DEFAULT_BOOTSTRAPPER_MANIFEST}, and launches the verified installer.

Bootstrapper manifest: ${BOOTSTRAPPER_MANIFEST_URL}

Normal Pocket DAW app updates are delivered by the installed app updater. The itch channel only needs a new upload when this bootstrapper changes.

Manual fallback: ${GITHUB_LATEST_RELEASE_URL}
`);

  const checksumEntries = [exePath, readmePath].filter(existsSync);
  const checksumPath = join(UPLOAD_DIR, "CHECKSUMS_SHA256.txt");
  writeFileSync(checksumPath, checksumEntries.map((path) => `${sha256File(path)}  ${basename(path)}`).join("\n") + "\n");

  assertBootstrapperUploadContents(UPLOAD_DIR);
  return { uploadDir: UPLOAD_DIR, exePath, readmePath, checksumPath, nsisPath, psPath };
}

export function assertBootstrapperUploadContents(dir) {
  const allowed = new Set([BOOTSTRAPPER_EXE.toLowerCase(), "readme_first.txt", "checksums_sha256.txt"]);
  const entries = walkFiles(dir).map((path) => basename(path).toLowerCase());
  if (!entries.some((name) => name.endsWith(".exe"))) throw new Error("Bootstrapper upload is missing the bootstrapper EXE.");
  for (const name of entries) {
    if (!allowed.has(name)) throw new Error(`Unexpected bootstrapper upload file: ${name}`);
  }
}

function nsisScript(psPath) {
  const outFile = join(UPLOAD_DIR, BOOTSTRAPPER_EXE).replace(/\\/g, "\\\\");
  const source = psPath.replace(/\\/g, "\\\\");
  return `Unicode true
Name "Pocket DAW Bootstrapper"
OutFile "${outFile}"
RequestExecutionLevel user
ShowInstDetails show

Section "Download and install Pocket DAW"
  SetOutPath "$TEMP\\PocketDawBootstrapper"
  File /oname=pocket-daw-bootstrapper-download.ps1 "${source}"
  DetailPrint "Downloading latest Pocket DAW installer..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\\PocketDawBootstrapper\\pocket-daw-bootstrapper-download.ps1"' $0
  IntCmp $0 0 done
    MessageBox MB_ICONEXCLAMATION "Pocket DAW bootstrapper could not download or verify the latest installer. Open ${GITHUB_LATEST_RELEASE_URL} manually."
    Abort
  done:
SectionEnd
`;
}

function walkFiles(dir) {
  const result = [];
  const entries = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [];
  for (const entry of entries) {
    if (entry.isDirectory()) result.push(...walkFiles(join(dir, entry.name)));
    else result.push(join(dir, entry.name));
  }
  return result;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (process.argv[1] && process.argv[1].endsWith("package-itch-bootstrapper.mjs")) {
  const result = packageItchBootstrapper();
  console.log(`Wrote ${result.uploadDir}`);
}
