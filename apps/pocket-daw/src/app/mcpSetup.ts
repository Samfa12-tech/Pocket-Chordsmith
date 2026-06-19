export const POCKET_DAW_MCP_SERVER_NAME = "pocket-daw";
export const POCKET_DAW_MCP_WORKSPACE = "C:\\Users\\sam_s\\Documents\\Pocket Chordsmith\\apps\\pocket-daw";

const MCP_ARGS = ["/d", "/c", "npm", "--silent", "--prefix", POCKET_DAW_MCP_WORKSPACE, "run", "mcp:pocket-daw"] as const;

export function pocketDawMcpCommandLine(): string {
  return `cmd.exe ${MCP_ARGS.map(shellArg).join(" ")}`;
}

export function pocketDawMcpClaudeConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        [POCKET_DAW_MCP_SERVER_NAME]: {
          command: "cmd",
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
    `command = "cmd"`,
    `args = [${MCP_ARGS.map(tomlString).join(", ")}]`
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

function shellArg(value: string): string {
  return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
