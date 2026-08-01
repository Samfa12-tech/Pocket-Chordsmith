import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("VST3 Tauri command contract", () => {
  it("registers every command invoked by the TypeScript bridge", () => {
    const bridge = readFileSync(join(process.cwd(), "src", "plugins", "vst3Foundation.ts"), "utf8");
    const tauri = readFileSync(join(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");
    const invoked = [...bridge.matchAll(/api\.invoke(?:<[^;]*?>)?\("(vst3_[a-z0-9_]+)"/g)].map((match) => match[1]);
    const registered = new Set(
      [...tauri.matchAll(/vst3_(?:foundation|session)::(vst3_[a-z0-9_]+)/g)].map((match) => match[1])
    );
    expect(invoked.length).toBeGreaterThan(0);
    expect([...new Set(invoked)].filter((command) => !registered.has(command))).toEqual([]);
  });

  it("keeps explicit role and stable IDs on the canonical Rust commands", () => {
    const session = readFileSync(join(process.cwd(), "src-tauri", "src", "vst3_session.rs"), "utf8");
    expect(session).toMatch(/fn\s+vst3_session_load_instance\s*\(\s*instance_id:\s*String,\s*role:\s*String,\s*identity:\s*HostedPluginIdentity/);
    expect(session).toMatch(/fn\s+vst3_session_set_parameter\s*\(\s*instance_id:\s*String,\s*stable_parameter_id:\s*String,\s*value:\s*f64/);
    expect(session).toMatch(/fn\s+vst3_session_select_program\s*\(\s*instance_id:\s*String,\s*program_id:\s*String/);
    expect(session).toMatch(/fn\s+vst3_session_set_state\s*\(\s*instance_id:\s*String,\s*snapshot:\s*HostedStatePayload/);
  });
});
