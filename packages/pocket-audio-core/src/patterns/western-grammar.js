export const WESTERN_PATTERN_GRAMMAR = Object.freeze({
  western_trail: Object.freeze([
    event(0, "kick", 112, "accent", "anchor"), event(4, "snare", 88, "finger", "chick"), event(8, "kick", 104, "accent", "boom"), event(12, "snare", 92, "finger", "chick")
  ]),
  western_train: Object.freeze(Array.from({ length: 16 }, (_, step) => event(step, step % 4 === 0 ? "kick" : "snare", step % 4 === 0 ? 105 : (step % 2 ? 48 : 66), step % 4 === 0 ? "accent" : "ghost", "train"))),
  western_banjo_roll: Object.freeze([0, 2, 4, 6, 8, 10, 12, 14].map((step, index) => Object.freeze({ step, duration: 0.7, note: [0, 4, 7, 4][index % 4], velocity: index % 4 === 0 ? 96 : 68, articulation: "finger", role: "roll", technique: Object.freeze({ western: Object.freeze({ banjoRoll: "forward", pickDirection: index % 2 ? "up" : "down" }) }) }))),
  western_showdown_pick: Object.freeze([0, 3, 6, 8, 11, 14].map((step, index) => Object.freeze({ step, duration: 0.55, note: [0, 2, 4, 7, 4, 2][index], velocity: step === 0 ? 112 : 82, articulation: index === 4 ? "bend" : "finger", role: step === 0 ? "anchor" : "pickup", technique: Object.freeze({ western: Object.freeze({ pickDirection: index % 2 ? "up" : "down", bend: index === 4 ? 2 : 0 }) }) })))
});

export function buildWesternPatternEvents(id, options = {}) {
  const source = WESTERN_PATTERN_GRAMMAR[id] || WESTERN_PATTERN_GRAMMAR.western_trail;
  return source.map((item) => ({ ...item, step: item.step + Math.max(0, Number(options.stepOffset || 0)) }));
}
function event(step, lane, velocity, articulation, role) { return Object.freeze({ step, duration: 0.45, lane, sound: lane, velocity, articulation, role, technique: Object.freeze({ western: Object.freeze({ strumDirection: step % 8 ? "up" : "down" }) }) }); }
