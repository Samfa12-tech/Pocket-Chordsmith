const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const DEGREE_LABELS = ["I","ii","iii","IV","V","vi","vii dim"];
const MINOR_LABELS = ["i","ii dim","III","iv","v","VI","VII"];
const CHORD_RANDOMISER_PATTERNS = {
  major:[
    {name:"Lift", degrees:[0,4,5,3]},
    {name:"Anthem", degrees:[0,3,4,3]},
    {name:"Glow", degrees:[5,3,0,4]},
    {name:"Classic", degrees:[0,5,3,4]},
    {name:"Turnaround", degrees:[1,4,0,5]},
    {name:"Climb", degrees:[0,2,3,4]}
  ],
  minor:[
    {name:"Moody lift", degrees:[0,5,2,6]},
    {name:"Dark pop", degrees:[0,6,5,6]},
    {name:"Drive", degrees:[0,3,5,4]},
    {name:"Cinematic", degrees:[0,2,6,5]},
    {name:"Pulse", degrees:[0,5,3,4]},
    {name:"Resolve", degrees:[0,3,4,5]}
  ]
};
function drumHits(track, pos16, level=1, options={}){
  return pos16.map(pos => ({track, pos16:pos, level, ...options}));
}
function drumGroove(...groups){ return groups.flat(); }
function drumAccentHits(track, pos16, accentPos16=[]){
  return drumGroove(drumHits(track, pos16, 1), drumHits(track, accentPos16, 2));
}
const DRUM_PRESETS = [
  {id:"money", label:"Basic rock", label3:"Waltz", simple4:true, simple3:true, timeSigs:[3,4], tip:"Standard money beat: kick on 1 and 3, snare on 2 and 4, hats on eighths where the grid allows."},
  {id:"boom_chick", label:"Boom-chick", simple4:true, simple3:false, timeSigs:[4], tip:"Western boom-chick groove with bass-drum booms and snare/hat chicks."},
  {id:"train_beat", label:"Train beat", simple4:false, simple3:false, timeSigs:[4], tip:"Rolling train beat with steady hats and alternating kick/snare push."},
  {id:"cowboy_waltz", label:"Cowboy waltz", simple4:false, simple3:true, timeSigs:[3], tip:"Gentle 3/4 western waltz with a strong first beat and brushed backbeats."},
  {id:"rock", label:"Classic rock", label3:"3/4 rock", simple4:false, simple3:false, timeSigs:[3,4], tip:"Busier classic rock with an extra kick on the and of 2."},
  {id:"sync_rock", label:"Sync rock", simple4:false, simple3:false, timeSigs:[4], tip:"Syncopated rock with sixteenth kick pickup into beat 2 on fine grids."},
  {id:"four_floor", label:"Four-on-floor", label3:"Three-on-floor", simple4:true, simple3:true, timeSigs:[3,4], tip:"Kick on every beat with snare backbeat and offbeat hat accents where available."},
  {id:"dance", label:"Dance/house", simple4:false, simple3:false, timeSigs:[4], tip:"House-style four-on-floor with offbeat open-hat accents, not a filled sixteenth pattern."},
  {id:"half_time", label:"Half-time", simple4:true, simple3:false, timeSigs:[4], tip:"Half-time rock with the main snare on beat 3."},
  {id:"half_time_16", label:"Half-time 16ths", simple4:false, simple3:false, timeSigs:[4], tip:"Half-time groove with sixteenth-note hat motion and light ghost-snare approximations on fine grids."},
  {id:"punk", label:"Punk eighths", simple4:false, simple3:false, timeSigs:[4], tip:"Driving punk eighths with kick on every beat and snare on 2 and 4."},
  {id:"punk_double", label:"Double-time punk", simple4:false, simple3:false, timeSigs:[4], tip:"Double-time punk feel with the snare on eighth-note offbeats."},
  {id:"metal", label:"Metal chug", simple4:false, simple3:false, timeSigs:[4], tip:"Metal kick chug pattern with snare on 2 and 4."},
  {id:"blast", label:"Traditional blast", simple4:false, simple3:false, timeSigs:[4], tip:"Traditional/Euro blast: snare on the even sixteenth positions, kick and hat alternating between them on fine grids."},
  {id:"ghost", label:"Ghost groove", simple4:false, simple3:false, timeSigs:[4], tip:"Classic backbeat with normal snare hits approximating ghost notes below the accented 2 and 4."},
  {id:"ballad", label:"Ballad rock", label3:"3/4 ballad", simple4:false, simple3:true, timeSigs:[3,4], tip:"Slower ballad-rock backbeat with restrained hats."},
  {id:"lofi_backbeat_76", label:"Lofi backbeat", simple4:true, simple3:false, timeSigs:[4], tip:"Soft swung chillhop backbeat with a rounded kick, rim-like snare and alternating hats."},
  {id:"lofi_lazy_boom_bap", label:"Lazy boom-bap", simple4:false, simple3:false, timeSigs:[4], tip:"Behind-the-grid boom-bap feel for train-window and streetlight loops."},
  {id:"lofi_half_time_soft", label:"Soft half-time", simple4:true, simple3:false, timeSigs:[4], tip:"Very gentle half-time pocket with sparse hats."},
  {id:"lofi_brush_shuffle", label:"Brush shuffle", simple4:false, simple3:false, timeSigs:[4], tip:"Brushy, humanised hat/snare motion for rainy lofi beds."},
  {id:"lofi_sparse_clicks", label:"Sparse clicks", simple4:true, simple3:false, timeSigs:[4], tip:"Minimal percussion for garden, menu and background game loops."},
  {id:"lofi_sleepy_waltz_3_4", label:"Sleepy waltz", simple4:false, simple3:true, timeSigs:[3], tip:"Sparse 3/4 lofi brush pattern for sleepy waltz loops."},
  {id:"chip_run_128", label:"Chip run", simple4:true, simple3:false, timeSigs:[4], tip:"Classic running game pulse with driving hats, simple backbeat and bright kick movement."},
  {id:"chip_menu_bounce", label:"Chip menu bounce", simple4:true, simple3:false, timeSigs:[4], tip:"Bouncy menu rhythm with light kicks, snare taps and cheerful offbeat hats."},
  {id:"chip_boss_half_time", label:"Chip boss half-time", simple4:true, simple3:false, timeSigs:[4], tip:"Half-time boss groove with heavy kick/snare anchors and tight noise hats."},
  {id:"chip_arp_jam", label:"Chip arp jam", simple4:false, simple3:false, timeSigs:[4], tip:"Modern chip jam groove with 16th-note motion, syncopated kicks and punchy backbeat."},
  {id:"chip_dungeon_shuffle", label:"Chip dungeon shuffle", simple4:false, simple3:false, timeSigs:[4], tip:"Uneasy dungeon shuffle with staggered hats and minor-key movement."},
  {id:"chip_victory_stomp", label:"Chip victory stomp", simple4:true, simple3:false, timeSigs:[4], tip:"Bright victory stomp with accented hats, arcade kick hits and payoff snare."},
  {id:"metal_backbeat_chug", label:"Metal backbeat chug", simple4:false, simple3:false, timeSigs:[4], tip:"Tight metal backbeat with kick doubles that follow palm-muted chugs."},
  {id:"metal_gallop_160", label:"Metal gallop 160", simple4:false, simple3:false, timeSigs:[4], tip:"Thrash gallop kick language with driving hats and strong backbeat."},
  {id:"metal_double_kick_drive", label:"Double-kick drive", simple4:false, simple3:false, timeSigs:[4], tip:"Continuous double-kick drive under a clear snare anchor."},
  {id:"metal_blast_220", label:"Blast 220", simple4:false, simple3:false, timeSigs:[4], tip:"Blast-beat approximation for fine grids, with safer lower-resolution fallbacks."},
  {id:"metal_doom_70", label:"Doom 70", simple4:true, simple3:false, timeSigs:[4], tip:"Slow doom procession with sparse cymbals and a long low kick."},
  {id:"metal_breakdown_half_time", label:"Breakdown half-time", simple4:true, simple3:false, timeSigs:[4], tip:"Half-time breakdown with gated kick/snare impacts."}
];
const DRUM_PATTERN_DEFS = {
  4:{
    money:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2))
    },
    boom_chick:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8],2), drumHits("snare",[4,12])),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[4,12]), drumHits("kick",[0,8],2), drumHits("snare",[4,12])),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[4,12]), drumHits("kick",[0,8],2), drumHits("snare",[4,12]), drumHits("snare",[6,14],1,{minRes:4}))
    },
    train_beat:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12])),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,8,14]), drumHits("snare",[4,12])),
      res4:drumGroove(drumAccentHits("hat",[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[0,4,8,12]), drumHits("kick",[0,3,6,8,11,14],1,{minRes:4}), drumHits("snare",[4,7,12,15]))
    },
    rock:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,8]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,8]), drumHits("snare",[4,12],2))
    },
    sync_rock:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,8,10]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,3,6,8,10],1,{minRes:4}), drumHits("snare",[4,12],2))
    },
    four_floor:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[2,6,10,14]), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[2,6,10,14]), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2))
    },
    dance:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumHits("hat",[2,6,10,14],2), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumHits("hat",[2,6,10,14],2), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2))
    },
    half_time:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0]), drumHits("snare",[8],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,10]), drumHits("snare",[8],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,10]), drumHits("snare",[8],2))
    },
    half_time_16:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0]), drumHits("snare",[8],2)),
      res1Note:"Simplified to half-time rock at this resolution.",
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,10]), drumHits("snare",[8],2)),
      res2Note:"Simplified to half-time rock at this resolution.",
      res4:drumGroove(drumAccentHits("hat",[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[0,4,8,12]), drumHits("kick",[0,6,10]), drumHits("snare",[8],2), drumHits("snare",[5,7,13,15],1,{minRes:4}))
    },
    punk:{
      res1:drumGroove(drumHits("hat",[0,4,8,12],2), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2))
    },
    punk_double:{
      res1:drumGroove(drumHits("hat",[0,4,8,12],2), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res1Note:"Simplified because Full resolution cannot place eighth-note offbeat snares.",
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,4,8,12]), drumHits("snare",[2,6,10,14],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,4,8,12]), drumHits("snare",[2,6,10,14],2))
    },
    metal:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8,12]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,2,8,10,12]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,1,2,3,8,9,10,11,12,14],1,{minRes:4}), drumHits("snare",[4,12],2))
    },
    blast:{
      res1:drumGroove(drumHits("hat",[0,4,8,12],2), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res1Note:"Simplified aggressive-rock fallback because Full resolution cannot represent a blast beat.",
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,4,8,12]), drumHits("snare",[2,6,10,14],2)),
      res2Note:"Using a skank/double-time fallback at this resolution.",
      res4:drumGroove(drumAccentHits("snare",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[1,3,5,7,9,11,13,15],1,{minRes:4}), drumHits("hat",[1,3,5,7,9,11,13,15],1,{minRes:4}))
    },
    ghost:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,8,10]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,6,8,10]), drumHits("snare",[4,12],2), drumHits("snare",[3,7,11,15],1,{minRes:4}))
    },
    ballad:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2))
    },
    lofi_backbeat_76:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12])),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[0,6,8]), drumHits("snare",[4,12])),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[0,6,8,11]), drumHits("snare",[4,12]), drumHits("snare",[7,15],1,{minRes:4}))
    },
    lofi_lazy_boom_bap:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0,8]), drumHits("snare",[4,12])),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,3,8,10],1,{minRes:2}), drumHits("snare",[4,12])),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[2,10]), drumHits("kick",[0,3,8,10],1,{minRes:2}), drumHits("snare",[4,12]), drumHits("snare",[6,14],1,{minRes:4}))
    },
    lofi_half_time_soft:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0]), drumHits("snare",[8])),
      res2:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,6]), drumHits("snare",[8])),
      res4:drumGroove(drumHits("hat",[0,2,4,8,10,12]), drumHits("kick",[0,6,11],1,{minRes:4}), drumHits("snare",[8]), drumHits("snare",[14],1,{minRes:4}))
    },
    lofi_brush_shuffle:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0]), drumHits("snare",[4,12])),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[4,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12])),
      res4:drumGroove(drumAccentHits("hat",[0,1,3,4,5,7,8,9,11,12,13,15],[4,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12]), drumHits("snare",[6,14],1,{minRes:4}))
    },
    lofi_sparse_clicks:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0])),
      res2:drumGroove(drumHits("hat",[0,6,8,14]), drumHits("kick",[0,10]), drumHits("snare",[12])),
      res4:drumGroove(drumHits("hat",[0,5,8,13]), drumHits("kick",[0,10]), drumHits("snare",[12]), drumHits("hat",[15],2,{minRes:4}))
    },
    chip_run_128:{
      res1:drumGroove(drumHits("hat",[0,4,8,12],2), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[0,6,8,14]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,3,6,8,11,14],1,{minRes:4}), drumHits("snare",[4,12],2))
    },
    chip_menu_bounce:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0]), drumHits("snare",[8])),
      res2:drumGroove(drumHits("hat",[0,2,6,8,10,14]), drumHits("kick",[0,6,10]), drumHits("snare",[8])),
      res4:drumGroove(drumAccentHits("hat",[0,2,6,8,10,14],[2,10]), drumHits("kick",[0,6,10]), drumHits("snare",[8]), drumHits("hat",[15],2,{minRes:4}))
    },
    chip_boss_half_time:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0,12]), drumHits("snare",[8],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,8,10,12]), drumHits("kick",[0,6,12]), drumHits("snare",[8],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[0,3,6,11,12],1,{minRes:4}), drumHits("snare",[8],2), drumHits("snare",[15],1,{minRes:4}))
    },
    chip_arp_jam:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,3,8,10],1,{minRes:2}), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,1,2,3,4,6,8,9,10,11,12,14],[0,8]), drumHits("kick",[0,3,8,10,13],1,{minRes:4}), drumHits("snare",[4,12],2), drumHits("snare",[7,15],1,{minRes:4}))
    },
    chip_dungeon_shuffle:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8]), drumHits("snare",[12])),
      res2:drumGroove(drumHits("hat",[0,2,5,8,10,13]), drumHits("kick",[0,7,10]), drumHits("snare",[4,12])),
      res4:drumGroove(drumAccentHits("hat",[0,2,5,8,10,13,15],[5,13]), drumHits("kick",[0,7,10],1,{minRes:4}), drumHits("snare",[4,12]), drumHits("snare",[14],1,{minRes:4}))
    },
    chip_victory_stomp:{
      res1:drumGroove(drumHits("hat",[0,4,8,12],2), drumHits("kick",[0,4,8]), drumHits("snare",[12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,4,8,10]), drumHits("snare",[12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,3,4,8,10],1,{minRes:4}), drumHits("snare",[12],2), drumHits("snare",[15],1,{minRes:4}))
    },
    metal_backbeat_chug:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,8,12]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,2,8,10,12,14]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,1,2,3,8,9,10,11,12,14],1,{minRes:4}), drumHits("snare",[4,12],2))
    },
    metal_gallop_160:{
      res1:drumGroove(drumHits("hat",[0,4,8,12],2), drumHits("kick",[0,8]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[0,2,6,8,10,14]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[0,1,3,4,5,7,8,9,11,12,13,15],1,{minRes:4}), drumHits("snare",[4,12],2))
    },
    metal_double_kick_drive:{
      res1:drumGroove(drumHits("hat",[0,4,8,12]), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res2:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,2,4,6,8,10,12,14]), drumHits("snare",[4,12],2)),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10,12,14],[0,4,8,12]), drumHits("kick",[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],1,{minRes:4}), drumHits("snare",[4,12],2))
    },
    metal_blast_220:{
      res1:drumGroove(drumHits("hat",[0,4,8,12],2), drumHits("kick",[0,4,8,12]), drumHits("snare",[4,12],2)),
      res1Note:"Simplified because Full resolution cannot represent a blast beat.",
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10,12,14]), drumHits("kick",[0,4,8,12]), drumHits("snare",[2,6,10,14],2)),
      res2Note:"Using a skank/double-time fallback at this resolution.",
      res4:drumGroove(drumAccentHits("snare",[0,2,4,6,8,10,12,14],[0,8]), drumHits("kick",[1,3,5,7,9,11,13,15],1,{minRes:4}), drumHits("hat",[1,3,5,7,9,11,13,15],1,{minRes:4}))
    },
    metal_doom_70:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0]), drumHits("snare",[8],2)),
      res2:drumGroove(drumHits("hat",[0,8,14]), drumHits("kick",[0,10]), drumHits("snare",[8],2)),
      res4:drumGroove(drumHits("hat",[0,8,14]), drumHits("kick",[0,10]), drumHits("snare",[8],2), drumHits("hat",[15],2,{minRes:4}))
    },
    metal_breakdown_half_time:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0,12]), drumHits("snare",[8],2)),
      res2:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0,3,8,12]), drumHits("snare",[8],2)),
      res4:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0,3,8,10,12],1,{minRes:4}), drumHits("snare",[8],2), drumHits("snare",[15],1,{minRes:4}))
    }
  },
  3:{
    money:{
      res1:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0],2), drumHits("snare",[4,8])),
      res2:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0],2), drumHits("snare",[4,8])),
      res4:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0],2), drumHits("snare",[4,8]))
    },
    cowboy_waltz:{
      res1:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0],2), drumHits("snare",[4,8])),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10]), drumHits("kick",[0],2), drumHits("snare",[4,8])),
      res4:drumGroove(drumAccentHits("hat",[0,2,4,6,8,10],[0]), drumHits("kick",[0],2), drumHits("snare",[4,8]), drumHits("snare",[6,10],1,{minRes:4}))
    },
    rock:{
      res1:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0]), drumHits("snare",[8],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10]), drumHits("kick",[0,6]), drumHits("snare",[8],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10]), drumHits("kick",[0,6]), drumHits("snare",[8],2))
    },
    four_floor:{
      res1:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0,4,8]), drumHits("snare",[8],2)),
      res2:drumGroove(drumHits("hat",[0,2,4,6,8,10]), drumHits("kick",[0,4,8]), drumHits("snare",[8],2)),
      res4:drumGroove(drumHits("hat",[0,2,4,6,8,10]), drumHits("kick",[0,4,8]), drumHits("snare",[8],2))
    },
    ballad:{
      res1:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0]), drumHits("snare",[8],2)),
      res2:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0]), drumHits("snare",[8],2)),
      res4:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0]), drumHits("snare",[8],2))
    },
    lofi_sleepy_waltz_3_4:{
      res1:drumGroove(drumHits("hat",[0,8]), drumHits("kick",[0]), drumHits("snare",[8])),
      res2:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0]), drumHits("snare",[8])),
      res4:drumGroove(drumHits("hat",[0,4,8]), drumHits("kick",[0]), drumHits("snare",[8]), drumHits("hat",[10],1,{minRes:4}))
    }
  }
};
const MELODY_IDEA_STYLES = [
  {name:"Hook", offsets:[0,2,4,2], pickup:1},
  {name:"Lift", offsets:[0,1,2,4], pickup:5},
  {name:"Answer", offsets:[4,2,0,6], pickup:2},
  {name:"Arc", offsets:[2,4,5,4], pickup:1}
];
const TRACKS = [
  {id:"kick", name:"Kick", short:"K"},
  {id:"snare", name:"Snare", short:"S"},
  {id:"hat", name:"Hat", short:"H"},
  {id:"bass", name:"Bass", short:"B"}
];
const COMMON_DRUM_LANES = ["kick","snare","rim","clap","hat_closed","hat_open","ride","crash","china","tom_high","tom_mid","tom_low","percussion"];
const EXPANDED_DRUM_LANES = COMMON_DRUM_LANES.filter(id => !["kick","snare","hat_closed","hat_open"].includes(id));
const DRUM_LANE_PAD_IDS = {kick:"kick",snare:"snare",rim:"clap",clap:"clap",hat_closed:"hat",hat_open:"openhat",ride:"ride",crash:"crash",china:"crash",tom_high:"tomhi",tom_mid:"tommid",tom_low:"tomlow",percussion:"clap"};
const DRUM_PADS = [
  {id:"kick", name:"Kick", meta:"A - writes Kick", key:"a", cls:"kick", recordTrack:"kick", recordLane:"kick", recordLevel:1},
  {id:"snare", name:"Snare", meta:"S - writes Snare", key:"s", cls:"snare", recordTrack:"snare", recordLane:"snare", recordLevel:1},
  {id:"clap", name:"Clap", meta:"D - writes Clap", key:"d", cls:"snare", recordTrack:null, recordLane:"clap", recordLevel:1},
  {id:"hat", name:"Hat", meta:"F - writes Closed Hat", key:"f", cls:"hat", recordTrack:"hat", recordLane:"hat_closed", recordLevel:1},
  {id:"openhat", name:"Open Hat", meta:"G - writes Open Hat", key:"g", cls:"hat", recordTrack:"hat", recordLane:"hat_open", recordLevel:2},
  {id:"tomlow", name:"Low Tom", meta:"J - writes Low Tom", key:"j", cls:"tom", recordTrack:null, recordLane:"tom_low", recordLevel:1},
  {id:"tommid", name:"Mid Tom", meta:"K - writes Mid Tom", key:"k", cls:"tom", recordTrack:null, recordLane:"tom_mid", recordLevel:1},
  {id:"tomhi", name:"High Tom", meta:"L - writes High Tom", key:"l", cls:"tom", recordTrack:null, recordLane:"tom_high", recordLevel:1},
  {id:"crash", name:"Crash", meta:"; - writes Crash", key:";", cls:"fx", recordTrack:null, recordLane:"crash", recordLevel:1},
  {id:"ride", name:"Ride", meta:"' - writes Ride", key:"'", cls:"fx", recordTrack:null, recordLane:"ride", recordLevel:1}
];
const MAX_BARS = 4;
const MIN_BPM = 60;
const MAX_BPM = 240;
const SECTION_IDS = ["A","B","C","D","E","F","G","H"];
const MAX_MELODY_TRACKS = 6;
const DEFAULT_SECTION_BARS = Object.fromEntries(SECTION_IDS.map(id => [id, MAX_BARS]));
const DEFAULT_SONG_SEQUENCE = ["A","A","B","A","A","B","C","B","A","D"];
const SHARE_CODE_PREFIX = "PCS1:";
const PCS_MAX_DECODED_BYTES = 4 * 1024 * 1024;
const PCS_MAX_ENCODED_CHARS = Math.ceil(PCS_MAX_DECODED_BYTES / 3) * 4;
const PROJECT_RESOURCE_LIMITS = Object.freeze({maxTracksPerSection:32,maxEventsPerTrack:4096,maxEventsPerProject:16384,maxNotesPerEvent:16});
const MIDI_IMPORT_MAX_BYTES = 4 * 1024 * 1024;
const MIDI_IMPORT_MAX_TRACKS = 256;
const MIDI_IMPORT_MAX_EVENTS = 65536;
const PROJECT_SCHEMA_VERSION = 17;
const LEGACY_PROJECT_SCHEMA_VERSION = 16;
const FORMAT_FEATURES = ["sound-profile-v1","rich-events-v1","articulations-v1","expanded-drums-v1","capability-report-v1"];
const POCKET_AUDIO_CORE_VERSION = "0.2.0";
const POCKET_AUDIO_CORE_SCHEMA_SUPPORT = "17";
const POCKET_AUDIO_CORE_PACKAGED_IMPORT_PATHS = [
  "./pocket-audio-core/dist/pocket-audio-core.browser.esm.js",
  "./pocket-audio-core/src/browser.js",
  "./pocket-audio-core/dist/pocket-audio-core.esm.js",
  "./pocket-audio-core/src/index.js"
];
const POCKET_AUDIO_CORE_REPO_IMPORT_PATHS = [
  "../../packages/pocket-audio-core/dist/pocket-audio-core.browser.esm.js",
  "../../packages/pocket-audio-core/src/browser.js",
  "../../packages/pocket-audio-core/src/index.js",
  "../../packages/pocket-audio-core/dist/pocket-audio-core.esm.js"
];
const POCKET_AUDIO_CORE_PACKAGED_IIFE_PATHS = [
  "./pocket-audio-core/dist/pocket-audio-core.iife.js"
];
const POCKET_AUDIO_CORE_REPO_IIFE_PATHS = [
  "../../packages/pocket-audio-core/dist/pocket-audio-core.iife.js"
];
// itch.io remains a public mirror/storefront for Pocket Chordsmith.
const POCKET_CHORDSMITH_URL = "https://samfa12.itch.io/pocket-chordsmith";
// Direct handoff target for the self-hosted Samfa12 web app.
// Local development still uses relative paths.
const POCKET_DJ_URL = "https://samfa12.com/apps/pocket-dj/";
const POCKET_AUDIO_HANDOFF_URL = "https://samfa12.com/apps/pocket-audio-handoff/";
const POCKET_AUDIO_HANDOFF_RELAY_URL = "https://pocket-audio-handoff.samfa12.workers.dev/api/pocket-audio-handoff";
const POCKET_DAW_URL = "pocket-daw://handoff";
const POCKET_DAW_LOCAL_HANDOFF_URL = "http://127.0.0.1:47858/pocket-daw/handoff";
const GODOT_PUSH_ENDPOINTS = [
  "http://127.0.0.1:9087/pocket-chordsmith/push-to-godot",
  "http://localhost:9087/pocket-chordsmith/push-to-godot"
];
const GODOT_RECEIVER_TOKEN_KEY = "pocket_chordsmith_godot_receiver_token_v1";
const HANDOFF_PARAM = "pocketHandoff";
const HANDOFF_WINDOW_PREFIX = "PocketHandoff:";
const HANDOFF_TO_DJ_KEY = "pocket_chordsmith_to_dj_handoff_v1";
const HANDOFF_TO_CHORDSMITH_KEY = "pocket_dj_to_chordsmith_handoff_v1";
const MOBILE_TRANSFER_URL_LIMIT = 60000;
const MIDI_TICKS_PER_QUARTER = 480;
const MAX_SEQUENCE_SLOTS = 64;
const GUITAR_ARTICULATIONS = ["off","open","chug","accent","hold","scratch"];
const GUITAR_TONES = ["clean","crunch","high_gain","metal","tight_metal","doom_fuzz","western_twang","funk_muted"];
const GUITAR_REGISTERS = ["low","mid","high"];
const GUITAR_STRUM_MODES = ["down","up","alternate"];
const GUITAR_PATTERN_PRESETS = ["rock_eighths","punk_downstrokes","metal_chug","gallop","doom_slow","thrash_gallop","tremolo_drive","breakdown_stabs","verse_chorus","boom_chick","train_chop","western_waltz"];
const GUITAR_FILL_STYLES = ["gentle_strum","sparse_strum","chug","accents_only"];
const CHORD_INSTRUMENTS = ["pocket","piano","saloon_piano","harp","warm_pad","glass","dusty_rhodes","felt_piano","cassette_keys","muted_jazz_guitar","lofi_warm_pad","chip_square_stack","chip_triangle_pad","chip_arp_keys","modern_chip_poly","metal_power_stack","dark_organ_stack","funk_clav_stab","funk_rhodes_stab","funk_brass_stack","western_saloon_piano","western_mandolin_chop"];
const MELODY_INSTRUMENTS = ["pulse","soft","synth","bell","lead_guitar","distorted_lead_guitar","banjo","harmonica","cowboy_whistle","trumpet","saxophone","mellow_vibes","soft_pluck","mellow_sax","muted_trumpet","tape_bell","chip_square_lead","chip_pulse_lead","chip_triangle_blip","chip_bell_stack","modern_chip_lead","shred_lead_guitar","twin_harmony_lead","funk_muted_trumpet","funk_sax_punch","western_harmonica","western_banjo","western_fiddle"];
const LOFI_AUDIO_PROFILE_ID = "lofi_chill";
const CHIP_AUDIO_PROFILE_ID = "chip_arcade";
const WESTERN_AUDIO_PROFILE_ID = "western_frontier";
const HEAVY_METAL_AUDIO_PROFILE_ID = "heavy_metal";
const FUNK_AUDIO_PROFILE_ID = "funk_groove";
const SOUND_PROFILE_IDS = ["standard",LOFI_AUDIO_PROFILE_ID,CHIP_AUDIO_PROFILE_ID,WESTERN_AUDIO_PROFILE_ID,HEAVY_METAL_AUDIO_PROFILE_ID,FUNK_AUDIO_PROFILE_ID];
const SOUND_PROFILE_ALIASES = {clean:"standard",chordsmith:"standard",chip_tune:CHIP_AUDIO_PROFILE_ID,chiptune:CHIP_AUDIO_PROFILE_ID,western:WESTERN_AUDIO_PROFILE_ID,metal:HEAVY_METAL_AUDIO_PROFILE_ID,funk:FUNK_AUDIO_PROFILE_ID};
const SOUND_PROFILE_DEFAULT_PRESETS = {standard:"standard_chordsmith",lofi_chill:"lofi_study_room",chip_arcade:"chip_nes_pulse",western_frontier:"western_trail",heavy_metal:"metal_tight_riff",funk_groove:"funk_classic_pocket"};
const SOUND_RECIPE_VERSION = 1;
const BASS_ARTICULATIONS = ["finger","slap","pop","mute","hammer","pull","slide","hold"];
const LOFI_DRUM_KITS = ["classic","lofi_dusty","lofi_brush","lofi_tape_soft"];
const LOFI_BASS_TONES = ["classic","warm_sub","soft_upright","rounded_triangle_bass"];
const LOFI_DRUM_GROOVE_PRESETS = ["lofi_backbeat_76","lofi_lazy_boom_bap","lofi_half_time_soft","lofi_brush_shuffle","lofi_sparse_clicks","lofi_sleepy_waltz_3_4"];
const CHIP_DRUM_KITS = ["chip_noise_kit","chip_arcade_kit","modern_chip_punch"];
const CHIP_BASS_TONES = ["chip_triangle_bass","chip_square_bass","modern_chip_sub","bitcrush_bass"];
const CHIP_DRUM_GROOVE_PRESETS = ["chip_run_128","chip_menu_bounce","chip_boss_half_time","chip_arp_jam","chip_dungeon_shuffle","chip_victory_stomp"];
const METAL_DRUM_KITS = ["metal_tight","metal_arena","metal_doom"];
const METAL_BASS_TONES = ["metal_pick_bass","metal_sub_pick","metal_grind_bass"];
const FUNK_DRUM_KITS = ["funk_dry_pocket","funk_breakbeat"];
const FUNK_BASS_TONES = ["funk_finger_pocket","funk_slap_pop","funk_muted_thump","funk_round_finger","funk_synth_pocket"];
const FUNK_DRUM_GROOVE_PRESETS = ["funk_backbeat_98","funk_ghost_push","funk_one_drop","funk_open_hat_lift","funk_breakbeat_pocket","funk_fill_16ths"];
const METAL_DRUM_GROOVE_PRESETS = ["metal_backbeat_chug","metal_gallop_160","metal_double_kick_drive","metal_blast_220","metal_doom_70","metal_breakdown_half_time"];
const DEFAULT_LOFI_TEXTURE = {enabled:false, vinylCrackle:0.08, tapeHiss:0.05, wowFlutter:0.03, warmth:0.16, lowPassAge:0.22, bitCrush:0.01};
const DEFAULT_CHIP_TEXTURE = {enabled:false, bitDepth:0.22, sampleRateCrush:0.18, pulseWidth:0.5, pitchDrift:0.03, saturation:0.16, stereoSpread:0.12};
const DEFAULT_METAL_TEXTURE = {enabled:false, drive:0.45, palmMute:0.68, lowTightness:0.78, presence:0.55, roomSize:0.14, pickAttack:0.7};
const DEFAULT_FUNK_PARAMETERS = {pocket:0.72,ghostNotes:0.42,slapAmount:0.68,popBrightness:0.62,muteDepth:0.74,stabTightness:0.76};
const FALLBACK_DRUM_KIT_CONFIGS = {
  classic:{kick:{startFreq:155,endFreq:45,sweepSeconds:0.14,gainFloor:0.08,gainScale:1,length:0.17,rampSeconds:0.16},snare:{noiseSeconds:0.12,highpass:1700,gainFloor:0.05,gainScale:1,length:0.13,rampSeconds:0.12},hat:{closedLength:0.05,openLength:0.16,highpassClosed:5600,highpassOpen:3800,gainFloorClosed:0.03,gainFloorOpen:0.05,gainScaleClosed:1,gainScaleOpen:1,rampSecondsClosed:0.05,rampSecondsOpen:0.14}},
  lofi_dusty:{kick:{startFreq:132,endFreq:42,sweepSeconds:0.18,filterFreq:170,gainFloor:0.04,gainScale:0.58,length:0.23,rampSeconds:0.21},snare:{noiseSeconds:0.13,highpass:980,lowpass:2800,gainFloor:0.035,gainScale:0.52,length:0.14,rampSeconds:0.12,bodyFreq:185,bodyGain:0.035,bodyLength:0.11,bodyRampSeconds:0.09},hat:{closedLength:0.065,openLength:0.2,highpassClosed:3400,highpassOpen:2600,lowpass:6200,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.55,gainScaleOpen:0.62,rampSecondsClosed:0.055,rampSecondsOpen:0.18}},
  lofi_brush:{kick:{startFreq:132,endFreq:42,sweepSeconds:0.18,filterFreq:135,gainFloor:0.04,gainScale:0.48,length:0.23,rampSeconds:0.21},snare:{noiseSeconds:0.18,highpass:720,lowpass:2800,gainFloor:0.035,gainScale:0.46,length:0.2,rampSeconds:0.18,bodyFreq:150,bodyGain:0.035,bodyLength:0.11,bodyRampSeconds:0.09},hat:{closedLength:0.065,openLength:0.2,highpassClosed:3400,highpassOpen:2600,lowpass:6200,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.55,gainScaleOpen:0.62,rampSecondsClosed:0.055,rampSecondsOpen:0.18}},
  lofi_tape_soft:{kick:{startFreq:118,endFreq:42,sweepSeconds:0.18,filterFreq:170,gainFloor:0.04,gainScale:0.58,length:0.23,rampSeconds:0.21},snare:{noiseSeconds:0.13,highpass:980,lowpass:2200,gainFloor:0.035,gainScale:0.52,length:0.14,rampSeconds:0.12,bodyFreq:185,bodyGain:0.035,bodyLength:0.11,bodyRampSeconds:0.09},hat:{closedLength:0.065,openLength:0.2,highpassClosed:3400,highpassOpen:2600,lowpass:5200,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.55,gainScaleOpen:0.62,rampSecondsClosed:0.055,rampSecondsOpen:0.18}},
  chip_noise_kit:{kick:{startFreq:210,endFreq:55,sweepSeconds:0.075,filterFreq:1900,gainFloor:0.05,gainScale:0.7,length:0.11,rampSeconds:0.095},snare:{noiseSeconds:0.075,highpass:1500,lowpass:6200,gainFloor:0.035,gainScale:0.72,length:0.08,rampSeconds:0.07,bodyFreq:260,bodyGain:0.028,bodyLength:0.055,bodyRampSeconds:0.05},hat:{closedLength:0.035,openLength:0.12,highpassClosed:5200,highpassOpen:3600,lowpass:9400,gainFloorClosed:0.018,gainFloorOpen:0.03,gainScaleClosed:0.68,gainScaleOpen:0.72,rampSecondsClosed:0.03,rampSecondsOpen:0.105}},
  chip_arcade_kit:{kick:{startFreq:185,endFreq:48,sweepSeconds:0.095,filterFreq:1400,gainFloor:0.055,gainScale:0.78,length:0.14,rampSeconds:0.12},snare:{noiseSeconds:0.09,highpass:1300,lowpass:5600,gainFloor:0.04,gainScale:0.68,length:0.1,rampSeconds:0.085,bodyFreq:220,bodyGain:0.032,bodyLength:0.075,bodyRampSeconds:0.065},hat:{closedLength:0.04,openLength:0.145,highpassClosed:5000,highpassOpen:3300,lowpass:9000,gainFloorClosed:0.018,gainFloorOpen:0.032,gainScaleClosed:0.66,gainScaleOpen:0.72,rampSecondsClosed:0.034,rampSecondsOpen:0.12}},
  modern_chip_punch:{kick:{startFreq:150,endFreq:38,sweepSeconds:0.145,filterFreq:230,gainFloor:0.06,gainScale:0.88,length:0.18,rampSeconds:0.16},snare:{noiseSeconds:0.105,highpass:980,lowpass:4800,gainFloor:0.04,gainScale:0.76,length:0.12,rampSeconds:0.1,bodyFreq:190,bodyGain:0.046,bodyLength:0.095,bodyRampSeconds:0.08},hat:{closedLength:0.045,openLength:0.17,highpassClosed:4300,highpassOpen:3000,lowpass:7800,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.7,gainScaleOpen:0.78,rampSecondsClosed:0.04,rampSecondsOpen:0.145}},
  funk_dry_pocket:{kick:{startFreq:132,endFreq:44,sweepSeconds:0.09,gainFloor:0.05,gainScale:0.9,length:0.16,rampSeconds:0.14},snare:{noiseSeconds:0.1,highpass:1200,lowpass:6800,gainFloor:0.035,gainScale:0.8,length:0.12,rampSeconds:0.1,bodyFreq:178,bodyGain:0.08,bodyLength:0.08,bodyRampSeconds:0.07},hat:{closedLength:0.048,openLength:0.18,highpassClosed:6500,highpassOpen:4300,lowpass:9200,gainFloorClosed:0.018,gainFloorOpen:0.028,gainScaleClosed:0.58,gainScaleOpen:0.72,rampSecondsClosed:0.04,rampSecondsOpen:0.15}},
  funk_breakbeat:{kick:{startFreq:148,endFreq:42,sweepSeconds:0.12,gainFloor:0.05,gainScale:0.9,length:0.16,rampSeconds:0.14},snare:{noiseSeconds:0.1,highpass:1200,lowpass:6800,gainFloor:0.035,gainScale:0.92,length:0.12,rampSeconds:0.1,bodyFreq:192,bodyGain:0.08,bodyLength:0.08,bodyRampSeconds:0.07},hat:{closedLength:0.062,openLength:0.18,highpassClosed:7200,highpassOpen:4300,lowpass:9600,gainFloorClosed:0.018,gainFloorOpen:0.028,gainScaleClosed:0.58,gainScaleOpen:0.72,rampSecondsClosed:0.05,rampSecondsOpen:0.15}}
};
const LOFI_STYLE_PRESETS = {
  lofi_study_room:{label:"Study Room", bpm:76, range:[72,80], key:"A", scale:"minor", timeSig:4, progression:[0,5,2,6], swing:0.12, humanize:0.11, chordInstrument:"dusty_rhodes", melodyInstrument:"mellow_vibes", bassTone:"warm_sub", drumKit:"lofi_dusty", drumGroovePreset:"lofi_backbeat_76", texture:{enabled:true, vinylCrackle:0.09, tapeHiss:0.04, wowFlutter:0.03, warmth:0.18, lowPassAge:0.24, bitCrush:0.01}},
  lofi_rainy_window:{label:"Rainy Window", bpm:72, range:[68,76], key:"D", scale:"minor", timeSig:4, progression:[0,5,3,6], swing:0.10, humanize:0.13, chordInstrument:"felt_piano", melodyInstrument:"tape_bell", bassTone:"soft_upright", drumKit:"lofi_brush", drumGroovePreset:"lofi_brush_shuffle", texture:{enabled:true, vinylCrackle:0.04, tapeHiss:0.10, wowFlutter:0.025, warmth:0.14, lowPassAge:0.20, bitCrush:0}},
  lofi_moon_garden:{label:"Moon Garden", bpm:80, range:[74,84], key:"E", scale:"minor", timeSig:4, progression:[0,3,5,4], swing:0.14, humanize:0.10, chordInstrument:"lofi_warm_pad", melodyInstrument:"mellow_vibes", bassTone:"warm_sub", drumKit:"lofi_tape_soft", drumGroovePreset:"lofi_half_time_soft", texture:{enabled:true, vinylCrackle:0.06, tapeHiss:0.05, wowFlutter:0.045, warmth:0.22, lowPassAge:0.18, bitCrush:0.01}},
  lofi_koi_pond:{label:"Koi Pond", bpm:70, range:[68,74], key:"F", scale:"major", timeSig:4, progression:[0,5,3,4], swing:0.11, humanize:0.12, chordInstrument:"lofi_warm_pad", melodyInstrument:"tape_bell", bassTone:"rounded_triangle_bass", drumKit:"lofi_tape_soft", drumGroovePreset:"lofi_sparse_clicks", texture:{enabled:true, vinylCrackle:0.035, tapeHiss:0.045, wowFlutter:0.02, warmth:0.18, lowPassAge:0.16, bitCrush:0}},
  lofi_train_window:{label:"Train Window", bpm:82, range:[78,86], key:"C", scale:"minor", timeSig:4, progression:[0,6,5,3], swing:0.15, humanize:0.12, chordInstrument:"muted_jazz_guitar", melodyInstrument:"soft_pluck", bassTone:"warm_sub", drumKit:"lofi_dusty", drumGroovePreset:"lofi_lazy_boom_bap", texture:{enabled:true, vinylCrackle:0.08, tapeHiss:0.06, wowFlutter:0.055, warmth:0.20, lowPassAge:0.28, bitCrush:0.018}},
  lofi_ant_farm_night:{label:"Ant Farm Night", bpm:80, range:[76,84], key:"B", scale:"minor", timeSig:4, progression:[0,5,3,4], swing:0.13, humanize:0.14, chordInstrument:"cassette_keys", melodyInstrument:"soft_pluck", bassTone:"rounded_triangle_bass", drumKit:"lofi_tape_soft", drumGroovePreset:"lofi_sparse_clicks", texture:{enabled:true, vinylCrackle:0.05, tapeHiss:0.07, wowFlutter:0.04, warmth:0.18, lowPassAge:0.22, bitCrush:0.012}},
  lofi_menu_warmth:{label:"Menu Warmth", bpm:76, range:[72,80], key:"C", scale:"major", timeSig:4, progression:[0,5,3,4], swing:0.09, humanize:0.08, chordInstrument:"felt_piano", melodyInstrument:"tape_bell", bassTone:"warm_sub", drumKit:"lofi_brush", drumGroovePreset:"lofi_half_time_soft", texture:{enabled:true, vinylCrackle:0.03, tapeHiss:0.04, wowFlutter:0.02, warmth:0.16, lowPassAge:0.18, bitCrush:0}},
  lofi_sleepy_waltz:{label:"Sleepy Waltz", bpm:68, range:[64,72], key:"C", scale:"major", timeSig:3, progression:[0,5,3,4], swing:0.06, humanize:0.11, chordInstrument:"felt_piano", melodyInstrument:"mellow_vibes", bassTone:"soft_upright", drumKit:"lofi_brush", drumGroovePreset:"lofi_sleepy_waltz_3_4", texture:{enabled:true, vinylCrackle:0.035, tapeHiss:0.035, wowFlutter:0.025, warmth:0.14, lowPassAge:0.20, bitCrush:0}}
};
const LOFI_STYLE_PRESET_IDS = Object.keys(LOFI_STYLE_PRESETS);
const CHIP_STYLE_PRESETS = {
  chip_arcade_start:{label:"Arcade Start", bpm:124, range:[116,132], key:"C", scale:"major", timeSig:4, progression:[0,4,5,3], swing:0.02, humanize:0.03, chordInstrument:"chip_square_stack", melodyInstrument:"chip_square_lead", bassTone:"chip_triangle_bass", drumKit:"chip_noise_kit", drumGroovePreset:"chip_run_128", texture:{enabled:true, bitDepth:0.20, sampleRateCrush:0.16, pulseWidth:0.50, pitchDrift:0.015, saturation:0.14, stereoSpread:0.10}},
  chip_bug_maze_pulse:{label:"Bug Maze Pulse", bpm:130, range:[124,138], key:"E", scale:"minor", timeSig:4, progression:[0,6,5,3], swing:0.04, humanize:0.05, chordInstrument:"modern_chip_poly", melodyInstrument:"modern_chip_lead", bassTone:"modern_chip_sub", drumKit:"modern_chip_punch", drumGroovePreset:"chip_arp_jam", texture:{enabled:true, bitDepth:0.18, sampleRateCrush:0.14, pulseWidth:0.42, pitchDrift:0.025, saturation:0.32, stereoSpread:0.20}},
  chip_neon_boss:{label:"Neon Boss", bpm:142, range:[132,150], key:"F#", scale:"minor", timeSig:4, progression:[0,5,6,4], swing:0.03, humanize:0.03, chordInstrument:"modern_chip_poly", melodyInstrument:"chip_pulse_lead", bassTone:"bitcrush_bass", drumKit:"modern_chip_punch", drumGroovePreset:"chip_boss_half_time", texture:{enabled:true, bitDepth:0.32, sampleRateCrush:0.22, pulseWidth:0.36, pitchDrift:0.02, saturation:0.40, stereoSpread:0.18}},
  chip_tiny_quest:{label:"Tiny Quest", bpm:112, range:[104,122], key:"G", scale:"major", timeSig:4, progression:[0,3,4,0], swing:0.03, humanize:0.05, chordInstrument:"chip_triangle_pad", melodyInstrument:"chip_triangle_blip", bassTone:"chip_triangle_bass", drumKit:"chip_arcade_kit", drumGroovePreset:"chip_menu_bounce", texture:{enabled:true, bitDepth:0.16, sampleRateCrush:0.12, pulseWidth:0.54, pitchDrift:0.02, saturation:0.12, stereoSpread:0.12}},
  chip_modern_jam:{label:"Modern Jam", bpm:128, range:[120,136], key:"A", scale:"minor", timeSig:4, progression:[0,5,2,6], swing:0.05, humanize:0.05, chordInstrument:"modern_chip_poly", melodyInstrument:"modern_chip_lead", bassTone:"modern_chip_sub", drumKit:"modern_chip_punch", drumGroovePreset:"chip_arp_jam", texture:{enabled:true, bitDepth:0.20, sampleRateCrush:0.16, pulseWidth:0.44, pitchDrift:0.035, saturation:0.28, stereoSpread:0.24}},
  chip_menu_glow:{label:"Menu Glow", bpm:96, range:[88,106], key:"C", scale:"major", timeSig:4, progression:[0,4,3,4], swing:0.02, humanize:0.04, chordInstrument:"chip_triangle_pad", melodyInstrument:"chip_bell_stack", bassTone:"chip_triangle_bass", drumKit:"chip_arcade_kit", drumGroovePreset:"chip_menu_bounce", texture:{enabled:true, bitDepth:0.14, sampleRateCrush:0.10, pulseWidth:0.50, pitchDrift:0.02, saturation:0.10, stereoSpread:0.18}},
  chip_dungeon_drive:{label:"Dungeon Drive", bpm:118, range:[110,126], key:"D", scale:"minor", timeSig:4, progression:[0,2,5,4], swing:0.08, humanize:0.06, chordInstrument:"chip_arp_keys", melodyInstrument:"chip_pulse_lead", bassTone:"chip_square_bass", drumKit:"chip_noise_kit", drumGroovePreset:"chip_dungeon_shuffle", texture:{enabled:true, bitDepth:0.26, sampleRateCrush:0.20, pulseWidth:0.34, pitchDrift:0.025, saturation:0.22, stereoSpread:0.10}},
  chip_victory_burst:{label:"Victory Burst", bpm:136, range:[126,148], key:"C", scale:"major", timeSig:4, progression:[0,4,5,0], swing:0.01, humanize:0.03, chordInstrument:"chip_square_stack", melodyInstrument:"chip_bell_stack", bassTone:"chip_square_bass", drumKit:"chip_arcade_kit", drumGroovePreset:"chip_victory_stomp", texture:{enabled:true, bitDepth:0.20, sampleRateCrush:0.14, pulseWidth:0.56, pitchDrift:0.015, saturation:0.18, stereoSpread:0.20}}
};
CHIP_STYLE_PRESETS.chip_nes_pulse = {...CHIP_STYLE_PRESETS.chip_arcade_start, label:"NES Pulse"};
const CHIP_STYLE_PRESET_IDS = Object.keys(CHIP_STYLE_PRESETS);
const METAL_STYLE_PRESETS = {
  metal_classic_chug:{label:"Classic Chug", bpm:128, range:[112,144], key:"E", scale:"minor", timeSig:4, progression:[0,5,6,4], chordInstrument:"metal_power_stack", melodyInstrument:"shred_lead_guitar", bassTone:"metal_pick_bass", drumKit:"metal_tight", drumGroovePreset:"metal_backbeat_chug", guitarTone:"tight_metal", guitarPatternPreset:"metal_chug", texture:{enabled:true, drive:0.48, palmMute:0.78, lowTightness:0.86, presence:0.58, roomSize:0.12, pickAttack:0.72}},
  metal_thrashing_gallop:{label:"Thrash Gallop", bpm:168, range:[150,184], key:"E", scale:"minor", timeSig:4, progression:[0,1,0,6], chordInstrument:"metal_power_stack", melodyInstrument:"twin_harmony_lead", bassTone:"metal_grind_bass", drumKit:"metal_tight", drumGroovePreset:"metal_gallop_160", guitarTone:"tight_metal", guitarPatternPreset:"thrash_gallop", texture:{enabled:true, drive:0.56, palmMute:0.84, lowTightness:0.9, presence:0.64, roomSize:0.1, pickAttack:0.82}},
  metal_doom_procession:{label:"Doom Procession", bpm:70, range:[58,82], key:"C", scale:"minor", timeSig:4, progression:[0,6,5,1], chordInstrument:"dark_organ_stack", melodyInstrument:"shred_lead_guitar", bassTone:"metal_sub_pick", drumKit:"metal_doom", drumGroovePreset:"metal_doom_70", guitarTone:"doom_fuzz", guitarPatternPreset:"doom_slow", texture:{enabled:true, drive:0.64, palmMute:0.42, lowTightness:0.58, presence:0.42, roomSize:0.38, pickAttack:0.48}},
  metal_power_anthem:{label:"Power Anthem", bpm:144, range:[128,160], key:"D", scale:"minor", timeSig:4, progression:[0,5,2,6], chordInstrument:"metal_power_stack", melodyInstrument:"twin_harmony_lead", bassTone:"metal_pick_bass", drumKit:"metal_arena", drumGroovePreset:"metal_double_kick_drive", guitarTone:"tight_metal", guitarPatternPreset:"rock_eighths", texture:{enabled:true, drive:0.46, palmMute:0.6, lowTightness:0.78, presence:0.62, roomSize:0.24, pickAttack:0.66}},
  metal_boss_blast:{label:"Boss Blast", bpm:212, range:[190,228], key:"F#", scale:"minor", timeSig:4, progression:[0,1,6,4], chordInstrument:"metal_power_stack", melodyInstrument:"shred_lead_guitar", bassTone:"metal_grind_bass", drumKit:"metal_tight", drumGroovePreset:"metal_blast_220", guitarTone:"tight_metal", guitarPatternPreset:"tremolo_drive", texture:{enabled:true, drive:0.6, palmMute:0.72, lowTightness:0.92, presence:0.68, roomSize:0.08, pickAttack:0.86}},
  metal_breakdown_gate:{label:"Breakdown Gate", bpm:98, range:[88,108], key:"A", scale:"minor", timeSig:4, progression:[0,0,1,0], chordInstrument:"metal_power_stack", melodyInstrument:"shred_lead_guitar", bassTone:"metal_sub_pick", drumKit:"metal_arena", drumGroovePreset:"metal_breakdown_half_time", guitarTone:"tight_metal", guitarPatternPreset:"breakdown_stabs", texture:{enabled:true, drive:0.54, palmMute:0.88, lowTightness:0.94, presence:0.55, roomSize:0.1, pickAttack:0.78}}
};
METAL_STYLE_PRESETS.metal_tight_riff = {...METAL_STYLE_PRESETS.metal_classic_chug, label:"Tight Riff"};
const METAL_STYLE_PRESET_IDS = Object.keys(METAL_STYLE_PRESETS);
const WESTERN_STYLE_PRESETS = {
  western_frontier_ride:{label:"Frontier Ride", bpm:112, key:"G", scale:"major", timeSig:4, progression:[0,3,4,0], swing:0.05, chordInstrument:"saloon_piano", chordPlayMode:"strum_up", chordRhythmMode:"quarter", drumGroovePreset:"boom_chick", altDrumGroovePreset:"train_beat", guitarPatternPreset:"boom_chick", altGuitarPatternPreset:"train_chop", guitarTone:"western_twang", guitarRegister:"mid", guitarStrumMode:"alternate"},
  western_train_chase:{label:"Train Chase", bpm:124, key:"D", scale:"major", timeSig:4, progression:[0,4,3,4], swing:0.03, chordInstrument:"saloon_piano", chordPlayMode:"strum_down", chordRhythmMode:"quarter", drumGroovePreset:"train_beat", altDrumGroovePreset:"boom_chick", guitarPatternPreset:"train_chop", altGuitarPatternPreset:"boom_chick", guitarTone:"western_twang", guitarRegister:"mid", guitarStrumMode:"alternate"},
  western_cowboy_waltz:{label:"Cowboy Waltz", bpm:88, key:"C", scale:"major", timeSig:3, progression:[0,3,4,0], swing:0.04, chordInstrument:"saloon_piano", chordPlayMode:"strum_up", chordRhythmMode:"quarter", drumGroovePreset:"cowboy_waltz", altDrumGroovePreset:"cowboy_waltz", guitarPatternPreset:"western_waltz", altGuitarPatternPreset:"western_waltz", guitarTone:"western_twang", guitarRegister:"mid", guitarStrumMode:"alternate"},
  western_duel:{label:"High Noon Duel", bpm:86, key:"A", scale:"minor", timeSig:4, progression:[0,6,5,4], swing:0.01, chordInstrument:"saloon_piano", chordPlayMode:"strum_up", chordRhythmMode:"quarter", drumGroovePreset:"boom_chick", altDrumGroovePreset:"train_beat", guitarPatternPreset:"boom_chick", altGuitarPatternPreset:"train_chop", guitarTone:"western_twang", guitarRegister:"mid", guitarStrumMode:"alternate"}
};
WESTERN_STYLE_PRESETS.western_trail = {...WESTERN_STYLE_PRESETS.western_frontier_ride, label:"Western Trail"};
const WESTERN_STYLE_PRESET_IDS = Object.keys(WESTERN_STYLE_PRESETS);
const FUNK_STYLE_PRESETS = {
  funk_classic_pocket:{label:"Classic Pocket",bpm:98,key:"E",scale:"minor",timeSig:4,progression:[0,3,4,0],chordInstrument:"funk_clav_stab",melodyInstrument:"funk_muted_trumpet",bassTone:"funk_finger_pocket",drumKit:"funk_dry_pocket",drumGroovePreset:"funk_backbeat_98",parameters:{pocket:0.82,ghostNotes:0.4}},
  funk_slap_party:{label:"Slap Party",bpm:112,key:"A",scale:"minor",timeSig:4,progression:[0,6,3,4],chordInstrument:"funk_brass_stack",melodyInstrument:"funk_sax_punch",bassTone:"funk_slap_pop",drumKit:"funk_breakbeat",drumGroovePreset:"funk_open_hat_lift",parameters:{slapAmount:0.9,popBrightness:0.82,ghostNotes:0.5}},
  funk_clav_stabs:{label:"Clav Stabs",bpm:104,key:"D",scale:"minor",timeSig:4,progression:[0,3,4,0],chordInstrument:"funk_clav_stab",melodyInstrument:"funk_muted_trumpet",bassTone:"funk_muted_thump",drumKit:"funk_dry_pocket",drumGroovePreset:"funk_ghost_push",parameters:{muteDepth:0.9,stabTightness:0.92}},
  funk_brass_break:{label:"Brass Break",bpm:116,key:"D",scale:"minor",timeSig:4,progression:[0,3,5,4],chordInstrument:"funk_brass_stack",melodyInstrument:"funk_sax_punch",bassTone:"funk_slap_pop",drumKit:"funk_breakbeat",drumGroovePreset:"funk_breakbeat_pocket",parameters:{slapAmount:0.78,ghostNotes:0.62}},
  funk_soul_pocket:{label:"Soul Pocket",bpm:88,key:"G",scale:"minor",timeSig:4,progression:[0,5,3,4],chordInstrument:"funk_rhodes_stab",melodyInstrument:"funk_muted_trumpet",bassTone:"funk_round_finger",drumKit:"funk_dry_pocket",drumGroovePreset:"funk_one_drop",parameters:{pocket:0.66,ghostNotes:0.3,stabTightness:0.54}},
  funk_game_chase:{label:"Game Chase",bpm:124,key:"C",scale:"minor",timeSig:4,progression:[0,6,3,4],chordInstrument:"funk_clav_stab",melodyInstrument:"funk_sax_punch",bassTone:"funk_synth_pocket",drumKit:"funk_breakbeat",drumGroovePreset:"funk_breakbeat_pocket",parameters:{pocket:0.88,ghostNotes:0.48,stabTightness:0.86}}
};
const FUNK_STYLE_PRESET_IDS = Object.keys(FUNK_STYLE_PRESETS);
const LIVE_DRUM_RECORD_LOOKAHEAD_SECONDS = 0.09;
const LIVE_CHORD_VOICE_LIMIT = 40;
const LIVE_LEAD_VOICE_LIMIT = 56;
const LIVE_GUITAR_VOICE_LIMIT = 18;
const SCHEDULER_LOOKAHEAD_SECONDS = 0.22;
const SCHEDULER_INTERVAL_MS = 25;
const SECTION_PROP_GROUPS = [
  "grid",
  "melodyTracks",
  "melodyInstruments",
  "melodyOctaves",
  "melodyMute",
  "melodySolo",
  "melodyPan",
  "melodyHold",
  "melodySlide",
  "gridTuplets",
  "melodyTuplets",
  "bassHold",
  "bassSlide",
  "bassNotes",
  "bassAccent",
  "bassArticulation",
  "drumLanes",
  "guitarPattern",
  "progression"
];

const state = {
  key:"C", scale:"major", timeSig:4, bpm:96, swing:0, theme:"night", uiMode:"simple",
  chordType:"triad", chordInstrument:"pocket", resolution:1, currentStep:-1, isPlaying:false, selectedSlot:0, selectedTrack:"hat", settingsOpen:false, tooltipsOn:true, chordOctave:0, melodyOctave:0, wavUrl:null, wavBlob:null, wavFile:null,
  audioProfile:"standard", soundProfile:{id:"standard",preset:"standard_chordsmith",recipeVersion:SOUND_RECIPE_VERSION,parameters:{}}, lofiPreset:"", lofiTexture:{...DEFAULT_LOFI_TEXTURE}, chipPreset:"", chipTexture:{...DEFAULT_CHIP_TEXTURE}, metalPreset:"", metalTexture:{...DEFAULT_METAL_TEXTURE}, westernPreset:"western_trail", funkPreset:"", funkParameters:{...DEFAULT_FUNK_PARAMETERS}, drumKit:"classic", drumGroovePreset:"", bassTone:"classic",
  fxDelay:0.12, fxChorus:0.18, fxFlanger:0.06, fxReverb:0.18, fxMix:0.65,
  metronomeOn:true, chordsOn:true, bassOn:true,
  showMelodyPads:true, showDrumPads:true, drumRecordToGrid:false, showMelodyPicker:true, showTrackControls:true, humanizeOn:false, sidechainOn:false, sidechainAmount:0.45, bassMode:"auto", bassEditArticulation:"finger",
  melodyPitchMode:"scale", midiExportMode:"quantized", midiChordExport:"played", midiExactDurations:true,
  guitarEnabled:false, guitarTone:"high_gain", guitarRegister:"low", guitarStrumMode:"down", guitarPatternPreset:"metal_chug", guitarVolume:0.66,
  currentSection:"A", chordPlayMode:"block", chordRhythmMode:"sustain",
  sectionBars:{...DEFAULT_SECTION_BARS}, songSequence:DEFAULT_SONG_SEQUENCE.slice(), currentPlaybackSection:"A", currentSequenceIndex:-1, playbackMode:"section", followPlaybackSection:true,
  progressionA:new Array(4).fill(null), progressionB:new Array(4).fill(null), progressionC:new Array(4).fill(null), progressionD:new Array(4).fill(null), progression:new Array(4).fill(null),
  gridA:{kick:[], snare:[], hat:[], bass:[]}, gridB:{kick:[], snare:[], hat:[], bass:[]}, gridC:{kick:[], snare:[], hat:[], bass:[]}, gridD:{kick:[], snare:[], hat:[], bass:[]}, grid:{kick:[],snare:[],hat:[],bass:[]},
  gridTupletsA:{kick:[], snare:[], hat:[], bass:[]}, gridTupletsB:{kick:[], snare:[], hat:[], bass:[]}, gridTupletsC:{kick:[], snare:[], hat:[], bass:[]}, gridTupletsD:{kick:[], snare:[], hat:[], bass:[]}, gridTuplets:{kick:[],snare:[],hat:[],bass:[]},
  melodyTracksA:[], melodyTracksB:[], melodyTracksC:[], melodyTracksD:[], melodyTracks:[], melodyInstrumentsA:[], melodyInstrumentsB:[], melodyInstrumentsC:[], melodyInstrumentsD:[], melodyInstruments:[], melodyOctavesA:[], melodyOctavesB:[], melodyOctavesC:[], melodyOctavesD:[], melodyOctaves:[], melodyMuteA:[], melodyMuteB:[], melodyMuteC:[], melodyMuteD:[], melodyMute:[], melodySoloA:[], melodySoloB:[], melodySoloC:[], melodySoloD:[], melodySolo:[], melodyPanA:[], melodyPanB:[], melodyPanC:[], melodyPanD:[], melodyPan:[], melodyHoldA:[], melodyHoldB:[], melodyHoldC:[], melodyHoldD:[], melodyHold:[], melodySlideA:[], melodySlideB:[], melodySlideC:[], melodySlideD:[], melodySlide:[], melodyTupletsA:[], melodyTupletsB:[], melodyTupletsC:[], melodyTupletsD:[], melodyTuplets:[], bassHoldA:[], bassHoldB:[], bassHoldC:[], bassHoldD:[], bassHold:[], bassSlideA:[], bassSlideB:[], bassSlideC:[], bassSlideD:[], bassSlide:[], bassNotesA:[], bassNotesB:[], bassNotesC:[], bassNotesD:[], bassNotes:[], bassAccentA:[], bassAccentB:[], bassAccentC:[], bassAccentD:[], bassAccent:[], bassArticulationA:[], bassArticulationB:[], bassArticulationC:[], bassArticulationD:[], bassArticulation:[], drumLanesA:{}, drumLanesB:{}, drumLanesC:{}, drumLanesD:{}, drumLanes:{}, activeMelodyTrack:0, selectedMelodyDegree:0,
  guitarPatternA:[], guitarPatternB:[], guitarPatternC:[], guitarPatternD:[], guitarPattern:[],
  melodyInputMode:"grid", xyPlaybackMode:"sustain", xyPadMode:"sustain", xyScaleMode:"song", xyChordFollow:true, xyRecordToGrid:false, xyLastWriteStep:-1, xyLiveActive:false, xyLiveMidi:null, xyLiveBrightness:1800, xyLiveGate:0.18, xyLivePulseInterval:0.5, xyLivePulseLabel:"Quarter", xyLiveInstrument:"pulse", xyLivePan:0, undoStack:[], suspendUndo:false,
  lastAdvancedResolution:2, pendingUiTimers:[], liveRecordStepClock:[], lastHighlightedStep:-1, advancedFxPrimed:false, settingsGenreDrawerOpen:false, settingsGenre:"clean", genreComposition:null,
  transportPlan:[], autosaveDirty:false, wavExporting:false, wavExportToken:0, pendingImmersiveRestore:false, exportSchemaVersion:17, lastCapabilityReport:[], _projectSource:null, _richSource:null,
  availableChords:[], nextSuggested:[]
};

const els = {};
let hoverTooltipEl = null;
let activeTooltipTarget = null;
let tooltipLayerBound = false;
let pocketAudioCoreModulePromise = null;
let pocketAudioCoreModule = null;
let pocketAudioCore = null;
let pocketAudioCoreStatus = "legacy playback/WAV fallback active";
function pocketAudioCoreImportPaths(){
  const path = String(window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
  const sourceTree = path.includes("/apps/chordsmith-web/") || path.includes("/web-app/");
  return sourceTree
    ? [...POCKET_AUDIO_CORE_REPO_IMPORT_PATHS, ...POCKET_AUDIO_CORE_PACKAGED_IMPORT_PATHS]
    : [...POCKET_AUDIO_CORE_PACKAGED_IMPORT_PATHS, ...POCKET_AUDIO_CORE_REPO_IMPORT_PATHS];
}
function pocketAudioCoreScriptPaths(){
  const path = String(window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
  const sourceTree = path.includes("/apps/chordsmith-web/") || path.includes("/web-app/");
  return sourceTree
    ? [...POCKET_AUDIO_CORE_REPO_IIFE_PATHS, ...POCKET_AUDIO_CORE_PACKAGED_IIFE_PATHS]
    : [...POCKET_AUDIO_CORE_PACKAGED_IIFE_PATHS, ...POCKET_AUDIO_CORE_REPO_IIFE_PATHS];
}
function pocketAudioCoreStatusLabel(){
  const diagnostics = pocketAudioCore?.getDiagnostics ? pocketAudioCore.getDiagnostics() : null;
  if(diagnostics?.projectLoaded) return `Pocket Audio Core ${POCKET_AUDIO_CORE_VERSION} - schema ${POCKET_AUDIO_CORE_SCHEMA_SUPPORT} - ${diagnostics.timelineEventCount || 0} timeline events`;
  return `Pocket Audio Core ${POCKET_AUDIO_CORE_VERSION} - schema ${POCKET_AUDIO_CORE_SCHEMA_SUPPORT} - ${pocketAudioCoreStatus}`;
}
function updatePocketAudioCoreStatusUi(){
  if(els.pocketAudioCoreStatus) els.pocketAudioCoreStatus.textContent = pocketAudioCoreStatusLabel();
}
function loadPocketAudioCoreScript(path){
  return new Promise((resolve, reject) => {
    if(!path) return reject(new Error("Missing Pocket Audio Core script path"));
    const existing = document.querySelector(`script[data-pocket-audio-core="${path}"]`);
    if(existing){
      if(globalThis.PocketAudioCore?.PocketAudio) return resolve(globalThis.PocketAudioCore);
      existing.addEventListener("load", () => resolve(globalThis.PocketAudioCore), {once:true});
      existing.addEventListener("error", () => reject(new Error(`Could not load ${path}`)), {once:true});
      return;
    }
    const script = document.createElement("script");
    script.src = path;
    script.async = true;
    script.dataset.pocketAudioCore = path;
    script.addEventListener("load", () => {
      if(globalThis.PocketAudioCore?.PocketAudio) resolve(globalThis.PocketAudioCore);
      else reject(new Error(`Pocket Audio Core script did not expose API: ${path}`));
    }, {once:true});
    script.addEventListener("error", () => reject(new Error(`Could not load ${path}`)), {once:true});
    document.head.appendChild(script);
  });
}
async function pocketAudioCoreAssetExists(path){
  if(!path || window.location.protocol === "file:") return true;
  try{
    const response = await fetch(path, {method:"HEAD", cache:"no-store"});
    return response.ok;
  }catch(_e){
    return true;
  }
}
async function loadPocketAudioCoreModule(){
  if(pocketAudioCoreModule) return pocketAudioCoreModule;
  if(!pocketAudioCoreModulePromise){
    pocketAudioCoreModulePromise = (async () => {
      let lastError = null;
      for(const path of pocketAudioCoreImportPaths()){
        try{
          if(!(await pocketAudioCoreAssetExists(path))) continue;
          const mod = await import(path);
          pocketAudioCoreModule = mod;
          pocketAudioCore = new mod.PocketAudio({audio:false, host:"Pocket Chordsmith"});
          pocketAudioCoreStatus = "ready";
          updatePocketAudioCoreStatusUi();
          return mod;
        }catch(e){
          lastError = e;
        }
      }
      for(const path of pocketAudioCoreScriptPaths()){
        try{
          if(!(await pocketAudioCoreAssetExists(path))) continue;
          const mod = await loadPocketAudioCoreScript(path);
          pocketAudioCoreModule = mod;
          pocketAudioCore = new mod.PocketAudio({audio:false, host:"Pocket Chordsmith"});
          pocketAudioCoreStatus = "ready";
          updatePocketAudioCoreStatusUi();
          return mod;
        }catch(e){
          lastError = e;
        }
      }
      pocketAudioCoreStatus = "unavailable; legacy playback/WAV fallback active";
      updatePocketAudioCoreStatusUi();
      throw lastError || new Error("Pocket Audio Core could not be loaded.");
    })();
  }
  return pocketAudioCoreModulePromise;
}
async function primePocketAudioCoreFromCurrentProject(reason="project"){
  try{
    const mod = await loadPocketAudioCoreModule();
    const project = await pocketAudioCore.loadProject(exportProject());
    const timeline = mod.buildPocketAudioTimeline ? mod.buildPocketAudioTimeline(project, {scope:"sequence"}) : pocketAudioCore.timeline;
    pocketAudioCoreStatus = `${reason}: ${timeline?.events?.length || 0} timeline events`;
    updatePocketAudioCoreStatusUi();
    return true;
  }catch(e){
    pocketAudioCoreStatus = "legacy playback/WAV fallback active";
    updatePocketAudioCoreStatusUi();
    return false;
  }
}
function callPocketAudioCore(method, ...args){
  if(!pocketAudioCore || typeof pocketAudioCore[method] !== "function") return;
  try{
    const result = pocketAudioCore[method](...args);
    if(result && typeof result.catch === "function") result.catch(() => {});
  }catch(e){}
}
function coreArrayExport(name, fallback, options={}){
  const value = pocketAudioCoreModule && pocketAudioCoreModule[name];
  const items = Array.isArray(value) ? value.slice() : fallback.slice();
  if(options.includeClassic && !items.includes("classic")) items.unshift("classic");
  return items;
}
function chordInstrumentIds(){ return coreArrayExport("POCKET_CHORD_INSTRUMENTS", CHORD_INSTRUMENTS); }
function melodyInstrumentIds(){ return coreArrayExport("POCKET_MELODY_INSTRUMENTS", MELODY_INSTRUMENTS); }
function lofiDrumKitIds(){ return coreArrayExport("LOFI_DRUM_KITS", LOFI_DRUM_KITS, {includeClassic:true}); }
function lofiBassToneIds(){ return coreArrayExport("LOFI_BASS_TONES", LOFI_BASS_TONES, {includeClassic:true}); }
function lofiDrumGroovePresetIds(){ return coreArrayExport("LOFI_DRUM_GROOVE_PRESETS", LOFI_DRUM_GROOVE_PRESETS); }
function chipDrumKitIds(){ return coreArrayExport("CHIP_DRUM_KITS", CHIP_DRUM_KITS); }
function chipBassToneIds(){ return coreArrayExport("CHIP_BASS_TONES", CHIP_BASS_TONES); }
function chipDrumGroovePresetIds(){ return coreArrayExport("CHIP_DRUM_GROOVE_PRESETS", CHIP_DRUM_GROOVE_PRESETS); }
function metalDrumKitIds(){ return coreArrayExport("METAL_DRUM_KITS", METAL_DRUM_KITS); }
function metalBassToneIds(){ return coreArrayExport("METAL_BASS_TONES", METAL_BASS_TONES); }
function metalDrumGroovePresetIds(){ return coreArrayExport("METAL_DRUM_GROOVE_PRESETS", METAL_DRUM_GROOVE_PRESETS); }
function funkDrumGroovePresetIds(){ return coreArrayExport("FUNK_DRUM_GROOVE_PRESETS", FUNK_DRUM_GROOVE_PRESETS); }
function funkDrumKitIds(){ return FUNK_DRUM_KITS.slice(); }
function funkBassToneIds(){ return FUNK_BASS_TONES.slice(); }
function pocketDrumKitIds(){ return Array.from(new Set(["classic", ...lofiDrumKitIds(), ...chipDrumKitIds(), ...metalDrumKitIds(),...funkDrumKitIds()])); }
function pocketBassToneIds(){ return Array.from(new Set(["classic", ...lofiBassToneIds(), ...chipBassToneIds(), ...metalBassToneIds(),...funkBassToneIds()])); }
function guitarToneIds(){ return coreArrayExport("POCKET_GUITAR_TONES", GUITAR_TONES); }
function guitarRegisterIds(){ return coreArrayExport("POCKET_GUITAR_REGISTERS", GUITAR_REGISTERS); }
function guitarStrumModeIds(){ return coreArrayExport("POCKET_GUITAR_STRUM_MODES", GUITAR_STRUM_MODES); }
function guitarPatternPresetIds(){ return coreArrayExport("POCKET_GUITAR_PATTERN_PRESETS", GUITAR_PATTERN_PRESETS); }
let audioCtx, masterGain, chordGain, beatGain, leadGain, guitarGain, metroGain, synthBusGain, synthDryGain,
    delayNode, delayFeedbackGain, delayWetGain,
    chorusDelay, chorusWetGain, chorusLfo, chorusDepthGain,
    flangerDelay, flangerWetGain, flangerFeedbackGain, flangerLfo, flangerDepthGain,
    reverbConvolver, reverbWetGain, fxWetMasterGain, fxToneFilter, masterLimiter,
    schedulerTimer = null, nextNoteTime = 0, playStep = 0, transportBusy = false;
const schedulerTimers = new Set();
const activeChordVoices = [];
const activeLeadVoices = [];
const activeGuitarVoices = [];
const liveNoiseBuffers = new Map();
let settingsFocusReturn = null;

function noteIndex(n){ return NOTES.indexOf(n); }
function midiToFreq(m){ return 440 * Math.pow(2, (m-69)/12); }
function beatDur(){ return 60 / state.bpm; }
function activeResolution(){ return state.uiMode === "simple" && !isLofiActive() && !state.genreComposition ? 1 : state.resolution; }
function sanitizeBpm(value, fallback=96){ return clamp(asInt(value, fallback), MIN_BPM, MAX_BPM); }
function stepsPerBar(){ return state.timeSig * activeResolution(); }
function totalSteps(){ return MAX_BARS * stepsPerBar(); }
function simpleModeMelodyTrackCount(){ return 1; }
function melodyTracksForCurrentMode(section){
  const tracks = section?.melodyTracks || [];
  return state.uiMode === "simple" ? tracks.slice(0, simpleModeMelodyTrackCount()) : tracks;
}
function drumPresetVisible(preset){
  if(!preset) return false;
  if(Array.isArray(preset.timeSigs) && !preset.timeSigs.includes(state.timeSig)) return false;
  if(state.uiMode !== "simple") return true;
  return state.timeSig === 3 ? preset.simple3 !== false : preset.simple4 !== false;
}
function drumPresetLabel(preset){
  if(!preset) return "Drum";
  return state.timeSig === 3 ? (preset.label3 || preset.label) : preset.label;
}
function sanitizeSectionId(id){ return SECTION_IDS.includes(id) ? id : "A"; }
function sectionBarCount(sectionId=state.currentSection){ return clamp(asInt((state.sectionBars || {})[sanitizeSectionId(sectionId)], MAX_BARS), 1, MAX_BARS); }
function visibleSectionSteps(sectionId=state.currentSection){ return sectionBarCount(sectionId) * stepsPerBar(); }
function getSectionStepCount(sectionId=state.currentSection){ return visibleSectionSteps(sectionId); }
function getMaxSectionStepCount(){ return MAX_BARS * stepsPerBar(); }
function sectionPropKey(base, sectionId){ return `${base}${sanitizeSectionId(sectionId)}`; }
function getSectionData(sectionId, includeMelody=state.uiMode === "advanced"){
  const id = sanitizeSectionId(sectionId);
  return {
    name:id,
    bars:sectionBarCount(id),
    progression: state[sectionPropKey("progression", id)],
    grid: state[sectionPropKey("grid", id)],
    gridTuplets: state[sectionPropKey("gridTuplets", id)] || blankGridTuplets(),
    guitarPattern: state[sectionPropKey("guitarPattern", id)] || createGuitarState(),
    melodyTracks: includeMelody ? state[sectionPropKey("melodyTracks", id)] : [],
    melodyInstruments: includeMelody ? state[sectionPropKey("melodyInstruments", id)] : [],
    melodyOctaves: includeMelody ? state[sectionPropKey("melodyOctaves", id)] : [],
    melodyMute: includeMelody ? state[sectionPropKey("melodyMute", id)] : [],
    melodySolo: includeMelody ? state[sectionPropKey("melodySolo", id)] : [],
    melodyPan: includeMelody ? state[sectionPropKey("melodyPan", id)] : [],
    melodyHold: includeMelody ? state[sectionPropKey("melodyHold", id)] : [],
    melodySlide: includeMelody ? state[sectionPropKey("melodySlide", id)] : [],
    melodyTuplets: includeMelody ? (state[sectionPropKey("melodyTuplets", id)] || blankMelodyTuplets(1)) : [],
    bassHold: state[sectionPropKey("bassHold", id)],
    bassSlide: state[sectionPropKey("bassSlide", id)],
    bassNotes: state[sectionPropKey("bassNotes", id)],
    bassAccent: state[sectionPropKey("bassAccent", id)],
    bassArticulation: state[sectionPropKey("bassArticulation", id)] || ensureBassArticulationTrack([]),
    drumLanes: state[sectionPropKey("drumLanes", id)] || createDrumLanes()
  };
}
function sequenceList(){
  const list = Array.isArray(state.songSequence) ? state.songSequence.map(sanitizeSectionId).filter(Boolean) : [];
  return list.length ? list : ["A"];
}
function canAddSequenceSlot(){
  return sequenceList().length < MAX_SEQUENCE_SLOTS;
}
function canRemoveSequenceSlot(){
  return sequenceList().length > 1;
}
function displayedResolutionName(){
  const res = activeResolution();
  return res === 1 ? "Full" : res === 2 ? "Half" : res === 4 ? "Quarter" : res === 8 ? "Eighth" : "Sixteenth";
}
function stepDurationForIndex(step, resolution=activeResolution(), swing=state.swing){
  const base = beatDur() / resolution;
  // v56: true triplets must remain three equal subdivisions. Swing is a binary-grid feel only.
  if(swing > 0 && resolution >= 2 && resolution !== 3){
    const odd = step % 2 === 1;
    if(odd) return base + (base * swing);
    return base - (base * swing);
  }
  return base;
}
function tickPerStep(resolution=activeResolution(), ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  return ticksPerQuarter / resolution;
}
function secondsToMidiTicks(seconds, ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  return Math.round((seconds / beatDur()) * ticksPerQuarter);
}
function sectionLengthTicks(section, ticksPerQuarter=MIDI_TICKS_PER_QUARTER){
  return Math.round(section.bars * state.timeSig * ticksPerQuarter);
}
function clearSchedulerTimers(){
  schedulerTimers.forEach(id => clearInterval(id));
  schedulerTimers.clear();
  schedulerTimer = null;
}
function buildStepTimeline(stepCount=totalSteps(), startTime=0, resolution=activeResolution(), swing=state.swing){
  const times = new Array(stepCount);
  let cursor = startTime;
  for(let step = 0; step < stepCount; step++){
    times[step] = cursor;
    cursor += stepDurationForIndex(step, resolution, swing);
  }
  return {times, endTime: cursor};
}
function updateMiniTransport(){
  if(els.miniSectionText){
    const mode = state.playbackMode === "sequence" && state.isPlaying ? "Song" : `Section ${state.currentSection}`;
    const step = state.currentStep >= 0 ? `Step ${state.currentStep + 1}` : `${state.bpm} BPM`;
    els.miniSectionText.textContent = `${mode} - ${step}`;
  }
}
function updateTransportButtonLabels(){
  if(els.playBtn) els.playBtn.textContent = state.isPlaying && state.playbackMode === "section" ? "Pause" : "Play";
  if(els.playSequenceBtn) els.playSequenceBtn.textContent = state.isPlaying && state.playbackMode === "sequence" ? "Song Playing" : "Play Song";
  if(els.miniPlayBtn) els.miniPlayBtn.textContent = state.isPlaying ? "Pause" : "Play";
}
function setStatus(msg){
  if(els.statusText) els.statusText.textContent = msg;
  if(els.miniStatusText) els.miniStatusText.textContent = msg;
  updateMiniTransport();
}
function currentFullscreenElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;
}
function isTouchLikeDevice(){
  return (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}
function isEmbeddedPage(){
  try{ return window.self !== window.top; }catch(e){ return true; }
}
function isLikelyFullscreenViewport(){
  const vv = window.visualViewport;
  const width = vv && vv.width ? vv.width : window.innerWidth;
  const height = vv && vv.height ? vv.height : window.innerHeight;
  const screenLong = Math.max(screen.width || 0, screen.height || 0);
  const viewportLong = Math.max(width || 0, height || 0);
  return !!screenLong && viewportLong >= screenLong * 0.78;
}
function rememberImmersiveModeBeforeExternalUi(){
  state.pendingImmersiveRestore = !!currentFullscreenElement() || (isEmbeddedPage() && isTouchLikeDevice() && isLikelyFullscreenViewport());
}
function requestAppFullscreen(){
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen;
  if(!request) return null;
  try{ return request.call(root); }catch(e){ return null; }
}
function restoreImmersiveModeAfterExternalUi(){
  if(!state.pendingImmersiveRestore) return;
  if(currentFullscreenElement()){
    state.pendingImmersiveRestore = false;
    return;
  }
  const result = requestAppFullscreen();
  if(result && result.then) result.then(() => { state.pendingImmersiveRestore = false; }).catch(() => {});
}
function scheduleImmersiveRestore(){
  if(!state.pendingImmersiveRestore) return;
  [80, 360, 900, 1600].forEach(delay => setTimeout(restoreImmersiveModeAfterExternalUi, delay));
  setTimeout(() => {
    if(!currentFullscreenElement()) state.pendingImmersiveRestore = false;
  }, 2200);
}
function bindImmersiveRestoreEvents(){
  window.addEventListener("focus", scheduleImmersiveRestore);
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") scheduleImmersiveRestore();
  });
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function asNumber(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function asInt(value, fallback){
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeBeatCell(value){
  if(value === true) return 1;
  if(value === false || value === null || value === undefined) return 0;
  return clamp(asInt(value, 0), 0, 2);
}
function beatCellLabel(trackId, value){
  const level = normalizeBeatCell(value);
  if(level === 0) return "";
  if(trackId === "hat") return level === 2 ? "OH" : "H";
  const short = (TRACKS.find(t => t.id === trackId)?.short) || "*";
  return level === 2 ? `${short}!` : short;
}
function safeChoice(value, allowed, fallback){
  return allowed.includes(value) ? value : fallback;
}
function sanitizeProgressionDegrees(arr, options={}){
  const source = Array.isArray(arr) ? arr : [0,4,5,3];
  const preserveNull = !!options.preserveNull;
  const out = [];
  for(let i = 0; i < MAX_BARS; i++){
    if(preserveNull && (source[i] === null || source[i] === undefined)){
      out.push(null);
    } else {
      out.push(clamp(asInt(source[i], [0,4,5,3][i] ?? 0), 0, 6));
    }
  }
  return out;
}
function sanitizeGridData(grid){
  const out = {};
  TRACKS.forEach(track => {
    const source = grid && Array.isArray(grid[track.id]) ? grid[track.id] : [];
    out[track.id] = source.map(v => normalizeBeatCell(v));
  });
  return out;
}
function sanitizeMelodyTrackData(tracks, legacyTrack=null){
  const source = Array.isArray(tracks) && tracks.length ? tracks : (Array.isArray(legacyTrack) ? [legacyTrack] : blankMelodyTracks(1));
  return source.slice(0, MAX_MELODY_TRACKS).map(track => Array.isArray(track) ? track.map(v => v === null || v === undefined ? null : clamp(asInt(v, 0), 0, 23)) : blankMelody());
}
function sanitizeMelodyBoolList(list, trackCount){
  const safe = Array.isArray(list) ? list.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(false);
  return safe.map(v => !!v);
}
function sanitizeMelodyPanList(list, trackCount){
  const safe = Array.isArray(list) ? list.slice(0, trackCount) : [];
  while(safe.length < trackCount) safe.push(0);
  return safe.map(v => clamp(asNumber(v, 0), -1, 1));
}
function sanitizeSectionBars(raw){
  const out = {};
  SECTION_IDS.forEach(id => out[id] = clamp(asInt(raw && raw[id], MAX_BARS), 1, MAX_BARS));
  return out;
}
function sanitizeSongSequence(raw){
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_SONG_SEQUENCE;
  return source.slice(0, MAX_SEQUENCE_SLOTS).map(sanitizeSectionId).filter(Boolean);
}
function sanitizeResolutionValue(value, fallback=1){
  const n = asInt(value, fallback);
  if([1,2,4,8,16].includes(n)) return n;
  if(n === 3) return 2;
  return fallback;
}
function inferProjectUiMode(raw){
  const explicitMode = safeChoice(raw && raw.uiMode, ["simple","advanced"], "");
  if(explicitMode) return explicitMode;
  const res = sanitizeResolutionValue(raw && raw.resolution, 1);
  if(res > 1) return "advanced";
  const timeSig = safeChoice(asInt(raw && raw.timeSig, 4), [3,4], 4);
  const hasAdvancedGrid = SECTION_IDS.some(id => {
    const grid = raw && (raw[sectionPropKey("grid", id)] || (id === "A" ? raw.grid : null));
    return grid && ["kick","snare","hat","bass"].some(trackId => Array.isArray(grid[trackId]) && grid[trackId].length > timeSig);
  });
  if(hasAdvancedGrid) return "advanced";
  const hasAdvancedMelody = SECTION_IDS.some(id => {
    const tracks = raw && (raw[sectionPropKey("melodyTracks", id)] || (id === "A" ? raw.melodyTracks : null));
    return Array.isArray(tracks) && tracks.length > 1;
  });
  if(hasAdvancedMelody) return "advanced";
  return "simple";
}
function sanitizeLofiPresetId(value){
  const id = String(value || "");
  return LOFI_STYLE_PRESETS[id] ? id : "";
}
function lofiPresetConfig(id=state.lofiPreset){
  return LOFI_STYLE_PRESETS[sanitizeLofiPresetId(id)] || null;
}
function lofiTextureDefaultForPreset(presetId){
  const preset = lofiPresetConfig(presetId);
  return {...DEFAULT_LOFI_TEXTURE, ...(preset?.texture || {})};
}
function sanitizeLofiTexture(raw, presetId=""){
  const defaults = lofiTextureDefaultForPreset(presetId);
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    enabled: source.enabled ?? defaults.enabled ? true : false,
    vinylCrackle: clamp(asNumber(source.vinylCrackle, defaults.vinylCrackle), 0, 1),
    tapeHiss: clamp(asNumber(source.tapeHiss, defaults.tapeHiss), 0, 1),
    wowFlutter: clamp(asNumber(source.wowFlutter, defaults.wowFlutter), 0, 1),
    warmth: clamp(asNumber(source.warmth, defaults.warmth), 0, 1),
    lowPassAge: clamp(asNumber(source.lowPassAge, defaults.lowPassAge), 0, 1),
    bitCrush: clamp(asNumber(source.bitCrush, defaults.bitCrush), 0, 1)
  };
}
function isLofiActive(){
  return state.audioProfile === LOFI_AUDIO_PROFILE_ID || !!sanitizeLofiPresetId(state.lofiPreset);
}
function lofiAmount(key, fallback=0){
  if(!isLofiActive() || !state.lofiTexture?.enabled) return 0;
  return clamp(asNumber(state.lofiTexture[key], fallback), 0, 1);
}
function sanitizeChipPresetId(value){
  const id = String(value || "");
  return CHIP_STYLE_PRESETS[id] ? id : "";
}
function chipPresetConfig(id=state.chipPreset){
  return CHIP_STYLE_PRESETS[sanitizeChipPresetId(id)] || null;
}
function sanitizeWesternPresetId(value){
  const id = String(value || "").trim();
  return WESTERN_STYLE_PRESETS[id] ? id : "";
}
function westernPresetConfig(id="western_frontier_ride"){
  return WESTERN_STYLE_PRESETS[sanitizeWesternPresetId(id)] || WESTERN_STYLE_PRESETS.western_frontier_ride;
}
function detectActiveGenre(){
  if(state.funkPreset || state.audioProfile === FUNK_AUDIO_PROFILE_ID) return "funk";
  if(state.audioProfile === WESTERN_AUDIO_PROFILE_ID) return "western";
  if(state.chipPreset || state.audioProfile === CHIP_AUDIO_PROFILE_ID) return "chip";
  if(state.metalPreset || state.audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID || state.metalTexture?.enabled) return "metal";
  if(state.lofiPreset || state.audioProfile === LOFI_AUDIO_PROFILE_ID || state.lofiTexture?.enabled) return "lofi";
  if(state.guitarTone === "western_twang" || state.chordInstrument === "saloon_piano") return "western";
  return "clean";
}
function chipTextureDefaultForPreset(presetId){
  const preset = chipPresetConfig(presetId);
  return {...DEFAULT_CHIP_TEXTURE, ...(preset?.texture || {})};
}
function sanitizeChipTexture(raw, presetId=""){
  const defaults = chipTextureDefaultForPreset(presetId);
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    enabled: source.enabled ?? defaults.enabled ? true : false,
    bitDepth: clamp(asNumber(source.bitDepth, defaults.bitDepth), 0, 1),
    sampleRateCrush: clamp(asNumber(source.sampleRateCrush, defaults.sampleRateCrush), 0, 1),
    pulseWidth: clamp(asNumber(source.pulseWidth, defaults.pulseWidth), 0, 1),
    pitchDrift: clamp(asNumber(source.pitchDrift, defaults.pitchDrift), 0, 1),
    saturation: clamp(asNumber(source.saturation, defaults.saturation), 0, 1),
    stereoSpread: clamp(asNumber(source.stereoSpread, defaults.stereoSpread), 0, 1)
  };
}
function isChipActive(){
  return state.audioProfile === CHIP_AUDIO_PROFILE_ID || !!sanitizeChipPresetId(state.chipPreset);
}
function sanitizeMetalPresetId(value){
  const id = String(value || "");
  return METAL_STYLE_PRESETS[id] ? id : "";
}
function metalPresetConfig(id=state.metalPreset){
  return METAL_STYLE_PRESETS[sanitizeMetalPresetId(id)] || null;
}
function metalTextureDefaultForPreset(presetId){
  const preset = metalPresetConfig(presetId);
  return {...DEFAULT_METAL_TEXTURE, ...(preset?.texture || {})};
}
function sanitizeMetalTexture(raw, presetId=""){
  const defaults = metalTextureDefaultForPreset(presetId);
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    enabled: source.enabled ?? defaults.enabled ? true : false,
    drive: clamp(asNumber(source.drive, defaults.drive), 0, 1),
    palmMute: clamp(asNumber(source.palmMute, defaults.palmMute), 0, 1),
    lowTightness: clamp(asNumber(source.lowTightness, defaults.lowTightness), 0, 1),
    presence: clamp(asNumber(source.presence, defaults.presence), 0, 1),
    roomSize: clamp(asNumber(source.roomSize, defaults.roomSize), 0, 1),
    pickAttack: clamp(asNumber(source.pickAttack, defaults.pickAttack), 0, 1)
  };
}
function deepCloneProjectValue(value){
  if(value === undefined) return undefined;
  try{ return JSON.parse(JSON.stringify(value)); }catch(e){ return null; }
}
function mergeProjectValues(base, known){
  if(Array.isArray(known)) return deepCloneProjectValue(known);
  if(!known || typeof known !== "object") return known;
  const out = base && typeof base === "object" && !Array.isArray(base) ? deepCloneProjectValue(base) : {};
  Object.keys(known).forEach(key => { out[key] = mergeProjectValues(out[key], known[key]); });
  return out;
}
function normalizeSoundProfileId(value, fallback="standard"){
  const raw = String(value || "").trim().toLowerCase();
  const id = SOUND_PROFILE_ALIASES[raw] || raw;
  return SOUND_PROFILE_IDS.includes(id) ? id : fallback;
}
function activeProfilePreset(id=normalizeSoundProfileId(state.audioProfile)){
  if(id === LOFI_AUDIO_PROFILE_ID) return state.lofiPreset || SOUND_PROFILE_DEFAULT_PRESETS[id];
  if(id === CHIP_AUDIO_PROFILE_ID) return state.chipPreset || SOUND_PROFILE_DEFAULT_PRESETS[id];
  if(id === WESTERN_AUDIO_PROFILE_ID) return state.westernPreset || SOUND_PROFILE_DEFAULT_PRESETS[id];
  if(id === HEAVY_METAL_AUDIO_PROFILE_ID) return state.metalPreset || SOUND_PROFILE_DEFAULT_PRESETS[id];
  if(id === FUNK_AUDIO_PROFILE_ID) return state.funkPreset || SOUND_PROFILE_DEFAULT_PRESETS[id];
  return SOUND_PROFILE_DEFAULT_PRESETS.standard;
}
function activeProfileParameters(id=normalizeSoundProfileId(state.audioProfile)){
  if(id === LOFI_AUDIO_PROFILE_ID) return sanitizeLofiTexture(state.lofiTexture, state.lofiPreset);
  if(id === CHIP_AUDIO_PROFILE_ID) return sanitizeChipTexture(state.chipTexture, state.chipPreset);
  if(id === HEAVY_METAL_AUDIO_PROFILE_ID) return sanitizeMetalTexture(state.metalTexture, state.metalPreset);
  if(id === FUNK_AUDIO_PROFILE_ID) return sanitizeFunkParameters(state.funkParameters);
  return deepCloneProjectValue(state.soundProfile?.parameters || {}) || {};
}
function sanitizeFunkParameters(raw){
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return mergeProjectValues(source, {
    pocket:clamp(asNumber(source.pocket, DEFAULT_FUNK_PARAMETERS.pocket),0,1),
    ghostNotes:clamp(asNumber(source.ghostNotes ?? source.ghost, DEFAULT_FUNK_PARAMETERS.ghostNotes),0,1),
    slapAmount:clamp(asNumber(source.slapAmount ?? source.slap, DEFAULT_FUNK_PARAMETERS.slapAmount),0,1),
    popBrightness:clamp(asNumber(source.popBrightness, DEFAULT_FUNK_PARAMETERS.popBrightness),0,1),
    muteDepth:clamp(asNumber(source.muteDepth, DEFAULT_FUNK_PARAMETERS.muteDepth),0,1),
    stabTightness:clamp(asNumber(source.stabTightness, DEFAULT_FUNK_PARAMETERS.stabTightness),0,1)
  });
}
function sanitizeSoundProfile(rawProfile, rawProject={}){
  const source = rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile) ? rawProfile : {};
  const inferred = rawProject.funkPreset ? FUNK_AUDIO_PROFILE_ID : rawProject.westernPreset ? WESTERN_AUDIO_PROFILE_ID : rawProject.metalPreset ? HEAVY_METAL_AUDIO_PROFILE_ID : rawProject.chipPreset || String(rawProject.stylePreset || "").startsWith("chip_") ? CHIP_AUDIO_PROFILE_ID : rawProject.lofiPreset ? LOFI_AUDIO_PROFILE_ID : normalizeSoundProfileId(rawProject.audioProfile, "standard");
  const id = normalizeSoundProfileId(source.id, inferred);
  const preset = String(source.preset || (id === LOFI_AUDIO_PROFILE_ID ? rawProject.lofiPreset : id === CHIP_AUDIO_PROFILE_ID ? rawProject.chipPreset : id === WESTERN_AUDIO_PROFILE_ID ? rawProject.westernPreset : id === HEAVY_METAL_AUDIO_PROFILE_ID ? rawProject.metalPreset : id === FUNK_AUDIO_PROFILE_ID ? rawProject.funkPreset : "") || SOUND_PROFILE_DEFAULT_PRESETS[id]);
  let defaults = {};
  if(id === LOFI_AUDIO_PROFILE_ID) defaults = sanitizeLofiTexture(rawProject.lofiTexture, preset);
  else if(id === CHIP_AUDIO_PROFILE_ID) defaults = sanitizeChipTexture(rawProject.chipTexture, preset);
  else if(id === HEAVY_METAL_AUDIO_PROFILE_ID) defaults = sanitizeMetalTexture(rawProject.metalTexture, preset);
  else if(id === FUNK_AUDIO_PROFILE_ID) defaults = sanitizeFunkParameters(rawProject.funkParameters);
  return mergeProjectValues(source, {id,preset,recipeVersion:Math.max(1,asInt(source.recipeVersion,SOUND_RECIPE_VERSION)),parameters:mergeProjectValues(defaults, source.parameters || {})});
}
function createDrumLanes(){ return Object.fromEntries(COMMON_DRUM_LANES.map(id => [id,new Array(totalSteps()).fill(0)])); }
function sanitizeDrumLanes(raw){
  const out = {};
  COMMON_DRUM_LANES.forEach(id => { out[id] = rescaleBeatTrack(raw && Array.isArray(raw[id]) ? raw[id] : [], normalizeBeatCell); });
  if(raw && typeof raw === "object") Object.keys(raw).filter(id => !COMMON_DRUM_LANES.includes(id)).forEach(id => { out[id] = deepCloneProjectValue(raw[id]); });
  return out;
}
function ensureBassArticulationTrack(track){
  const source = Array.isArray(track) ? track : [];
  const oldSteps = Math.max(1, source.length || totalSteps());
  const out = new Array(totalSteps()).fill("finger");
  for(let i=0;i<out.length;i++){
    const oldIndex = Math.min(oldSteps - 1, Math.floor(i * oldSteps / out.length));
    out[i] = safeChoice(source[oldIndex], BASS_ARTICULATIONS, "finger");
  }
  return out;
}
function sanitizeRichEvent(raw){
  if(!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = deepCloneProjectValue(raw) || {};
  if(raw.step !== undefined) out.step = Math.max(0, asNumber(raw.step,0));
  if(raw.tick !== undefined) out.tick = Math.max(0, asInt(raw.tick,0));
  out.duration = Math.max(0.001,asNumber(raw.duration,1));
  if(raw.note !== undefined) out.note = asNumber(raw.note,0);
  if(Array.isArray(raw.notes)) out.notes = raw.notes.map(note => asNumber(note,0));
  out.velocity = clamp(asInt(raw.velocity,96),1,127);
  out.articulation = String(raw.articulation || "finger");
  out.sound = String(raw.sound || "standard");
  out.role = String(raw.role || "support");
  out.expression = raw.expression && typeof raw.expression === "object" && !Array.isArray(raw.expression) ? deepCloneProjectValue(raw.expression) : {};
  out.technique = raw.technique && typeof raw.technique === "object" && !Array.isArray(raw.technique) ? deepCloneProjectValue(raw.technique) : {};
  return out;
}
function assertProjectResourceLimits(project){
  if(!project || typeof project !== "object" || Array.isArray(project)) return;
  const sections = project.sections && typeof project.sections === "object" && !Array.isArray(project.sections) ? project.sections : {};
  let totalEvents = 0;
  SECTION_IDS.forEach(id => {
    const section = sections[id];
    if(!section || typeof section !== "object" || Array.isArray(section)) return;
    const tracks = section.tracks && typeof section.tracks === "object" && !Array.isArray(section.tracks) ? section.tracks : {};
    const entries = Object.entries(tracks);
    assertProjectResourceLimit(`sections.${id}.tracks`,entries.length,PROJECT_RESOURCE_LIMITS.maxTracksPerSection);
    entries.forEach(([trackId,track]) => {
      if(!track || typeof track !== "object" || Array.isArray(track)) return;
      const events = Array.isArray(track.events) ? track.events : [];
      assertProjectResourceLimit(`sections.${id}.tracks.${trackId}.events`,events.length,PROJECT_RESOURCE_LIMITS.maxEventsPerTrack);
      totalEvents += events.length;
      assertProjectResourceLimit("project rich events",totalEvents,PROJECT_RESOURCE_LIMITS.maxEventsPerProject);
      events.forEach((event,index) => {
        if(Array.isArray(event?.notes)) assertProjectResourceLimit(`sections.${id}.tracks.${trackId}.events[${index}].notes`,event.notes.length,PROJECT_RESOURCE_LIMITS.maxNotesPerEvent);
      });
    });
  });
}
function assertProjectResourceLimit(path,actual,limit){
  if(actual <= limit) return;
  const error = new RangeError(`Project exceeds ${path} limit (${actual} > ${limit}).`);
  error.code = "PROJECT_RESOURCE_LIMIT_EXCEEDED";
  error.path = path;
  error.actual = actual;
  error.limit = limit;
  throw error;
}
function sanitizeRichSections(rawSections){
  const source = rawSections && typeof rawSections === "object" && !Array.isArray(rawSections) ? rawSections : {};
  const out = deepCloneProjectValue(source) || {};
  SECTION_IDS.forEach(id => {
    const section = source[id] && typeof source[id] === "object" ? source[id] : {};
    const tracks = section.tracks && typeof section.tracks === "object" ? section.tracks : {};
    out[id] = mergeProjectValues(section,{tracks:{}});
    Object.entries(tracks).forEach(([trackId,track]) => {
      const safeTrack = track && typeof track === "object" ? deepCloneProjectValue(track) : {};
      safeTrack.events = Array.isArray(track?.events) ? track.events.map(sanitizeRichEvent).filter(Boolean) : [];
      out[id].tracks[trackId] = safeTrack;
    });
  });
  return out;
}
function richEventStep(event, resolution){
  if(event.step !== undefined) return Math.max(0,Math.round(asNumber(event.step,0)));
  if(event.tick !== undefined) return Math.max(0,Math.round(asInt(event.tick,0) / Math.max(1,MIDI_TICKS_PER_QUARTER / resolution)));
  return 0;
}
function applyRichSectionsToLegacyData(data){
  SECTION_IDS.forEach(id => {
    const tracks = data.sections?.[id]?.tracks || {};
    const maxStep = MAX_BARS * data.timeSig * data.resolution;
    const drums = tracks.drums?.events || [];
    drums.forEach(event => {
      const step = richEventStep(event,data.resolution);
      if(step >= maxStep) return;
      const lane = COMMON_DRUM_LANES.includes(event.sound) ? event.sound : String(event.sound || "percussion");
      if(!data[`drumLanes${id}`][lane]) data[`drumLanes${id}`][lane] = new Array(totalSteps()).fill(0);
      const level = event.velocity >= 108 || event.articulation === "accent" ? 2 : 1;
      data[`drumLanes${id}`][lane][step] = level;
      if(lane === "kick") data[`grid${id}`].kick[step] = level;
      if(lane === "snare") data[`grid${id}`].snare[step] = level;
      if(lane === "hat_closed") data[`grid${id}`].hat[step] = level;
      if(lane === "hat_open") data[`grid${id}`].hat[step] = 2;
    });
    const bassEvents = tracks.bass?.events || [];
    if(bassEvents.length) data.bassMode = "manual";
    bassEvents.forEach(event => {
      const step = richEventStep(event,data.resolution);
      if(step >= maxStep || event.note === undefined) return;
      data[`bassNotes${id}`][step] = midiToBassManualIndex(event.note,data.key,data.scale);
      data[`bassAccent${id}`][step] = event.velocity >= 104 || ["slap","pop","accent"].includes(event.articulation);
      data[`bassArticulation${id}`][step] = safeChoice(event.articulation,BASS_ARTICULATIONS,"finger");
      const held = Math.max(1,Math.round(asNumber(event.duration,1)));
      for(let offset=1;offset<held && step+offset<maxStep;offset++) data[`bassHold${id}`][step+offset] = true;
    });
    Object.entries(tracks).filter(([name]) => /^melody\d+$/.test(name)).forEach(([name,track]) => {
      const trackIndex = clamp(asInt(name.slice(6),1)-1,0,MAX_MELODY_TRACKS-1);
      while(data[`melodyTracks${id}`].length <= trackIndex) data[`melodyTracks${id}`].push(blankMelody());
      (track.events || []).forEach(event => {
        const step = richEventStep(event,data.resolution);
        const trackOctave = data[`melodyOctaves${id}`]?.[trackIndex] ?? data.melodyOctave ?? 0;
        if(step < maxStep && event.note !== undefined) data[`melodyTracks${id}`][trackIndex][step] = midiToMelodyIndex(event.note,data.melodyPitchMode,data.key,data.scale,trackOctave);
      });
    });
  });
}
function sanitizeProjectData(raw){
  if(!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Project data must be a JSON object");
  assertProjectResourceLimits(raw);
  assertProjectResourceLimits(raw.compatibility?.richSource);
  if(asInt(raw.projectVersion ?? raw.schemaVersion,1) <= LEGACY_PROJECT_SCHEMA_VERSION && raw.compatibility?.richSource?.projectVersion >= PROJECT_SCHEMA_VERSION){
    raw = mergeProjectValues(raw,raw.compatibility.richSource);
    assertProjectResourceLimits(raw);
  }
  const preservedSource = raw.__preservedProjectSource || raw;
  const soundProfile = sanitizeSoundProfile(raw.soundProfile, raw);

  const data = {
    projectVersion: asInt(raw.projectVersion ?? raw.schemaVersion, 1),
    key: safeChoice(raw.key, NOTES, "C"),
    scale: safeChoice(raw.scale, ["major","minor"], "major"),
    timeSig: safeChoice(asInt(raw.timeSig, 4), [3,4], 4),
    bpm: sanitizeBpm(raw.bpm, 96),
    swing: clamp(asNumber(raw.swing, 0), 0, 0.3),
    audioProfile: soundProfile.id,
    soundProfile,
    lofiPreset: sanitizeLofiPresetId(raw.lofiPreset || (!String(raw.stylePreset || "").startsWith("chip_") ? raw.stylePreset : "") || ""),
    chipPreset: sanitizeChipPresetId(raw.chipPreset || (String(raw.stylePreset || "").startsWith("chip_") ? raw.stylePreset : "") || ""),
    metalPreset: sanitizeMetalPresetId(raw.metalPreset || (String(raw.stylePreset || "").startsWith("metal_") ? raw.stylePreset : "") || ""),
    westernPreset: sanitizeWesternPresetId(raw.westernPreset || (soundProfile.id === WESTERN_AUDIO_PROFILE_ID ? soundProfile.preset : "")) || (soundProfile.id === WESTERN_AUDIO_PROFILE_ID ? "western_trail" : "western_frontier_ride"),
    funkPreset: FUNK_STYLE_PRESETS[raw.funkPreset] ? raw.funkPreset : (soundProfile.id === FUNK_AUDIO_PROFILE_ID && FUNK_STYLE_PRESETS[soundProfile.preset] ? soundProfile.preset : soundProfile.id === FUNK_AUDIO_PROFILE_ID ? "funk_classic_pocket" : ""),
    drumKit: safeChoice(raw.drumKit, pocketDrumKitIds(), "classic"),
    drumGroovePreset: safeChoice(raw.drumGroovePreset, [...lofiDrumGroovePresetIds(), ...chipDrumGroovePresetIds(), ...metalDrumGroovePresetIds(), ...funkDrumGroovePresetIds()], ""),
    bassTone: safeChoice(raw.bassTone, pocketBassToneIds(), "classic"),
    theme: safeChoice(raw.theme, ["night","ocean","forest","sunset"], "night"),
    uiMode: inferProjectUiMode(raw),
    chordType: safeChoice(raw.chordType, ["triad","seventh","sus2","sus4"], "triad"),
    chordInstrument: safeChoice(raw.chordInstrument, chordInstrumentIds(), "pocket"),
    resolution: sanitizeResolutionValue(raw.resolution, 1),
    masterVolume: clamp(asNumber(raw.masterVolume ?? raw.masterVol, 0.82), 0, 1),
    chordVolume: clamp(asNumber(raw.chordVolume ?? raw.chordVol, 0.72), 0, 1),
    beatVolume: clamp(asNumber(raw.beatVolume ?? raw.beatVol, 0.86), 0, 1),
    leadVolume: clamp(asNumber(raw.leadVolume ?? raw.leadVol, 0.65), 0, 1),
    melodyPitchMode: safeChoice(raw.melodyPitchMode, ["scale","chromatic"], "scale"),
    midiExportMode: safeChoice(raw.midiExportMode, ["quantized","performance"], "quantized"),
    midiChordExport: safeChoice(raw.midiChordExport, ["played","block","none"], "played"),
    midiExactDurations: raw.midiExactDurations !== false,
    guitarEnabled: !!raw.guitarEnabled,
    guitarTone: safeChoice(raw.guitarTone, guitarToneIds(), "high_gain"),
    guitarRegister: safeChoice(raw.guitarRegister, guitarRegisterIds(), "low"),
    guitarStrumMode: safeChoice(raw.guitarStrumMode, guitarStrumModeIds(), "down"),
    guitarPatternPreset: safeChoice(raw.guitarPatternPreset, guitarPatternPresetIds(), "metal_chug"),
    guitarVolume: clamp(asNumber(raw.guitarVolume, 0.66), 0, 1),
    chordPlayMode: safeChoice(raw.chordPlayMode, ["block","strum_up","strum_down","arp_up","arp_down"], "block"),
    chordRhythmMode: safeChoice(raw.chordRhythmMode, ["sustain","quarter","half"], "sustain"),
    chordOctave: clamp(asInt(raw.chordOctave, 0), -1, 1),
    melodyOctave: clamp(asInt(raw.melodyOctave, 0), -1, 1),
    melodyInputMode: safeChoice(raw.melodyInputMode, ["grid","xy"], "grid"),
    xyPlaybackMode: safeChoice(raw.xyPlaybackMode, ["sustain","pulse","ostinato"], raw.xyOstinatoOn ? "ostinato" : "sustain"),
    xyPadMode: safeChoice(raw.xyPadMode, ["sustain","frequency","rate","gate","brightness"], raw.xyPadMode === "brightness" ? "frequency" : raw.xyPadMode === "gate" ? "sustain" : "sustain"),
    xyScaleMode: safeChoice(raw.xyScaleMode, ["song","pentatonic","chord","shred"], "song"),
    xyChordFollow: raw.xyChordFollow !== false,
    xyRecordToGrid: !!raw.xyRecordToGrid,
    fxDelay: clamp(asNumber(raw.fxDelay, 0.12), 0, 1),
    fxChorus: clamp(asNumber(raw.fxChorus, 0.18), 0, 1),
    fxFlanger: clamp(asNumber(raw.fxFlanger, 0.06), 0, 1),
    fxReverb: clamp(asNumber(raw.fxReverb, 0.18), 0, 1),
    fxMix: clamp(asNumber(raw.fxMix, 0.65), 0, 1),
    metronomeOn: raw.metronomeOn !== false,
    chordsOn: raw.chordsOn !== false,
    bassOn: raw.bassOn !== false,
    showMelodyPads: raw.showMelodyPads !== false,
    showDrumPads: raw.showDrumPads !== false,
    drumRecordToGrid: !!raw.drumRecordToGrid,
    showMelodyPicker: raw.showMelodyPicker !== false,
    showTrackControls: raw.showTrackControls !== false,
    bassMode: safeChoice(raw.bassMode, ["auto","manual"], "auto"),
    humanizeOn: !!raw.humanizeOn,
    sidechainOn: !!(raw.sidechainOn ?? raw.pumpChordsEnabled),
    sidechainAmount: clamp(asNumber(raw.sidechainAmount ?? raw.pumpAmount, 0.45), 0, 1),
    lastAdvancedResolution: sanitizeResolutionValue(raw.lastAdvancedResolution, 2),
    sectionBars: sanitizeSectionBars(raw.sectionBars || raw.sectionLengths),
    songSequence: sanitizeSongSequence(raw.songSequence || raw.sectionSequence),
    followPlaybackSection: raw.followPlaybackSection !== false,
    genreComposition: raw.genreComposition && typeof raw.genreComposition === "object" ? deepCloneProjectValue(raw.genreComposition) : null
  };
  if(data.chipPreset){
    data.audioProfile = CHIP_AUDIO_PROFILE_ID;
    data.lofiPreset = "";
    data.metalPreset = "";
  }
  if(data.metalPreset){
    data.audioProfile = HEAVY_METAL_AUDIO_PROFILE_ID;
    data.lofiPreset = "";
    data.chipPreset = "";
  }
  if(soundProfile.id === WESTERN_AUDIO_PROFILE_ID){ data.audioProfile = WESTERN_AUDIO_PROFILE_ID; data.lofiPreset = ""; data.chipPreset = ""; data.metalPreset = ""; }
  if(soundProfile.id === FUNK_AUDIO_PROFILE_ID){ data.audioProfile = FUNK_AUDIO_PROFILE_ID; data.lofiPreset = ""; data.chipPreset = ""; data.metalPreset = ""; }
  if(data.lofiPreset && data.audioProfile !== LOFI_AUDIO_PROFILE_ID) data.audioProfile = LOFI_AUDIO_PROFILE_ID;
  data.lofiTexture = sanitizeLofiTexture(soundProfile.id === LOFI_AUDIO_PROFILE_ID ? mergeProjectValues(raw.lofiTexture || {},soundProfile.parameters || {}) : raw.lofiTexture, data.lofiPreset);
  data.chipTexture = sanitizeChipTexture(soundProfile.id === CHIP_AUDIO_PROFILE_ID ? mergeProjectValues(raw.chipTexture || {},soundProfile.parameters || {}) : raw.chipTexture, data.chipPreset);
  data.metalTexture = sanitizeMetalTexture(soundProfile.id === HEAVY_METAL_AUDIO_PROFILE_ID ? mergeProjectValues(raw.metalTexture || {},soundProfile.parameters || {}) : raw.metalTexture, data.metalPreset);
  data.funkParameters = sanitizeFunkParameters(soundProfile.id === FUNK_AUDIO_PROFILE_ID ? mergeProjectValues(raw.funkParameters || {},soundProfile.parameters || {}) : raw.funkParameters);
  if(data.audioProfile !== LOFI_AUDIO_PROFILE_ID && !data.lofiPreset){
    data.lofiTexture.enabled = false;
  }
  if(data.audioProfile !== CHIP_AUDIO_PROFILE_ID && !data.chipPreset){
    data.chipTexture.enabled = false;
  }
  if(data.audioProfile !== HEAVY_METAL_AUDIO_PROFILE_ID && !data.metalPreset){
    data.metalTexture.enabled = false;
  }

  SECTION_IDS.forEach(id => {
    const rawProgression = raw[`progression${id}`];
    const preserveNullProgression = Array.isArray(rawProgression) && rawProgression.some(value => value === null);
    data[`progression${id}`] = sanitizeProgressionDegrees(rawProgression, {preserveNull:preserveNullProgression});
    data[`grid${id}`] = sanitizeGridData(raw[`grid${id}`]);
    data[`gridTuplets${id}`] = sanitizeGridTuplets(raw[`gridTuplets${id}`]);
    data[`melodyTracks${id}`] = sanitizeMelodyTrackData(raw[`melodyTracks${id}`], raw[`melody${id}`]);
    data[`melodyInstruments${id}`] = ensureMelodyInstrumentsLength(raw[`melodyInstruments${id}`] || [], data[`melodyTracks${id}`].length);
    data[`melodyOctaves${id}`] = ensureMelodyOctavesLength(raw[`melodyOctaves${id}`] || [], data[`melodyTracks${id}`].length, data.melodyOctave);
    data[`melodyMute${id}`] = sanitizeMelodyBoolList(raw[`melodyMute${id}`] || [], data[`melodyTracks${id}`].length);
    data[`melodySolo${id}`] = sanitizeMelodyBoolList(raw[`melodySolo${id}`] || [], data[`melodyTracks${id}`].length);
    data[`melodyPan${id}`] = sanitizeMelodyPanList(raw[`melodyPan${id}`] || [], data[`melodyTracks${id}`].length);
    data[`melodyHold${id}`] = ensureMelodyHoldLength(raw[`melodyHold${id}`] || [], data[`melodyTracks${id}`].length);
    data[`melodySlide${id}`] = ensureMelodySlideLength(raw[`melodySlide${id}`] || [], data[`melodyTracks${id}`].length);
    data[`melodyTuplets${id}`] = ensureMelodyTupletsLength(raw[`melodyTuplets${id}`] || [], data[`melodyTracks${id}`].length);
    data[`bassHold${id}`] = ensureBassHoldTrack(raw[`bassHold${id}`] || []);
    data[`bassSlide${id}`] = ensureBassSlideTrack(raw[`bassSlide${id}`] || []);
    data[`bassNotes${id}`] = ensureBassNotesTrack(raw[`bassNotes${id}`] || []);
    data[`bassAccent${id}`] = ensureBassAccentTrack(raw[`bassAccent${id}`] || []);
    data[`bassArticulation${id}`] = ensureBassArticulationTrack(raw[`bassArticulation${id}`] || []);
    data[`drumLanes${id}`] = sanitizeDrumLanes(raw[`drumLanes${id}`] || {});
    data[`guitarPattern${id}`] = normaliseGuitarState(raw[`guitarPattern${id}`] || raw[`rockGuitar${id}`] || []);
  });

  data.sections = sanitizeRichSections(raw.sections);
  applyRichSectionsToLegacyData(data);
  data.formatFeatures = Array.isArray(raw.formatFeatures) ? Array.from(new Set([...raw.formatFeatures.map(String),...FORMAT_FEATURES])) : FORMAT_FEATURES.slice();
  Object.defineProperty(data,"__preservedProjectSource",{value:deepCloneProjectValue(preservedSource),enumerable:false,writable:true});

  return data;
}
