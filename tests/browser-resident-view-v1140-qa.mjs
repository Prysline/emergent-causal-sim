import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const CURRENT_VERSION='11.14.3-natural-player-explanations';
const outDir='artifacts/browser-resident-view-v1140-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function openStory(){
  await page.goto('http://127.0.0.1:4173/?scenario=talk-no-response',{waitUntil:'networkidle'});
  await page.waitForFunction(version=>window.SimEngine?.UI_RESIDENT_VIEW_VERSION===version,CURRENT_VERSION);
  for(let i=0;i<8;i++){
    const ready=await page.evaluate(()=>window.SimEngine.getState().agents.zhou.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome'));
    if(ready)break;
    await page.click('#step');
  }
  await page.evaluate(()=>document.querySelector('[data-entity="agent:zhou"]')?.click());
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
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false,
      inspectorDecorators:window.SimUI?.listInspectorDecorators?.()??[]
    };
  });
}

await openStory();
let desktop=await snapshot();
assert.equal(desktop.version,CURRENT_VERSION);
assert.equal(desktop.uiVersion,CURRENT_VERSION);
assert.deepEqual(desktop.inspectorDecorators,[
  {id:'spatial.observability',order:100},
  {id:'spatial.environment',order:200},
  {id:'intent.active',order:300},
  {id:'memory.episodic',order:400},
  {id:'appraisal.historical',order:500},
  {id:'affect.current',order:600},
  {id:'memory.retention',order:700},
  {id:'memory.deliberation',order:800},
  {id:'socialOutcome.memory',order:900},
  {id:'residentView.layer',order:1000}
],'Inspector presentation ownership must be explicit and deterministically ordered');
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

const semanticLayers=await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState();
  const dest=Object.values(st.containers).find(c=>Object.prototype.hasOwnProperty.call(c.contents||{},'water'))||Object.values(st.containers)[0];
  const destId=dest.id,destName=dest.name;
  const intent=kind=>E.residentIntentLabel({activeIntent:{kind}});
  const explain=(kind,intentKind,{agent={},action={}}={})=>{
    const probe={id:`qa-${kind}`,kind:'human',activeIntent:{kind:intentKind},...agent,action:{kind,started:66,...action}};
    const probeState={...st,thoughts:{...st.thoughts,[probe.id]:{tick:66,pick:{id:kind}}}};
    return E.residentActionExplanation(probeState,probe);
  };
  const restockAction=E.residentActionText(st,{kind:'human',action:{kind:'restockContainer',phase:'toContainer',destinationId:destId,resource:'water'}});
  const wanderAction=E.residentActionText(st,{kind:'human',action:{kind:'wander',spatialGoal:{x:10,y:6}}});
  const wander={id:'qa-wander',kind:'human',activeIntent:{kind:'explore'},action:{kind:'wander',started:77,spatialGoal:{x:10,y:6}}};
  const wanderState={...st,thoughts:{...st.thoughts,[wander.id]:{tick:77,pick:{id:'wander'}}}};
  const restock={id:'qa-restock',kind:'human',activeIntent:{kind:'restockResource'},action:{kind:'restockContainer',phase:'toContainer',started:88,destinationId:destId,resource:'water'}};
  const restockState={...st,thoughts:{...st.thoughts,[restock.id]:{tick:88,pick:{id:'restockContainer'}}}};
  return {
    destName,
    drinkWaterIntent:intent('drinkWater'),
    drinkAlcoholIntent:intent('drinkAlcohol'),
    restockIntent:intent('restockResource'),
    wanderIntent:intent('explore'),
    restockAction,wanderAction,
    eatExplanation:explain('eat','satisfyHunger'),
    drinkWaterExplanation:explain('drinkWater','drinkWater'),
    drinkAlcoholExplanation:explain('drinkAlcohol','drinkAlcohol'),
    restExplanation:explain('rest','recoverFatigue'),
    sleepExplanation:explain('sleep','sleep'),
    talkExplanation:explain('talk','socialize'),
    petCatExplanation:explain('petCat','interactWithCat'),
    seekHumanExplanation:explain('seekHuman','seekSocialContact',{agent:{kind:'cat'}}),
    groomExplanation:explain('groom','groom',{agent:{kind:'cat',contacts:{paws:{}}}}),
    externalSupplyExplanation:explain('externalSupply','replenishSupply',{action:{resource:'water'}}),
    wanderExplanation:E.residentActionExplanation(wanderState,wander),
    restockExplanation:E.residentActionExplanation(restockState,restock)
  };
});
assert.equal(semanticLayers.drinkWaterIntent,'補充水分');
assert.equal(semanticLayers.drinkAlcoholIntent,'解渴／喝點酒');
assert.equal(semanticLayers.restockIntent,'補充室內資源');
assert.equal(semanticLayers.wanderIntent,'探索附近');
assert.ok(!semanticLayers.restockAction.includes('toContainer'),'Resident Action must not expose raw restock phase names');
assert.ok(semanticLayers.restockAction.includes(semanticLayers.destName)&&semanticLayers.restockAction.includes('水'),'Resident restock Action should describe the concrete player-readable task');
assert.equal(semanticLayers.wanderAction,'四處走走');
assert.ok(!semanticLayers.wanderAction.includes('(10,6)'),'Resident Action must not expose raw spatial coordinates');
assert.equal(semanticLayers.eatExplanation,'因為肚子餓了。');
assert.equal(semanticLayers.drinkWaterExplanation,'因為口渴。');
assert.equal(semanticLayers.drinkAlcoholExplanation,'因為口渴，而且現在想喝點酒。');
assert.equal(semanticLayers.restExplanation,'因為累了。');
assert.equal(semanticLayers.sleepExplanation,'因為想睡了。');
assert.equal(semanticLayers.talkExplanation,'因為想找人說說話。');
assert.equal(semanticLayers.petCatExplanation,'因為想找點陪伴，也對貓有親近感。');
assert.equal(semanticLayers.seekHumanExplanation,'因為想找點陪伴。');
assert.equal(semanticLayers.groomExplanation,'因為身上有點需要整理了。');
assert.equal(semanticLayers.externalSupplyExplanation,'因為家裡的水快不夠了。');
assert.equal(semanticLayers.wanderExplanation,'因為現在沒有更急著要做的事。','Explanation should use natural selection-pressure wording instead of engine terminology');
assert.equal(semanticLayers.restockExplanation,`因為${semanticLayers.destName}裡的水已經不多了。`,'Restock explanation should state the resource pressure rather than repeat the task');

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
const debugOwnership=await page.evaluate(()=>({
  roots:document.querySelectorAll('[data-v1140-resident-root]').length,
  intent:document.querySelectorAll('[data-v1121-intent]').length,
  memory:document.querySelectorAll('[data-v1130-memory]').length,
  appraisal:document.querySelectorAll('[data-v1131-appraisal]').length,
  affect:document.querySelectorAll('[data-v1132-affect]').length,
  retention:document.querySelectorAll('[data-v1133-retention]').length,
  deliberation:document.querySelectorAll('[data-v1134-memory-deliberation]').length,
  socialOutcome:document.querySelectorAll('[data-v1135-social-outcome-memory]').length
}));
assert.deepEqual(debugOwnership,{roots:1,intent:1,memory:1,appraisal:1,affect:1,retention:1,deliberation:1,socialOutcome:1},'each Inspector layer must render exactly once');

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
assert.ok(recent.residentText.includes('自己的經驗・老周等了一會兒，沒有得到立即回應，便不再等了。'),'requester-private wait end should be visible only as the resident own experience');
assert.ok(!recent.residentText.includes('故意忽略'),'private recent experience must not invent responder intent');
assert.ok(recent.docWidth<=recent.width+1,`desktop overflow: ${recent.docWidth}>${recent.width}`);

await page.setViewportSize({width:390,height:844});
await openStory();
let mobile=await snapshot();
assert.equal(mobile.activeMode,'resident');
assert.equal(mobile.residentVisible,true);
assert.equal(mobile.inspectorActive,true,'mobile Agent selection should open inspector view');
assert.equal(mobile.navActive,true,'mobile inspector nav should be active');
assert.ok(mobile.residentText.includes('疲勞')&&mobile.residentText.includes('睡意'));
const mobileStateBefore=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
await page.click('[data-v1140-mode="debug"]');
await page.waitForFunction(()=>document.querySelector('[data-v1140-debug-view]')?.hidden===false);
const mobileDebug=await snapshot();
const mobileStateAfterDebug=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
assert.equal(mobileStateAfterDebug,mobileStateBefore,'mobile Resident → Debug must not mutate simulation state');
assert.equal(mobileDebug.activeMode,'debug');
assert.equal(mobileDebug.debugVisible,true);
assert.ok(mobileDebug.debugText.includes('Agent・zhou'),'mobile Debug should retain original Inspector');
await page.click('[data-v1140-mode="resident"]');
await page.click('[data-v1140-tab="memory"]');
mobile=await snapshot();
const mobileStateAfterMemory=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
assert.equal(mobileStateAfterMemory,mobileStateBefore,'mobile Resident tab switch must not mutate simulation state');
assert.ok(mobile.residentText.includes('當時沒有得到回應'));
assert.ok(!mobile.residentText.includes('故意忽略'));
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.ok(mobile.docWidth<=mobile.width+1,`mobile overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile-resident-memory.png`,fullPage:true});

await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState(),cat=st.agents.orange,human=st.agents.zhou;
  cat.offMap=false;cat.position={x:5,y:5};human.offMap=false;human.position={x:5,y:6};cat.episodicMemories=[];
  const bidId=E.addEvent('橘子主動靠近老周，想和他親近。','normal',[],{
    actor:cat.id,target:human.id,action:'seekHuman',socialBid:true,bidKind:'catAffection',interactionKind:'socialAffection',expectsResponse:true,
    bidFrom:cat.id,bidTo:human.id,perceivedByTarget:true,position:E.positionRef?.(cat.position)||null
  });
  st.causes[bidId].data.bidId=bidId;
  const waitId=E.addEvent('橘子等了一會兒，沒有得到立即回應，便不再等了。','normal',[bidId],{
    actor:cat.id,action:'socialWaitEnded',bidId,bidKind:'catAffection',interactionKind:'socialAffection',visibility:'private',owner:cat.id,
    responderContextObserved:true,observedResponderActionKind:null,observedResponderPosture:'standing'
  });
  E.rememberRequesterSocialOutcome(st,st.causes[waitId]);
  document.querySelector('[data-entity="agent:orange"]')?.click();
});
await page.waitForFunction(()=>document.querySelector('[data-v1140-resident-view]')?.innerText.includes('橘子'));
await page.click('[data-v1140-tab="recent"]');
const catRecent=await snapshot();
assert.ok(catRecent.residentText.includes('自己的經驗・橘子等了一會兒，沒有得到立即回應，便不再等了。'),'animal requester private wait end should appear in own recent view');
await page.click('[data-v1140-tab="memory"]');
const catMemory=await snapshot();
assert.ok(catMemory.residentText.includes('曾向老周發起親近互動，但當時沒有得到回應。'),`animal requester memory should use interaction semantics: ${catMemory.residentText}`);
assert.ok(!catMemory.residentText.includes('故意忽略'),'animal memory must not invent intentional ignoring');
assert.ok(!catMemory.residentText.includes('聊天邀請'),'animal memory must not be mislabeled as human chat');
assert.equal(catMemory.validator.issueCount,0,`animal mobile validator: ${catMemory.validator.issues.map(x=>x.code).join(', ')}`);
await page.screenshot({path:`${outDir}/mobile-animal-private-memory.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({
  ok:true,
  desktop:{...desktop,residentText:undefined,debugText:undefined},
  debug:{...debug,residentText:undefined,debugText:undefined},
  memoryView:{...memoryView,residentText:undefined,debugText:undefined},
  recent:{...recent,residentText:undefined,debugText:undefined},
  mobile:{...mobile,residentText:undefined,debugText:undefined},
  mobileDebug:{...mobileDebug,residentText:undefined,debugText:undefined},
  semanticLayers,
  catRecent:{...catRecent,residentText:undefined,debugText:undefined},
  catMemory:{...catMemory,residentText:undefined,debugText:undefined},
  pageErrors,consoleErrors
},null,2));
console.log('v11.14.3 browser resident view QA: natural explanations + action/intent semantics + desktop/mobile state-inert pass');
await browser.close();
