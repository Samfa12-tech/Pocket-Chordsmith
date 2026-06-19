import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";
import { callPocketDawMcpTool, pocketDawMcpToolList } from "../src/mcp/pocketDawMcp";

function parseToolResult(result: Awaited<ReturnType<typeof callPocketDawMcpTool>>) {
  return JSON.parse(result.content[0].text);
}

describe("Pocket DAW MCP tools", () => {
  it("lists the structured Pocket DAW tools", () => {
    const toolList = pocketDawMcpToolList();
    const tools = toolList.map((tool) => tool.name);

    expect(tools).toEqual(expect.arrayContaining([
      "pocket_daw_read_project",
      "pocket_daw_validate_project",
      "pocket_daw_create_from_chordsmith",
      "pocket_daw_apply_commands",
      "pocket_daw_export_plan"
    ]));
    expect(toolList.every((tool) => tool.inputSchema.type === "object")).toBe(true);
    expect(toolList.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(toolList.find((tool) => tool.name === "pocket_daw_apply_commands")?.inputSchema.properties.commands).toMatchObject({
      type: "array",
      items: {
        type: "object",
        required: ["type"]
      }
    });
  });

  it("reads and summarizes a project without writing", async () => {
    const project = createDemoProject();
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_read_project", {
      raw: buildPocketDawProjectFile(project)
    }));

    expect(result.ok).toBe(true);
    expect(result.summary.title).toBe(project.project.title);
    expect(result.summary.trackCount).toBe(project.tracks.length);
    expect(result.project).toBeUndefined();
  });

  it("applies typed edit commands and writes only when outputPath is explicit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-mcp-"));
    const outputPath = join(dir, "edited.pocketdaw");
    const project = createDemoProject();

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(project),
      outputPath,
      commands: [
        { type: "set_track_volume", trackId: "bass", volume: 0.42 },
        { type: "add_marker", bar: 3 }
      ]
    }));
    const edited = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.written).toBe(outputPath);
    expect(result.project).toBeUndefined();
    expect(edited.tracks.find((track: { id: string }) => track.id === "bass").volume).toBe(0.42);
    expect(edited.timeline.markers.some((marker: { bar: number }) => marker.bar === 3)).toBe(true);
  });

  it("returns export plans without rendering audio", async () => {
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_export_plan", {
      raw: buildPocketDawProjectFile(createDemoProject())
    }));

    expect(result.stems.length).toBeGreaterThan(0);
    expect(result.sectionLoops.length).toBeGreaterThan(0);
    expect(result.gamePacks.godot.manifestFile).toContain("godot");
    expect(result.gamePacks.web.manifestFile).toContain("web");
  });

  it("rejects unknown command types", async () => {
    await expect(callPocketDawMcpTool("pocket_daw_apply_commands", {
      raw: buildPocketDawProjectFile(createDemoProject()),
      commands: [{ type: "delete_everything" }]
    })).rejects.toThrow("Unsupported Pocket DAW MCP command");
  });
});

describe("Pocket DAW MCP server handshake", () => {
  it("reports a stable Codex-safe server identity", async () => {
    const { spawn } = await import("node:child_process");
    const serverPath = join(process.cwd(), "src", "mcp", "pocketDawMcpServer.ts");

    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", serverPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("serverInfo")) child.kill();
    });

    const message = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "0" }
      }
    });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Timed out waiting for MCP initialize response."));
      }, 5000);
      child.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    expect(output).toContain('"protocolVersion":"2025-06-18"');
    expect(output).toContain('"name":"pocket_daw"');
    expect(output).toContain('"listChanged":false');
  });
});
