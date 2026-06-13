import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export function verifyWindowsSignature(path) {
  if (!existsSync(path)) {
    return { status: "verification-not-run", detail: "File does not exist." };
  }
  if (process.platform !== "win32") {
    return { status: "verification-not-run", detail: "Authenticode verification is only run on Windows." };
  }
  const escaped = path.replace(/'/g, "''");
  const command = `Get-AuthenticodeSignature -LiteralPath '${escaped}' | Select-Object Status,StatusMessage,SignerCertificate | ConvertTo-Json -Compress`;
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: windowsPowerShellEnv()
  });
  if (result.status !== 0) {
    return { status: "verification-not-run", detail: (result.stderr || result.stdout || "Get-AuthenticodeSignature failed.").trim() };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed.Status === 0 || String(parsed.Status).toLowerCase() === "valid") {
      return { status: "signed", detail: parsed.StatusMessage || "Authenticode signature is valid." };
    }
    if (String(parsed.Status).toLowerCase() === "notsigned" || parsed.Status === 1 || parsed.Status === 2) {
      return { status: "unsigned", detail: parsed.StatusMessage || "File is not signed." };
    }
    return { status: "unsigned", detail: parsed.StatusMessage || `Authenticode status: ${parsed.Status}` };
  } catch (error) {
    return { status: "verification-not-run", detail: error instanceof Error ? error.message : "Could not parse signature output." };
  }
}

function windowsPowerShellEnv() {
  const env = { ...process.env };
  const moduleRoots = [
    env.USERPROFILE ? `${env.USERPROFILE}\\Documents\\WindowsPowerShell\\Modules` : "",
    env.ProgramFiles ? `${env.ProgramFiles}\\WindowsPowerShell\\Modules` : "",
    env.WINDIR ? `${env.WINDIR}\\system32\\WindowsPowerShell\\v1.0\\Modules` : ""
  ].filter(Boolean);
  env.PSModulePath = moduleRoots.join(";");
  return env;
}

if (process.argv[1] && process.argv[1].endsWith("verify-windows-signature.mjs")) {
  for (const path of process.argv.slice(2)) {
    const result = verifyWindowsSignature(path);
    console.log(`${path}: ${result.status}${result.detail ? ` (${result.detail})` : ""}`);
  }
}
