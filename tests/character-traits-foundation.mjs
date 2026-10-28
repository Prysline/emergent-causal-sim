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
console.log('character traits foundation: ok');
