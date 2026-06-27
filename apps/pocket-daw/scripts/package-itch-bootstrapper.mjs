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
const FALLBACK_INDEX = "index.html";

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
  Start-Process -FilePath $installerPath
  Write-Host "Pocket DAW setup launched. The bootstrapper can close now."
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

  const indexPath = join(UPLOAD_DIR, FALLBACK_INDEX);
  writeFileSync(indexPath, fallbackIndexHtml(BOOTSTRAPPER_EXE));

  const checksumEntries = [exePath, readmePath, indexPath].filter(existsSync);
  const checksumPath = join(UPLOAD_DIR, "CHECKSUMS_SHA256.txt");
  writeFileSync(checksumPath, checksumEntries.map((path) => `${sha256File(path)}  ${basename(path)}`).join("\n") + "\n");

  assertBootstrapperUploadContents(UPLOAD_DIR);
  return { uploadDir: UPLOAD_DIR, exePath, readmePath, indexPath, checksumPath, nsisPath, psPath };
}

export function assertBootstrapperUploadContents(dir) {
  const allowed = new Set([BOOTSTRAPPER_EXE.toLowerCase(), "readme_first.txt", FALLBACK_INDEX, "checksums_sha256.txt"]);
  const entries = walkFiles(dir).map((path) => basename(path).toLowerCase());
  if (!entries.some((name) => name.endsWith(".exe"))) throw new Error("Bootstrapper upload is missing the bootstrapper EXE.");
  for (const name of entries) {
    if (!allowed.has(name)) throw new Error(`Unexpected bootstrapper upload file: ${name}`);
  }
}

function fallbackIndexHtml(exeName) {
  const escapedExe = escapeHtml(exeName);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pocket DAW Windows Installer</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #101418;
      color: #f2f6f8;
    }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    main {
      width: min(560px, 100%);
    }
    h1 {
      margin: 0 0 12px;
      font-size: clamp(2rem, 7vw, 4rem);
      line-height: 1;
    }
    p {
      color: #c4ced5;
      font-size: 1rem;
      line-height: 1.55;
    }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      margin-top: 10px;
      padding: 0 18px;
      border: 1px solid #8fd3ff;
      color: #101418;
      background: #8fd3ff;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main>
    <h1>Pocket DAW</h1>
    <p>Pocket DAW is a Windows installed app. This itch page hosts a small downloader-installer that fetches the latest signed build from GitHub Releases and verifies its checksum before launching setup.</p>
    <p><a href="./${escapedExe}" download>Download Windows installer</a></p>
  </main>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nsisScript(psPath) {
  const outFile = join(UPLOAD_DIR, BOOTSTRAPPER_EXE).replace(/\\/g, "\\\\");
  const source = psPath.replace(/\\/g, "\\\\");
  return `Unicode true
Name "Pocket DAW Bootstrapper"
OutFile "${outFile}"
RequestExecutionLevel user
ShowInstDetails show
AutoCloseWindow true

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
