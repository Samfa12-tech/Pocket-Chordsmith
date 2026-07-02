export const DRUM_PRESETS = [
  { id: "money", label: "Basic rock", label3: "Waltz", simple4: true, simple3: true, timeSigs: [3, 4], tip: "Standard money beat: kick on 1 and 3, snare on 2 and 4, hats on eighths where the grid allows." },
  { id: "boom_chick", label: "Boom-chick", simple4: true, simple3: false, timeSigs: [4], tip: "Western boom-chick groove with bass-drum booms and snare/hat chicks." },
  { id: "train_beat", label: "Train beat", simple4: false, simple3: false, timeSigs: [4], tip: "Rolling train beat with steady hats and alternating kick/snare push." },
  { id: "cowboy_waltz", label: "Cowboy waltz", simple4: false, simple3: true, timeSigs: [3], tip: "Gentle 3/4 western waltz with a strong first beat and brushed backbeats." },
  { id: "rock", label: "Classic rock", label3: "3/4 rock", simple4: false, simple3: false, timeSigs: [3, 4], tip: "Busier classic rock with an extra kick on the and of 2." },
  { id: "sync_rock", label: "Sync rock", simple4: false, simple3: false, timeSigs: [4], tip: "Syncopated rock with sixteenth kick pickup into beat 2 on fine grids." },
  { id: "four_floor", label: "Four-on-floor", label3: "Three-on-floor", simple4: true, simple3: true, timeSigs: [3, 4], tip: "Kick on every beat with snare backbeat and offbeat hat accents where available." },
  { id: "dance", label: "Dance/house", simple4: false, simple3: false, timeSigs: [4], tip: "House-style four-on-floor with offbeat open-hat accents, not a filled sixteenth pattern." },
  { id: "half_time", label: "Half-time", simple4: true, simple3: false, timeSigs: [4], tip: "Half-time rock with the main snare on beat 3." },
  { id: "half_time_16", label: "Half-time 16ths", simple4: false, simple3: false, timeSigs: [4], tip: "Half-time groove with sixteenth-note hat motion and light ghost-snare approximations on fine grids." },
  { id: "punk", label: "Punk eighths", simple4: false, simple3: false, timeSigs: [4], tip: "Driving punk eighths with kick on every beat and snare on 2 and 4." },
  { id: "punk_double", label: "Double-time punk", simple4: false, simple3: false, timeSigs: [4], tip: "Double-time punk feel with the snare on eighth-note offbeats." },
  { id: "metal", label: "Metal chug", simple4: false, simple3: false, timeSigs: [4], tip: "Metal kick chug pattern with snare on 2 and 4." },
  { id: "blast", label: "Traditional blast", simple4: false, simple3: false, timeSigs: [4], tip: "Traditional/Euro blast: snare on the even sixteenth positions, kick and hat alternating between them on fine grids." },
  { id: "ghost", label: "Ghost groove", simple4: false, simple3: false, timeSigs: [4], tip: "Classic backbeat with normal snare hits approximating ghost notes below the accented 2 and 4." },
  { id: "ballad", label: "Ballad rock", label3: "3/4 ballad", simple4: false, simple3: true, timeSigs: [3, 4], tip: "Slower ballad-rock backbeat with restrained hats." },
  { id: "lofi_backbeat_76", label: "Lofi backbeat", simple4: true, simple3: false, timeSigs: [4], tip: "Soft swung chillhop backbeat with a rounded kick, rim-like snare and alternating hats." },
  { id: "lofi_lazy_boom_bap", label: "Lazy boom-bap", simple4: false, simple3: false, timeSigs: [4], tip: "Behind-the-grid boom-bap feel for train-window and streetlight loops." },
  { id: "lofi_half_time_soft", label: "Soft half-time", simple4: true, simple3: false, timeSigs: [4], tip: "Very gentle half-time pocket with sparse hats." },
  { id: "lofi_brush_shuffle", label: "Brush shuffle", simple4: false, simple3: false, timeSigs: [4], tip: "Brushy, humanised hat/snare motion for rainy lofi beds." },
  { id: "lofi_sparse_clicks", label: "Sparse clicks", simple4: true, simple3: false, timeSigs: [4], tip: "Minimal percussion for garden, menu and background game loops." },
  { id: "lofi_sleepy_waltz_3_4", label: "Sleepy waltz", simple4: false, simple3: true, timeSigs: [3], tip: "Sparse 3/4 lofi brush pattern for sleepy waltz loops." },
  { id: "chip_run_128", label: "Chip run", simple4: true, simple3: false, timeSigs: [4], tip: "Classic running game pulse with driving hats, simple backbeat and bright kick movement." },
  { id: "chip_menu_bounce", label: "Chip menu bounce", simple4: true, simple3: false, timeSigs: [4], tip: "Bouncy menu rhythm with light kicks, snare taps and cheerful offbeat hats." },
  { id: "chip_boss_half_time", label: "Chip boss half-time", simple4: true, simple3: false, timeSigs: [4], tip: "Half-time boss groove with heavy kick/snare anchors and tight noise hats." },
  { id: "chip_arp_jam", label: "Chip arp jam", simple4: false, simple3: false, timeSigs: [4], tip: "Modern chip jam groove with 16th-note motion, syncopated kicks and punchy backbeat." },
  { id: "chip_dungeon_shuffle", label: "Chip dungeon shuffle", simple4: false, simple3: false, timeSigs: [4], tip: "Uneasy dungeon shuffle with staggered hats and minor-key movement." },
  { id: "chip_victory_stomp", label: "Chip victory stomp", simple4: true, simple3: false, timeSigs: [4], tip: "Bright victory stomp with accented hats, arcade kick hits and payoff snare." },
  { id: "metal_backbeat_chug", label: "Metal backbeat chug", simple4: false, simple3: false, timeSigs: [4], tip: "Tight metal backbeat with kick doubles that follow palm-muted chugs." },
  { id: "metal_gallop_160", label: "Metal gallop 160", simple4: false, simple3: false, timeSigs: [4], tip: "Thrash gallop kick language with driving hats and strong backbeat." },
  { id: "metal_double_kick_drive", label: "Double-kick drive", simple4: false, simple3: false, timeSigs: [4], tip: "Continuous double-kick drive under a clear snare anchor." },
  { id: "metal_blast_220", label: "Blast 220", simple4: false, simple3: false, timeSigs: [4], tip: "Blast-beat approximation for fine grids, with safer lower-resolution fallbacks." },
  { id: "metal_doom_70", label: "Doom 70", simple4: true, simple3: false, timeSigs: [4], tip: "Slow doom procession with sparse cymbals and a long low kick." },
  { id: "metal_breakdown_half_time", label: "Breakdown half-time", simple4: true, simple3: false, timeSigs: [4], tip: "Half-time breakdown with gated kick/snare impacts." }
];

function drumHits(track, pos16, level = 1, options = {}) {
  return pos16.map((pos) => ({ track, pos16: pos, level, ...options }));
}

function drumGroove(...groups) {
  return groups.flat();
}

function drumAccentHits(track, pos16, accentPos16) {
  return drumGroove(drumHits(track, pos16, 1), drumHits(track, accentPos16, 2));
}

export const DRUM_PATTERN_DEFS = {
  4: {
    money: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2))
    },
    boom_chick: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8], 2), drumHits("snare", [4, 12])),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [4, 12]), drumHits("kick", [0, 8], 2), drumHits("snare", [4, 12])),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [4, 12]), drumHits("kick", [0, 8], 2), drumHits("snare", [4, 12]), drumHits("snare", [6, 14], 1, { minRes: 4 }))
    },
    train_beat: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12])),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 8, 14]), drumHits("snare", [4, 12])),
      res4: drumGroove(drumAccentHits("hat", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [0, 4, 8, 12]), drumHits("kick", [0, 3, 6, 8, 11, 14], 1, { minRes: 4 }), drumHits("snare", [4, 7, 12, 15]))
    },
    rock: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 8]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 8]), drumHits("snare", [4, 12], 2))
    },
    sync_rock: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 8, 10]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 3, 6, 8, 10], 1, { minRes: 4 }), drumHits("snare", [4, 12], 2))
    },
    four_floor: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [2, 6, 10, 14]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [2, 6, 10, 14]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2))
    },
    dance: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumHits("hat", [2, 6, 10, 14], 2), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumHits("hat", [2, 6, 10, 14], 2), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2))
    },
    half_time: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0]), drumHits("snare", [8], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 10]), drumHits("snare", [8], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 10]), drumHits("snare", [8], 2))
    },
    half_time_16: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0]), drumHits("snare", [8], 2)),
      res1Note: "Simplified to half-time rock at this resolution.",
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 10]), drumHits("snare", [8], 2)),
      res2Note: "Simplified to half-time rock at this resolution.",
      res4: drumGroove(drumAccentHits("hat", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [0, 4, 8, 12]), drumHits("kick", [0, 6, 10]), drumHits("snare", [8], 2), drumHits("snare", [5, 7, 13, 15], 1, { minRes: 4 }))
    },
    punk: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12], 2), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2))
    },
    punk_double: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12], 2), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res1Note: "Simplified because Full resolution cannot place eighth-note offbeat snares.",
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [2, 6, 10, 14], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [2, 6, 10, 14], 2))
    },
    metal: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8, 12]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 2, 8, 10, 12]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 1, 2, 3, 8, 9, 10, 11, 12, 14], 1, { minRes: 4 }), drumHits("snare", [4, 12], 2))
    },
    blast: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12], 2), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res1Note: "Simplified aggressive-rock fallback because Full resolution cannot represent a blast beat.",
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [2, 6, 10, 14], 2)),
      res2Note: "Using a skank/double-time fallback at this resolution.",
      res4: drumGroove(drumAccentHits("snare", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [1, 3, 5, 7, 9, 11, 13, 15], 1, { minRes: 4 }), drumHits("hat", [1, 3, 5, 7, 9, 11, 13, 15], 1, { minRes: 4 }))
    },
    ghost: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 8, 10]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 6, 8, 10]), drumHits("snare", [4, 12], 2), drumHits("snare", [3, 7, 11, 15], 1, { minRes: 4 }))
    },
    ballad: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2))
    },
    lofi_backbeat_76: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12])),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [0, 6, 8]), drumHits("snare", [4, 12])),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [0, 6, 8, 11]), drumHits("snare", [4, 12]), drumHits("snare", [7, 15], 1, { minRes: 4 }))
    },
    lofi_lazy_boom_bap: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12])),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 3, 8, 10], 1, { minRes: 2 }), drumHits("snare", [4, 12])),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [2, 10]), drumHits("kick", [0, 3, 8, 10], 1, { minRes: 2 }), drumHits("snare", [4, 12]), drumHits("snare", [6, 14], 1, { minRes: 4 }))
    },
    lofi_half_time_soft: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0]), drumHits("snare", [8])),
      res2: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 6]), drumHits("snare", [8])),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 8, 10, 12]), drumHits("kick", [0, 6, 11], 1, { minRes: 4 }), drumHits("snare", [8]), drumHits("snare", [14], 1, { minRes: 4 }))
    },
    lofi_brush_shuffle: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0]), drumHits("snare", [4, 12])),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [4, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12])),
      res4: drumGroove(drumAccentHits("hat", [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], [4, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12]), drumHits("snare", [6, 14], 1, { minRes: 4 }))
    },
    lofi_sparse_clicks: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0])),
      res2: drumGroove(drumHits("hat", [0, 6, 8, 14]), drumHits("kick", [0, 10]), drumHits("snare", [12])),
      res4: drumGroove(drumHits("hat", [0, 5, 8, 13]), drumHits("kick", [0, 10]), drumHits("snare", [12]), drumHits("hat", [15], 2, { minRes: 4 }))
    },
    chip_run_128: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12], 2), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [0, 6, 8, 14]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 3, 6, 8, 11, 14], 1, { minRes: 4 }), drumHits("snare", [4, 12], 2))
    },
    chip_menu_bounce: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0]), drumHits("snare", [8])),
      res2: drumGroove(drumHits("hat", [0, 2, 6, 8, 10, 14]), drumHits("kick", [0, 6, 10]), drumHits("snare", [8])),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 6, 8, 10, 14], [2, 10]), drumHits("kick", [0, 6, 10]), drumHits("snare", [8]), drumHits("hat", [15], 2, { minRes: 4 }))
    },
    chip_boss_half_time: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0, 12]), drumHits("snare", [8], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 8, 10, 12]), drumHits("kick", [0, 6, 12]), drumHits("snare", [8], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [0, 3, 6, 11, 12], 1, { minRes: 4 }), drumHits("snare", [8], 2), drumHits("snare", [15], 1, { minRes: 4 }))
    },
    chip_arp_jam: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 3, 8, 10], 1, { minRes: 2 }), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 14], [0, 8]), drumHits("kick", [0, 3, 8, 10, 13], 1, { minRes: 4 }), drumHits("snare", [4, 12], 2), drumHits("snare", [7, 15], 1, { minRes: 4 }))
    },
    chip_dungeon_shuffle: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8]), drumHits("snare", [12])),
      res2: drumGroove(drumHits("hat", [0, 2, 5, 8, 10, 13]), drumHits("kick", [0, 7, 10]), drumHits("snare", [4, 12])),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 5, 8, 10, 13, 15], [5, 13]), drumHits("kick", [0, 7, 10], 1, { minRes: 4 }), drumHits("snare", [4, 12]), drumHits("snare", [14], 1, { minRes: 4 }))
    },
    chip_victory_stomp: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12], 2), drumHits("kick", [0, 4, 8]), drumHits("snare", [12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 4, 8, 10]), drumHits("snare", [12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 3, 4, 8, 10], 1, { minRes: 4 }), drumHits("snare", [12], 2), drumHits("snare", [15], 1, { minRes: 4 }))
    },
    metal_backbeat_chug: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 8, 12]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 2, 8, 10, 12, 14]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 1, 2, 3, 8, 9, 10, 11, 12, 14], 1, { minRes: 4 }), drumHits("snare", [4, 12], 2))
    },
    metal_gallop_160: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12], 2), drumHits("kick", [0, 8]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [0, 2, 6, 8, 10, 14]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], 1, { minRes: 4 }), drumHits("snare", [4, 12], 2))
    },
    metal_double_kick_drive: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res2: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("snare", [4, 12], 2)),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]), drumHits("kick", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 1, { minRes: 4 }), drumHits("snare", [4, 12], 2))
    },
    metal_blast_220: {
      res1: drumGroove(drumHits("hat", [0, 4, 8, 12], 2), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [4, 12], 2)),
      res1Note: "Simplified because Full resolution cannot represent a blast beat.",
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10, 12, 14]), drumHits("kick", [0, 4, 8, 12]), drumHits("snare", [2, 6, 10, 14], 2)),
      res2Note: "Using a skank/double-time fallback at this resolution.",
      res4: drumGroove(drumAccentHits("snare", [0, 2, 4, 6, 8, 10, 12, 14], [0, 8]), drumHits("kick", [1, 3, 5, 7, 9, 11, 13, 15], 1, { minRes: 4 }), drumHits("hat", [1, 3, 5, 7, 9, 11, 13, 15], 1, { minRes: 4 }))
    },
    metal_doom_70: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0]), drumHits("snare", [8], 2)),
      res2: drumGroove(drumHits("hat", [0, 8, 14]), drumHits("kick", [0, 10]), drumHits("snare", [8], 2)),
      res4: drumGroove(drumHits("hat", [0, 8, 14]), drumHits("kick", [0, 10]), drumHits("snare", [8], 2), drumHits("hat", [15], 2, { minRes: 4 }))
    },
    metal_breakdown_half_time: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0, 12]), drumHits("snare", [8], 2)),
      res2: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0, 3, 8, 12]), drumHits("snare", [8], 2)),
      res4: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0, 3, 8, 10, 12], 1, { minRes: 4 }), drumHits("snare", [8], 2), drumHits("snare", [15], 1, { minRes: 4 }))
    }
  },
  3: {
    money: {
      res1: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0], 2), drumHits("snare", [4, 8])),
      res2: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0], 2), drumHits("snare", [4, 8])),
      res4: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0], 2), drumHits("snare", [4, 8]))
    },
    cowboy_waltz: {
      res1: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0], 2), drumHits("snare", [4, 8])),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10]), drumHits("kick", [0], 2), drumHits("snare", [4, 8])),
      res4: drumGroove(drumAccentHits("hat", [0, 2, 4, 6, 8, 10], [0]), drumHits("kick", [0], 2), drumHits("snare", [4, 8]), drumHits("snare", [6, 10], 1, { minRes: 4 }))
    },
    rock: {
      res1: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0]), drumHits("snare", [8], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10]), drumHits("kick", [0, 6]), drumHits("snare", [8], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10]), drumHits("kick", [0, 6]), drumHits("snare", [8], 2))
    },
    four_floor: {
      res1: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0, 4, 8]), drumHits("snare", [8], 2)),
      res2: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10]), drumHits("kick", [0, 4, 8]), drumHits("snare", [8], 2)),
      res4: drumGroove(drumHits("hat", [0, 2, 4, 6, 8, 10]), drumHits("kick", [0, 4, 8]), drumHits("snare", [8], 2))
    },
    ballad: {
      res1: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0]), drumHits("snare", [8], 2)),
      res2: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0]), drumHits("snare", [8], 2)),
      res4: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0]), drumHits("snare", [8], 2))
    },
    lofi_sleepy_waltz_3_4: {
      res1: drumGroove(drumHits("hat", [0, 8]), drumHits("kick", [0]), drumHits("snare", [8])),
      res2: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0]), drumHits("snare", [8])),
      res4: drumGroove(drumHits("hat", [0, 4, 8]), drumHits("kick", [0]), drumHits("snare", [8]), drumHits("hat", [10], 1, { minRes: 4 }))
    }
  }
};

export function drumPresetVisibleForProject(preset, pcs) {
  return Array.isArray(preset.timeSigs) ? preset.timeSigs.includes(pcs.timeSig) : true;
}

export function visibleDrumPresetsForProject(pcs) {
  return DRUM_PRESETS.filter((preset) => drumPresetVisibleForProject(preset, pcs));
}

export function drumPresetLabel(preset, pcs) {
  return pcs.timeSig === 3 ? preset.label3 || preset.label : preset.label;
}

export function findDrumPreset(presetId) {
  return DRUM_PRESETS.find((preset) => preset.id === presetId) || null;
}

export function drumPresetEventsForProject(presetId, pcs) {
  const bySig = DRUM_PATTERN_DEFS[pcs.timeSig] || {};
  const def = bySig[presetId] || bySig.money || DRUM_PATTERN_DEFS[4].money;
  const key = drumPresetResolutionKey(def, pcs.resolution);
  return {
    events: Array.isArray(def[key]) ? def[key] || [] : [],
    note: def[`${key}Note`] || ""
  };
}

export function shouldUsePresetEvent(event, resolution) {
  if (event.minRes && resolution < event.minRes) return false;
  if (event.maxRes && resolution > event.maxRes) return false;
  return true;
}

export function pos16ToStep(bar, pos16, pcs, totalSteps) {
  const beat = Math.floor(pos16 / 4);
  if (beat < 0 || beat >= pcs.timeSig) return -1;
  const fraction = (pos16 % 4) / 4;
  if (fraction > 0 && pcs.resolution <= 1) return -1;
  const base = (bar * pcs.timeSig + beat) * pcs.resolution;
  const offset = fraction > 0 ? clamp(Math.round(fraction * pcs.resolution), 0, Math.max(0, pcs.resolution - 1)) : 0;
  const step = base + offset;
  return step >= 0 && step < totalSteps ? step : -1;
}

function drumPresetResolutionKey(def, resolution) {
  if (resolution >= 4 && def.res4) return "res4";
  if (resolution >= 2 && def.res2) return "res2";
  if (def.res1) return "res1";
  if (def.res2) return "res2";
  return "res4";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
