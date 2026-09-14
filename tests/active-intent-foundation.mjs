import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js','action-schema-v1120.js','intent-schema-v1121.js','engine.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.12.1-active-intent-foundation');
assert.equal(E.VERSION,'11.12.1-active-intent-foundation');
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
E.normalizeStateActions(st);
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
E.normalizeStateActions(st);
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
E.normalizeStateActions(st);
E.tick();
if(walker.action){
  assert.equal(walker.action.kind,'wander','v11.12.1 must not introduce emergency preemption yet');
  assert.equal(walker.activeIntent?.kind,'explore');
}
noIssues('no policy change');

// Long-run integration: every live Action has exactly one linked Active Intent and no stale Intent survives an idle state.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();
  st=E.getState();
  for(const a of Object.values(st.agents)){
    if(a.action){
      assert.ok(a.activeIntent,`${a.name} missing Active Intent at tick ${st.tick}`);
      assert.equal(a.action.intentId,a.activeIntent.id,`${a.name} Action→Intent link mismatch at tick ${st.tick}`);
      assert.equal(a.activeIntent.kind,E.intentKindForAction(a.action.kind));
    }else assert.equal(a.activeIntent,null,`${a.name} stale Active Intent at tick ${st.tick}`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.12.1 Active Intent foundation regression: ok');
