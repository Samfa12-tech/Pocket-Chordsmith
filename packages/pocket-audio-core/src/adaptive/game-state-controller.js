export class GameStateController {
  constructor(audio) {
    this.audio = audio;
    this.states = new Map();
  }

  define(states) {
    Object.entries(states || {}).forEach(([name, definition]) => this.states.set(name, definition));
    if (this.audio?.defineMusicStates) this.audio.defineMusicStates(states);
    return this;
  }

  set(name, options = {}) {
    if (this.audio?.setMusicState) return this.audio.setMusicState(name, options);
    return this.apply(name, options);
  }

  queue(name, options = {}) {
    if (this.audio?.queueMusicState) return this.audio.queueMusicState(name, options);
    return this.apply(name, options);
  }

  apply(name, options = {}) {
    const definition = this.states.get(name);
    if (!definition) throw new Error(`Unknown music state: ${name}`);
    if (definition.section) this.audio.queueSection(definition.section, options);
    if (definition.sequence) this.audio.setSequence(definition.sequence);
    if (definition.loop !== undefined) this.audio.setLoop({ enabled: Boolean(definition.loop), sectionId: definition.section });
    if (definition.intensity !== undefined && this.audio.setIntensity) this.audio.setIntensity(definition.intensity);
    if (definition.fx) this.audio.setFx(definition.fx);
    if (definition.lowpass !== undefined && this.audio.lowpass) this.audio.lowpass(definition.lowpass);
    if (definition.duck !== undefined && this.audio.duck) this.audio.duck(Boolean(definition.duck), typeof definition.duck === "object" ? definition.duck : {});
    if (definition.stems) this.audio.applyStemPatchMap?.(definition.stems);
    if (definition.stinger && this.audio.triggerStinger) this.audio.triggerStinger(name);
    return definition;
  }
}
