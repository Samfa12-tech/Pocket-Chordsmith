export const FUNK_BASS_PATTERN_GRAMMAR = Object.freeze({
  root_octave_answer: pattern([[0, 0, 112, "slap", "anchor"], [3, 7, 72, "mute", "pickup"], [6, 12, 96, "pop", "response"], [11, 7, 68, "finger", "pickup"]]),
  root_fifth_pickup: pattern([[0, 0, 108, "finger", "anchor"], [5, 7, 76, "finger", "response"], [7, 0, 38, "mute", "ghost"], [14, 7, 82, "finger", "pickup"]]),
  slap_pop_exchange: pattern([[0, 0, 118, "slap", "anchor"], [2, 12, 96, "pop", "response"], [3, 5, 38, "mute", "ghost"], [6, 7, 78, "hammer", "response"], [10, 12, 92, "pop", "response"], [14, 0, 74, "pull", "pickup"]]),
  muted_rake_one: pattern([[0, 0, 116, "slap", "anchor"], [11, 0, 34, "mute", "pickup"], [12, 0, 42, "mute", "pickup"], [13, 0, 52, "mute", "pickup"], [15, 7, 70, "finger", "pickup"]]),
  hammer_cell: pattern([[0, 0, 104, "finger", "anchor"], [2, 2, 70, "hammer", "response"], [6, 4, 78, "pull", "response"], [8, 0, 96, "slap", "anchor"]]),
  pull_off_answer: pattern([[0, 0, 106, "finger", "anchor"], [4, 7, 86, "finger", "call"], [5, 5, 70, "pull", "response"], [10, 3, 78, "hammer", "response"], [15, 0, 84, "finger", "pickup"]]),
  slide_home: pattern([[0, 0, 110, "slap", "anchor"], [6, 5, 74, "finger", "call"], [7, 7, 78, "slide", "response"], [12, 12, 92, "pop", "response"], [15, 0, 54, "mute", "pickup"]]),
  pocket_walk: pattern([[0, 0, 106, "finger", "anchor"], [3, 2, 62, "hammer", "response"], [6, 4, 76, "finger", "response"], [9, 5, 68, "finger", "call"], [12, 7, 84, "pop", "response"], [15, 10, 70, "pull", "pickup"]]),
  phrase_fill_home: pattern([[0, 0, 104, "finger", "anchor"], [8, 7, 82, "slap", "call"], [11, 10, 76, "hammer", "fill"], [12, 12, 94, "pop", "fill"], [13, 10, 70, "pull", "fill"], [14, 7, 82, "slide", "fill"], [15, 0, 48, "mute", "pickup"]])
});

export const FUNK_DRUM_PATTERN_GRAMMAR = Object.freeze({
  funk_backbeat_98: drumPattern([["kick", 0, 118, "accent"], ["kick", 6, 86], ["kick", 10, 92], ["snare", 4, 118, "accent"], ["snare", 12, 122, "accent"], ...sixteenthHats(), ["snare", 3, 32, "ghost"], ["snare", 11, 38, "ghost"]]),
  funk_ghost_push: drumPattern([["kick", 0, 120, "accent"], ["kick", 7, 78], ["kick", 10, 90], ["snare", 4, 116, "accent"], ["snare", 12, 120, "accent"], ["snare", 2, 28, "ghost"], ["snare", 7, 34, "ghost"], ["snare", 14, 42, "ghost"], ...sixteenthHats()]),
  funk_one_drop: drumPattern([["kick", 0, 124, "accent"], ["snare", 4, 112, "accent"], ["snare", 12, 118, "accent"], ["hat_closed", 0, 72], ["hat_closed", 2, 46], ["hat_closed", 6, 50], ["hat_closed", 8, 66], ["hat_closed", 10, 44], ["hat_open", 15, 72, "open"]]),
  funk_open_hat_lift: drumPattern([["kick", 0, 122, "accent"], ["kick", 6, 84], ["snare", 4, 118, "accent"], ["snare", 12, 121, "accent"], ...sixteenthHats().slice(0, 15), ["hat_open", 15, 88, "open"]]),
  funk_breakbeat_pocket: drumPattern([["kick", 0, 122, "accent"], ["kick", 3, 82], ["kick", 7, 90], ["kick", 10, 98], ["snare", 4, 118, "accent"], ["snare", 12, 124, "accent"], ["snare", 11, 36, "ghost"], ["hat_closed", 0, 70], ["hat_closed", 2, 48], ["hat_closed", 6, 54], ["hat_closed", 8, 66], ["hat_closed", 10, 50], ["hat_open", 15, 84, "open"]]),
  funk_fill_16ths: drumPattern([["snare", 12, 72], ["tom_high", 13, 82], ["tom_mid", 14, 94], ["tom_low", 15, 110, "accent"]]),
  funk_fill_snare_pickup: drumPattern([["snare", 11, 44, "ghost"], ["snare", 12, 68], ["snare", 13, 82], ["snare", 14, 96], ["snare", 15, 116, "accent"]]),
  funk_fill_tom_turn: drumPattern([["tom_high", 10, 72], ["snare", 11, 64, "ghost"], ["tom_high", 12, 82], ["tom_mid", 13, 92], ["tom_low", 14, 106], ["crash", 15, 112, "accent"]])
});

export const FUNK_STAB_PATTERN_GRAMMAR = Object.freeze({
  clav_conversation: pattern([[2, [0, 3, 6], 86, "staccato", "call"], [6, [0, 3, 6], 72, "mute", "response"], [10, [4, 7, 10], 92, "accent", "call"], [15, [0, 3, 6], 68, "staccato", "pickup"]]),
  brass_break: pattern([[0, [0, 3, 6], 104, "accent", "anchor"], [3, [4, 7, 10], 88, "staccato", "response"], [7, [0, 3, 6], 96, "accent", "response"]]),
  rhodes_offbeats: pattern([[2, [0, 3, 7], 74, "staccato", "call"], [6, [0, 3, 7], 80, "staccato", "response"], [10, [4, 7, 10], 76, "staccato", "call"], [14, [0, 3, 7], 84, "accent", "response"]]),
  muted_guitar_scratches: pattern([[1, [0, 7], 48, "scratch", "ghost"], [3, [0, 7], 68, "mute", "response"], [6, [0, 7], 54, "scratch", "ghost"], [9, [4, 10], 72, "mute", "call"], [11, [4, 10], 50, "scratch", "ghost"], [14, [0, 7], 78, "accent", "response"]])
});

export const FUNK_LEAD_PATTERN_GRAMMAR = Object.freeze({
  muted_trumpet_call: pattern([[6, 7, 88, "staccato", "call"], [7, 10, 82, "staccato", "call"], [14, 7, 78, "staccato", "response"]]),
  sax_phrase_answer: pattern([[9, 5, 78, "accent", "call"], [11, 7, 84, "legato", "response"], [13, 10, 92, "accent", "response"], [15, 7, 68, "staccato", "pickup"]]),
  horn_turnaround: pattern([[12, 0, 86, "accent", "fill"], [13, 3, 82, "staccato", "fill"], [14, 5, 90, "accent", "fill"], [15, 7, 104, "staccato", "pickup"]])
});

export function buildFunkPatternEvents(grammar, id, options = {}) {
  const source = grammar[id] || Object.values(grammar)[0] || [];
  const offset = Math.max(0, Number(options.stepOffset || 0));
  const velocityScale = Math.max(0, Number(options.velocityScale ?? 1));
  return source.map((event) => ({ ...event, step: event.step + offset, velocity: Math.round(event.velocity * velocityScale) }));
}

function pattern(entries) { return Object.freeze(entries.map(([step, note, velocity, articulation, role]) => Object.freeze({ step, duration: articulation === "mute" ? 0.35 : 0.72, note, velocity, articulation, role, technique: Object.freeze({ funk: Object.freeze({ callResponseRole: role }) }) }))); }
function drumPattern(entries) { return Object.freeze(entries.map(([lane, step, velocity, articulation = velocity < 50 ? "ghost" : "finger"]) => Object.freeze({ step, duration: lane === "hat_open" ? 1.4 : 0.45, velocity, articulation, lane, sound: lane, role: step === 0 ? "anchor" : articulation === "ghost" ? "ghost" : "groove", technique: Object.freeze({ funk: Object.freeze({ ghostDepth: articulation === "ghost" ? 1 - velocity / 127 : 0 }) }) }))); }
function sixteenthHats() { return Array.from({ length: 16 }, (_, step) => ["hat_closed", step, step % 4 === 0 ? 74 : step % 2 ? 42 : 58, step % 4 === 0 ? "accent" : "finger"]); }
