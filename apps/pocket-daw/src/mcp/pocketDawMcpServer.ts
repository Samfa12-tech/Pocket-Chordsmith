import { stdin, stdout } from "node:process";
import { callPocketDawMcpTool, pocketDawMcpToolList } from "./pocketDawMcp.ts";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  buffer += chunk;
  drainMessages();
});

function drainMessages() {
  while (buffer.length) {
    if (buffer.startsWith("Content-Length:")) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.slice(0, headerEnd);
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) throw new Error("MCP message is missing Content-Length.");
      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return;
      const body = buffer.slice(bodyStart, bodyEnd);
      buffer = buffer.slice(bodyEnd);
      void handleJson(body);
      continue;
    }

    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) void handleJson(line);
  }
}

async function handleJson(json: string) {
  try {
    const request = JSON.parse(json) as JsonRpcRequest;
    const result = await handleRequest(request);
    if (request.id !== undefined) writeMessage({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

async function handleRequest(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    const requestedProtocolVersion = typeof request.params?.protocolVersion === "string"
      ? request.params.protocolVersion
      : "2025-06-18";
    return {
      protocolVersion: requestedProtocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "pocket_daw", version: "1.0.0" },
      instructions: "Use Pocket DAW MCP tools to inspect, validate, convert, edit and plan exports for .pocketdaw projects. Tools only write files when an explicit outputPath is provided."
    };
  }
  if (request.method === "tools/list") {
    return { tools: pocketDawMcpToolList() };
  }
  if (request.method === "tools/call") {
    const params = request.params || {};
    const name = typeof params.name === "string" ? params.name : "";
    return callPocketDawMcpTool(name, params.arguments || {});
  }
  if (request.method === "notifications/initialized") {
    return {};
  }
  throw new Error(`Unsupported MCP method: ${request.method || "[missing method]"}`);
}

function writeMessage(message: unknown) {
  const json = JSON.stringify(message);
  stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}
