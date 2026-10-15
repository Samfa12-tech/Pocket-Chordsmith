// Real native DSP and production pack builders through a file-backed test
// transport. This bypasses Tauri IPC and is not installed/device/mic evidence.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import AdmZip from "adm-zip";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "../src/daw/audioClips";
import { setCachedAudioBuffer } from "../src/audio/audioBufferCache";
import { encodeWav } from "../src/audio/offlineRender";
import { renderProjectToNativeWavBlob } from "../src/audio/nativeOfflineRender";
import { createGamePackZipBlob } from "../src/daw/exportJobs";
import { addFxSlot, setFxSlotParameter } from "../src/daw/fx";
import { createAutomationLane } from "../src/daw/automation";
import { validateProjectInvariants } from "../src/daw/projectInvariants";
import { createCollectMediaPlan, markMediaPoolItemCollected } from "../src/daw/mediaPool";
import type { NativeMediaApi } from "../src/native/mediaBridge";
import { verifyGamePackZip } from "./verify-game-pack.mjs";
import { decodePcmWavBytes } from "../../../packages/pocket-audio-core/src/index.js";
import { compareCapturedStereoPcm } from "../../../packages/pocket-audio-core/scripts/lib/pcm-parity.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const scratch = resolve(root, "local-artifacts/scratch/validation/native-godot-route");
mkdirSync(scratch, {recursive:true});
const workspace = mkdtempSync(resolve(scratch,"run-"));
const cargo = argument("--cargo-bin"), godot = argument("--godot-bin");
const rate = 48000, frames = rate * 2;
const channels = [Float32Array.from({length:frames},(_,frame)=>Math.sin(frame * Math.PI * 2 * 233 / rate) * 0.32),Float32Array.from({length:frames},(_,frame)=>Math.sin(frame * Math.PI * 2 * 349 / rate) * 0.2)];
const buffer = {sampleRate:rate,length:frames,duration:2,numberOfChannels:2,getChannelData:(channel:number)=>channels[channel]} as AudioBuffer;
const wav = new Uint8Array(await encodeWav(buffer).arrayBuffer());
const mediaPath = resolve(workspace,"generated-media.wav");
writeFileSync(mediaPath,wav);
let project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({projectVersion:17,title:"Native arranged route - generated test media",bpm:120,key:"D",timeSig:4,resolution:4,guitarEnabled:true,guitarTone:"campfire_acoustic",guitarPerformanceA:"strum_pick",guitarPerformanceB:"strum_pick",sectionBars:{A:1,B:1},songSequence:["A","B"],progressionA:[0],progressionB:[5],chordsOn:false,bassOn:false}));
project.project.sampleRate = rate;
const moved = project.timeline.clips.find(clip=>clip.sectionId === "B");
if (!moved) throw new Error("Missing native guitar arrangement fixture.");
moved.startBar = 3;
moved.transforms = {...moved.transforms,gain:1.4,transpose:2};
project.timeline.bars = 3;
project.exportProfiles = project.exportProfiles.map(profile=>profile.id === "full-song-wav" ? {...profile,sampleRate:rate,bitDepth:16,settings:{...profile.settings,tailSeconds:0.6,dither:"off",normalize:false,channelMode:"stereo"}} : profile);
const imported = addImportedAudioMedia(project,{name:"Generated recorded-media-path fixture.wav",uri:mediaPath,mimeType:"audio/wav",durationSeconds:2,sampleRate:rate,channels:2,sizeBytes:wav.length,metadata:{fixture:"generated-signal-not-a-physical-recording"}});
const collect = createCollectMediaPlan(imported.project).copy.find(item=>item.id === imported.item.id);
if(!collect?.targetRelativePath) throw new Error("Fixture media collection is not actionable.");
const collectedPath=resolve(workspace,collect.targetRelativePath);
mkdirSync(dirname(collectedPath),{recursive:true});
writeFileSync(collectedPath,wav);
const collected = markMediaPoolItemCollected(imported.project,{id:imported.item.id,sourceUri:mediaPath,targetPath:collectedPath,targetRelativePath:collect.targetRelativePath,sizeBytes:wav.length});
setCachedAudioBuffer(imported.item.id,buffer,{sourceBytes:wav,sourceUri:collectedPath,sourceMimeType:"audio/wav"});
const placed = placeAudioClipOnTimeline(collected,imported.item.id,1.5);
project = placed.project;
const clip = project.timeline.clips.find(item=>item.id === placed.clipId)!;
clip.transforms = {...clip.transforms,gain:0.7};
clip.metadata = {...clip.metadata,sourceOffsetSeconds:0.125,fadeInSeconds:0.025,fadeOutSeconds:0.06};
project = addFxSlot(project,placed.trackId,"low-pass");
let chain = project.fx.chains.find(item=>item.ownerTrackId === placed.trackId)!;
project = setFxSlotParameter(project,chain.id,chain.slots.at(-1)!.id,"frequency",1700);
project = addFxSlot(project,"master","compressor");
chain = project.fx.chains.find(item=>item.ownerTrackId === "master")!;
project = setFxSlotParameter(project,chain.id,chain.slots.at(-1)!.id,"threshold",-24);
project = createAutomationLane(project,`clips.${placed.clipId}.gain`,{points:[{bar:1.5,value:0.18,curve:"linear"},{bar:2,value:0.8,curve:"linear"},{bar:2.4,value:0.3,curve:"linear"}]}).project;
const invariants=validateProjectInvariants(project);
if(invariants.errors.length) throw new Error(`Invalid arranged fixture: ${invariants.errors.map(item=>item.message).join("; ")}`);

let renderIndex = 0;
const renders: unknown[] = [];
const api: NativeMediaApi = {
  isAvailable:()=>true,
  async invoke<T>(command:string,args:Record<string,unknown> = {}):Promise<T> {
    if (command !== "native_audio_render_wav") throw new Error(`Unexpected native test transport command: ${command}`);
    const directory = resolve(workspace,`native-${String(renderIndex++).padStart(2,"0")}`);
    console.error(`[native-godot-route] native export ${renderIndex}, requested ${args.durationSeconds}s`);
    mkdirSync(directory);
    const input = resolve(directory,"input.json");
    writeFileSync(input,JSON.stringify(args));
    const run = spawnSync(cargo,["test","--locked","--lib","native_godot_arranged_export_fixture","--","--ignored","--nocapture"],{cwd:resolve(root,"apps/pocket-daw/src-tauri"),encoding:"utf8",env:{...process.env,POCKET_DAW_NATIVE_GODOT_INPUT:input,POCKET_DAW_NATIVE_GODOT_OUTPUT:directory},timeout:180000,maxBuffer:8*1024*1024});
    writeFileSync(resolve(directory,"native.log"),`${run.stdout || ""}\n${run.stderr || ""}`);
    if(run.error || run.status !== 0) throw new Error(`Real native renderer failed: ${directory}: ${run.error || run.status}`);
    const result = JSON.parse(readFileSync(resolve(directory,"render.json"),"utf8"));
    const bytes = readFileSync(resolve(directory,"render.wav"));
    const payload = args.payload as {events:unknown[];regions:unknown[];fxChains:unknown[]};
    renders.push({directory,durationSeconds:result.durationSeconds,events:payload.events.length,regions:payload.regions.length,fxChains:payload.fxChains.length,sha256:createHash("sha256").update(bytes).digest("hex")});
    return {...result,bytes:Array.from(bytes)} as T;
  }
};
const kit = await createGamePackZipBlob(project,"godot-adaptive-pack",{renderWav:async renderProject=>{
  const blob = await renderProjectToNativeWavBlob(renderProject,api);
  if(!blob) throw new Error("Real native WAV export unavailable.");
  return blob;
},onProgress:(stage,detail)=>{console.error(`[native-godot-route] ${stage}: ${detail || ""}`);}});
const zipPath = resolve(workspace,"native-arranged-godot.zip");
writeFileSync(zipPath,new Uint8Array(await kit.blob.arrayBuffer()));
const verified = verifyGamePackZip(zipPath,{kind:"godot-adaptive-pack"});
if(!verified.ok) throw new Error(`Production pack verification failed: ${verified.errors.join("; ")}`);
const pack = resolve(workspace,"pack");
mkdirSync(pack);
for(const entry of new AdmZip(zipPath).getEntries()) {
  if(entry.isDirectory) continue;
  const target=resolve(pack,entry.entryName);
  if(!target.startsWith(pack+"\\")) throw new Error("Pack entry escaped the fixture directory.");
  mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,entry.getData());
}
writeFileSync(resolve(workspace,"source-project.json"),JSON.stringify(project,null,2));
writeFileSync(resolve(workspace,"native-export-evidence.json"),JSON.stringify({workspace,zipPath,manifest:kit.manifest,renders,verified,sourceMedia:"generated test signal through real native media path; no physical recording",transport:"file-backed native export test; Tauri IPC bypassed",installedAcceptance:"not tested",godotCapture:"pending"},null,2));
cpSync(resolve(root,"addons/pocket_chordsmith"),resolve(workspace,"addons/pocket_chordsmith"),{recursive:true,filter:path=>!/\.(uid|import)$/i.test(path) && !/[\\/]\.godot([\\/]|$)/.test(path)});
writeFileSync(resolve(workspace,"project.godot"),`config_version=5\n[application]\nconfig/name="Native arranged Pocket Audio route"\n[audio]\ndriver/mix_rate=48000\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n`);
runGodot(["--headless","--editor","--quit"],"import.log");
writeFileSync(resolve(workspace,"prepare-pack.gd"),`extends SceneTree\nconst Tools = preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")\nfunc _init():\n\tvar result = Tools.new().create_playback_profile_from_game_pack_manifest(${JSON.stringify(`res://pack/${kit.manifest.manifestFile}`)}, "", "res://pack")\n\tprint(JSON.stringify({"ok": result.ok, "errors": result.errors}))\n\tquit(0 if result.ok else 1)\n`);
runGodot(["--headless","--script","res://prepare-pack.gd"],"prepare-pack.log");
runGodot(["--headless","--editor","--quit"],"lossless-import.log");
const reference = decodePcmWavBytes(readFileSync(resolve(pack,kit.manifest.fullMix)));
const duration = reference.channels[0].length / reference.sampleRate;
const output = runGodot(["--headless","--audio-driver","Dummy","--script","res://addons/pocket_chordsmith/tests/pcs_rendered_pack_capture_test.gd","--",`res://pack/${kit.manifest.manifestFile}`,"res://","1",String(duration + 0.5),"arrangement"],"capture.log");
const captured = output.split(/\r?\n/).filter(line=>line.startsWith("{") && line.includes('"test":"rendered-pack-capture"')).map(line=>JSON.parse(line)).at(-1);
if (!captured || captured.captures.length !== 4) throw new Error("Godot did not capture all four native arrangement asset routes.");
const selectedStems = kit.manifest.stems.filter(stem=>!stem.id.startsWith("drums-")).map(stem=>decodePcmWavBytes(readFileSync(resolve(pack,stem.packPath))));
if(selectedStems.some(stem=>stem.sampleRate !== reference.sampleRate)) throw new Error("Native stem sample rates differ.");
const layerReference = reference.channels.map((channel:Float32Array,ch:number)=>Float32Array.from(channel,(_,i)=>selectedStems.reduce((sum,stem)=>sum + (stem.channels[ch]?.[i] || 0),0)));
const comparisons = captured.captures.map((item:{mix:string;file:string;synchronized:boolean})=>{
  const bytes=readFileSync(resolve(workspace,item.file));
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const channels=[0,1].map(ch=>Float32Array.from({length:bytes.length / 8},(_,i)=>view.getFloat32(i * 8 + ch * 4,true)));
  const expected=item.mix === "full-mix" ? reference.channels : layerReference;
  const comparison=compareCapturedStereoPcm(channels,expected,reference.sampleRate);
  const silent=channels.map(channel=>new Float32Array(channel.length));
  const silenceRejected=!compareCapturedStereoPcm(silent,expected,reference.sampleRate).passed;
  return {...item,...comparison,silenceRejected};
});
const report={workspace,zipPath,nativeRenders:renders.length,driver:captured.driver,duration,comparisons,scope:"Native rendered asset selection/zero-origin PCM only; fixture chart processing disabled. Native DAW timeline compilation/seek/end integration pending. File-backed native transport bypasses Tauri IPC; generated media is not a physical recording; no installed/device/listening claim."};
writeFileSync(resolve(workspace,"parity-report.json"),JSON.stringify(report,null,2));
if(comparisons.some((item:{passed:boolean;silenceRejected:boolean})=>!item.passed || !item.silenceRejected)) throw new Error(`Native rendered asset parity failed: ${workspace}`);
console.log(JSON.stringify(report));

function argument(name:string):string {
  const index=process.argv.indexOf(name);
  if(index<0 || !process.argv[index+1]) throw new Error(`Missing ${name}`);
  return resolve(process.argv[index+1]);
}
function runGodot(args:string[],log:string):string {
  const run=spawnSync(godot,["--path",workspace,...args],{encoding:"utf8",timeout:180000,maxBuffer:8*1024*1024});
  const output=`${run.stdout || ""}\n${run.stderr || ""}`;
  writeFileSync(resolve(workspace,log),output);
  if(run.error || run.status !== 0) throw new Error(`${log}: ${run.error || run.status}`);
  return output;
}
