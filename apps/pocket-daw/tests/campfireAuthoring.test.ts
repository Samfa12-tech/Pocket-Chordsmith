import { describe, expect, it } from "vitest";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { buildPocketAudioTimeline } from "../../../packages/pocket-audio-core/src/events/timeline-events.js";
import { normalisePocketChordsmithProject } from "../../../packages/pocket-audio-core/src/schema/normalise-project.js";
import { getPrimaryChordsmithSource, setGuitarPerformance, setGuitarSettings } from "../src/daw/chordsmithEditor";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { negotiatePocketDawPcsCapabilities } from "../src/compatibility/pcsCapabilities";
import { timelineSecondsAtBar } from "../src/daw/timeline";
import { buildNativeAudioStartPayload } from "../src/native/audioPlayback";
import { exportProjectToMidiBlob } from "../src/audio/midiExport";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createAutomationLane } from "../src/daw/automation";
import { createInitialState } from "../src/app/state";
import { createUndoStack } from "../src/daw/undo";
import { applyGuitarPresetCommand, setGuitarPerformanceCommand, undoCommand } from "../src/app/commands";
import { nativeRenderCacheSignature } from "../src/audio/nativeRenderCache";

function referenceSource() {
  return {projectVersion:17,key:"D",scale:"major",bpm:76,timeSig:4,resolution:4,guitarEnabled:true,guitarTone:"campfire_acoustic",guitarPerformanceA:"strum_pick",sectionBars:{A:8},songSequence:["A"],progressionA:[0,0,3,3,5,5,4,4],guitarPatternA:["scratch"],future:{keep:true}};
}

describe("native Campfire compact authoring", () => {
  it("preserves the prepared identity and complete major/minor voicings", () => {
    const pcs = sanitizePocketChordsmithProject({projectVersion:17,key:"D",scale:"major",bpm:76,timeSig:4,resolution:1,guitarEnabled:true,guitarTone:"campfire_acoustic",sectionBars:{A:4},songSequence:["A"],progressionA:[0,3,5,4],guitarPatternA:Array.from({length:16},(_,index)=>index%4===0?"open":"off")});
    expect(pcs.guitarTone).toBe("campfire_acoustic");
    const events = renderTimelineEvents(createDawProjectFromChordsmithProject(pcs)).filter(event=>event.kind === "guitar");
    expect(events.map(event=>event.midiNotes)).toEqual([[50,57,62,66],[55,59,62,67],[47,54,59,62],[45,57,61,64]]);
    expect(events.every(event=>event.instrument === "campfire_acoustic" && event.velocity === 1)).toBe(true);
  });

  it("matches all 24 Core reference events on the native clock, including the exact 15-second onset", () => {
    const source = referenceSource();
    const before = JSON.stringify(source);
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source));
    const events = renderTimelineEvents(project).filter(event=>event.kind === "guitar");
    const expected = buildPocketAudioTimeline(normalisePocketChordsmithProject(source)).events.filter(event=>event.type === "guitar");
    expect(events).toHaveLength(24);
    const audible = (event: {time:number,duration:number,velocity:number,midi?:number,midiNotes?:number[],direction?:string,technique?:unknown}) => ({time:event.time,duration:event.duration,velocity:event.velocity,midi:event.midi,midiNotes:event.midiNotes,direction:event.direction,technique:event.technique});
    expect(events.map(audible)).toEqual(expected.map(audible));
    expect(events.find(event=>event.step === 76)?.time).toBe(15);
    expect(JSON.stringify(source)).toBe(before);
    const payload = buildNativeAudioStartPayload(project,events,0);
    expect(payload.events.filter(event=>event.instrument === "campfire_acoustic")).toHaveLength(24);
  });

  it("keeps picking phase, clip gain, pitch and source trim without moving the native timeline", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(referenceSource()));
    const clip = project.timeline.clips[0];
    clip.startBar=3;clip.barLength=2;clip.metadata={...clip.metadata,sourceStartBar:2};
    clip.transforms={...clip.transforms,gain:0.4,transpose:2};
    const events = renderTimelineEvents(project).filter(event=>event.kind === "guitar");
    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({time:timelineSecondsAtBar(project,3),midiNotes:[57,61,64,69],velocity:1,clipGain:0.4,step:32});
    expect(events[1]).toMatchObject({midi:76,velocity:0.4166666666666667,clipGain:0.4,step:36});
    expect(clip.startBar).toBe(3);
  });

  it("switches performances and saves/reopens without replacing grid or exact rich source notes", () => {
    const source = {...referenceSource(),guitarPerformanceA:"grid",sections:{A:{tracks:{guitar:{events:[{tick:123.5,durationTicks:120.25,note:78,instrument:"campfire_acoustic",velocity:0.4166666666666667,technique:{campfire:{seed:456}},future:{keep:true}}]}}}}};
    const original = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source));
    const changed = setGuitarPerformance(original,"A","strum_pick");
    const reopened = parsePocketDawProjectFile(buildPocketDawProjectFile(changed));
    expect(getPrimaryChordsmithSource(reopened)?.sections.A.guitarPattern).toEqual(getPrimaryChordsmithSource(original)?.sections.A.guitarPattern);
    expect((reopened.sourceRefs[0].original as Record<string,unknown>).guitarPerformanceA).toBe("strum_pick");
    const restored = setGuitarPerformance(reopened,"A","grid");
    const events = renderTimelineEvents(restored).filter(event=>event.kind === "guitar");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({tick:123.5,midiNotes:[78],velocity:0.4166666666666667,technique:{campfire:{seed:456}}});
    expect(events[0].time).toBe(123.5 / 480 * (60 / 76));
    expect(getPrimaryChordsmithSource(restored)?.sections.A.richEvents.guitar[0].durationTicks).toBe(120.25);
    expect((restored.sourceRefs[0].original as Record<string,unknown>).sections).toEqual(source.sections);
    expect((restored.sourceRefs[0].original as Record<string,unknown>).future).toEqual(source.future);
  });

  it("activates an automatic-only guitar and prevents High picking without altering the saved part", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({...referenceSource(),guitarPatternA:[]}));
    expect(project.tracks.find(track=>track.role === "guitar")?.active).toBe(true);
    expect(setGuitarSettings(project,{guitarRegister:"high"})).toBe(project);
    const grid = setGuitarPerformance(project,"A","grid");
    const high = setGuitarSettings(grid,{guitarRegister:"high"});
    expect(getPrimaryChordsmithSource(high)?.guitarRegister).toBe("high");
    expect(setGuitarPerformance(high,"A","strum_pick")).toBe(high);
  });

  it("reports compact chord and articulation limits while preserving exact rich pitches", () => {
    const pcs = sanitizePocketChordsmithProject({...referenceSource(),chordType:"sus4",guitarPerformanceA:"grid"});
    const report = negotiatePocketDawPcsCapabilities(pcs);
    expect(report.entries.some(entry=>entry.feature === "campfire-chord:sus4")).toBe(true);
    expect(report.entries.some(entry=>entry.feature === "campfire-articulation:scratch")).toBe(true);
  });

  it("uses canonical role precedence for custom-ID Campfire tracks and preserves their metadata", () => {
    const source={projectVersion:17,key:"D",bpm:76,timeSig:4,resolution:4,sectionBars:{A:1},songSequence:["A"],sections:{A:{tracks:{handPlayed:{role:"GUITAR",future:{keep:true},events:[{tick:0,notes:[50,57,62,66],sound:"campfire_acoustic",direction:"up",velocity:100}]}}}}};
    const pcs=sanitizePocketChordsmithProject(source);
    expect(pcs.guitarEnabled).toBe(true);
    const project=createDawProjectFromChordsmithProject(pcs);
    const events=renderTimelineEvents(project).filter(event=>event.kind === "guitar");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({midiNotes:[50,57,62,66],direction:"up",instrument:"campfire_acoustic"});
    expect(project.sourceRefs[0].original).toEqual(source);
    const overridden=sanitizePocketChordsmithProject({sections:{A:{tracks:{guitar:{stem:"melody",role:"guitar",events:[{tick:0,note:78,sound:"campfire_acoustic"}]}}}}});
    expect(overridden.guitarEnabled).toBe(false);
  });

  it("passes valid x4 clip gain independently of the bounded note velocity", () => {
    const project=createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(referenceSource()));
    project.timeline.clips[0].transforms.gain=4;
    const events=renderTimelineEvents(project).filter(event=>event.kind === "guitar");
    const payload=buildNativeAudioStartPayload(project,events,0);
    expect(events[0]).toMatchObject({velocity:1,clipGain:4});
    expect(payload.events[0]).toMatchObject({velocity:1,clipGain:4});
    expect(events[1]).toMatchObject({velocity:0.4166666666666667,clipGain:4});
  });

  it("retains the native tempo/meter clock and natural note tails", () => {
    let project=createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(referenceSource()));
    project=createAutomationLane(project,"project.tempo",{min:40,max:240,points:[{bar:1,value:60,curve:"hold"},{bar:3,value:120,curve:"hold"}]}).project;
    project.project.meterMap=[{id:"seven-eight",bar:3,numerator:7,denominator:8,source:"manual"}];
    const events=renderTimelineEvents(project).filter(event=>event.kind === "guitar");
    for(const event of events){
      expect(event.time).toBe(timelineSecondsAtBar(project,1 + event.step / 16));
      expect(event.duration).toBe(1.5);
    }
  });

  it("exports decoded MIDI pitches, quiet picks and 27-ms ordered strums without changing old channels", async () => {
    const project=createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(referenceSource()));
    const parsed=parseStandardMidiFile(new Uint8Array(await exportProjectToMidiBlob(project).arrayBuffer()));
    const notes=parsed.notes.filter(note=>note.channel === 8).sort((a,b)=>a.startTick-b.startTick);
    expect(notes).toHaveLength(48);
    expect(notes.slice(0,4).map(note=>[note.startTick,note.pitch])).toEqual([[0,50],[16,57],[33,62],[49,66]]);
    expect(notes.find(note=>note.startTick === 480)).toMatchObject({pitch:78,velocity:42});
    expect(parsed.programChanges).toContainEqual(expect.objectContaining({channel:8,program:25}));
  });

  it("makes the performance change undoable and invalidates prepared stem cache identity", () => {
    const project=createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(referenceSource()));
    const state={...createInitialState(),undoStack:createUndoStack(project)};
    const changed=setGuitarPerformanceCommand(state,"A","grid");
    expect(getPrimaryChordsmithSource(changed.undoStack.present)?.sections.A.guitarPerformance).toBe("grid");
    expect(nativeRenderCacheSignature(changed.undoStack.present)).not.toBe(nativeRenderCacheSignature(project));
    expect(undoCommand(changed).undoStack.present).toEqual(project);
  });

  it("replaces imported Campfire notes with an audible preset while retaining metadata and Undo", () => {
    const source={...referenceSource(),guitarPerformanceA:"grid",sections:{A:{tracks:{handPlayed:{role:"GUITAR",future:{keep:true},events:[{tick:123.5,note:78,sound:"campfire_acoustic",velocity:100}]},guitarShadow:{stem:"melody",role:"guitar",events:[{tick:0,note:84,sound:"soft_pluck",velocity:60}]}}}}};
    const project=createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source));
    const state={...createInitialState(),undoStack:createUndoStack(project)};
    const changed=applyGuitarPresetCommand(state,"A","boom_chick");
    const events=renderTimelineEvents(changed.undoStack.present).filter(event=>event.kind === "guitar");
    expect(events.some(event=>event.midiNotes?.length === 4)).toBe(true);
    expect(events.some(event=>event.midiNotes?.includes(78))).toBe(false);
    const raw=changed.undoStack.present.sourceRefs[0].original as typeof source;
    expect(raw.sections.A.tracks.handPlayed.events).toEqual([]);
    expect(raw.sections.A.tracks.handPlayed.future).toEqual({keep:true});
    expect(raw.sections.A.tracks.guitarShadow).toEqual(source.sections.A.tracks.guitarShadow);
    expect(undoCommand(changed).undoStack.present).toEqual(project);
  });
});
