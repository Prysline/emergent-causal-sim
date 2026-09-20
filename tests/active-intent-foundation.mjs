import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','action-schema-v1120.js','intent-schema-v1121.js','engine.js','runtime-hook-pipeline.js','engine-spatial-surface-environment.js','action-runtime-v1120.js','intent-runtime-v1121.js','state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.22.0-spatial-z-identity');
assert.equal(E.VERSION,'11.22.0-spatial-z-identity');
assert.equal(E.INTENT_SCHEMA_VERSION,'11.12.1-active-intent-foundation');
for(const a of Object.values(st.agents))assert.equal(a.activeIntent,null,'reset should start without an Active Intent');
noIssues('reset');

// A normal deliberation creates a private Active Intent linked to the concrete Action.
E.tick();
st=E.getState();
for(const a of Object.values(st.agents)){
  if(!a.action)continue;
  assert.ok(a.activeIntent,`${a.name} live action should have Active Intent`);
  assert.equal(a.action.intentId,a.activeIntent.id,`${a.name} action should link to its Active Intent`);
  assert.equal(a.activeIntent.kind,E.intentKindForAction(a.action.kind));
  assert.equal(a.activeIntent.source.type,'deliberation');
  assert.ok(Number.isInteger(a.activeIntent.source.tick));
  assert.ok(st.thoughts[a.id],`${a.name} Recent Decision snapshot should remain separate from Active Intent`);
  assert.ok(!Object.keys(a.action).includes('intent'),'legacy action.intent must remain non-persistent');
}
noIssues('normal deliberation');

// The Intent kind is purpose-oriented rather than simply duplicating Action.kind.
E.reset(20260911);
st=E.getState();
const eater=st.agents.zhen;
eater.action={kind:'eat',phase:'prepare',started:st.tick,wait:0};

E.reconcileIntents(st);
assert.equal(eater.activeIntent.kind,'satisfyHunger');
assert.equal(eater.action.kind,'eat');
assert.notEqual(eater.activeIntent.kind,eater.action.kind,'Intent purpose and Action type should be semantically distinct where appropriate');
assert.equal(eater.action.intentId,eater.activeIntent.id);
noIssues('purpose-oriented intent');

// A one-tick action can create and finish its Intent without leaving stale private state behind.
E.reset(20260911);
st=E.getState();
const cat=st.agents.orange;
cat.action={kind:'groom',phase:'groom',started:st.tick,wait:0};

E.tick();
assert.equal(cat.action,null,'groom should finish');
assert.equal(cat.activeIntent,null,'finished action must not leave stale Active Intent in the 1:1 foundation');
noIssues('finished action cleanup');

// Existing policy remains in charge: Active Intent mirrors the selected plan but does not trigger reconsideration or preemption.
E.reset(20260911);
st=E.getState();
const walker=st.agents.orange;
walker.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{x:9,y:6}};
walker.needs.thirst=99;

E.tick();
if(walker.action){
  assert.equal(walker.action.kind,'wander','v11.12.1 must not introduce emergency preemption yet');
  assert.equal(walker.activeIntent?.kind,'explore');
}
noIssues('no policy change');

// If another actor ends an Action during the core loop and this actor starts a new Action later in the same tick,
// the new Action must not inherit the previous action-bound Intent merely because that Intent object still exists.
E.reset(20260911);
st=E.getState();
const rebound=st.agents.zhen;
rebound.action={kind:'sleep',phase:'sleeping',started:st.tick,intentId:'intent:zhen:0:sleep'};
rebound.activeIntent={id:'intent:zhen:0:sleep',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'deliberation',tick:st.tick}};
rebound.action=null;
rebound.action=E.buildAction(rebound,{id:'drinkAlcohol'});
assert.ok(rebound.action,'replacement Action fixture should be constructible');
assert.equal(rebound.action.intentId,undefined,'core replacement Action starts unbound');
E.reconcileIntents(st);
assert.equal(rebound.activeIntent.kind,'drinkAlcohol','replacement Action should receive a fresh matching Active Intent');
assert.equal(rebound.action.intentId,rebound.activeIntent.id,'replacement Action should bind to the fresh Active Intent');
assert.notEqual(rebound.activeIntent.id,'intent:zhen:0:sleep','stale sleep Intent identity must not survive replacement');
noIssues('replacement action rebind');

// Long-run integration: every live Action has exactly one linked Active Intent and no stale Intent survives an idle state.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();
  st=E.getState();
  for(const a of Object.values(st.agents)){
    if(a.action){
      assert.ok(a.activeIntent,`${a.name} missing Active Intent at tick ${st.tick}`);
      assert.equal(a.action.intentId,a.activeIntent.id,`${a.name} Action→Intent link mismatch at tick ${st.tick}`);
      assert.equal(a.activeIntent.kind,E.intentKindForAction(a.action.kind),`${a.name} Action ${a.action.kind} mismatched Active Intent ${a.activeIntent.kind} at tick ${st.tick}`);
    }else assert.equal(a.activeIntent,null,`${a.name} stale Active Intent at tick ${st.tick}`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.12.1 Active Intent foundation regression: ok');