export function scheduleDrumEvent(event) {
  return { ...event, scheduledBy: "pocket-audio-core/drums" };
}
