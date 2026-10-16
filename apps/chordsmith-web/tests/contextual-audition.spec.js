import { expect, test } from "@playwright/test";

async function openSong(page, campfire=false){
  await page.goto("/apps/chordsmith-web/");
  await page.getByRole("button", {name:"Settings", exact:true}).first().click();
  await page.locator("#projectBox").fill(JSON.stringify({projectVersion:17,uiMode:"advanced",key:"D",scale:"major",bpm:240,timeSig:4,resolution:4,
    sectionBars:{A:2,B:1},songSequence:["A","B"],progressionA:[0,5],progressionB:[4],chordsOn:!campfire,bassOn:false,
    guitarEnabled:campfire,guitarTone:campfire?"campfire_acoustic":"clean",guitarPerformanceA:campfire?"strum_pick":"grid"}));
  await page.locator("#importJsonBtn").click(); await page.locator("#closeSettingsBtn").click();
  await page.locator("#progressionSlots .slot").nth(1).click();
  await page.locator(".chord-audition summary").click();
  await page.locator("#chordAuditionTail").selectOption("0.5");
  await expect(page.locator("#chordAuditionRange")).toContainText("bar 2 / 1 bar before / 0.5s tail");
}

test("selected chord audition is finite, keeps source/selection/Undo and preserves unfinished input", async ({page})=>{
  await openSong(page);
  const before=await page.evaluate(()=>({source:JSON.stringify(exportProject()),slot:state.selectedSlot,section:state.currentSection,undo:state.undoStack.length}));
  expect(await page.evaluate(()=>state.isPlaying)).toBe(false);
  await page.evaluate(()=>{
    window.__scheduled=[];const schedule=schedulePlanStep;schedulePlanStep=(item,time)=>{window.__scheduled.push({step:item.step,time});schedule(item,time);};
    // An uncommitted tempo field is not an edit to the saved/playing project.
    document.getElementById("bpmInput").value="211";
  });
  await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Playing Section A, bar 2");
  await expect(page.locator("#chordAuditionStatus")).toContainText("Audition complete",{timeout:6000});
  const after=await page.evaluate(()=>({source:JSON.stringify(exportProject()),slot:state.selectedSlot,section:state.currentSection,undo:state.undoStack.length,
    playing:state.isPlaying,steps:window.__scheduled.map(x=>x.step),times:window.__scheduled.map(x=>x.time),bpmField:document.getElementById("bpmInput").value}));
  expect({source:after.source,slot:after.slot,section:after.section,undo:after.undo}).toEqual(before);
  expect(after.playing).toBe(false);expect(after.bpmField).toBe("211");
  expect(after.steps[0]).toBe(0);expect(after.steps.every(step=>step>=0&&step<32)).toBe(true);
  expect(new Set(after.steps).size).toBe(after.steps.length);
  expect(after.times.every((time,index)=>index===0||time>after.times[index-1])).toBe(true);
});

for(const change of ["Stop","selection","edit"]){
  test(`late preparation after ${change} cannot start a stale chord audition`,async({page})=>{
    await openSong(page);
    await page.evaluate(()=>{prepareChordsmithCampfirePlayback=()=>new Promise(resolve=>{window.__releaseAudition=()=>resolve(true);});});
    await page.locator("#hearChordBitBtn").click();
    await page.waitForFunction(()=>!!window.__releaseAudition);
    if(change==="Stop")await page.locator("#stopChordBitBtn").click();
    if(change==="selection")await page.locator("#progressionSlots .slot").first().click();
    if(change==="edit")await page.locator("#chordPalette .chord-btn").first().click();
    const expected=await page.evaluate(()=>({source:JSON.stringify(exportProject()),slot:state.selectedSlot,section:state.currentSection,undo:state.undoStack.length}));
    await page.evaluate(()=>window.__releaseAudition());
    await expect(page.locator("#hearChordBitBtn")).toBeEnabled();
    expect(await page.evaluate(()=>({source:JSON.stringify(exportProject()),slot:state.selectedSlot,section:state.currentSection,undo:state.undoStack.length}))).toEqual(expected);
    expect(await page.evaluate(()=>({playing:state.isPlaying,context:!!chordAudition}))).toEqual({playing:false,context:false});
  });
}

test("changing section during audition keeps the newly selected section",async({page})=>{
  await openSong(page);await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
  await page.locator("#sectionChips button").filter({hasText:/^B$/}).click();
  expect(await page.evaluate(()=>({section:state.currentSection,playing:state.isPlaying}))).toEqual({section:"B",playing:false});
  await expect(page.locator("#chordAuditionRange")).toContainText("Select an active chord bar");
  await expect(page.locator("#hearChordBitBtn")).toBeDisabled();
  await page.locator("#progressionSlots .slot").first().click();
  await expect(page.locator("#chordAuditionRange")).toContainText("Section B, bar 1");
});

test("an overdue audition stops on the audio clock without wrapping its finite plan",async({page})=>{
  await openSong(page);await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
  const result=await page.evaluate(()=>{
    nextNoteTime=audioCtx.currentTime-20;playStep=0;fastForwardSchedulerPast(audioCtx.currentTime);
    const bounded=playStep===state.transportPlan.length;
    chordAudition.endAudioTime=audioCtx.currentTime-0.01;scheduler();
    return{bounded,playing:state.isPlaying,context:!!chordAudition};
  });
  expect(result).toEqual({bounded:true,playing:false,context:false});
});

test("passage settings cancel an audition without editing the song or Undo",async({page})=>{
  await openSong(page);
  const before=await page.evaluate(()=>({source:JSON.stringify(exportProject()),undo:state.undoStack.length}));
  await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
  await page.locator("#chordAuditionLead").selectOption("2");
  expect(await page.evaluate(()=>({source:JSON.stringify(exportProject()),undo:state.undoStack.length}))).toEqual(before);
  expect(await page.evaluate(()=>state.isPlaying)).toBe(false);
  await expect(page.locator("#hearChordBitBtn")).toBeEnabled();
});

test("preparation failure gives the actionable fallback without applying a change",async({page})=>{
  await openSong(page);
  const before=await page.evaluate(()=>JSON.stringify(exportProject()));
  await page.evaluate(()=>{prepareChordsmithCampfirePlayback=async()=>{throw new Error("Use Core WAV export for this mixed guitar arrangement.");};});
  await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Use Core WAV export");
  expect(await page.evaluate(()=>JSON.stringify(exportProject()))).toBe(before);
  expect(await page.evaluate(()=>state.isPlaying)).toBe(false);
});

test("a preparation error after Stop cannot overwrite the current stopped status",async({page})=>{
  await openSong(page);
  await page.evaluate(()=>{prepareChordsmithCampfirePlayback=()=>new Promise((_,reject)=>{window.__rejectAudition=()=>reject(new Error("Stale preparation error"));});});
  await page.locator("#hearChordBitBtn").click();await page.waitForFunction(()=>!!window.__rejectAudition);
  await page.locator("#stopChordBitBtn").click();await page.evaluate(()=>window.__rejectAudition());
  await expect(page.locator("#hearChordBitBtn")).toBeEnabled();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Stopped");
  await expect(page.locator("#statusText")).not.toContainText("Stale preparation error");
});

test("Campfire audition reuses warm prepared PCM and leaves ordinary section Play looping",async({page})=>{
  await openSong(page,true);
  await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Playing",{timeout:20000});
  const cold=await page.evaluate(()=>getChordsmithCampfireDiagnostics());
  await page.locator("#stopChordBitBtn").click();
  await page.locator("#hearChordBitBtn").click();
  await expect(page.locator("#chordAuditionStatus")).toContainText("Playing");
  const warm=await page.evaluate(()=>getChordsmithCampfireDiagnostics());
  expect(warm.preparations).toBe(cold.preparations);expect(warm.reuses).toBeGreaterThan(cold.reuses);
  await page.locator("#stopChordBitBtn").click();await page.locator("#playBtn").click();
  await expect(page.locator("#playBtn")).toHaveText("Pause");
  await page.waitForTimeout(2300);
  expect(await page.evaluate(()=>({playing:state.isPlaying,mode:state.playbackMode}))).toEqual({playing:true,mode:"section"});
  await page.locator("#stopBtn").click();
});

test("context and Stop remain reachable with touch-sized controls",async({page},testInfo)=>{
  await openSong(page);
  for(const id of ["hearChordBitBtn","stopChordBitBtn","chordAuditionLead","chordAuditionTail"]){
    const item=page.locator(`#${id}`);await item.scrollIntoViewIfNeeded();await expect(item).toBeInViewport();
    const box=await item.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.locator(".chord-audition").screenshot({path:testInfo.outputPath("selected-chord-audition.png")});
});
