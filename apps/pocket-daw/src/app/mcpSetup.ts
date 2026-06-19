export const POCKET_DAW_MCP_SERVER_NAME = "pocket_daw";
export const POCKET_DAW_MCP_WORKSPACE = "C:\\Users\\sam_s\\Documents\\Pocket Chordsmith\\apps\\pocket-daw";

export const POCKET_DAW_MCP_NODE = "C:\\Program Files\\nodejs\\node.exe";
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
    "Pocket DAW MCP bridge",
    "",
    "The bridge is a local stdio MCP server for .pocketdaw project inspection, validation, Chordsmith import, typed edits and export planning.",
    "",
    "When Pocket DAW is running and Help > AI / MCP Bridge is enabled, the same MCP server also exposes live status, transport, selection and safe mixer controls through the app's tokened localhost session file.",
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
