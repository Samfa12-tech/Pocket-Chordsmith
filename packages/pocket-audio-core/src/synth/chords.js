export function scheduleChordEvent(event) {
  return { ...event, scheduledBy: "pocket-audio-core/chords" };
}
