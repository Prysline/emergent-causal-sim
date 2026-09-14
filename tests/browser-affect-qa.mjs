import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-affect-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[];const pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function seedScenario(){
  await page.evaluate(()=>{
    const E=window.SimEngine;E.reset(1312);const st=E.getState();
    st.agents.zhou.position={x:5,y:5};
    st.agents.orange.position={x:5,y:6};
    st.agents.zhen.position={x:7,y:5};
    st.agents.orange.needs.social=90;
    const eventId=E.addEvent('老周摸了橘子。','normal',[],{actor:'zhou',target:'orange',action:'petCat',position:'5,6',debugSecret:'browser-affect-hidden'});
    window.__affectQaEventId=eventId;
    document.querySelector('[data-entity="agent:orange"]')?.click();
  });
  await page.waitForSelector('[data-v1130-memory]');
  await page.waitForSelector('[data-v1131-appraisal]');
  await page.waitForSelector('[data-v1132-affect]');
}

async function stableState(){
  return page.evaluate(()=>{
    const st=window.SimEngine.getState(),eventId=window.__affectQaEventId,a=st.agents.orange;
    const memory=a.episodicMemories.find(m=>m.sourceEventId===eventId),affect=a.affect;
    const affectSection=document.querySelector('[data-v1132-affect]');
    return {
      eventId,
      version:st.version,
      affectSchema:window.SimEngine.AFFECT_SCHEMA_VERSION,
      memoryAction:memory?.observed?.action??null,
      appraisalRuleId:memory?.appraisal?.ruleId??null,
      affectValence:affect?.valence??null,
      affectActivation:affect?.activation??null,
      affectFrustration:affect?.frustration??null,
      affectSourceMemoryId:affect?.source?.memoryId??null,
      affectSourceEventId:affect?.source?.sourceEventId??null,
      affectVisible:!!affectSection?.getClientRects().length,
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

function assertScenario(s,label){
  assert.equal(s.version,'11.13.2-short-lived-affect',`${label}: state version mismatch`);
  assert.equal(s.affectSchema,'11.13.2-short-lived-affect',`${label}: affect schema mismatch`);
  assert.ok(s.eventId,`${label}: missing canonical event id`);
  assert.equal(s.memoryAction,'petCat',`${label}: memory action mismatch`);
  assert.equal(s.appraisalRuleId,'petCat-v1',`${label}: appraisal rule mismatch`);
  assert.ok(s.affectValence>0,`${label}: positive valence missing`);
  assert.ok(s.affectActivation>0,`${label}: activation missing`);
  assert.equal(s.affectFrustration,0,`${label}: positive petting should not create frustration`);
  assert.ok(s.affectSourceMemoryId?.startsWith('memory:orange:'),`${label}: affect source memory missing`);
  assert.equal(s.affectSourceEventId,s.eventId,`${label}: affect source event mismatch`);
  assert.equal(s.inspectorPresent,true,`${label}: Inspector missing`);
  assert.equal(s.affectVisible,true,`${label}: affect section not visible`);
  assert.ok(s.inspectorText.includes('Current Affect'),`${label}: affect heading missing`);
  assert.ok(!s.inspectorText.includes('browser-affect-hidden'),`${label}: private raw event data leaked into Inspector`);
}

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.AFFECT_SCHEMA_VERSION==='11.13.2-short-lived-affect');
assert.ok((await page.title()).includes('v11.13.2'));
await seedScenario();
const desktop=await stableState();assertScenario(desktop,'desktop');
assert.ok(desktop.docWidth<=desktop.width+1,`desktop document overflow: ${desktop.docWidth}>${desktop.width}`);
assert.ok(desktop.bodyWidth<=desktop.width+1,`desktop body overflow: ${desktop.bodyWidth}>${desktop.width}`);
await page.screenshot({path:`${outDir}/desktop.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.AFFECT_SCHEMA_VERSION==='11.13.2-short-lived-affect');
await seedScenario();
const mobile=await stableState();assertScenario(mobile,'mobile');
assert.equal(mobile.inspectorActive,true,'mobile Agent selection should open Inspector');
assert.equal(mobile.navActive,true,'mobile Inspector nav should be active');
assert.ok(mobile.docWidth<=mobile.width+1,`mobile document overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,inspectorText:undefined},mobile:{...mobile,inspectorText:undefined},pageErrors,consoleErrors},null,2));
console.log('v11.13.2 browser affect QA: 2/2 pass');
await browser.close();
