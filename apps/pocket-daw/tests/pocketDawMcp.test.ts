import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";
import { callPocketDawMcpTool, pocketDawMcpToolList } from "../src/mcp/pocketDawMcp";
import { metalArrangementMidiBytes } from "./midiFixtures";

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
      "pocket_daw_arrange_midi",
      "pocket_daw_apply_commands",
      "pocket_daw_export_plan",
      "pocket_daw_live_status",
      "pocket_daw_live_control",
      "pocket_daw_live_apply_commands"
    ]));
    expect(toolList.every((tool) => tool.inputSchema.type === "object")).toBe(true);
    expect(toolList.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    const applySchema = toolList.find((tool) => tool.name === "pocket_daw_apply_commands")?.inputSchema as { properties: Record<string, unknown> } | undefined;
    expect(applySchema?.properties.commands).toMatchObject({
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

  it("arranges MIDI into a heavy-metal Chordsmith-style project without writing by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-arrange-midi-"));
    const midiPath = join(dir, "fixture.mid");
    writeFileSync(midiPath, metalArrangementMidiBytes());

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_arrange_midi", {
      midiPath,
      title: "Fixture Metal"
    }));

    expect(result.ok).toBe(true);
    expect(result.written).toBeNull();
    expect(result.extraction.style).toBe("heavy_metal");
    expect(result.extraction.rawMidiClip).toBe("muted-reference");
    expect(result.project).toBeTruthy();
    expect(result.project.tracks.find((track: { id: string }) => track.id === "guitar")).toMatchObject({
      name: "Metal Rhythm Guitar",
      mute: false
    });
    expect(result.project.tracks.find((track: { id: string }) => track.id === "drums")).toMatchObject({
      name: "Metal Drums",
      mute: false
    });
    expect(result.project.tracks.find((track: { id: string }) => track.id === "midi")).toMatchObject({
      name: "Raw MIDI Reference",
      mute: true
    });
  });

  it("writes arranged MIDI only when outputPath is explicit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-arrange-midi-write-"));
    const midiPath = join(dir, "fixture.mid");
    const outputPath = join(dir, "fixture-metal.pocketdaw");
    writeFileSync(midiPath, metalArrangementMidiBytes());

    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_arrange_midi", {
      midiPath,
      outputPath,
      keepRawMidiClip: false
    }));
    const written = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.written).toBe(outputPath);
    expect(result.project).toBeUndefined();
    expect(result.extraction.rawMidiClip).toBe("omitted");
    expect(written.tracks.some((track: { id: string; mute?: boolean }) => track.id === "guitar" && track.mute === false)).toBe(true);
    expect(written.tracks.some((track: { trackType: string }) => track.trackType === "midi")).toBe(false);
  });

  it("rejects missing MIDI paths for arrangement", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-arrange-midi-missing-"));

    await expect(callPocketDawMcpTool("pocket_daw_arrange_midi", {
      midiPath: join(dir, "missing.mid")
    })).rejects.toThrow("File does not exist");
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

  it("reports live bridge unavailable when the app session file is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-missing-"));
    const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_status", {
      sessionPath: join(dir, "missing-session.json")
    }));

    expect(result.ok).toBe(false);
    expect(result.code).toBe("app_not_running");
  });

  it("sends live control through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    let auth = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      auth = String(init?.headers instanceof Headers ? init.headers.get("Authorization") : (init?.headers as Record<string, string>)?.Authorization || "");
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({ ok: true, transport: { playing: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_control", {
        sessionPath,
        action: "play"
      }));

      expect(result.ok).toBe(true);
      expect(auth).toBe("Bearer test-token");
      expect(JSON.parse(requestBody)).toMatchObject({ action: "play" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends live open_project through the tokened app bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-live-open-"));
    const sessionPath = join(dir, "ai-bridge-session.json");
    const projectPath = join(dir, "fixture-metal.pocketdaw");
    writeFileSync(sessionPath, JSON.stringify({
      statusUrl: "http://127.0.0.1:47858/pocket-daw/live/status",
      controlUrl: "http://127.0.0.1:47858/pocket-daw/live/control",
      token: "test-token"
    }));
    const originalFetch = globalThis.fetch;
    let requestBody = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({ ok: true, action: "open_project" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const result = parseToolResult(await callPocketDawMcpTool("pocket_daw_live_control", {
        sessionPath,
        action: "open_project",
        projectPath
      }));

      expect(result.ok).toBe(true);
      expect(JSON.parse(requestBody)).toMatchObject({ action: "open_project", projectPath });
    } finally {
      globalThis.fetch = originalFetch;
    }
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
    expect(output).not.toContain("Content-Length:");
  });
});
