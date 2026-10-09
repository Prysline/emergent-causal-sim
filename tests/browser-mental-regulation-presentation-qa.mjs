import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const CURRENT_VERSION='11.53.0-mental-regulation-generation';
const outDir='artifacts/browser-mental-regulation-presentation-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(version=>window.SimRelease?.VERSION===version&&window.SimUI?.PRESENTATION_VERSION===version&&window.SimEngine?.UI_RESIDENT_VIEW_VERSION===version&&window.SimEngine?.UI_ENTITY_READABLE_VERSION===version,CURRENT_VERSION);

const canonical=await page.evaluate(()=>{
  const st=window.SimEngine.getState(),a=st.agents.zhen;
  return {stimulation:a.needs.stimulation,relaxation:a.needs.relaxation,hasEngagement:Object.prototype.hasOwnProperty.call(a.needs,'engagement'),book:st.objects?.bookA||null};
});
assert.equal(canonical.hasEngagement,false,'retired engagement must not remain as a parallel persistent Need');
assert.equal(canonical.stimulation,0);assert.equal(canonical.relaxation,0);
assert.ok(canonical.book,'bookA must exist in canonical state.objects');

await page.click('[data-entity="agent:zhen"]');
await page.waitForSelector('[data-v1140-resident-root]');
let resident=await page.evaluate(()=>({
  text:document.querySelector('[data-v1140-resident-view]')?.innerText||'',
  stimulation:document.querySelector('[data-v1140-resident-view] [data-need="stimulation"]')?.innerText||'',
  relaxation:document.querySelector('[data-v1140-resident-view] [data-need="relaxation"]')?.innerText||''
}));
assert.match(resident.stimulation,/刺激需求/,'Resident View must project canonical stimulation through the shared presentation label');
assert.match(resident.relaxation,/放鬆需求/,'Resident View must project canonical relaxation through the shared presentation label');

await page.evaluate(()=>window.SimEngine.tick());
await page.waitForFunction(()=>window.SimEngine.getState().agents.zhen.needs.stimulation>0);
resident=await page.evaluate(()=>({
  stimulation:document.querySelector('[data-v1140-resident-view] [data-need="stimulation"]')?.innerText||'',
  canonical:window.SimEngine.getState().agents.zhen.needs.stimulation
}));
assert.ok(resident.canonical>0,'production awake runtime must generate canonical Stimulation pressure after execution');
assert.match(resident.stimulation,/刺激需求/,'Resident View must continue projecting the changed canonical Need');

await page.click('[data-v1140-mode="debug"]');
const debugText=await page.locator('[data-v1140-debug-view]').innerText();
assert.match(debugText,/刺激需求/,'Debug Inspector must use the shared Chinese stimulation label');
assert.match(debugText,/放鬆需求/,'Debug Inspector must use the shared Chinese relaxation label');
assert.ok(!/\bstimulation\s+[\d.]+\b/.test(debugText),'Debug Inspector must not expose raw stimulation identifier as the Need label');

await page.evaluate(()=>window.SimUI.setCurrentZ(0));
const marker=page.locator('[data-entity="object:bookA"]');
await marker.waitFor({state:'visible'});
assert.equal(await marker.getAttribute('title'),canonical.book.name,'ordinary object marker must project canonical object metadata');
await marker.click();
await page.waitForSelector('[data-v1141-entity-root]');
const readableObjectText=await page.locator('[data-v1141-entity-readable]').innerText();
assert.ok(readableObjectText.includes(canonical.book.name),'selecting ordinary object must expose its player-readable canonical projection');
assert.match(readableObjectText,/閱讀/,'ordinary object readable projection must expose the canonical read affordance');
await page.click('[data-v1141-entity-mode="debug"]');
const debugObjectText=await page.locator('[data-v1141-entity-debug]').innerText();
assert.match(debugObjectText,/Object・bookA/,'Debug Inspector must expose the canonical ordinary-object type and id');
assert.match(debugObjectText,/閱讀/,'Debug Inspector must expose the canonical ordinary-object affordance');

const validation=await page.evaluate(()=>window.SimValidator.validateState(window.SimEngine.getState()));
assert.equal(validation.issueCount,0,validation.issues.map(x=>`${x.code}: ${x.message}`).join(' | '));
assert.deepEqual(consoleErrors,[],'browser console errors: '+consoleErrors.join(' | '));
assert.deepEqual(pageErrors,[],'browser page errors: '+pageErrors.join(' | '));
await page.screenshot({path:`${outDir}/mental-regulation-presentation.png`,fullPage:true});
await browser.close();
console.log('browser-mental-regulation-presentation-qa: ok');
