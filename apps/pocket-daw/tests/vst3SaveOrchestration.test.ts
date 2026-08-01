import { describe, expect, it } from "vitest";
import { appendHostedStateSaveWarnings, safeReloadHostedInstance, serializeAfterReadyHostedStateCapture } from "../src/app/vst3SaveOrchestration";

describe("VST3 App save orchestration", () => {
  it("awaits every ready state capture before the first serialization", async () => {
    const events: string[] = [];
    const saved = await serializeAfterReadyHostedStateCapture(
      [
        { instanceId: "instrument-1", name: "Synth", phase: "ready" },
        { instanceId: "effect-1", name: "Delay", phase: "ready" },
        { instanceId: "missing-1", name: "Missing", phase: "missing" }
      ],
      async (instanceId) => {
        events.push(`capture:${instanceId}`);
        await Promise.resolve();
        events.push(`captured:${instanceId}`);
        return { captured: true };
      },
      async () => {
        events.push("serialize");
        return { message: "Saved." };
      }
    );

    expect(events).toEqual([
      "capture:instrument-1",
      "captured:instrument-1",
      "capture:effect-1",
      "captured:effect-1",
      "serialize"
    ]);
    expect(saved.result.message).toBe("Saved.");
    expect(saved.warnings).toEqual([]);
  });

  it("continues saving and exposes warnings when a ready instance retains its old snapshot", async () => {
    let serialized = false;
    const saved = await serializeAfterReadyHostedStateCapture(
      [{ instanceId: "effect-1", name: "Risky FX", phase: "ready" }],
      async () => ({ captured: false, warning: "Invalid state; previous valid snapshot retained." }),
      async () => {
        serialized = true;
        return "saved-project";
      }
    );

    expect(serialized).toBe(true);
    expect(saved.result).toBe("saved-project");
    expect(saved.warnings).toEqual(["Risky FX: Invalid state; previous valid snapshot retained."]);
    expect(appendHostedStateSaveWarnings("Saved project.", saved.warnings)).toBe(
      "Saved project. Saved with 1 plug-in state warning: Risky FX: Invalid state; previous valid snapshot retained."
    );
  });

  it("captures a ready instance before Safe Reload unloads and reloads it", async () => {
    const events: string[] = [];
    const result = await safeReloadHostedInstance(
      "instrument-1",
      "ready",
      async () => {
        events.push("capture");
        return { captured: false, warning: "Previous valid snapshot retained." };
      },
      async () => { events.push("unload"); },
      async () => { events.push("reload"); }
    );

    expect(events).toEqual(["capture", "unload", "reload"]);
    expect(result.warning).toBe("Previous valid snapshot retained.");
  });
});
