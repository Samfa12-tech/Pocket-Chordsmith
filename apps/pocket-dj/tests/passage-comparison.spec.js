import {expect,test} from '@playwright/test';
async function open(page){await page.goto('/apps/pocket-dj/');await page.locator('#importText').fill(JSON.stringify({projectVersion:17,key:'D',scale:'major',bpm:240,timeSig:4,resolution:4,sectionBars:{A:2},songSequence:['A'],progressionA:[0,4],bassOn:true,chordsOn:true}));await page.locator('#importBtn').click();await page.waitForFunction(()=>session?.deck);await page.locator('#djComparison summary').click();}
const button=(page,action)=>page.locator(`#djComparison [data-compare=${action}]`);
const source=page=>page.evaluate(()=>JSON.stringify(exportPocketDjSession(session)));
test('A/B uses actual mixer override and same passage; Apply and one Undo preserve other settings',async({page})=>{
await open(page);const before=await source(page);await page.locator('#djComparisonBass').fill('35');await button(page,'prepare').click();expect(await page.evaluate(()=>state.playing)).toBe(false);
await button(page,'a').click();await page.waitForFunction(()=>state.playing);const a=await page.evaluate(()=>({start:djAudition.start,level:comparisonBassVolume(session.performance.stemVolumes.bass)}));
await button(page,'b').click();await page.waitForFunction(()=>state.playing&&djAudition.compareBass===.35);const b=await page.evaluate(()=>({start:djAudition.start,level:comparisonBassVolume(session.performance.stemVolumes.bass),gain:effectiveStemGain('bass')}));
expect(b.start).toBe(a.start);expect(b.level).toBe(.35);expect(b.gain).toBeLessThanOrEqual(.35);expect(await source(page)).toBe(before);
await button(page,'stop').click();await button(page,'apply').click();expect(await page.evaluate(()=>session.performance.stemVolumes.bass)).toBe(.35);
await button(page,'undo').click();expect(await source(page)).toBe(before);
});
test('examples are audible requests without source/save edits and Discard restores ordinary mixer',async({page})=>{
await open(page);const before=await source(page);const saved=await page.evaluate(()=>localStorage.getItem(LOCAL_KEY));
await button(page,'example-b').click();await page.waitForFunction(()=>state.playing&&djAudition.compareBass!==null);await expect(button(page,'apply')).toBeDisabled();
expect(await page.evaluate(()=>djAudition.compareBass)).toBe(await page.evaluate(()=>session.performance.stemVolumes.bass*.5));await button(page,'discard').click();
expect(await source(page)).toBe(before);expect(await page.evaluate(()=>localStorage.getItem(LOCAL_KEY))).toBe(saved);expect(await page.evaluate(()=>comparisonBassVolume(.8))).toBe(.8);
});
for(const change of ['stop','range','source'])test(`cold comparison is cancelled by ${change}`,async({page})=>{
await open(page);await button(page,'prepare').click();await page.evaluate(()=>{preparePocketDjCampfire=()=>new Promise(resolve=>{window.__release=()=>resolve(true);});});
await button(page,'b').click();await page.waitForFunction(()=>!!window.__release);
if(change==='stop')await button(page,'stop').click();
if(change==='range'){await page.locator('#djAuditionControls details').filter({has:page.locator('#djAuditionBar')}).locator('summary').click();await page.locator('#djAuditionBar').selectOption('1');}
if(change==='source')await page.locator('#djComparisonBass').fill('20');
const before=await source(page);await page.evaluate(()=>window.__release());await page.waitForTimeout(100);expect(await page.evaluate(()=>state.playing)).toBe(false);expect(await source(page)).toBe(before);
});
test('keyboard, narrow controls and active build guard',async({page})=>{
await open(page);await page.evaluate(()=>{session.performance.buildActive=true;});await button(page,'prepare').click();await expect(page.locator('#djComparisonStatus')).toContainText('build/drop/fill');
await page.evaluate(()=>{session.performance.buildActive=false;});await button(page,'prepare').focus();await page.keyboard.press('Enter');await expect(button(page,'b')).toBeEnabled();
const rect=await button(page,'example-b').evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));expect(rect.height).toBeGreaterThanOrEqual(44);expect(rect.width).toBeGreaterThanOrEqual(44);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('playable bass example produces real bus PCM and Stop releases it',async({page})=>{
await open(page);await page.evaluate(async()=>{const section=getSection('A'),count=sectionStepCount(section);section.grid.bass=Array.from({length:count},(_,i)=>i%4===0?2:0);section.bassHold=Array(count).fill(false);section.bassSlide=Array(count).fill(false);await ensureAudio();window.__compareTap=audioCtx.createAnalyser();window.__compareTap.fftSize=2048;stemGains.bass.connect(window.__compareTap);});
const before=await source(page);const rms=()=>page.evaluate(()=>{const samples=new Float32Array(window.__compareTap.fftSize);window.__compareTap.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length);});
await button(page,'example-b').click();await expect.poll(rms,{timeout:1500}).toBeGreaterThan(.0001);await button(page,'stop').click();await expect.poll(rms,{timeout:1500}).toBeLessThan(.00001);expect(await source(page)).toBe(before);
});
