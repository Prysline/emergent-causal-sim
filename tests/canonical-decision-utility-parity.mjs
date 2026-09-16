import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of [
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'engine.js','runtime-hook-pipeline.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js'
]){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine;
assert.equal(typeof E.baseUtilityForAction,'function','core must own canonical deterministic decision baseline');

E.reset(11240);
const st=E.getState(),cat=st.agents.orange;
st.tick=2;
cat.needs.hunger=0;
cat.needs.thirst=36;
cat.needs.fatigue=0;
cat.needs.sleepNeed=0;
cat.needs.social=0;
cat.needs.groomingNeed=0;

// Guarantee an immediately reachable water container without introducing a second policy path.
const waterCup=Object.values(st.containers).find(c=>c.canDrinkFrom);
assert.ok(waterCup,'focused setup requires one drinkable container');
for(const a of Object.values(st.agents))if(a.held===waterCup.id)a.held=null;
delete waterCup.supportId;
waterCup.position={...cat.position};
waterCup.contents={water:10};

const exploreBase=E.baseUtilityForAction(cat,'wander');
const drinkBase=E.baseUtilityForAction(cat,'drinkWater');
assert.equal(exploreBase,20+(cat.traits.curious||0)*25);
assert.equal(drinkBase,36*1.05+8,'Cat canonical drink baseline must retain the species-specific chooser formula');
assert.equal(E.utilityForIntent(st,cat,'explore'),exploreBase,'soft reconsideration must use the same Cat explore baseline as initial deliberation');
assert.equal(E.utilityForIntent(st,cat,'drinkWater'),drinkBase,'soft reconsideration must use the same Cat drink baseline as initial deliberation');

cat.needs.fatigue=50;
assert.equal(
  E.utilityForIntent(st,cat,'recoverFatigue'),
  E.baseUtilityForAction(cat,'rest'),
  'soft reconsideration must use the same Cat rest baseline as initial deliberation'
);
cat.needs.fatigue=0;

// Reproduce the audit counterexample without chooser noise: the same state must not
// become a strong switch only because soft reconsideration changes the scoring ruler.
cat.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{...cat.position},oneShot:true};
cat.activeIntent={id:'intent:orange:0:explore:parity',kind:'explore',createdTick:0,lifecycle:'actionBound',source:{type:'test',tick:0}};
cat.action.intentId=cat.activeIntent.id;
const rngBefore=st.rngState;
const snap=E.reconsiderationSnapshot(st,cat);
assert.equal(st.rngState,rngBefore,'deterministic reconsideration must not consume initial chooser RNG');
assert.equal(snap.ok,true);
assert.equal(snap.currentUtility,exploreBase);
assert.equal(snap.commitmentCost,0);
assert.equal(snap.bestChallenger?.intentKind,'drinkWater');
assert.equal(snap.bestChallenger?.utility,drinkBase);
assert.equal(snap.switchThreshold,exploreBase+E.SOFT_SWITCH_MARGIN);
assert.ok(drinkBase<=snap.switchThreshold,'unchanged Cat thirst should remain below hysteresis once the scoring ruler is shared');
assert.equal(E.applySoftReconsideration(st,cat),false,'same-state baseline parity must not create a false soft switch');
assert.equal(cat.activeIntent.kind,'explore');

// Keep the ownership boundary explicit: soft runtime may gate candidate availability,
// but it must not carry a duplicate Cat need formula of its own.
const softSource=fs.readFileSync(new URL('../src/intent-runtime-v1124.js',import.meta.url),'utf8');
assert.ok(softSource.includes("canonicalBaseUtility(a,'drinkWater')"));
assert.ok(softSource.includes("canonicalBaseUtility(a,'rest')"));
assert.ok(!softSource.includes("n.thirst*1.18+10"),'soft runtime must not retain the old shared Human/Cat drink formula');
assert.ok(!softSource.includes("Math.min(n.fatigue||0,68)"),'soft runtime must not retain the old shared Human/Cat rest formula');

console.log('Canonical initial/soft decision utility parity regression: ok');
