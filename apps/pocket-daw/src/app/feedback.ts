import type { TesterDiagnosticsPayload } from "./diagnostics";

export const FEEDBACK_EMAIL = "samsmall1267@gmail.com";
export const MORE_BY_SAMFA12_URL = "https://samfa12.com";

const MAX_MAILTO_BODY_CHARS = 12000;

export interface FeedbackEmailInput {
  feedback: string;
  diagnostics: TesterDiagnosticsPayload;
  diagnosticsJson: string;
}

export interface FeedbackEmailDraft {
  mailtoUrl: string;
  subject: string;
  body: string;
  diagnosticsIncludedInBody: boolean;
}

export function buildFeedbackEmailDraft(input: FeedbackEmailInput): FeedbackEmailDraft {
  const subject = `Pocket DAW feedback - v${input.diagnostics.app.version}`;
  const trimmedFeedback = input.feedback.trim() || "(No typed feedback supplied.)";
  const summary = feedbackDiagnosticsSummary(input.diagnostics);
  const bodyWithFullDiagnostics = [
    "Pocket DAW feedback",
    "",
    trimmedFeedback,
    "",
    "Diagnostics JSON",
    "```json",
    input.diagnosticsJson,
    "```"
  ].join("\n");
  const diagnosticsIncludedInBody = bodyWithFullDiagnostics.length <= MAX_MAILTO_BODY_CHARS;
  const body = diagnosticsIncludedInBody
    ? bodyWithFullDiagnostics
    : [
        "Pocket DAW feedback",
        "",
        trimmedFeedback,
        "",
        "Diagnostics summary",
        summary,
        "",
        "Full diagnostics JSON was copied to the clipboard or exported as a file by Pocket DAW."
      ].join("\n");
  const params = new URLSearchParams({ subject, body });
  return {
    mailtoUrl: `mailto:${FEEDBACK_EMAIL}?${params.toString()}`,
    subject,
    body,
    diagnosticsIncludedInBody
  };
}

export function feedbackDiagnosticsSummary(diagnostics: TesterDiagnosticsPayload): string {
  return [
    `Captured: ${diagnostics.capturedAt}`,
    `App: ${diagnostics.app.name} ${diagnostics.app.version} (${diagnostics.app.runtime})`,
    `Build: ${diagnostics.app.buildId} / ${diagnostics.app.commit}`,
    `Project: ${diagnostics.project.title} / ${diagnostics.project.fileLabel}`,
    `Project path: ${diagnostics.project.filePath || "unsaved"}`,
    `Timeline: ${diagnostics.project.bpm} BPM, ${diagnostics.project.timeSig}/4, ${diagnostics.project.bars} bars, ${diagnostics.project.trackCount} tracks, ${diagnostics.project.clipCount} clips`,
    `Audio: ${diagnostics.audio.deviceHost}, ${diagnostics.audio.deviceCount} devices, backend ${diagnostics.audio.playbackBackend}`,
    `Recording: ${diagnostics.recording.status}, input ${diagnostics.recording.inputDeviceName || "none"}, peak ${Math.round(diagnostics.recording.inputPeak * 100)}%, armed ${diagnostics.recording.armedTrackIds.join(", ") || "none"}, monitor ${diagnostics.recording.monitorTrackIds.join(", ") || "none"}`,
    `Updater: ${diagnostics.updater.status} / ${diagnostics.updater.currentVersion} -> ${diagnostics.updater.availableVersion || "none"}`,
    `Handoff: ${diagnostics.handoff.result} from ${diagnostics.handoff.source || "none"} - ${diagnostics.handoff.message}`,
    `Media: ${diagnostics.media.poolCount} pool, ${diagnostics.media.missingCount} missing, ${diagnostics.media.externalReferenceCount} external`
  ].join("\n");
}
