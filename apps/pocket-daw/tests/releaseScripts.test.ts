import { describe, expect, it } from "vitest";
import { audioRecordingControlPlan, midiPunchRecordingPreparationPlan } from "../scripts/installed-punch-take-control-plan";

const input = { deviceId: "wasapi:input:microphone-array", deviceName: "Microphone Array", channelIndex: 0, channelCount: 2 };

describe("installed-smoke control contracts", () => {
  it("requires an armed native aggregate-meter preflight before audio capture", () => {
    const audible = audioRecordingControlPlan("live", "C:\\smoke.pocketdaw", input, true, 0.01);
    const nonAudible = audioRecordingControlPlan("live", "C:\\smoke.pocketdaw", input, false, 0.01);
    expect(audible.preflightBeforeCapture).toBe(true);
    expect(audible.requiredAggregateInputPeak).toBe(0.01);
    expect(nonAudible.requiredAggregateInputPeak).toBe(0);
    expect(audible.previewControls.map((control) => control.action)).toEqual([
      "stop", "set_recording_options", "apply_commands", "save_current", "open_project", "stop", "seek_bar", "select_track"
    ]);
    expect(audible.captureAction).toBe("record_start");
  });

  it("stops and verifies MIDI punch positioning before input capture", () => {
    const plan = midiPunchRecordingPreparationPlan();
    expect(plan.mustBeStoppedAtRequestedBar).toBe(true);
    expect(plan.requestedCaptureStartBar).toBe(6);
    expect(plan.punchStartBar).toBe(7);
    expect(plan.punchEndBar).toBe(9);
    expect(plan.controls.map((control) => control.action)).toEqual(["stop", "set_recording_options", "apply_commands", "seek_bar"]);
    expect(plan.captureAction).toBe("midi_record_start");
  });
});
