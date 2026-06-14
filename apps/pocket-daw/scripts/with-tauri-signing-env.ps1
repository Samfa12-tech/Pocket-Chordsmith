param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Command
)

$ErrorActionPreference = "Stop"

function Set-EnvFromFile {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')
    if ($name) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$localEnv = Join-Path $projectRoot ".env.tauri-signing.local"
Set-EnvFromFile -Path $localEnv

$defaultKeyPath = Join-Path $env:USERPROFILE ".pocket-daw-secrets\tauri-updater.key"
$keySourcePath = $env:TAURI_SIGNING_PRIVATE_KEY_FILE
if (!$keySourcePath -and $env:TAURI_SIGNING_PRIVATE_KEY -and (Test-Path -LiteralPath $env:TAURI_SIGNING_PRIVATE_KEY)) {
  $keySourcePath = $env:TAURI_SIGNING_PRIVATE_KEY
}
if (!$keySourcePath -and !$env:TAURI_SIGNING_PRIVATE_KEY -and (Test-Path -LiteralPath $defaultKeyPath)) {
  $keySourcePath = $defaultKeyPath
}

if ($keySourcePath) {
  if (!(Test-Path -LiteralPath $keySourcePath)) {
    throw "TAURI_SIGNING_PRIVATE_KEY_FILE is set but the key file does not exist: $keySourcePath"
  }
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $keySourcePath -Raw
}

if (!$env:TAURI_SIGNING_PRIVATE_KEY) {
  throw "TAURI_SIGNING_PRIVATE_KEY is not set. Expected key contents, TAURI_SIGNING_PRIVATE_KEY_FILE, or $env:USERPROFILE\.pocket-daw-secrets\tauri-updater.key."
}

if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
}

if ($keySourcePath) {
  Write-Host "Tauri updater signing key loaded from $keySourcePath"
} else {
  Write-Host "Tauri updater signing key loaded from TAURI_SIGNING_PRIVATE_KEY contents"
}

if ($Command.Count -eq 0) {
  exit 0
}

$executable = $Command[0]
$arguments = @()
if ($Command.Count -gt 1) {
  $arguments = $Command[1..($Command.Count - 1)]
}

& $executable @arguments
exit $LASTEXITCODE
