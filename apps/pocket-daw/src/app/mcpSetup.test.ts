import { describe, expect, it } from "vitest";
import {
  pocketDawMcpClaudeConfig,
  pocketDawMcpCodexConfig,
  pocketDawMcpCommandLine,
  pocketDawMcpCopyText,
  POCKET_DAW_MCP_SERVER_NAME,
  POCKET_DAW_MCP_WORKSPACE
} from "./mcpSetup";

describe("Pocket DAW MCP setup snippets", () => {
  it("builds copy-ready Windows MCP launch snippets", () => {
    expect(pocketDawMcpCommandLine()).toContain(POCKET_DAW_MCP_WORKSPACE);
    expect(pocketDawMcpCommandLine()).toContain("npm --prefix");
    expect(pocketDawMcpCommandLine()).toContain("run mcp:pocket-daw");

    const claude = JSON.parse(pocketDawMcpClaudeConfig());
    expect(claude.mcpServers[POCKET_DAW_MCP_SERVER_NAME]).toMatchObject({
      command: "cmd",
      args: expect.arrayContaining(["/d", "/c", "npm", "--prefix", POCKET_DAW_MCP_WORKSPACE, "run", "mcp:pocket-daw"])
    });
    expect(claude.mcpServers[POCKET_DAW_MCP_SERVER_NAME].args.at(-1)).toBe("mcp:pocket-daw");

    expect(pocketDawMcpCodexConfig()).toContain(`[mcp_servers.${POCKET_DAW_MCP_SERVER_NAME}]`);
    expect(pocketDawMcpCopyText("all")).toContain("Pocket DAW MCP bridge");
  });
});
