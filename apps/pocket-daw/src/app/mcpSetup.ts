export const POCKET_DAW_MCP_SERVER_NAME = "pocket_daw";
export const POCKET_DAW_MCP_WORKSPACE = "<POCKET_DAW_SOURCE_DIR>";
export const POCKET_DAW_MCP_NODE = "node";
export const POCKET_DAW_MCP_TSX = `${POCKET_DAW_MCP_WORKSPACE}\\node_modules\\tsx\\dist\\cli.mjs`;
export const POCKET_DAW_MCP_SERVER = `${POCKET_DAW_MCP_WORKSPACE}\\src\\mcp\\pocketDawMcpServer.ts`;

const MCP_ARGS = [POCKET_DAW_MCP_TSX, POCKET_DAW_MCP_SERVER] as const;

export function pocketDawMcpCommandLine(): string {
  return `${shellArg(POCKET_DAW_MCP_NODE)} ${MCP_ARGS.map(shellArg).join(" ")}`;
}

export function pocketDawMcpClaudeConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        [POCKET_DAW_MCP_SERVER_NAME]: {
          command: POCKET_DAW_MCP_NODE,
          args: [...MCP_ARGS]
        }
      }
    },
    null,
    2
  );
}

export function pocketDawMcpCodexConfig(): string {
  return [
    `[mcp_servers.${POCKET_DAW_MCP_SERVER_NAME}]`,
    `command = ${tomlString(POCKET_DAW_MCP_NODE)}`,
    `args = [${MCP_ARGS.map(tomlString).join(", ")}]`
  ].join("\n");
}

export function pocketDawMcpManualSetup(): string {
  return [
    "Pocket DAW developer file MCP bridge",
    "",
    "This source-checkout tool is not bundled with the installed Pocket DAW app. Replace <POCKET_DAW_SOURCE_DIR> with the local apps\\pocket-daw source directory and ensure Node.js is available on PATH.",
    "",
    "The file bridge is a local stdio MCP server for .pocketdaw project inspection, validation, Chordsmith import, typed edits and export planning.",
    "",
    "When Pocket DAW is running and Help > AI / MCP Bridge is enabled, the same MCP server also exposes live status, transport, selection, explicit-path smoke exports, safe mixer controls and bounded performance diagnostics through the app's tokened localhost session file.",
    "",
    "Command:",
    pocketDawMcpCommandLine(),
    "",
    "Claude Desktop / JSON clients:",
    pocketDawMcpClaudeConfig(),
    "",
    "Codex config.toml:",
    pocketDawMcpCodexConfig()
  ].join("\n");
}

export function pocketDawMcpCopyText(kind: string): string | null {
  if (kind === "command") return pocketDawMcpCommandLine();
  if (kind === "claude-json") return pocketDawMcpClaudeConfig();
  if (kind === "codex-toml") return pocketDawMcpCodexConfig();
  if (kind === "all") return pocketDawMcpManualSetup();
  return null;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function shellArg(value: string): string {
  return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
