import {
  installedAudioInputPreviewControlPlan,
  type ResolvedInstalledAudioInput
} from "./installed-punch-take-audio-input";

/** Declarative installed-smoke ordering, kept separately from network I/O. */
export function audioRecordingControlPlan(
  trackId: string,
  projectPath: string,
  input: ResolvedInstalledAudioInput,
  requireAudibleAudio: boolean,
  minAudioPeak: number
) {
  return {
    previewControls: installedAudioInputPreviewControlPlan(trackId, projectPath, input),
    requiredAggregateInputPeak: requireAudibleAudio ? minAudioPeak : 0,
    captureAction: "record_start" as const,
    preflightBeforeCapture: true
  };
}

export function midiPunchRecordingPreparationPlan() {
  const requestedCaptureStartBar = 6;
  return {
    requestedCaptureStartBar,
    punchStartBar: 7,
    punchEndBar: 9,
    controls: [
      { action: "stop" },
      { action: "set_recording_options", punchEnabled: true, takeMode: "take-lane" },
      { action: "apply_commands", commands: [{ type: "set_punch_range", startBar: 7, endBar: 9 }] },
      { action: "seek_bar", bar: requestedCaptureStartBar }
    ],
    captureAction: "midi_record_start" as const,
    mustBeStoppedAtRequestedBar: true
  };
}
