import type { PocketDawProject } from "./schema";
import { nativeTransportMap, timelineMetricsAtSortedBars } from "./timeline";

/** Timing/placement only. Source project and native-rendered audio stay canonical. */
export function createNativeGameTimeline(project: PocketDawProject) {
  const endBar = project.timeline.bars + 1;
  if (!Number.isFinite(endBar) || endBar <= 1 || endBar > 16385) throw new Error("Prepared game timeline supports up to 16384 bars. Export a shorter arrangement.");
  if (project.project.meterMap?.some(point => !Number.isInteger(point.bar))) throw new Error("Prepared game timeline needs meter changes on bar boundaries. Move the meter change before exporting.");
  const barNumbers = Array.from({ length: Math.ceil(endBar) }, (_, index) => index + 1);
  const coordinates = [...barNumbers, endBar, ...project.timeline.clips.flatMap(clip => [clip.startBar, clip.startBar + clip.barLength]), ...project.timeline.markers.map(marker => marker.bar)];
  const metrics = new Map(timelineMetricsAtSortedBars(project, coordinates).map(point => [point.bar, point]));
  const at = (bar: number) => metrics.get(bar)!;
  const ticks = (bar: number) => at(bar).projectPpq * 480;
  return {
    version: 1 as const,
    clock: "native-transport-map" as const,
    audioMode: "prepared-arrangement" as const,
    ticksPerQuarter: 480 as const,
    musicalEndSeconds: at(endBar).timeSeconds,
    musicalEndTick: ticks(endBar),
    transportMap: nativeTransportMap(project),
    bars: barNumbers.filter(bar => bar < endBar).map(bar => ({
      bar, startTick: ticks(bar), endTick: ticks(Math.min(bar + 1, endBar)),
      startSeconds: at(bar).timeSeconds, endSeconds: at(Math.min(bar + 1, endBar)).timeSeconds,
      numerator: at(bar).meter.numerator, denominator: at(bar).meter.denominator
    })),
    clips: project.timeline.clips.map(clip => ({
      id: clip.id, trackId: clip.trackId, type: clip.type, name: clip.name,
      sectionId: clip.sectionId || "", sourceRefId: clip.sourceRefId || "",
      startBar: clip.startBar, endBar: clip.startBar + clip.barLength,
      startTick: ticks(clip.startBar), endTick: ticks(clip.startBar + clip.barLength),
      startSeconds: at(clip.startBar).timeSeconds, endSeconds: at(clip.startBar + clip.barLength).timeSeconds,
      muted: clip.muted
    })),
    markers: project.timeline.markers.map(marker => ({ ...marker, tick: ticks(marker.bar), seconds: at(marker.bar).timeSeconds }))
  };
}

export type NativeGameTimeline = ReturnType<typeof createNativeGameTimeline>;
