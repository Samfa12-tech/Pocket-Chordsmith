// Synchronous shared voice/voicing API for the existing authoring transports.
// Importing this bundle never creates an AudioContext or starts a voice.
export { prepareCampfireAcousticNoteBank } from "./synth/campfire-acoustic.js";
export { CAMPFIRE_ACOUSTIC_RECIPE, campfireAcousticVoicing, campfireAcousticEventVoices, campfireAcousticNoteKey } from "./sounds/campfire-acoustic.js";
