import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-social-outcome-memory-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function openStory(){
  await page.goto('http://127.0.0.1:4173/?scenario=talk-no-response',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION==='11.13.5-requester-social-outcome-memory');
  for(let i=0;i<8;i++){
    const ready=await page.evaluate(()=>window.SimEngine.getState().agents.zhou.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome'));
    if(ready)break;
    await page.click('#step');
  }
  await page.evaluate(()=>document.querySelector('[data-entity="agent:zhou"]')?.click());
  await page.waitForSelector('[data-v1135-social-outcome-memory]');
}
async function snapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),a=st.agents.zhou;
    const memory=a.episodicMemories.find(m=>m.episodeKind==='privateSocialOutcome');
    const response=memory?st.events.find(e=>e.data?.responseToBid===memory.experienced?.bidId):null;
    const section=document.querySelector('[data-v1135-social-outcome-memory]');
    return {
      version:st.version,schemaVersion:E.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION,
      memory:memory?{id:memory.id,sourceEventId:memory.sourceEventId,episodeKind:memory.episodeKind,hasObserved:Object.prototype.hasOwnProperty.call(memory,'observed'),experienced:memory.experienced,appraisal:memory.appraisal}:null,
      responseAction:response?.data?.action??null,
      targetAssociation:E.targetAssociation(st,a,'zhen'),
      affectSource:a.affect?.source?.memoryId??null,
      validator:window.SimValidator.validateState(st),
      sectionVisible:!!section?.getClientRects().length,
      inspectorText:document.getElementById('inspector')?.innerText??'',
      timelineText:document.getElementById('timeline')?.innerText??'',
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false
    };
  });
}

await openStory();
let desktop=await snapshot();
assert.equal(desktop.version,'11.13.5-requester-social-outcome-memory');
assert.equal(desktop.schemaVersion,'11.13.5-requester-social-outcome-memory');
assert.ok(desktop.memory,'desktop: requester private outcome memory missing');
assert.equal(desktop.memory.episodeKind,'privateSocialOutcome');
assert.equal(desktop.memory.hasObserved,false,'desktop: private outcome must not fake observed world-event projection');
assert.equal(desktop.memory.experienced.counterpartId,'zhen');
assert.equal(desktop.memory.experienced.contextKind,'highCommitment');
assert.equal(desktop.memory.appraisal.agency.kind,'unknown');
assert.equal(desktop.responseAction,null,'desktop: no-response must remain absence of responder response event');
assert.ok(desktop.targetAssociation.memoryUtilityDelta<0,'desktop: private outcome should affect existing target-aware deliberation');
assert.equal(desktop.affectSource,desktop.memory.id,'desktop: appraisal should use existing Affect pipeline');
assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);
assert.equal(desktop.sectionVisible,true);
assert.ok(desktop.inspectorText.includes('Requester 社交結果記憶'));
assert.ok(desktop.inspectorText.includes('沒有得到回應'));
assert.ok(desktop.inspectorText.includes('agency unknown'));
assert.ok(!desktop.inspectorText.includes('故意忽略'));
assert.ok(desktop.docWidth<=desktop.width+1,`desktop overflow: ${desktop.docWidth}>${desktop.width}`);
assert.ok(desktop.bodyWidth<=desktop.width+1,`desktop body overflow: ${desktop.bodyWidth}>${desktop.width}`);
await page.screenshot({path:`${outDir}/desktop.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await openStory();
let mobile=await snapshot();
assert.ok(mobile.memory,'mobile: requester private outcome memory missing');
assert.equal(mobile.memory.appraisal.agency.kind,'unknown');
assert.equal(mobile.responseAction,null);
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.equal(mobile.sectionVisible,true);
assert.equal(mobile.inspectorActive,true,'mobile requester selection should open Inspector');
assert.equal(mobile.navActive,true,'mobile Inspector nav should be active');
assert.ok(mobile.inspectorText.includes('Requester 社交結果記憶'));
assert.ok(mobile.docWidth<=mobile.width+1,`mobile overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,inspectorText:undefined,timelineText:undefined},mobile:{...mobile,inspectorText:undefined,timelineText:undefined},pageErrors,consoleErrors},null,2));
console.log('v11.13.5 browser social outcome memory QA: 2/2 pass');
await browser.close();
