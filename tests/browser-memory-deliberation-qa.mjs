import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-memory-deliberation-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function setupStory(){
  await page.evaluate(()=>{
    const E=window.SimEngine,st=E.reset(11340),a=st.agents.zhen,zhou=st.agents.zhou;
    const mei=structuredClone(zhou);mei.id='mei';mei.name='小梅';mei.position={x:7,y:5};mei.action=null;mei.activeIntent=null;mei.episodicMemories=[];mei.observedSocialBids=[];mei.pendingInteraction=null;mei.offMap=false;mei.affect={valence:0,activation:0,frustration:0,lastUpdatedTick:st.tick,lastDecayTick:st.tick,source:null};st.agents.mei=mei;
    a.position={x:2,y:5};zhou.position={x:4,y:5};st.agents.orange.offMap=true;
    Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social:98});a.action=null;a.activeIntent=null;
    const make=(id,tick)=>({
      id:`memory:zhen:${id}`,kind:'episodic',sourceEventId:id,observedTick:tick,lastObservedTick:tick,
      observed:{action:'briefTalkReply',actorId:'zhou',targetId:'zhen',positionRef:'room1|floor|4,5'},
      appraisal:{appraisedTick:tick,ruleId:'browser-v1134',relevance:1,goalCongruence:-1,agency:{kind:'other',agentId:'zhou'},factors:[{kind:'fixture',relevanceDelta:1,congruenceDelta:-1}]}
    });
    a.episodicMemories=[make('browser-neg-1',0),make('browser-neg-2',0),make('browser-neg-3',0)];
  });
  await page.click('#step');
  await page.evaluate(()=>document.querySelector('[data-entity="agent:zhen"]')?.click());
  await page.waitForSelector('[data-v1134-memory-deliberation]');
}

async function snapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),a=st.agents.zhen;
    const evals=E.currentSocialTargetEvaluations(st,a).filter(x=>x.intentKind==='socialize');
    const zhou=evals.find(x=>x.targetAgent==='zhou'),mei=evals.find(x=>x.targetAgent==='mei');
    const section=document.querySelector('[data-v1134-memory-deliberation]');
    const forbidden=['memoryPreference','socialMemoryBias','targetAssociation','memoryUtilityDelta','targetPreference','memoryInfluenceScore'];
    return {
      version:st.version,memoryDeliberationVersion:E.MEMORY_DELIBERATION_SCHEMA_VERSION,
      actionKind:E.actionKind(a.action),actionTarget:a.action?.targetAgent??null,thoughtTarget:st.thoughts?.zhen?.pick?.targetAgent??null,
      zhou,mei,validator:window.SimValidator.validateState(st),sectionVisible:!!section?.getClientRects().length,
      inspectorText:document.getElementById('inspector')?.innerText??'',
      persistedInfluence:forbidden.some(k=>Object.prototype.hasOwnProperty.call(a,k)||(a.episodicMemories||[]).some(m=>Object.prototype.hasOwnProperty.call(m,k))),
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false
    };
  });
}

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.MEMORY_DELIBERATION_SCHEMA_VERSION==='11.13.4-memory-deliberation-influence');
assert.ok((await page.title()).includes('v11.13.4'));
await setupStory();
const desktop=await snapshot();
assert.equal(desktop.version,'11.13.4-memory-deliberation-influence');
assert.equal(desktop.actionKind,'talk');
assert.equal(desktop.actionTarget,'mei','memory-selected target must survive into actual Action');
assert.equal(desktop.thoughtTarget,'mei','Recent Decision target must match Action target');
assert.ok(desktop.zhou.memoryUtilityDelta<0,'negative zhou history should lower zhou utility');
assert.equal(desktop.mei.memoryUtilityDelta,0,'unrelated mei should stay neutral');
assert.ok(desktop.zhou.targetPreference<desktop.mei.targetPreference,'farther neutral target should outrank closer negative-history target');
assert.equal(desktop.persistedInfluence,false,'memory influence fields must stay derived');
assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);
assert.equal(desktop.sectionVisible,true,'Memory → Deliberation Inspector section missing');
assert.ok(desktop.inspectorText.includes('Memory → Deliberation'));
assert.ok(desktop.inspectorText.includes('memory delta'));
assert.ok(desktop.docWidth<=desktop.width+1,`desktop overflow: ${desktop.docWidth}>${desktop.width}`);
assert.ok(desktop.bodyWidth<=desktop.width+1,`desktop body overflow: ${desktop.bodyWidth}>${desktop.width}`);
await page.screenshot({path:`${outDir}/desktop.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.MEMORY_DELIBERATION_SCHEMA_VERSION==='11.13.4-memory-deliberation-influence');
await setupStory();
const mobile=await snapshot();
assert.equal(mobile.actionTarget,'mei');
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.equal(mobile.sectionVisible,true);
assert.equal(mobile.inspectorActive,true,'mobile agent selection should open Inspector');
assert.equal(mobile.navActive,true,'mobile Inspector nav should be active');
assert.ok(mobile.docWidth<=mobile.width+1,`mobile overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,inspectorText:undefined},mobile:{...mobile,inspectorText:undefined},pageErrors,consoleErrors},null,2));
console.log('v11.13.4 browser memory deliberation QA: 2/2 pass');
await browser.close();
