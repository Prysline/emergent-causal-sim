import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const CURRENT_VERSION='11.29.1-slot-interaction-egress';
const outDir='artifacts/browser-resident-view-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function openStory(){
  await page.goto('http://127.0.0.1:4173/?scenario=talk-no-response',{waitUntil:'networkidle'});
  await page.waitForFunction(version=>window.SimEngine?.UI_RESIDENT_VIEW_VERSION===version&&window.SimEngine?.UI_ENTITY_READABLE_VERSION===version&&window.SimEngine?.UI_RELATIONSHIP_VERSION===version&&window.SimEngine?.UI_PHYSICAL_VERSION===version&&window.SimEngine?.UI_LOCOMOTION_VERSION===version,CURRENT_VERSION);
  for(let i=0;i<8;i++){
    const ready=await page.evaluate(()=>window.SimEngine.getState().agents.zhou.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome'));
    if(ready)break;
    await page.click('#step');
  }
  await page.evaluate(()=>document.querySelector('[data-entity="agent:zhou"]')?.click());
  await page.waitForSelector('[data-v1140-resident-root]');
  await page.waitForFunction(()=>document.querySelector('[data-v1150-relationship-readable]'));
  await page.waitForFunction(()=>document.querySelector('[data-v1160-physical-debug]'));
}
async function snapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),root=document.querySelector('[data-v1140-resident-root]'),resident=root?.querySelector('[data-v1140-resident-view]'),debug=root?.querySelector('[data-v1140-debug-view]');
    const activeMode=root?.querySelector('[data-v1140-mode].active')?.dataset.v1140Mode??null;
    const activeTab=root?.querySelector('[data-v1140-tab].active')?.dataset.v1140Tab??null;
    return {
      version:st.version,uiVersion:E.UI_RESIDENT_VIEW_VERSION,entityUiVersion:E.UI_ENTITY_READABLE_VERSION,relationshipUiVersion:E.UI_RELATIONSHIP_VERSION,physicalUiVersion:E.UI_PHYSICAL_VERSION,locomotionUiVersion:E.UI_LOCOMOTION_VERSION,
      activeMode,activeTab,
      residentVisible:!!resident&&!resident.hidden&&!!resident.getClientRects().length,
      debugVisible:!!debug&&!debug.hidden&&!!debug.getClientRects().length,
      residentText:resident?.innerText??'',debugText:debug?.innerText??'',spatialText:document.querySelector('.spatial-observability-section')?.innerText??'',
      recentRows:[...(resident?.querySelectorAll('.resident-life-event')||[])].map(row=>{const ref=row.dataset.entity||'',eventId=ref.startsWith('event:')?ref.slice(6):null,source=eventId?st.causes?.[eventId]:null;return {eventId,text:row.innerText,badges:[...row.querySelectorAll('.resident-private-badge')].map(b=>b.textContent?.trim()||''),visibility:source?.data?.visibility||'public',owner:source?.data?.owner||null};}),
      validator:window.SimValidator.validateState(st),
      affectLabels:{neutral:E.residentAffectLabel({valence:0,activation:0,frustration:0}),frustrated:E.residentAffectLabel({valence:-.1,activation:.2,frustration:.6})},
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false,
      inspectorDecorators:window.SimUI?.listInspectorDecorators?.()??[]
    };
  });
}
async function selectEntity(type,id){
  await page.evaluate(({type,id})=>{
    const selector=`[data-entity="${type}:${id}"]`;
    let node=document.querySelector(selector),temporary=false;
    if(!node){
      node=document.createElement('button');node.dataset.entity=`${type}:${id}`;node.hidden=true;document.body.appendChild(node);temporary=true;
    }
    node.click();
    if(temporary)node.remove();
  },{type,id});
  await page.waitForSelector('[data-v1141-entity-root]');
}
async function entitySnapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),root=document.querySelector('[data-v1141-entity-root]'),readable=root?.querySelector('[data-v1141-entity-readable]'),debug=root?.querySelector('[data-v1141-entity-debug]');
    return {
      version:st.version,uiVersion:E.UI_ENTITY_READABLE_VERSION,
      activeMode:root?.querySelector('[data-v1141-entity-mode].active')?.dataset.v1141EntityMode??null,
      readableVisible:!!readable&&!readable.hidden&&!!readable.getClientRects().length,
      debugVisible:!!debug&&!debug.hidden&&!!debug.getClientRects().length,
      readableText:readable?.innerText??'',debugText:debug?.innerText??'',
      validator:window.SimValidator.validateState(st),
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false
    };
  });
}

await openStory();
const postureProjection=await page.evaluate(()=>{
  const st=window.SimEngine.getState(),a=st.agents.zhou,original=structuredClone(a.posture);
  a.posture={kind:'prone',slotId:null,furnitureId:null};
  window.SimUI.setCurrentZ(window.SimUI.getCurrentZ());
  const actionLocation=document.querySelector('.action-card.agent-zhou .action-location')?.textContent||'';
  const debugText=document.querySelector('[data-v1140-debug-view]')?.textContent||'';
  a.posture=original;
  window.SimUI.setCurrentZ(window.SimUI.getCurrentZ());
  return {actionLocation,debugText};
});
assert.match(postureProjection.actionLocation,/俯臥/,'Action Card must render runtime prone posture instead of falling back to standing');
assert.match(postureProjection.debugText,/俯臥/,'Debug Inspector projection must use the same runtime posture label');
let desktop=await snapshot();
assert.equal(desktop.version,CURRENT_VERSION);
assert.equal(desktop.uiVersion,CURRENT_VERSION);
assert.equal(desktop.entityUiVersion,CURRENT_VERSION);
assert.equal(desktop.relationshipUiVersion,CURRENT_VERSION);
assert.equal(desktop.physicalUiVersion,CURRENT_VERSION);
assert.equal(desktop.locomotionUiVersion,CURRENT_VERSION);
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
  {id:'residentView.layer',order:1000},
  {id:'relationship.view',order:1025},
  {id:'physical.view',order:1026},
  {id:'locomotion.view',order:1027},
  {id:'entityReadable.layer',order:1050}
],'Inspector presentation ownership must be explicit and deterministically ordered');
assert.equal(desktop.activeMode,'resident','desktop: Agent should open readable Resident View by default');
assert.equal(desktop.residentVisible,true);
assert.equal(desktop.debugVisible,false);
assert.ok(desktop.residentText.includes('老周'));
assert.ok(desktop.residentText.includes('疲勞')&&desktop.residentText.includes('睡意'),'Resident View must keep fatigue and sleepNeed separate');
assert.ok(desktop.residentText.includes('心情'));
assert.ok(desktop.residentText.includes('關係')&&desktop.residentText.includes('阿真'),'Resident overview should expose the long-term Relationship projection');
assert.ok(desktop.residentText.includes('還不太熟'),'a single no-response episode must not overstate relationship certainty');
assert.ok(!desktop.residentText.includes('Affinity'),'player-readable Relationship must not expose raw numeric dimensions');
assert.ok(!desktop.residentText.includes('memoryUtilityDelta'));
assert.ok(!desktop.residentText.includes('goalCongruence'));
assert.ok(!desktop.residentText.includes('Agent・zhou'));
assert.equal(desktop.affectLabels.neutral,'平穩');
assert.equal(desktop.affectLabels.frustrated,'明顯煩躁');
assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);
assert.equal(await page.locator('[data-v1140-mode="resident"]').innerText(),'檢視','Agent readable toggle should use the generalized label');

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
    drinkWaterIntent:intent('drinkWater'),drinkAlcoholIntent:intent('drinkAlcohol'),restockIntent:intent('restockResource'),wanderIntent:intent('explore'),
    restockAction,wanderAction,
    eatExplanation:explain('eat','satisfyHunger'),drinkWaterExplanation:explain('drinkWater','drinkWater'),drinkAlcoholExplanation:explain('drinkAlcohol','drinkAlcohol'),
    restExplanation:explain('rest','recoverFatigue'),sleepExplanation:explain('sleep','sleep'),talkExplanation:explain('talk','socialize'),petAnimalExplanation:explain('petAnimal','interactWithAnimal'),
    seekHumanExplanation:explain('seekHuman','seekSocialContact',{agent:{kind:'cat'}}),groomExplanation:explain('groom','groom',{agent:{kind:'cat',contacts:{paws:{}}}}),
    externalSupplyExplanation:explain('externalSupply','replenishSupply',{action:{resource:'water'}}),
    wanderExplanation:E.residentActionExplanation(wanderState,wander),restockExplanation:E.residentActionExplanation(restockState,restock)
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
assert.equal(semanticLayers.petAnimalExplanation,'因為想找點陪伴，也對動物有親近感。');
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
assert.ok(debug.debugText.includes('Memory + Relationship → Social Target'),'Debug must retain advanced social target evidence');
assert.ok(debug.debugText.includes('Requester 社交結果記憶'),'Debug must retain requester outcome diagnostics');
assert.ok(debug.debugText.includes('Relationship')&&debug.debugText.includes('Familiarity')&&debug.debugText.includes('Affinity'),'Debug must expose exact directional relationship dimensions');
assert.ok(debug.debugText.includes('Physical Profile')&&debug.debugText.includes('MovementEnvelopes'),'Debug must expose authoritative Physical Profile and derived multi-mode MovementEnvelopes');
assert.ok(debug.debugText.includes('Locomotion Execution')&&debug.debugText.includes('Edge Move Ticks'),'Debug must expose current locomotion execution timing and posture state');
assert.ok(debug.spatialText.includes('Dynamic Congestion'),'Spatial Debug must expose Dynamic Congestion observability');
const debugOwnership=await page.evaluate(()=>({
  roots:document.querySelectorAll('[data-v1140-resident-root]').length,
  entityRoots:document.querySelectorAll('[data-v1141-entity-root]').length,
  intent:document.querySelectorAll('[data-v1121-intent]').length,
  memory:document.querySelectorAll('[data-v1130-memory]').length,
  appraisal:document.querySelectorAll('[data-v1131-appraisal]').length,
  affect:document.querySelectorAll('[data-v1132-affect]').length,
  retention:document.querySelectorAll('[data-v1133-retention]').length,
  deliberation:document.querySelectorAll('[data-v1134-memory-deliberation]').length,
  socialOutcome:document.querySelectorAll('[data-v1135-social-outcome-memory]').length,
  relationship:document.querySelectorAll('[data-v1150-relationship-debug]').length,
  physical:document.querySelectorAll('[data-v1160-physical-debug]').length,
  locomotion:document.querySelectorAll('[data-v1190-locomotion-debug]').length
}));
assert.deepEqual(debugOwnership,{roots:1,entityRoots:0,intent:1,memory:1,appraisal:1,affect:1,retention:1,deliberation:1,socialOutcome:1,relationship:1,physical:1,locomotion:1},'Agent selection must keep a single Resident shell and each Inspector layer exactly once');

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
const privateRecent=recent.recentRows.find(row=>row.text.includes('老周等了一會兒，沒有得到立即回應，便不再等了。'));
assert.ok(privateRecent,'requester-private wait end should be visible in the resident own recent view');
assert.deepEqual(privateRecent.badges,['私人'],'requester-private recent event should carry exactly one private badge');
assert.ok(!privateRecent.text.includes('自己的經驗・'),'private badge should replace the old inline prefix');
const publicRecent=recent.recentRows.find(row=>row.visibility!=='private');
assert.ok(publicRecent,'resident recent view fixture should include at least one public event');
assert.deepEqual(publicRecent.badges,[],'public recent events must not carry a private badge');
assert.ok(!recent.residentText.includes('故意忽略'),'private recent experience must not invent responder intent');
assert.ok(recent.docWidth<=recent.width+1,`desktop overflow: ${recent.docWidth}>${recent.width}`);

const entityFixtures=await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState();
  const container=Object.values(st.containers).find(c=>Object.values(c.contents||{}).some(v=>v>.05))||Object.values(st.containers)[0];
  const source=Object.values(st.sources)[0];
  const furniture=Object.values(st.furniture).find(f=>(f.slots||[]).length)||Object.values(st.furniture)[0];
  const tile=Object.values(st.map.tiles).find(t=>t.terrain==='floor'&&t.roomId)||Object.values(st.map.tiles)[0];
  const room=Object.values(st.map.rooms)[0];
  const actor=Object.values(st.agents)[0];
  const eventId=E.addEvent('老周查看了附近的環境。','normal',[],{entities:[`agent:${actor.id}`,`container:${container.id}`],actor:actor.id,action:'presentationEntityProbe'});
  return {
    container:{id:container.id,name:container.name,resource:Object.keys(container.contents||{}).find(r=>(container.contents[r]||0)>.05)||null},
    source:{id:source.id,name:source.name,resource:source.resource},furniture:{id:furniture.id,name:furniture.name},tile:{id:tile.id,terrain:tile.terrain},room:{id:room.id,name:room.name},event:{id:eventId,text:st.causes[eventId].text}
  };
});
await selectEntity('container',entityFixtures.container.id);
let entity=await entitySnapshot();
assert.equal(entity.version,CURRENT_VERSION);assert.equal(entity.uiVersion,CURRENT_VERSION);assert.equal(entity.activeMode,'readable');assert.equal(entity.readableVisible,true);assert.equal(entity.debugVisible,false);
assert.ok(entity.readableText.includes(entityFixtures.container.name));assert.ok(entity.readableText.includes('內容與容量'));
if(entityFixtures.container.resource)assert.ok(entity.readableText.includes(await page.evaluate(r=>window.SimWorld.RESOURCE_TYPES?.[r]?.name||window.SimEngine.resourceName?.(r)||r,entityFixtures.container.resource)));
assert.ok(!entity.readableText.includes(`Container・${entityFixtures.container.id}`));assert.ok(!entity.readableText.includes('空重'));
const containerState=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
await page.click('[data-v1141-entity-mode="debug"]');entity=await entitySnapshot();
assert.equal(entity.activeMode,'debug');assert.ok(entity.debugText.includes(`Container・${entityFixtures.container.id}`));assert.ok(entity.debugText.includes('空重'));
assert.equal(await page.evaluate(()=>JSON.stringify(window.SimEngine.getState())),containerState,'Container readable/debug switch must be state-inert');

await selectEntity('source',entityFixtures.source.id);entity=await entitySnapshot();
assert.equal(entity.activeMode,'readable');assert.ok(entity.readableText.includes(entityFixtures.source.name));assert.ok(entity.readableText.includes('提供的資源'));assert.ok(!entity.readableText.includes(`Resource Source・${entityFixtures.source.id}`));assert.ok(!entity.readableText.includes('操作 Port'));
await page.click('[data-v1141-entity-mode="debug"]');entity=await entitySnapshot();assert.ok(entity.debugText.includes(`Resource Source・${entityFixtures.source.id}`));assert.ok(entity.debugText.includes('操作 Port'));

await selectEntity('furniture',entityFixtures.furniture.id);entity=await entitySnapshot();
assert.equal(entity.activeMode,'readable');assert.ok(entity.readableText.includes(entityFixtures.furniture.name));assert.ok(entity.readableText.includes('用途'));assert.ok(entity.readableText.includes('正在使用'));assert.ok(!entity.readableText.includes('Footprint'));assert.ok(!entity.readableText.includes('預約：'));
const furnitureState=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
await page.click('[data-v1141-entity-mode="debug"]');entity=await entitySnapshot();assert.ok(entity.debugText.includes(`Furniture・${entityFixtures.furniture.id}`));assert.ok(entity.debugText.includes('Footprint'));assert.equal(await page.evaluate(()=>JSON.stringify(window.SimEngine.getState())),furnitureState,'Furniture readable/debug switch must be state-inert');

await selectEntity('tile',entityFixtures.tile.id);entity=await entitySnapshot();
assert.equal(entity.activeMode,'readable');assert.ok(entity.readableText.includes('目前狀況'));assert.ok(!entity.readableText.includes(`Tile ${entityFixtures.tile.id}`));assert.ok(!entity.readableText.includes('局部噪音'));assert.ok(!entity.readableText.includes('阻擋來源'));
await page.click('[data-v1141-entity-mode="debug"]');entity=await entitySnapshot();assert.ok(entity.debugText.includes(`Tile ${entityFixtures.tile.id}`));assert.ok(entity.debugText.includes('局部噪音'));

await selectEntity('room',entityFixtures.room.id);entity=await entitySnapshot();
assert.equal(entity.activeMode,'readable');assert.ok(entity.readableText.includes(entityFixtures.room.name));assert.ok(entity.readableText.includes('目前狀況'));assert.ok(!entity.readableText.includes(`Derived Room・${entityFixtures.room.id}`));assert.ok(!entity.readableText.includes('平均局部舒適'));
await page.click('[data-v1141-entity-mode="debug"]');entity=await entitySnapshot();assert.ok(entity.debugText.includes(`Derived Room・${entityFixtures.room.id}`));assert.ok(entity.debugText.includes('平均局部舒適'));

await selectEntity('event',entityFixtures.event.id);entity=await entitySnapshot();
assert.equal(entity.activeMode,'readable');assert.ok(entity.readableText.includes(entityFixtures.event.text));assert.ok(entity.readableText.includes('相關對象'));assert.ok(!entity.readableText.includes('詳細資料'));assert.ok(!entity.readableText.includes('因果鏈'));
await page.click('[data-v1141-entity-mode="debug"]');entity=await entitySnapshot();assert.ok(entity.debugText.includes(entityFixtures.event.text));assert.ok(entity.debugText.includes('詳細資料'));assert.ok(entity.debugText.includes('因果鏈'));

await page.evaluate(()=>document.querySelector('[data-entity="agent:zhou"]')?.click());await page.waitForSelector('[data-v1140-resident-root]');
await selectEntity('container',entityFixtures.container.id);entity=await entitySnapshot();assert.equal(entity.activeMode,'readable','returning to an entity after Agent view should default to readable');
await page.screenshot({path:`${outDir}/desktop-entity-readable-container.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await openStory();
let mobile=await snapshot();
assert.equal(mobile.activeMode,'resident');assert.equal(mobile.residentVisible,true);assert.equal(mobile.inspectorActive,true,'mobile Agent selection should open inspector view');assert.equal(mobile.navActive,true,'mobile inspector nav should be active');assert.ok(mobile.residentText.includes('疲勞')&&mobile.residentText.includes('睡意'));assert.ok(mobile.residentText.includes('關係'));
const mobileStateBefore=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
await page.click('[data-v1140-mode="debug"]');await page.waitForFunction(()=>document.querySelector('[data-v1140-debug-view]')?.hidden===false);
const mobileDebug=await snapshot();const mobileStateAfterDebug=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
assert.equal(mobileStateAfterDebug,mobileStateBefore,'mobile Resident → Debug must not mutate simulation state');assert.equal(mobileDebug.activeMode,'debug');assert.equal(mobileDebug.debugVisible,true);assert.ok(mobileDebug.debugText.includes('Agent・zhou'),'mobile Debug should retain original Inspector');assert.ok(mobileDebug.debugText.includes('Relationship'));assert.ok(mobileDebug.debugText.includes('Physical Profile')&&mobileDebug.debugText.includes('MovementEnvelopes'),'mobile Debug should retain multi-mode Physical Profile observability');
await page.click('[data-v1140-mode="resident"]');await page.click('[data-v1140-tab="memory"]');mobile=await snapshot();
const mobileStateAfterMemory=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
assert.equal(mobileStateAfterMemory,mobileStateBefore,'mobile Resident tab switch must not mutate simulation state');assert.ok(mobile.residentText.includes('當時沒有得到回應'));assert.ok(!mobile.residentText.includes('故意忽略'));assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);assert.ok(mobile.docWidth<=mobile.width+1,`mobile overflow: ${mobile.docWidth}>${mobile.width}`);assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile-resident-memory.png`,fullPage:true});

const mobileContainer=await page.evaluate(()=>{const c=Object.values(window.SimEngine.getState().containers)[0];return {id:c.id,name:c.name};});
await selectEntity('container',mobileContainer.id);let mobileEntity=await entitySnapshot();
assert.equal(mobileEntity.activeMode,'readable');assert.equal(mobileEntity.readableVisible,true);assert.equal(mobileEntity.inspectorActive,true);assert.equal(mobileEntity.navActive,true);assert.ok(mobileEntity.readableText.includes(mobileContainer.name));assert.ok(mobileEntity.docWidth<=mobileEntity.width+1,`mobile entity overflow: ${mobileEntity.docWidth}>${mobileEntity.width}`);assert.ok(mobileEntity.bodyWidth<=mobileEntity.width+1,`mobile entity body overflow: ${mobileEntity.bodyWidth}>${mobileEntity.width}`);
const mobileEntityState=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
await page.click('[data-v1141-entity-mode="debug"]');mobileEntity=await entitySnapshot();assert.equal(mobileEntity.activeMode,'debug');assert.equal(await page.evaluate(()=>JSON.stringify(window.SimEngine.getState())),mobileEntityState,'mobile Entity Readable → Debug must not mutate simulation state');
await page.click('[data-v1141-entity-mode="readable"]');await page.screenshot({path:`${outDir}/mobile-entity-readable-container.png`,fullPage:true});

await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState(),cat=st.agents.orange,human=st.agents.zhou;
  cat.offMap=false;cat.position={x:5,y:5};human.offMap=false;human.position={x:5,y:6};cat.episodicMemories=[];cat.relationships={};
  const bidId=E.addEvent('橘子主動靠近老周，想和他親近。','normal',[],{actor:cat.id,target:human.id,action:'seekHuman',socialBid:true,bidKind:'animalAffection',interactionKind:'socialAffection',expectsResponse:true,bidFrom:cat.id,bidTo:human.id,perceivedByTarget:true,position:E.positionRef?.(cat.position)||null});
  st.causes[bidId].data.bidId=bidId;
  const waitId=E.addEvent('橘子等了一會兒，沒有得到立即回應，便不再等了。','normal',[bidId],{actor:cat.id,action:'socialWaitEnded',bidId,bidKind:'animalAffection',interactionKind:'socialAffection',visibility:'private',owner:cat.id,responderContextObserved:true,observedResponderActionKind:null,observedResponderPosture:'standing'});
  E.rememberRequesterSocialOutcome(st,st.causes[waitId]);document.querySelector('[data-entity="agent:orange"]')?.click();
});
await page.waitForFunction(()=>document.querySelector('[data-v1140-resident-view]')?.innerText.includes('橘子'));
await page.click('[data-v1140-tab="recent"]');const catRecent=await snapshot();const catPrivateRecent=catRecent.recentRows.find(row=>row.text.includes('橘子等了一會兒，沒有得到立即回應，便不再等了。'));assert.ok(catPrivateRecent,'animal requester private wait end should appear in own recent view');assert.deepEqual(catPrivateRecent.badges,['私人'],'animal requester private recent event should carry the private badge');assert.ok(!catPrivateRecent.text.includes('自己的經驗・'),'animal private badge should replace the old inline prefix');
await page.click('[data-v1140-tab="memory"]');const catMemory=await snapshot();assert.ok(catMemory.residentText.includes('曾向老周發起親近互動，但當時沒有得到回應。'),`animal requester memory should use interaction semantics: ${catMemory.residentText}`);assert.ok(!catMemory.residentText.includes('故意忽略'),'animal memory must not invent intentional ignoring');assert.ok(!catMemory.residentText.includes('聊天邀請'),'animal memory must not be mislabeled as human chat');assert.equal(catMemory.validator.issueCount,0,`animal mobile validator: ${catMemory.validator.issues.map(x=>x.code).join(', ')}`);
await page.screenshot({path:`${outDir}/mobile-animal-private-memory.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,residentText:undefined,debugText:undefined},debug:{...debug,residentText:undefined,debugText:undefined},memoryView:{...memoryView,residentText:undefined,debugText:undefined},recent:{...recent,residentText:undefined,debugText:undefined},mobile:{...mobile,residentText:undefined,debugText:undefined},mobileDebug:{...mobileDebug,residentText:undefined,debugText:undefined},mobileEntity:{...mobileEntity,readableText:undefined,debugText:undefined},semanticLayers,entityFixtures,catRecent:{...catRecent,residentText:undefined,debugText:undefined},catMemory:{...catMemory,residentText:undefined,debugText:undefined},pageErrors,consoleErrors},null,2));
console.log('v11.17.0 browser readable entity QA: Passage Profile + multi-mode Physical Debug + Relationship + readable/debug state-inert pass');
await browser.close();
