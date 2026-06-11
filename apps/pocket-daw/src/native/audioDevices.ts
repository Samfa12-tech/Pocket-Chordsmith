import { invoke } from "@tauri-apps/api/core";
import type { AudioDeviceInfo, AudioDeviceSettings } from "../daw/schema";

export interface AudioProbeResult {
  host: string;
  devices: AudioDeviceInfo[];
  defaultInputId: string | null;
  defaultOutputId: string | null;
  notes: string[];
}

export async function probeAudioDevices(current: AudioDeviceSettings): Promise<AudioProbeResult> {
  try {
    return await invoke<AudioProbeResult>("probe_audio_devices");
  } catch {
    return probeBrowserDevices(current);
  }
}

async function probeBrowserDevices(current: AudioDeviceSettings): Promise<AudioProbeResult> {
  const devices = await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) || [];
  const mapped: AudioDeviceInfo[] = devices
    .filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")
    .map((device, index) => ({
      id: device.deviceId || `${device.kind}_${index}`,
      name: device.label || (device.kind === "audioinput" ? `Audio Input ${index + 1}` : `Audio Output ${index + 1}`),
      host: "browser",
      kind: device.kind === "audioinput" ? "input" : "output",
      isDefaultInput: device.kind === "audioinput" && device.deviceId === "default",
      isDefaultOutput: device.kind === "audiooutput" && device.deviceId === "default",
      supportedSampleRates: [current.sampleRate],
      supportedBufferSizes: [current.bufferSize],
      supportedChannels: device.kind === "audioinput" ? [current.inputChannels] : [current.outputChannels]
    }));
  return {
    host: "browser",
    devices: mapped,
    defaultInputId: mapped.find((device) => device.isDefaultInput)?.id || null,
    defaultOutputId: mapped.find((device) => device.isDefaultOutput)?.id || null,
    notes: ["Browser MediaDevices fallback. Native Tauri/CPAL probing is used in the installed app."]
  };
}
