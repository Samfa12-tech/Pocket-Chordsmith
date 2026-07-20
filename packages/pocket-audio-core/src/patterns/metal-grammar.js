export const METAL_RIFF_GRAMMAR = Object.freeze({
  metal_tight_riff: riff([[0, 0, "palm_mute", 116], [2, 0, "palm_mute", 92], [3, 0, "palm_mute", 88], [4, 3, "accent", 118], [6, 0, "chug", 96], [8, 5, "accent", 120], [10, 0, "palm_mute", 94], [11, 0, "palm_mute", 90], [14, 6, "accent", 116]]),
  metal_gallop: riff([[0, 0, "accent", 120], [2, 0, "palm_mute", 88], [3, 0, "palm_mute", 86], [4, 0, "accent", 112], [6, 0, "palm_mute", 88], [7, 0, "palm_mute", 86], [8, 5, "accent", 118], [10, 5, "palm_mute", 90], [11, 5, "palm_mute", 88]]),
  metal_breakdown: riff([[0, 0, "accent", 124], [3, 0, "chug", 102], [6, 1, "accent", 120], [10, 0, "palm_mute", 98], [15, 0, "chug", 110]])
});

export const METAL_DRUM_PATTERN_GRAMMAR = Object.freeze({
  metal_double_kick: drum([["kick",0,122],["kick",2,104],["snare",4,120],["kick",6,110],["kick",7,96],["kick",8,118],["kick",10,102],["snare",12,124],["kick",14,110],["kick",15,100],["crash",0,96]]),
  metal_breakdown_half_time: drum([["kick",0,124],["kick",3,110],["snare",8,126],["kick",10,112],["china",0,102],["china",8,94]]),
  metal_tom_fill: drum([["tom_high",12,88],["tom_high",13,96],["tom_mid",14,108],["tom_low",15,122]])
});

export function buildMetalPatternEvents(grammar, id, options = {}) {
  const source = grammar[id] || Object.values(grammar)[0] || [];
  return source.map((event) => ({ ...event, step: event.step + Math.max(0, Number(options.stepOffset || 0)) }));
}
function riff(entries) { return Object.freeze(entries.map(([step,note,articulation,velocity],index)=>Object.freeze({ step, duration: articulation === "accent" ? 0.9 : 0.42, note, velocity, articulation, role: step === 0 ? "anchor" : "riff", sound: "tight_metal", technique: Object.freeze({ metal: Object.freeze({ palmMute: articulation === "palm_mute" ? 0.88 : 0.2, pickDirection: index % 2 ? "up" : "down", dualTakeSeed: index + 1 }) }) }))); }
function drum(entries) { return Object.freeze(entries.map(([lane,step,velocity])=>Object.freeze({ step, duration: lane === "crash" || lane === "china" ? 1.5 : 0.5, lane, sound: lane, velocity, articulation: velocity > 115 ? "accent" : "finger", role: step === 0 ? "anchor" : "drive" }))); }
