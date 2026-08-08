import { POCKET_AUDIO_RESOURCE_LIMITS, SECTION_IDS } from "../constants.js";

export function assertPocketAudioProjectResourceLimits(project) {
  const limits = POCKET_AUDIO_RESOURCE_LIMITS;
  if (!project || typeof project !== "object" || Array.isArray(project)) return;
  const sections = project.sections && typeof project.sections === "object" && !Array.isArray(project.sections)
    ? project.sections
    : {};
  let totalEvents = 0;

  SECTION_IDS.forEach((sectionId) => {
    const section = sections[sectionId];
    if (!section || typeof section !== "object" || Array.isArray(section)) return;
    const trackGroups = [section.tracks, section.richTracks]
      .filter((group, index, groups) => group && typeof group === "object" && !Array.isArray(group) && groups.indexOf(group) === index);
    const trackEntries = trackGroups.flatMap((group) => Object.entries(group));
    assertLimit(`sections.${sectionId}.tracks`, trackEntries.length, limits.maxRichTracksPerSection);

    trackEntries.forEach(([trackId, track]) => {
      if (!track || typeof track !== "object" || Array.isArray(track)) return;
      const events = Array.isArray(track.events) ? track.events : [];
      assertLimit(`sections.${sectionId}.tracks.${trackId}.events`, events.length, limits.maxRichEventsPerTrack);
      totalEvents += events.length;
      assertLimit("project rich events", totalEvents, limits.maxRichEventsPerProject);
      events.forEach((event, eventIndex) => {
        if (!event || typeof event !== "object" || Array.isArray(event) || !Array.isArray(event.notes)) return;
        assertLimit(`sections.${sectionId}.tracks.${trackId}.events[${eventIndex}].notes`, event.notes.length, limits.maxNotesPerEvent);
      });
    });
  });
}

function assertLimit(path, actual, limit) {
  if (actual <= limit) return;
  const error = new RangeError(`Pocket Audio project exceeds ${path} limit (${actual} > ${limit}).`);
  error.name = "PocketAudioResourceLimitError";
  error.code = "POCKET_AUDIO_PROJECT_LIMIT_EXCEEDED";
  error.path = path;
  error.actual = actual;
  error.limit = limit;
  throw error;
}
