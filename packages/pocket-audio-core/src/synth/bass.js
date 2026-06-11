export function scheduleBassEvent(event) {
  return { ...event, scheduledBy: "pocket-audio-core/bass" };
}
