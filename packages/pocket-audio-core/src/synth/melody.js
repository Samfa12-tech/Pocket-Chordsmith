export function scheduleMelodyEvent(event) {
  return { ...event, scheduledBy: "pocket-audio-core/melody" };
}
