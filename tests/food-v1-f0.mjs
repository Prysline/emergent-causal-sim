import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,F=globalThis.SimFood,A=globalThis.SimWorldAuthoring;
const SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-8,msg+' expected '+b+', got '+a);
const noIssues=label=>{const report=V.validateState(E.getState());assert.equal(report.issueCount,0,label+': '+report.issues.map(i=>i.code).join(', '));};
const mealEvents=st=>st.events.filter(e=>e.data?.action==='eat'&&e.data?.foodKind==='meal'&&e.data?.phase==='intake').reverse();

function setup({seed=261120,mass=300,hunger=80,withSecond=false}={}){
  E.reset(seed);
  const st=E.getState(),a=st.agents.zhen,meal=st.objects.readyMealF0;
  assert.ok(meal&&F.validMeal(meal),'first production Meal must be authored in canonical Object state');
  for(const agent of Object.values(st.agents)){
    if(agent.id!==a.id&&(!withSecond||agent.id!=='zhou'))agent.offMap=true;
    agent.action=null;agent.activeIntent=null;
  }
  meal.meal.edibleMassGrams=mass;
  const target={kind:'object',id:meal.id},approach=SP.bestInteractionPositionResult(st,a,target,'eatFrom');
  assert.ok(approach?.position&&Number.isFinite(approach.traversalCost),'ready Meal must have a legal reachable eatFrom interaction');
  a.position={...approach.position};
  a.needs.hunger=hunger;a.needs.thirst=5;a.needs.social=5;a.needs.sleepNeed=5;
  a.needs.fatigue=5;
  if(withSecond){
    const b=st.agents.zhou;b.position={...approach.position};
    b.needs.hunger=85;b.needs.thirst=5;b.needs.sleepNeed=5;b.needs.fatigue=5;
  }
  return {st,a,meal,approach};
}
function startMeal(a){
  const p=E.buildAction(a,{id:'eat'});
  assert.equal(p?.kind,'eat');
  assert.equal(p.phase,'prepare');
  a.action=p;E.ensureIntentForAction?.(E.getState(),a);
  E.tick();
  assert.equal(a.action,p,'prepare must keep one Action identity');
  assert.equal(p.phase,'toMeal','legal observed Meal must take the new Food consumer path');
  E.tick();assert.equal(p.phase,'eatingMeal');
  return p;
}

assert.equal(A.VERSION,'world-authoring-v23');
assert.equal(F.VERSION,'food-v1-f0');
assert.equal(F.INTAKE_GRAMS_PER_TICK,50);
assert.equal(F.HUNGER_RELIEF_PER_GRAM,.08);
{
  const doc=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING),meal=doc.entities.objects.readyMealF0;
  assert.equal(F.servingsFromMass(meal),1);
  for(const [mutate,code] of [
    [obj=>{obj.meal.edibleMassGrams=0;},'food_meal_invalid'],
    [obj=>{obj.meal.edibleMassGrams=.5;},'food_meal_invalid'],
    [obj=>{obj.meal.standardServingMassGrams=0;},'food_meal_invalid'],
    [obj=>{obj.resourceContainer=true;obj.contents={food:6};},'food_meal_invalid']
  ]){
    const invalid=A.cloneAuthoring(doc);mutate(invalid.entities.objects.readyMealF0);
    assert.ok(A.validateAuthoring(invalid).errors.some(e=>e.code===code),'invalid Meal authoring must fail closed');
  }
  const roundtrip=A.parseAuthoringJSON(A.serializeAuthoring(doc));
  assert.equal(roundtrip.entities.objects.readyMealF0.meal.edibleMassGrams,300);
  assert.equal(roundtrip.authoringSchema,A.VERSION);
}
{
  const {st,a,meal}=setup({seed:261121});
  const resourceStock=E.foodStock(),originalAction=startMeal(a);
  assert.equal(originalAction.targetMassGrams,300);
  const hungerBefore=a.needs.hunger;
  for(let i=0;i<6;i++){
    const before=F.remainingGrams(st.objects[meal.id]);
    E.tick();
    const actual=mealEvents(st).reduce((sum,e)=>sum+e.data.intakeGrams,0);
    assert.equal(actual,(i+1)*50,'one effective tick should debit exactly 50 g');
    assert.equal(before-((st.objects[meal.id]&&F.remainingGrams(st.objects[meal.id]))||0),50);
  }
  assert.equal(st.objects[meal.id],undefined,'zero-gram Meal retires canonical Object');
  assert.equal(a.action,null,'Action finishes without recreating a Food-specific Intent');
  assert.equal(E.foodStock(),resourceStock,'legacy Resource stock cannot absorb or mirror Meal grams');
  const events=mealEvents(st);
  assert.equal(events.length,6);
  assert.equal(events[0].data.firstIntake,true);
  assert.ok(events.slice(1).every(e=>e.data.firstIntake===false));
  near(events.reduce((sum,e)=>sum+e.data.hungerRelief,0),24,'300 g relief');
  assert.ok(a.needs.hunger<hungerBefore);
  for(const event of events){
    assert.ok(st.causes[event.id]===event,'each consumed tick is one canonical World Event');
    assert.ok(event.data.entities.includes('object:'+meal.id),'retired Object must remain a historical event reference');
    assert.equal(event.data.unit,'g');
  }
  assert.deepEqual(events.map(e=>e.data.intakeGrams),[50,50,50,50,50,50]);
  const habitCount=Object.values(a.learnedHabits||{}).filter(x=>x.activityKind==='eat').reduce((sum,x)=>sum+x.experienceCount,0);
  assert.equal(habitCount,1,'one continuous Meal Action must count as one learned eating episode');
  noIssues('six-tick meal');
}
{
  const {st,a,meal}=setup({seed:261122,mass:75});
  startMeal(a);E.tick();E.tick();
  assert.equal(st.objects[meal.id],undefined);
  assert.equal(a.action,null);
  assert.deepEqual(mealEvents(st).map(e=>e.data.intakeGrams),[50,25]);
  assert.equal(mealEvents(st)[0].data.retired,false);
  assert.equal(mealEvents(st)[1].data.retired,true);
  near(mealEvents(st).reduce((sum,e)=>sum+e.data.hungerRelief,0),6,'partial inventory intake only');
  noIssues('partial exhaustion');
}
{
  const {st,a,meal}=setup({seed:261127,hunger:10,mass:300});
  const p=startMeal(a);
  assert.equal(p.targetMassGrams,125,'initial Hunger must set one bounded Action-local intake target');
  E.tick();E.tick();E.tick();
  assert.equal(st.objects[meal.id].meal.edibleMassGrams,175,'reaching desired intake stops without retiring an unfinished Meal');
  assert.equal(a.action,null);
  assert.deepEqual(mealEvents(st).map(e=>e.data.intakeGrams),[50,50,25]);
  near(mealEvents(st).reduce((sum,e)=>sum+e.data.hungerRelief,0),10,'target-complete intake has segment-invariant relief');
  noIssues('Action target completion');
}
{
  const {st,meal}=setup({seed:261128});
  meal.contents={food:2};
  const violations=V.validateState(st).issues.map(issue=>issue.code);
  assert.ok(violations.includes('food_meal_double_inventory'),'live validator must reject a Meal + legacy stock shadow');
}
{
  const {st,a,meal}=setup({seed:261130,mass:300});
  const before=meal.meal.edibleMassGrams;
  const originalPosture=structuredClone(a.posture);
  for(const kind of ['prone','hovering',null]){
    a.posture=kind===null?{}:{kind,slotId:null,furnitureId:null};
    assert.doesNotThrow(()=>E.canSatisfyHunger(a),'unsupported canonical PoseEnvelope must not invent Meal visual knowledge');
    assert.equal(meal.meal.edibleMassGrams,before,'an observation query must not consume Food');
  }
  a.posture=originalPosture;
  assert.equal(st.objects[meal.id].meal.edibleMassGrams,300);
  noIssues('invalid pose query does not change persisted World');
}
{
  const {st,a,meal}=setup({seed:261123});
  const p=startMeal(a);
  const listening=E.scheduleTransientExecution(st,a,{kind:'socialListening',sourceId:'food-f0-listen',executionTick:st.tick+1});
  assert.equal(listening.scheduled,true);
  E.tick();assert.equal(st.objects[meal.id].meal.edibleMassGrams,250);
  assert.equal(a.action,p);
  const speaking=E.scheduleTransientExecution(st,a,{kind:'socialSpeaking',sourceId:'food-f0-speak',executionTick:st.tick+1});
  assert.equal(speaking.scheduled,true);
  E.tick();assert.equal(st.objects[meal.id].meal.edibleMassGrams,250,'speaking pauses intake without losing Action');
  assert.equal(a.action,p);
  E.tick();assert.equal(st.objects[meal.id].meal.edibleMassGrams,200,'intake resumes on subsequent tick');
  assert.equal(mealEvents(st).length,2,'paused tick must create no intake event');
  noIssues('social progress scales');
}
{
  const {st,a,meal}=setup({seed:261124,mass:65,withSecond:true}),b=st.agents.zhou;
  for(const agent of [a,b]){
    agent.action={kind:'eat',phase:'eatingMeal',foodSource:meal.id,targetMassGrams:300,consumedMassGrams:0,started:st.tick,wait:0};
    E.ensureIntentForAction?.(st,agent);
  }
  E.tick();
  assert.equal(st.objects[meal.id],undefined);
  assert.equal(mealEvents(st).reduce((sum,e)=>sum+e.data.intakeGrams,0),65,'two Agents must not overdraft shared Meal mass');
  assert.deepEqual(mealEvents(st).map(e=>e.data.intakeGrams).sort((x,y)=>x-y),[15,50]);
  assert.equal(mealEvents(st).filter(e=>e.data.retired).length,1,'retirement is unique');
  noIssues('multi-Agent contention');
}
{
  const {st,a,meal}=setup({seed:261131,mass:300,hunger:95});
  const p=startMeal(a);
  a.activeIntent=null; // Legacy/action-only fixtures must not self-preempt an already-running eat.
  a.needs.hunger=95;
  const priorTick=st.tick;
  E.tick();
  assert.equal(a.action,p,'Hunger emergency cannot interrupt and recreate the same eating Action');
  assert.equal(st.tick,priorTick+1);
  assert.equal(meal.meal.edibleMassGrams,250,'self-matching urgency must preserve realized eating progress');
  assert.equal(st.events.some(e=>e.data?.action==='intentPreempt'&&e.data?.priorActionKind==='eat'&&e.data?.nextActionKind==='eat'),false);
  E.ensureIntentForAction?.(st,a);
  noIssues('same-Action hunger urgency does not reset eating');
}
{
  const {st,a,meal}=setup({seed:261125,mass:300});
  startMeal(a);E.tick();
  const alreadyEaten=mealEvents(st)[0].data.intakeGrams;
  assert.equal(alreadyEaten,50);
  a.needs.thirst=99;
  E.tick();
  assert.equal(meal.meal.edibleMassGrams,250,'a later emergency must never roll back actual intake');
  assert.ok(st.events.some(e=>e.data?.action==='intentPreempt'&&e.data?.priorActionKind==='eat'),'interrupt through existing emergency preemption');
  assert.notEqual(a.action?.kind,'eat','Food must not automatically resume across Action interruption');
  noIssues('emergency after real intake');
}
{
  const {st,a}=setup({seed:261126});
  const plate=st.objects.plateA;
  plate.contents={food:6};delete plate.supportId;plate.position={...a.position};a.held=plate.id;
  a.action={kind:'eat',phase:'eatingPlate',container:plate.id,started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,a);
  const stockBefore=E.foodStock();
  E.tick();
  assert.equal(E.amountAt(plate.id,'food'),0,'legacy plate food remains Resource amount');
  assert.equal(E.foodStock(),stockBefore-6,'legacy Resource stock debits only its own units');
  assert.ok(st.events.some(e=>e.data?.action==='eat'&&e.data?.resource==='food'&&e.data?.amount===6));
  noIssues('legacy resource ingestion');
}
console.log('Food v1 Slice F0 production consumer regression: ok');
