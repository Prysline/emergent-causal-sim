import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js','action-schema-v1120.js','engine.js','engine-spatial-v1114.js','action-runtime-v1120.js','state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.12.0-action-terminology');
assert.equal(E.VERSION,'11.12.0-action-terminology');
assert.equal(E.ACTION_SCHEMA_VERSION,'11.12.0-action-terminology');
noIssues('reset');

// Engine-created actions persist canonical kind, while legacy intent survives only as a non-enumerable compatibility alias.
for(let i=0;i<20&&!Object.values(st.agents).some(a=>a.action);i++)E.tick();
const active=Object.values(st.agents).find(a=>a.action);
assert.ok(active?.action,'simulation should create an action');
assert.ok(active.action.kind,'action must persist canonical kind');
assert.equal(active.action.intent,active.action.kind,'legacy reads should resolve through compatibility alias');
assert.ok(!Object.keys(active.action).includes('intent'),'legacy intent alias must not be enumerable/persistent');
assert.ok(Object.keys(active.action).includes('kind'),'kind must be part of persistent action state');
assert.ok(!JSON.stringify(active.action).includes('"intent"'),'serialized action must not store duplicate intent truth');
noIssues('engine-created action');

// Legacy injected action is migrated at the runtime boundary before the base engine executes it.
E.reset(20260911);
st=E.getState();
const legacy=st.agents.orange;
legacy.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:{x:3,y:6}};
E.tick();
if(legacy.action){
  assert.equal(legacy.action.kind,'wander');
  assert.equal(legacy.action.intent,'wander');
  assert.ok(!Object.keys(legacy.action).includes('intent'));
}
noIssues('legacy compatibility migration');

// Canonical kind works with exported helpers that still call the old core internals underneath.
E.reset(20260911);
st=E.getState();
const sleeper=st.agents.zhen;
sleeper.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:3};
E.normalizeStateActions(st);
assert.equal(E.isSleeping(sleeper),true,'canonical kind should drive sleep helper through the compatibility bridge');
assert.ok(E.actionLabel(sleeper).startsWith('睡眠'),'actionLabel should read canonical kind');
assert.ok(!Object.keys(sleeper.action).includes('intent'));
noIssues('canonical helper compatibility');

// Event metadata also stops persisting the overloaded intent key.
E.reset(20260911);
st=E.getState();
const actor=st.agents.zhen;
actor.action={intent:'talk',phase:'move',started:st.tick,wait:0,targetAgent:'missing-agent'};
E.tick();
const abort=st.events.find(e=>e.data?.action==='abort');
assert.ok(abort,'invalid target should produce an abort event');
assert.equal(abort.data.actionKind,'talk');
assert.equal(Object.prototype.hasOwnProperty.call(abort.data,'intent'),false,'abort event should use actionKind rather than overloaded intent');
noIssues('event terminology');

// Long-run state remains valid and every live action stays canonicalized.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();
  for(const a of Object.values(E.getState().agents))if(a.action){
    assert.ok(a.action.kind,`${a.name} live action missing kind at tick ${E.getState().tick}`);
    assert.ok(!Object.keys(a.action).includes('intent'),`${a.name} persisted legacy intent at tick ${E.getState().tick}`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.12.0 action terminology regression: ok');
