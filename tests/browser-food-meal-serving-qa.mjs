import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-food-meal-serving-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimUI?.isStarted?.()&&window.SimRelease?.VERSION&&window.SimEngine?.UI_ENTITY_READABLE_VERSION===window.SimRelease.VERSION);

const initial=await page.evaluate(()=>{
  const E=window.SimEngine,F=window.SimFood,st=E.getState();
  const source=st.objects.readyMealF0;
  if(!source)throw new Error('Browser baseline must include the existing Meal');
  // Keep this explicit QA plate as the single selectable serving plate.
  delete st.objects.plateA;delete st.objects.plateB;
  st.objects.servingQaPlate={
    id:'servingQaPlate',name:'驗證餐盤',icon:'🍽️',portable:true,canEatFrom:true,
    objectContainment:true,objectStorage:{capacityCubicMeters:.00012},
    handling:{carryGeometry:{width:.3,height:.05,length:.3},handsRequired:1,massKg:.3},
    position:{x:11,y:5,z:0},supportId:'diningTable',
    interactions:{eatFrom:{mode:'supportReach'},pickup:{mode:'supportReach'}}
  };
  const served=F.serveMeal(st,source.id,'servingQaPlate',120,'servingQaPortion');
  return {served,remaining:F.remainingGrams(source),plate:st.objects.servingQaPlate.id,portion:st.objects.servingQaPortion?.containedBy};
});
assert.equal(initial.served.served,true);
assert.equal(initial.served.actualGrams,120);
assert.equal(initial.remaining,180);
assert.equal(initial.portion,initial.plate);

async function select(id){
  await page.evaluate(id=>{
    const node=document.createElement('button');
    node.dataset.entity='object:'+id;node.hidden=true;document.body.appendChild(node);
    node.click();node.remove();
  },id);
  await page.waitForFunction(id=>window.SimUI.getInspectorSelection()?.id===id,id);
  await page.waitForSelector('[data-v1141-entity-readable]');
}
await select('servingQaPortion');
const initialProjection=await page.evaluate(()=>{
  const SP=window.SimSpatial,st=window.SimEngine.getState();
  return {
    text:document.querySelector('[data-v1141-entity-readable]')?.innerText||'',
    portionMarkers:[...document.querySelectorAll('[data-entity="object:servingQaPortion"]')].filter(el=>el.closest('#map')).length,
    plateMarkers:[...document.querySelectorAll('[data-entity="object:servingQaPlate"]')].filter(el=>el.closest('#map')).length,
    location:SP.objectLocationState(st,'servingQaPortion'),
    sourceMass:window.SimFood.remainingGrams(st.objects.readyMealF0)
  };
});
assert.match(initialProjection.text,/剩餘可食重量/,'Inspector must project Food grams instead of Resource contents');
assert.match(initialProjection.text,/120 g/);
assert.match(initialProjection.text,/驗證餐盤/);
assert.equal(initialProjection.portionMarkers,0,'contained Meal must not get an independent map marker');
assert.equal(initialProjection.plateMarkers,1,'real physical plate must stay mapped');
assert.equal(initialProjection.location,'contained');
assert.equal(initialProjection.sourceMass,180);
await page.screenshot({path:outDir+'/meal-serving-inspector.png',fullPage:true});

await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState();
  window.SimFood.consumeMeal(st,'servingQaPortion',50);
});
await select('servingQaPlate');
await select('servingQaPortion');
const updated=await page.evaluate(()=>({
  text:document.querySelector('[data-v1141-entity-readable]')?.innerText||'',
  mass:window.SimFood.remainingGrams(window.SimEngine.getState().objects.servingQaPortion),
  load:window.SimObjectHandling.objectStorageStatus(window.SimEngine.getState(),'servingQaPlate').massKg,
  issues:window.SimValidator.validateState(window.SimEngine.getState()).issues.map(x=>x.code)
}));
assert.match(updated.text,/70 g/,'Inspector must reread the current canonical grams after intake');
assert.equal(updated.mass,70);
assert.ok(Math.abs(updated.load-.07)<1e-9);
assert.deepEqual(updated.issues,[]);
await select('servingQaPlate');
const capacityText=await page.evaluate(()=>document.querySelector('[data-v1141-entity-readable]')?.innerText||'');
assert.match(capacityText,/收納容量/,'Inspector must project canonical physical storage volume');
assert.match(capacityText,/0.12 L/,'Inspector must show derived plate capacity without a second inventory');

// Browser-executed production Engine tick path (not a mocked helper or UI projection).
const execution=await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial,F=window.SimFood,V=window.SimValidator;
  E.reset(20261126);
  const st=E.getState(),actor=st.agents.zhen,source=st.objects.readyMealF0;
  // Keep this explicit QA plate as the single selectable serving plate.
  delete st.objects.plateA;delete st.objects.plateB;
  st.objects.servingQaPlate={
    id:'servingQaPlate',name:'驗證餐盤',icon:'🍽️',portable:true,canEatFrom:true,
    objectContainment:true,objectStorage:{capacityCubicMeters:.00012},
    handling:{carryGeometry:{width:.3,height:.05,length:.3},handsRequired:1,massKg:.3},
    position:{x:11,y:5,z:0},supportId:'diningTable',
    interactions:{eatFrom:{mode:'supportReach'},pickup:{mode:'supportReach'}}
  };
  for(const a of Object.values(st.agents))if(a.id!==actor.id)a.offMap=true;
  Object.assign(actor.needs,{hunger:80,thirst:0,fatigue:0,sleepNeed:0,social:0});
  actor.action=null;actor.activeIntent=null;
  actor.position={...SP.bestInteractionPositionResult(st,actor,{kind:'object',id:source.id},'eatFrom').position};
  const plate=st.objects.servingQaPlate,P=window.SimPerception;
  const facings=['north','northEast','east','southEast','south','southWest','west','northWest'];
  const plateObserved=facings.some(face=>{
    actor.facing=face;
    return P.classifyObjectPointVisualAvailability(st,actor,plate).visualAvailable===true
      || SP.isAtInteraction(st,actor,{kind:'object',id:plate.id},'pickup');
  });
  if(!plateObserved)return {failure:'no current visual/contact evidence for serving plate'};
  const action=E.buildAction(actor,{id:'eat'});
  if(!action)return {failure:'eat action unavailable'};
  actor.action=action;E.ensureIntentForAction?.(st,actor);
  const phases=[];
  for(let i=0;i<130;i++){
    E.tick();
    phases.push(actor.action?.phase||'done');
    if(!actor.action)break;
  }
  const serve=st.events.find(e=>e.data?.foodKind==='meal'&&e.data?.phase==='serveMeal');
  const takes=st.events.filter(e=>e.data?.foodKind==='meal'&&e.data?.phase==='intake');
  return {
    serving:serve?.data||null,phases:[...new Set(phases)],sumIntake:takes.reduce((sum,e)=>sum+e.data.intakeGrams,0),
    remaining:F.remainingGrams(st.objects.readyMealF0),held:actor.held,
    plateLocation:SP.objectLocationState(st,'servingQaPlate'),
    action:actor.action?.phase||null,validator:V.validateState(st).issues.map(x=>x.code),
    reasons:st.events.filter(e=>e.data?.action==='abort').slice(0,3).map(e=>e.data.reason)
  };
});
assert.equal(execution.serving?.servedGrams,120,JSON.stringify(execution));
assert.equal(execution.sumIntake,120,JSON.stringify(execution));
assert.equal(execution.remaining,180,JSON.stringify(execution));
assert.equal(execution.held,null,JSON.stringify(execution));
assert.equal(execution.action,null,JSON.stringify(execution));
assert.ok(execution.phases.includes('toMealDining')&&execution.phases.includes('eatingMeal'),JSON.stringify(execution));
assert.deepEqual(execution.validator,[]);
const seated=await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial;
  E.reset(20261125);
  const st=E.getState(),a=st.agents.zhen,meal=st.objects.readyMealF0;
  delete st.objects.plateA;delete st.objects.plateB;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  Object.assign(a.needs,{hunger:80,thirst:0,fatigue:0,sleepNeed:0,social:0});
  a.action=null;a.activeIntent=null;
  const target={kind:'object',id:meal.id},approach=SP.bestInteractionPositionResult(st,a,target,'eatFrom');
  if(!approach?.position)return {failure:'no direct Meal contact'};
  a.position={...approach.position};
  a.action=E.buildAction(a,{id:'eat'});E.ensureIntentForAction?.(st,a);
  if(!a.action)return {failure:'no eat Action'};
  let atIntake=null;
  for(let i=0;i<110;i++){
    E.tick();
    const intake=st.events.find(e=>e.data?.phase==='intake'&&e.data?.foodKind==='meal'&&e.data.actor===a.id);
    if(intake){
      atIntake={kind:a.posture?.kind,slotId:a.posture?.slotId,contact:SP.isAtInteraction(st,a,target,'eatFrom')};
      break;
    }
  }
  const sit=st.events.find(e=>e.data?.action==='sitForMeal'&&e.data?.foodKind==='meal');
  return {atIntake,sitSlot:sit?.data?.slot||null,issues:window.SimValidator.validateState(st).issues.map(x=>x.code)};
});
assert.equal(seated.atIntake?.kind,'sitting',JSON.stringify(seated));
assert.equal(seated.atIntake?.slotId,seated.sitSlot,JSON.stringify(seated));
assert.equal(seated.atIntake?.contact,true,JSON.stringify(seated));
assert.deepEqual(seated.issues,[]);
assert.deepEqual(pageErrors,[],'Browser must not report uncaught errors');
await browser.close();
console.log('Browser Food Meal Serving v1 canonical Inspector and map projection QA: ok');
