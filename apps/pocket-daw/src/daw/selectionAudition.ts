import type { PocketDawProject } from "./schema";
import { timelineMetricsAtSortedBars } from "./timeline";

export interface SelectionAuditionPlan {
  label: string;
  startBar: number;
  endBar: number;
  startSeconds: number;
  endSeconds: number;
  leadInSeconds: number;
  tailSeconds: number;
}

/** Read-only monitor plan; selection, loop, source and saved mix are untouched. */
export function selectionAuditionPlan(project: PocketDawProject, clipIds: string[], leadInSeconds = 0.5, tailSeconds = 1): SelectionAuditionPlan {
  if (!Number.isFinite(leadInSeconds) || leadInSeconds < 0 || leadInSeconds > 2 || !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 8) {
    throw new Error("Choose a lead-in from 0 to 2 seconds and a tail from 0 to 8 seconds.");
  }
  const range = project.timeline.selection;
  const selectedIds = new Set(clipIds);
  const selected = project.timeline.clips.filter(clip => selectedIds.has(clip.id));
  if (!range && !selected.length) throw new Error("Select a clip or an edit range to hear this bit.");
  const startBar = range ? range.startBar : Math.min(...selected.map(clip => clip.startBar));
  const endBar = range ? range.endBar : Math.max(...selected.map(clip => clip.startBar + clip.barLength));
  if (!Number.isFinite(startBar) || !Number.isFinite(endBar) || startBar < 1 || endBar <= startBar) throw new Error("Choose a nonempty clip or edit range.");
  const [start, end] = timelineMetricsAtSortedBars(project, [startBar, endBar]);
  const bodyStart = start.timeSeconds;
  const startSeconds = Math.max(0, bodyStart - leadInSeconds);
  const endSeconds = end.timeSeconds + tailSeconds;
  if (endSeconds - startSeconds > 120) throw new Error("Choose a shorter range: audition supports up to 120 seconds including lead-in and tail.");
  return {
    label: range ? "Edit range" : selected.length === 1 ? selected[0].name : `${selected.length} selected clips`,
    startBar, endBar, startSeconds, endSeconds,
    leadInSeconds: bodyStart - startSeconds, tailSeconds
  };
}
