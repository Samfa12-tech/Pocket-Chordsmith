export const POCKET_DAW_MCP_SERVER_NAME = "pocket-daw";
export const POCKET_DAW_MCP_WORKSPACE = "C:\\Users\\sam_s\\Documents\\Pocket Chordsmith\\apps\\pocket-daw";

const MCP_LAUNCH_SCRIPT = `cd /d "${POCKET_DAW_MCP_WORKSPACE}" && npm run mcp:pocket-daw`;

export function pocketDawMcpCommandLine(): string {
  return `cd /d "${POCKET_DAW_MCP_WORKSPACE}" && npm run mcp:pocket-daw`;
}

export function pocketDawMcpClaudeConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        [POCKET_DAW_MCP_SERVER_NAME]: {
          command: "cmd",
          args: ["/d", "/s", "/c", MCP_LAUNCH_SCRIPT]
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
    `command = "cmd"`,
    `args = ["/d", "/s", "/c", ${tomlString(MCP_LAUNCH_SCRIPT)}]`
  ].join("\n");
}

export function pocketDawMcpManualSetup(): string {
  return [
    "Pocket DAW MCP bridge",
    "",
    "The bridge is a local stdio MCP server for .pocketdaw project inspection, validation, Chordsmith import, typed edits and export planning.",
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
