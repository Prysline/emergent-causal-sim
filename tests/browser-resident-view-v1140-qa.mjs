import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-resident-view-v1140-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function openStory(){
  await page.goto('http://127.0.0.1:4173/?scenario=talk-no-response',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.UI_RESIDENT_VIEW_VERSION==='11.14.0-player-resident-view-debug-inspector');
  for(let i=0;i<8;i++){
    const ready=await page.evaluate(()=>window.SimEngine.getState().agents.zhou.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome'));
    if(ready)break;
    await page.click('#step');
  }
  await page.click('.action-card[data-entity="agent:zhou"]');
  await page.waitForSelector('[data-v1140-resident-root]');
}
async function snapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),root=document.querySelector('[data-v1140-resident-root]'),resident=root?.querySelector('[data-v1140-resident-view]'),debug=root?.querySelector('[data-v1140-debug-view]');
    const activeMode=root?.querySelector('[data-v1140-mode].active')?.dataset.v1140Mode??null;
    const activeTab=root?.querySelector('[data-v1140-tab].active')?.dataset.v1140Tab??null;
    return {
      version:st.version,uiVersion:E.UI_RESIDENT_VIEW_VERSION,
      activeMode,activeTab,
      residentVisible:!!resident&&!resident.hidden&&!!resident.getClientRects().length,
      debugVisible:!!debug&&!debug.hidden&&!!debug.getClientRects().length,
      residentText:resident?.innerText??'',debugText:debug?.innerText??'',
      validator:window.SimValidator.validateState(st),
      affectLabels:{neutral:E.residentAffectLabel({valence:0,activation:0,frustration:0}),frustrated:E.residentAffectLabel({valence:-.1,activation:.2,frustration:.6})},
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false
    };
  });
}

await openStory();
let desktop=await snapshot();
assert.equal(desktop.version,'11.14.0-player-resident-view-debug-inspector');
assert.equal(desktop.uiVersion,'11.14.0-player-resident-view-debug-inspector');
assert.equal(desktop.activeMode,'resident','desktop: Agent should open Resident View by default');
assert.equal(desktop.residentVisible,true);
assert.equal(desktop.debugVisible,false);
assert.ok(desktop.residentText.includes('老周'));
assert.ok(desktop.residentText.includes('疲勞')&&desktop.residentText.includes('睡意'),'Resident View must keep fatigue and sleepNeed separate');
assert.ok(desktop.residentText.includes('心情'));
assert.ok(!desktop.residentText.includes('memoryUtilityDelta'));
assert.ok(!desktop.residentText.includes('goalCongruence'));
assert.ok(!desktop.residentText.includes('Agent・zhou'));
assert.equal(desktop.affectLabels.neutral,'平穩');
assert.equal(desktop.affectLabels.frustrated,'明顯煩躁');
assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);

const stateBefore=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
await page.click('[data-v1140-mode="debug"]');
await page.waitForFunction(()=>document.querySelector('[data-v1140-debug-view]')?.hidden===false);
let debug=await snapshot();
const stateAfterDebug=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
assert.equal(stateAfterDebug,stateBefore,'switching to Debug must not mutate simulation state');
assert.equal(debug.activeMode,'debug');
assert.equal(debug.debugVisible,true);
assert.equal(debug.residentVisible,false);
assert.ok(debug.debugText.includes('Agent・zhou'),'Debug must retain original Inspector identity');
assert.ok(debug.debugText.includes('Memory → Deliberation'),'Debug must retain advanced deliberation evidence');
assert.ok(debug.debugText.includes('Requester 社交結果記憶'),'Debug must retain requester outcome diagnostics');

await page.click('[data-v1140-mode="resident"]');
await page.click('[data-v1140-tab="memory"]');
let memoryView=await snapshot();
const stateAfterResident=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
assert.equal(stateAfterResident,stateBefore,'switching Resident tabs must not mutate simulation state');
assert.equal(memoryView.activeTab,'memory');
assert.ok(memoryView.residentText.includes('當時沒有得到回應'),'player memory should describe requester experience');
assert.ok(!memoryView.residentText.includes('故意忽略'),'player memory must not invent intentional ignoring');
assert.ok(!memoryView.residentText.includes('agency'),'player memory must not expose raw agency field');
await page.screenshot({path:`${outDir}/desktop-resident-memory.png`,fullPage:true});

await page.click('[data-v1140-tab="recent"]');
const recent=await snapshot();
assert.equal(recent.activeTab,'recent');
assert.ok(recent.residentText.includes('最近發生的事'));
assert.ok(recent.docWidth<=recent.width+1,`desktop overflow: ${recent.docWidth}>${recent.width}`);

await page.setViewportSize({width:390,height:844});
await openStory();
let mobile=await snapshot();
assert.equal(mobile.activeMode,'resident');
assert.equal(mobile.residentVisible,true);
assert.equal(mobile.inspectorActive,true,'mobile Agent selection should open inspector view');
assert.equal(mobile.navActive,true,'mobile inspector nav should be active');
assert.ok(mobile.residentText.includes('疲勞')&&mobile.residentText.includes('睡意'));
await page.click('[data-v1140-tab="memory"]');
mobile=await snapshot();
assert.ok(mobile.residentText.includes('當時沒有得到回應'));
assert.ok(!mobile.residentText.includes('故意忽略'));
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.ok(mobile.docWidth<=mobile.width+1,`mobile overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile-resident-memory.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,residentText:undefined,debugText:undefined},debug:{...debug,residentText:undefined,debugText:undefined},memoryView:{...memoryView,residentText:undefined,debugText:undefined},mobile:{...mobile,residentText:undefined,debugText:undefined},pageErrors,consoleErrors},null,2));
console.log('v11.14.0 browser resident view QA: desktop/mobile pass');
await browser.close();
