import {expect,test} from '@playwright/test';
async function open(page){
await page.goto('/apps/chordsmith-web/');await page.getByRole('button',{name:'Settings',exact:true}).first().click();
await page.locator('#projectBox').fill(JSON.stringify({projectVersion:17,uiMode:'advanced',key:'D',scale:'major',bpm:240,timeSig:4,resolution:4,sectionBars:{A:2},songSequence:['A'],progressionA:[0,4],chordsOn:true,bassOn:false,guitarEnabled:false,chordPlayMode:'block'}));
await page.locator('#importJsonBtn').click();await page.locator('#closeSettingsBtn').click();await page.locator('#progressionSlots .slot').nth(1).click();
await page.locator('#chordComparison summary').click();await page.locator('#chordComparisonMode').selectOption('arp_up');
}
const button=(page,action)=>page.locator(`#chordComparison [data-compare=${action}]`);
const source=page=>page.evaluate(()=>JSON.stringify(exportProject()));
test('capped history retains proposal Undo after 39 genuine edits and a same-chord no-op',async({page})=>{
await open(page);await page.evaluate(()=>{state.undoStack=[];state.chordPlayMode='strum_up';for(let i=0;i<39;i++){pushUndoState();state.bpm=100+i;}renderAll();});const before=await source(page),history=await page.evaluate(()=>state.undoStack.slice());expect(history.length).toBe(39);
await page.locator('#chordComparisonMode').selectOption('arp_up');await button(page,'prepare').click();await button(page,'apply').click();expect(await page.evaluate(()=>state.undoStack.length)).toBe(40);const current=await page.evaluate(()=>state.progression[state.selectedSlot].degree);await page.locator('#chordPalette button').nth(current).click();expect(await page.evaluate(()=>state.undoStack.length)).toBe(40);
await expect(button(page,'undo')).toBeEnabled();await button(page,'undo').click();expect(await page.evaluate(()=>state.chordPlayMode)).toBe('strum_up');expect((await source(page))===before).toBe(true);expect(await page.evaluate(()=>state.undoStack)).toEqual(history.slice(1));
await page.locator('#chordComparisonMode').selectOption('arp_up');await button(page,'prepare').click();await button(page,'apply').click();await page.locator('#bpmInput').fill('211');await page.locator('#bpmInput').dispatchEvent('change');const later=await source(page),laterHistory=await page.evaluate(()=>JSON.stringify(state.undoStack));await expect(button(page,'undo')).toBeDisabled();expect(await source(page)).toBe(later);expect(await page.evaluate(()=>JSON.stringify(state.undoStack))).toBe(laterHistory);
});
test('late preparation rejection after Stop cannot replace the stopped comparison status',async({page})=>{
await open(page);await button(page,'prepare').click();await page.evaluate(()=>{prepareChordsmithCampfirePlayback=()=>new Promise((resolve,reject)=>{window.__reject=()=>reject(new Error('old request rejected'));});});await button(page,'b').click();await page.waitForFunction(()=>!!window.__reject);await button(page,'stop').click();const stopped=await page.locator('#chordComparisonStatus').textContent();await page.evaluate(()=>window.__reject());await page.waitForFunction(()=>!transportBusy);expect(await page.evaluate(()=>state.isPlaying)).toBe(false);await expect(page.locator('#chordComparisonStatus')).toHaveText(stopped);
});
test('proposal Undo owns its history entry through a same-chord no-op and refuses unrelated edits',async({page})=>{
await open(page);const before=await source(page);await button(page,'prepare').click();await button(page,'apply').click();
// Use the actual currently selected chord button; choosing that chord still records an Undo snapshot.
const current=await page.evaluate(()=>state.progression[state.selectedSlot].degree);await page.locator('#chordPalette button').nth(current).click();
await button(page,'undo').click();expect(await page.evaluate(()=>state.chordPlayMode)).toBe('block');expect((await source(page))===before).toBe(true);
await page.locator('#chordComparisonMode').selectOption('arp_up');await button(page,'prepare').click();await button(page,'apply').click();await page.locator('#bpmInput').fill('211');await page.locator('#bpmInput').dispatchEvent('change');
const changed=await source(page),history=await page.evaluate(()=>JSON.stringify(state.undoStack));await expect(button(page,'undo')).toBeDisabled();expect(await source(page)).toBe(changed);expect(await page.evaluate(()=>JSON.stringify(state.undoStack))).toBe(history);
});
for(const section of ['B','C'])test(`stopped ${section} comparison preserves selected source and first scheduled section`,async({page})=>{
await open(page);await page.evaluate(section=>{state.sectionBars[section]=2;},section);await page.locator('#sectionChips button').filter({hasText:new RegExp(`^${section}$`)}).click();await page.locator('#progressionSlots .slot').nth(1).click();
const before=await source(page);await button(page,'prepare').click();expect(await source(page)).toBe(before);expect(await page.evaluate(()=>state.currentSection)).toBe(section);await expect(page.locator('#chordAuditionRange')).toContainText(`Section ${section}, bar 2`);
await button(page,'discard').click();expect(await source(page)).toBe(before);await page.locator('#chordComparisonMode').selectOption('arp_down');expect(await source(page)).toBe(before);
await page.evaluate(()=>{window.__sections=[];const schedule=schedulePlanStep;schedulePlanStep=(item,time)=>{window.__sections.push(chordAudition?.section);schedule(item,time);};});await button(page,'example-b').click();await page.waitForFunction(()=>window.__sections.length>0);expect(await page.evaluate(()=>window.__sections[0])).toBe(section);await button(page,'stop').click();expect(await source(page)).toBe(before);
});
test('proposal compares real scheduler modes from the same start, applies once and undoes',async({page})=>{
await open(page);const before=await source(page);const undo=await page.evaluate(()=>state.undoStack.length);
await page.evaluate(()=>{window.__compareSteps=[];const schedule=schedulePlanStep;schedulePlanStep=(item,time)=>{window.__compareSteps.push({step:item.step,mode:comparisonChordMode(),time});schedule(item,time);};});
await button(page,'prepare').click();expect(await source(page)).toBe(before);expect(await page.evaluate(()=>state.isPlaying)).toBe(false);
await button(page,'a').click();await page.waitForFunction(()=>state.isPlaying&&window.__compareSteps.length>0);
const startA=await page.evaluate(()=>window.__compareSteps[0]);await button(page,'b').click();await page.waitForFunction(()=>chordAudition?.chordMode==='arp_up'&&window.__compareSteps.some(x=>x.mode==='arp_up'));
const startB=await page.evaluate(()=>window.__compareSteps.find(x=>x.mode==='arp_up'));
expect(startB.step).toBe(startA.step);expect(startB.mode).toBe('arp_up');expect(await source(page)).toBe(before);
await button(page,'stop').click();await button(page,'apply').click();expect(await page.evaluate(()=>state.chordPlayMode)).toBe('arp_up');expect(await page.evaluate(()=>state.undoStack.length)).toBe(undo+1);
await button(page,'undo').click();expect(await source(page)).toBe(before);
});
test('Discard preserves source, undo and unfinished tempo; examples play but cannot apply',async({page})=>{
await open(page);const before=await source(page);const undo=await page.evaluate(()=>state.undoStack.length);
await page.evaluate(()=>{document.getElementById('bpmInput').value='211';});await button(page,'prepare').click();await button(page,'b').click();await page.waitForFunction(()=>state.isPlaying);await button(page,'discard').click();
expect(await source(page)).toBe(before);expect(await page.evaluate(()=>state.undoStack.length)).toBe(undo);await expect(page.locator('#bpmInput')).toHaveValue('211');
await button(page,'example-b').click();await page.waitForFunction(()=>state.isPlaying&&chordAudition.chordMode==='arp_up');await expect(button(page,'apply')).toBeDisabled();
await button(page,'stop').click();expect(await source(page)).toBe(before);expect(await page.evaluate(()=>state.isPlaying)).toBe(false);
});
for(const change of ['stop','selection','edit'])test(`late preparation after ${change} cannot resurrect a comparison`,async({page})=>{
await open(page);const before=await source(page);await button(page,'prepare').click();
await page.evaluate(()=>{prepareChordsmithCampfirePlayback=()=>new Promise(resolve=>{window.__release=()=>resolve(true);});});
await button(page,'b').click();await page.waitForFunction(()=>!!window.__release);
if(change==='stop')await button(page,'stop').click();
if(change==='selection')await page.locator('#progressionSlots .slot').first().click();
if(change==='edit')await page.locator('#chordComparisonMode').selectOption('arp_down');
const status=await page.locator('#chordComparisonStatus').textContent();
await page.evaluate(()=>window.__release());await page.waitForFunction(()=>!transportBusy);expect(await page.evaluate(()=>state.isPlaying)).toBe(false);expect(await source(page)).toBe(before);
await expect(page.locator('#chordComparisonStatus')).toHaveText(status);
});
test('record-armed guards and keyboard/touch controls preserve project',async({page})=>{
await open(page);const before=await source(page);await page.evaluate(()=>{state.drumRecordToGrid=true;});await button(page,'prepare').click();await expect(page.locator('#chordComparisonStatus')).toContainText('Stop recording');
await page.evaluate(()=>{state.drumRecordToGrid=false;});await button(page,'prepare').focus();await page.keyboard.press('Enter');await expect(button(page,'a')).toBeEnabled();
const sizes=await button(page,'example-b').evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));expect(sizes.height).toBeGreaterThanOrEqual(44);expect(sizes.width).toBeGreaterThanOrEqual(44);
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await source(page)).toBe(before);
});
test('playable chord example produces real bus PCM and Stop releases it',async({page})=>{
await open(page);const before=await source(page);
await page.evaluate(async()=>{await ensureAudio();window.__compareTap=audioCtx.createAnalyser();window.__compareTap.fftSize=2048;chordGain.connect(window.__compareTap);});
const rms=()=>page.evaluate(()=>{const samples=new Float32Array(window.__compareTap.fftSize);window.__compareTap.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length);});
await button(page,'example-b').click();await expect.poll(rms,{timeout:1500}).toBeGreaterThan(.0001);await button(page,'stop').click();await expect.poll(rms,{timeout:1500}).toBeLessThan(.00001);expect(await source(page)).toBe(before);
});
test('slow first UI update still schedules both sides from the exact passage start',async({page})=>{
await open(page);await page.evaluate(async()=>{await ensureAudio();playChord(state.availableChords[0],audioCtx.currentTime+.01,.1);});await page.waitForTimeout(300);await page.evaluate(()=>{window.__compareSteps=[];const schedule=schedulePlanStep;schedulePlanStep=(item,time)=>{window.__compareSteps.push({step:item.step,mode:comparisonChordMode(),now:audioCtx.currentTime,time});schedule(item,time);};const update=updateTransportButtonLabels;updateTransportButtonLabels=()=>{if(chordAudition&&state.isPlaying){const end=performance.now()+250;while(performance.now()<end){}}update();};});
await button(page,'prepare').click();await button(page,'a').click();await page.waitForFunction(()=>window.__compareSteps.length>0);expect(await page.evaluate(()=>window.__compareSteps[0].step)).toBe(0);
await button(page,'b').click();await page.waitForFunction(()=>window.__compareSteps.some(x=>x.mode==='arp_up'));expect(await page.evaluate(()=>window.__compareSteps.find(x=>x.mode==='arp_up').step)).toBe(0);
});
