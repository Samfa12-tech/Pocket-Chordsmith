/* 1. Constants */
const PCS_SHARE_PREFIX = "PCS1:";
const PDJ_SHARE_PREFIX = "PDJ1:";
const SHARE_MAX_DECODED_BYTES = 4 * 1024 * 1024;
const SHARE_MAX_ENCODED_CHARS = Math.ceil(SHARE_MAX_DECODED_BYTES / 3) * 4;
const PROJECT_RESOURCE_LIMITS = Object.freeze({maxTracksPerSection:32,maxEventsPerTrack:4096,maxEventsPerProject:16384,maxNotesPerEvent:16,maxRichEventsPerStep:64});
// Direct handoff target for the self-hosted Samfa12 web app.
// itch.io remains a public mirror; local development still uses relative paths.
const POCKET_CHORDSMITH_URL = "https://samfa12.com/apps/pocket-chordsmith/";
const HANDOFF_PARAM = "pocketHandoff";
const HANDOFF_WINDOW_PREFIX = "PocketHandoff:";
const HANDOFF_TO_DJ_KEY = "pocket_chordsmith_to_dj_handoff_v1";
const HANDOFF_TO_CHORDSMITH_KEY = "pocket_dj_to_chordsmith_handoff_v1";
const POCKET_DJ_VERSION = 1;
const PROJECT_SCHEMA_VERSION = 17;
const POCKET_AUDIO_CORE_VERSION = "0.2.0";
const POCKET_AUDIO_CORE_SCHEMA_SUPPORT = "17 (16 compatible)";
const POCKET_AUDIO_CORE_REPO_IMPORT_PATHS = [
  "../../packages/pocket-audio-core/dist/pocket-audio-core.browser.esm.js",
  "../../packages/pocket-audio-core/dist/pocket-audio-core.esm.js"
];
const POCKET_AUDIO_CORE_PACKAGED_IMPORT_PATHS = [
  "./pocket-audio-core/dist/pocket-audio-core.browser.esm.js",
  "./pocket-audio-core/dist/pocket-audio-core.esm.js"
];
const POCKET_AUDIO_CORE_REPO_IIFE_PATHS = [
  "../../packages/pocket-audio-core/dist/pocket-audio-core.iife.js"
];
const POCKET_AUDIO_CORE_PACKAGED_IIFE_PATHS = [
  "./pocket-audio-core/dist/pocket-audio-core.iife.js"
];
const SECTION_IDS = ["A","B","C","D","E","F","G","H"];
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const STEMS = ["drums","bass","chords","melody","guitar"];
const DRUM_TRACKS = ["kick","snare","hat","bass"];
const MAX_BARS = 4;
const LOCAL_KEY = "pocket_dj_v1_last_session";
const LOOKAHEAD_SECONDS = 0.22;
const SCHEDULER_MS = 25;
const MAX_AUDIBLE_LATENESS_SECONDS = 0.08;
const MAX_SCHEDULER_CATCHUP_STEPS = 256;
const DEFAULT_PROGRESSION = [0,4,5,3];
const DEFAULT_STEM_VOLUMES = {drums:0.86,bass:0.86,chords:0.72,melody:0.65,guitar:0.66};
const DEFAULT_STEM_MUTES = {drums:false,bass:false,chords:false,melody:false,guitar:false};
const DEFAULT_FX = {filter:1,echo:0.12,chorus:0.18,flanger:0.06,reverb:0.18,mix:0.65};
const LOFI_AUDIO_PROFILE_ID = "lofi_chill";
const LOFI_CHORD_INSTRUMENTS = ["dusty_rhodes","felt_piano","cassette_keys","muted_jazz_guitar","lofi_warm_pad"];
const LOFI_MELODY_INSTRUMENTS = ["mellow_vibes","soft_pluck","mellow_sax","muted_trumpet","tape_bell"];
const LOFI_DRUM_KITS = ["classic","lofi_dusty","lofi_brush","lofi_tape_soft"];
const LOFI_BASS_TONES = ["classic","warm_sub","soft_upright","rounded_triangle_bass"];
const LOFI_STYLE_PRESETS = ["lofi_study_room","lofi_rainy_window","lofi_moon_garden","lofi_koi_pond","lofi_train_window","lofi_ant_farm_night","lofi_menu_warmth","lofi_sleepy_waltz"];
const DEFAULT_LOFI_TEXTURE = {enabled:false, vinylCrackle:0.08, tapeHiss:0.05, wowFlutter:0.03, warmth:0.16, lowPassAge:0.22, bitCrush:0.01};
const CHIP_AUDIO_PROFILE_ID = "chip_arcade";
const LEGACY_CHIP_AUDIO_PROFILE_ID = "chip_tune";
const CHIP_CHORD_INSTRUMENTS = ["chip_square_stack","chip_triangle_pad","chip_arp_keys","modern_chip_poly"];
const CHIP_MELODY_INSTRUMENTS = ["chip_square_lead","chip_pulse_lead","chip_triangle_blip","chip_bell_stack","modern_chip_lead"];
const CHIP_DRUM_KITS = ["chip_noise_kit","chip_arcade_kit","modern_chip_punch"];
const CHIP_BASS_TONES = ["chip_triangle_bass","chip_square_bass","modern_chip_sub","bitcrush_bass"];
const CHIP_STYLE_PRESETS = ["chip_arcade_start","chip_bug_maze_pulse","chip_neon_boss","chip_tiny_quest","chip_modern_jam","chip_menu_glow","chip_dungeon_drive","chip_victory_burst"];
const CHIP_DRUM_GROOVE_PRESETS = ["chip_run_128","chip_menu_bounce","chip_boss_half_time","chip_arp_jam","chip_dungeon_shuffle","chip_victory_stomp"];
const DEFAULT_CHIP_TEXTURE = {enabled:false, bitDepth:0.18, sampleRateCrush:0.14, pulseWidth:0.5, pitchDrift:0.02, saturation:0.18, stereoSpread:0.12};
const HEAVY_METAL_AUDIO_PROFILE_ID = "heavy_metal";
const STANDARD_AUDIO_PROFILE_ID = "standard";
const WESTERN_AUDIO_PROFILE_ID = "western_frontier";
const FUNK_AUDIO_PROFILE_ID = "funk_groove";
const SCHEMA17_FEATURES = ["sound-profile-v1","rich-events-v1","articulations-v1","expanded-drums-v1","capability-report-v1"];
const PROFILE_DEFAULT_PRESETS = {
  [STANDARD_AUDIO_PROFILE_ID]: "standard_chordsmith",
  [LOFI_AUDIO_PROFILE_ID]: "lofi_study_room",
  [CHIP_AUDIO_PROFILE_ID]: "chip_nes_pulse",
  [WESTERN_AUDIO_PROFILE_ID]: "western_trail",
  [HEAVY_METAL_AUDIO_PROFILE_ID]: "metal_tight_riff",
  [FUNK_AUDIO_PROFILE_ID]: "funk_classic_pocket"
};
const PROFILE_ALIASES = {chip_tune:CHIP_AUDIO_PROFILE_ID, chip:CHIP_AUDIO_PROFILE_ID, chiptune:CHIP_AUDIO_PROFILE_ID, metal:HEAVY_METAL_AUDIO_PROFILE_ID, western:WESTERN_AUDIO_PROFILE_ID, funk:FUNK_AUDIO_PROFILE_ID, clean:STANDARD_AUDIO_PROFILE_ID};
const PRESET_ALIASES = {chip_nes_pulse:"chip_arcade_start", western_trail:"western_frontier_ride", metal_tight_riff:"metal_classic_chug"};
const SUPPORTED_ARTICULATIONS = ["finger","slap","pop","mute","ghost","hammer","pull","slide","hold","staccato","legato","bend","vibrato","tremolo","open","chug","scratch","palm_mute","accent","flam","drag","roll","choke"];
const SUPPORTED_DRUM_LANES = ["kick","snare","rim","clap","hat_closed","hat_open","crash","ride","china","tom_high","tom_mid","tom_low","percussion"];
const DJ_NATIVE_DRUM_LANES = ["kick","snare","hat_closed","hat_open","crash"];
const POCKET_DJ_CAPABILITIES = Object.freeze({
  consumer:"PocketDJ",
  schemaVersions:[16,17],
  features:SCHEMA17_FEATURES.slice(),
  profiles:Object.keys(PROFILE_DEFAULT_PRESETS),
  articulations:SUPPORTED_ARTICULATIONS.slice(),
  drumLanes:SUPPORTED_DRUM_LANES.slice(),
  techniques:{chip:["channel","duty","envelope","sweep","arpeggio","noisePeriod","wavetable","retrigger","pitchSlide","vibrato"],metal:["palmMute","pickDirection","tremoloRate","string","dualTakeSeed"],western:["pickDirection","strumDirection","banjoRoll","bowDirection","breathDirection","bendIntent"],funk:["hand","rake","ghostDepth","pocketOffset","callResponse"]}
});
const METAL_STYLE_PRESETS = ["metal_classic_chug","metal_thrashing_gallop","metal_doom_procession","metal_power_anthem","metal_boss_blast","metal_breakdown_gate"];
const METAL_CHORD_INSTRUMENTS = ["metal_power_stack","dark_organ_stack"];
const METAL_MELODY_INSTRUMENTS = ["shred_lead_guitar","twin_harmony_lead"];
const METAL_DRUM_KITS = ["metal_tight","metal_arena","metal_doom"];
const METAL_BASS_TONES = ["metal_pick_bass","metal_sub_pick","metal_grind_bass"];
const DEFAULT_METAL_TEXTURE = {enabled:false, drive:0.48, palmMute:0.78, lowTightness:0.86, presence:0.58, roomSize:0.12, pickAttack:0.72};
const WESTERN_CHORD_INSTRUMENTS = ["saloon_piano"];
const WESTERN_MELODY_INSTRUMENTS = ["banjo","harmonica","cowboy_whistle"];
const WESTERN_BASS_TONES = ["western_upright_bass"];
const WESTERN_STYLE_PRESETS = ["western_frontier_ride","western_trail"];
const FUNK_CHORD_INSTRUMENTS = ["funk_clav_stab","funk_rhodes_stab","funk_brass_stack"];
const FUNK_MELODY_INSTRUMENTS = ["funk_muted_trumpet","funk_sax_punch"];
const FUNK_BASS_TONES = ["funk_finger_pocket","funk_slap_pop","funk_muted_thump","funk_round_finger","funk_synth_pocket"];
const FUNK_STYLE_PRESETS = ["funk_classic_pocket","funk_slap_party","funk_clav_stabs","funk_brass_break","funk_soul_pocket","funk_game_chase"];
const FUNK_DRUM_GROOVE_PRESETS = ["funk_backbeat_98","funk_ghost_push","funk_one_drop","funk_open_hat_lift","funk_breakbeat_pocket","funk_fill_16ths"];
const FALLBACK_DRUM_KIT_CONFIGS = {
  classic:{kick:{startFreq:155,endFreq:45,sweepSeconds:0.14,gainFloor:0.08,gainScale:1,length:0.17,rampSeconds:0.16},snare:{noiseSeconds:0.12,highpass:1700,gainFloor:0.05,gainScale:1,length:0.13,rampSeconds:0.12},hat:{closedLength:0.05,openLength:0.16,highpassClosed:5600,highpassOpen:3800,gainFloorClosed:0.03,gainFloorOpen:0.05,gainScaleClosed:1,gainScaleOpen:1,rampSecondsClosed:0.05,rampSecondsOpen:0.14}},
  lofi_dusty:{kick:{startFreq:132,endFreq:42,sweepSeconds:0.18,filterFreq:170,gainFloor:0.04,gainScale:0.58,length:0.23,rampSeconds:0.21},snare:{noiseSeconds:0.13,highpass:980,lowpass:2800,gainFloor:0.035,gainScale:0.52,length:0.14,rampSeconds:0.12,bodyFreq:185,bodyGain:0.035,bodyLength:0.11,bodyRampSeconds:0.09},hat:{closedLength:0.065,openLength:0.2,highpassClosed:3400,highpassOpen:2600,lowpass:6200,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.55,gainScaleOpen:0.62,rampSecondsClosed:0.055,rampSecondsOpen:0.18}},
  lofi_brush:{kick:{startFreq:132,endFreq:42,sweepSeconds:0.18,filterFreq:135,gainFloor:0.04,gainScale:0.48,length:0.23,rampSeconds:0.21},snare:{noiseSeconds:0.18,highpass:720,lowpass:2800,gainFloor:0.035,gainScale:0.46,length:0.2,rampSeconds:0.18,bodyFreq:150,bodyGain:0.035,bodyLength:0.11,bodyRampSeconds:0.09},hat:{closedLength:0.065,openLength:0.2,highpassClosed:3400,highpassOpen:2600,lowpass:6200,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.55,gainScaleOpen:0.62,rampSecondsClosed:0.055,rampSecondsOpen:0.18}},
  lofi_tape_soft:{kick:{startFreq:118,endFreq:42,sweepSeconds:0.18,filterFreq:170,gainFloor:0.04,gainScale:0.58,length:0.23,rampSeconds:0.21},snare:{noiseSeconds:0.13,highpass:980,lowpass:2200,gainFloor:0.035,gainScale:0.52,length:0.14,rampSeconds:0.12,bodyFreq:185,bodyGain:0.035,bodyLength:0.11,bodyRampSeconds:0.09},hat:{closedLength:0.065,openLength:0.2,highpassClosed:3400,highpassOpen:2600,lowpass:5200,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.55,gainScaleOpen:0.62,rampSecondsClosed:0.055,rampSecondsOpen:0.18}}
};
FALLBACK_DRUM_KIT_CONFIGS.chip_noise_kit = {kick:{startFreq:210,endFreq:55,sweepSeconds:0.075,filterFreq:1900,gainFloor:0.05,gainScale:0.7,length:0.11,rampSeconds:0.095},snare:{noiseSeconds:0.075,highpass:1500,lowpass:6200,gainFloor:0.035,gainScale:0.72,length:0.08,rampSeconds:0.07,bodyFreq:260,bodyGain:0.028,bodyLength:0.055,bodyRampSeconds:0.05},hat:{closedLength:0.035,openLength:0.12,highpassClosed:5200,highpassOpen:3600,lowpass:9400,gainFloorClosed:0.018,gainFloorOpen:0.03,gainScaleClosed:0.68,gainScaleOpen:0.72,rampSecondsClosed:0.03,rampSecondsOpen:0.105}};
FALLBACK_DRUM_KIT_CONFIGS.chip_arcade_kit = {kick:{startFreq:185,endFreq:48,sweepSeconds:0.095,filterFreq:1400,gainFloor:0.055,gainScale:0.78,length:0.14,rampSeconds:0.12},snare:{noiseSeconds:0.09,highpass:1300,lowpass:5600,gainFloor:0.04,gainScale:0.68,length:0.1,rampSeconds:0.085,bodyFreq:220,bodyGain:0.032,bodyLength:0.075,bodyRampSeconds:0.065},hat:{closedLength:0.04,openLength:0.145,highpassClosed:5000,highpassOpen:3300,lowpass:9000,gainFloorClosed:0.018,gainFloorOpen:0.032,gainScaleClosed:0.66,gainScaleOpen:0.72,rampSecondsClosed:0.034,rampSecondsOpen:0.12}};
FALLBACK_DRUM_KIT_CONFIGS.modern_chip_punch = {kick:{startFreq:150,endFreq:38,sweepSeconds:0.145,filterFreq:230,gainFloor:0.06,gainScale:0.88,length:0.18,rampSeconds:0.16},snare:{noiseSeconds:0.105,highpass:980,lowpass:4800,gainFloor:0.04,gainScale:0.76,length:0.12,rampSeconds:0.1,bodyFreq:190,bodyGain:0.046,bodyLength:0.095,bodyRampSeconds:0.08},hat:{closedLength:0.045,openLength:0.17,highpassClosed:4300,highpassOpen:3000,lowpass:7800,gainFloorClosed:0.02,gainFloorOpen:0.035,gainScaleClosed:0.7,gainScaleOpen:0.78,rampSecondsClosed:0.04,rampSecondsOpen:0.145}};
FALLBACK_DRUM_KIT_CONFIGS.metal_tight = {kick:{startFreq:112,endFreq:34,sweepSeconds:0.075,filterFreq:240,gainFloor:0.07,gainScale:0.98,length:0.14,rampSeconds:0.115},snare:{noiseSeconds:0.09,highpass:1550,lowpass:7200,gainFloor:0.045,gainScale:0.82,length:0.105,rampSeconds:0.09,bodyFreq:205,bodyGain:0.04,bodyLength:0.08,bodyRampSeconds:0.06},hat:{closedLength:0.035,openLength:0.13,highpassClosed:5600,highpassOpen:4100,lowpass:9800,gainFloorClosed:0.018,gainFloorOpen:0.03,gainScaleClosed:0.68,gainScaleOpen:0.72,rampSecondsClosed:0.03,rampSecondsOpen:0.105}};
FALLBACK_DRUM_KIT_CONFIGS.metal_arena = {kick:{startFreq:104,endFreq:36,sweepSeconds:0.105,filterFreq:210,gainFloor:0.072,gainScale:0.9,length:0.18,rampSeconds:0.15},snare:{noiseSeconds:0.12,highpass:1280,lowpass:6800,gainFloor:0.048,gainScale:0.86,length:0.14,rampSeconds:0.12,bodyFreq:190,bodyGain:0.055,bodyLength:0.105,bodyRampSeconds:0.08},hat:{closedLength:0.045,openLength:0.18,highpassClosed:5000,highpassOpen:3600,lowpass:9200,gainFloorClosed:0.019,gainFloorOpen:0.034,gainScaleClosed:0.64,gainScaleOpen:0.74,rampSecondsClosed:0.038,rampSecondsOpen:0.15}};
FALLBACK_DRUM_KIT_CONFIGS.metal_doom = {kick:{startFreq:92,endFreq:30,sweepSeconds:0.15,filterFreq:160,gainFloor:0.07,gainScale:0.78,length:0.26,rampSeconds:0.22},snare:{noiseSeconds:0.18,highpass:880,lowpass:4400,gainFloor:0.045,gainScale:0.7,length:0.2,rampSeconds:0.17,bodyFreq:165,bodyGain:0.06,bodyLength:0.14,bodyRampSeconds:0.11},hat:{closedLength:0.065,openLength:0.24,highpassClosed:3600,highpassOpen:2600,lowpass:7200,gainFloorClosed:0.018,gainFloorOpen:0.035,gainScaleClosed:0.52,gainScaleOpen:0.6,rampSecondsClosed:0.055,rampSecondsOpen:0.2}};
const CHORDSMITH_THEMES = {
  night:{bg:"#070711",panel:"#101222",panel2:"#171a2f",line:"#2d3154",text:"#f4f7ff",muted:"#98a2c8",cyan:"#48f5ff",magenta:"#ff4fd8",violet:"#9b6cff",lime:"#a8ff61",amber:"#ffd166",danger:"#ff6b8b",background:"radial-gradient(circle at 15% 5%,rgba(72,245,255,.18),transparent 28%),radial-gradient(circle at 90% 10%,rgba(255,79,216,.16),transparent 32%),radial-gradient(circle at 50% 95%,rgba(155,108,255,.14),transparent 32%),linear-gradient(180deg,#060711,#0b0c18 50%,#060711)"},
  ocean:{bg:"#06131b",panel:"#102536",panel2:"#18364a",line:"#2d5c73",text:"#edf9ff",muted:"#9cc6d4",cyan:"#63d8ff",magenta:"#7ef0d7",violet:"#6fa8ff",lime:"#99f5cf",amber:"#ffd27a",danger:"#ff7f9d",background:"radial-gradient(circle at 12% 7%,rgba(99,216,255,.20),transparent 30%),radial-gradient(circle at 90% 10%,rgba(126,240,215,.15),transparent 34%),radial-gradient(circle at 48% 95%,rgba(111,168,255,.15),transparent 34%),linear-gradient(180deg,#06131b,#0a1f2a 52%,#061018)"},
  forest:{bg:"#07120b",panel:"#122318",panel2:"#1c3222",line:"#35533d",text:"#eef8ef",muted:"#a7c0ab",cyan:"#8dcf7b",magenta:"#d9f29a",violet:"#7ee0a3",lime:"#a8ff61",amber:"#ffd27a",danger:"#ff8c7e",background:"radial-gradient(circle at 15% 5%,rgba(141,207,123,.20),transparent 28%),radial-gradient(circle at 86% 12%,rgba(217,242,154,.15),transparent 32%),radial-gradient(circle at 50% 95%,rgba(126,224,163,.14),transparent 34%),linear-gradient(180deg,#07120b,#0e1b12 52%,#060f09)"},
  sunset:{bg:"#1b0d14",panel:"#2b1620",panel2:"#3a2029",line:"#5a3640",text:"#fff1ee",muted:"#ddb3a9",cyan:"#ff9d6b",magenta:"#ff6bb7",violet:"#b16cff",lime:"#ffd27a",amber:"#ffd166",danger:"#ff6b8b",background:"radial-gradient(circle at 15% 5%,rgba(255,157,107,.22),transparent 30%),radial-gradient(circle at 90% 10%,rgba(255,107,183,.16),transparent 32%),radial-gradient(circle at 50% 95%,rgba(255,210,122,.14),transparent 34%),linear-gradient(180deg,#1b0d14,#26121c 52%,#12080e)"}
};

let pocketAudioCoreModulePromise = null;
let pocketAudioCoreModule = null;
let pocketAudioCore = null;
let pocketAudioCoreStatus = "legacy audio active";

function pocketAudioCoreIsRepoPath(){
  const path = String(window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
  return path.includes("/apps/pocket-dj/");
}
function pocketAudioCoreImportPaths(){
  return pocketAudioCoreIsRepoPath()
    ? [...POCKET_AUDIO_CORE_REPO_IMPORT_PATHS, ...POCKET_AUDIO_CORE_PACKAGED_IMPORT_PATHS]
    : [...POCKET_AUDIO_CORE_PACKAGED_IMPORT_PATHS, ...POCKET_AUDIO_CORE_REPO_IMPORT_PATHS];
}
function pocketAudioCoreScriptPaths(){
  return pocketAudioCoreIsRepoPath()
    ? [...POCKET_AUDIO_CORE_REPO_IIFE_PATHS, ...POCKET_AUDIO_CORE_PACKAGED_IIFE_PATHS]
    : [...POCKET_AUDIO_CORE_PACKAGED_IIFE_PATHS, ...POCKET_AUDIO_CORE_REPO_IIFE_PATHS];
}
function pocketAudioCoreStatusLabel(){
  const diagnostics = pocketAudioCore?.getDiagnostics ? pocketAudioCore.getDiagnostics() : null;
  if(diagnostics?.projectLoaded) return `${POCKET_AUDIO_CORE_VERSION} / ${diagnostics.timelineEventCount || 0} events`;
  return `${POCKET_AUDIO_CORE_VERSION} / ${pocketAudioCoreStatus}`;
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
      for(const path of pocketAudioCoreScriptPaths()){
        try{
          if(!(await pocketAudioCoreAssetExists(path))) continue;
          const mod = await loadPocketAudioCoreScript(path);
          pocketAudioCoreModule = mod;
          pocketAudioCore = new mod.PocketAudio({audio:false, host:"Pocket DJ"});
          pocketAudioCoreStatus = "ready";
          return mod;
        }catch(e){
          lastError = e;
        }
      }
      for(const path of pocketAudioCoreImportPaths()){
        try{
          if(!(await pocketAudioCoreAssetExists(path))) continue;
          const mod = await import(path);
          pocketAudioCoreModule = mod;
          pocketAudioCore = new mod.PocketAudio({audio:false, host:"Pocket DJ"});
          pocketAudioCoreStatus = "ready";
          return mod;
        }catch(e){
          lastError = e;
        }
      }
      pocketAudioCoreStatus = "unavailable; legacy audio active";
      throw lastError || new Error("Pocket Audio Core could not be loaded.");
    })();
  }
  return pocketAudioCoreModulePromise;
}
async function primePocketAudioCore(input, reason="project"){
  try{
    const mod = await loadPocketAudioCoreModule();
    const project = await pocketAudioCore.loadProject(input);
    const timeline = mod.buildPocketAudioTimeline ? mod.buildPocketAudioTimeline(project, {scope:"sequence"}) : pocketAudioCore.timeline;
    pocketAudioCoreStatus = `${reason}: ${timeline?.events?.length || 0} timeline events`;
    if(el.metaGrid) renderMeta();
    return true;
  }catch(e){
    pocketAudioCoreStatus = "legacy audio active";
    if(el.metaGrid) renderMeta();
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
function lofiChordInstrumentIds(){ return coreArrayExport("LOFI_CHORD_INSTRUMENTS", LOFI_CHORD_INSTRUMENTS); }
function lofiMelodyInstrumentIds(){ return coreArrayExport("LOFI_MELODY_INSTRUMENTS", LOFI_MELODY_INSTRUMENTS); }
function lofiDrumKitIds(){ return coreArrayExport("LOFI_DRUM_KITS", LOFI_DRUM_KITS, {includeClassic:true}); }
function lofiBassToneIds(){ return coreArrayExport("LOFI_BASS_TONES", LOFI_BASS_TONES, {includeClassic:true}); }
function lofiStylePresetIds(){ return coreArrayExport("LOFI_STYLE_PRESET_IDS", LOFI_STYLE_PRESETS); }
function chipChordInstrumentIds(){ return coreArrayExport("CHIP_CHORD_INSTRUMENTS", CHIP_CHORD_INSTRUMENTS); }
function chipMelodyInstrumentIds(){ return coreArrayExport("CHIP_MELODY_INSTRUMENTS", CHIP_MELODY_INSTRUMENTS); }
function chipDrumKitIds(){ return coreArrayExport("CHIP_DRUM_KITS", CHIP_DRUM_KITS); }
function chipBassToneIds(){ return coreArrayExport("CHIP_BASS_TONES", CHIP_BASS_TONES); }
function chipStylePresetIds(){ return coreArrayExport("CHIP_STYLE_PRESET_IDS", CHIP_STYLE_PRESETS); }
function metalStylePresetIds(){ return coreArrayExport("METAL_STYLE_PRESET_IDS", METAL_STYLE_PRESETS); }
function metalChordInstrumentIds(){ return coreArrayExport("METAL_CHORD_INSTRUMENTS", METAL_CHORD_INSTRUMENTS); }
function metalMelodyInstrumentIds(){ return coreArrayExport("METAL_MELODY_INSTRUMENTS", METAL_MELODY_INSTRUMENTS); }
function metalDrumKitIds(){ return coreArrayExport("METAL_DRUM_KITS", METAL_DRUM_KITS); }
function metalBassToneIds(){ return coreArrayExport("METAL_BASS_TONES", METAL_BASS_TONES); }
function pocketDrumKitIds(){ return Array.from(new Set([...lofiDrumKitIds(), ...chipDrumKitIds(), ...metalDrumKitIds(),"funk_dry_pocket"])); }
function pocketBassToneIds(){ return Array.from(new Set([...lofiBassToneIds(), ...chipBassToneIds(), ...metalBassToneIds(),...WESTERN_BASS_TONES,...FUNK_BASS_TONES])); }
function pocketChordInstrumentIds(){ return ["pocket","piano","saloon_piano","harp","warm_pad","glass",...WESTERN_CHORD_INSTRUMENTS,...FUNK_CHORD_INSTRUMENTS,...lofiChordInstrumentIds(),...chipChordInstrumentIds(),...metalChordInstrumentIds()]; }
function pocketMelodyInstrumentIds(){ return ["pulse","soft","synth","bell","lead_guitar","distorted_lead_guitar","banjo","harmonica","cowboy_whistle","trumpet","saxophone",...WESTERN_MELODY_INSTRUMENTS,...FUNK_MELODY_INSTRUMENTS,...lofiMelodyInstrumentIds(),...chipMelodyInstrumentIds(),...metalMelodyInstrumentIds()]; }
function fallbackChordsmithFxParameters(fx = {}){
  const delay = clamp(asNum(fx.delay ?? fx.echo, DEFAULT_FX.echo), 0, 1);
  const chorus = clamp(asNum(fx.chorus, DEFAULT_FX.chorus), 0, 1);
  const flanger = clamp(asNum(fx.flanger, DEFAULT_FX.flanger), 0, 1);
  const reverb = clamp(asNum(fx.reverb, DEFAULT_FX.reverb), 0, 1);
  const mix = clamp(asNum(fx.mix, DEFAULT_FX.mix), 0, 1);
  const brightness = (chorus * .9) + (flanger * 1.1) + (reverb * .35) - (delay * .10);
  return {
    source:{delay,chorus,flanger,reverb,mix},
    dryGain:Math.max(.52, 1.0 - (mix * .48)),
    wetMasterGain:mix * 1.45,
    tone:{frequency:1800,gain:clamp(brightness * 6, -2, 7)},
    delay:{time:.10 + delay * .42, feedback:.05 + delay * .72, mix:delay * .95},
    chorus:{rate:.25 + chorus * 1.9, depth:.0014 + chorus * .030, mix:chorus * .95},
    flanger:{rate:.10 + flanger * 1.10, depth:.0007 + flanger * .0062, feedback:.08 + flanger * .82, mix:flanger * .85},
    reverb:{decay:1.6, impulseDecay:2.4, mix:reverb * 1.05}
  };
}
function sharedChordsmithFxParameters(fx = {}){
  if(!pocketAudioCoreModule || typeof pocketAudioCoreModule.chordsmithFxParameters !== "function") return null;
  try{ return pocketAudioCoreModule.chordsmithFxParameters(fx); }
  catch(e){ return null; }
}
function chordsmithFxParams(fx = {}){
  return sharedChordsmithFxParameters(fx) || fallbackChordsmithFxParameters(fx);
}

/* 2. Compatibility parser */
