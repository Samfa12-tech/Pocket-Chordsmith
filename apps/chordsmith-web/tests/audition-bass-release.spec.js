import {expect,test} from "@playwright/test";

async function heldBass(page,slide=false){
  page.on("pageerror",error=>console.info("held-bass-page-error",error.message));
  await page.goto("/apps/chordsmith-web/");
  await page.getByRole("button",{name:"Settings",exact:true}).first().click();
  await page.locator("#projectBox").fill(JSON.stringify({projectVersion:17,uiMode:"advanced",key:"D",scale:"major",bpm:240,timeSig:4,resolution:4,
    sectionBars:{A:4},songSequence:["A"],progressionA:[0,3,5,4],chordsOn:false,bassOn:true}));
  await page.locator("#importJsonBtn").click();await page.locator("#closeSettingsBtn").click();
  // Build the exact live held-note fixture after legacy import projection; this is a transport test.
  await page.evaluate(slide=>{
    const count=totalSteps();for(const lane of ["kick","snare","hat","bass"])state.grid[lane]=Array(count).fill(0);
    state.grid.bass[0]=1;if(slide)state.grid.bass[8]=1;
    state.bassHold=Array.from({length:count},(_,i)=>i>0&&(!slide||i!==8));
    state.bassSlide=Array.from({length:count},(_,i)=>slide&&i===8);
    state.metronomeOn=false;storeSection();renderAll();
  },slide);
  await page.locator("#progressionSlots .slot").first().click();await page.locator(".chord-audition summary").click();
  await page.locator("#chordAuditionLead").selectOption("0");await page.locator("#chordAuditionTail").selectOption("0.5");
  await page.evaluate(async()=>{
    await ensureAudio();window.__bassOsc=[];
    const create=audioCtx.createOscillator.bind(audioCtx);
    audioCtx.createOscillator=()=>{const osc=create(),entry={starts:[],stops:[],bass:false};window.__bassOsc.push(entry);
      const start=osc.start.bind(osc),stop=osc.stop.bind(osc);
      osc.start=(time)=>{entry.starts.push(time);return start(time);};osc.stop=(time)=>{entry.stops.push(time);return stop(time);};return osc;};
    const phrase=playBassPhrase,bass=playBass;
    const mark=(fn,args)=>{const index=window.__bassOsc.length;const result=fn(...args);window.__bassOsc.slice(index).forEach(x=>x.bass=true);return result;};
    playBassPhrase=(...args)=>mark(phrase,args);playBass=(...args)=>mark(bass,args);
  });
  expect(await page.evaluate(()=>({trigger:bassStepHasTrigger(getSectionData("A",true),0),hold:getSectionData("A",true).bassHold[0]}))).toEqual({trigger:true,hold:false});
  expect(await page.evaluate(()=>bassPhraseInfo(getSectionData("A",true),0).dur)).toBeGreaterThan(3);
}

for(const slide of [false,true]){
  test(`held bass${slide?" with slide":""} ends inside audition range/tail and natural completion releases voices`,async({page})=>{
    await heldBass(page,slide);const before=await page.evaluate(()=>JSON.stringify(exportProject()));
    await page.locator("#hearChordBitBtn").click();await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
    // Exercise the selected attack even if a heavily loaded runner drops the first lookahead step.
    await page.evaluate(()=>{playStep=state.transportPlan.length;schedulePlanStep(state.transportPlan[0],audioCtx.currentTime+.04);});
    await expect.poll(()=>page.evaluate(()=>window.__bassOsc.filter(x=>x.bass).length)).toBeGreaterThanOrEqual(2);
    const running=await page.evaluate(()=>({end:chordAudition.endAudioTime,stops:window.__bassOsc.filter(x=>x.bass).map(x=>x.stops[0]),plan:state.transportPlan.length,
      bpm:state.bpm,bass:state.bassOn,duration:bassPhraseInfo(getSectionData("A",true),0).dur,mode:state.bassMode}));
    console.info("held-bass-bounds",JSON.stringify(running));
    expect(running.stops.every(stop=>stop<=running.end)).toBe(true);
    await expect(page.locator("#chordAuditionStatus")).toContainText("Audition complete",{timeout:5000});
    expect(await page.evaluate(()=>JSON.stringify(exportProject()))).toBe(before);
    expect(await page.evaluate(()=>activeBassVoices.length)).toBe(0);
  });
}

test("manual Stop releases active and future scheduled bass before rapid restart",async({page})=>{
  await heldBass(page);await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
  await page.evaluate(()=>{playStep=state.transportPlan.length;schedulePlanStep(state.transportPlan[0],audioCtx.currentTime+.04);});
  await expect.poll(()=>page.evaluate(()=>window.__bassOsc.filter(x=>x.bass).length)).toBeGreaterThanOrEqual(2);
  // Use the existing real bass voice path to cover a lookahead voice whose start is still in the future.
  await page.evaluate(()=>{playBass(50,audioCtx.currentTime+.19,4);playBass(50,audioCtx.currentTime+.01,4);});
  const beforeStop=await page.evaluate(()=>({count:window.__bassOsc.filter(x=>x.bass).length,now:audioCtx.currentTime}));
  await page.locator("#stopChordBitBtn").click();
  const stopped=await page.evaluate(()=>({now:audioCtx.currentTime,entries:window.__bassOsc.filter(x=>x.bass).map(x=>({start:x.starts[0],stops:x.stops}))}));
  expect(stopped.entries.some(x=>x.start>beforeStop.now)).toBe(true);
  expect(stopped.entries.every(x=>x.stops.length>=2&&x.stops.at(-1)<=stopped.now+.09)).toBe(true);
  expect(stopped.entries.filter(x=>x.start>stopped.now).every(x=>x.stops.at(-1)<=x.start)).toBe(true);
  await page.locator("#hearChordBitBtn").click();await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
  await page.evaluate(()=>{playStep=state.transportPlan.length;schedulePlanStep(state.transportPlan[0],audioCtx.currentTime+.04);});
  const restarted=await page.evaluate((count)=>({count:window.__bassOsc.filter(x=>x.bass).length,old:window.__bassOsc.filter(x=>x.bass).slice(0,count).map(x=>x.stops)}),beforeStop.count);
  expect(restarted.count).toBeGreaterThan(beforeStop.count);
  expect(restarted.old.every(stops=>stops.length>=2)).toBe(true);
  await page.locator("#stopChordBitBtn").click();
});

test("ordinary held bass keeps its full duration and existing Stop releases it",async({page})=>{
  await heldBass(page);await page.locator("#playBtn").click();await expect(page.locator("#playBtn")).toHaveText("Pause");
  await page.evaluate(()=>{nextNoteTime=audioCtx.currentTime+10;schedulePlanStep(state.transportPlan[0],audioCtx.currentTime+.04);});
  const playing=await page.evaluate(()=>({now:audioCtx.currentTime,stops:window.__bassOsc.filter(x=>x.bass).map(x=>x.stops[0])}));
  expect(playing.stops.length).toBeGreaterThanOrEqual(2);expect(Math.max(...playing.stops)).toBeGreaterThan(playing.now+3);
  await page.locator("#stopBtn").click();
  expect(await page.evaluate(()=>activeBassVoices.length)).toBe(0);
  expect(await page.evaluate(()=>window.__bassOsc.filter(x=>x.bass).every(x=>x.stops.length>=2))).toBe(true);
});

for(const end of ["manual Stop","natural completion"]){
  test(`browser-rendered held bass is nonzero then silent after ${end}`,async({page})=>{
    await heldBass(page);
    await page.evaluate(()=>{window.__bassAnalyser=audioCtx.createAnalyser();window.__bassAnalyser.fftSize=2048;beatGain.connect(window.__bassAnalyser);});
    const rms=()=>page.evaluate(()=>{const pcm=new Float32Array(window.__bassAnalyser.fftSize);window.__bassAnalyser.getFloatTimeDomainData(pcm);return Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length);});
    await page.locator("#hearChordBitBtn").click();await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
    await page.evaluate(()=>{playStep=state.transportPlan.length;schedulePlanStep(state.transportPlan[0],audioCtx.currentTime+.04);});
    await expect.poll(rms,{timeout:800}).toBeGreaterThan(.0001);
    if(end==="manual Stop")await page.locator("#stopChordBitBtn").click();
    else await expect(page.locator("#chordAuditionStatus")).toContainText("Audition complete",{timeout:5000});
    await expect.poll(rms,{timeout:800}).toBeLessThan(.00001);
  });
}
