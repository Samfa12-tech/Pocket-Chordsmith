import { describe, expect, it } from "vitest";
import {
  pocketDawMcpClaudeConfig,
  pocketDawMcpCodexConfig,
  pocketDawMcpCommandLine,
  pocketDawMcpCopyText,
  POCKET_DAW_MCP_NODE,
  POCKET_DAW_MCP_SERVER_NAME,
  POCKET_DAW_MCP_SERVER,
  POCKET_DAW_MCP_TSX,
  POCKET_DAW_MCP_WORKSPACE
} from "./mcpSetup";

describe("Pocket DAW MCP setup snippets", () => {
  it("builds source-checkout MCP templates without a developer-machine path", () => {
    expect(pocketDawMcpCommandLine()).toContain(POCKET_DAW_MCP_WORKSPACE);
    expect(pocketDawMcpCommandLine()).toContain(POCKET_DAW_MCP_NODE);
    expect(pocketDawMcpCommandLine()).toContain(POCKET_DAW_MCP_TSX);
    expect(pocketDawMcpCommandLine()).toContain(POCKET_DAW_MCP_SERVER);

    const claude = JSON.parse(pocketDawMcpClaudeConfig());
    expect(claude.mcpServers[POCKET_DAW_MCP_SERVER_NAME]).toMatchObject({
      command: POCKET_DAW_MCP_NODE,
      args: [POCKET_DAW_MCP_TSX, POCKET_DAW_MCP_SERVER]
    });
    expect(claude.mcpServers[POCKET_DAW_MCP_SERVER_NAME].args.at(-1)).toBe(POCKET_DAW_MCP_SERVER);

    expect(pocketDawMcpCodexConfig()).toContain(`[mcp_servers.${POCKET_DAW_MCP_SERVER_NAME}]`);
    expect(pocketDawMcpCodexConfig()).toContain(POCKET_DAW_MCP_NODE.replace(/\\/g, "\\\\"));
    expect(pocketDawMcpCopyText("all")).toContain("Pocket DAW developer file MCP bridge");
    expect(pocketDawMcpCopyText("all")).toContain("not bundled with the installed Pocket DAW app");

    const allSetupText = [
      pocketDawMcpCommandLine(),
      pocketDawMcpClaudeConfig(),
      pocketDawMcpCodexConfig(),
      pocketDawMcpCopyText("all")
    ].join("\n");
    expect(allSetupText).not.toContain("C:\\Users\\sam_s");
    expect(allSetupText).not.toContain("Program Files\\nodejs");
  });
});
