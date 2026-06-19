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
    const tools = pocketDawMcpToolList().map((tool) => tool.name);

    expect(tools).toEqual(expect.arrayContaining([
      "pocket_daw_read_project",
      "pocket_daw_validate_project",
      "pocket_daw_create_from_chordsmith",
      "pocket_daw_apply_commands",
      "pocket_daw_export_plan"
    ]));
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
