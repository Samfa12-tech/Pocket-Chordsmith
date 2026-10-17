import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {compareCapturedStereoPcm} from '../packages/pocket-audio-core/scripts/lib/pcm-parity.mjs';
import {decodePcmWavBytes} from '../packages/pocket-audio-core/src/export/wav.js';
const project=resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Explicit retained project path required');
const report=JSON.parse(readFileSync(join(project,'probe-report.json'))),config=report.config;
if(report.identity.mix_rate!==config.sample_rate||report.identity.driver!=='WASAPI')throw Error('Direct parity requires same rate and requested backend');
const reference=decodePcmWavBytes(readFileSync(join(project,config.reference.replace('res://',''))));
const captures=new Map();
for(const route of report.routes){const bytes=readFileSync(join(project,route.name+'.f32'));if(bytes.length%8)throw Error('Truncated float capture');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),actual=[new Float32Array(bytes.length/8),new Float32Array(bytes.length/8)];for(let i=0;i<bytes.length/8;i++){actual[0][i]=view.getFloat32(i*8,true);actual[1][i]=view.getFloat32(i*8+4,true);}captures.set(route.name,actual);}
let comparisonReference=reference.channels,resamplerControl=null;
if(reference.sampleRate!==config.sample_rate){
  const raw=captures.get('raw-full');let first=-1,last=-1;
  for(let i=0;i<raw[0].length;i++)if(Math.abs(raw[0][i])+Math.abs(raw[1][i])>1e-10){if(first<0)first=i;last=i;}
  if(first<0)throw Error('Raw resampler control is silent');
  const start=Math.max(0,first-128),frames=Math.ceil(reference.channels[0].length*config.sample_rate/reference.sampleRate)+256;
  if(start+frames>raw[0].length||last>=start+frames)throw Error('Raw resampler capture lacks complete fixed-duration/tail window');
  comparisonReference=raw.map(c=>c.slice(start,start+frames));
  resamplerControl={sourceRate:reference.sampleRate,outputRate:config.sample_rate,sourceFrames:reference.channels[0].length,fixedDurationOutputFrames:frames,rawWindowStart:start,firstNonzero:first,lastNonzero:last,recordedLeadInFrames:first-start,additionalWindowFrames:256,scope:'Same Godot raw-player resampler control, fixed source-duration window plus256frames; no gain/duration fit. Rendered-control parity, not direct decoded44.1kPCM versus48kPCM or proof of raw backend resampling.'};
}
const pcm=[];
for(const route of report.routes){const actual=captures.get(route.name),comparison=compareCapturedStereoPcm(actual,comparisonReference,config.sample_rate);const silence=actual.map(c=>new Float32Array(c.length)),truncated=actual.map(c=>c.slice(0,comparison.alignedLatencyFrames+comparison.referenceFrames-1));pcm.push({name:route.name,...comparison,captureDrops:route.discarded_frames,rejectsSilence:!compareCapturedStereoPcm(silence,comparisonReference,config.sample_rate).passed,rejectsMissingFinalFrame:!compareCapturedStereoPcm(truncated,comparisonReference,config.sample_rate).passed});}
const calibration=report.events.find(e=>e.kind==='known-main-thread-delay');
const overlap=(r,a,b)=>Math.max(0,Math.min(r.us,b)-Math.max(r.previous_us,a));
const outliers=report.frame_rows.filter(r=>r.gap_ms>1000/30).map(r=>({...r,knownDelayOverlapUs:calibration?overlap(r,calibration.begin_us,calibration.end_us):0,conductorOverlapUs:report.conductor_spans.reduce((n,s)=>n+overlap(r,s.begin_us,s.end_us),0),harnessCaptureOverlapUs:report.frame_rows.reduce((n,s)=>n+overlap(r,s.capture_begin_us,s.capture_end_us),0),forceDrawOverlapUs:report.frame_rows.reduce((n,s)=>n+overlap(r,s.force_draw_begin_us,s.force_draw_end_us),0)}));
const phases=[...new Set(report.frame_rows.map(r=>r.phase))].map(name=>{const rows=report.frame_rows.filter(r=>r.phase===name);return {name,count:rows.length,maxMs:Math.max(...rows.map(r=>r.gap_ms)),overOriginal33333ms:rows.filter(r=>r.gap_ms>1000/30).length};});
const starts=report.events.filter(e=>e.kind==='start').map(e=>({route:e.route,durationUs:e.end_us-e.begin_us,anchorUs:e.anchor_us,passesOriginalWarm2ms:e.end_us-e.begin_us<2000}));
const clocks=report.routes.map(route=>{const rows=report.audio_rows.flatMap(row=>row.samples.filter(s=>s.route===route.name&&s.player_playing&&s.anchor_us>0).map(s=>({us:row.begin_us,errorSeconds:Math.abs((row.begin_us-s.anchor_us)/1e6-s.position_seconds),anchorPreserved:s.conductor_anchor_us==null||s.conductor_anchor_us===s.anchor_us})));return {name:route.name,samples:rows.length,maxRawPlayerWallErrorSeconds:Math.max(...rows.map(r=>r.errorSeconds)),anchorsPreserved:rows.every(r=>r.anchorPreserved),passed:rows.length>0&&rows.every(r=>r.errorSeconds<0.15&&r.anchorPreserved)};});
const analysis={at:new Date().toISOString(),identity:report.identity,config,pcm,allPcmPassed:pcm.every(r=>r.passed&&r.captureDrops===0&&r.rejectsSilence&&r.rejectsMissingFinalFrame),addonPcmPassed:pcm.filter(r=>r.name.startsWith('addon-')).every(r=>r.passed&&r.captureDrops===0&&r.rejectsSilence&&r.rejectsMissingFinalFrame),naturalEndings:report.natural_endings,preparation:report.preparation,starts,clocks,phases,allFrameOutliers:outliers,allIntervalFrameBoundPassed:outliers.length===0,knownDelayControl:calibration,sfxRequests:report.sfx_requests,sfxNonzero:report.sfx_nonzero,runtimeFailures:report.failures,scope:'Complete decoded finite reference with original PCM16 tolerances, latency alignment only; all tails and final frames. Raw Godot player separately retained. Frame gaps include deliberate delay and all other phases; no universal performance, backend causation or human listening claim.'};
analysis.resamplerControl=resamplerControl;
if(resamplerControl)analysis.scope=resamplerControl.scope+' All frame gaps, known delay and failures retained; no physical listening claim.';
writeFileSync(join(project,'musical-analysis.json'),JSON.stringify(analysis,null,2),{flag:'wx'});console.log(JSON.stringify({...analysis,preparation:analysis.preparation.map(r=>({name:r.name,report:r.report})),pcm:pcm.map(({tail,tolerances,...r})=>({...r,tailPassed:tail.passed}))},null,2));
