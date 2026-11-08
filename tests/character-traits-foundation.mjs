import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const A=globalThis.SimWorldAuthoring,T=globalThis.SimCharacterTraits,I=globalThis.SimWorldInitializer,E=globalThis.SimEngine,V=globalThis.SimValidator;
const clone=x=>JSON.parse(JSON.stringify(x));
assert.equal(T.VERSION,'character-traits-v1');
assert.equal(A.VERSION,'world-authoring-v19');
assert.equal(A.CHARACTER_TRAITS_VERSION,T.VERSION);
assert.equal(A.validateAuthoring(A.DEFAULT_WORLD_AUTHORING).ok,true);
const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING),original=clone(authored.residents.zhen.traits);
const compiled=I.createInitialState(authored,{seed:42,version:'test'});
assert.deepEqual(compiled.agents.zhen.traits,original);
assert.notEqual(compiled.agents.zhen.traits,authored.residents.zhen.traits);
compiled.agents.zhen.traits.social=0;
assert.deepEqual(authored.residents.zhen.traits,original);
assert.deepEqual(A.parseAuthoringJSON(A.serializeAuthoring(authored)).residents.zhen.traits,original);
const sparse=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
delete sparse.residents.zhen.traits.careful;
assert.equal(A.validateAuthoring(sparse).ok,true);
assert.equal(T.value({traits:sparse.residents.zhen.traits},'careful'),.55);
assert.equal(Object.hasOwn(A.parseAuthoringJSON(A.serializeAuthoring(sparse)).residents.zhen.traits,'careful'),false);
assert.equal(Object.hasOwn(I.createInitialState(sparse,{version:'test'}).agents.zhen.traits,'careful'),false);
for(const [key,value] of [['unknownTrait',.4],['social',1.2],['careful',NaN],['exertionSensitivity',-1],['circadianPattern','unknown'],['sleepRecoveryRate',Infinity]]){
  const candidate=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);candidate.residents.zhen.traits[key]=value;
  const report=A.validateAuthoring(candidate);
  assert.equal(report.ok,false,key+' must fail');
  assert.ok(report.errors.some(issue=>issue.path==='residents.zhen.traits.'+key));
  assert.throws(()=>I.createInitialState(candidate,{version:'test'}),/residents.zhen.traits/);
}
for(const invalid of [null,[],42,'bad']){
  const candidate=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);candidate.residents.zhen.traits=invalid;
  assert.equal(A.validateAuthoring(candidate).ok,false);
}
assert.equal(T.validateTraits({sleepRecoveryRate:0,circadianPhaseOffsetMinutes:-180}).ok,true);
const st=E.reset(4242),agent=st.agents.zhen,before=E.baseUtilityForAction(agent,'talk');
delete agent.traits.careful;
assert.equal(E.routePreferenceForAction(st,agent).contributors[0].value,.55);
assert.equal(E.routePreferenceForAction(st,agent).weights.contentsRiskWeight,4.4);
assert.equal(E.baseUtilityForAction(agent,'talk'),before);
agent.traits.careful=0;
assert.equal(E.routePreferenceForAction(st,agent).contributors[0].value,0);
agent.traits.sleepRecoveryRate=0;
assert.equal(E.sleepProfile(agent).sleepRecoveryRate,0);
agent.traits.careful=2;
assert.ok(V.validateState(st).issues.some(issue=>issue.code==='character_trait_value_invalid'&&issue.agentId===agent.id));
assert.throws(()=>T.value(agent,'careful'),/Unit trait/);

const sameNeed=E.reset(6601),human=sameNeed.agents.zhen,animal=sameNeed.agents.orange;
human.needs.social=50;animal.needs.social=50;
human.traits.social=0;animal.traits.social=0;
const talkAtZero=E.baseUtilityForAction(human,'talk'),seekAtZero=E.baseUtilityForAction(animal,'seekHuman');
assert.equal(E.talkBaseEngagementScore(human),.35);
assert.equal(E.petBaseResponseScore(animal),.36);
human.traits.social=1;animal.traits.social=1;
assert.equal(E.baseUtilityForAction(human,'talk'),talkAtZero,'social Trait must not directly add active talk utility');
assert.equal(E.baseUtilityForAction(animal,'seekHuman'),seekAtZero,'social Trait must not directly add active seekHuman utility');
assert.equal(E.talkBaseEngagementScore(human),.65,'Human response retains independent bounded Trait disposition');
assert.equal(E.petBaseResponseScore(animal),.64,'Animal response retains independent bounded Trait disposition');
for(const [actor,kind] of [[human,'talk'],[animal,'seekHuman']]){
  assert.equal(E.decisionContributorsForAction(actor,kind).some(c=>c.kind==='trait'&&c.key==='social'),false,'upstream social Trait must not be counted again as direct active-action evidence');
}
delete human.traits.social;delete animal.traits.social;
assert.equal(T.value(human,'social'),0);
assert.equal(E.talkBaseEngagementScore(human),.35,'Human sparse social default must be canonical zero');
assert.equal(E.petBaseResponseScore(animal),.36,'Animal sparse social default must be canonical zero');
human.traits.social=Infinity;animal.traits.social=1.1;
assert.throws(()=>E.talkBaseEngagementScore(human),/Trait value/,'Human response must reject invalid present social Trait');
assert.throws(()=>E.petBaseResponseScore(animal),/Unit trait/,'Animal response must reject out-of-range social Trait');

function socialDriftAt(social,{seed=6602,sleeping=false}={}){
  const world=E.reset(seed),a=world.agents.zhen;
  for(const resident of Object.values(world.agents)){resident.offMap=true;resident.action=null;resident.activeIntent=null;}
  a.needs.social=30;a.traits.social=social;
  if(sleeping)a.action={kind:'sleep',phase:'sleeping',started:world.tick,sleepTicks:1};
  const rngBefore=world.rngState;
  E.tick();
  return {gain:a.needs.social-30,rngBefore,rngAfter:world.rngState};
}
for(const sleeping of [false,true]){
  const low=socialDriftAt(0,{sleeping}),high=socialDriftAt(1,{sleeping});
  assert.ok(low.gain>0&&high.gain>low.gain,'higher social Trait must increase Social Need formation');
  assert.ok(Math.abs(high.gain/low.gain-1.25/.75)<1e-9,'Need gain must use bounded .75–1.25 trait multiplier');
  assert.equal(low.rngBefore,high.rngBefore,'seed baseline must match');
  assert.equal(low.rngAfter,high.rngAfter,'Trait multiplier must not change RNG draw count');
}
console.log('character traits foundation + social B1 integration: ok');
