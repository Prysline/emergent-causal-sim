import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js',
  'spatial.js','spatial-traversal.js','engine.js'
]);

const E=globalThis.SimEngine;
const SP=globalThis.SimSpatial;
const originalSleepTargets=SP.sleepTargets;

function isolate(st,id='zhen'){
  for(const agent of Object.values(st.agents))agent.offMap=agent.id!==id;
  return st.agents[id];
}

function legacySleepUtility(st,a){
  const p=E.sleepProfile(a);
  const bias=E.circadianSleepBias(a);
  const propensity=E.sleepPropensity(a);
  if(!originalSleepTargets(st,a).length||a.needs.sleepNeed<p.minimumSleepNeed||propensity<p.sleepOpportunityThreshold)return 0;
  return 42+a.needs.sleepNeed*.55+Math.max(-8,bias*.55)+Math.max(0,a.needs.fatigue-65)*.15;
}

function withSleepTargetCounter(fn){
  let calls=0;
  SP.sleepTargets=function(...args){calls++;return originalSleepTargets.apply(this,args);};
  try{return {value:fn(),calls};}
  finally{SP.sleepTargets=originalSleepTargets;}
}

function minPropensityMinute(a){
  let best={minute:0,value:Infinity};
  for(let minute=0;minute<1440;minute++){
    const value=E.sleepPropensity(a,minute);
    if(value<best.value)best={minute,value};
  }
  return best;
}

function maxPropensityMinute(a){
  let best={minute:0,value:-Infinity};
  for(let minute=0;minute<1440;minute++){
    const value=E.sleepPropensity(a,minute);
    if(value>best.value)best={minute,value};
  }
  return best;
}

// Low sleepNeed must return the same result as the legacy ordering without
// constructing any expensive sleep target query.
E.reset(20260911);
{
  const st=E.getState(),a=isolate(st),p=E.sleepProfile(a);
  st.minute=23*60;
  a.needs.sleepNeed=Math.max(0,p.minimumSleepNeed-1);
  a.needs.fatigue=95;
  const expected=legacySleepUtility(st,a);
  const rngBefore=st.rngState;
  const measured=withSleepTargetCounter(()=>E.baseUtilityForAction(a,'sleep'));
  assert.equal(expected,0,'legacy ordering must reject sub-minimum sleepNeed');
  assert.equal(measured.value,expected,'eligibility reorder must preserve low-sleepNeed utility');
  assert.equal(measured.calls,0,'sub-minimum sleepNeed must short-circuit before SP.sleepTargets');
  assert.equal(st.rngState,rngBefore,'sleep eligibility short-circuit must not consume RNG');
}

// Even at the minimum sleepNeed, a circadian/propensity rejection must also
// short-circuit before the target search.
E.reset(20260911);
{
  const st=E.getState(),a=isolate(st),p=E.sleepProfile(a);
  a.needs.sleepNeed=p.minimumSleepNeed;
  a.needs.fatigue=0;
  const worst=minPropensityMinute(a);
  st.minute=worst.minute;
  assert.ok(E.sleepPropensity(a)<p.sleepOpportunityThreshold,'focused fixture must be below sleep opportunity threshold');
  const expected=legacySleepUtility(st,a);
  const rngBefore=st.rngState;
  const measured=withSleepTargetCounter(()=>E.baseUtilityForAction(a,'sleep'));
  assert.equal(expected,0,'legacy ordering must reject low sleep propensity');
  assert.equal(measured.value,expected,'eligibility reorder must preserve low-propensity utility');
  assert.equal(measured.calls,0,'low sleep propensity must short-circuit before SP.sleepTargets');
  assert.equal(st.rngState,rngBefore,'propensity short-circuit must not consume RNG');
}

// A genuinely eligible sleeper must still execute the target query exactly
// once and preserve the previous deterministic sleep score.
E.reset(20260911);
{
  const st=E.getState(),a=isolate(st),p=E.sleepProfile(a);
  a.needs.sleepNeed=Math.max(90,p.minimumSleepNeed+20);
  a.needs.fatigue=90;
  const best=maxPropensityMinute(a);
  st.minute=best.minute;
  assert.ok(E.sleepPropensity(a)>=p.sleepOpportunityThreshold,'focused fixture must satisfy sleep opportunity threshold');
  const expected=legacySleepUtility(st,a);
  assert.ok(expected>0,'focused fixture requires a reachable sleep target and positive sleep utility');
  const rngBefore=st.rngState;
  const measured=withSleepTargetCounter(()=>E.baseUtilityForAction(a,'sleep'));
  assert.equal(measured.value,expected,'eligible sleep utility must remain identical to legacy ordering');
  assert.equal(measured.calls,1,'eligible sleep must still evaluate SP.sleepTargets exactly once');
  assert.equal(st.rngState,rngBefore,'eligible sleep target evaluation must remain RNG-neutral');
}

console.log('Sleep eligibility-before-query regression: ok');
