export interface RequestedInstalledAudioInput {
  deviceId: string | null;
  channelIndex: number;
}

export interface ResolvedInstalledAudioInput {
  deviceId: string;
  deviceName: string;
  channelIndex: number;
  channelCount: number;
}

export interface InstalledAudioInputPreviewEvidence {
  trackId: string;
  inputDeviceId: string;
  inputDeviceName: string;
  inputChannelIndex: number;
  inputChannelMap: number[];
  inputChannelCount: number;
  aggregateInputPeak: number;
  requiredAggregateInputPeak: number;
  channelClaim: "explicit-native-mono-channel";
  meterClaim: "aggregate-device-meter-only";
}

interface AudioDeviceInfoLike {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  isDefaultInput?: unknown;
  supportedChannels?: unknown;
}

interface AudioSettingsLike {
  inputDeviceId?: unknown;
  devices?: unknown;
}

export function resolveInstalledAudioInput(
  status: any,
  requested: RequestedInstalledAudioInput
): ResolvedInstalledAudioInput {
  const settings = status?.diagnostics?.audio?.audioDeviceSettings as AudioSettingsLike | undefined;
  if (!settings || !Array.isArray(settings.devices)) {
    throw new Error("Installed audio-device refresh did not expose audioDeviceSettings.devices.");
  }
  const inputs = settings.devices.filter(isInputDevice);
  const defaultInputId = typeof settings.inputDeviceId === "string" ? settings.inputDeviceId.trim() : "";
  const explicitDeviceId = requested.deviceId === null ? null : requested.deviceId.trim();
  if (explicitDeviceId !== null && !explicitDeviceId) {
    throw new Error("Requested audio input device ID must not be empty.");
  }
  const requestedId = explicitDeviceId ?? defaultInputId;
  const device = requestedId
    ? inputs.find((item) => item.id === requestedId)
    : inputs.find((item) => item.isDefaultInput === true) || inputs[0];
  if (!device || typeof device.id !== "string" || !device.id.trim()) {
    throw new Error(requested.deviceId
      ? `Requested audio input device is unavailable: ${requested.deviceId}`
      : "No probed audio input device is available for installed smoke.");
  }
  const channelCount = maximumSupportedChannels(device.supportedChannels);
  if (channelCount < 1) {
    throw new Error(`Audio input device ${device.id} did not report a positive channel count.`);
  }
  if (!Number.isInteger(requested.channelIndex) || requested.channelIndex < 0 || requested.channelIndex >= channelCount) {
    throw new Error(`Audio input channel index ${requested.channelIndex} is out of range for ${device.id} (${channelCount} channels).`);
  }
  return {
    deviceId: device.id.trim(),
    deviceName: typeof device.name === "string" && device.name.trim() ? device.name.trim() : device.id.trim(),
    channelIndex: requested.channelIndex,
    channelCount
  };
}

export function installedAudioInputPreviewControlPlan(
  trackId: string,
  projectPath: string,
  input: ResolvedInstalledAudioInput
): Record<string, unknown>[] {
  return [
    { action: "stop" },
    { action: "set_recording_options", punchEnabled: false, takeMode: "take-lane" },
    {
      action: "apply_commands",
      commands: [
        { type: "set_recording_input_channel", trackId, deviceId: input.deviceId, mode: "mono", channelIndex: input.channelIndex },
        { type: "set_track_armed", trackId, armed: true },
        { type: "set_track_monitor", trackId, monitorEnabled: false }
      ]
    },
    { action: "save_current" },
    { action: "open_project", projectPath },
    { action: "stop" },
    { action: "seek_bar", bar: 1 },
    { action: "select_track", trackId }
  ];
}

export function evaluateInstalledAudioInputPreviewStatus(
  status: any,
  trackId: string,
  input: ResolvedInstalledAudioInput,
  requiredPeak: number
): { ok: true; evidence: InstalledAudioInputPreviewEvidence } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const recording = status?.recording;
  const preflight = recording?.inputPreflight;
  const capturePlan = Array.isArray(preflight?.capturePlan)
    ? preflight.capturePlan.find((item: any) => item?.trackId === trackId)
    : null;
  const track = Array.isArray(status?.tracks)
    ? status.tracks.find((item: any) => item?.id === trackId)
    : null;
  const inputPeak = Number(recording?.inputPeak);
  const channelMap = Array.isArray(capturePlan?.channelMap) ? capturePlan.channelMap.map(Number) : [];
  const preflightWarnings = Array.isArray(preflight?.warnings) ? preflight.warnings.filter(Boolean) : [];

  if (recording?.status !== "idle") errors.push(`recording.status was ${String(recording?.status)}`);
  if (recording?.trackId !== trackId) errors.push(`recording.trackId was ${String(recording?.trackId)}`);
  if (preflight?.ok !== true) errors.push("recording.inputPreflight.ok was not true");
  if (preflightWarnings.length) errors.push(`recording.inputPreflight warnings: ${preflightWarnings.join("; ")}`);
  if (capturePlan?.deviceId !== input.deviceId) errors.push(`capture device was ${String(capturePlan?.deviceId)}`);
  if (capturePlan?.mode !== "mono") errors.push(`capture mode was ${String(capturePlan?.mode)}`);
  if (channelMap.length !== 1 || channelMap[0] !== input.channelIndex) errors.push(`capture channel map was ${JSON.stringify(channelMap)}`);
  if (track?.armed !== true) errors.push("target track was not armed");
  if (track?.recordingInput?.deviceId !== input.deviceId) errors.push(`track input device was ${String(track?.recordingInput?.deviceId)}`);
  if (track?.recordingInput?.mode !== "mono") errors.push(`track input mode was ${String(track?.recordingInput?.mode)}`);
  if (track?.recordingInput?.channelIndex !== input.channelIndex) errors.push(`track channel index was ${String(track?.recordingInput?.channelIndex)}`);
  if (typeof recording?.inputDeviceName !== "string" || !recording.inputDeviceName.trim()) errors.push("native preview inputDeviceName was empty");
  if (!Number.isFinite(inputPeak) || inputPeak < Math.max(0, requiredPeak) || inputPeak > 1) errors.push(`aggregate input peak was ${String(recording?.inputPeak)}`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    evidence: {
      trackId,
      inputDeviceId: input.deviceId,
      inputDeviceName: recording.inputDeviceName.trim(),
      inputChannelIndex: input.channelIndex,
      inputChannelMap: [input.channelIndex],
      inputChannelCount: input.channelCount,
      aggregateInputPeak: inputPeak,
      requiredAggregateInputPeak: Math.max(0, requiredPeak),
      channelClaim: "explicit-native-mono-channel",
      meterClaim: "aggregate-device-meter-only"
    }
  };
}

function isInputDevice(value: unknown): value is AudioDeviceInfoLike & { id: string } {
  if (!value || typeof value !== "object") return false;
  const device = value as AudioDeviceInfoLike;
  return typeof device.id === "string" && !!device.id.trim()
    && (device.kind === "input" || device.kind === "duplex" || device.isDefaultInput === true);
}

function maximumSupportedChannels(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  const channels = value.map(Number).filter((item) => Number.isInteger(item) && item > 0);
  return channels.length ? Math.max(...channels) : 0;
}
