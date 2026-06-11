export class VoiceManager {
  constructor(limits = {}) {
    this.limits = { drums: 48, bass: 16, chords: 40, melody: 56, guitar: 18, ...limits };
    this.active = new Map();
  }

  add(role, voice) {
    const voices = this.active.get(role) || [];
    voices.push(voice);
    while (voices.length > (this.limits[role] || 32)) {
      const removed = voices.shift();
      if (removed && typeof removed.stop === "function") removed.stop();
    }
    this.active.set(role, voices);
  }

  clear() {
    this.active.forEach((voices) => voices.forEach((voice) => voice && typeof voice.stop === "function" && voice.stop()));
    this.active.clear();
  }

  diagnostics() {
    const byRole = {};
    this.active.forEach((voices, role) => {
      byRole[role] = voices.length;
    });
    return { activeVoicesByRole: byRole, activeVoices: Object.values(byRole).reduce((sum, count) => sum + count, 0) };
  }
}
