import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-appraisal-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[];const pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function seedPetScenario(){
  await page.evaluate(()=>{
    const E=window.SimEngine;E.reset(1311);const st=E.getState();
    st.agents.zhou.position={x:5,y:5};
    st.agents.orange.position={x:5,y:6};
    st.agents.zhen.position={x:7,y:5};
    st.agents.orange.needs.social=90;
    const eventId=E.addEvent('老周摸了橘子。','normal',[],{actor:'zhou',target:'orange',action:'petCat',position:'5,6',debugSecret:'browser-hidden'});
    window.__appraisalQaEventId=eventId;
    document.querySelector('[data-entity="agent:orange"]')?.click();
  });
  await page.waitForSelector('[data-v1130-memory]');
  await page.waitForSelector('[data-v1131-appraisal]');
}

async function stableState(){
  return page.evaluate(()=>{
    const st=window.SimEngine.getState(),eventId=window.__appraisalQaEventId;
    const memory=st.agents.orange.episodicMemories.find(m=>m.sourceEventId===eventId);
    const memorySection=document.querySelector('[data-v1130-memory]');
    const appraisalSection=document.querySelector('[data-v1131-appraisal]');
    return {
      eventId,
      memoryAction:memory?.observed?.action??null,
      memoryActorId:memory?.observed?.actorId??null,
      memoryTargetId:memory?.observed?.targetId??null,
      appraisalRuleId:memory?.appraisal?.ruleId??null,
      appraisalRelevance:memory?.appraisal?.relevance??null,
      appraisalGoalCongruence:memory?.appraisal?.goalCongruence??null,
      appraisalAgencyKind:memory?.appraisal?.agency?.kind??null,
      appraisalAgencyAgentId:memory?.appraisal?.agency?.agentId??null,
      memoryVisible:!!memorySection?.getClientRects().length,
      appraisalVisible:!!appraisalSection?.getClientRects().length,
      inspectorPresent:!!document.getElementById('inspector'),
      inspectorText:document.getElementById('inspector')?.innerText??'',
      width:innerWidth,
      docWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false
    };
  });
}

function assertScenarioState(s,label){
  assert.ok(s.eventId,`${label}: missing canonical event id`);
  assert.equal(s.memoryAction,'petCat',`${label}: memory must preserve stable action id`);
  assert.equal(s.memoryActorId,'zhou',`${label}: actor id mismatch`);
  assert.equal(s.memoryTargetId,'orange',`${label}: target id mismatch`);
  assert.equal(s.appraisalRuleId,'petCat-v1',`${label}: appraisal rule mismatch`);
  assert.ok(Number.isFinite(s.appraisalRelevance),`${label}: missing appraisal relevance`);
  assert.ok(Number.isFinite(s.appraisalGoalCongruence),`${label}: missing appraisal goal congruence`);
  assert.equal(s.appraisalAgencyKind,'other',`${label}: agency kind mismatch`);
  assert.equal(s.appraisalAgencyAgentId,'zhou',`${label}: agency agent mismatch`);
  assert.equal(s.inspectorPresent,true,`${label}: Inspector missing`);
  assert.equal(s.memoryVisible,true,`${label}: memory section not visible`);
  assert.equal(s.appraisalVisible,true,`${label}: appraisal section not visible`);
  assert.ok(!s.inspectorText.includes('browser-hidden'),`${label}: private raw event data leaked into Inspector`);
}

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.APPRAISAL_SCHEMA_VERSION==='11.13.1-event-appraisal');
assert.ok((await page.title()).includes('v11.13.1'));
await seedPetScenario();
const desktopState=await stableState();
assertScenarioState(desktopState,'desktop');
assert.ok(desktopState.docWidth<=desktopState.width+1,`desktop document overflow: ${desktopState.docWidth}>${desktopState.width}`);
assert.ok(desktopState.bodyWidth<=desktopState.width+1,`desktop body overflow: ${desktopState.bodyWidth}>${desktopState.width}`);
await page.screenshot({path:`${outDir}/desktop.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.APPRAISAL_SCHEMA_VERSION==='11.13.1-event-appraisal');
await seedPetScenario();
const mobileState=await stableState();
assertScenarioState(mobileState,'mobile');
assert.equal(mobileState.inspectorActive,true,'mobile Agent selection should open Inspector');
assert.equal(mobileState.navActive,true,'mobile Inspector nav should be active');
assert.ok(mobileState.docWidth<=mobileState.width+1,`mobile document overflow: ${mobileState.docWidth}>${mobileState.width}`);
assert.ok(mobileState.bodyWidth<=mobileState.width+1,`mobile body overflow: ${mobileState.bodyWidth}>${mobileState.width}`);
await page.screenshot({path:`${outDir}/mobile.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktopState:{...desktopState,inspectorText:undefined},mobileState:{...mobileState,inspectorText:undefined},pageErrors,consoleErrors},null,2));
console.log('v11.13.1 browser appraisal QA: 2/2 pass');
await browser.close();
