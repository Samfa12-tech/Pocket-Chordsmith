import { describe, expect, it } from "vitest";
import {
  evaluateInstalledAudioInputPreviewStatus,
  installedAudioInputPreviewControlPlan,
  resolveInstalledAudioInput
} from "../scripts/installed-punch-take-audio-input";
import { parseInstalledPunchTakeSmokeArgs } from "../scripts/installed-punch-take-smoke-config";

function refreshedStatus() {
  return {
    diagnostics: {
      audio: {
        audioDeviceSettings: {
          inputDeviceId: "wasapi:input:microphone-array",
          devices: [
            {
              id: "wasapi:input:microphone-array",
              name: "Microphone Array",
              kind: "input",
              isDefaultInput: true,
              supportedChannels: [2]
            },
            {
              id: "wasapi:input:usb-interface",
              name: "USB Interface",
              kind: "input",
              isDefaultInput: false,
              supportedChannels: [1, 2, 4]
            }
          ]
        }
      }
    }
  };
}

function readyPreviewStatus() {
  return {
    ...refreshedStatus(),
    recording: {
      status: "idle",
      trackId: "live-vocals",
      inputDeviceName: "Microphone Array",
      inputPeak: 0.013,
      inputPreflight: {
        ok: true,
        warnings: [],
        capturePlan: [{
          trackId: "live-vocals",
          deviceId: "wasapi:input:microphone-array",
          mode: "mono",
          channelMap: [1]
        }]
      }
    },
    tracks: [{
      id: "live-vocals",
      armed: true,
      recordingInput: {
        deviceId: "wasapi:input:microphone-array",
        mode: "mono",
        channelIndex: 1
      }
    }]
  };
}

describe("installed punch/take audio input preflight", () => {
  it("defaults to the probed default device and zero-based Mono Ch1", () => {
    const args = parseInstalledPunchTakeSmokeArgs([], "C:\\LocalAppData");
    expect(args.audioInputDeviceId).toBeNull();
    expect(args.audioInputChannelIndex).toBe(0);

    expect(resolveInstalledAudioInput(refreshedStatus(), {
      deviceId: args.audioInputDeviceId,
      channelIndex: args.audioInputChannelIndex
    })).toEqual({
      deviceId: "wasapi:input:microphone-array",
      deviceName: "Microphone Array",
      channelIndex: 0,
      channelCount: 2
    });
  });

  it("parses and resolves an explicit probed device and zero-based Mono Ch2", () => {
    const args = parseInstalledPunchTakeSmokeArgs([
      "--audio-input-device-id", "wasapi:input:microphone-array",
      "--audio-input-channel-index", "1"
    ], "C:\\LocalAppData");
    expect(args.audioInputDeviceId).toBe("wasapi:input:microphone-array");
    expect(args.audioInputChannelIndex).toBe(1);
    expect(resolveInstalledAudioInput(refreshedStatus(), {
      deviceId: args.audioInputDeviceId,
      channelIndex: args.audioInputChannelIndex
    })).toMatchObject({
      deviceName: "Microphone Array",
      channelIndex: 1,
      channelCount: 2
    });
  });

  it("rejects malformed, unavailable, and out-of-range input selections", () => {
    expect(() => parseInstalledPunchTakeSmokeArgs(["--audio-input-channel-index", "-1"], "C:\\LocalAppData"))
      .toThrow("zero-based non-negative integer");
    expect(() => parseInstalledPunchTakeSmokeArgs(["--audio-input-channel-index", "1.5"], "C:\\LocalAppData"))
      .toThrow("zero-based non-negative integer");
    expect(() => resolveInstalledAudioInput(refreshedStatus(), { deviceId: "   ", channelIndex: 0 }))
      .toThrow("must not be empty");
    expect(() => resolveInstalledAudioInput(refreshedStatus(), { deviceId: "missing", channelIndex: 0 }))
      .toThrow("Requested audio input device is unavailable");
    expect(() => resolveInstalledAudioInput(refreshedStatus(), { deviceId: "wasapi:input:microphone-array", channelIndex: 2 }))
      .toThrow("out of range");
  });

  it("persists the exact channel before reopen and preview evidence", () => {
    const input = resolveInstalledAudioInput(refreshedStatus(), {
      deviceId: "wasapi:input:microphone-array",
      channelIndex: 1
    });
    const plan = installedAudioInputPreviewControlPlan("live-vocals", "C:\\evidence\\approval.pocketdaw", input);
    expect(plan.map((step) => step.action)).toEqual([
      "stop",
      "set_recording_options",
      "apply_commands",
      "save_current",
      "open_project",
      "stop",
      "seek_bar",
      "select_track"
    ]);
    expect(plan[2]).toMatchObject({
      action: "apply_commands",
      commands: [
        {
          type: "set_recording_input_channel",
          trackId: "live-vocals",
          deviceId: "wasapi:input:microphone-array",
          mode: "mono",
          channelIndex: 1
        },
        { type: "set_track_armed", trackId: "live-vocals", armed: true },
        { type: "set_track_monitor", trackId: "live-vocals", monitorEnabled: false }
      ]
    });
  });

  it("binds meter evidence to the exact device and channel and fails closed on drift", () => {
    const input = {
      deviceId: "wasapi:input:microphone-array",
      deviceName: "Microphone Array",
      channelIndex: 1,
      channelCount: 2
    };
    expect(evaluateInstalledAudioInputPreviewStatus(readyPreviewStatus(), "live-vocals", input, 0.005)).toEqual({
      ok: true,
      evidence: {
        trackId: "live-vocals",
        inputDeviceId: "wasapi:input:microphone-array",
        inputDeviceName: "Microphone Array",
        inputChannelIndex: 1,
        inputChannelMap: [1],
        inputChannelCount: 2,
        aggregateInputPeak: 0.013,
        requiredAggregateInputPeak: 0.005,
        channelClaim: "explicit-native-mono-channel",
        meterClaim: "aggregate-device-meter-only"
      }
    });

    const wrongChannel = readyPreviewStatus();
    wrongChannel.recording.inputPreflight.capturePlan[0].channelMap = [0];
    const result = evaluateInstalledAudioInputPreviewStatus(wrongChannel, "live-vocals", input, 0.005);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("capture channel map was [0]");
  });
});
