import {expect,test} from "@playwright/test";

async function requireLiveBrowserAudio(page){
  test.skip(!(await page.evaluate(()=>typeof(window.AudioContext||window.webkitAudioContext)==="function")),"This browser binary has no real Web Audio context; live Restart is not tested.");
}

async function openDeck(page,campfire=false){
  await page.goto("/apps/pocket-dj/");
  await page.locator("#importText").fill(JSON.stringify({projectVersion:17,key:"D",scale:"major",bpm:240,timeSig:4,resolution:4,
    sectionBars:{A:3,B:1},songSequence:["A","B"],progressionA:[0,3,4],progressionB:[5],chordsOn:!campfire,
    guitarEnabled:campfire,guitarTone:campfire?"campfire_acoustic":"clean",guitarPerformanceA:campfire?"strum_pick":"grid",future:{keep:true}}));
  await page.locator("#importBtn").click();
  await page.locator("#djAuditionControls summary").click();
  await page.locator("#djAuditionBar").selectOption({value:"2"});
  await page.locator("#djAuditionTail").selectOption("0.5");
  await expect(page.locator("#djAuditionRange")).toContainText("Section A, bar 3 / 1 bar before / 0.5s tail");
}

test("finite selected DJ passage keeps saved deck, queued launch, sequence and non-default FX intact",async({page})=>{
  await openDeck(page);
  await page.evaluate(()=>{
    session.performance.fx.echo=.43;session.performance.stemVolumes.bass=.39;
    session.performance.queuedSection="B";session.performance.sequencePlaying=true;
    autosave();window.__saved=localStorage.getItem(LOCAL_KEY);window.__deck=JSON.stringify(exportPocketDjSession(session));
    window.__steps=[];const original=scheduleStep;scheduleStep=(section,step,time)=>{window.__steps.push({section:section.id,step,time});original(section,step,time);};
  });
  expect(await page.evaluate(()=>state.playing)).toBe(false);
  await page.locator("#hearDjBitBtn").click();
  await expect(page.locator("#djAuditionStatus")).toContainText("Playing Section A, bar 3");
  await expect(page.locator("#djAuditionStatus")).toContainText("Audition complete",{timeout:7000});
  const result=await page.evaluate(()=>({same:JSON.stringify(exportPocketDjSession(session))===window.__deck,
    saved:localStorage.getItem(LOCAL_KEY)===window.__saved,playing:state.playing,voices:djScheduledVoices.size,steps:window.__steps}));
  expect(result.same).toBe(true);expect(result.saved).toBe(true);expect(result.playing).toBe(false);expect(result.voices).toBe(0);
  expect(result.steps[0].step).toBe(16);expect(result.steps.every(x=>x.section==="A"&&x.step>=16&&x.step<48)).toBe(true);
  expect(new Set(result.steps.map(x=>x.step)).size).toBe(result.steps.length);
});

for(const action of ["Stop","bar","mix","new deck"]){
  test(`late preparation after ${action} cannot start a stale DJ audition`,async({page})=>{
    await openDeck(page);
    await page.evaluate(()=>{preparePocketDjCampfire=()=>new Promise(resolve=>{window.__release=()=>resolve(true);});});
    await page.locator("#hearDjBitBtn").click();await page.waitForFunction(()=>!!window.__release);
    if(action==="Stop")await page.locator("#stopDjBitBtn").click();
    if(action==="bar")await page.locator("#djAuditionBar").selectOption({value:"1"});
    if(action==="mix")await page.locator('[data-stem-volume="bass"]').evaluate(node=>{node.value="0.3";node.dispatchEvent(new Event("input",{bubbles:true}));});
    if(action==="new deck")await page.evaluate(()=>loadDemo());
    const source=await page.evaluate(()=>JSON.stringify(exportPocketDjSession(session)));
    await page.evaluate(()=>window.__release());
    await expect(page.locator("#hearDjBitBtn")).toBeEnabled();
    expect(await page.evaluate(()=>({playing:state.playing,context:!!djAudition,source:JSON.stringify(exportPocketDjSession(session))}))).toEqual({playing:false,context:false,source});
  });
}

test("Stop retains the actual mixer control and its first following edit",async({page})=>{
  await openDeck(page);await page.locator("#hearDjBitBtn").click();
  await expect(page.locator("#djAuditionStatus")).toContainText("Playing");
  await page.evaluate(()=>{window.__slider=document.querySelector('[data-stem-volume="bass"]');});
  const slider=page.locator('[data-stem-volume="bass"]');
  const initial=await slider.inputValue();await slider.focus();await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(()=>({same:window.__slider===document.querySelector('[data-stem-volume="bass"]'),value:session.performance.stemVolumes.bass,playing:state.playing}))).toEqual({same:true,value:Number(initial)-.01,playing:false});
  await expect(slider).toBeFocused();
});

test("audition Stop cancels real scheduled voices and normal Play still loops",async({page})=>{
  await openDeck(page);await page.locator("#hearDjBitBtn").click();
  await expect.poll(()=>page.evaluate(()=>djScheduledVoices.size)).toBeGreaterThan(0);
  await page.locator("#stopDjBitBtn").click();
  expect(await page.evaluate(()=>({voices:djScheduledVoices.size,playing:state.playing}))).toEqual({voices:0,playing:false});
  await page.locator("#playBtn").click();await expect.poll(()=>page.evaluate(()=>state.playing)).toBe(true);
  await page.waitForTimeout(3400);
  expect(await page.evaluate(()=>({playing:state.playing,context:!!djAudition}))).toEqual({playing:true,context:false});
  await page.locator("#stopBtn").click();
});

test("Campfire audition reuses prepared PCM without changing the imported source",async({page})=>{
  await openDeck(page,true);const source=await page.evaluate(()=>JSON.stringify(session.source));
  await page.locator("#hearDjBitBtn").click();await expect(page.locator("#djAuditionStatus")).toContainText("Playing",{timeout:20000});
  await page.evaluate(()=>{window.__bank=pocketDjCampfireBank;window.__buffers=0;const create=audioCtx.createBuffer.bind(audioCtx);audioCtx.createBuffer=(...args)=>{window.__buffers++;return create(...args);};});
  await page.locator("#stopDjBitBtn").click();await page.locator("#hearDjBitBtn").click();
  await expect(page.locator("#djAuditionStatus")).toContainText("Playing");
  expect(await page.evaluate(()=>({same:window.__bank===pocketDjCampfireBank,buffers:window.__buffers,source:JSON.stringify(session.source)}))).toEqual({same:true,buffers:0,source});
  await page.locator("#stopDjBitBtn").click();
});

test("active build fallback is actionable and leaves performance running",async({page})=>{
  await openDeck(page);await page.locator("#buildBtn").click();
  const before=await page.evaluate(()=>({build:session.performance.buildActive,macro:macroToken}));
  await page.locator("#hearDjBitBtn").click();
  await expect(page.locator("#djAuditionStatus")).toContainText("Finish or reset the active build/drop/fill");
  expect(await page.evaluate(()=>({build:session.performance.buildActive,macro:macroToken}))).toEqual(before);
});

test("late preparation failure after Stop does not replace the stopped result",async({page})=>{
  await openDeck(page);await page.evaluate(()=>{preparePocketDjCampfire=()=>new Promise((_,reject)=>{window.__reject=()=>reject(new Error("Obsolete failure"));});});
  await page.locator("#hearDjBitBtn").click();await page.waitForFunction(()=>!!window.__reject);
  await page.locator("#stopDjBitBtn").click();await page.evaluate(()=>window.__reject());
  await expect(page.locator("#djAuditionStatus")).toContainText("Stopped");
  await expect(page.locator("#statusText")).not.toContainText("Obsolete failure");
});

for(const id of ["stopBtn","playBtn"]){
  test(`existing ${id} stops audition once without resetting FX or restarting`,async({page})=>{
    await openDeck(page);await page.evaluate(()=>{session.performance.fx.echo=.43;window.__before=JSON.stringify(exportPocketDjSession(session));});
    await page.locator("#hearDjBitBtn").click();await expect(page.locator("#djAuditionStatus")).toContainText("Playing");
    await page.locator(`#${id}`).click();
    expect(await page.evaluate(()=>({same:JSON.stringify(exportPocketDjSession(session))===window.__before,playing:state.playing,context:!!djAudition}))).toEqual({same:true,playing:false,context:false});
    await page.waitForTimeout(250);expect(await page.evaluate(()=>state.playing)).toBe(false);
  });
}

for(const outcome of ["success","error"]){
  test(`cold Restart invalidates audition preparation and ignores late ${outcome}`,async({page})=>{
    await openDeck(page);
    await requireLiveBrowserAudio(page);
    await page.evaluate(outcome=>{
      session.performance.fx.echo=.43;window.__restartSource=JSON.stringify(exportPocketDjSession(session));
      preparePocketDjCampfire=()=>new Promise((resolve,reject)=>{window.__completeRestart=()=>outcome==="success"?resolve(true):reject(new Error("Obsolete audition error"));}).finally(()=>{window.__restartSettled=true;});
    },outcome);
    await page.locator("#hearDjBitBtn").click();await page.waitForFunction(()=>!!window.__completeRestart);
    const beforeRequest=await page.evaluate(()=>pocketDjPlaybackRequest);
    await page.locator("#restartBtn").click();
    const restarted=await page.evaluate(()=>({request:pocketDjPlaybackRequest,context:!!djAudition,playing:state.playing,status:el.statusText.textContent}));
    await page.evaluate(()=>window.__completeRestart());await page.waitForFunction(()=>window.__restartSettled===true);
    await page.waitForTimeout(100);
    const completed=await page.evaluate(()=>({playing:state.playing,context:!!djAudition,status:el.statusText.textContent,
      same:JSON.stringify(exportPocketDjSession(session))===window.__restartSource}));
    console.info("cold-restart-result",JSON.stringify({outcome,beforeRequest,restarted,completed}));
    await page.evaluate(()=>stopPlayback());
    expect(restarted.request).toBeGreaterThan(beforeRequest);expect(restarted.context).toBe(false);expect(restarted.playing).toBe(false);
    expect(completed).toEqual({playing:false,context:false,status:"Restart ready",same:true});
  });
}

test("active audition Restart explicitly starts ordinary section playback at step zero",async({page})=>{
  await openDeck(page);await requireLiveBrowserAudio(page);
  await page.locator("#hearDjBitBtn").click();await expect(page.locator("#djAuditionStatus")).toContainText("Playing");
  await page.evaluate(()=>{
    window.__restartFx=JSON.stringify(session.performance.fx);window.__restartSource=JSON.stringify(session.source);
    window.__oldRestartRequest=pocketDjPlaybackRequest;window.__restartSteps=[];const original=scheduleStep;
    scheduleStep=(section,step,time)=>{window.__restartSteps.push({step,request:pocketDjPlaybackRequest});original(section,step,time);};
  });
  await page.locator("#restartBtn").click();
  await expect.poll(()=>page.evaluate(()=>window.__restartSteps.filter(x=>x.request>window.__oldRestartRequest).length)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>({playing:state.playing,context:!!djAudition,
    first:window.__restartSteps.find(x=>x.request===pocketDjPlaybackRequest)?.step,
    sameFx:JSON.stringify(session.performance.fx)===window.__restartFx,sameSource:JSON.stringify(session.source)===window.__restartSource}))).toEqual({playing:true,context:false,first:0,sameFx:true,sameSource:true});
  await page.locator("#stopBtn").click();
});

for(const outcome of ["success","error"]){
  test(`stopped ordinary Restart also cancels pending Play with late ${outcome}`,async({page})=>{
    await openDeck(page);
    await requireLiveBrowserAudio(page);
    await page.evaluate(outcome=>{
      preparePocketDjCampfire=()=>new Promise((resolve,reject)=>{window.__completeOrdinary=()=>outcome==="success"?resolve(true):reject(new Error("Obsolete ordinary error"));}).finally(()=>{window.__ordinarySettled=true;});
    },outcome);
    await page.locator("#playBtn").click();await page.waitForFunction(()=>!!window.__completeOrdinary);
    await page.locator("#restartBtn").click();await page.evaluate(()=>window.__completeOrdinary());
    await page.waitForFunction(()=>window.__ordinarySettled===true);await page.waitForTimeout(100);
    expect(await page.evaluate(()=>({playing:state.playing,context:!!djAudition,status:el.statusText.textContent}))).toEqual({playing:false,context:false,status:"Restart ready"});
  });
}

test("narrow context controls remain reachable and explain their limits",async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:740});await openDeck(page);
  for(const id of ["hearDjBitBtn","stopDjBitBtn","djAuditionBar","djAuditionLead","djAuditionTail"]){
    const control=page.locator(`#${id}`);await control.scrollIntoViewIfNeeded();await expect(control).toBeInViewport();
    expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.locator("#djAuditionControls")).toContainText("not an automatic finding");
  await page.locator("#djAuditionControls").screenshot({path:testInfo.outputPath("dj-context-controls.png")});
});

for(const ending of ["manual Stop","natural completion"]){
  test(`held DJ bass is bounded and browser bus becomes silent after ${ending}`,async({page})=>{
    await openDeck(page);
    await page.locator("#djAuditionBar").selectOption({value:"0"});await page.locator("#djAuditionLead").selectOption("0");
    await page.evaluate(async()=>{
      session.sections.A.bars=4;
      const section=getSection("A"),count=sectionStepCount(section);section.grid.bass=Array(count).fill(0);section.grid.bass[0]=2;
      section.bassHold=Array.from({length:count},(_,i)=>i>0);section.bassSlide=Array(count).fill(false);
      for(const stem of STEMS)session.performance.stemMutes[stem]=stem!=="bass";
      await ensureAudio();window.__bassTap=audioCtx.createAnalyser();window.__bassTap.fftSize=2048;stemGains.bass.connect(window.__bassTap);
      window.__source=JSON.stringify(exportPocketDjSession(session));
    });
    const rms=()=>page.evaluate(()=>{const pcm=new Float32Array(window.__bassTap.fftSize);window.__bassTap.getFloatTimeDomainData(pcm);return Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length);});
    await page.locator("#hearDjBitBtn").click();await expect(page.locator("#djAuditionStatus")).toContainText("Playing");
    await page.evaluate(()=>{state.currentStepForSchedule=djAudition.end;scheduleStep(getSection("A"),0,audioCtx.currentTime+.04);});
    await expect.poll(rms,{timeout:800}).toBeGreaterThan(.0001);
    if(ending==="manual Stop")await page.locator("#stopDjBitBtn").click();
    else await expect(page.locator("#djAuditionStatus")).toContainText("Audition complete",{timeout:5000});
    await expect.poll(rms,{timeout:800}).toBeLessThan(.00001);
    expect(await page.evaluate(()=>({same:JSON.stringify(exportPocketDjSession(session))===window.__source,voices:djScheduledVoices.size}))).toEqual({same:true,voices:0});
  });
}
